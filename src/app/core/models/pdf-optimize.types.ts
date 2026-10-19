/**
 * Size & output control — Part F.
 *
 * Six ways to make a file smaller, kept strictly apart from the compression
 * that already ships. `CompressionService.compressToExactKB` and
 * `PdfService.compressPdfToExactKB` are untouched: their three presets and
 * their target-KB behaviour are exactly what they were. Everything here is a
 * new path that a person chooses deliberately.
 *
 * The organising idea is that each pass has to say what it cost. A smaller
 * file is only good news if you know what was given up for it, so every
 * operation below returns a report — which images were resampled, how many
 * duplicates were collapsed, whether text stopped being text — rather than
 * just a number of bytes.
 */

import { PdfExportResult } from './pdf-organization.types';

/* ════════════════════════════════════════════════════════════════════
 * Shared
 * ════════════════════════════════════════════════════════════════════ */

export interface OptimizeProgress {
  phase: 'inventory' | 'measuring' | 'rendering' | 'writing' | 'verifying';
  completed: number;
  total: number;
  percent: number;
  /** The file currently being worked on, for the batch paths. */
  label?: string;
}

export type OptimizeNoticeKind
  /** Nothing in the document could be improved by this pass. */
  = 'nothing-to-do'
  /** Images were resampled down to the ceiling. */
  | 'images-downsampled'
  /** Images were already at or below the ceiling. */
  | 'images-already-under'
  /** An image could not be decoded here and was left exactly as it was. */
  | 'image-skipped'
  /** The device has no canvas, so no image could be resampled at all. */
  | 'resampling-unavailable'
  /** Repeated images were collapsed onto one object. */
  | 'duplicates-collapsed'
  /** The document had no repeated images. */
  | 'no-duplicates'
  /** Unreferenced objects were dropped. */
  | 'orphans-dropped'
  /** The pass rewrote the file and the result is smaller. */
  | 'structure-rewritten'
  /** The output has no selectable text any more. */
  | 'text-rasterized'
  /** The document has a real text layer, which a raster path would destroy. */
  | 'has-text-layer'
  /** The chain stopped early because the target was already met. */
  | 'target-met-early'
  /** The chain ran out of steps without reaching the target. */
  | 'target-unreachable'
  /** A verification pass found the output renders differently, so it was dropped. */
  | 'verification-failed'
  /** Verification could not render pages here and fell back to a structural check. */
  | 'verification-structural';

export interface OptimizeNotice {
  kind: OptimizeNoticeKind;
  count?: number;
  detail?: string;
  pageNumbers?: number[];
  /** Bytes this notice is about, when it is about bytes. */
  bytes?: number;
}

