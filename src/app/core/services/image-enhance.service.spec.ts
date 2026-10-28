import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ImageEnhanceService } from './image-enhance.service';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('ImageEnhanceService (I5 — Upscale & Enhance)', () => {
  let service: ImageEnhanceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ImageEnhanceService]
    });
    service = TestBed.inject(ImageEnhanceService);
  });

  it('produces output dimensions that are exact multiples of input dimensions (2x and 4x)', () => {
    const origW = 50;
    const origH = 65;
    const canvas = createSafeCanvas(origW, origH);
    const ctx = getSafeContext(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, origW, origH);

    // 2x upscale
    const upscaled2x = service.bicubicUpscale(canvas, 2);
    expect(upscaled2x.width).toBe(origW * 2);
    expect(upscaled2x.height).toBe(origH * 2);

    // 4x upscale
    const upscaled4x = service.bicubicUpscale(canvas, 4);
    expect(upscaled4x.width).toBe(origW * 4);
    expect(upscaled4x.height).toBe(origH * 4);
  });

  it('measurably increases edge contrast on a text fixture after unsharp masking', () => {
    const width = 80;
    const height = 40;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    // Light paper background
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, width, height);

    // Slightly blurry / low-contrast text strokes: drawn with intermediate gray
    ctx.fillStyle = '#666666';
    ctx.fillRect(20, 10, 40, 6);
    ctx.fillRect(35, 16, 10, 15);

    const initialContrast = service.calculateEdgeContrast(canvas);
    expect(initialContrast).toBeGreaterThan(0);

    // Apply unsharp mask sharpening (amount: 1.5, radius: 1, threshold: 2)
    const sharpenedCanvas = service.applyUnsharpMask(canvas, 1.5, 1, 2);
    const sharpenedContrast = service.calculateEdgeContrast(sharpenedCanvas);

    // Edge contrast should measurably increase!
    expect(sharpenedContrast).toBeGreaterThan(initialContrast * 1.15);
  });
});
