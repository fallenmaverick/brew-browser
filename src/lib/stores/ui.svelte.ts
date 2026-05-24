/**
 * UI store — current sidebar section, theme, modal/drawer state.
 * Uses Svelte 5 runes inside a module-scope class instance.
 */

import type { SidebarSection, ThemePreference } from "$lib/types";

/** Default width of the package detail pane in pixels — the original fixed width. */
export const DETAIL_PANE_DEFAULT_WIDTH = 420;
/** Min allowed width — below this the actions footer crowds up. */
export const DETAIL_PANE_MIN_WIDTH = 320;
/** Storage key for the user's preferred pane width. */
const DETAIL_PANE_WIDTH_KEY = "brew-browser:detail-pane-width";

/** Clamp `w` to [min, maxFromWindow]; maxFromWindow defaults to 60% of innerWidth. */
export function clampDetailPaneWidth(w: number, windowWidth?: number): number {
  const ww = windowWidth ?? (typeof window === "undefined" ? 1100 : window.innerWidth);
  const max = Math.max(DETAIL_PANE_MIN_WIDTH, Math.floor(ww * 0.6));
  if (!Number.isFinite(w)) return DETAIL_PANE_DEFAULT_WIDTH;
  return Math.min(Math.max(Math.round(w), DETAIL_PANE_MIN_WIDTH), max);
}

class UiStore {
  /** First-launch landing. Dashboard is the home screen; clicking the sidebar
      brand returns here. Other sections live below it in the nav. */
  section: SidebarSection = $state("dashboard");
  drawerOpen: boolean = $state(false);
  drawerMinimized: boolean = $state(false);
  paletteOpen: boolean = $state(false);
  theme: ThemePreference = $state("system");
  /** the package currently shown in the detail panel; null = panel closed */
  selectedPackage: { name: string; kind: "formula" | "cask" } | null = $state(null);
  /** width of the package detail pane in px; persisted to localStorage */
  detailPaneWidth: number = $state(DETAIL_PANE_DEFAULT_WIDTH);

  setSection(s: SidebarSection) {
    this.section = s;
  }

  openDrawer() {
    this.drawerOpen = true;
    this.drawerMinimized = false;
  }

  toggleDrawer() {
    if (this.drawerOpen && !this.drawerMinimized) {
      this.drawerMinimized = true;
    } else if (this.drawerOpen && this.drawerMinimized) {
      this.drawerMinimized = false;
    } else {
      this.drawerOpen = true;
      this.drawerMinimized = false;
    }
  }

  closeDrawer() {
    this.drawerOpen = false;
    this.drawerMinimized = false;
  }

  openPalette() { this.paletteOpen = true; }
  closePalette() { this.paletteOpen = false; }

  selectPackage(name: string, kind: "formula" | "cask") {
    this.selectedPackage = { name, kind };
  }

  closeDetail() {
    this.selectedPackage = null;
  }

  setTheme(t: ThemePreference) {
    this.theme = t;
    try { localStorage.setItem("brew-browser.theme", t); } catch { /* ignore */ }
    applyTheme(t);
  }

  loadThemeFromStorage() {
    try {
      const v = localStorage.getItem("brew-browser.theme");
      if (v === "light" || v === "dark" || v === "system") {
        this.theme = v;
      }
    } catch { /* ignore */ }
    applyTheme(this.theme);
  }

  /** Load persisted detail-pane width on app mount; clamps in case window shrank since. */
  loadDetailPaneWidthFromStorage() {
    try {
      const raw = localStorage.getItem(DETAIL_PANE_WIDTH_KEY);
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) this.detailPaneWidth = clampDetailPaneWidth(n);
      }
    } catch { /* ignore */ }
  }

  /** Set + persist; clamps to [min, 60% of window width]. */
  setDetailPaneWidth(w: number) {
    this.detailPaneWidth = clampDetailPaneWidth(w);
    try { localStorage.setItem(DETAIL_PANE_WIDTH_KEY, String(this.detailPaneWidth)); } catch { /* ignore */ }
  }

  /** Reset to default width (used by double-clicking the resize handle). */
  resetDetailPaneWidth() {
    this.setDetailPaneWidth(DETAIL_PANE_DEFAULT_WIDTH);
  }
}

function applyTheme(t: ThemePreference) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  let resolved: "light" | "dark";
  if (t === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    resolved = t;
  }
  html.dataset.theme = resolved;
}

/** Subscribe matchMedia to flip data-theme when "system" is selected. */
export function watchSystemTheme(getCurrent: () => ThemePreference) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getCurrent() === "system") {
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    }
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

export const ui = new UiStore();
