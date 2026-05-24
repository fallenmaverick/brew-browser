# Frontend Components — brew-browser

**Owner:** Frontend Developer
**Wave:** 2 — Implementation
**Last updated:** 2026-05-23
**Status:** initial inventory written alongside `npm run build` / `npm run check` clean

This file is the canonical inventory of Svelte 5 components in `src/lib/components/`. Format: name, file, props summary, state owned, notes.

---

## Icon library

**Lucide via `@lucide/svelte` (v1.16.0, ISC license).** Imported per-icon (e.g. `import X from "@lucide/svelte/icons/x"`) so Vite tree-shakes unused glyphs. Spec recommended Lucide; the package `lucide-svelte` is deprecated in favor of `@lucide/svelte` (same project, same icons).

## npm deps added in Wave 2

| Package | Why |
|---|---|
| `@lucide/svelte` | Icon set — referenced throughout components |
| `@tauri-apps/plugin-dialog` | Native file pickers for Brewfile export / import (per designSystem §8) |

No other runtime additions. **No Tailwind / CSS-in-JS / preprocessor** — UI Designer's decision, honored.

---

## Style layer

| File | Purpose |
|---|---|
| `src/app.css` | Entry — imports tokens / reset / typography, sets body bg & `prefers-reduced-motion` |
| `src/lib/styles/tokens.css` | OKLCH color tokens (light + dark via `[data-theme="dark"]`), spacing, radius, shadows, motion, typography vars |
| `src/lib/styles/reset.css` | Modern reset + `:focus-visible` ring per macOS convention |
| `src/lib/styles/typography.css` | Base type rules, helpers (`.mono`, `.truncate`, `.uppercase-label`) |

Theme is applied to `document.documentElement.dataset.theme`. `ui.theme` of `"system"` listens to `prefers-color-scheme` via `watchSystemTheme()`.

---

## Types & API surface

| File | Purpose |
|---|---|
| `src/lib/types.ts` | TS-equivalents of every Rust DTO from `backendApi.md` (`Package`, `PackageList`, `PackageDetail`, `SearchResults`, `BrewStreamEvent`, `BrewfileSummary`, `TrendingReport`, `BrewErrorPayload`, etc.) + UI-only types (`ActivityJob`, `PaletteItem`, `ThemePreference`). Includes `isBrewError()` guard and `brewErrorMessage()` formatter. |
| `src/lib/api.ts` | Typed `invoke()` wrappers for all 20 backend commands. Streaming commands take an `onEvent(BrewStreamEvent)` callback; the underlying `Channel<T>` is wired inside `makeChannel()` so callers don't import Tauri directly. Functions resolve with typed result or throw `BrewErrorPayload`-shaped objects. |
| `src/lib/util/url.ts` | URL safety helpers. `safeOpenUrl(url: string): Promise<void>` is the **only sanctioned way to hand a URL to `tauri-plugin-opener`** from the renderer. Scheme allowlist: `http:` / `https:` only — anything else (`file:`, `mailto:`, `vscode://`, `slack://`, `javascript:`, etc.) is rejected with `toast.error()` and never reaches `open(1)`. Exported `classifyUrl(url)` returns `{ ok: true, url } \| { ok: false, reason }` for callers that need the verdict without the side-effect. Security audit §H1 (`memory-bank/security.md`) — keep all opener calls funneling through here so the allowlist is enforced in one place. |

---

## Stores (Svelte 5 runes)

All stores are module-level singleton class instances using `$state` / `$derived` fields. Files end in `.svelte.ts` so SvelteKit's Vite plugin compiles runes correctly.

