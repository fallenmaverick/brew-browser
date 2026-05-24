# Code Review — Wave 3

**Reviewer:** Code Reviewer
**Date:** 2026-05-23
**Scope:** Full `src-tauri/src/` Rust backend + full `src/` Svelte 5/TS frontend + Tauri/build config
**Specs read:** projectbrief, techContext, decisions, activeContext, designSystem, uxArchitecture, backendApi (incl. §10.5), systemPatterns, frontendComponents

---

## 1. Verdict

This is a **production-grade demo with a handful of small but real bugs** — closer to "ship after one focused pass" than to demoware. The architecture cleanly matches the three Wave 1 specs (modular Rust, typed IPC, runes-based Svelte stores, OKLCH tokens, plain CSS). The security posture is solid where it counts (no `tauri-plugin-shell`, IPC-only argv, package-name validator). Streaming, mutex, cancellation, and per-error-code wire shapes all match `backendApi.md`. The most visible regressions are (a) a keymap collision that disables theme-cycle, (b) the brew status dot that never reflects reality (`brew_doctor` is wired but never called), and (c) the Modal's first-focusable logic that focuses the header close-X instead of Cancel, undermining the documented "default focus = safe action" guarantee. None are architectural; all are 5–30 line fixes.

---

## 2. Spec compliance

