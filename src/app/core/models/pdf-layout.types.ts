/**
 * Page geometry — Part D.
 *
 * Six operations that re-lay a document out without changing what is on it:
 * normalize to one page size (D1), crop or auto-trim margins (D2), add margins
 * (D3), N-up onto fewer sheets (D4), saddle-stitch booklet imposition (D5) and
 * stack everything onto one long page (D6). The seventh, tone (D7), is the odd
 * one out: it rasterises, and says so loudly before it runs.
 *
 * All six geometry passes go through `PdfDrawPageUtil`, so each one keeps the
 * source vector content and its selectable text. Each returns the pages it
 * wrote plus `notices` describing anything it could not do — never a quietly
 * partial result.
 */

import { PdfExportResult } from './pdf-organization.types';

/* ════════════════════════════════════════════════════════════════════
 * Paper
 * ════════════════════════════════════════════════════════════════════ */

export type LayoutPaperSize =
  | 'A0'
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6'
  | 'Letter'
  | 'Legal';

/** A target size, or the instruction to leave each page the size it is. */
export type LayoutTargetSize = LayoutPaperSize | 'original';

export type LayoutOrientation = 'portrait' | 'landscape' | 'auto';

export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;

/**
 * Standard sizes in points, portrait.
 *
 * A-series values are the ISO millimetre sizes converted at 72/25.4 and
 * rounded to two decimals, which is what every other PDF tool writes; Letter
 * and Legal are exact inch multiples. `PAPER_SIZES_PT` in
 * pdf-sectioning.types.ts covers only the two sizes the tiler offers and is
 * left alone — this is the wider set the Layout Studio needs.
 */
export const LAYOUT_PAPER_SIZES_PT: Record<LayoutPaperSize, { width: number; height: number }> = {
  A0: { width: 2383.94, height: 3370.39 },
  A1: { width: 1683.78, height: 2383.94 },
  A2: { width: 1190.55, height: 1683.78 },
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  A6: { width: 297.64, height: 419.53 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 }
};

/** Smallest first — the order the size picker shows and `nextLargerPaper` walks. */
export const LAYOUT_PAPER_ORDER: LayoutPaperSize[] = [
  'A6',
  'A5',
  'A4',
  'Letter',
  'Legal',
  'A3',
  'A2',
  'A1',
  'A0'
];

/**
 * A target size in points, turned to the requested orientation.
 *
 * `auto` keeps the sheet portrait; a caller that wants the sheet to follow the
 * content turns it itself, because only the caller knows what the content is.
 */
export function paperSizePt(
  size: LayoutPaperSize,
  orientation: LayoutOrientation = 'portrait'
): { width: number; height: number } {
  const base = LAYOUT_PAPER_SIZES_PT[size];
  if (orientation === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return { ...base };
}

/** Turns a size to match an orientation, whichever way round it arrived. */
export function orientSize(
  size: { width: number; height: number },
  orientation: LayoutOrientation
): { width: number; height: number } {
  if (orientation === 'portrait' && size.width > size.height) {
    return { width: size.height, height: size.width };
  }
  if (orientation === 'landscape' && size.height > size.width) {
    return { width: size.height, height: size.width };
  }
  return { ...size };
}

/** The A series, smallest first. A page on one of these steps up within it. */
export const A_SERIES_ORDER: LayoutPaperSize[] = ['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0'];

/**
 * The next standard size up from a page, for D3's "grow to the next paper
 * size" option.
 *
 * A page that already measures an A size steps up within the A series, because
 * that is what "the next size up" means to anyone holding A4 paper. Legal
 * technically contains A4 — it is wider and taller — and is smaller than A3, so
 * a purely geometric answer would hand back Legal, which is not a size anybody
 * asking this question wants.
 *
 * Anything else gets the smallest standard sheet that contains it. Returns
 * undefined for a page with nothing above it, which then grows by a
 * measurement instead.
 */
export function nextLargerPaper(
  width: number,
  height: number,
  tolerancePt = 1
): LayoutPaperSize | undefined {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);

  const current = matchStandardPaper(width, height, 3);
  if (current) {
    const seriesIndex = A_SERIES_ORDER.indexOf(current);
    if (seriesIndex >= 0) {
      return A_SERIES_ORDER[seriesIndex + 1];
    }
  }

  for (const name of LAYOUT_PAPER_ORDER) {
    const paper = LAYOUT_PAPER_SIZES_PT[name];
    const paperShort = Math.min(paper.width, paper.height);
    const paperLong = Math.max(paper.width, paper.height);
    // Strictly larger by more than the tolerance, so a size never grows to itself.
    if (paperShort - tolerancePt > shortSide && paperLong - tolerancePt > longSide) {
      return name;
    }
  }
  return undefined;
}