| Store | File | Owns | Notes |
|---|---|---|---|
| `ui` | `src/lib/stores/ui.svelte.ts` | current `section`, `drawerOpen`/`drawerMinimized`, `paletteOpen`, `theme`, `selectedPackage`, `detailPaneWidth` | Theme persisted to `localStorage["brew-browser.theme"]`. `watchSystemTheme()` reflects OS changes when `"system"`. **Detail-pane width** (`detailPaneWidth`, default 420 px) persisted to `localStorage["brew-browser:detail-pane-width"]` via `setDetailPaneWidth(w)`; `loadDetailPaneWidthFromStorage()` (called from `+page.svelte` onMount) clamps to `[DETAIL_PANE_MIN_WIDTH=320, floor(window.innerWidth * 0.6)]` via the exported `clampDetailPaneWidth(w)` helper. `resetDetailPaneWidth()` snaps back to `DETAIL_PANE_DEFAULT_WIDTH`. |
| `packages` | `src/lib/stores/packages.svelte.ts` | `list: PackageList`, `loading`, `error`, derived `formulae` / `casks` / `all` / `outdated`. | `load(force?)` micro-caches (5 s) to avoid double-fetch on quick re-mount. |
| `search` | `src/lib/stores/search.svelte.ts` | `query`, `results`, `loading`, `error`, `recent` | 300 ms debounce; ≥ 2-char minimum; recent ring buffer (8). |
| `activity` | `src/lib/stores/activity.svelte.ts` | `jobs: ActivityJob[]`, `activeJobId`, derived `runningCount` | `handleEvent(BrewStreamEvent)` mutates the matching job in place. `cancel(id)` calls backend `cancel_job`. |
| `brewfiles` | `src/lib/stores/brewfiles.svelte.ts` | `list: BrewfileSummary[]`, `loading`, `error` | |
| `trending` | `src/lib/stores/trending.svelte.ts` | `window`, `report`, `loading`, `error`, `fetchedAtMs` | Backend handles the 1 h cache; frontend reads `cacheAgeSeconds` for the "Updated N min ago" label. |
| `toast` | `src/lib/stores/toast.svelte.ts` | `items: Toast[]` | Auto-dismiss: 4 s success/info, 7 s warning, persistent error. |
| `iconCache` | `src/lib/stores/iconCache.svelte.ts` | `cache: Map<token, string \| null>`, `inFlight: Set<token>`, `pending: Map<token, Promise>` | Phase 7 + Phase 8. Per-session memoization of cask icon results. **`getIcon(pkg: Package)`** (was `getIcon(token: string)`) now routes via `pkg.iconSource.kind`: `installedApp` → `cask_icon(pkg.name)`, `homepage` → `cask_icon_from_homepage(pkg.name, homepage)`, `none` → cached as `null` synchronously without an IPC hop. Coalesces concurrent calls per token; null is a sticky "tried, no icon" marker so we don't keep retrying. Both backend commands share token-keyed disk caches. Map is re-assigned (not mutated) to trip Svelte 5 reactivity. **Defense-in-depth (§M3):** results from the backend are run through `isSafeIconDataUrl()` and coerced to `null` unless they start with `data:image/png;base64,` or `data:image/jpeg;base64,` — a future backend bug (or compromise) returning `javascript:`, `https://...`, or `data:image/svg+xml,...` can never reach `<img src>`. Contract for backend: both `cask_icon` and `cask_icon_from_homepage` MUST return either `null` or a `data:image/{png,jpeg};base64,...` string; anything else is treated as a miss. |

---

## Components

### Primitives (`src/lib/components/`)

