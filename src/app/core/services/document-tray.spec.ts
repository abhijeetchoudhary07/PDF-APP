import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { TRAY_COLOR_COUNT } from '../models/document-tray.types';

async function createDoc(
  fileName: string,
  labels: string[],
  size: [number, number] = [595, 842]
): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = doc.addPage(size);
    page.drawText(label, { x: 50, y: size[1] - 100, size: 28, font, color: rgb(0, 0, 0) });
  }
  const bytes = await doc.save();
  return new File([new Blob([bytes as any], { type: 'application/pdf' })], fileName, {
    type: 'application/pdf'
  });
}

/** The three-document fixture the acceptance criteria call for. */
async function loadThree(): Promise<PdfPageManagerService> {
  const mgr = new PdfPageManagerService();
  await mgr.loadMultipleDocuments([
    await createDoc('alpha.pdf', ['A1', 'A2']),
    await createDoc('beta.pdf', ['B1', 'B2', 'B3']),
    await createDoc('gamma.pdf', ['G1'])
  ]);
  return mgr;
}

async function pageTexts(file: File): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) } as any);
  const pdf = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push(
      (content.items as any[])
        .map(item => (typeof item?.str === 'string' ? item.str : ''))
        .join('')
        .trim()
    );
  }
  await (pdf as any).destroy?.();
  return out;
}

