/**
 * Library tab view state. Lifted out of the component so other surfaces
 * (Dashboard's "Updates available" card, command palette in future) can
 * preset the filter before navigating.
 *
 * The state survives section switches within a session but is not persisted
 * to localStorage — by design. Reloading the app returns to the default
 * "All" view.
 */

export type LibraryFilter = "all" | "formulae" | "casks" | "outdated";

class LibraryStore {
  filter: LibraryFilter = $state("all");

  setFilter(f: LibraryFilter) {
    this.filter = f;
  }
}

export const library = new LibraryStore();
