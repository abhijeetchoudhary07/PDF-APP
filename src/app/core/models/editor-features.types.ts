import type { Rect, Point, FontStyleName } from './pdf-editor.types';

// ==========================================
// K1: Find & Replace Types
// ==========================================

export interface FindReplaceOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeFormFields?: boolean;
  /**
   * Rewrite text that is baked into the page's content stream.
   *
   * Off by default, because the only honest way to do it on-device is K6's
   * whiteout-and-retype: the whole text run is covered and redrawn in the
   * matched standard font. That is visible on the page, so the user opts in
   * and the result says how many runs it touched.
   */
  replaceExistingPageText?: boolean;
}

export interface FindMatch {
  id: string;
  pageNumber: number; // 1-indexed
  matchIndex: number;
  /** The whole run or field value the hit sits in, for the match list. */
  text: string;
  matchedText: string;
  /** Character offset of the hit inside `text`. */
  offset: number;
  /** Top-left origin, PDF points: the hit itself, not the whole run. */
  bounds: Rect;
  /** Top-left origin, PDF points: the whole run, which is what gets covered. */
  runBounds: Rect;
  source: 'page-text' | 'form-field' | 'editor-element';
  elementId?: string;
  fieldName?: string;
  /** Baseline distance from the top of the page, for page-text hits. */
  baselineY?: number;
  fontSize?: number;
  fontFamily?: FontStyleName;
}

export interface FindReplaceResult {
  matchesFound: number;
  matchesReplaced: number;
  /** Page-text hits left alone because `replaceExistingPageText` was off. */
  unsupportedExistingTextSkipped: number;
  /** Page-text runs covered and redrawn rather than edited in place. */
  runsRewrittenByWhiteout: number;
  /**
   * Rewritten runs whose original wording is still in the text layer. Not
   * zero means a search of the output can still find what was replaced.
   */
  runsStillInTextLayer: number;
  /** Characters the standard fonts could not draw, across every rewrite. */
  droppedCharacters: number;
  droppedSample: string;
  replacedMatches: FindMatch[];
  updatedPdfBytes?: Uint8Array;
}

// ==========================================
// K2: Link Editor Types
// ==========================================

export type LinkDestinationType = 'url' | 'page';

export interface PdfHyperlink {
  id: string;
  pageNumber: number; // 1-indexed page where link resides
  /** Unscaled PDF points, TOP-LEFT origin -- the editor's space, not the file's. */
  rect: Rect;
  type: LinkDestinationType;
  url?: string;
  targetPage?: number; // 1-indexed target page
  isDangling?: boolean; // flags targetPage > totalPages or <= 0
  label?: string;
  /**
   * `existing` links were read out of the opened file; `added` ones were made
   * in this session. Only `existing` links carry `annotIndex`, which is what
   * lets a delete find the right entry in that page's /Annots array.
   */
  origin?: 'existing' | 'added';
  annotIndex?: number;
}

export interface LinkEditPlan {
  /** Links to write into the file. */
  add: PdfHyperlink[];
  /** `existing` links to strip, matched by page number and /Annots index. */
  remove: PdfHyperlink[];
}

export interface LinkWriteResult {
  pdfBytes: Uint8Array;
  added: number;
  removed: number;
}

export interface LinkAuditReport {
  totalLinks: number;
  urlLinksCount: number;
  pageLinksCount: number;
  danglingLinksCount: number;
  danglingLinks: PdfHyperlink[];
  links: PdfHyperlink[];
}

// ==========================================
// K3: Comment & Review Threads Types
// ==========================================

export interface CommentReply {
  id: string;
  author: string;
  initials: string;
  createdAt: number;
  text: string;
}

export interface CommentThread {
  id: string;
  pageNumber: number; // 1-indexed
  x: number;
  y: number;
  author: string;
  initials: string;
  createdAt: number;
  text: string;
  resolved: boolean;
  replies: CommentReply[];
}

export interface CommentSummaryResult {
  pdfBytes: Uint8Array;
  /** One row per thread; replies are listed under their thread. */
  rowCount: number;
  droppedCharacters: number;
  droppedSample: string;
  pageCount: number;
}

export interface CommentSummaryRow {
  page: number;
  author: string;
  initials: string;
  date: string;
  text: string;
  status: 'Resolved' | 'Open';
  repliesCount: number;
}

// ==========================================
// K4: Editor Image Tools & Whiteout Types
// ==========================================

export interface PageImageRef {
  id: string;
  pageNumber: number;
  /** Where the image is painted, top-left origin, PDF points. */
  rect: Rect;
  /** The XObject's name inside the page's /Resources /XObject dictionary. */
  objectName: string;
  /** The image's own pixel size, which is not its size on the page. */
  pixelWidth: number;
  pixelHeight: number;
  dataUrl?: string;
  mimeType?: string;
}

export interface WhiteoutRegion {
  id: string;
  pageNumber: number;
  /** Top-left origin, PDF points. */
  rect: Rect;
  /** e.g. '#FFFFFF'. Sampled from the page behind it when it was created. */
  fillColor: string;
  disclaimerAcknowledged: boolean;
  /** True when `fillColor` came from the page rather than from the default. */
  colorSampledFromPage?: boolean;
}

