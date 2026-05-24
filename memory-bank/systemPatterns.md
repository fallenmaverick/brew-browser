# System Patterns

Cross-cutting patterns. Both Backend Architect and Frontend Developer write here when a pattern is reused across multiple commands/components.

---

## Backend (Rust) — Wave 2

### 1. Tauri command shape

Every command is `async`, returns `Result<T, BrewError>`, and takes shared state via `tauri::State<'_, AppState>`. Argument names are camelCase from the JS side (Tauri converts), Rust uses snake_case parameters per default serde. Example skeleton:

```rust
#[tauri::command]
pub async fn brew_xxx(
    name: String,
    kind: PackageKind,
    state: State<'_, AppState>,
) -> Result<Xxx, BrewError> {
    let path = state.require_brew_path().await?;
    // ... shell out, parse, return DTO
}
```

`lib.rs` registers all 20 commands in a single `tauri::generate_handler![...]` block.

### 2. Streaming via `tauri::ipc::Channel<T>`

Long-running write commands (install, uninstall, upgrade, update, bundle dump, bundle install) take a `Channel<BrewStreamEvent>` argument and emit the full lifecycle: `Started` → `Stdout`/`Stderr` → `Exit` (or `Canceled` / `Error`). The single canonical implementation lives in `brew::exec::run_brew_streaming` so every streaming command is one call with a few-line wrapper.

Key choice: **Channel<T>, never `app.emit`**. Per-invocation, type-safe, auto-cleaned-up when JS drops the channel. No global event-name collisions.

### 3. Two-pump line reader

`run_brew_streaming` spawns two `tokio::spawn` tasks (one each for stdout/stderr `BufReader::lines()`) plus a `tokio::select!` on `child.wait()` vs. a cancel oneshot. After exit, `tokio::join!` drains both pumps before emitting `Exit`. Lines longer than 4 KB are truncated with `…[truncated]` to keep IPC sensible if brew dumps a huge blob.

### 4. Mutex serialization for writes

`AppState.brew_write_lock: Arc<Mutex<()>>` is held for the duration of every state-mutating brew invocation. Reads (`brew_list`, `brew_info`, `brew_outdated`, `brew_search`, `brewfile_check`) bypass it. Acquired in the command wrapper with `.lock_owned().await` so the guard lives for the streaming child's lifetime.

`AppState.invalidate_caches()` is called on every successful write to drop `installed_cache`, so the next `brew_list` re-shells.

### 5. Job cancellation

`AppState.jobs: Arc<Mutex<HashMap<Uuid, JobHandle>>>` tracks in-flight streaming children. `JobHandle.cancel_tx: Option<oneshot::Sender<()>>` is `.take()`-d on first cancel so subsequent calls are no-ops. The streaming task's `tokio::select!` observes the receiver and calls `child.start_kill()` (SIGTERM → wait 5s → tokio's fallback). On cancel-path exit the channel emits `Canceled { job_id }` and the command returns `Err(BrewError::Canceled)`.

### 6. Typed error model — single `BrewError` enum

`BrewError` is `#[serde(tag = "code", rename_all = "snake_case")]` so the frontend can `switch (err.code)` over a closed union. `From` impls cover `std::io::Error`, `serde_json::Error`, and `reqwest::Error` so command bodies stay `?`-friendly. Only `Serialize` is derived — not `Deserialize` — because errors are backend → frontend only.

### 7. `--json=v2` everywhere available

`brew::parse` defines `#[derive(Deserialize)]` mirrors of `brew info --json=v2` and `brew outdated --json=v2` outputs. `RawFormula::to_package()` / `RawCask::to_package()` convert raw rows into our `Package` DTO. JSON-parse failures map to `BrewError::JsonParse { command, message, raw_excerpt }` with the first 2 KB of the offending blob.

For commands without `--json=v2` (`brew search`), we parse plain stdout (`parse_search_stdout` skips `==>` headers and whitespace-splits tokens).

### 8. HTTP for trending — `reqwest` with rustls

`trending::client::fetch` uses a fresh `reqwest::Client` per call with `rustls-tls`, a 10s timeout, gzip, and a stable `User-Agent`. The `trending::cache` module holds a per-window `TrendingCache` (1h TTL); fetch flow: fresh-cache-hit → fetch → on-success store + return → on-failure return stale cache if any, else propagate the error.

### 9. Input validation at the IPC boundary

`commands::info::validate_package_name` rejects names that start with `-`, are empty, exceed 200 chars, or contain anything outside `[A-Za-z0-9._+/-@]`. `commands::search::validate_search_query` rejects leading-dash queries similarly. The IPC boundary is the security boundary — the frontend cannot construct argv.

### 10. Module layout

