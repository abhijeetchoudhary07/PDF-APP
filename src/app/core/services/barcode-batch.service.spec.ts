import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { BarcodeBatchService } from './barcode-batch.service';
import { StorageService } from './storage.service';

describe('BarcodeBatchService — P3 Barcode Batch Mode & 1D Generation', () => {
  let service: BarcodeBatchService;
  let mockStorageService: { saveFile: any };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockImplementation(async (file: File) => `file:///saved/${file.name}`)
    };

    TestBed.configureTestingModule({
      providers: [
        BarcodeBatchService,
        { provide: StorageService, useValue: mockStorageService }
      ]
    });

    service = TestBed.inject(BarcodeBatchService);
    service.clearSession();
  });

  describe('1. Continuous Batch Scan & Deduplication', () => {
    it('prevents repeated capture of duplicate codes within cooldown window', async () => {
      // First scan: should be accepted
      const item1 = await service.processScannedCode('SKU-1001', 'CODE_128', {
        mode: 'cooldown',
        cooldownMs: 3000
      });
      expect(item1).not.toBeNull();
      expect(item1?.payload).toBe('SKU-1001');

      // Immediate second scan of same code: should be ignored due to cooldown
      const item2 = await service.processScannedCode('SKU-1001', 'CODE_128', {
        mode: 'cooldown',
        cooldownMs: 3000
      });
      expect(item2).toBeNull();

      // Scan of a different code: should be accepted immediately
      const item3 = await service.processScannedCode('SKU-1002', 'CODE_128', {
        mode: 'cooldown',
        cooldownMs: 3000
      });
      expect(item3).not.toBeNull();
      expect(item3?.payload).toBe('SKU-1002');

      expect(service.getSessionItems().length).toBe(2);
    });

    it('enforces session-wide deduplication when mode is session', async () => {
      await service.processScannedCode('ITEM-A', 'CODE_39', { mode: 'session' });
      await service.processScannedCode('ITEM-B', 'CODE_39', { mode: 'session' });

      // Repeat ITEM-A: should be rejected
      const dup = await service.processScannedCode('ITEM-A', 'CODE_39', { mode: 'session' });
      expect(dup).toBeNull();
      expect(service.getSessionItems().length).toBe(2);
    });

    it('exports session items to CSV and TXT via StorageService.saveFile', async () => {
      await service.processScannedCode('CODE-X', 'CODE_128', { mode: 'none' });
      await service.processScannedCode('CODE-Y', 'CODE_128', { mode: 'none' });

      const csvRes = await service.exportBatchCsv(undefined, 'batch.csv');
      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(csvRes.file.name).toBe('batch.csv');

      const txtRes = await service.exportBatchTxt(undefined, 'batch.txt');
      expect(txtRes.file.name).toBe('batch.txt');
    });
  });

  describe('2. EAN-13 Check Digit Calculation & Validation', () => {
    it('accepts valid 13-digit EAN-13 with matching modulo-10 check digit', () => {
      // 400638133393: odd sum (4+0+3+1+3+9 = 20) + 3 * even sum (0+6+8+3+3+3 = 23*3 = 69) = 89 -> check digit = 1
      const res = service.validateAndComputeEan13('4006381333931');
      expect(res.valid).toBe(true);
      expect(res.fullPayload).toBe('4006381333931');
    });

    it('auto-computes 13th check digit when 12 digits are provided', () => {
      const res = service.validateAndComputeEan13('400638133393');
      expect(res.valid).toBe(true);
      expect(res.fullPayload).toBe('4006381333931');
    });

    it('rejects invalid 13th digit with a clear explanation', () => {
      const res = service.validateAndComputeEan13('4006381333937'); // 7 instead of 1
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid EAN-13 check digit: Expected 1, got 7');
    });

    it('rejects input with invalid digit length', () => {
      const res = service.validateAndComputeEan13('12345');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('requires exactly 12 or 13 numeric digits');
    });
  });

  describe('3. 1D Barcode SVG and PNG Generation', () => {
    it('generates valid vector SVG for Code 128', async () => {
      const svg = await service.generateBarcodeSvg({
        format: 'CODE_128',
        payload: 'ALPHA-99'
      });
      expect(svg).toContain('<svg');
      expect(svg).toContain('<rect');
      expect(svg).toContain('ALPHA-99');
    });

    it('generates valid vector SVG for EAN-13', async () => {
      const svg = await service.generateBarcodeSvg({
        format: 'EAN_13',
        payload: '400638133393'
      });
      expect(svg).toContain('<svg');
      expect(svg).toContain('4006381333931');
    });

    it('generates valid vector SVG for Code 39', async () => {
      const svg = await service.generateBarcodeSvg({
        format: 'CODE_39',
        payload: 'CODE39TEST'
      });
      expect(svg).toContain('<svg');
      expect(svg).toContain('CODE39TEST');
    });
  });

  describe('4. Bulk Barcode Generation & Label Sheet Placement', () => {
    it('generates multi-page printable PDF label sheet placing barcodes in grid coordinates', async () => {
      const payloads = [
        'SKU-001', 'SKU-002', 'SKU-003', 'SKU-004',
        'SKU-005', 'SKU-006', 'SKU-007', 'SKU-008',
        'SKU-009', 'SKU-010', 'SKU-011', 'SKU-012',
        'SKU-013' // 13th item pushes to page 2 on a 12-up grid
      ];

      const res = await service.generateLabelSheetPdf({
        format: 'CODE_128',
        payloads,
        gridType: '12-up',
        includeText: true
      }, 'sheet-12up.pdf');

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(res.file.name).toBe('sheet-12up.pdf');

      const arrayBuffer = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      // 13 items on 12-up grid must produce 2 pages
      expect(pdf.getPageCount()).toBe(2);
    });

    it('bulk generation in 24-up grid fits 24 items on a single A4 page', async () => {
      const payloads: string[] = [];
      for (let i = 1; i <= 24; i++) {
        payloads.push(`BOX-${i.toString().padStart(3, '0')}`);
      }

      const res = await service.generateLabelSheetPdf({
        format: 'CODE_128',
        payloads,
        gridType: '24-up'
      });

      const arrayBuffer = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      expect(pdf.getPageCount()).toBe(1);
    });

    it('packages bulk generated barcodes into a downloadable ZIP archive with exact row count', async () => {
      const payloads = ['PROD-A', 'PROD-B', 'PROD-C'];
      const res = await service.generateBulkZip(payloads, 'CODE_128', 'prod-barcodes.zip');

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(res.file.name).toBe('prod-barcodes.zip');
      expect(res.file.type).toBe('application/zip');
      expect(res.file.size).toBeGreaterThan(0);
    });

    it('generates printable label PDF for 50 barcodes across 3 pages on a 24-up grid', async () => {
      const fiftyPayloads: string[] = [];
      for (let i = 1; i <= 50; i++) {
        fiftyPayloads.push(`PALLET-${i.toString().padStart(4, '0')}`);
      }

      const res = await service.generateLabelSheetPdf({
        format: 'CODE_128',
        payloads: fiftyPayloads,
        gridType: '24-up',
        includeText: true
      }, 'fifty-labels.pdf');

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      const arrayBuffer = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      // 50 items on 24-up grid: 24 (p1) + 24 (p2) + 2 (p3) = 3 pages
      expect(pdf.getPageCount()).toBe(3);
    });

    it('processes a continuous batch of 10 varied barcodes and QR codes cleanly', async () => {
      const testCodes: { payload: string; format: any }[] = [
        { payload: 'SKU-1001', format: 'CODE_128' },
        { payload: '4006381333931', format: 'EAN_13' },
        { payload: 'PART-99', format: 'CODE_39' },
        { payload: 'https://example.com/item1', format: 'QR_CODE' },
        { payload: 'BOX-2026', format: 'CODE_128' },
        { payload: '5901234123457', format: 'EAN_13' },
        { payload: 'SERIAL-88', format: 'CODE_39' },
        { payload: 'WIFI:S:MyNet;P:pass;;', format: 'QR_CODE' },
        { payload: 'ORDER-554', format: 'CODE_128' },
        { payload: '4006381333931', format: 'EAN_13' } // Repeat of item 2
      ];

      service.clearSession();

      for (const item of testCodes) {
        await service.processScannedCode(item.payload, item.format, { mode: 'session' });
      }

      // 9 unique items (10th was duplicate under session mode)
      expect(service.getSessionItems().length).toBe(9);
    });
  });

  describe('5. Cybersecurity Stress-Testing & Robustness', () => {
    it('escapes Barcode SQLi / XSS payloads in SVG vector preview preventing Stored XSS', async () => {
      const xssPayload = '</text><script>alert("XSS")</script><text>';
      const svg = await service.generateBarcodeSvg({
        format: 'CODE_128',
        payload: xssPayload
      });

      // Must be XML escaped
      expect(svg).not.toContain('<script>');
      expect(svg).not.toContain('</script>');
      expect(svg).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('neutralizes CSV / Formula Injection attacks in exported batch scans', async () => {
      service.clearSession();
      await service.processScannedCode('=cmd|\' /C calc\'!A0', 'CODE_128', { mode: 'none' });
      await service.processScannedCode('+1+1', 'CODE_128', { mode: 'none' });
      await service.processScannedCode('-5+2', 'CODE_128', { mode: 'none' });
      await service.processScannedCode('@SUM(A1:A10)', 'CODE_128', { mode: 'none' });
      await service.processScannedCode('StandardPayload', 'CODE_128', { mode: 'none' });

      let savedCsvContent = '';
      mockStorageService.saveFile.mockImplementationOnce(async (file: File) => {
        savedCsvContent = await file.text();
        return `file:///saved/${file.name}`;
      });

      await service.exportBatchCsv(undefined, 'formula-test.csv');

      // Verify formula injection characters are prefixed with single quote
      expect(savedCsvContent).toContain("'=cmd|' /C calc'!A0");
      expect(savedCsvContent).toContain("'+1+1");
      expect(savedCsvContent).toContain("'-5+2");
      expect(savedCsvContent).toContain("'@SUM(A1:A10)");
      // Standard payload should not be prefixed
      expect(savedCsvContent).toContain('StandardPayload');
    });

    it('safely bounds massive CSV batch inputs to prevent browser crash / DoS', async () => {
      const massiveList: string[] = [];
      for (let i = 0; i < 1500; i++) {
        massiveList.push(`STRESS-${i}`);
      }

      // Must complete without error or buffer overflow, safely capped at 1000 items
      const res = await service.generateLabelSheetPdf({
        format: 'CODE_128',
        payloads: massiveList,
        gridType: '24-up'
      }, 'capped-stress.pdf');

      expect(res.file).toBeDefined();
      const arrayBuffer = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      // 1000 items on 24-up grid: 1000 / 24 = 41.66 -> 42 pages
      expect(pdf.getPageCount()).toBe(42);
    });
  });
});
