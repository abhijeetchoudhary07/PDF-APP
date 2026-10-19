/**
 * Navigation & numbering — Part E.
 *
 * Three things a reader uses to move around a document and to name its pages:
 * the outline (E1), the logical page labels (E2) and a Bates stamp (E3).
 *
 * The first two are structures pdf-lib has no API for at all — an /Outlines
 * tree and a /PageLabels number tree are both built here out of PDFDict,
 * PDFName and `context.register`. That is why the types below describe the
 * *tree* rather than the dictionaries: the screen edits a plain shape, and one
 * writer turns it into a correct object graph.
 */

import { PdfExportResult } from './pdf-organization.types';

/* ════════════════════════════════════════════════════════════════════
 * E1 — bookmarks & outline
 * ════════════════════════════════════════════════════════════════════ */

/** One bookmark. Children nest to any depth. */
export interface OutlineNode {
  /** Stable id for tracking and for the tree UI. Not written to the file. */
  id: string;
  title: string;
  /** 0-indexed page the bookmark points at. */
  pageIndex: number;
  children: OutlineNode[];
  /**
   * Shown closed in the reader's bookmark pane. Written as a negative /Count,
   * which is the only way the format expresses it.
   */
  collapsed?: boolean;
}

/** Where a node sits, for the move/indent operations. */
export interface OutlinePosition {
  /** Ids from the root down to — but not including — the node itself. */
  parentPath: string[];
  index: number;
}

export type OutlineNoticeKind
  /** The document had no outline to read. */
  = 'no-outline'
  /** A bookmark pointed somewhere this tool cannot resolve to a page. */
  | 'unresolved-destination'
  /** A bookmark's target page no longer exists and was clamped. */
  | 'clamped-destination'
  /** The generated outline came from a font-size heuristic, not real structure. */
  | 'generated-from-headings'
  /** No headings stood out, so nothing could be generated. */
  | 'no-headings-found'
  /** The document has no text layer, so headings could not be read. */
  | 'no-text-layer'
  /** The outline was removed. */
  | 'outline-cleared'
  /** Bookmarks were written. */
  | 'outline-written';

export interface OutlineNotice {
  kind: OutlineNoticeKind;
  count?: number;
  detail?: string;
}

/** What a heading scan found, before it becomes an outline. */
export interface HeadingCandidate {
  text: string;
  pageIndex: number;
  /** Font size in points, which is what the heuristic ranks by. */
  fontSize: number;
  /** 1 is the largest size found, 2 the next, and so on. */
  level: number;
}

export interface HeadingScanOptions {
  /** Sizes within this fraction of each other count as the same level. */
  sizeTolerance: number;
  /** A heading has to be at least this much larger than the body text. */
  minSizeRatio: number;
  /** Longest a line can be and still be treated as a heading. */
  maxTitleLength: number;
  /** Deepest level to generate. */
  maxLevels: number;
}

export function defaultHeadingScanOptions(): HeadingScanOptions {
  return {
    sizeTolerance: 0.08,
    minSizeRatio: 1.15,
    maxTitleLength: 120,
    maxLevels: 3
  };
}

/* ════════════════════════════════════════════════════════════════════
 * E2 — page labels
 * ════════════════════════════════════════════════════════════════════ */

/**
 * The numbering style for a range of pages.
 *
 * `none` writes no /S entry at all, which is how the format says "this range
 * has a prefix and nothing else" — the usual way to label cover sheets.
 */
export type PageLabelStyle =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'letters-lower'
  | 'letters-upper'
  | 'none';

export const PAGE_LABEL_STYLES: PageLabelStyle[] = [
  'decimal',
  'roman-lower',
  'roman-upper',
  'letters-lower',
  'letters-upper',
  'none'
];

/** The /S name each style is written as. */
export const PAGE_LABEL_STYLE_NAMES: Record<PageLabelStyle, string | undefined> = {
  decimal: 'D',
  'roman-lower': 'r',
  'roman-upper': 'R',
  'letters-lower': 'a',
  'letters-upper': 'A',
  none: undefined
};

/** One run of pages sharing a style, a prefix and a starting value. */
export interface PageLabelRange {
  id: string;
  /** 1-indexed first page of the run. The run ends where the next one starts. */
  startPage: number;
  style: PageLabelStyle;
  /** Printed before the number. Empty for none. */
  prefix: string;
  /** What the numbering counts from within this run. At least 1. */
  startValue: number;
}

