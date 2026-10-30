import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { createWorker, Worker } from 'tesseract.js';

import { StorageService } from './storage.service';
import { FileService } from './file.service';
import { OcrModelManagerService } from './ocr-model-manager.service';
import { OcrWord, OcrDocumentResult } from '../models/ocr.models';
import {
  TableCell,
  TableCellBbox,
  TableCellType,
  TableCornerPoints,
  TableExportOptions,
  TableLayoutDetectionMethod,
  TableStructure,
  ScannedTableResult,
  Point2D
} from '../models/scanned-table.types';

export const MAX_TABLE_ROWS = 500;
export const MAX_TABLE_COLS = 100;
export const MAX_TOTAL_CELLS = 10000;

/**
 * Sanitizes cell text to protect against CSV and Excel Formula Injection (DDE attacks).
 * Neutralizes leading '=', '+', '-', '@', '\t', '\r' by prepending a single quote ("'").
 * Valid numbers (like -42 or +5) are preserved if they are purely numeric.
 */
export function sanitizeFormulaInjection(value: string): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';

  // If it's a valid negative or positive number (e.g. -15.50 or +100), do not escape
  if (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(trimmed)) {
    return trimmed;
  }

  // Dangerous formula trigger characters: =, +, -, @, tab (0x09), carriage return (0x0D)
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }

  return trimmed;
}

/**
 * Strips XML 1.0 illegal control characters that corrupt Excel OpenXML packages.
 * Allowed in XML 1.0: \t (0x09), \n (0x0A), \r (0x0D).
 * Forbidden: 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F-0x9F.
 */
export function sanitizeCellTextForXml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

@Injectable({
  providedIn: 'root'
})
export class ScannedTableOcrService {
  private storageService = inject(StorageService);
  private fileService = inject(FileService);
  private modelManager = inject(OcrModelManagerService);

  private tesseractWorker: Worker | null = null;

  /**
   * Lazily initializes and caches a Tesseract.js worker for localized table cell OCR.
   */
  async getOrCreateWorker(language: string = 'eng'): Promise<Worker> {
    if (!this.tesseractWorker) {
      try {
        const options = await this.modelManager.getWorkerOptions(language);
        this.tesseractWorker = await createWorker(language, 1, options);
      } catch {
        // Fallback to basic initialization if model manager fails in mock/isolated environment
        this.tesseractWorker = await createWorker(language, 1);
      }
    }
    return this.tesseractWorker;
  }

  /**
   * Terminates active Tesseract worker to free memory.
   */
  async terminateWorker(): Promise<void> {
    if (this.tesseractWorker) {
      try {
        await this.tesseractWorker.terminate();
      } catch {}
      this.tesseractWorker = null;
    }
  }

  /**
   * Detects tabular layouts in a canvas:
   * 1. Ruled Tables (with borders):
   *    Extracts horizontal and vertical line segments via morphological kernel analysis,
   *    finds intersection points, and generates individual cell bounding boxes.
   * 2. Borderless Tables (whitespace gutters & baselines):
   *    Analyzes horizontal text baselines and vertical whitespace gutters to infer rows and columns.
   */
  detectTableStructure(
    canvas: HTMLCanvasElement,
    bbox?: { x: number; y: number; width: number; height: number },
    words?: (OcrWord | any)[]
  ): TableStructure {
    const canvasW = canvas.width || 800;
    const canvasH = canvas.height || 1000;
    const cropX = Math.max(0, Math.min(canvasW - 1, Math.round(bbox?.x ?? 0)));
    const cropY = Math.max(0, Math.min(canvasH - 1, Math.round(bbox?.y ?? 0)));
    const cropW = Math.max(1, Math.min(canvasW - cropX, Math.round(bbox?.width ?? canvasW)));
    const cropH = Math.max(1, Math.min(canvasH - cropY, Math.round(bbox?.height ?? canvasH)));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let imgData: ImageData | null = null;
    if (ctx) {
      try {
        imgData = ctx.getImageData(cropX, cropY, cropW, cropH);
      } catch {
        // Fallback if cross-origin or mocked canvas context in tests
      }
    }

    // 1. Try Ruled Table Detection
    if (imgData) {
      const ruledResult = this.detectRuledTable(imgData, cropX, cropY);
      if (ruledResult && ruledResult.rowCount >= 1 && ruledResult.colCount >= 1) {
        return ruledResult;
      }
    }

    // 2. Fallback to Borderless Table Detection
    return this.detectBorderlessTable(imgData, cropX, cropY, cropW, cropH, words);
  }

