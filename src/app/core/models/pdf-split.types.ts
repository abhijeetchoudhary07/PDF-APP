import { PdfPageItem, PdfSourceDocument } from './pdf-organization.types';

/**
 * The five split modes added alongside the four that ship (`extract`,
 * `every-n`, `after-selected`, `individual`). Those four stay exactly as they
 * are: they are computed synchronously by
 * `PdfRangeParserUtil.calculateSplitChunks` and rendered by the chunk-badge
 * preview. These five need to look at the document first — measure bytes, read
 * an outline, classify pages — so each one produces a `SplitPlan` that the
 * screen shows before anything is written.
 */
export type AdvancedSplitMode =
  | 'max-size'
  | 'doc-count'
  | 'chapters'
  | 'divider'
  | 'text-pattern';

export const ADVANCED_SPLIT_MODES: AdvancedSplitMode[] = [
  'max-size',
  'doc-count',
  'chapters',
  'divider',
  'text-pattern'
];

export function isAdvancedSplitMode(mode: string): mode is AdvancedSplitMode {
  return (ADVANCED_SPLIT_MODES as string[]).includes(mode);
}

/** One output document a plan would write. */
export interface SplitPlanPart {
  /**
   * 1-indexed positions in the organizer's active page list, in output order.
   * The same numbering `exportSplitPdfs` already takes.
   */
  pageNumbers: number[];
  /**
   * File name without the `.pdf` extension, already sanitized and made unique
   * within the plan. Undefined leaves the naming to `exportSplitPdfs`, which is
   * what the four shipped modes do.
   */
  baseName?: string;
  /** Measured size in bytes. Only `max-size` measures; the others leave it unset. */
  sizeBytes?: number;
  /**
   * True when this part is a single page that is larger than the ceiling on its
   * own, so no split could bring it under. The page is still written — it is
   * reported, not dropped.
   */
  overCeiling?: boolean;
  /** The bookmark, divider payload or captured value this part was named from. */
  sourceLabel?: string;
}

/**
 * Something the person has to be told about a plan. The engine reports a kind
 * and the data behind it; the screen turns that into a translated sentence, so
 * no user-visible English is built down here.
 */
export type SplitNoticeKind =
  /** One or more single pages exceed the size ceiling by themselves. */
  | 'oversized-page'
  /** The document carries no outline, so `chapters` has nothing to split at. */
  | 'no-outline'
  /** The outline exists but the chosen level has no entries. */
  | 'empty-level'
  /** No divider sheet was detected, so the whole document stays as one part. */
  | 'no-dividers'
  /** Divider pages were dropped from the output. */
  | 'dropped-pages'
  /** The pattern matched nothing on any page. */
  | 'no-pattern-match'
  /** The pattern is not a valid regular expression. */
  | 'invalid-pattern'
  /** N is larger than the page count. */
  | 'count-too-large'
  /** Fewer than two parts: splitting would just copy the document. */
  | 'single-part'
  /** The measuring loop hit its iteration ceiling and settled for what it had. */
  | 'measure-budget-spent'
  /** Pages carry no text layer, so the pattern could not be read from them. */
  | 'pages-without-text'
  /**
   * Pages sit ahead of the first boundary — before the first bookmark, or
   * before the first page the pattern matched. They are written as their own
   * leading part rather than being folded into the next one or dropped.
   */
  | 'unmatched-leading-pages'
  /* B6 / B7 — cutting within a page rather than between pages. */
  /** No whitespace valley stood out near the middle, so the cut fell at 50%. */
  | 'gutter-not-found'
  /** A whitespace valley was found and used instead of the midpoint. */
  | 'gutter-applied'
  /** The page is no larger than one sheet, so tiling it changes nothing. */
  | 'page-fits-one-sheet'
  /** The settings would print a lot of sheets; said before, not after. */
  | 'large-sheet-count'
  /** The grid asks for more pieces per page than the limit allows. */
  | 'grid-too-fine';

