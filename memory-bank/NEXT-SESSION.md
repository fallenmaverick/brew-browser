# NEXT-SESSION handoff — read this first

**Date written:** 2026-05-24 (late session, post-Phase-11)
**Session lead:** Claude Opus 4.7 (1M context) with Michael

If you're a fresh session (or future-me after a /compact), read this first, then `activeContext.md`, then `progress.md`, then `phase12-plan.md`. They tell you everything that's been built. This file just tells you where we are and what's next.

---

## Current state (2026-05-24)

- **v0.1.0 released** — signed/notarized .dmg live at <https://github.com/msitarzewski/brew-browser/releases/tag/v0.1.0>
- **Phase 9 + Phase 11 fully landed** in working tree, **committed** in commit cluster following this update
- 210 tests passing, clippy clean with `-D warnings`, frontend type-check clean
- App now has: Dashboard (default landing), Services, Storage view, donut chart, category links everywhere, native vibrancy, Activity persistence, sortable lists

## What's next: Phase 12

See `memory-bank/phase12-plan.md` for the full task graph. Three waves of parallel agent work:

**Wave 1 (parallel):**
- 12a — Bundled catalog + manual refresh (Backend Architect)
- 12b — Settings shell (Frontend Developer)

**Wave 2 (parallel, after Wave 1):**
- 12c backend — GitHub anonymous repo stats (Backend Architect)
- 12c+12d frontend — GitHub stats in PackageDetail + Settings network controls + paranoid mode (Frontend Developer)
- 12e — GitHub Device Flow + Keychain (Backend Architect)

**Wave 3 (after Wave 2):**
- 12f — GitHub authed actions: star/issue/watch + Wrong? + Dashboard personal stats (Frontend Developer)

**Concurrent across waves:**
- Security Engineer: review network surface, paranoid-mode gates, Keychain perms
- Technical Writer: README + memory bank updates as each wave lands
- Code Reviewer: final pass before each commit

## Open items not in Phase 12

- Recipes (Phase 10) — paused; depends on catalog so Phase 13+
- `installedAt` on Package + Last-Updated sort — small standalone backend addition
- Tier B Tahoe Liquid Glass (Swift bridge) — v0.2
- Real screenshots per `visualStory.md`
- Categorize cron on Beast or umbp
- "Wrong?" GitHub issue link — folded into 12f as the in-app/deeplink dual mode

## Credentials / paths reference

| What | Where |
|------|-------|
| Repo on disk | `/Users/michael/Clean/brew-browser/` |
| GitHub repo | `github.com/msitarzewski/brew-browser` |
| Anthropic API key (categorize tool) | `tools/categorize/.env` (gitignored) |
| Apple signing env | `~/.config/brew-browser/signing.env` (chmod 600, outside repo) |
| Signed .dmg artifact | `src-tauri/target/release/bundle/dmg/brew-browser_0.1.0_aarch64.dmg` |
| Landing page | `brew-browser.zerologic.com` (Caddy on umbp, user-managed) |
| umbp Tailnet IP | `100.98.187.7` |

## Phase 12 setup notes

- **Phase 12a — catalog fetch:** before first run, execute `python tools/catalog/fetch.py` to download `formula.json` + `cask.json`, gzip them, write to `src-tauri/data/catalog/`. ~10 MB raw, ~3 MB gzipped.
- **Phase 12e — GitHub OAuth:** user (Michael) must create a GitHub OAuth App with Device Flow enabled. Get the `client_id`, commit it in source (Device Flow client_ids aren't secret). Without this, the sign-in flow won't work — but everything else still works (anonymous tier from 12c is the default).

## Security note (still valid from previous session)

The Anthropic API key in `tools/categorize/.env` and the app-specific Apple password in `~/.config/brew-browser/signing.env` are valid and live. If this conversation transcript is ever shared publicly, both should be regenerated:
- Anthropic: console.anthropic.com → API keys
- Apple: appleid.apple.com → Sign-In and Security → App-Specific Passwords
