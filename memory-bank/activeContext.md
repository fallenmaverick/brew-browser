# Active Context

**Date:** 2026-05-24
**State:** All 8 phases shipped, security audit READY-FOR-SCRUTINY, categorize tool built and bulk-running against Claude Haiku 4.5, repo prep underway.

## Right now

- **Bulk categorize run cooking in background** — Claude Haiku 4.5, full 16,028 packages, ~19 min wall, ~$1.50. Started ~2026-05-24T04:43Z. Will write `src-tauri/data/categories.json`. Notification on completion.
- **Repo about to be initialized** — `git init` + first commit + push to `msitarzewski/brew-browser` on GitHub.

## What's in the build

| Phase | Status |
|-------|--------|
| 0 — Scaffold | ✅ |
| 1 — Library (read-only) | ✅ |
| 2 — Discover (search) | ✅ |
| 3 — Install/Uninstall/Upgrade w/ streaming | ✅ |
| 4 — Snapshots (Brewfile dump/install) | ✅ |
| 5 — Polish + `.dmg` build artifact | ✅ |
| 6 — Trending tab | ✅ |
| 7 — Cask icons (installed extraction) | ✅ |
| 8 — Cask icons (homepage cascade for uninstalled) | ✅ |
| Security — full audit + fix-pass + tool battery + re-audit | ✅ READY-FOR-SCRUTINY |
| Reframe — counter-narrative dropped from all docs | ✅ |
| Categorize tool — `tools/categorize/` | ✅ Built, bulk run in flight |

## Categorize tool in place

`tools/categorize/` — Python script, runs offline against Anthropic or OpenAI. Default Claude Haiku 4.5. Diff-based (only re-categorizes new + desc-changed tokens). State in `tools/categorize/state/last-tokens.json`. Output in `src-tauri/data/categories.json` (~150 KB for 16K items). API key in `tools/categorize/.env` (gitignored).

Sample categorization quality (Stage 2, 500 items):
- 100% parse rate
- Avg 1.17 categories per item (conservative, multi-label where genuinely cross-cutting)
- 3.6% honestly uncategorized (obscure tools where desc is insufficient)
- Category distribution looks healthy

## Ideas backlog (from user, captured in `ideas.md`)

- **Recipes** — "Want to set up local inference? Let's check your specs, here's what fits." Multi-package guided install flows. Hot.
- **GitHub OAuth (optional)** — power-user shortcut for "Wrong?" reporting + star + bug-report-with-context. Strictly optional, no nag.
- Plus the discovery-UI surface ideas (chip filters across Library/Trending too, recipe gallery, etc.).

## Memory bank inventory (current)

`toc.md`, `projectbrief.md`, `techContext.md`, `decisions.md`, `activeContext.md` (this file), `progress.md`, `systemPatterns.md`, `designSystem.md`, `uxArchitecture.md`, `backendApi.md`, `frontendComponents.md`, `codeReview.md`, `apiTests.md`, `accessibility.md`, `visualStory.md`, `security.md`, `ideas.md` (new), `agentLog.md`, `tasks/2026-05/`, `scans/`.

## Repo state at first commit

| Tracked | Sample size |
|---------|-------------|
| Source code | 22 Rust + 36+ Svelte/TS + 4 CSS |
| Memory bank | 18 markdown files |
| Security scans (evidence) | osv-scanner, gitleaks, semgrep, clippy, geiger, cargo-deny, CycloneDX SBOM |
| Tooling | `tools/categorize/` Python + prompts + README |
| Docs | README, CONTRIBUTING, SECURITY, LICENSE, PLAN |
| Icons | brew-browser.svg master + Tauri-minted set in `src-tauri/icons/` |
| Tests | 204 Rust unit + 6 integration fixtures |

| Gitignored |
|------------|
| `target/`, `src-tauri/target/` (Rust build artifacts, ~8 GB) |
| `node_modules/` |
| `build/`, `.svelte-kit/` (frontend build output) |
| `tools/categorize/.env` (API key) |
| `tools/categorize/state/` (run state) |
| `docs/icon/preview-*.png` (rasterized previews — regenerable from SVG) |
| OS noise (`.DS_Store`, `*.log`) |
