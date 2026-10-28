export type PaperSize = 'a4' | '4x6' | 'letter';

export interface PaperDimensionsMm {
  widthMm: number;
  heightMm: number;
  label: string;
}

export const PAPER_DIMENSIONS: Record<PaperSize, PaperDimensionsMm> = {
  a4: { widthMm: 210, heightMm: 297, label: 'A4 (210 × 297 mm)' },
  '4x6': { widthMm: 101.6, heightMm: 152.4, label: '4 × 6 in (102 × 152 mm)' },
  letter: { widthMm: 215.9, heightMm: 279.4, label: 'US Letter (8.5 × 11 in)' }
};

export interface SheetGridConfig {
  rows: number;
  columns: number;
  marginMm: number;
  gutterMm: number;
  showCutMarks: boolean;
  fitMode: 'fit' | 'fill';
  paperSize: PaperSize;
  dpi: number;
}

export interface SheetCellRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rowIndex: number;
  colIndex: number;
}

export interface PhotoSheetExportOptions {
  outputType: 'image/jpeg' | 'image/png' | 'application/pdf';
  quality?: number;
}
