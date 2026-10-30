import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';

import {
  ScannedTableOcrService,
  sanitizeFormulaInjection,
  sanitizeCellTextForXml,
  MAX_TABLE_ROWS,
  MAX_TABLE_COLS,
  MAX_TOTAL_CELLS
} from './scanned-table-ocr.service';
import { StorageService } from './storage.service';
import { FileService } from './file.service';
import { OcrModelManagerService } from './ocr-model-manager.service';
import { OcrWord } from '../models/ocr.models';

describe('ScannedTableOcrService — O5 Table OCR to Excel', () => {
  let service: ScannedTableOcrService;
  let mockStorageService: { saveFile: any };
  let mockFileService: { downloadFile: any };
  let mockModelManager: { getWorkerOptions: any };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///documents/table.xlsx')
    };

    mockFileService = {
      downloadFile: vi.fn()
    };

    mockModelManager = {
      getWorkerOptions: vi.fn().mockResolvedValue({})
    };

    TestBed.configureTestingModule({
      providers: [
        ScannedTableOcrService,
        { provide: StorageService, useValue: mockStorageService },
        { provide: FileService, useValue: mockFileService },
        { provide: OcrModelManagerService, useValue: mockModelManager }
      ]
    });

    service = TestBed.inject(ScannedTableOcrService);
  });

  describe('1. Ruled Table Layout Detection', () => {
    it('detects correct row and column counts on ruled-table fixture with grid lines', () => {
      // Create a 400x300 canvas with a 3x3 ruled grid (4 horizontal lines, 4 vertical lines)
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;

      // Background white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 400, 300);

      // Draw horizontal lines at y = 30, 100, 180, 260
      ctx.fillStyle = '#000000';
      const hLines = [30, 100, 180, 260];
      for (const y of hLines) {
        ctx.fillRect(20, y, 360, 3); // 360px wide (90% width)
      }

      // Draw vertical lines at x = 20, 130, 250, 380
      const vLines = [20, 130, 250, 380];
      for (const x of vLines) {
        ctx.fillRect(x, 30, 3, 230); // 230px tall (76% height)
      }

      const structure = service.detectTableStructure(canvas);

      expect(structure.method).toBe('ruled');
      expect(structure.rowCount).toBe(3); // 4 dividers -> 3 rows
      expect(structure.colCount).toBe(3); // 4 dividers -> 3 columns
      expect(structure.cellBboxes.length).toBe(9);

      // Verify corner cell coordinates
      const firstCell = structure.cellBboxes[0];
      expect(firstCell.row).toBe(0);
      expect(firstCell.col).toBe(0);
      expect(firstCell.x).toBeGreaterThanOrEqual(15);
      expect(firstCell.y).toBeGreaterThanOrEqual(25);
    });
  });

  describe('2. Borderless Table Layout Detection', () => {
    it('detects correct row and column counts on whitespace-only table fixture', () => {
      // 3 rows, 2 columns separated only by whitespace gutters
      const words: any[] = [
        // Row 0: Header
        { text: 'Item', confidence: 95, bbox: { x0: 20, y0: 30, x1: 60, y1: 50, width: 40, height: 20 } },
        { text: 'Price', confidence: 94, bbox: { x0: 200, y0: 30, x1: 250, y1: 50, width: 50, height: 20 } },
        // Row 1: First item
        { text: 'Apples', confidence: 92, bbox: { x0: 20, y0: 80, x1: 70, y1: 100, width: 50, height: 20 } },
        { text: '$2.50', confidence: 90, bbox: { x0: 200, y0: 80, x1: 245, y1: 100, width: 45, height: 20 } },
        // Row 2: Second item
        { text: 'Oranges', confidence: 93, bbox: { x0: 20, y0: 130, x1: 80, y1: 150, width: 60, height: 20 } },
        { text: '$3.75', confidence: 91, bbox: { x0: 200, y0: 130, x1: 245, y1: 150, width: 45, height: 20 } }
      ];

      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 200;

      const structure = service.detectTableStructure(canvas, undefined, words);

      expect(structure.method).toBe('borderless');
      expect(structure.rowCount).toBe(3);
      expect(structure.colCount).toBe(2);
      expect(structure.cellBboxes.length).toBe(6);
    });
  });

  describe('3. Cell Text Placement & 2D Coordinate Mapping', () => {
    it('lands cell text and data types into the right 2D coordinate cell', () => {
      // Fixed 2x2 structure
      const structure = {
        rowCount: 2,
        colCount: 2,
        method: 'ruled' as const,
        cells: [] as any,
        cellBboxes: [
          { row: 0, col: 0, x: 10, y: 10, width: 90, height: 40 },
          { row: 0, col: 1, x: 110, y: 10, width: 90, height: 40 },
          { row: 1, col: 0, x: 10, y: 60, width: 90, height: 40 },
          { row: 1, col: 1, x: 110, y: 60, width: 90, height: 40 }
        ],
        rowBoundaries: [10, 50, 100],
        colBoundaries: [10, 100, 200]
      };

      const words: OcrWord[] = [
        { text: 'Invoice#', confidence: 95, bbox: { x0: 15, y0: 15, x1: 80, y1: 35, width: 65, height: 20 } },
        { text: 'Date', confidence: 92, bbox: { x0: 120, y0: 15, x1: 160, y1: 35, width: 40, height: 20 } },
        { text: 'INV-109', confidence: 88, bbox: { x0: 15, y0: 65, x1: 75, y1: 85, width: 60, height: 20 } },
        { text: '2026-10-29', confidence: 96, bbox: { x0: 115, y0: 65, x1: 185, y1: 85, width: 70, height: 20 } }
      ];

      const result = service.populateTableMatrix(structure, words, 'bill.pdf', 1);

      expect(result.matrix[0][0]).toBe('Invoice#');
      expect(result.matrix[0][1]).toBe('Date');
      expect(result.matrix[1][0]).toBe('INV-109');
      expect(result.matrix[1][1]).toBe('2026-10-29');

      expect(result.cells[0][0].type).toBe('text');
      expect(result.cells[1][1].type).toBe('date');
      expect(result.confidence).toBeGreaterThan(90);
    });

    it('infers data types correctly (currency, number, date, text)', () => {
      expect(service.inferCellDataType('₹1,500.50')).toBe('currency');
      expect(service.inferCellDataType('$45.99')).toBe('currency');
      expect(service.inferCellDataType('420.75')).toBe('number');
      expect(service.inferCellDataType('15%')).toBe('number');
      expect(service.inferCellDataType('15/08/1947')).toBe('date');
      expect(service.inferCellDataType('Jan 26, 1950')).toBe('date');
      expect(service.inferCellDataType('Product Name')).toBe('text');
      expect(service.inferCellDataType('012345')).toBe('text'); // leading 0 code
    });
  });

  describe('4. Excel (.xlsx) & CSV Export Verification', () => {
    it('generates Excel file with xlsx library that opens with correct sheet structure and cell values', async () => {
      const matrix = [
        ['Product', 'Qty', 'Unit Price', 'Total'],
        ['Ballpoint Pen', '10', '₹5.00', '₹50.00'],
        ['Notebook A5', '2', '₹60.00', '₹120.00']
      ];

      const excelFile = service.generateExcelFile(matrix, 'order_summary.xlsx');

      expect(excelFile).toBeDefined();
      expect(excelFile.name).toBe('order_summary.xlsx');
      expect(excelFile.size).toBeGreaterThan(100);

      // Verify file can be read back by XLSX parser
      const arrayBuffer = await excelFile.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });

      expect(wb.SheetNames).toContain('Scanned Table');
      const ws = wb.Sheets['Scanned Table'];
      const parsedRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

      expect(parsedRows.length).toBe(3);
      expect(parsedRows[0][0]).toBe('Product');
      expect(parsedRows[0][3]).toBe('Total');
      expect(parsedRows[1][0]).toBe('Ballpoint Pen');
      expect(parsedRows[1][1]).toBe(10); // Formatted as numeric
      expect(parsedRows[2][1]).toBe(2);
    });

    it('generates RFC 4180 compliant CSV file escaping quotes and commas', async () => {
      const matrix = [
        ['Company, Inc.', 'Description', 'Notes'],
        ['ABC Corp', 'Line 1\nLine 2', 'Say "Hello"']
      ];

      const csvFile = service.generateCsvFile(matrix, 'export.csv');
      expect(csvFile.name).toBe('export.csv');

      const text = await csvFile.text();
      expect(text).toContain('"Company, Inc."');
      expect(text).toContain('"Say ""Hello"""');
      expect(text).toContain('"Line 1\nLine 2"');
    });
  });

  describe('5. Quota Enforcement', () => {
    it('enforces quota through StorageService.saveFile before completing export', async () => {
      const matrix = [['A', 'B'], ['1', '2']];

      // Success scenario
      mockStorageService.saveFile.mockResolvedValue('file:///saved/table.xlsx');
      const successRes = await service.exportToExcelWithQuota(matrix, 'table.xlsx');

      expect(mockStorageService.saveFile).toHaveBeenCalledTimes(1);
      expect(successRes.quotaEnforced).toBe(true);
      expect(successRes.savedUri).toBe('file:///saved/table.xlsx');
      expect(mockFileService.downloadFile).toHaveBeenCalled();

      // Quota exhausted scenario: saveFile returns undefined
      mockStorageService.saveFile.mockResolvedValue(undefined);
      const quotaBlockedRes = await service.exportToExcelWithQuota(matrix, 'table.xlsx');

      expect(quotaBlockedRes.savedUri).toBeUndefined();
      expect(quotaBlockedRes.quotaEnforced).toBe(true);
    });

    it('enforces quota on CSV export through StorageService.saveFile', async () => {
      const matrix = [['Header1'], ['Value1']];
      mockStorageService.saveFile.mockResolvedValue(undefined);

      const res = await service.exportToCsvWithQuota(matrix, 'table.csv');
      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(res.savedUri).toBeUndefined();
    });
  });

  describe('6. Real Test Data Fixtures', () => {
    it('processes printed receipt table correctly with items, quantities, and totals', () => {
      const receiptWords = [
        { text: 'QTY', confidence: 95, bbox: { x0: 20, y0: 10, x1: 50, y1: 25, width: 30, height: 15 } },
        { text: 'ITEM', confidence: 94, bbox: { x0: 80, y0: 10, x1: 140, y1: 25, width: 60, height: 15 } },
        { text: 'TOTAL', confidence: 96, bbox: { x0: 220, y0: 10, x1: 270, y1: 25, width: 50, height: 15 } },
        { text: '2', confidence: 92, bbox: { x0: 20, y0: 40, x1: 35, y1: 55, width: 15, height: 15 } },
        { text: 'Espresso', confidence: 91, bbox: { x0: 80, y0: 40, x1: 150, y1: 55, width: 70, height: 15 } },
        { text: '$6.00', confidence: 90, bbox: { x0: 220, y0: 40, x1: 265, y1: 55, width: 45, height: 15 } },
        { text: '1', confidence: 94, bbox: { x0: 20, y0: 70, x1: 35, y1: 85, width: 15, height: 15 } },
        { text: 'Croissant', confidence: 89, bbox: { x0: 80, y0: 70, x1: 155, y1: 85, width: 75, height: 15 } },
        { text: '$3.50', confidence: 93, bbox: { x0: 220, y0: 70, x1: 265, y1: 85, width: 45, height: 15 } }
      ];

      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 120;

      const structure = service.detectTableStructure(canvas, undefined, receiptWords);
      const result = service.populateTableMatrix(structure, receiptWords, 'receipt.jpg', 1);

      expect(result.rowCount).toBe(3);
      expect(result.colCount).toBe(3);
      expect(result.matrix[0]).toEqual(['QTY', 'ITEM', 'TOTAL']);
      expect(result.matrix[1][1]).toBe('Espresso');
      expect(result.matrix[1][2]).toBe('$6.00');
      expect(result.cells[1][2].type).toBe('currency');
      expect(result.cells[1][0].type).toBe('number');
    });

    it('processes bank statement table with ruled borders and transaction columns', () => {
      const statementStructure = {
        rowCount: 3,
        colCount: 4,
        method: 'ruled' as const,
        cells: [] as any,
        cellBboxes: [
          { row: 0, col: 0, x: 10, y: 10, width: 70, height: 30 },
          { row: 0, col: 1, x: 90, y: 10, width: 130, height: 30 },
          { row: 0, col: 2, x: 230, y: 10, width: 80, height: 30 },
          { row: 0, col: 3, x: 320, y: 10, width: 80, height: 30 },
          { row: 1, col: 0, x: 10, y: 50, width: 70, height: 30 },
          { row: 1, col: 1, x: 90, y: 50, width: 130, height: 30 },
          { row: 1, col: 2, x: 230, y: 50, width: 80, height: 30 },
          { row: 1, col: 3, x: 320, y: 50, width: 80, height: 30 },
          { row: 2, col: 0, x: 10, y: 90, width: 70, height: 30 },
          { row: 2, col: 1, x: 90, y: 90, width: 130, height: 30 },
          { row: 2, col: 2, x: 230, y: 90, width: 80, height: 30 },
          { row: 2, col: 3, x: 320, y: 90, width: 80, height: 30 }
        ],
        rowBoundaries: [10, 45, 85, 125],
        colBoundaries: [10, 85, 225, 315, 405]
      };

      const statementWords = [
        { text: 'Date', confidence: 95, bbox: { x0: 15, y0: 15, x1: 55, y1: 30 } },
        { text: 'Description', confidence: 93, bbox: { x0: 95, y0: 15, x1: 185, y1: 30 } },
        { text: 'Debit', confidence: 92, bbox: { x0: 235, y0: 15, x1: 275, y1: 30 } },
        { text: 'Balance', confidence: 94, bbox: { x0: 325, y0: 15, x1: 385, y1: 30 } },
        { text: '2026-10-01', confidence: 96, bbox: { x0: 15, y0: 55, x1: 75, y1: 70 } },
        { text: 'Direct Deposit', confidence: 90, bbox: { x0: 95, y0: 55, x1: 195, y1: 70 } },
        { text: '₹0.00', confidence: 94, bbox: { x0: 235, y0: 55, x1: 280, y1: 70 } },
        { text: '₹52,000.00', confidence: 95, bbox: { x0: 325, y0: 55, x1: 395, y1: 70 } },
        { text: '2026-10-03', confidence: 95, bbox: { x0: 15, y0: 95, x1: 75, y1: 110 } },
        { text: 'Electric Bill', confidence: 91, bbox: { x0: 95, y0: 95, x1: 175, y1: 110 } },
        { text: '₹2,450.00', confidence: 93, bbox: { x0: 235, y0: 95, x1: 295, y1: 110 } },
        { text: '₹49,550.00', confidence: 92, bbox: { x0: 325, y0: 95, x1: 395, y1: 110 } }
      ];

      const result = service.populateTableMatrix(statementStructure, statementWords, 'statement.pdf', 1);

      expect(result.matrix[1][0]).toBe('2026-10-01');
      expect(result.cells[1][0].type).toBe('date');
      expect(result.matrix[1][3]).toBe('₹52,000.00');
      expect(result.cells[1][3].type).toBe('currency');
      expect(result.matrix[2][2]).toBe('₹2,450.00');
    });

    it('processes borderless financial balance sheet with whitespace gutters', () => {
      const balanceSheetWords = [
        { text: 'Assets', confidence: 96, bbox: { x0: 20, y0: 20, x1: 70, y1: 35 } },
        { text: '2025', confidence: 95, bbox: { x0: 150, y0: 20, x1: 185, y1: 35 } },
        { text: '2026', confidence: 95, bbox: { x0: 250, y0: 20, x1: 285, y1: 35 } },
        { text: 'Cash', confidence: 94, bbox: { x0: 20, y0: 60, x1: 55, y1: 75 } },
        { text: '12,500', confidence: 92, bbox: { x0: 150, y0: 60, x1: 195, y1: 75 } },
        { text: '18,400', confidence: 93, bbox: { x0: 250, y0: 60, x1: 295, y1: 75 } }
      ];

      const canvas = document.createElement('canvas');
      canvas.width = 350;
      canvas.height = 100;

      const structure = service.detectTableStructure(canvas, undefined, balanceSheetWords);
      const result = service.populateTableMatrix(structure, balanceSheetWords, 'balance_sheet.pdf', 1);

      expect(structure.method).toBe('borderless');
      expect(result.matrix[0][0]).toBe('Assets');
      expect(result.matrix[1][1]).toBe('12,500');
      expect(result.cells[1][1].type).toBe('number');
    });
  });

  describe('7. Cybersecurity Stress-Testing', () => {
    it('neutralizes formula injection payloads (=cmd, @SUM, +DDE, -calc) in CSV and Excel generation', async () => {
      const maliciousMatrix = [
        ['Formula Type', 'Payload'],
        ['Command Injection', "=cmd|' /C calc'!A0"],
        ['Formula Sum', '@SUM(1+1)*cmd|calc'],
        ['Plus Payload', "+12345+cmd|' /C calc'!A0"],
        ['Negative Payload', "-2+3+cmd|' /C calc'!A0"],
        ['Tab Prepend', "\t=1+1"]
      ];

      // 1. Test CSV export immunity
      const csvFile = service.generateCsvFile(maliciousMatrix, 'safe.csv');
      const csvText = await csvFile.text();

      // Ensure every dangerous payload has a single quote prepended
      expect(csvText).toContain("'=cmd|' /C calc'!A0");
      expect(csvText).toContain("'@SUM(1+1)*cmd|calc");
      expect(csvText).toContain("'+12345+cmd|' /C calc'!A0");
      expect(csvText).toContain("'-2+3+cmd|' /C calc'!A0");
      expect(csvText).toContain("'=1+1");

      // 2. Test Excel (.xlsx) immunity
      const xlsxFile = service.generateExcelFile(maliciousMatrix, 'safe.xlsx');
      const buf = await xlsxFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Scanned Table'];
      const parsedRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

      expect(parsedRows[1][1]).toBe("'=cmd|' /C calc'!A0");
      expect(parsedRows[2][1]).toBe("'@SUM(1+1)*cmd|calc");
    });

    it('preserves legitimate numbers without escaping', () => {
      expect(sanitizeFormulaInjection('-42')).toBe('-42');
      expect(sanitizeFormulaInjection('+100')).toBe('+100');
      expect(sanitizeFormulaInjection('-1,250.75')).toBe('-1,250.75');
      expect(sanitizeFormulaInjection('50%')).toBe('50%');
      expect(sanitizeFormulaInjection('Simple Text')).toBe('Simple Text');
    });

    it('strips illegal XML 1.0 control characters that corrupt Excel OpenXML packages', () => {
      const dirtyText = 'Item\u0000Name\u0008With\u001FCorrupt\u000BBytes';
      const cleanText = sanitizeCellTextForXml(dirtyText);

      expect(cleanText).toBe('ItemNameWithCorruptBytes');
      expect(cleanText).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    });

    it('clamps excessive rows and columns preventing table dimension bomb memory exhaustion', () => {
      // Simulate an adversarial table structure with 2,000 rows and 500 columns
      const hugeStructure = {
        rowCount: 2000,
        colCount: 500,
        method: 'ruled' as const,
        cells: [],
        cellBboxes: [],
        rowBoundaries: Array.from({ length: 2001 }, (_, i) => i * 10),
        colBoundaries: Array.from({ length: 501 }, (_, i) => i * 10)
      };

      const result = service.populateTableMatrix(hugeStructure, [], 'bomb.pdf', 1);

      expect(result.rowCount).toBeLessThanOrEqual(MAX_TABLE_ROWS);
      expect(result.colCount).toBeLessThanOrEqual(MAX_TABLE_COLS);
      expect(result.rowCount * result.colCount).toBeLessThanOrEqual(MAX_TOTAL_CELLS);
    });

    it('handles zero-dimension or out-of-bounds canvas coordinates safely without throwing', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;

      // Negative coordinates and zero dimensions
      expect(() => {
        service.detectTableStructure(canvas, { x: -50, y: -50, width: 0, height: 0 });
      }).not.toThrow();

      // Excess coordinates
      expect(() => {
        service.detectTableStructure(canvas, { x: 500, y: 500, width: 200, height: 200 });
      }).not.toThrow();

      // Corner crop with negative coordinates
      expect(() => {
        service.cropRegionFromCorners(canvas, {
          topLeft: { x: -10, y: -10 },
          topRight: { x: 200, y: -10 },
          bottomRight: { x: 200, y: 200 },
          bottomLeft: { x: -10, y: 200 }
        });
      }).not.toThrow();
    });
  });
});