/**
 * The standard size a measurement matches, within tolerance, or undefined.
 * A size name only — never an institution or exam board.
 */
export function matchStandardPaper(
  width: number,
  height: number,
  tolerancePt = 3
): LayoutPaperSize | undefined {
  for (const name of LAYOUT_PAPER_ORDER) {
    const paper = LAYOUT_PAPER_SIZES_PT[name];
    const sameWay =
      Math.abs(paper.width - width) <= tolerancePt &&
      Math.abs(paper.height - height) <= tolerancePt;
    const turned =
      Math.abs(paper.height - width) <= tolerancePt &&
      Math.abs(paper.width - height) <= tolerancePt;
    if (sameWay || turned) return name;
  }
  return undefined;
}

/* ════════════════════════════════════════════════════════════════════
 * Shared reporting
 * ════════════════════════════════════════════════════════════════════ */

/**
 * Something the person has to be told. The engine reports a kind and the data
 * behind it; the screen turns that into a translated sentence, so no
 * user-visible English is built in a service. Same contract as
 * `SplitPlanNotice`.
 */
export type LayoutNoticeKind
  /** The document's pages are not all the same size. */
  = 'mixed-page-sizes'
  /** A page was left alone because it was already at the target. */
  | 'unchanged-pages'
  /** Pages were enlarged, which can show compression artefacts. */
  | 'enlarged-pages'
  /** The auto-crop scan found no ink on a page, so it was left uncropped. */
  | 'auto-crop-blank-page'
  /** The auto-crop scan could not run here (no canvas), so nothing was cropped. */
  | 'auto-crop-unavailable'
  /** The crop box asked for is empty or inverted. */
  | 'crop-box-empty'
  /** The crop removed nothing, because the content already reaches the edges. */
  | 'crop-no-margin-found'
  /** Blank pages were added to pad a booklet to a multiple of four. */
  | 'booklet-padding'
  /** The N-up grid left cells empty on the last sheet. */
  | 'partial-last-sheet'
  /** One long page would exceed the format's 14,400-unit limit. */
  | 'long-page-limit'
  /** The long page was split into several because of that limit. */
  | 'long-page-split'
  /** Tone passes rasterise: the output has no selectable text. */
  | 'raster-output'
  /** A page could not be rasterised on this device and was copied unchanged. */
  | 'raster-page-skipped'
  /**
   * Re-drawing a page keeps its vector content and text but not its interactive
   * layer: links, form fields and annotations live on the page object, not in
   * the content stream, so a re-laid-out page loses them. Reported whenever the
   * source had any.
   */
  | 'annotations-dropped'
  /** The requested scale was clamped to the allowed range. */
  | 'scale-clamped';

export interface LayoutNotice {
  kind: LayoutNoticeKind;
  /** 1-indexed page numbers the notice is about, when it is about particular pages. */
  pageNumbers?: number[];
  /** A number the message needs — a count, a limit, a percentage. */
  count?: number;
  /** A string the message needs — a size name, a measurement, an error. */
  detail?: string;
}

/** Progress for a page-by-page pass, so a long job stays cancellable. */
export interface LayoutProgress {
  phase: 'measuring' | 'writing' | 'rendering';
  completed: number;
  total: number;
  percent: number;
}

/** What a geometry pass wrote, plus everything it has to own up to. */
export interface LayoutOutput extends PdfExportResult {
  notices: LayoutNotice[];
  /** Page count before the pass, for the before/after line on the screen. */
  sourcePageCount: number;
  /** Finished size of the first output page, for the summary line. */
  outputSize?: { width: number; height: number };
}

