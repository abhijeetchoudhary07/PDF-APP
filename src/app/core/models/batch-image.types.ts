export interface BatchImageItemConfig {
  id: string;
  file: File;
  targetKB?: number;
  autoRotateExif?: boolean;
  skipIfUnderTarget?: boolean;
  customNameTemplate?: string;
}

export type BatchPdfExportMode = 'individual' | 'combined-pdf' | 'one-pdf-per-file';

export interface BatchProcessingSummary {
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  savedBytes: number;
}