| Component | File | Props | State owned | Notes |
|---|---|---|---|---|
| `Button` | `Button.svelte` | `variant` (primary / secondary / danger / ghost / link), `size` (sm / md / lg), `type`, `disabled`, `loading`, `title`, `ariaLabel`, `onclick`, `icon` snippet, `children` snippet | — | macOS conventions: primary on right in actions row, danger destructive only. Loading spinner replaces leading icon. |
| `Input` | `Input.svelte` | `value` (`$bindable`), `placeholder`, `type`, `size` (sm / md), `variant` (default / search), `disabled`, `invalid`, `ariaLabel`, `onInput`, `onKeydown`, `leading` / `trailing` snippets | — | `variant="search"` adds magnifying glass + clear-X. Focus ring via `:focus-within`. |
| `Pill` | `Pill.svelte` | `tone` (neutral / formula / cask / success / warning / danger / info / brand), `children` snippet | — | Formula = info blue, Cask = brand amber. |
| `EmptyState` | `EmptyState.svelte` | `title`, `body?`, `icon?` snippet, `cta?` snippet | — | Vertical-center, max-width 360px, per designSystem §7.8. |
| `LoadingState` | `LoadingState.svelte` | `rows` (default 6), `label` (default "Loading…") | — | Skeleton row shimmer, disabled on `prefers-reduced-motion`. |
| `Toast` | `Toast.svelte` | (none — reads `toast` store) | — | Stack bottom-right; auto-dismiss; spring slide-in. |
| `Modal` | `Modal.svelte` | `open`, `title`, `dismissible?`, `onClose?`, `children` snippet, `actions?` snippet | dialog ref | Focus on first focusable on open, primitive focus trap, Esc to close, scrim click to close (when dismissible). |
| `DestructiveConfirm` | `DestructiveConfirm.svelte` | `open`, `title`, `confirmLabel?`, `cancelLabel?`, `confirmVariant?` (danger / primary), `onConfirm`, `onCancel`, `children?` snippet | — | Wraps `Modal`; default focus = Cancel; "primary" variant for additive ops like Restore. |
| `ResizeHandle` | `ResizeHandle.svelte` | `width`, `min`, `max?`, `defaultWidth`, `direction?` ("left"/"right", default "left"), `onChange(next)`, `onCommit(next)`, `label?` | local `dragging` (`$state`), imperative `startX`/`startWidth`/`pendingWidth`/`pointerId`; `dirSign` derived | Vertical splitter for resizing a sibling pane. 6 px hit zone with a 1 px hairline (`--color-border`, brightens to `--color-border-strong` on hover / focus / active drag; `--color-border-focus` on `:focus-visible`). Pointer Events API with `setPointerCapture` so drags survive cursor leaving the handle. `role="separator"` + `aria-orientation="vertical"` + `aria-valuemin`/`aria-valuemax`/`aria-valuenow` + `tabindex="0"`; keyboard: ←/→ ±8 px, Shift+←/→ ±32 px, Home → min, End → max. Double-click resets to `defaultWidth`. `touch-action: none` to suppress native gestures. `onChange` fires live during drag (parent applies but should not persist); `onCommit` fires on pointerup/keyup (parent persists). The two `noninteractive` lints suppressed inline because role=separator is the correct ARIA pattern. |

### Structure / sections

