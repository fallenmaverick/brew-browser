# Project Brief

## Mission

Ship a native macOS GUI for Homebrew: browse installed formulae and casks, search the full catalog, install / uninstall / upgrade with live output, snapshot the setup to a Brewfile and restore it on a new Mac. MIT-licensed, full source, no telemetry, no accounts, no dark patterns.

## Why now

Homebrew is the standard package manager on macOS, and the CLI experience is excellent — but a real native GUI lowers the bar for browsing what's installed, finding what to install next, and moving a setup between machines. brew-browser fills that slot with a small, fast Tauri 2 app that shells out to `brew` for every action and stays out of the way otherwise.

## Audience

- Mac users who want a GUI on top of Homebrew
- Developers looking for a reference implementation of a Tauri 2 + Svelte 5 + Rust app that shells out to system tools
- Anyone who wants to inspect, build, or fork the source

## Success criteria (demo level)

- All 6 MVP features work end-to-end on Beast (M5 Max, macOS Tahoe 26.5)
- Openness is stated clearly: MIT, full source, no EULA, no CLA, no telemetry
- README explains "why this exists" in one paragraph a new reader can immediately get
- `cargo tauri build` produces a working `.dmg` anyone can install

## Non-goals

- Not a Homebrew replacement
- Not a long-running product — focused MVP that can be polished later
- Not optimized for million-package scale (designed for ~50-500 packages per user)
- Not multi-platform for MVP (macOS-first; brew runs on Linux but Linux is out of scope)

## Constraints

- **Fresh implementation.** Not derived from or inspired by any specific other project. Convergent functionality (anything else that wraps `brew`) is fine; copying UI or code is not.
- **License: MIT.** Locked. Most permissive and most recognizable OSI license; no CLA needed; contributor retains copyright on own contributions for future monetization optionality.
- **No telemetry. No accounts. No surprise network calls.** Outbound traffic is limited to four documented paths: (a) `formulae.brew.sh` for Trending analytics, (b) whatever `brew` itself does during install/upgrade/search, (c) per-cask homepage probes for icon discovery on uninstalled casks in Discover/Trending (apple-touch-icon → og:image → favicon cascade, cached 7 days, SSRF-filtered against private/link-local/cloud-metadata IPs), and (d) the user's default browser when the homepage button is clicked. See `memory-bank/security.md` §5 for the line-by-line verification and `README.md` for the user-facing disclosure.
- **No reinventing brew.** brew-browser is a respectful UI over the `brew` CLI. It does not parse formula files, does not manage taps, does not compute dependencies — `brew` does all of that.
