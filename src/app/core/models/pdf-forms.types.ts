export type PdfFormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'listbox'
  | 'date'
  | 'signature';

export interface PdfFieldCoordinates {
  pageNumber: number; // 1-indexed
  x: number; // PDF points
  y: number; // PDF points
  width: number;
  height: number;
}

export interface PdfFormField {
  id: string;
  name: string;
  label?: string;
  type: PdfFormFieldType;
  value: any; // string for text/dropdown/date, boolean for checkbox, string for radio, dataUrl for signature
  options?: string[]; // for radio/dropdown/listbox
  isReadOnly?: boolean;
  isRequired?: boolean;
  isMultiline?: boolean;
  isNative: boolean; // true = native AcroForm field, false = manual placed overlay field
  coordinates?: PdfFieldCoordinates;
  maxLength?: number;
  defaultValue?: any;
  tooltip?: string;
  tabOrder?: number;
  fontSize?: number;
  multiselect?: boolean;
}

export interface FormBuilderField extends PdfFormField {
  canvasCoordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CoordinateTransformOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number; // PDF points
  pageHeight: number; // PDF points
  rotation?: number; // 0, 90, 180, 270
  scale?: number; // Canvas zoom scale (default 1.0)
  dpr?: number; // Device pixel ratio (default 1.0)
}

export interface PdfFormDocument {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  file?: File;
  arrayBuffer: ArrayBuffer;
  hasNativeForms: boolean;
  fields: PdfFormField[];
}

export interface FormExportOptions {
  flatten: boolean;
  outputFileName?: string;
}

export type FormDataTransferFormat = 'fdf' | 'xfdf' | 'csv' | 'json';

export interface FormFieldDataRecord {
  name: string;
  type: PdfFormFieldType;
  value: any;
  isChecked?: boolean;
  selectedOption?: string | null;
}

export interface FormDataExportResult {
  format: FormDataTransferFormat;
  mimeType: string;
  fileName: string;
  content: string;
  sizeBytes: number;
  fieldCount: number;
}

export interface FormDataImportFieldMatch {
  name: string;
  originalValue: any;
  newValue: any;
  type: string;
  included?: boolean;
}

export interface FormDataImportReport {
  totalDocumentFields: number;
  totalImportedValues: number;
  matchedCount: number;
  matchedFields: FormDataImportFieldMatch[];
  unmatchedFields: Array<{
    name: string;
    value: any;
  }>;
  formatDetected?: FormDataTransferFormat;
  errors: string[];
}

// ==========================================
// Mail Merge Models (M3)
// ==========================================

export interface CsvParsedData {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface MailMergeFieldMapping {
  fieldName: string;
  fieldType: PdfFormFieldType;
  csvColumn: string | null;
  isAutoMatched: boolean;
  confidence: number;
}

export interface MailMergeOptions {
  namingPattern: string;
  flatten: boolean;
  bundleAsZip: boolean;
  maxRecords?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: MailMergeProgress) => void;
}

export interface MailMergeProgress {
  current: number;
  total: number;
  percent: number;
  statusText: string;
}

export interface MailMergeRowResult {
  rowIndex: number;
  fileName: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  pdfBytes?: Uint8Array;
}

export interface MailMergeBatchResult {
  totalRows: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  rowResults: MailMergeRowResult[];
  zipBlob?: Blob;
  zipFileName?: string;
  durationMs: number;
}
