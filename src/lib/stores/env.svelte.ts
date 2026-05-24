/**
 * Environment store — tracks the `brew_doctor` probe result.
 * Drives the footer status dot (green / amber / red), tooltip text, and
 * the "Homebrew not found" empty/error states.
 */

import { brewDoctor } from "$lib/api";
import { isBrewError, brewErrorMessage } from "$lib/types";
import type { BrewEnvironment } from "$lib/types";

class EnvStore {
  /** latest BrewEnvironment from the backend, or null until first probe completes. */
  report: BrewEnvironment | null = $state(null);
  /** an error from the most recent probe attempt, if any. */
  error: string | null = $state(null);
  /** a probe is in flight. */
  loading: boolean = $state(false);
  /** ms-since-epoch of the last completed probe (success or fail). */
  lastCheckedAt: number | null = $state(null);

  /** True when we have a confirmed-installed brew. False if probe failed or installed=false. */
  installed = $derived(this.report?.installed === true);

  /** Human-readable summary for a tooltip. */
  summary = $derived.by(() => {
    if (this.loading && !this.report) return "Checking Homebrew…";
    if (this.error) return `Homebrew status unknown — ${this.error}`;
    if (!this.report) return "Homebrew status unknown";
    if (!this.report.installed) return "Homebrew not found on PATH.";
    const parts: string[] = [];
    if (this.report.version) parts.push(`Homebrew ${this.report.version}`);
    if (this.report.prefix) parts.push(`prefix ${this.report.prefix}`);
    return parts.join(" · ") || "Homebrew is installed.";
  });

  /** Short label for the footer ("brew 5.1.13" / "brew" / "brew not found"). */
  shortLabel = $derived.by(() => {
    if (!this.report) return "brew";
    if (!this.report.installed) return "brew not found";
    if (this.report.version) return `brew ${this.report.version}`;
    return "brew";
  });

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      const r = await brewDoctor();
      this.report = r;
      this.error = null;
    } catch (e) {
      this.report = { installed: false, version: null, prefix: null, pathUsed: null };
      this.error = isBrewError(e) ? brewErrorMessage(e) : String(e);
    } finally {
      this.loading = false;
      this.lastCheckedAt = Date.now();
    }
  }

  /**
   * Like `refresh()`, but a no-op when the last probe completed less than
   * `minIntervalMs` ago. Used by foreground listeners (focus, visibilitychange)
   * which can fire rapidly when the user alt-tabs back and forth — we don't
   * need to spawn `brew --version` twice in five seconds. The 5-minute
   * backstop in `startEnvProbe()` still runs unconditionally.
   *
   * Security audit §L5 (memory-bank/security.md) — keeps the env-probe quiet
   * for telemetry-conscious users without sacrificing freshness on real
   * environment changes.
   */
  async refreshIfStale(minIntervalMs = 30_000): Promise<void> {
    if (this.loading) return;
    if (this.lastCheckedAt !== null && Date.now() - this.lastCheckedAt < minIntervalMs) {
      return;
    }
    await this.refresh();
  }
}

export const env = new EnvStore();

/**
 * Install foreground listeners so the env probe re-runs when the user comes
 * back to the app, plus a periodic refresh fallback while focused. Returns
 * an unsubscribe.
 */
export function startEnvProbe(): () => void {
  // Initial probe.
  void env.refresh();

  let intervalId: ReturnType<typeof setInterval> | null = null;

  // Foreground triggers debounce-skip when the last probe was <30s ago — alt-tab
  // bursts shouldn't spawn `brew --version` repeatedly. See §L5.
  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void env.refreshIfStale();
    }
  };
  const onFocus = () => {
    void env.refreshIfStale();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
    // Backstop: re-probe every 5 minutes regardless. Cheap (sub-100ms native call).
    intervalId = setInterval(() => void env.refresh(), 5 * 60 * 1000);
  }

  return () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
    }
    if (intervalId !== null) clearInterval(intervalId);
  };
}
