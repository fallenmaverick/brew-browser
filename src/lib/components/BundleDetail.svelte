<script lang="ts">
  /**
   * BundleDetail (M3) — the bundle inspector shown as a modal. Lists each
   * package with its live installed state (cross-referenced against the
   * `packages` store), the capability verdict + reason, caveats (prominent
   * callout), reference links, and an **Install all** action that streams into
   * the Activity drawer via `brewInstallBundle`.
   *
   * A `blocked` readiness verdict gates Install all behind a DestructiveConfirm
   * ("your machine may not run this well") — never a hard block.
   */
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import Pill from "./Pill.svelte";
  import ReadinessPill from "./ReadinessPill.svelte";
  import DestructiveConfirm from "./DestructiveConfirm.svelte";
  import DownloadCloud from "@lucide/svelte/icons/download-cloud";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Play from "@lucide/svelte/icons/play";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Copy from "@lucide/svelte/icons/copy";

  import { activity } from "$lib/stores/activity.svelte";
  import { packages } from "$lib/stores/packages.svelte";
  import { bundles } from "$lib/stores/bundles.svelte";
  import { services } from "$lib/stores/services.svelte";
  import { toast } from "$lib/stores/toast.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { brewInstallBundle, openInFinder } from "$lib/api";
  import { normalizeServiceStatus } from "$lib/types";
  import type { Bundle, BundlePackage, PackageKind, SetupStep } from "$lib/types";
  import { safeOpenUrl } from "$lib/util/url";
  import { stepMode } from "$lib/util/setupStep";
  import { isMac } from "$lib/util/platform";
  import { reportableToastError } from "$lib/util/reportIssue";

  interface Props {
    bundle: Bundle;
    onClose: () => void;
  }
  let { bundle, onClose }: Props = $props();

  let readiness = $derived(bundles.readinessFor(bundle));

  type InstalledState = "not-installed" | "installed" | "outdated";
  function stateOf(p: BundlePackage): InstalledState {
    const found = packages.findInstalled(p.name, p.kind as PackageKind);
    if (!found) return "not-installed";
    return found.outdated ? "outdated" : "installed";
  }

  const STATE_TONE = { "not-installed": "neutral", installed: "success", outdated: "warning" } as const;
  const STATE_LABEL = { "not-installed": "not installed", installed: "installed", outdated: "outdated" } as const;

  let confirmOpen = $state(false);
  let installing = $state(false);

  function onInstallClick() {
    if (installing) return;
    if (readiness.verdict === "blocked") {
      confirmOpen = true;
    } else {
      void runInstall();
    }
  }

  async function runInstall() {
    if (installing) return;
    installing = true;
    confirmOpen = false;

    const names = bundle.packages.map((p) => p.name);
    const cmdLabel =
      names.length <= 3
        ? `brew install ${names.join(" ")}`
        : `brew install ${names.slice(0, 3).join(" ")} (+${names.length - 3})`;

    // One temp Activity job for instant feedback; the first real `started`
    // event re-keys it. A bundle with both formulae and casks streams as TWO
    // brew steps (see brew_install_bundle) — the second step's `started`
    // arrives with a new jobId, so we register it as its own Activity job.
    const tmpId = crypto.randomUUID();
    activity.startJob(`Installing ${bundle.name}`, tmpId, cmdLabel);
    ui.openDrawer();
    onClose(); // dismiss the detail so the user sees the drawer

    let firstRemapped = false;
    try {
      const result = await brewInstallBundle(bundle.packages, (evt) => {
        if (evt.kind === "started") {
          if (!firstRemapped) {
            const j = activity.jobs.find((j) => j.jobId === tmpId);
            if (j) j.jobId = evt.jobId;
            firstRemapped = true;
          } else if (!activity.jobs.some((j) => j.jobId === evt.jobId)) {
            activity.startJob(`Installing ${bundle.name} (casks)`, evt.jobId, evt.command);
          }
        }
        activity.handleEvent(evt);
      });
      if (result.success) {
        toast.success(`Installed ${bundle.name}`);
        // Reload so per-package installed state flips (force-bypass cache).
        await packages.load(true);
      }
    } catch (e) {
      reportableToastError("Install failed", e);
    } finally {
      installing = false;
    }
  }

  // ---- Setup checklist (M4) -------------------------------------------------

  // Load services once so `service` steps can reflect running state. Cheap +
  // guarded; only fetches when we don't already have a list.
  $effect(() => {
    if (bundle.setup.length > 0 && services.list.length === 0) {
      void services.load();
    }
  });

  /** A `service` step's action is only meaningful once its package is
   *  installed (partial install ⇒ nothing to start). Cross-refs the packages
   *  store by name (services are the formula/cask the recipe installs). */
  function serviceInstalled(name: string): boolean {
    return packages.all.some((p) => p.name === name);
  }

  function serviceRunning(name: string): boolean {
    const svc = services.byName(name);
    return svc ? normalizeServiceStatus(svc.status) === "started" : false;
  }

  async function startService(name: string) {
    try {
      await services.start(name);
    } catch (e) {
      reportableToastError("Couldn't start service", e);
    }
  }

  async function reveal(path: string) {
    try {
      await openInFinder(path);
    } catch (e) {
      reportableToastError(isMac ? "Couldn't reveal in Finder" : "Couldn't open in file manager", e);
    }
  }

  async function copyCommand(run: string) {
    try {
      await navigator.clipboard.writeText(run);
      toast.success("Copied", run);
    } catch (e) {
      reportableToastError("Couldn't copy to clipboard", e);
    }
  }

  /** Human label for a step, falling back to a sensible default per kind. */
  function stepLabel(step: SetupStep): string {
    if (step.label) return step.label;
    switch (step.kind) {
      case "service": return `Start ${step.service ?? "service"}`;
      case "open": return step.url ?? "Open";
      case "reveal": return step.path ?? "Reveal";
      default: return "";
    }
  }
