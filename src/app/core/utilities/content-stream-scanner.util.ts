/**
 * A minimal reader for PDF content streams.
 *
 * Nothing in pdf-lib parses an existing content stream — it only writes them —
 * and the size tools need one thing from inside: **where each image is drawn
 * and how big it ends up on the page**. Without that there is no such thing as
 * an image's resolution. A 2000px-wide photo is 500 DPI on a thumbnail and
 * 170 DPI across a full page, and a DPI ceiling that cannot tell those apart
 * either destroys the thumbnail or leaves the photo alone.
 *
 * This is deliberately not a general interpreter. It tracks the graphics state
 * stack and the current transformation matrix, and records the matrix in force
 * at each `Do`. Everything else — colours, text, paths, shading — is skipped
 * as fast as it can be recognised.
 *
 * The two things that make a naive scanner wrong, both handled below:
 *
 *   • **Inline images.** `BI … ID <raw bytes> EI` puts arbitrary binary in the
 *     middle of the stream. Tokenising through it finds operators that are not
 *     there. The scan jumps from `ID` to the next `EI` delimiter instead.
 *   • **Strings.** `(a) Tj` is fine, but `(\) ) Tj` and nested parentheses are
 *     legal too, so string skipping has to count depth and honour escapes.
 */

/** A 2-D affine matrix, in the order a `cm` operator writes it. */
export type ContentMatrix = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: ContentMatrix = [1, 0, 0, 1, 0, 0];

/** One `Do` the scan found, with the matrix in force when it ran. */
export interface XObjectDraw {
  /** The resource name, without the leading slash. */
  name: string;
  matrix: ContentMatrix;
  /**
   * Width the drawn unit square occupies, in points. An image XObject is
   * always drawn into the unit square, so this is its size on the page.
   */
  widthPt: number;
  heightPt: number;
}

export interface ContentScanResult {
  draws: XObjectDraw[];
  /** Inline images found. They cannot be re-encoded, only counted. */
  inlineImageCount: number;
  /** True when the scan stopped early at its own operator budget. */
  truncated: boolean;
}

/** `m2 × m1` — the composition a `cm` operator performs onto the CTM. */
export function multiplyMatrix(m: ContentMatrix, ctm: ContentMatrix): ContentMatrix {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5]
  ];
}

/**
 * How large the unit square becomes under a matrix.
 *
 * The two basis vectors are (a, b) and (c, d); their lengths are the drawn
 * width and height. Taking the lengths rather than |a| and |d| is what makes
 * a rotated placement measure correctly instead of collapsing to zero.
 */
