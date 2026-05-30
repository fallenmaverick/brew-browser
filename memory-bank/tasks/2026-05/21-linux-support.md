# 2026-05-28 — Linux build support

**Phase:** Linux build support — add Linux as a supported build target alongside macOS
**Status:** ✅ 8 changes complete on branch `feat/linux-support`. macOS **regression-verified** (586 Rust tests, 0 frontend errors, clean Vite build). Linux binary builds **only in CI** and is **UNPROVEN** — never run on a real Linux machine. No Linux release until a real-Linux smoke test passes.
**Branch:** `feat/linux-support` (off `main` at the v0.5.0 merge commit)
**Release track:** v0.6.0-track (build support; not a release in itself)
**Workflow:** PRs into main, no direct pushes (durable rule since v0.4.0).

## Scope

brew-browser shipped macOS-only through v0.5.0. Homebrew also runs on Linux (Linuxbrew, prefix `/home/linuxbrew/.linuxbrew`). This branch adds Linux build support — `.deb` / `.rpm` / `.AppImage` produced by CI on Ubuntu 22.04 — without disturbing the macOS path. The work was cheap precisely because it leans on Tauri's "one codebase, add a target" model: the WebView and IPC surface are platform-agnostic, vibrancy was already cfg-gated, `cask_icon` used no macOS-only crates, and paths were already derived from `brew --prefix` / `brew --cache` rather than a hardcoded `/opt/homebrew`. The only dependency change was the keyring feature split.

macOS remains the **primary** target. Linux is **newly supported** and its binary is **unproven** until a real-Linux smoke test runs (the build compiling in CI proves the binary builds, not that the feature works — per the 2026-05-27 smoke-test-discipline ADR).

## Decisions

Full ADR in `decisions.md` (2026-05-28: "Linux support via Tauri's native cross-compilation"). Summary:

- **D1 — Add Linux as a supported target; keep macOS primary.** Cheap because of Tauri's value prop. Don't overclaim: the honest posture is "build support added, macOS-verified, Linux unproven."
- **D2 — Keyring feature split per target, `github/auth.rs` unchanged.** `keyring::Entry` is a unified API, so only `Cargo.toml`'s per-target dependency tables differ. macOS `apple-native`; Linux `sync-secret-service` (persistent Secret Service via gnome-keyring/KWallet over D-Bus — survives reboot, NOT session-scoped keyutils) + `crypto-rust` (pure-Rust AES → no system OpenSSL build dependency on CI). Runtime caveat: Linux needs a Secret Service daemon for GitHub sign-in; without one, sign-in fails via the existing `BrewError::KeychainUnavailable` path and nothing else breaks.
- **D3 — Casks degrade gracefully, not removed.** Linux casks still list, install, and get homepage-favicon icons. Only the macOS `.app`-bundle icon extraction (`sips`/`defaults`) is gated off; Linux `cask_icon` short-circuits to `Ok(None)` and the homepage-favicon cascade still runs. Same honesty posture as the v0.5.0 cask-coverage gap.
- **D4 — Unsigned Linux artifacts for v0.** AppImage unsigned by convention; `.deb`/`.rpm` GPG signing is a documented future step (sign with a repo GPG key after the build, publish to apt/yum). No notarization equivalent on Linux. Ship unsigned for v0 rather than block on a signing pipeline.
- **D5 — CI is the build host; no local cross-compile.** webkit2gtk is Linux-native and can't be cross-compiled from macOS. `.github/workflows/linux-build.yml` on pinned `ubuntu-22.04` (NOT `ubuntu-latest`, to keep the glibc floor fixed) produces the artifacts and is the canonical apt-dependency recipe.

## What landed (8 changes)

### 1 — Keyring cfg-gate

- `src-tauri/Cargo.toml:87-89` — `[target.'cfg(target_os = "macos")'.dependencies]` keeps `keyring = { version = "3", features = ["apple-native"] }`.
- `src-tauri/Cargo.toml:95-96` — `[target.'cfg(target_os = "linux")'.dependencies]` adds `keyring = { version = "3", features = ["sync-secret-service", "crypto-rust"] }`.
- `src-tauri/src/github/auth.rs` — **ZERO changes.** The unified `keyring::Entry` API (`auth.rs:275-290`) compiles against whichever backend the per-target feature selects. The `BrewError::KeychainUnavailable` path (`error.rs:104`, surfaced from `auth.rs:276-290`) is the existing failure mode that Linux-without-a-daemon hits.
- `src-tauri/Cargo.lock` — updated for the new Linux-target crates.

