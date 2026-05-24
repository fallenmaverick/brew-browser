# API Tests

**Owner:** API Tester (Wave 3)
**Status:** Wave 3 complete — 99 unit tests + 6 ignored integration tests, all green.
**Last updated:** 2026-05-23

This document is the test plan AND the inventory of what's actually implemented in `src-tauri/src/**/tests` and `src-tauri/tests/`. Wave 3 also surfaced one bug — see §6.

---

## 1. Test pyramid

```
                       /\
                      /  \   Manual smoke (Wave 4)
                     /----\  — launch app, drive UI, observe brew
                    /      \
                   / Integ. \    Integration (#[ignore])
                  /----------\   — opt-in: cargo test -- --ignored
                 /            \  — real brew on dev host, real network
                /     Unit     \
               /----------------\ — default: cargo test
              /  parsers, validators, error mapping, cache TTL,
             /   wire-shape camelCase round-trips, fixture parses
            /------------------------------------------------\
```

Default `cargo test` runs only the fast (sub-second), no-process, no-network unit tier. Integration tests live in `src-tauri/tests/integration_brew.rs`, are all gated with `#[ignore]`, and opt in via `cargo test -- --ignored`.

Manual smoke is owned by Reality Checker + Wave 4 polish — not by this agent.

### Pyramid policy

- **Unit (default tier)** — pure functions, parsers, validators, error serialization shape. Fast. CI-friendly. Use real `brew --json=v2` fixtures captured from Beast, not hand-crafted JSON.
- **Integration (opt-in)** — shells out to real `brew`. Verifies the contract between brew's actual output and our parsers. Verifies the live trending endpoint shape.
- **End-to-end (manual)** — Wave 3 Reality Checker + Wave 4 manual scripted smoke before merging Phase 5.

---

## 2. Fixture strategy

All fixtures live under `src-tauri/tests/fixtures/` and were captured from Beast (Homebrew 5.1.13) on 2026-05-23:

| Fixture | Source command | Purpose |
|---|---|---|
| `brew_info_wget.json` | `brew info wget --json=v2` | RawFormula round-trip; dependency extraction; raw_json passthrough |
| `brew_info_firefox.json` | `brew info --cask firefox --json=v2` | RawCask round-trip; artifact extraction |
| `brew_list_formula.json` | trimmed `brew info --installed --formula --json=v2` (3 entries) | Multi-formula list parsing |
| `brew_list_cask.json` | trimmed `brew info --installed --cask --json=v2` (3 casks) | Multi-cask list parsing |
| `brew_outdated.json` | `brew outdated --json=v2 --greedy` | RawOutdatedEntry → OutdatedPackage conversion |
| `trending_30d.json` | `curl https://formulae.brew.sh/api/analytics/install/30d.json` (trimmed to 30 items) | Real-shape pin for trending JSON (see BUG §6) |
| `brew_search_wget.txt` | `brew search wget` | parse_search_stdout against real output |
| `brew_search_with_sections.txt` | synthesized to include `==>` headers + `If you meant ...` lines | Legacy multi-section parse path |
| `sample_brewfile.txt` | synthesized; mimics `brew bundle dump` output for taps/brew/cask/mas/vscode lines | Brewfile parser, including `mas` id extraction |

**Why some fixtures are synthesized:** `brew bundle dump` on Beast currently fails with `key not found: "shivammathur/extensions/imap-uw"` (an unrelated tap topology issue), and recent `brew search` doesn't print `==>` section headers when output is small. We retain synthesized fixtures for those cases because the parser must still handle both the legacy headered format AND the bundle dump format on machines where they appear.

### Refresh policy

When `brew` major versions, refresh by re-running the capture commands and overwriting the fixtures. The integration tests in §4 will fail loudly if brew's wire shape changes incompatibly.

---

## 3. Per-module unit test inventory

