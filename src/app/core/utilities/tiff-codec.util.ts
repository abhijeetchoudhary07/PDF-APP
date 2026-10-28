/**
 * TIFF stream codecs: LZW, PackBits and CCITT Group 3 / Group 4.
 *
 * These exist because the TIFF the app writes has to open somewhere else.
 * Setting Compression to 5 or 4 in the IFD and then writing the raw bytes
 * produces a file every viewer rejects, and a government upload portal that
 * asks for a G4 TIFF is not asking for a tag — it is asking for the bitstream
 * underneath it. The decoders are here for the same reason in reverse: a scan
 * that arrives from any real scanner is LZW, PackBits or G4, never raw.
 *
 * Everything is a pure function over byte arrays so it can be tested without
 * a canvas, a DOM or a file.
 */

/** MSB-first bit writer. TIFF LZW and CCITT both pack high bit first. */
class BitWriter {
  private bytes: number[] = [];
  private current = 0;
  private filled = 0;

  write(value: number, bitCount: number): void {
    for (let i = bitCount - 1; i >= 0; i--) {
      this.current = (this.current << 1) | ((value >> i) & 1);
      this.filled++;
      if (this.filled === 8) {
        this.bytes.push(this.current & 0xff);
        this.current = 0;
        this.filled = 0;
      }
    }
  }

  /** Pads the final byte with zero bits, as both formats require. */
  finish(): Uint8Array {
    if (this.filled > 0) {
      this.bytes.push((this.current << (8 - this.filled)) & 0xff);
      this.current = 0;
      this.filled = 0;
    }
    return new Uint8Array(this.bytes);
  }

  get bitLength(): number {
    return this.bytes.length * 8 + this.filled;
  }
}

/** MSB-first bit reader that reports when it runs past the end. */
class BitReader {
  private pos = 0; // bit position

  constructor(private readonly data: Uint8Array) {}

  readBit(): number {
    const byteIdx = this.pos >> 3;
    if (byteIdx >= this.data.length) {
      this.pos++;
      return -1;
    }
    const bit = (this.data[byteIdx] >> (7 - (this.pos & 7))) & 1;
    this.pos++;
    return bit;
  }

  read(bitCount: number): number {
    let value = 0;
    for (let i = 0; i < bitCount; i++) {
      const bit = this.readBit();
      if (bit < 0) return -1;
      value = (value << 1) | bit;
    }
    return value;
  }

  get exhausted(): boolean {
    return this.pos >= this.data.length * 8;
  }

  alignToByte(): void {
    this.pos = (this.pos + 7) & ~7;
  }

  tell(): number {
    return this.pos;
  }

  seek(bitPos: number): void {
    this.pos = bitPos;
  }
}

/**
 * T.4 separates rows with EOL (eleven zeros then a one), optionally preceded
 * by fill bits. Consumes one if it is there and rewinds if it is not, so the
 * same decoder handles strips written with and without them.
 */
function trySkipEol(reader: BitReader): boolean {
  const start = reader.tell();
  let zeros = 0;
  for (let i = 0; i < 72; i++) {
    const bit = reader.readBit();
    if (bit < 0) {
      reader.seek(start);
      return false;
    }
    if (bit === 0) {
      zeros++;
      continue;
    }
    if (zeros >= 11) return true;
    reader.seek(start);
    return false;
  }
  reader.seek(start);
  return false;
}

// ---------------------------------------------------------------------------
// LZW (TIFF 6.0 variant)
// ---------------------------------------------------------------------------

/*
 * Code-width switch points, verified against libtiff by round-tripping both
 * directions rather than reasoning about the spec's wording.
 *
 * The decoder defines the entry for code N only while reading code N+1, so its
 * table is always one behind the encoder's when it has to pick the width of
 * the next code. Hence the two thresholds differ by exactly one: writing at
 * 511 instead of 512 makes libtiff read a 10-bit code as 9 bits and report
 * "using code not yet in table".
 */
const LZW_ENCODER_WIDEN_AT = 512;
const LZW_DECODER_WIDEN_AT = 511;

const LZW_CLEAR = 256;
const LZW_EOI = 257;

/**
 * TIFF LZW, including the "early change" code-width bump that libtiff, Adobe
 * and every reader derived from them assume. Switching one code late is the
 * classic way to produce a file that looks right here and is garbage
 * everywhere else.
 */
