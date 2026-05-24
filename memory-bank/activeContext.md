# Active Context

**Date:** 2026-05-24 (post-session 2026-05-24-night)
**State:** **v0.1.0 SHIPPED.** Phase 9 + Phase 11 (Dashboard, Services, Disk Usage) **landed in working tree, not yet committed.**

## Repo

- **github.com/msitarzewski/brew-browser** — public, MIT, `main` branch
- **Release:** v0.1.0 live at <https://github.com/msitarzewski/brew-browser/releases/tag/v0.1.0> — signed/notarized `brew-browser_0.1.0_aarch64.dmg` (5.7 MB, sha256 `92a35fec95f20216ce216969f35f2445d180ea1bb0b08b1aaa80a6e0def3d31b`)
- 5 commits to date (sixth pending):
  - `653e26f` feat: initial release — brew-browser v0.1.0 (186 files)
  - `c72e31d` data: initial LLM-generated package categories + landing page
  - `2dad9be` landing: drop Caddyfile snippet, defer config to manual
  - `cb60e4a` build: signed + notarized release pipeline
  - `c2ab41f` memory-bank: NEXT-SESSION handoff doc

## What landed in this session (uncommitted)

### Phase 9a — Discover category tile UI
- `commands/categories.rs` Tauri command + memoised parse, JSON via `include_str!`
- `stores/categories.svelte.ts` with `tiles`, `tokensInCategory`, `categoriesOf` helpers
- `util/categoryIcon.ts` static map for 19 Lucide icons
- Discover.svelte tile grid (sorted by count, uncategorized last)
- 1 new unit test

### Phase 9b — Category linking everywhere
- `stores/discover.svelte.ts` — multi-select `selectedCategories: Set<string>`
- Discover.svelte multi-select chip bar (works on search results AND chip-only browse)
- PackageDetail.svelte — Categories meta row with clickable pills → jump to filtered Discover
- Fixed dangling `installed` pill (row layout split into with-desc / no-desc grids)
- `SortableHeader.svelte` new reusable component
- Library: sortable Name / Version / Type / Outdated + shared category chip filter
- Trending: sortable # / Name / Type / Installs (installs defaults desc)
- Trending Refresh now actually busts the backend cache (`force` flag honoured)
- Fixed list-column shift bug: `1fr` → `minmax(0, 1fr)` everywhere (Discover, Library header, PackageRow, Trending), AND `auto` → `90px` for installed col

### Phase 11 — Dashboard (home view)
- `stores/library.svelte.ts` — Library filter lifted into a store so Dashboard can preset it
- Dashboard.svelte — hero (installed / outdated / brew version) + Updates panel with one-click "Upgrade all" + Composition split + Top-Categories donut chart + Storage card
- Donut: 19-cat palette, top 8 + "Other", center total, clickable legend → Discover
- Storage: 4 paths (Cellar / Caskroom / var/log / Download cache) with `du -sk` in parallel, Open-in-Finder button per row
- Backend: `commands/disk_usage.rs` — `disk_usage`, `disk_usage_clear_cache`, `open_in_finder`; gates Finder reveal to inside Homebrew prefix/cache only
- `tokio::join!` parallel du, 60s cache, `chrono` timestamp
- 2 new tests

### Phase 11b — Services
- `commands/services.rs` — list / clear-cache / start / stop / restart commands
- 5s list cache; auto-invalidated after every action; write-lock around state mutations
- Service-name validation (alphanumeric + `-_+@.`, ≤128 chars) as defense-in-depth
- `stores/services.svelte.ts` with `byName`, `isPending`, `act(name, action)`
- Services.svelte page — sortable Name/Status/User columns + per-row Start/Stop/Restart
- Sidebar 6th item ⌘5 (Activity moves to ⌘6); badge = running-services count
- PackageDetail.svelte — Service card with pill + 3 action buttons when formula has a services entry
- Bootstrap priming in +layout.svelte so sidebar badge populates first paint
- 3 new tests

### Phase 11c — Native macOS feel
- `tauri.conf.json` — `transparent: true`, `titleBarStyle: "Overlay"`, `hiddenTitle: true`
- `Cargo.toml` — `window-vibrancy = "0.6"` (macOS-only target dep)
- `lib.rs` — `apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, …)` in setup
- `app.css` — body background transparent so the vibrancy shows through
- Capability: `core:window:allow-start-dragging` added to default.json
- `data-tauri-drag-region` on sidebar brand wrap + every panel-head; `="false"` on header buttons that opt out
- Brand area is now a button: click → Dashboard (Cmd+0); hover/active states wired

