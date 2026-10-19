import { describe, it, expect } from 'vitest';
import {
  ContentMatrix,
  ContentStreamScanner,
  IDENTITY_MATRIX,
  multiplyMatrix,
  unitSquareSize
} from './content-stream-scanner.util';

const bytes = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};

/** Rounds a size so float noise does not drown the assertion. */
const r2 = (n: number) => Math.round(n * 100) / 100;

describe('ContentStreamScanner', () => {
  describe('matrix maths', () => {
    it('composes a cm onto the CTM in the order the operator means', () => {
      const translate: ContentMatrix = [1, 0, 0, 1, 10, 20];
      const scale: ContentMatrix = [2, 0, 0, 3, 0, 0];

      // `scale` concatenated onto `translate` scales first, then translates.
      const composed = multiplyMatrix(scale, translate);
      expect(composed).toEqual([2, 0, 0, 3, 10, 20]);
    });

    it('measures the unit square under a plain scale', () => {
      expect(unitSquareSize([200, 0, 0, 100, 0, 0])).toEqual({ width: 200, height: 100 });
    });

    it('measures a rotated placement rather than collapsing it to zero', () => {
      // A 90-degree rotation puts the width on the b component.
      const size = unitSquareSize([0, 200, -100, 0, 0, 0]);
      expect(r2(size.width)).toBe(200);
      expect(r2(size.height)).toBe(100);
    });
  });

  describe('finding draws', () => {
    it('records the drawn size of an image', () => {
      const result = ContentStreamScanner.scan(
        bytes('q 200 0 0 100 50 60 cm /Im1 Do Q')
      );

      expect(result.draws).toHaveLength(1);
      expect(result.draws[0].name).toBe('Im1');
      expect(r2(result.draws[0].widthPt)).toBe(200);
      expect(r2(result.draws[0].heightPt)).toBe(100);
    });

    it('restores the matrix at Q, so the next draw is not scaled by the last', () => {
      const result = ContentStreamScanner.scan(
        bytes('q 400 0 0 400 0 0 cm /Big Do Q q 50 0 0 50 0 0 cm /Small Do Q')
      );

      expect(result.draws.map(d => d.name)).toEqual(['Big', 'Small']);
      expect(r2(result.draws[0].widthPt)).toBe(400);
      expect(r2(result.draws[1].widthPt)).toBe(50);
    });

    it('composes nested transforms', () => {
      // Half, then half again: the image lands at a quarter.
      const result = ContentStreamScanner.scan(
        bytes('q 0.5 0 0 0.5 0 0 cm q 400 0 0 400 0 0 cm /Im1 Do Q Q')
      );
      expect(r2(result.draws[0].widthPt)).toBe(200);
    });

    it('leaks nothing from an unbalanced Q', () => {
      const result = ContentStreamScanner.scan(
        bytes('Q Q q 100 0 0 100 0 0 cm /Im1 Do')
      );
      expect(r2(result.draws[0].widthPt)).toBe(100);
    });

    it('reports a draw outside any q/Q at the initial matrix', () => {
      const result = ContentStreamScanner.scan(bytes('300 0 0 150 0 0 cm /Im1 Do'));
      expect(r2(result.draws[0].widthPt)).toBe(300);
      expect(r2(result.draws[0].heightPt)).toBe(150);
    });

    it('starts from a supplied matrix, for a nested form', () => {
      const result = ContentStreamScanner.scan(bytes('100 0 0 100 0 0 cm /Im1 Do'), [
        0.5, 0, 0, 0.5, 0, 0
      ]);
      expect(r2(result.draws[0].widthPt)).toBe(50);
    });

    it('finds several images on one page', () => {
      const result = ContentStreamScanner.scan(
        bytes([
          'q 100 0 0 100 0 0 cm /A Do Q',
          'q 200 0 0 200 0 0 cm /B Do Q',
          'q 300 0 0 300 0 0 cm /A Do Q'
        ].join('\n'))
      );
      expect(result.draws.map(d => d.name)).toEqual(['A', 'B', 'A']);
      expect(result.draws.map(d => r2(d.widthPt))).toEqual([100, 200, 300]);
    });
  });

  describe('things that break a naive tokeniser', () => {
    it('does not read operators out of a literal string', () => {
      const result = ContentStreamScanner.scan(
        bytes('BT (q 999 0 0 999 0 0 cm /Fake Do Q) Tj ET q 10 0 0 10 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
      expect(r2(result.draws[0].widthPt)).toBe(10);
    });

    it('handles escaped and nested parentheses in a string', () => {
      const result = ContentStreamScanner.scan(
        bytes('BT (a \\) b (nested) c) Tj ET q 20 0 0 20 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
    });

    it('skips an inline image rather than tokenising its bytes', () => {
      // The binary run below contains "cm", "Do" and a stray "/Fake".
      const result = ContentStreamScanner.scan(
        bytes(
          'q BI /W 4 /H 4 /BPC 8 /CS /G ID \x00\x01cm /Fake Do\x02\xff EI Q ' +
            'q 30 0 0 30 0 0 cm /Real Do Q'
        )
      );
      expect(result.inlineImageCount).toBe(1);
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
    });

    it('does not end an inline image at an EI inside its data', () => {
      // "EI" appears mid-binary without surrounding whitespace.
      const result = ContentStreamScanner.scan(
        bytes('BI /W 2 /H 2 ID \x01EI\x02 \x03 EI q 40 0 0 40 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
      expect(r2(result.draws[0].widthPt)).toBe(40);
    });

    it('skips a dictionary operand without losing its place', () => {
      const result = ContentStreamScanner.scan(
        bytes('/OC <</Type /OCMD /OCGs [1 0 R]>> BDC q 60 0 0 60 0 0 cm /Real Do Q EMC')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
    });

    it('skips an array operand', () => {
      const result = ContentStreamScanner.scan(
        bytes('[3 2] 0 d q 70 0 0 70 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
      expect(r2(result.draws[0].widthPt)).toBe(70);
    });

    it('skips a comment', () => {
      const result = ContentStreamScanner.scan(
        bytes('% 999 0 0 999 0 0 cm /Fake Do\nq 80 0 0 80 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
    });

    it('skips a hex string', () => {
      const result = ContentStreamScanner.scan(
        bytes('BT <48656C6C6F> Tj ET q 90 0 0 90 0 0 cm /Real Do Q')
      );
      expect(result.draws.map(d => d.name)).toEqual(['Real']);
    });

    it('is not confused by operands left over from an earlier operator', () => {
      // The stray 5 must not become part of the following cm.
      const result = ContentStreamScanner.scan(
        bytes('5 w 100 0 0 100 0 0 cm /Im1 Do')
      );
      expect(r2(result.draws[0].widthPt)).toBe(100);
    });

    it('returns nothing for an empty stream', () => {
      expect(ContentStreamScanner.scan(new Uint8Array(0)).draws).toEqual([]);
    });

    it('does not throw on truncated input', () => {
      expect(() => ContentStreamScanner.scan(bytes('q 100 0 0 100 0 0 cm /Im1'))).not.toThrow();
      expect(() => ContentStreamScanner.scan(bytes('BT (unterminated'))).not.toThrow();
      expect(() => ContentStreamScanner.scan(bytes('BI /W 2 ID \x01\x02'))).not.toThrow();
    });
  });

  describe('identity', () => {
    it('leaves the identity matrix at unit size', () => {
      expect(unitSquareSize(IDENTITY_MATRIX)).toEqual({ width: 1, height: 1 });
    });
  });
});