export function defaultPageLabelRange(startPage = 1): PageLabelRange {
  return {
    id: `range_${startPage}_${Math.random().toString(36).slice(2, 8)}`,
    startPage,
    style: 'decimal',
    prefix: '',
    startValue: 1
  };
}

export type PageLabelNoticeKind
  /** The document carried no /PageLabels. */
  = 'no-labels'
  /** Ranges were written. */
  | 'labels-written'
  /** The labels were removed. */
  | 'labels-cleared'
  /** Two ranges started on the same page; the later one won. */
  | 'overlapping-ranges'
  /** A range started past the end of the document and was dropped. */
  | 'range-past-end'
  /** Two different pages end up with the same printed label. */
  | 'duplicate-labels';

export interface PageLabelNotice {
  kind: PageLabelNoticeKind;
  count?: number;
  detail?: string;
}

/** One row of the label preview. */
export interface PageLabelPreviewRow {
  pageNumber: number;
  label: string;
  /** True when this page starts a range. */
  rangeStart?: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * E3 — Bates numbering
 * ════════════════════════════════════════════════════════════════════ */

export interface BatesOptions {
  /** Printed before the number. */
  prefix: string;
  /** Printed after the number. */
  suffix: string;
  /** Zero-padded width of the number itself. */
  width: number;
  /** The number the first stamped page gets. */
  startNumber: number;
  /** How much the counter advances per page. Normally 1. */
  step: number;
  /** Where the stamp goes. */
  position: BatesPosition;
  fontSize: number;
  fontColor: string;
  marginX: number;
  marginY: number;
}

export type BatesPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-centre'
  | 'top-right'
  | 'top-left'
  | 'top-centre';

export const BATES_POSITIONS: BatesPosition[] = [
  'bottom-right',
  'bottom-left',
  'bottom-centre',
  'top-right',
  'top-left',
  'top-centre'
];

export function defaultBatesOptions(): BatesOptions {
  return {
    prefix: '',
    suffix: '',
    width: 6,
    startNumber: 1,
    step: 1,
    position: 'bottom-right',
    fontSize: 9,
    fontColor: '#333333',
    marginX: 36,
    marginY: 28
  };
}

/** One file's share of a continuous batch counter. */
export interface BatesFilePlan {
  index: number;
  name: string;
  pageCount: number;
  /** The number this file's first page gets. */
  firstNumber: number;
  /** The number this file's last page gets. */
  lastNumber: number;
  firstStamp: string;
  lastStamp: string;
}

/**
 * How a whole batch is numbered.
 *
 * The point of this type is that the counter does not restart per file: a
 * three-file batch of 4, 3 and 5 pages starting at 1 runs 1-4, 5-7, 8-12. A
 * stamp that restarts per document is not a Bates number, and getting that
 * wrong is not visible until the files are already filed somewhere.
 */
export interface BatesBatchPlan {
  files: BatesFilePlan[];
  totalPages: number;
  firstNumber: number;
  lastNumber: number;
  firstStamp: string;
  lastStamp: string;
  /** True when the last number needs more digits than `width` allows. */
  overflowsWidth: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * Shared
 * ════════════════════════════════════════════════════════════════════ */

export interface NavigationProgress {
  phase: 'reading' | 'scanning' | 'writing';
  completed: number;
  total: number;
  percent: number;
}

export interface OutlineOutput extends PdfExportResult {
  notices: OutlineNotice[];
  /** How many bookmarks the written tree holds, at all levels. */
  bookmarkCount: number;
}

export interface PageLabelOutput extends PdfExportResult {
  notices: PageLabelNotice[];
  rangeCount: number;
}

export interface BatesOutput extends PdfExportResult {
  /** The stamp the first page of this file received. */
  firstStamp: string;
  lastStamp: string;
  pagesStamped: number;
}

/** The Navigation Studio's tabs. */
export type NavigationMode = 'bookmarks' | 'labels';

export const NAVIGATION_MODES: NavigationMode[] = ['bookmarks', 'labels'];

export function isNavigationMode(value: string): value is NavigationMode {
  return (NAVIGATION_MODES as string[]).includes(value);
}
