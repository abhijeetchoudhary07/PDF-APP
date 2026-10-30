export type BarcodeFormat =
  | 'QR_CODE'
  | 'CODE_128'
  | 'CODE_39'
  | 'CODE_93'
  | 'EAN_13'
  | 'EAN_8'
  | 'UPC_A'
  | 'UPC_E'
  | 'PDF_417'
  | 'DATA_MATRIX'
  | 'AZTEC'
  | 'ITF'
  | 'CODABAR'
  | 'UNKNOWN';

export interface BarcodeBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarcodeScanResult {
  id: string;
  rawContent: string;
  format: BarcodeFormat;
  timestamp: number;
  pageNumber?: number;
  boundingBox?: BarcodeBoundingBox;
  isUrl: boolean;
  urlDomain?: string;
}

export type QrContentType = 'text' | 'url' | 'email' | 'phone' | 'wifi' | 'vcard';

export interface QrGeneratorOptions {
  contentType: QrContentType;
  content: string;
  size: number;
  margin: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  foregroundColor: string;
  backgroundColor: string;
  // Specific payload fields
  urlPayload?: string;
  emailPayload?: { address: string; subject?: string; body?: string };
  phonePayload?: string;
  wifiPayload?: { ssid: string; password?: string; encryption: 'WPA' | 'WEP' | 'nopass'; hidden?: boolean };
  vcardPayload?: { name: string; phone?: string; email?: string; org?: string; title?: string };
}

export type BarcodeReportFormat = 'txt' | 'csv' | 'json';

export type BarcodeType1D = 'CODE_128' | 'EAN_13' | 'CODE_39' | 'QR_CODE';

export interface BarcodeBatchItem {
  id: string;
  format: BarcodeFormat;
  payload: string;
  timestamp: number;
  displayTimestamp?: string;
  duplicateCount?: number;
}

export type DeduplicationMode = 'cooldown' | 'session' | 'none';

export interface BatchDeduplicationOptions {
  mode: DeduplicationMode;
  cooldownMs?: number; // default 3000ms
}

export interface Barcode1DOptions {
  format: BarcodeType1D;
  payload: string;
  width?: number; // default 320
  height?: number; // default 100
  includeText?: boolean; // default true
  lineColor?: string; // default #000000
  backgroundColor?: string; // default #ffffff
}

export interface BulkBarcodeGenerationOptions {
  format: BarcodeType1D;
  payloads: string[];
  gridType?: '12-up' | '24-up'; // 12-up (2x6) or 24-up (3x8) on A4
  includeText?: boolean;
}

export interface BulkGenerationResult {
  totalProcessed: number;
  pdfBlob: Blob;
  zipBlob?: Blob;
  failedCount?: number;
}

