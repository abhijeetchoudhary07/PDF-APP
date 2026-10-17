import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfSectioningService } from './pdf-sectioning.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import {
  MM_TO_PT,
  PAPER_SIZES_PT,
  SectionGridOptions,
  TilingOptions,
  UserSpaceRect
} from '../models/pdf-sectioning.types';

/** Page sizes in points. */
const A4 = { width: 595.28, height: 841.89 };
const A3_LANDSCAPE = { width: 1190.55, height: 841.89 };
const A1 = { width: 1683.78, height: 2383.94 };

function page(
  width: number,
  height: number,
  rotation = 0,
  id = 'p1'
): any {
  return {
    id,
    sourceDocId: 'doc',
    sourcePageIndex: 0,
    displayNumber: 1,
    originalRotation: rotation,
    rotation: 0,
    width,
    height
  };
}

const grid = (over: Partial<SectionGridOptions> = {}): SectionGridOptions => ({
  rows: 1,
  columns: 2,
  order: 'ltr',
  useGutterDetection: false,
  ...over
});

const tiling = (over: Partial<TilingOptions> = {}): TilingOptions => ({
  paper: 'A4',
  orientation: 'portrait',
  overlapMm: 5,
  cropMarks: false,
  numbering: false,
  ...over
});

/** Rounds a rect so float noise does not drown the assertion. */
const r2 = (box: UserSpaceRect) => ({
  x: Math.round(box.x * 100) / 100,
  y: Math.round(box.y * 100) / 100,
  width: Math.round(box.width * 100) / 100,
  height: Math.round(box.height * 100) / 100
});