  /**
   * Detects ruled tables using horizontal and vertical line morphological kernels.
   */
  private detectRuledTable(
    imgData: ImageData,
    offsetX: number,
    offsetY: number
  ): TableStructure | null {
    const W = imgData.width;
    const H = imgData.height;
    const data = imgData.data;

    // Create binary dark-pixel matrix
    const isDark = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const rowOffset = y * W;
      const dataOffset = y * W * 4;
      for (let x = 0; x < W; x++) {
        const idx = dataOffset + x * 4;
        const a = data[idx + 3];
        if (a < 50) continue;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (luma < 185) {
          isDark[rowOffset + x] = 1;
        }
      }
    }

    // Horizontal morphological kernel filter
    // Minimum continuous line length: 20px or 1/20th width
    const minHLineLen = Math.max(16, Math.floor(W / 25));
    const hLineRows = new Int32Array(H);

    for (let y = 0; y < H; y++) {
      const rowOffset = y * W;
      let runLen = 0;
      let linePixelsInRow = 0;
      for (let x = 0; x < W; x++) {
        if (isDark[rowOffset + x] === 1) {
          runLen++;
        } else {
          if (runLen >= minHLineLen) {
            linePixelsInRow += runLen;
          }
          runLen = 0;
        }
      }
      if (runLen >= minHLineLen) {
        linePixelsInRow += runLen;
      }
      hLineRows[y] = linePixelsInRow;
    }

    // Vertical morphological kernel filter
    // Minimum continuous line length: 16px or 1/25th height
    const minVLineLen = Math.max(16, Math.floor(H / 25));
    const vLineCols = new Int32Array(W);

    for (let x = 0; x < W; x++) {
      let runLen = 0;
      let linePixelsInCol = 0;
      for (let y = 0; y < H; y++) {
        if (isDark[y * W + x] === 1) {
          runLen++;
        } else {
          if (runLen >= minVLineLen) {
            linePixelsInCol += runLen;
          }
          runLen = 0;
        }
      }
      if (runLen >= minVLineLen) {
        linePixelsInCol += runLen;
      }
      vLineCols[x] = linePixelsInCol;
    }

    // Find horizontal line dividers (peaks in hLineRows)
    // Threshold: at least 25% of table width
    const hThreshold = W * 0.22;
    const rawHDivs: number[] = [];
    for (let y = 0; y < H; y++) {
      if (hLineRows[y] >= hThreshold) {
        rawHDivs.push(y);
      }
    }

    // Find vertical line dividers (peaks in vLineCols)
    // Threshold: at least 20% of table height
    const vThreshold = H * 0.20;
    const rawVDivs: number[] = [];
    for (let x = 0; x < W; x++) {
      if (vLineCols[x] >= vThreshold) {
        rawVDivs.push(x);
      }
    }

    // Cluster dividers that are close together (within 12px)
    const rowDividers = this.clusterCoordinates(rawHDivs, 12).map(y => y + offsetY);
    const colDividers = this.clusterCoordinates(rawVDivs, 12).map(x => x + offsetX);

    if (rowDividers.length < 2 || colDividers.length < 2) {
      return null;
    }

    let rowCount = Math.min(rowDividers.length - 1, MAX_TABLE_ROWS);
    let colCount = Math.min(colDividers.length - 1, MAX_TABLE_COLS);
    if (rowCount * colCount > MAX_TOTAL_CELLS) {
      rowCount = Math.max(1, Math.floor(MAX_TOTAL_CELLS / colCount));
    }

