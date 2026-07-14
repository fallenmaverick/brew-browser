# Contributing a Bundle recipe

A **bundle** is a curated one-click stack (packages) with post-install guidance, capability-gated so it's only recommended on machines that can run it. Recipes are plain JSON files anyone can add via PR — no app code change needed for a valid recipe.

## Add one in 4 steps
1. **Copy** an existing recipe as a starting point:
   ```
   cp recipes/media.json recipes/my-bundle.json
   ```
2. **Edit** the fields (see the full contract: [`memory-bank/releases/0.7.0/bundles/recipe-contract.md`](memory-bank/releases/0.7.0/bundles/recipe-contract.md)). The essentials:
   - `id` — kebab-case, unique, **stable** (it's the persistence key).
   - `name`, `tagline`, `category` (`AI` | `Graphics` | `Media` | `Development` | `Data` | `Productivity`).
   - `description` (optional) — a 2–4 sentence "intent" paragraph (what this bundle is / who it's for / why these tools), **distinct** from the short `tagline` and from `caveats`. 40–600 chars.
   - `packages` — each `{ "name": "<brew token>", "kind": "formula" | "cask" }`. **Must resolve via `brew info`.** If any package is in a third-party tap (not `homebrew/core`/`homebrew/cask`), set the top-level `"tap": "user/repo"`.
   - `requires` (optional) — `minRamGB` / `recommendedRamGB` / `minDiskGB` / `arch` / `gpu`. Omit for "runs anywhere". See [`capability-baselines.md`](memory-bank/releases/0.7.0/bundles/capability-baselines.md) for how to pick numbers.
   - `setup` (optional) — post-install steps. `service` / `open` / `reveal` run in-app; **`command` steps MUST set `"external": true`** and are copy-only (the app never runs arbitrary shell).
   - `links` — further reading, **https only**.
3. **Validate locally** (needs Homebrew + Node 20+):
   ```
   node scripts/validate-recipes.mjs            # structure + brew resolution + links
   node scripts/validate-recipes.mjs --strict-links   # what CI runs
   ```
   This also regenerates `bundles.json`. **Commit `bundles.json` along with your recipe.**
4. **Open a PR.** The `Validate Recipes` CI check runs the same validator and posts a pass/fail table. Green = mergeable.

## The rules CI enforces
- Schema-valid; `id` unique + kebab-case.
- Every package resolves via `brew info` to its declared `kind`; third-party taps declared.
- `requires`: `minRamGB ≤ recommendedRamGB`, positive integers, valid `arch`/`gpu`.
- `command` setup steps are `external: true`; `open` urls are http(s).
- `links` are https and reachable (a real 4xx/5xx fails; a bot-block/TLS throw is a warning).
- `bundles.json` matches the recipes (regenerate + commit).

## Scope
Bundles are **brew-installable stacks with guidance**. A recipe may not auto-run external commands, and a stack whose value is entirely non-brew won't be accepted. If part of the setup is external (a model download, a `docker run`), express it as a copy-only `command` step or a `note`.
