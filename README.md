# brew-browser

> A native macOS GUI for Homebrew.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built with Tauri 2](https://img.shields.io/badge/Built%20with-Tauri%202-orange)](https://tauri.app)
[![macOS 13+](https://img.shields.io/badge/macOS-13%2B-lightgrey)](https://www.apple.com/macos)

A small, fast desktop app for browsing, searching, installing, and snapshotting Homebrew packages. Full source, MIT-licensed, no telemetry, no accounts.

<!-- screenshot: Library view, dark theme, with a few installed formulae and one outdated row -->
![brew-browser — Library (dark)](docs/screenshots/library-dark.png)

## Why this exists

Homebrew is the standard package manager on macOS. brew-browser gives it a real native GUI: browse what you have installed, search the full catalog, install / uninstall / upgrade with live output, snapshot your setup to a Brewfile and restore it on a new Mac. Trending packages come from Homebrew's published analytics. The whole thing is a thin, respectful frontend over the `brew` CLI itself.

## Features

- **Library** — every installed formula and cask in one dense, filterable list, with outdated badges and a slide-over detail panel
- **Discover** — search the full Homebrew package index and install straight from the result row
- **Trending** — top packages from Homebrew's published `formulae.brew.sh` analytics, with 30 / 90 / 365-day windows
- **Snapshots** — save and restore Brewfiles using Homebrew's own `brew bundle` mechanism; "set up a new Mac" in one click
- **Activity** — every `brew` invocation streams live into a bottom drawer with full stdout, stderr, and a session history

A global Cmd+K command palette covers the verbs. Cmd+1…5 jumps between sections.

## What this isn't

- Not a Homebrew replacement — every action shells out to the real `brew` CLI
- Not telemetry-funded — no analytics, no accounts, no phone-home
- Not freemium — there is no paid tier, because there is no tier

## Install (end users)

Download the latest signed + notarized `.dmg` from the [releases page](https://github.com/msitarzewski/brew-browser/releases/latest), open it, and drag **brew-browser** to your Applications folder. No Gatekeeper warning — the build is signed with a Developer ID Application certificate and notarized by Apple.

Apple Silicon only for now. macOS 13 (Ventura) or newer.

A `brew tap` for one-line install is on the roadmap.

## Build from source

Prereqs:

- [Rust](https://rustup.rs/) (stable, edition 2021+)
- [Node.js 22+](https://nodejs.org/) and npm
- [Homebrew](https://brew.sh/) itself
- Xcode Command Line Tools: `xcode-select --install`

Then:

```sh
git clone https://github.com/msitarzewski/brew-browser
cd brew-browser
npm install
npm run tauri dev      # development with HMR
npm run tauri build    # produces a .dmg in src-tauri/target/release/bundle/
```

## Architecture

A Tauri 2 shell hosts a SvelteKit + Svelte 5 frontend in the system WebView. A Rust backend exposes ~20 typed Tauri commands that shell out to `brew` via `tokio::process` and stream stdout/stderr back over typed IPC channels. Trending data comes straight from `formulae.brew.sh`'s public analytics JSON, cached in memory for an hour. No shell plugin, no arbitrary command execution — every `brew` invocation is built in Rust from a small set of enumerated inputs. See [PLAN.md](./PLAN.md) for the full design.

## Open-source posture

**MIT licensed.** **No CLA.** **No EULA.** **No telemetry.** **No account.** **No dark patterns.**

brew-browser makes outbound network calls in exactly four documented circumstances. Every one is initiated by something you did:

- **`https://formulae.brew.sh`** — fetched when you open the Trending tab. Cached in process memory for one hour. Uses Homebrew's own published install-analytics JSON; no API key, no account.
- **Cask homepage probes** — when the Discover or Trending tab renders an uninstalled cask that has a `homepage` field, the Rust backend probes that homepage for an icon (in order: `/apple-touch-icon.png`, `<meta og:image>` parsed from the homepage HTML, `/favicon.ico`). One probe per cask per week max — the result, including misses, is cached for 7 days. These probes are sandboxed: link-local, loopback, RFC1918, and cloud-metadata IPs are rejected before the request, and the same check runs again on every redirect hop to prevent SSRF.
- **`brew` itself** — every install, uninstall, upgrade, search, and snapshot shells out to the real `brew` CLI. Whatever network calls `brew` makes (GitHub, OCI registries, bottle mirrors) happen exactly as they would if you ran the command yourself in a terminal. The full stdout/stderr stream is visible in the Activity drawer.
- **Your default browser** — when you click the homepage button on a package, the URL is opened in your default browser via macOS `open(1)`. The app rejects any non-`http(s)` scheme before opening.

No analytics. No crash reporting. No third-party fonts or pixels. No `fetch()` from the frontend — every backend call goes through typed Tauri IPC.

The full network posture is verified line-by-line in [`memory-bank/security.md`](./memory-bank/security.md) §5. Re-audits are welcome; the source is right there.

## Security

A full security audit lives at [`memory-bank/security.md`](./memory-bank/security.md). Current verdict: **READY-FOR-SCRUTINY** (0 critical / 0 high / 0 medium / 0 low / 0 nit open). All 16 findings from the initial audit are verified-fixed with passing tests. Independent tool battery passes: `cargo audit` 0 vulns, `cargo deny check` advisories+bans+licenses+sources ok, `npm audit --omit=dev` 0 vulns, `semgrep` with security-audit + OWASP-top-10 + Rust + TypeScript rulesets 0 findings, `cargo clippy -D warnings` clean. Zero `unsafe` Rust, zero `@html`/`innerHTML`/`eval` in the frontend, no `tauri-plugin-shell` (every brew invocation is built from typed Rust enums). SSRF defense includes a redirect-policy re-check on every hop.

Dependency posture:

- **Rust:** `cargo audit` reports 0 vulnerabilities across 540 crates. The 17 unmaintained warnings and 1 unsoundness all sit in GTK/glib transitive deps that compile out on macOS.
- **npm (production):** `npm audit --omit=dev` reports 0 vulnerabilities across 25 production packages.
- **Zero `unsafe` Rust** in the entire backend.

Defense-in-depth choices:

- No `tauri-plugin-shell` — the frontend cannot construct arbitrary shell commands. Every `brew` invocation is built in Rust from typed enums.
- Scheme allowlist on the homepage opener — only `http(s)` URLs reach `tauri-plugin-opener`.
- SSRF filter on the cask icon cascade — private, link-local, loopback, and cloud-metadata IPs are rejected pre-flight and on every redirect.
- Path sandboxing on Brewfile import/export — IPC paths are validated against a forbidden-prefix list and a 1 MiB size cap.
- `rustls-tls` + `webpki-roots` for all outbound HTTPS — no system trust store dependency.
- Capability allowlist is minimal: `core:default`, `opener:default`, `core:event:default`, `dialog:allow-open`, `dialog:allow-save`. No `fs:*`, no `http:*`, no `shell:*`.

Issues and PRs on security topics are welcome. See [SECURITY.md](./SECURITY.md) for the responsible disclosure process.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, project map, and the short list of things worth opening an issue about first. No CLA. Your contributions stay yours, licensed under MIT to match the project.

## Status

Early demo. Phases 1–4 and 6 are implemented and validated; Phase 5 (signed build artifact + final polish) is in progress. Expect rough edges in icons, app metadata, and first-run niceties.

## License

[MIT](./LICENSE). Do whatever you want with this.

## Acknowledgments

- [Homebrew](https://brew.sh) — does all the actual work. This app is a respectful UI on top.
- [Tauri](https://tauri.app) — native shell without the Electron tax.
- [Svelte](https://svelte.dev) — the runes-based reactivity that made the frontend small.
