/**
 * Activity store — tracks running + completed streaming jobs.
 * Drives the bottom Activity drawer + sidebar "Activity" section.
 */

import { cancelJob } from "$lib/api";
import type { ActivityJob, BrewStreamEvent } from "$lib/types";

class ActivityStore {
  jobs: ActivityJob[] = $state([]);
  /** id of the job whose tab is selected in the drawer */
  activeJobId: string | null = $state(null);

  running = $derived(this.jobs.filter((j) => j.status === "running"));
  runningCount = $derived(this.running.length);

  startJob(label: string, jobId: string, command: string) {
    const job: ActivityJob = {
      jobId,
      label,
      command,
      startedAt: new Date().toISOString(),
      status: "running",
      lines: [],
    };
    this.jobs = [job, ...this.jobs];
    this.activeJobId = jobId;
  }

  handleEvent(evt: BrewStreamEvent) {
    const idx = this.jobs.findIndex((j) => j.jobId === evt.jobId);
    if (idx === -1) {
      // event for an unknown job — could happen on race conditions; ignore quietly.
      return;
    }
    const j = this.jobs[idx];
    switch (evt.kind) {
      case "started":
        // already recorded at startJob; refresh command if useful
        j.command = evt.command;
        break;
      case "stdout":
        j.lines = [...j.lines, { stream: "stdout", text: evt.line, ts: evt.ts }];
        break;
      case "stderr":
        j.lines = [...j.lines, { stream: "stderr", text: evt.line, ts: evt.ts }];
        break;
      case "progress":
        // soft-record progress as a line for now (UI can read percent later)
        j.lines = [...j.lines, { stream: "stdout", text: `[progress] ${evt.message}`, ts: new Date().toISOString() }];
        break;
      case "exit":
        j.status = evt.success ? "succeeded" : "failed";
        j.exitCode = evt.exitCode;
        j.durationMs = evt.durationMs;
        break;
      case "canceled":
        j.status = "canceled";
        break;
      case "error":
        j.status = "failed";
        j.lines = [...j.lines, { stream: "stderr", text: `[error] ${evt.error.code}`, ts: new Date().toISOString() }];
        break;
    }
    // re-publish (Svelte 5 deep-mutation works, but reassign to be explicit)
    this.jobs = [...this.jobs];
  }

  setActive(jobId: string) { this.activeJobId = jobId; }

  removeJob(jobId: string) {
    this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
    if (this.activeJobId === jobId) {
      this.activeJobId = this.jobs[0]?.jobId ?? null;
    }
  }

  clearCompleted() {
    this.jobs = this.jobs.filter((j) => j.status === "running");
  }

  async cancel(jobId: string) {
    try {
      await cancelJob(jobId);
    } catch {
      // best-effort
    }
  }
}

export const activity = new ActivityStore();
