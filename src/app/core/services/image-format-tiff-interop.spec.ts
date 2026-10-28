/**
 * The TIFF reader against files this app did not write.
 *
 * Every fixture here came out of libtiff via Pillow, which is what produces
 * the TIFFs that arrive from scanners and that government upload portals
 * expect back. Our own encoder agreeing with our own decoder proves nothing
 * about either, so the interop direction is tested separately from the
 * round-trip in tiff-codec.spec.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ImageFormatService } from './image-format.service';
import {
  TIFF_FIXTURES,
  FIXTURE_WIDTH,
  FIXTURE_HEIGHT,
  fixtureRgb,
  fixtureIsBlack
} from '../testing/tiff-interop-fixtures';

function toArrayBuffer(base64: string): ArrayBuffer {
  const binary = Buffer.from(base64, 'base64');
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

describe('ImageFormatService TIFF interop', () => {
  let service: ImageFormatService;

  beforeEach(() => {
    service = new ImageFormatService();
  });

  const rgbFixtures = ['lzw', 'lzwPredictor', 'lzwMultiStrip', 'packBits', 'deflate', 'uncompressedBigEndian'];

  for (const name of rgbFixtures) {
    it(`decodes the ${name} fixture pixel-exactly`, () => {
      const pages = service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES[name]));

      expect(pages.length).toBe(1);
      expect(pages[0].width).toBe(FIXTURE_WIDTH);
      expect(pages[0].height).toBe(FIXTURE_HEIGHT);
      expect(pages[0].unsupported).toBeUndefined();

      const data = pages[0].data.data;
      let mismatches = 0;
      let firstBad = '';
      for (let y = 0; y < FIXTURE_HEIGHT; y++) {
        for (let x = 0; x < FIXTURE_WIDTH; x++) {
          const [r, g, b] = fixtureRgb(x, y);
          const at = (y * FIXTURE_WIDTH + x) * 4;
          if (data[at] !== r || data[at + 1] !== g || data[at + 2] !== b) {
            mismatches++;
            if (!firstBad) {
              firstBad = `(${x},${y}) got ${data[at]},${data[at + 1]},${data[at + 2]} want ${r},${g},${b}`;
            }
          }
          expect(data[at + 3]).toBe(255);
        }
      }
      expect(mismatches, `${mismatches} pixels differ; first ${firstBad}`).toBe(0);
    });
  }

  for (const name of ['group4', 'group3']) {
    it(`decodes the ${name} fixture pixel-exactly`, () => {
      const pages = service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES[name]));

      expect(pages.length).toBe(1);
      expect(pages[0].width).toBe(FIXTURE_WIDTH);

      const data = pages[0].data.data;
      let mismatches = 0;
      let firstBad = '';
      for (let y = 0; y < FIXTURE_HEIGHT; y++) {
        for (let x = 0; x < FIXTURE_WIDTH; x++) {
          const at = (y * FIXTURE_WIDTH + x) * 4;
          const gotBlack = data[at] < 128;
          if (gotBlack !== fixtureIsBlack(x, y)) {
            mismatches++;
            if (!firstBad) firstBad = `(${x},${y}) got ${data[at]}`;
          }
        }
      }
      expect(mismatches, `${mismatches} pixels differ; first ${firstBad}`).toBe(0);
    });
  }

  it('reads the resolution libtiff wrote', () => {
    expect(service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['lzw']))[0].dpi).toBe(200);
    expect(service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['group4']))[0].dpi).toBe(200);
  });

  it('reports the compression each page used', () => {
    expect(service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['lzw']))[0].compression).toBe(5);
    expect(service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['packBits']))[0].compression).toBe(32773);
    expect(service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['group4']))[0].compression).toBe(4);
  });

  it('splits a file written as several strips into one continuous page', () => {
    // RowsPerStrip 4 over 32 rows is eight strips; reading only the first
    // strip offset is the classic way this goes wrong.
    const pages = service.decodeTiffPages(toArrayBuffer(TIFF_FIXTURES['lzwMultiStrip']));
    expect(pages.length).toBe(1);
    const data = pages[0].data.data;
    const lastRow = (FIXTURE_HEIGHT - 1) * FIXTURE_WIDTH * 4;
    const [r, g, b] = fixtureRgb(0, FIXTURE_HEIGHT - 1);
    expect([data[lastRow], data[lastRow + 1], data[lastRow + 2]]).toEqual([r, g, b]);
  });

  it('rejects a file that is not a TIFF', () => {
    expect(() => service.decodeTiffPages(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer)).toThrow();
    expect(() => service.decodeTiffPages(new Uint8Array([0x49, 0x49, 9, 9, 0, 0, 0, 8]).buffer as ArrayBuffer)).toThrow(/magic/);
  });

  it('writes what the Compression tag claims', async () => {
    // A tag that lies is the bug this replaced: 'lzw' used to mean "write 5 in
    // the IFD and then emit raw bytes", which opens nowhere.
    const frame = {
      width: 40,
      height: 24,
      data: new Uint8ClampedArray(40 * 24 * 4).fill(255)
    };
    const uncompressed = await service.encodeMultiPageTiff([frame], { compression: 'none' }).arrayBuffer();
    const lzw = await service.encodeMultiPageTiff([frame], { compression: 'lzw' }).arrayBuffer();
    const g4 = await service.encodeMultiPageTiff([frame], { compression: 'g4' }).arrayBuffer();

    expect(lzw.byteLength).toBeLessThan(uncompressed.byteLength / 4);
    expect(g4.byteLength).toBeLessThan(uncompressed.byteLength / 10);

    // And all three still decode back to the same white page.
    for (const buffer of [uncompressed, lzw, g4]) {
      const page = service.decodeTiffPages(buffer)[0];
      expect(page.width).toBe(40);
      expect(page.height).toBe(24);
      expect(page.data.data[0]).toBe(255);
      expect(page.unsupported).toBeUndefined();
    }
  });

  it('writes the requested DPI into the resolution tags', async () => {
    const frame = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) };
    for (const dpi of [72, 150, 300]) {
      const buffer = await service.encodeMultiPageTiff([frame], { dpi }).arrayBuffer();
      expect(service.decodeTiffPages(buffer)[0].dpi).toBe(dpi);
    }
  });
});