/* ════════════════════════════════════════════════════════════════════
 * D1 — normalize page size & scale
 * ════════════════════════════════════════════════════════════════════ */

export interface NormalizeOptions {
  target: LayoutTargetSize;
  orientation: LayoutOrientation;
  /** Extra scale applied inside the target page, as a fraction. 1 = fit. */
  scale: number;
  /** Centre the content in the target page; false pins it bottom-left. */
  centre: boolean;
  /** Never enlarge a page that is already smaller than the target. */
  shrinkOnly: boolean;
}

export function defaultNormalizeOptions(): NormalizeOptions {
  return {
    target: 'A4',
    orientation: 'auto',
    scale: 1,
    centre: true,
    shrinkOnly: false
  };
}

/** Narrowest and widest scale the UI and the engine both accept. */
export const MIN_LAYOUT_SCALE = 0.1;
export const MAX_LAYOUT_SCALE = 4;

/** What a document's page sizes look like, for the mixed-size flag. */
export interface PageSizeSurvey {
  /** One entry per distinct effective size, largest group first. */
  groups: Array<{
    key: string;
    widthPt: number;
    heightPt: number;
    standardName?: LayoutPaperSize;
    orientation: 'portrait' | 'landscape' | 'square';
    pageNumbers: number[];
  }>;
  mixed: boolean;
  pageCount: number;
  /** The size most pages are, which is the sensible normalization target. */
  dominant?: { widthPt: number; heightPt: number; standardName?: LayoutPaperSize };
}

/* ════════════════════════════════════════════════════════════════════
 * D2 — crop / trim margins
 * ════════════════════════════════════════════════════════════════════ */

export type CropScope = 'all' | 'range' | 'current';

/**
 * A crop region as a fraction of the visual page, origin top-left — the space
 * a drag on the preview is measured in, so the overlay and the output cannot
 * drift apart.
 */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fullCropRegion(): CropRegion {
  return { x: 0, y: 0, width: 1, height: 1 };
}

export interface CropOptions {
  /** `manual` uses `region`; `auto` measures each page's ink. */
  mode: 'manual' | 'auto';
  region: CropRegion;
  scope: CropScope;
  rangeString?: string;
  /**
   * Auto only. `true` applies one box — the union of every page's content —
   * to all pages, which keeps a book's pages aligned. `false` trims each page
   * to its own content.
   */
  uniform: boolean;
  /** Auto only: whitespace to leave around the detected content, in mm. */
  paddingMm: number;
  /** Auto only: how dark a pixel has to be to count as ink, 0-255. */
  inkThreshold: number;
}

export function defaultCropOptions(): CropOptions {
  return {
    mode: 'auto',
    region: fullCropRegion(),
    scope: 'all',
    uniform: true,
    paddingMm: 2,
    inkThreshold: 245
  };
}

/** What the ink scan found on one page, in visual fractions. */
export interface ContentBounds {
  pageNumber: number;
  /** Undefined when the page carried no ink at all. */
  region?: CropRegion;
  /** Fraction of the page the content occupies, for the report. */
  coverage?: number;
}

/* ════════════════════════════════════════════════════════════════════
 * D3 — add margins & padding
 * ════════════════════════════════════════════════════════════════════ */

export type MarginUnit = 'mm' | 'pt';

export interface MarginsOptions {
  unit: MarginUnit;
  /** One measurement on every edge. */
  uniform: boolean;
  all: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  /**
   * Instead of a measurement, grow each page to the next standard size and
   * centre the content in it. Ignores the four edge values.
   */
  growToNextPaper: boolean;
}

export function defaultMarginsOptions(): MarginsOptions {
  return {
    unit: 'mm',
    uniform: true,
    all: 10,
    top: 10,
    right: 10,
    bottom: 10,
    left: 20,
    growToNextPaper: false
  };
}

