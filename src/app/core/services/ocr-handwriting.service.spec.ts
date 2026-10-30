import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OcrHandwritingService } from './ocr-handwriting.service';
import { OcrModelManagerService } from './ocr-model-manager.service';
import { OcrService } from './ocr.service';

describe('OcrHandwritingService', () => {
  let service: OcrHandwritingService;
  let ocrService: OcrService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OcrHandwritingService,
        OcrModelManagerService,
        OcrService
      ]
    });
    service = TestBed.inject(OcrHandwritingService);
    ocrService = TestBed.inject(OcrService);
  });

  afterEach(async () => {
    await service.terminateWorker();
  });

  describe('Handwriting Preprocessing Pipeline', () => {
    it('applies Sauvola adaptive binarization to isolate faint strokes and pencil pressure', () => {
      const width = 60;
      const height = 30;
      const data = new Uint8ClampedArray(width * height * 4);

      // Gradient background (simulating paper shadow/non-uniform lighting)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const bgVal = Math.floor(180 + (x / width) * 60); // 180 to 240
          data[idx] = bgVal;
          data[idx + 1] = bgVal;
          data[idx + 2] = bgVal;
          data[idx + 3] = 255;
        }
      }

      // Draw faint handwritten pencil stroke (darker than local background)
      for (let x = 15; x < 45; x++) {
        const y = 15;
        const idx = (y * width + x) * 4;
        data[idx] = 110;
        data[idx + 1] = 110;
        data[idx + 2] = 110;
      }

      const inputImage: ImageData = {
        data,
        width,
        height,
        colorSpace: 'srgb'
      } as ImageData;

      const result = service.applySauvolaBinarization(inputImage, 0.34, 15);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // The stroke pixel should be marked as ink (0)
      const strokeIdx = (15 * width + 30) * 4;
      expect(result.data[strokeIdx]).toBe(0);

      // Background far from stroke should be white (255)
      const bgIdx = (2 * width + 50) * 4;
      expect(result.data[bgIdx]).toBe(255);
    });

    it('reconnects broken pen strokes using morphological dilation', () => {
      const width = 20;
      const height = 20;
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(255); // White background

      // Create a broken stroke: pixel at (10, 9) and (10, 11) are black (ink = 0), but (10, 10) is a micro gap (white = 255)
      const idxTop = (9 * width + 10) * 4;
      const idxBottom = (11 * width + 10) * 4;
      data[idxTop] = 0;
      data[idxTop + 1] = 0;
      data[idxTop + 2] = 0;

      data[idxBottom] = 0;
      data[idxBottom + 1] = 0;
      data[idxBottom + 2] = 0;

      const inputImage: ImageData = {
        data,
        width,
        height,
        colorSpace: 'srgb'
      } as ImageData;

      const reconnected = service.applyStrokeReconnection(inputImage);
      const gapIdx = (10 * width + 10) * 4;

      // Gap pixel (10, 10) between top and bottom ink neighbors should be reconnected as ink (0)
      expect(reconnected.data[gapIdx]).toBe(0);
    });

    it('deskews canvas by dominant text angle normalization', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 100, 50);
        // Draw horizontal line
        ctx.fillStyle = '#000000';
        ctx.fillRect(20, 25, 60, 4);
      }

      const { deskewedCanvas, angle } = service.deskewCanvas(canvas);
      expect(deskewedCanvas).toBeDefined();
      expect(typeof angle).toBe('number');
    });
  });

  describe('Expectation Notice Enforcement', () => {
    it('throws an error if expectation notice was not acknowledged prior to execution', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 50;

      await expect(
        service.recognizeHandwriting(canvas, { acknowledgedExpectations: false })
      ).rejects.toThrow('Handwriting recognition expectation notice must be acknowledged before execution.');
    });

    it('proceeds when expectation notice is explicitly acknowledged', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 40;

      // Mock worker execution to avoid full Tesseract spawn in mock unit test
      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: vi.fn(),
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Sample Note',
            confidence: 84,
            lines: [
              {
                text: 'Sample Note',
                confidence: 84,
                bbox: { x0: 10, y0: 10, x1: 70, y1: 30 }
              }
            ]
          }
        })
      });

      const result = await service.recognizeHandwriting(canvas, {
        acknowledgedExpectations: true,
        psmMode: 6
      });

      expect(result.acknowledgedExpectations).toBe(true);
      expect(result.isHandwritingPipeline).toBe(true);
      expect(result.fullText).toBe('Sample Note');
      expect(result.lines.length).toBe(1);
      expect(result.lines[0].text).toBe('Sample Note');
      expect(result.lines[0].confidence).toBe(84);
      expect(result.lines[0].bbox).toEqual({ x0: 10, y0: 10, x1: 70, y1: 30 });
      expect(result.lines[0].cropDataUrl).toBeDefined();
    });
  });

  describe('Side-by-Side Preservation & Bounding Coordinate Links', () => {
    it('crops and links original image regions for each recognized handwriting line', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 60;

      const cropUrl = service.cropRegion(canvas, { x0: 10, y0: 10, x1: 100, y1: 30 });
      expect(cropUrl).toContain('data:image/jpeg');
    });
  });

  describe('Real Test Scenarios (Step 2 Verification)', () => {
    it('handles neat cursive notes using PSM 6 uniform text block recognition', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 300, 150);
        ctx.fillStyle = '#000000';
        ctx.fillText('Neat cursive lecture notes line 1', 10, 40);
        ctx.fillText('Neat cursive lecture notes line 2', 10, 90);
      }

      const setParamsSpy = vi.fn();
      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: setParamsSpy,
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Neat cursive lecture notes line 1\nNeat cursive lecture notes line 2',
            confidence: 91,
            lines: [
              {
                text: 'Neat cursive lecture notes line 1',
                confidence: 92,
                bbox: { x0: 10, y0: 20, x1: 280, y1: 50 }
              },
              {
                text: 'Neat cursive lecture notes line 2',
                confidence: 90,
                bbox: { x0: 10, y0: 70, x1: 280, y1: 100 }
              }
            ]
          }
        })
      });

      const result = await service.recognizeHandwriting(canvas, {
        acknowledgedExpectations: true,
        psmMode: 6
      });

      expect(setParamsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tessedit_pageseg_mode: '6' })
      );
      expect(result.lineCount).toBe(2);
      expect(result.wordCount).toBe(12);
      expect(result.averageConfidence).toBe(91);
      expect(result.fullText).toContain('Neat cursive');
    });

    it('isolates faint pencil writing with non-uniform shadow via Sauvola thresholding', () => {
      const width = 80;
      const height = 40;
      const data = new Uint8ClampedArray(width * height * 4);

      // Uneven lighting: shadow gradient from 160 to 240
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const bgVal = Math.floor(160 + (y / height) * 80);
          data[idx] = bgVal;
          data[idx + 1] = bgVal;
          data[idx + 2] = bgVal;
          data[idx + 3] = 255;
        }
      }

      // Faint pencil text in the shadowed region (value 130 vs local bg 170)
      for (let x = 20; x < 60; x++) {
        const y = 10;
        const idx = (y * width + x) * 4;
        data[idx] = 130;
        data[idx + 1] = 130;
        data[idx + 2] = 130;
      }

      const inputImage: ImageData = {
        data,
        width,
        height,
        colorSpace: 'srgb'
      } as ImageData;

      const result = service.applySauvolaBinarization(inputImage, 0.34, 15);
      const strokeIdx = (10 * width + 40) * 4;
      const shadowBgIdx = (5 * width + 40) * 4;

      // Stroke correctly classified as foreground ink (0) despite dark background
      expect(result.data[strokeIdx]).toBe(0);
      // Surrounding shadowed background correctly cleared to paper white (255)
      expect(result.data[shadowBgIdx]).toBe(255);
    });

    it('processes handwritten application forms with sparse fields using PSM 11', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;

      const setParamsSpy = vi.fn();
      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: setParamsSpy,
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Applicant Name: John Doe\nDate: 24/10/2026',
            confidence: 88,
            lines: [
              {
                text: 'Applicant Name: John Doe',
                confidence: 89,
                bbox: { x0: 10, y0: 30, x1: 250, y1: 60 }
              },
              {
                text: 'Date: 24/10/2026',
                confidence: 87,
                bbox: { x0: 10, y0: 80, x1: 180, y1: 110 }
              }
            ]
          }
        })
      });

      const result = await service.recognizeHandwriting(canvas, {
        acknowledgedExpectations: true,
        psmMode: 11
      });

      expect(setParamsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tessedit_pageseg_mode: '11' })
      );
      expect(result.lines.length).toBe(2);
      expect(result.lines[0].text).toBe('Applicant Name: John Doe');
      expect(result.lines[1].text).toBe('Date: 24/10/2026');
    });

    it('reconnects discontinuous ink trails in messy doctor prescriptions', () => {
      const width = 30;
      const height = 30;
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(255);

      // Simulate discontinuous pen skip: (15, 13) and (15, 15) are ink (0), (15, 14) is paper gap (255)
      const topStroke = (13 * width + 15) * 4;
      const btmStroke = (15 * width + 15) * 4;
      data[topStroke] = 0;
      data[topStroke + 1] = 0;
      data[topStroke + 2] = 0;

      data[btmStroke] = 0;
      data[btmStroke + 1] = 0;
      data[btmStroke + 2] = 0;

      const inputImage: ImageData = {
        data,
        width,
        height,
        colorSpace: 'srgb'
      } as ImageData;

      const dilated = service.applyStrokeReconnection(inputImage);
      const gapIdx = (14 * width + 15) * 4;

      // The gap is bridged to re-establish continuous character loop
      expect(dilated.data[gapIdx]).toBe(0);
    });

    it('exports clean structured JSON and plain text files with edited content', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 50;

      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: vi.fn(),
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Original Text',
            confidence: 85,
            lines: [{ text: 'Original Text', confidence: 85, bbox: { x0: 0, y0: 0, x1: 100, y1: 50 } }]
          }
        })
      });

      const ocrResult = await service.recognizeHandwriting(canvas, { acknowledgedExpectations: true });
      const userEditedText = 'User Corrected Text';

      const txtFile = service.generateTextFile(ocrResult, userEditedText);
      const jsonFile = service.generateJsonFile(ocrResult, userEditedText);

      expect(txtFile.name).toContain('_handwriting_text.txt');
      expect(jsonFile.name).toContain('_handwriting_structured.json');

      const txtContent = await txtFile.text();
      expect(txtContent).toBe('User Corrected Text');

      const jsonContent = JSON.parse(await jsonFile.text());
      expect(jsonContent.fullText).toBe('User Corrected Text');
      expect(jsonContent.exportedAt).toBeDefined();
      expect(jsonContent.isHandwritingPipeline).toBe(true);
    });
  });

  describe('Cybersecurity Stress-Testing (Step 5)', () => {
    it('prevents memory exhaustion from image dimension bombs by downscaling oversized canvases', () => {
      const hugeCanvas = document.createElement('canvas');
      // Simulated 6000 x 4000 camera photo or dimension bomb
      hugeCanvas.width = 6000;
      hugeCanvas.height = 4000;

      const safeCanvas = (service as any).downscaleCanvasIfNeeded(hugeCanvas, 2000);
      expect(safeCanvas.width).toBe(2000);
      expect(safeCanvas.height).toBe(1333); // Preserves aspect ratio
    });

    it('leaves reasonably-sized canvases untouched without quality degradation', () => {
      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = 1200;
      normalCanvas.height = 900;

      const resultCanvas = (service as any).downscaleCanvasIfNeeded(normalCanvas, 2000);
      expect(resultCanvas.width).toBe(1200);
      expect(resultCanvas.height).toBe(900);
      expect(resultCanvas).toBe(normalCanvas);
    });

    it('neutralizes XSS payloads and control characters in OCR output and export files', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 50;

      // Malicious or corrupted OCR payload containing HTML tags and control chars
      const xssPayload = '<script>alert("XSS")</script>\u0000Hello\u0007 <img src=x onerror=alert(1)>';

      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: vi.fn(),
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: xssPayload,
            confidence: 70,
            lines: [{ text: xssPayload, confidence: 70, bbox: { x0: 0, y0: 0, x1: 100, y1: 50 } }]
          }
        })
      });

      const ocrResult = await service.recognizeHandwriting(canvas, { acknowledgedExpectations: true });

      // Script and HTML tags are stripped/neutralized, null byte and bell character removed
      expect(ocrResult.fullText).not.toContain('<script>');
      expect(ocrResult.fullText).not.toContain('\u0000');
      expect(ocrResult.fullText).not.toContain('\u0007');
      expect(ocrResult.lines[0].text).not.toContain('<script>');

      const jsonFile = service.generateJsonFile(ocrResult);
      const jsonContent = JSON.parse(await jsonFile.text());
      expect(jsonContent.fullText).not.toContain('<script>');
    });
  });

  describe('Zero Regression on Standard Print Mode', () => {
    it('does not alter OcrService print-mode behavior or parameters', () => {
      expect(ocrService.supportedLanguages.length).toBe(5);
      expect(ocrService.expandedLanguages.length).toBe(18);
      // OcrService does not have handwriting properties
      expect((ocrService as any).applySauvolaBinarization).toBeUndefined();
    });
  });
});
