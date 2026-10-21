import { describe, it, expect, beforeEach } from 'vitest';
import { PhotoSheetService } from './photo-sheet.service';
import { SheetGridConfig } from '../models/photo-sheet.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('PhotoSheetService (I9 Photo Sheet Layout)', () => {
  let service: PhotoSheetService;

  beforeEach(() => {
    service = new PhotoSheetService();
  });

  it('calculates cell count and positions for 2x2, 3x3, and 2x3 layouts', () => {
    // 1. Test 2x2 layout on 4x6 paper
    const config2x2: SheetGridConfig = {
      rows: 2,
      columns: 2,
      marginMm: 5,
      gutterMm: 4,
      showCutMarks: true,
      fitMode: 'fit',
      paperSize: '4x6',
      dpi: 300
    };
    const res2x2 = service.calculateGridCells(config2x2);
    expect(res2x2.cells.length).toBe(4);
    expect(res2x2.cells[0].rowIndex).toBe(0);
    expect(res2x2.cells[0].colIndex).toBe(0);
    expect(res2x2.cells[3].rowIndex).toBe(1);
    expect(res2x2.cells[3].colIndex).toBe(1);
    expect(res2x2.cells[1].x).toBeGreaterThan(res2x2.cells[0].x);
    expect(res2x2.cells[2].y).toBeGreaterThan(res2x2.cells[0].y);

    // 2. Test 3x3 layout on A4 paper
    const config3x3: SheetGridConfig = {
      rows: 3,
      columns: 3,
      marginMm: 10,
      gutterMm: 5,
      showCutMarks: true,
      fitMode: 'fit',
      paperSize: 'a4',
      dpi: 300
    };
    const res3x3 = service.calculateGridCells(config3x3);
    expect(res3x3.cells.length).toBe(9);
    expect(res3x3.cells[0].rowIndex).toBe(0);
    expect(res3x3.cells[8].rowIndex).toBe(2);
    expect(res3x3.cells[8].colIndex).toBe(2);

    // 3. Test 2x3 layout (2 rows, 3 columns = 6 cells)
    const config2x3: SheetGridConfig = {
      rows: 2,
      columns: 3,
      marginMm: 8,
      gutterMm: 6,
      showCutMarks: false,
      fitMode: 'fit',
      paperSize: 'a4',
      dpi: 300
    };
    const res2x3 = service.calculateGridCells(config2x3);
    expect(res2x3.cells.length).toBe(6);
    expect(res2x3.cells[5].rowIndex).toBe(1);
    expect(res2x3.cells[5].colIndex).toBe(2);
  });

  it('preserves aspect ratios within cell bounds without distortion', () => {
    const cell = {
      x: 100,
      y: 100,
      width: 400,
      height: 600,
      rowIndex: 0,
      colIndex: 0
    };

    // Case 1: Square image into portrait cell (aspect 1:1)
    const fitSquare = service.calculateFitInCell(500, 500, cell, 'fit');
    expect(fitSquare.width).toBe(400); // limited by cell width
    expect(fitSquare.height).toBe(400);
    expect(fitSquare.width / fitSquare.height).toBeCloseTo(1.0);
    // Should be vertically centered: y = 100 + (600 - 400)/2 = 200
    expect(fitSquare.y).toBe(200);

    // Case 2: 4:3 landscape image (800x600) into portrait cell (400x600)
    const fitLandscape = service.calculateFitInCell(800, 600, cell, 'fit');
    expect(fitLandscape.width).toBe(400);
    expect(fitLandscape.height).toBe(300);
    expect(fitLandscape.width / fitLandscape.height).toBeCloseTo(800 / 600);
    // Should be vertically centered: y = 100 + (600 - 300)/2 = 250
    expect(fitLandscape.y).toBe(250);

    // Case 3: 35x45 passport ratio (350x450)
    const fitPassport = service.calculateFitInCell(350, 450, cell, 'fit');
    expect(fitPassport.width / fitPassport.height).toBeCloseTo(350 / 450);
  });

  it('renders sheet canvas with images and cut marks', () => {
    const img1 = createSafeCanvas(100, 100);
    const ctx1 = getSafeContext(img1);
    ctx1.fillStyle = '#ff0000';
    ctx1.fillRect(0, 0, 100, 100);

    const config: SheetGridConfig = {
      rows: 2,
      columns: 2,
      marginMm: 10,
      gutterMm: 5,
      showCutMarks: true,
      fitMode: 'fit',
      paperSize: '4x6',
      dpi: 150
    };

    const canvas = service.renderSheetCanvas([img1], config, true);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBeGreaterThan(500);
    expect(canvas.height).toBeGreaterThan(500);
  });
});