export function lzwEncode(input: Uint8Array): Uint8Array {
  const writer = new BitWriter();
  let codeWidth = 9;
  let nextCode = 258;
  let table = new Map<string, number>();

  const reset = () => {
    table = new Map<string, number>();
    nextCode = 258;
    codeWidth = 9;
  };

  writer.write(LZW_CLEAR, codeWidth);

  if (input.length === 0) {
    writer.write(LZW_EOI, codeWidth);
    return writer.finish();
  }

  let omega = input[0];

  for (let i = 1; i < input.length; i++) {
    const k = input[i];
    const key = `${omega}.${k}`;
    const existing = table.get(key);
    if (existing !== undefined) {
      omega = existing;
      continue;
    }

    writer.write(omega, codeWidth);
    table.set(key, nextCode);
    nextCode++;

    // Early change: widen one code before the table is actually full.
    if (nextCode === LZW_ENCODER_WIDEN_AT) {
      codeWidth = 10;
    } else if (nextCode === LZW_ENCODER_WIDEN_AT + 512) {
      codeWidth = 11;
    } else if (nextCode === LZW_ENCODER_WIDEN_AT + 1536) {
      codeWidth = 12;
    } else if (nextCode === 4095) {
      writer.write(LZW_CLEAR, codeWidth);
      reset();
    }

    omega = k;
  }

  writer.write(omega, codeWidth);
  writer.write(LZW_EOI, codeWidth);
  return writer.finish();
}

export function lzwDecode(input: Uint8Array, expectedBytes?: number): Uint8Array {
  const out: number[] = [];
  const reader = new BitReader(input);

  let codeWidth = 9;
  let nextCode = 258;
  let dictionary: Uint8Array[] = [];
  let previous: Uint8Array | null = null;

  const resetDictionary = () => {
    dictionary = [];
    nextCode = 258;
    codeWidth = 9;
    previous = null;
  };

  const entryFor = (code: number): Uint8Array | null => {
    if (code < 256) return new Uint8Array([code]);
    const entry = dictionary[code - 258];
    return entry ?? null;
  };

  for (;;) {
    const code = reader.read(codeWidth);
    if (code < 0 || code === LZW_EOI) break;

    if (code === LZW_CLEAR) {
      resetDictionary();
      continue;
    }

    let entry: Uint8Array | null;
    if (previous === null) {
      entry = entryFor(code);
      if (!entry) break;
    } else {
      const known = entryFor(code);
      if (known) {
        entry = known;
      } else {
        // KwKwK: the code being defined right now.
        entry = new Uint8Array(previous.length + 1);
        entry.set(previous, 0);
        entry[previous.length] = previous[0];
      }
      const added = new Uint8Array(previous.length + 1);
      added.set(previous, 0);
      added[previous.length] = entry[0];
      dictionary[nextCode - 258] = added;
      nextCode++;
      // One entry earlier than the encoder's thresholds: the decoder adds its
      // entry for code N only while reading code N+1, so it is always one
      // behind when it has to choose the width of the next code to read.
      if (nextCode === LZW_DECODER_WIDEN_AT) codeWidth = 10;
      else if (nextCode === LZW_DECODER_WIDEN_AT + 512) codeWidth = 11;
      else if (nextCode === LZW_DECODER_WIDEN_AT + 1536) codeWidth = 12;
    }

    for (let i = 0; i < entry.length; i++) out.push(entry[i]);
    previous = entry;

    if (expectedBytes !== undefined && out.length >= expectedBytes) break;
  }

  return new Uint8Array(expectedBytes !== undefined ? out.slice(0, expectedBytes) : out);
}

// ---------------------------------------------------------------------------
// PackBits
// ---------------------------------------------------------------------------

export function packBitsDecode(input: Uint8Array, expectedBytes: number): Uint8Array {
  const out = new Uint8Array(expectedBytes);
  let outPos = 0;
  let i = 0;

  while (i < input.length && outPos < expectedBytes) {
    const header = input[i++];
    if (header === 128) continue; // no-op
    if (header < 128) {
      const count = header + 1;
      for (let n = 0; n < count && i < input.length && outPos < expectedBytes; n++) {
        out[outPos++] = input[i++];
      }
    } else {
      const count = 257 - header;
      if (i >= input.length) break;
      const value = input[i++];
      for (let n = 0; n < count && outPos < expectedBytes; n++) {
        out[outPos++] = value;
      }
    }
  }

  return out;
}

