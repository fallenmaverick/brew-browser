<script lang="ts">
  /**
   * ReadinessPill — capability verdict badge shared by bundle cards and the
   * bundle detail. Maps the M1 `readiness()` verdict to a tone + label; the
   * `reason` (tier note or blocking reason) is the hover tooltip. Never a hard
   * block — "Not recommended" still allows install behind a confirm (M3).
   */
  import Pill from "./Pill.svelte";
  import type { ReadinessVerdict } from "$lib/types";

  interface Props {
    verdict: ReadinessVerdict;
    reason: string;
  }
  let { verdict, reason }: Props = $props();

  const TONE = { ready: "success", marginal: "warning", blocked: "danger" } as const;
  const LABEL = { ready: "Ready", marginal: "Marginal", blocked: "Not recommended" } as const;
</script>

<span title={reason}>
  <Pill tone={TONE[verdict]}>{LABEL[verdict]}</Pill>
</span>
