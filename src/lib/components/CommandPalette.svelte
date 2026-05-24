<script lang="ts">
  import { onMount } from "svelte";
  import Search from "@lucide/svelte/icons/search";

  import { ui } from "$lib/stores/ui.svelte";
  import { packages } from "$lib/stores/packages.svelte";
  import { search } from "$lib/stores/search.svelte";
  import { brewfiles } from "$lib/stores/brewfiles.svelte";
  import { trending } from "$lib/stores/trending.svelte";
  import type { PaletteItem, PackageKind } from "$lib/types";

  let query = $state("");
  let selectedIdx = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (ui.paletteOpen) {
      query = "";
      selectedIdx = 0;
      // focus after mount/render
      setTimeout(() => inputEl?.focus(), 0);
    }
  });

  // Debounced search trigger when query changes
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const q = query;
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length >= 2) {
      searchTimer = setTimeout(() => search.run(q), 300);
    }
  });

  let installedHits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return packages.all
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  });

  let indexHits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q || !search.results || search.results.query.toLowerCase() !== q) return [];
    const all = [...search.results.formulae, ...search.results.casks];
    // hide names we already showed in installed
    const installedNames = new Set(installedHits.map((p) => p.name));
    return all.filter((h) => !installedNames.has(h.name)).slice(0, 10);
  });

  const commands: PaletteItem[] = [
    { kind: "command", id: "library",   label: "Open Library",    shortcut: "⌘1", section: "Nav", run: () => ui.setSection("library") },
    { kind: "command", id: "discover",  label: "Open Discover",   shortcut: "⌘2", section: "Nav", run: () => ui.setSection("discover") },
    { kind: "command", id: "trending",  label: "Open Trending",   shortcut: "⌘3", section: "Nav", run: () => ui.setSection("trending") },
    { kind: "command", id: "snapshots", label: "Open Snapshots",  shortcut: "⌘4", section: "Nav", run: () => ui.setSection("snapshots") },
    { kind: "command", id: "activity",  label: "Open Activity",   shortcut: "⌘5", section: "Nav", run: () => ui.setSection("activity") },
    { kind: "command", id: "drawer",    label: "Toggle Activity drawer", shortcut: "⌘L", section: "View", run: () => ui.toggleDrawer() },
    { kind: "command", id: "refresh",   label: "Refresh Library", shortcut: "⌘R", section: "Action", run: () => packages.load(true) },
    { kind: "command", id: "refresh-trending", label: "Refresh Trending", section: "Action", run: () => trending.load(true) },
    { kind: "command", id: "refresh-snapshots", label: "Refresh Snapshots", section: "Action", run: () => brewfiles.load() },
  ];

  let commandHits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.kind === "command" && c.label.toLowerCase().includes(q));
  });

  type Group = { label: string; items: Array<{ item: PaletteItem; idx: number }> };
  let groups = $derived.by<Group[]>(() => {
    const out: Group[] = [];
    let idx = 0;
    if (installedHits.length > 0) {
      out.push({
        label: "Installed",
        items: installedHits.map((p) => ({
          item: { kind: "package", name: p.name, pkgKind: p.kind, installed: true, description: p.description } as PaletteItem,
          idx: idx++,
        })),
      });
    }
    if (indexHits.length > 0) {
      out.push({
        label: "Index",
        items: indexHits.map((h) => ({
          item: { kind: "package", name: h.name, pkgKind: h.kind as PackageKind, installed: h.installed, description: h.description } as PaletteItem,
          idx: idx++,
        })),
      });
    }
    if (commandHits.length > 0) {
      out.push({
        label: "Commands",
        items: commandHits.map((c) => ({ item: c, idx: idx++ })),
      });
    }
    return out;
  });

  let totalItems = $derived(groups.reduce((n, g) => n + g.items.length, 0));

  $effect(() => {
    if (selectedIdx >= totalItems) selectedIdx = Math.max(0, totalItems - 1);
  });

  function activate(item: PaletteItem) {
    if (item.kind === "command") {
      item.run();
      ui.closePalette();
    } else {
      ui.selectPackage(item.name, item.pkgKind);
      ui.setSection(item.installed ? "library" : "discover");
      ui.closePalette();
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); ui.closePalette(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIdx = Math.min(totalItems - 1, selectedIdx + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); }
    if (e.key === "Enter") {
      e.preventDefault();
      let found: PaletteItem | undefined;
      for (const g of groups) {
        const hit = g.items.find((x) => x.idx === selectedIdx);
        if (hit) { found = hit.item; break; }
      }
      if (found) activate(found);
    }
  }
