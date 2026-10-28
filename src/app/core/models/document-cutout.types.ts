export interface DocumentCutoutOptions {
  /** Sensitivity tolerance for paper background detection (0–100, default 30) */
  tolerance: number;
  /** Feather smoothing radius in pixels (0–10, default 2) */
  feather: number;
  /** Clean isolated dust spots smaller than 2px (default true) */
  removeDustNoise?: boolean;
}

export interface DocumentCutoutSuitability {
  suitable: boolean;
  reason?: string;
  paperColor?: { r: number; g: number; b: number };
  contrastRatio?: number;
  backgroundVariance?: number;
}
