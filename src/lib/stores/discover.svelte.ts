/**
 * Discover store — shared UI state for the Discover tab so that other surfaces
 * (PackageDetail's category pills, command palette in future) can drive the
 * category selection without reaching into the Discover component.
 *
 * Selection model: a Set of category slugs.
 *  - Empty set + no search query → tile grid (browse mode)
 *  - Empty set + search query    → search results, no filter
 *  - Non-empty set               → filtered list (union when there's a search;
 *                                   union of category memberships when not)
 *
 * The "single tile drilldown" UX (click a tile, see only that category) maps
 * to a one-element selection set.
 */

class DiscoverStore {
  selectedCategories: Set<string> = $state(new Set());

  /** True when at least one category chip is active. */
  hasFilter = $derived(this.selectedCategories.size > 0);

  /** Convenience: replace selection with a single slug (tile-click semantics). */
  selectOnly(slug: string) {
    this.selectedCategories = new Set([slug]);
  }

  /** Toggle one slug in/out of the selection. */
  toggle(slug: string) {
    const next = new Set(this.selectedCategories);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    this.selectedCategories = next;
  }

  /** Drop all chips, return to tile-grid view (when search query is also empty). */
  clear() {
    this.selectedCategories = new Set();
  }

  /** True when this slug is in the active selection. */
  isActive(slug: string): boolean {
    return this.selectedCategories.has(slug);
  }
}

export const discover = new DiscoverStore();
