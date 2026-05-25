# brew-browser — Plan

**Date:** 2026-05-23
**Author:** Michael (with Claude)
**Goal:** Ship a small, fast, native macOS GUI for Homebrew. Browse installed packages, search the full catalog, install / uninstall / upgrade with live output, snapshot to a Brewfile and restore on a new Mac. MIT-licensed, full source, no telemetry.

## Provenance & ethics

- **Fresh implementation.** This is not derived from or inspired by any specific other project. Both brew-browser and `brew` itself are open source; any similarity in behavior is convergent — both projects are wrappers around the `brew` CLI.
- **Descriptive name.** "brew-browser" describes what the app does.

## Vision

> A native-feel macOS app that lets you browse, search, install, uninstall, upgrade, and snapshot Homebrew packages, with full source code under MIT, no telemetry, no accounts.

## Scope — MVP

**In scope:**
1. List installed formulae + casks (read `brew list --json=v2`)
2. Search Homebrew package index (`brew search <query>`)
3. Show package detail (description, version, dependencies — `brew info --json=v2`)
4. Install / Uninstall / Upgrade with live streaming output
5. **Snapshot (export):** `brew bundle dump --file=<path>` → save a `Brewfile`
6. **Restore (import):** `brew bundle install --file=<path>` → install a `Brewfile`
7. List of saved Brewfiles with create/restore/delete
8. **Trending packages tab** — fetch `https://formulae.brew.sh/api/analytics/install/30d.json`, display top-N by install count. Real Homebrew-maintained analytics; no scraping; sortable. *(Added 2026-05-23 per spec update.)*

