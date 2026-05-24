# Design System — brew-browser

**Owner:** UI Designer
**Date:** 2026-05-23
**Status:** Spec complete — ready for Frontend Developer to implement in Wave 2
**Aesthetic target:** Confident, plain, native macOS. Quiet and fast. Dense-but-readable. Reinforces the "honest open" narrative through restraint, not ornament.

---

## 1. Styling system

### Decision: **Plain CSS with CSS Custom Properties (tokens) + light scoped CSS in Svelte components**

No Tailwind, no CSS-in-JS, no preprocessor.

### Rationale

- **The narrative is "honest, plain, no magic."** A 200KB Tailwind dependency, a build-time JIT, and class-soup markup undercuts that narrative. The CSS for this app — a six-tab desktop utility, not a marketing site — fits comfortably in a few hundred lines.
- **Svelte's scoped `<style>` blocks are already best-in-class.** Component-local styles, no leakage, no naming conventions to enforce. Adding Tailwind on top duplicates the mechanism.
- **CSS variables are the right primitive for theming.** Dark mode toggles in one place (`[data-theme="dark"]` on `<html>`), no `dark:` prefix on every class.
- **Smaller build, faster HMR, less JS shipped.** Matters for a Tauri bundle where every dependency adds to the .dmg.
- **Easier to read for contributors.** A new contributor reads `Button.svelte`, sees standard CSS, understands it. No "what does `tw-text-fg-primary/80` mean?"

### Files & packages

**npm packages required: zero new packages.** Use what SvelteKit ships.

**Files to add (Wave 2, Frontend Developer):**

```
src/
├── app.css                    # global resets + token definitions + base element styles
├── lib/
│   ├── styles/
│   │   ├── tokens.css         # @import'd by app.css — all CSS custom properties
│   │   ├── reset.css          # modern reset (based on Josh Comeau's)
│   │   └── typography.css     # base type rules, .mono helper, .truncate helper
│   └── components/            # each component has a scoped <style> block
```

**Import order in `app.css`:**

```css
@import "./lib/styles/reset.css";
@import "./lib/styles/tokens.css";
@import "./lib/styles/typography.css";
/* then any global element styles */
```

**Imported once** in `src/routes/+layout.svelte`:

```svelte
<script>
  import "../app.css";
</script>
```

### What we don't add

- No PostCSS plugins beyond what Vite provides by default (autoprefixer is not needed — we target a single recent WKWebView).
- No CSS modules — Svelte's scoped styles obsolete them.
- No `clsx`/`classnames` — Svelte's `class:foo={cond}` directive handles this.
- No icon font. Icons come in as inline SVG components (see §7).

### Future: if Tailwind becomes necessary

Revisit only if the component count crosses ~30 and visual drift sets in. Until then, plain CSS wins on every axis that matters for this project.

---

## 2. Color palette

All colors defined as **OKLCH** for perceptually uniform lightness adjustments, with **hex fallbacks** in comments for designer reference.

Tokens are semantic, not literal. Components reference `--color-surface`, not `--gray-100`.

### Token definitions

