import { PdfPageItem, PdfSourceDocument } from './pdf-organization.types';

export interface BlankDetectionOptions {
  /**
   * Sensitivity threshold for non-white pixel ratio.
   * Pages with nonWhiteRatio <= threshold AND empty text layer are classified as blank.
   * Default: 0.001 (0.10% non-white pixels).
   */
  threshold?: number;

  /**
   * Scale at which to render pages for pixel analysis.
   * Default: 0.2 (~0.2 scale).
   */
  scale?: number;

  /**
   * Optional AbortSignal for cooperative cancellation of scanning.
   */
  signal?: AbortSignal;

  /**
   * Optional progress callback.
   */
  onProgress?: (progress: BlankDetectionProgress) => void;
}

export interface BlankDetectionProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
  foundBlankCount: number;
  stage: string;
}

export interface BlankPageCandidate {
  /** 1-based display number */
  pageNumber: number;
  /** 0-based page index in the document */
  pageIndex: number;
  /** Unique id matching PdfPageItem.id */
  pageId: string;
  /** Source document ID */
  sourceDocId: string;
  /** Source page index within source document */
  sourcePageIndex: number;
  /** Computed ratio of non-white pixels (0.0 to 1.0) */
  nonWhiteRatio: number;
  /** True if text layer has non-whitespace characters */
  hasText: boolean;
  /** Text excerpt if text was found */
  textExcerpt?: string;
  /** Whether page is classified as blank under active threshold */
  isBlank: boolean;
  /** Data URL thumbnail or cached thumbnail */
  thumbnailUrl?: string;
  /** User selection flag for removal (defaults to true if isBlank is true) */
  selectedForRemoval: boolean;
}

export interface BlankDetectionReport {
  /** All analyzed page candidates */
  candidates: BlankPageCandidate[];
  /** Subset of candidates currently flagged as blank */
  blankCandidates: BlankPageCandidate[];
  /** Subset of blank candidates selected for removal */
  selectedCandidates: BlankPageCandidate[];
  /** Total count of pages scanned */
  totalPagesScanned: number;
  /** Count of pages identified as blank */
  blankCount: number;
  /** Active threshold used for classification */
  threshold: number;
}

export interface BlankRemovalResult {
  /** Number of pages removed */
  removedCount: number;
  /** Number of pages remaining in document */
  remainingCount: number;
  /** Display numbers of removed pages */
  removedDisplayNumbers: number[];
  /** Emitted review PDF File containing the removed pages */
  reviewPdfFile: File;
  /** Emitted review PDF Blob */
  reviewPdfBlob: Blob;
  /** Raw bytes of the emitted review PDF */
  reviewPdfBytes: Uint8Array;
}
