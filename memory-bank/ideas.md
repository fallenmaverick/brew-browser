# Ideas Backlog

Captured during session; not yet scoped or scheduled. Sorted by user enthusiasm, not difficulty.

## High signal — worth scoping properly

### Recipes — guided multi-package install flows

User-described: *"Like recipes: 'Want to set up local inference? Let's do a quick machine specs run to see what you can do! Here's what can do, and how.'"*

Shape:
- A small library of curated "scenario → package set" recipes (local-inference, web-dev-mac, podcast-editing, ml-research, etc.)
- Each recipe: name, narrative blurb, optional pre-flight checks (RAM ≥ N, free disk ≥ N, GPU ≥ X, macOS version), then a curated list of `formulae` + `casks` to install in order, with per-step explanations
- Pre-flight runs locally (no network) using existing host probes — `sysctl hw.memsize`, `df -h`, `system_profiler SPDisplaysDataType`, `sw_vers`
- Renders as a Library-style detail view with an "Apply recipe" button that streams through the install queue (reuses Activity drawer pattern)
- Stored as YAML/JSON in `src-tauri/data/recipes/<recipe-id>.yaml`, bundled at build time, contributor-friendly (PRs add recipes)
- Same "Wrong?" GitHub-issue link for recipe improvements

Why it lands: the user's framing is exactly what's missing from `brew install` UX today — Homebrew is a package manager, recipes are *workflows*. Maps cleanly onto already-built primitives (install streaming, snapshot/restore, categories).

### GitHub sign-in (optional)

Optional GitHub OAuth. Once signed in:
- "Wrong?" categorization link can post issues directly without opening browser
- "Star this repo" affordance for upstream visibility
- Bug-report button pre-fills issue with system info (OS version, brew version, app version)
- "What recipes have I run" history could sync as a gist (opt-in)

Posture: **strictly optional, no nag, no required.** Per project values: no accounts, no telemetry. OAuth has to feel like a power-user shortcut, not a gate.

Implementation: GitHub OAuth Device Flow (no client secret, designed for desktop apps). Tauri has community plugins; or roll a tiny implementation since the flow is ~50 lines.

## Lower-touch ideas (from the Discover-UI discussion)

- App icon thumbnails inside category tiles (top-3 popular per category, visual variety)
- "Recommended for you" tile based on your installed-cask mix (LLM at build time on a popular subset)
- Search within a single category
- Multi-select categories (intersection: "AI ∩ Developer Tools")
- Saved searches / pinned categories
- "What's new this week" surfaced via the cron diff (the categorize tool already tracks adds/removes)
- Per-cask "Similar to" suggestions (LLM at build time, pairs)

## Phase 9 candidates (close to ready)

- **Category-aware UI everywhere:** chip filters on Library + Trending, not just Discover
- **Per-package "Wrong?" link:** GitHub-issue deeplink with prefilled title + body (template documented in `decisions.md`)
- **Recipes core:** ship 5 recipes (local-inference, web-dev, podcast-edit, ml-research, system-utilities-bundle) with the apply-and-stream flow

## Phase 10+ candidates

- GitHub OAuth Device Flow + optional sign-in
- Recipe contributor docs + a few community-contributed recipes
- App icon thumbnails in tiles
- "What's new" tab driven by the cron diff
- Multi-select category intersection
- Per-cask LLM-generated "similar" suggestions

## Honest no (at least for now)

- Cloud sync of any kind — breaks the no-accounts posture
- A "BrewBucks" tier — there is no tier
- Built-in payments for paid casks (not how brew works)
- Custom URL-scheme handlers (brew-browser://...) — surface area, no clear win
