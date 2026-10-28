import type { ContentMatrix } from './content-stream-scanner.util';
import { IDENTITY_MATRIX, multiplyMatrix } from './content-stream-scanner.util';

/**
 * Finding — and silencing — the operators that draw text on a page.
 *
 * Covering a line of text with a white rectangle hides it from the eye and
 * from nothing else. The glyph-drawing operators are still in the content
 * stream, so a search, a copy-paste or any text extractor still returns the
 * old words. For a find-and-replace that is simply wrong: the name someone
 * replaced is still in the file, in the text layer, where the next person to
 * press Ctrl+F will meet it.
 *
 * So after covering a run, the operator that drew it has to be silenced. The
 * hard part is finding it. The string in the stream is encoded in whatever
 * encoding the run's font uses — often a subset CID map, which means the
 * bytes for "Alpha" are not `Alpha` and cannot be guessed. Matching by
 * *position* avoids the question entirely: track the text matrix the way a
 * viewer does, and every show-text operator can be placed on the page
 * without decoding a single glyph.
 *
 * What this does NOT do, and the reason the caller gets a boolean rather than
 * a promise of success: it only silences an operator when nothing else is
 * drawn after it inside the same BT/ET text object. Blanking an operator
 * drops its advance, so the pen stops where that run began — harmless at the
 * end of a text object, and a visible shift of everything after it otherwise.
 * A run that cannot be silenced safely is reported, not mangled.
 */

export type ShowTextOperator = 'Tj' | 'TJ' | "'" | '"';

