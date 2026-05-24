<script lang="ts">
  import { onMount } from "svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import TrendingUp from "@lucide/svelte/icons/trending-up";

  import Button from "./Button.svelte";
  import Pill from "./Pill.svelte";
  import LoadingState from "./LoadingState.svelte";
  import EmptyState from "./EmptyState.svelte";
  import { trending } from "$lib/stores/trending.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { packages } from "$lib/stores/packages.svelte";
  import type { TrendingWindow } from "$lib/types";

  onMount(() => {
    if (!trending.report) trending.load();
  });

  const windows: TrendingWindow[] = ["30d", "90d", "365d"];

  let agoLabel = $derived.by(() => {
    if (!trending.report) return "";
    const secs = trending.report.cacheAgeSeconds;
    if (secs < 60) return `Updated ${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `Updated ${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `Updated ${hrs}h ago`;
  });

  function openEntry(name: string, kind: "formula" | "cask") {
    ui.selectPackage(name, kind);
  }
</script>

<section class="trending">
  <header class="panel-head">
    <h1>Trending</h1>
    <div class="head-right">
      <div class="pillgroup" role="tablist" aria-label="Time window">
        {#each windows as w (w)}
          <button class:on={trending.window === w} onclick={() => trending.setWindow(w)} role="tab" aria-selected={trending.window === w}>{w}</button>
        {/each}
      </div>
      <span class="ago text-muted">{agoLabel}</span>
      <Button size="sm" variant="ghost" onclick={() => trending.load(true)} title="Refresh" ariaLabel="Refresh trending">
        {#snippet icon()}<RefreshCw size={14} />{/snippet}
        Refresh
      </Button>
    </div>
  </header>

  <div class="list-wrap">
    {#if trending.loading && !trending.report}
      <LoadingState rows={10} label="Fetching install counts from formulae.brew.sh…" />
    {:else if trending.error}
      <EmptyState title="Couldn't reach formulae.brew.sh" body={trending.error}>
        {#snippet icon()}<TrendingUp size={48} />{/snippet}
        {#snippet cta()}<Button variant="secondary" onclick={() => trending.load(true)}>Retry</Button>{/snippet}
      </EmptyState>
    {:else if trending.report && trending.report.entries.length === 0}
      <EmptyState title="Quiet for now." body="formulae.brew.sh returned no entries for this window.">
        {#snippet icon()}<TrendingUp size={48} />{/snippet}
      </EmptyState>
    {:else if trending.report}
      <div class="list-header" aria-hidden="true">
        <span>#</span><span>Name</span><span>Type</span><span>Installs</span><span></span>
      </div>
      <ul class="list" aria-label="Trending packages">
        {#each trending.report.entries as e (e.name + e.kind)}
          {@const installed = e.installedLocally || packages.isInstalled(e.name, e.kind)}
          <li>
            <button class="row" onclick={() => openEntry(e.name, e.kind)}>
              <span class="rank">{e.rank}</span>
              <span class="name truncate">{e.name}</span>
              <span class="kind"><Pill tone={e.kind === "formula" ? "formula" : "cask"}>{e.kind}</Pill></span>
              <span class="count mono">{e.installCountFormatted}</span>
              <span class="trail">
                {#if installed}<Pill tone="success">installed</Pill>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .trending { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .panel-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
  }
  .head-right { display: flex; align-items: center; gap: var(--space-3); }
  .ago { font-size: var(--text-body-sm); }

  .pillgroup {
    display: inline-flex;
    border: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-md);
    padding: 2px;
    gap: 2px;
  }
  .pillgroup button {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--text-body-sm);
    font-weight: var(--fw-medium);
  }
  .pillgroup button.on {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-xs);
  }

  .list-wrap { flex: 1; overflow-y: auto; min-height: 0; }
  .list-header {
    display: grid;
    grid-template-columns: 48px 1fr 80px 120px 100px;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: var(--text-caption);
    font-weight: var(--fw-semibold);
    position: sticky;
    top: 0;
  }
  .list { display: flex; flex-direction: column; }
  .row {
    display: grid;
    grid-template-columns: 48px 1fr 80px 120px 100px;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    min-height: 32px;
    text-align: left;
    color: var(--color-text-primary);
    font-size: var(--text-body);
    border-bottom: 1px solid var(--color-border);
  }
  .row:hover { background: var(--color-surface-sunken); }
  .rank { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
  .name { font-weight: var(--fw-medium); }
  .count { font-variant-numeric: tabular-nums; text-align: right; color: var(--color-text-secondary); }
  .trail { display: flex; justify-content: flex-end; }
</style>
