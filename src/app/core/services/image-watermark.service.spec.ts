import { describe, it, expect, beforeEach } from 'vitest';
import { ImageWatermarkService } from './image-watermark.service';
import { WatermarkOptions, WatermarkPosition } from '../models/image-watermark.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('ImageWatermarkService (I8 Image Watermarking)', () => {
  let service: ImageWatermarkService;

  beforeEach(() => {
    service = new ImageWatermarkService();
  });

  it('calculates exact placement mathematics for all 9 anchor positions', () => {
    const canvasW = 1000;
    const canvasH = 800;
    const wmWidth = 200;
    const wmHeight = 100;
    const margin = 20;

    // 1. Top-Left
    const tl = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'top-left', margin);
    expect(tl).toEqual({ x: 20, y: 20 });

    // 2. Top-Center
    const tc = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'top-center', margin);
    expect(tc).toEqual({ x: 400, y: 20 }); // (1000 - 200)/2 = 400

    // 3. Top-Right
    const tr = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'top-right', margin);
    expect(tr).toEqual({ x: 780, y: 20 }); // 1000 - 200 - 20 = 780

    // 4. Middle-Left
    const ml = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'middle-left', margin);
    expect(ml).toEqual({ x: 20, y: 350 }); // (800 - 100)/2 = 350

    // 5. Center
    const c = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'center', margin);
    expect(c).toEqual({ x: 400, y: 350 });

    // 6. Middle-Right
    const mr = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'middle-right', margin);
    expect(mr).toEqual({ x: 780, y: 350 });

    // 7. Bottom-Left
    const bl = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'bottom-left', margin);
    expect(bl).toEqual({ x: 20, y: 680 }); // 800 - 100 - 20 = 680

    // 8. Bottom-Center
    const bc = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'bottom-center', margin);
    expect(bc).toEqual({ x: 400, y: 680 });

    // 9. Bottom-Right
    const br = service.calculateAnchorPosition(canvasW, canvasH, wmWidth, wmHeight, 'bottom-right', margin);
    expect(br).toEqual({ x: 780, y: 680 });
  });

  it('calculates tiling grid covering the entire canvas area', () => {
    const canvasW = 500;
    const canvasH = 400;
    const itemW = 100;
    const itemH = 40;
    const gapX = 50;
    const gapY = 50;

    const grid = service.calculateTilingGrid(canvasW, canvasH, itemW, itemH, gapX, gapY);
    expect(grid.length).toBeGreaterThan(4);

    // Assert grid points span across the canvas boundaries
    const minX = Math.min(...grid.map(p => p.x));
    const maxX = Math.max(...grid.map(p => p.x));
    const minY = Math.min(...grid.map(p => p.y));
    const maxY = Math.max(...grid.map(p => p.y));

    expect(minX).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(canvasW);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxY).toBeGreaterThanOrEqual(canvasH);
  });

  it('manages watermark presets cleanly', () => {
    const presets = service.getPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);

    const presetNames = presets.map(p => p.name);
    expect(presetNames).toContain('Confidential');
    expect(presetNames).toContain('Draft');
    expect(presetNames).toContain('Sample');

    // Create custom preset
    const customOptions: WatermarkOptions = {
      mode: 'single',
      position: 'center',
      opacity: 0.4,
      textConfig: {
        type: 'text',
        text: 'INTERNAL ONLY',
        fontSize: 30,
        fontFamily: 'sans-serif',
        color: '#ff0000',
        opacity: 0.4,
        rotationDegrees: 0
      }
    };
    const created = service.savePreset('Internal Only', customOptions);
    expect(created.id).toBeDefined();

    const updatedPresets = service.getPresets();
    expect(updatedPresets.some(p => p.id === created.id)).toBe(true);

    // Delete custom preset
    const deleted = service.deletePreset(created.id);
    expect(deleted).toBe(true);
    expect(service.getPresets().some(p => p.id === created.id)).toBe(false);
  });

  it('applies text watermark to canvas', () => {
    const sourceCanvas = createSafeCanvas(200, 200);
    const ctx = getSafeContext(sourceCanvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 200, 200);

    const options: WatermarkOptions = {
      mode: 'single',
      position: 'center',
      opacity: 0.5,
      textConfig: {
        type: 'text',
        text: 'TEST',
        fontSize: 24,
        fontFamily: 'sans-serif',
        color: '#ff0000',
        opacity: 0.5,
        rotationDegrees: 0
      }
    };

    const result = service.applyWatermark(sourceCanvas, options);
    expect(result).toBeDefined();
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
  });
});
