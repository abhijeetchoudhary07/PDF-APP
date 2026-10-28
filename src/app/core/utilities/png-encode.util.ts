/**
 * A PNG writer that needs no canvas.
 *
 * The converters that have pixels in hand and need PNG bytes for pdf-lib were
 * all going through `canvas.toDataURL()`, which means a conversion silently
 * degrades to a blank page anywhere a 2D context is unavailable — a Web Worker,
 * a locked-down WebView, or a unit test. Writing the file directly removes that
 * failure mode and makes the output byte-for-byte predictable.
 *
 * The pixel data is stored in uncompressed DEFLATE blocks: a valid zlib stream
 * that needs no compressor. pdf-lib re-compresses the image when it saves the
 * document, so the final PDF is not larger for it.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Wraps raw bytes in a zlib stream made of stored (type 0) DEFLATE blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const out = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  let pos = 0;

  out[pos++] = 0x78; // CM = 8 (deflate), CINFO = 7 (32K window)
  out[pos++] = 0x01; // FCHECK so that (0x78 << 8 | 0x01) % 31 === 0

  for (let offset = 0; offset < blockCount * MAX_BLOCK; offset += MAX_BLOCK) {
    const length = Math.min(MAX_BLOCK, raw.length - offset);
    const isFinal = offset + MAX_BLOCK >= raw.length;
    out[pos++] = isFinal ? 1 : 0;
    out[pos++] = length & 0xff;
    out[pos++] = (length >> 8) & 0xff;
    out[pos++] = ~length & 0xff;
    out[pos++] = (~length >> 8) & 0xff;
    out.set(raw.subarray(offset, offset + length), pos);
    pos += length;
    if (isFinal) break;
  }

  const checksum = adler32(raw);
  out[pos++] = (checksum >>> 24) & 0xff;
  out[pos++] = (checksum >>> 16) & 0xff;
  out[pos++] = (checksum >>> 8) & 0xff;
  out[pos++] = checksum & 0xff;

  return out.subarray(0, pos);
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  const crcInput = out.subarray(4, 8 + body.length);
  view.setUint32(8 + body.length, crc32(crcInput), false);
  return out;
}

/**
 * Encodes RGBA pixels as an 8-bit truecolour-with-alpha PNG.
 *
 * `pixels` is row-major RGBA, exactly as an ImageData carries it.
 */
export function encodeRgbaPng(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  if (width <= 0 || height <= 0) {
    throw new Error('encodeRgbaPng needs a non-empty image');
  }
  const expected = width * height * 4;
  if (pixels.length < expected) {
    throw new Error(`encodeRgbaPng expected ${expected} bytes, received ${pixels.length}`);
  }

  // Each scanline is prefixed with its filter type; 0 means "no filter".
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride) as Uint8Array, y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0))
  ];

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const file = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    file.set(c, pos);
    pos += c.length;
  }
  return file;
}

/** Convenience for pixel sources that are already an ImageData-alike. */
export function encodeImageDataPng(image: {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}): Uint8Array {
  return encodeRgbaPng(image.data, image.width, image.height);
}