### Phase 11d — Activity persistence
- `stores/activity.svelte.ts` mirrors completed jobs to localStorage (`brew-browser:activity:v1`)
- Cap 50 jobs, 500 lines/job; debounced writes (400ms) + immediate flush on terminal events
- `hydrate()` on +layout.svelte mount; restored "running" jobs reclassify to "canceled"

### Dashboard polish (mid-session fixes)
- Fixed card-clipping + scroll: `.body > * { flex-shrink: 0 }` so flex children keep natural height instead of getting squashed
- Donut replaces broken bar chart (track/fill color collision in dark mode)
- Updates card title is a clickable link → Library with `outdated` filter pre-selected
- "+ N more in Library →" goes there too
- Hero "updates available" stat goes there too

### README update (uncommitted)
- Install section now points to the live v0.1.0 release page instead of "coming soon: brew tap"

## File deltas this session

**Created (12 files):**
- `src-tauri/src/commands/categories.rs`
- `src-tauri/src/commands/disk_usage.rs`
- `src-tauri/src/commands/services.rs`
- `src/lib/components/Dashboard.svelte`
- `src/lib/components/Services.svelte`
- `src/lib/components/SortableHeader.svelte`
- `src/lib/stores/categories.svelte.ts`
- `src/lib/stores/discover.svelte.ts`
- `src/lib/stores/library.svelte.ts`
- `src/lib/stores/services.svelte.ts`
- `src/lib/util/categoryIcon.ts`

**Modified (26 files):** README, activeContext, progress, Cargo.lock, Cargo.toml, capabilities/default.json, commands/mod.rs, lib.rs, state.rs, tauri.conf.json, app.css, api.ts, ActivityHistory, Discover, Library, PackageDetail, PackageRow, Sidebar, Snapshots, Trending, activity store, trending store, ui store, types.ts, +layout, +page

## Tests & lint (current)

- `cargo test`: **210 passed**, 0 failed, 6 ignored (was 204 pre-session)
- `cargo clippy --all-targets -- -D warnings`: clean
- `cargo check`: clean
- `npm run check`: 0 errors, 1 pre-existing tsconfig-node warning
- `npm run build`: clean

## Ideas captured (in `ideas.md`)

- **Recipes** — guided multi-package install flows (deferred from Phase 10)
- **GitHub OAuth (optional)** — Device Flow for "Wrong?" reporting / star / bug-report-with-system-info
- **Liquid Glass / NSVisualEffectView (Phase 9 polish)** — Tier A done in this session; Tier B (true Tahoe Liquid Glass via Swift bridge) deferred to v0.2
- Discovery UI: chip filters DONE; "what's new this week" pulled from cron diff (still pending); per-cask "similar to" (still pending)

## Pending (in new priority order — feeds the Phase 12+ plan)

1. **README + landing release-asset link update** (README done in WT; landing pending)
2. **Phase 12a — Bundled catalog + user-initiated refresh** (formulae.brew.sh JSON, gzipped in binary, manual Refresh button)
3. **Phase 12b — Settings shell** (modal/page, sections for Appearance / Network / GitHub / Brew / Activity / About)
4. **Phase 12c — GitHub anonymous tier** (homepage detection, stars/forks/last-release in PackageDetail, 24h disk cache)
5. **Phase 12d — Settings: network controls + paranoid mode**
6. **Phase 12e — GitHub Device Flow + Keychain token storage**
7. **Phase 12f — GitHub authed actions** (star/issue/watch buttons)
8. **Deprecation warnings** (depends on Phase 12a — needs catalog)
9. **Build-error rates** (depends on Phase 12a — needs catalog + analytics endpoint)
10. **Reverse dependencies** (depends on Phase 12a — needs catalog)
11. **Dependency tree visualization** (depends on Phase 12a)
12. **Recipes core (Phase 10)** — still pending; depends on catalog for validation
13. **"Wrong?" GitHub-issue link** in PackageDetail (depends on Phase 12c/e for in-app file vs deeplink)
14. **Real screenshots** per `visualStory.md`
15. **Categorize cron** on Beast or umbp for daily delta
16. **Address remaining `codeReview.md`** important + nit items
17. **Address remaining `accessibility.md`** important + nit items

## Memory bank inventory

`toc.md`, `projectbrief.md`, `techContext.md`, `decisions.md`, `activeContext.md` (this), `progress.md`, `systemPatterns.md`, `designSystem.md`, `uxArchitecture.md`, `backendApi.md`, `frontendComponents.md`, `codeReview.md`, `apiTests.md`, `accessibility.md`, `visualStory.md`, `security.md`, `ideas.md`, `agentLog.md`, `NEXT-SESSION.md`, `tasks/2026-05/`, `scans/`.
