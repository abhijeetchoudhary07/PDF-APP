import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PageFlipService } from './page-flip.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { PageFlipState } from '../models/page-flip.types';

const PAGE_W = 595;
const PAGE_H = 842;

async function createTextPdfFile(
  fileName = 'flip.pdf',
  pageCount = 1,
  mediaBoxOrigin: [number, number] = [0, 0]
): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    if (mediaBoxOrigin[0] !== 0 || mediaBoxOrigin[1] !== 0) {
      page.setMediaBox(mediaBoxOrigin[0], mediaBoxOrigin[1], PAGE_W, PAGE_H);
    }
    page.drawText(`Selectable page ${i + 1}`, {
      x: mediaBoxOrigin[0] + 60,
      y: mediaBoxOrigin[1] + 700,
      size: 24,
      font,
      color: rgb(0, 0, 0)
    });
    // A vector mark, so "not rasterised" is testable on shapes too.
    page.drawRectangle({
      x: mediaBoxOrigin[0] + 60,
      y: mediaBoxOrigin[1] + 60,
      width: 120,
      height: 40,
      color: rgb(0.1, 0.3, 0.8)
    });
  }

  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) } as any);
  const pdf = await task.promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (typeof item?.str === 'string') out += item.str;
    }
  }
  // Older pdfjs proxies in this test environment expose no destroy().
  await (pdf as any).destroy?.();
  return out;
}