    const cellBboxes: TableCellBbox[] = [];
    const cells: TableCell[][] = [];

    for (let r = 0; r < rowCount; r++) {
      cells[r] = [];
      const y0 = rowDividers[r];
      const y1 = rowDividers[r + 1];
      const height = Math.max(1, y1 - y0);

      for (let c = 0; c < colCount; c++) {
        const x0 = colDividers[c];
        const x1 = colDividers[c + 1];
        const width = Math.max(1, x1 - x0);

        const bbox: TableCellBbox = {
          row: r,
          col: c,
          x: x0,
          y: y0,
          width,
          height
        };
        cellBboxes.push(bbox);

        cells[r][c] = {
          row: r,
          col: c,
          value: '',
          rawText: '',
          type: 'text',
          confidence: 100,
          bbox
        };
      }
    }

    return {
      rowCount,
      colCount,
      method: 'ruled',
      cells,
      cellBboxes,
      rowBoundaries: rowDividers,
      colBoundaries: colDividers
    };
  }

  /**
   * Detects borderless tables using whitespace column gutters and line baselines.
   */
  private detectBorderlessTable(
    imgData: ImageData | null,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    words?: (OcrWord | any)[]
  ): TableStructure {
    // Strategy A: If OCR words are available within region
    if (words && words.length > 0) {
      const regionWords = words.filter(w => {
        const bbox = w.bbox || {};
        const bx = bbox.x0 ?? bbox.x ?? 0;
        const by = bbox.y0 ?? bbox.y ?? 0;
        return (
          bx >= offsetX - 5 &&
          bx <= offsetX + width + 5 &&
          by >= offsetY - 5 &&
          by <= offsetY + height + 5
        );
      });

      if (regionWords.length > 0) {
        return this.detectBorderlessFromWords(regionWords, offsetX, offsetY, width, height);
      }
    }

    // Strategy B: Pure canvas whitespace projection profile
    if (imgData) {
      return this.detectBorderlessFromCanvasProjection(imgData, offsetX, offsetY);
    }

    // Fallback: Default single 1x1 table cell
    const defaultBbox: TableCellBbox = {
      row: 0,
      col: 0,
      x: offsetX,
      y: offsetY,
      width,
      height
    };
    return {
      rowCount: 1,
      colCount: 1,
      method: 'borderless',
      cells: [
        [
          {
            row: 0,
            col: 0,
            value: '',
            rawText: '',
            type: 'text',
            confidence: 80,
            bbox: defaultBbox
          }
        ]
      ],
      cellBboxes: [defaultBbox],
      rowBoundaries: [offsetY, offsetY + height],
      colBoundaries: [offsetX, offsetX + width]
    };
  }

  /**
   * Detects borderless table structure from OCR word coordinates.
   */
  private detectBorderlessFromWords(
    words: any[],
    offsetX: number,
    offsetY: number,
    width: number,
    height: number
  ): TableStructure {
    // 1. Group words into horizontal text lines (baselines)
    const sortedByY = [...words].sort((a, b) => {
      const ay = a.bbox?.y0 ?? a.bbox?.y ?? 0;
      const by = b.bbox?.y0 ?? b.bbox?.y ?? 0;
      return ay - by;
    });

    const medianHeight = this.calculateMedianWordHeight(sortedByY) || 16;
    const rowGroups: any[][] = [];

    for (const w of sortedByY) {
      const wy = w.bbox?.y0 ?? w.bbox?.y ?? 0;
      const wh = (w.bbox?.height ?? ((w.bbox?.y1 ?? wy) - wy)) || medianHeight;
      const cy = wy + wh / 2;

      let placed = false;
      for (const group of rowGroups) {
        const groupFirst = group[0];
        const gWy = groupFirst.bbox?.y0 ?? groupFirst.bbox?.y ?? 0;
        const gWh = (groupFirst.bbox?.height ?? ((groupFirst.bbox?.y1 ?? gWy) - gWy)) || medianHeight;
        const gCy = gWy + gWh / 2;

        if (Math.abs(cy - gCy) <= medianHeight * 0.75) {
          group.push(w);
          placed = true;
          break;
        }
      }

      if (!placed) {
        rowGroups.push([w]);
      }
    }

    // Sort rows top to bottom
    rowGroups.sort((gA, gB) => {
      const ay = gA[0].bbox?.y0 ?? gA[0].bbox?.y ?? 0;
      const by = gB[0].bbox?.y0 ?? gB[0].bbox?.y ?? 0;
      return ay - by;
    });

    // 2. Detect column gutters via horizontal intervals
    // Compute horizontal projection histogram of word intervals
    const histogram = new Int32Array(width);
    for (const w of words) {
      const bx = (w.bbox?.x0 ?? w.bbox?.x ?? 0) - offsetX;
      const bw = (w.bbox?.width ?? ((w.bbox?.x1 ?? bx + offsetX) - (bx + offsetX))) || 30;
      const startX = Math.max(0, Math.min(width - 1, Math.round(bx)));
      const endX = Math.max(0, Math.min(width - 1, Math.round(bx + bw)));

      for (let x = startX; x <= endX; x++) {
        histogram[x]++;
      }
    }

    // Gutters are intervals where histogram is 0 with width >= 10px
    const gutters: { start: number; end: number }[] = [];
    let gutterStart = -1;
    for (let x = 0; x < width; x++) {
      if (histogram[x] === 0) {
        if (gutterStart === -1) gutterStart = x;
      } else {
        if (gutterStart !== -1) {
          if (x - gutterStart >= 8) {
            gutters.push({ start: gutterStart, end: x });
          }
          gutterStart = -1;
        }
      }
    }
    if (gutterStart !== -1 && width - gutterStart >= 8) {
      gutters.push({ start: gutterStart, end: width });
    }

    // Calculate column boundaries from gutters
    const colDividers: number[] = [offsetX];
    for (const g of gutters) {
      // Ignore outer margin gutters (very start or very end of crop)
      if (g.start > 15 && g.end < width - 15) {
        const midX = Math.round((g.start + g.end) / 2) + offsetX;
        colDividers.push(midX);
      }
    }
    colDividers.push(offsetX + width);

    // Calculate row boundaries
    const rowDividers: number[] = [offsetY];
    for (let i = 0; i < rowGroups.length - 1; i++) {
      const currRow = rowGroups[i];
      const nextRow = rowGroups[i + 1];

      const currMaxY = Math.max(
        ...currRow.map(w => (w.bbox?.y1 ?? (w.bbox?.y ?? 0) + (w.bbox?.height ?? 16)))
      );
      const nextMinY = Math.min(...nextRow.map(w => (w.bbox?.y0 ?? w.bbox?.y ?? 0)));

      const midY = Math.round((currMaxY + nextMinY) / 2);
      rowDividers.push(midY);
    }
    rowDividers.push(offsetY + height);

    let rowCount = Math.min(Math.max(1, rowDividers.length - 1), MAX_TABLE_ROWS);
    let colCount = Math.min(Math.max(1, colDividers.length - 1), MAX_TABLE_COLS);
    if (rowCount * colCount > MAX_TOTAL_CELLS) {
      rowCount = Math.max(1, Math.floor(MAX_TOTAL_CELLS / colCount));
    }

    const cellBboxes: TableCellBbox[] = [];
    const cells: TableCell[][] = [];

    for (let r = 0; r < rowCount; r++) {
      cells[r] = [];
      const y0 = rowDividers[r];
      const y1 = rowDividers[r + 1];

      for (let c = 0; c < colCount; c++) {
        const x0 = colDividers[c];
        const x1 = colDividers[c + 1];

        const bbox: TableCellBbox = {
          row: r,
          col: c,
          x: x0,
          y: y0,
          width: Math.max(1, x1 - x0),
          height: Math.max(1, y1 - y0)
        };
        cellBboxes.push(bbox);

        cells[r][c] = {
          row: r,
          col: c,
          value: '',
          rawText: '',
          type: 'text',
          confidence: 85,
          bbox
        };
      }
    }

    return {
      rowCount,
      colCount,
      method: 'borderless',
      cells,
      cellBboxes,
      rowBoundaries: rowDividers,
      colBoundaries: colDividers
    };
  }

  /**
   * Detects borderless table structure directly from canvas whitespace projections.
   */
  private detectBorderlessFromCanvasProjection(
    imgData: ImageData,
    offsetX: number,
    offsetY: number
  ): TableStructure {
    const W = imgData.width;
    const H = imgData.height;
    const data = imgData.data;

    const rowHist = new Int32Array(H);
    const colHist = new Int32Array(W);

    for (let y = 0; y < H; y++) {
      const dataOffset = y * W * 4;
      for (let x = 0; x < W; x++) {
        const idx = dataOffset + x * 4;
        if (data[idx + 3] < 50) continue;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (luma < 185) {
          rowHist[y]++;
          colHist[x]++;
        }
      }
    }

    // Horizontal text line spans (baselines)
    const textRows: { start: number; end: number }[] = [];
    let inText = false;
    let textStart = 0;
    for (let y = 0; y < H; y++) {
      if (rowHist[y] > 2) {
        if (!inText) {
          inText = true;
          textStart = y;
        }
      } else {
        if (inText) {
          inText = false;
          if (y - textStart >= 6) {
            textRows.push({ start: textStart, end: y });
          }
        }
      }
    }
    if (inText && H - textStart >= 6) {
      textRows.push({ start: textStart, end: H });
    }

    // Column whitespace gutters
    const colGutters: { start: number; end: number }[] = [];
    let inGutter = false;
    let gutterStart = 0;
    for (let x = 0; x < W; x++) {
      if (colHist[x] <= 2) {
        if (!inGutter) {
          inGutter = true;
          gutterStart = x;
        }
      } else {
        if (inGutter) {
          inGutter = false;
          if (x - gutterStart >= 12) {
            colGutters.push({ start: gutterStart, end: x });
          }
        }
      }
    }
    if (inGutter && W - gutterStart >= 12) {
      colGutters.push({ start: gutterStart, end: W });
    }

    const colDividers: number[] = [offsetX];
    for (const g of colGutters) {
      if (g.start > 15 && g.end < W - 15) {
        colDividers.push(Math.round((g.start + g.end) / 2) + offsetX);
      }
    }
    colDividers.push(offsetX + W);

    const rowDividers: number[] = [offsetY];
    for (let i = 0; i < textRows.length - 1; i++) {
      const midY = Math.round((textRows[i].end + textRows[i + 1].start) / 2) + offsetY;
      rowDividers.push(midY);
    }
    rowDividers.push(offsetY + H);

    let rowCount = Math.min(Math.max(1, rowDividers.length - 1), MAX_TABLE_ROWS);
    let colCount = Math.min(Math.max(1, colDividers.length - 1), MAX_TABLE_COLS);
    if (rowCount * colCount > MAX_TOTAL_CELLS) {
      rowCount = Math.max(1, Math.floor(MAX_TOTAL_CELLS / colCount));
    }

    const cellBboxes: TableCellBbox[] = [];
    const cells: TableCell[][] = [];

    for (let r = 0; r < rowCount; r++) {
      cells[r] = [];
      const y0 = rowDividers[r];
      const y1 = rowDividers[r + 1];

      for (let c = 0; c < colCount; c++) {
        const x0 = colDividers[c];
        const x1 = colDividers[c + 1];

        const bbox: TableCellBbox = {
          row: r,
          col: c,
          x: x0,
          y: y0,
          width: Math.max(1, x1 - x0),
          height: Math.max(1, y1 - y0)
        };
        cellBboxes.push(bbox);

        cells[r][c] = {
          row: r,
          col: c,
          value: '',
          rawText: '',
          type: 'text',
          confidence: 85,
          bbox
        };
      }
    }

    return {
      rowCount,
      colCount,
      method: 'borderless',
      cells,
      cellBboxes,
      rowBoundaries: rowDividers,
      colBoundaries: colDividers
    };
  }

  /**
   * Helper to cluster close coordinate divider peaks.
   */
  private clusterCoordinates(coords: number[], distanceThreshold: number): number[] {
    if (coords.length === 0) return [];
    coords.sort((a, b) => a - b);

    const clusters: number[][] = [[coords[0]]];
    for (let i = 1; i < coords.length; i++) {
      const val = coords[i];
      const currentCluster = clusters[clusters.length - 1];
      const clusterMean = currentCluster.reduce((s, v) => s + v, 0) / currentCluster.length;

      if (Math.abs(val - clusterMean) <= distanceThreshold) {
        currentCluster.push(val);
      } else {
        clusters.push([val]);
      }
    }

    return clusters.map(c => Math.round(c.reduce((s, v) => s + v, 0) / c.length));
  }

  private calculateMedianWordHeight(words: any[]): number {
    if (words.length === 0) return 16;
    const heights = words
      .map(w => w.bbox?.height ?? ((w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0)))
      .filter(h => h > 4)
      .sort((a, b) => a - b);
    if (heights.length === 0) return 16;
    return heights[Math.floor(heights.length / 2)];
  }

  /**
   * Populates a 2D matrix data[row][col] by assigning recognized OCR words to each cell
   * and inferring data types (numbers, dates, currency, text).
   */
  populateTableMatrix(
    structure: TableStructure,
    words: (OcrWord | any)[] = [],
    fileName: string = 'scanned_table.png',
    pageNumber: number = 1
  ): ScannedTableResult {
    const startTime = Date.now();
    let rowCount = Math.min(structure.rowCount, MAX_TABLE_ROWS);
    let colCount = Math.min(structure.colCount, MAX_TABLE_COLS);
    if (rowCount * colCount > MAX_TOTAL_CELLS) {
      rowCount = Math.max(1, Math.floor(MAX_TOTAL_CELLS / colCount));
    }

    const matrix: string[][] = Array.from({ length: rowCount }, () =>
      Array.from({ length: colCount }, () => '')
    );
    const populatedCells: TableCell[][] = Array.from({ length: rowCount }, () => []);

    let totalConfidence = 0;
    let wordCountInCells = 0;

    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const cell = structure.cells[r]?.[c];
        const bbox = cell?.bbox || {
          row: r,
          col: c,
          x: structure.colBoundaries[c] || 0,
          y: structure.rowBoundaries[r] || 0,
          width: (structure.colBoundaries[c + 1] || 100) - (structure.colBoundaries[c] || 0),
          height: (structure.rowBoundaries[r + 1] || 30) - (structure.rowBoundaries[r] || 0)
        };

        // Find words whose center lies within this cell's bbox
        const cellWords = words.filter(w => {
          const wBbox = w.bbox || {};
          const wx0 = wBbox.x0 ?? wBbox.x ?? 0;
          const wy0 = wBbox.y0 ?? wBbox.y ?? 0;
          const ww = (wBbox.width ?? ((wBbox.x1 ?? wx0) - wx0)) || 10;
          const wh = (wBbox.height ?? ((wBbox.y1 ?? wy0) - wy0)) || 10;

          const cx = wx0 + ww / 2;
          const cy = wy0 + wh / 2;

          return (
            cx >= bbox.x - 3 &&
            cx <= bbox.x + bbox.width + 3 &&
            cy >= bbox.y - 3 &&
            cy <= bbox.y + bbox.height + 3
          );
        });

        // Sort words horizontally within cell
        cellWords.sort((a, b) => {
          const ax = a.bbox?.x0 ?? a.bbox?.x ?? 0;
          const bx = b.bbox?.x0 ?? b.bbox?.x ?? 0;
          return ax - bx;
        });

        let rawText = cellWords.map(w => w.text || '').join(' ').trim();
        // Clean whitespace and spurious border artifacts
        rawText = this.cleanCellText(rawText);

        let cellConf = 85;
        if (cellWords.length > 0) {
          const sumConf = cellWords.reduce((s, w) => s + (w.confidence ?? 80), 0);
          cellConf = Math.round(sumConf / cellWords.length);
          totalConfidence += sumConf;
          wordCountInCells += cellWords.length;
        }

        const cellType = this.inferCellDataType(rawText);

        matrix[r][c] = rawText;
        populatedCells[r][c] = {
          row: r,
          col: c,
          value: rawText,
          rawText,
          type: cellType,
          confidence: cellConf,
          bbox
        };
      }
    }

    const averageConfidence =
      wordCountInCells > 0 ? Math.round(totalConfidence / wordCountInCells) : 85;

    return {
      fileName,
      pageNumber,
      matrix,
      cells: populatedCells,
      rowCount,
      colCount,
      structure: {
        ...structure,
        cells: populatedCells
      },
      confidence: averageConfidence,
      processingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Cleans recognized cell text by trimming redundant spaces and stray line noise.
   */
  cleanCellText(text: string): string {
    if (!text) return '';
    return sanitizeCellTextForXml(text)
      .replace(/[\r\n]+/g, ' ')
      .replace(/[|~_—]+$/g, '')
      .replace(/^[|~_—]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Infers cell data type: 'currency' | 'number' | 'date' | 'text'.
   */
  inferCellDataType(value: string): TableCellType {
    if (!value) return 'text';
    const trimmed = value.trim();

    // Currency pattern
    if (
      /^[₹$€£¥]\s*[\d,]+(?:\.\d{1,2})?$/.test(trimmed) ||
      /^[\d,]+(?:\.\d{1,2})?\s*(?:INR|USD|EUR|GBP|Rs\.?)$/i.test(trimmed)
    ) {
      return 'currency';
    }

    // Date pattern (YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, etc.)
    if (
      /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(trimmed) ||
      /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}$/i.test(trimmed)
    ) {
      return 'date';
    }

    // Number pattern (optional commas and decimals, percent)
    // Avoid classifying phone numbers or IDs that start with leading 0 as plain number if length > 1
    if (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(trimmed)) {
      if (trimmed.startsWith('0') && trimmed.length > 1 && !trimmed.includes('.')) {
        return 'text'; // e.g. '0123' account or pin
      }
      return 'number';
    }

    return 'text';
  }

  /**
   * Generates a Microsoft Excel (.xlsx) file using the bundled xlsx library.
   * Auto-sizes column widths and formats numeric/text cells.
   * Defends against Formula Injection and XML control character corruption.
   */
  generateExcelFile(
    matrix: string[][],
    filename: string = 'table.xlsx',
    options?: TableExportOptions
  ): File {
    const wb = XLSX.utils.book_new();

    // Map matrix and convert numeric types where appropriate, sanitizing formula injection and XML corrupting control characters
    const formattedAoa: any[][] = matrix.map(row =>
      row.map(cellValue => {
        const cleaned = sanitizeCellTextForXml(cellValue || '');
        const trimmed = cleaned.trim();
        const type = this.inferCellDataType(trimmed);
        if (type === 'number') {
          const num = Number(trimmed.replace(/,/g, '').replace(/%$/, ''));
          if (!isNaN(num)) return num;
        }
        return sanitizeFormulaInjection(cleaned);
      })
    );

    const ws = XLSX.utils.aoa_to_sheet(formattedAoa);

    // Auto-fit column widths
    const maxCols = Math.max(...matrix.map(r => r.length), 1);
    ws['!cols'] = Array.from({ length: maxCols }, (_, colIdx) => {
      const maxLen = Math.max(
        ...matrix.map(row => (row[colIdx] ? String(row[colIdx]).length : 0)),
        6
      );
      return { wch: Math.min(60, Math.max(10, maxLen + 3)) };
    });

    const sheetName = options?.sheetName || 'Scanned Table';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new File(
      [xlsxBytes],
      filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    );
  }

  /**
   * Generates a standard RFC 4180 CSV file from the 2D table matrix.
   * Escapes quotes, commas, newlines, and prepends single quote on formula injection characters.
   */
  generateCsvFile(matrix: string[][], filename: string = 'table.csv'): File {
    const csvLines = matrix.map(row =>
      row
        .map(cell => {
          const cleaned = sanitizeCellTextForXml(cell || '');
          const safeVal = sanitizeFormulaInjection(cleaned);
          if (safeVal.includes(',') || safeVal.includes('"') || safeVal.includes('\n') || safeVal.includes('\r')) {
            return `"${safeVal.replace(/"/g, '""')}"`;
          }
          return safeVal;
        })
        .join(',')
    );

    const csvContent = csvLines.join('\r\n');
    return new File(
      [csvContent],
      filename.endsWith('.csv') ? filename : `${filename}.csv`,
      {
        type: 'text/csv;charset=utf-8;'
      }
    );
  }

  /**
   * Exports matrix to Excel, enforcing quota via StorageService.saveFile.
   */
  async exportToExcelWithQuota(
    matrix: string[][],
    filename: string = 'table.xlsx',
    options?: TableExportOptions
  ): Promise<{ file: File; savedUri?: string; quotaEnforced: boolean }> {
    const excelFile = this.generateExcelFile(matrix, filename, options);

    // Enforce daily quota via StorageService.saveFile
    const savedUri = await this.storageService.saveFile(excelFile, 'table-excel', undefined, {
      preserveName: true
    });

    if (!savedUri) {
      // Quota exhausted or write failed
      return { file: excelFile, savedUri: undefined, quotaEnforced: true };
    }

    // Trigger platform download on web
    try {
      this.fileService.downloadFile(excelFile);
    } catch {}

    return { file: excelFile, savedUri, quotaEnforced: true };
  }

  /**
   * Exports matrix to CSV, enforcing quota via StorageService.saveFile.
   */
  async exportToCsvWithQuota(
    matrix: string[][],
    filename: string = 'table.csv'
  ): Promise<{ file: File; savedUri?: string; quotaEnforced: boolean }> {
    const csvFile = this.generateCsvFile(matrix, filename);

    // Enforce daily quota via StorageService.saveFile
    const savedUri = await this.storageService.saveFile(csvFile, 'table-excel', undefined, {
      preserveName: true
    });

    if (!savedUri) {
      // Quota exhausted or write failed
      return { file: csvFile, savedUri: undefined, quotaEnforced: true };
    }

    // Trigger platform download on web
    try {
      this.fileService.downloadFile(csvFile);
    } catch {}

    return { file: csvFile, savedUri, quotaEnforced: true };
  }

  /**
   * Crops a region from canvas defined by 4 corner points.
   */
  cropRegionFromCorners(
    canvas: HTMLCanvasElement,
    corners: TableCornerPoints
  ): HTMLCanvasElement {
    const canvasW = canvas.width || 800;
    const canvasH = canvas.height || 1000;
    const minX = Math.max(0, Math.min(corners.topLeft.x, corners.bottomLeft.x));
    const maxX = Math.min(canvasW, Math.max(corners.topRight.x, corners.bottomRight.x));
    const minY = Math.max(0, Math.min(corners.topLeft.y, corners.topRight.y));
    const maxY = Math.min(canvasH, Math.max(corners.bottomLeft.y, corners.bottomRight.y));

    const w = Math.max(1, Math.min(canvasW - minX, Math.round(maxX - minX)));
    const h = Math.max(1, Math.min(canvasH - minY, Math.round(maxY - minY)));

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;

    const ctx = cropCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    }
    return cropCanvas;
  }
}