</script>

{#if ui.paletteOpen}
  <div class="scrim" role="presentation" onclick={() => ui.closePalette()}></div>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="search">
      <Search size={16} />
      <input
        bind:this={inputEl}
        type="text"
        placeholder="Type a command, package, or section."
        bind:value={query}
        onkeydown={onKey}
        aria-label="Command palette search"
        role="combobox"
        aria-controls="palette-listbox"
        aria-expanded={totalItems > 0}
        aria-activedescendant={totalItems > 0 ? `palette-opt-${selectedIdx}` : undefined}
        aria-autocomplete="list"
      />
      <span class="kbd">Esc</span>
    </div>

    <div class="results">
      {#if totalItems === 0}
        <p class="empty">No results.</p>
      {:else}
        <div id="palette-listbox" role="listbox" aria-label="Command palette results">
          {#each groups as g (g.label)}
            <div class="group" role="group" aria-label={g.label}>
              <div class="group-label" aria-hidden="true">{g.label}</div>
              {#each g.items as entry (entry.idx)}
                {@const item = entry.item}
                <button
                  class="result"
                  class:on={entry.idx === selectedIdx}
                  role="option"
                  id="palette-opt-{entry.idx}"
                  aria-selected={entry.idx === selectedIdx}
                  onmouseenter={() => (selectedIdx = entry.idx)}
                  onclick={() => activate(item)}
                >
                  {#if item.kind === "package"}
                    <span class="name">{item.name}</span>
                    <span class="meta">
                      {item.pkgKind}{#if item.installed} · installed{/if}
                    </span>
                  {:else}
                    <span class="name">{item.label}</span>
                    {#if item.shortcut}<span class="meta kbd">{item.shortcut}</span>{/if}
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <footer class="foot">
      <span class="kbd">↑↓</span> navigate
      <span class="kbd">⏎</span> open
      <span class="kbd">Esc</span> close
    </footer>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0;
    background: rgb(0 0 0 / 0.4);
    z-index: 80;
    animation: fadeIn var(--motion-duration-base) var(--motion-ease-out);
  }
  .palette {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    width: 640px;
    max-width: calc(100% - 32px);
    max-height: 60vh;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    z-index: 81;
    display: flex;
    flex-direction: column;
    animation: pop var(--motion-duration-base) var(--motion-ease-out);
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -4px) scale(0.98); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .palette { animation: none; }
  }

  .search {
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }
  .search input {
    flex: 1;
    background: transparent;
    font-size: var(--text-body);
    color: var(--color-text-primary);
  }
  .search input::placeholder { color: var(--color-text-muted); }

  .results {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: var(--space-2);
  }

  .group { margin-bottom: var(--space-2); }
  .group-label {
    padding: var(--space-1) var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: var(--text-caption);
    color: var(--color-text-muted);
    font-weight: var(--fw-semibold);
  }
  .result {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--text-body);
    gap: var(--space-3);
    text-align: left;
  }
  .result.on { background: var(--color-selection-strong); color: var(--color-text-inverse); }
  .meta { color: var(--color-text-muted); font-size: var(--text-body-sm); }
  .result.on .meta { color: var(--color-text-inverse); opacity: 0.85; }

  .kbd {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--color-text-muted);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-sm);
    padding: 1px 6px;
  }

  .foot {
    display: flex; gap: var(--space-3); align-items: center;
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: var(--text-caption);
  }
  .empty { padding: var(--space-4); color: var(--color-text-muted); }
</style>
