import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { DuplicatePageService } from './duplicate-page.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { PageFingerprint } from '../models/duplicate-page.types';

// Helper to create in-memory PDF file
async function createPdfFile(
  buildDoc: (doc: PDFDocument) => Promise<void>,
  fileName = 'test.pdf'
): Promise<File> {
  const doc = await PDFDocument.create();
  await buildDoc(doc);
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

describe('DuplicatePageService', () => {
  let service: DuplicatePageService;

  beforeEach(() => {
    service = new DuplicatePageService();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance Criteria: Duplicated page is grouped
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance Criteria: Duplicated Page is Grouped', () => {
    it('Acceptance test: a duplicated page is grouped under exact duplicates', async () => {
      // 3-page document: Page 1 (Contract), Page 2 (Receipt), Page 3 (Exact copy of Contract)
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);

        const p1 = doc.addPage([595, 842]);
        p1.drawText('Official Purchase Agreement 2026', { x: 50, y: 700, size: 14, font });
        p1.drawText('Vendor: Acme Corp. Amount: $10,000 USD', { x: 50, y: 650, size: 10, font });

        const p2 = doc.addPage([595, 842]);
        p2.drawText('Payment Receipt - Transaction 9912', { x: 50, y: 700, size: 14, font });

        // Page 3 is exact duplicate of Page 1
        const p3 = doc.addPage([595, 842]);
        p3.drawText('Official Purchase Agreement 2026', { x: 50, y: 700, size: 14, font });
        p3.drawText('Vendor: Acme Corp. Amount: $10,000 USD', { x: 50, y: 650, size: 10, font });
      }, 'duplicates.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(3);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap());

      // Page 1 and Page 3 must be grouped under exact duplicates!
      expect(report.exactGroups.length).toBe(1);
      const group = report.exactGroups[0];
      expect(group.pages.length).toBe(2);
      expect(group.pages.map(p => p.pageNumber)).toEqual([1, 3]);

      // Page 2 (Receipt) must NOT be in the group
      expect(group.pages.some(p => p.pageNumber === 2)).toBe(false);

      // Keep-first is the default: Page 1 is keep, Page 3 is remove
      expect(group.pages[0].keep).toBe(true);
      expect(group.pages[0].isFirst).toBe(true);
      expect(group.pages[1].keep).toBe(false);
      expect(group.pages[1].isFirst).toBe(false);
    });

    it('Acceptance test: a duplicated image-only page (no text layer) is grouped', async () => {
      // 3-page doc: Page 1 has rectangle pattern A, Page 2 pattern B, Page 3 identical pattern A
      const file = await createPdfFile(async doc => {
        const p1 = doc.addPage([595, 842]);
        p1.drawRectangle({ x: 100, y: 500, width: 200, height: 100, color: rgb(0.2, 0.4, 0.8) });

        const p2 = doc.addPage([595, 842]);
        p2.drawRectangle({ x: 200, y: 200, width: 80, height: 250, color: rgb(0.8, 0.2, 0.1) });

        const p3 = doc.addPage([595, 842]);
        p3.drawRectangle({ x: 100, y: 500, width: 200, height: 100, color: rgb(0.2, 0.4, 0.8) });
      }, 'scans.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap());

      expect(report.exactGroups.length).toBe(1);
      expect(report.exactGroups[0].pages.map(p => p.pageNumber)).toEqual([1, 3]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Acceptance Criteria: Visually similar but different page is NOT grouped
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance Criteria: Visually Similar But Different Pages', () => {
    it('Acceptance test: a visually similar but different page is NOT grouped at default threshold', async () => {
      // Two pages sharing a similar corporate header but with different invoices / paragraphs
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);

        // Page 1: Invoice #101
        const p1 = doc.addPage([595, 842]);
        p1.drawText('GLOBAL ENTERPRISE CORPORATION', { x: 50, y: 750, size: 16, font });
        p1.drawText('Statement for January 2026', { x: 50, y: 720, size: 12, font });
        p1.drawText('Invoice Number: INV-00101', { x: 50, y: 680, size: 10, font });
        p1.drawText('Customer: Department of Urban Development', { x: 50, y: 650, size: 10, font });
        p1.drawText('Total Due: $45,200.00 (Due Date: Jan 31)', { x: 50, y: 620, size: 10, font });

        // Page 2: Invoice #102 with completely different amounts and recipient
        const p2 = doc.addPage([595, 842]);
        p2.drawText('GLOBAL ENTERPRISE CORPORATION', { x: 50, y: 750, size: 16, font });
        p2.drawText('Statement for February 2026', { x: 50, y: 720, size: 12, font });
        p2.drawText('Invoice Number: INV-00102', { x: 50, y: 680, size: 10, font });
        p2.drawText('Customer: Apex Engineering Solutions Pvt Ltd', { x: 50, y: 650, size: 10, font });
        p2.drawText('Total Due: $8,750.00 (Due Date: Feb 28)', { x: 50, y: 620, size: 10, font });
      }, 'similar_invoices.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        hammingThreshold: service.DEFAULT_HAMMING_THRESHOLD
      });

      // Must NOT be grouped as exact duplicates (text differs)
      expect(report.exactGroups.length).toBe(0);
      // Must NOT be grouped as near duplicates at default threshold (dHash bit differences exceed 4)
      expect(report.nearGroups.length).toBe(0);
      expect(report.totalDuplicatesFound).toBe(0);
    });

    it('Acceptance test: near-duplicate fixture is detected when visual layout differences are small', () => {
      // Create synthetic fingerprints with known small Hamming distances
      const fp1: PageFingerprint = {
        pageId: 'p1',
        pageIndex: 0,
        pageNumber: 1,
        sourceDocId: 'd1',
        sourcePageIndex: 0,
        dHash: '1111000011110000111100001111000011110000111100001111000011110000',
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // fp2 differs by exactly 2 bits from fp1 (near-duplicate)
      const fp2: PageFingerprint = {
        pageId: 'p2',
        pageIndex: 1,
        pageNumber: 2,
        sourceDocId: 'd1',
        sourcePageIndex: 1,
        dHash: '1111000011110000111100001111000011110000111100001111000011110011', // 2 bits flipped
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // fp3 differs by 20 bits (distinct page)
      const fp3: PageFingerprint = {
        pageId: 'p3',
        pageIndex: 2,
        pageNumber: 3,
        sourceDocId: 'd1',
        sourcePageIndex: 2,
        dHash: '0000111100001111000011110000111100001111000011110000111100001111',
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // At default threshold 4: fp1 and fp2 are grouped under nearGroups; fp3 is isolated
      const { exactGroups, nearGroups } = service.groupFingerprints([fp1, fp2, fp3], 4);

      expect(exactGroups.length).toBe(0);
      expect(nearGroups.length).toBe(1);
      expect(nearGroups[0].pages.map(p => p.pageNumber)).toEqual([1, 2]);
      expect(nearGroups[0].distance).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Acceptance Criteria: Grouping is Order-Independent
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance Criteria: Order-Independence', () => {
    it('Acceptance test: grouping produces the exact same groups regardless of input permutation', () => {
      const p1: PageFingerprint = {
        pageId: 'p1',
        pageIndex: 0,
        pageNumber: 1,
        sourceDocId: 'd1',
        sourcePageIndex: 0,
        dHash: '1111000011110000111100001111000011110000111100001111000011110000',
        hasText: true,
        textExcerpt: 'Contract Terms',
        textHash: 'hash_contract'
      };

      const p2: PageFingerprint = {
        pageId: 'p2',
        pageIndex: 1,
        pageNumber: 2,
        sourceDocId: 'd1',
        sourcePageIndex: 1,
        dHash: '0000111100001111000011110000111100001111000011110000111100001111',
        hasText: true,
        textExcerpt: 'Payment Receipt',
        textHash: 'hash_receipt'
      };

      const p3: PageFingerprint = {
        pageId: 'p3',
        pageIndex: 2,
        pageNumber: 3,
        sourceDocId: 'd1',
        sourcePageIndex: 2,
        dHash: '1111000011110000111100001111000011110000111100001111000011110000',
        hasText: true,
        textExcerpt: 'Contract Terms',
        textHash: 'hash_contract' // exact duplicate of p1
      };

      const p4: PageFingerprint = {
        pageId: 'p4',
        pageIndex: 3,
        pageNumber: 4,
        sourceDocId: 'd1',
        sourcePageIndex: 3,
        dHash: '0000111100001111000011110000111100001111000011110000111100001110', // near-duplicate of p2 (1 bit diff)
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // Permutation A: Forward [p1, p2, p3, p4]
      const orderA = [p1, p2, p3, p4];
      const resA = service.groupFingerprints(orderA, 4);

      // Permutation B: Reversed [p4, p3, p2, p1]
      const orderB = [p4, p3, p2, p1];
      const resB = service.groupFingerprints(orderB, 4);

      // Permutation C: Shuffled [p2, p4, p1, p3]
      const orderC = [p2, p4, p1, p3];
      const resC = service.groupFingerprints(orderC, 4);

      // Permutation D: Shuffled [p3, p1, p4, p2]
      const orderD = [p3, p1, p4, p2];
      const resD = service.groupFingerprints(orderD, 4);

      // 1. Exact groups must be identical across all permutations
      const exactA = resA.exactGroups.map(g => g.pages.map(p => p.pageId));
      const exactB = resB.exactGroups.map(g => g.pages.map(p => p.pageId));
      const exactC = resC.exactGroups.map(g => g.pages.map(p => p.pageId));
      const exactD = resD.exactGroups.map(g => g.pages.map(p => p.pageId));

      expect(exactA).toEqual([['p1', 'p3']]);
      expect(exactB).toEqual([['p1', 'p3']]);
      expect(exactC).toEqual([['p1', 'p3']]);
      expect(exactD).toEqual([['p1', 'p3']]);

      // 2. Near groups must be identical across all permutations
      const nearA = resA.nearGroups.map(g => g.pages.map(p => p.pageId));
      const nearB = resB.nearGroups.map(g => g.pages.map(p => p.pageId));
      const nearC = resC.nearGroups.map(g => g.pages.map(p => p.pageId));
      const nearD = resD.nearGroups.map(g => g.pages.map(p => p.pageId));

      expect(nearA).toEqual([['p2', 'p4']]);
      expect(nearB).toEqual([['p2', 'p4']]);
      expect(nearC).toEqual([['p2', 'p4']]);
      expect(nearD).toEqual([['p2', 'p4']]);

      // 3. Keep-first must always select the original (p1 for exact, p2 for near)
      expect(resA.exactGroups[0].pages[0].pageId).toBe('p1');
      expect(resA.exactGroups[0].pages[0].keep).toBe(true);
      expect(resB.exactGroups[0].pages[0].pageId).toBe('p1');
      expect(resB.exactGroups[0].pages[0].keep).toBe(true);

      expect(resA.nearGroups[0].pages[0].pageId).toBe('p2');
      expect(resA.nearGroups[0].pages[0].keep).toBe(true);
      expect(resB.nearGroups[0].pages[0].pageId).toBe('p2');
      expect(resB.nearGroups[0].pages[0].keep).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Live Adjustable Threshold Recomputation
  // ════════════════════════════════════════════════════════════════════

  describe('Live Adjustable Hamming Threshold', () => {
    it('should recompute near-duplicate groups instantly when user moves the slider', () => {
      const p1: PageFingerprint = {
        pageId: 'p1',
        pageIndex: 0,
        pageNumber: 1,
        sourceDocId: 'd1',
        sourcePageIndex: 0,
        dHash: '1111000011110000111100001111000011110000111100001111000011110000',
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // p2 has distance 3 from p1
      const p2: PageFingerprint = {
        pageId: 'p2',
        pageIndex: 1,
        pageNumber: 2,
        sourceDocId: 'd1',
        sourcePageIndex: 1,
        dHash: '1111000011110000111100001111000011110000111100001111000011110111', // 3 bits diff
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      // p3 has distance 6 from p1
      const p3: PageFingerprint = {
        pageId: 'p3',
        pageIndex: 2,
        pageNumber: 3,
        sourceDocId: 'd1',
        sourcePageIndex: 2,
        dHash: '1111000011110000111100001111000011110000111100001111000000000000', // 4 bits diff from p1
        hasText: false,
        textExcerpt: '',
        textHash: ''
      };

      const fps = [p1, p2, p3];

      // At strict threshold 2: no near groups (distance 3 > 2)
      const reportStrict = service.recomputeReport(fps, 2);
      expect(reportStrict.nearGroups.length).toBe(0);

      // At threshold 4: p1 and p2 are grouped (distance 3 <= 4)
      const reportMid = service.recomputeReport(fps, 4);
      expect(reportMid.nearGroups.length).toBe(1);
      expect(reportMid.nearGroups[0].pages.map(p => p.pageNumber)).toEqual([1, 2, 3]);

      // Exact groups remain 0 throughout
      expect(reportStrict.exactGroups.length).toBe(0);
      expect(reportMid.exactGroups.length).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. Undo & Redo Integration with PdfPageManagerService
  // ════════════════════════════════════════════════════════════════════

  describe('Undo/Redo Integration', () => {
    it('should delete selected duplicate pages as a single undoable operation that can be restored', async () => {
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p1 = doc.addPage([595, 842]);
        p1.drawText('Page A Original', { x: 50, y: 700, size: 12, font });

        const p2 = doc.addPage([595, 842]);
        p2.drawText('Page B Content', { x: 50, y: 700, size: 12, font });

        const p3 = doc.addPage([595, 842]);
        p3.drawText('Page A Original', { x: 50, y: 700, size: 12, font }); // duplicate of p1
      }, 'undo_duplicates.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(3);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap());
      expect(report.exactGroups.length).toBe(1);

      // Duplicate to remove: Page 3 (p3)
      const toRemoveIds = report.exactGroups[0].pages.filter(p => !p.keep).map(p => p.pageId);
      expect(toRemoveIds.length).toBe(1);

      mgr.deletePages(toRemoveIds);
      expect(mgr.pages.length).toBe(2);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2]);

      // Undo
      mgr.undo();
      expect(mgr.pages.length).toBe(3);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2, 3]);

      // Redo
      mgr.redo();
      expect(mgr.pages.length).toBe(2);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2]);
    });
  });
});
