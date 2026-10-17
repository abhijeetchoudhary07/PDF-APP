import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  PageArrangementUtil,
  PageArrangementMode
} from '../utilities/page-arrangement.util';
import { PdfPageManagerService } from '../services/pdf-page-manager.service';

// ── Helper: create a minimal in-memory PDF with N blank pages ──────

async function createTestPdfFile(numPages: number, name = 'test.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < numPages; i++) {
    doc.addPage([595, 842]);
  }
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

// ════════════════════════════════════════════════════════════════════
//  Unit tests for the pure index-permutation functions
// ════════════════════════════════════════════════════════════════════

describe('PageArrangementUtil — Pure Permutation Functions', () => {

  // ── Mode 1: Reverse ───────────────────────────────────────────────

  describe('Reverse permutation', () => {
    it('should permute even page count (6 pages)', () => {
      const perm = PageArrangementUtil.permuteReverse(6);
      expect(perm).toEqual([5, 4, 3, 2, 1, 0]);

      const items = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
      expect(PageArrangementUtil.applyPermutation(items, perm)).toEqual([
        'p6', 'p5', 'p4', 'p3', 'p2', 'p1'
      ]);
    });

    it('should permute odd page count (5 pages)', () => {
      const perm = PageArrangementUtil.permuteReverse(5);
      expect(perm).toEqual([4, 3, 2, 1, 0]);

      const items = [1, 2, 3, 4, 5];
      expect(PageArrangementUtil.applyPermutation(items, perm)).toEqual([
        5, 4, 3, 2, 1
      ]);
    });

    it('should handle single page (1 page)', () => {
      const perm = PageArrangementUtil.permuteReverse(1);
      expect(perm).toEqual([0]);
      expect(PageArrangementUtil.applyPermutation(['p1'], perm)).toEqual(['p1']);
    });

    it('should handle 0 pages gracefully', () => {
      expect(PageArrangementUtil.permuteReverse(0)).toEqual([]);
    });
  });

  // ── Mode 2: Odd-Even Split ────────────────────────────────────────

  describe('Odd-Even Split permutation', () => {
    it('should permute even page count (6 pages: odds then evens)', () => {
      // 1-indexed pages: 1, 2, 3, 4, 5, 6
      // 0-indexed: odds are 0, 2, 4; evens are 1, 3, 5
      const perm = PageArrangementUtil.permuteOddEvenSplit(6);
      expect(perm).toEqual([0, 2, 4, 1, 3, 5]);

      const items = [1, 2, 3, 4, 5, 6];
      expect(PageArrangementUtil.applyPermutation(items, perm)).toEqual([
        1, 3, 5, 2, 4, 6
      ]);
    });

    it('should permute odd page count (5 pages: odds then evens)', () => {
      // 1-indexed pages: 1, 2, 3, 4, 5
      // 0-indexed: odds are 0, 2, 4; evens are 1, 3
      const perm = PageArrangementUtil.permuteOddEvenSplit(5);
      expect(perm).toEqual([0, 2, 4, 1, 3]);

      const items = [1, 2, 3, 4, 5];
      expect(PageArrangementUtil.applyPermutation(items, perm)).toEqual([
        1, 3, 5, 2, 4
      ]);
    });

    it('should handle small counts (1 and 2 pages)', () => {
      expect(PageArrangementUtil.permuteOddEvenSplit(1)).toEqual([0]);
      expect(PageArrangementUtil.permuteOddEvenSplit(2)).toEqual([0, 1]);
    });

    it('should handle 0 pages gracefully', () => {
      expect(PageArrangementUtil.permuteOddEvenSplit(0)).toEqual([]);
    });
  });

  // ── Mode 3: Odd-Even Merge ────────────────────────────────────────

  describe('Odd-Even Merge permutation', () => {
    it('should permute even page count (6 pages: interleave first and second half)', () => {
      const perm = PageArrangementUtil.permuteOddEvenMerge(6);
      expect(perm).toEqual([0, 3, 1, 4, 2, 5]);

      // If applied to an already split array [1, 3, 5, 2, 4, 6], restores [1, 2, 3, 4, 5, 6]
      const splitItems = [1, 3, 5, 2, 4, 6];
      expect(PageArrangementUtil.applyPermutation(splitItems, perm)).toEqual([
        1, 2, 3, 4, 5, 6
      ]);
    });

    it('should permute odd page count (5 pages: interleave first 3 and last 2)', () => {
      const perm = PageArrangementUtil.permuteOddEvenMerge(5);
      expect(perm).toEqual([0, 3, 1, 4, 2]);

      // If applied to an already split array [1, 3, 5, 2, 4], restores [1, 2, 3, 4, 5]
      const splitItems = [1, 3, 5, 2, 4];
      expect(PageArrangementUtil.applyPermutation(splitItems, perm)).toEqual([
        1, 2, 3, 4, 5
      ]);
    });

    it('should be the exact mathematical inverse of Odd-Even Split for any count', () => {
      for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const original = Array.from({ length: count }, (_, i) => i + 1);
        const splitPerm = PageArrangementUtil.permuteOddEvenSplit(count);
        const splitted = PageArrangementUtil.applyPermutation(original, splitPerm);

        const mergePerm = PageArrangementUtil.permuteOddEvenMerge(count);
        const merged = PageArrangementUtil.applyPermutation(splitted, mergePerm);

        expect(merged).toEqual(original);
      }
    });

    it('should handle 0 and 1 pages', () => {
      expect(PageArrangementUtil.permuteOddEvenMerge(0)).toEqual([]);
      expect(PageArrangementUtil.permuteOddEvenMerge(1)).toEqual([0]);
    });
  });

  // ── Mode 4: Duplex Sort ───────────────────────────────────────────

  describe('Duplex Sort permutation', () => {
    it('Acceptance test: Duplex Sort on a 6-page fixture (1,3,5 then 6,4,2) yields 1..6', () => {
      // 6-page ADF scan fixture: fronts (1, 3, 5) followed by reversed backs (6, 4, 2)
      const fixture6 = [1, 3, 5, 6, 4, 2];
      const perm = PageArrangementUtil.permuteDuplexSort(6, true);

      expect(perm).toEqual([0, 5, 1, 4, 2, 3]);

      const sorted = PageArrangementUtil.applyPermutation(fixture6, perm);
      expect(sorted).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should sort odd page count (5 pages: 1,3,5 then 4,2 with backs reversed) to 1..5', () => {
      // 3 sheets: sheet 1 (1,2), sheet 2 (3,4), sheet 3 (5, blank/absent)
      // Fronts in order: 1, 3, 5. Backs reversed: 4, 2
      const fixture5 = [1, 3, 5, 4, 2];
      const perm = PageArrangementUtil.permuteDuplexSort(5, true);

      expect(perm).toEqual([0, 4, 1, 3, 2]);

      const sorted = PageArrangementUtil.applyPermutation(fixture5, perm);
      expect(sorted).toEqual([1, 2, 3, 4, 5]);
    });

    it('should support backsReversed = false for even count (fronts then backs in forward order)', () => {
      // 6 pages: fronts in order (1, 3, 5) followed by backs in forward order (2, 4, 6)
      const fixture = [1, 3, 5, 2, 4, 6];
      const perm = PageArrangementUtil.permuteDuplexSort(6, false);

      expect(perm).toEqual([0, 3, 1, 4, 2, 5]);

      const sorted = PageArrangementUtil.applyPermutation(fixture, perm);
      expect(sorted).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should support backsReversed = false for odd count', () => {
      // 5 pages: fronts in order (1, 3, 5) followed by backs in forward order (2, 4)
      const fixture = [1, 3, 5, 2, 4];
      const perm = PageArrangementUtil.permuteDuplexSort(5, false);

      expect(perm).toEqual([0, 3, 1, 4, 2]);

      const sorted = PageArrangementUtil.applyPermutation(fixture, perm);
      expect(sorted).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle 1 page for duplex sort', () => {
      const perm = PageArrangementUtil.permuteDuplexSort(1, true);
      expect(perm).toEqual([0]);
      expect(PageArrangementUtil.applyPermutation([1], perm)).toEqual([1]);
    });
  });

  // ── Dispatcher: getPermutation ────────────────────────────────────

  describe('getPermutation dispatcher', () => {
    it('should dispatch to each mode correctly', () => {
      expect(PageArrangementUtil.getPermutation('reverse', 4)).toEqual([3, 2, 1, 0]);
      expect(PageArrangementUtil.getPermutation('odd-even-split', 4)).toEqual([0, 2, 1, 3]);
      expect(PageArrangementUtil.getPermutation('odd-even-merge', 4)).toEqual([0, 2, 1, 3]);
      expect(PageArrangementUtil.getPermutation('duplex-sort', 4, { backsReversed: true })).toEqual([0, 3, 1, 2]);
    });

    it('should return empty array for non-finite or negative counts', () => {
      expect(PageArrangementUtil.getPermutation('reverse', NaN)).toEqual([]);
      expect(PageArrangementUtil.getPermutation('odd-even-split', -3)).toEqual([]);
      expect(PageArrangementUtil.getPermutation('odd-even-merge', 0)).toEqual([]);
      expect(PageArrangementUtil.getPermutation('duplex-sort', Infinity)).toEqual([]);
    });

    it('should handle non-array inputs in applyPermutation safely', () => {
      expect(PageArrangementUtil.applyPermutation(null as any, [0, 1])).toEqual([]);
      expect(PageArrangementUtil.applyPermutation([1, 2], null as any)).toEqual([]);
    });

    it('should throw an error for unsupported arrangement mode', () => {
      expect(() =>
        PageArrangementUtil.getPermutation('invalid-mode' as any, 4)
      ).toThrow('Unknown arrangement mode: invalid-mode');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
//  Integration tests with PdfPageManagerService
// ════════════════════════════════════════════════════════════════════

describe('PdfPageManagerService — Page Arrangement Modes', () => {
  let service: PdfPageManagerService;

  beforeEach(async () => {
    service = new PdfPageManagerService();
    const file = await createTestPdfFile(6, 'fixture.pdf');
    await service.loadDocument(file);
    // Sanity check: 6 pages loaded
    expect(service.pages.length).toBe(6);
    expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // ── Preview Arrangement ───────────────────────────────────────────

  describe('previewArrangement', () => {
    it('should preview Reverse mode without modifying document state', () => {
      const originalIds = service.pages.map(p => p.id);

      const preview = service.previewArrangement('reverse');
      expect(preview.mode).toBe('reverse');
      expect(preview.pageCount).toBe(6);
      expect(preview.previousOrder).toEqual([1, 2, 3, 4, 5, 6]);
      expect(preview.newOrder).toEqual([6, 5, 4, 3, 2, 1]);
      expect(preview.permutation).toEqual([5, 4, 3, 2, 1, 0]);

      // Service pages must NOT have changed
      expect(service.pages.map(p => p.id)).toEqual(originalIds);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(service.canUndo).toBe(false);
    });

    it('should preview Odd-Even Split mode', () => {
      const preview = service.previewArrangement('odd-even-split');
      expect(preview.newOrder).toEqual([1, 3, 5, 2, 4, 6]);
    });

    it('should preview Odd-Even Merge mode', () => {
      const preview = service.previewArrangement('odd-even-merge');
      expect(preview.newOrder).toEqual([1, 4, 2, 5, 3, 6]);
    });

    it('should preview Duplex Sort with toggle', () => {
      const previewReversed = service.previewArrangement('duplex-sort', { backsReversed: true });
      expect(previewReversed.newOrder).toEqual([1, 6, 2, 5, 3, 4]);

      const previewNormal = service.previewArrangement('duplex-sort', { backsReversed: false });
      expect(previewNormal.newOrder).toEqual([1, 4, 2, 5, 3, 6]);
    });
  });

  // ── Apply Arrangement ─────────────────────────────────────────────

  describe('applyArrangement', () => {
    it('should apply Reverse mode and re-index display numbers', () => {
      const success = service.applyArrangement('reverse');
      expect(success).toBe(true);

      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([5, 4, 3, 2, 1, 0]);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should apply Odd-Even Split mode', () => {
      const success = service.applyArrangement('odd-even-split');
      expect(success).toBe(true);

      // Odds (pages 1, 3, 5 -> original index 0, 2, 4), then Evens (pages 2, 4, 6 -> original index 1, 3, 5)
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 4, 1, 3, 5]);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should apply Odd-Even Merge mode', () => {
      // First split
      service.applyArrangement('odd-even-split');
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 4, 1, 3, 5]);

      // Then merge to invert
      const success = service.applyArrangement('odd-even-merge');
      expect(success).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('Acceptance test: Duplex Sort on a 6-page fixture (1,3,5 then 6,4,2) yields 1..6 in service', async () => {
      // Reorder activePages to match the simulated scanned fixture: 1, 3, 5, 6, 4, 2
      // Source indices: 0, 2, 4, 5, 3, 1
      const fixtureOrder = [0, 2, 4, 5, 3, 1];
      const reorderedPages = fixtureOrder.map(idx => service.pages[idx]);
      (service as any).activePages = reorderedPages;
      (service as any).updateDisplayNumbers();

      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 4, 5, 3, 1]);

      // Apply Duplex Sort with backs reversed
      const success = service.applyArrangement('duplex-sort', { backsReversed: true });
      expect(success).toBe(true);

      // Must yield pages 1..6 in reading order (source indices 0, 1, 2, 3, 4, 5)
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle odd page document (5 pages)', async () => {
      const oddService = new PdfPageManagerService();
      const file5 = await createTestPdfFile(5, 'five_pages.pdf');
      await oddService.loadDocument(file5);

      // Duplex sort on 5-page fixture: 1, 3, 5 then 4, 2
      // Source indices: 0, 2, 4, 3, 1
      const fixtureOrder = [0, 2, 4, 3, 1];
      (oddService as any).activePages = fixtureOrder.map(idx => oddService.pages[idx]);
      (oddService as any).updateDisplayNumbers();

      const success = oddService.applyArrangement('duplex-sort', { backsReversed: true });
      expect(success).toBe(true);
      expect(oddService.pages.map(p => p.sourcePageIndex)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should return false when document has <= 1 pages', async () => {
      const singleService = new PdfPageManagerService();
      const file1 = await createTestPdfFile(1, 'one_page.pdf');
      await singleService.loadDocument(file1);

      expect(singleService.applyArrangement('reverse')).toBe(false);
    });
  });

  // ── Preview matches applied result ────────────────────────────────

  describe('Preview matches applied result', () => {
    const modes: { mode: PageArrangementMode; options?: { backsReversed?: boolean } }[] = [
      { mode: 'reverse' },
      { mode: 'odd-even-split' },
      { mode: 'odd-even-merge' },
      { mode: 'duplex-sort', options: { backsReversed: true } },
      { mode: 'duplex-sort', options: { backsReversed: false } }
    ];

    for (const { mode, options } of modes) {
      it(`preview matches apply for ${mode} (options: ${JSON.stringify(options || {})})`, async () => {
        const svc = new PdfPageManagerService();
        const file = await createTestPdfFile(6, 'match.pdf');
        await svc.loadDocument(file);

        const preview = svc.previewArrangement(mode, options);
        svc.applyArrangement(mode, options);

        // Map preview permutation to source page index
        const expectedSourceIndices = preview.permutation.map(idx => idx);
        expect(svc.pages.map(p => p.sourcePageIndex)).toEqual(expectedSourceIndices);
      });
    }
  });

  // ── Undo & Redo ───────────────────────────────────────────────────

  describe('Undo/Redo integration', () => {
    it('should record arrangement as exactly one undoable operation', () => {
      expect(service.historyLength).toBe(0);
      service.applyArrangement('reverse');
      expect(service.historyLength).toBe(1);
    });

    it('should undo an arrangement operation to restore previous order', () => {
      const originalSourceIndices = service.pages.map(p => p.sourcePageIndex);
      const originalIds = service.pages.map(p => p.id);

      service.applyArrangement('reverse');
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([5, 4, 3, 2, 1, 0]);
      expect(service.canUndo).toBe(true);

      // Undo
      service.undo();
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual(originalSourceIndices);
      expect(service.pages.map(p => p.id)).toEqual(originalIds);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should redo an arrangement operation', () => {
      service.applyArrangement('reverse');
      const reversedIds = service.pages.map(p => p.id);

      service.undo();
      expect(service.canRedo).toBe(true);

      service.redo();
      expect(service.pages.map(p => p.id)).toEqual(reversedIds);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([5, 4, 3, 2, 1, 0]);
    });
  });
});