### 2 — Linuxbrew path detection

- `src-tauri/src/brew/paths.rs:31` — checks `/home/linuxbrew/.linuxbrew/bin/brew` (shared install).
- `src-tauri/src/brew/paths.rs:37` — checks `~/.linuxbrew/bin/brew` (per-user install).
- Doc comment at `paths.rs:10-11` records the prefixes. Test `resolve_brew_path_finds_linuxbrew_shared_when_present` (`paths.rs:99`) pins the shared-prefix resolution.

### 3 — `open_in_finder` cfg-gate

- `src-tauri/src/commands/disk_usage.rs:203` — `open_in_finder(path, state)` IPC name unchanged. Security gate (`disk_usage.rs:220`) refuses any path not inside the Homebrew prefix or cache, both derived from `brew --prefix` / `brew --cache` (so the Linux prefix works automatically).
- `disk_usage.rs:240-256` — `#[cfg(target_os = "macos")]` impl: `open -R <path>` (reveal-and-select in Finder).
- `disk_usage.rs:258-271` — `#[cfg(target_os = "linux")]` impl: `xdg-open <parent-dir>`. No portable reveal-and-select verb on Linux, so we open the containing directory. Documented at `disk_usage.rs:233-239`.

### 4 — `cask_icon` cfg-gate

