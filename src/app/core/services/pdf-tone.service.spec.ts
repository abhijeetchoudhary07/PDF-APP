import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfToneService } from './pdf-tone.service';
import {
  LAYOUT_PAPER_SIZES_PT,
  defaultToneOptions
} from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

/** One RGBA pixel, as the tone pass sees it. */
function pixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

const read = (data: Uint8ClampedArray) => [data[0], data[1], data[2], data[3]];

async function textDoc(count = 2): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([A4.width, A4.height]);
    page.drawText(`Page ${i + 1}`, {
      x: 40,
      y: A4.height - 60,
      size: 18,
      font,
      color: rgb(0.1, 0.2, 0.8)
    });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('PdfToneService (D7 — tone passes)', () => {
  let service: PdfToneService;

  beforeEach(() => {
    service = new PdfToneService();
  });

  describe('the warning comes before the output', () => {
    it('reports that the output is rasterised before anything has run', () => {
      const notices = service.advanceNotices();
      expect(notices).toEqual([{ kind: 'raster-output' }]);
    });

    it('carries the same warning on the finished output', async () => {
      const output = await service.exportToned(await textDoc(1), defaultToneOptions(), 'out.pdf');
      expect(output.notices.some(n => n.kind === 'raster-output')).toBe(true);
    });
  });

  describe('grayscale', () => {
    it('weights the channels by luminance rather than averaging them', () => {
      // Saturated blue is dark to the eye; a flat average would call it 85.
      const blue = pixel(0, 0, 255);
      service.applyTone(blue, 'grayscale');
      expect(read(blue)).toEqual([29, 29, 29, 255]);

      const green = pixel(0, 255, 0);
      service.applyTone(green, 'grayscale');
      expect(read(green)).toEqual([150, 150, 150, 255]);

      const red = pixel(255, 0, 0);
      service.applyTone(red, 'grayscale');
      expect(read(red)).toEqual([76, 76, 76, 255]);
    });

    it('leaves white white and black black', () => {
      const white = pixel(255, 255, 255);
      service.applyTone(white, 'grayscale');
      expect(read(white)).toEqual([255, 255, 255, 255]);

      const black = pixel(0, 0, 0);
      service.applyTone(black, 'grayscale');
      expect(read(black)).toEqual([0, 0, 0, 255]);
    });

    it('does not touch the alpha channel', () => {
      const translucent = pixel(10, 20, 30, 128);
      service.applyTone(translucent, 'grayscale');
      expect(translucent[3]).toBe(128);
    });
  });

  describe('invert', () => {
    it('mirrors every channel about 255', () => {
      const white = pixel(255, 255, 255);
      service.applyTone(white, 'invert');
      expect(read(white)).toEqual([0, 0, 0, 255]);

      const colour = pixel(10, 100, 200);
      service.applyTone(colour, 'invert');
      expect(read(colour)).toEqual([245, 155, 55, 255]);
    });

    it('is its own inverse', () => {
      const original = pixel(33, 77, 211);
      const copy = new Uint8ClampedArray(original);
      service.applyTone(copy, 'invert');
      service.applyTone(copy, 'invert');
      expect(read(copy)).toEqual(read(original));
    });
  });

  describe('high contrast', () => {
    it('pushes values away from the mid-point and clamps at the ends', () => {
      // Mid-grey at the threshold lands on 128 and stays readable.
      const mid = pixel(150, 150, 150);
      service.applyTone(mid, 'high-contrast', 150);
      expect(read(mid)).toEqual([128, 128, 128, 255]);

      // A faint pencil mark 20 levels below the mid-point goes to near black.
      const faint = pixel(130, 130, 130);
      service.applyTone(faint, 'high-contrast', 150);
      expect(faint[0]).toBe(68);

      // Paper above the mid-point saturates to white.
      const paper = pixel(220, 220, 220);
      service.applyTone(paper, 'high-contrast', 150);
      expect(read(paper)).toEqual([255, 255, 255, 255]);

      const ink = pixel(20, 20, 20);
      service.applyTone(ink, 'high-contrast', 150);
      expect(read(ink)).toEqual([0, 0, 0, 255]);
    });

    it('moves the cut with the threshold', () => {
      const grey = () => pixel(100, 100, 100);

      const lowCut = grey();
      service.applyTone(lowCut, 'high-contrast', 60);
      expect(lowCut[0]).toBeGreaterThan(128);

      const highCut = grey();
      service.applyTone(highCut, 'high-contrast', 200);
      expect(highCut[0]).toBe(0);
    });

    it('clamps a threshold outside 0-255', () => {
      const grey = pixel(100, 100, 100);
      service.applyTone(grey, 'high-contrast', 9999);
      expect(grey[0]).toBe(0);
    });
  });

  describe('a whole buffer', () => {
    it('transforms every pixel in a multi-pixel page', () => {
      const data = new Uint8ClampedArray([
        255, 255, 255, 255,
        0, 0, 0, 255,
        255, 0, 0, 255
      ]);
      service.applyTone(data, 'invert');
      expect(Array.from(data)).toEqual([
        0, 0, 0, 255,
        255, 255, 255, 255,
        0, 255, 255, 255
      ]);
    });
  });

  describe('resolution', () => {
    it('clamps the DPI to a range a phone can actually render', () => {
      expect(service.resolveDpi(150)).toBe(150);
      expect(service.resolveDpi(20)).toBe(service.MIN_DPI);
      expect(service.resolveDpi(1200)).toBe(service.MAX_DPI);
      expect(service.resolveDpi(NaN)).toBe(150);
    });
  });

  describe('estimate', () => {
    it('says it cannot measure rather than guessing when there is no canvas', async () => {
      const estimate = await service.estimate(await textDoc(2), defaultToneOptions());
      // jsdom has no 2D context, which is exactly the case this has to survive.
      expect(estimate.unavailableReason).toBeDefined();
      expect(estimate.estimatedBytes).toBe(0);
    });
  });

  describe('export', () => {
    it('keeps the page count and the page size when it cannot rasterise', async () => {
      const output = await service.exportToned(await textDoc(3), defaultToneOptions(), 'out.pdf');

      expect(output.pageCount).toBe(3);
      expect(output.sourcePageCount).toBe(3);
      expect(output.outputSize?.width).toBeCloseTo(A4.width, 1);

      // Every page fell back to a copy here, and the output says so rather
      // than pretending the tone was applied.
      const skipped = output.notices.find(n => n.kind === 'raster-page-skipped');
      expect(skipped?.count).toBe(3);
      expect(skipped?.pageNumbers).toEqual([1, 2, 3]);
    });

    it('produces a document that reloads', async () => {
      const output = await service.exportToned(await textDoc(2), defaultToneOptions(), 'out.pdf');
      const reloaded = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(reloaded.getPageCount()).toBe(2);
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        service.exportToned(await textDoc(2), defaultToneOptions(), 'out.pdf', undefined, controller.signal)
      ).rejects.toThrow(/cancelled/i);
    });

    it('reports progress to completion', async () => {
      const seen: number[] = [];
      await service.exportToned(
        await textDoc(4),
        defaultToneOptions(),
        'out.pdf',
        p => seen.push(p.percent)
      );
      expect(seen[seen.length - 1]).toBe(100);
    });
  });
});
