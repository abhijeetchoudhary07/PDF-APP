export type EditorTool =
  | 'select'
  | 'hand'
  | 'text'
  | 'image'
  | 'draw'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'note'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'redact'
  | 'crop';

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';
export type AnnotationType = 'highlight' | 'underline' | 'strikethrough' | 'note' | 'textbox';
export type WatermarkPosition = 'center' | 'diagonal' | 'top' | 'bottom' | 'custom';
export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type FontStyleName = 'Helvetica' | 'TimesRoman' | 'Courier';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfCropBox {
  x: number; // in unscaled PDF points
  y: number; // in unscaled PDF points
  width: number;
  height: number;
  aspectRatioPreset?: 'free' | '1:1' | '4:3' | '16:9' | 'a4' | 'letter';
}

export interface BasePdfElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'drawing' | 'annotation';
  pageNumber: number; // 1-indexed
  x: number; // in unscaled PDF points
  y: number; // in unscaled PDF points
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270 or arbitrary degrees
  opacity: number; // 0..1
  zIndex: number;
}

export interface PdfTextElement extends BasePdfElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: FontStyleName;
  color: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

export interface PdfImageElement extends BasePdfElement {
  type: 'image';
  imageUrl: string;
  imageBlob?: Blob;
  aspectRatio: number;
}

export interface PdfShapeElement extends BasePdfElement {
  type: 'shape';
  shapeType: ShapeType;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
  strokeStyle: 'solid' | 'dashed';
  endPoint?: Point; // for lines and arrows
}

export interface PdfDrawingElement extends BasePdfElement {
  type: 'drawing';
  points: Point[];
  strokeColor: string;
  strokeWidth: number;
}

export interface PdfAnnotationElement extends BasePdfElement {
  type: 'annotation';
  annotationType: AnnotationType;
  text?: string; // for notes
  rects?: Rect[]; // for highlights/underlines over text
  color: string;
  strokeWidth?: number;
  author?: string;
  createdAt: number;
}

export type PdfElement =
  | PdfTextElement
  | PdfImageElement
  | PdfShapeElement
  | PdfDrawingElement
  | PdfAnnotationElement;

export interface PdfRedaction {
  id: string;
  pageNumber: number; // 1-indexed
  x: number; // in unscaled PDF points
  y: number; // in unscaled PDF points
  width: number;
  height: number;
  isApplied: boolean;
  overlayColor: string; // default '#000000'
  label?: string; // e.g. 'CONFIDENTIAL' or 'REDACTED'
}

export interface PdfWatermark {
  type: 'text' | 'image';
  text?: string;
  imageBlob?: Blob;
  imageUrl?: string;
  fontSize?: number;
  fontFamily?: FontStyleName;
  color?: string;
  opacity: number; // 0.05 to 1.0
  rotation: number; // degrees, e.g. 45
  position: WatermarkPosition;
  customX?: number;
  customY?: number;
  scale?: number;
  targetPages: 'all' | 'custom';
  selectedPages?: number[];
}

export interface PdfPageNumberingConfig {
  position: PageNumberPosition;
  startingNumber: number;
  fontSize: number;
  fontFamily: FontStyleName;
  color: string;
  prefix: string;
  suffix: string;
  targetPages: 'all' | 'custom';
  selectedPages?: number[];
}

export interface PdfEditorPage {
  pageNumber: number; // 1-indexed
  originalWidth: number; // in unscaled PDF points
  originalHeight: number; // in unscaled PDF points
  currentWidth: number;
  currentHeight: number;
  rotation: number; // degrees added (0, 90, 180, 270)
  cropBox?: PdfCropBox;
  elements: PdfElement[];
  redactions: PdfRedaction[];
  thumbnailUrl?: string;
}

export interface PdfEditorDocument {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  file?: File;
  arrayBuffer: ArrayBuffer;
  pages: PdfEditorPage[];
  watermark?: PdfWatermark;
  pageNumbering?: PdfPageNumberingConfig;
}

export interface ToolSettings {
  color: string;
  fillColor?: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: FontStyleName;
  opacity: number;
  shapeType: ShapeType;
  annotationType: AnnotationType;
}

export type EditorCommandType =
  | 'ADD_ELEMENT'
  | 'UPDATE_ELEMENT'
  | 'DELETE_ELEMENT'
  | 'REORDER_ELEMENT'
  | 'SET_CROP'
  | 'RESET_CROP'
  | 'SET_WATERMARK'
  | 'SET_PAGE_NUMBERING'
  | 'ADD_REDACTION'
  | 'APPLY_REDACTION'
  | 'DELETE_REDACTION';

export interface EditorCommand {
  id: string;
  type: EditorCommandType;
  description: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
}

export interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
  text: string;
  bounds?: Rect;
}
