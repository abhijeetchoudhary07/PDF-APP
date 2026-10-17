import { SplitPlanNotice } from './pdf-split.types';

/**
 * B6 (page sectioning) and B7 (poster tiling) are splits of a different shape
 * from B1–B5: they cut *within* a page rather than between pages, so one
 * document goes in and one document comes out, with more pages than it had.
 * Both work the same way — copy the page once per piece and give each copy its
 * own CropBox — which is why they share these types and one service.
 */
export type SectioningMode = 'sections' | 'tiles';

export const SECTIONING_MODES: SectioningMode[] = ['sections', 'tiles'];

/**
 * True for the two modes that cut inside a page. They are split modes on the
 * picker, but they write one document rather than several, so the export path
 * and the button that starts it both have to tell them apart.
 */
export function isSectioningMode(mode: string): mode is SectioningMode {
  return (SECTIONING_MODES as string[]).includes(mode);
}

/** A rectangle in PDF user space, absolute, origin bottom-left. */
export interface UserSpaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A rectangle as the reader sees it: origin top-left, after the page's /Rotate
 * has been applied. Grids are laid out here, because "the left half" means the
 * left half of what is on screen, not of the unrotated user space.
 */
export interface VisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SectionOrder = 'ltr' | 'ttb';

export interface SectionGridOptions {
  rows: number;
  columns: number;
  /** Reading order of the pieces: across rows first, or down columns first. */
  order: SectionOrder;
  /**
   * For a 1x2 book spread: cut at the whitespace valley near the middle rather
   * than at exactly 50%. Ignored for any other grid, where there is no gutter
   * to find.
   */
  useGutterDetection: boolean;
}

export type PaperSize = 'A4' | 'Letter';

/** Paper sizes in points, portrait. */
export const PAPER_SIZES_PT: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 }
};

export const MM_TO_PT = 72 / 25.4;

export interface TilingOptions {
  paper: PaperSize;
  /** `auto` turns the sheet to whichever way needs fewer of them. */
  orientation: 'auto' | 'portrait' | 'landscape';
  /** How far neighbouring tiles repeat each other, in millimetres. */
  overlapMm: number;
  /** Corner marks just inside each tile, to trim and butt the sheets together. */
  cropMarks: boolean;
  /** A row/column label on each tile, so a stack of sheets can be reassembled. */
  numbering: boolean;
}

/** One output page: a copy of a source page showing one piece of it. */
export interface SectionPiece {
  /** 1-indexed position of the source page on the organizer canvas. */
  sourcePageNumber: number;
  /** Position of this piece in the output document, 0-indexed. */
  outputIndex: number;
  row: number;
  column: number;
  /** The CropBox this copy gets, in absolute PDF user space. */
  cropBox: UserSpaceRect;
  /** The piece as the reader will see it, for the preview overlay. */
  visual: VisualRect;
  /** Finished size in points, after the page's rotation. */
  widthPt: number;
  heightPt: number;
  /** True when this cut used a detected gutter rather than the even split. */
  gutterApplied?: boolean;
}

export interface SectionPlan {
  mode: SectioningMode;
  pieces: SectionPiece[];
  notices: SplitPlanNotice[];
  usable: boolean;
  /** How many source pages the plan covers. */
  sourcePageCount: number;
  /** Pieces per source page, indexed by source page number - 1. */
  piecesPerPage: number[];
  /** Total output pages — the sheet count for tiling. */
  totalPieces: number;
  /** Tiling only: the grid each source page was cut into. */
  tileGrid?: { rows: number; columns: number };
}

/** What a column-ink scan concluded about one page's gutter. */
export interface GutterResult {
  found: boolean;
  /** Where to cut, as a fraction of the visual width. 0.5 when none was found. */
  fraction: number;
  /** Mean ink in the chosen valley, against the page mean, for the report. */
  valleyRatio?: number;
}

export interface SectioningProgress {
  phase: 'measuring' | 'writing';
  completed: number;
  total: number;
  percent: number;
}

/* ─────────────── Screen state ─────────────── */

/** Everything the sectioning and tiling controls hold, in one object. */
export interface SectioningConfig {
  /** B6 grid. */
  rows: number;
  columns: number;
  order: SectionOrder;
  useGutterDetection: boolean;
  /** B7 tiling. */
  paper: PaperSize;
  orientation: 'auto' | 'portrait' | 'landscape';
  overlapMm: number;
  cropMarks: boolean;
  numbering: boolean;
}

/** A one-tap grid, named by what it does rather than by any page size. */
export interface SectionPreset {
  id: string;
  rows: number;
  columns: number;
  labelKey: string;
}

export const SECTION_PRESETS: SectionPreset[] = [
  { id: 'halves-v', rows: 1, columns: 2, labelKey: 'organizer.sectionPresetHalvesV' },
  { id: 'halves-h', rows: 2, columns: 1, labelKey: 'organizer.sectionPresetHalvesH' },
  { id: 'quarters', rows: 2, columns: 2, labelKey: 'organizer.sectionPresetQuarters' },
  { id: 'thirds-v', rows: 1, columns: 3, labelKey: 'organizer.sectionPresetThirdsV' },
  { id: 'sixths', rows: 2, columns: 3, labelKey: 'organizer.sectionPresetSixths' }
];

export const OVERLAP_PRESETS_MM = [0, 3, 5, 10];

export function defaultSectioningConfig(): SectioningConfig {
  return {
    rows: 1,
    columns: 2,
    order: 'ltr',
    useGutterDetection: false,
    paper: 'A4',
    orientation: 'auto',
    overlapMm: 5,
    cropMarks: true,
    numbering: true
  };
}