```
src-tauri/src/
├── lib.rs              # Builder + invoke_handler only
├── main.rs             # calls brew_browser_lib::run()
├── error.rs            # BrewError + From impls + truncate helpers
├── state.rs            # AppState, JobHandle, initialize()
├── types.rs            # all wire DTOs (#[serde(rename_all="camelCase")])
├── brew/
│   ├── mod.rs
│   ├── exec.rs         # run_brew_capture, run_brew_streaming
│   ├── parse.rs        # raw JSON shapes + → DTO conversions
│   └── paths.rs        # resolve_brew_path
├── commands/
│   ├── mod.rs
│   ├── env.rs          # brew_doctor
│   ├── list.rs         # brew_list, brew_outdated
│   ├── info.rs         # brew_info + validate_package_name
│   ├── search.rs       # brew_search, brew_search_desc
│   ├── actions.rs      # brew_install, brew_uninstall, brew_upgrade, brew_update, cancel_job
│   ├── brewfile.rs     # all 8 brewfile_* commands + Brewfile-text parser
│   └── trending.rs     # trending_fetch, trending_clear_cache
└── trending/
    ├── mod.rs
    ├── client.rs       # reqwest fetch + analytics JSON parse
    └── cache.rs        # TrendingCache + TTL
```

### 11. Bounded stderr ring for streaming exits (PASS-2)

`run_brew_streaming` accumulates the most recent ~4 KB of stderr lines into a `StderrRing` (`Arc<Mutex<...>>`-shared with the stderr pump task). On non-zero exit, the ring's `snapshot()` becomes the `BrewExitNonZero.stderr_excerpt` so the error carries context even for callers that don't subscribe to the `Channel`. The ring drops oldest lines when full, walks to a UTF-8 char boundary when truncating an oversize single line, and is bounded — chatty commands can't OOM the process. Reusable for any future streaming-command failure-context pattern.

### 12. Native-asset extraction with sips + disk cache (Phase 7)

`cask_icon` extracts a cask's `.app` bundle icon, converts it to 64×64 PNG with macOS-native `sips`, caches it to `<state.cache_dir>/icons/<token>.png`, and returns it to the frontend as a complete `data:image/png;base64,…` URL — no Tauri asset protocol, no extra IPC roundtrip per `<img>` paint.

Three layers, each independently bypassable:

1. **Disk cache (hot path).** Stat the cache file; if mtime is within `ICON_CACHE_TTL` (7 days), `tokio::fs::read` + base64-encode + return. No `defaults`/`sips` exec.
2. **`brew info --json=v2 --cask <token>`** to discover the `.app` filename from `artifacts[].app[]`. Tolerates both string-form (`["Firefox.app"]`) and object-form (`[{ "target": "Visual Studio Code.app" }]`). Resolves the filename against `/Applications/<Name>.app` then `~/Applications/<Name>.app`; never traverses elsewhere.
3. **`defaults read <Info.plist> CFBundleIconFile`** → `Contents/Resources/<name>.icns` (suffix appended if missing) with two fallbacks: `<bundle-stem>.icns`, then the first `*.icns` in `Resources/`. Then `sips -s format png -z 64 64 <input> --out <cache>`.

**Why `defaults` over a plist crate:** zero new deps, ships with macOS, handles binary plists transparently. We pay one exec per cache-miss; the cache absorbs the cost.

**Why `Option<String>` over `Result`:** the absence of a usable icon is the *common* case for non-`.app` casks (pkg-installer, font, bare-binary). Surfacing it as `Ok(None)` lets the frontend render a fallback glyph without a try/catch and without a noisy error toast. `Err(...)` is reserved for sips crashes, IO failures on the cache dir, and bad input — things the user should actually know about.

**Why no Mutex:** read-only filesystem op against brew metadata + the cask's own bundle. Multiple concurrent icon fetches for different tokens proceed in parallel — important for Library views with dozens of casks visible.

**Why a data URL over Tauri's asset protocol:** payload is small (64×64 PNG, typically < 5 KB), one IPC roundtrip per icon, no `convertFileSrc`/CSP plumbing. The cache file remains on disk so the next session also hits the fast path.

Generalizable to any future "render an extracted asset" command: same shape (validate token → resolve source → check cache → exec native tool → write cache → encode + return).

### 13. Friendly error mapping for known upstream bugs (error-polish pass)

Some `brew` failures are upstream Homebrew Ruby bugs, not user error (e.g. `bundle/brew.rb:686 Homebrew::Bundle::Brew::Topo#tsort_each_child` exploding on certain tap-formula combinations — reproducible on bare `brew bundle dump --force` outside the app). Surfacing the raw `BrewExitNonZero { code, stderr_excerpt }` to the toast layer is technically honest but unhelpful: the user has no way to know "this is a brew bug, not your Brewfile."

