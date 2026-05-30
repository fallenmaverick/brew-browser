# Active Context

**Date:** 2026-05-28 (Linux build support added on branch — macOS regression-verified, Linux binary UNPROVEN)
**Session lead:** Claude Opus 4.8 (1M context) (Claude Code in the terminal) with Michael
**State:** v0.5.0 is **shipped and released** (live on GitHub Releases). The `feat/linux-support` branch adds Linux build support to the existing macOS app. The macOS side is **regression-verified** (586 Rust tests pass, 0 frontend check errors, clean Vite build). The Linux binary builds in CI but is **UNPROVEN** — it has never run on a real Linux machine. No Linux release until a real-Linux smoke test passes.

## Repo

- **github.com/msitarzewski/brew-browser** — public, MIT
- **Released:** v0.1.0, v0.2.0, v0.2.1, v0.3.0, v0.3.1, v0.4.0, **v0.5.0** (live on GitHub Releases — `gh release list`)
- **Working on:** `feat/linux-support` — Linux build support (`.deb` / `.rpm` / `.AppImage` via CI), targeting a future v0.6.0-track release.
- **Branch:** `feat/linux-support`
- **Stars:** 18+

## What landed on `feat/linux-support`

Full file:line detail + the before-a-Linux-release checklist in `tasks/2026-05/21-linux-support.md`. ADR in `decisions.md` (2026-05-28). Eight changes:

1. **Keyring cfg-gate** — `Cargo.toml` splits the `keyring` dep per target: macOS keeps `apple-native`; Linux uses `sync-secret-service` + `crypto-rust` (persistent Secret Service via gnome-keyring/KWallet; pure-Rust crypto so no system OpenSSL on CI). `github/auth.rs` needed **zero changes** (unified `keyring::Entry` API). Runtime caveat: Linux needs a Secret Service daemon for GitHub sign-in; without one, sign-in fails via the existing `KeychainUnavailable` path and the rest of the app is unaffected.
2. **Linuxbrew path** — `brew/paths.rs` also checks `/home/linuxbrew/.linuxbrew/bin/brew` and `~/.linuxbrew/bin/brew`.
3. **`open_in_finder`** — IPC name unchanged; cfg-gated: macOS `open -R`, Linux `xdg-open` on the parent directory. Security gate + disk-usage paths derive from `brew --prefix` / `brew --cache`, so the Linux prefix works automatically.
4. **`cask_icon`** — macOS `.app`/`sips`/`defaults` extraction cfg-gated; Linux short-circuits to `Ok(None)`. Casks are NOT removed — they list, install, and get homepage-favicon icons on Linux.
5. **CI** — new `.github/workflows/linux-build.yml` on `ubuntu-22.04` (webkit2gtk-4.1 era, oldest-glibc floor) producing `.deb`, `.rpm`, `.AppImage`. Triggers: push to `feat/linux-support`, `v*` tags, manual dispatch.
6. **`tauri.conf.json`** — added `bundle.linux` (deb runtime `depends` + appimage config). macOS bundle untouched.
7. **`publish-manifest.sh`** — emits an additional `linux-x86_64` updater platform block when the AppImage + `.sig` are present; macOS-only path byte-identical when not.
8. **Frontend** — `src/lib/util/platform.ts` (navigator.userAgent-based `isMac`/`isLinux`, zero new deps); "Reveal in Finder" → "Show in file manager" on Linux; "macOS Keychain" → "system keyring" on Linux.

## Verified vs unverified

**Verified (macOS):**

- `cargo test`: **586 passed**, 0 failed (the per-target cfg-gating compiles cleanly on macOS; the keyring split selects `apple-native`).
- `npm run check`: 0 errors.
- `npm run build`: clean Vite build.
- The macOS bundle config, signing/notarization path, and updater manifest are byte-identical to v0.5.0 — no macOS regression.

**Unverified (Linux / CI):**

- The Linux binary has **never run on a real Linux machine.** webkit2gtk can't be cross-compiled from macOS, so the binary is produced only by CI.
- The CI workflow has **not had its first run confirmed green** as of this writing.
- Nothing on the Linux runtime path — brew detection at the Linuxbrew prefix, GitHub sign-in against a Secret Service daemon, `xdg-open` file-manager reveal, an install/upgrade/uninstall round-trip, the vuln scan — has been exercised end-to-end on Linux. The macOS test suite and a CI compile do not cover these.

The honest claim: **Linux build support added; macOS regression-verified; the Linux binary builds in CI but is unproven until a real-Linux smoke test.** This mirrors the cask-coverage-gap honesty posture from v0.5.0 and the smoke-test-discipline ADR (2026-05-27) — a CI compile proves the binary builds, not that the feature works.

## Before a Linux release (hard gate)

1. **CI green** — first `linux-build.yml` run completes and produces `.deb` / `.rpm` / `.AppImage`.
2. **Real-Linux smoke test** on an actual Linux box (Ubuntu 22.04+) covering:
   - brew detection at the Linuxbrew prefix (`/home/linuxbrew/.linuxbrew` and `~/.linuxbrew`),
   - GitHub sign-in with a Secret Service daemon running (token persists to the keyring; survives relaunch),
   - "Show in file manager" (`xdg-open` on the parent directory),
   - a formula install / upgrade / uninstall round-trip with live Activity streaming,
   - the opt-in vulnerability scan, IF `brew vulns` installs cleanly on Linux.

Full checklist in `tasks/2026-05/21-linux-support.md`.

## Workflow note

Branch ready for PR review. Follows the durable v0.4.0+ workflow: push branch → `gh pr create` → review → merge. No direct pushes to `main`. **No Linux release until the smoke test passes** — merging the build-support branch is fine, but advertising a Linux download is not until the binary is proven.

## Memory bank inventory

`toc.md`, `projectbrief.md`, `techContext.md` (now with the Cross-platform/Linux section), `decisions.md` (now through the 2026-05-28 Linux ADR), `activeContext.md` (this), `progress.md`, `systemPatterns.md`, `designSystem.md`, `uxArchitecture.md`, `visualStory.md`, `backendApi.md`, `frontendComponents.md`, `codeReview.md`, `apiTests.md`, `accessibility.md`, `realityCheck.md`, `security.md` (through §17), `ideas.md`, `agentLog.md` (dormant), `NEXT-SESSION.md`, `tasks/2026-05/` (21 task records + README + deferred), `phases/`, `scans/2026-05-23/`.