export function packBitsEncode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;

  while (i < input.length) {
    // Count a run of identical bytes.
    let runLength = 1;
    while (
      i + runLength < input.length &&
      runLength < 128 &&
      input[i + runLength] === input[i]
    ) {
      runLength++;
    }

    if (runLength >= 2) {
      out.push(257 - runLength, input[i]);
      i += runLength;
      continue;
    }

    // Otherwise gather a literal run, stopping before a run of 3+ repeats.
    let literalEnd = i;
    while (literalEnd < input.length && literalEnd - i < 128) {
      const isRunStart =
        literalEnd + 2 < input.length &&
        input[literalEnd] === input[literalEnd + 1] &&
        input[literalEnd] === input[literalEnd + 2];
      if (isRunStart && literalEnd > i) break;
      literalEnd++;
    }
    const count = literalEnd - i;
    out.push(count - 1);
    for (let n = 0; n < count; n++) out.push(input[i + n]);
    i = literalEnd;
  }

  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// Horizontal differencing predictor (TIFF tag 317 = 2)
// ---------------------------------------------------------------------------

export function undoHorizontalPredictor(
  data: Uint8Array,
  width: number,
  height: number,
  samplesPerPixel: number,
  bitsPerSample: number
): void {
  if (bitsPerSample !== 8) return; // only the 8-bit case is defined for bytes
  const rowBytes = width * samplesPerPixel;
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = samplesPerPixel; x < rowBytes; x++) {
      if (rowStart + x >= data.length) return;
      data[rowStart + x] = (data[rowStart + x] + data[rowStart + x - samplesPerPixel]) & 0xff;
    }
  }
}

// ---------------------------------------------------------------------------
// CCITT Group 3 / Group 4 (ITU-T T.4 / T.6)
// ---------------------------------------------------------------------------

type CodeTable = Record<number, [number, number]>; // runLength -> [bits, bitCount]

const parse = (table: Record<number, string>): CodeTable => {
  const out: CodeTable = {};
  for (const key of Object.keys(table)) {
    const bits = table[Number(key)];
    out[Number(key)] = [parseInt(bits, 2), bits.length];
  }
  return out;
};

/** T.4 terminating codes, white runs 0-63. */
const WHITE_TERMINATING = parse({
  0: '00110101', 1: '000111', 2: '0111', 3: '1000', 4: '1011', 5: '1100',
  6: '1110', 7: '1111', 8: '10011', 9: '10100', 10: '00111', 11: '01000',
  12: '001000', 13: '000011', 14: '110100', 15: '110101', 16: '101010',
  17: '101011', 18: '0100111', 19: '0001100', 20: '0001000', 21: '0010111',
  22: '0000011', 23: '0000100', 24: '0101000', 25: '0101011', 26: '0010011',
  27: '0100100', 28: '0011000', 29: '00000010', 30: '00000011', 31: '00011010',
  32: '00011011', 33: '00010010', 34: '00010011', 35: '00010100', 36: '00010101',
  37: '00010110', 38: '00010111', 39: '00101000', 40: '00101001', 41: '00101010',
  42: '00101011', 43: '00101100', 44: '00101101', 45: '00000100', 46: '00000101',
  47: '00001010', 48: '00001011', 49: '01010010', 50: '01010011', 51: '01010100',
  52: '01010101', 53: '00100100', 54: '00100101', 55: '01011000', 56: '01011001',
  57: '01011010', 58: '01011011', 59: '01001010', 60: '01001011', 61: '00110010',
  62: '00110011', 63: '00110100'
});

/** T.4 make-up codes for white runs, 64-1728. */
const WHITE_MAKEUP = parse({
  64: '11011', 128: '10010', 192: '010111', 256: '0110111', 320: '00110110',
  384: '00110111', 448: '01100100', 512: '01100101', 576: '01101000',
  640: '01100111', 704: '011001100', 768: '011001101', 832: '011010010',
  896: '011010011', 960: '011010100', 1024: '011010101', 1088: '011010110',
  1152: '011010111', 1216: '011011000', 1280: '011011001', 1344: '011011010',
  1408: '011011011', 1472: '010011000', 1536: '010011001', 1600: '010011010',
  1664: '011000', 1728: '010011011'
});