The fix is small and additive:

1. **`BrewError::BrewExitNonZero` gained an optional `friendly_message: Option<String>` field** with `#[serde(skip_serializing_if = "Option::is_none")]` so the JSON wire shape stays backwards-compatible. Existing frontend `isBrewError` type guards and `switch (err.code)` consumers keep working unchanged — the field is purely additive.
2. **`brew::error_patterns::friendlify(stderr_excerpt, command) -> Option<String>`** pattern-matches the bounded ring snapshot against a tiny hand-curated catalog (currently two patterns: the bundle topo-sort crash, and "Please report this issue: docs.brew.sh/Troubleshooting"). Substring scans only — cheap, no regex, no allocation.
3. **Called from both `run_brew_capture` and `run_brew_streaming`** when constructing `BrewExitNonZero`. The verbatim stderr is still preserved in `stderr_excerpt` for the Activity drawer; the friendly message only drives the toast.
4. **Bundle-only patterns are gated to bundle subcommands** via a `command.contains("bundle dump")` check so they don't false-positive on unrelated `brew install` stderr.

**Catalog discipline.** Three or four patterns max. This is polish, not a rules engine — when in doubt, return `None` and let the generic error surface unchanged. New patterns get a positive unit test using real captured stderr (see `error_patterns.rs` tests). If the catalog ever needs to grow past four entries, revisit whether the friendly message should live with the call-site instead of in a central matcher.

Reusable for any future "this exit code is misleading without context" cases (e.g. a known `brew upgrade` flake, a network-related install failure). The pattern keeps the structural error model intact while making the human-facing surface kinder.

### 14. Homepage favicon cascade for uninstalled-cask icons (Phase 8)

Sibling of §12. `cask_icon_from_homepage(token, homepage)` extracts an icon for casks that are **not** installed but expose a homepage URL — Discover and search-result rows, where the `.app` bundle path used by `cask_icon` doesn't exist on disk. Returns the same `Option<String>` data-URL shape so the frontend's icon-cache store (Frontend §12) consumes both commands through one code path.

**The cascade — first `2xx` + `image/*` Content-Type wins, in order:**

1. `<scheme>://<host>/apple-touch-icon.png` — Apple-blessed convention; widely deployed for modern web properties.
2. `<meta property="og:image">` parsed from the homepage HTML (capped at 64 KB read).
3. `<scheme>://<host>/favicon.ico` — universal fallback.

Each candidate's bytes are passed to `/usr/bin/sips -s format png -z 64 64 <staged> --out <cache>` so a `.ico`, `.png`, `.jpg`, or whatever else the origin returns is normalized to a uniform 64×64 PNG, identical to the Phase 7 path.

**Why this cascade order:** the POC script (`/tmp/probe-cask-icons.py`) ran an alternate GitHub-scanning approach against 10 representative casks and scored 0% hit rate; the favicon cascade hit 10/10 across both GitHub-hosted and non-GitHub-hosted homepages. GitHub-scanning was dropped. apple-touch-icon comes first because it's the highest-quality result (Apple's spec requires a square non-transparent PNG ≥ 180×180); og:image second because it's marketing-curated artwork; favicon last as the lowest-common-denominator fallback that almost always exists but is usually only 16×16 or 32×32.

**Shared on-disk slot with `cask_icon`.** Both commands write to `<state.cache_dir>/icons/<token>.png` with the same 7-day TTL. When a user installs a cask whose homepage-derived icon is already cached, the Phase 7 path overwrites transparently — no migration, no rename, no special-case in the cache layer. The Frontend §12 cache also doesn't need to distinguish "where did this icon come from" because both commands return the same data-URL shape.

**Sticky-null marker.** On a fully-failed cascade we touch a sibling `<cache_dir>/icons/<token>.png.miss` zero-byte file with the same 7-day TTL. Subsequent invocations short-circuit to `Ok(None)` without re-probing the homepage. The `.png.miss` suffix can't collide with a real PNG payload, so a successful later cascade (e.g. after a homepage redesign) will overwrite the cache PNG and the next probe will see the cached image first; we don't need to actively clear the marker because the cache hit happens before the marker check.

**Network politeness.** Single `reqwest::Client` per invocation with:
- `User-Agent: brew-browser/0.1 (+https://github.com/msitarzewski/brew-browser)` — identifies the app and gives ops at the receiving end a contact for abuse reports.
- 5-second per-probe timeout. Brief but not hostile — most CDNs answer in <1s; 5s leaves margin for slow origins without stalling the UI thread.
- Default redirect policy (up to 10). Honors `Content-Type`.
- HTML capped at 64 KB before the og:image scan, bounded memory.

