/**
 * Types and models for Local Document Classification, Semantic Tagging,
 * and Content-Based Renaming (P5).
 */

export type GenericDocumentCategory =
  | 'Receipt'
  | 'Invoice'
  | 'Utility Bill'
  | 'ID Document'
  | 'Certificate'
  | 'Official Letter'
  | 'Financial Statement'
  | 'Notes'
  | 'Contract'
  | 'Other';

export interface DocumentClassificationResult {
  category: GenericDocumentCategory;
  confidence: number; // 0 to 100
  secondaryCategories?: Array<{ category: GenericDocumentCategory; confidence: number }>;
  matchedSignals: string[];
}

export interface DocumentMetadataInput {
  fileName?: string;
  pageCount?: number;
  title?: string;
  author?: string;
  creationDate?: string;
  fileSizeBytes?: number;
}

export interface ContentTag {
  tag: string;
  source: 'keyword' | 'heading' | 'date' | 'status' | 'custom';
  score?: number;
}

export interface DocumentRenameProposal {
  originalName: string;
  proposedName: string; // e.g. "Receipt_PowerUtility_2026-10-28.pdf"
  category: GenericDocumentCategory;
  entityOrTitle: string;
  detectedDate?: string; // YYYY-MM-DD
  sanitized: boolean;
}

export interface DocumentOrganizationProposal {
  id: string;
  file?: File;
  originalFileName: string;
  fileSizeBytes: number;
  pageCount: number;
  classification: DocumentClassificationResult;
  tags: string[]; // 3 to 5 content tags
  proposedFileName: string; // editable by user
  approvalStatus: 'pending' | 'approved' | 'rejected';
  appliedAt?: string;
  error?: string;
}

export interface OrganizationAppliedResult {
  id: string;
  originalFileName: string;
  finalFileName: string;
  tags: string[];
  category: GenericDocumentCategory;
  status: 'renamed' | 'skipped' | 'failed';
  savedUri?: string;
  errorMessage?: string;
}

export interface BatchVaultScanOptions {
  includeHistoryVault?: boolean;
  maxFiles?: number;
}