export interface SplitPlanNotice {
  kind: SplitNoticeKind;
  /** Page numbers the notice is about, when it is about particular pages. */
  pageNumbers?: number[];
  /** A number the message needs — a level, a count, a limit. */
  count?: number;
  /** A string the message needs — a regex, a bookmark title, an error. */
  detail?: string;
}

/** One row of the per-page preview a mode offers before splitting. */
export interface SplitPagePreviewRow {
  pageNumber: number;
  /** Captured text (`text-pattern`) or decoded divider payload (`divider`). */
  value?: string;
  /** Why this page starts a new part, when it does. */
  boundary?: 'bookmark' | 'divider-blank' | 'divider-code' | 'value-change';
  /** True for a divider sheet that will not appear in any output. */
  dropped?: boolean;
}

export interface SplitPlan {
  mode: AdvancedSplitMode;
  parts: SplitPlanPart[];
  /** Pages deliberately left out of every part — divider sheets. */
  droppedPageNumbers: number[];
  notices: SplitPlanNotice[];
  /** Per-page detail for the modes that have any. Empty for the others. */
  pageRows: SplitPagePreviewRow[];
  /**
   * False when there is nothing worth writing. The screen shows the notices and
   * keeps the export button disabled rather than producing one giant file that
   * looks like a split.
   */
  usable: boolean;
  /** How many pages the plan covers, dividers excluded. */
  totalPagesCovered: number;
}

export interface SplitPlanProgress {
  /**
   * `measuring` counts parts completed (serializing to measure bytes is the
   * slow step, and a part is the unit of work). `scanning` and `reading` count
   * pages.
   */
  phase: 'measuring' | 'scanning' | 'reading';
  completed: number;
  /** Estimated for `measuring`, exact for the page-wise phases. */
  total: number;
  percent: number;
}

/* ─────────────── B1 — split by output file size ─────────────── */

export type SizeUnit = 'KB' | 'MB';

export interface MaxSizeSplitOptions {
  /** Hard ceiling in bytes. Every part must come out at or below it. */
  ceilingBytes: number;
  /**
   * Serializes the given pages and returns the byte length. Injected so the
   * planner measures through the very pipeline that will write the output —
   * `PdfPageManagerService.createChunkMeasurer()` supplies it in the app, and a
   * spec can supply a synthetic one.
   */
  measureBytes: (pageNumbers: number[]) => Promise<number>;
  signal?: AbortSignal;
  onProgress?: (progress: SplitPlanProgress) => void;
  /**
   * Safety valve on the binary search. Each part costs about log2(pages)
   * measurements; this caps the whole job so a pathological document cannot
   * spin forever on a phone.
   */
  maxMeasurements?: number;
}

/* ─────────────── B3 — split by bookmarks / chapters ─────────────── */

export interface OutlineBookmark {
  title: string;
  /** 1-based nesting level: a top-level bookmark is 1. */
  level: number;
  sourceDocId: string;
  /** 0-based page index inside that source document. */
  sourcePageIndex: number;
}

export interface OutlineReadResult {
  bookmarks: OutlineBookmark[];
  /** Deepest level found, 0 when there is no outline at all. */
  maxLevel: number;
  /** How many bookmarks sit at each level, indexed by level - 1. */
  countsByLevel: number[];
  /** Documents whose outline could not be read or that have none. */
  documentsWithoutOutline: string[];
}

/* ─────────────── B4 — split at blank pages or divider sheets ─────────────── */

export interface DividerScanOptions {
  pages: PdfPageItem[];
  sourceDocsMap: Map<string, PdfSourceDocument>;
  /** Treat a detected blank page as a divider. */
  detectBlank: boolean;
  /** Treat a page carrying a QR or barcode as a divider. */
  detectBarcode: boolean;
  /** Passed through to BlankPageService; its own default applies when unset. */
  blankThreshold?: number;
  /** Render scale for the barcode pass. Codes need more pixels than blankness does. */
  barcodeScale?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SplitPlanProgress) => void;
}