**URL validation.** The homepage must parse as `http://` or `https://` after trimming. Anything else (`data:`, `javascript:`, `file:`, `ftp:`) collapses to `Ok(None)` and touches the sticky-null marker so we don't re-parse the same garbage on every UI re-render. User-info (`user:pass@host`) is stripped from the parsed origin so credentials never propagate into probe URLs.

**No regex dependency.** The `og:image` scan is implemented as a manual `<meta>` walker that tolerates both attribute orders (`property="og:image" content="..."` and reverse), single or double quotes, `property=` vs. `name=`, mid-string truncation (no panic when the 64 KB cap slices through a tag), and `data-content=` vs. `content=` (avoids the substring false-positive). This keeps the cargo dep delta at zero. Reused helpers: `find_subsequence` + `memchr`-style byte position search.

**No mutex.** Read-only network + filesystem op. Multiple cascade fetches for different tokens proceed in parallel — important for Discover/Trending rows with dozens of uninstalled casks visible at once.

**`Ok(None)` vs `Err` (same discipline as `cask_icon`):** absence of an icon is the *common* case for an uninstalled cask. Network flakes, non-2xx responses, non-image content-types, empty bodies, and `sips` failing on a corrupt payload all collapse to `Ok(None)` + sticky-marker so a transient DNS hiccup doesn't paint a red toast over a Discover row. `Err(...)` is reserved for things the user must actually know about: invalid token, cache dir IO failure, reading back the cached PNG fails mid-read.

### IconSource — typed routing hint embedded in every Package

Phase 8 also introduces `Package.icon_source` — a tagged-enum hint computed in `RawCask::to_package` / `RawFormula::to_package` that tells the frontend which command to invoke for each row. This keeps the routing logic with the data instead of being re-derived from `(kind, installedVersion, homepage)` at every render site. Variants:

- `InstalledApp` → frontend calls `cask_icon(token)` (Phase 7).
- `Homepage { homepage }` → frontend calls `cask_icon_from_homepage(token, homepage)` (Phase 8). Homepage is trimmed; whitespace-only collapses to `None`.
- `None` → frontend renders the fallback glyph; never invokes either command. Always emitted for formulae.

The cascade-vs-bundle decision is made *once* on the backend at list-parse time, not on every paint. The Frontend §12 icon-cache store can dispatch off `icon_source.kind` without re-touching `pkg.installedVersion` or `pkg.homepage`.

### 15. Security hardening patterns (wave-security fix-pass, 2026-05-23)

Patterns introduced by the wave-security audit fix-pass. Every pattern here is reusable for any future command that handles user-influenced paths, URLs, or tokens at the IPC boundary.

**Scheme allowlist.** When parsing a URL that may come from attacker-influenced metadata, the parser only accepts `http://` and `https://` and rejects everything else (`file:`, `javascript:`, `data:`, `vscode:`, custom app schemes). Scheme matching uses `str::eq_ignore_ascii_case` on the prefix — no lower-case allocation, no slice-math fragility, no Unicode-length surprises. See `commands::cask_icon_homepage::parse_http_url` for the canonical implementation. The backend mirror of the frontend H1 fix; both layers run independently so a future renderer-side bypass is still gated by the backend.

**Path sandboxing (denylist + canonicalize-and-check).** Commands that accept a filesystem destination from the IPC boundary (e.g. `brewfile_export`) check the path against:

1. A short denylist of system-owned prefixes (`/etc/`, `/System/`, `/Library/`, `/usr/`, `/bin/`, `/sbin/`, `/var/`, `/private/etc/`, `/private/var/`, `/dev/`, `/Volumes/`). Cheap, lexical, applied to the user-supplied path before any resolution.
2. A component-wise prefix check against the app's own data directory — refuse writes inside our own state dir to prevent renderer-driven snapshot poisoning. Component-wise (not string-prefix) so `~/Library/Application Support/brew-browser-evil` isn't a false positive.
3. A canonicalized re-check of the parent directory — catches symlink farms whose lexical parent looks safe but resolves into our data dir.

Sources read from the IPC boundary (e.g. `brewfile_import`) additionally check:
- `symlink_metadata` to reject symlinks without dereferencing (otherwise `/Users/<u>/.ssh/id_ed25519` becomes exfiltratable),
- a size cap (1 MiB) so an attacker can't copy a multi-gigabyte file into our data dir,
- a binary-content sniff (NUL byte in first 4 KiB) so binary payloads are rejected before they reach the snapshots store.

Helpers: `commands::brewfile::is_safe_export_target`, `is_safe_import_source`.

