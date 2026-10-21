export interface RedactionRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'blur' | 'pixelate';
  /** Intensity level from 1 (subtle) to 10 (maximum) */
  intensity: number;
  label?: string;
}

export interface ImageRedactionConfig {
  regions: RedactionRegion[];
  defaultType?: 'blur' | 'pixelate';
  defaultIntensity?: number;
}
