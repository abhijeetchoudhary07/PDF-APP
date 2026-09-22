import { FileMetadata } from '../models/file-metadata.model';

export type ConversionStatus = 'idle' | 'validating' | 'processing' | 'done' | 'error' | 'cancelled';

export type ConverterCategory = 'pdf-to-format' | 'format-to-pdf';

export interface ConverterMetadata {
  id: string;
  name: string;
  shortTitle: string;
  description: string;
  sourceFormats: string[]; // e.g. ['.pdf']
  targetFormat: string;   // e.g. 'docx', 'png', 'pdf'
  category: ConverterCategory;
  icon: string;           // Ionic icon name
  badge?: string;         // e.g. 'Popular', 'High-Res', 'Offline'
  acceptMimeTypes: string; // for <input type="file" accept="...">
  limitations?: string[];
  disclaimer?: string;
  supportsTextInput?: boolean;
}

export interface ConversionProgress {
  percent: number; // 0 to 100
  stage: string;   // e.g. 'Rendering page 2 of 5', 'Extracting text'
  currentItem?: number;
  totalItems?: number;
  message?: string;
}

export interface ConversionResult {
  success: boolean;
  file?: File;
  files?: File[];           // For multi-file outputs like PDF -> PNG
  metadata?: FileMetadata;
  previewUrl?: string;      // Object URL or data URL
  previewData?: any;        // Structured preview data (e.g. table rows for Excel/CSV)
  downloadName?: string;
  warnings?: string[];
  error?: string;
}

export interface ConversionJob {
  id: string;
  converterId: string;
  inputFile?: File;
  inputText?: string;
  options: Record<string, any>;
  status: ConversionStatus;
  progress: ConversionProgress;
  result?: ConversionResult;
  error?: string;
  createdAt: number;
}