| Spec area | Status | Notes |
|---|---|---|
| 20 Tauri commands | ✅ all registered (`lib.rs:32-54`) | matches list in backendApi §1 |
| Camel-case wire shape via `#[serde(rename_all="camelCase")]` | ✅ on every DTO in `types.rs` | confirmed against TS in `src/lib/types.ts` |
| `BrewError` tagged enum (`tag = "code"`, snake_case) | ✅ `error.rs:14-15` | matches `BrewErrorPayload` TS union; round-trip via `brewErrorMessage()` covers every variant |
| `Channel<BrewStreamEvent>` streaming (not `app.emit`) | ✅ `brew/exec.rs` + every action command | per-invocation, type-safe |
| Single coarse write mutex via `.lock_owned().await` | ✅ all six streaming commands acquire `brew_write_lock` | reads bypass; cache invalidated after writes |
| `--json=v2` for list/info/outdated | ✅ `commands/list.rs`, `commands/info.rs` | plain-stdout parse only for `brew search` and `brew bundle check` (documented in §10.5 drift) |
| Trending: reqwest+rustls, 1h TTL, stale-on-error | ✅ `trending/{client,cache}.rs` + `commands/trending.rs` | TTL constant matches spec; UA includes version |
| Input validation at IPC boundary | ✅ `validate_package_name` + `validate_search_query` | rejects leading dash + non-ASCII outside `[A-Za-z0-9._+/-@]` |
| Brewfile dir under `~/Library/Application Support/brew-browser/brewfiles/` | ✅ `state.rs:113-120` via `dirs::data_dir()` | created if missing |
| Sidebar IA: 5 sections, Cmd+1..5, Cmd+K palette, Cmd+L drawer | ✅ `routes/+page.svelte:27-87` + `Sidebar.svelte` | except Cmd+Shift+L theme-cycle is dead (see Critical #1) |
| Bottom Activity drawer | ✅ `ActivityDrawer.svelte` | per-job tabs, smart auto-scroll, ANSI strip, line classifier all present |
| Modal + DestructiveConfirm pattern | ✅ `Modal.svelte`, `DestructiveConfirm.svelte` | focus trap, scrim click, Esc — but default-focus rule violated (Critical #3) |
| Theme via `[data-theme="dark"]` on `<html>` | ✅ `stores/ui.svelte.ts:70-80` | localStorage persistence + system matchMedia watcher |
| `prefers-reduced-motion` honored | ✅ global rule in `app.css:31-38` + per-component overrides in Modal/Toast/Drawer/Detail/CommandPalette/LoadingState | well-implemented; skeleton swaps to flat background not just-no-animation |

**Drift not already documented**

- `Sidebar.svelte:189-192` — brew status dot is **always green**, hardcoded. Spec said green/amber/red driven by `brew_doctor` probe + running-op count. (Critical #2.)
- `src-tauri/tauri.conf.json:23` — `"csp": null`. Spec §8 said "tighten to `default-src 'self'; connect-src 'self' https://formulae.brew.sh; …` once Phase 6 lands" — never tightened. (Important #1.)
- `extract_mas_id` is sub-spec: spec §11.5 left it to implementer; current impl works for canonical `mas "App", id: 123` lines.
- No `<DesignSystemPreview>` route at `/_design` — explicitly deferred in `frontendComponents.md` drift.

---

## 3. Critical findings (must-fix before user sees this)

### 🔴 C1 — Cmd+Shift+L theme cycle is dead code

**File:** `src/routes/+page.svelte:37-71`

The handler order is:
```ts
if (meta && e.key.toLowerCase() === "l") {       // line 38 — fires for any L+meta
  ui.toggleDrawer(); return;
}
…
if (meta && e.shiftKey && e.key.toLowerCase() === "l") {  // line 65 — never reached
  ui.setTheme(next); return;
}
```

The Cmd+L branch returns before the Cmd+Shift+L branch can match. Cycle-theme is unreachable.

**Fix:** check shift first.
```ts
if (meta && e.shiftKey && e.key.toLowerCase() === "l") { /* theme */ return; }
if (meta && !e.shiftKey && e.key.toLowerCase() === "l") { /* drawer */ return; }
```

### 🔴 C2 — Brew status indicator is fake

**Files:** `src/lib/components/Sidebar.svelte:85-92, 189-192`; `src/lib/api.ts:41-43` (declared but never called)

The footer dot is hardcoded `background: var(--color-success)` and the label is the static string `"brew"`. `brewDoctor()` is exported in `api.ts` but no caller invokes it anywhere in the codebase (verified by grep against the frontend). Result: the dot reads as "everything's fine" even when brew is missing or a write op is mid-flight — the opposite of what `uxArchitecture.md` §2 spec'd.

**Fix:** call `brewDoctor()` in `+layout.svelte` `onMount`, store the result in `ui` (or a new `env` store), and drive `.dot` color + label from `(brewEnv.installed, activity.runningCount)`: green=ready, amber=running, red=missing.

### 🔴 C3 — Modal default focus lands on the close-X, not Cancel

**Files:** `src/lib/components/Modal.svelte:19-27`; `DestructiveConfirm.svelte` (consumer)

`Modal.$effect` focuses the **first** focusable inside the dialog. Document order is `<header>` (close-X button) → `<body>` → `<footer>` (Cancel, Confirm). So on every destructive confirm, focus lands on close-X. The keyboard user who hits Enter without thinking activates the dismiss button, which is fine for *that* modal — but breaks the documented contract in `designSystem.md` §7.6 ("Default focus: Cancel button. Pressing Enter without moving focus = safe.") and `uxArchitecture.md` §5 ("Default focus = Cancel.")

It's also a UX inconsistency: in the New-Snapshot modal (`Snapshots.svelte:206`), the `Modal` has no header close-X because `dismissible=true` keeps it there → first focusable is the **label's `Input`**, which is correct. So the bug only bites destructive paths, which is precisely where you want safety.

**Fix:** in `Modal.svelte:22-26`, prefer a focusable inside the `footer` first, else first focusable inside the body, else the close button. Or: have `DestructiveConfirm` pass an explicit `defaultFocus="cancel"` and key off it.

### 🔴 C4 — `BrewError::BrewExitNonZero` returned from streaming has empty `stderr_excerpt`

**File:** `src-tauri/src/brew/exec.rs:226-231`

```rust
Err(BrewError::BrewExitNonZero {
    command: display_command,
    exit_code,
    stderr_excerpt: String::new(),    // ← always empty
})
```

The streaming function streams stderr line-by-line via `Channel`, but when the command finishes non-zero and the caller `?`-propagates the error (e.g., `brewfile_dump`'s outer `?` on line 48 of `commands/brewfile.rs`), the resulting `BrewError` has no stderr context. The frontend toast says `brew exited 1:` with nothing after the colon. Two problems:

1. Frontends that don't subscribe to the channel (or that fire-and-forget the events) lose all context.
2. Even subscribers who *do* keep the lines have to redundantly stitch them into the error message themselves.

**Fix:** accumulate the last ~4 KB of stderr lines inside `run_brew_streaming` (a small `Vec<String>` capped or a ring buffer), and populate `stderr_excerpt` from it on the failure branch.

---

## 4. Important findings (should-fix this week)

### 🟡 I1 — `tauri.conf.json` CSP is `null`

**File:** `src-tauri/tauri.conf.json:22-24`

Per `backendApi.md` §8 the spec said to tighten to `default-src 'self'; connect-src 'self' https://formulae.brew.sh; img-src 'self' data:;` once Phase 6 landed. Still `null`. While reqwest runs in Rust (so CSP doesn't gate trending), `null` CSP means any future XSS in rendered content (e.g., a malicious caveats string, a Homebrew description containing `<script>`) could execute. Defense in depth.

**Fix:** set the CSP string above. Test trending still works; if the webview ever needs to load images from elsewhere, add to `img-src`.

### 🟡 I2 — `brewfile_export` / `brewfile_import` accept arbitrary FS paths

**Files:** `src-tauri/src/commands/brewfile.rs:203-249`

```rust
pub async fn brewfile_export(id, target_path: String, …) {
    …
    let dst = PathBuf::from(&target_path);   // no normalization, no sandbox
    …
    tokio::fs::copy(&src, &dst).await…
}
```

```rust
pub async fn brewfile_import(source_path: String, label: String, …) {
    let src = PathBuf::from(&source_path);   // any readable file
    …
    tokio::fs::copy(&src, &dst).await…
}
```

The realistic path is "user clicks `Export…`, dialog returns a path, frontend forwards it" — so the user *did* choose it. But the IPC boundary doesn't enforce that. A malicious page rendered in the webview (post-CSP-tightening, or via a future bug) could call `brewfile_import("/etc/passwd", "shell_init")` and write `/etc/passwd`'s content into the brewfiles dir — or `brewfile_export("legit_id", "/Users/michael/.zshrc")` and clobber a dotfile. The export case is worse because the source is attacker-controlled (any saved Brewfile, content choice = brew CLI options).

**Fix (minimum):** for export, reject if `dst` is inside `~/Library/Application Support/brew-browser/` or `/System/`/`/Library/`/`/etc/`, and require the parent exist (already enforced). For import, reject `src` if it's not regular-file + size-bounded; consider stripping shebangs / refusing files starting with `#!`. A cleaner answer is to have the frontend only accept the path Tauri's dialog returned (round-trip via a token), but that's invasive.

### 🟡 I3 — `brew_doctor` is wired but never called

**Files:** `src/lib/api.ts:41-43`; no callers in `src/lib/`, `src/routes/`

Without `brewDoctor()`, the app never reports the "Homebrew not found" banner state spec'd in `uxArchitecture.md` §6 (Library/Discover/Trending all show their own ad-hoc backend errors instead). The footer status dot can't reflect missing brew (see C2). On a fresh Mac without brew, the user sees "Backend not available: …" everywhere instead of "Homebrew not found. Install from brew.sh."

**Fix:** in `+layout.svelte` `onMount`, call `brewDoctor()`, store on a new `env` store (or extend `ui`), and key the empty-state copy off it.

### 🟡 I4 — `extra_args` parser drops the first quoted arg

**File:** `src-tauri/src/commands/brewfile.rs:397-417`

The state machine pushes only when `count > 0` and increments `count` on close. So the **first** `"…"` pair (the name) is skipped — correct, since `first_quoted` already extracts it — but the **second** pair (the first real arg) is correctly pushed only after the second close brace.

Trace for `brew "wget", args: ["--HEAD"]`:
- open(wget): start=Some, count=0
- close(wget): count>0 false, skip; count→1; start=None
- open(--HEAD): start=Some, count=1
- close(--HEAD): count>0 true, push `--HEAD`; count→2

OK — works for the canonical shape. **But for `brew "foo", link: false`** there's no quoted second token; the parser silently drops it. **And for `cask "foo", args: { appdir: "/Applications" }`** the `/Applications` does get picked up as an `arg`, which is wrong (it's a hash value). Not catastrophic — `args` is just metadata for the UI — but it'll show "args: [ /Applications ]" against random casks.

**Fix:** Either (a) parse only after a `,` and a leading `args:` token; (b) document that `entries.formulae[i].args` is best-effort and isn't trustworthy for cask hash forms; or (c) write a small Ruby-lite tokenizer. I'd start with (b) — there's no UI consumer of `args` today.

### 🟡 I5 — Sidebar `:focus-visible` rule applies `border-radius: var(--radius-md)` globally

**File:** `src/lib/styles/reset.css:61-66`

```css
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  box-shadow: var(--shadow-focus-ring);
  border-radius: var(--radius-md);   /* ← applies to EVERY focused element */
}
```

Setting `border-radius` from a focus rule re-shapes the element itself (not the ring). The console line `.line` (in `ActivityDrawer.svelte`) and the toast `.close` would round on keyboard focus only — visible jitter. Worse, focus targets that already had a different radius (e.g., `.pill` at 4px) get their corners *changed* when focused.

**Fix:** the outline+box-shadow alone provide the ring; drop the `border-radius` line from the global rule. If a per-element ring radius is needed, use `outline-offset` and let outline follow the element shape.

### 🟡 I6 — Activity console `aria-live="polite"` on a streaming log

**File:** `src/lib/components/ActivityDrawer.svelte:144`

`role="log"` + `aria-live="polite"` will announce **every** stdout line to screen readers. A `brew install postgres` is hundreds of lines; users with VoiceOver will get an unstoppable readout. Spec'd in `designSystem.md` §9 as polite, but probably the wrong choice for a high-volume stream.

**Fix:** keep `role="log"` (semantically correct), drop `aria-live`, and emit a single `aria-live="polite"` announcement on terminal events (`exit`/`canceled`/`error`) with summary text ("Installation of wget completed in 14 seconds"). Lets users opt in to reading the buffer.

### 🟡 I7 — Frontend optimistic `jobId` patch assumes `Started` is the first event

**Files:** `src/lib/stores/activity.svelte.ts:30-67`; `src/lib/components/PackageDetail.svelte:64-71`, `Snapshots.svelte:51-57`

The frontend assigns a tmp UUID at startJob, then patches it on the first `Started` event. If the first event is `Error` (e.g., `cmd.spawn()` fails — backend emits `Error` before `Started` would have come per `exec.rs:112-117`), the tmp UUID is never replaced and `activity.handleEvent` never finds the matching job → the line stays "Waiting for output…" forever and the toast doesn't fire either.

**Fix:** in `handleEvent`, if `findIndex` misses, fall back to finding the most-recent `"running"` job with a tmpId-shaped (UUID v4) jobId, or have the streaming command always emit `Started` even on spawn-fail. Cleaner: emit `Started` before `cmd.spawn()`; if spawn fails, follow with `Error` then `Exit{success:false}`. The current backend already emits Started before spawn (`exec.rs:88-92`) → good. The issue would only arise on early backend exceptions before that send. Low realistic risk; flag for the activity-store findIndex fallback regardless.

### 🟡 I8 — `brewfile_dump` returns `summary_for` failure even on success

**File:** `src-tauri/src/commands/brewfile.rs:52`

`summary_for` does sync `std::fs::metadata` + `std::fs::read_to_string` on the just-written Brewfile. If the file isn't yet flushed/visible (rare on macOS, but possible on slow disks), the command returns `BrewError::Io` despite the dump succeeding. The UI toast then says "Snapshot failed" while the file is on disk. The drawer log shows success.

**Fix:** use `tokio::fs` for consistency, and on `summary_for` failure inside `brewfile_dump`, retry once after a 100ms delay; on second failure, build a minimal `BrewfileSummary` with `counts: BrewfileCounts::default()` and return success.

### 🟡 I9 — `parse_brewfile_text` strips `#` comments only when the line *starts* with `#`

**File:** `src-tauri/src/commands/brewfile.rs:340-341`

`brew "wget" # pinned via tap` becomes a formula entry where the trailing comment is silently eaten by the first-quoted parser (fine), but `brew "wget", link: false # comment` will have `extra_args` see no comment chars and behave correctly. Edge cases (multi-quoted comments) are unlikely in real Brewfiles. Marking as a watch-item, not a fix.

### 🟡 I10 — `BrewError::Io` does not preserve the original `io::ErrorKind`

**File:** `src-tauri/src/error.rs:64-79`

Both arms map to the same `Io { message: e.to_string() }`. NotFound has a code-level branch but no behavior. If a future caller wants to distinguish "no permission" from "no such file", they can't without re-parsing the message.

**Fix:** add `kind: String` (or a `BrewIoKind` enum) to the `Io` variant. Low priority.

---

## 5. Nits

- **`extract_mas_id`** (`brewfile.rs:419-424`) substring-matches `"id:"` — if a label contains the literal `id:` it'll find it inside the quotes. Unlikely.
- **`paths.rs::resolve_brew_path`** doesn't honor `BREW_PATH` or check `/usr/local/Cellar/.../brew`. Fine for Tahoe-Apple-Silicon target.
- **`brew_doctor`** parses the version with `split_whitespace().nth(1)` — if brew ever prints `Homebrew >= 5.0.0` (unlikely) or a leading banner, it'll mis-parse. Could pre-strip "Homebrew" prefix.
- **`+page.svelte:81`** keyboard "/" focuses `document.querySelector<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type])')` — when a slide-over Detail panel is open and the user hits `/`, the *first* matching input wins (the Library filter), not the most relevant one. Minor.
- **`PackageDetail.svelte:153, 156, 277, 282`** templates use `{ui.selectedPackage.name}` after the parent `{#if ui.selectedPackage}` guard — Svelte 5 can't always narrow this; works at runtime but TS narrowing only because of the implicit non-null assert via `.name`. Fine.
- **`Toast.svelte`** auto-dismiss timer is a free-running `setTimeout`; spec said "pause on hover". Not implemented. Wave-4 polish.
- **`Trending.svelte` `agoLabel`** is `$derived.by` but `cacheAgeSeconds` is only refreshed on `trending_fetch` calls — the label freezes at the value the backend returned. Spec'd as "Updated N min ago" which implies a live ticker. Polish.
- **`activity.svelte.ts:66`** does `this.jobs = [...this.jobs]` to re-publish after deep-mutating a job. Works, but means every event recreates the outer array. At hundreds of stdout lines/sec, perf is fine for current scale but worth noting.
- **`error.rs::truncate_tail`** uses byte index then walks forward to a char boundary — for the rare case where the cut falls inside a multi-byte char, the truncation may exceed `max` by a few bytes. Cosmetic.
- **`reset.css:12`** `#app { height: 100% }` selector is leftover from Vite scaffold; SvelteKit uses `#svelte` (which `app.css:14` correctly targets). Dead selector.

---

## 6. Cross-cutting observations

### Security posture
**Good.** The single-most-important call (no `tauri-plugin-shell`, all argv constructed in Rust from typed enums) is honored everywhere. `validate_package_name` and `validate_search_query` block flag injection at the boundary. The two unhardened spots are CSP (I1) and FS paths in brewfile import/export (I2). Trending traffic is rustls + 10s timeout + per-host pinned UA. There's no telemetry, no untrusted code execution path.

### Error handling
**Good shape, one gap.** `BrewError` is exhaustive, `From` impls cover the three external error sources, every command bubbles via `?`. The gap: streaming non-zero exit doesn't carry stderr context (C4). Frontend has `isBrewError()` and `brewErrorMessage()` covering every code variant — `brewErrorMessage` is exhaustive at TS compile time because of the switch on `code`.

### Accessibility
**Solid floor with two small holes.** Semantic HTML throughout (`<button>` for actions, `<dialog>`-shaped Modal with `role="dialog" aria-modal`, `role="listbox"`/`option`, `role="tablist"`/`tab`). Focus-visible ring is global. Reduced-motion is honored. Holes: drawer auto-announces on every line (I6), Modal initial focus is wrong (C3). Icon-only buttons have `aria-label`s (verified in Toast, ActivityDrawer header, theme tri-toggle).

### Performance
**No issues at the target scale (≤500 packages).** Library renders via `{#each sorted}` without virtualization — fine for 142 packages, marginal at 5k. Trending caps at 100 entries server-side. ActivityDrawer console will degrade past ~10k lines because `{#each activeJob.lines as line, i (i)}` rebuilds with every store re-publish. Realistic install logs are 50–500 lines, so this is theoretical.

### Maintainability
**High.** The module split in `src-tauri/src/` is exactly what the spec called for — each command is a single small file, each parser sits next to its conversion impl. The frontend store-class pattern (`<name>.svelte.ts`) is consistent across all 7 stores. Naming is honest (`run_brew_capture`, `run_brew_streaming`, `validate_package_name`). Comments are present where intent isn't obvious. Drift notes in `backendApi.md` §10.5 are an excellent practice — keep doing this.

---

## 7. Deep-dives

### 7.1 Security boundary — IPC argv validation

**Holds for brew invocations; partially holds for brewfile paths.**

- Package names: `validate_package_name` (`commands/info.rs:76-108`) enforces non-empty, ≤200 chars, no leading `-`, charset `[A-Za-z0-9._+/-@]`. Called from `brew_info`, `brew_install`, `brew_uninstall`, `brew_upgrade`. Cannot inject `--build-from-source` or `; rm -rf …` (no shell, but also no flag injection).
- Search queries: `validate_search_query` (`commands/search.rs:139-158`) is laxer — accepts most printable chars (brew search supports regex) but blocks leading dash. Reasonable.
- The argv vector is then passed to `tokio::process::Command` directly — **no shell**, no `sh -c`, so even if a name slipped through, it'd be a literal argv element. Confirmed no `String::contains("|")` or similar string-mungings.
- **Hole:** `brewfile_export(target_path)` and `brewfile_import(source_path)` accept raw paths. I2 above. Not exploitable via current UI (file picker mediates), but not enforced by the boundary.
- **Hole:** `brewfile_dump` constructs `--file=<target>` where `target` is `state.brewfiles_dir.join(format!("{id}.Brewfile"))` and `id = sanitize_label(label)`. `sanitize_label` keeps `[A-Za-z0-9_-]` and replaces everything else with `_` (good — no `../` escape). The `.Brewfile` extension is appended in code, so the user can't override it. Solid.

### 7.2 Streaming pattern correctness

**Lifecycle is clean on success, cancel, and spawn-fail.** Walk:

1. `Started` is emitted unconditionally (`exec.rs:88-92`) before spawn.
2. If `cmd.spawn()` fails → emit `Error{job_id, error}` (`exec.rs:112-117`) → return `Err`. **Note:** does *not* emit `Exit` — the frontend `activity.handleEvent` for `error` sets status `failed` but doesn't set `durationMs` or `exitCode`. Cosmetic but the activity-history "duration" column shows blank.
3. On normal completion: stdout/stderr pumps drain (their `tokio::spawn`s end when the pipe closes), then `tokio::join!` awaits both — guarantees no lost lines. Then `Exit` is emitted with `exit_code, success, duration_ms`. Return `JobResult` (or `BrewExitNonZero` if `success == false`).
4. On cancel: `cancel_rx` fires → `child.start_kill()` (SIGTERM) → `tokio::time::timeout(5s, child.wait())`. If timeout exceeded, fall back to `child.wait()` (which blocks until child dies — relies on `kill_on_drop`). Then the `canceled` boolean is derived from `cancel_tx.is_none()` (the cancel handler `.take()`-s it). If true, emit `Canceled{job_id}` and return `Err(BrewError::Canceled)`. Symmetric with frontend's `handleEvent` for `canceled`.
5. Jobs map is `.remove(&job_id)`-d in all branches via the `remove(&job_id)` at `exec.rs:196` before computing `canceled`. **No leak in the jobs map** on success, cancel, or non-zero exit. Spawn-fail path also doesn't insert into the map (insert is at `exec.rs:126-135`, after spawn), so no leak there either.

**One small bug not in the leak axis:** `child.start_kill()` returns `Result<()>` that's `?`-discarded by the `let _ = child.start_kill();` — if SIGTERM fails (process already exited), it's silently ignored. Correct behavior.

**One small bug:** on the spawn-fail path the channel emits `Error` but never `Exit`. The frontend `activity.handleEvent` for `error` sets `status = "failed"` but the activity-history row's `dur` cell is empty. Cosmetic.

### 7.3 Svelte 5 idiom correctness

**Idiomatic throughout.** Verified:
- All component scripts use `$props()`, `$state()`, `$derived()`, `$effect()`. No `export let`. No legacy reactive `$:`.
- Snippets (`{#snippet}` + `{@render}`) used for `icon`, `cta`, `actions`, `children`. No `<slot>` (svelte 5 obsoletes slots in favor of snippets for typed/named extension).
- `$bindable()` used correctly on `Input.value` and forwarded via `bind:value`.
- Stores are module-singleton class instances with rune fields in `.svelte.ts` files. `$derived` on class fields works as expected here.
- `untrack()` used in `PackageDetail.svelte:35-42` to avoid re-running `loadDetail` for unrelated rune writes inside the effect — correct usage.

Two micro-nits:
- `LoadingState.svelte:11` — `{#each Array.from({ length: rows }) as _, i (i)}` — the `_` placeholder will trigger a lint warning in stricter setups but Svelte 5 accepts it.
- `activity.svelte.ts:66` — the `this.jobs = [...this.jobs]` re-publish is a deliberate workaround for the deep-mutation in `j.lines = […]` two lines earlier; if the inner assignment used a fresh array (already does), the outer re-publish is technically redundant since rune reactivity tracks property writes. Harmless.

### 7.4 Theme / dark-mode

**Works as designed.** `ui.setTheme(t)` writes to `localStorage`, then `applyTheme(t)` resolves "system" via `matchMedia` and sets `document.documentElement.dataset.theme`. `tokens.css` keys all dark tokens off `[data-theme="dark"]`. `watchSystemTheme()` subscribes to `matchMedia` change events when `ui.theme === "system"`.

Verified manually: no rendering path bypasses tokens, every `background` / `color` uses a `var(--color-*)` token (greppable). The hardcoded `rgb(0 0 0 / 0.4)` for the modal scrim is intentional and mode-invariant.

**Issue:** the Cmd+Shift+L cycle shortcut is dead (C1). The tri-toggle in the sidebar footer works (`Sidebar.svelte:80-84`). So users can switch themes via mouse but not the documented keyboard shortcut.

### 7.5 `prefers-reduced-motion`

**Honored.** Global rule in `app.css:31-38` cuts duration to 0.01ms. Per-component overrides explicitly disable named keyframes in:
- `Modal.svelte:141-143` — scrim & modal animation
- `Toast.svelte:87-89` — slideIn
- `LoadingState.svelte:39-41` — shimmer (also swaps to flat background — better than just disabling)
- `ActivityDrawer.svelte` — height transition is implicit-disabled by global rule (transition-duration overridden)
- `PackageDetail.svelte:301-303` — slideIn
- `CommandPalette.svelte:215-217` — pop+fadeIn

The `.spin` keyframe (`Button.svelte:120-125` and `ActivityHistory.svelte:95-96`) is the only animation **not** explicitly disabled per-component — global rule cuts it to one iteration of 0.01ms, which leaves the spinner stuck mid-rotation. `designSystem.md` §6 spec'd "spinners change to a static 'Working…' text label when reduced motion is set." Not implemented. Minor — but worth a `<Spinner reducedFallback>` primitive in Wave 4.

---

## 8. What I'd change first if I had 30 minutes

In strict order:

1. **(5 min)** Fix C1 — swap the order of Cmd+L and Cmd+Shift+L handlers in `+page.svelte`. Drop-in.
2. **(10 min)** Fix C3 — in `Modal.svelte`, query focusables in `footer` first, then body, fall back to header. Or expose `defaultFocus="cancel"` on `DestructiveConfirm` and key off it.
3. **(10 min)** Fix C4 — add a small `Vec<String>` accumulator inside `run_brew_streaming` for stderr lines, cap at 4KB, plug into `BrewExitNonZero.stderr_excerpt` on the failure branch.
4. **(5 min)** Fix I5 — remove `border-radius: var(--radius-md);` from the global `:focus-visible` rule in `reset.css`.

Total: 30 minutes, all four are isolated, no architecture changes, ship-blockers cleared.

The medium follow-ups (I1 CSP, I2 brewfile FS paths, I3+C2 brew_doctor wiring + status dot, I6 aria-live, I7 jobId-patch fallback) belong in the Wave-4 polish window — none gate a demo.

---

*End of review. No code modified. Findings cite `file:line` for every actionable item.*
