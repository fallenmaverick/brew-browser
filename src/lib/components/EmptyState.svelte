<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    body?: string;
    icon?: Snippet;
    cta?: Snippet;
  }

  let { title, body, icon, cta }: Props = $props();
</script>

<div class="empty" role="status">
  {#if icon}
    <div class="ico" aria-hidden="true">{@render icon()}</div>
  {/if}
  <h2>{title}</h2>
  {#if body}<p>{body}</p>{/if}
  {#if cta}<div class="cta">{@render cta()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    max-width: 360px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-6);
    gap: var(--space-4);
  }
  .ico {
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h2 {
    font-size: var(--text-h2);
    font-weight: var(--fw-semibold);
    color: var(--color-text-primary);
  }
  p {
    font-size: var(--text-body-sm);
    color: var(--color-text-secondary);
    line-height: var(--lh-normal);
  }
  .cta { margin-top: var(--space-2); display: flex; gap: var(--space-3); }
</style>
