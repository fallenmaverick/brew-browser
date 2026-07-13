<script lang="ts">
  /**
   * Bundles section (M3) — a responsive grid of curated bundle cards. Each
   * card shows the bundle's icon, name, tagline, a capability-aware readiness
   * pill (M1 `readiness()` against the probed `SystemProfile`), and package-kind
   * chips. Clicking a card opens `BundleDetail` for the packages, verdict,
   * caveats, links, and "Install all".
   */
  import Database from "@lucide/svelte/icons/database";
  import Palette from "@lucide/svelte/icons/palette";
  import Image from "@lucide/svelte/icons/image";
  import Brain from "@lucide/svelte/icons/brain";
  import Clapperboard from "@lucide/svelte/icons/clapperboard";
  import Code from "@lucide/svelte/icons/code";
  import Package from "@lucide/svelte/icons/package";

  import ReadinessPill from "./ReadinessPill.svelte";
  import BundleDetail from "./BundleDetail.svelte";
  import { bundles } from "$lib/stores/bundles.svelte";
  import type { Bundle } from "$lib/types";

  // Recipe `icon` names → lucide components. Unknown/missing falls back to a
  // generic package glyph so a new recipe never renders a broken card.
  const ICONS: Record<string, typeof Package> = {
    database: Database,
    palette: Palette,
    image: Image,
    brain: Brain,
    clapperboard: Clapperboard,
    code: Code,
  };
  function iconFor(name: string | null | undefined): typeof Package {
    return (name && ICONS[name]) || Package;
  }

  /** "2 formulae · 1 cask" style chip text for a card. */
  function kindSummary(b: Bundle): string {
    const f = b.packages.filter((p) => p.kind === "formula").length;
    const c = b.packages.filter((p) => p.kind === "cask").length;
    const parts: string[] = [];
    if (f) parts.push(`${f} ${f === 1 ? "formula" : "formulae"}`);
    if (c) parts.push(`${c} ${c === 1 ? "cask" : "casks"}`);
    return parts.join(" · ") || "no packages";
  }

  let selected = $state<Bundle | null>(null);

  // Load bundles + profile on first mount. Idempotent.
  $effect(() => {
    bundles.load();
  });
</script>

<section class="bundles" aria-label="Bundles">
  <header class="head">
    <h1>Bundles</h1>
    <p class="subtitle">
      Curated sets of tools that work together — installed in one click, with a
      readiness check for your machine.
    </p>
  </header>

  {#if bundles.loading && bundles.list.length === 0}
    <p class="muted">Loading bundles…</p>
  {:else if bundles.error}
    <p class="muted">{bundles.error}</p>
  {:else if bundles.list.length === 0}
    <p class="muted">No bundles available.</p>
  {:else}
    <div class="grid">
      {#each bundles.list as b (b.id)}
        {@const Icon = iconFor(b.icon)}
        {@const r = bundles.readinessFor(b)}
        <button type="button" class="card" onclick={() => (selected = b)}>
          <div class="card-top">
            <span class="icon" aria-hidden="true"><Icon size={22} /></span>
            <ReadinessPill verdict={r.verdict} reason={r.reason} />
          </div>
          <h2 class="name">{b.name}</h2>
          <p class="tagline">{b.tagline}</p>
          <p class="kinds">{kindSummary(b)}</p>
        </button>
      {/each}
    </div>
  {/if}
</section>

{#if selected}
  <BundleDetail bundle={selected} onClose={() => (selected = null)} />
{/if}

<style>
  .bundles {
    padding: var(--space-4);
    max-width: 1100px;
    margin: 0 auto;
  }
  .head {
    margin-bottom: var(--space-4);
  }
  .head h1 {
    font-size: var(--text-title);
    font-weight: var(--fw-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1) 0;
  }
  .subtitle {
    color: var(--color-text-muted);
    font-size: var(--text-body);
    margin: 0;
    max-width: 60ch;
  }
  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-body);
    padding: var(--space-4) 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
    padding: var(--space-3);
    background: var(--color-surface-raised, var(--color-surface));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease;
  }
  .card:hover {
    border-color: var(--color-accent, #b8542a);
    background: var(--color-surface);
    transform: translateY(-1px);
  }
  .card:focus-visible {
    outline: 2px solid var(--color-accent, #b8542a);
    outline-offset: 2px;
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .name {
    font-size: var(--text-body);
    font-weight: var(--fw-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }
  .tagline {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.35;
  }
  .kinds {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0 0;
  }
</style>