**Explicitly out of scope (MVP):**
- App settings / preferences (`Brewfile` is the snapshot; we're not capturing per-app config files)
- Windows/Linux support (brew runs on Linux but Mac-first for demo)
- Auto-update / signed-DMG distribution (manual `cargo tauri build` for now)
- Multi-tap management beyond what brew already shows
- Category browsing / curated "App Store" sections
- App icons in package list (would require resolving cask metadata; nice-to-have)

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Shell | **Tauri 2.x** | Smallest native footprint, system webview, real macOS app bundle |
| Frontend | **SvelteKit + Svelte 5 + TypeScript** | Already scaffolded; SPA mode via `adapter-static` |
| Styling | TBD — Tailwind v4 or plain CSS | Pick during Phase 1 based on actual layout needs |
| Backend | **Rust (Tauri commands)** | Shell out to `brew`, return typed JSON to frontend |
| Inference of brew | **`brew` CLI itself** | We do NOT reimplement Homebrew logic. We're a respectful frontend. |
| Analytics for trending | **`formulae.brew.sh` JSON API** | Official Homebrew-maintained, no key required |
| License | **MIT** (locked 2026-05-23) | Most permissive and most recognizable OSI license; lowest contributor friction (no CLA needed); user retains copyright so monetization options (paid binaries, App Store, support) remain open. |
| Distribution | **`cargo tauri build` → unsigned `.dmg`** for demo; eventual `brew tap` if published | |

## Architecture sketch

```
┌────────────────────────────────────────┐
│  Svelte frontend (in WKWebView)        │
│  - PackageList (formulae + casks)      │
│  - SearchBar                           │
│  - PackageDetail panel                 │
│  - ActionConsole (streams stdout)      │
│  - BrewfileManager                     │
│  - TrendingTab                         │
└──────────────┬─────────────────────────┘
               │ invoke('brew_list'), etc. (Tauri IPC)
┌──────────────▼─────────────────────────┐
│  Rust backend (Tauri commands)         │
│  - brew_list() -> PackageList          │
│  - brew_search(q) -> Vec<PackageHit>   │
│  - brew_info(name) -> PackageDetail    │
│  - brew_install/uninstall/upgrade()    │
│      (streams via event channel)       │
│  - brew_bundle_dump(path)              │
│  - brew_bundle_install(path)           │
│  - list_brewfiles() -> Vec<Brewfile>   │
│  - fetch_trending(window) -> ...       │
└──────────────┬─────────────────────────┘
               │ Command::new("brew") + reqwest
┌──────────────▼─────────────────────────┐
│  brew CLI (Homebrew itself)            │
│  formulae.brew.sh/api/analytics/...    │
└────────────────────────────────────────┘
```

## Steps

### Phase 0 — Scaffold ✅ DONE 2026-05-23
- `npm create tauri-app@latest . -m npm -t svelte-ts --identifier dev.openbrew.browser -y -f --tauri-version 2`
- Renamed productName/Cargo package/package.json to `brew-browser`
- Replaced default README with the product README
- `cargo check` clean

### Phase 1 — Read-only Homebrew browser
- Rust: `brew_list()` command → exec `brew list --formula --json=v2` + `--cask --json=v2`, parse, return
- Svelte: `<PackageList>` showing installed packages, formula/cask toggle, basic search filter
- Rust: `brew_info(name)` command
- Svelte: `<PackageDetail>` panel on click

### Phase 2 — Search the index
- Rust: `brew_search(query)` → exec `brew search <query>`, parse stdout
- Svelte: search-mode toggle (installed vs. all-of-homebrew)

### Phase 3 — Actions with streaming
- Rust: `brew_install/uninstall/upgrade()` using `tokio::process` with stdout/stderr forwarded to Tauri event channel
- Svelte: `<ActionConsole>` subscribes to event channel, live output, confirm-destructive-actions
- Refresh list after action completes

### Phase 4 — Brewfile snapshot/restore
- Rust: `brew_bundle_dump(path)` and `brew_bundle_install(path)`
- Svelte: `<BrewfileManager>` — list of saved files in `~/Library/Application Support/brew-browser/brewfiles/`, create/restore/delete/export
- "Set up new Mac" affordance with pre-flight check

### Phase 5 — Demo polish + build artifact
- Placeholder app icon
- README polish: screenshot, what it does/doesn't, MIT badge, open-source posture block
- CONTRIBUTING.md skeleton
- `cargo tauri build` produces a working .dmg

### Phase 6 — Trending tab (per spec update 2026-05-23)
- Rust: `fetch_trending(window: "30d" | "90d" | "365d")` → reqwest HTTP GET to `formulae.brew.sh/api/analytics/install/<window>.json`
- Svelte: `<TrendingTab>` — sortable list of top-N packages by install count, click-to-install affordance
- Cache for ~1h in memory (don't hammer formulae.brew.sh)

## Reuse strategy

- **Don't** reimplement `brew search` / install logic — shell out
- **Don't** parse `brew` output formats — use `--json=v2` everywhere available
- **Don't** invent a snapshot format — use `Brewfile` (Homebrew's own)
- **Don't** build auth / accounts / cloud sync (anti-feature)
- **Don't** scrape — use `formulae.brew.sh` JSON APIs that Homebrew itself publishes

## Risks

| Risk | Mitigation |
|------|-----------|
| Tauri CLI install hits Xcode CLT issues | Beast has dev setup; rustc/cargo confirmed; ✅ `cargo check` passed |
| `brew search` is slow on first call | Loading state; cache results for the session |
| `brew install` of a cask requires sudo/prompts | Surface stdout/stderr verbatim; document the limitation |
| User actions could break their brew state | Confirm dialogs for destructive ops; output is always visible |
| Concurrent brew invocations may conflict | Serialize via Rust `tokio::sync::Mutex` |
| `brew bundle dump` runs slow on machines with many casks | Progress spinner; warn on first run |
| Tauri sandbox blocks shell execution | Explicit allowlist in `tauri.conf.json` for `brew` |
| `formulae.brew.sh` rate-limits trending requests | Cache in memory ~1h; respect any 429 |

## Tests

- **Manual smoke test in dev mode:**
  - List view loads installed packages
  - Search returns results
  - Click a package → detail panel populated
  - Install a tiny test formula (e.g., `tree`)
  - Uninstall the same
  - Dump a Brewfile, inspect, restore from it (no-op since nothing changed)
  - Trending tab loads top 20 packages, install count visible
- **Build test:** `cargo tauri build` produces a working `.dmg`, opens, runs

## Open-source posture

The README must make these visible above the fold:
- **MIT License** badge
- **Source code is right here** (link to `src/`, `src-tauri/`)
- **No EULA, no telemetry, no account required**
- **`brew tap` distribution available** but `cargo tauri build` works for anyone who wants to build from source
- **Contributions welcome** — `CONTRIBUTING.md`, issue templates

## Definition of done (for the demo)

- [x] Phase 0 — Scaffold + LICENSE + README + cargo check passes
- [ ] Phase 1 — Read-only browser
- [ ] Phase 2 — Search
- [ ] Phase 3 — Install/uninstall/upgrade
- [ ] Phase 4 — Brewfile snapshot/restore
- [ ] Phase 5 — Polish + build artifact
- [ ] Phase 6 — Trending tab
- [ ] Repo ready to push to GitHub when you say go

## What this is NOT

- Not a Homebrew replacement
- Not a long-running product — a focused MVP that can be polished later
- Not optimized for million-package scale; designed for individual user libraries (~50-500 packages)