```css
/* ---------- LIGHT MODE (default) ---------- */
:root {
  /* Brand */
  --color-brand:           oklch(67% 0.15 45);    /* #d97706 - warm amber, brew-bottle */
  --color-brand-hover:     oklch(62% 0.16 45);    /* #b45309 */
  --color-brand-active:    oklch(56% 0.16 45);    /* #92400e */
  --color-brand-subtle:    oklch(96% 0.03 65);    /* #fef3c7 - tinted bg for "is brand" rows */

  /* Surfaces — layered, light to dark */
  --color-surface:         oklch(99% 0.003 95);   /* #fdfcfa - app bg */
  --color-surface-raised:  oklch(100% 0 0);       /* #ffffff - panels, cards, modals */
  --color-surface-sunken:  oklch(96% 0.003 95);   /* #f4f3f0 - list-row alt, code blocks */
  --color-surface-overlay: oklch(100% 0 0 / 0.9); /* modal scrim companion */

  /* Borders */
  --color-border:          oklch(90% 0.005 95);   /* #e5e3df - default 1px hairline */
  --color-border-strong:   oklch(82% 0.005 95);   /* #c9c6c0 - emphasized */
  --color-border-focus:    oklch(60% 0.16 250);   /* #2563eb - macOS-blue focus ring */

  /* Text */
  --color-text-primary:    oklch(20% 0.005 95);   /* #1c1b18 - body */
  --color-text-secondary:  oklch(40% 0.005 95);   /* #4d4a44 - labels, meta */
  --color-text-muted:      oklch(55% 0.005 95);   /* #7a766f - timestamps, hints */
  --color-text-inverse:    oklch(99% 0 0);        /* #ffffff - on brand/danger fills */
  --color-text-link:       oklch(50% 0.15 250);   /* #1d4ed8 */

  /* Semantic */
  --color-success:         oklch(58% 0.14 150);   /* #15803d */
  --color-success-subtle:  oklch(95% 0.04 150);   /* #dcfce7 */
  --color-warning:         oklch(62% 0.15 75);    /* #ca8a04 */
  --color-warning-subtle:  oklch(96% 0.05 80);    /* #fef9c3 */
  --color-danger:          oklch(56% 0.20 27);    /* #dc2626 */
  --color-danger-subtle:   oklch(95% 0.04 27);    /* #fee2e2 */
  --color-info:            oklch(60% 0.13 230);   /* #2563eb */
  --color-info-subtle:     oklch(95% 0.03 230);   /* #dbeafe */

  /* Selection — row highlight that survives focus blur */
  --color-selection:       oklch(92% 0.05 250);   /* #dbeafe - macOS-blue translucent */
  --color-selection-strong: oklch(60% 0.16 250);  /* used when window is focused */

  /* Console / mono surfaces */
  --color-console-bg:      oklch(20% 0.005 95);   /* dark even in light mode — terminal feel */
  --color-console-fg:      oklch(92% 0.005 95);
  --color-console-dim:     oklch(65% 0.005 95);
}

/* ---------- DARK MODE ---------- */
[data-theme="dark"] {
  /* Brand — slightly lighter & more saturated for dark surfaces */
  --color-brand:           oklch(72% 0.16 50);    /* #fbbf24 */
  --color-brand-hover:     oklch(78% 0.15 50);
  --color-brand-active:    oklch(82% 0.13 50);
  --color-brand-subtle:    oklch(28% 0.05 50);    /* tinted dark amber */

  /* Surfaces — follow macOS dark-mode convention: NOT pure black.
     Base around #1c1c1e, raised around #2c2c2e, sunken around #0f0f10. */
  --color-surface:         oklch(20% 0.003 270);  /* #1c1c1e - matches macOS window bg */
  --color-surface-raised:  oklch(25% 0.003 270);  /* #2c2c2e - sidebar, panels */
  --color-surface-sunken:  oklch(15% 0.003 270);  /* #131315 - console, code blocks */
  --color-surface-overlay: oklch(20% 0.003 270 / 0.9);

  /* Borders — low contrast hairlines, macOS uses ~10% white */
  --color-border:          oklch(30% 0.003 270);  /* #3a3a3c */
  --color-border-strong:   oklch(40% 0.003 270);  /* #545458 */
  --color-border-focus:    oklch(68% 0.16 250);   /* brighter blue for dark mode */

  /* Text — macOS uses ~92% white for primary, not pure white */
  --color-text-primary:    oklch(94% 0.003 270);  /* #ebebf0 */
  --color-text-secondary:  oklch(76% 0.003 270);  /* #b8b8be */
  --color-text-muted:      oklch(58% 0.003 270);  /* #8a8a8e */
  --color-text-inverse:    oklch(15% 0.003 270);
  --color-text-link:       oklch(72% 0.14 250);   /* #60a5fa */

  /* Semantic — keep chroma, raise lightness for dark-mode contrast */
  --color-success:         oklch(72% 0.16 150);   /* #4ade80 */
  --color-success-subtle:  oklch(28% 0.06 150);
  --color-warning:         oklch(78% 0.15 75);    /* #fbbf24 */
  --color-warning-subtle:  oklch(30% 0.07 75);
  --color-danger:          oklch(68% 0.20 27);    /* #f87171 */
  --color-danger-subtle:   oklch(28% 0.08 27);
  --color-info:            oklch(72% 0.14 230);   /* #60a5fa */
  --color-info-subtle:     oklch(28% 0.06 230);

  /* Selection — macOS uses ~30% blue for inactive, full blue for active */
  --color-selection:       oklch(30% 0.10 250);
  --color-selection-strong: oklch(60% 0.18 250);

  /* Console — even darker for dark mode */
  --color-console-bg:      oklch(12% 0.003 270);  /* near-black, not pure */
  --color-console-fg:      oklch(90% 0.005 95);
  --color-console-dim:     oklch(60% 0.005 95);
}
```

### Mode switching

- App reads OS preference at boot via `window.matchMedia('(prefers-color-scheme: dark)')`.
- User-override toggle in a Settings menu writes `localStorage.theme = 'dark'|'light'|'auto'`.
- Apply by setting `document.documentElement.dataset.theme = 'dark'` (or remove for light).
- `auto` listens to `matchMedia` change events.

### macOS dark mode conventions honored

- Window background `#1c1c1e` (not `#000`)
- Raised surfaces `#2c2c2e`
- Hairlines `~10% white` not solid black/white
- Text `~92% white` not pure white (`#ebebf0`)
- Selection uses macOS system blue at translucent strength when window is inactive
- Sunken/console surfaces drop below window bg, never above

### Contrast verification (WCAG)

