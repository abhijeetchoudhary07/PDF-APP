export const CUSTOM_PRESETS_KEY = 'IFH_CUSTOM_PRESETS';

export type PresetDimensionUnit = 'px' | 'mm' | 'cm' | 'in';
export type PresetTargetType = 'photo' | 'signature' | 'pdf';

export interface PresetRequirement {
  minKb?: number;
  maxKb?: number;
  width?: number;
  height?: number;
  unit?: PresetDimensionUnit;
  widthPx?: number;
  heightPx?: number;
  aspectRatio?: string;
  dpi?: number;
  format?: string;
  backgroundGuidance?: string;
  verifiedSource?: string;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  isCustom?: boolean;
  photo?: PresetRequirement;
  signature?: PresetRequirement;
  pdf?: PresetRequirement;
  dpi?: number;
  unit?: PresetDimensionUnit;
  targetType?: PresetTargetType;
  rawSourceText?: string;
  createdAt?: number;
}

export interface InstructionParsedBounds {
  minKb?: number;
  maxKb?: number;
  width?: number;
  height?: number;
  unit: PresetDimensionUnit;
  widthPx?: number;
  heightPx?: number;
  aspectRatio?: string;
  dpi?: number;
  format?: string;
  allowedFormats: string[];
  targetType: PresetTargetType;
  proposedName: string;
  confidence: number;
}

export interface HighlightSegment {
  text: string;
  isHighlighted: boolean;
  type?: 'size' | 'dimension' | 'dpi' | 'format' | 'aspect' | 'plain';
}

export interface PresetExtractionResult {
  success: boolean;
  rawText: string;
  spec?: InstructionParsedBounds;
  highlightedSegments: HighlightSegment[];
  error?: string;
}

export interface ExportedProfileV1 {
  version: '1.0';
  id: string;
  name: string;
  category: string;
  isCustom?: boolean;
  photo?: PresetRequirement;
  signature?: PresetRequirement;
  pdf?: PresetRequirement;
  dpi?: number;
  unit?: PresetDimensionUnit;
  targetType?: PresetTargetType;
  createdAt?: number;
}

export interface ProfileValidationResult {
  valid: boolean;
  profile?: ExportedProfileV1;
  error?: string;
  warnings?: string[];
}

export interface ProfileImportResult {
  success: boolean;
  preset?: Preset;
  isExistingDuplicate?: boolean;
  error?: string;
}

export type BatchRuleCategory = 'size' | 'dimensions' | 'aspectRatio' | 'format' | 'dpi';

export interface FileComplianceRuleResult {
  category: BatchRuleCategory;
  name: string;
  passed: boolean;
  measured: string;
  requiredLimit: string;
  fixable: boolean;
  fixAction?: 'compress' | 'resize' | 'convert';
  errorMessage?: string;
}

export interface FileAuditScorecard {
  fileId: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;
  slotType: PresetTargetType;
  passed: boolean;
  isFixable: boolean;
  rules: FileComplianceRuleResult[];
  thumbnailUrl?: string;
  originalFile: File;
  fixedFile?: File;
  fixStatus?: 'pending' | 'fixing' | 'fixed' | 'failed' | 'skipped';
  fixError?: string;
}

export interface BatchAuditSummary {
  profileId: string;
  profileName: string;
  totalFiles: number;
  compliantCount: number;
  nonCompliantCount: number;
  fixableCount: number;
  unfixableCount: number;
  scorecards: FileAuditScorecard[];
}

export interface BatchAutoFixProgress {
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  progressPercent: number;
  status: 'idle' | 'running' | 'completed' | 'quota_exceeded' | 'failed';
  errorMessage?: string;
}


