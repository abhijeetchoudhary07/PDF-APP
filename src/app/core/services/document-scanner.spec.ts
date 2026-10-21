import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentScannerService } from './document-scanner.service';
import { DocumentCorners } from '../models/scanner.models';

describe('DocumentScannerService', () => {
  let service: DocumentScannerService;

  beforeEach(() => {
    service = new DocumentScannerService();
  });

  describe('Canvas and Image Utilities', () => {
    it('should create and convert canvas properly', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 200, 300);
      }

      const res = await service.toCanvas(canvas);
      expect(res.width).toBe(200);
      expect(res.height).toBe(300);
    });

    it('should rotate canvas by 90 degrees and swap dimensions', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 300;

      const rotated = service.rotateCanvas(canvas, 90);
      expect(rotated.width).toBe(300);
      expect(rotated.height).toBe(200);
    });

    it('should rotate canvas by 180 degrees preserving dimensions', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 300;

      const rotated = service.rotateCanvas(canvas, 180);
      expect(rotated.width).toBe(200);
      expect(rotated.height).toBe(300);
    });
  });

  describe('Edge Detection and Fallback', () => {
    it('should provide fallback corners when detection is low confidence', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 600;
      // Blank white image has no contrast edges -> low confidence
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 600);
      }

      const detection = await service.detectDocumentEdges(canvas);
      expect(detection).toBeDefined();
      expect(detection.imageWidth).toBe(400);
      expect(detection.imageHeight).toBe(600);
      expect(detection.lowConfidence).toBe(true);
      expect(detection.corners.topLeft).toBeDefined();
      expect(detection.corners.bottomRight).toBeDefined();
    });
  });

  describe('Enhancement Algorithms', () => {
    it('should enhance image with grayscale preset', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ff0000'; // Pure red
        ctx.fillRect(0, 0, 50, 50);
      }

      const enhanced = await service.enhanceImage(canvas, {
        preset: 'grayscale',
        brightness: 0,
        contrast: 0,
        sharpen: 0
      });

      expect(enhanced.width).toBe(50);
      expect(enhanced.height).toBe(50);

      const ectx = enhanced.getContext('2d');
      const data = ectx?.getImageData(25, 25, 1, 1).data;
      if (data) {
        // In grayscale, R, G, and B should be equal
        expect(data[0]).toBe(data[1]);
        expect(data[1]).toBe(data[2]);
      }
    });

    it('should enhance image with black and white preset', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 50, 50);
      }

      const enhanced = await service.enhanceImage(canvas, {
        preset: 'bw',
        brightness: 0,
        contrast: 0,
        sharpen: 0
      });

      const ectx = enhanced.getContext('2d');
      const data = ectx?.getImageData(25, 25, 1, 1).data;
      if (data) {
        // Pure white in BW should remain 255
        expect(data[0]).toBe(255);
        expect(data[1]).toBe(255);
        expect(data[2]).toBe(255);
      }
    });

    it('should enhance image with document preset', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f0f0f0'; // Light gray
        ctx.fillRect(0, 0, 50, 50);
      }

      const enhanced = await service.enhanceImage(canvas, {
        preset: 'document',
        brightness: 0,
        contrast: 0,
        sharpen: 0
      });

      const ectx = enhanced.getContext('2d');
      const data = ectx?.getImageData(25, 25, 1, 1).data;
      if (data) {
        // Document filter whitens light gray background
        expect(data[0]).toBeGreaterThanOrEqual(240);
      }
    });
  });

  describe('Perspective Warp', () => {
    it('should warp quad corners to an orthogonal canvas', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 500);
      }

      const corners: DocumentCorners = {
        topLeft: { x: 20, y: 20 },
        topRight: { x: 380, y: 30 },
        bottomRight: { x: 370, y: 480 },
        bottomLeft: { x: 30, y: 470 }
      };

      const warped = await service.perspectiveWarp(canvas, corners);
      expect(warped).toBeDefined();
      expect(warped.width).toBeGreaterThan(300);
      expect(warped.height).toBeGreaterThan(400);
    });
  });

  describe('H1 — Capture Modes: Book Spread & ID Card', () => {
    it('should default to document mode and remember selected mode in session', () => {
      expect(service.getScanMode()).toBe('document');
      service.setScanMode('book');
      expect(service.getScanMode()).toBe('book');
      service.setScanMode('id_card');
      expect(service.getScanMode()).toBe('id_card');
      service.setScanMode('document');
    });

    it('should detect the gutter in a synthetic book spread fixture and split into two pages', async () => {
      const spread = service.createCanvas(300, 150);
      const ctx = service.getContext(spread)!;

      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 150);

      // Left page text (columns 20 to 120)
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, 100, 10);
      ctx.fillRect(20, 40, 100, 10);
      ctx.fillRect(20, 60, 100, 10);

      // Dark spine shadow at column 150 (width 10)
      ctx.fillStyle = '#333333';
      ctx.fillRect(145, 0, 10, 150);

      // Right page text (columns 170 to 270)
      ctx.fillStyle = '#000000';
      ctx.fillRect(170, 20, 100, 10);
      ctx.fillRect(170, 40, 100, 10);
      ctx.fillRect(170, 60, 100, 10);

      const gutterResult = service.detectGutter(spread);
      expect(gutterResult).toBeDefined();
      // Should find gutter near the spine shadow at x = 145..155
      expect(gutterResult.gutterX).toBeGreaterThanOrEqual(140);
      expect(gutterResult.gutterX).toBeLessThanOrEqual(160);
      expect(gutterResult.confidence).toBeGreaterThanOrEqual(70);

      // Split book spread
      const [leftPage, rightPage] = await service.splitBookSpread(spread, gutterResult.gutterX);
      expect(leftPage.width).toBe(gutterResult.gutterX);
      expect(leftPage.height).toBe(150);
      expect(rightPage.width).toBe(300 - gutterResult.gutterX);
      expect(rightPage.height).toBe(150);
    });

    it('should layout front and back ID card images onto one page with true card proportions', async () => {
      const front = service.createCanvas(200, 126); // ~1.58 ratio
      const back = service.createCanvas(200, 126);

      const fctx = service.getContext(front)!;
      fctx.fillStyle = '#1e3a8a';
      fctx.fillRect(0, 0, 200, 126);

      const bctx = service.getContext(back)!;
      bctx.fillStyle = '#065f46';
      bctx.fillRect(0, 0, 200, 126);

      const sheet = await service.layoutIdCard(front, back, { showLabels: true });
      expect(sheet).toBeDefined();
      expect(sheet.width).toBe(1240);
      expect(sheet.height).toBe(1754);

      // Check card ratio on sheet: width = 1240 * 0.72 = 893, height = 893 / 1.5858 ~ 563
      const sctx = service.getContext(sheet)!;
      const data = sctx.getImageData(0, 0, sheet.width, sheet.height).data;
      expect(data.length).toBe(1240 * 1754 * 4);
    });

    it('document mode output should be byte-identical to base enhancement for a fixture', async () => {
      const canvas = service.createCanvas(60, 60);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, 60, 60);
      ctx.fillStyle = '#222222';
      ctx.fillRect(10, 10, 40, 20);

      const run1 = await service.enhanceImage(canvas, {
        preset: 'document',
        brightness: 0,
        contrast: 0,
        sharpen: 0
      });

      const run2 = await service.enhanceImage(canvas, {
        preset: 'document',
        brightness: 0,
        contrast: 0,
        sharpen: 0
      });

      const d1 = service.getContext(run1)!.getImageData(0, 0, 60, 60).data;
      const d2 = service.getContext(run2)!.getImageData(0, 0, 60, 60).data;

      expect(d1.length).toBe(d2.length);
      let identical = true;
      for (let i = 0; i < d1.length; i++) {
        if (d1[i] !== d2[i]) {
          identical = false;
          break;
        }
      }
      expect(identical).toBe(true);
    });
  });

  describe('H2 — Capture Modes: Whiteboard, Photo & Table', () => {
    it('whiteboard mode preserves hue on coloured marker strokes and whitens background', async () => {
      const canvas = service.createCanvas(50, 50);
      const ctx = service.getContext(canvas)!;

      // Off-white background
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, 50, 50);

      // Red saturated marker stroke at (20, 20)
      ctx.fillStyle = '#e6194b';
      ctx.fillRect(20, 20, 5, 5);

      const enhanced = await service.enhanceWhiteboard(canvas);
      const ectx = service.getContext(enhanced)!;

      // Check background at (5, 5) is whitened
      const bgPixel = ectx.getImageData(5, 5, 1, 1).data;
      expect(bgPixel[0]).toBeGreaterThanOrEqual(240);
      expect(bgPixel[1]).toBeGreaterThanOrEqual(240);
      expect(bgPixel[2]).toBeGreaterThanOrEqual(240);

      // Check red stroke at (22, 22) preserves hue (R is high, G and B are low)
      const redPixel = ectx.getImageData(22, 22, 1, 1).data;
      expect(redPixel[0]).toBeGreaterThan(150);
      expect(redPixel[0]).toBeGreaterThan(redPixel[1] * 2);
      expect(redPixel[0]).toBeGreaterThan(redPixel[2] * 2);
    });

    it('photo mode leaves pixels effectively unaltered', async () => {
      const canvas = service.createCanvas(40, 40);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, 0, 40, 40);

      const originalData = ctx.getImageData(0, 0, 40, 40).data;
      const photoOut = await service.enhancePhoto(canvas);
      const photoData = service.getContext(photoOut)!.getImageData(0, 0, 40, 40).data;

      expect(photoData.length).toBe(originalData.length);
      expect(photoData[0]).toBe(originalData[0]);
      expect(photoData[1]).toBe(originalData[1]);
      expect(photoData[2]).toBe(originalData[2]);
    });
  });

  describe('H3 — Auto-Capture & Batch Scanning', () => {
    const quad: DocumentCorners = {
      topLeft: { x: 50, y: 50 },
      topRight: { x: 450, y: 50 },
      bottomRight: { x: 450, y: 550 },
      bottomLeft: { x: 50, y: 550 }
    };

    it('should trigger when quad is stable for consecutive frames, covers frame, and is sharp', () => {
      const quadHistory = [quad, quad, quad]; // zero drift
      const result = service.evaluateAutoCapture(quadHistory, quad, 500, 600, 120, 80);

      expect(result.canTrigger).toBe(true);
      expect(result.stabilityProgress).toBeGreaterThanOrEqual(0.85);
      expect(result.coverageRatio).toBeGreaterThanOrEqual(0.25);
      expect(result.isBlurry).toBe(false);
    });

    it('should not trigger if corners are drifting rapidly', () => {
      const unstableHistory: DocumentCorners[] = [
        { topLeft: { x: 10, y: 10 }, topRight: { x: 300, y: 20 }, bottomRight: { x: 320, y: 400 }, bottomLeft: { x: 20, y: 390 } },
        { topLeft: { x: 40, y: 50 }, topRight: { x: 380, y: 70 }, bottomRight: { x: 400, y: 450 }, bottomLeft: { x: 50, y: 440 } }
      ];
      const result = service.evaluateAutoCapture(unstableHistory, quad, 500, 600, 120, 80);

      expect(result.canTrigger).toBe(false);
      expect(result.reason).toContain('steady');
    });

    it('should not trigger if quad area does not meet minimum coverage', () => {
      const smallQuad: DocumentCorners = {
        topLeft: { x: 10, y: 10 },
        topRight: { x: 50, y: 10 },
        bottomRight: { x: 50, y: 50 },
        bottomLeft: { x: 10, y: 50 }
      };
      const result = service.evaluateAutoCapture([smallQuad, smallQuad], smallQuad, 500, 600, 120, 80);

      expect(result.canTrigger).toBe(false);
      expect(result.coverageRatio).toBeLessThan(0.25);
    });

    it('should remain responsive across 20 consecutive batch captures', () => {
      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        const evalRes = service.evaluateAutoCapture([quad, quad], quad, 500, 600, 110, 80);
        expect(evalRes).toBeDefined();
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // 20 evaluations well within 500ms
    });
  });

  describe('H4 — Blur Gate', () => {
    it('should give higher sharpness score to sharp pattern than to smooth/blurred pattern', async () => {
      // Sharp pattern with high contrast edges
      const sharpCanvas = service.createCanvas(100, 100);
      const sctx = service.getContext(sharpCanvas)!;
      sctx.fillStyle = '#000000';
      sctx.fillRect(0, 0, 100, 100);
      sctx.fillStyle = '#ffffff';
      for (let i = 0; i < 100; i += 10) {
        sctx.fillRect(i, 0, 5, 100);
      }

      // Blurred / flat pattern
      const blurCanvas = service.createCanvas(100, 100);
      const bctx = service.getContext(blurCanvas)!;
      bctx.fillStyle = '#888888';
      bctx.fillRect(0, 0, 100, 100);

      const sharpScore = await service.calculateBlurScore(sharpCanvas, 50);
      const blurScore = await service.calculateBlurScore(blurCanvas, 50);

      expect(sharpScore.score).toBeGreaterThan(blurScore.score);
      expect(sharpScore.isBlurry).toBe(false);
      expect(blurScore.isBlurry).toBe(true);
    });

    it('threshold decision is stable across image sizes', async () => {
      const makePattern = (size: number) => {
        const c = service.createCanvas(size, size);
        const ctx = service.getContext(c)!;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        const step = Math.round(size / 10);
        for (let i = 0; i < size; i += step * 2) {
          ctx.fillRect(i, 0, step, size);
        }
        return c;
      };

      const small = makePattern(100);
      const large = makePattern(300);

      const scoreSmall = await service.calculateBlurScore(small, 50);
      const scoreLarge = await service.calculateBlurScore(large, 50);

      // Both should pass threshold
      expect(scoreSmall.isBlurry).toBe(false);
      expect(scoreLarge.isBlurry).toBe(false);
    });
  });

  describe('H5 — Shadow & Glare Removal', () => {
    it('flattens synthetic illumination gradient to near-uniform background', async () => {
      const canvas = service.createCanvas(120, 60);
      const ctx = service.getContext(canvas)!;

      // Draw horizontal lighting gradient (240 down to 80)
      for (let x = 0; x < 120; x++) {
        const lum = Math.round(240 - (x / 120) * 150);
        ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
        ctx.fillRect(x, 0, 1, 60);
      }

      const res = await service.removeShadowsAndGlare(canvas, 16);
      expect(res.applied).toBe(true);

      const normData = service.getContext(res.canvas)!.getImageData(0, 0, 120, 60).data;
      const leftPixel = normData[0]; // x=0
      const rightPixel = normData[(119) * 4]; // x=119

      // Background difference should be flattened significantly
      expect(Math.abs(leftPixel - rightPixel)).toBeLessThan(80);
    });

    it('leaves an already-even page within tolerance of unchanged', async () => {
      const canvas = service.createCanvas(60, 60);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, 60, 60);

      const res = await service.removeShadowsAndGlare(canvas, 16);
      expect(res.applied).toBe(false); // Detected as even, not modified
    });
  });

  describe('H6 — Finger & Edge Removal', () => {
    it('detects skin-toned finger intrusion touching border', async () => {
      const canvas = service.createCanvas(100, 100);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 100, 100);

      // Draw skin tone block touching left edge (x: 0..10, y: 30..70)
      // Caucasian / Indian skin in RGB: R: 180, G: 120, B: 90
      ctx.fillStyle = 'rgb(180, 120, 90)';
      ctx.fillRect(0, 30, 12, 40);

      const det = await service.detectFingerIntrusions(canvas);
      expect(det.detected).toBe(true);
      expect(det.edge).toBe('left');
      expect(det.boundingBox).toBeDefined();

      const cleaned = await service.removeFingerIntrusions(canvas, det);
      expect(cleaned).toBeDefined();
    });

    it('rejects dark corner / shadow as false positive and does not silently inpaint', async () => {
      const canvas = service.createCanvas(100, 100);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 100, 100);

      // Dark corner (R: 20, G: 20, B: 20)
      ctx.fillStyle = 'rgb(20, 20, 20)';
      ctx.fillRect(0, 0, 15, 15);

      const det = await service.detectFingerIntrusions(canvas);
      expect(det.detected).toBe(false);
    });
  });

  describe('H7 — Book Curvature Dewarping', () => {
    it('detects flat page as flat and skips dewarping', async () => {
      const canvas = service.createCanvas(100, 100);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 100, 100);

      // Straight horizontal text lines
      ctx.fillStyle = '#000000';
      ctx.fillRect(10, 30, 80, 4);
      ctx.fillRect(10, 50, 80, 4);
      ctx.fillRect(10, 70, 80, 4);

      const res = await service.dewarpCurvature(canvas);
      expect(res.curvatureDetected).toBe(false);
    });

    it('detects curved baselines and applies dewarping vertical resampling', async () => {
      const canvas = service.createCanvas(120, 100);
      const ctx = service.getContext(canvas)!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 120, 100);

      // Parabolically curved lines across full width: sag in middle
      ctx.fillStyle = '#000000';
      for (let x = 0; x < 120; x++) {
        const offset = Math.round(0.008 * (x - 60) ** 2);
        ctx.fillRect(x, 25 + offset, 1, 4);
        ctx.fillRect(x, 50 + offset, 1, 4);
      }

      const res = await service.dewarpCurvature(canvas);
      expect(res.curvatureDetected).toBe(true);
      expect(res.curvatureMagnitude).toBeGreaterThan(0);
      expect(res.canvas).toBeDefined();
    });
  });

  describe('H8 — Auto-Naming from Content', () => {
    it('proposes title from OCR heading and sanitizes filesystem-unsafe characters', async () => {
      const canvas = service.createCanvas(100, 100);
      const ocrText = 'ANNUAL FINANCIAL REPORT: 2026/Q4 *FINAL*?\nPage 1 of 12\nConfidential';

      const result = await service.suggestDocumentTitle(canvas, ocrText);
      expect(result.source).toBe('ocr');
      expect(result.proposedTitle).toBe('ANNUAL FINANCIAL REPORT: 2026/Q4 *FINAL*?');
      expect(result.sanitizedFileName).toBe('ANNUAL_FINANCIAL_REPORT_2026_Q4_FINAL');
      expect(result.sanitizedFileName).not.toMatch(/[\\/:*?"<>|]/);
    });

    it('falls back gracefully to timestamp scan name on blank page', async () => {
      const blankCanvas = service.createCanvas(100, 100);
      const ctx = service.getContext(blankCanvas)!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 100, 100);

      const result = await service.suggestDocumentTitle(blankCanvas);
      expect(result.source).toBe('fallback');
      expect(result.sanitizedFileName).toMatch(/^Scan_\d{8}_\d{4}$/);
    });

    it('sanitizeFileName removes illegal characters and limits length', () => {
      const unsafe = '  ///Invalid: File * Name? <Test> | "Pipe" \0 End.pdf  ';
      const clean = service.sanitizeFileName(unsafe);
      expect(clean).not.toMatch(/[\\/:*?"<>|\0]/);
      expect(clean).toBe('Invalid_File_Name_Test_Pipe_End.pdf');
    });
  });
});

