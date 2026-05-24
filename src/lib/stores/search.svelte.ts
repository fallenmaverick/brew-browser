/**
 * Search store — drives the Discover view + the command-palette index search.
 * Debounced query → `brew_search`.
 */

import { brewSearch } from "$lib/api";
import { isBrewError, type SearchResults } from "$lib/types";

class SearchStore {
  query: string = $state("");
  results: SearchResults | null = $state(null);
  loading: boolean = $state(false);
  error: string | null = $state(null);
  recent: string[] = $state([]);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  setQuery(q: string) {
    this.query = q;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (q.length < 2) {
      this.results = null;
      this.error = null;
      return;
    }
    this.debounceTimer = setTimeout(() => this.run(q), 300);
  }

  async run(q: string) {
    if (!q || q.length < 2) return;
    this.loading = true;
    this.error = null;
    try {
      this.results = await brewSearch(q);
      // push to recent (dedupe, cap 8)
      this.recent = [q, ...this.recent.filter((r) => r !== q)].slice(0, 8);
    } catch (e) {
      if (isBrewError(e)) {
        this.error = `Search failed: ${e.code}`;
      } else {
        this.error = `Backend not available: ${String(e)}`;
      }
      this.results = null;
    } finally {
      this.loading = false;
    }
  }

  clear() {
    this.query = "";
    this.results = null;
    this.error = null;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}

export const search = new SearchStore();
