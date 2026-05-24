<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { ui, watchSystemTheme } from "$lib/stores/ui.svelte";
  import { startEnvProbe } from "$lib/stores/env.svelte";
  import { activity } from "$lib/stores/activity.svelte";
  import { services } from "$lib/stores/services.svelte";

  let { children } = $props();

  onMount(() => {
    ui.loadThemeFromStorage();
    activity.hydrate();
    // Prime the services list so the sidebar's "Services" badge can show a
    // count from first paint; the Services tab refreshes again on mount.
    void services.load();
    const unwatch = watchSystemTheme(() => ui.theme);
    const stopProbe = startEnvProbe();
    return () => {
      unwatch();
      stopProbe();
    };
  });
</script>

<!--
  Window dragging in Tauri 2 with titleBarStyle: "Overlay" is wired via the
  `data-tauri-drag-region` attribute on regular DOM elements (Sidebar brand
  area + each panel-head). Tauri's WebView handles click-vs-drag detection
  natively, so interactive children inside drag regions still receive their
  clicks. Avoids the fixed-overlay pattern (which intercepts scroll-wheel
  events at the top of the window).
-->

{@render children()}