| Component | File | Props | State owned | Notes |
|---|---|---|---|---|
| `Sidebar` | `Sidebar.svelte` | (none — reads `ui`, `packages`, `activity`, `brewfiles` stores) | — | 5 sections (Library/Discover/Trending/Snapshots/Activity), badges (outdated count, snapshots count, running ops), theme tri-toggle (Light/Dark/System), brew status dot. |
| `CommandPalette` | `CommandPalette.svelte` | (none — reads `ui`, `packages`, `search`, `brewfiles`, `trending` stores) | local `query`, `selectedIdx`, input ref | Cmd+K. Groups: Installed → Index → Commands. Arrow keys navigate, Enter activates, Esc closes. Index group debounces `search.run` at 300 ms. |
| `Library` | `Library.svelte` | (none) | local `filter`, `query`, derived `filtered` / `sorted` | Filter chips (All / Formulae / Casks / Outdated), inline search, sticky column header, row click → detail. |
| `PackageRow` | `PackageRow.svelte` | `pkg: Package`, `selected?`, `onSelect?` | local `iconDataUrl`, `iconLoaded` | Grid: **24px icon-slot** / name / version / kind pill / outdated chevron. macOS selection style (filled blue when window-focused). Phase 7 + 8: all rows lazy-load via `iconCache.getIcon(pkg)`; the store routes by `pkg.iconSource` (installed-app extractor → homepage favicon → none). When the resolved data URL is present, render `<img>`; when `iconSource.kind !== "none"` but resolved-null, render a low-opacity 18px Lucide `Package` fallback; when `iconSource.kind === "none"` (formulae + casks with no app artifact AND no homepage), leave the slot empty so the name column stays aligned. `<img>` element (backend returns base64 data URL), `alt=""` (decorative — name is adjacent), no fade-in (instant per designSystem §6). The `Library` `list-header` grid mirrors the column template. |
| `PackageDetail` | `PackageDetail.svelte` | (none — reads `ui.selectedPackage`, `ui.detailPaneWidth`) | local `detail`, `loading`, `error`, `depsOpen`, `dependentsOpen`, `confirmUninstall` | Slide-over right panel; width driven by `ui.detailPaneWidth` (default 420 px) via inline `--detail-pane-width` CSS var on `.detail`, resized by sibling `ResizeHandle` mounted in `+page.svelte`. Long-content blocks (caveats `<pre>`, homepage URL, dependency names, description) use `overflow-wrap: anywhere` + `word-break: break-word`; caveats `<pre>` keeps `white-space: pre-wrap` for newlines plus `overflow-x: auto` as a last-resort scroll for unbreakable tokens. Install / Uninstall / Reinstall / Upgrade actions, Activity drawer auto-opens, toast on success. Homepage link opens via `@tauri-apps/plugin-opener`. Phase 8: meta row "Icon source: installed app / homepage / none" surfaces the resolved `pkg.iconSource.kind` (homepage URL goes in the title tooltip), keeping the transparency narrative loud without claiming a whole section. |
| `Discover` | `Discover.svelte` | (none) | — | Search input bound to `search.query`, recent-search chips, results list grouped (formulae + casks together), installed badge cross-referenced from `packages` store. |
| `Trending` | `Trending.svelte` | (none) | — | Window segmented control (30d / 90d / 365d), refresh button + "Updated N min ago", top-100 list with rank + install count + installed badge. |
| `Snapshots` | `Snapshots.svelte` | (none) | local `newLabel`, `creating`, `showNewModal`, `toDelete`, `toRestore` | Card grid of saved Brewfiles, New Snapshot modal, Restore (additive confirm), Delete (destructive confirm), Export → native save dialog, Import → native open dialog. |
| `ActivityDrawer` | `ActivityDrawer.svelte` | (none — reads `activity`, `ui`) | local `consoleEl`, `autoScroll` | Bottom drawer (Xcode-debug pattern). Header strip with current op + elapsed time + cancel/copy/close. Per-job tabs when >1. Streaming console: monospace, ANSI-stripped, per-line classifier (==> info, Error: red, Downloading green, etc.). Smart autoscroll pause when user scrolls up. |
| `ActivityHistory` | `ActivityHistory.svelte` | (none — reads `activity`) | — | Sidebar "Activity" section view: chronological list of all jobs with status icon + duration; click opens that job in the drawer. "Clear completed" action. |

---

## Routes

| File | Purpose |
|---|---|
| `src/routes/+layout.ts` | `ssr=false` (unchanged from scaffold) |
| `src/routes/+layout.svelte` | Imports `app.css`, calls `ui.loadThemeFromStorage()` and starts `watchSystemTheme()`. Renders children. |
| `src/routes/+page.svelte` | The whole app shell — sidebar + content area + detail panel + bottom drawer + palette + toast layer. Conditional render of one of `<Library / Discover / Trending / Snapshots / ActivityHistory />` based on `ui.section`. Owns global keymap (Cmd+1..5, Cmd+K, Cmd+L, Cmd+R, Cmd+Shift+L, "/", Esc). |

Single-route SPA. No nested SvelteKit routes — sidebar navigation is state, not URL.

---

## Keyboard shortcuts (wired in `+page.svelte`)

| Shortcut | Action |
|---|---|
| `⌘K` | Open Command Palette |
| `⌘1` … `⌘5` | Library / Discover / Trending / Snapshots / Activity |
| `⌘L` | Toggle Activity drawer (expand → minimize → close cycle) |
| `⌘⇧L` | Cycle theme (light → dark → system) |
| `⌘R` | Refresh current view (Library / Trending / Snapshots / Discover-rerun) |
| `/` | Focus the first text input in view (filter / search), unless already in an input |
| `Esc` | Priority: palette → detail (modals handle their own Esc) |