</script>

<Modal open title={bundle.name} {onClose}>
  <div class="detail">
    <div class="verdict-row">
      <ReadinessPill verdict={readiness.verdict} reason={readiness.reason} />
      <span class="reason">{readiness.reason}</span>
    </div>

    <p class="tagline">{bundle.tagline}</p>

    <section class="block">
      <h3>Packages</h3>
      <ul class="pkgs" role="list">
        {#each bundle.packages as p (p.name + p.kind)}
          {@const st = stateOf(p)}
          <li class="pkg">
            <span class="pkg-name truncate">{p.name}</span>
            <Pill tone={p.kind === "formula" ? "formula" : "cask"}>{p.kind}</Pill>
            <span class="pkg-state"><Pill tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Pill></span>
          </li>
        {/each}
      </ul>
    </section>

    {#if bundle.caveats}
      <div class="caveats" role="note">
        <span class="caveats-icon" aria-hidden="true"><TriangleAlert size={16} /></span>
        <p>{bundle.caveats}</p>
      </div>
    {/if}

    {#if bundle.setup.length > 0}
      <section class="block">
        <h3>Setup</h3>
        <p class="setup-hint">
          Brew-native steps run in the app. Commands marked
          <em>you run this</em> are yours to copy and run in a terminal — the
          app never executes them for you.
        </p>
        <ol class="setup" role="list">
          {#each bundle.setup as step, i (i)}
            {@const mode = stepMode(step.kind)}
            <li class="step">
              <span class="step-num" aria-hidden="true">{i + 1}</span>

              {#if step.kind === "service"}
                {@const installed = serviceInstalled(step.service ?? "")}
                {@const running = serviceRunning(step.service ?? "")}
                <span class="step-body">
                  <span class="step-label">{stepLabel(step)}</span>
                  {#if running}<span class="step-tag ok">running</span>{/if}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onclick={() => startService(step.service ?? "")}
                  disabled={!installed || running || services.isPending(step.service ?? "")}
                  title={!installed
                    ? `${step.service} isn't installed yet — install the bundle first`
                    : running
                      ? "Already running"
                      : "Start this service"}
                >
                  {#snippet icon()}<Play size={13} />{/snippet}
                  Start
                </Button>

              {:else if step.kind === "open"}
                <span class="step-body"><span class="step-label">{stepLabel(step)}</span></span>
                <Button size="sm" variant="secondary" onclick={() => safeOpenUrl(step.url ?? "")} disabled={!step.url}>
                  {#snippet icon()}<ExternalLink size={13} />{/snippet}
                  Open
                </Button>

              {:else if step.kind === "reveal"}
                <span class="step-body"><span class="step-label">{stepLabel(step)}</span></span>
                <Button size="sm" variant="secondary" onclick={() => reveal(step.path ?? "")} disabled={!step.path}>
                  {#snippet icon()}<FolderOpen size={13} />{/snippet}
                  Reveal
                </Button>

              {:else if step.kind === "command"}
                <span class="step-body step-body--cmd">
                  {#if step.label}<span class="step-label">{step.label}</span>{/if}
                  <span class="step-run-row">
                    <code class="step-run">{step.run}</code>
                    <span class="step-yourun" title="This runs in your terminal — the app never executes it">you run this</span>
                  </span>
                </span>
                <Button size="sm" variant="secondary" onclick={() => copyCommand(step.run ?? "")} disabled={!step.run}>
                  {#snippet icon()}<Copy size={13} />{/snippet}
                  Copy
                </Button>

              {:else if mode === "note"}
                <!-- note (and any unknown kind, via stepMode → "note"): inert text.
                     No markdown sanitizer exists in this app (PackageDetail renders
                     caveats as plain text too), so render as plain text — no @html. -->
                <span class="step-body step-body--note">
                  <span class="step-note">{step.text ?? ""}</span>
                </span>
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if bundle.links.length > 0}
      <section class="block">
        <h3>Links</h3>
        <ul class="links" role="list">
          {#each bundle.links as l (l.url)}
            <li>
              <button type="button" class="link" onclick={() => safeOpenUrl(l.url)}>
                <ExternalLink size={13} />
                {l.label}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  {#snippet actions()}
    <Button variant="secondary" onclick={onClose}>Close</Button>
    <Button variant="primary" onclick={onInstallClick} disabled={installing} loading={installing}>
      {#snippet icon()}<DownloadCloud size={14} />{/snippet}
      Install all
    </Button>
  {/snippet}
</Modal>

<DestructiveConfirm
  open={confirmOpen}
  title="Install anyway?"
  confirmLabel="Install anyway"
  cancelLabel="Cancel"
  confirmVariant="danger"
  onConfirm={runInstall}
  onCancel={() => (confirmOpen = false)}
>
  <p>{readiness.reason}</p>
  <p>Your machine may not run <strong>{bundle.name}</strong> well. You can install it anyway.</p>
</DestructiveConfirm>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .verdict-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .reason {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
  }

  .tagline {
    font-size: var(--text-body);
    color: var(--color-text-primary);
    margin: 0;
  }

  .block h3 {
    font-size: var(--text-body-sm);
    font-weight: var(--fw-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2) 0;
  }

  .pkgs {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
  }
  .pkg {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .pkg:last-child { border-bottom: none; }
  .pkg-name {
    flex: 1;
    font-size: var(--text-body);
    font-weight: var(--fw-medium);
    color: var(--color-text-primary);
  }
  .pkg-state { flex: none; }

  .caveats {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-warning-subtle, var(--color-surface-raised));
    border: 1px solid var(--color-warning, var(--color-border));
    border-radius: var(--radius-md);
  }
  .caveats-icon { color: var(--color-warning-strong, #b45309); flex: none; margin-top: 1px; }
  .caveats p {
    margin: 0;
    font-size: var(--text-body-sm);
    color: var(--color-text-primary);
    line-height: 1.4;
  }

  .links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: var(--color-accent, #b8542a);
    cursor: pointer;
    font-size: var(--text-body-sm);
    font-weight: var(--fw-medium);
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link:hover { filter: brightness(1.1); }

  /* Setup checklist */
  .setup-hint {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2) 0;
    line-height: 1.4;
  }
  .setup-hint em {
    font-style: normal;
    font-weight: var(--fw-medium);
    color: var(--color-text-primary);
  }
  .setup {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    counter-reset: step;
  }
  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
  }
  .step-num {
    flex: none;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-body-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 50%;
    margin-top: 1px;
  }
  .step-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .step-body--cmd,
  .step-body--note {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .step-label {
    font-size: var(--text-body);
    color: var(--color-text-primary);
  }
  .step-tag.ok {
    font-size: var(--text-body-sm);
    color: var(--color-success-strong, #15803d);
  }
  .step-run-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    width: 100%;
  }
  .step-run {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-body-sm);
    color: var(--color-text-primary);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    overflow-x: auto;
    white-space: pre;
  }
  .step-yourun {
    font-size: var(--text-body-sm);
    font-weight: var(--fw-medium);
    color: var(--color-warning-strong, #b45309);
    white-space: nowrap;
  }
  .step-note {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    line-height: 1.4;
    white-space: pre-wrap;
  }
</style>
