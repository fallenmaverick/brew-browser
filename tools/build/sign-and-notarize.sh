#!/usr/bin/env bash
# brew-browser — full signed + notarized release build
#
# Usage:   source ~/.config/brew-browser/signing.env && ./tools/build/sign-and-notarize.sh
#
# Runs: cargo tauri build → notarize+staple the .dmg → verify with spctl.
# Requires: APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID env vars set (see BUILD.md).

set -euo pipefail

# ─── Pre-flight ──────────────────────────────────────────────────────────────

cd "$(dirname "$0")/../.."   # repo root

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "✗ Missing Apple env vars. Source your signing env first:" >&2
  echo "    source ~/.config/brew-browser/signing.env" >&2
  echo "See BUILD.md for the env file template." >&2
  exit 1
fi

# Phase 15 — the updater bundle target (`.app.tar.gz`) needs Tauri's
# minisign signing keys in env. The plugin's macOS install path expects
# a signed `.app.tar.gz` alongside the manifest URL; without these env
# vars the build silently skips the signature → install attempts fail
# with "signature verification failed" against the embedded pubkey.
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  echo "✗ Missing TAURI_SIGNING_PRIVATE_KEY (or _PATH). Add to signing.env:" >&2
  echo "    export TAURI_SIGNING_PRIVATE_KEY_PATH=\"\$HOME/.config/brew-browser/updater.key\"" >&2
  echo "    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=\"<your-key-password>\"" >&2
  echo "See BUILD.md → 'Per-release manifest publishing flow'." >&2
  exit 1
fi
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  echo "✗ Missing TAURI_SIGNING_PRIVATE_KEY_PASSWORD env var." >&2
  echo "  Set in signing.env; required even when the key has no password (use empty string)." >&2
  exit 1
fi

# Tauri's bundler reads `TAURI_SIGNING_PRIVATE_KEY` as the literal key
# contents — it does NOT resolve `_PATH` itself despite the
# `tauri signer generate` output suggesting otherwise (observed on
# tauri-cli 2.x as of 2026-05). Bridge the gap here: when only `_PATH`
# is set, read the file and export the contents so downstream
# `npm run tauri build` sees what it expects.
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  if [[ ! -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]]; then
    echo "✗ TAURI_SIGNING_PRIVATE_KEY_PATH points at a non-existent file:" >&2
    echo "    ${TAURI_SIGNING_PRIVATE_KEY_PATH}" >&2
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "${TAURI_SIGNING_PRIVATE_KEY_PATH}")"
fi

if ! security find-identity -v -p codesigning | grep -q 'Developer ID Application'; then
  echo "✗ No 'Developer ID Application' identity found in your keychain." >&2
  echo "  See BUILD.md, Prerequisites." >&2
  exit 1
fi

echo "▸ pre-flight ok"
echo "  apple-id:   $APPLE_ID"
echo "  team-id:    $APPLE_TEAM_ID"
echo "  minisign:   ${TAURI_SIGNING_PRIVATE_KEY_PATH:-<inline>}"

# ─── Build (compile + sign + notarize .app inside) ───────────────────────────

echo
echo "▸ npm run tauri build (compile + sign .app + sign .app.tar.gz + bundle .dmg)"
npm run tauri build

# Locate the produced .dmg (version-agnostic)
DMG="$(ls -t src-tauri/target/release/bundle/dmg/brew-browser_*_aarch64.dmg 2>/dev/null | head -1 || true)"
if [[ -z "$DMG" || ! -f "$DMG" ]]; then
  echo "✗ build completed but no .dmg found under src-tauri/target/release/bundle/dmg/" >&2
  exit 1
fi
echo
echo "▸ .dmg produced: $DMG"

# Phase 15 — confirm the updater .app.tar.gz + .sig also exist. These
# are what `tools/release/publish-manifest.sh` hashes and references in
# the manifest URL; a release without them ships a working .dmg fresh-
# install path but a broken auto-updater path.
APP_TAR_GZ="src-tauri/target/release/bundle/macos/brew-browser.app.tar.gz"
APP_TAR_GZ_SIG="${APP_TAR_GZ}.sig"
if [[ ! -f "$APP_TAR_GZ" ]]; then
  echo "✗ updater artifact missing: $APP_TAR_GZ" >&2
  echo "  Tauri should emit this automatically when the updater plugin is" >&2
  echo "  registered AND TAURI_SIGNING_PRIVATE_KEY[_PATH] is set." >&2
  exit 1
fi
if [[ ! -f "$APP_TAR_GZ_SIG" ]]; then
  echo "✗ updater signature missing: $APP_TAR_GZ_SIG" >&2
  echo "  The TAURI_SIGNING_PRIVATE_KEY env vars probably weren't used by the build." >&2
  exit 1
fi
echo "▸ updater artifact: $APP_TAR_GZ"
echo "▸ updater signature: $APP_TAR_GZ_SIG"

# ─── Notarize + staple the .dmg wrapper itself ───────────────────────────────

echo
echo "▸ submitting .dmg to Apple notary (waiting for ticket — typically 1-5 min)"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo
echo "▸ stapling notarization ticket to .dmg"
xcrun stapler staple "$DMG"

# ─── Verify ──────────────────────────────────────────────────────────────────

echo
echo "▸ verification"
spctl --assess --type install --verbose=4 "$DMG"
xcrun stapler validate "$DMG"

echo
echo "✓ done — $DMG is signed, notarized, stapled, and ready to ship"
ls -lh "$DMG"
