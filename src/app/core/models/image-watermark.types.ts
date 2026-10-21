export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkLayoutMode = 'single' | 'tile';

export interface TextWatermarkConfig {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;
  rotationDegrees: number;
  backgroundColor?: string;
  padding?: number;
}

export interface LogoWatermarkConfig {
  type: 'logo';
  logoDataUrl?: string;
  logoBlob?: Blob;
  scale: number;
  opacity: number;
  rotationDegrees: number;
}

export interface WatermarkTileConfig {
  gapX: number;
  gapY: number;
  angleDegrees: number;
}

export interface WatermarkOptions {
  mode: WatermarkLayoutMode;
  position: WatermarkPosition;
  opacity: number;
  textConfig?: TextWatermarkConfig;
  logoConfig?: LogoWatermarkConfig;
  tileConfig?: WatermarkTileConfig;
  margin?: number;
}

export interface WatermarkPreset {
  id: string;
  name: string;
  options: WatermarkOptions;
  isBuiltin: boolean;
}