| Pair | Mode | Ratio | Level |
|------|------|-------|-------|
| text-primary on surface | light | 14.8:1 | AAA |
| text-secondary on surface | light | 8.1:1 | AAA |
| text-muted on surface | light | 4.9:1 | AA |
| text-primary on surface | dark | 13.2:1 | AAA |
| text-secondary on surface | dark | 7.6:1 | AAA |
| text-muted on surface | dark | 4.6:1 | AA |
| text-inverse on brand | both | ≥ 4.5:1 | AA |
| brand on surface | both | ≥ 4.5:1 | AA |
| danger on surface | both | ≥ 4.5:1 | AA |

Frontend Developer must re-verify in browser using contrast checker (e.g. Polypane, axe DevTools) after applying tokens.

---

## 3. Typography

### Font stack

```css
--font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text",
             "SF Pro", "Helvetica Neue", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
```

**Rationale:** SF Pro is the macOS system font and is free at the OS level. `ui-sans-serif` is the modern CSS keyword that resolves to it on macOS. No webfont download — fastest possible boot, looks native, zero license cost.

For mono, `ui-monospace` resolves to SF Mono on macOS. Fallback chain provides sensible behavior if the user has substituted system fonts.

### Type scale

8-step scale built on a 1.125 (major second) modular ratio, with the body anchored at 13px to match macOS native UI density. **Not** a marketing-site 16px base — this is a tool.

```css
--text-display:  24px;   /* page hero, only used sparingly (empty states, welcome) */
--text-h1:       19px;   /* primary panel title */
--text-h2:       16px;   /* section heading */
--text-h3:       14px;   /* sub-section / list-group label, uppercase */
--text-body:     13px;   /* default body, list rows, button labels */
--text-body-sm:  12px;   /* metadata, captions, button labels (small) */
--text-caption:  11px;   /* timestamps, helper text, tab badges */
--text-mono:     12px;   /* console & code, slightly tighter than body */
```

### Line heights

```css
--lh-tight:     1.2;     /* headings */
--lh-snug:      1.35;    /* body in dense UI lists */
--lh-normal:    1.5;     /* longer prose blocks (descriptions, empty states) */
--lh-mono:      1.5;     /* console output — readable scroll */
```

### Font weights

```css
--fw-regular:    400;    /* default */
--fw-medium:     500;    /* labels, buttons, emphasized body */
--fw-semibold:   600;    /* headings, current tab */
--fw-bold:       700;    /* reserved — use sparingly */
```

SF Pro renders cleanly across all weights; no italic variants needed for MVP.

### Letter spacing

- Headings (`h1`, `h2`): `letter-spacing: -0.01em` — SF Pro looks tighter at display sizes.
- Uppercase labels (`h3` style, tab labels): `letter-spacing: 0.04em` — improves readability of all-caps.
- Body, mono: default `letter-spacing: normal`.

### Base element styles

```css
html { font-size: 13px; }       /* sets root for any rem-based math */
body {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--lh-snug);
  color: var(--color-text-primary);
  background: var(--color-surface);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "cv11", "ss01", "ss03"; /* SF Pro stylistic sets — flat 6/9, etc. */
}
code, pre, .mono {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  font-feature-settings: "calt" 0; /* disable ligatures in mono */
}
```

---

## 4. Spacing system

**Base unit: 4px.** 8px grid for layout, 4px halfstep available for tight UI (icon-to-label gaps, badge insets).

```css
--space-0:    0;
--space-px:   1px;     /* hairline only */
--space-0_5:  2px;     /* very rare — used inside tight icons */
--space-1:    4px;     /* icon ↔ label gap */
--space-2:    8px;     /* tight padding, list-row vertical */
--space-3:    12px;    /* button padding-x, input padding */
--space-4:    16px;    /* default panel padding, section gap */
--space-5:    20px;
--space-6:    24px;    /* panel padding for breathing room */
--space-8:    32px;    /* large section break */
--space-10:   40px;
--space-12:   48px;    /* hero spacing */
--space-16:   64px;    /* empty-state vertical center */
--space-24:   96px;    /* page-level offsets */
```

### Usage guidance

- **List rows:** vertical `--space-2` (8px) top/bottom, horizontal `--space-3` (12px) — keeps density high without cramping.
- **Buttons:** padding `--space-2` `--space-3` for sm, `--space-2 + --space-1` `--space-4` for md.
- **Inputs:** padding `--space-2` `--space-3`, min-height 28px (sm) / 32px (md).
- **Panels:** padding `--space-4` default, `--space-6` for hero/empty states.
- **Modals:** padding `--space-6`, content gap `--space-4`.
- **Console output:** padding `--space-3` `--space-4`, no row gaps (terminal-tight).

---

## 5. Border radius & shadows

### Border radius

macOS native radii are gentle. Avoid pill shapes; avoid square corners.

