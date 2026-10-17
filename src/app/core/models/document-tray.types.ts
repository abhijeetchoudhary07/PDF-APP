import { PdfPageItem } from './pdf-organization.types';

/**
 * How many distinct badge colours the tray cycles through. More documents than
 * this is allowed; colours simply repeat, and the file name on the badge stays
 * the authoritative identifier.
 */
export const TRAY_COLOR_COUNT = 8;

/**
 * One loaded document, as the organizer's tray shows it.
 *
 * `pageCount` is how many of this document's pages are still on the canvas,
 * which drifts from the file's own page count as pages are deleted or
 * duplicated — the tray reports the canvas, not the file.
 */
export interface DocumentTrayEntry {
  docId: string;
  name: string;
  /** Pages from this document currently on the canvas. */
  pageCount: number;
  /** Pages the source file actually has. */
  originalPageCount: number;
  sizeBytes: number;
  /** 0-based slot in the badge colour cycle. */
  colorIndex: number;
  /** 1-based display numbers of this document's pages, in canvas order. */
  displayNumbers: number[];
  pageIds: string[];
  /** True when none of this document's pages remain on the canvas. */
  emptied: boolean;
}

/** A page together with the tray entry it came from, for the per-page badge. */
export interface TrayPageBadge {
  pageId: string;
  docId: string
  name: string;
  colorIndex: number;
  /** 1-based page number within its own source document. */
  sourcePageNumber: number;
}

export interface SourceSplitPlan {
  entries: DocumentTrayEntry[];
  /** Pages grouped by source document, in canvas order within each group. */
  groups: { entry: DocumentTrayEntry; pages: PdfPageItem[] }[];
  totalPages: number;
}
