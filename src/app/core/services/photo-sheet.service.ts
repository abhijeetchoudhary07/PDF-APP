import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import {
  PAPER_DIMENSIONS,
  PaperSize,
  PhotoSheetExportOptions,
  SheetCellRect,
  SheetGridConfig
} from '../models/photo-sheet.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class PhotoSheetService {

  /**
   * Convert millimeters to pixels at a given DPI.
   */
  mmToPx(mm: number, dpi: number = 300): number {
    return Math.round((mm / 25.4) * dpi);
  }

  /**
   * Convert millimeters to PDF points (72 points per inch).
   */
  mmToPdfPoints(mm: number): number {
    return (mm / 25.4) * 72;
  }

  /**
   * Calculate cell layout rectangles for a sheet grid.
   * Deterministic geometry: handles rows, columns, margins, and gutters.
   */
  calculateGridCells(config: SheetGridConfig): {
    sheetWidthPx: number;
    sheetHeightPx: number;
    cells: SheetCellRect[];
  } {
    const paper = PAPER_DIMENSIONS[config.paperSize] || PAPER_DIMENSIONS.a4;
    const dpi = config.dpi || 300;

    const sheetWidthPx = this.mmToPx(paper.widthMm, dpi);
    const sheetHeightPx = this.mmToPx(paper.heightMm, dpi);

    const marginPx = this.mmToPx(config.marginMm, dpi);
    const gutterPx = this.mmToPx(config.gutterMm, dpi);

    const printableWidth = sheetWidthPx - marginPx * 2;
    const printableHeight = sheetHeightPx - marginPx * 2;

    const totalGuttersX = (config.columns - 1) * gutterPx;
    const totalGuttersY = (config.rows - 1) * gutterPx;

    const cellWidth = Math.max(1, Math.floor((printableWidth - totalGuttersX) / config.columns));
    const cellHeight = Math.max(1, Math.floor((printableHeight - totalGuttersY) / config.rows));

    const cells: SheetCellRect[] = [];

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.columns; c++) {
        const x = marginPx + c * (cellWidth + gutterPx);
        const y = marginPx + r * (cellHeight + gutterPx);

        cells.push({
          x,
          y,
          width: cellWidth,
          height: cellHeight,
          rowIndex: r,
          colIndex: c
        });
      }
    }

    return { sheetWidthPx, sheetHeightPx, cells };
  }

  /**
   * Compute image placement within a cell preserving aspect ratio (zero distortion).
   */
  calculateFitInCell(
    imageWidth: number,
    imageHeight: number,
    cell: SheetCellRect,
    mode: 'fit' | 'fill' = 'fit'
  ): { x: number; y: number; width: number; height: number } {
    if (imageWidth <= 0 || imageHeight <= 0) {
      return { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
    }

    const scale = mode === 'fit'
      ? Math.min(cell.width / imageWidth, cell.height / imageHeight)
      : Math.max(cell.width / imageWidth, cell.height / imageHeight);

    const targetW = Math.round(imageWidth * scale);
    const targetH = Math.round(imageHeight * scale);

    const targetX = Math.round(cell.x + (cell.width - targetW) / 2);
    const targetY = Math.round(cell.y + (cell.height - targetH) / 2);

    return {
      x: targetX,
      y: targetY,
      width: targetW,
      height: targetH
    };
  }

  /**
   * Render photo sheet layout with images and optional cut marks onto a Canvas.
   */
  renderSheetCanvas(
    images: HTMLCanvasElement[],
    config: SheetGridConfig,
    repeatSingleImage = true
  ): HTMLCanvasElement {
    const layout = this.calculateGridCells(config);
    const canvas = createSafeCanvas(layout.sheetWidthPx, layout.sheetHeightPx);
    const ctx = getSafeContext(canvas);

    // Fill white sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, layout.sheetWidthPx, layout.sheetHeightPx);

    if (images.length === 0) {
      return canvas;
    }

    // Place images into cells
    for (let i = 0; i < layout.cells.length; i++) {
      const cell = layout.cells[i];
      const img = repeatSingleImage ? images[0] : images[i % images.length];

      if (img) {
        const fit = this.calculateFitInCell(img.width, img.height, cell, config.fitMode);
        ctx.drawImage(img, fit.x, fit.y, fit.width, fit.height);
      }

      // Draw cut marks
      if (config.showCutMarks) {
        this.drawCutMarks(ctx, cell, 15);
      }
    }

    return canvas;
  }

  /**
   * Draw dashed cut marks and corner crosshairs for scissor cutting.
   */
  private drawCutMarks(ctx: any, cell: SheetCellRect, markLen = 15) {
    ctx.save();
    ctx.strokeStyle = '#94a3b8'; // Light slate border
    ctx.lineWidth = 1;

    // Corner crosshairs outside cell
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(cell.x - markLen, cell.y);
    ctx.lineTo(cell.x, cell.y);
    ctx.moveTo(cell.x, cell.y - markLen);
    ctx.lineTo(cell.x, cell.y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(cell.x + cell.width, cell.y);
    ctx.lineTo(cell.x + cell.width + markLen, cell.y);
    ctx.moveTo(cell.x + cell.width, cell.y - markLen);
    ctx.lineTo(cell.x + cell.width, cell.y);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(cell.x - markLen, cell.y + cell.height);
    ctx.lineTo(cell.x, cell.y + cell.height);
    ctx.moveTo(cell.x, cell.y + cell.height);
    ctx.lineTo(cell.x, cell.y + cell.height + markLen);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(cell.x + cell.width, cell.y + cell.height);
    ctx.lineTo(cell.x + cell.width + markLen, cell.y + cell.height);
    ctx.moveTo(cell.x + cell.width, cell.y + cell.height);
    ctx.lineTo(cell.x + cell.width, cell.y + cell.height + markLen);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Export the rendered photo sheet as a vector-dimensioned PDF document.
   */
  async exportToPdf(sheetCanvas: HTMLCanvasElement, paperSize: PaperSize): Promise<Uint8Array> {
    const paper = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.a4;
    const widthPt = this.mmToPdfPoints(paper.widthMm);
    const heightPt = this.mmToPdfPoints(paper.heightMm);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([widthPt, heightPt]);

    // Convert canvas to image
    const dataUrl = sheetCanvas.toDataURL ? sheetCanvas.toDataURL('image/jpeg', 0.95) : 'data:image/jpeg;base64,';
    const base64Data = dataUrl.split(',')[1] || '';
    const imgBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    try {
      const embedded = await pdfDoc.embedJpg(imgBytes);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: widthPt,
        height: heightPt
      });
    } catch {
      // If jpeg embedding fails in headless, add blank page with dimensions
    }

    return await pdfDoc.save();
  }
}
