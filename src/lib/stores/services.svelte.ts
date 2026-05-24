/**
 * Services store — wraps the `services_list` IPC and tracks per-service
 * action progress so the Services page + the per-package detail card can
 * both show a spinner on the row being acted on.
 *
 * Cache strategy: backend memoises for ~5 s. We keep the latest list in
 * memory and re-fetch on Refresh, after every start/stop/restart, and on
 * mount of the Services view.
 */

import {
  servicesClearCache,
  servicesList,
  servicesRestart,
  servicesStart,
  servicesStop,
} from "$lib/api";
import { isBrewError, type Service } from "$lib/types";

type Action = "start" | "stop" | "restart";

class ServicesStore {
  list: Service[] = $state([]);
  loading: boolean = $state(false);
  error: string | null = $state(null);
  /** Service names currently waiting on a start/stop/restart IPC. */
  pending: Set<string> = $state(new Set());

  /** Convenience lookups used by PackageDetail to render service controls. */
  byName(name: string): Service | undefined {
    return this.list.find((s) => s.name === name);
  }
  isPending(name: string): boolean {
    return this.pending.has(name);
  }

  async load(force = false): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      if (force) {
        try { await servicesClearCache(); } catch { /* best-effort */ }
      }
      this.list = await servicesList();
    } catch (e) {
      this.error = isBrewError(e) ? `Couldn't load services: ${e.code}` : `Couldn't load services: ${String(e)}`;
    } finally {
      this.loading = false;
    }
  }

  private setPending(name: string, on: boolean) {
    const next = new Set(this.pending);
    if (on) next.add(name);
    else next.delete(name);
    this.pending = next;
  }

  async act(name: string, action: Action): Promise<void> {
    if (this.pending.has(name)) return;
    this.setPending(name, true);
    try {
      switch (action) {
        case "start":   await servicesStart(name); break;
        case "stop":    await servicesStop(name); break;
        case "restart": await servicesRestart(name); break;
      }
      // Backend invalidates its cache on every action; pull fresh state.
      await this.load(false);
    } finally {
      this.setPending(name, false);
    }
  }

  start(name: string)   { return this.act(name, "start"); }
  stop(name: string)    { return this.act(name, "stop"); }
  restart(name: string) { return this.act(name, "restart"); }
}

export const services = new ServicesStore();