/** T.4 terminating codes, black runs 0-63. */
const BLACK_TERMINATING = parse({
  0: '0000110111', 1: '010', 2: '11', 3: '10', 4: '011', 5: '0011', 6: '0010',
  7: '00011', 8: '000101', 9: '000100', 10: '0000100', 11: '0000101',
  12: '0000111', 13: '00000100', 14: '00000111', 15: '000011000',
  16: '0000010111', 17: '0000011000', 18: '0000001000', 19: '00001100111',
  20: '00001101000', 21: '00001101100', 22: '00000110111', 23: '00000101000',
  24: '00000010111', 25: '00000011000', 26: '000011001010', 27: '000011001011',
  28: '000011001100', 29: '000011001101', 30: '000001101000', 31: '000001101001',
  32: '000001101010', 33: '000001101011', 34: '000011010010', 35: '000011010011',
  36: '000011010100', 37: '000011010101', 38: '000011010110', 39: '000011010111',
  40: '000001101100', 41: '000001101101', 42: '000011011010', 43: '000011011011',
  44: '000001010100', 45: '000001010101', 46: '000001010110', 47: '000001010111',
  48: '000001100100', 49: '000001100101', 50: '000001010010', 51: '000001010011',
  52: '000000100100', 53: '000000110111', 54: '000000111000', 55: '000000100111',
  56: '000000101000', 57: '000001011000', 58: '000001011001', 59: '000000101011',
  60: '000000101100', 61: '000001011010', 62: '000001100110', 63: '000001100111'
});

/** T.4 make-up codes for black runs, 64-1728. */
const BLACK_MAKEUP = parse({
  64: '0000001111', 128: '000011001000', 192: '000011001001',
  256: '000001011011', 320: '000000110011', 384: '000000110100',
  448: '000000110101', 512: '0000001101100', 576: '0000001101101',
  640: '0000001001010', 704: '0000001001011', 768: '0000001001100',
  832: '0000001001101', 896: '0000001110010', 960: '0000001110011',
  1024: '0000001110100', 1088: '0000001110101', 1152: '0000001110110',
  1216: '0000001110111', 1280: '0000001010010', 1344: '0000001010011',
  1408: '0000001010100', 1472: '0000001010101', 1536: '0000001011010',
  1600: '0000001011011', 1664: '0000001100100', 1728: '0000001100101'
});

/** Extended make-up codes 1792-2560, shared by both colours. */
const SHARED_MAKEUP = parse({
  1792: '00000001000', 1856: '00000001100', 1920: '00000001101',
  1984: '000000010010', 2048: '000000010011', 2112: '000000010100',
  2176: '000000010101', 2240: '000000010110', 2304: '000000010111',
  2368: '000000011100', 2432: '000000011101', 2496: '000000011110',
  2560: '000000011111'
});

/**
 * Decode lookup: "bitLength:bits" -> [runLength, isMakeup]. Built once, because
 * scanning the code tables per bit turns a 300 DPI page into a visible stall.
 */
function buildLookup(
  terminating: CodeTable,
  makeup: CodeTable
): Map<string, [number, boolean]> {
  const lookup = new Map<string, [number, boolean]>();
  for (const key of Object.keys(terminating)) {
    const run = Number(key);
    const [bits, length] = terminating[run];
    lookup.set(`${length}:${bits}`, [run, false]);
  }
  for (const table of [makeup, SHARED_MAKEUP]) {
    for (const key of Object.keys(table)) {
      const run = Number(key);
      const [bits, length] = table[run];
      lookup.set(`${length}:${bits}`, [run, true]);
    }
  }
  return lookup;
}

const WHITE_LOOKUP = buildLookup(WHITE_TERMINATING, WHITE_MAKEUP);
const BLACK_LOOKUP = buildLookup(BLACK_TERMINATING, BLACK_MAKEUP);

const MODE_PASS: [number, number] = [0b0001, 4];
const MODE_HORIZONTAL: [number, number] = [0b001, 3];
const MODE_V0: [number, number] = [0b1, 1];
const MODE_VR: [number, number][] = [MODE_V0, [0b011, 3], [0b000011, 6], [0b0000011, 7]];
const MODE_VL: [number, number][] = [MODE_V0, [0b010, 3], [0b000010, 6], [0b0000010, 7]];
const EOL: [number, number] = [0b000000000001, 12];

/**
 * Changing elements of one row: the x positions where colour flips, starting
 * from an implicit white pixel before x = 0. This is the representation both
 * T.4 and T.6 are defined over, so both coder and decoder speak it.
 */
