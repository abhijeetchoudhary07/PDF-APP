export type ArchivalItemStatus = 'ready' | 'repaired' | 'not_ready';

export interface ArchivalReadinessItem {
  id: string;
  name: string;
  status: ArchivalItemStatus;
  details: string;
  actionTaken?: string;
}

export interface ArchivalReadinessReport {
  overallStatus: 'prepared' | 'attention_required';
  /**
   * Required honest disclaimer: never claims full conformance certification.
   */
  disclaimer: string;
  items: ArchivalReadinessItem[];
  fontsEmbedded: boolean;
  outputIntentSet: boolean;
  xmpConforming: boolean;
  javascriptStripped: boolean;
  encryptionStripped: boolean;
  transparencyClean: boolean;
  canProceed: boolean;
}

export interface ArchivalConversionResult {
  archivalFile: File;
  archivalBlob: Blob;
  report: ArchivalReadinessReport;
  sizeBytes: number;
  pageCount: number;
  originalFileName: string;
}
