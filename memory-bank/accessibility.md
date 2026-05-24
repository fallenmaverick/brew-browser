# Accessibility Audit — brew-browser

**Auditor:** Accessibility Auditor
**Date:** 2026-05-23
**Standard:** WCAG 2.2 AA floor, AAA noted where reasonable for a dev-tool audience
**Scope:** Source-only static audit of every Svelte component under `src/lib/components/`, the routes under `src/routes/`, and CSS tokens under `src/lib/styles/`. No live screen reader / browser interaction (app not running).
**Method:** read every component and route end to end; reconcile against `designSystem.md §9 (a11y floor)` and `uxArchitecture.md §8 (keymap)`; compute WCAG contrast on the top token pairs from hex equivalents in `tokens.css`.

---

## 1. Verdict

**Pass-with-caveats.** The foundation is solid — semantic HTML predominates, focus-visible is honored macOS-style, a global `prefers-reduced-motion` block is in place, modals trap focus and restore Esc, the streaming console has `role="log" aria-live="polite" aria-atomic="false"` exactly as spec'd, and OKLCH primary text contrasts are excellent.

But several issues block a clean AA claim: **ARIA list/listbox patterns are misused** (buttons given `role="option"`, listboxes without proper option children, no `aria-activedescendant` and no arrow-key navigation), **`text-muted` text on raised/sunken surfaces fails 4.5:1** in light mode at the small body sizes it's used for, **`Pill` tones (formula/cask/warning/danger) fail contrast** for their 11px caption text on subtle backgrounds, **the focus ring rule sets `border-radius: var(--radius-md)` on every focused element** (mutates shape of cards, modals, pills on focus), and **the slide-over `PackageDetail` does not move keyboard focus into itself when opened** (keyboard users must Tab through the entire Library to reach it).

Count: **3 critical · 9 important · 8 nit.**

---

## 2. Color contrast computations

WCAG contrast formula: `(L1 + 0.05) / (L2 + 0.05)` where L is relative luminance from sRGB linearized channels. Floor is **4.5:1 for normal text**, **3:1 for ≥18.66 px or ≥14 px bold**. brew-browser's body is **13 px regular** → 4.5:1 applies. Captions and pill text are **11 px** → still 4.5:1.

Computations use the hex equivalents commented in `src/lib/styles/tokens.css`.

### 2.1 Light mode

| Pair (fg on bg) | Hex | Computed ratio | Required | Verdict |
|---|---|---|---|---|
| `text-primary` on `surface` | `#1c1b18` on `#fdfcfa` | **16.9 : 1** | 4.5 | AAA ✓ |
| `text-secondary` on `surface` | `#4d4a44` on `#fdfcfa` | **8.5 : 1** | 4.5 | AAA ✓ |
| `text-muted` on `surface` | `#7a766f` on `#fdfcfa` | **4.4 : 1** | 4.5 | **FAIL AA** (body-sm/caption) |
| `text-muted` on `surface-sunken` | `#7a766f` on `#f4f3f0` | **4.0 : 1** | 4.5 | **FAIL AA** |
| `text-link` on `surface` | `#1d4ed8` on `#fdfcfa` | **6.6 : 1** | 4.5 | AA ✓ |
| `warning` on `surface` (the `.upgrade` chevron + `.warn` label) | `#ca8a04` on `#fdfcfa` | **2.9 : 1** | 4.5 | **FAIL AA** |
| `success` on `surface` | `#15803d` on `#fdfcfa` | **4.9 : 1** | 4.5 | AA ✓ (borderline) |
| `danger` on `surface` | `#dc2626` on `#fdfcfa` | **4.7 : 1** | 4.5 | AA ✓ (borderline) |

### 2.2 Dark mode

| Pair (fg on bg) | Hex | Computed ratio | Required | Verdict |
|---|---|---|---|---|
| `text-primary` on `surface` | `#ebebf0` on `#1c1c1e` | **15.7 : 1** | 4.5 | AAA ✓ |
| `text-secondary` on `surface` | `#b8b8be` on `#1c1c1e` | **9.6 : 1** | 4.5 | AAA ✓ |
| `text-muted` on `surface` | `#8a8a8e` on `#1c1c1e` | **5.0 : 1** | 4.5 | AA ✓ (borderline) |
| `text-muted` on `surface-sunken` (console area) | `#8a8a8e` on `#131315` | **5.4 : 1** | 4.5 | AA ✓ |
| `text-link` on `surface` | `#60a5fa` on `#1c1c1e` | **6.7 : 1** | 4.5 | AA ✓ |
| `warning` on `surface` | `#fbbf24` on `#1c1c1e` | **10.3 : 1** | 4.5 | AAA ✓ |

Dark mode is uniformly safer than light because the muted token was raised to ~58 % L vs. ~55 % L in light, against a much darker surface.

### 2.3 Pill components (`Pill.svelte`) — 11 px caption-size text

