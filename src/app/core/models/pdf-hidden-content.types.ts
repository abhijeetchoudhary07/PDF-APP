export type HiddenContentCategory =
  | 'ocg_layers'
  | 'off_page_objects'
  | 'invisible_text'
  | 'off_page_annots'
  | 'scripts_attachments';

export type FindingSeverity = 'info' | 'warning' | 'high';

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface FindingBoundingBox {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface HiddenContentFinding {
  id: string;
  category: HiddenContentCategory;
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based
  title: string;
  description: string;
  severity: FindingSeverity;
  coordinates?: FindingBoundingBox;
  snippetText?: string;
  technicalDetails?: Record<string, any>;
  recommendedTool?: {
    id: string;
    route: string;
    labelKey: string;
  };
}

export interface HiddenContentCategorySummary {
  category: HiddenContentCategory;
  titleKey: string;
  descKey: string;
  icon: string;
  count: number;
  findings: HiddenContentFinding[];
}

export interface HiddenContentAuditReport {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  auditedAt: Date;
  totalFindings: number;
  highSeverityCount: number;
  warningSeverityCount: number;
  infoSeverityCount: number;
  riskLevel: RiskLevel;
  riskScore: number; // 0 to 100
  categories: Record<HiddenContentCategory, HiddenContentCategorySummary>;
  allFindings: HiddenContentFinding[];
}