export function unitSquareSize(matrix: ContentMatrix): { width: number; height: number } {
  return {
    width: Math.hypot(matrix[0], matrix[1]),
    height: Math.hypot(matrix[2], matrix[3])
  };
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const isWhitespace = (byte: number) => WHITESPACE.has(byte);
const isDelimiter = (byte: number) => DELIMITERS.has(byte);
const isRegular = (byte: number) => !isWhitespace(byte) && !isDelimiter(byte);

export class ContentStreamScanner {
  /** Operators to read before giving up, so a huge stream cannot hang a phone. */
  static readonly MAX_OPERATORS = 400000;

  /**
   * Walks a content stream and reports every XObject draw with its matrix.
   *
   * `initialMatrix` is how a form XObject's own /Matrix and the CTM at its
   * call site are carried into a nested scan.
   */
  static scan(
    bytes: Uint8Array,
    initialMatrix: ContentMatrix = IDENTITY_MATRIX
  ): ContentScanResult {
    const draws: XObjectDraw[] = [];
    let inlineImageCount = 0;
    let truncated = false;

    let ctm: ContentMatrix = [...initialMatrix] as ContentMatrix;
    const stack: ContentMatrix[] = [];

    /* Operands seen since the last operator. Only numbers and names matter. */
    let numbers: number[] = [];
    let lastName: string | undefined;

    let i = 0;
    let operators = 0;
    const length = bytes.length;

    const readToken = (): { kind: 'number' | 'name' | 'operator' | 'skip' | 'end'; value?: string } => {
      // Whitespace and comments.
      while (i < length) {
        const byte = bytes[i];
        if (isWhitespace(byte)) {
          i++;
          continue;
        }
        if (byte === 0x25) {
          // % comment, to end of line
          while (i < length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
          continue;
        }
        break;
      }
      if (i >= length) return { kind: 'end' };

      const byte = bytes[i];

      // Name: /Foo
      if (byte === 0x2f) {
        i++;
        const start = i;
        while (i < length && isRegular(bytes[i])) i++;
        return { kind: 'name', value: latin1(bytes, start, i) };
      }

      // Literal string: ( ... ), with escapes and nesting.
      if (byte === 0x28) {
        i++;
        let depth = 1;
        while (i < length && depth > 0) {
          const c = bytes[i];
          if (c === 0x5c) {
            i += 2;
            continue;
          }
          if (c === 0x28) depth++;
          else if (c === 0x29) depth--;
          i++;
        }
        return { kind: 'skip' };
      }

      // Hex string or dictionary.
      if (byte === 0x3c) {
        if (bytes[i + 1] === 0x3c) {
          // << … >> — skip with depth, so a nested dict does not end it early.
          i += 2;
          let depth = 1;
          while (i < length && depth > 0) {
            if (bytes[i] === 0x3c && bytes[i + 1] === 0x3c) {
              depth++;
              i += 2;
              continue;
            }
            if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
              depth--;
              i += 2;
              continue;
            }
            i++;
          }
          return { kind: 'skip' };
        }
        while (i < length && bytes[i] !== 0x3e) i++;
        i++;
        return { kind: 'skip' };
      }

      // Array brackets and block braces carry no operand this cares about.
      if (byte === 0x5b || byte === 0x5d || byte === 0x7b || byte === 0x7d) {
        i++;
        return { kind: 'skip' };
      }

      // Number.
      if ((byte >= 0x30 && byte <= 0x39) || byte === 0x2b || byte === 0x2d || byte === 0x2e) {
        const start = i;
        i++;
        while (i < length && isRegular(bytes[i])) i++;
        return { kind: 'number', value: latin1(bytes, start, i) };
      }

      // Anything else regular is an operator keyword.
      if (isRegular(byte)) {
        const start = i;
        while (i < length && isRegular(bytes[i])) i++;
        return { kind: 'operator', value: latin1(bytes, start, i) };
      }

      i++;
      return { kind: 'skip' };
    };

    while (i < length) {
      if (operators > this.MAX_OPERATORS) {
        truncated = true;
        break;
      }

      const token = readToken();
      if (token.kind === 'end') break;

      if (token.kind === 'number') {
        const parsed = Number(token.value);
        numbers.push(Number.isFinite(parsed) ? parsed : 0);
        // Only the last six can ever matter, to `cm`.
        if (numbers.length > 8) numbers = numbers.slice(-8);
        continue;
      }

      if (token.kind === 'name') {
        lastName = token.value;
        continue;
      }

      if (token.kind === 'skip') continue;

      operators++;
      const op = token.value;

      switch (op) {
        case 'q':
          stack.push([...ctm] as ContentMatrix);
          break;

        case 'Q': {
          const restored = stack.pop();
          if (restored) ctm = restored;
          break;
        }

        case 'cm': {
          if (numbers.length >= 6) {
            const m = numbers.slice(-6) as ContentMatrix;
            ctm = multiplyMatrix(m, ctm);
          }
          break;
        }

        case 'Do': {
          if (lastName) {
            const size = unitSquareSize(ctm);
            draws.push({
              name: lastName,
              matrix: [...ctm] as ContentMatrix,
              widthPt: size.width,
              heightPt: size.height
            });
          }
          break;
        }

        case 'BI': {
          /*
           * An inline image's raw bytes follow `ID` and are not tokenisable.
           * Jump to the `EI` that closes it — checking that what follows is a
           * delimiter, because the two bytes "EI" also occur inside binary
           * data often enough to matter.
           */
          inlineImageCount++;
          const idAt = findKeyword(bytes, i, 'ID');
          if (idAt < 0) {
            i = length;
            break;
          }
          i = idAt + 3; // past "ID" and the single whitespace that follows it

          let found = -1;
          for (let j = i; j < length - 1; j++) {
            if (bytes[j] === 0x45 && bytes[j + 1] === 0x49) {
              const before = j === 0 ? 0x20 : bytes[j - 1];
              const after = j + 2 < length ? bytes[j + 2] : 0x20;
              if (isWhitespace(before) && (isWhitespace(after) || isDelimiter(after))) {
                found = j;
                break;
              }
            }
          }
          i = found < 0 ? length : found + 2;
          break;
        }

        default:
          break;
      }

      numbers = [];
      lastName = undefined;
    }

    return { draws, inlineImageCount, truncated };
  }
}

/** Decodes a byte range as Latin-1, which is what content-stream tokens are. */
function latin1(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Index of the next occurrence of an ASCII keyword, or -1. */
function findKeyword(bytes: Uint8Array, from: number, keyword: string): number {
  const first = keyword.charCodeAt(0);
  for (let i = from; i <= bytes.length - keyword.length; i++) {
    if (bytes[i] !== first) continue;
    let matched = true;
    for (let j = 1; j < keyword.length; j++) {
      if (bytes[i + j] !== keyword.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}