| Pill tone (fg on bg) | Hex | Computed ratio | Required | Verdict |
|---|---|---|---|---|
| `formula` (info on info-subtle) | `#2563eb` on `#dbeafe` | **4.3 : 1** | 4.5 | **FAIL AA** |
| `cask` (brand on brand-subtle) | `#d97706` on `#fef3c7` | **2.9 : 1** | 4.5 | **FAIL AA** |
| `success` (success on success-subtle) | `#15803d` on `#dcfce7` | **4.6 : 1** | 4.5 | AA ✓ borderline |
| `warning` (warning on warning-subtle) | `#ca8a04` on `#fef9c3` | **2.7 : 1** | 4.5 | **FAIL AA badly** |
| `danger` (danger on danger-subtle) | `#dc2626` on `#fee2e2` | **4.0 : 1** | 4.5 | **FAIL AA** |

The Pill is on screen in **every Library row, every Discover result, every Trending row, every Detail panel header, and every search result**. The formula/cask pill is the most-shown text on screen. This is the highest-impact contrast finding.

These computations match what `designSystem.md §2` claimed for the body/secondary pairs (its table at line 192-202 shows 14.8 : 1 and 8.1 : 1 — close enough to my 16.9 and 8.5 for an audit). The spec missed the pill, muted, and warning failures because it only verified text-on-`surface`, not text-on-`subtle` and not the muted-on-sunken combination.

---

## 3. Findings

Severity scale:
- **Critical** — blocks AT users from completing a primary task or contradicts a `designSystem.md §9` floor commitment.
- **Important** — degrades AT usability, fails an AA criterion, or makes keyboard nav substantially worse than mouse.
- **Nit** — preference, polish, AAA-only, or a friendlier label.

### CRITICAL

#### C-1 — Listbox / option ARIA pattern is broken throughout list views
- WCAG 4.1.2 Name, Role, Value (Level A)
- Files / lines:
  - `src/lib/components/Library.svelte:110` — `<div class="list" role="listbox" aria-label="Installed packages">` parents `PackageRow`
  - `src/lib/components/PackageRow.svelte:15-21` — `<button class="row" role="option" aria-selected={selected}>` — **button with role="option"**
  - `src/lib/components/Discover.svelte:76-89` — `<ul ... role="listbox">` parents `<li><button class="row">` — buttons have **no role="option"**, no `aria-selected`
  - `src/lib/components/Trending.svelte:69-83` — same pattern as Discover; missing `role="option"`
  - `src/lib/components/CommandPalette.svelte:150-179` — `.results` div has no `role="listbox"`, `.result` buttons no `role="option"`, despite arrow-key navigation existing
- Why it's a problem:
  - `<button>` with `role="option"` replaces the implicit `button` role; VoiceOver reads "list, selected, name" but **Enter / Space activation semantics no longer come from `<button>`**, they come from `<option>` which has no inherent activation. The visual click still works, but VO users can't predict what happens on Enter (no default option-activation in ARIA without `aria-activedescendant`).
  - A `<ul role="listbox">` with `<button>` children (Discover, Trending) is **non-conformant**: the listbox's only allowed descendant roles are `option`, `group`, and `presentation`. VO will skip into a fallback mode and reading will be inconsistent across screen readers.
  - The Command Palette has full arrow-key + Enter navigation logic (`CommandPalette.svelte:118-131`) but exposes none of that to AT — there is no `aria-activedescendant`, no `role="listbox"`, no `role="option"` — so a screen-reader user types into the input, hears nothing change, and never learns which item is selected.
- Fix:
  - **Option A (recommended for Library/Discover/Trending):** drop the listbox role entirely. These are clickable list rows, not single-select option lists. Use `<div role="list">` + `<button class="row">` (no role) inside each `<li>`. The button keeps its activation semantics, the row is announced as "button, ripgrep, formula, …". Pair with `<th scope="col">` if you ever migrate the visible column header at `Library.svelte:107-109` into a real `<table>` — currently it's a `<div class="list-header" aria-hidden="true">`, which is fine for now.
  - **Option B (Command Palette):** treat as a combobox. On the search input: `role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={`palette-item-${selectedIdx}`}`. On `.results`: `role="listbox" id="palette-results"`. On each `.result` button: `role="option" id={`palette-item-${entry.idx}`} aria-selected={entry.idx === selectedIdx}`. Now arrow keys properly announce the active option.

