<script lang="ts">
  import SearchIcon from "@lucide/svelte/icons/search";
  import Pill from "./Pill.svelte";
  import Input from "./Input.svelte";
  import LoadingState from "./LoadingState.svelte";
  import EmptyState from "./EmptyState.svelte";
  import { search } from "$lib/stores/search.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { packages } from "$lib/stores/packages.svelte";
  import type { SearchHit } from "$lib/types";

  function openHit(h: SearchHit) {
    ui.selectPackage(h.name, h.kind);
  }

  let allHits = $derived<SearchHit[]>([
    ...(search.results?.formulae ?? []),
    ...(search.results?.casks ?? []),
  ]);

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      search.run(search.query);
    }
  }
</script>

<section class="discover">
  <header class="panel-head">
    <h1>Discover</h1>
  </header>

  <div class="search-bar">
    <Input
      bind:value={search.query}
      variant="search"
      placeholder="Search the Homebrew index…"
      ariaLabel="Search Homebrew"
      onInput={(v) => search.setQuery(v)}
      onKeydown={handleKey}
    />
    {#if search.recent.length > 0 && !search.results && !search.query}
      <div class="recent">
        <span class="uppercase-label">Recent</span>
        <ul>
          {#each search.recent as r (r)}
            <li><button onclick={() => search.run(r)}>{r}</button></li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <div class="results">
    {#if search.loading}
      <LoadingState rows={6} label="Searching…" />
    {:else if search.error}
      <EmptyState title="Search failed" body={search.error}>
        {#snippet icon()}<SearchIcon size={48} />{/snippet}
      </EmptyState>
    {:else if !search.results && !search.query}
      <EmptyState
        title="Type to search the Homebrew index."
        body={`Roughly 7,000 formulae and 6,000 casks. Two characters to start.`}
      >
        {#snippet icon()}<SearchIcon size={48} />{/snippet}
      </EmptyState>
    {:else if search.results && allHits.length === 0}
      <EmptyState
        title={`Nothing matches "${search.results.query}".`}
        body="Try a shorter or different term."
      >
        {#snippet icon()}<SearchIcon size={48} />{/snippet}
      </EmptyState>
    {:else if search.results}
      <ul class="list" aria-label="Search results">
        {#each allHits as h (h.name + h.kind)}
          {@const installed = h.installed || packages.isInstalled(h.name, h.kind)}
          <li>
            <button class="row" onclick={() => openHit(h)}>
              <span class="name truncate">{h.name}</span>
              <span class="kind"><Pill tone={h.kind === "formula" ? "formula" : "cask"}>{h.kind}</Pill></span>
              <span class="desc truncate text-muted">{h.description ?? ""}</span>
              {#if installed}
                <span class="installed"><Pill tone="success">installed</Pill></span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .discover { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .panel-head {
    display: flex; align-items: center; padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .search-bar { padding: var(--space-4); border-bottom: 1px solid var(--color-border); display: flex; flex-direction: column; gap: var(--space-3); }
  .search-bar :global(.wrap) { width: 100%; max-width: 480px; }

  .recent { display: flex; gap: var(--space-3); align-items: center; }
  .recent ul { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .recent button {
    padding: var(--space-1) var(--space-2);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-sm);
    font-size: var(--text-body-sm);
    color: var(--color-text-secondary);
  }
  .recent button:hover { color: var(--color-text-primary); }

  .results { flex: 1; overflow-y: auto; min-height: 0; }

  .list { display: flex; flex-direction: column; }
  .row {
    display: grid;
    grid-template-columns: 1fr 80px 2fr 90px;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    min-height: 36px;
    text-align: left;
    color: var(--color-text-primary);
    font-size: var(--text-body);
    border-bottom: 1px solid var(--color-border);
  }
  .row:hover { background: var(--color-surface-sunken); }
  .name { font-weight: var(--fw-medium); }
  .desc { font-size: var(--text-body-sm); }
  .installed { justify-self: end; }
</style>