- `src-tauri/src/commands/cask_icon.rs` — the entire `.app`/`sips`/`defaults` extraction pipeline (`read_bundle_icon_file`, `sips_convert_to_png`, helpers) is `#[cfg(target_os = "macos")]` (e.g. `cask_icon.rs:48,92,172,222,255,286,353,396`).
- `cask_icon.rs:89-95` — Linux short-circuits to `Ok(None)` (Linux casks don't produce `.app` bundles). The homepage-favicon cascade in the homepage-probe path is platform-agnostic and still runs, so Linux casks still get icons.

### 5 — CI workflow

- `.github/workflows/linux-build.yml` (NEW) — `name: Linux Build`, `runs-on: ubuntu-22.04` (pinned for webkit2gtk-4.1 + fixed glibc floor; rationale at `linux-build.yml:40-45`).
  - Triggers (`linux-build.yml:26-35`): push to `feat/linux-support`, `v*` tags, `workflow_dispatch`.
  - apt deps (`linux-build.yml:59-71`): `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`, `build-essential`, `file`, `wget`. **This is the canonical recipe** — the README points here rather than duplicating it.
  - Build: `npm run tauri build` (`linux-build.yml:96-97`); `bundle.targets: "all"` → `.deb`/`.rpm`/`.AppImage` on Linux.
  - Uploads each artifact with `if-no-files-found: error` (`linux-build.yml:99-118`).
  - Header comment (`linux-build.yml:8-22`) records: macOS path untouched (local sign+notarize), AppImage unsigned by convention, deb/rpm GPG signing is a future step, and that cutting a Release + the updater manifest stay deliberate human steps.

### 6 — `tauri.conf.json` bundle.linux

- `src-tauri/tauri.conf.json:55-66` — new `bundle.linux` block: `deb.depends` = `["libwebkit2gtk-4.1-0", "libgtk-3-0", "libayatana-appindicator3-1"]`; `appimage.bundleMediaFramework: false`.
- `bundle.macOS` (`tauri.conf.json:50-54`) and `bundle.targets: "all"` (`tauri.conf.json:42`) untouched.

### 7 — `publish-manifest.sh` Linux platform block

- `tools/release/publish-manifest.sh:102` — globs `src-tauri/target/release/bundle/appimage/*.AppImage` for the Linux artifact; `:103` names it `brew-browser_${VERSION}_amd64.AppImage`.
- `:149-158` — builds the `linux-x86_64` updater platform block only when the AppImage **and** its `.sig` are both present. On a Mac that only built `.app.tar.gz` (no AppImage), `LINUX_BLOCK` stays empty and the emitted manifest is byte-identical to the macOS-only output. Signs with the same `TAURI_SIGNING_PRIVATE_KEY` (minisign is cross-platform).

### 8 — Frontend platform-aware copy

- `src/lib/util/platform.ts` (NEW, 31 lines) — navigator.userAgent-based `isMac` / `isLinux`, zero new deps (no `@tauri-apps/plugin-os`). Exports `fileManagerName` ("Finder" / "file manager"), `keyringName` ("macOS Keychain" / "system keyring"), `keyringNameCapitalized`. Defaults to macOS wording under SSR/no-navigator so the static build keeps macOS copy.
- `src/lib/components/Dashboard.svelte:36` imports `isMac`; `:62` error copy and `:807-808` button title/aria-label swap "Reveal in Finder" ↔ "Show in file manager".
- `src/lib/components/SettingsSectionGitHub.svelte:31` imports `keyringName`; `:121` — "brew-browser stores your token in the {keyringName}."
- `src/lib/types.ts:8` imports `keyringNameCapitalized`; `:884` — `KeychainUnavailable` friendly message reads "{keyringNameCapitalized} unavailable: …".

## What's verified vs unverified

### ✅ Verified (macOS)

- `cargo test` — **586 passed**, 0 failed. The per-target cfg-gating compiles cleanly on macOS (the `linux` cfg arms are excluded; the keyring feature resolves to `apple-native`).
- `npm run check` — 0 errors.
- `npm run build` — clean Vite build.
- macOS bundle config, signing/notarization path, and updater manifest output are byte-identical to v0.5.0 — confirmed no macOS regression.

### ⚠️ Unverified (Linux / CI)

- The Linux binary has **never run on a real Linux machine.** webkit2gtk can't be cross-compiled from macOS, so only CI produces it.
- The first `linux-build.yml` run has **not been confirmed green** as of this writing.
- No Linux runtime path has been exercised end-to-end: brew detection at the Linuxbrew prefix, GitHub sign-in against a Secret Service daemon, `xdg-open` reveal, an install/upgrade/uninstall round-trip, the vuln scan. The macOS test suite and a CI **compile** do not cover any of these.

The accurate claim: **Linux build support added; macOS regression-verified; the Linux binary builds in CI but is unproven until a real-Linux smoke test.**

## Before a Linux release (hard gate)

- [ ] **CI green** — `linux-build.yml` completes and uploads `.deb`, `.rpm`, `.AppImage`.
- [ ] **Real-Linux smoke test** on an actual Ubuntu 22.04+ box:
  - [ ] **brew detection at the Linuxbrew prefix** — app finds `brew` at `/home/linuxbrew/.linuxbrew/bin/brew` (shared) and `~/.linuxbrew/bin/brew` (per-user); Dashboard populates.
  - [ ] **GitHub sign-in with a Secret Service daemon running** — Device Flow completes; token persists to the keyring and survives an app relaunch. (Separately confirm the no-daemon case fails with the "keyring unavailable" message and the rest of the app keeps working.)
  - [ ] **Show in file manager** — the storage-card button runs `xdg-open` on the parent directory and the system file manager opens there.
  - [ ] **Formula install / upgrade / uninstall round-trip** — each shells out correctly with live Activity streaming; state reflects afterward.
  - [ ] **Vulnerability scan** — IF `brew vulns` installs cleanly on Linux (`brew install homebrew/brew-vulns/brew-vulns`), the opt-in scan runs and the Exposure card / Security card populate. If `brew vulns` is macOS-only or doesn't install, document that as a Linux coverage gap honestly (same posture as casks).

Only after both gates pass should a Linux download be advertised. Merging the build-support branch is fine before then; a Linux **release** is not.

## Notes

- `github/auth.rs` having **zero changes** is the headline proof that the keyring abstraction held — the entire Linux credential-store difference is expressed in `Cargo.toml` feature flags.
- The `cask_icon` Linux `Ok(None)` short-circuit is the same graceful-degradation posture as the v0.5.0 cask vulnerability-coverage gap: render the row, tell the truth about what's missing, never fake state.
- `publish-manifest.sh` is byte-identical on the macOS-only path — the Linux block is strictly additive and gated on the AppImage + `.sig` both existing, so running it on a Mac build produces exactly the v0.5.0 manifest.
- This work tracks toward v0.6.0; it is build support, not a release. The release decision waits on the smoke test.

## References

- ADR: `memory-bank/decisions.md` — "2026-05-28: Linux support via Tauri's native cross-compilation (v0.6.0-track)".
- Smoke-test discipline rationale: `memory-bank/decisions.md` — "2026-05-27: Smoke-test discipline for subprocess-integration features" (the reason CI + a real-Linux smoke test matter before claiming done).
- Tech context: `memory-bank/techContext.md` — "Cross-platform (Linux)" section.
- CI recipe: `.github/workflows/linux-build.yml` (canonical apt deps + build steps).
- Tauri 2 Linux prerequisites: <https://v2.tauri.app/start/prerequisites/>.
