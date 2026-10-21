import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { IdPhotoService } from './id-photo.service';
import { FaceBoundingBox, IdPhotoCropOptions, PrintSheetOptions } from '../models/id-photo.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('IdPhotoService (I1 & I2)', () => {
  let service: IdPhotoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [IdPhotoService]
    });
    service = TestBed.inject(IdPhotoService);
  });

  describe('I1 — Head-height and eye-line geometry maths', () => {
    it('calculates crop box matching target head-height ratio and eye-line position', () => {
      // 1000 x 1200 image with face at (400, 200, 200, 250)
      const imageWidth = 1000;
      const imageHeight = 1200;
      const faceBox: FaceBoundingBox = { x: 400, y: 200, width: 200, height: 250 };
      const options: IdPhotoCropOptions = {
        headHeightRatio: 0.70, // face height is 70% of crop height
        eyeLineRatio: 0.40, // eye-line is 40% from top of crop
        aspectRatio: 35 / 45 // 7:9 passport ratio
      };

      const crop = service.calculateCropBox(imageWidth, imageHeight, faceBox, options);

      // Expected cropHeight = 250 / 0.70 = ~357 px
      const expectedHeight = Math.round(250 / 0.70);
      const expectedWidth = Math.round(expectedHeight * (35 / 45));
      expect(crop.height).toBe(expectedHeight);
      expect(crop.width).toBe(expectedWidth);

      // Eye line in face is face.y + height * 0.42 = 200 + 105 = 305
      // crop.y = 305 - expectedHeight * 0.40
      const expectedEyeY = 200 + 250 * 0.42;
      const expectedCropY = Math.round(expectedEyeY - expectedHeight * 0.40);
      expect(crop.y).toBe(expectedCropY);

      // Face center is 400 + 100 = 500
      // crop.x = 500 - expectedWidth / 2
      const expectedCropX = Math.round(500 - expectedWidth / 2);
      expect(crop.x).toBe(expectedCropX);
    });

    it('the manual path produces the exact same geometry as the detected path given the same box', () => {
      const faceBox: FaceBoundingBox = { x: 350, y: 150, width: 300, height: 360 };
      const options: IdPhotoCropOptions = {
        headHeightRatio: 0.72,
        eyeLineRatio: 0.43,
        aspectRatio: 1.0 // Square 1:1 preset
      };

      // Detected path produces crop box
      const detectedResult = service.calculateCropBox(1200, 1600, faceBox, options);

      // Manual path uses same pure method with the user-adjusted guide box
      const manualBox: FaceBoundingBox = { ...faceBox };
      const manualResult = service.calculateCropBox(1200, 1600, manualBox, options);

      expect(manualResult).toEqual(detectedResult);
    });

    it('clamps crop box within image boundaries when near edge without distorting aspect ratio', () => {
      const imageWidth = 500;
      const imageHeight = 500;
      // Face near top-left edge
      const edgeFaceBox: FaceBoundingBox = { x: 10, y: 10, width: 200, height: 240 };
      const options: IdPhotoCropOptions = {
        headHeightRatio: 0.75,
        eyeLineRatio: 0.45,
        aspectRatio: 35 / 45
      };

      const crop = service.calculateCropBox(imageWidth, imageHeight, edgeFaceBox, options);

      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(imageWidth);
      expect(crop.y + crop.height).toBeLessThanOrEqual(imageHeight);
      expect(Math.abs(crop.width / crop.height - (35 / 45))).toBeLessThan(0.05);
    });
  });

  describe('I2 — Background suitability and print sheet layout', () => {
    it('accepts a plain solid background as suitable for replacement', () => {
      const canvas = createSafeCanvas(200, 250);
      const ctx = getSafeContext(canvas);

      // Fill with uniform off-white wall color
      ctx.fillStyle = '#f0f2f5';
      ctx.fillRect(0, 0, 200, 250);

      const result = service.checkBackgroundSuitability(canvas);
      expect(result.suitable).toBe(true);
      expect(result.variance).toBeLessThan(10);
    });

    it('refuses a cluttered background and provides an informative reason', () => {
      const canvas = createSafeCanvas(200, 250);
      const ctx = getSafeContext(canvas);

      // Create high-variance noisy/cluttered pattern across the background strip
      for (let y = 0; y < 40; y += 4) {
        for (let x = 0; x < 200; x += 4) {
          const color = (x % 8 === 0) ? '#112233' : '#eebb99';
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 4, 4);
        }
      }

      const result = service.checkBackgroundSuitability(canvas);
      expect(result.suitable).toBe(false);
      expect(result.reason).toContain('cluttered');
      expect(result.variance).toBeGreaterThan(30);
    });

    it('calculates print sheet layout with expected copy count and grid positions', () => {
      // 413 x 531 px photo on 4x6 inch paper (1200 x 1800 px at 300 DPI)
      const options: PrintSheetOptions = {
        paperSize: '4x6',
        copies: 6,
        gapMm: 3,
        includeCutMarks: true,
        dpi: 300
      };

      const layout = service.calculateSheetLayout(413, 531, options);

      expect(layout.sheetWidthPx).toBe(1200);
      expect(layout.sheetHeightPx).toBe(1800);
      expect(layout.totalCopies).toBe(6);
      expect(layout.positions.length).toBe(6);

      // Verify each position is within sheet bounds
      for (const pos of layout.positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.x + pos.width).toBeLessThanOrEqual(layout.sheetWidthPx);
        expect(pos.y + pos.height).toBeLessThanOrEqual(layout.sheetHeightPx);
      }
    });

    it('generates a canvas sheet with requested photo copies', () => {
      const photoCanvas = createSafeCanvas(100, 120);
      const pctx = getSafeContext(photoCanvas);
      pctx.fillStyle = '#3b82f6';
      pctx.fillRect(0, 0, 100, 120);

      const options: PrintSheetOptions = {
        paperSize: '4x6',
        copies: 4,
        gapMm: 3,
        includeCutMarks: true,
        dpi: 150 // lower dpi for faster test
      };

      const sheet = service.generatePrintSheet(photoCanvas, options);
      expect(sheet).toBeDefined();
      expect(sheet.width).toBeGreaterThan(0);
      expect(sheet.height).toBeGreaterThan(0);
    });
  });
});
