export type DocumentCategory =
  | 'RECEIPT'
  | 'INVOICE'
  | 'UTILITY_BILL'
  | 'ID_DOCUMENT'
  | 'BANK_STATEMENT'
  | 'UNKNOWN';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FieldTypeCategory =
  | 'date'
  | 'financial'
  | 'identifier'
  | 'entity'
  | 'general';

export interface ExtractedField {
  key: string;
  label: string;
  value: string | null;
  confidence: number; // 0 to 100. 0 when absent.
  pageNumber: number;
  boundingBox: BoundingBox | null;
  category?: FieldTypeCategory;
  isAbsent?: boolean;
  isLowConfidence?: boolean; // confidence < 80
  userEdited?: boolean;
  originalValue?: string | null;
}

export interface ExtractedWordToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  confidence?: number;
}

export interface StructuredExtractionResult {
  documentCategory: DocumentCategory;
  categoryLabel: string;
  categoryConfidence: number; // 0 to 100
  fields: ExtractedField[];
  pageCount: number;
  rawText?: string;
  summary: {
    totalDetectedFields: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
    absentCount: number;
  };
  metadata?: {
    fileName?: string;
    extractedAt?: string;
    executionTimeMs?: number;
  };
}

export interface StructuredExportJson {
  documentCategory: DocumentCategory;
  extractedAt: string;
  fileName?: string;
  pageCount: number;
  fields: Record<string, {
    label: string;
    value: string | null;
    confidence: number;
    pageNumber: number;
    boundingBox: BoundingBox | null;
  }>;
}
