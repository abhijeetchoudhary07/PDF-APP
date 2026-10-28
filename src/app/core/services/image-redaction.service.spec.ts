import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ImageRedactionService } from './image-redaction.service';
import { RedactionRegion } from '../models/image-redaction.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('ImageRedactionService (I3 — Face & Plate Blur)', () => {
  let service: ImageRedactionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ImageRedactionService]
    });
    service = TestBed.inject(ImageRedactionService);
  });

  it('drops pixel variance in the target region below threshold after blurring', () => {
    const width = 100;
    const height = 100;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    // Fill background with flat gray
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);

    // In a 40x40 region, draw high-contrast alternating checkerboard / noisy details
    // (representing face/plate features like eyes, numbers, edges)
    const regionBox = { x: 30, y: 30, width: 40, height: 40 };
    for (let y = regionBox.y; y < regionBox.y + regionBox.height; y += 2) {
      for (let x = regionBox.x; x < regionBox.x + regionBox.width; x += 2) {
        ctx.fillStyle = (x + y) % 4 === 0 ? '#000000' : '#ffffff';
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const initialVariance = service.measureRegionVariance(canvas, regionBox);
    // Alternating black and white has high variance (~16000)
    expect(initialVariance).toBeGreaterThan(5000);

    const region: RedactionRegion = {
      id: 'reg_1',
      x: regionBox.x,
      y: regionBox.y,
      width: regionBox.width,
      height: regionBox.height,
      type: 'blur',
      intensity: 7
    };

    const redactedCanvas = service.applyRedaction(canvas, [region]);
    const blurredVariance = service.measureRegionVariance(redactedCanvas, regionBox);

    // Variance should drop dramatically (e.g. by > 80%)
    expect(blurredVariance).toBeLessThan(initialVariance * 0.2);
  });

  it('leaves pixels outside the redaction region 100% untouched', () => {
    const width = 80;
    const height = 80;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    // Fill canvas with known test pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const r = (x * 3) % 256;
        const g = (y * 4) % 256;
        const b = ((x + y) * 2) % 256;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const originalData = ctx.getImageData(0, 0, width, height).data;

    // Apply redaction to sub-region (20, 20, 30, 30)
    const region: RedactionRegion = {
      id: 'target',
      x: 20,
      y: 20,
      width: 30,
      height: 30,
      type: 'pixelate',
      intensity: 5
    };

    const redactedCanvas = service.applyRedaction(canvas, [region]);
    const redactedData = getSafeContext(redactedCanvas).getImageData(0, 0, width, height).data;

    // Check pixels outside the region: must be exactly equal
    let touchedOutside = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isInside = x >= 20 && x < 50 && y >= 20 && y < 50;
        if (!isInside) {
          const idx = (y * width + x) * 4;
          if (
            redactedData[idx] !== originalData[idx] ||
            redactedData[idx + 1] !== originalData[idx + 1] ||
            redactedData[idx + 2] !== originalData[idx + 2] ||
            redactedData[idx + 3] !== originalData[idx + 3]
          ) {
            touchedOutside++;
          }
        }
      }
    }

    expect(touchedOutside).toBe(0);
  });

  it('supports pixelate mode to mosaic license plates and text', () => {
    const width = 60;
    const height = 60;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw dark text line in middle
    ctx.fillStyle = '#000000';
    ctx.fillRect(10, 25, 40, 10);

    const region: RedactionRegion = {
      id: 'plate',
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      type: 'pixelate',
      intensity: 6
    };

    const redactedCanvas = service.applyRedaction(canvas, [region]);
    const redactedData = getSafeContext(redactedCanvas).getImageData(0, 0, width, height).data;

    // Check that inside the region pixels have been block-averaged
    const sampleIdx = (25 * width + 20) * 4;
    // Color should no longer be pure black (#000000) or pure white (#ffffff)
    expect(redactedData[sampleIdx]).toBeGreaterThan(0);
    expect(redactedData[sampleIdx]).toBeLessThan(255);
  });
});