**Canonicalize-and-check for bundle-internal joins.** When a value sourced from an attacker-influenced bundle (e.g. `CFBundleIconFile` read via `defaults read`) is composed into a path under a known-safe directory (`Contents/Resources/`), the join is wrapped in `safe_join_in_resources`: a lexical pre-check (no `..`, no `/`), then `canonicalize()` on both sides, then `starts_with` to verify the resolved physical path is still inside the resolved safe dir. Apply this anywhere user-controlled strings join onto a directory whose root must be enforced. Helper: `commands::cask_icon::safe_join_in_resources`.

**SSRF host filter (string + IP literal).** Outbound HTTP probes against attacker-influenced URLs filter the host through `is_public_host` before any request fires:
- IPv4: loopback, private (RFC1918), link-local (incl. cloud metadata `169.254.169.254`), CGNAT, broadcast, multicast, documentation, benchmarking ranges,
- IPv6: loopback, ULA (`fc00::/7`), link-local (`fe80::/10`), multicast, IPv4-mapped private addresses,
- hostnames: `localhost`, `*.local`, `*.internal`.

The filter is *string-based* — it does not resolve DNS. A second layer protects against attacker-controlled redirects: `reqwest::Client::builder().redirect(RedirectPolicy::custom(...))` re-checks every hop's host and stops the chain if any redirect targets a non-public address or a non-http(s) scheme. Together the two layers neutralize the SSRF surface for both direct probes and redirect pivots. DNS-rebinding is acknowledged as out-of-scope; mitigated by the content-type filter discarding non-`image/*` bodies. Helper: `commands::cask_icon_homepage::is_public_host`.

**Per-host / global concurrency cap.** Outbound probe storms are bounded by a process-wide `tokio::sync::Semaphore` (lazy-init via `OnceLock`). 16 concurrent probes total — small enough to stay polite to receiving CDNs and our own FD budget, large enough that interactive scroll through Discover/Trending feels instant. The cap lives in the command module (no AppState wiring needed) so other commands can adopt the same pattern with three lines of code. See `commands::cask_icon_homepage::probe_semaphore`.

**Filesystem-safe token validator.** `validate_package_name` accepts `/` and `.` so legitimate tap-qualified formula names like `homebrew/core/wget` and versioned names like `python@3.14` pass. But anywhere a token composes into a filesystem path (cache files, on-disk identifiers), the stricter `validate_cask_token` overlay rejects `/`, leading `.`, bare `.` and `..`, and any empty / `.` / `..` segments split on dots. Used by `cask_icon` and `cask_icon_from_homepage`. Apply `validate_cask_token` *before* constructing any cache path — the previous ordering wrote zero-byte miss markers to attacker-influenced paths before brew ever saw the token.

**CSP with `'unsafe-inline'` for styles only.** Svelte components ship inline `<style>` blocks, so `style-src 'self' 'unsafe-inline'` is unavoidable until we migrate to nonces. Everything else is tight: `default-src 'self'`, `img-src 'self' data:` (preserves the cask-icon data URL path), `connect-src 'self' https://formulae.brew.sh` (forward-compat for any future renderer-side fetch), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. The CSP doesn't prevent any current exploit (no `{@html}` call sites today), but backstops any future Markdown-rendering slip-up.

**Pin `withGlobalTauri: false` explicitly.** Tauri 2's default is `false` today, but pin it in `tauri.conf.json` so it can't flip across minor versions. Keeps the global `__TAURI__` off `window` and prevents accidental escalation of renderer access to IPC primitives.

---

## Frontend (Svelte 5) — Wave 2

### 1. Store-class singleton pattern

Each store is a single module-scoped instance of a TypeScript class whose fields are declared with Svelte 5 runes (`$state`, `$derived`). The class lives in `src/lib/stores/<name>.svelte.ts` — the `.svelte.ts` extension is required so Vite's plugin processes runes outside of `.svelte` files.

```ts
// src/lib/stores/packages.svelte.ts
class PackagesStore {
  list = $state<PackageList | null>(null);
  loading = $state(false);
  formulae = $derived(this.list?.formulae ?? []);
  async load(force = false) { /* ... */ }
}
export const packages = new PackagesStore();
```

Pros: no `setContext`/`getContext` plumbing; type-safe in TS; methods are first-class so call sites read like `packages.load()`. Used by `ui`, `packages`, `search`, `activity`, `brewfiles`, `trending`, `toast`.

**Important TS quirk:** `let x: T | null = $state(null)` infers as `null` and won't accept `T` assignments. Use `let x = $state<T | null>(null)` instead. This applies to local component state, not class fields (class field annotations work fine).

### 2. Typed `invoke()` wrapper layer