describe('PdfSectioningService', () => {
  let service: PdfSectioningService;

  beforeEach(() => {
    service = new PdfSectioningService();
  });

  // ══════════════════════════════════════════════════════════════════
  // B6 — page sectioning
  // ══════════════════════════════════════════════════════════════════

  describe('B6 — page sectioning', () => {
    it('acceptance: an A3 landscape page becomes two A4 portrait pages with correct crop boxes', () => {
      const plan = service.planSections([page(A3_LANDSCAPE.width, A3_LANDSCAPE.height)], grid());

      expect(plan.usable).toBe(true);
      expect(plan.pieces.length).toBe(2);

      const half = A3_LANDSCAPE.width / 2;
      // Each piece is A4 portrait, to within the half-millimetre A3 is defined to.
      for (const piece of plan.pieces) {
        expect(piece.widthPt).toBeCloseTo(A4.width, 0);
        expect(piece.heightPt).toBeCloseTo(A4.height, 0);
      }

      // Left half first, then right half; both full height.
      expect(r2(plan.pieces[0].cropBox)).toEqual({
        x: 0,
        y: 0,
        width: Math.round(half * 100) / 100,
        height: Math.round(A3_LANDSCAPE.height * 100) / 100
      });
      expect(r2(plan.pieces[1].cropBox)).toEqual({
        x: Math.round(half * 100) / 100,
        y: 0,
        width: Math.round(half * 100) / 100,
        height: Math.round(A3_LANDSCAPE.height * 100) / 100
      });
    });

    it('cuts a quarters grid into four pieces that tile the page exactly', () => {
      const plan = service.planSections([page(600, 800)], grid({ rows: 2, columns: 2 }));

      expect(plan.pieces.length).toBe(4);
      expect(plan.pieces.every(p => p.widthPt === 300 && p.heightPt === 400)).toBe(true);

      // The four crop boxes cover the page with no gap and no overlap.
      const area = plan.pieces.reduce((sum, p) => sum + p.cropBox.width * p.cropBox.height, 0);
      expect(area).toBeCloseTo(600 * 800, 3);

      const corners = plan.pieces.map(p => `${p.cropBox.x},${p.cropBox.y}`).sort();
      expect(corners).toEqual(['0,0', '0,400', '300,0', '300,400'].sort());
    });

    it('orders pieces across rows or down columns as asked', () => {
      const ltr = service.planSections([page(600, 800)], grid({ rows: 2, columns: 2, order: 'ltr' }));
      expect(ltr.pieces.map(p => `${p.row}${p.column}`)).toEqual(['00', '01', '10', '11']);

      const ttb = service.planSections([page(600, 800)], grid({ rows: 2, columns: 2, order: 'ttb' }));
      expect(ttb.pieces.map(p => `${p.row}${p.column}`)).toEqual(['00', '10', '01', '11']);
    });

    it('reads the grid in what the reader sees, not the unrotated box', () => {
      /*
       * A portrait MediaBox with /Rotate 90 displays as a landscape spread.
       * Cutting it "down the middle" has to cut the spread in two, which in
       * user space is a horizontal cut, not a vertical one.
       */
      const plan = service.planSections([page(841.89, 1190.55, 90)], grid());

      expect(plan.pieces.length).toBe(2);
      for (const piece of plan.pieces) {
        // Each half is A4-shaped once the rotation is applied.
        expect(piece.widthPt).toBeCloseTo(A4.width, 0);
        expect(piece.heightPt).toBeCloseTo(A4.height, 0);
        // In user space the cut runs across the page, so each box is full width.
        expect(piece.cropBox.width).toBeCloseTo(841.89, 2);
        expect(piece.cropBox.height).toBeCloseTo(1190.55 / 2, 2);
      }
      // The visually-left half is the upper half of the unrotated box.
      expect(plan.pieces[0].cropBox.y).toBeCloseTo(0, 2);
      expect(plan.pieces[1].cropBox.y).toBeCloseTo(1190.55 / 2, 2);
    });

    it('covers the whole page for every rotation', () => {
      for (const rotation of [0, 90, 180, 270]) {
        const plan = service.planSections([page(600, 800, rotation)], grid({ rows: 2, columns: 2 }));
        const area = plan.pieces.reduce((s, p) => s + p.cropBox.width * p.cropBox.height, 0);
        expect(area, `rotation ${rotation}`).toBeCloseTo(600 * 800, 3);

        // No piece may stray outside the page box.
        for (const p of plan.pieces) {
          expect(p.cropBox.x).toBeGreaterThanOrEqual(-0.01);
          expect(p.cropBox.y).toBeGreaterThanOrEqual(-0.01);
          expect(p.cropBox.x + p.cropBox.width).toBeLessThanOrEqual(600.01);
          expect(p.cropBox.y + p.cropBox.height).toBeLessThanOrEqual(800.01);
        }
      }
    });

    it('refuses a 1x1 grid rather than writing a copy that looks like a cut', () => {
      const plan = service.planSections([page(600, 800)], grid({ rows: 1, columns: 1 }));
      expect(plan.usable).toBe(false);
      expect(plan.notices.map(n => n.kind)).toContain('single-part');
    });

    it('refuses a grid finer than the limit', () => {
      const plan = service.planSections([page(600, 800)], grid({ rows: 50, columns: 50 }));
      expect(plan.usable).toBe(false);
      expect(plan.notices.map(n => n.kind)).toContain('grid-too-fine');
    });

    it('sections every page of a multi-page document', () => {
      const plan = service.planSections(
        [page(600, 800, 0, 'a'), page(600, 800, 0, 'b'), page(400, 400, 0, 'c')],
        grid({ rows: 2, columns: 2 })
      );
      expect(plan.totalPieces).toBe(12);
      expect(plan.piecesPerPage).toEqual([4, 4, 4]);
      expect(plan.pieces.filter(p => p.sourcePageNumber === 3).every(p => p.widthPt === 200)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B6 — gutter detection
  // ══════════════════════════════════════════════════════════════════

  describe('B6 — gutter detection', () => {
    /** A book spread: two inked blocks with an empty band between them. */
    function spreadProfile(width: number, gutterCentre: number, gutterWidth: number): number[] {
      const profile = new Array(width).fill(0);
      for (let x = 0; x < width; x++) {
        const margin = x < width * 0.04 || x > width * 0.96;
        const inGutter = Math.abs(x - gutterCentre) <= gutterWidth / 2;
        profile[x] = margin || inGutter ? 0 : 400;
      }
      return profile;
    }

    it('acceptance: picks the whitespace valley, not the midpoint, on an off-centre gutter', () => {
      // 600 columns, gutter centred at 380 — well off the 300 midpoint.
      const result = service.findGutterInProfile(spreadProfile(600, 380, 24));

      expect(result.found).toBe(true);
      expect(result.fraction).toBeCloseTo(380 / 600, 2);
      // And emphatically not the midpoint it would otherwise have used.
      expect(Math.abs(result.fraction - 0.5)).toBeGreaterThan(0.1);
    });

    it('finds a gutter on either side of centre', () => {
      expect(service.findGutterInProfile(spreadProfile(600, 240, 20)).fraction).toBeCloseTo(0.4, 2);
      expect(service.findGutterInProfile(spreadProfile(600, 360, 20)).fraction).toBeCloseTo(0.6, 2);
    });

    it('ignores the page margins, which are emptier than the gutter', () => {
      const result = service.findGutterInProfile(spreadProfile(600, 330, 20));
      // The outer margins sit at 0 ink across 4% of the width at each edge; the
      // search band keeps them out of it.
      expect(result.found).toBe(true);
      expect(result.fraction).toBeGreaterThan(0.4);
      expect(result.fraction).toBeLessThan(0.65);
    });

    it('reports no gutter on an evenly inked page rather than inventing one', () => {
      const even = new Array(600).fill(300);
      const result = service.findGutterInProfile(even);
      expect(result.found).toBe(false);
      expect(result.fraction).toBe(0.5);
    });

    it('reports no gutter on a blank page', () => {
      const result = service.findGutterInProfile(new Array(600).fill(0));
      expect(result.found).toBe(false);
      expect(result.fraction).toBe(0.5);
    });

    it('builds a column profile from pixels, counting ink and not paper', () => {
      // 4x2 white image with one fully black column at x = 2.
      const width = 4;
      const height = 2;
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      for (let y = 0; y < height; y++) {
        const i = (y * width + 2) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
      expect(service.computeColumnProfile(data, width, height)).toEqual([0, 0, 2, 0]);
    });

    it('treats a transparent pixel as paper, not as ink', () => {
      const data = new Uint8ClampedArray(4 * 4).fill(0); // black but alpha 0
      expect(service.computeColumnProfile(data, 4, 1)).toEqual([0, 0, 0, 0]);
    });

    it('cuts at the detected gutter and says that it did', () => {
      const gutters = new Map([[1, { found: true, fraction: 0.62 }]]);
      const plan = service.planSections(
        [page(1000, 800)],
        grid({ useGutterDetection: true }),
        gutters
      );

      expect(plan.pieces[0].cropBox.width).toBeCloseTo(620, 2);
      expect(plan.pieces[1].cropBox.width).toBeCloseTo(380, 2);
      expect(plan.pieces[0].gutterApplied).toBe(true);
      expect(plan.notices.find(n => n.kind === 'gutter-applied')?.count).toBe(1);
    });

    it('falls back to the midpoint and reports it when no gutter was found', () => {
      const gutters = new Map([[1, { found: false, fraction: 0.5 }]]);
      const plan = service.planSections(
        [page(1000, 800)],
        grid({ useGutterDetection: true }),
        gutters
      );

      expect(plan.pieces[0].cropBox.width).toBeCloseTo(500, 2);
      expect(plan.pieces[0].gutterApplied).toBeUndefined();
      expect(plan.notices.find(n => n.kind === 'gutter-not-found')?.count).toBe(1);
    });

    it('ignores gutter detection for a grid that has no gutter', () => {
      const gutters = new Map([[1, { found: true, fraction: 0.62 }]]);
      const plan = service.planSections(
        [page(1000, 800)],
        grid({ rows: 2, columns: 2, useGutterDetection: true }),
        gutters
      );
      // Quarters are quarters; the detected fraction does not apply.
      expect(plan.pieces.every(p => p.cropBox.width === 500)).toBe(true);
      expect(plan.notices.map(n => n.kind)).not.toContain('gutter-applied');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B7 — poster tiling
  // ══════════════════════════════════════════════════════════════════

  describe('B7 — poster tiling', () => {
    it('acceptance: an A1 page at A4 with 5mm overlap gives the expected tile count', () => {
      const plan = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm: 5 }));

      expect(plan.usable).toBe(true);
      // 1683.78 / (595.28 - 14.17) -> 3 columns; 2383.94 / (841.89 - 14.17) -> 3 rows.
      expect(plan.tileGrid).toEqual({ rows: 3, columns: 3 });
      expect(plan.totalPieces).toBe(9);
      expect(plan.piecesPerPage).toEqual([9]);
    });

    it('acceptance: each tile overlaps its neighbour by the set amount', () => {
      const overlapMm = 5;
      const overlapPt = overlapMm * MM_TO_PT;
      const plan = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm }));

      const at = (row: number, col: number) =>
        plan.pieces.find(p => p.row === row && p.column === col)!;

      // Horizontal seams, reading across the top row.
      for (let c = 0; c < 2; c++) {
        const left = at(0, c);
        const right = at(0, c + 1);
        const seam = left.visual.x + left.visual.width - right.visual.x;
        if (c + 1 < 2) {
          expect(seam).toBeCloseTo(overlapPt, 2);
        } else {
          // The last tile is pulled back onto the page, so its seam is wider,
          // never narrower -- no strip of the poster goes unprinted.
          expect(seam).toBeGreaterThanOrEqual(overlapPt - 0.01);
        }
      }

      // Vertical seams, reading down the first column.
      for (let r = 0; r < 2; r++) {
        const top = at(r, 0);
        const below = at(r + 1, 0);
        const seam = top.visual.y + top.visual.height - below.visual.y;
        if (r + 1 < 2) {
          expect(seam).toBeCloseTo(overlapPt, 2);
        } else {
          expect(seam).toBeGreaterThanOrEqual(overlapPt - 0.01);
        }
      }
    });

    it('covers every point of the page across the tiles', () => {
      const plan = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm: 5 }));

      const maxRight = Math.max(...plan.pieces.map(p => p.visual.x + p.visual.width));
      const maxBottom = Math.max(...plan.pieces.map(p => p.visual.y + p.visual.height));
      const minLeft = Math.min(...plan.pieces.map(p => p.visual.x));
      const minTop = Math.min(...plan.pieces.map(p => p.visual.y));

      expect(minLeft).toBeCloseTo(0, 2);
      expect(minTop).toBeCloseTo(0, 2);
      expect(maxRight).toBeCloseTo(A1.width, 2);
      expect(maxBottom).toBeCloseTo(A1.height, 2);
    });

    it('never lets a tile hang off the page', () => {
      const plan = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm: 5 }));
      for (const p of plan.pieces) {
        expect(p.cropBox.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.cropBox.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.cropBox.x + p.cropBox.width).toBeLessThanOrEqual(A1.width + 0.01);
        expect(p.cropBox.y + p.cropBox.height).toBeLessThanOrEqual(A1.height + 0.01);
      }
    });

    it('reports the sheet count before anything is written', () => {
      // A0 at A4: 5 columns x 5 rows of paper.
      const a0 = service.planTiles([page(2383.94, 3370.39)], tiling({ overlapMm: 5 }));
      expect(a0.tileGrid).toEqual({ rows: 5, columns: 5 });
      expect(a0.totalPieces).toBe(25);
      expect(a0.totalPieces).toBe(a0.pieces.length);
      // Twenty-five sheets is worth hearing about before the paper comes out.
      expect(a0.notices.find(n => n.kind === 'large-sheet-count')?.count).toBe(25);
    });

    it('says a page that already fits one sheet gains nothing from tiling', () => {
      const plan = service.planTiles([page(A4.width, A4.height)], tiling());
      expect(plan.totalPieces).toBe(1);
      expect(plan.notices.map(n => n.kind)).toContain('page-fits-one-sheet');
    });

    it('a larger overlap needs more sheets', () => {
      const small = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm: 0 }));
      const large = service.planTiles([page(A1.width, A1.height)], tiling({ overlapMm: 40 }));
      expect(large.totalPieces).toBeGreaterThan(small.totalPieces);
    });

    it('auto orientation picks the sheet direction that needs fewer sheets', () => {
      // A wide, short banner is cheaper on landscape sheets.
      const wide = page(2400, 500);
      const auto = service.planTiles([wide], tiling({ orientation: 'auto', overlapMm: 5 }));
      const portrait = service.planTiles([wide], tiling({ orientation: 'portrait', overlapMm: 5 }));
      expect(auto.totalPieces).toBeLessThanOrEqual(portrait.totalPieces);
    });

    it('Letter and A4 give different grids for the same poster', () => {
      const a4 = service.planTiles([page(A1.width, A1.height)], tiling({ paper: 'A4' }));
      const letter = service.planTiles([page(A1.width, A1.height)], tiling({ paper: 'Letter' }));
      expect(PAPER_SIZES_PT.Letter.height).not.toBe(PAPER_SIZES_PT.A4.height);
      expect(letter.totalPieces).toBeGreaterThanOrEqual(a4.totalPieces);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Writing
  // ══════════════════════════════════════════════════════════════════

  describe('writing the pieces', () => {
    async function loadedManager(
      build: (doc: PDFDocument) => Promise<void>
    ): Promise<PdfPageManagerService> {
      const doc = await PDFDocument.create();
      await build(doc);
      const bytes = await doc.save();
      const file = new File([new Blob([bytes as any])], 'src.pdf', { type: 'application/pdf' });
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);
      return manager;
    }

    it('writes one output page per piece, each with its own crop box', async () => {
      const manager = await loadedManager(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p = doc.addPage([A3_LANDSCAPE.width, A3_LANDSCAPE.height]);
        p.drawText('Left side', { x: 60, y: 700, size: 24, font });
        p.drawText('Right side', { x: 700, y: 700, size: 24, font });
      });

      const plan = service.planSections(manager.pages, grid());
      const result = await service.exportSectionedPdf(
        plan,
        manager.pages,
        manager.getSourceDocsMap(),
        'spread_sections.pdf'
      );

      expect(result.pageCount).toBe(2);
      expect(result.sizeBytes).toBeGreaterThan(0);

      const written = await PDFDocument.load(await result.file.arrayBuffer());
      expect(written.getPageCount()).toBe(2);

      const left = written.getPage(0).getCropBox();
      const right = written.getPage(1).getCropBox();
      expect(left.width).toBeCloseTo(A3_LANDSCAPE.width / 2, 1);
      expect(right.x).toBeCloseTo(A3_LANDSCAPE.width / 2, 1);
      // The MediaBox is untouched: the content is cropped, never cut away.
      expect(written.getPage(0).getMediaBox().width).toBeCloseTo(A3_LANDSCAPE.width, 1);
    });

    it('offsets the crop box by a MediaBox that does not start at the origin', async () => {
      const manager = await loadedManager(async doc => {
        const p = doc.addPage([600, 800]);
        p.setMediaBox(25, 40, 600, 800);
        p.drawRectangle({ x: 100, y: 100, width: 200, height: 200, color: rgb(0.2, 0.3, 0.9) });
      });

      const plan = service.planSections(manager.pages, grid());
      const result = await service.exportSectionedPdf(
        plan,
        manager.pages,
        manager.getSourceDocsMap(),
        'offset.pdf'
      );

      const written = await PDFDocument.load(await result.file.arrayBuffer());
      const first = written.getPage(0).getCropBox();
      // Without the offset this would sit at x = 0 and show the wrong half.
      expect(first.x).toBeCloseTo(25, 1);
      expect(first.y).toBeCloseTo(40, 1);
    });

    it('keeps the source rotation on every piece', async () => {
      const manager = await loadedManager(async doc => {
        const p = doc.addPage([600, 800]);
        p.setRotation({ type: 'degrees', angle: 90 } as any);
      });

      const plan = service.planSections(manager.pages, grid());
      const result = await service.exportSectionedPdf(
        plan,
        manager.pages,
        manager.getSourceDocsMap(),
        'rotated.pdf'
      );

      const written = await PDFDocument.load(await result.file.arrayBuffer());
      expect(written.getPage(0).getRotation().angle).toBe(90);
      expect(written.getPage(1).getRotation().angle).toBe(90);
    });

    it('writes tiles with crop marks and numbering without failing', async () => {
      const manager = await loadedManager(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p = doc.addPage([A1.width, A1.height]);
        p.drawText('Poster', { x: 200, y: 2000, size: 120, font });
      });

      const plan = service.planTiles(manager.pages, tiling({ cropMarks: true, numbering: true }));
      const result = await service.exportSectionedPdf(
        plan,
        manager.pages,
        manager.getSourceDocsMap(),
        'poster_tiles.pdf',
        { cropMarks: true, numbering: true }
      );

      expect(result.pageCount).toBe(9);
      const written = await PDFDocument.load(await result.file.arrayBuffer());
      expect(written.getPageCount()).toBe(9);
    });

    it('reports progress and honours cancellation', async () => {
      const manager = await loadedManager(async doc => {
        doc.addPage([600, 800]);
      });
      const plan = service.planSections(manager.pages, grid({ rows: 2, columns: 2 }));

      const seen: number[] = [];
      await service.exportSectionedPdf(
        plan,
        manager.pages,
        manager.getSourceDocsMap(),
        'progress.pdf',
        undefined,
        p => seen.push(p.completed)
      );
      expect(seen).toEqual([1, 2, 3, 4]);

      const controller = new AbortController();
      controller.abort();
      await expect(
        service.exportSectionedPdf(
          plan,
          manager.pages,
          manager.getSourceDocsMap(),
          'cancelled.pdf',
          undefined,
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });

    it('refuses to write a plan that is not usable', async () => {
      const manager = await loadedManager(async doc => {
        doc.addPage([600, 800]);
      });
      const plan = service.planSections(manager.pages, grid({ rows: 1, columns: 1 }));
      await expect(
        service.exportSectionedPdf(plan, manager.pages, manager.getSourceDocsMap(), 'x.pdf')
      ).rejects.toThrow(/no pieces/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Geometry
  // ══════════════════════════════════════════════════════════════════

  describe('visual-to-user geometry', () => {
    const box: UserSpaceRect = { x: 0, y: 0, width: 400, height: 600 };

    it('maps the visual top-left corner for every rotation', () => {
      const topLeft = { x: 0, y: 0, width: 100, height: 100 };

      // Unrotated: visual top-left is the user top-left.
      expect(r2(service.visualRectToUserRect(topLeft, box, 0))).toEqual({
        x: 0, y: 500, width: 100, height: 100
      });
      // 90 clockwise: what reads as top-left sits at the user origin.
      expect(r2(service.visualRectToUserRect(topLeft, box, 90))).toEqual({
        x: 0, y: 0, width: 100, height: 100
      });
      // 180: top-left reads from the user bottom-right.
      expect(r2(service.visualRectToUserRect(topLeft, box, 180))).toEqual({
        x: 300, y: 0, width: 100, height: 100
      });
      // 270: top-left is the user top-right.
      expect(r2(service.visualRectToUserRect(topLeft, box, 270))).toEqual({
        x: 300, y: 500, width: 100, height: 100
      });
    });

    it('swaps the visual size for a quarter turn and not for a half one', () => {
      expect(service.visualSize(400, 600, 0)).toEqual({ width: 400, height: 600 });
      expect(service.visualSize(400, 600, 180)).toEqual({ width: 400, height: 600 });
      expect(service.visualSize(400, 600, 90)).toEqual({ width: 600, height: 400 });
      expect(service.visualSize(400, 600, 270)).toEqual({ width: 600, height: 400 });
    });

    it('normalizes an odd or negative rotation rather than mangling the box', () => {
      expect(service.visualSize(400, 600, -90)).toEqual({ width: 600, height: 400 });
      expect(service.visualSize(400, 600, 450)).toEqual({ width: 600, height: 400 });
      expect(service.visualSize(400, 600, 360)).toEqual({ width: 400, height: 600 });
    });

    it('offsets by the page box origin', () => {
      const shifted: UserSpaceRect = { x: 30, y: 50, width: 400, height: 600 };
      const result = service.visualRectToUserRect({ x: 0, y: 0, width: 400, height: 600 }, shifted, 0);
      expect(r2(result)).toEqual({ x: 30, y: 50, width: 400, height: 600 });
    });
  });
});