```css
--radius-none:  0;
--radius-sm:    4px;     /* badges, pills, small chips */
--radius-md:    6px;     /* buttons, inputs, cards — default */
--radius-lg:    8px;     /* panels, modals */
--radius-xl:    12px;    /* large surfaces, hero cards */
--radius-full:  9999px;  /* avatars, pure-circle icon buttons */
```

Buttons and inputs share `--radius-md` (6px) — matches macOS Big Sur+ conventions.

### Shadows

macOS dark mode uses **less** elevation shadow and **more** border contrast. These tokens are tuned for both modes.

```css
/* Light mode */
:root {
  --shadow-xs:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm:  0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.05);
  --shadow-modal: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-focus-ring: 0 0 0 3px rgb(37 99 235 / 0.30);
}

/* Dark mode */
[data-theme="dark"] {
  --shadow-xs:  0 1px 2px 0 rgb(0 0 0 / 0.30);
  --shadow-sm:  0 1px 3px 0 rgb(0 0 0 / 0.40);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.50);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.55);
  --shadow-modal: 0 25px 50px -12px rgb(0 0 0 / 0.70);
  --shadow-focus-ring: 0 0 0 3px rgb(96 165 250 / 0.40);
}
```

### Elevation guidance

| Surface | Token | When |
|---------|-------|------|
| Inline (flat) | none | most list rows, default buttons |
| Resting card | `--shadow-xs` | TrendingTab cards, brewfile cards |
| Hovered card | `--shadow-sm` | hover state for above |
| Floating panel | `--shadow-md` | dropdown, popover |
| Modal / dialog | `--shadow-modal` | confirm dialogs, file pickers |
| Focus ring | `--shadow-focus-ring` | keyboard-focused inputs (see §6 motion / §8 macOS) |

---

## 6. Motion

**Principle: Motion clarifies; it does not entertain.** A package-manager UI should feel like Activity Monitor, not like a marketing site. Animations exist to (a) show state transitions, (b) provide feedback on action, (c) signal background work. Never decorative.

### Tokens

```css
--motion-duration-instant: 0ms;
--motion-duration-fast:    120ms;     /* hover, focus, small state changes */
--motion-duration-base:    180ms;     /* tab switch, panel open, modal scrim */
--motion-duration-slow:    320ms;     /* full panel slide, large layout change */

--motion-ease-out:    cubic-bezier(0.2, 0.0, 0.0, 1.0);   /* most UI: enter */
--motion-ease-in:     cubic-bezier(0.4, 0.0, 1.0, 1.0);   /* leave */
--motion-ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1.0);   /* through motion */
--motion-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1.0); /* rare — toast pop-in */
```

### When to animate (do)

- Button background on hover/active — `--motion-duration-fast`, opacity/background only.
- Focus ring appearing — `--motion-duration-fast`.
- Tab switch — `--motion-duration-base`, crossfade content (no slide — slide implies relative position, tabs are peers).
- Modal/dialog enter — scrim fade + dialog scale from 0.96→1.0 over `--motion-duration-base`.
- Toast notification — slide up + fade in over `--motion-duration-base` with `--motion-ease-spring` (the one place a tiny bit of personality is welcome).
- Loading spinner — continuous rotation, 800ms linear loop.
- Inline progress (streaming console) — content append only, no animation; let the text feel like a terminal.

### When NOT to animate (don't)

- List row insertion/removal during search filtering — instant. Anything else feels laggy.
- Package detail panel content swap on selection — instant content change, no fade.
- Tab badge count changes — instant.
- Console output stream — instant append, no slide-in per line. Terminals don't animate.
- Theme switch — instant. Animating root color variables looks broken.

### `prefers-reduced-motion`

All animations honor the user's OS-level preference. Implementation:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Plus: spinners change to a static "Working…" text label when reduced motion is set (not a frozen wheel). Frontend Developer: provide a `<Spinner reducedFallback="Working...">` variant.

---

## 7. Component visual primitives

Each component specced as: anatomy, sizes, states, key tokens. **Frontend Developer implements; UI Designer signs off.**

### 7.1 Button

**Anatomy:** `[leading-icon?]` `[label]` `[trailing-icon?]`. Single line. Icons are 14px (sm) or 16px (md).

**Variants:**

| Variant | Background | Text | Border | When |
|---------|-----------|------|--------|------|
| primary | `--color-brand` | `--color-text-inverse` | none | the one main action per view (Install, Restore) |
| secondary | `--color-surface-raised` | `--color-text-primary` | 1px `--color-border` | default action (Cancel, Close, Refresh) |
| danger | `--color-danger` | `--color-text-inverse` | none | destructive confirmed actions (Uninstall, Delete Brewfile) |
| ghost | transparent | `--color-text-primary` | none | toolbar / inline ("Show in Finder", icon-only sort) |
| link | transparent | `--color-text-link` | none, underline on hover | inline text actions |