describe('Multi-document tray', () => {
  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance: three documents keep sourceDocId and sourcePageIndex
  //    through reorder, rotate and export
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: provenance survives reorder, rotate and export', () => {
    it('holds pages from three documents on one canvas', async () => {
      const mgr = await loadThree();

      expect(mgr.sourceDocs.length).toBe(3);
      expect(mgr.pages.length).toBe(6);
      expect(mgr.isMultiDocument).toBe(true);
      expect(await pageTexts((await mgr.exportSinglePdf(undefined, 'merged.pdf')).file)).toEqual([
        'A1',
        'A2',
        'B1',
        'B2',
        'B3',
        'G1'
      ]);
    });

    it('keeps sourceDocId and sourcePageIndex correct after reordering', async () => {
      const mgr = await loadThree();
      const before = mgr.pages.map(p => ({
        doc: p.sourceDocId,
        index: p.sourcePageIndex
      }));

      // Move gamma's only page to the very front, then alpha's first page last.
      mgr.reorderPage(5, 0);
      mgr.reorderPage(1, 5);

      const after = mgr.pages.map(p => ({ doc: p.sourceDocId, index: p.sourcePageIndex }));

      // Same six (doc, index) pairs, in a new order — none rewritten.
      expect([...after].sort((a, b) => a.doc.localeCompare(b.doc) || a.index - b.index)).toEqual(
        [...before].sort((a, b) => a.doc.localeCompare(b.doc) || a.index - b.index)
      );
      expect(after[0]).toEqual(before[5]);
      expect(after[5]).toEqual(before[0]);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('keeps sourceDocId and sourcePageIndex correct after rotating', async () => {
      const mgr = await loadThree();
      const target = mgr.pages[3];
      const { sourceDocId, sourcePageIndex } = target;

      mgr.rotatePages([target.id], 90);

      expect(target.sourceDocId).toBe(sourceDocId);
      expect(target.sourcePageIndex).toBe(sourcePageIndex);
      expect(target.rotation).toBe(90);
    });

    it('exports the reordered, rotated canvas with each page from the right source', async () => {
      const mgr = await loadThree();

      mgr.reorderPage(5, 0); // G1 to the front
      mgr.rotatePages([mgr.pages[0].id], 90);
      mgr.rotatePages([mgr.pages[3].id], 180);

      const result = await mgr.exportSinglePdf(undefined, 'merged.pdf');

      expect(await pageTexts(result.file)).toEqual(['G1', 'A1', 'A2', 'B1', 'B2', 'B3']);

      const out = await PDFDocument.load(await result.file.arrayBuffer());
      expect(out.getPage(0).getRotation().angle).toBe(90);
      expect(out.getPage(3).getRotation().angle).toBe(180);
    });

    it('splits back out by source, keeping canvas order within each document', async () => {
      const mgr = await loadThree();

      // Interleave the sources, then split back out.
      mgr.reorderPage(5, 0); // G1, A1, A2, B1, B2, B3
      mgr.reorderPage(3, 1); // G1, B1, A1, A2, B2, B3

      const parts = await mgr.exportBySourceDocument();

      expect(parts.map(p => p.sourceDocName)).toEqual(['alpha.pdf', 'beta.pdf', 'gamma.pdf']);
      expect(parts.map(p => p.name)).toEqual([
        'alpha_from_organizer.pdf',
        'beta_from_organizer.pdf',
        'gamma_from_organizer.pdf'
      ]);
      expect(await pageTexts(parts[0].file)).toEqual(['A1', 'A2']);
      expect(await pageTexts(parts[1].file)).toEqual(['B1', 'B2', 'B3']);
      expect(await pageTexts(parts[2].file)).toEqual(['G1']);
    });

    it('carries rotation and flip into the per-source split', async () => {
      const mgr = await loadThree();

      mgr.rotatePages([mgr.pages[0].id], 270);
      mgr.flipPages([mgr.pages[2].id], 'horizontal');

      const parts = await mgr.exportBySourceDocument();

      const alpha = await PDFDocument.load(await parts[0].file.arrayBuffer());
      expect(alpha.getPage(0).getRotation().angle).toBe(270);

      expect(parts[1].flippedPageCount).toBe(1);
      expect(await pageTexts(parts[1].file)).toEqual(['B1', 'B2', 'B3']);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Acceptance: loading one file behaves identically to today
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: a single document is unchanged', () => {
    it('reports itself as single-document', async () => {
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(await createDoc('solo.pdf', ['S1', 'S2', 'S3']));

      expect(mgr.isMultiDocument).toBe(false);
      expect(mgr.sourceDocs.length).toBe(1);
      expect(mgr.pages.length).toBe(3);
    });

    it('a one-file tray describes exactly that file', async () => {
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(await createDoc('solo.pdf', ['S1', 'S2', 'S3']));

      const tray = mgr.getDocumentTray();

      expect(tray.length).toBe(1);
      expect(tray[0].name).toBe('solo.pdf');
      expect(tray[0].pageCount).toBe(3);
      expect(tray[0].originalPageCount).toBe(3);
      expect(tray[0].displayNumbers).toEqual([1, 2, 3]);
      expect(tray[0].emptied).toBe(false);
    });

    it('exports a single document identically through either path', async () => {
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(await createDoc('solo.pdf', ['S1', 'S2']));

      const merged = await mgr.exportSinglePdf(undefined, 'out.pdf');
      const parts = await mgr.exportBySourceDocument();

      expect(parts.length).toBe(1);
      expect(await pageTexts(parts[0].file)).toEqual(await pageTexts(merged.file));
    });

    it('loadMultipleDocuments with one file matches loadDocument', async () => {
      const single = new PdfPageManagerService();
      await single.loadDocument(await createDoc('one.pdf', ['X1', 'X2']));

      const viaMulti = new PdfPageManagerService();
      await viaMulti.loadMultipleDocuments([await createDoc('one.pdf', ['X1', 'X2'])]);

      expect(viaMulti.pages.length).toBe(single.pages.length);
      expect(viaMulti.isMultiDocument).toBe(false);
      expect(viaMulti.pages.map(p => p.sourcePageIndex)).toEqual(
        single.pages.map(p => p.sourcePageIndex)
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Badges and colour coding
  // ════════════════════════════════════════════════════════════════════

  describe('source badges', () => {
    it('gives every document a distinct colour slot in load order', async () => {
      const mgr = await loadThree();
      const tray = mgr.getDocumentTray();

      expect(tray.map(e => e.name)).toEqual(['alpha.pdf', 'beta.pdf', 'gamma.pdf']);
      expect(tray.map(e => e.colorIndex)).toEqual([0, 1, 2]);
    });

    it('badges a page with its file name and its number within that file', async () => {
      const mgr = await loadThree();

      const b2 = mgr.pages[3];
      const badge = mgr.getPageBadge(b2);

      expect(badge?.name).toBe('beta.pdf');
      expect(badge?.sourcePageNumber).toBe(2);
      expect(badge?.colorIndex).toBe(1);
    });

    it('keeps a page badged to its own source after reordering', async () => {
      const mgr = await loadThree();
      mgr.reorderPage(5, 0);

      expect(mgr.getPageBadge(mgr.pages[0])?.name).toBe('gamma.pdf');
      expect(mgr.getPageBadge(mgr.pages[1])?.name).toBe('alpha.pdf');
    });

    it('cycles colours rather than running out', async () => {
      const mgr = new PdfPageManagerService();
      const files = [];
      for (let i = 0; i < TRAY_COLOR_COUNT + 2; i++) {
        files.push(await createDoc(`doc${i}.pdf`, [`P${i}`]));
      }
      await mgr.loadMultipleDocuments(files);

      const indices = mgr.getDocumentTray().map(e => e.colorIndex);
      expect(indices.length).toBe(TRAY_COLOR_COUNT + 2);
      expect(indices.every(i => i >= 0 && i < TRAY_COLOR_COUNT)).toBe(true);
      expect(indices[TRAY_COLOR_COUNT]).toBe(0);
    });

    it('a colour slot is not reused while its document is still loaded', async () => {
      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(await createDoc('first.pdf', ['F1']));
      await mgr.loadDocument(await createDoc('second.pdf', ['S1']));

      const indices = mgr.getDocumentTray().map(e => e.colorIndex);
      expect(new Set(indices).size).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Tray behaviour as the canvas changes
  // ════════════════════════════════════════════════════════════════════

  describe('tray tracks the canvas, not the files', () => {
    it('counts the pages still on the canvas, and keeps the file count too', async () => {
      const mgr = await loadThree();
      const betaId = mgr.sourceDocs[1].id;

      mgr.deletePages(mgr.getPagesBySourceDoc(betaId).slice(0, 2).map(p => p.id));
      const beta = mgr.getDocumentTray().find(e => e.docId === betaId);

      expect(beta?.pageCount).toBe(1);
      expect(beta?.originalPageCount).toBe(3);
      expect(beta?.emptied).toBe(false);
    });

    it('marks a document emptied but keeps it listed, so undo has somewhere to land', async () => {
      const mgr = await loadThree();
      const gammaId = mgr.sourceDocs[2].id;

      mgr.deletePages(mgr.getPagesBySourceDoc(gammaId).map(p => p.id));
      const gamma = mgr.getDocumentTray().find(e => e.docId === gammaId);

      expect(gamma).toBeDefined();
      expect(gamma?.emptied).toBe(true);
      expect(gamma?.pageCount).toBe(0);

      mgr.undo();
      expect(mgr.getDocumentTray().find(e => e.docId === gammaId)?.pageCount).toBe(1);
    });

    it('leaves an emptied document out of the split plan', async () => {
      const mgr = await loadThree();
      const gammaId = mgr.sourceDocs[2].id;
      mgr.deletePages(mgr.getPagesBySourceDoc(gammaId).map(p => p.id));

      const plan = mgr.getSourceSplitPlan();

      expect(plan.entries.map(e => e.name)).toEqual(['alpha.pdf', 'beta.pdf']);
      expect(plan.totalPages).toBe(5);
    });

    it('counts a duplicated page against its original source', async () => {
      const mgr = await loadThree();
      const alphaId = mgr.sourceDocs[0].id;

      mgr.duplicatePages([mgr.pages[0].id]);
      const alpha = mgr.getDocumentTray().find(e => e.docId === alphaId);

      expect(alpha?.pageCount).toBe(3);
      expect(alpha?.originalPageCount).toBe(2);
      expect(mgr.getPagesBySourceDoc(alphaId).map(p => p.sourcePageIndex)).toEqual([0, 0, 1]);
    });

    it('selects every page from one source', async () => {
      const mgr = await loadThree();
      const betaId = mgr.sourceDocs[1].id;

      const count = mgr.selectPagesBySourceDoc(betaId);

      expect(count).toBe(3);
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([3, 4, 5]);
    });

    it('replaces a previous selection when selecting by source', async () => {
      const mgr = await loadThree();
      mgr.selectAll();

      mgr.selectPagesBySourceDoc(mgr.sourceDocs[2].id);

      expect(mgr.selectedCount).toBe(1);
      expect(mgr.getSelectedPages()[0].displayNumber).toBe(6);
    });

    it('refuses a per-source export with nothing on the canvas', async () => {
      const mgr = new PdfPageManagerService();
      await expect(mgr.exportBySourceDocument()).rejects.toThrow('No pages to export.');
    });

    it('reports progress across the parts', async () => {
      const mgr = await loadThree();
      const seen: number[] = [];

      await mgr.exportBySourceDocument(p => seen.push(p));

      expect(seen).toEqual([33, 67, 100]);
    });

    it('clear() resets the colour cycle', async () => {
      const mgr = await loadThree();
      mgr.clear();
      await mgr.loadDocument(await createDoc('fresh.pdf', ['N1']));

      expect(mgr.getDocumentTray()[0].colorIndex).toBe(0);
    });
  });
});