`src/lib/api.ts` wraps every backend command in a named function. Call sites import `brewList` rather than typing `invoke("brew_list")`. Streaming commands take a callback `(evt: BrewStreamEvent) => void`; channel construction is encapsulated:

```ts
function makeChannel(onEvent: (e: BrewStreamEvent) => void): Channel<BrewStreamEvent> {
  const ch = new Channel<BrewStreamEvent>();
  ch.onmessage = onEvent;
  return ch;
}
export function brewInstall(name, kind, onEvent) {
  return invoke<JobResult>("brew_install", { name, kind, onEvent: makeChannel(onEvent) });
}
```

Errors are *not* caught here — they propagate as `BrewErrorPayload`-shaped objects via the `invoke()` rejection. Callers use `try/catch` + the `isBrewError(e)` guard from `types.ts`.

### 3. Activity-job lifecycle

Frontend creates the local `ActivityJob` *before* invoking — with a `crypto.randomUUID()` tmp id — so the drawer is interactive immediately. The first `Started` event carries the real backend `job_id`; the activity handler patches the matching job's `jobId` if they differ. This avoids the UI flickering "no jobs" while waiting for the round-trip.

```ts
const tmpId = crypto.randomUUID();
activity.startJob(`Installing ${name}`, tmpId, `brew install ${name}`);
ui.openDrawer();
await brewInstall(name, kind, (evt) => {
  if (evt.kind === "started" && evt.jobId !== tmpId) {
    const j = activity.jobs.find((j) => j.jobId === tmpId);
    if (j) j.jobId = evt.jobId;
  }
  activity.handleEvent(evt);
});
```

### 4. Modal + DestructiveConfirm pattern

`Modal.svelte` is the generic dialog: scrim, focus trap, Esc-to-close, scrim-click-to-close, scale/fade animation. `DestructiveConfirm.svelte` wraps `Modal` with opinionated Cancel/Confirm actions. `confirmVariant="primary"` reuses the dialog for additive ops (Restore-from-Brewfile) without painting them red.

Default focus is **Cancel**, matching macOS sheets — Enter without explicit Tab is always the safe path.

### 5. Bottom drawer pattern (Activity)

`ActivityDrawer.svelte` is a fixed-height (280 px) bottom region that minimizes to a 32 px strip rather than disappearing. State lives in `ui.drawerOpen` + `ui.drawerMinimized`. `ui.toggleDrawer()` cycles `closed → open → minimized → open → minimized → ...` so Cmd+L feels natural.

The streaming console is scoped to one `activeJob` at a time; per-job tabs appear once N>1. Smart auto-scroll: if the user scrolls more than 20 px from the bottom, auto-scroll pauses until they scroll back. ANSI escapes are stripped client-side via `s.replace(/\x1b\[[0-9;]*m/g, "")`. Line-prefix classifier colors lines without parsing real ANSI.

### 6. Theme application

`ui.theme` is `"light" | "dark" | "system"`. Applied to `document.documentElement.dataset.theme` (the OKLCH tokens in `tokens.css` key off `[data-theme="dark"]`). Persisted to `localStorage["brew-browser.theme"]`. When `"system"`, a `matchMedia('(prefers-color-scheme: dark)')` listener flips the attribute on OS theme change. Mounted once in `+layout.svelte`.

### 7. Single-route app shell

There are no nested SvelteKit routes. `+page.svelte` is the entire app shell; section switching is store-driven (`ui.section`), not URL-driven. Detail panel is a slide-over (not a route). Activity drawer + command palette + toast layer are siblings of the main pane. This keeps the model crisp for a single-window utility and avoids back-button semantics that would feel wrong in a native app.

### 8. Global keymap

A single `keydown` listener on `window` in `+page.svelte` handles the full keymap (Cmd+1..5, Cmd+K, Cmd+L, Cmd+Shift+L, Cmd+R, `/`, Esc). Text inputs are detected and `/` is skipped when the user is already typing. Modal Esc-handling lives inside `Modal.svelte` so dialog-local concerns don't leak into the global handler.

### 9. Snippet-based component composition

Per Svelte 5 idioms, components expose **snippets** (`children`, `actions`, `icon`, `cta`) via `{@render}` rather than slots. This gives them named, typed extension points without `<slot name="...">` and parent-side `<svelte:fragment>` ceremony.

```svelte
<Button variant="primary" onclick={doInstall}>
  {#snippet icon()}<Download size={16} />{/snippet}
  Install
</Button>
```

### 10. CSS scoping + tokens

Every component has a scoped `<style>` block; cross-component sharing is via CSS variables in `src/lib/styles/tokens.css`. Zero `:global()` selectors except for one case in `Button.svelte` where the loading-spinner SVG (an injected child of a `<span>`) needs `.spin :global(svg) { animation: ... }`. Lucide icons inherit `currentColor`, so theme-flips just work without any per-icon plumbing.

