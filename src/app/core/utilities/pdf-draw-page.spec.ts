import './pdf-iterator-polyfill';
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import { PdfDrawPageUtil } from './pdf-draw-page.util';

const A4 = { width: 595.28, height: 841.89 };

/** A 2-D affine matrix as PDF's `cm` operator writes it. */
type Matrix = [number, number, number, number, number, number];

/** Row-vector transform: the convention PDF content streams use. */
function apply(m: Matrix, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5]
  };
}

const CM = /^(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?) cm$/;

/**
 * Reads the `cm` operators a draw emitted and returns the point transform they
 * compose to.
 *
 * `cm` concatenates onto the CTM, so the *last* matrix pushed is the first one
 * a point meets — which is why this folds from the right. Asserting against the
 * composed transform rather than against the individual numbers is what makes
 * the test independent of how pdf-lib chooses to split translate/rotate/scale.
 */
function contentTransform(page: PDFPage): (p: { x: number; y: number }) => { x: number; y: number } {
  const stream = (page as unknown as { contentStream?: { getContentsString(): string } })
    .contentStream;
  if (!stream) throw new Error('The page has no content stream, so nothing was drawn.');

  const matrices: Matrix[] = stream
    .getContentsString()
    .split('\n')
    .map(line => line.trim().match(CM))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]] as Matrix);

  return p => matrices.reduceRight((pt, m) => apply(m, pt), p);
}

/**
 * Rounds a point so float noise does not drown the assertion. The `+ 0` folds
 * a negative zero — which a rotation matrix produces freely — onto zero, so
 * the comparison is about position rather than about sign bits.
 */
const r2 = (p: { x: number; y: number }) => ({
  x: Math.round(p.x * 100) / 100 + 0 || 0,
  y: Math.round(p.y * 100) / 100 + 0 || 0
});

/**
 * A source document with one page carrying some ink, an optional /Rotate and an
 * optional MediaBox origin away from (0,0).
 */
async function sourceDoc(options?: {
  width?: number;
  height?: number;
  rotation?: number;
  originX?: number;
  originY?: number;
}): Promise<PDFDocument> {
  const width = options?.width ?? A4.width;
  const height = options?.height ?? A4.height;
  const originX = options?.originX ?? 0;
  const originY = options?.originY ?? 0;

  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  page.setMediaBox(originX, originY, width, height);
  if (options?.rotation) page.setRotation(degrees(options.rotation));

  // Ink in a known corner, so a wrong transform is visible in a rendered check.
  page.drawRectangle({
    x: originX + 10,
    y: originY + 10,
    width: 40,
    height: 40,
    color: rgb(0, 0, 0)
  });

  return doc;
}

