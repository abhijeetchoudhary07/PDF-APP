import { describe, it, expect } from 'vitest';
import {
  lzwEncode,
  lzwDecode,
  packBitsEncode,
  packBitsDecode,
  ccittEncodeG4,
  ccittDecode,
  inflate,
  reverseBitsInBytes,
  undoHorizontalPredictor
} from './tiff-codec.util';

/** Deterministic PRNG so a failure is always the same failure. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function packBilevel(width: number, height: number, isBlack: (x: number, y: number) => boolean): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const packed = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) packed[y * rowBytes + (x >> 3)] |= 1 << (7 - (x & 7));
    }
  }
  return packed;
}

describe('TIFF LZW', () => {
  it('round-trips payloads that cross every code-width boundary', () => {
    // 70000 bytes of mixed entropy fills the table past 511, 1023 and 2047
    // entries, which is where an off-by-one in the width switch shows up.
    for (const size of [0, 1, 2, 17, 255, 4096, 70000]) {
      const rnd = mulberry(size + 1);
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = rnd() < 0.5 ? 0 : Math.floor(rnd() * 256);
      }
      const decoded = lzwDecode(lzwEncode(input), size);
      expect(Array.from(decoded), `size ${size}`).toEqual(Array.from(input));
    }
  });

  it('round-trips a long single-value run', () => {
    // Exercises the table reset at 4095 entries without random data.
    const input = new Uint8Array(200000).fill(0x5a);
    for (let i = 0; i < input.length; i += 7) input[i] = i & 0xff;
    expect(Array.from(lzwDecode(lzwEncode(input), input.length))).toEqual(Array.from(input));
  });

  it('starts with a clear code', () => {
    const encoded = lzwEncode(new Uint8Array([1, 2, 3]));
    // 9-bit 256 = 1 0000 0000 -> first byte 0x80, next byte's top bit 0.
    expect(encoded[0]).toBe(0x80);
  });

  it('stops at the requested byte count', () => {
    const input = new Uint8Array(1000).fill(7);
    expect(lzwDecode(lzwEncode(input), 10).length).toBe(10);
  });
});

describe('PackBits', () => {
  it('round-trips runs and literals', () => {
    for (const size of [1, 3, 100, 5000]) {
      const rnd = mulberry(size);
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) input[i] = rnd() < 0.6 ? 200 : Math.floor(rnd() * 256);
      expect(Array.from(packBitsDecode(packBitsEncode(input), size)), `size ${size}`).toEqual(
        Array.from(input)
      );
    }
  });

  it('compresses a constant run', () => {
    const input = new Uint8Array(500).fill(9);
    expect(packBitsEncode(input).byteLength).toBeLessThan(20);
  });

  it('survives a truncated stream', () => {
    const decoded = packBitsDecode(new Uint8Array([0xfe]), 8);
    expect(decoded.length).toBe(8);
  });
});

describe('CCITT Group 4', () => {
  const shapes: [number, number][] = [[64, 40], [101, 73], [17, 5], [320, 200], [8, 1]];

  it('round-trips structured bitmaps', () => {
    for (const [width, height] of shapes) {
      const rnd = mulberry(width * height);
      const isBlack = (x: number, y: number) =>
        y % 17 === 0 || (x > width * 0.3 && x < width * 0.35) || rnd() < 0.08;
      const packed = packBilevel(width, height, isBlack);
      const decoded = ccittDecode(ccittEncodeG4(packed, width, height), width, height, { k: -1 });
      expect(Array.from(decoded), `${width}x${height}`).toEqual(Array.from(packed));
    }
  });

  it('round-trips an all-white and an all-black page', () => {
    for (const fill of [false, true]) {
      const packed = packBilevel(200, 50, () => fill);
      const encoded = ccittEncodeG4(packed, 200, 50);
      expect(Array.from(ccittDecode(encoded, 200, 50, { k: -1 }))).toEqual(Array.from(packed));
      // A uniform page is where 2D coding should win big.
      expect(encoded.byteLength).toBeLessThan(200);
    }
  });

  it('round-trips runs longer than the 2560 make-up code', () => {
    // 4000px of white then black forces the extended make-up codes to repeat.
    const width = 8000;
    const packed = packBilevel(width, 3, (x) => x >= 4000);
    const decoded = ccittDecode(ccittEncodeG4(packed, width, 3), width, 3, { k: -1 });
    expect(Array.from(decoded)).toEqual(Array.from(packed));
  });

  it('compresses a scanned-page-like bitmap substantially', () => {
    const width = 1700;
    const height = 2200;
    const packed = packBilevel(width, height, (x, y) => y % 40 < 6 && x % 13 < 7);
    const encoded = ccittEncodeG4(packed, width, height);
    expect(encoded.byteLength).toBeLessThan(packed.byteLength / 4);
    expect(Array.from(ccittDecode(encoded, width, height, { k: -1 }))).toEqual(Array.from(packed));
  });

  it('returns a blank raster rather than hanging on garbage', () => {
    const rnd = mulberry(4242);
    const garbage = new Uint8Array(400);
    for (let i = 0; i < garbage.length; i++) garbage[i] = Math.floor(rnd() * 256);
    const decoded = ccittDecode(garbage, 64, 40, { k: -1 });
    expect(decoded.length).toBe(Math.ceil(64 / 8) * 40);
  });
});

describe('inflate', () => {
  it('reads zlib and raw deflate streams', async () => {
    const zlib = await import('zlib');
    for (const size of [1, 500, 40000]) {
      const rnd = mulberry(size + 3);
      const input = Buffer.alloc(size);
      for (let i = 0; i < size; i++) input[i] = rnd() < 0.7 ? 65 : Math.floor(rnd() * 256);
      expect(Array.from(inflate(new Uint8Array(zlib.deflateSync(input))))).toEqual(Array.from(input));
      expect(Array.from(inflate(new Uint8Array(zlib.deflateRawSync(input))))).toEqual(
        Array.from(input)
      );
    }
  });

  it('reads a stored (uncompressed) deflate block', async () => {
    const zlib = await import('zlib');
    const input = Buffer.from('a stored block stays verbatim');
    const stored = zlib.deflateSync(input, { level: 0 });
    expect(Buffer.from(inflate(new Uint8Array(stored))).toString()).toBe(input.toString());
  });

  it('throws on a truncated stream instead of looping', async () => {
    const zlib = await import('zlib');
    const full = zlib.deflateSync(Buffer.alloc(5000, 3));
    expect(() => inflate(new Uint8Array(full.subarray(0, 8)))).toThrow();
  });
});

describe('bit and predictor helpers', () => {
  it('reverses bits within bytes', () => {
    expect(Array.from(reverseBitsInBytes(new Uint8Array([0b10000000, 0b00000001, 0b10110010])))).toEqual([
      0b00000001, 0b10000000, 0b01001101
    ]);
    const rnd = mulberry(8);
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
    expect(Array.from(reverseBitsInBytes(reverseBitsInBytes(data)))).toEqual(Array.from(data));
  });

  it('undoes horizontal differencing per row', () => {
    // Two rows, 3 pixels, 1 sample: rows must not bleed into each other.
    const data = new Uint8Array([10, 5, 5, 200, 1, 1]);
    undoHorizontalPredictor(data, 3, 2, 1, 8);
    expect(Array.from(data)).toEqual([10, 15, 20, 200, 201, 202]);
  });

  it('leaves non-8-bit data alone', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    undoHorizontalPredictor(data, 2, 2, 1, 1);
    expect(Array.from(data)).toEqual([1, 2, 3, 4]);
  });
});
