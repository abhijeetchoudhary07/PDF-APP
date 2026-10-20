export interface EmbeddedAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  description?: string;
  data: Uint8Array;
  creationDate?: string;
  modificationDate?: string;
}

export interface EmbeddedJavaScriptAction {
  id: string;
  source: '/OpenAction' | '/Names/JavaScript' | 'Annotation' | 'Catalog';
  name?: string;
  code: string;
  pageNumber?: number;
}

export interface EmbeddedLinkAction {
  id: string;
  type: 'URI' | 'Launch' | 'GoTo';
  target: string;
  pageNumber: number;
}

export interface PdfInspectionReport {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  pdfVersion: string;
  attachments: EmbeddedAttachment[];
  javaScriptActions: EmbeddedJavaScriptAction[];
  linkActions: EmbeddedLinkAction[];
  hasSuspiciousActions: boolean;
}