/** The four edges in points, whatever unit they were entered in. */
export function marginsInPoints(options: MarginsOptions): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const factor = options.unit === 'mm' ? PT_PER_MM : 1;
  const clamp = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0) * factor;
  if (options.uniform) {
    const all = clamp(options.all);
    return { top: all, right: all, bottom: all, left: all };
  }
  return {
    top: clamp(options.top),
    right: clamp(options.right),
    bottom: clamp(options.bottom),
    left: clamp(options.left)
  };
}

/* ════════════════════════════════════════════════════════════════════
 * D4 — N-up multi-page layout
 * ════════════════════════════════════════════════════════════════════ */

export type NupPerSheet = 2 | 4 | 6 | 9;

export const NUP_CHOICES: NupPerSheet[] = [2, 4, 6, 9];

export type NupOrder = 'row-major' | 'column-major';

export interface NupOptions {
  perSheet: NupPerSheet;
  order: NupOrder;
  sheet: LayoutTargetSize;
  orientation: LayoutOrientation;
  /** Space between cells, in mm. */
  gutterMm: number;
  /** Space around the whole grid, in mm. */
  marginMm: number;
  /** A hairline round each cell, for cutting. */
  border: boolean;
}

export function defaultNupOptions(): NupOptions {
  return {
    perSheet: 2,
    order: 'row-major',
    sheet: 'A4',
    orientation: 'auto',
    gutterMm: 4,
    marginMm: 8,
    border: false
  };
}

/** One cell of an N-up sheet, in the sheet's user space. */
export interface NupCell {
  sheetIndex: number;
  row: number;
  column: number;
  /** Position in the output document's reading order, 0-indexed. */
  cellIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1-indexed source page this cell holds, or undefined for an empty cell. */
  sourcePageNumber?: number;
}

export interface NupPlan {
  rows: number;
  columns: number;
  sheetWidth: number;
  sheetHeight: number;
  sheetCount: number;
  cells: NupCell[];
  /** Cells on the last sheet with no page in them. */
  emptyCellCount: number;
}

/* ════════════════════════════════════════════════════════════════════
 * D5 — booklet imposition
 * ════════════════════════════════════════════════════════════════════ */

export interface BookletOptions {
  sheet: LayoutTargetSize;
  /** Total creep to take off the outermost sheets, in mm. 0 = none. */
  creepMm: number;
  /** Which edge the fold is on. 'left' reads left-to-right. */
  binding: 'left' | 'right';
  /** A hairline down the fold, to help folding. */
  foldMark: boolean;
}

export function defaultBookletOptions(): BookletOptions {
  return {
    sheet: 'A4',
    creepMm: 0,
    binding: 'left',
    foldMark: false
  };
}

/** One side of one folded sheet: two pages, side by side. */
export interface BookletSide {
  /** 0-indexed output page. */
  outputIndex: number;
  /** Which physical sheet, 0-indexed. */
  sheetIndex: number;
  side: 'front' | 'back';
  /** 1-indexed source page on the left half, or 0 for a padding blank. */
  left: number;
  /** 1-indexed source page on the right half, or 0 for a padding blank. */
  right: number;
  /**
   * Creep for this sheet, in points — how far both halves shift towards the
   * fold. Outermost sheets shift most, the innermost not at all.
   */
  creepPt: number;
}

export interface BookletPlan {
  sides: BookletSide[];
  /** Page count after padding to a multiple of four. */
  paddedPageCount: number;
  /** How many blanks were added. */
  blanksAdded: number;
  sheetCount: number;
  /** The flat page sequence, for the acceptance check and the preview. */
  sequence: number[];
}

/* ════════════════════════════════════════════════════════════════════
 * D6 — single long page
 * ════════════════════════════════════════════════════════════════════ */

/**
 * The format's own ceiling. PDF 1.7, Annex C.2: the maximum page dimension a
 * conforming reader has to accept is 14,400 user-space units — 200 inches.
 * Past that, readers either refuse the page or clip it, so the limit is
 * enforced before the file is written rather than discovered afterwards.
 */
export const PDF_MAX_PAGE_DIMENSION_PT = 14400;

export type LongPageWidthMode = 'narrowest' | 'widest' | 'first';

