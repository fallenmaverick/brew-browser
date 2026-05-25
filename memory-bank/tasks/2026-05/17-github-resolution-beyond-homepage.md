# 2026-05-25 — Expand GitHub package resolution beyond `homepage` field

**Phase:** v0.3.0 prep — GitHub coverage win
**Status:** ✅ Complete (uncommitted, ships in v0.3.0)
**Task tracker:** #46
**Date:** 2026-05-25 (third session)

## Scope

Many Homebrew packages have non-GitHub `homepage` fields (marketing/docs sites) but ARE hosted on GitHub via:
- Formula `urls.stable.url` — typically `github.com/<o>/<r>/archive/refs/tags/v1.2.3.tar.gz`
- Formula `urls.head.url` — typically `github.com/<o>/<r>.git`
- Cask top-level `url` — typically `github.com/<o>/<r>/releases/download/v1.2.3/foo.dmg`

Before this change: the Dashboard's "personal-stats" card filtered installed packages by a regex on `pkg.homepage`, missing all of the above. Star/Watch/File-issue actions in PackageDetail were also gated by `pkg.homepage` alone.

After this change: backend pre-resolves a canonical `https://github.com/<o>/<r>` URL by walking the candidate URL fields in priority order. Frontend reads the pre-resolved `pkg.githubHomepage` for all GitHub feature routing. Display + "Open homepage" continue to use the raw `pkg.homepage` (the actual project site).

## Backend changes

### `github::url::extract_github_repo` — tolerant variant

`parse_github_url` stays strict (`/<owner>/<repo>` only, with recognized suffixes). The new `extract_github_repo`:

1. Tries `parse_github_url` first (fast path covers canonical homepage URLs).
2. On miss, peels the URL down to its first two non-empty path segments, strips a trailing `.git` on the second, rebuilds a canonical `https://github.com/<o>/<r>`, and re-validates via `parse_github_url`.

Every existing defense applies — host MUST be `github.com` exactly (subdomains/codeload/raw/gist all rejected), scheme MUST be http/https, owner+repo MUST match the strict character set (`^[A-Za-z0-9._-]{1,39}$`, no leading `.` or `-`), no `..` segments, no query/fragment in the canonical output. Canonicalized output always re-parses cleanly through the strict parser (test pin: `resolve_emits_canonical_form_strict_parser_accepts`).

### `github::url::resolve_github_homepage`

Convenience wrapper that takes an iterator of `Option<&str>` URL candidates and returns the first one that resolves, formatted as the canonical `https://github.com/<o>/<r>`. Used by the brew-info → `Package` conversion layer.

### Raw schema additions

- `RawFormula::urls: Option<RawFormulaUrls>` — `{ stable: { url }, head: { url } }`. Only the `url` field is read; tag/revision/branch/checksum are ignored.
- `RawCask::url: Option<String>` — the cask's binary artifact URL.

Both are `#[serde(default)]` so older fixtures (and brew versions that omit the field) parse cleanly.

### `Package::github_homepage`

New `pub github_homepage: Option<String>` on the Package wire DTO (camelCase: `githubHomepage`). Populated by `to_package()` for both Formula and Cask. Walk order:

- Formula: `homepage` → `urls.stable.url` → `urls.head.url`
- Cask: `homepage` → `url`

First match wins (most-authoritative-first). Output is the canonical `https://github.com/<o>/<r>` string; null when no candidate resolves.

`Package::homepage` stays unchanged — it's still the upstream homepage for display, "Open homepage" buttons, and the cask favicon cascade.

## Frontend changes

### `Package` interface

Mirrored: `githubHomepage: string | null` added. Documented as the source of truth for GitHub feature routing.

### `Dashboard.svelte`

`installedGithubHomepages` now reads from `pkg.githubHomepage` directly instead of regex-filtering `pkg.homepage`. The pre-resolved URLs feed `batchIsStarred` as canonical-form strings the backend's strict parser already accepts.

