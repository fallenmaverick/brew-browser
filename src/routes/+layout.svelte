<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { ui, watchSystemTheme } from "$lib/stores/ui.svelte";
  import { startEnvProbe } from "$lib/stores/env.svelte";

  let { children } = $props();

  onMount(() => {
    ui.loadThemeFromStorage();
    const unwatch = watchSystemTheme(() => ui.theme);
    const stopProbe = startEnvProbe();
    return () => {
      unwatch();
      stopProbe();
    };
  });
</script>

{@render children()}
