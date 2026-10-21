export interface PdfToMarkdownOptions {
  imageMode?: 'inline' | 'sidecar' | 'none';
  includeTables?: boolean;
  preserveLinks?: boolean;
}

export interface PdfToHtmlOptions {
  mode?: 'reflowable' | 'layout-preserving';
  embedImages?: boolean;
}

export interface PdfToEpubOptions {
  splitMode?: 'outline' | 'page-group';
  pagesPerChapter?: number;
}

export interface MarkupToPdfOptions {
  format?: 'A4' | 'Letter';
  orientation?: 'Portrait' | 'Landscape';
  margin?: number;
  fontSize?: number;
  fontFamily?: 'Courier' | 'Helvetica' | 'TimesRoman';
  syntaxHighlight?: boolean;
  indentGuides?: boolean;
  rawText?: string;
}

export interface EmailAttachmentItem {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Uint8Array;
  contentId?: string;
  isInline?: boolean;
}

export interface EmailHeaderData {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
}

export interface EmailParsedData {
  headers: EmailHeaderData;
  textBody?: string;
  htmlBody?: string;
  attachments: EmailAttachmentItem[];
  inlineImages: Map<string, EmailAttachmentItem>; // cid -> item
  warnings: string[];
}

export interface EmailToPdfOptions {
  format?: 'A4' | 'Letter';
  orientation?: 'Portrait' | 'Landscape';
  margin?: number;
  fontSize?: number;
  includeAttachments?: boolean;
}

// J6: Images -> Word / Excel
export interface ImagesToWordOptions {
  embedSourceImage?: boolean;
  ocrLanguage?: 'eng' | 'hin' | 'mar' | 'ben' | 'pan';
  fontFamily?: 'Calibri' | 'Arial' | 'Times New Roman';
}

export interface ImagesToExcelOptions {
  ocrLanguage?: 'eng' | 'hin' | 'mar' | 'ben' | 'pan';
  autoDetectColumns?: boolean;
}

// J7: PDF <-> TIFF
export interface PdfToTiffOptions {
  dpi?: number;
  compression?: 'none' | 'lzw' | 'g4';
}

export interface TiffToPdfOptions {
  format?: 'A4' | 'Letter' | 'Original';
  orientation?: 'Portrait' | 'Landscape' | 'Auto';
}

// J8: SVG <-> PDF
export interface SvgToPdfOptions {
  format?: 'A4' | 'Letter' | 'Original';
  vectorPreserved?: boolean;
  dpi?: number;
}

export interface PdfToSvgOptions {
  embedFonts?: boolean;
  selectedPages?: number[];
}

// J9: PDF -> Structured JSON
export interface PdfToJsonOptions {
  mode?: 'layout-preserving' | 'reflowable';
  compact?: boolean;
  includeTables?: boolean;
  includeAnnotations?: boolean;
  includeMetadata?: boolean;
}

export interface StructuredPdfJson {
  schemaVersion: string; // e.g. '1.0.0'
  generator: string;
  totalPages: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
    pageCount: number;
  };
  pages: {
    pageNumber: number;
    width: number;
    height: number;
    rotation: number;
    textItems: {
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      fontName?: string;
      direction?: string;
    }[];
    tables: {
      headers: string[];
      rows: string[][];
      bbox?: { x: number; y: number; width: number; height: number };
    }[];
    links: {
      url: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
    annotations: {
      subtype: string;
      rect: number[];
      contents?: string;
    }[];
  }[];
}

// J10: Conversion Fidelity Controls & Report
export interface ConversionFidelityOptions {
  mode?: 'layout-preserving' | 'reflowable';
  detectTables?: boolean;
  suppressHeaderFooter?: boolean;
  preserveBookmarks?: boolean;
  preserveHyperlinks?: boolean;
  fontSubstitutionMap?: Record<string, string>;
  verifyIndicRtlShaping?: boolean;
}

export interface ConversionReport {
  mode?: 'layout-preserving' | 'reflowable';
  approximations: string[];
  droppedElements: string[];
  substitutedFonts: { original: string; substituted: string }[];
  tablesDetected: number;
  pagesRasterized: number;
  indicOrRtlWarnings: string[];
}

// J11: Batch PDF Operations & Queue
export type BatchPdfOperation =
  | 'compress'
  | 'ocr'
  | 'convert-to-word'
  | 'protect'
  | 'unprotect'
  | 'metadata-strip'
  | 'rename-from-content';

export interface BatchPdfQueueItem {
  id: string;
  file: File;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress?: number;
  originalSizeBytes: number;
  processedSizeBytes?: number;
  outputFile?: File;
  failureReason?: string;
  quotaCharged: boolean;
}

export interface BatchPdfExecutionSummary {
  totalFiles: number;
  processedCount: number;
  failedCount: number;
  quotaAllowed: number;
  quotaUsed: number;
  quotaBlocked: boolean;
}