### 11. `prefers-reduced-motion` honored

Global rule in `app.css` cuts animation/transition to 0.01ms. Component-level animations (`.toast` slide-in, `.modal` scale-in, `.skeleton-row` shimmer, `.drawer` height transition, `.spin` rotation) all have explicit `@media (prefers-reduced-motion: reduce)` overrides that disable the keyframes or set them to plain non-animated states.

### 12. Lazy-load + in-memory-Map + null-marker cache (Phase 7)

For per-row async asset fetches (initial use case: cask icons via `cask_icon`), the frontend uses a small store-class pattern that's reusable for any future "fetch-by-key, value-may-be-missing, cache-for-the-session" need:

- **`cache = $state<Map<K, V | null>>(new Map())`** — `null` is a sticky "tried, no value" marker so the cache distinguishes *miss* from *not-yet-fetched* (`Map.has(k)` = fetched, `cache.get(k) === null` = known-missing). This avoids hammering the backend for things that genuinely have no result.
- **`pending: Map<K, Promise<V | null>>`** — concurrent calls for the same key coalesce onto a single in-flight Promise. Critical for list views where the same row may re-render multiple times (filter swap, key change) before the first request resolves.
- **Map re-assignment (`this.cache = new Map(this.cache)`)** — Svelte 5 `$state` doesn't track in-place `Map.set()` mutations. After every write, re-wrap so subscribers see the change.
- **In-memory only** — no `localStorage` round-trip; the backend command owns its own disk cache (cask_icon writes to `~/Library/Caches/...`). The frontend layer exists purely to avoid re-invoking on UI re-renders.
- **Catch-and-cache failures as null** — if `invoke()` throws (backend missing, extraction failed), store `null` and don't retry that key. Keeps the UI quiet when the feature is partially deployed.
- **Lazy fetch from a Svelte `$effect`** — components peek the cache synchronously first (`peek(k): V | null | undefined`); if undefined, kick off `getIcon()` and reconcile when the Promise resolves. A `canceled` flag in the effect cleanup prevents stale writes when the row's `pkg` identity changes mid-flight.

Pattern lives in `src/lib/stores/iconCache.svelte.ts`. Reusable for: app screenshots, Brewfile thumbnails, anything else where the row needs an async asset whose absence is a normal state, not an error.

### 13. Discriminated-union backend classifier → frontend routing (Phase 8)

When a feature has two-or-more interchangeable backend implementations whose choice depends on *data* (not on the caller), the cleanest contract is a discriminated union the backend stamps on the DTO once, and the frontend `switch`-routes at the call site. Phase 8 cask icons are the canonical example: the backend decides whether a given cask has an installed `.app` (use `cask_icon`), a homepage to favicon-scrape (use `cask_icon_from_homepage`), or no source at all (don't IPC). The frontend doesn't sniff filesystems or URLs — it reads `pkg.iconSource.kind` and dispatches.

Shape:

```ts
type IconSource =
  | { kind: "installedApp" }
  | { kind: "homepage"; homepage: string }
  | { kind: "none" };
```

```ts
switch (pkg.iconSource.kind) {
  case "installedApp": return await caskIcon(pkg.name);
  case "homepage":     return await caskIconFromHomepage(pkg.name, pkg.iconSource.homepage);
  case "none":         return null;          // synchronous fast path — no IPC
}
```

Why a tagged union over two booleans / nullable URL:

- **Exhaustive at the type level.** TS narrows each arm; the `switch` is provably total without runtime guards.
- **No invalid combinations.** "installed AND homepage", "neither but with a URL" etc. simply can't be expressed.
- **Adding a fourth source later (e.g. tap-bundled icon) means one new arm + one new command** — call sites that didn't update fail typecheck instead of silently mis-routing.
- **The "no work" case is a first-class value (`{ kind: "none" }`)**, so the frontend cache can resolve it synchronously and skip the IPC entirely instead of paying a round-trip to learn there's nothing to fetch.

Cache key stays the package token (`pkg.name`) regardless of which arm fires — both backend commands keep their own token-keyed disk caches, so the frontend memoization layer doesn't need to encode the route. The sticky-null + Promise-coalescing pattern from §12 carries over unchanged.

Reusable for any future "the backend picks the source, the frontend just renders" feature: app screenshots (installed-app capture vs. App Store metadata vs. none), Brewfile thumbnails (locally-rendered vs. cached vs. placeholder), changelog sources (GitHub release notes vs. Homebrew formula history vs. none).

### 14. Centralized URL scheme allowlist (`safeOpenUrl`) for opener calls (security fix-pass)

When the renderer hands a URL to `tauri-plugin-opener` (which resolves to macOS `open(1)`), every registered URL scheme is honored — `file://`, `vscode://`, `slack://`, `mailto:`, custom-app schemes. Cask and formula `homepage` strings are attacker-influenced metadata (poisoned tap, compromised upstream JSON), so an unfiltered call is a scheme-handler escape: one click on an "official-looking" mailto/vscode/slack link can trigger an action in any custom-scheme app the user has installed.

**The pattern:** one helper, one allowlist, every opener call funnels through it.

```ts
// src/lib/util/url.ts
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
export async function safeOpenUrl(url: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { toast.error("Invalid URL"); return; }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    toast.error(`Refusing to open ${parsed.protocol} URL`);
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  try { await openUrl(parsed.toString()); }
  catch { window.open(parsed.toString(), "_blank"); }
}
```

**Discipline:** *never* `import { openUrl } from "@tauri-apps/plugin-opener"` at a call site — always `import { safeOpenUrl } from "$lib/util/url"`. The fallback `window.open` runs only after the scheme check, so the browser path is just as restricted as the opener path. Rejections toast `toast.error(...)` so the user understands why the click did nothing.

Generalizable to any future renderer→native-handler bridge: centralize the policy in one helper, point every caller at it, and let TypeScript ensure new callers can't accidentally bypass it (the helper takes `string`, the rejection path is internal, there's nothing to forget).