Cmd+W and Cmd+Q are macOS defaults — not intercepted; the OS quits the single-window app, matching the activeContext decision.

---

## Patterns introduced (also recorded in `systemPatterns.md`)

- **Store-class pattern.** Module-singleton class instances with `$state` fields. Imported as `{ packages }` etc.; methods mutate fields directly. Avoids passing context.
- **Typed-`invoke` wrapper.** Every Tauri command wrapped in a one-liner in `api.ts` so call sites import a named function, not a string. Streaming commands take `(evt) => void` callback; channel construction is hidden.
- **Activity-job pattern.** Frontend creates a job *before* invoking (with a tmp UUID), then patches `jobId` on the first `Started` event. This means the drawer is interactive immediately, even before the backend's first event lands.
- **Modal + DestructiveConfirm pattern.** `Modal` is the generic dialog; `DestructiveConfirm` is the opinionated wrapper for "are you sure?". `confirmVariant="primary"` reuses the same UI for additive ops (Restore).
- **In-page slide-over** (PackageDetail) — not a modal, not a separate route. Library remains visible and interactive on its left.
- **Theme application** — `data-theme="dark|light"` on `<html>`, `localStorage` for user pref, matchMedia subscription for `system`. CSS does the rest via OKLCH tokens.
- **`safeOpenUrl` scheme allowlist** — `src/lib/util/url.ts` centralizes the http/https-only check before any `tauri-plugin-opener` call. Every present and future "open this URL in the user's browser" call site goes through `safeOpenUrl(url)` so attacker-influenced metadata (cask `homepage`, future search-result URLs, etc.) can't smuggle `file://` / `vscode://` / `mailto:` past the opener. The rejection path toasts `toast.error(...)` so the user sees why. See systemPatterns §15.
- **Adaptive `aria-live` for streaming console** — `ActivityDrawer` rate-detects line arrivals; >3/sec for >5s flips the log region to `aria-live="off"` to avoid flooding screen readers during noisy installs. A separate sr-only polite live region announces only the completion summary ("Done", "Failed", "Canceled") so SR users still get an exit signal. Reverts to polite after 1.5s of calm. See systemPatterns §16.

---

## Drift from spec

- **Icon library:** switched from `lucide-svelte` (deprecated by upstream) to `@lucide/svelte` (1.16.0). Same project, same imports — purely a rename. Documented in `decisions.md` candidate.
- **No `<DesignSystemPreview>` route** at `/_design`. designSystem.md §10 listed this as a checklist item; deferred to a Wave 4 polish task because every primitive is exercised by the live UI already and we'd rather ship.
- **No vibrancy / no scrollbar styling** — both explicitly Wave-4 polish in designSystem.md §8.
- **Streaming `Channel<T>` race-condition note:** the frontend optimistically creates a local job with a tmp UUID, then patches `jobId` on the first `Started` event. If the backend's first event isn't `Started` (spec says it always is), the tmp UUID remains. Worth a Code Reviewer eyeball.
- **`progress` events** are currently rendered as plain console lines prefixed `[progress]`. Phase 3 polish could use the `percent` field for a real progress bar; left as TODO.

## TODOs for Wave 3 / 4

- `<DesignSystemPreview>` route at `/_design` (Wave 4 polish per designSystem §10).
- Per-row inline `[+ Install]` button in Trending (Phase 6 polish per uxArchitecture §7).
- Description-search variant (`brew_search_desc`) — backend wrapper is in `api.ts` but no UI surfaces it yet.
- Real progress bar from `BrewStreamEvent.Progress.percent`.
- Right-click context menus (out of scope MVP, noted in designSystem §8).
- axe DevTools / Polypane pass to verify the OKLCH contrast claims in real WKWebView.
- Cmd+, preferences popover stub (binding reserved per uxArchitecture §8).

---

*End of inventory. Updated alongside any new component or significant prop change.*
