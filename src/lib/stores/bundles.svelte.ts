/**
 * Bundles store — lazy-loads the curated bundle recipes via the `bundles`
 * Tauri command (backed by the embedded `bundles.json`), holds them, and pairs
 * each with the M1 `SystemProfile` to compute capability readiness client-side.
 *
 * Singleton: import `bundles` from this module everywhere; the store fetches
 * bundles + profile once per process and caches the result.
 */

import { bundles as fetchBundles, systemProfile } from "$lib/api";
import type { Bundle, Readiness, SystemProfile } from "$lib/types";
import { readiness } from "$lib/util/readiness";

/** localStorage key that overrides the probed RAM so Marginal/Blocked states
 *  are reachable on a big dev box (e.g. the 128 GB Mac). Set e.g.
 *  `localStorage["brewbrowser.fakeRamGB"] = "8"` and reload. Mirrors the Rust
 *  `BREWBROWSER_FAKE_RAM_GB` env override. */
const FAKE_RAM_KEY = "brewbrowser.fakeRamGB";

class BundlesStore {
  list: Bundle[] = $state([]);
  profile: SystemProfile | null = $state(null);
  loading: boolean = $state(false);
  error: string | null = $state(null);
  loaded: boolean = $state(false);

  private loadPromise: Promise<void> | null = null;

  /**
   * Load bundles + the system profile. Idempotent: concurrent or repeat calls
   * share the same in-flight fetch and skip re-fetching once loaded (pass
   * `force` to refetch). Never throws — a load failure lands in `error`.
   */
  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    if (this.loadPromise) return this.loadPromise;

    this.loading = true;
    this.error = null;
    this.loadPromise = (async () => {
      try {
        const [list, profile] = await Promise.all([fetchBundles(), systemProfile()]);
        this.list = list;
        this.profile = this.applyRamOverride(profile);
        this.loaded = true;
      } catch (e) {
        this.error = `Failed to load bundles: ${String(e)}`;
      } finally {
        this.loading = false;
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  /** Apply the debug RAM override to a freshly-probed profile, if set + valid. */
  private applyRamOverride(profile: SystemProfile): SystemProfile {
    try {
      const raw = localStorage.getItem(FAKE_RAM_KEY);
      if (raw === null) return profile;
      const fake = Number.parseInt(raw, 10);
      if (Number.isNaN(fake)) return profile;
      return { ...profile, ramGB: fake };
    } catch {
      // localStorage unavailable (SSR/prerender) — no override.
      return profile;
    }
  }

  /**
   * Capability readiness of a bundle against the probed profile. Falls back to
   * a permissive "ready" verdict until the profile has loaded (the UI shows
   * pills only once loaded, but this keeps the function total).
   */
  readinessFor(bundle: Bundle): Readiness {
    if (!this.profile) return { verdict: "ready", reason: "Ready." };
    return readiness(bundle.requires ?? null, bundle.capabilityNotes ?? null, this.profile);
  }

  /** Look up a single bundle by id. Returns undefined if not loaded/absent. */
  byId(id: string): Bundle | undefined {
    return this.list.find((b) => b.id === id);
  }
}

export const bundles = new BundlesStore();
