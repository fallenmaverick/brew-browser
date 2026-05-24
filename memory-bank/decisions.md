# Architectural Decisions

## 2026-05-23: MIT License

**Context:** Need an OSI-approved license for an open-source macOS GUI utility. Considered GPL (copyleft, prevents closed forks, dual-license option), AGPL (network-services clause, irrelevant for a desktop app), and source-available licenses (FSL/BSL — not OSI-approved).

**Decision:** MIT.

**Rationale:**
- Most permissive and most recognizable OSI license — clearest "use this however you want" signal
- Lowest friction for a contributor-friendly small utility: no CLA needed, no copyleft compliance overhead for downstream users
- Contributor retains copyright on own contributions, so monetization options (paid binaries, App Store, support, dual-license) remain open
- Matches the dependency stack (Tauri MIT/Apache, Svelte MIT, reqwest MIT/Apache) so there are no license-compatibility seams

**Trade-off accepted:** Anyone can fork and ship a closed derivative. For a small utility this is fine; the value is in the live project, not the license clause.

---

## 2026-05-23: Tauri 2 over Electron / Flutter / GPUI

**Context:** Need cross-platform desktop framework. Electron is the historical default but heavy. Flutter renders everything custom. GPUI (Zed's) is pre-1.0 and Zed-coupled. Tauri 2 ships a native webview, ~8 MB bundles, supports mobile.

**Decision:** Tauri 2 + SvelteKit + Svelte 5 + TypeScript.

**Rationale:**
- Smallest binary footprint, fastest cold start
- Web-developer ergonomics for the UI (Svelte 5 = minimal ceremony, fast HMR)
- Rust backend is appropriate for shelling out to `brew` safely
- Tauri 2's iOS/Android support keeps a mobile path open without re-platforming

---

## 2026-05-23: Shell out to `brew`, don't reimplement

**Context:** Could reimplement Homebrew operations directly (parse formula files, manage downloads, etc.) or shell out to the `brew` CLI.

**Decision:** Shell out exclusively. Use `--json=v2` output formats wherever available.

**Rationale:**
- `brew` is the source of truth; reimplementing duplicates state and creates drift
- `--json=v2` outputs are stable contracts
- A respectful UI on top of `brew` is the right scope for this project

---

## 2026-05-23: Trending data from `formulae.brew.sh`

**Context:** Need data source for "trending packages" tab. Options: scraping web pages, building our own analytics, using Homebrew's published analytics.

**Decision:** Use `https://formulae.brew.sh/api/analytics/install/<window>.json` — Homebrew's own published analytics, no auth required, no scraping.

**Rationale:**
- Authoritative source; no reverse-engineering or scraping
- No keys, no rate-limit-as-product
- Cache in memory ~1 hour to be a polite client
- Keeps brew-browser a respectful frontend on top of Homebrew-owned data

---

## 2026-05-23: Serialize brew invocations with a Mutex

**Context:** `brew` does not tolerate concurrent operations against its own state (lockfile collisions, partial installs). UI could trigger overlapping commands.

**Decision:** Wrap all `brew` invocations in a single `tokio::sync::Mutex<()>` held in Tauri managed state.

**Rationale:**
- Prevents data corruption with zero user-visible cost (queue and show queue state)
- Implementation is ~10 LOC
- Future: per-command-class mutex if read-only ops (`list`, `info`, `search`) should run in parallel with writes
