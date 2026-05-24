/**
 * Brewfile snapshot store. Backed by `brewfile_list`.
 */

import { brewfileList } from "$lib/api";
import { isBrewError, type BrewfileSummary } from "$lib/types";

class BrewfilesStore {
  list: BrewfileSummary[] = $state([]);
  loading: boolean = $state(false);
  error: string | null = $state(null);

  async load() {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      this.list = await brewfileList();
    } catch (e) {
      if (isBrewError(e)) {
        this.error = `Failed to load snapshots: ${e.code}`;
      } else {
        this.error = `Backend not available: ${String(e)}`;
      }
      this.list = [];
    } finally {
      this.loading = false;
    }
  }
}

export const brewfiles = new BrewfilesStore();