/** What the divider scan concluded about one page. */
export interface DividerPageClassification {
  pageNumber: number;
  isBlank: boolean;
  /** Decoded payload of the first code found on the page, when any. */
  barcodePayload?: string;
  /** True when this page is to be treated as a divider sheet. */
  isDivider: boolean;
  /** Which test flagged it. */
  dividerKind?: 'blank' | 'code';
}

export interface DividerScanResult {
  classifications: DividerPageClassification[];
  blankCount: number;
  codeCount: number;
}

export interface DividerPlanOptions {
  /** Name each part from the payload decoded off the divider that starts it. */
  nameFromPayload: boolean;
  /** Base name for parts with no payload to take a name from. */
  fallbackBaseName?: string;
}

/* ─────────────── B5 — split by text pattern ─────────────── */

export interface TextPatternScanOptions {
  pages: PdfPageItem[];
  sourceDocsMap: Map<string, PdfSourceDocument>;
  /** Regular expression source. A capture group, when present, is the value. */
  pattern: string;
  /** Regex flags. `g` is stripped — the scan wants the first match per page. */
  flags?: string;
  /**
   * Restrict matching to a band at the top of the page, as a fraction of page
   * height (0.2 = the top 20%). Unset reads the whole page.
   */
  regionTopFraction?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SplitPlanProgress) => void;
}

/** What the pattern scan read off one page. */
export interface TextPatternPageValue {
  pageNumber: number;
  /** Captured value, or undefined when the pattern did not match this page. */
  value?: string;
  /** True when the page has no text layer at all to match against. */
  noTextLayer: boolean;
  /** A short excerpt of what was searched, for the preview. */
  excerpt?: string;
}

export interface TextPatternScanResult {
  values: TextPatternPageValue[];
  matchedPageCount: number;
  pagesWithoutText: number[];
  /** Set when the pattern itself could not be compiled. */
  patternError?: string;
}

/* ─────────────── Screen state ─────────────── */

/**
 * Everything the five new modes' controls hold, in one object so the organizer
 * can keep it in a single field and the panel can emit a replacement rather
 * than mutating what it was handed.
 */
export interface AdvancedSplitConfig {
  /** B1 — the ceiling, in `sizeUnit`. */
  sizeValue: number;
  sizeUnit: SizeUnit;
  /** B2 — how many files to divide into. */
  docCount: number;
  /** B3 — split at bookmarks at or above this nesting level. */
  chapterLevel: number;
  /** B4 — which signals count as a divider sheet, and whether to name from one. */
  dividerBlank: boolean;
  dividerBarcode: boolean;
  dividerNameFromPayload: boolean;
  /** B5 — the pattern, its case sensitivity, and the optional top-of-page band. */
  textPattern: string;
  textIgnoreCase: boolean;
  textUseRegion: boolean;
  /** Height of the band to read, as a percentage of the page. */
  textRegionPercent: number;
}

/** Size ceilings offered as one-tap presets. Named by size, never by purpose. */
export interface SizeCeilingPreset {
  value: number;
  unit: SizeUnit;
}

export const SIZE_CEILING_PRESETS: SizeCeilingPreset[] = [
  { value: 200, unit: 'KB' },
  { value: 500, unit: 'KB' },
  { value: 1, unit: 'MB' },
  { value: 2, unit: 'MB' },
  { value: 5, unit: 'MB' },
  { value: 10, unit: 'MB' }
];

export function ceilingToBytes(value: number, unit: SizeUnit): number {
  const multiplier = unit === 'MB' ? 1024 * 1024 : 1024;
  return Math.max(1, Math.round(value * multiplier));
}

export function defaultAdvancedSplitConfig(): AdvancedSplitConfig {
  return {
    sizeValue: 2,
    sizeUnit: 'MB',
    docCount: 2,
    chapterLevel: 1,
    dividerBlank: true,
    dividerBarcode: false,
    dividerNameFromPayload: false,
    textPattern: '',
    textIgnoreCase: true,
    textUseRegion: false,
    textRegionPercent: 20
  };
}
