import { BoundingRect, RedactionTarget, RedactionAuditReport } from './pdf-redaction-verify.types';

export type PatternPresetType =
  | 'email'
  | 'phone'
  | 'creditCard'
  | 'aadhaar'
  | 'pan'
  | 'date'
  | 'custom';

export interface PatternPresetDefinition {
  id: PatternPresetType;
  label: string;
  description: string;
  icon: string;
  regex: RegExp;
  validator?: (match: string) => boolean;
}

export interface PatternMatchItem {
  id: string;
  pageIndex: number;
  pageNumber: number;
  presetType: PatternPresetType;
  matchedText: string;
  maskedText: string;
  contextBefore: string;
  contextAfter: string;
  boundingRect: BoundingRect;
  selected: boolean;
  confidence?: number;
}

export interface SearchRedactScanOptions {
  activePresets: PatternPresetType[];
  customRegex?: string;
  timeoutMs?: number;
  paddingPx?: number;
}

export interface SearchRedactApplyOptions {
  fillColor?: string;
  dpi?: number;
  paddingPx?: number;
  verifyWithN4?: boolean;
}

export interface SearchRedactResult {
  pdfBytes: Uint8Array;
  fileName: string;
  totalMatchesFound: number;
  redactedCount: number;
  unselectedCount: number;
  redactedTargets: RedactionTarget[];
  auditReport?: RedactionAuditReport;
}