Security audit §H1 (`memory-bank/security.md`).

### 15. Adaptive `aria-live` for high-volume streaming logs (security fix-pass)

The Activity drawer's streaming console relays brew's stdout/stderr line-by-line. At plain `aria-live="polite"`, every line is queued for the screen reader — fine for a 10-line `brew search`, but a `brew install` can dump hundreds of progress lines (downloads, tar verbose output, post-install scripts) and floods SR users into an unusable state.

**The pattern:** rate-detect the stream and switch the live region to `aria-live="off"` while it's surging, with a dedicated tiny polite live region that fires once on completion so SR users still get an exit signal.

Rules:
- Sample line-arrival rate inside a sliding window (start time + count). Threshold: `>= 3 lines/sec sustained for >= 5s` → flip to `"off"`.
- Reset to `"polite"` only after a calm period (`1.5s` with no new lines). Refresh the calm timer on every line.
- Reset all counters when the active job changes — a previous job's surge shouldn't mute the next one.
- Maintain a second, always-polite `sr-only` live region whose contents change *only* when the job's status transitions to `succeeded` / `failed` / `canceled`. Format: `"<label>: done."` / `"<label>: failed."` / `"<label>: canceled."`. Short, factual, one announcement per job.
- Counters and timestamps are bookkeeping, not state — keep them as plain module-local refs (don't `$state` them), reactivity is driven by the line-count effect dependency on `activeJob.lines.length`.

The visible footer line ("Done in 4.2s") stays in the regular DOM with no inline `aria-live` — the sr-only announcer is the single authoritative source of completion announcements so SR users hear it once and reliably.

Strategy A (mute-on-surge + completion announcer) was chosen over Strategy B (throttle-and-combine) because brew output isn't structured enough for a throttle to produce useful combined announcements — most install lines are progress/transient/identical-token noise where exit status is the only signal an SR user actually wants.

Reusable for any future high-volume streaming UI (log viewers, download progress, build output): same shape — rate-detect, flip to off, dedicated completion-only polite region.

Security audit §N4 (`memory-bank/security.md`).

### 16. Foreground-probe debounce window (security fix-pass)

Foreground listeners (`focus`, `visibilitychange`) can fire rapidly when the user alt-tabs back and forth, so any work attached to them needs a minimum-interval gate or it'll spawn processes / hit endpoints once per blink. The `env` store now exposes `refreshIfStale(minIntervalMs = 30_000)` alongside the unconditional `refresh()`: foreground triggers call the gated variant, the 5-minute backstop `setInterval` keeps using the unconditional one.

Pattern shape (any future store that probes on focus):

```ts
async refreshIfStale(minIntervalMs = 30_000): Promise<void> {
  if (this.loading) return;
  if (this.lastCheckedAt !== null && Date.now() - this.lastCheckedAt < minIntervalMs) return;
  await this.refresh();
}
```

Timestamp comparison only — no debounce library, no leading/trailing edge nuance. `loading` short-circuit ensures back-to-back calls during an in-flight probe don't queue. 30s is the right window for `brew --version` / `brew --prefix`: real environment changes (user installs/uninstalls brew) take more than 30s to manifest anyway.

Security audit §L5 (`memory-bank/security.md`).

