export interface ImageEnhanceOptions {
  /** Upscale multiplier: 2x or 4x */
  scale: 2 | 4;
  /** Sharpening strength (0.5 to 3.0, default 1.2) */
  unsharpAmount: number;
  /** Blur radius for mask (1 to 4, default 1) */
  unsharpRadius: number;
  /** Threshold to prevent boosting noise (0 to 20, default 3) */
  unsharpThreshold: number;
}

export interface ImageEnhanceResult {
  file: File;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  enhancedWidth: number;
  enhancedHeight: number;
  edgeContrastBefore: number;
  edgeContrastAfter: number;
}