describe('PageFlipService', () => {
  let service: PageFlipService;

  beforeEach(() => {
    service = new PageFlipService();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance: the transform matrix, per direction
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: transform matrix per direction', () => {
    it('horizontal flip is [-1, 0, 0, 1, w, 0]', () => {
      expect(service.getFlipMatrix('horizontal', PAGE_W, PAGE_H)).toEqual({
        a: -1,
        b: 0,
        c: 0,
        d: 1,
        e: PAGE_W,
        f: 0
      });
    });

    it('vertical flip is [1, 0, 0, -1, 0, h]', () => {
      expect(service.getFlipMatrix('vertical', PAGE_W, PAGE_H)).toEqual({
        a: 1,
        b: 0,
        c: 0,
        d: -1,
        e: 0,
        f: PAGE_H
      });
    });

    it('both axes is [-1, 0, 0, -1, w, h]', () => {
      expect(service.getFlipMatrix('both', PAGE_W, PAGE_H)).toEqual({
        a: -1,
        b: 0,
        c: 0,
        d: -1,
        e: PAGE_W,
        f: PAGE_H
      });
    });

    it('an unflipped state is the identity matrix', () => {
      const state: PageFlipState = { horizontal: false, vertical: false };
      expect(service.getFlipMatrix(state, PAGE_W, PAGE_H)).toEqual(service.IDENTITY_MATRIX);
      expect(service.getFlipTransform(state, PAGE_W, PAGE_H).isIdentity).toBe(true);
    });

    it('the horizontal matrix maps (x, y) to (w - x, y)', () => {
      const m = service.getFlipMatrix('horizontal', PAGE_W, PAGE_H);
      const apply = (x: number, y: number) => ({
        x: m.a * x + m.c * y + m.e,
        y: m.b * x + m.d * y + m.f
      });
      expect(apply(0, 100)).toEqual({ x: PAGE_W, y: 100 });
      expect(apply(PAGE_W, 100)).toEqual({ x: 0, y: 100 });
      expect(apply(PAGE_W / 2, 400)).toEqual({ x: PAGE_W / 2, y: 400 });
    });

    it('the vertical matrix maps (x, y) to (x, h - y)', () => {
      const m = service.getFlipMatrix('vertical', PAGE_W, PAGE_H);
      const apply = (x: number, y: number) => ({
        x: m.a * x + m.c * y + m.e,
        y: m.b * x + m.d * y + m.f
      });
      expect(apply(100, 0)).toEqual({ x: 100, y: PAGE_H });
      expect(apply(100, PAGE_H)).toEqual({ x: 100, y: 0 });
      expect(apply(300, PAGE_H / 2)).toEqual({ x: 300, y: PAGE_H / 2 });
    });

    it('the matrix is computed against the box it is given, not a fixed page size', () => {
      expect(service.getFlipMatrix('horizontal', 200, 400).e).toBe(200);
      expect(service.getFlipMatrix('vertical', 200, 400).f).toBe(400);
    });

    it('applying a flip matrix twice returns the identity', () => {
      const m = service.getFlipMatrix('both', PAGE_W, PAGE_H);
      const apply = (x: number, y: number) => ({
        x: m.a * x + m.c * y + m.e,
        y: m.b * x + m.d * y + m.f
      });
      const once = apply(123, 456);
      expect(apply(once.x, once.y)).toEqual({ x: 123, y: 456 });
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Flip state composition (a flip is an involution)
  // ════════════════════════════════════════════════════════════════════

  describe('flip state composition', () => {
    it('applying an axis to an unflipped page sets that axis', () => {
      expect(service.composeState(undefined, 'horizontal')).toEqual({
        horizontal: true,
        vertical: false
      });
      expect(service.composeState(undefined, 'vertical')).toEqual({
        horizontal: false,
        vertical: true
      });
      expect(service.composeState(undefined, 'both')).toEqual({
        horizontal: true,
        vertical: true
      });
    });

    it('the same axis twice returns the page to unflipped', () => {
      const once = service.composeState(undefined, 'horizontal');
      expect(service.composeState(once, 'horizontal')).toEqual({
        horizontal: false,
        vertical: false
      });
    });

    it('the two axes are independent', () => {
      const h = service.composeState(undefined, 'horizontal');
      const both = service.composeState(h, 'vertical');
      expect(both).toEqual({ horizontal: true, vertical: true });
      expect(service.composeState(both, 'horizontal')).toEqual({
        horizontal: false,
        vertical: true
      });
    });

    it("'both' on a horizontally flipped page toggles each axis, leaving vertical only", () => {
      const h: PageFlipState = { horizontal: true, vertical: false };
      expect(service.composeState(h, 'both')).toEqual({ horizontal: false, vertical: true });
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Acceptance: text in the output is still selectable (not rasterised)
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: the flipped output is not rasterised', () => {
    it('keeps text extractable after a horizontal flip', async () => {
      const file = await createTextPdfFile('h.pdf');
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.flipPages([mgr.pages[0].id], 'horizontal');
      const result = await mgr.exportSinglePdf(undefined, 'flipped.pdf');

      expect(result.flippedPageCount).toBe(1);
      const text = await extractText(new Uint8Array(await result.file.arrayBuffer()));
      expect(text).toContain('Selectable page 1');
    });

    it('keeps text extractable after a vertical flip', async () => {
      const file = await createTextPdfFile('v.pdf');
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.flipPages([mgr.pages[0].id], 'vertical');
      const result = await mgr.exportSinglePdf(undefined, 'flipped.pdf');

      const text = await extractText(new Uint8Array(await result.file.arrayBuffer()));
      expect(text).toContain('Selectable page 1');
    });

    it('writes the flip as a Form XObject draw, not an image', async () => {
      const file = await createTextPdfFile('x.pdf');
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      mgr.flipPages([mgr.pages[0].id], 'both');

      const result = await mgr.exportSinglePdf(undefined, 'flipped.pdf');
      const raw = new TextDecoder('latin1').decode(
        new Uint8Array(await result.file.arrayBuffer())
      );

      expect(raw).toContain('/Subtype /Form');
      expect(raw).not.toContain('/Subtype /Image');
    });

    it('preserves the page size through a flip', async () => {
      const file = await createTextPdfFile('size.pdf');
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      mgr.flipPages([mgr.pages[0].id], 'horizontal');

      const result = await mgr.exportSinglePdf(undefined, 'flipped.pdf');
      const out = await PDFDocument.load(await result.file.arrayBuffer());
      const size = out.getPage(0).getSize();

      expect(Math.round(size.width)).toBe(PAGE_W);
      expect(Math.round(size.height)).toBe(PAGE_H);
    });

    it('reports a MediaBox whose origin had to be normalised', async () => {
      const file = await createTextPdfFile('offset.pdf', 1, [20, 30]);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      mgr.flipPages([mgr.pages[0].id], 'horizontal');

      const result = await mgr.exportSinglePdf(undefined, 'flipped.pdf');

      expect(result.normalizedOriginPageNumbers).toEqual([1]);
      const text = await extractText(new Uint8Array(await result.file.arrayBuffer()));
      expect(text).toContain('Selectable page 1');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Page-manager integration: selection, whole document, undo/redo
  // ════════════════════════════════════════════════════════════════════

  describe('page manager integration', () => {
    it('flips only the selected pages', async () => {
      const file = await createTextPdfFile('four.pdf', 4);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = mgr.flipPages([mgr.pages[1].id, mgr.pages[3].id], 'horizontal');

      expect(report?.flippedDisplayNumbers).toEqual([2, 4]);
      expect(mgr.pages.map(p => p.flipHorizontal === true)).toEqual([
        false,
        true,
        false,
        true
      ]);
      expect(mgr.getFlippedPages().map(p => p.displayNumber)).toEqual([2, 4]);
    });

    it('flips the whole document', async () => {
      const file = await createTextPdfFile('three.pdf', 3);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = mgr.flipAll('vertical');

      expect(report?.flippedDisplayNumbers).toEqual([1, 2, 3]);
      expect(mgr.pages.every(p => p.flipVertical === true)).toBe(true);
    });

    it('is one undoable operation, and undo restores the previous flip state', async () => {
      const file = await createTextPdfFile('undo.pdf', 3);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const before = mgr.historyLength;
      mgr.flipAll('horizontal');

      expect(mgr.historyLength).toBe(before + 1);
      expect(mgr.pages.every(p => p.flipHorizontal === true)).toBe(true);

      expect(mgr.undo()).toBe(true);
      expect(mgr.pages.every(p => p.flipHorizontal === true)).toBe(false);

      expect(mgr.redo()).toBe(true);
      expect(mgr.pages.every(p => p.flipHorizontal === true)).toBe(true);
    });

    it('reports pages that reverted because the same axis was applied twice', async () => {
      const file = await createTextPdfFile('revert.pdf', 2);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.flipPages([mgr.pages[0].id], 'horizontal');
      const second = mgr.flipPages([mgr.pages[0].id], 'horizontal');

      expect(second?.flippedDisplayNumbers).toEqual([]);
      expect(second?.revertedDisplayNumbers).toEqual([1]);
    });

    it('clearFlips removes a flip and is undoable', async () => {
      const file = await createTextPdfFile('clear.pdf', 2);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.flipAll('both');
      expect(mgr.getFlippedPages().length).toBe(2);

      expect(mgr.clearFlips(mgr.pages.map(p => p.id))).toBe(true);
      expect(mgr.getFlippedPages().length).toBe(0);

      expect(mgr.undo()).toBe(true);
      expect(mgr.getFlippedPages().length).toBe(2);

      expect(mgr.redo()).toBe(true);
      expect(mgr.getFlippedPages().length).toBe(0);
    });

    it('clearFlips is a no-op when nothing is flipped', async () => {
      const file = await createTextPdfFile('noop.pdf', 2);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const before = mgr.historyLength;
      expect(mgr.clearFlips(mgr.pages.map(p => p.id))).toBe(false);
      expect(mgr.historyLength).toBe(before);
    });

    it('composes with rotation rather than replacing it', async () => {
      const file = await createTextPdfFile('rot.pdf', 1);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.rotatePages([mgr.pages[0].id], 90);
      mgr.flipPages([mgr.pages[0].id], 'horizontal');

      expect(mgr.pages[0].rotation).toBe(90);
      expect(mgr.pages[0].flipHorizontal).toBe(true);

      const result = await mgr.exportSinglePdf(undefined, 'rot-flip.pdf');
      const out = await PDFDocument.load(await result.file.arrayBuffer());
      expect(out.getPage(0).getRotation().angle).toBe(90);
    });

    it('leaves unflipped pages on the existing copyPages path', async () => {
      const file = await createTextPdfFile('mixed.pdf', 3);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      mgr.flipPages([mgr.pages[1].id], 'horizontal');
      const result = await mgr.exportSinglePdf(undefined, 'mixed-out.pdf');

      expect(result.flippedPageCount).toBe(1);
      expect(result.pageCount).toBe(3);
    });

    it('an export with no flips reports zero and stays on the original path', async () => {
      const file = await createTextPdfFile('plain.pdf', 2);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const result = await mgr.exportSinglePdf(undefined, 'plain-out.pdf');

      expect(result.flippedPageCount).toBe(0);
      expect(result.normalizedOriginPageNumbers).toEqual([]);
    });

    it('flipPages returns null when given no pages', async () => {
      const file = await createTextPdfFile('empty-sel.pdf', 1);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      expect(mgr.flipPages([], 'horizontal')).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. Preview
  // ════════════════════════════════════════════════════════════════════

  describe('preview', () => {
    it('returns the transform for page 1 and never throws without a canvas', async () => {
      const file = await createTextPdfFile('preview.pdf', 2);
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const preview = await service.renderFlipPreview(
        mgr.pages[0],
        mgr.getSourceDocsMap(),
        { horizontal: true, vertical: false }
      );

      expect(preview.displayNumber).toBe(1);
      expect(preview.state).toEqual({ horizontal: true, vertical: false });
      expect(preview.transform.matrix.a).toBe(-1);
      expect(preview.transform.matrix.e).toBe(PAGE_W);
      // Either an image or a stated reason, never a silent blank.
      expect(Boolean(preview.imageUrl) || Boolean(preview.unavailableReason)).toBe(true);
    });

    it('explains itself rather than throwing when the source is missing', async () => {
      const preview = await service.renderFlipPreview(
        {
          id: 'x',
          sourceDocId: 'missing',
          sourcePageIndex: 0,
          displayNumber: 1,
          originalRotation: 0,
          rotation: 0,
          width: PAGE_W,
          height: PAGE_H
        },
        new Map(),
        { horizontal: false, vertical: true }
      );

      expect(preview.unavailableReason).toBeTruthy();
      expect(preview.transform.matrix.d).toBe(-1);
    });
  });
});
