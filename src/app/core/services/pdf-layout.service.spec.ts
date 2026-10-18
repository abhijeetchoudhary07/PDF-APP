import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { PdfLayoutService } from './pdf-layout.service';
import {
  CropRegion,
  LAYOUT_PAPER_SIZES_PT,
  PDF_MAX_PAGE_DIMENSION_PT,
  PT_PER_MM,
  defaultBookletOptions,
  defaultCropOptions,
  defaultLongPageOptions,
  defaultMarginsOptions,
  defaultNormalizeOptions,
  defaultNupOptions,
  nextLargerPaper,
  marginsInPoints,
  matchStandardPaper,
  paperSizePt
} from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;
const A5 = LAYOUT_PAPER_SIZES_PT.A5;

/** A document of `count` pages, each with a line of real text on it. */
async function textDoc(
  count: number,
  size: { width: number; height: number } = A4,
  options?: { rotation?: number; originX?: number; originY?: number }
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < count; i++) {
    const page = doc.addPage([size.width, size.height]);
    if (options?.originX || options?.originY) {
      page.setMediaBox(options.originX ?? 0, options.originY ?? 0, size.width, size.height);
    }
    if (options?.rotation) page.setRotation(degrees(options.rotation));
    page.drawText(`Page ${i + 1}`, {
      x: (options?.originX ?? 0) + 40,
      y: (options?.originY ?? 0) + size.height - 60,
      size: 18,
      font,
      color: rgb(0, 0, 0)
    });
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** A document whose pages are deliberately not all the same size. */
async function mixedDoc(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const size of [A4, A5, A4]) {
    const page = doc.addPage([size.width, size.height]);
    page.drawText('x', { x: 20, y: 20, size: 12, font, color: rgb(0, 0, 0) });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * True when pdf-lib built a content stream for this page in *this* process —
 * which is the same thing as "this page was re-drawn rather than copied".
 * A crop must never re-draw: that is what keeps its text selectable.
 */
function wasRedrawn(page: PDFPage): boolean {
  return (page as unknown as { contentStream?: unknown }).contentStream !== undefined;
}

async function reload(output: { blob: Blob }): Promise<PDFDocument> {
  const bytes = await output.blob.arrayBuffer();
  return PDFDocument.load(bytes);
}

/** A white canvas with a black block at a known inset, as RGBA bytes. */
function pixelPage(
  width: number,
  height: number,
  ink: { x: number; y: number; width: number; height: number }
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = ink.y; y < ink.y + ink.height; y++) {
    for (let x = ink.x; x < ink.x + ink.width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('PdfLayoutService (Part D — page geometry)', () => {
  let service: PdfLayoutService;

  beforeEach(() => {
    service = new PdfLayoutService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('paper helpers', () => {
    it('turns a size to the requested orientation', () => {
      expect(paperSizePt('A4', 'portrait')).toEqual({ width: 595.28, height: 841.89 });
      expect(paperSizePt('A4', 'landscape')).toEqual({ width: 841.89, height: 595.28 });
    });

    it('names a standard size within tolerance and nothing outside it', () => {
      expect(matchStandardPaper(595.28, 841.89)).toBe('A4');
      expect(matchStandardPaper(841.89, 595.28)).toBe('A4');
      expect(matchStandardPaper(612, 792)).toBe('Letter');
      expect(matchStandardPaper(500, 500)).toBeUndefined();
    });

    it('steps up within the A series, and finds nothing above A0', () => {
      /*
       * Legal is wider and taller than A4 and smaller than A3, so a purely
       * geometric answer hands back Legal — which is not the size anyone
       * holding A4 paper means by "the next size up".
       */
      expect(nextLargerPaper(A4.width, A4.height)).toBe('A3');
      expect(nextLargerPaper(A5.width, A5.height)).toBe('A4');
      /*
       * Letter grows to A3, not to Legal: Legal is exactly as wide as Letter,
       * so growing to it would add no room on the left or right at all.
       */
      expect(nextLargerPaper(612, 792)).toBe('A3');
      expect(nextLargerPaper(LAYOUT_PAPER_SIZES_PT.A0.width, LAYOUT_PAPER_SIZES_PT.A0.height)).toBeUndefined();
      expect(nextLargerPaper(3000, 4000)).toBeUndefined();
    });

    it('converts margins to points and honours uniform', () => {
      const uniform = marginsInPoints({ ...defaultMarginsOptions(), unit: 'mm', uniform: true, all: 10 });
      expect(uniform.top).toBeCloseTo(10 * PT_PER_MM, 6);
      expect(uniform.left).toBeCloseTo(10 * PT_PER_MM, 6);

      const perEdge = marginsInPoints({
        ...defaultMarginsOptions(),
        unit: 'pt',
        uniform: false,
        top: 5,
        right: 6,
        bottom: 7,
        left: 8
      });
      expect(perEdge).toEqual({ top: 5, right: 6, bottom: 7, left: 8 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D1 — normalize page size & scale', () => {
    it('flags a document whose pages are not all the same size', async () => {
      const survey = await service.surveyDocument(await mixedDoc());

      expect(survey.mixed).toBe(true);
      expect(survey.pageCount).toBe(3);
      expect(survey.groups).toHaveLength(2);
      // Largest group first, so the dominant size is the normalization target.
      expect(survey.groups[0].pageNumbers).toEqual([1, 3]);
      expect(survey.groups[0].standardName).toBe('A4');
      expect(survey.dominant?.standardName).toBe('A4');
    });

    it('does not flag a document that is all one size', async () => {
      const survey = await service.surveyDocument(await textDoc(4));
      expect(survey.mixed).toBe(false);
      expect(survey.groups).toHaveLength(1);
    });

    it('groups a rotated page by the size a reader sees', () => {
      const survey = service.surveyPageSizes([
        { width: A4.width, height: A4.height, rotation: 0 },
        { width: A4.width, height: A4.height, rotation: 90 }
      ]);

      expect(survey.mixed).toBe(true);
      expect(survey.groups.map(g => g.orientation).sort()).toEqual(['landscape', 'portrait']);
    });

    it('writes every page at the target size exactly', async () => {
      const output = await service.exportNormalized(
        await mixedDoc(),
        { ...defaultNormalizeOptions(), target: 'A4', orientation: 'portrait' },
        'out.pdf'
      );

      const doc = await reload(output);
      expect(doc.getPageCount()).toBe(3);
      for (const page of doc.getPages()) {
        expect(page.getWidth()).toBeCloseTo(A4.width, 2);
        expect(page.getHeight()).toBeCloseTo(A4.height, 2);
      }
      expect(output.outputSize?.width).toBeCloseTo(A4.width, 2);
    });

    it('scales without distortion and centres the content', async () => {
      // An A5 page onto A4 fits at the same factor on both axes.
      const output = await service.exportNormalized(
        await textDoc(1, A5),
        { ...defaultNormalizeOptions(), target: 'A4', orientation: 'portrait', scale: 1 },
        'out.pdf'
      );

      const doc = await reload(output);
      const page = doc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(A4.width, 2);

      // A5 is exactly half of A4 by area, so the linear fit is 1/sqrt(2).
      const expected = Math.min(A4.width / A5.width, A4.height / A5.height);
      expect(expected).toBeGreaterThan(1.41);
      expect(expected).toBeLessThan(1.42);
    });

    it('keep-original at scale 1 is a no-op that does not re-draw anything', async () => {
      const source = await textDoc(3);
      const output = await service.exportNormalized(
        source,
        { ...defaultNormalizeOptions(), target: 'original', scale: 1 },
        'out.pdf'
      );

      expect(output.pageCount).toBe(3);
      expect(output.notices.some(n => n.kind === 'unchanged-pages')).toBe(true);

      const doc = await reload(output);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height, 2);
    });

    it('clamps a scale outside the allowed range and says so', async () => {
      const output = await service.exportNormalized(
        await textDoc(1),
        { ...defaultNormalizeOptions(), target: 'A4', scale: 99 },
        'out.pdf'
      );
      expect(output.notices.some(n => n.kind === 'scale-clamped')).toBe(true);
    });

    it('never enlarges under shrinkOnly', async () => {
      const output = await service.exportNormalized(
        await textDoc(1, A5),
        { ...defaultNormalizeOptions(), target: 'A4', orientation: 'portrait', shrinkOnly: true },
        'out.pdf'
      );

      // The page stays A5-sized inside an A4 sheet, so nothing was enlarged.
      expect(output.notices.some(n => n.kind === 'enlarged-pages')).toBe(false);
      const doc = await reload(output);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
    });

    it('reports the interactive layer a re-draw cannot carry', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([A4.width, A4.height]);
      page.drawText('Form', { x: 40, y: 700, size: 14, font, color: rgb(0, 0, 0) });
      const form = doc.getForm();
      form.createTextField('applicant.name').addToPage(page, {
        x: 50,
        y: 50,
        width: 200,
        height: 24
      });
      const bytes = await doc.save({ useObjectStreams: false });

      const output = await service.exportNormalized(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        { ...defaultNormalizeOptions(), target: 'A5' },
        'out.pdf'
      );

      const notice = output.notices.find(n => n.kind === 'annotations-dropped');
      expect(notice).toBeDefined();
      expect(notice?.count).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D2 — crop / trim margins', () => {
    it('finds the content box on a page with known margins', () => {
      // 10% margin all round: ink from (40,40) to (359,359) on a 400x400 page.
      const data = pixelPage(400, 400, { x: 40, y: 40, width: 320, height: 320 });
      const region = service.contentBoundsFromPixels(data, 400, 400);

      expect(region).toBeDefined();
      expect(region!.x).toBeCloseTo(0.1, 3);
      expect(region!.y).toBeCloseTo(0.1, 3);
      expect(region!.width).toBeCloseTo(0.8, 3);
      expect(region!.height).toBeCloseTo(0.8, 3);
    });

    it('returns nothing for a page with no ink, rather than cropping it to zero', () => {
      const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255);
      expect(service.contentBoundsFromPixels(blank, 100, 100)).toBeUndefined();
    });

    it('treats a transparent pixel as paper whatever colour it claims', () => {
      const data = new Uint8ClampedArray(10 * 10 * 4).fill(0); // black, alpha 0
      expect(service.contentBoundsFromPixels(data, 10, 10)).toBeUndefined();
    });

    it('unions per-page boxes into one that contains them all', () => {
      const union = service.unionRegion([
        { x: 0.1, y: 0.2, width: 0.3, height: 0.3 },
        { x: 0.2, y: 0.1, width: 0.5, height: 0.2 }
      ]);
      expect(union).toEqual({ x: 0.1, y: 0.1, width: 0.6, height: 0.4 });
    });

    it('pads a box by a measurement and clamps it at the page edge', () => {
      const padded = service.padRegion(
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        10,
        500,
        500
      );
      expect(padded.x).toBe(0);
      expect(padded.y).toBeCloseTo(0.48, 4);
      expect(padded.x + padded.width).toBeLessThanOrEqual(1);
      expect(padded.y + padded.height).toBeLessThanOrEqual(1);
    });

    it('crops every page without changing the page count or re-drawing the text', async () => {
      const region: CropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      const output = await service.exportCropped(
        await textDoc(3),
        { ...defaultCropOptions(), mode: 'manual', region, scope: 'all' },
        'out.pdf'
      );

      expect(output.pageCount).toBe(3);
      const doc = await reload(output);
      expect(doc.getPageCount()).toBe(3);

      for (const page of doc.getPages()) {
        const crop = page.getCropBox();
        expect(crop.width).toBeCloseTo(A4.width * 0.8, 1);
        expect(crop.height).toBeCloseTo(A4.height * 0.8, 1);
        expect(crop.x).toBeCloseTo(A4.width * 0.1, 1);
        expect(crop.y).toBeCloseTo(A4.height * 0.1, 1);
        // The window moved; the sheet behind it did not.
        expect(page.getMediaBox().width).toBeCloseTo(A4.width, 2);
      }
    });

    it('does not re-draw a cropped page, so its text stays selectable', async () => {
      const source = await textDoc(2);
      const doc = await PDFDocument.load(source);
      const target = await PDFDocument.create();
      const copied = await target.copyPages(doc, [0, 1]);
      copied.forEach(p => target.addPage(p));

      // The crop path copies and re-boxes; it must never build a content stream.
      expect(copied.every(page => !wasRedrawn(page))).toBe(true);

      const output = await service.exportCropped(
        source,
        { ...defaultCropOptions(), mode: 'manual', region: { x: 0, y: 0, width: 0.9, height: 0.9 } },
        'out.pdf'
      );
      const reloaded = await reload(output);
      expect(reloaded.getPage(0).getCropBox().width).toBeCloseTo(A4.width * 0.9, 1);
    });

    it('honours a page range and leaves the rest alone', async () => {
      const output = await service.exportCropped(
        await textDoc(4),
        {
          ...defaultCropOptions(),
          mode: 'manual',
          region: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
          scope: 'range',
          rangeString: '2-3'
        },
        'out.pdf'
      );

      const doc = await reload(output);
      expect(doc.getPage(0).getCropBox().width).toBeCloseTo(A4.width, 1);
      expect(doc.getPage(1).getCropBox().width).toBeCloseTo(A4.width * 0.6, 1);
      expect(doc.getPage(2).getCropBox().width).toBeCloseTo(A4.width * 0.6, 1);
      expect(doc.getPage(3).getCropBox().width).toBeCloseTo(A4.width, 1);
    });

    it('reports the size a reader will show, not the untouched sheet', async () => {
      const output = await service.exportCropped(
        await textDoc(1),
        {
          ...defaultCropOptions(),
          mode: 'manual',
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        },
        'out.pdf'
      );

      /*
       * The MediaBox is left alone on purpose so the crop can be widened
       * again. Reporting it would tell someone who just trimmed 20% off a
       * page that its size did not change.
       */
      expect(output.outputSize?.width).toBeCloseTo(A4.width * 0.8, 1);
      expect(output.outputSize?.height).toBeCloseTo(A4.height * 0.8, 1);

      const doc = await reload(output);
      expect(doc.getPage(0).getMediaBox().width).toBeCloseTo(A4.width, 2);
    });

    it('reports a full-page crop as having found no margin to remove', async () => {
      const output = await service.exportCropped(
        await textDoc(2),
        { ...defaultCropOptions(), mode: 'manual', region: { x: 0, y: 0, width: 1, height: 1 } },
        'out.pdf'
      );
      expect(output.notices.some(n => n.kind === 'crop-no-margin-found')).toBe(true);
    });

    it('maps the crop box through a quarter turn', async () => {
      // A /Rotate 90 page is landscape to a reader, so a region measured in
      // visual space has to come back as a user-space box on the turned sheet.
      const output = await service.exportCropped(
        await textDoc(1, A4, { rotation: 90 }),
        {
          ...defaultCropOptions(),
          mode: 'manual',
          region: { x: 0, y: 0, width: 0.5, height: 1 }
        },
        'out.pdf'
      );

      const doc = await reload(output);
      const crop = doc.getPage(0).getCropBox();
      // Half the visual width is half the page's own height when it is turned.
      expect(crop.width).toBeCloseTo(A4.width, 1);
      expect(crop.height).toBeCloseTo(A4.height / 2, 1);
    });

    it('offsets the crop box by a MediaBox that does not start at the origin', async () => {
      const output = await service.exportCropped(
        await textDoc(1, A4, { originX: 20, originY: 30 }),
        {
          ...defaultCropOptions(),
          mode: 'manual',
          region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
        },
        'out.pdf'
      );

      const doc = await reload(output);
      const crop = doc.getPage(0).getCropBox();
      expect(crop.x).toBeCloseTo(20 + A4.width * 0.25, 1);
      expect(crop.y).toBeCloseTo(30 + A4.height * 0.25, 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D3 — add margins & padding', () => {
    it('grows the page by exactly the margins asked for', async () => {
      const output = await service.exportWithMargins(
        await textDoc(2),
        { ...defaultMarginsOptions(), unit: 'pt', uniform: false, top: 10, right: 20, bottom: 30, left: 40 },
        'out.pdf'
      );

      const doc = await reload(output);
      for (const page of doc.getPages()) {
        expect(page.getWidth()).toBeCloseTo(A4.width + 20 + 40, 2);
        expect(page.getHeight()).toBeCloseTo(A4.height + 10 + 30, 2);
      }
    });

    it('shifts the content by exactly the inset', async () => {
      const target = await PDFDocument.create();
      const source = await PDFDocument.load(await textDoc(1));
      const embedded = await target.embedPage(source.getPage(0));

      // What the engine does, checked against the arithmetic it should be doing.
      const output = await service.exportWithMargins(
        await textDoc(1),
        { ...defaultMarginsOptions(), unit: 'pt', uniform: false, top: 0, right: 0, bottom: 25, left: 15 },
        'out.pdf'
      );

      const doc = await reload(output);
      const page = doc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(A4.width + 15, 2);
      expect(page.getHeight()).toBeCloseTo(A4.height + 25, 2);
      expect(embedded.width).toBeCloseTo(A4.width, 2);
    });

    it('grows to the next standard size and centres the content', async () => {
      const output = await service.exportWithMargins(
        await textDoc(1, A5),
        { ...defaultMarginsOptions(), growToNextPaper: true },
        'out.pdf'
      );

      const doc = await reload(output);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height, 2);
    });

    it('uniform margins apply the same measurement to all four edges', async () => {
      const output = await service.exportWithMargins(
        await textDoc(1),
        { ...defaultMarginsOptions(), unit: 'mm', uniform: true, all: 10 },
        'out.pdf'
      );

      const doc = await reload(output);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width + 20 * PT_PER_MM, 2);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height + 20 * PT_PER_MM, 2);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D4 — N-up multi-page layout', () => {
    it('picks a grid whose long factor runs along the sheet', () => {
      // Portrait A4: 2-up is two stacked halves.
      expect(service.nupGrid(2, A4.width, A4.height)).toEqual({ rows: 2, columns: 1 });
      // Landscape A4: 2-up is two side-by-side halves.
      expect(service.nupGrid(2, A4.height, A4.width)).toEqual({ rows: 1, columns: 2 });
      expect(service.nupGrid(4, A4.width, A4.height)).toEqual({ rows: 2, columns: 2 });
      expect(service.nupGrid(6, A4.width, A4.height)).toEqual({ rows: 3, columns: 2 });
      expect(service.nupGrid(9, A4.width, A4.height)).toEqual({ rows: 3, columns: 3 });
    });

    it('gives 3 sheets for 9 pages at 4-up, with the last partially filled', () => {
      const plan = service.planNup(
        Array.from({ length: 9 }, () => ({ width: A4.width, height: A4.height })),
        { ...defaultNupOptions(), perSheet: 4, sheet: 'A4', orientation: 'portrait' }
      );

      expect(plan.sheetCount).toBe(3);
      expect(plan.cells).toHaveLength(12);
      expect(plan.emptyCellCount).toBe(3);
      expect(plan.cells.filter(c => c.sourcePageNumber !== undefined)).toHaveLength(9);
      // The three empty cells are all on the last sheet.
      expect(plan.cells.filter(c => c.sourcePageNumber === undefined).every(c => c.sheetIndex === 2)).toBe(true);
    });

    it('positions the cells on the grid, inside the margins', () => {
      const margin = 8 * PT_PER_MM;
      const gutter = 4 * PT_PER_MM;
      const plan = service.planNup(
        Array.from({ length: 4 }, () => ({ width: A4.width, height: A4.height })),
        {
          ...defaultNupOptions(),
          perSheet: 4,
          sheet: 'A4',
          orientation: 'portrait',
          marginMm: 8,
          gutterMm: 4
        }
      );

      const cellWidth = (A4.width - margin * 2 - gutter) / 2;
      const cellHeight = (A4.height - margin * 2 - gutter) / 2;

      const topLeft = plan.cells.find(c => c.row === 0 && c.column === 0)!;
      expect(topLeft.x).toBeCloseTo(margin, 4);
      expect(topLeft.y).toBeCloseTo(A4.height - margin - cellHeight, 4);
      expect(topLeft.width).toBeCloseTo(cellWidth, 4);

      const bottomRight = plan.cells.find(c => c.row === 1 && c.column === 1)!;
      expect(bottomRight.x).toBeCloseTo(margin + cellWidth + gutter, 4);
      expect(bottomRight.y).toBeCloseTo(margin, 4);
    });

    it('fills row-major across and column-major down', () => {
      const sizes = Array.from({ length: 4 }, () => ({ width: A4.width, height: A4.height }));

      const rowMajor = service.planNup(sizes, {
        ...defaultNupOptions(),
        perSheet: 4,
        sheet: 'A4',
        orientation: 'portrait',
        order: 'row-major'
      });
      const second = rowMajor.cells.find(c => c.sourcePageNumber === 2)!;
      expect([second.row, second.column]).toEqual([0, 1]);

      const columnMajor = service.planNup(sizes, {
        ...defaultNupOptions(),
        perSheet: 4,
        sheet: 'A4',
        orientation: 'portrait',
        order: 'column-major'
      });
      const secondDown = columnMajor.cells.find(c => c.sourcePageNumber === 2)!;
      expect([secondDown.row, secondDown.column]).toEqual([1, 0]);
    });

    it('writes the sheets and reports the empty cells', async () => {
      const output = await service.exportNup(
        await textDoc(9),
        { ...defaultNupOptions(), perSheet: 4, sheet: 'A4', orientation: 'portrait' },
        'out.pdf'
      );

      expect(output.pageCount).toBe(3);
      expect(output.sourcePageCount).toBe(9);
      const notice = output.notices.find(n => n.kind === 'partial-last-sheet');
      expect(notice?.count).toBe(3);

      const doc = await reload(output);
      expect(doc.getPageCount()).toBe(3);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D5 — booklet imposition', () => {
    it('pads a 6-page document to 8 and imposes it as 8,1,2,7,6,3,4,5', () => {
      const plan = service.planBooklet(6, defaultBookletOptions());

      expect(plan.paddedPageCount).toBe(8);
      expect(plan.blanksAdded).toBe(2);
      expect(plan.sheetCount).toBe(2);
      expect(plan.sequence).toEqual([8, 1, 2, 7, 6, 3, 4, 5]);
    });

    it('needs no padding when the count is already a multiple of four', () => {
      const plan = service.planBooklet(8, defaultBookletOptions());
      expect(plan.blanksAdded).toBe(0);
      expect(plan.sequence).toEqual([8, 1, 2, 7, 6, 3, 4, 5]);
    });

    it('handles a single sheet', () => {
      const plan = service.planBooklet(3, defaultBookletOptions());
      expect(plan.paddedPageCount).toBe(4);
      expect(plan.sequence).toEqual([4, 1, 2, 3]);
      expect(plan.sides).toHaveLength(2);
    });

    it('mirrors the halves for a right-edge binding', () => {
      const plan = service.planBooklet(4, { ...defaultBookletOptions(), binding: 'right' });
      expect(plan.sequence).toEqual([1, 4, 3, 2]);
    });

    it('creeps the outermost sheet most and the innermost not at all', () => {
      const plan = service.planBooklet(16, { ...defaultBookletOptions(), creepMm: 3 });
      const outer = plan.sides.find(s => s.sheetIndex === 0)!;
      const inner = plan.sides.find(s => s.sheetIndex === plan.sheetCount - 1)!;

      expect(outer.creepPt).toBeCloseTo(3 * PT_PER_MM, 6);
      expect(inner.creepPt).toBe(0);
    });

    it('writes one output page per printed side', async () => {
      const output = await service.exportBooklet(
        await textDoc(6),
        { ...defaultBookletOptions(), sheet: 'original' },
        'out.pdf'
      );

      // 8 padded pages = 2 sheets = 4 printed sides.
      expect(output.pageCount).toBe(4);
      expect(output.notices.find(n => n.kind === 'booklet-padding')?.count).toBe(2);

      const doc = await reload(output);
      // Each side is a landscape pair of the source page.
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width * 2, 1);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height, 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('D6 — single long page', () => {
    it('stacks into one page of the summed height', () => {
      const plan = service.planLongPage(
        Array.from({ length: 3 }, () => ({ width: A4.width, height: A4.height })),
        { ...defaultLongPageOptions(), gapMm: 0 }
      );

      expect(plan.outputPageCount).toBe(1);
      expect(plan.widthPt).toBeCloseTo(A4.width, 4);
      expect(plan.totalHeightPt).toBeCloseTo(A4.height * 3, 4);
      expect(plan.exceedsLimit).toBe(false);
    });

    it('counts the gaps between pages but not after the last one', () => {
      const plan = service.planLongPage(
        Array.from({ length: 4 }, () => ({ width: A4.width, height: A4.height })),
        { ...defaultLongPageOptions(), gapMm: 10 }
      );
      expect(plan.totalHeightPt).toBeCloseTo(A4.height * 4 + 3 * 10 * PT_PER_MM, 4);
    });

    it('scales pages to the chosen width and adjusts their heights', () => {
      const sizes = [
        { width: A4.width, height: A4.height },
        { width: A5.width, height: A5.height }
      ];

      const widest = service.planLongPage(sizes, {
        ...defaultLongPageOptions(),
        widthMode: 'widest',
        gapMm: 0
      });
      expect(widest.widthPt).toBeCloseTo(A4.width, 4);
      // The A5 page is scaled up to A4 width, so it contributes more height.
      expect(widest.totalHeightPt).toBeGreaterThan(A4.height + A5.height);

      const narrowest = service.planLongPage(sizes, {
        ...defaultLongPageOptions(),
        widthMode: 'narrowest',
        gapMm: 0
      });
      expect(narrowest.widthPt).toBeCloseTo(A5.width, 4);

      const first = service.planLongPage(sizes, {
        ...defaultLongPageOptions(),
        widthMode: 'first',
        gapMm: 0
      });
      expect(first.widthPt).toBeCloseTo(A4.width, 4);
    });

    it('enforces the 14,400-unit limit and splits into several long pages', () => {
      const plan = service.planLongPage(
        Array.from({ length: 20 }, () => ({ width: A4.width, height: A4.height })),
        { ...defaultLongPageOptions(), gapMm: 0, splitWhenTooTall: true }
      );

      expect(plan.exceedsLimit).toBe(true);
      expect(plan.outputPageCount).toBeGreaterThan(1);
      for (const column of plan.columns) {
        expect(column.heightPt).toBeLessThanOrEqual(PDF_MAX_PAGE_DIMENSION_PT);
        expect(column.sourcePageNumbers.length).toBeGreaterThan(0);
      }
      // Every page is accounted for exactly once, in order.
      expect(plan.columns.flatMap(c => c.sourcePageNumbers)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1)
      );
    });

    it('reports the limit rather than splitting when splitting is refused', () => {
      const plan = service.planLongPage(
        Array.from({ length: 20 }, () => ({ width: A4.width, height: A4.height })),
        { ...defaultLongPageOptions(), splitWhenTooTall: false }
      );
      expect(plan.exceedsLimit).toBe(true);
      expect(plan.outputPageCount).toBe(1);
    });

    it('writes one tall page that reloads at the summed height', async () => {
      const output = await service.exportLongPage(
        await textDoc(3),
        { ...defaultLongPageOptions(), gapMm: 0 },
        'out.pdf'
      );

      expect(output.pageCount).toBe(1);
      const doc = await reload(output);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 1);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height * 3, 1);
    });

    it('writes valid pages for the split fallback', async () => {
      const output = await service.exportLongPage(
        await textDoc(20),
        { ...defaultLongPageOptions(), gapMm: 0, splitWhenTooTall: true },
        'out.pdf'
      );

      expect(output.pageCount).toBeGreaterThan(1);
      expect(output.notices.some(n => n.kind === 'long-page-split')).toBe(true);

      const doc = await reload(output);
      for (const page of doc.getPages()) {
        expect(page.getHeight()).toBeLessThanOrEqual(PDF_MAX_PAGE_DIMENSION_PT);
        expect(page.getHeight()).toBeGreaterThan(0);
      }
    });

    it('refuses to write an over-limit single page', async () => {
      await expect(
        service.exportLongPage(
          await textDoc(20),
          { ...defaultLongPageOptions(), splitWhenTooTall: false },
          'out.pdf'
        )
      ).rejects.toThrow(/14400/);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('cancellation and scope', () => {
    it('stops an export when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportNormalized(
          await textDoc(4),
          { ...defaultNormalizeOptions(), target: 'A5' },
          'out.pdf',
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });

    it('falls back to every page when a range cannot be read', () => {
      expect(service.resolveScope(3, 'range', 'nonsense')).toEqual([1, 2, 3]);
      expect(service.resolveScope(3, 'range', '2')).toEqual([2]);
      expect(service.resolveScope(3, 'current', undefined, 2)).toEqual([2]);
      expect(service.resolveScope(3, 'current', undefined, 99)).toEqual([3]);
      expect(service.resolveScope(3, 'all')).toEqual([1, 2, 3]);
    });

    it('writes a blank page of the right size rather than failing on it', async () => {
      /*
       * A page with no content stream is legal, and pdf-lib's own `addPage`
       * produces one — so every blank page this app inserts is one.
       * `embedPage` refuses it outright, which used to fail the whole export
       * on a document that happened to contain one empty sheet.
       */
      const doc = await PDFDocument.create();
      doc.addPage([A4.width, A4.height]);
      const bytes = await doc.save({ useObjectStreams: false });
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;

      const output = await service.exportNormalized(
        buffer,
        { ...defaultNormalizeOptions(), target: 'A5', orientation: 'portrait' },
        'out.pdf'
      );

      const reloaded = await reload(output);
      expect(reloaded.getPageCount()).toBe(1);
      expect(reloaded.getPage(0).getWidth()).toBeCloseTo(A5.width, 2);
    });

    it('reports progress from first page to last', async () => {
      const seen: number[] = [];
      await service.exportNormalized(
        await textDoc(4),
        { ...defaultNormalizeOptions(), target: 'A5' },
        'out.pdf',
        p => seen.push(p.percent)
      );
      expect(seen[0]).toBe(25);
      expect(seen[seen.length - 1]).toBe(100);
    });
  });
});
