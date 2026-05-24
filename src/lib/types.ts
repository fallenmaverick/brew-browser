/**
 * TypeScript equivalents of all Rust DTOs from `memory-bank/backendApi.md`.
 *
 * Camel-case JSON shape on the wire — these types match exactly what
 * `invoke()` returns for each Tauri command.
 */

// =========================================================
// 2.1 Common enums
// =========================================================

export type PackageKind = "formula" | "cask";
export type TrendingWindow = "30d" | "90d" | "365d";

/**
 * Where a package's icon can be sourced from.
 *
 * Phase 8 — discriminated union the backend stamps on every `Package` so the
 * frontend can route to the right extractor without knowing implementation
 * details. Lets installed casks use the local `.app` bundle (fast, exact) and
 * uninstalled casks fall back to a homepage favicon (slower, best-effort).
 *
 * - `installedApp`: the cask has an `.app` in `/Applications` or `~/Applications`
 *   — use `cask_icon` to pull from the bundle.
 * - `homepage`: no installed app bundle but the cask has a homepage URL — use
 *   `cask_icon_from_homepage` to fetch a favicon for that origin.
 * - `none`: no icon source available (formulae always; casks without an app
 *   artifact AND without a homepage).
 */
export type IconSource =
  | { kind: "installedApp" }
  | { kind: "homepage"; homepage: string }
  | { kind: "none" };

// =========================================================
// 2.2 Environment probe
// =========================================================

export interface BrewEnvironment {
  installed: boolean;
  version: string | null;
  prefix: string | null;
  pathUsed: string | null;
}

// =========================================================
// 2.3 Package list (Phase 1)
// =========================================================

export interface Package {
  name: string;
  fullName: string;
  kind: PackageKind;
  installedVersion: string | null;
  stableVersion: string | null;
  description: string | null;
  homepage: string | null;
  license: string | null;
  tap: string | null;
  outdated: boolean;
  pinned: boolean;
  installedOnRequest: boolean;
  installedAsDependency: boolean;
  iconSource: IconSource;
}

export interface PackageList {
  formulae: Package[];
  casks: Package[];
  generatedAt: string;
}

// =========================================================
// 2.4 Package detail (Phase 1)
// =========================================================

export interface PackageOption {
  flag: string;
  description: string;
}

export interface PackageDetail {
  package: Package;
  caveats: string | null;
  dependencies: string[];
  buildDependencies: string[];
  optionalDependencies: string[];
  conflictsWith: string[];
  requirements: string[];
  options: PackageOption[];
  installedPaths: string[];
  analytics30dInstalls: number | null;
  rawJson: unknown;
}

// =========================================================
// 2.5 Outdated (Phase 1 / 3)
// =========================================================

export interface OutdatedPackage {
  name: string;
  kind: PackageKind;
  installedVersions: string[];
  currentVersion: string;
  pinned: boolean;
  pinnedVersion: string | null;
}

// =========================================================
// 2.6 Search results (Phase 2)
// =========================================================

export interface SearchHit {
  name: string;
  kind: PackageKind;
  installed: boolean;
  description: string | null;
}

export interface SearchResults {
  query: string;
  formulae: SearchHit[];
  casks: SearchHit[];
  generatedAt: string;
}

// =========================================================
// 2.7 Streaming events (Phase 3 & 4)
// =========================================================

export type BrewStreamEvent =
  | { kind: "started";  jobId: string; command: string; startedAt: string }
  | { kind: "stdout";   jobId: string; line: string; ts: string }
  | { kind: "stderr";   jobId: string; line: string; ts: string }
  | { kind: "progress"; jobId: string; message: string; percent: number | null }
  | { kind: "exit";     jobId: string; exitCode: number; success: boolean; durationMs: number }
  | { kind: "canceled"; jobId: string }
  | { kind: "error";    jobId: string; error: BrewErrorPayload };

export interface JobResult {
  jobId: string;
  exitCode: number;
  success: boolean;
  durationMs: number;
}

export interface StreamHandle {
  jobId: string;
}

// =========================================================
// 2.8 Brewfile (Phase 4)
// =========================================================

export type BrewfileId = string;

export interface BrewfileCounts {
  taps: number;
  formulae: number;
  casks: number;
  masApps: number;
  vscodeExtensions: number;
}

export interface BrewfileSummary {
  id: BrewfileId;
  label: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  counts: BrewfileCounts;
}

export interface BrewfileFormula { name: string; args: string[] }
export interface BrewfileCask    { name: string; args: string[] }
export interface BrewfileMasApp  { name: string; id: number }

export interface BrewfileEntries {
  taps: string[];
  formulae: BrewfileFormula[];
  casks: BrewfileCask[];
  masApps: BrewfileMasApp[];
  vscodeExtensions: string[];
}

export interface Brewfile {
  summary: BrewfileSummary;
  entries: BrewfileEntries;
  rawText: string;
}

export interface BrewfileCheckReport {
  satisfied: boolean;
  missingTaps: string[];
  missingFormulae: string[];
  missingCasks: string[];
  missingMasApps: string[];
  missingVscodeExtensions: string[];
}

// =========================================================
// 2.9.1 Categories (Phase 9)
// =========================================================

