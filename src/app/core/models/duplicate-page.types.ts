export interface PageFingerprint {
  pageId: string;
  pageIndex: number;
  pageNumber: number;
  sourceDocId: string;
  sourcePageIndex: number;
  dHash: string;
  hasText: boolean;
  textExcerpt: string;
  textHash: string;
  normalizedText?: string;
  thumbnailUrl?: string;
}

export interface DuplicatePageItem {
  pageId: string;
  pageIndex: number;
  pageNumber: number;
  sourceDocId: string;
  sourcePageIndex: number;
  thumbnailUrl?: string;
  textExcerpt?: string;
  dHash: string;
  /** Whether this page is kept (true) or selected for removal (false). Default: true for first page in group, false for others */
  keep: boolean;
  /** True if this is the first occurrence (original) in document order */
  isFirst: boolean;
}

export type DuplicateGroupType = 'exact' | 'near';

export interface DuplicateGroup {
  id: string;
  type: DuplicateGroupType;
  /** Pages in this group, ordered by document order with original first */
  pages: DuplicatePageItem[];
  /** Pairwise hamming distance for near-duplicates (0 for exact) */
  distance: number;
}

export interface DuplicateDetectionOptions {
  /**
   * Hamming distance threshold for near-duplicate grouping.
   * Default: 4 (out of 64 bits).
   */
  hammingThreshold?: number;

  /**
   * Optional AbortSignal for cooperative cancellation.
   */
  signal?: AbortSignal;

  /**
   * Optional progress callback.
   */
  onProgress?: (progress: DuplicateDetectionProgress) => void;
}

export interface DuplicateDetectionProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
  exactGroupCount: number;
  nearGroupCount: number;
  stage: string;
}

export interface DuplicateDetectionReport {
  fingerprints: PageFingerprint[];
  exactGroups: DuplicateGroup[];
  nearGroups: DuplicateGroup[];
  totalDuplicatesFound: number;
  totalDuplicatesToRemove: number;
  hammingThreshold: number;
}