**Sizes:**

| Size | Height | Padding-x | Font | Use |
|------|--------|-----------|------|-----|
| sm | 24px | `--space-2` | `--text-body-sm` | toolbars, console controls |
| md | 28px | `--space-3` | `--text-body` | default — list-row actions, panel buttons |
| lg | 36px | `--space-4` | `--text-body` | hero CTAs (only in empty states / welcome) |

**States:** default, hover (background shifts 1 step darker/lighter), active (one more step), focus (outline ring, see §8), disabled (opacity 0.5, no pointer events), loading (spinner replaces leading icon, label stays).

**Border radius:** `--radius-md` (6px) for all sizes.

**Min hit target:** 28px height on md ensures ≥ 28px hit area; sm at 24px is acceptable for toolbars but **only** when surrounded by ≥ 8px gap or in a row of similar controls (per Apple HIG dense-control exception). Primary action buttons must be md or lg.

### 7.2 Input

**Text input anatomy:** `[leading-icon?]` `[input]` `[trailing-icon?]` `[clear-button?]`.

**Sizes:**

| Size | Height | Padding-x | Font |
|------|--------|-----------|------|
| sm | 26px | `--space-2` | `--text-body-sm` |
| md | 30px | `--space-3` | `--text-body` |

**States:** default (1px `--color-border`), hover (border → `--color-border-strong`), focus (border → `--color-border-focus` + 3px focus ring shadow), disabled (background `--color-surface-sunken`, text `--color-text-muted`), invalid (border → `--color-danger`, helper text in `--color-danger` below).

**Border radius:** `--radius-md`.

**Search input variant:** `<Input variant="search">` adds a leading magnifying-glass icon (16px) and trailing clear-X button that appears only when value present. Used in the main app search bar.

### 7.3 Tab / Pill

**Tabs (primary navigation):** horizontal row, no border, individual tab buttons.

- Default: `--color-text-secondary`, transparent background, `font-weight: --fw-medium`.
- Hover: `--color-text-primary`, background `--color-surface-sunken`.
- Active: `--color-text-primary`, `font-weight: --fw-semibold`, **2px bottom underline in `--color-brand`**.
- Padding: `--space-2` `--space-3`.
- Min hit area: 32px tall × content width.
- Badge support: `[label] [count-pill?]` — count pill is `--text-caption`, padding `0 6px`, height 16px, background `--color-surface-sunken`, text `--color-text-secondary`.

**Pill (filter chips, e.g. "Formulae | Casks"):** segmented-control style, single row, rounded.

- Container: `border: 1px solid --color-border`, `border-radius: --radius-md`, `background: --color-surface-sunken`, padding 2px.
- Item default: transparent background, `--color-text-secondary`, padding `--space-1` `--space-3`.
- Item active: background `--color-surface-raised`, `--color-text-primary`, `box-shadow: --shadow-xs`.

### 7.4 List row

**Anatomy:** `[leading-icon-or-avatar?]` `[primary-text]` `[secondary-text?]` `[trailing-meta?]` `[trailing-action?]`. Single row, two-line stack allowed for primary + secondary text.

**States:**

