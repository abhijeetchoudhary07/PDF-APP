/**
 * Which selection helper is being asked for.
 *
 * The five helpers the organizer already shipped — all, none, odd, even,
 * range, invert — are NOT in this list and are not routed through here. They
 * keep their own methods and their existing behaviour.
 */
export type SelectionHelperKind =
  | 'blank'
  | 'duplicates'
  | 'landscape'
  | 'portrait'
  | 'size';

/**
 * A group of pages that measure the same, as displayed.
 *
 * Dimensions are the effective ones: a portrait sheet carrying a 90° rotation
 * measures landscape to a reader, and is grouped as such.
 */
export interface PageSizeGroup {
  /** Stable key for tracking and for picking the group, e.g. "595x842". */
  key: string;
  /** Effective width in PDF points, rounded to the nearest point. */
  widthPt: number;
  /** Effective height in PDF points, rounded to the nearest point. */
  heightPt: number;
  /** Width in millimetres, rounded to one decimal. */
  widthMm: number;
  /** Height in millimetres, rounded to one decimal. */
  heightMm: number;
  /**
   * A standard paper size this matches within tolerance (e.g. 'A4', 'Letter'),
   * or undefined. A size name only — never an institution or exam board.
   */
  standardName?: string;
  orientation: 'portrait' | 'landscape' | 'square';
  pageIds: string[];
  /** 1-based display numbers in this group, in document order. */
  displayNumbers: number[];
  count: number;
}

/**
 * What a helper matched, computed WITHOUT touching the current selection so
 * the count can be shown before anything changes.
 */
export interface SelectionHelperMatch {
  kind: SelectionHelperKind;
  pageIds: string[];
  displayNumbers: number[];
  matchedCount: number;
  /** Total pages the helper looked at. */
  scannedCount: number;
  /**
   * Set when the helper could not run — a blank or duplicate helper with no
   * scan behind it, or a size group key that no longer exists. The selection
   * is left alone in that case.
   */
  unavailableReason?: string;
  /** Only for 'size': the group this match came from. */
  sizeGroup?: PageSizeGroup;
}

/** Options a helper may need beyond the page list. */
export interface SelectionHelperOptions {
  /** For 'size': which group to match. Defaults to the largest group. */
  sizeGroupKey?: string;
  /**
   * For 'duplicates': whether to match only the pages a group would drop
   * (every occurrence after the first, which is the keep-first default), or
   * every page in every duplicate group. Defaults to 'redundant'.
   */
  duplicateScope?: 'redundant' | 'all';
}
