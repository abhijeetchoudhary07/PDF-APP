import { PdfPageItem } from './pdf-organization.types';

export type PageOrientationAngle = 0 | 90 | 180 | 270;

export interface PageOrientationItem {
  pageId: string;
  pageIndex: number; // 0-indexed position in activePages
  displayNumber: number; // 1-indexed display number
  sourceDocId: string;
  sourcePageIndex: number;
  thumbnailUrl?: string;

  // Rotation data
  detectedAngle: PageOrientationAngle; // Visual angle detected on screen (0 = upright, 90, 180, 270)
  suggestedRotation: PageOrientationAngle; // Clockwise correction angle needed to reach 0°
  confidence: number; // 0.0 to 1.0 (e.g. 0.95 = 95%)
  method: 'text-transform' | 'tesseract-osd' | 'fallback';

  // Content analysis
  textLength: number;
  textExcerpt?: string;
  isNearBlank: boolean;
  reason: string;

  // Grouping & interaction state
  needsManualReview: boolean; // Low confidence, near-blank, or ambiguous
  alreadyUpright: boolean; // suggestedRotation === 0 with high confidence
  selectedForRotation: boolean; // If true, auto-rotation will be applied
}

export interface OrientationDetectionReport {
  pages: PageOrientationItem[];
  toRotate: PageOrientationItem[]; // High confidence and needs rotation
  alreadyUpright: PageOrientationItem[]; // High confidence and already upright
  manualReview: PageOrientationItem[]; // Near-blank, low confidence, or ambiguous
  totalPagesScanned: number;
  confidenceThreshold: number;
}

export interface OrientationDetectionProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
  stage: string;
  rotatedCandidatesCount: number;
  manualReviewCount: number;
}

export interface OrientationDetectionOptions {
  confidenceThreshold?: number; // Default 0.70
  minTextLength?: number; // Default 10
  enableOcrFallback?: boolean; // Default true
  ocrDetector?: (canvasOrBlob: any) => Promise<{ orientationDegrees: PageOrientationAngle; confidence: number } | null>;
  signal?: AbortSignal;
  onProgress?: (progress: OrientationDetectionProgress) => void;
}

export interface TextItemTransformData {
  str: string;
  transform: number[]; // [a, b, c, d, e, f]
}

export interface DecideOrientationInput {
  textItems: TextItemTransformData[];
  currentRotation?: number; // Total visual rotation applied to page
  confidenceThreshold?: number;
  minTextLength?: number;
  ocrResult?: { orientationDegrees: PageOrientationAngle; confidence: number } | null;
  isNearBlank?: boolean;
}

export interface DecideOrientationResult {
  detectedAngle: PageOrientationAngle;
  suggestedRotation: PageOrientationAngle;
  confidence: number;
  method: 'text-transform' | 'tesseract-osd' | 'fallback';
  needsManualReview: boolean;
  alreadyUpright: boolean;
  textLength: number;
  isNearBlank: boolean;
  reason: string;
}
