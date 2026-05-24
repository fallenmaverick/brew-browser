<script lang="ts">
  import { onMount } from "svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import PackageIcon from "@lucide/svelte/icons/package";

  import Input from "./Input.svelte";
  import Button from "./Button.svelte";
  import PackageRow from "./PackageRow.svelte";
  import LoadingState from "./LoadingState.svelte";
  import EmptyState from "./EmptyState.svelte";
  import { packages } from "$lib/stores/packages.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import type { Package } from "$lib/types";

  type Filter = "all" | "formulae" | "casks" | "outdated";

  let filter: Filter = $state("all");
  let query = $state("");

  let filtered = $derived.by<Package[]>(() => {
    let base: Package[];
    switch (filter) {
      case "formulae": base = packages.formulae; break;
      case "casks":    base = packages.casks; break;
      case "outdated": base = packages.outdated; break;
      default:         base = packages.all;
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    );
  });

  let sorted = $derived([...filtered].sort((a, b) => a.name.localeCompare(b.name)));

  onMount(() => { packages.load(); });

  function openDetail(p: Package) {
    ui.selectPackage(p.name, p.kind);
  }
</script>

<section class="library">
  <header class="panel-head">
    <div class="head-left">
      <h1>Library</h1>
      <span class="count text-muted">{packages.all.length} installed</span>
    </div>
    <div class="head-right">
      <Input bind:value={query} placeholder="Filter…" variant="search" size="sm" ariaLabel="Filter installed packages" />
      <Button size="sm" variant="ghost" onclick={() => packages.load(true)} ariaLabel="Refresh" title="Refresh (⌘R)">
        {#snippet icon()}<RefreshCw size={14} />{/snippet}
        Refresh
      </Button>
    </div>
  </header>

  <div class="filter-bar">
    <div class="pillgroup" role="tablist" aria-label="Type filter">
      {#each (["all","formulae","casks","outdated"] as Filter[]) as f (f)}
        {@const count = f === "outdated" ? packages.outdated.length : null}
        <button
          role="tab"
          aria-selected={filter === f}
          class:on={filter === f}
          onclick={() => (filter = f)}
        >
          {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          {#if count !== null && count > 0}
            <span class="filter-count">{count}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="list-wrap">
    {#if packages.loading && !packages.list}
      <LoadingState rows={8} label="Loading installed packages…" />
    {:else if packages.error}
      <EmptyState
        title="Couldn't load packages"
        body={packages.error}
      >
        {#snippet icon()}<PackageIcon size={48} />{/snippet}
        {#snippet cta()}
          <Button variant="secondary" onclick={() => packages.load(true)}>Retry</Button>
        {/snippet}
      </EmptyState>
    {:else if sorted.length === 0}
      <EmptyState
        title={query ? `Nothing matches "${query}"` : "No packages installed."}
        body={query ? "Try a shorter or different term." : "`brew install wget` would be a fine start. Or open Discover to look around."}
      >
        {#snippet icon()}<PackageIcon size={48} />{/snippet}
        {#snippet cta()}
          {#if !query}
            <Button variant="primary" onclick={() => ui.setSection("discover")}>Open Discover</Button>
          {:else}
            <Button variant="secondary" onclick={() => (query = "")}>Clear filter</Button>
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <div class="list-header" aria-hidden="true">
        <span></span><span>Name</span><span>Version</span><span>Type</span><span>Outdated</span>
      </div>
      <div class="list" role="list" aria-label="Installed packages">
        {#each sorted as p (p.fullName + p.kind)}
          <PackageRow
            pkg={p}
            selected={ui.selectedPackage?.name === p.name && ui.selectedPackage?.kind === p.kind}
            onSelect={openDetail}
          />
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .library {
    display: flex; flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
  }
  .head-left { display: flex; align-items: baseline; gap: var(--space-3); }
  .head-right { display: flex; align-items: center; gap: var(--space-2); }
  .count { font-size: var(--text-body-sm); }

  .filter-bar { padding: var(--space-2) var(--space-4); border-bottom: 1px solid var(--color-border); }
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
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .pillgroup button.on {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-xs);
  }
  .filter-count {
    display: inline-flex;
    align-items: center;
    height: 14px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--color-brand);
    color: var(--color-text-inverse);
    font-size: 10px;
    font-weight: var(--fw-semibold);
  }

  .list-wrap {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .list-header {
    display: grid;
    grid-template-columns: 24px 1fr 120px 80px 120px;
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
    z-index: 1;
  }
  .list { display: flex; flex-direction: column; }
</style>