export type ImageToolAction = 'replace' | 'delete' | 'crop' | 'mask';

export interface PageImageEdit {
  action: ImageToolAction;
  target: PageImageRef;
  /** `replace`: the new picture, as PNG or JPEG bytes. */
  replacementBytes?: Uint8Array;
  replacementMimeType?: string;
  /**
   * `crop`: the kept area as fractions (0..1) of the target's own rect.
   * `mask`: the area to paint over, in the same fractions.
   */
  region?: { left: number; top: number; right: number; bottom: number };
  /** `delete` and `mask`: the colour painted over the image. */
  coverColor?: string;
}

export interface PageImageEditResult {
  pdfBytes: Uint8Array;
  applied: ImageToolAction[];
  /**
   * `delete` and `mask` cover the image rather than removing its bytes from
   * the file, exactly like whiteout. True whenever one of those ran.
   */
  coveredRatherThanRemoved: boolean;
  message: string;
}

// ==========================================
// K5: Shape Recognition & Measurement Types
// ==========================================

export type SnappedShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'raw';

export interface StrokeSnapResult {
  detected: boolean;
  type: SnappedShapeType;
  confidence: number; // 0..1
  bounds: Rect;
  startPoint: Point;
  endPoint: Point;
  snappedPoints?: Point[];
}

export type MeasurementUnit = 'pt' | 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface MeasurementScale {
  screenPoints: number; // e.g. 72 pt = 1 inch
  worldValue: number; // e.g. 1
  worldUnit: MeasurementUnit; // e.g. 'm'
}

/** How the calibration reads back to the user, e.g. "72 pt = 1 m". */
export interface CalibrationLabel {
  screenPoints: number;
  worldValue: number;
  worldUnit: MeasurementUnit;
  text: string;
}

export interface MeasurementResult {
  id: string;
  type: 'distance' | 'area';
  /** Top-left origin, PDF points. */
  points: Point[];
  value: number; // calculated in world units
  unit: MeasurementUnit;
  formattedString: string;
  pageNumber: number;
  /** The scale this result was measured against, so it can be re-read later. */
  scale?: MeasurementScale;
}

// ==========================================
// K6: Edit Existing Text Types
// ==========================================

export interface ExistingTextRun {
  id: string;
  pageNumber: number;
  text: string;
  /** Top-left origin, PDF points: the top-left of the run's box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Distance from the top of the page down to the glyph baseline. Redrawing
   * at `y + height` lands two points high on a 20pt run, which is visible;
   * this is the number the writer actually uses.
   */
  baselineY: number;
  fontSize: number;
  fontFamily: FontStyleName;
  /** The font's name in the file, e.g. `BAAAAA+ArialMT`. */
  fontName: string;
  colorHex: string;
  hasMissingGlyphs?: boolean;
}

export interface TextEditCommand {
  runId: string;
  pageNumber: number;
  originalText: string;
  newText: string;
  /** Top-left origin, PDF points. */
  bounds: Rect;
  /** Distance from the top of the page to the baseline; see ExistingTextRun. */
  baselineY?: number;
  fontSize: number;
  fontFamily: FontStyleName;
  colorHex?: string;
  fallbackWhiteoutApplied: boolean;
  fallbackNotice?: string;
}

export interface TextEditResult {
  success: boolean;
  command: TextEditCommand;
  outputSelectable: boolean;
  usedFallbackWhiteout: boolean;
  /**
   * Whether the operator that drew the original run could be emptied.
   *
   * False means the old wording is still in the page's text layer, where a
   * search or a copy reaches it even though the cover hides it. The UI says
   * so and points at redaction.
   */
  originalTextRemoved: boolean;
  /** Characters the standard font could not draw, and a sample of them. */
  droppedCharacters: number;
  droppedSample: string;
  message?: string;
  updatedPdfBytes?: Uint8Array;
}

// ==========================================
// K7: Annotation Flatten & Overlay Export Types
// ==========================================

export interface FlattenAnnotationOptions {
  keepFormFieldsInteractive: boolean;
  renderDpi?: number;
}

export interface AnnotationFlattenResult {
  pdfBytes: Uint8Array;
  /** Annotations whose appearance was painted into the page content. */
  flattened: number;
  /** Interactive /Widget annotations left alone. */
  widgetsKept: number;
  /**
   * Annotations with no appearance stream. There is nothing to paint, so
   * they are left interactive rather than silently thrown away.
   */
  skippedWithoutAppearance: number;
  /**
   * /Link hotspots dropped. They draw nothing, so removing them loses no
   * visible content — but the document stops being clickable, which is
   * worth telling the user.
   */
  linksRemoved: number;
}

export interface OverlayExportResult {
  pdfBytes: Uint8Array;
  blob: Blob;
  pageCount: number;
  hasAnnotationsOnly: boolean;
  /** Annotation appearances painted onto the transparent pages. */
  annotationsDrawn: number;
  /** Annotations carried across as live annotations as well as paint. */
  annotationsCopied: number;
}
