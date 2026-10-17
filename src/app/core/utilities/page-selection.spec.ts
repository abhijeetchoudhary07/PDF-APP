import './pdf-iterator-polyfill';
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PageSelectionUtil } from './page-selection.util';
import { PdfPageManagerService } from '../services/pdf-page-manager.service';
import { BlankPageService } from '../services/blank-page.service';
import { DuplicatePageService } from '../services/duplicate-page.service';

/**
 * The mixed fixture the acceptance criteria call for: portrait and landscape,
 * A4 and Letter, in one document.
 *
 *   p1  595 x 842   A4 portrait
 *   p2  842 x 595   A4 landscape
 *   p3  612 x 792   Letter portrait
 *   p4  595 x 842   A4 portrait
 *   p5  792 x 612   Letter landscape
 *   p6  400 x 400   square, no standard name
 */
const MIXED_SIZES: [number, number][] = [
  [595, 842],
  [842, 595],
  [612, 792],
  [595, 842],
  [792, 612],
  [400, 400]
];

async function createMixedFixture(fileName = 'mixed.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  MIXED_SIZES.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Sheet ${i + 1}`, { x: 40, y: h - 60, size: 14, font, color: rgb(0, 0, 0) });
  });
  const bytes = await doc.save();
  return new File([new Blob([bytes as any], { type: 'application/pdf' })], fileName, {
    type: 'application/pdf'
  });
}

async function loadMixed(): Promise<PdfPageManagerService> {
  const mgr = new PdfPageManagerService();
  await mgr.loadDocument(await createMixedFixture());
  return mgr;
}

