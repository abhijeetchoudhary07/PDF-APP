/**
 * Data structures and types for Scanned Table OCR and Excel export.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface TableCornerPoints {
  topLeft: Point2D;
  topRight: Point2D;
  bottomLeft: Point2D;
  bottomRight: Point2D;
}

export interface TableCellBbox {
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  col: number;
}

export type TableCellType = 'text' | 'number' | 'currency' | 'date';

export interface TableCell {
  row: number;
  col: number;
  value: string;
  rawText: string;
  type: TableCellType;
  confidence: number;
  bbox?: TableCellBbox;
}

export type TableLayoutDetectionMethod = 'ruled' | 'borderless';

export interface TableStructure {
  rowCount: number;
  colCount: number;
  method: TableLayoutDetectionMethod;
  cells: TableCell[][];
  cellBboxes: TableCellBbox[];
  rowBoundaries: number[]; // y positions
  colBoundaries: number[]; // x positions
}

export interface ScannedTableResult {
  fileName: string;
  pageNumber: number;
  matrix: string[][];
  cells: TableCell[][];
  rowCount: number;
  colCount: number;
  structure: TableStructure;
  confidence: number;
  processingTimeMs: number;
}

export interface TableExportOptions {
  includeFormatting?: boolean;
  sheetName?: string;
  autofitColumns?: boolean;
}
