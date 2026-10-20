export type PreflightRuleId =
  | 'max_file_size'
  | 'page_count_range'
  | 'page_size_uniformity'
  | 'orientation_uniformity'
  | 'min_image_dpi'
  | 'fonts_embedded'
  | 'no_encryption'
  | 'no_javascript'
  | 'no_attachments'
  | 'searchable_text_present'
  | 'no_blank_pages';

export type PreflightStatus = 'pass' | 'fail' | 'warn';

export interface PreflightRuleResult {
  id: PreflightRuleId;
  nameKey: string;
  descriptionKey: string;
  status: PreflightStatus;
  actualValue: string;
  thresholdValue: string;
  fixable: boolean;
  fixAction?: 'compress' | 'normalize_size' | 'normalize_orientation' | 'sanitize' | 'remove_blanks';
  fixLabelKey?: string;
}

export interface PreflightProfile {
  id: string;
  name: string; // Named strictly by numbers/dimensions, never by institution
  description?: string;
  maxSizeBytes?: number;
  minPages?: number;
  maxPages?: number;
  requireUniformPageSize?: boolean;
  requireUniformOrientation?: boolean;
  minImageDpi?: number;
  requireFontsEmbedded?: boolean;
  disallowEncryption?: boolean;
  disallowJavaScript?: boolean;
  disallowAttachments?: boolean;
  requireSearchableText?: boolean;
  disallowBlankPages?: boolean;
  isDefault?: boolean;
}

export interface PreflightReport {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  profileUsed: PreflightProfile;
  rules: PreflightRuleResult[];
  passed: boolean;
  passCount: number;
  failCount: number;
  warnCount: number;
  timestamp: string;
}
