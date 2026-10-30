export type RedactionVerificationStatus = 'verified' | 'residual_risk' | 'failed';

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactionTarget {
  id: string;
  pageIndex: number; // 0-based
  pageNumber?: number; // 1-based (optional)
  targetText: string;
  boundingRect?: BoundingRect;
  reason?: string;
}

export interface RedactionAuditItem {
  id: string;
  pageIndex: number;
  pageNumber: number;
  targetText: string;
  maskedText: string;
  status: RedactionVerificationStatus;
  pass1FoundInTextLayer: boolean;
  pass2FoundInContentStream: boolean;
  detectedSuperficialOverlay: boolean;
  metadataLeakageDetected?: boolean;
  streamSmugglingDetected?: boolean;
  failureReason?: string;
  boundingRect?: BoundingRect;
  rasterized?: boolean;
}

export interface RedactionAuditReport {
  fileName: string;
  totalPages: number;
  auditedAt: Date;
  totalAudited: number;
  verifiedCount: number;
  residualRiskCount: number;
  failedCount: number;
  items: RedactionAuditItem[];
  is100PercentPurged: boolean;
}

export interface RasterizeRegionOptions {
  dpi?: number;
  fillColor?: string;
}
