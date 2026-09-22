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

export type EnhancementPreset = 'original' | 'document' | 'grayscale' | 'bw' | 'high_contrast';

export interface EnhancementOptions {
  preset: EnhancementPreset;
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  sharpen: number;    // 0 to 100
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
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  corners: DocumentCorners;
  imageWidth: number;
  imageHeight: number;
  lowConfidence: boolean;
}
