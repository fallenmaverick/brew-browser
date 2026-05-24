/**
 * In-memory icon cache for cask icons.
 *
 * Backend returns a base64 data URL or `null` for a given cask token. Disk
 * caching lives in the backend; this store is a per-session memoization layer
 * so a re-rendered PackageRow doesn't re-invoke the Tauri command on every
 * Library filter change or section round-trip.
 *
 * Phase 8 — `getIcon(pkg)` now accepts the full Package and routes to the
 * right backend command based on the discriminated `pkg.iconSource`:
 *
 *   - `installedApp` → `cask_icon(token)` (extracts from .app bundle)
 *   - `homepage`     → `cask_icon_from_homepage(token, homepage)` (favicon)
 *   - `none`         → resolved as `null` immediately (no backend call)
 *
 * Cache + dedupe are keyed by `pkg.name` (the brew token). Both backend
 * commands share token-keyed disk caches, so a token resolved one way won't
 * collide with the other route within a single package's lifetime. The
 * sticky-null marker means a "tried, no icon" result is sticky for the
 * session — we don't keep retrying tokens we already know have nothing.
 * `inFlight` deduplicates concurrent calls for the same token (e.g. the same
 * row re-rendering before the first request resolves).
 *
 * No persistence to localStorage — keep this in-memory only; the backend disk
 * cache is the durable layer.
 */

import { caskIcon, caskIconFromHomepage } from "$lib/api";
import type { Package } from "$lib/types";

/**
 * Defense-in-depth: only accept `data:image/{png,jpeg};base64,...` shapes from
 * the backend before binding the string into an `<img src>`. The backend
 * currently always returns PNG, but if it ever returns anything else (bug,
 * future format, compromised binary), we treat it as a miss so a
 * `javascript:`, `https://...`, or `data:image/svg+xml,<script>...` string
 * can never reach the DOM and either exfiltrate the user's IP or — under a
 * loosened CSP — execute.
 *
 * Security audit §M3 (memory-bank/security.md).
 */
function isSafeIconDataUrl(s: string): boolean {
  return s.startsWith("data:image/png;base64,") || s.startsWith("data:image/jpeg;base64,");
}

class IconCacheStore {
  cache = $state<Map<string, string | null>>(new Map());
  inFlight = new Set<string>();
  pending = new Map<string, Promise<string | null>>();

  /**
   * Returns the cached icon (data URL) or `null` if known-missing / no source.
   * Routes to `cask_icon` or `cask_icon_from_homepage` based on `pkg.iconSource`.
   * Fetches from backend on first call per token; coalesces concurrent calls.
   * On backend error returns `null` and caches the miss so we don't retry.
   */
  async getIcon(pkg: Package): Promise<string | null> {
    const token = pkg.name;
    if (this.cache.has(token)) {
      return this.cache.get(token) ?? null;
    }
    const existing = this.pending.get(token);
    if (existing) return existing;

    // Fast path: backend told us there's no source. Cache the miss synchronously
    // and skip the IPC entirely.
    if (pkg.iconSource.kind === "none") {
      this.cache.set(token, null);
      this.cache = new Map(this.cache);
      return null;
    }

    this.inFlight.add(token);
    const source = pkg.iconSource;
    const p = (async () => {
      try {
        let result: string | null;
        switch (source.kind) {
          case "installedApp":
            result = await caskIcon(token);
            break;
          case "homepage":
            result = await caskIconFromHomepage(token, source.homepage);
            break;
        }
        // Defense-in-depth: if the backend ever returns a non-`data:image/...`
        // string, treat it as a miss so a malformed payload can't reach the DOM.
        // Sticky null marker — we won't re-probe the same token. (§M3)
        if (typeof result === "string" && !isSafeIconDataUrl(result)) {
          result = null;
        }
        this.cache.set(token, result);
        // Re-assign to trip Svelte 5 reactivity on Map mutation
        this.cache = new Map(this.cache);
        return result;
      } catch {
        // Backend missing, command not registered, or extraction failed —
        // cache the miss so future renders don't keep invoking.
        this.cache.set(token, null);
        this.cache = new Map(this.cache);
        return null;
      } finally {
        this.inFlight.delete(token);
        this.pending.delete(token);
      }
    })();
    this.pending.set(token, p);
    return p;
  }

  /** Synchronous peek — useful when a component wants to render without awaiting. */
  peek(token: string): string | null | undefined {
    return this.cache.get(token);
  }

  /** Clear everything (debug / test only). */
  clear() {
    this.cache = new Map();
    this.inFlight.clear();
    this.pending.clear();
  }
}

export const iconCache = new IconCacheStore();
