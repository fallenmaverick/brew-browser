/**
 * Trending store — fetches top-N trending packages per window with cache TTL display.
 */

import { trendingFetch } from "$lib/api";
import { isBrewError, type TrendingReport, type TrendingWindow } from "$lib/types";

class TrendingStore {
  window: TrendingWindow = $state("30d");
  report: TrendingReport | null = $state(null);
  loading: boolean = $state(false);
  error: string | null = $state(null);
  /** local wall-clock of last successful fetch */
  fetchedAtMs: number | null = $state(null);

  async load(force = false) {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      // backend handles 1-hour cache; we always call & trust the returned cacheAgeSeconds
      this.report = await trendingFetch(this.window);
      this.fetchedAtMs = Date.now();
    } catch (e) {
      if (isBrewError(e)) {
        this.error = e.code === "network"
          ? "Couldn't reach formulae.brew.sh"
          : `Failed to load trending: ${e.code}`;
      } else {
        this.error = `Backend not available: ${String(e)}`;
      }
    } finally {
      this.loading = false;
    }
  }

  setWindow(w: TrendingWindow) {
    if (w === this.window) return;
    this.window = w;
    this.report = null;
    this.load();
  }
}

export const trending = new TrendingStore();
