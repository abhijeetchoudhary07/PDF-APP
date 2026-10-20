export interface PageHashInfo {
  pageIndex: number;
  pageNumber: number;
  contentHash: string;
  byteLength?: number;
}

export interface DocumentFingerprint {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  fileSha256: string;
  pageHashes: PageHashInfo[];
  createdAt: string; // ISO 8601 string
  metadataSummary?: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
  };
}

export type IntegrityDriftStatus = 'identical' | 'metadata_only' | 'content_drift' | 'different_document';

export interface DriftComparisonResult {
  status: IntegrityDriftStatus;
  isByteIdentical: boolean;
  isPageCountMatch: boolean;
  hasMetadataDriftOnly: boolean;
  targetFileName: string;
  receiptFileName: string;
  receiptTimestamp: string;
  changedPages: number[];   // 1-based page numbers
  addedPages: number[];     // 1-based page numbers
  removedPages: number[];   // 1-based page numbers
  identicalPages: number[]; // 1-based page numbers
  message: string;
}
