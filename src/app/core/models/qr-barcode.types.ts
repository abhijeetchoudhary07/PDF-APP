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