describe('PageSelectionUtil — additional selection helpers', () => {
  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance: one test per predicate on the mixed fixture
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: per-predicate on a mixed fixture', () => {
    it('selects landscape pages only', async () => {
      const mgr = await loadMixed();
      const match = mgr.previewSelectionHelper('landscape');
      expect(match.displayNumbers).toEqual([2, 5]);
      expect(match.matchedCount).toBe(2);
      expect(match.scannedCount).toBe(6);
    });

    it('selects portrait pages only', async () => {
      const mgr = await loadMixed();
      const match = mgr.previewSelectionHelper('portrait');
      expect(match.displayNumbers).toEqual([1, 3, 4]);
      expect(match.matchedCount).toBe(3);
    });

    it('treats an equal-sided page as neither portrait nor landscape', async () => {
      const mgr = await loadMixed();
      expect(PageSelectionUtil.orientationOf(mgr.pages[5])).toBe('square');
      expect(mgr.previewSelectionHelper('portrait').displayNumbers).not.toContain(6);
      expect(mgr.previewSelectionHelper('landscape').displayNumbers).not.toContain(6);
    });

    it('groups pages by their dimensions, largest group first', async () => {
      const mgr = await loadMixed();
      const groups = mgr.getPageSizeGroups();

      expect(groups.length).toBe(5);
      expect(groups[0].key).toBe('595x842');
      expect(groups[0].count).toBe(2);
      expect(groups[0].displayNumbers).toEqual([1, 4]);
      expect(groups[0].standardName).toBe('A4');
      expect(groups[0].orientation).toBe('portrait');

      const letterPortrait = groups.find(g => g.key === '612x792');
      expect(letterPortrait?.standardName).toBe('Letter');
      expect(letterPortrait?.count).toBe(1);

      const square = groups.find(g => g.key === '400x400');
      expect(square?.standardName).toBeUndefined();
      expect(square?.orientation).toBe('square');
    });

    it('selects a chosen page-size group', async () => {
      const mgr = await loadMixed();

      const a4 = mgr.previewSelectionHelper('size', { options: { sizeGroupKey: '595x842' } });
      expect(a4.displayNumbers).toEqual([1, 4]);
      expect(a4.sizeGroup?.standardName).toBe('A4');

      const letter = mgr.previewSelectionHelper('size', { options: { sizeGroupKey: '612x792' } });
      expect(letter.displayNumbers).toEqual([3]);
    });

    it('defaults the size helper to the dominant group', async () => {
      const mgr = await loadMixed();
      const match = mgr.previewSelectionHelper('size');
      expect(match.sizeGroup?.key).toBe('595x842');
      expect(match.matchedCount).toBe(2);
    });

    it('reports millimetres alongside points', async () => {
      const mgr = await loadMixed();
      const a4 = mgr.getPageSizeGroups().find(g => g.key === '595x842');
      // 595pt ≈ 209.9mm, 842pt ≈ 297.0mm
      expect(a4?.widthMm).toBeCloseTo(209.9, 1);
      expect(a4?.heightMm).toBeCloseTo(297, 1);
    });

    it('selects blank pages from a blank scan', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.addPage([595, 842]).drawText('Content', { x: 50, y: 700, size: 18, font });
      doc.addPage([595, 842]); // blank
      doc.addPage([595, 842]).drawText('More content', { x: 50, y: 700, size: 18, font });
      doc.addPage([595, 842]); // blank
      const bytes = await doc.save();
      const file = new File(
        [new Blob([bytes as any], { type: 'application/pdf' })],
        'blanks.pdf',
        { type: 'application/pdf' }
      );

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const blankReport = await new BlankPageService().analyzePages(
        mgr.pages,
        mgr.getSourceDocsMap()
      );

      const match = mgr.previewSelectionHelper('blank', { blankReport });
      expect(match.displayNumbers).toEqual([2, 4]);
      expect(match.matchedCount).toBe(2);
    });

    it('selects the redundant copies from a duplicate scan', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const label of ['Alpha', 'Beta', 'Alpha', 'Alpha']) {
        const page = doc.addPage([595, 842]);
        page.drawText(label, { x: 50, y: 700, size: 40, font, color: rgb(0, 0, 0) });
      }
      const bytes = await doc.save();
      const file = new File(
        [new Blob([bytes as any], { type: 'application/pdf' })],
        'dupes.pdf',
        { type: 'application/pdf' }
      );

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const duplicateReport = await new DuplicatePageService().analyzePages(
        mgr.pages,
        mgr.getSourceDocsMap()
      );

      // Keep-first: pages 3 and 4 are the redundant copies of page 1.
      const redundant = mgr.previewSelectionHelper('duplicates', { duplicateReport });
      expect(redundant.displayNumbers).toEqual([3, 4]);

      // 'all' includes the original, for side-by-side review.
      const all = mgr.previewSelectionHelper('duplicates', {
        duplicateReport,
        options: { duplicateScope: 'all' }
      });
      expect(all.displayNumbers).toEqual([1, 3, 4]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Rotation changes what a page measures
  // ════════════════════════════════════════════════════════════════════

  describe('rotation is part of the effective size', () => {
    it('a quarter-turned portrait page is matched as landscape', async () => {
      const mgr = await loadMixed();
      mgr.rotatePages([mgr.pages[0].id], 90);

      expect(mgr.previewSelectionHelper('landscape').displayNumbers).toEqual([1, 2, 5]);
      expect(mgr.previewSelectionHelper('portrait').displayNumbers).toEqual([3, 4]);
    });

    it('a half-turned page keeps its orientation', async () => {
      const mgr = await loadMixed();
      mgr.rotatePages([mgr.pages[0].id], 180);
      expect(mgr.previewSelectionHelper('portrait').displayNumbers).toEqual([1, 3, 4]);
    });

    it('a quarter turn moves the page into the swapped size group', async () => {
      const mgr = await loadMixed();
      mgr.rotatePages([mgr.pages[0].id], 90);

      const groups = mgr.getPageSizeGroups();
      const landscapeA4 = groups.find(g => g.key === '842x595');
      expect(landscapeA4?.displayNumbers).toEqual([1, 2]);
      expect(landscapeA4?.standardName).toBe('A4');
    });

    it('a rotation baked into the file is honoured too', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595, 842]);
      page.setRotation({ type: 'degrees', angle: 90 } as any);
      const bytes = await doc.save();
      const file = new File(
        [new Blob([bytes as any], { type: 'application/pdf' })],
        'baked.pdf',
        { type: 'application/pdf' }
      );

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      expect(mgr.pages[0].originalRotation).toBe(90);
      expect(PageSelectionUtil.orientationOf(mgr.pages[0])).toBe('landscape');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. A helper that cannot run says so instead of clearing the selection
  // ════════════════════════════════════════════════════════════════════

  describe('helpers that cannot run', () => {
    it('the blank helper needs a scan and leaves the selection alone', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(1, 3);

      const match = mgr.applySelectionHelper('blank');

      expect(match.unavailableReason).toBe('Run a blank page scan first.');
      expect(match.matchedCount).toBe(0);
      expect(mgr.selectedCount).toBe(3);
    });

    it('the duplicate helper needs a scan and leaves the selection alone', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(2, 4);

      const match = mgr.applySelectionHelper('duplicates');

      expect(match.unavailableReason).toBe('Run a duplicate page scan first.');
      expect(mgr.selectedCount).toBe(3);
    });

    it('a size group that no longer exists is reported, not silently empty', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(1, 2);

      const match = mgr.applySelectionHelper('size', {
        options: { sizeGroupKey: '1x1' }
      });

      expect(match.unavailableReason).toBeTruthy();
      expect(mgr.selectedCount).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Applying a helper, and not disturbing the shipped helpers
  // ════════════════════════════════════════════════════════════════════

  describe('applying a helper', () => {
    it('replaces the current selection', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(1, 4);
      expect(mgr.selectedCount).toBe(4);

      const match = mgr.applySelectionHelper('landscape');

      expect(match.matchedCount).toBe(2);
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 5]);
    });

    it('can add to the current selection instead', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(1, 1);

      mgr.addSelectionHelperToSelection('landscape');

      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([1, 2, 5]);
    });

    it('previewing does not change the selection', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(1, 2);

      mgr.previewSelectionHelper('landscape');
      mgr.previewSelectionHelper('size');

      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([1, 2]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. Acceptance: the existing selection helpers behave exactly as before
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance: shipped selection helpers are unchanged', () => {
    it('selectAll selects every page', async () => {
      const mgr = await loadMixed();
      mgr.selectAll();
      expect(mgr.selectedCount).toBe(6);
    });

    it('deselectAll clears the selection', async () => {
      const mgr = await loadMixed();
      mgr.selectAll();
      mgr.deselectAll();
      expect(mgr.selectedCount).toBe(0);
    });

    it('selectOddPages selects 1, 3, 5', async () => {
      const mgr = await loadMixed();
      mgr.selectOddPages();
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([1, 3, 5]);
    });

    it('selectEvenPages selects 2, 4, 6', async () => {
      const mgr = await loadMixed();
      mgr.selectEvenPages();
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 4, 6]);
    });

    it('selectRange selects inclusively and normalises a reversed range', async () => {
      const mgr = await loadMixed();
      mgr.selectRange(2, 4);
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 3, 4]);

      mgr.selectRange(4, 2);
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 3, 4]);
    });

    it('invertSelection flips every page', async () => {
      const mgr = await loadMixed();
      mgr.selectOddPages();
      mgr.invertSelection();
      expect(mgr.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 4, 6]);
    });

    it('togglePageSelection adds then removes', async () => {
      const mgr = await loadMixed();
      mgr.togglePageSelection(mgr.pages[0].id);
      expect(mgr.selectedCount).toBe(1);
      mgr.togglePageSelection(mgr.pages[0].id);
      expect(mgr.selectedCount).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 6. Pure-function edges
  // ════════════════════════════════════════════════════════════════════

  describe('pure predicates', () => {
    it('groups an empty page list into nothing', () => {
      expect(PageSelectionUtil.groupBySize([])).toEqual([]);
    });

    it('matches standard sizes within a few points of tolerance', () => {
      expect(PageSelectionUtil.standardNameFor(595, 842)).toBe('A4');
      expect(PageSelectionUtil.standardNameFor(596, 841)).toBe('A4');
      expect(PageSelectionUtil.standardNameFor(842, 595)).toBe('A4');
      expect(PageSelectionUtil.standardNameFor(612, 792)).toBe('Letter');
      expect(PageSelectionUtil.standardNameFor(500, 500)).toBeUndefined();
    });

    it('returns an empty match for blank and duplicates without a report', () => {
      expect(PageSelectionUtil.matchBlank([], null)).toEqual([]);
      expect(PageSelectionUtil.matchDuplicates([], null)).toEqual([]);
    });

    it('reports an unknown helper rather than throwing', () => {
      const match = PageSelectionUtil.match('nope' as any, []);
      expect(match.unavailableReason).toBe('Unknown selection helper.');
    });
  });
});
