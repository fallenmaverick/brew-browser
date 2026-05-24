# brew-browser — categorize tool

Build-time tooling. Generates `src-tauri/data/categories.json` from Homebrew's published cask + formula data, using an LLM to assign 1-5 categories per package.

Not runtime: this never runs from inside the brew-browser app. It runs offline, the output is committed, the app reads the bundled JSON.

## What it does

1. Fetches `https://formulae.brew.sh/api/cask.json` + `formula.json` (Homebrew's official bulk data)
2. Diffs against `state/last-tokens.json` (previous run state)
3. Batches **new + description-changed** tokens through OpenAI or Anthropic for category assignment
4. Writes `../../src-tauri/data/categories.json`
5. Updates `state/last-tokens.json`

First run categorizes everything (~15,000 items, ~$1-3). Subsequent runs only categorize the delta (usually <30 items, <$0.01).

## Setup

```sh
cd tools/categorize
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env, paste your OPENAI_API_KEY or ANTHROPIC_API_KEY
```

## Run

```sh
# First run (full bulk — ~10-30 min, ~$1-3)
python categorize.py

# Subsequent runs (incremental — <1 min, <$0.01)
python categorize.py

# Dry run (computes diff, skips LLM, writes nothing)
CATEGORIZE_DRY_RUN=1 python categorize.py

# Test against a tiny subset
CATEGORIZE_LIMIT=20 python categorize.py
```

## Cron

Suggested: daily at 3am local on whichever machine you prefer (Beast or umbp). After Homebrew's busy daytime PR window settles, delta is fresh for the next morning.

```sh
# crontab -e
0 3 * * * cd /path/to/brew-browser/tools/categorize && /path/to/venv/bin/python categorize.py >> state/cron.log 2>&1
```

Or via launchd if you prefer macOS-native scheduling.

## Output shape

`src-tauri/data/categories.json`:

```json
{
  "version": "2026-05-24",
  "generated_at": "2026-05-24T03:00:00Z",
  "model": "claude-haiku-4-5",
  "categories": {
    "ai": { "label": "AI & ML", "icon": "Brain" },
    "browsers": { "label": "Browsers", "icon": "Globe" },
    ...
  },
  "casks": {
    "ollama-app": ["ai", "developer-tools"],
    "firefox": ["browsers"]
  },
  "formulae": {
    "ffmpeg": ["video-audio", "developer-tools"]
  }
}
```

~150 KB typical for 15K items × up to 5 categories.

## Categories

Hand-picked baseline — see `categorize.py CATEGORIES`. Edit the file to add/rename/remove. Changes apply on the next run; existing entries are NOT re-categorized automatically — delete `state/last-tokens.json` to force a full re-run.

## Costs (one-time bulk, then daily delta)

| Provider | Model | Initial bulk | Daily delta |
|----------|-------|--------------|-------------|
| OpenAI | gpt-4o-mini | ~$1 | <$0.01 |
| Anthropic | claude-haiku-4-5 | ~$2 | <$0.01 |

(Estimates: 15K items × ~200 tokens prompt + ~30 tokens response per item; batched 50 per call.)

## Caveats

- LLM categorization is heuristic. Spot-check `categories.json` after the first run before merging.
- New popular casks may take 24h to appear (cron runs daily).
- Description rewrites trigger re-categorization for that single token — usually fine, occasionally noisy.
- If the LLM ever returns garbage JSON for a batch, that batch is skipped and logged; rerun handles it next cycle.
- This tool requires network: it talks to Homebrew's API + your LLM provider. Runs offline relative to the **app** — the app itself never talks to either.
