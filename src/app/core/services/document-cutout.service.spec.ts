import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DocumentCutoutService } from './document-cutout.service';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('DocumentCutoutService (I4 — Background Cutout)', () => {
  let service: DocumentCutoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DocumentCutoutService]
    });
    service = TestBed.inject(DocumentCutoutService);
  });

  it('turns off-white paper background into transparent while preserving ink content and color', () => {
    const width = 100;
    const height = 60;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    // Off-white/cream paper background: (245, 240, 235)
    ctx.fillStyle = '#f5f0eb';
    ctx.fillRect(0, 0, width, height);

    // Blue ink stroke representing handwritten signature: (20, 40, 160)
    ctx.fillStyle = '#1428a0';
    ctx.fillRect(25, 20, 50, 15);

    const suitability = service.evaluateSuitability(canvas);
    expect(suitability.suitable).toBe(true);

    const cutoutCanvas = service.cutoutBackground(canvas, { tolerance: 25, feather: 1 });
    const outData = getSafeContext(cutoutCanvas).getImageData(0, 0, width, height).data;

    // Check paper pixel (at 5, 5): should be fully transparent (alpha = 0)
    const paperIdx = (5 * width + 5) * 4;
    expect(outData[paperIdx + 3]).toBe(0);

    // Check ink pixel (at 50, 25): should be opaque (alpha > 200) and preserve blue ink color
    const inkIdx = (25 * width + 50) * 4;
    expect(outData[inkIdx + 3]).toBeGreaterThan(200);
    // Preserves blue channel dominance: blue > red and blue > green
    expect(outData[inkIdx + 2]).toBeGreaterThan(outData[inkIdx]); // blue > red
    expect(outData[inkIdx + 2]).toBeGreaterThan(outData[inkIdx + 1]); // blue > green
  });

  it('reports a cluttered, textured, or non-paper photo as unsuitable for cutout', () => {
    const width = 100;
    const height = 100;
    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    // Cluttered photo with random colors and objects across perimeter
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        ctx.fillStyle = (x * y) % 3 === 0 ? '#225588' : (x % 2 === 0 ? '#cc4422' : '#33aa55');
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const suitability = service.evaluateSuitability(canvas);
    expect(suitability.suitable).toBe(false);
    expect(suitability.reason).toContain('varied or dark');
  });
});
