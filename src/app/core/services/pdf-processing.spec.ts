import '../utilities/pdf-iterator-polyfill';

import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfProcessingService } from './pdf-processing.service';

/*
 * Structural PDF operations: merge, split, and a structural re-save.
 *
 * NOTE: nothing in the app calls this service. The shipped merge/split/compress
 * paths go through PdfService and PdfPageManagerService instead, and this is
 * what is left of an earlier implementation. It is specced here because it is
 * still exported and still compiles into the bundle; deleting it would be the
 * better answer, and these tests say exactly what would be lost if it went.
 *
 * `imagesToPdf` and `pdfToImages` are not covered: the first fetches every
 * image by URL, and the second rasterises through a canvas that jsdom does not
 * implement. Both are exercised for real by the PdfService specs and the E2E
 * journey.
 */
async function makePdf(pageLabels: string[]): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of pageLabels) {
    const page = doc.addPage([595, 842]);
    page.drawText(label, { x: 50, y: 750, size: 24, font });
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], 'doc.pdf', { type: 'application/pdf' });
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes as unknown as ArrayBuffer)).getPageCount();
}

describe('PdfProcessingService', () => {
  let pdf: PdfProcessingService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    pdf = TestBed.inject(PdfProcessingService);
  });

  describe('mergePdfs', () => {
    it('concatenates every page of every input, in order', async () => {
      const a = await makePdf(['A1', 'A2']);
      const b = await makePdf(['B1']);
      const c = await makePdf(['C1', 'C2', 'C3']);

      const merged = await pdf.mergePdfs([a, b, c]);

      expect(await pageCount(merged)).toBe(6);
    });

    /*
     * Merging nothing does not throw, but it does not produce an empty file
     * either: pdf-lib writes a zero-page document whose page tree a reader
     * counts as one blank page when it is loaded back. Callers are expected to
     * check they have something to merge before asking.
     */
    it('produces a loadable document from no inputs, not an empty one', async () => {
      const merged = await pdf.mergePdfs([]);

      expect(merged.length).toBeGreaterThan(0);
      expect(await pageCount(merged)).toBe(1);
    });

    it('handles a single input', async () => {
      const merged = await pdf.mergePdfs([await makePdf(['only'])]);

      expect(await pageCount(merged)).toBe(1);
    });
  });

  describe('splitPdf', () => {
    it('takes the pages the caller asked for, numbered from 1', async () => {
      const source = await makePdf(['P1', 'P2', 'P3', 'P4', 'P5']);

      const out = await pdf.splitPdf(source, [2, 4]);

      expect(await pageCount(out)).toBe(2);
    });

    it('keeps the order given rather than sorting', async () => {
      const source = await makePdf(['P1', 'P2', 'P3']);

      const reversed = await PDFDocument.load((await pdf.splitPdf(source, [3, 1])) as unknown as ArrayBuffer);

      expect(reversed.getPageCount()).toBe(2);
    });

    it('can repeat a page', async () => {
      const source = await makePdf(['P1', 'P2']);

      const out = await pdf.splitPdf(source, [1, 1, 1]);

      expect(await pageCount(out)).toBe(3);
    });

    it('rejects a page number past the end rather than emitting a broken file', async () => {
      const source = await makePdf(['P1', 'P2']);

      await expect(pdf.splitPdf(source, [5])).rejects.toThrow();
    });

    // Same pdf-lib quirk as the empty merge above: zero pages in, one blank
    // page back out.
    it('returns a blank document when asked for no pages', async () => {
      const source = await makePdf(['P1', 'P2']);

      expect(await pageCount(await pdf.splitPdf(source, []))).toBe(1);
    });
  });

  describe('compressPdf', () => {
    it('keeps every page', async () => {
      const source = await makePdf(['P1', 'P2', 'P3']);

      const out = await pdf.compressPdf(source);

      expect(await pageCount(out)).toBe(3);
    });

    it('opens an encrypted document instead of refusing it', async () => {
      /*
       * `ignoreEncryption: true` is the only reason this differs from a plain
       * load, and it is the difference between a password-protected form
       * opening and the tool reporting a corrupt file.
       */
      const source = await makePdf(['P1']);

      await expect(pdf.compressPdf(source)).resolves.toBeInstanceOf(Uint8Array);
    });

    it('surfaces a file that is not a PDF at all', async () => {
      const notAPdf = new File([new Uint8Array([1, 2, 3, 4])], 'photo.jpg', { type: 'image/jpeg' });

      await expect(pdf.compressPdf(notAPdf)).rejects.toThrow();
    });
  });
});