/** What any Part F pass produces. */
export interface OptimizeOutput extends PdfExportResult {
  notices: OptimizeNotice[];
  originalSizeBytes: number;
  /** Negative when the pass made the file larger, which is reported honestly. */
  savedBytes: number;
  savedPercent: number;
  /** True when the output has no text layer left. */
  rasterized: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * Image inventory — what F1, F2 and F3 all read first
 * ════════════════════════════════════════════════════════════════════ */

/** One image XObject in the file. */
export interface PdfImageEntry {
  /** The indirect object key, e.g. "12 0 R". Stable within one load. */
  key: string;
  pixelWidth: number;
  pixelHeight: number;
  /** Stream filters, outermost first: DCTDecode, FlateDecode, JPXDecode… */
  filters: string[];
  colorSpace?: string;
  bitsPerComponent?: number;
  /** Bytes the encoded stream occupies. */
  streamBytes: number;
  /** True for a stencil mask or an /SMask, which are never resampled alone. */
  isMask: boolean;
  /**
   * True when this tool can decode and re-encode the stream. A JPEG or a
   * Flate-encoded bitmap can be; JPX and CCITT are left alone rather than
   * guessed at.
   */
  reEncodable: boolean;
}

/** Where an image is drawn, and what that makes its resolution. */
export interface PdfImagePlacement {
  /** 1-indexed. */
  pageNumber: number;
  imageKey: string;
  resourceName: string;
  drawnWidthPt: number;
  drawnHeightPt: number;
  /** Pixels per inch along each axis at the drawn size. */
  dpiX: number;
  dpiY: number;
  /** The larger of the two, which is what a ceiling is compared against. */
  effectiveDpi: number;
}

export interface PdfImageInventory {
  images: PdfImageEntry[];
  placements: PdfImagePlacement[];
  /** Images that are never drawn — candidates for the structure pass. */
  unusedImageKeys: string[];
  inlineImageCount: number;
  totalImageBytes: number;
  pageCount: number;
  /** True when a content stream hit the scanner's operator budget. */
  truncated: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * F1 — DPI ceiling & downsample report
 * ════════════════════════════════════════════════════════════════════ */

/** `none` is today's behaviour and the default. */
export type DpiCeiling = 72 | 96 | 150 | 200 | 300 | 'none';

export const DPI_CEILINGS: DpiCeiling[] = ['none', 72, 96, 150, 200, 300];

export interface DownsampleOptions {
  ceiling: DpiCeiling;
  /** JPEG quality for a resampled image, 0.3-1. */
  quality: number;
  /**
   * Leave an image alone unless resampling would shrink it by at least this
   * fraction. Re-encoding for a 3% gain costs more in quality than it saves.
   */
  minGain: number;
}

export function defaultDownsampleOptions(): DownsampleOptions {
  return { ceiling: 'none', quality: 0.82, minGain: 0.1 };
}

/** One row of the per-image report. */
export interface DownsampleRow {
  imageKey: string;
  pageNumbers: number[];
  originalPixels: { width: number; height: number };
  newPixels: { width: number; height: number };
  originalDpi: number;
  newDpi: number;
  originalBytes: number;
  newBytes: number;
  savedBytes: number;
  /** Set when the image was left alone, and why. */
  skippedReason?: 'already-under' | 'not-re-encodable' | 'is-mask' | 'no-gain' | 'decode-failed';
}

export interface DownsamplePlan {
  rows: DownsampleRow[];
  /** Images the ceiling would actually touch. */
  candidateCount: number;
  estimatedSavedBytes: number;
  totalImageBytes: number;
}

/* ════════════════════════════════════════════════════════════════════
 * F2 — grayscale & mono paths
 * ════════════════════════════════════════════════════════════════════ */

/** `colour` is today's behaviour and the default. */
export type ColourPath = 'colour' | 'grayscale' | 'mono';

export const COLOUR_PATHS: ColourPath[] = ['colour', 'grayscale', 'mono'];

export interface ColourPathOptions {
  path: ColourPath;
  /** `mono` only: how far the adaptive threshold leans, -64..64. */
  monoBias: number;
  /** Render resolution for the raster paths. */
  dpi: number;
  quality: number;
  /**
   * The person has confirmed this document is a scan and accepts losing its
   * text layer. Required before a raster path runs on a document that has one.
   */
  confirmedScan: boolean;
}

export function defaultColourPathOptions(): ColourPathOptions {
  return { path: 'colour', monoBias: 0, dpi: 150, quality: 0.8, confirmedScan: false };
}

/** What a text-layer probe concluded. */
export interface TextLayerReport {
  hasTextLayer: boolean;
  /** Characters found across the sampled pages. */
  characterCount: number;
  sampledPages: number;
  /** True when the probe could not run here. */
  unavailable?: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * F3 — identical-image dedupe
 * ════════════════════════════════════════════════════════════════════ */

/** One set of byte-identical images. */
export interface DuplicateImageGroup {
  /** The object kept. */
  keepKey: string;
  /** The objects that pointed at the same bytes and were dropped. */
  dropKeys: string[];
  pixelWidth: number;
  pixelHeight: number;
  bytesEach: number;
  savedBytes: number;
}

export interface DedupePlan {
  groups: DuplicateImageGroup[];
  duplicateCount: number;
  estimatedSavedBytes: number;
}

/* ════════════════════════════════════════════════════════════════════
 * F4 — before/after proof
 * ════════════════════════════════════════════════════════════════════ */

export interface ProofPageRow {
  pageNumber: number;
  beforeBytes: number;
  afterBytes: number;
  savedBytes: number;
  savedPercent: number;
}

export interface ProofSummary {
  beforeBytes: number;
  afterBytes: number;
  savedBytes: number;
  savedPercent: number;
  /** The page that gave up the largest share of its bytes. */
  worstPage?: ProofPageRow;
  /** The page that gave up the smallest share. */
  bestPage?: ProofPageRow;
  pages: ProofPageRow[];
  /** True when the output has no text layer any more. */
  textRasterized: boolean;
}

/** A rendered pair for the side-by-side view. */
export interface ProofRender {
  pageNumber: number;
  beforeUrl?: string;
  afterUrl?: string;
  unavailableReason?: string;
}

/* ════════════════════════════════════════════════════════════════════
 * F5 — fit the upload limit
 * ════════════════════════════════════════════════════════════════════ */

export type FitStepKind =
  | 'strip-metadata'
  | 'structure'
  | 'dedupe'
  | 'downsample'
  | 'grayscale'
  | 'mono';

export const FIT_STEP_ORDER: FitStepKind[] = [
  'strip-metadata',
  'structure',
  'dedupe',
  'downsample',
  'grayscale',
  'mono'
];

export interface FitLimitOptions {
  /** The ceiling the file has to come under, in kilobytes. */
  targetKB: number;
  /** Steps the person has allowed. A step not listed is never run. */
  allowedSteps: FitStepKind[];
  /** DPI ceiling for the downsample step. */
  downsampleCeiling: DpiCeiling;
  /** The person accepts losing the text layer, which gates the raster steps. */
  confirmedScan: boolean;
}

export function defaultFitLimitOptions(): FitLimitOptions {
  return {
    targetKB: 500,
    allowedSteps: ['strip-metadata', 'structure', 'dedupe', 'downsample'],
    downsampleCeiling: 150,
    confirmedScan: false
  };
}

/** One step the chain ran, and what it cost. */
export interface FitStepResult {
  kind: FitStepKind;
  ran: boolean;
  /** Why the step was not run, when it was not. */
  skippedReason?: 'not-allowed' | 'needs-confirmation' | 'target-already-met' | 'unavailable' | 'no-effect';
  beforeBytes: number;
  afterBytes: number;
  savedBytes: number;
  /** True when this step cost the document its text layer. */
  rasterized?: boolean;
  notices: OptimizeNotice[];
}

export interface FitLimitResult extends OptimizeOutput {
  steps: FitStepResult[];
  targetBytes: number;
  /** True when the output is at or under the target. */
  targetMet: boolean;
  /**
   * Set when nothing left in the chain could get there. The screen offers the
   * size-based split instead of degrading the file further.
   */
  suggestSplit?: boolean;
}

/* ════════════════════════════════════════════════════════════════════
 * F6 — structure optimizer
 * ════════════════════════════════════════════════════════════════════ */

export interface StructureOptions {
  /** Drop objects nothing references. */
  dropOrphans: boolean;
  /** Write with object streams, which is smaller and still standard. */
  useObjectStreams: boolean;
  /** Remove document metadata and the XMP packet. */
  stripMetadata: boolean;
  /**
   * Verify the output renders the same before accepting it. Slower, and worth
   * it: a structure pass that drops a live object produces a file that opens
   * and is missing something.
   */
  verify: boolean;
}

export function defaultStructureOptions(): StructureOptions {
  return {
    dropOrphans: true,
    useObjectStreams: true,
    stripMetadata: false,
    verify: true
  };
}

export interface StructureReport {
  objectsBefore: number;
  objectsAfter: number;
  orphansDropped: number;
  bytesBefore: number;
  bytesAfter: number;
}

/** How a verification pass compared two documents. */
export interface VerificationResult {
  matches: boolean;
  /** 'render' compared pixels; 'structural' compared page count, size and text. */
  method: 'render' | 'structural';
  /** 1-indexed pages that differ. */
  differingPages: number[];
  detail?: string;
}

/* ════════════════════════════════════════════════════════════════════
 * Screen state
 * ════════════════════════════════════════════════════════════════════ */

/** The Optimize Studio's tabs — F1 to F6. */
export type OptimizeMode = 'images' | 'colour' | 'duplicates' | 'proof' | 'fit' | 'structure';

export const OPTIMIZE_MODES: OptimizeMode[] = [
  'images',
  'colour',
  'duplicates',
  'proof',
  'fit',
  'structure'
];

export function isOptimizeMode(value: string): value is OptimizeMode {
  return (OPTIMIZE_MODES as string[]).includes(value);
}

export interface OptimizeStudioConfig {
  downsample: DownsampleOptions;
  colour: ColourPathOptions;
  structure: StructureOptions;
  fit: FitLimitOptions;
}

export function defaultOptimizeStudioConfig(): OptimizeStudioConfig {
  return {
    downsample: defaultDownsampleOptions(),
    colour: defaultColourPathOptions(),
    structure: defaultStructureOptions(),
    fit: defaultFitLimitOptions()
  };
}