### `PackageDetail.svelte`

New local `githubHp = $derived(pkg?.githubHomepage ?? null)`. All four GitHub feature paths now use it:

- Stats card: `githubStatsEligible` checks `githubHp !== null` (replaces the regex check on `pkg.homepage`); `getRepoStats(githubHp)` and the cache lookup both use it.
- Star: `onToggleStar` reads `githubHp`; cache effect tracks `githubHp` for re-fetch.
- Watch: `onToggleWatch` reads `githubHp`.
- File issue: `openPackageIssue` reads `githubHp`; tooltip + modal target derived from it.

`pkg.homepage` still drives the "Open homepage" button + the meta-row link below the title.

## Tests / verification

- `cargo test`: **473 passed**, 0 failed, 6 ignored (was 450 → +23 new):
  - 14 `extract_github_repo` tests (canonical fast path, archive URLs, releases URLs, query/fragment stripping, subdomain rejection, path-traversal rejection, scheme rejection)
  - 6 `resolve_github_homepage` tests (priority walk, homepage-first, fallthrough to head url, all-miss, whitespace skipping, canonical-form pin)
  - 4 `to_package` tests (formula resolves from urls.stable, formula homepage wins, formula falls through to head url, formula non-github URL → None)
  - 2 cask `to_package` tests (resolves from url, non-github → None)
  - `package_serializes_with_camel_case_fields` updated to cover the new `githubHomepage` field
- `cargo clippy --all-targets -- -D warnings`: clean
- `npm run check`: 0 errors, 3 pre-existing warnings
- `npm run build`: clean

## Files

**Backend (Rust):**
- `src-tauri/src/github/url.rs` — `extract_github_repo` + `resolve_github_homepage` added; +20 tests
- `src-tauri/src/github/mod.rs` — re-exports added
- `src-tauri/src/brew/parse.rs` — `RawFormulaUrls` + `RawUrlEntry` + `RawCask.url` added; `to_package` walks candidates; +6 fixture-free tests; 2 existing test literals updated
- `src-tauri/src/types.rs` — `Package::github_homepage` field added; serde-camel test updated

**Frontend (Svelte / TypeScript):**
- `src/lib/types.ts` — `Package.githubHomepage` field added
- `src/lib/components/Dashboard.svelte` — personal-stats card uses pre-resolved field
- `src/lib/components/PackageDetail.svelte` — `githubHp` derived; all 4 action paths + stats card + starred-state effect + file-issue tooltip use it

## Notes

- **Coverage impact (informal projection):** every package whose `homepage` is non-GitHub but whose `urls.stable.url` lives on GitHub now counts toward the Dashboard total. Looking at recent Homebrew core: formulae like `node`, `python@3.13`, `wget` (urls.stable.url on ftpmirror.gnu.org — no GitHub) won't change; but `bat`, `fd`, `ripgrep`, `tealdeer` and dozens of others with marketing-page homepages and GitHub source URLs will now light up. Casks see similar coverage gains for projects hosting their .pkg/.dmg on GitHub Releases.
- **Security posture preserved:** `extract_github_repo` is strictly a host+character-set permissive wrapper around `parse_github_url`. Subdomains (`gist.github.com`, `raw.githubusercontent.com`, `codeload.github.com`), suffix-confusable hosts (`github.com.evil.com`), and disallowed owner/repo characters are all rejected at the same gate the strict parser enforced. Canonicalized output re-parses through the strict parser without exception (pinned test).
- **Wire shape change:** `Package` now has a `githubHomepage` field on every IPC return. Older clients ignore unknown fields cleanly; this is additive.
- **Untouched on purpose:** `pkg.homepage` semantics — it's still the upstream project homepage, used for the "Open homepage" button and the cask favicon cascade. We didn't replace `homepage` with `githubHomepage`; we added the new field beside it.
