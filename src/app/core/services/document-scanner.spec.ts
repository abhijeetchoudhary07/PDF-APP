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
});