function rowToChangingElements(row: Uint8Array, width: number): number[] {
  const changes: number[] = [];
  let colour = 0; // 0 = white
  for (let x = 0; x < width; x++) {
    const pixel = row[x] ? 1 : 0;
    if (pixel !== colour) {
      changes.push(x);
      colour = pixel;
    }
  }
  return changes;
}

/** b1 as T.6 defines it: first change on the reference line right of a0 with colour opposite to a0's. */
function findB1(reference: number[], a0: number, colour: number): number {
  let i = 0;
  // Changes at even indexes are white->black, i.e. start a black run.
  while (i < reference.length && reference[i] <= a0) i++;
  // The parity of i decides the colour the change introduces.
  while (i < reference.length && i % 2 !== colour) i++;
  return i < reference.length ? reference[i] : -1;
}

function findNextChange(reference: number[], after: number): number {
  for (const pos of reference) {
    if (pos > after) return pos;
  }
  return -1;
}

function writeRunLength(writer: BitWriter, runLength: number, isBlack: boolean): void {
  const terminating = isBlack ? BLACK_TERMINATING : WHITE_TERMINATING;
  const makeup = isBlack ? BLACK_MAKEUP : WHITE_MAKEUP;

  let remaining = runLength;

  // Extended make-up codes come first, in 2560 chunks.
  while (remaining >= 2624) {
    writer.write(SHARED_MAKEUP[2560][0], SHARED_MAKEUP[2560][1]);
    remaining -= 2560;
  }

  if (remaining >= 1792) {
    const base = Math.floor(remaining / 64) * 64;
    const code = SHARED_MAKEUP[base];
    if (code) {
      writer.write(code[0], code[1]);
      remaining -= base;
    }
  } else if (remaining >= 64) {
    const base = Math.floor(remaining / 64) * 64;
    const code = makeup[Math.min(base, 1728)];
    const used = Math.min(base, 1728);
    writer.write(code[0], code[1]);
    remaining -= used;
    // A run between 1728 and 1792 needs a second make-up pass.
    while (remaining >= 64) {
      const nextBase = Math.min(Math.floor(remaining / 64) * 64, 1728);
      const nextCode = makeup[nextBase];
      writer.write(nextCode[0], nextCode[1]);
      remaining -= nextBase;
    }
  }

  const term = terminating[remaining];
  writer.write(term[0], term[1]);
}

/**
 * Encodes a packed 1-bit-per-pixel bitmap (1 = black) as CCITT Group 4 (T.6).
 */
export function ccittEncodeG4(
  packedRows: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const writer = new BitWriter();
  const rowBytes = Math.ceil(width / 8);

  const unpackRow = (y: number): Uint8Array => {
    const row = new Uint8Array(width);
    const offset = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const byte = packedRows[offset + (x >> 3)] ?? 0;
      row[x] = (byte >> (7 - (x & 7))) & 1;
    }
    return row;
  };

  let reference: number[] = []; // imaginary all-white line above the first row

  for (let y = 0; y < height; y++) {
    const row = unpackRow(y);
    const coding = rowToChangingElements(row, width);

    let a0 = -1;
    let colour = 0; // colour of the run starting at a0

    for (;;) {
      // a1: next change on the coding line right of a0.
      let a1 = -1;
      for (let i = 0; i < coding.length; i++) {
        if (coding[i] > a0) {
          // Only a change introducing the opposite colour of `colour` counts.
          if (i % 2 === colour) {
            a1 = coding[i];
            break;
          }
        }
      }
      if (a1 < 0) a1 = width;

      const b1raw = findB1(reference, a0, colour);
      const b1 = b1raw < 0 ? width : b1raw;
      const b2raw = b1raw < 0 ? -1 : findNextChange(reference, b1);
      const b2 = b2raw < 0 ? width : b2raw;

      if (b2 < a1) {
        writer.write(MODE_PASS[0], MODE_PASS[1]);
        a0 = b2;
        continue;
      }

      const delta = a1 - b1;
      if (delta >= -3 && delta <= 3) {
        const code = delta >= 0 ? MODE_VR[delta] : MODE_VL[-delta];
        writer.write(code[0], code[1]);
        a0 = a1;
        colour ^= 1;
      } else {
        // Horizontal mode: two runs, then a0 lands on a2 with colour unchanged.
        let a2 = -1;
        for (let i = 0; i < coding.length; i++) {
          if (coding[i] > a1) {
            a2 = coding[i];
            break;
          }
        }
        if (a2 < 0) a2 = width;

        writer.write(MODE_HORIZONTAL[0], MODE_HORIZONTAL[1]);
        const start = a0 < 0 ? 0 : a0;
        writeRunLength(writer, a1 - start, colour === 1);
        writeRunLength(writer, a2 - a1, colour === 0);
        a0 = a2;
      }

      if (a0 >= width) break;
    }

    reference = coding;
  }

  // EOFB: two EOLs. Optional in a TIFF strip, but harmless and some readers
  // look for it.
  writer.write(EOL[0], EOL[1]);
  writer.write(EOL[0], EOL[1]);

  return writer.finish();
}

