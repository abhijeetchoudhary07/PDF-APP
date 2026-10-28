import { describe, it, expect } from 'vitest';
import {
  blankShowTextOperand,
  findShowTextOps,
  matchShowTextOp
} from './pdf-show-text-locator.util';

const encode = (source: string) => new TextEncoder().encode(source);
const decode = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/**
 * The locator's job is to place a glyph-drawing operator on the page without
 * decoding a single glyph, because the bytes of a subset-encoded run cannot
 * be derived from the words it shows. Every case here is therefore about
 * position, and about the stream shapes that make a naive scan wrong.
 */
describe('pdf show-text locator', () => {
  describe('findShowTextOps', () => {
    it('places a Tj positioned by Tm', () => {
      const ops = findShowTextOps(
        encode('BT\n/F1 14 Tf\n1 0 0 1 50 500 Tm\n<48656C6C6F> Tj\nET\n')
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].operator).toBe('Tj');
      expect(ops[0].originX).toBeCloseTo(50, 3);
      expect(ops[0].originY).toBeCloseTo(500, 3);
      expect(ops[0].effectiveFontSize).toBeCloseTo(14, 3);
      expect(ops[0].fontName).toBe('F1');
      expect(ops[0].isLastInTextObject).toBe(true);
    });

    it('follows Td and T* down the page', () => {
      const ops = findShowTextOps(
        encode(
          'BT\n/F1 12 Tf\n16 TL\n1 0 0 1 40 700 Tm\n(one) Tj\n' +
            '0 -20 Td\n(two) Tj\nT*\n(three) Tj\nET\n'
        )
      );

      expect(ops.map(op => Math.round(op.originY))).toEqual([700, 680, 664]);
      expect(ops.map(op => Math.round(op.originX))).toEqual([40, 40, 40]);
    });

    it('folds the CTM into the position and the size', () => {
      const ops = findShowTextOps(
        encode('q\n2 0 0 2 10 20 cm\nBT\n/F1 10 Tf\n1 0 0 1 5 5 Tm\n(x) Tj\nET\nQ\n')
      );

      expect(ops).toHaveLength(1);
      /* Text at (5,5) under a 2x scale translated by (10,20). */
      expect(ops[0].originX).toBeCloseTo(20, 3);
      expect(ops[0].originY).toBeCloseTo(30, 3);
      expect(ops[0].effectiveFontSize).toBeCloseTo(20, 3);
    });

    it('restores the CTM at Q', () => {
      const ops = findShowTextOps(
        encode(
          'q\n3 0 0 3 0 0 cm\nBT\n/F1 10 Tf\n1 0 0 1 1 1 Tm\n(a) Tj\nET\nQ\n' +
            'BT\n/F1 10 Tf\n1 0 0 1 1 1 Tm\n(b) Tj\nET\n'
        )
      );

      expect(ops.map(op => Math.round(op.effectiveFontSize))).toEqual([30, 10]);
    });

    it('scales the size by the text matrix', () => {
      const ops = findShowTextOps(
        encode('BT\n/F1 10 Tf\n1 0 0 1.5 0 100 Tm\n(a) Tj\nET\n')
      );

      expect(ops[0].effectiveFontSize).toBeCloseTo(15, 3);
    });

    it('accounts for the text rise', () => {
      const ops = findShowTextOps(
        encode('BT\n/F1 10 Tf\n1 0 0 1 20 200 Tm\n4 Ts\n(sup) Tj\nET\n')
      );

      expect(ops[0].originY).toBeCloseTo(204, 3);
    });

    it('finds a TJ array as one operator', () => {
      const ops = findShowTextOps(
        encode('BT\n/F1 11 Tf\n1 0 0 1 30 300 Tm\n[(A) -250 (B)] TJ\nET\n')
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].operator).toBe('TJ');
      expect(decode(encode('[(A) -250 (B)]'))).toContain('-250');
    });

    it('marks only the last show operator in a text object', () => {
      const ops = findShowTextOps(
        encode('BT\n/F1 12 Tf\n1 0 0 1 40 400 Tm\n(first) Tj\n0 -14 Td\n(second) Tj\nET\n')
      );

      expect(ops.map(op => op.isLastInTextObject)).toEqual([false, true]);
    });

    it('numbers text objects separately', () => {
      const ops = findShowTextOps(
        encode(
          'BT\n/F1 9 Tf\n1 0 0 1 10 10 Tm\n(a) Tj\nET\n' +
            'BT\n/F1 9 Tf\n1 0 0 1 10 30 Tm\n(b) Tj\nET\n'
        )
      );

      expect(ops.map(op => op.textObjectIndex)).toEqual([0, 1]);
      expect(ops.every(op => op.isLastInTextObject)).toBe(true);
    });

    it('does not find operators inside a string', () => {
      /* `(Tj)` is a string whose contents happen to spell an operator, and
       * `\\)` is an escaped parenthesis that must not end it. */
      const ops = findShowTextOps(
        encode('BT\n/F1 10 Tf\n1 0 0 1 0 0 Tm\n(Tj and \\) and (nested)) Tj\nET\n')
      );

      expect(ops).toHaveLength(1);
    });

    it('steps over an inline image to its EI', () => {
      const ops = findShowTextOps(
        encode(
          'q\nBI /W 2 /H 2 /CS /G /BPC 8 ID \u0000Tj\u0000Tm\u0000 EI\nQ\n' +
            'BT\n/F1 10 Tf\n1 0 0 1 5 5 Tm\n(after) Tj\nET\n'
        )
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].originX).toBeCloseTo(5, 3);
    });

    it('ignores a comment', () => {
      const ops = findShowTextOps(
        encode('% (fake) Tj\nBT\n/F1 10 Tf\n1 0 0 1 7 7 Tm\n(real) Tj\nET\n')
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].originX).toBeCloseTo(7, 3);
    });

    it('returns nothing for a stream that draws no text', () => {
      expect(findShowTextOps(encode('q\n1 0 0 RG\n0 0 10 10 re\nS\nQ\n'))).toHaveLength(0);
      expect(findShowTextOps(new Uint8Array())).toHaveLength(0);
    });
  });

  describe('matchShowTextOp', () => {
    const stream = encode(
      'BT\n/F1 14 Tf\n1 0 0 1 50 500 Tm\n(target) Tj\nET\n' +
        'BT\n/F1 14 Tf\n1 0 0 1 50 400 Tm\n(other) Tj\nET\n'
    );

    it('finds the operator at a given place and size', () => {
      const match = matchShowTextOp(findShowTextOps(stream), {
        x: 50,
        baselinePdfY: 500,
        fontSize: 14
      });

      expect(match).not.toBeNull();
      expect(match!.originY).toBeCloseTo(500, 3);
    });

    it('declines when nothing is close enough', () => {
      expect(
        matchShowTextOp(findShowTextOps(stream), { x: 50, baselinePdfY: 450, fontSize: 14 })
      ).toBeNull();
    });

    it('declines on a font size that does not match', () => {
      expect(
        matchShowTextOp(findShowTextOps(stream), { x: 50, baselinePdfY: 500, fontSize: 30 })
      ).toBeNull();
    });

    it('declines when two candidates sit at the same place', () => {
      /* Two runs drawn at one spot: blanking either would be a guess. */
      const ambiguous = encode(
        'BT\n/F1 12 Tf\n1 0 0 1 20 200 Tm\n(a) Tj\nET\n' +
          'BT\n/F1 12 Tf\n1 0 0 1 20 200 Tm\n(b) Tj\nET\n'
      );

      expect(
        matchShowTextOp(findShowTextOps(ambiguous), { x: 20, baselinePdfY: 200, fontSize: 12 })
      ).toBeNull();
    });

    it('declines an operator with text after it in the same block', () => {
      /* Emptying it would drop its advance and shift what follows. */
      const trailing = encode(
        'BT\n/F1 12 Tf\n1 0 0 1 20 200 Tm\n(first) Tj\n(second) Tj\nET\n'
      );

      expect(
        matchShowTextOp(findShowTextOps(trailing), { x: 20, baselinePdfY: 200, fontSize: 12 })
      ).toBeNull();
    });

    it('declines a quote operator, whose operand list cannot be emptied', () => {
      const quoted = encode("BT\n/F1 12 Tf\n14 TL\n1 0 0 1 20 200 Tm\n(line) '\nET\n");
      const ops = findShowTextOps(quoted);

      expect(ops).toHaveLength(1);
      expect(ops[0].operator).toBe("'");
      expect(
        matchShowTextOp(ops, { x: 20, baselinePdfY: 186, fontSize: 12 })
      ).toBeNull();
    });
  });

  describe('blankShowTextOperand', () => {
    it('empties the string and keeps the byte length', () => {
      const stream = encode('BT\n/F1 14 Tf\n1 0 0 1 50 500 Tm\n<48656C6C6F> Tj\nET\n');
      const op = findShowTextOps(stream)[0];

      const out = blankShowTextOperand(stream, op);

      expect(out.length).toBe(stream.length);
      expect(decode(out)).not.toContain('48656C6C6F');
      /* An empty literal string, whatever the original delimiter was: it is
       * empty under any encoding, including a two-byte CID one. */
      expect(decode(out)).toContain('()');
      expect(decode(out)).toContain('Tj');
    });

    it('empties a TJ array to brackets', () => {
      const stream = encode('BT\n/F1 11 Tf\n1 0 0 1 30 300 Tm\n[(A) -250 (B)] TJ\nET\n');
      const op = findShowTextOps(stream)[0];

      const out = decode(blankShowTextOperand(stream, op));

      expect(out).toContain('[]');
      expect(out).not.toContain('-250');
      expect(out).toContain('TJ');
    });

    it('leaves the blanked stream scannable, with nothing left to show', () => {
      const stream = encode(
        'BT\n/F1 14 Tf\n1 0 0 1 50 500 Tm\n(first) Tj\nET\n' +
          'BT\n/F1 14 Tf\n1 0 0 1 50 400 Tm\n(second) Tj\nET\n'
      );

      const first = findShowTextOps(stream)[0];
      const out = blankShowTextOperand(stream, first);
      const after = findShowTextOps(out);

      /* Both operators are still there — one of them now draws nothing. */
      expect(after).toHaveLength(2);
      expect(decode(out)).not.toContain('(first)');
      expect(decode(out)).toContain('(second)');
    });

    it('keeps offsets valid so a second run can be blanked after the first', () => {
      const stream = encode(
        'BT\n/F1 14 Tf\n1 0 0 1 50 500 Tm\n(alpha) Tj\nET\n' +
          'BT\n/F1 14 Tf\n1 0 0 1 50 400 Tm\n(beta) Tj\nET\n'
      );

      const ops = findShowTextOps(stream);
      let out = blankShowTextOperand(stream, ops[0]);
      out = blankShowTextOperand(out, ops[1]);

      const text = decode(out);
      expect(text).not.toContain('alpha');
      expect(text).not.toContain('beta');
      expect(out.length).toBe(stream.length);
    });

    it('leaves the stream alone when the operand is too short to empty', () => {
      const stream = encode('BT\n/F1 10 Tf\n1 0 0 1 0 0 Tm\n() Tj\nET\n');
      const op = findShowTextOps(stream)[0];

      /* `()` is already the empty form, so there is nothing to shorten. */
      expect(decode(blankShowTextOperand(stream, op))).toBe(decode(stream));
    });
  });
});
