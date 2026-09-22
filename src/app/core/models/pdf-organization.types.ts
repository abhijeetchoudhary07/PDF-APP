export interface PdfSourceDocument {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  file?: File;
  arrayBuffer: ArrayBuffer;
  pdfDoc?: any; // pdfjs-dist PDFDocumentProxy
}

export interface PdfPageItem {
  id: string;
  sourceDocId: string;
  sourcePageIndex: number; // 0-indexed original page
  displayNumber: number; // 1-indexed current position
  originalRotation: number; // 0, 90, 180, 270
  rotation: number; // additional rotation applied by user: 0, 90, 180, 270
  width: number;
  height: number;
  thumbnailUrl?: string;
  thumbnailLoading?: boolean;
  thumbnailError?: boolean;
}

export type PdfOperationType =
  | 'reorder'
  | 'rotate'
  | 'delete'
  | 'duplicate'
  | 'insert'
  | 'batch';

export interface PdfPageOperation {
  id: string;
  type: PdfOperationType;
  description: string;
  timestamp: number;
  undoData: any;
  redoData: any;
}

export type PdfSplitMode = 'extract' | 'every-n' | 'after-selected' | 'individual';

export interface PdfSplitConfig {
  mode: PdfSplitMode;
  everyN?: number;
  afterPages?: number[];
  rangeString?: string;
  selectedPageNumbers?: number[];
}

export interface PdfExportResult {
  name: string;
  file: File;
  blob: Blob;
  sizeBytes: number;
  pageCount: number;
}

export type PdfWorkspaceMode =
  | 'organize'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'delete'
  | 'extract';