interface CcittDecodeOptions {
  /** -1 for G4 (T.6); 0 for pure 1D MH; > 0 for mixed 1D/2D G3. */
  k: number;
  /** T4Options/T6Options bit 2: each row starts on a byte boundary. */
  byteAlign?: boolean;
}

function readRunLength(reader: BitReader, isBlack: boolean): number {
  const lookup = isBlack ? BLACK_LOOKUP : WHITE_LOOKUP;
  let total = 0;

  for (;;) {
    let bits = 0;
    let length = 0;
    let matched: [number, boolean] | undefined;

    while (length < 14) {
      const bit = reader.readBit();
      if (bit < 0) return total > 0 ? total : -1;
      bits = (bits << 1) | bit;
      length++;
      matched = lookup.get(`${length}:${bits}`);
      if (matched) break;
    }

    if (!matched) return -1;
    total += matched[0];
    if (!matched[1]) return total;
  }
}

/**
 * Decodes CCITT G3/G4 into a packed 1-bit-per-pixel bitmap where 1 = black.
 * Returns what it managed to decode; a truncated or damaged strip leaves the
 * remaining rows white rather than throwing, because half a scan is more
 * useful to the person than an error.
 */
export function ccittDecode(
  input: Uint8Array,
  width: number,
  height: number,
  options: CcittDecodeOptions
): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(rowBytes * height);
  const reader = new BitReader(input);

  let reference: number[] = [];

  const writeRow = (y: number, changes: number[]) => {
    const offset = y * rowBytes;
    let colour = 0;
    let x = 0;
    for (let i = 0; i <= changes.length; i++) {
      const end = i < changes.length ? Math.min(changes[i], width) : width;
      if (colour === 1) {
        for (let px = x; px < end; px++) {
          out[offset + (px >> 3)] |= 1 << (7 - (px & 7));
        }
      }
      x = end;
      colour ^= 1;
      if (x >= width) break;
    }
  };

  const decode1DRow = (): number[] | null => {
    const changes: number[] = [];
    let pos = 0;
    let isBlack = false;
    let guard = 0;
    while (pos < width) {
      if (++guard > width * 2 + 16) return changes.length ? changes : null;
      const run = readRunLength(reader, isBlack);
      if (run < 0) return changes.length ? changes : null;
      pos += run;
      if (pos > width) pos = width;
      changes.push(pos);
      isBlack = !isBlack;
    }
    // The final change at `width` is implicit; drop it for a tidy list.
    if (changes.length && changes[changes.length - 1] >= width) changes.pop();
    return changes;
  };

  const decode2DRow = (): number[] | null => {
    const changes: number[] = [];
    let a0 = -1;
    let colour = 0;
    let guard = 0;

    while (a0 < width) {
      // A damaged strip can encode a vertical move that does not advance a0.
      // Bail out of the row rather than spinning.
      if (++guard > width * 2 + 16) return changes.length ? changes : null;
      // Read a mode code.
      let bits = 0;
      let length = 0;
      let mode: 'pass' | 'horizontal' | 'v' | 'eol' | null = null;
      let vDelta = 0;

      while (length < 14) {
        const bit = reader.readBit();
        if (bit < 0) return changes.length ? changes : null;
        bits = (bits << 1) | bit;
        length++;

        if (length === 1 && bits === 0b1) { mode = 'v'; vDelta = 0; break; }
        if (length === 3 && bits === 0b011) { mode = 'v'; vDelta = 1; break; }
        if (length === 3 && bits === 0b010) { mode = 'v'; vDelta = -1; break; }
        if (length === 3 && bits === 0b001) { mode = 'horizontal'; break; }
        if (length === 4 && bits === 0b0001) { mode = 'pass'; break; }
        if (length === 6 && bits === 0b000011) { mode = 'v'; vDelta = 2; break; }
        if (length === 6 && bits === 0b000010) { mode = 'v'; vDelta = -2; break; }
        if (length === 7 && bits === 0b0000011) { mode = 'v'; vDelta = 3; break; }
        if (length === 7 && bits === 0b0000010) { mode = 'v'; vDelta = -3; break; }
        if (length === 12 && bits === 0b000000000001) { mode = 'eol'; break; }
      }

      if (mode === null || mode === 'eol') {
        return changes.length ? changes : null;
      }

      const b1raw = findB1(reference, a0, colour);
      const b1 = b1raw < 0 ? width : b1raw;
      const b2raw = b1raw < 0 ? -1 : findNextChange(reference, b1);
      const b2 = b2raw < 0 ? width : b2raw;

      if (mode === 'pass') {
        a0 = b2;
        continue;
      }

      if (mode === 'v') {
        const a1 = Math.max(0, Math.min(b1 + vDelta, width));
        changes.push(a1);
        a0 = a1;
        colour ^= 1;
        continue;
      }

      // Horizontal mode.
      const run1 = readRunLength(reader, colour === 1);
      if (run1 < 0) return changes.length ? changes : null;
      const run2 = readRunLength(reader, colour === 0);
      if (run2 < 0) return changes.length ? changes : null;

      const start = a0 < 0 ? 0 : a0;
      const a1 = Math.min(start + run1, width);
      const a2 = Math.min(a1 + run2, width);
      changes.push(a1);
      changes.push(a2);
      a0 = a2;
    }

    return changes;
  };

  for (let y = 0; y < height; y++) {
    if (options.byteAlign) reader.alignToByte();
    if (reader.exhausted) break;

    let changes: number[] | null;

    if (options.k < 0) {
      // G4 carries no EOLs, but tolerate a stray one at a row boundary.
      trySkipEol(reader);
      changes = decode2DRow();
    } else if (options.k === 0) {
      trySkipEol(reader);
      changes = decode1DRow();
    } else {
      // Mixed 1D/2D: the bit after the EOL says which coding this row used.
      trySkipEol(reader);
      const flag = reader.readBit();
      changes = flag === 0 ? decode2DRow() : decode1DRow();
    }

    if (changes === null) break;
    writeRow(y, changes);
    reference = changes;
  }

  return out;
}

