# Release 0.7.0 / native 0.3.0

**Status:** ✅ SHIPPED 2026-07-15 — `v0.7.0` (Tauri 0.7.0 / native 0.3.0), signed + notarized, both shells, tap cask + feeds live. A same-day follow-up **`v0.7.1` / native 0.3.1** shipped right after (see "0.7.1 follow-up" below).
**Baseline:** 0.6.0 / native 0.2.0 (tag `v0.6.0`).
**Version step:** minor — new user-facing feature (pin/unpin; Bundles to follow). Split-track per [decisions.md](../../decisions.md): Tauri/web (+Linux) `0.6.0 → 0.7.0`, native macOS `0.2.0 → 0.3.0`. Same feature set under two numbers; release notes state the equivalence ("native 0.3.0 ≙ Tauri 0.7.0"). Single git tag `v0.7.0`.

> Directory named `0.7.0` (primary/Tauri version); native carries `0.3.0`.

---

## What's in it (merged to `main` since `v0.6.0`)

Grouped by theme; every item is a merged PR on `main` unless marked.

### Headline feature
- **Pin / unpin packages (#141)** — hold a package back from "Update all", both shells, formulae **and** casks. Closes **#90**, **#134**. Includes the Library panel refresh: **Pinned** filter tab, per-tab counts removed, bottom status bar (leads with the active filter's count), cask-aware `pinnedCount`.

### In-app brew control (pre-session, on main)
- **In-app command options (#109)** — reactive recovery UI (adopt/overwrite/force-remove) + Advanced disclosure (greedy upgrade, autoremove). Addresses #98 (reactive), #47, #13, #102, #100.
- **Doctor + Cleanup (#82, #83)** — `brew doctor` + `brew cleanup --prune=all` on the Storage card; `--scrub` opt-in (default off). Issue #80.

### Vulnerability scanning hardening
- **Exposure parity + GHSA enrichment port (#107)** — native gains `source: live/cache` label + `VulnsEnrich`; fixes the Tauri over-count (`replace_full_scan`); unified card wording.
- **Vuln scan tap-names + JSON salvage (#103)** — #62/#92: accept tap-qualified formula names, salvage JSON from banner noise. + Homebrew-analytics privacy env.
- **Native catalog empty-response guard (#108)** — parity with #101.
- **GHSA advisory `references` shape (#110)** — ✅ merged 2026-07-12. Repairs enrichment (references are a string array, not `[{url}]`; was a silent no-op). Verified end-to-end (live fetch = `Some` with 9 refs).

### UX / correctness fixes (this session)
- **Native list scales, no sidebar clip (#142)** — content-column min widths fit the 420pt floor.
- **Install-trend sparkline scale (#143)** — stop mixing `count30d` (cumulative) with `estimatedDailyInstalls` (daily); kills the cliff artifact. Both shells.
- **Tauri vulnerable-footer nav (#144)** — footer jumps to Library → Vulnerable (was Dashboard). Parity.
- **Native outdated tap-name undercount (#145)** — tap-installed outdated packages were dropped from the Outdated filter (Swift 8 vs Tauri 9); normalized via `bareToken`. Same tap-name class as #92.

### Community / upstream
- **Catalog reject-empty-response (#101, @Arvuno)** — reviewed + merged.

### Report hygiene + docs
- **Report-button brew-vs-app gating (#91)** — the report button shows only for genuine app errors, stopping misfiled `[brew-browser] X failed` issues at the source.
- Docs: #94 (memory-bank session), #93 (landing favicon), #86 (tap-trust install docs), #84 (credit @modeezie), #77 (version-wrap + native release tooling).

---

## Headline feature — Bundles / Recipes (BUILT + refined 2026-07-13)
Curated **one-click package stacks** with post-install setup guidance, **capability-gated** by a zero-install system profile (RAM/arch/GPU/disk) so an 8GB Mac isn't told to install a local-LLM stack it can't run. "Bundles" nav section; brew-native install auto-runs, external steps (model pulls, etc.) are copy-paste. Both shells. **Contributor-friendly:** recipes are validated JSON files anyone can PR against a published contract.

**Plan docs (2026-07-12):** overview in **[bundles-plan.md](./bundles-plan.md)**; contributor contract + July-2026 capability baselines + 5 milestone build docs under **[`bundles/`](./bundles/)**:
- [recipe-contract.md](./bundles/recipe-contract.md) · [capability-baselines.md](./bundles/capability-baselines.md)
- M1 [capability-engine](./bundles/m1-capability-engine.md) → M2 [contract-and-loader](./bundles/m2-recipe-contract-and-loader.md) → M3 [browse-and-install](./bundles/m3-browse-and-install.md) → M4 [setup-guidance](./bundles/m4-setup-guidance.md) → M5 [live-refresh-and-contributions](./bundles/m5-live-refresh-and-contributions.md)

**Post-M5 refinement (2026-07-13, this session, both shells):**
- **List + Details pane** — Bundles moved from a card-grid + modal to the app's canonical master-list + right-side Details pane (matches Library/Trending exactly: no auto-select, pane closed on entry, ✕/section-switch closes). Tauri = shell-level resizable `<aside>` reusing `detailPaneWidth`; native = the stock `.inspector`.
- **Recipe set 6 → 9** (all tokens `brew info`-verified, **zero third-party taps**): Local LLMs (`ollama`+`open-webui`), **Image Gen** (`draw-things`+`comfy`), Graphics (`inkscape`/`gimp`/`krita`), **Media** (`ffmpeg`/`yt-dlp`/`mpv`/`handbrake`), **Web Dev Starter** (`node`/`pnpm`/`git`/`gh`), **Local Databases** (`postgresql@16`/`redis`/`tableplus`/`dbeaver-community`), **Agentic Web Dev** (`opencode`/`zed`/`node`/`pnpm`/`git`/`caddy`/`orbstack`), **LAMP** (`httpd`/`mysql`/`php`), **LEMP** (`nginx`/`mariadb`/`php`). opencode is now first-class in homebrew/core.
- **New `description` field** (intent paragraph) in the recipe contract (schema + validator + both docs), rendered under the tagline. NOTE: the Tauri path serves bundles *through Rust* — `description` had to be added to the Rust `Bundle` struct (`src-tauri/src/types.rs`) or serde silently drops it; a regression test now guards the round-trip.
- **Readiness dedup** — header pill is the sole verdict; body shows a color-coded reason callout only for marginal/blocked (killed the redundant "Ready / Ready.").
- **Clickable inline package descriptions** — each package row is a disclosure that lazy-fetches its one-line desc (catalog first, brew-info fallback), cached, multiple-open.
- **Per-package Install** — "Not installed" is now an inline **Install** action (single package, reuses the streamed install path, keeps the pane open, row flips to Installed); Install click isolated from the description toggle.
- Bundle icons: added `server` (LAMP/LEMP) + `agentic` (fixed a Tauri parity gap where it fell back to the generic glyph).
- Gate: recipes 9/9 · native `swift build` + 195 tests · Rust bundle tests 9/9 · Tauri svelte-check 0 / vitest 57.
- Community can PR the long tail (Rails/Django/MEAN — note Mongo needs the `mongodb/brew` tap) against the contract.

---

## Release checklist (all gated to the user)
- [x] Merge **#110** (GHSA references) into `main`. ✅ 2026-07-12 (main `6799e98`).
- [x] Decide: **Bundles rides THIS release** (0.7.0/0.3.0), plan complete → `bundles/`. ✅ 2026-07-12.
- [x] Build Bundles **M1–M5, both shells** (branch `feat/bundles`, 2026-07-13): capability engine, recipe contract + validator, browse/install UI, setup guidance, CI + CONTRIBUTING, **and the M5 live-refresh client**. Both apps launch clean with the Bundles section; no unresolved TODOs in new code.
- [x] **Post-M5 refinement (2026-07-13):** list+Details-pane refactor, recipe set 6→9 (Agentic Web Dev + LAMP + LEMP; expanded Image Gen/Media/Web Dev/Databases), `description` intent field (incl. Rust-struct round-trip fix), readiness dedup, clickable inline package descriptions, per-package Install. Gate: recipes 9/9 · native swift build + 195 tests · Rust bundle tests 9/9 · Tauri svelte-check 0 / vitest 57. See the Bundles section above.
- [x] **Serve the live-refresh endpoint**: `bundles.json` served at `<host>/bundles/bundles.json` (endpoint live, schemaVersion 1). ✅ 2026-07-15.
- [x] Version bumps → `0.7.0` / native `0.3.0` (then `0.7.1` / `0.3.1` for the follow-up). Docs consistent. ✅
- [x] Live-verify on main (user screenshots): Bundles list+detail, readiness, per-package install, pin/unpin, etc. ✅
- [x] Build + notarize both shells — Tauri arm64+x64 dmgs + updater `.app.tar.gz`; native arm64+x64 dmgs + Sparkle appcast. All 4 dmgs Gatekeeper-accepted. ✅ 2026-07-15.
- [x] `gh release create v0.7.0` (6 assets + notes). ✅ [releases/tag/v0.7.0](https://github.com/msitarzewski/brew-browser/releases/tag/v0.7.0).
- [x] rsync feeds to host: `updater.json` (both arches) + Sparkle `appcast.xml`. ✅
- [x] **Tap cask bump** (`msitarzewski/homebrew-brew-browser`): bumped to **0.7.1** (it was stuck at 0.6.0; the 0.7.0 bump was folded into the 0.7.1 publish). ✅
- [x] Close issues **#90 / #134 / #62 / #92** — all closed. ✅

## 0.7.1 follow-up (SHIPPED 2026-07-15, tag `v0.7.1` / native 0.3.1)
Same-day patch release. **Notes: [../0.7.1 → docs/release-notes/0.7.1.md](../../../docs/release-notes/0.7.1.md).**
- **Resizable Activity console** (#136, community @cseelye) — merged to main *after* the 0.7.0 build was cut, so it shipped here. Both shells; drawer height persists.
- **Linux CI fix** (#149) — the Linux workflow was failing at updater-artifact signing (no `TAURI_SIGNING_PRIVATE_KEY` on CI) *after* building `.deb`/`.rpm`/`.AppImage`, so no Linux artifacts on any tagged release (v0.6.0/v0.7.0 both red). Fix: `--config '{"bundle":{"createUpdaterArtifacts":false}}'` for the Linux build only (Linux auto-updater is unwired). v0.7.1 tag CI is the first green Linux run.
- **⚠️ LESSON:** I listed the resizable console in the 0.7.0 notes as *shipped* when it had only been *reconciled + test-merged* (a throwaway branch, green 199 tests) — never actually merged to main / never in the 0.7.0 build. **Don't mark a PR "shipped" until it's on main AND in the built artifact.** 0.7.1 corrected the 0.7.0 notes (de-listed it) and shipped it for real. Same trap as treating "mergeable/ready" as "merged".
- Gate: Tauri svelte-check 0 / vitest 57 · native swift build + 199 tests · all 4 dmgs notarized. Published via one `!`-run script (release + feeds + tap bump), gh operations gated to the user (auto-mode classifier blocks agent-run `gh release create` / rsync / community-PR merge — see [[project-resume-state]] permission notes).

## Open threads / housekeeping
- **Stale local branches**: many old `release/*`, `docs/*`, merged `feat/*` branches linger locally (not on `main`). Prune candidate — confirm with user first.
- **Deferred** (from 0.6.x): #98 proactive Adopt Discovery; Recent-Changes Dashboard card decision; server-side precomputed sparkline may share the #143 count30d issue (pipeline fix on host, not this repo); clippy nits.

---

*Created 2026-07-12. `main` @ `fe73804` (clean, synced with origin).*