| Source file | Test module location | Test count | Coverage targets |
|---|---|---|---|
| `src/brew/parse.rs` | inline `#[cfg(test)] mod tests` | 15 | RawFormula → Package; RawCask → Package; RawFormula → PackageDetail (deps, build deps, raw_json); RawCask → PackageDetail (artifacts/installed_paths); RawOutdatedEntry → OutdatedPackage; parse_search_stdout (plain, headers, multi-token, empty, warnings/errors); extract_analytics_30d |
| `src/brew/paths.rs` | inline | 2 | resolve_brew_path on dev host; prefers /opt/homebrew over PATH |
| `src/error.rs` | inline | 18 | Every BrewError variant serializes to expected `code` + camelCase field names (frontend's `BrewErrorPayload` switch); truncate_head/_tail safety on ASCII and UTF-8; std::io::Error and serde_json::Error → BrewError From impls |
| `src/commands/info.rs` | inline | 17 | validate_package_name: happy (simple, versioned, tap-qualified, punctuated); empty/oversize boundary (199/200/201); leading-dash flag injection; shell metacharacters; control chars / nulls / CR/LF/tab; unicode lookalikes; brackets/braces |
| `src/commands/search.rs` | inline | 10 | validate_search_query: happy (plain, internal dash, regex form); empty / whitespace-only; oversize boundary; leading-dash flag injection (with and without leading whitespace) |
| `src/commands/brewfile.rs` | inline | 14 | parse_brewfile_text (taps/brew/cask/mas/vscode); skips comments + blanks; ignores unrecognized directives; mas without id → 0; first_quoted edge cases; sanitize_label (kept chars, space/dot replacement, traversal stripping, empty → dated default, 64-char truncate); parse_check_report (satisfied + missing-everything); brewfile_path naming |
| `src/trending/cache.rs` | inline | 11 | TRENDING_TTL == 1h; empty cache; put/get; per-window isolation; is_fresh true/false/missing; stale-on-failure retrievability; clear evicts all; put replaces |
| `src/trending/client.rs` | inline | 7 | parse_count (commas, garbage, decimals); real fixture has `items` array (BUG witness); current parser silently empty on real payload (BUG pin); individual RawAnalyticsItem parses; legacy `formulae{}` shape still parses |
| `src/types.rs` | inline | 8 | PackageKind serializes lowercase; TrendingWindow serializes/deserializes "30d"/"90d"/"365d"; as_path_segment matches URL; Package camelCase wire-shape pin (no snake_case leaks); BrewStreamEvent tag = "kind" with camelCase fields (`jobId`, `exitCode`, `durationMs`, `startedAt`) |

**Inline rationale:** every test module is `#[cfg(test)] mod tests { ... }` inside the production source file. This is intentional: it (a) gives tests access to private items (`validate_search_query`, `parse_brewfile_text`, `sanitize_label`, `first_quoted`, etc.) without widening their visibility, and (b) keeps the test next to the code under test for grep-reviewability.

### Total: **99 unit tests across 9 production files**

---

## 4. Integration tests (opt-in)

File: `src-tauri/tests/integration_brew.rs`

| Test | Gated | What it verifies |
|---|---|---|
| `brew_version_runs_and_reports_a_version` | `#[ignore]` | brew is on PATH and `brew --version` returns `Homebrew <version>` |
| `brew_info_installed_yields_parseable_json` | `#[ignore]` | `brew info --installed --json=v2` returns top-level `formulae`/`casks` object |
| `brew_info_wget_returns_single_formula_entry` | `#[ignore]` | `brew info --json=v2 --formula wget` yields exactly one formula with `name="wget"` |
| `brew_outdated_yields_parseable_json` | `#[ignore]` | `brew outdated --json=v2 --greedy` returns valid JSON with both arrays present (even when empty) |
| `brew_search_formula_wget_returns_non_empty_token_list` | `#[ignore]` | `brew search --formula wget` plain stdout includes `wget` as a token |
| `trending_endpoint_returns_items_array_shape` | `#[ignore]` | Live `formulae.brew.sh` 30d endpoint returns 200 with `items: [...]` array (NOT the documented `formulae: {}` shape) — see BUG §6 |

### Run

```sh
# Default — fast, no brew required:
cargo test --manifest-path src-tauri/Cargo.toml

# With integration:
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored

# Both tiers in one shot:
cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored
```

### Why not test the Tauri commands directly?

The `#[tauri::command]` functions require a Tauri runtime + State injection to invoke. Driving them would mean spinning up a headless app. That's better validated by Wave 4 manual smoke (and Wave 5+ Playwright if we ever want it). The integration tests we DO have validate the underlying brew contract — which is what would actually drift and break the commands.

---

## 5. Top 10 highest-priority tests (run-first list)

Numbered by "if this breaks, the demo is dead":

1. **`brew::parse::tests::raw_formula_parses_brew_info_wget_fixture`** — the entire Library tab depends on `RawFormula → Package`.
2. **`brew::parse::tests::raw_cask_parses_brew_info_firefox_fixture`** — same for casks.
3. **`brew::parse::tests::raw_outdated_parses_fixture`** — the "Updates" badge in the sidebar depends on this.
4. **`error::tests::brew_exit_non_zero_serializes_with_camel_case_fields`** — frontend `isBrewError` type-guard breaks if camelCase drifts.
5. **`error::tests::json_parse_serializes_with_camel_case_fields`** — same.
6. **`types::tests::package_serializes_with_camel_case_fields`** — wire-shape pin protecting every package payload.
7. **`types::tests::brew_stream_event_uses_kind_tag_camel_case`** — ActivityDrawer's switch on `event.kind` depends on this.
8. **`commands::info::tests::rejects_leading_dash_injection`** — IPC-boundary defense in depth against flag injection.
9. **`trending::cache::tests::stale_entry_still_retrievable_for_fallback`** — offline trending must still serve last-good data.
10. **`integration_brew::trending_endpoint_returns_items_array_shape`** — pins the BUG so a future fix has a green target to write against.

---

## 6. Bugs surfaced (do NOT fix in this wave)

### BUG-1 — Trending parser shape mismatch (silent empty result)

**Location:** `src-tauri/src/trending/client.rs:17-23` (`RawAnalytics`)

**Symptom:** `trending_fetch(D30)` returns an empty `entries: []` array against the real `formulae.brew.sh` payload, so the Trending tab will appear permanently empty. No error, no log — it just silently shows nothing.

**Root cause:** The current parser expects

```rust
struct RawAnalytics {
    total_count: u64,
    formulae: HashMap<String, Vec<RawAnalyticsItem>>,   // <-- WRONG SHAPE
}
```

but the actual payload at `https://formulae.brew.sh/api/analytics/install/30d.json` is

```json
{
  "category": "formula_install",
  "total_items": 24413,
  "start_date": "2026-04-23",
  "end_date": "2026-05-23",
  "total_count": 25713624,
  "items": [
    { "number": 1, "formula": "ca-certificates", "count": "481,964", "percent": "1.87" },
    ...
  ]
}
```

It's a flat `items` array, not a `formulae` object-of-arrays. Because both fields are `#[serde(default)]`, deserialization succeeds but `formulae` is always empty, the iteration loop runs zero times, and we return `Ok(TrendingReport { entries: vec![], ... })`.

**Test pins:**
- `trending::client::tests::real_trending_fixture_has_top_level_items_array_not_formulae_object` — asserts the wire shape.
- `trending::client::tests::current_parser_silently_yields_empty_entries_on_real_payload` — pins the buggy behavior so a fix is provably a behavior change.
- `trending::client::tests::raw_analytics_parses_documented_legacy_shape` — confirms the legacy `formulae{}` shape still works (so a fix that adds `items` support shouldn't regress legacy compatibility).
- `integration_brew::trending_endpoint_returns_items_array_shape` — live network test that pins what the real endpoint returns.

**Suggested fix (for Backend Architect, NOT done here):** Change `RawAnalytics` to also accept `items: Vec<RawAnalyticsItem>` and prefer it when present:

```rust
struct RawAnalytics {
    #[serde(default)]
    pub total_count: u64,
    #[serde(default)]
    pub items: Vec<RawAnalyticsItem>,
    #[serde(default)]
    pub formulae: HashMap<String, Vec<RawAnalyticsItem>>,  // legacy fallback
}
```

then in `fetch()`, if `raw.items` is non-empty use it directly; otherwise fall back to flattening `raw.formulae` values as today.

### BUG-2 (minor) — `extract_cask_paths` only handles top-level `app`/`binary` keys

**Location:** `src-tauri/src/brew/parse.rs:329-353`

**Symptom:** Cask artifacts often nest under more keys (`pkg`, `installer`, `manpage`, etc.). For most casks the `app` extraction works (verified by the Firefox fixture test which finds `Firefox.app`), but command-line-only casks may show empty `installedPaths` in the detail panel.

**Test pin:** `brew::parse::tests::raw_cask_to_detail_extracts_artifacts` — proves `app` works; absence of a test for `pkg` / `binary`-only casks is the gap.

**Suggested fix:** Extend the `if key == "app" || key == "binary"` filter to also accept `pkg` and `installer` artifact types. Out of scope for Wave 3.

### BUG-3 (informational, not actionable in Wave 3) — `From<reqwest::Error>` collapses URL → `""`

**Location:** `src-tauri/src/error.rs:91-109`

**Symptom:** When `reqwest::Error::url()` returns `None` (which happens for `RequestError`s that fired before the URL was attached), `BrewError::Network { url: "" , ... }` is what the frontend sees. Not actively broken — the `From` impl is only used as a generic fallback because the trending client manually constructs both `Network` and `HttpStatus` errors with the URL already populated — but it's a latent footgun if anyone adds a new HTTP path later and forgets to construct the error by hand.

No test pinned for this (it's a code-shape concern, not a behavior bug).

---

## 7. Explicitly out of scope

- **Exhaustive error-variant testing.** We verify every `BrewError` variant's wire shape but do not exercise every code path that *constructs* each variant. Each command's "happy path" is verified at the integration tier; failure paths are smoke-tested by Reality Checker.
- **Streaming command lifecycle.** `run_brew_streaming`'s two-pump line reader, cancel oneshot, child kill semantics, and Channel emission ordering are best tested in a live Tauri runtime. Wave 4 manual smoke covers this; programmatic testing would require either a Tauri test harness (Tauri 2 still under-developed for this) or replacing `brew` with a mock binary. Deferred.
- **Concurrent install / write-lock serialization.** Same as above — requires a running app to exercise. The single `Mutex<()>` model is trivially correct by inspection.
- **`brew_install` / `brew_uninstall` / `brew_upgrade` / `brew_update` end-to-end.** These are write operations and the tasks already noted `BREW_BROWSER_DESTRUCTIVE_TESTS=1` would be needed. Manual smoke covers them on Beast; we don't automate package mutations in CI.
- **Frontend (Svelte / TS).** Not in this agent's lane.
- **Tauri `invoke_handler` registration.** A smoke check that all 20 commands link is performed by `cargo build` on `lib.rs`'s `generate_handler![...]` macro — no separate test added.
- **Fuzzing.** Out of scope; `validate_package_name` is sufficiently small that property-based testing (e.g. `proptest`) would be overkill for the demo.

---

## 8. Run summary (this wave)

```
cargo test --manifest-path src-tauri/Cargo.toml
  → 99 passed, 0 failed, 6 ignored (integration), 0 warnings

cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
  → 6 passed, 0 failed (Beast: brew installed, network reachable)
```

Total runtime: < 2 seconds for the unit tier; ~2 seconds for the integration tier.

---

## 9. Next agent — Reality Checker handoff

- BUG-1 is the only finding that could break the Trending tab in the demo. Reality Checker should verify whether the Trending UI shows entries or an empty state when run; if empty, file in `realityCheck.md` and flag for Wave 4 Backend Architect fix.
- BUG-2 is cosmetic — only affects the detail-panel "Installed paths" section for non-`app` casks.
- The dev dependency footprint added is minimal: `tempfile = "3"` (currently unused by any test but reserved for future filesystem-touching integration tests) and a `tokio` `test-util` feature toggle on the existing tokio dep.

---

*End of API test plan.*
