import { describe, it, expect, beforeEach } from 'vitest';
import { ImageFormatService } from './image-format.service';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

describe('ImageFormatService (I6 Format Reach)', () => {
  let service: ImageFormatService;

  beforeEach(() => {
    service = new ImageFormatService();
  });

  it('probes runtime capability matrix and hides unsupported formats', async () => {
    const matrix = await service.probeCapabilities(true);
    expect(matrix).toBeDefined();
    expect(matrix.decodableFormats.length).toBeGreaterThan(0);
    expect(matrix.encodableFormats.length).toBeGreaterThan(0);

    // Standard formats like JPEG, PNG, TIFF must be present
    const decodableMimes = matrix.decodableFormats.map(f => f.mimeType);
    expect(decodableMimes).toContain('image/jpeg');
    expect(decodableMimes).toContain('image/png');
    expect(decodableMimes).toContain('image/tiff');

    const encodableMimes = matrix.encodableFormats.map(f => f.mimeType);
    expect(encodableMimes).toContain('image/jpeg');
    expect(encodableMimes).toContain('image/png');
    expect(encodableMimes).toContain('image/tiff');

    // Unsupported export formats (like BMP or SVG export) must not be in encodable list
    expect(encodableMimes).not.toContain('image/bmp');
    expect(encodableMimes).not.toContain('image/svg+xml');
  });

  it('correctly checks isFormatSupported', async () => {
    const isJpegDecodable = await service.isFormatSupported('image/jpeg', 'decode');
    expect(isJpegDecodable).toBe(true);

    const isBmpEncodable = await service.isFormatSupported('image/bmp', 'encode');
    expect(isBmpEncodable).toBe(false);
  });

  it('encodes and decodes multi-page TIFF with exact round-trip page count', async () => {
    // Create 3 test canvas pages with different dimensions and colors
    const page1 = createSafeCanvas(10, 10);
    const ctx1 = getSafeContext(page1);
    ctx1.fillStyle = '#ff0000';
    ctx1.fillRect(0, 0, 10, 10);

    const page2 = createSafeCanvas(20, 15);
    const ctx2 = getSafeContext(page2);
    ctx2.fillStyle = '#00ff00';
    ctx2.fillRect(0, 0, 20, 15);

    const page3 = createSafeCanvas(12, 18);
    const ctx3 = getSafeContext(page3);
    ctx3.fillStyle = '#0000ff';
    ctx3.fillRect(0, 0, 12, 18);

    // Encode to multi-page TIFF
    const tiffBlob = service.encodeMultiPageTiff([page1, page2, page3]);
    expect(tiffBlob).toBeDefined();
    expect(tiffBlob.type).toBe('image/tiff');
    expect(tiffBlob.size).toBeGreaterThan(100);

    // Decode back from buffer
    const buffer = await tiffBlob.arrayBuffer();
    const frames = service.decodeTiffPages(buffer);

    expect(frames.length).toBe(3);
    expect(frames[0].width).toBe(10);
    expect(frames[0].height).toBe(10);
    expect(frames[0].pageNumber).toBe(1);

    expect(frames[1].width).toBe(20);
    expect(frames[1].height).toBe(15);
    expect(frames[1].pageNumber).toBe(2);

    expect(frames[2].width).toBe(12);
    expect(frames[2].height).toBe(18);
    expect(frames[2].pageNumber).toBe(3);
  });

  it('rasterizes SVG without failing', async () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red" /></svg>`;
    const canvas = await service.rasterizeSvg(svgContent, 100, 100);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
  });
});
