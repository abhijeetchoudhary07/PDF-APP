// Models for Phase 2: PDF Compare, Privacy Sanitizer, Header/Footer Studio, PDF Repair, and PDF Content Extractor

// ==========================================
// 1. PDF COMPARE TYPES
// ==========================================
export type ComparisonMode = 'side-by-side' | 'page-by-page' | 'text-only' | 'visual';

export type DiffChangeType = 'unchanged' | 'added' | 'removed' | 'changed';

export interface TextDiffToken {
  type: DiffChangeType;
  value: string;
  originalIndex?: number;
  modifiedIndex?: number;
}

export interface PageDiffResult {
  originalPageNumber: number | null; // null if inserted page
  modifiedPageNumber: number | null; // null if deleted page
  status: 'identical' | 'modified' | 'inserted' | 'deleted';
  similarityScore: number; // 0.0 to 1.0
  addedCount: number;
  removedCount: number;
  changedCount: number;
  originalText: string;
  modifiedText: string;
  tokens: TextDiffToken[];
  visualDiffUrl?: string;
  originalCanvasUrl?: string;
  modifiedCanvasUrl?: string;
}

export interface CompareSummary {
  pagesCompared: number;
  pagesIdentical: number;
  pagesChanged: number;
  pagesAdded: number;
  pagesRemoved: number;
  totalAddedWords: number;
  totalRemovedWords: number;
  totalChangedWords: number;
  pageMatches: PageDiffResult[];
}

// ==========================================
// 2. PDF PRIVACY SANITIZER TYPES
// ==========================================
export type PrivacyItemCategory =
  | 'metadata'
  | 'comments'
  | 'attachments'
  | 'forms'
  | 'scripts'
  | 'hiddenContent';

export interface PrivacyScanItem {
  id: string;
  category: PrivacyItemCategory;
  title: string;
  detail: string;
  page?: number;
  severity: 'info' | 'warning' | 'alert';
  removable: boolean;
  selected: boolean;
}

export interface PrivacyScanReport {
  totalFound: number;
  items: PrivacyScanItem[];
  hasMetadata: boolean;
  hasComments: boolean;
  hasAttachments: boolean;
  hasForms: boolean;
  hasScripts: boolean;
  hasHiddenContent: boolean;
  metadataDetails: Record<string, string>;
  attachmentCount: number;
  commentCount: number;
  formFieldCount: number;
  scriptCount: number;
}

export interface SanitizationOptions {
  removeMetadata: boolean;
  removeComments: boolean;
  removeAttachments: boolean;
  removeForms: boolean;
  removeScripts: boolean;
  removeHiddenContent: boolean;
}

export interface SanitizationResult {
  sanitizedFile: File;
  sanitizedBlob: Blob;
  sizeBytes: number;
  itemsRemovedCount: number;
  beforeReport: PrivacyScanReport;
  afterReport: PrivacyScanReport;
}

// ==========================================
// 3. HEADER & FOOTER STUDIO TYPES
// ==========================================
export type HeaderFooterAlignment = 'left' | 'center' | 'right';
export type PageTargetMode = 'all' | 'odd' | 'even' | 'custom';
export type FirstPageMode = 'include' | 'skip' | 'different';

export interface HeaderFooterZone {
  leftText: string;
  centerText: string;
  rightText: string;
}

export interface HeaderFooterConfig {
  header: HeaderFooterZone;
  footer: HeaderFooterZone;
  firstPageHeader?: HeaderFooterZone;
  firstPageFooter?: HeaderFooterZone;
  fontFamily: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Courier';
  fontSize: number; // pt (default: 10)
  fontColor: string; // hex (default: #333333)
  topMargin: number; // pt (default: 36)
  bottomMargin: number; // pt (default: 36)
  leftMargin: number; // pt (default: 40)
  rightMargin: number; // pt (default: 40)
  pageTargetMode: PageTargetMode;
  customPageRange?: string; // e.g. "2-5, 8"
  firstPageMode: FirstPageMode;
  startPageNumber: number; // default: 1
}

// ==========================================
// 4. PDF REPAIR & RECOVERY TYPES
// ==========================================
export type PdfHealthStatus = 'healthy' | 'warning' | 'error';

export interface PdfDiagnosticIssue {
  id: string;
  code: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  location?: string;
  recoverable: boolean;
}

export interface PdfHealthReport {
  overallStatus: PdfHealthStatus;
  isEncrypted: boolean;
  isLinearized: boolean;
  pdfVersion: string;
  pageCount: number;
  validPagesCount: number;
  corruptedPagesCount: number;
  issues: PdfDiagnosticIssue[];
  headerValid: boolean;
  xrefValid: boolean;
  trailerValid: boolean;
  pagesTreeValid: boolean;
  fontsValid: boolean;
}

export interface PageRecoveryDetail {
  pageNumber: number;
  status: 'recovered_vector' | 'recovered_raster' | 'failed';
  strategyUsed: string;
  error?: string;
}

export interface PdfRecoveryResult {
  recoveredFile: File;
  recoveredBlob: Blob;
  sizeBytes: number;
  originalPagesCount: number;
  recoveredPagesCount: number;
  failedPagesCount: number;
  recoveryLog: string[];
  pageDetails: PageRecoveryDetail[];
}

// ==========================================
// 5. PDF CONTENT EXTRACTOR TYPES
// ==========================================
export interface ExtractedImageItem {
  id: string;
  pageNumber: number;
  format: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
  sizeBytes: number;
  dataUrl: string;
  blob: Blob;
  name: string;
  selected: boolean;
}

export interface ExtractedTableData {
  id: string;
  pageNumber: number;
  rows: string[][];
  headers: string[];
  confidence: number; // 0 to 1
  previewHtml?: string;
}

export interface ExtractedAttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  description?: string;
}

export interface ExtractedDocumentContent {
  totalPages: number;
  fullText: string;
  pageTexts: { pageNumber: number; text: string; paragraphs: string[] }[];
  images: ExtractedImageItem[];
  tables: ExtractedTableData[];
  attachments: ExtractedAttachmentItem[];
}
