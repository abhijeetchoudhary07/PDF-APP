export interface PdfSourceDocument {
  id: string;
  name: string;
  /**
   * Load order of this document in the multi-document tray, used to pick its
   * badge colour so a page's source is identifiable at a glance. Stable for
   * the lifetime of the workspace.
   */
  colorIndex?: number;
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
  /**
   * Mirror the page left/right about its vertical centre line. Independent of
   * `rotation`: a flip mirrors the content, a rotation turns the sheet.
   */
  flipHorizontal?: boolean;
  /** Mirror the page top/bottom about its horizontal centre line. */
  flipVertical?: boolean;
}

export type PdfOperationType =
  | 'reorder'
  | 'rotate'
  | 'flip'
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

/**
 * `extract`, `every-n`, `after-selected` and `individual` are the four modes
 * that ship and are unchanged. The five that follow are the B1–B5 additions;
 * they are listed here so one `splitMode` field can hold any of them, but only
 * `doc-count` is computable synchronously, so the rest are planned by
 * `PdfSplitPlannerService` rather than by `calculateSplitChunks`.
 */
export type PdfSplitMode =
  | 'extract'
  | 'every-n'
  | 'after-selected'
  | 'individual'
  | 'max-size'
  | 'doc-count'
  | 'chapters'
  | 'divider'
  | 'text-pattern'
  | 'sections'
  | 'tiles';

export interface PdfSplitConfig {
  mode: PdfSplitMode;
  everyN?: number;
  afterPages?: number[];
  rangeString?: string;
  selectedPageNumbers?: number[];
  /** `doc-count`: how many files to divide the document into. */
  docCount?: number;
}

export interface PdfExportResult {
  name: string;
  file: File;
  blob: Blob;
  sizeBytes: number;
  pageCount: number;
  /** How many pages in this output were written through the flip path. */
  flippedPageCount?: number;
  /**
   * Display numbers of flipped pages whose MediaBox did not start at the
   * origin and was normalised to 0,0. No content is lost, but the box moved,
   * so the screen reports it rather than letting it pass silently.
   */
  normalizedOriginPageNumbers?: number[];
  /** Set on a per-source export: the document the part came from. */
  sourceDocId?: string;
  /** Set on a per-source export: the original file name of that document. */
  sourceDocName?: string;
}

export type PdfWorkspaceMode =
  | 'organize'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'delete'
  | 'extract';

export interface PageOrderResult {
  valid: boolean;
  pageOrder: number[];
  error?: string;
}

export type PageArrangementMode =
  | 'reverse'
  | 'odd-even-split'
  | 'odd-even-merge'
  | 'duplex-sort'
  | 'custom-expression';

export interface PageArrangementOptions {
  backsReversed?: boolean;
}

export interface PageArrangementPreview {
  mode: PageArrangementMode;
  pageCount: number;
  permutation: number[];
  previousOrder: number[];
  newOrder: number[];
}