#### C-2 — Detail panel does not move focus when opened; keyboard users have no way in
- WCAG 2.4.3 Focus Order (Level A), 2.4.7 Focus Visible (Level AA)
- File: `src/lib/components/PackageDetail.svelte:154-166`
- Evidence: opening the slide-over via `PackageRow` (Enter on a row) fires `onSelect → ui.selectPackage`. The panel mounts conditionally in `src/routes/+page.svelte:123-125`. No `$effect` moves focus into the panel; no `tabindex="-1"` + `.focus()` on a heading; the close-X button at `PackageDetail.svelte:161` is the first focusable but never receives focus on open.
- Impact: a keyboard user activates a row, hears nothing change (panel content is `aside aria-label="Package detail"` but they're still focused on the row), and has to Tab from current position past the *rest* of the entire installed-packages list, the sidebar, the drawer — before reaching the panel's `[Install]` / `[Uninstall]` button. That's dozens of Tab stops to click the primary action they just opened. They will never figure this out without sighted help.
- Fix: when `ui.selectedPackage` becomes truthy, move focus to the panel's `<h1>` (give it `tabindex="-1"`) or to the close button. Restore focus to the originating row when the panel closes (Esc or close button). Concrete patch:

      // PackageDetail.svelte — inside <script>
      let headingEl: HTMLHeadingElement | undefined = $state();
      let openerEl: HTMLElement | null = null;
      $effect(() => {
        if (ui.selectedPackage) {
          openerEl = document.activeElement as HTMLElement | null;
          // wait for DOM
          queueMicrotask(() => headingEl?.focus());
        }
      });
      function close() {
        ui.closeDetail();
        openerEl?.focus();
      }

      // and in markup:
      <h1 bind:this={headingEl} tabindex="-1">{ui.selectedPackage.name}</h1>

#### C-3 — `:focus-visible` global rule mutates `border-radius` of every focused element
- WCAG 1.4.11 Non-text Contrast (Level AA) collateral damage; not a direct violation but defeats focus indicator clarity and breaks visual identity on cards/pills/modals.
- File: `src/lib/styles/reset.css:61-66`

      :focus-visible {
        outline: 2px solid var(--color-border-focus);
        outline-offset: 2px;
        box-shadow: var(--shadow-focus-ring);
        border-radius: var(--radius-md);   /* ← problem */
      }

- Impact: every focused element — `Card` with `--radius-lg` (8 px), `Pill` with `--radius-sm` (4 px), `Modal` with `--radius-lg`, status dot with `--radius-full` (a circle!), drawer tabs, etc. — has its corners squashed/expanded to 6 px while focused. The focus ring still draws but the host element changes shape mid-interaction. On the circular status dot button this is especially jarring.
- Fix: remove the `border-radius` line. The outline + box-shadow ring is sufficient; the host element keeps its own radius.

      :focus-visible {
        outline: 2px solid var(--color-border-focus);
        outline-offset: 2px;
        box-shadow: var(--shadow-focus-ring);
      }

  If you want the ring to follow the element's own radius (and many designs do), drop `border-radius` and rely on `outline` matching the element shape — modern Safari/Chrome already round `outline` to match `border-radius`.

---

### IMPORTANT

#### I-1 — `Pill` tones fail WCAG AA contrast (cask 2.9 : 1, warning 2.7 : 1, danger 4.0 : 1, formula 4.3 : 1)
- WCAG 1.4.3 Contrast Minimum (Level AA)
- File: `src/lib/components/Pill.svelte:30-38` (token sources `tokens.css:9-39, 33-39`)
- See §2.3 above for the numbers. Pills are visible on every list row across the entire app.
- Fix: bump the foreground stop in `tokens.css`. Concretely:
  - `--color-brand` for the cask pill needs to be darkened so 4.5 : 1 holds against `--color-brand-subtle`. Easiest: introduce a new token `--color-cask-on-subtle: oklch(45% 0.13 45)` (≈ `#7a4708`), used by `Pill.svelte` only for the `tone-cask` case. Same approach for warning and danger:
    - `--color-formula-on-subtle: oklch(40% 0.15 250)` (≈ `#1e40af`) — gives ~6.0 : 1 on `#dbeafe`
    - `--color-warning-on-subtle: oklch(48% 0.14 75)` (≈ `#854d0e`) — gives ~5.0 : 1 on `#fef9c3`
    - `--color-danger-on-subtle: oklch(45% 0.20 27)` (≈ `#991b1b`) — gives ~5.5 : 1 on `#fee2e2`
  - Repeat for dark mode, where the subtle is dark and the fg needs to be brighter (use ~78–85 % L).
- Alternatively swap from `subtle` background to a **bordered transparent** pill: `background: transparent; border: 1px solid currentColor; color: var(--color-brand);` — then the brand color itself sits on `surface` (already 5.4 : 1 for amber in dark mode — check light). This was the macOS convention before Big Sur and reads cleanly.

#### I-2 — `text-muted` text fails AA on `surface` and `surface-sunken` (light mode only)
- WCAG 1.4.3 Contrast Minimum (Level AA)
- Files using `var(--color-text-muted)` for **body-sm or smaller**:
  - `src/lib/components/Library.svelte:189` — sticky list-header text
  - `src/lib/components/Trending.svelte:152` — `.rank` numeric (and `.list-header:129`)
  - `src/lib/components/PackageDetail.svelte:334` — `.meta dt` labels
  - `src/lib/components/Snapshots.svelte:265, 270` — `.path` and `.hint`
  - `src/lib/components/Sidebar.svelte:227, 246` — status text
  - `src/lib/components/CommandPalette.svelte:223, 247, 262, 268, 279, 281`
  - `src/lib/styles/typography.css:37, 39, 52` — `.text-caption`, `.text-muted`, `.uppercase-label`
- Spec already flagged this at `designSystem.md:723`: *"Muted at 4.6:1 — passes but close. Frontend Developer: re-verify with axe DevTools."* My computation says it's actually 4.4 : 1 on `surface` and 4.0 : 1 on `surface-sunken` — **fails** AA for the small text it's used for.
- Fix: darken `--color-text-muted` in light mode from `oklch(55% …)` to `oklch(48% 0.005 95)` (≈ `#615e58`). New ratio on `#fdfcfa`: ~5.7 : 1. Dark mode is fine as-is.

#### I-3 — `--color-warning` text (the upgrade-available signal) fails AA in light mode
- WCAG 1.4.3 Contrast Minimum (Level AA)
- Files: `PackageRow.svelte:60-66` (`.upgrade` chevron + version label), `PackageDetail.svelte:336` (`.warn` "Upgrade available" label), `Pill.svelte` warning tone, `ActivityDrawer.svelte:198-202, 254` (running-state `.dot` and `.running` text in strip — though `.running` uses `text-primary`).
- The warning color `#ca8a04` on `#fdfcfa` is 2.9 : 1 — fails normal-text AA. It's a **load-bearing UI signal** ("upgrade available", "running"); not just decoration.
- Mitigating factor: signal is doubled — the chevron icon + version + the row's outdated chip + the sidebar badge all communicate the same thing. So a sighted-low-vision user has multiple cues. But the text itself is unreadable for them.
- Fix: light-mode `--color-warning` should drop to `oklch(48% 0.14 75)` (≈ `#854d0e`, ~5.0 : 1) for **text use**, and keep a separate brighter `--color-warning-icon` for the dot/icon backgrounds where contrast is against the larger background, not the text itself.

#### I-4 — Filter "pillgroup" misuses `role="tablist"` / `role="tab"` (no tabpanels)
- WCAG 4.1.2 Name, Role, Value (Level A) — incorrect roles
- Files:
  - `src/lib/components/Library.svelte:61-76` — `<div class="pillgroup" role="tablist" aria-label="Type filter">` with `<button role="tab" aria-selected={…}>` — but there is **no `role="tabpanel"`** below, and no `aria-controls` linking tab to panel. The same list area shows below regardless of which "tab" is active; this is a filter, not a tabset.
  - `src/lib/components/Trending.svelte:40-44` — same pattern: time-window selector marked as `role="tablist"` / `role="tab"` with no panels.
- Why it's wrong: screen readers announce "tab 1 of 4, All, selected" but pressing arrow keys (the standard tab-list interaction) does nothing — the buttons don't intercept Arrow. Users learn they're in a tablist and try the tab-navigation pattern, which fails.
- Fix: drop the tab roles. Use `<div role="group" aria-label="Type filter">` and on each button `aria-pressed={filter === f}`. That correctly conveys "toggle button group, All, pressed". The visual remains a segmented control; the semantics finally match.

#### I-5 — Sidebar theme tri-toggle uses generic `role="group"` instead of radiogroup
- WCAG 4.1.2 (Level A)
- File: `src/lib/components/Sidebar.svelte:108-112`
- Current: `<div class="theme" role="group" aria-label="Theme">` with three plain `<button aria-label="…">`. The buttons mutually exclude (it's a tri-state) but ATs don't know that. VO reads "Light theme, button" with no selection state.
- Fix: `<div role="radiogroup" aria-label="Theme">` and on each button `role="radio" aria-checked={ui.theme === 'light'}`. The `.on` class already gives the visual selected state; this exposes it semantically.

#### I-6 — No keyboard arrow-key navigation between list rows (despite spec)
- `uxArchitecture.md §8` says `↑ / ↓ Navigate rows in any list (including palette results)` and `Enter Open selected row's detail panel`. Implementation reality: only CommandPalette wires arrow keys (`CommandPalette.svelte:118-131`). Library, Discover, Trending, ActivityHistory all rely on Tab to step through rows; arrow keys do nothing.
- WCAG 2.1.1 Keyboard (Level A) — technically pass (every row IS reachable via Tab), but spec drift.
- Fix: lift a tiny `useListboxKeyboard()` helper or inline in each list — on the list container, capture ArrowDown/ArrowUp to advance `focus()` between `.row` children; Home/End to jump; Enter to activate the focused row (already wired since rows are `<button>`). This also lets you drop the listbox/option ARIA mess (C-1) by using a real listbox with `aria-activedescendant`, **or** keep it as plain buttons and just provide keyboard convenience.

#### I-7 — Touch / hit targets below WCAG 2.5.8 (24 × 24 px) in several controls
- WCAG 2.5.8 Target Size (Minimum) — Level AA in WCAG 2.2
- File / element measurements:
  - `src/lib/components/Sidebar.svelte:208-216` — `.theme button` is 24 × 22 px (height 22 px — fails by 2 px)
  - `src/lib/components/ActivityDrawer.svelte:204-211` — `.ctl` buttons: padding `2px var(--space-2)` (2 px vertical), font-size 11 px → ~16–18 px tall; **fails 24 px** for Cancel, Copy log, Close drawer (close-drawer has the X-icon variant lines 117-120, padding 2px around 14px → ~18px)
  - `src/lib/components/ActivityDrawer.svelte:241-246` — `.tabs .x` close-tab button: padding `0 4px`, font 14 px → ~14 px tall; **fails badly**
  - `src/lib/components/Toast.svelte:75-80` — `.close` button: padding 2 px around 14 px icon → ~18 px tall; **fails**
  - `src/lib/components/Trending.svelte:108-119` — `.pillgroup button` (window selector): padding `var(--space-1) var(--space-3)` (4 × 12), font 12 → ~22 px tall; **fails by 2 px**
  - `src/lib/components/Library.svelte:150-159` — `.pillgroup button` (filter chips): same as above; **fails by 2 px**
  - `src/lib/components/Modal.svelte:167-172` — close-X is 4 px padding around 16 px = 24 × 24; **passes** ✓
  - `src/lib/components/Button.svelte:76` — `.btn-sm` is 24 × 24+; **passes** ✓
- Mitigating exception: WCAG 2.5.8 allows the *spacing exception* (target's spacing makes the target effectively ≥ 24 px). The drawer's `.ctl` buttons sit in a flex row with `gap: var(--space-1)` (4 px) — total hit cell becomes (button + 4) which barely qualifies. The tab close-X is adjacent to the tab button with no gap — fails. Toast close has no neighbor — straight fail.
- Fix: bump padding on the failing controls; the easiest pattern is a tiny mixin so all icon-only buttons hit 24 × 24 minimum.

      /* in reset.css or tokens.css */
      .icon-button-24 {
        min-width: 24px;
        min-height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

  Apply to: `Toast .close`, `ActivityDrawer .ctl` and `.tabs .x`, `Sidebar .theme button`, `Library .pillgroup button`, `Trending .pillgroup button`.

#### I-8 — Command Palette is missing combobox semantics; AT users can't navigate
- WCAG 4.1.2 (Level A), 1.3.1 Info and Relationships (Level A)
- File: `src/lib/components/CommandPalette.svelte:136-187`
- The input at line 139-146 has `aria-label` but no `role="combobox"`, no `aria-expanded`, no `aria-controls`, no `aria-activedescendant`. The `.results` block at line 150 has no `role="listbox"`. The `.result` buttons at line 159-174 have no `role="option"` and no `aria-selected`. Arrow keys move `selectedIdx` and re-render `.on` visually — but a screen reader user pressing ArrowDown hears nothing.
- The palette is the entire keyboard-first power-user story (`uxArchitecture.md §1`). If it's silent to AT, the headline feature is mouse-only.
- Fix: full combobox pattern. Sketch:

      <input
        bind:this={inputEl}
        type="text"
        role="combobox"
        aria-expanded={totalItems > 0}
        aria-controls="palette-listbox"
        aria-activedescendant={totalItems > 0 ? `palette-opt-${selectedIdx}` : undefined}
        aria-autocomplete="list"
        aria-label="Command palette search"
        … />

      <div id="palette-listbox" role="listbox" class="results">
        {#each groups as g (g.label)}
          <div role="group" aria-label={g.label}>
            <div class="group-label" aria-hidden="true">{g.label}</div>
            {#each g.items as entry (entry.idx)}
              <button
                role="option"
                id="palette-opt-{entry.idx}"
                aria-selected={entry.idx === selectedIdx}
                … >
                …
              </button>
            {/each}
          </div>
        {/each}
      </div>

#### I-9 — Modal `Tab` focus trap can corner a single-focusable dialog into an infinite loop
- WCAG 2.1.2 No Keyboard Trap (Level A) — fail edge case
- File: `src/lib/components/Modal.svelte:87-97`
- Logic: traps Tab inside `dialogEl`. If the dialog has exactly one focusable (e.g. a custom error modal with only a Close-X), Tab and Shift+Tab both keep focus on the same element — which is fine — but on a modal with **zero focusables** (theoretical edge), `focusables.length === 0` early-returns and Tab escapes the modal entirely. Worse, modals where `dismissible=false` AND no focus targets exist (none in current code) would lock the user out.
- Minor bug: when the only focusable is the close-X in the header and `defaultFocus="cancel"` is set but there's no cancel-tagged element, `pickInitialFocus` will fall back to `inFooter ?? inBody ?? inHeader` and land on the close-X. The Esc-priority intent (`defaultFocus="cancel"` puts Enter-by-default on safe action) is then defeated — Enter on the focused close-X dismisses, which is *also* safe, so this is benign today but fragile.
- Fix: track Tab even on single-element dialogs (current code handles this — `first === last` → both branches call `.focus()` on the same element, harmless). For zero-focusable modals add a `tabindex="-1"` on the dialog wrapper itself so it can receive focus on open. Not a critical-fix blocker; raise to important because the Esc-priority architecture in `+page.svelte:82-84` (palette → detail) doesn't include modals (because Modal handles its own Esc with `stopPropagation`), but multi-stacked modals (DestructiveConfirm over a parent Modal) both have window-level keydown listeners → Esc closes the inner one only because of `e.stopPropagation()` … which works, but it's accidentally correct, not designed.

---

### NIT

#### N-1 — `<aside>` for PackageDetail has no `role="region"` redundancy clarification
- File: `PackageDetail.svelte:155` — `<aside class="detail" aria-label="Package detail">` — fine in isolation, but `aside` is announced as "complementary" which is misleading for a content-detail panel. Consider `<section aria-label="Package detail">` so AT reads "Package detail, region" instead of "complementary".

#### N-2 — `Activity` toast stack uses `aria-relevant="additions"` (deprecated in modern AT behavior)
- File: `Toast.svelte:11` — `aria-relevant` is largely ignored by modern screen readers and the default ("additions text") is what you want. Safe to drop. Not a bug, just dead attribute.

#### N-3 — Hyperlinks open external URLs without warning
- File: `PackageDetail.svelte:201-206` — `.homepage` button opens an external URL via `tauri-plugin-opener`. The button has no indication it opens externally. WCAG 3.2.5 Change on Request (AAA) suggests warning. Minimum useful addition: `aria-label={`Open homepage (external): ${pkg.homepage}`}`. The `<ExternalLink size={12} />` icon is visual-only with `aria-hidden` implied (it's a child). Add an SR-only suffix or aria-label.

#### N-4 — `caveats` block uses `<pre>` without `aria-label`
- File: `PackageDetail.svelte:208-213` — caveats are meaningful prose; wrapping in `<pre>` without a label means AT reads "preformatted" but no context. The `<h3>Caveats</h3>` above provides context, OK. But the pre's whitespace may cause weird pauses in screen reader output. Consider `<div class="caveats-text">` with `white-space: pre-wrap` instead of `<pre>`.

#### N-5 — Sidebar status button's multi-line `aria-label` will read with extra silence
- File: `Sidebar.svelte:121` — `aria-label={statusTooltip}` where `statusTooltip` contains `\n` (line 67-72). AT typically reads `\n` as a comma or just collapses it. Not a bug, just a slight oddness in the spoken output ("brew 5.1.13 found at /opt/homebrew/bin/brew **(pause)** 1 brew operation running").

#### N-6 — Sidebar `.brand-mark` 🍺 emoji is the only visible logo and has `aria-hidden`
- File: `Sidebar.svelte:81` — `<span class="brand-mark" aria-hidden="true">🍺</span>` — fine, "brew-browser" text is right next to it. Just noting that without the emoji, AT users get the same content (correct).

#### N-7 — No skip-link to main content
- File: `src/routes/+page.svelte:103-130` — the layout is sidebar → main → detail. Tab order starts in sidebar; a keyboard user always traverses 5 nav items before reaching content. A `<a href="#main" class="sr-only-focusable">Skip to main content</a>` at the top of the page would help. Low priority because the sidebar is 5 items and very predictable, but it's the standard pattern.

#### N-8 — Activity drawer cancel-job button has no destructive confirmation
- File: `ActivityDrawer.svelte:110-112` — `<button onclick={() => activity.cancel(activeJob!.jobId)} title="Cancel">` immediately cancels a running brew op. `uxArchitecture.md §4 (Cancel)` explicitly says: *"Drawer header `✕` on a running op shows confirmation: 'Cancel running install?'"*. The current code skips the confirmation. Not an a11y bug per se, but for cognitive-accessibility (preventing accidental destructive actions, WCAG 3.3.4 Error Prevention) it should use the existing `DestructiveConfirm` modal.

---

## 4. Keymap audit — spec vs. reality

Source of truth: `uxArchitecture.md §8` (lines 372-392) and `frontendComponents.md` (lines 109-122).

Implementation: `src/routes/+page.svelte:34-95` plus `CommandPalette.svelte:118-131` and `Modal.svelte:80-98`.

| Shortcut | Spec'd | Implemented | Notes |
|---|---|---|---|
| `Cmd+K` | open palette | ✓ `+page.svelte:38-42` | works; accepts `metaKey || ctrlKey` (x-platform-friendly even though Cmd is the only macOS convention — fine, future-proof for Linux/Win build) |
| `Cmd+1..5` | section nav | ✓ `+page.svelte:62-67` | works |
| `Cmd+F` | focus search | **NOT implemented** — only `/` is bound (`+page.svelte:88-94`). Browsers may still do their own Find behaviour in WKWebView. Mac users will instinctively try `Cmd+F`. | Important |
| `/` | focus filter | ✓ `+page.svelte:88-94` | works; excludes text-input focus via `isTextInput` |
| `Cmd+N` (Snapshots) | new snapshot | **NOT implemented** | Spec calls it out; Phase 4 partially shipped without it. Important |
| `Cmd+R` | refresh current view | ✓ `+page.svelte:69-79` | works; dispatches by section |
| `Esc` | close palette → modal → detail | ✓ partially | Modal owns its own Esc (`Modal.svelte:82-84` with `stopPropagation`). +page.svelte handles palette and detail (`+page.svelte:82-85`). Order is palette → detail. Modal is implicitly first because of stopPropagation. Works in practice, but **`Cmd+,` Open preferences popover** is spec'd and not implemented (acknowledged in `frontendComponents.md:147`). |
| `Enter` (in list) | open selected row | ✗ on Library/Discover/Trending — rows are `<button>`, so Enter does work *when the row has focus*, but there's no concept of "selected row" via keyboard since arrow keys don't navigate (see I-6). Only CommandPalette has full arrow + Enter. |
| `↑ / ↓` (in list) | navigate rows | **NOT implemented** in Library/Discover/Trending (I-6). Works in CommandPalette. | Important |
| `Cmd+,` | preferences popover | **NOT implemented** | acknowledged | Nit (deferred Phase) |
| `Cmd+L` | toggle drawer | ✓ `+page.svelte:55-59` | works |
| `Cmd+Shift+L` | cycle theme | ✓ `+page.svelte:45-52`, **checked BEFORE Cmd+L** (correct order — was a bug fixed in pass 2 per agentLog) | works |

### Traps?

- No persistent keyboard trap detected. Modal trap is opt-out via Esc when `dismissible=true` (default).
- The streaming console (`ActivityDrawer.svelte:152`) is scroll-only, no keyboard trap.
- The slide-over PackageDetail does NOT trap focus (correct — it's non-modal), but as flagged in C-2, it doesn't move focus *into* itself either, which is a related but different bug.

---

## 5. macOS-native convention checks

Floor: `designSystem.md §8 (macOS native feel)`.

| Convention | Status | File:line |
|---|---|---|
| Focus rings only on keyboard nav (`:focus-visible`) | ✓ implemented | `reset.css:57-66` (with the C-3 caveat about border-radius mutation) |
| Native file dialogs for Brewfile import/export | ✓ Snapshots uses `@tauri-apps/plugin-dialog` | `Snapshots.svelte:102, 117` |
| In-page modal for destructive confirms (not OS dialog) | ✓ | `DestructiveConfirm.svelte`, used by `PackageDetail.svelte:275-283`, `Snapshots.svelte:220-239` |
| Destructive button on the right, Cancel on left | ✓ `Modal.svelte:177` flex-end, DestructiveConfirm renders Cancel then Confirm | follows macOS convention |
| Default focus = Cancel (safe-Enter) | ✓ `Modal.svelte:46-52`, `DestructiveConfirm.svelte:30` | works |
| `Cmd+W` / `Cmd+Q` left to OS | ✓ not intercepted | `+page.svelte` |
| Scrollbars unstyled | ✓ default WKWebView | (intentional per spec §8) |
| 1100 × 720 default window | ✓ confirmed in `tauri.conf.json` (not re-read here, per `frontendComponents.md`) | spec |
| Sidebar status indicator dot color (green/amber/red/unknown) | ✓ `Sidebar.svelte:58-72, 243-246` | works; uses semantic tokens — but the muted "unknown" dot color (`text-muted` = `#7a766f` on `surface-raised` = `#ffffff`) is ~4.4 : 1 which barely passes — the dot is 8 × 8 px so 3 : 1 (non-text) applies and passes |

---

## 6. Streaming output & live regions

`designSystem.md §9 (ARIA)` requires: `Console: role="log" + aria-live="polite" + aria-atomic="false"`.

Implementation: `ActivityDrawer.svelte:152`:

    <div class="console" bind:this={consoleEl} onscroll={onScroll} role="log" aria-live="polite" aria-atomic="false">

**Pass.** Exactly per spec. Each `.line` is announced as it's added; previous lines are not re-read. VoiceOver / NVDA will handle this correctly.

Toast stack uses `aria-live="polite"` on the container and `role="alert"` for error/warning toasts (`Toast.svelte:11, 13`). `role="alert"` is implicitly `aria-live="assertive"`, which contradicts the prompt's "avoid assertive" instruction — but it matches `designSystem.md §9`'s spec line: *"Toasts: role='status' for info/success, role='alert' for warning/error."*. **The spec wins; the implementation is correct.** Assertive is the right call for failed installs — the user just kicked off a 30-second op, they need to know.

---

## 7. What I could NOT audit without a running app

To be honest about the limits of static review:

1. **Real screen reader behavior.** VoiceOver, NVDA, and JAWS all handle ARIA edge cases differently. The `<button role="option">` issue (C-1) is *definitely* non-conformant per spec; how each AT actually announces it varies, and I can't test that without the app running with the screen reader open.
2. **Focus-ring rendering.** I can read the CSS, but can't see whether the 3 px focus-ring shadow + 2 px outline + 2 px offset actually composes cleanly on every component (especially the slide-over panel's close-X near the panel edge — may get clipped by `overflow: hidden` on the parent).
3. **Real motion timing.** `prefers-reduced-motion` is wired (`app.css:30-37`, plus per-component overrides at `Modal:188-190`, `Toast:87-89`, `LoadingState:39-41`, `PackageDetail:301-303`). Whether the override **actually** suppresses all animations on the test machine — and whether spinners fall back to text per spec (they don't, currently — the loader-circle in Button still spins because the CSS animation rule is `animation-duration: 0.01ms !important` which makes it complete one rotation in 0.01ms, looking still but not actually replaced by text). Minor finding — see N-9 below.
4. **Touch interactions.** Tauri on macOS is mouse + keyboard + trackpad. No physical touch, so 2.5.8 target-size is somewhat theoretical — but Apple's HIG also calls for 28 × 28 px minimum hit areas for trackpad accuracy, and that does apply.
5. **Voice Control compatibility.** macOS Voice Control needs every actionable element to have a unique visible label or `aria-label`. The icon-only buttons (drawer `.ctl`, toast close, sidebar status dot) all have `aria-label` set, so they should work — but I can't verify "show numbers" mode without running it.
6. **Browser zoom 200%.** Token sizes are all px; layout uses flex/grid; should reflow. I can't confirm without running.
7. **High-contrast / forced-colors mode.** No `@media (forced-colors: active)` rules in the codebase. macOS Increase Contrast preference is not the same thing, but the equivalent W3C forced-colors mode would override the OKLCH tokens. Worth a future pass.
8. **Tab order beyond the sidebar.** With the sidebar at 200 px wide + 5 nav items + 4 footer controls, the user Tabs through ~10 elements before reaching `<main>`. Without a skip-link (N-7), this is the default-but-not-great pattern.

#### N-9 (added during §7 review) — reduced-motion fallback for spinners not implemented per spec
- `designSystem.md §6` and §7.9: *"spinners change to a static 'Working…' text label when reduced motion is set"* and *"provide a `<Spinner reducedFallback='Working...'>` variant"*. Current implementation (`Button.svelte:49`, `ActivityHistory.svelte:52`) always renders the LoaderCircle SVG and relies on the global `@media (prefers-reduced-motion)` rule to slow the animation to 0.01ms. This makes the spinner *appear frozen* (a static rotated frame), not replaced with text. Visually static + meaningless to AT.
- Fix: in Button and ActivityHistory, conditionally render `<span aria-live="polite">Working…</span>` when reduced motion is active.

      // small helper
      let reducedMotion = $state(false);
      onMount(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        reducedMotion = mq.matches;
        const fn = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
        mq.addEventListener("change", fn);
        return () => mq.removeEventListener("change", fn);
      });

  Then `{#if reducedMotion}<span class="sr-only">Working…</span>{:else}<LoaderCircle … />{/if}`.

---

## 8. Concrete fix list — for Frontend Developer's pass

In priority order:

1. **C-1 + I-8** — Strip the broken listbox/option ARIA from Library/Discover/Trending; add a real combobox pattern to CommandPalette. (1–2 hours)
2. **C-2** — Focus management for PackageDetail open/close. (~20 min)
3. **C-3** — Remove `border-radius: var(--radius-md)` from `:focus-visible`. (1 line)
4. **I-1 + I-2 + I-3** — Darken `text-muted` / `warning` / introduce per-tone "on-subtle" foreground tokens for Pill. Re-run contrast verification with axe DevTools or Polypane. (~45 min, mostly token tuning + visual review)
5. **I-4** — Replace `role="tablist"`/`role="tab"` with `role="group"` + `aria-pressed` in Library and Trending filter chips. (~10 min)
6. **I-5** — `role="radiogroup"` + `role="radio"` + `aria-checked` for Sidebar theme tri-toggle. (~5 min)
7. **I-6** — Arrow-key navigation in Library/Discover/Trending/ActivityHistory lists. (~30 min)
8. **I-7** — Bump padding on icon-only buttons to 24 × 24 minimum. (~15 min)
9. **N-7** — Skip-link to main content. (~5 min)
10. **N-8** — Wire `DestructiveConfirm` for ActivityDrawer cancel. (~10 min — uses existing component)
11. **N-9** — Reduced-motion text fallback for spinners. (~15 min)

Estimated total: **~4 hours** of focused work to clear everything critical and important.

---

## 9. What's working — credit where due

Not padding; these are real positives worth preserving:

- Semantic HTML is dominant: every button is `<button>`, links are `<a>`, lists are `<ul>`, form input has an associated `<label>` (Snapshots new-modal `:208`). No `<div onclick>`.
- `:focus-visible` macOS convention is implemented at the right layer (global, in `reset.css`).
- Global `prefers-reduced-motion` plus per-component opt-outs.
- Modal focus trap, Esc handling, default-focus-on-cancel — exactly the kind of careful work that catches my eye.
- Streaming console ARIA (`role="log"`, polite, non-atomic) is spec-correct.
- Toast role split (status vs. alert) is spec-correct.
- Icon-only buttons consistently use `aria-label` (good defensive habit).
- `aria-current="page"` on the active sidebar nav item.
- `.sr-only` utility class defined and used by `LoadingState`.
- The Heading hierarchy is sane: `<h1>` per top-level section header (Library, Discover, Trending, Snapshots, Activity, Modal title, PackageDetail name), `<h2>` for sub-sections (Snapshots card label, EmptyState title), `<h3>` for in-detail labels (Caveats). No heading-level skips that I found.
- `tabindex` is not abused; only used in the focus-trap query selector.

This is a high baseline. The remaining work is concentrated and tractable.

---

**End of audit.**
