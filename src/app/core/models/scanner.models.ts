export interface Point {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export type ScanMode = 'document' | 'book' | 'id_card' | 'whiteboard' | 'photo' | 'table';

export type EnhancementPreset =
  | 'original'
  | 'document'
  | 'grayscale'
  | 'bw'
  | 'high_contrast'
  | 'whiteboard'
  | 'photo';

export interface EnhancementOptions {
  preset: EnhancementPreset;
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  sharpen: number;    // 0 to 100
  removeShadows?: boolean;
  removeFinger?: boolean;
  dewarpCurvature?: boolean;
}

export interface GutterDetectionResult {
  gutterX: number;
  splitRatio: number;
  confidence: number;
}

export interface IdCardLayoutOptions {
  cardWidthMm?: number;
  cardHeightMm?: number;
  gapMm?: number;
  showLabels?: boolean;
  pageFormat?: 'A4' | 'Letter';
  dpi?: number;
}

export interface BlurScoreResult {
  /** Raw variance-of-Laplacian. Unbounded (roughly 0 to ~30000) -- threshold
   *  decisions use this, never the percentage. */
  score: number;
  /** `score` mapped onto 0-100 for display. The raw variance spans orders of
   *  magnitude, so showing it with a % sign read as "Sharp 27225%". */
  scorePercent: number;
  isBlurry: boolean;
  threshold: number;
}

export interface AutoCaptureEvaluation {
  canTrigger: boolean;
  stabilityProgress: number; // 0 to 1
  coverageRatio: number;
  blurScore: number;
  isBlurry: boolean;
  reason?: string;
}

export interface ShadowRemovalResult {
  canvas: HTMLCanvasElement;
  applied: boolean;
}

export interface FingerDetectionResult {
  detected: boolean;
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  edge: 'left' | 'right' | 'top' | 'bottom' | 'none';
}

export interface DewarpResult {
  canvas: HTMLCanvasElement;
  curvatureDetected: boolean;
  curvatureMagnitude: number;
}

export interface AutoNamingResult {
  proposedTitle: string;
  sanitizedFileName: string;
  confidence: number;
  source: 'ocr' | 'heuristic' | 'fallback';
}

export interface ScannedPage {
  id: string;
  pageNumber: number;
  originalImageBlob: Blob;
  originalImageUrl: string;
  originalWidth: number;
  originalHeight: number;
  corners: DocumentCorners;
  detectionConfidence: number; // 0 to 100
  lowConfidence: boolean;
  rotation: number; // 0, 90, 180, 270
  enhancement: EnhancementOptions;
  processedImageBlob: Blob;
  processedImageUrl: string;
  processedWidth: number;
  processedHeight: number;
  scanMode?: ScanMode;
  blurScore?: number;
  blurPercent?: number;
  isBlurry?: boolean;
  shadowRemovalApplied?: boolean;
  fingerDetected?: boolean;
  fingerRemoved?: boolean;
  /** H7: measured at capture, so the straighten toggle is offered only on pages
   *  that are actually curved -- a flat page would be resampled for nothing. */
  curvatureDetected?: boolean;
  curvatureMagnitude?: number;
  dewarpApplied?: boolean;
  preEnhancementBlob?: Blob;
  preEnhancementUrl?: string;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  corners: DocumentCorners;
  imageWidth: number;
  imageHeight: number;
  lowConfidence: boolean;
}

