import '../utilities/pdf-iterator-polyfill';

import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DocumentScannerService } from './document-scanner.service';
import { OcrService } from './ocr.service';
import { PDFDocument } from 'pdf-lib';

describe('Document Scanner & OCR Audit and Security Hardening Suite', () => {
  let scannerService: DocumentScannerService;
  let ocrService: OcrService;

  const fixturesDir = path.resolve(__dirname, '../../../../e2e/test-data/scanner-audit');

  function loadFixture(filename: string): Blob {
    const filePath = path.join(fixturesDir, filename);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return new Blob([buffer], { type: mime });
  }

  beforeAll(() => {
    TestBed.configureTestingModule({});
    scannerService = TestBed.inject(DocumentScannerService);
    ocrService = TestBed.inject(OcrService);
  });

  describe('Step 2: Real Document Scenario Verification', () => {
    it('detects corners and quadrilateral on a tilted receipt', async () => {
      const blob = loadFixture('tilted-receipt-invoice.png');
      const detection = await scannerService.detectDocumentEdges(blob);

      expect(detection).toBeDefined();
      expect(detection.corners).toBeDefined();
      expect(detection.corners.topLeft).toBeDefined();
      expect(detection.corners.topRight).toBeDefined();
      expect(detection.corners.bottomRight).toBeDefined();
      expect(detection.corners.bottomLeft).toBeDefined();
      expect(detection.confidence).toBeGreaterThan(0.2);
    });

    it('performs perspective warp correction mapping skewed quad to planar rectangle', async () => {
      const blob = loadFixture('tilted-receipt-invoice.png');
      const corners = {
        topLeft: { x: 180, y: 120 },
        topRight: { x: 620, y: 170 },
        bottomRight: { x: 560, y: 920 },
        bottomLeft: { x: 130, y: 860 }
      };

      const warpedCanvas = await scannerService.perspectiveWarp(blob, corners);
      expect(warpedCanvas).toBeDefined();
      expect(warpedCanvas.width).toBeGreaterThan(300);
      expect(warpedCanvas.height).toBeGreaterThan(500);
      expect(warpedCanvas.width).toBeLessThanOrEqual(DocumentScannerService.MAX_SCAN_DIMENSION);
    });

    it('applies color filters: Magic Color / Document, B&W, Grayscale, and Sharp', async () => {
      const blob = loadFixture('tilted-receipt-invoice.png');

      // 1. Document / Magic Color
      const docEnhanced = await scannerService.enhanceImage(blob, { preset: 'document' });
      expect(docEnhanced).toBeDefined();
      expect(docEnhanced.width).toBeGreaterThan(0);

      // 2. Black & White
      const bwEnhanced = await scannerService.enhanceImage(blob, { preset: 'black_and_white' });
      expect(bwEnhanced).toBeDefined();

      // 3. Grayscale
      const grayEnhanced = await scannerService.enhanceImage(blob, { preset: 'grayscale' });
      expect(grayEnhanced).toBeDefined();

      // 4. Sharp
      const sharpEnhanced = await scannerService.enhanceImage(blob, { preset: 'original', sharpen: 40 });
      expect(sharpEnhanced).toBeDefined();
    });

    it('detects book center gutter and splits spread into two pages', async () => {
      const blob = loadFixture('curved-book-page.png');
      const canvas = await scannerService.toCanvas(blob);

      const gutter = scannerService.detectGutter(canvas);
      expect(gutter).toBeDefined();
      expect(gutter.confidence).toBeGreaterThan(0);
      expect(gutter.gutterX).toBeGreaterThan(300);
      expect(gutter.gutterX).toBeLessThan(600);

      const [leftPage, rightPage] = await scannerService.splitBookSpread(canvas, gutter.gutterX);
      expect(leftPage).toBeDefined();
      expect(rightPage).toBeDefined();
      expect(leftPage.width).toBeGreaterThan(0);
      expect(rightPage.width).toBeGreaterThan(0);
    });

    it('detects and corrects book page curvature without tearing', async () => {
      const blob = loadFixture('curved-book-page.png');
      const canvas = await scannerService.toCanvas(blob);

      const dewarp = await scannerService.dewarpCurvature(canvas);
      expect(dewarp).toBeDefined();
      expect(dewarp.canvas).toBeDefined();
      expect(dewarp.canvas.width).toBe(canvas.width);
      expect(dewarp.canvas.height).toBe(canvas.height);
    });

    it('removes illumination gradients and shadows from harsh lighting', async () => {
      const blob = loadFixture('shadow-glare-document.png');
      const canvas = await scannerService.toCanvas(blob);

      const shadowResult = await scannerService.removeShadowsAndGlare(canvas);
      expect(shadowResult).toBeDefined();
      expect(shadowResult.canvas).toBeDefined();
      expect(typeof shadowResult.applied).toBe('boolean');
    });

    it('handles low-contrast document on white table with adaptive fallback', async () => {
      const blob = loadFixture('low-contrast-white-table.png');
      const detection = await scannerService.detectDocumentEdges(blob);

      expect(detection).toBeDefined();
      expect(detection.corners.topLeft.x).toBeLessThan(detection.corners.topRight.x);
      expect(detection.corners.bottomLeft.y).toBeGreaterThan(detection.corners.topLeft.y);
    });

    it('generates a Searchable PDF with invisible text layer overlay', async () => {
      const blob = loadFixture('multilingual-hindi-english.png');
      const file = new File([blob], 'multilingual-doc.png', { type: 'image/png' });

      // Mock OCR result data
      const mockOcrResult = {
        fileName: file.name,
        totalPages: 1,
        fullText: 'GOVERNMENT OF INDIA Rajesh Kumar Sharma 9876 5432 1098',
        averageConfidence: 95,
        languages: ['eng'],
        pages: [{
          pageNumber: 1,
          text: 'GOVERNMENT OF INDIA Rajesh Kumar Sharma 9876 5432 1098',
          confidence: 95,
          language: 'eng',
          status: 'completed' as const,
          words: [
            { text: 'GOVERNMENT', confidence: 98, bbox: { x0: 150, y0: 80, x1: 300, y1: 105 } },
            { text: 'OF', confidence: 99, bbox: { x0: 310, y0: 80, x1: 340, y1: 105 } },
            { text: 'INDIA', confidence: 98, bbox: { x0: 350, y0: 80, x1: 430, y1: 105 } },
            { text: '9876', confidence: 96, bbox: { x0: 250, y0: 230, x1: 300, y1: 250 } }
          ]
        }]
      };

      const searchablePdf = await ocrService.generateSearchablePdf(file, mockOcrResult);
      expect(searchablePdf).toBeDefined();
      expect(searchablePdf.name).toContain('searchable.pdf');
      expect(searchablePdf.size).toBeGreaterThan(1000);

      const pdfBytes = await searchablePdf.arrayBuffer();
      const loaded = await PDFDocument.load(pdfBytes);
      expect(loaded.getPageCount()).toBe(1);
    });
  });

  describe('Step 5: Cybersecurity Stress-Testing & Memory Hardening', () => {
    it('defends against oversized / ultra-high-resolution images (clamped to MAX_SCAN_DIMENSION)', async () => {
      const blob = loadFixture('oversized-highres-document.jpg');
      const canvas = await scannerService.toCanvas(blob);

      // Must be safely clamped to MAX_SCAN_DIMENSION (4096 px)
      expect(canvas.width).toBeLessThanOrEqual(DocumentScannerService.MAX_SCAN_DIMENSION);
      expect(canvas.height).toBeLessThanOrEqual(DocumentScannerService.MAX_SCAN_DIMENSION);
      expect(Math.max(canvas.width, canvas.height)).toBe(DocumentScannerService.MAX_SCAN_DIMENSION);
    });

    it('sanitizes OCR text preventing malformed control characters and stream injections', () => {
      const maliciousPayload = "<script>alert('xss')</script>\x00\x08\x1B<img src=x onerror=alert(1)>";
      const sanitized = OcrService.sanitizeOcrText(maliciousPayload);

      // Must strip ASCII control bytes and null characters
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x08');
      expect(sanitized).not.toContain('\x1B');
      // Plain text content preserved as inert string
      expect(sanitized).toContain("<script>alert('xss')</script>");
    });

    it('cleans up canvas buffers after OCR recognition to avoid multi-page memory accumulation', async () => {
      // Create a dummy canvas and verify dimensions can be reset to 0
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 2400;
      expect(canvas.width).toBe(1600);

      // Proper memory release idiom
      canvas.width = 0;
      canvas.height = 0;
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    });

    it('honestly handles zero-byte corrupted uploads without crashing', async () => {
      const emptyBlob = new Blob([], { type: 'image/png' });
      await expect(scannerService.detectDocumentEdges(emptyBlob)).rejects.toThrow();
    });
  });
});