describe('PdfDrawPageUtil (D0 — shared draw-page helper)', () => {
  describe('normalizeRotation', () => {
    it('rounds to a quarter turn in [0, 360)', () => {
      expect(PdfDrawPageUtil.normalizeRotation(0)).toBe(0);
      expect(PdfDrawPageUtil.normalizeRotation(90)).toBe(90);
      expect(PdfDrawPageUtil.normalizeRotation(450)).toBe(90);
      expect(PdfDrawPageUtil.normalizeRotation(-90)).toBe(270);
      expect(PdfDrawPageUtil.normalizeRotation(-450)).toBe(270);
      expect(PdfDrawPageUtil.normalizeRotation(89)).toBe(90);
      expect(PdfDrawPageUtil.normalizeRotation(undefined)).toBe(0);
      expect(PdfDrawPageUtil.normalizeRotation(NaN)).toBe(0);
    });
  });

  describe('visualSize', () => {
    it('swaps the axes on a quarter turn and leaves them alone otherwise', () => {
      expect(PdfDrawPageUtil.visualSize(400, 800, 0)).toEqual({ width: 400, height: 800 });
      expect(PdfDrawPageUtil.visualSize(400, 800, 180)).toEqual({ width: 400, height: 800 });
      expect(PdfDrawPageUtil.visualSize(400, 800, 90)).toEqual({ width: 800, height: 400 });
      expect(PdfDrawPageUtil.visualSize(400, 800, 270)).toEqual({ width: 800, height: 400 });
    });
  });

  describe('placement', () => {
    const src = { width: 400, height: 800, rotation: 0 };

    it('anchors an unrotated page at the box corner', () => {
      const p = PdfDrawPageUtil.placement(src, { x: 30, y: 40, scaleX: 1, scaleY: 1 });
      expect(p).toMatchObject({ x: 30, y: 40, xScale: 1, yScale: 1, rotate: 0 });
      expect(p.width).toBe(400);
      expect(p.height).toBe(800);
    });

    it('offsets the anchor for each quarter turn so the result still starts at the box corner', () => {
      // /Rotate 90 is baked in as a 270 degree counter-clockwise turn, which
      // grows the content right and down from the anchor.
      const r90 = PdfDrawPageUtil.placement({ ...src, rotation: 90 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      expect(r90).toMatchObject({ rotate: 270, x: 0, y: 400 });
      expect(r90.width).toBe(800);
      expect(r90.height).toBe(400);

      const r180 = PdfDrawPageUtil.placement({ ...src, rotation: 180 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      expect(r180).toMatchObject({ rotate: 180, x: 400, y: 800 });

      const r270 = PdfDrawPageUtil.placement({ ...src, rotation: 270 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      expect(r270).toMatchObject({ rotate: 90, x: 800, y: 0 });
    });

    it('maps visual scales onto the source axes across a quarter turn', () => {
      /*
       * A landscape scan asked for half the visual width and all of the visual
       * height has to be scaled on its *own* height axis, not its width axis.
       * Getting this backwards stretches every rotated page in an N-up sheet.
       */
      const p = PdfDrawPageUtil.placement(
        { width: 400, height: 800, rotation: 90 },
        { x: 0, y: 0, scaleX: 0.5, scaleY: 1 }
      );
      expect(p.xScale).toBe(1);
      expect(p.yScale).toBe(0.5);
      expect(p.width).toBe(400); // visual width 800 at 0.5
      expect(p.height).toBe(400); // visual height 400 at 1
    });

    it('composes an extra rotation onto the source rotation', () => {
      const p = PdfDrawPageUtil.placement(
        { width: 400, height: 800, rotation: 270 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, extraRotation: 90 }
      );
      expect(p.rotate).toBe(0);
      expect(p).toMatchObject({ x: 0, y: 0 });
    });
  });

  describe('fitScale', () => {
    it('contains without distorting, covers without gaps, stretches to fill', () => {
      expect(PdfDrawPageUtil.fitScale(400, 800, 400, 400, 'contain')).toEqual({ scaleX: 0.5, scaleY: 0.5 });
      expect(PdfDrawPageUtil.fitScale(400, 800, 400, 400, 'cover')).toEqual({ scaleX: 1, scaleY: 1 });
      expect(PdfDrawPageUtil.fitScale(400, 800, 400, 400, 'stretch')).toEqual({ scaleX: 1, scaleY: 0.5 });
      expect(PdfDrawPageUtil.fitScale(400, 800, 400, 400, 'none')).toEqual({ scaleX: 1, scaleY: 1 });
    });

    it('is a no-op on a degenerate source', () => {
      expect(PdfDrawPageUtil.fitScale(0, 800, 400, 400)).toEqual({ scaleX: 1, scaleY: 1 });
    });
  });

  describe('embedSource', () => {
    it('embeds the real MediaBox rather than an origin-relative one', async () => {
      const source = await sourceDoc({ originX: 50, originY: 60 });
      const target = await PDFDocument.create();

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));

      expect(embedded.width).toBeCloseTo(A4.width, 2);
      expect(embedded.height).toBeCloseTo(A4.height, 2);
      expect(embedded.originNormalized).toBe(true);
      expect(embedded.clipped).toBe(false);
      // pdf-lib reports the embedded box size, which must be the box's extent
      // and not the distance from the origin to its far corner.
      expect(embedded.embedded.width).toBeCloseTo(A4.width, 2);
      expect(embedded.embedded.height).toBeCloseTo(A4.height, 2);
    });

    it('reads /Rotate into the visual size', async () => {
      const source = await sourceDoc({ rotation: 90 });
      const target = await PDFDocument.create();

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));

      expect(embedded.rotation).toBe(90);
      expect(embedded.visualWidth).toBeCloseTo(A4.height, 2);
      expect(embedded.visualHeight).toBeCloseTo(A4.width, 2);
    });

    it('clips to a sub-rectangle when asked', async () => {
      const source = await sourceDoc();
      const target = await PDFDocument.create();

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0), {
        clip: { x: 100, y: 200, width: 300, height: 400 }
      });

      expect(embedded.width).toBe(300);
      expect(embedded.height).toBe(400);
      expect(embedded.clipped).toBe(true);
      expect(embedded.originNormalized).toBe(false);
    });
  });

  describe('drawing', () => {
    it('lands a page drawn at 50% in the top-right quadrant', async () => {
      const source = await sourceDoc();
      const target = await PDFDocument.create();
      const sheet = target.addPage([A4.width, A4.height]);

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));
      const quadrant = {
        x: A4.width / 2,
        y: A4.height / 2,
        width: A4.width / 2,
        height: A4.height / 2
      };
      const placement = PdfDrawPageUtil.drawFitted(sheet, embedded, quadrant);

      expect(placement.xScale).toBeCloseTo(0.5, 6);
      expect(placement.yScale).toBeCloseTo(0.5, 6);

      const at = contentTransform(sheet);
      // The form occupies [0, w] x [0, h] by the time the `Do` runs.
      expect(r2(at({ x: 0, y: 0 }))).toEqual(r2({ x: quadrant.x, y: quadrant.y }));
      expect(r2(at({ x: embedded.width, y: embedded.height }))).toEqual(
        r2({ x: A4.width, y: A4.height })
      );
    });

    it('renders a /Rotate 90 page with an off-origin box upright and in place', async () => {
      const source = await sourceDoc({ rotation: 90, originX: 50, originY: 60 });
      const target = await PDFDocument.create();
      // A landscape sheet, because that is what the reader sees.
      const sheet = target.addPage([A4.height, A4.width]);

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));
      PdfDrawPageUtil.draw(sheet, embedded, { x: 0, y: 0, scaleX: 1, scaleY: 1 });

      const at = contentTransform(sheet);
      const w = embedded.width;
      const h = embedded.height;

      // The four corners of the source, where a 90-degree clockwise turn puts them.
      expect(r2(at({ x: 0, y: 0 }))).toEqual(r2({ x: 0, y: A4.width })); // bottom-left -> top-left
      expect(r2(at({ x: 0, y: h }))).toEqual(r2({ x: A4.height, y: A4.width })); // top-left -> top-right
      expect(r2(at({ x: w, y: h }))).toEqual(r2({ x: A4.height, y: 0 })); // top-right -> bottom-right
      expect(r2(at({ x: w, y: 0 }))).toEqual(r2({ x: 0, y: 0 })); // bottom-right -> bottom-left

      // And it fills the landscape sheet exactly, with nothing hanging off it.
      expect(Math.round(embedded.visualWidth)).toBe(Math.round(A4.height));
      expect(Math.round(embedded.visualHeight)).toBe(Math.round(A4.width));
    });

    it('centres a page that does not fill its box, and never enlarges under shrinkOnly', async () => {
      const source = await sourceDoc({ width: 200, height: 200 });
      const target = await PDFDocument.create();
      const sheet = target.addPage([A4.width, A4.height]);

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));
      const placement = PdfDrawPageUtil.drawFitted(
        sheet,
        embedded,
        { x: 0, y: 0, width: A4.width, height: A4.height },
        { shrinkOnly: true }
      );

      expect(placement.xScale).toBe(1);
      expect(placement.x).toBeCloseTo((A4.width - 200) / 2, 4);
      expect(placement.y).toBeCloseTo((A4.height - 200) / 2, 4);
    });

    it('produces a document that reloads with the drawn page intact', async () => {
      const source = await sourceDoc();
      const target = await PDFDocument.create();
      const sheet = target.addPage([A4.width, A4.height]);

      const embedded = await PdfDrawPageUtil.embedSource(target, source.getPage(0));
      PdfDrawPageUtil.drawFitted(sheet, embedded, {
        x: 0,
        y: 0,
        width: A4.width,
        height: A4.height
      });

      const bytes = await target.save({ useObjectStreams: false });
      const reloaded = await PDFDocument.load(bytes);

      expect(reloaded.getPageCount()).toBe(1);
      expect(reloaded.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
    });
  });
});