/**
 * FillOrder 2: bits within each byte are stored least-significant first. Rare,
 * but some fax hardware still writes it and the CCITT decoder reads MSB-first.
 */
export function reverseBitsInBytes(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let b = data[i];
    b = ((b & 0xf0) >> 4) | ((b & 0x0f) << 4);
    b = ((b & 0xcc) >> 2) | ((b & 0x33) << 2);
    b = ((b & 0xaa) >> 1) | ((b & 0x55) << 1);
    out[i] = b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// DEFLATE (RFC 1950/1951) — decode only
// ---------------------------------------------------------------------------

/**
 * Inflate, for TIFFs stored with Compression 8 / 32946.
 *
 * Hand-rolled rather than pulled from a package: pako is only here as a
 * transitive dependency of jszip, and taking a direct import on something
 * nothing declares is how a working build breaks on the next install.
 */
export function inflate(input: Uint8Array): Uint8Array {
  // Skip a zlib header when present (CMF/FLG with a valid check).
  let start = 0;
  if (
    input.length > 2 &&
    (input[0] & 0x0f) === 8 &&
    ((input[0] << 8) | input[1]) % 31 === 0
  ) {
    start = 2;
  }
  return inflateRaw(input.subarray(start));
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13
];
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
];

interface Huffman {
  counts: Int32Array;
  symbols: Int32Array;
}

function buildHuffman(lengths: Uint8Array, count: number): Huffman {
  const counts = new Int32Array(16);
  for (let i = 0; i < count; i++) counts[lengths[i]]++;
  counts[0] = 0;

  const offsets = new Int32Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];

  const symbols = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    if (lengths[i]) symbols[offsets[lengths[i]]++] = i;
  }
  return { counts, symbols };
}

