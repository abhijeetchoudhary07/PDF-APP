export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdPhotoPreset {
  id: string;
  name: string;
  widthMm?: number;
  heightMm?: number;
  widthPx: number;
  heightPx: number;
  targetKB: number;
  description: string;
}

export interface IdPhotoCropOptions {
  /** Head height as fraction of crop height (default 0.72) */
  headHeightRatio: number;
  /** Eye-line distance from top of crop box as fraction of crop height (default 0.43) */
  eyeLineRatio: number;
  /** Aspect ratio: width / height */
  aspectRatio: number;
}

export interface IdPhotoBackgroundOptions {
  replace: boolean;
  color: 'white' | 'light-blue' | 'none';
  customHex?: string;
}

export interface PrintSheetOptions {
  paperSize: '4x6' | 'a4';
  copies: number;
  gapMm: number;
  includeCutMarks: boolean;
  dpi: number;
}

export interface BackgroundSuitabilityResult {
  suitable: boolean;
  reason?: string;
  variance: number;
}

export interface PrintSheetLayout {
  sheetWidthPx: number;
  sheetHeightPx: number;
  photoWidthPx: number;
  photoHeightPx: number;
  columns: number;
  rows: number;
  totalCopies: number;
  positions: Array<{ x: number; y: number; width: number; height: number }>;
}

/**
 * Standard ID / passport presets named ONLY by dimensions and KB.
 * Never named by an institution or exam board.
 */
export const ID_PHOTO_PRESETS: IdPhotoPreset[] = [
  {
    id: '35x45_50kb',
    name: '35 × 45 mm (413 × 531 px) · 50 KB',
    widthMm: 35,
    heightMm: 45,
    widthPx: 413,
    heightPx: 531,
    targetKB: 50,
    description: 'Standard passport ratio (7:9), max 50 KB'
  },
  {
    id: '35x45_20_50kb',
    name: '35 × 45 mm (413 × 531 px) · 20–50 KB',
    widthMm: 35,
    heightMm: 45,
    widthPx: 413,
    heightPx: 531,
    targetKB: 45,
    description: 'Standard 3.5 × 4.5 cm portrait, under 50 KB'
  },
  {
    id: '50x50_200kb',
    name: '50 × 50 mm (600 × 600 px) · 200 KB',
    widthMm: 50,
    heightMm: 50,
    widthPx: 600,
    heightPx: 600,
    targetKB: 200,
    description: '2 × 2 inch square portrait, under 200 KB'
  },
  {
    id: '35x35_100kb',
    name: '35 × 35 mm (413 × 413 px) · 100 KB',
    widthMm: 35,
    heightMm: 35,
    widthPx: 413,
    heightPx: 413,
    targetKB: 100,
    description: 'Square photo (1:1), under 100 KB'
  },
  {
    id: '30x40_50kb',
    name: '30 × 40 mm (354 × 472 px) · 50 KB',
    widthMm: 30,
    heightMm: 40,
    widthPx: 354,
    heightPx: 472,
    targetKB: 50,
    description: 'Compact portrait (3:4), under 50 KB'
  },
  {
    id: '200x230_50kb',
    name: '200 × 230 px · 50 KB',
    widthPx: 200,
    heightPx: 230,
    targetKB: 50,
    description: '200 × 230 px online portal spec, under 50 KB'
  }
];