export interface ShowTextOp {
  operator: ShowTextOperator;
  /** Byte offsets of the operand, which is what gets emptied. */
  operandStart: number;
  operandEnd: number;
  /** Where the pen was when this operator ran, in page space, y up. */
  originX: number;
  originY: number;
  /** Font size after the text matrix and the CTM are applied. */
  effectiveFontSize: number;
  /** The /Font resource name in force, without the leading slash. */
  fontName: string;
  /** Index of the BT/ET block this sits in. */
  textObjectIndex: number;
  /** True when no further show-text operator follows inside that block. */
  isLastInTextObject: boolean;
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const isWhitespace = (byte: number) => WHITESPACE.has(byte);
const isDelimiter = (byte: number) => DELIMITERS.has(byte);

/** The vertical scale a matrix applies, which is what scales the font size. */
function verticalScale(matrix: ContentMatrix): number {
  return Math.hypot(matrix[2], matrix[3]) || 1;
}

/** Every show-text operator on a page, with where and how big it drew. */
export function findShowTextOps(bytes: Uint8Array): ShowTextOp[] {
  const ops: ShowTextOp[] = [];

  let ctm: ContentMatrix = [...IDENTITY_MATRIX] as ContentMatrix;
  const ctmStack: ContentMatrix[] = [];

  let textMatrix: ContentMatrix = [...IDENTITY_MATRIX] as ContentMatrix;
  let lineMatrix: ContentMatrix = [...IDENTITY_MATRIX] as ContentMatrix;
  let leading = 0;
  let rise = 0;
  let fontSize = 0;
  let fontName = '';
  let textObjectIndex = -1;

  /* Operands seen since the last operator, in source order. */
  let numbers: number[] = [];
  let names: string[] = [];
  /* Where the first operand of the pending operator starts and ends. */
  let operandStart = -1;
  let operandEnd = -1;

  let i = 0;
  const length = bytes.length;

  const resetOperands = () => {
    numbers = [];
    names = [];
    operandStart = -1;
    operandEnd = -1;
  };

  const noteOperand = (start: number, end: number) => {
    if (operandStart < 0) operandStart = start;
    operandEnd = end;
  };

  const skipString = () => {
    /* Already positioned on '('. Parentheses nest and may be escaped. */
    let depth = 0;
    while (i < length) {
      const byte = bytes[i];
      if (byte === 0x5c) {
        i += 2;
        continue;
      }
      if (byte === 0x28) depth++;
      if (byte === 0x29) {
        depth--;
        i++;
        if (depth === 0) return;
        continue;
      }
      i++;
    }
  };

  const skipHexString = () => {
    while (i < length && bytes[i] !== 0x3e) i++;
    if (i < length) i++;
  };

  const skipArray = () => {
    let depth = 0;
    while (i < length) {
      const byte = bytes[i];
      if (byte === 0x28) {
        skipString();
        continue;
      }
      if (byte === 0x3c && bytes[i + 1] !== 0x3c) {
        skipHexString();
        continue;
      }
      if (byte === 0x5b) depth++;
      if (byte === 0x5d) {
        depth--;
        i++;
        if (depth === 0) return;
        continue;
      }
      i++;
    }
  };

  const showAt = (operator: ShowTextOperator) => {
    if (operandStart < 0) return;

    const combined = multiplyMatrix(textMatrix, ctm);
    /* The pen sits at the text-space origin, lifted by the current rise. */
    const originX = combined[4] + rise * combined[2];
    const originY = combined[5] + rise * combined[3];

    ops.push({
      operator,
      operandStart,
      operandEnd,
      originX,
      originY,
      effectiveFontSize: fontSize * verticalScale(textMatrix) * verticalScale(ctm),
      fontName,
      textObjectIndex,
      isLastInTextObject: true
    });
  };

  while (i < length) {
    const byte = bytes[i];

    if (isWhitespace(byte)) {
      i++;
      continue;
    }

    /* Comment to end of line. */
    if (byte === 0x25) {
      while (i < length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }

    if (byte === 0x28) {
      const start = i;
      skipString();
      noteOperand(start, i);
      continue;
    }

    if (byte === 0x3c) {
      const start = i;
      if (bytes[i + 1] === 0x3c) {
        /* A dictionary: skipped wholesale, including any inline image. */
        let depth = 0;
        while (i < length) {
          if (bytes[i] === 0x3c && bytes[i + 1] === 0x3c) {
            depth++;
            i += 2;
            continue;
          }
          if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
            depth--;
            i += 2;
            if (depth === 0) break;
            continue;
          }
          i++;
        }
      } else {
        skipHexString();
      }
      noteOperand(start, i);
      continue;
    }

    if (byte === 0x5b) {
      const start = i;
      skipArray();
      noteOperand(start, i);
      continue;
    }

    if (byte === 0x5d || byte === 0x7b || byte === 0x7d || byte === 0x29 || byte === 0x3e) {
      i++;
      continue;
    }

    if (byte === 0x2f) {
      const start = i;
      i++;
      while (i < length && !isWhitespace(bytes[i]) && !isDelimiter(bytes[i])) i++;
      names.push(
        new TextDecoder('latin1').decode(bytes.subarray(start + 1, i))
      );
      noteOperand(start, i);
      continue;
    }

    /* A number or a keyword. */
    const tokenStart = i;
    while (i < length && !isWhitespace(bytes[i]) && !isDelimiter(bytes[i])) i++;
    const token = new TextDecoder('latin1').decode(bytes.subarray(tokenStart, i));
    if (token.length === 0) {
      i++;
      continue;
    }

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
      numbers.push(parseFloat(token));
      noteOperand(tokenStart, i);
      continue;
    }

    /* An operator. */
    switch (token) {
      case 'q':
        ctmStack.push([...ctm] as ContentMatrix);
        break;
      case 'Q': {
        const popped = ctmStack.pop();
        if (popped) ctm = popped;
        break;
      }
      case 'cm':
        if (numbers.length >= 6) {
          ctm = multiplyMatrix(numbers.slice(-6) as ContentMatrix, ctm);
        }
        break;
      case 'BT':
        textObjectIndex++;
        textMatrix = [...IDENTITY_MATRIX] as ContentMatrix;
        lineMatrix = [...IDENTITY_MATRIX] as ContentMatrix;
        rise = 0;
        break;
      case 'ET':
        break;
      case 'Tf':
        if (names.length > 0) fontName = names[names.length - 1];
        if (numbers.length > 0) fontSize = numbers[numbers.length - 1];
        break;
      case 'TL':
        if (numbers.length > 0) leading = numbers[numbers.length - 1];
        break;
      case 'Ts':
        if (numbers.length > 0) rise = numbers[numbers.length - 1];
        break;
      case 'Tm':
        if (numbers.length >= 6) {
          textMatrix = numbers.slice(-6) as ContentMatrix;
          lineMatrix = [...textMatrix] as ContentMatrix;
        }
        break;
      case 'Td':
        if (numbers.length >= 2) {
          const [tx, ty] = numbers.slice(-2);
          lineMatrix = multiplyMatrix([1, 0, 0, 1, tx, ty], lineMatrix);
          textMatrix = [...lineMatrix] as ContentMatrix;
        }
        break;
      case 'TD':
        if (numbers.length >= 2) {
          const [tx, ty] = numbers.slice(-2);
          leading = -ty;
          lineMatrix = multiplyMatrix([1, 0, 0, 1, tx, ty], lineMatrix);
          textMatrix = [...lineMatrix] as ContentMatrix;
        }
        break;
      case 'T*':
        lineMatrix = multiplyMatrix([1, 0, 0, 1, 0, -leading], lineMatrix);
        textMatrix = [...lineMatrix] as ContentMatrix;
        break;
      case 'Tj':
        showAt('Tj');
        break;
      case 'TJ':
        showAt('TJ');
        break;
      case "'":
        lineMatrix = multiplyMatrix([1, 0, 0, 1, 0, -leading], lineMatrix);
        textMatrix = [...lineMatrix] as ContentMatrix;
        showAt("'");
        break;
      case '"':
        lineMatrix = multiplyMatrix([1, 0, 0, 1, 0, -leading], lineMatrix);
        textMatrix = [...lineMatrix] as ContentMatrix;
        showAt('"');
        break;
      case 'BI': {
        /* Inline image: jump past the binary to its EI delimiter. */
        while (i < length - 1) {
          if (
            bytes[i] === 0x45 &&
            bytes[i + 1] === 0x49 &&
            (i + 2 >= length || isWhitespace(bytes[i + 2]) || isDelimiter(bytes[i + 2]))
          ) {
            i += 2;
            break;
          }
          i++;
        }
        break;
      }
      default:
        break;
    }

    resetOperands();
  }

