import { describe, it, expect, beforeEach } from 'vitest';
import { BatchImageService } from './batch-image.service';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('BatchImageService (I10 Batch Image Suite Additions)', () => {
  let service: BatchImageService;

  beforeEach(() => {
    service = new BatchImageService();
  });

  it('expands rename tokens including {yyyy}, {mm}, {dd}, {hh}, {min}', () => {
    const fixedDate = new Date('2024-08-25T14:30:00.000');
    const template = 'IMG_{yyyy}_{mm}_{dd}_{hh}_{min}_{n}';
    const originalName = 'camera_shot.jpg';

    const expanded = service.expandRenamePattern(template, originalName, 1, fixedDate);
    expect(expanded).toBe('IMG_2024_08_25_14_30_1.jpg');
  });

  it('preserves existing rename templates identically to today', () => {
    // Template 1: prefix + counter
    const t1 = 'Doc_{n}';
    expect(service.expandRenamePattern(t1, 'scan.png', 5)).toBe('Doc_5.png');

    // Template 2: base name + suffix
    const t2 = '{name}_compressed';
    expect(service.expandRenamePattern(t2, 'photo.jpeg', 1)).toBe('photo_compressed.jpeg');

    // Template 3: padded counter
    const t3 = 'file_{nn}';
    expect(service.expandRenamePattern(t3, 'item.jpg', 3)).toBe('file_03.jpg');
  });

  it('correctly decides skip-if-already-under-target to preserve byte fidelity', () => {
    const targetKB = 50; // 50 * 1024 = 51200 bytes

    // File 1: 40 KB (40960 bytes) -> should skip
    expect(service.shouldSkipIfUnderTarget(40960, targetKB)).toBe(true);

    // File 2: Exactly 50 KB (51200 bytes) -> should skip
    expect(service.shouldSkipIfUnderTarget(51200, targetKB)).toBe(true);

    // File 3: 50.1 KB (51300 bytes) -> must NOT skip
    expect(service.shouldSkipIfUnderTarget(51300, targetKB)).toBe(false);

    // File 4: 100 KB (102400 bytes) -> must NOT skip
    expect(service.shouldSkipIfUnderTarget(102400, targetKB)).toBe(false);
  });

  it('applies EXIF orientation transform (orientation 6: 90 CW)', () => {
    // Landscape canvas: 200 x 100
    const canvas = createSafeCanvas(200, 100);
    const ctx = getSafeContext(canvas);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 100);

    // Orientation 6: rotated 90 degrees CW -> output should be 100 x 200 (portrait)
    const rotated = service.applyExifOrientation(canvas, 6);
    expect(rotated.width).toBe(100);
    expect(rotated.height).toBe(200);

    // Orientation 1 (normal) returns same canvas
    const normal = service.applyExifOrientation(canvas, 1);
    expect(normal).toBe(canvas);
  });

  it('exports combined PDF document for multiple images', async () => {
    const file1 = new File(['mock1'], 'page1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['mock2'], 'page2.jpg', { type: 'image/jpeg' });

    const pdfBytes = await service.exportCombinedPdf([file1, file2]);
    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(100);

    // PDF magic %PDF-
    const header = String.fromCharCode(...pdfBytes.subarray(0, 5));
    expect(header).toBe('%PDF-');
  });
});
