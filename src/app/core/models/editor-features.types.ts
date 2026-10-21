import { Rect, Point, FontStyleName } from './pdf-editor.types';

// ==========================================
// K1: Find & Replace Types
// ==========================================

export interface FindReplaceOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeFormFields?: boolean;
}

export interface FindMatch {
  id: string;
  pageNumber: number; // 1-indexed
  matchIndex: number;
  text: string;
  matchedText: string;
  bounds: Rect; // in PDF points
  source: 'page-text' | 'form-field' | 'editor-element';
  elementId?: string;
  fieldName?: string;
}

export interface FindReplaceResult {
  matchesFound: number;
  matchesReplaced: number;
  unsupportedExistingTextSkipped?: number;
  replacedMatches: FindMatch[];
}

// ==========================================
// K2: Link Editor Types
// ==========================================

export type LinkDestinationType = 'url' | 'page';

export interface PdfHyperlink {
  id: string;
  pageNumber: number; // 1-indexed page where link resides
  rect: Rect; // unscaled PDF point coordinates
  type: LinkDestinationType;
  url?: string;
  targetPage?: number; // 1-indexed target page
  isDangling?: boolean; // flags targetPage > totalPages or <= 0
  label?: string;
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
  rect: Rect;
  dataUrl?: string;
  mimeType?: string;
}

export interface WhiteoutRegion {
  id: string;
  pageNumber: number;
  rect: Rect;
  fillColor: string; // e.g. '#FFFFFF'
  disclaimerAcknowledged: boolean;
}

export type ImageToolAction = 'replace' | 'delete' | 'crop' | 'mask';

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

export interface MeasurementResult {
  id: string;
  type: 'distance' | 'area';
  points: Point[];
  value: number; // calculated in world units
  unit: MeasurementUnit;
  formattedString: string;
  pageNumber: number;
}

// ==========================================
// K6: Edit Existing Text Types
// ==========================================

export interface ExistingTextRun {
  id: string;
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontName: string;
  colorHex: string;
  hasMissingGlyphs?: boolean;
}

export interface TextEditCommand {
  runId: string;
  pageNumber: number;
  originalText: string;
  newText: string;
  bounds: Rect;
  fontSize: number;
  fontFamily: FontStyleName;
  fallbackWhiteoutApplied: boolean;
  fallbackNotice?: string;
}

export interface TextEditResult {
  success: boolean;
  command: TextEditCommand;
  outputSelectable: boolean;
  usedFallbackWhiteout: boolean;
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

export interface OverlayExportResult {
  pdfBytes: Uint8Array;
  blob: Blob;
  pageCount: number;
  hasAnnotationsOnly: boolean;
}