  /* A show operator is "last in its block" only if nothing shows after it. */
  const lastIndexByBlock = new Map<number, number>();
  ops.forEach((op, index) => lastIndexByBlock.set(op.textObjectIndex, index));
  ops.forEach((op, index) => {
    op.isLastInTextObject = lastIndexByBlock.get(op.textObjectIndex) === index;
  });

  return ops;
}

/**
 * The one operator that drew a run at a given place, or null.
 *
 * Null when nothing is close enough, when two candidates are equally close —
 * in which case blanking either would be a guess — or when the match is not
 * safe to blank.
 */
export function matchShowTextOp(
  ops: ShowTextOp[],
  target: { x: number; baselinePdfY: number; fontSize: number },
  tolerance = 1.5
): ShowTextOp | null {
  const candidates = ops.filter(
    op =>
      Math.abs(op.originX - target.x) <= tolerance &&
      Math.abs(op.originY - target.baselinePdfY) <= tolerance &&
      Math.abs(op.effectiveFontSize - target.fontSize) <= Math.max(0.5, target.fontSize * 0.1)
  );

  if (candidates.length !== 1) return null;

  const candidate = candidates[0];
  if (!candidate.isLastInTextObject) return null;

  /*
   * `'` and `"` are refused. Their operands are not just the string — `"`
   * takes a word spacing and a character spacing before it — so emptying the
   * span would leave the operator with the wrong number of operands and the
   * stream invalid. They are rare enough that reporting the run as not
   * silenced costs less than a malformed page.
   */
  return candidate.operator === 'Tj' || candidate.operator === 'TJ' ? candidate : null;
}

/**
 * Empties a show-text operator's operand in place.
 *
 * In place, and padded back to the original byte length, so every other
 * offset this module handed out stays valid and several runs can be silenced
 * one after another without re-scanning.
 */
export function blankShowTextOperand(bytes: Uint8Array, op: ShowTextOp): Uint8Array {
  const span = op.operandEnd - op.operandStart;
  const empty = op.operator === 'TJ' ? '[]' : '()';
  if (span < empty.length) return bytes;

  const out = new Uint8Array(bytes);
  for (let k = 0; k < empty.length; k++) {
    out[op.operandStart + k] = empty.charCodeAt(k);
  }
  /* Whitespace is legal anywhere between tokens, so padding is inert. */
  out.fill(0x20, op.operandStart + empty.length, op.operandEnd);

  return out;
}
