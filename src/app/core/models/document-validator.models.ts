import { Preset } from '../services/preset.service';

export type RuleSeverity = 'error' | 'warning' | 'info';
export type DocumentSlotType = 'photo' | 'signature' | 'pdf';

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  actualValue: string | number;
  expectedValue: string | number;
  passed: boolean;
  suggestedFix?: string;
  fixAction?: 'compress' | 'resize' | 'crop' | 'convert' | 'clean_signature';
  fixParams?: Record<string, any>;
}

export interface DocumentValidationResult {
  slotType: DocumentSlotType;
  file: File;
  previewUrl?: string;
  rules: ValidationRule[];
  passed: boolean;
  errorsCount: number;
  warningsCount: number;
  metadata: {
    fileSizeKb: number;
    dimensions?: { width: number; height: number };
    aspectRatio?: string;
    format: string;
    dpi?: number;
    pageCount?: number;
  };
}

export interface ValidationReport {
  preset: Preset;
  results: Map<DocumentSlotType, DocumentValidationResult>;
  allPassed: boolean;
  totalErrors: number;
  totalWarnings: number;
  validatedAt: number;
}
