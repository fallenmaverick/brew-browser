/**
 * Typed `invoke()` wrappers for every backend command in `memory-bank/backendApi.md`.
 *
 * Convention: each function resolves with the typed result, or *throws* a
 * `BrewErrorPayload`-shaped object on backend error. Callers should use
 * `try/catch` and `isBrewError(e)` to narrow.
 *
 * Streaming commands additionally take an `onEvent(BrewStreamEvent)` callback
 * — the underlying Tauri `Channel<T>` is wired up here so callers don't have
 * to import `@tauri-apps/api/core` directly.
 *
 * NOTE: backend may not be implemented yet. If `invoke()` itself throws (e.g.
 * unknown command) the error propagates — callers should handle that case
 * gracefully (show "Backend not ready" rather than crashing).
 */

import { invoke, Channel } from "@tauri-apps/api/core";

import type {
  BrewEnvironment,
  Brewfile,
  BrewfileCheckReport,
  BrewfileId,
  BrewfileSummary,
  BrewStreamEvent,
  JobResult,
  OutdatedPackage,
  Package,
  PackageDetail,
  PackageKind,
  PackageList,
  SearchResults,
  TrendingReport,
  TrendingWindow,
} from "./types";

// ============================================================
// Phase 1 — read-only browser
// ============================================================

export function brewDoctor(): Promise<BrewEnvironment> {
  return invoke<BrewEnvironment>("brew_doctor");
}

export function brewList(): Promise<PackageList> {
  return invoke<PackageList>("brew_list");
}

export function brewInfo(name: string, kind: PackageKind): Promise<PackageDetail> {
  return invoke<PackageDetail>("brew_info", { name, kind });
}

export function brewOutdated(): Promise<OutdatedPackage[]> {
  return invoke<OutdatedPackage[]>("brew_outdated");
}

// ============================================================
// Phase 2 — search
// ============================================================

export function brewSearch(query: string): Promise<SearchResults> {
  return invoke<SearchResults>("brew_search", { query });
}

export function brewSearchDesc(query: string): Promise<SearchResults> {
  return invoke<SearchResults>("brew_search_desc", { query });
}

// ============================================================
// Phase 3 — install / uninstall / upgrade (streaming)
// ============================================================

/** Helper: wires a Tauri Channel<BrewStreamEvent> to a callback. */
function makeChannel(onEvent: (evt: BrewStreamEvent) => void): Channel<BrewStreamEvent> {
  const channel = new Channel<BrewStreamEvent>();
  channel.onmessage = onEvent;
  return channel;
}

export function brewInstall(
  name: string,
  kind: PackageKind,
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<JobResult> {
  return invoke<JobResult>("brew_install", {
    name,
    kind,
    onEvent: makeChannel(onEvent),
  });
}

export function brewUninstall(
  name: string,
  kind: PackageKind,
  zap: boolean,
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<JobResult> {
  return invoke<JobResult>("brew_uninstall", {
    name,
    kind,
    zap,
    onEvent: makeChannel(onEvent),
  });
}

export function brewUpgrade(
  name: string | null,
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<JobResult> {
  return invoke<JobResult>("brew_upgrade", {
    name,
    onEvent: makeChannel(onEvent),
  });
}

export function brewUpdate(
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<JobResult> {
  return invoke<JobResult>("brew_update", {
    onEvent: makeChannel(onEvent),
  });
}

export function cancelJob(jobId: string): Promise<void> {
  return invoke<void>("cancel_job", { jobId });
}

// ============================================================
// Phase 4 — Brewfile snapshot + restore
// ============================================================

export function brewfileDump(
  label: string,
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<BrewfileSummary> {
  return invoke<BrewfileSummary>("brewfile_dump", {
    label,
    onEvent: makeChannel(onEvent),
  });
}

export function brewfileInstall(
  id: BrewfileId,
  onEvent: (evt: BrewStreamEvent) => void,
): Promise<JobResult> {
  return invoke<JobResult>("brewfile_install", {
    id,
    onEvent: makeChannel(onEvent),
  });
}

export function brewfileCheck(id: BrewfileId): Promise<BrewfileCheckReport> {
  return invoke<BrewfileCheckReport>("brewfile_check", { id });
}

export function brewfileList(): Promise<BrewfileSummary[]> {
  return invoke<BrewfileSummary[]>("brewfile_list");
}

export function brewfileRead(id: BrewfileId): Promise<Brewfile> {
  return invoke<Brewfile>("brewfile_read", { id });
}

export function brewfileDelete(id: BrewfileId): Promise<void> {
  return invoke<void>("brewfile_delete", { id });
}

export function brewfileExport(id: BrewfileId, targetPath: string): Promise<void> {
  return invoke<void>("brewfile_export", { id, targetPath });
}

export function brewfileImport(sourcePath: string, label: string): Promise<BrewfileSummary> {
  return invoke<BrewfileSummary>("brewfile_import", { sourcePath, label });
}

// ============================================================
// Phase 6 — trending
// ============================================================

export function trendingFetch(window: TrendingWindow): Promise<TrendingReport> {
  return invoke<TrendingReport>("trending_fetch", { window });
}

export function trendingClearCache(): Promise<void> {
  return invoke<void>("trending_clear_cache");
}

// ============================================================
// Phase 7 — cask icons
// ============================================================

/**
 * Fetch a cask icon as a base64 data URL (e.g. `data:image/png;base64,…`).
 *
 * Returns `null` when the cask has no resolvable icon (no .app bundle,
 * extraction failed, or network unavailable). Backend (`cask_icon`) handles
 * its own disk caching; the frontend keeps an in-memory layer via the
 * `iconCache` store to avoid re-invoking on every PackageRow render.
 *
 * Only meaningful for `kind === "cask"` — formulae are CLI tools and have
 * no icon. Callers should gate on kind before invoking.
 */
export function caskIcon(token: string): Promise<string | null> {
  return invoke<string | null>("cask_icon", { token });
}

/**
 * Fetch a homepage-derived icon (favicon) for a cask that has no installed
 * `.app` bundle. Returns a base64 data URL on success, `null` on miss/error.
 *
 * Same return semantics as `caskIcon` — the iconCache store treats `null` as
 * sticky so a known-missing cask won't keep retrying within the session. The
 * backend (`cask_icon_from_homepage`) handles its own disk cache (7-day TTL)
 * keyed by token, so calling twice for the same cask = cache hit on the
 * backend.
 *
 * Routing happens in `iconCache.getIcon(pkg)` via `pkg.iconSource.kind`; call
 * sites typically don't invoke this directly.
 */
export function caskIconFromHomepage(token: string, homepage: string): Promise<string | null> {
  return invoke<string | null>("cask_icon_from_homepage", { token, homepage });
}

// ============================================================
// Re-exports for convenience
// ============================================================

export type { Package };