/**
 * One entry in the `categories` map of `categories.json`. The backend bundles
 * the JSON at compile time (see `commands/categories.rs`) so this shape must
 * match the Rust `CategoryMeta` struct.
 *
 * `icon` is the PascalCase name of a Lucide icon (e.g. "Cloud", "Brain"). The
 * frontend resolves it via a static map in `lib/util/categoryIcon.ts` rather
 * than dynamic imports.
 */
export interface CategoryMeta {
  label: string;
  icon: string;
}

/**
 * Full payload of `categories_data`. `casks` and `formulae` map token → array
 * of category slugs (multiple categories per item is the norm).
 */
export interface CategoriesData {
  version: string;
  generatedAt: string;
  model: string;
  categories: Record<string, CategoryMeta>;
  casks: Record<string, string[]>;
  formulae: Record<string, string[]>;
}

// =========================================================
// 2.9.3 Services (brew services)
// =========================================================

/**
 * Raw status string from `brew services list --json`. Observed values:
 * "started", "stopped", "none", "error", "scheduled", "unknown".
 * The frontend treats unknown values as `unknown` rather than crashing.
 */
export interface Service {
  name: string;
  status: string;
  user: string | null;
  file: string | null;
  exitCode: number | null;
}

/** Normalised status for the UI's tone/icon mapping. */
export type ServiceStatus = "started" | "stopped" | "none" | "error" | "scheduled" | "unknown";

export function normalizeServiceStatus(raw: string): ServiceStatus {
  switch (raw) {
    case "started":   return "started";
    case "stopped":   return "stopped";
    case "none":      return "none";
    case "error":     return "error";
    case "scheduled": return "scheduled";
    default:          return "unknown";
  }
}

// =========================================================
// 2.9.2 Disk usage (Dashboard Storage card)
// =========================================================

export interface DiskUsageEntry {
  label: string;
  path: string;
  bytes: number;
  exists: boolean;
  error: string | null;
}

export interface DiskUsageReport {
  generatedAt: string;
  prefix: string;
  cacheDir: string;
  entries: DiskUsageEntry[];
  totalBytes: number;
  cacheAgeSeconds: number;
}

// =========================================================
// 2.9 Trending (Phase 6)
// =========================================================

export interface TrendingEntry {
  rank: number;
  name: string;
  kind: PackageKind;
  installCount: number;
  installCountFormatted: string;
  installedLocally: boolean;
}

export interface TrendingReport {
  window: TrendingWindow;
  fetchedAt: string;
  cacheAgeSeconds: number;
  totalCount: number;
  entries: TrendingEntry[];
}

// =========================================================
// 3.3 Error model
// =========================================================

export type BrewErrorPayload =
  | { code: "brew_not_found" }
  | { code: "brew_exit_non_zero"; command: string; exitCode: number; stderrExcerpt: string; friendlyMessage?: string }
  | { code: "json_parse";         command: string; message: string; rawExcerpt: string }
  | { code: "io";                 message: string }
  | { code: "network";            url: string; message: string }
  | { code: "http_status";        url: string; status: number }
  | { code: "invalid_argument";   message: string }
  | { code: "job_not_found";      jobId: string }
  | { code: "canceled" }
  | { code: "brewfile_not_found"; id: string }
  | { code: "internal";           message: string };

/** Type-narrowing helper: is the thrown value a BrewErrorPayload? */
export function isBrewError(e: unknown): e is BrewErrorPayload {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "string"
  );
}

/** Human-readable message for a BrewError. */
export function brewErrorMessage(e: BrewErrorPayload): string {
  switch (e.code) {
    case "brew_not_found":      return "Homebrew not found on PATH.";
    case "brew_exit_non_zero":  return e.friendlyMessage ?? `brew exited ${e.exitCode}: ${e.stderrExcerpt}`;
    case "json_parse":          return `Failed to parse brew output: ${e.message}`;
    case "io":                  return `I/O error: ${e.message}`;
    case "network":             return `Network error: ${e.message}`;
    case "http_status":         return `HTTP ${e.status} from ${e.url}`;
    case "invalid_argument":    return `Invalid argument: ${e.message}`;
    case "job_not_found":       return `Job ${e.jobId} not found.`;
    case "canceled":            return "Operation canceled.";
    case "brewfile_not_found":  return `Brewfile "${e.id}" not found.`;
    case "internal":            return `Internal error: ${e.message}`;
  }
}

// =========================================================
// UI-only types (frontend stores, command palette, etc.)
// =========================================================

export type SidebarSection =
  | "dashboard"
  | "library"
  | "discover"
  | "trending"
  | "snapshots"
  | "services"
  | "activity";

export type ThemePreference = "light" | "dark" | "system";

/** A job tracked locally on the frontend (status + accumulated lines). */
export interface ActivityJob {
  jobId: string;
  label: string;             // human-friendly: "Installing wget"
  command: string;
  startedAt: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  lines: ActivityLine[];
  exitCode?: number;
  durationMs?: number;
}

export interface ActivityLine {
  stream: "stdout" | "stderr";
  text: string;
  ts: string;
}

/** Command-palette item — either a verb (action) or a package. */
export type PaletteItem =
  | { kind: "command"; id: string; label: string; shortcut?: string; section?: string; run: () => void | Promise<void> }
  | { kind: "package"; name: string; pkgKind: PackageKind; installed: boolean; description?: string | null };
