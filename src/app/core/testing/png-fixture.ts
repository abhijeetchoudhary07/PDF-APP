/**
 * A PNG builder for the Part F specs.
 *
 * The image passes need real image XObjects to count, measure, resample and
 * dedupe, and a 1x1 placeholder cannot carry a resolution. Writing the bytes
 * here keeps the fixtures exact — a known pixel size, a known colour and
 * therefore a known compressed length — without pulling in an encoder or
 * checking binary blobs into the repository.
 *
 * Only what pdf-lib's PNG embedder reads is produced: 8-bit truecolour, no
 * interlacing, one IDAT. Test-only; nothing here ships in the app bundle.
 */

/** CRC-32 as the PNG spec defines it. */
function crc32(bytes: Uint8Array): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0);
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const body = concat([typeBytes, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

/**
 * zlib-deflates with Node's zlib.
 *
 * `require` rather than a top-level import so this file stays importable from
 * a browser-targeted spec run; it is only ever called under Node.
 */
function deflate(data: Uint8Array): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('node:zlib') as typeof import('node:zlib');
  return new Uint8Array(zlib.deflateSync(Buffer.from(data)));
}

export interface PngFixtureOptions {
  width: number;
  height: number;
  /** Flat fill colour. Ignored when `noise` is set. */
  rgb?: [number, number, number];
  /**
   * Fills with a deterministic pattern derived from this seed, so two images
   * can be the same size and still have different bytes — which is what a
   * dedupe test needs for its negative case.
   */
  noiseSeed?: number;
}

/** A PNG with the given pixel size and contents. */
export function makePng(options: PngFixtureOptions): Uint8Array {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const [r, g, b] = options.rgb ?? [200, 40, 40];

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = 1 + width * 3;
  const raw = new Uint8Array(height * stride);

  // A tiny deterministic generator, so a seeded image is reproducible.
  let state = (options.noiseSeed ?? 0) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state >>> 16) & 0xff;
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const offset = rowStart + 1 + x * 3;
      if (options.noiseSeed === undefined) {
        raw[offset] = r;
        raw[offset + 1] = g;
        raw[offset + 2] = b;
      } else {
        raw[offset] = next();
        raw[offset + 1] = next();
        raw[offset + 2] = next();
      }
    }
  }

  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0))
  ]);
}