export function inflateRaw(input: Uint8Array): Uint8Array {
  let bitPos = 0;
  const out: number[] = [];

  const readBit = (): number => {
    const byteIdx = bitPos >> 3;
    if (byteIdx >= input.length) throw new Error('inflate: unexpected end of stream');
    const bit = (input[byteIdx] >> (bitPos & 7)) & 1;
    bitPos++;
    return bit;
  };
  const readBits = (n: number): number => {
    let value = 0;
    for (let i = 0; i < n; i++) value |= readBit() << i;
    return value;
  };
  const decodeSymbol = (tree: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length < 16; length++) {
      code |= readBit();
      const count = tree.counts[length];
      if (code - first < count) return tree.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('inflate: bad Huffman code');
  };

  let fixedLiteral: Huffman | null = null;
  let fixedDistance: Huffman | null = null;
  const buildFixed = () => {
    const literalLengths = new Uint8Array(288);
    for (let i = 0; i < 144; i++) literalLengths[i] = 8;
    for (let i = 144; i < 256; i++) literalLengths[i] = 9;
    for (let i = 256; i < 280; i++) literalLengths[i] = 7;
    for (let i = 280; i < 288; i++) literalLengths[i] = 8;
    fixedLiteral = buildHuffman(literalLengths, 288);
    const distanceLengths = new Uint8Array(30).fill(5);
    fixedDistance = buildHuffman(distanceLengths, 30);
  };

  for (;;) {
    const isFinal = readBit();
    const type = readBits(2);

    if (type === 0) {
      // Stored: skip to the byte boundary, then LEN/NLEN.
      bitPos = (bitPos + 7) & ~7;
      const bytePos = bitPos >> 3;
      if (bytePos + 4 > input.length) throw new Error('inflate: truncated stored block');
      const len = input[bytePos] | (input[bytePos + 1] << 8);
      bitPos += 32;
      for (let i = 0; i < len; i++) {
        const at = (bitPos >> 3) + i;
        if (at >= input.length) throw new Error('inflate: truncated stored data');
        out.push(input[at]);
      }
      bitPos += len * 8;
    } else if (type === 1 || type === 2) {
      let literalTree: Huffman;
      let distanceTree: Huffman;

      if (type === 1) {
        if (!fixedLiteral || !fixedDistance) buildFixed();
        literalTree = fixedLiteral!;
        distanceTree = fixedDistance!;
      } else {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;

        const codeLengthLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          codeLengthLengths[CODE_LENGTH_ORDER[i]] = readBits(3);
        }
        const codeLengthTree = buildHuffman(codeLengthLengths, 19);

        const lengths = new Uint8Array(hlit + hdist);
        let i = 0;
        while (i < hlit + hdist) {
          const symbol = decodeSymbol(codeLengthTree);
          if (symbol < 16) {
            lengths[i++] = symbol;
          } else if (symbol === 16) {
            const previous = i > 0 ? lengths[i - 1] : 0;
            const repeat = 3 + readBits(2);
            for (let n = 0; n < repeat && i < lengths.length; n++) lengths[i++] = previous;
          } else if (symbol === 17) {
            const repeat = 3 + readBits(3);
            for (let n = 0; n < repeat && i < lengths.length; n++) lengths[i++] = 0;
          } else {
            const repeat = 11 + readBits(7);
            for (let n = 0; n < repeat && i < lengths.length; n++) lengths[i++] = 0;
          }
        }

        literalTree = buildHuffman(lengths.subarray(0, hlit), hlit);
        distanceTree = buildHuffman(lengths.subarray(hlit), hdist);
      }

      for (;;) {
        const symbol = decodeSymbol(literalTree);
        if (symbol === 256) break;
        if (symbol < 256) {
          out.push(symbol);
          continue;
        }
        const lengthIdx = symbol - 257;
        if (lengthIdx >= LENGTH_BASE.length) throw new Error('inflate: bad length symbol');
        const length = LENGTH_BASE[lengthIdx] + readBits(LENGTH_EXTRA[lengthIdx]);
        const distSymbol = decodeSymbol(distanceTree);
        if (distSymbol >= DIST_BASE.length) throw new Error('inflate: bad distance symbol');
        const distance = DIST_BASE[distSymbol] + readBits(DIST_EXTRA[distSymbol]);
        const from = out.length - distance;
        if (from < 0) throw new Error('inflate: distance before start of stream');
        for (let n = 0; n < length; n++) out.push(out[from + n]);
      }
    } else {
      throw new Error('inflate: reserved block type');
    }

    if (isFinal) break;
  }

  return new Uint8Array(out);
}