export interface LongPageOptions {
  /** Gap between stacked pages, in mm. */
  gapMm: number;
  /** Which page's width every page is scaled to. */
  widthMode: LongPageWidthMode;
  /**
   * Split into several long pages when one would exceed the limit. False
   * refuses to write instead, which is what the screen offers as the choice.
   */
  splitWhenTooTall: boolean;
  /** A background behind the stack, so gaps are not transparent. */
  fillGaps: boolean;
}

export function defaultLongPageOptions(): LongPageOptions {
  return {
    gapMm: 0,
    widthMode: 'widest',
    splitWhenTooTall: true,
    fillGaps: true
  };
}

/** What stacking would produce, worked out before anything is written. */
export interface LongPagePlan {
  /** Target width every page is scaled to, in points. */
  widthPt: number;
  /** One entry per output page: the source pages it stacks, in order. */
  columns: Array<{
    sourcePageNumbers: number[];
    heightPt: number;
  }>;
  /** Height one single page would have needed. */
  totalHeightPt: number;
  /** True when that height is over the format limit. */
  exceedsLimit: boolean;
  /** How many long pages the output will have. */
  outputPageCount: number;
}

/* ════════════════════════════════════════════════════════════════════
 * D7 — tone passes
 * ════════════════════════════════════════════════════════════════════ */

export type TonePass = 'grayscale' | 'invert' | 'high-contrast';

export const TONE_PASSES: TonePass[] = ['grayscale', 'invert', 'high-contrast'];

export interface ToneOptions {
  pass: TonePass;
  /** Render resolution. Higher is sharper and bigger. */
  dpi: number;
  /** JPEG quality for the rasterised page, 0.3-1. */
  quality: number;
  /** `high-contrast` only: the mid-point, 0-255. */
  threshold: number;
}

export const TONE_DPI_CHOICES = [96, 150, 200, 300];

export function defaultToneOptions(): ToneOptions {
  return {
    pass: 'grayscale',
    dpi: 150,
    quality: 0.82,
    threshold: 150
  };
}

/**
 * The size estimate shown before a tone pass runs.
 *
 * Measured by rendering one page and multiplying, not guessed: a tone pass can
 * easily make a file ten times larger, and that has to be on screen before the
 * person commits to it rather than after.
 */
export interface ToneEstimate {
  /** Bytes the first rendered page came to. */
  samplePageBytes: number;
  /** Rough total, sample x page count, plus the document overhead. */
  estimatedBytes: number;
  pageCount: number;
  /** Pixel size of the sampled page at the chosen DPI. */
  samplePixels: { width: number; height: number };
  /** Set when no page could be rasterised here, so no estimate was possible. */
  unavailableReason?: string;
}

/* ════════════════════════════════════════════════════════════════════
 * Screen state
 * ════════════════════════════════════════════════════════════════════ */

/** The Layout Studio's tabs. One operation each. */
export type LayoutMode =
  | 'normalize'
  | 'crop'
  | 'margins'
  | 'nup'
  | 'booklet'
  | 'long-page'
  | 'tone';

export const LAYOUT_MODES: LayoutMode[] = [
  'normalize',
  'crop',
  'margins',
  'nup',
  'booklet',
  'long-page',
  'tone'
];

export function isLayoutMode(value: string): value is LayoutMode {
  return (LAYOUT_MODES as string[]).includes(value);
}

/** Everything the Layout Studio's controls hold, in one object. */
export interface LayoutStudioConfig {
  normalize: NormalizeOptions;
  crop: CropOptions;
  margins: MarginsOptions;
  nup: NupOptions;
  booklet: BookletOptions;
  longPage: LongPageOptions;
  tone: ToneOptions;
}

export function defaultLayoutStudioConfig(): LayoutStudioConfig {
  return {
    normalize: defaultNormalizeOptions(),
    crop: defaultCropOptions(),
    margins: defaultMarginsOptions(),
    nup: defaultNupOptions(),
    booklet: defaultBookletOptions(),
    longPage: defaultLongPageOptions(),
    tone: defaultToneOptions()
  };
}