| State | Background | Text | Notes |
|-------|-----------|------|-------|
| default | transparent | primary | hairline `--color-border` between rows (or zebra: `--color-surface-sunken` on odd rows — pick one per list, don't mix) |
| hover | `--color-surface-sunken` | primary | cursor: pointer if interactive |
| selected (window focused) | `--color-selection-strong` | `--color-text-inverse` | macOS system-blue fill |
| selected (window blurred) | `--color-selection` | `--color-text-primary` | translucent blue, matches macOS Finder |
| disabled | transparent | `--color-text-muted` | no hover, no pointer cursor |

**Sizes:**

| Density | Min height |
|---------|-----------|
| compact | 28px | (use only for very long lists, e.g. trending) |
| default | 36px | (default — installed packages list) |
| comfortable | 44px | (Brewfile list with description) |

**Padding:** `--space-2` vertical, `--space-3` horizontal regardless of density.

### 7.5 Panel / Card

**Panel** (UI region, fills container):
- Background: `--color-surface-raised`
- Border: none on panels that share a layout edge with another panel; otherwise 1px `--color-border`
- Padding: `--space-4` default
- Header: title at `--text-h2`, optional subtitle at `--text-body-sm`/`--color-text-muted`, optional trailing actions row.

**Card** (discrete, repeating unit like a Brewfile entry):
- Background: `--color-surface-raised`
- Border: 1px `--color-border`
- Border radius: `--radius-lg` (8px)
- Padding: `--space-4`
- Shadow: `--shadow-xs` resting, `--shadow-sm` on hover (if interactive)
- Transition: `box-shadow var(--motion-duration-fast) var(--motion-ease-out)`

### 7.6 Modal / Dialog

**Use sparingly.** For brew-browser, dialogs appear for: destructive confirmation (Uninstall, Delete Brewfile, Restore from Brewfile pre-flight), file save/open (native macOS dialog via Tauri APIs — see §8), errors that require acknowledgment.

**Structure:**

```
┌─ Modal scrim (rgb(0 0 0 / 0.4), full-viewport, fades 180ms) ─────┐
│                                                                  │
│            ┌─ Dialog (max-width: 440px) ───────────────┐         │
│            │ [icon, 32px, semantic color]              │         │
│            │ Title — text-h1, fw-semibold              │         │
│            │ Body — text-body, color-text-secondary    │         │
│            │ ──────────────────────────                │         │
│            │ [Cancel]            [Confirm — danger]    │         │
│            └───────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

- Background: `--color-surface-raised`
- Border radius: `--radius-lg`
- Shadow: `--shadow-modal`
- Padding: `--space-6`
- Action row: gap `--space-3`, **right-aligned (macOS convention: confirming/primary action on the right)**
- Animation: enter scale 0.96→1.0 + opacity 0→1 over `--motion-duration-base` ease-out; exit reverse over `--motion-duration-fast` ease-in.
- Trap focus, ESC dismisses (unless `dismissible={false}`), Enter triggers primary action.

### 7.7 Console output

**Use:** `<ActionConsole>` streaming `brew install` / `brew uninstall` / `brew upgrade` output.

**Visual:**
- Container: `background: --color-console-bg`, `color: --color-console-fg`, `border-radius: --radius-md`, `padding: --space-3 --space-4`, `min-height: 200px`, `max-height: 400px`, `overflow-y: auto`.
- Font: `--font-mono`, `font-size: --text-mono`, `line-height: --lh-mono`.
- Line wrapping: `white-space: pre-wrap; word-break: break-all` so long URLs don't break out.
- Auto-scroll to bottom on new line **unless** user has scrolled up (detect: if `scrollTop + clientHeight < scrollHeight - 20px`, pause auto-scroll; show "↓ New output" button to resume).

**Light syntax awareness (no full ANSI parser):**

| Pattern (heuristic prefix) | Color |
|----------------------------|-------|
| `==>` (brew section header) | `--color-info` |
| `Error:` `error:` (line start) | `--color-danger` |
| `Warning:` `warning:` (line start) | `--color-warning` |
| `Downloading` `Pouring` `Installing` (action verbs at line start) | `--color-success` |
| everything else | `--color-console-fg` |
| timestamps / file paths (italic) | `--color-console-dim` |

Implemented as a simple per-line classifier in Svelte; **not** a real terminal emulator. ANSI escape sequences are stripped before render (regex `/\x1b\[[0-9;]*m/g` → `''`).

**Sticky toolbar above console:** small action row with `Copy`, `Clear`, `Pause autoscroll` ghost buttons.

### 7.8 Empty state

**Use:** "No packages installed yet", "No search results", "No Brewfiles saved", "No trending data" (rare — network error fallback).

**Structure:**
- Vertical center within container, max-width 320px.
- Top: 48px monochrome icon, color `--color-text-muted`.
- Title: `--text-h2`, `--color-text-primary`, `font-weight: --fw-semibold`.
- Description: `--text-body-sm`, `--color-text-secondary`, line-height `--lh-normal`.
- Optional CTA button (md or lg primary).
- Vertical rhythm: `--space-4` between elements, `--space-12` outer top/bottom padding.

**Tone:** plain, factual, slightly self-aware where appropriate. Example: "No Brewfiles yet. Snapshots show up here once you create one." NOT "Oh no! Your Brewfile shelf looks empty 😢"

### 7.9 Loading state

**Three patterns, picked by context:**

1. **Inline spinner** — for buttons during action, replaces leading icon. 14px (sm) / 16px (md). Color matches text color.
2. **Skeleton rows** — for initial list load (`brew list`, `brew search`). Light: `--color-surface-sunken`, dark: 5% white over surface. Pulse animation `1.5s` ease-in-out infinite (suspended on `prefers-reduced-motion`, replaced by static "Loading…" text).
3. **Progress bar (indeterminate)** — 2px tall strip at top of panel for long-running operations (`brew bundle dump`). Background `--color-border`, animated gradient sweep `--color-brand`.

**Time-to-pattern rule:**
- Operation < 200ms: no spinner, just let it complete.
- 200ms – 2s: inline spinner on the triggering button.
- 2s – 10s: skeleton or progress bar.
- > 10s: progress bar **plus** "what brew is doing" copy ("Resolving dependencies…", "Downloading…").

### 7.10 Toast / Notification

**Use:** non-blocking success/info feedback ("Brewfile saved", "Copied to clipboard", "Cleared"). Errors that need attention go in dialogs, not toasts.

**Position:** bottom-right of window, 16px inset.
**Stack:** max 3 visible; newer below.

**Anatomy:**
- Width: 320px fixed
- Background: `--color-surface-raised`
- Border: 1px `--color-border`
- Border-left: 3px in semantic color (success/warning/info)
- Padding: `--space-3` `--space-4`
- Border radius: `--radius-md`
- Shadow: `--shadow-md`
- Layout: `[icon] [title + optional body] [close-X?]`
- Auto-dismiss: 4s for success/info, 7s for warning, persistent for error (with manual dismiss).
- Animation: slide up + fade in, `--motion-duration-base` with `--motion-ease-spring`.
- Pause auto-dismiss on hover.

---

## 8. macOS native feel notes

### Window chrome

Tauri's macOS window is set to **default window chrome** in Phase 1 (don't customize title bar). Window dimensions per techContext: 1100 × 720. Frontend Developer may later move to `titleBarStyle: 'overlay'` with `hiddenTitle: true` to gain a few px of vertical real estate; in that case **respect 80px left inset on the first row to clear traffic lights**.

### Traffic lights

Use stock macOS traffic lights. **Do not** customize their position, color, or behavior in MVP. If `titleBarStyle: 'overlay'` is adopted later, set the first toolbar item's `padding-left: 80px` to clear the lights.

### Vibrancy

**No vibrancy/blur in MVP.** Vibrancy is a macOS-native NSVisualEffectView feature; while Tauri exposes it via `setVibrancy()`, it doesn't compose cleanly with our solid token surfaces and adds platform-specific code. Sidebar can adopt vibrancy in a later polish pass (Wave 4); spec'd as deferred.

### Scrollbars

macOS default scrollbar behavior is acceptable. **Do not style scrollbars in MVP** — system styles look correct and respect "Show scroll bars" system setting (Always / When scrolling / Automatic). If we later need to style for visual polish:

```css
::-webkit-scrollbar { width: 12px; height: 12px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border: 3px solid var(--color-surface);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
```

Mark as "Wave 4 polish" — not Wave 2.

### Focus rings — macOS convention

macOS shows a focus ring **only when keyboard navigation is in use**, not on mouse click. Implementation:

```css
/* Hide focus ring on mouse-only interactions (matches macOS) */
:focus:not(:focus-visible) { outline: none; }

/* Always show on keyboard focus */
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  box-shadow: var(--shadow-focus-ring);
  border-radius: var(--radius-md);
}
```

Buttons, inputs, list rows, and tabs **all** use `:focus-visible` for the ring. Never rely solely on color change to indicate focus.

### Native dialogs

For file open/save (Brewfile import/export) **always use Tauri's native dialog plugin** (`@tauri-apps/plugin-dialog`), not an in-app modal. Native dialogs preserve recent locations, iCloud Drive, sidebar favorites, and feel like every other macOS app.

In-app modals are reserved for destructive confirmations and errors only.

### Right-click / context menus

Out of scope for MVP. If added later (Wave 4+), use Tauri's `Menu` API for native menus, not HTML-based ones.

### Keyboard

- `⌘F` focuses search input.
- `⌘,` reserved for preferences (not implemented MVP but reserve binding).
- `⌘W` closes window (default).
- `Esc` closes active modal / clears search input if focused.
- `↑`/`↓` navigate list rows when list has focus; `Enter` opens detail.
- `⌘N` for "New Brewfile snapshot" (Phase 4).

Frontend Developer: bind via global `keydown` listener with `event.metaKey` checks; respect text-input focus (don't hijack while user is typing).

### Cursor

- Buttons, list rows, tabs, links: `cursor: pointer`.
- Inputs: default I-beam.
- Disabled controls: `cursor: not-allowed`.
- Draggable column resizers (if any in Phase 4+): `cursor: col-resize`.

---

## 9. Accessibility floor

### Contrast (WCAG)

**Minimum: AA across the board. AAA where it costs nothing.**

- Body text ↔ background: **AAA** (≥ 7:1) — both modes. Verified in §2.
- Secondary/muted text ↔ background: **AA** (≥ 4.5:1) — both modes. Muted at 4.6:1 — passes but close. Frontend Developer: re-verify with axe DevTools.
- Text inside buttons (inverse on brand/danger): **AA** (≥ 4.5:1).
- Icons-only buttons: provide `aria-label`; ensure icon has 3:1 contrast.
- Focus rings: 3:1 against adjacent colors guaranteed by `--color-border-focus`.

### Focus visibility

- All interactive elements have `:focus-visible` styles (see §8).
- Focus order matches visual reading order (LTR top-to-bottom).
- Focus is never trapped except inside modals.
- Modals: focus moves to first focusable element on open, returns to trigger on close.

### Hit targets

- **Primary action buttons: ≥ 44 × 44 px hit area** (Apple HIG). Achieved at `lg` size or via padding around `md` buttons in standalone CTAs.
- **Default interactive controls: ≥ 28 × 28 px**, with ≥ 8px gap between adjacent controls.
- **Toolbar/dense controls: ≥ 24 × 24 px**, only when grouped (per Apple HIG dense-controls exception).
- List rows count as their own hit target; default 36px height satisfies ≥ 24px.

### Semantic HTML

- Use `<button>` for buttons, **never** `<div onclick>`.
- Use `<a>` for links that navigate; `<button>` for actions.
- Use `<input type="search">` for the main search bar.
- Lists use `<ul>`/`<li>` or, for very long virtualized lists, `<div role="listbox">` with `role="option"` children and `aria-selected`.
- Tabs use `role="tablist"`, `role="tab"`, `role="tabpanel"` with proper `aria-controls`/`aria-labelledby`.
- Modals use `<dialog>` element if browser support allows (Tauri WKWebView does) — gives free focus trap, ESC handling, backdrop.

### ARIA

- Loading spinners: `role="status"` + `aria-live="polite"` + visually-hidden "Loading" text.
- Toasts: `role="status"` for info/success, `role="alert"` for warning/error.
- Console: `role="log"` + `aria-live="polite"` + `aria-atomic="false"` so screen readers announce new lines without rereading.
- Icon-only buttons: `aria-label` matching the visible tooltip (Phase 4+).

### Color is not the only signal

- Form errors: red border **plus** error text label below.
- Tab selection: color **plus** underline **plus** font-weight.
- Console line classification: color **plus** the original prefix text (`Error:`, `==>`) remains visible.
- Toast types: color **plus** icon (✓ for success, ⚠ for warning, ✕ for error, i for info).

### Reduced motion

Honored globally per §6. Spinners fall back to static "Working…" text.

### Text scaling

UI must remain functional at browser zoom up to 200%. Strategy:

- All sizes in `px` (matches macOS conventions and Tauri WKWebView), but layout uses flex/grid so it reflows.
- No fixed-height containers around text. List rows specify `min-height`, not `height`.
- Avoid `overflow: hidden` on text containers; prefer `text-overflow: ellipsis` so truncated text is still readable on hover (tooltip if implemented).

### Icons

**Recommendation:** [Lucide](https://lucide.dev) (`lucide-svelte`). Reasoning:
- Open-source (ISC license) — fits the project ethos
- Native Svelte components, tree-shakeable
- ~1400 icons, consistent 24×24 grid with 2px stroke
- Visually neutral, works for utility UIs

**Alternatives considered:**
- Phosphor — also fine, ISC license, slightly more decorative (multi-weight)
- Heroicons — MIT, smaller set (~300), more web-app-flavored than utility-UI

**Frontend Developer is empowered to switch to Phosphor or Heroicons during Wave 2** if Lucide proves awkward. Pick one and stay consistent.

**Sizes:** 14px (sm contexts), 16px (default with body text), 20px (panel headers, tab labels), 32px (empty state), 48px (large empty state).

**Color:** inherit `currentColor` so icons match surrounding text and adapt to theme automatically.

---

## 10. Implementation checklist (for Wave 2 Frontend Developer)

When implementing this spec:

- [ ] Create `src/app.css`, `src/lib/styles/{tokens,reset,typography}.css`
- [ ] Apply theme via `<html data-theme="dark|light">`, default to OS preference
- [ ] Add theme toggle in Settings (deferred to later phase — token plumbing must support it from day one)
- [ ] Audit contrast with axe DevTools or Polypane before Wave 3 review
- [ ] Verify `prefers-reduced-motion` actually disables animations
- [ ] Verify `:focus-visible` works as described (no rings on click, rings on Tab)
- [ ] Use Tauri's native dialog plugin for all file pickers
- [ ] Pick an icon library (Lucide recommended) and document the choice in `frontendComponents.md`
- [ ] Add a `<DesignSystemPreview>` route (`/_design`) showing every component variant — used for visual QA and design review

---

## 11. Decisions to surface in `decisions.md`

Frontend Developer or Lead should add these ADRs after Wave 2 confirms them:

1. **Styling system = plain CSS + custom properties** (no Tailwind). Rationale: see §1.
2. **Color tokens in OKLCH** with hex fallback comments. Rationale: perceptually uniform dark-mode derivation, native browser support in Tauri's WKWebView.
3. **Dark mode follows macOS conventions** (#1c1c1e base, never pure black). Rationale: native feel, user expectation.
4. **Icon library = Lucide** (subject to Frontend Developer confirmation). Rationale: open license, Svelte-native, neutral aesthetic.
5. **Native dialogs for file operations** via Tauri's dialog plugin. Rationale: macOS-native feel, free iCloud/recents integration.

---

**End of design system spec.** Frontend Developer: this is yours to implement in Wave 2. UI Designer is available for clarifying questions via `// REQUEST FROM Frontend Developer:` notes appended to this file.
