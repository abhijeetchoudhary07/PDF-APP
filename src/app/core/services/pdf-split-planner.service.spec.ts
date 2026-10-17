import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFArray,
  PDFDict,
  PDFString,
  StandardFonts
} from 'pdf-lib';
import { PdfSplitPlannerService } from './pdf-split-planner.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import {
  DividerScanResult,
  TextPatternScanResult
} from '../models/pdf-split.types';

async function pdfFile(
  build: (doc: PDFDocument) => Promise<void>,
  name = 'fixture.pdf'
): Promise<File> {
  const doc = await PDFDocument.create();
  await build(doc);
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

/** A plain N-page document with one line of text per page. */
async function textPagesFile(lines: string[], name = 'pages.pdf'): Promise<File> {
  return pdfFile(async doc => {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const line of lines) {
      const page = doc.addPage([595, 842]);
      page.drawText(line, { x: 48, y: 780, size: 12, font });
    }
  }, name);
}

/**
 * A document with a two-level outline, written through pdf-lib's low-level
 * objects because pdf-lib has no outline API. Each entry is given an explicit
 * `/Dest` array pointing at a page, which is what `getOutline()` reads back.
 */
async function outlinedFile(
  pageCount: number,
  entries: { title: string; pageIndex: number; children?: { title: string; pageIndex: number }[] }[]
): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i + 1}`, { x: 48, y: 780, size: 12, font });
  }

  const context = doc.context;
  const pages = doc.getPages();

  const destFor = (pageIndex: number) => {
    const array = PDFArray.withContext(context);
    array.push(pages[pageIndex].ref);
    array.push(PDFName.of('Fit'));
    return array;
  };

  const outlinesRef = context.nextRef();
  const topRefs = entries.map(() => context.nextRef());

  let descendantCount = 0;

  entries.forEach((entry, index) => {
    const childRefs = (entry.children ?? []).map(() => context.nextRef());

    const dict = new Map<PDFName, any>();
    dict.set(PDFName.of('Title'), PDFString.of(entry.title));
    dict.set(PDFName.of('Parent'), outlinesRef);
    dict.set(PDFName.of('Dest'), destFor(entry.pageIndex));
    if (index > 0) dict.set(PDFName.of('Prev'), topRefs[index - 1]);
    if (index < entries.length - 1) dict.set(PDFName.of('Next'), topRefs[index + 1]);
    if (childRefs.length > 0) {
      dict.set(PDFName.of('First'), childRefs[0]);
      dict.set(PDFName.of('Last'), childRefs[childRefs.length - 1]);
      dict.set(PDFName.of('Count'), PDFNumber.of(childRefs.length));
    }
    context.assign(topRefs[index], PDFDict.fromMapWithContext(dict, context));
    descendantCount += 1 + childRefs.length;

    (entry.children ?? []).forEach((child, childIndex) => {
      const childDict = new Map<PDFName, any>();
      childDict.set(PDFName.of('Title'), PDFString.of(child.title));
      childDict.set(PDFName.of('Parent'), topRefs[index]);
      childDict.set(PDFName.of('Dest'), destFor(child.pageIndex));
      if (childIndex > 0) childDict.set(PDFName.of('Prev'), childRefs[childIndex - 1]);
      if (childIndex < childRefs.length - 1) {
        childDict.set(PDFName.of('Next'), childRefs[childIndex + 1]);
      }
      context.assign(childRefs[childIndex], PDFDict.fromMapWithContext(childDict, context));
    });
  });

  const outlinesDict = new Map<PDFName, any>();
  outlinesDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
  outlinesDict.set(PDFName.of('First'), topRefs[0]);
  outlinesDict.set(PDFName.of('Last'), topRefs[topRefs.length - 1]);
  outlinesDict.set(PDFName.of('Count'), PDFNumber.of(descendantCount));
  context.assign(outlinesRef, PDFDict.fromMapWithContext(outlinesDict, context));

  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);

  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], 'outlined.pdf', { type: 'application/pdf' });
}

describe('PdfSplitPlannerService', () => {
  let planner: PdfSplitPlannerService;

  beforeEach(() => {
    planner = new PdfSplitPlannerService();
  });

  // ══════════════════════════════════════════════════════════════════
  // B1 — split by output file size
  // ══════════════════════════════════════════════════════════════════

  describe('B1 — split by output file size', () => {
    /**
     * A measurer that charges a fixed cost per page plus a fixed container
     * overhead, which is how a real PDF behaves: monotonic in the page count,
     * with a floor no single-page file goes below.
     */
    function sizedMeasurer(perPage: number, overhead = 1000, overrides: Record<number, number> = {}) {
      const calls: number[][] = [];
      const fn = async (pageNumbers: number[]) => {
        calls.push([...pageNumbers]);
        let total = overhead;
        for (const n of pageNumbers) {
          total += overrides[n] ?? perPage;
        }
        return total;
      };
      return { fn, calls };
    }

    it('acceptance: every part of a split comes out under the ceiling', async () => {
      const pages = Array.from({ length: 20 }, (_, i) => i + 1);
      const { fn } = sizedMeasurer(5_000, 2_000);
      const ceiling = 32_000; // fits 6 pages (2000 + 6*5000 = 32000)

      const plan = await planner.planMaxSize(pages, {
        ceilingBytes: ceiling,
        measureBytes: fn
      });

      expect(plan.usable).toBe(true);
      expect(plan.parts.length).toBeGreaterThan(1);
      for (const part of plan.parts) {
        expect(part.sizeBytes).toBeLessThanOrEqual(ceiling);
        expect(part.overCeiling).toBeFalsy();
      }
      // Every page is accounted for exactly once, in order.
      expect(plan.parts.flatMap(p => p.pageNumbers)).toEqual(pages);
      expect(plan.totalPagesCovered).toBe(20);
    });

    it('packs each part as full as the ceiling allows', async () => {
      const pages = Array.from({ length: 12 }, (_, i) => i + 1);
      const { fn } = sizedMeasurer(5_000, 2_000);

      const plan = await planner.planMaxSize(pages, {
        ceilingBytes: 32_000,
        measureBytes: fn
      });

      expect(plan.parts.map(p => p.pageNumbers.length)).toEqual([6, 6]);
    });

    it('acceptance: an oversized single page is reported, not looped on', async () => {
      const pages = [1, 2, 3, 4];
      // Page 2 alone blows the ceiling no matter what.
      const { fn, calls } = sizedMeasurer(1_000, 500, { 2: 900_000 });

      const plan = await planner.planMaxSize(pages, {
        ceilingBytes: 10_000,
        measureBytes: fn
      });

      const oversized = plan.parts.filter(p => p.overCeiling);
      expect(oversized.length).toBe(1);
      expect(oversized[0].pageNumbers).toEqual([2]);

      const notice = plan.notices.find(n => n.kind === 'oversized-page');
      expect(notice?.pageNumbers).toEqual([2]);

      // The rest of the job still completed, and every page is present.
      expect(plan.usable).toBe(true);
      expect(plan.parts.flatMap(p => p.pageNumbers)).toEqual(pages);
      // Bounded work: no runaway re-measuring of the page that cannot fit.
      expect(calls.length).toBeLessThan(20);
    });

    it('keeps the measurement count logarithmic in the page count', async () => {
      const pages = Array.from({ length: 64 }, (_, i) => i + 1);
      const { fn, calls } = sizedMeasurer(100, 1_000);

      // Ceiling is large enough for all 64 pages, so this is one binary search.
      const plan = await planner.planMaxSize(pages, {
        ceilingBytes: 10_000_000,
        measureBytes: fn
      });

      expect(plan.parts.length).toBe(1);
      expect(plan.parts[0].pageNumbers.length).toBe(64);
      expect(calls.length).toBeLessThanOrEqual(10);
      expect(plan.notices.some(n => n.kind === 'single-part')).toBe(true);
    });

    it('reports parts completed through the progress callback', async () => {
      const pages = Array.from({ length: 9 }, (_, i) => i + 1);
      const { fn } = sizedMeasurer(5_000, 1_000);
      const seen: { completed: number; phase: string; percent: number }[] = [];

      await planner.planMaxSize(pages, {
        ceilingBytes: 16_000,
        measureBytes: fn,
        onProgress: p => seen.push({ completed: p.completed, phase: p.phase, percent: p.percent })
      });

      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every(s => s.phase === 'measuring')).toBe(true);
      // Parts completed only ever counts up, and the last report is complete.
      const completed = seen.map(s => s.completed);
      expect(completed).toEqual([...completed].sort((a, b) => a - b));
      expect(seen[seen.length - 1].percent).toBe(100);
    });

    it('stops when the measurement budget is spent and says so', async () => {
      const pages = Array.from({ length
: 40 }, (_, i) => i + 1);
      const { fn } = sizedMeasurer(1_000, 500);

      const plan = await planner.planMaxSize(pages, {
        ceilingBytes: 2_000,
        measureBytes: fn,
        maxMeasurements: 6
      });

      expect(plan.notices.some(n => n.kind === 'measure-budget-spent')).toBe(true);
      // No page is lost when the budget runs out.
      expect(plan.parts.flatMap(p => p.pageNumbers)).toEqual(pages);
    });

    it('honours an abort signal mid-measurement', async () => {
      const controller = new AbortController();
      const pages = Array.from({ length: 30 }, (_, i) => i + 1);
      let calls = 0;

      const measureBytes = async () => {
        calls++;
        if (calls === 3) controller.abort();
        return 1_000;
      };

      await expect(
        planner.planMaxSize(pages, {
          ceilingBytes: 50_000,
          measureBytes,
          signal: controller.signal
        })
      ).rejects.toThrow(/cancelled/i);
    });

    it('measures through the real export path on a loaded document', async () => {
      const file = await textPagesFile(['One', 'Two', 'Three', 'Four']);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const measure = manager.createChunkMeasurer();
      const onePage = await measure([1]);
      const twoPages = await measure([1, 2]);

      expect(onePage).toBeGreaterThan(0);
      expect(twoPages).toBeGreaterThan(onePage);

      const plan = await planner.planMaxSize([1, 2, 3, 4], {
        ceilingBytes: twoPages,
        measureBytes: measure
      });

      for (const part of plan.parts) {
        expect(part.sizeBytes).toBeLessThanOrEqual(twoPages);
      }
      expect(plan.parts.flatMap(p => p.pageNumbers)).toEqual([1, 2, 3, 4]);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B2 — split by document count
  // ══════════════════════════════════════════════════════════════════

  describe('B2 — split by document count', () => {
    it('acceptance: 10 pages into 3 files gives 4/3/3', () => {
      const plan = planner.planDocCount(10, 3);

      expect(plan.usable).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2, 3, 4],
        [5, 6, 7],
        [8, 9, 10]
      ]);
    });

    it('acceptance: N equal to the page count gives single-page files', () => {
      const plan = planner.planDocCount(5, 5);

      expect(plan.parts.length).toBe(5);
      expect(plan.parts.every(p => p.pageNumbers.length === 1)).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers[0])).toEqual([1, 2, 3, 4, 5]);
    });

    it('acceptance: N greater than the page count is rejected with a reason', () => {
      const plan = planner.planDocCount(4, 9);

      expect(plan.usable).toBe(false);
      expect(plan.parts).toEqual([]);
      const notice = plan.notices.find(n => n.kind === 'count-too-large');
      expect(notice).toBeDefined();
      expect(notice?.count).toBe(9);
      expect(notice?.detail).toBe('exceeds-pages');
    });

    it('rejects a non-integer or non-positive N', () => {
      expect(planner.planDocCount(10, 0).usable).toBe(false);
      expect(planner.planDocCount(10, -2).usable).toBe(false);
      expect(planner.planDocCount(10, 2.5).usable).toBe(false);
      expect(planner.planDocCount(10, undefined).usable).toBe(false);
    });

    it('N of 1 plans one part and flags it as not really a split', () => {
      const plan = planner.planDocCount(7, 1);

      expect(plan.parts.length).toBe(1);
      expect(plan.parts[0].pageNumbers.length).toBe(7);
      expect(plan.notices.some(n => n.kind === 'single-part')).toBe(true);
    });

    it('distributes the remainder to the earliest parts', () => {
      expect(
        PdfRangeParserUtil.calculateSplitChunks(11, { mode: 'doc-count', docCount: 4 }).map(
          c => c.length
        )
      ).toEqual([3, 3, 3, 2]);
      expect(
        PdfRangeParserUtil.calculateSplitChunks(7, { mode: 'doc-count', docCount: 2 }).map(
          c => c.length
        )
      ).toEqual([4, 3]);
    });

    it('leaves the four shipped split modes exactly as they were', () => {
      expect(
        PdfRangeParserUtil.calculateSplitChunks(10, { mode: 'every-n', everyN: 3 })
      ).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
      expect(
        PdfRangeParserUtil.calculateSplitChunks(5, { mode: 'individual' })
      ).toEqual([[1], [2], [3], [4], [5]]);
      expect(
        PdfRangeParserUtil.calculateSplitChunks(6, { mode: 'after-selected', afterPages: [2] })
      ).toEqual([[1, 2], [3, 4, 5, 6]]);
      expect(
        PdfRangeParserUtil.calculateSplitChunks(6, {
          mode: 'extract',
          selectedPageNumbers: [2, 4]
        })
      ).toEqual([[2, 4]]);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B3 — split by bookmarks / chapters
  // ══════════════════════════════════════════════════════════════════

  describe('B3 — split by bookmarks / chapters', () => {
    it('acceptance: boundaries match the resolved destinations on an outlined fixture', async () => {
      const file = await outlinedFile(9, [
        { title: 'Chapter One', pageIndex: 0 },
        { title: 'Chapter Two', pageIndex: 3 },
        { title: 'Chapter Three', pageIndex: 6 }
      ]);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const outline = await planner.readOutline(manager.sourceDocs);
      expect(outline.bookmarks.map(b => b.sourcePageIndex)).toEqual([0, 3, 6]);
      expect(outline.maxLevel).toBe(1);
      expect(outline.countsByLevel).toEqual([3]);

      const plan = planner.planChapters(manager.pages, outline, 1, 'outlined.pdf');

      expect(plan.usable).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
      expect(plan.parts.map(p => p.baseName)).toEqual([
        'Chapter_One',
        'Chapter_Two',
        'Chapter_Three'
      ]);
    });

    it('splits at the chosen outline level and no deeper', async () => {
      const file = await outlinedFile(8, [
        {
          title: 'Part A',
          pageIndex: 0,
          children: [{ title: 'A.2', pageIndex: 2 }]
        },
        {
          title: 'Part B',
          pageIndex: 4,
          children: [{ title: 'B.2', pageIndex: 6 }]
        }
      ]);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);
      const outline = await planner.readOutline(manager.sourceDocs);

      expect(outline.maxLevel).toBe(2);
      expect(outline.countsByLevel).toEqual([2, 2]);

      const atLevelOne = planner.planChapters(manager.pages, outline, 1, 'book.pdf');
      expect(atLevelOne.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2, 3, 4],
        [5, 6, 7, 8]
      ]);

      const atLevelTwo = planner.planChapters(manager.pages, outline, 2, 'book.pdf');
      expect(atLevelTwo.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8]
      ]);
      expect(atLevelTwo.parts.map(p => p.baseName)).toEqual(['Part_A', 'A.2', 'Part_B', 'B.2']);
    });

    it('acceptance: a document with no outline reports cleanly', async () => {
      const file = await textPagesFile(['a', 'b', 'c'], 'plain.pdf');
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const outline = await planner.readOutline(manager.sourceDocs);
      expect(outline.bookmarks).toEqual([]);
      expect(outline.maxLevel).toBe(0);
      expect(outline.documentsWithoutOutline).toEqual(['plain.pdf']);

      const plan = planner.planChapters(manager.pages, outline, 1, 'plain.pdf');
      expect(plan.usable).toBe(false);
      expect(plan.parts).toEqual([]);
      expect(plan.notices.map(n => n.kind)).toContain('no-outline');
    });

    it('a deeper level than the outline has still splits at the levels it does have', async () => {
      const file = await outlinedFile(4, [{ title: 'Only', pageIndex: 0 }]);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);
      const outline = await planner.readOutline(manager.sourceDocs);

      // Level 3 on a one-level outline is not an error: a level-1 bookmark is
      // a boundary at every level below it.
      const plan = planner.planChapters(manager.pages, outline, 3, 'x.pdf');
      expect(plan.usable).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2, 3, 4]]);

      // A level below 1 selects nothing, and says so rather than planning a
      // single part that looks like a split.
      const none = planner.planChapters(manager.pages, outline, 0, 'x.pdf');
      expect(none.usable).toBe(false);
      expect(none.notices.map(n => n.kind)).toContain('empty-level');
    });

    it('writes pages ahead of the first bookmark as their own leading part', async () => {
      const file = await outlinedFile(6, [
        { title: 'Starts Late', pageIndex: 2 },
        { title: 'Second', pageIndex: 4 }
      ]);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);
      const outline = await planner.readOutline(manager.sourceDocs);

      const plan = planner.planChapters(manager.pages, outline, 1, 'late.pdf');

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2], [3, 4], [5, 6]]);
      expect(plan.parts[0].baseName).toBe('late_part_1');
      const notice = plan.notices.find(n => n.kind === 'unmatched-leading-pages');
      expect(notice?.pageNumbers).toEqual([1, 2]);
    });

    it('makes two identically titled bookmarks produce distinct file names', async () => {
      const file = await outlinedFile(4, [
        { title: 'Appendix', pageIndex: 0 },
        { title: 'Appendix', pageIndex: 2 }
      ]);
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);
      const outline = await planner.readOutline(manager.sourceDocs);

      const plan = planner.planChapters(manager.pages, outline, 1, 'dup.pdf');
      expect(plan.parts.map(p => p.baseName)).toEqual(['Appendix', 'Appendix_2']);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B4 — split at blank pages or divider sheets
  // ══════════════════════════════════════════════════════════════════

  describe('B4 — split at blank pages or divider sheets', () => {
    function classify(
      total: number,
      dividers: { page: number; kind: 'blank' | 'code'; payload?: string }[]
    ): DividerScanResult {
      const byPage = new Map(dividers.map(d => [d.page, d]));
      return {
        classifications: Array.from({ length: total }, (_, i) => {
          const pageNumber = i + 1;
          const divider = byPage.get(pageNumber);
          return {
            pageNumber,
            isBlank: divider?.kind === 'blank',
            barcodePayload: divider?.payload,
            isDivider: !!divider,
            dividerKind: divider?.kind
          };
        }),
        blankCount: dividers.filter(d => d.kind === 'blank').length,
        codeCount: dividers.filter(d => d.payload).length
      };
    }

    const stubPages = (total: number) =>
      Array.from({ length: total }, (_, i) => ({ id: `p${i}`, displayNumber: i + 1 })) as any[];

    it('acceptance: a 9-page stack with dividers at 4 and 7 yields three documents without the divider pages', () => {
      const scan = classify(9, [
        { page: 4, kind: 'blank' },
        { page: 7, kind: 'blank' }
      ]);

      const plan = planner.planDividers(stubPages(9), scan, { nameFromPayload: false });

      expect(plan.usable).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2, 3],
        [5, 6],
        [8, 9]
      ]);
      expect(plan.droppedPageNumbers).toEqual([4, 7]);
      // The divider pages appear in no output at all.
      expect(plan.parts.flatMap(p => p.pageNumbers)).not.toContain(4);
      expect(plan.parts.flatMap(p => p.pageNumbers)).not.toContain(7);
      expect(plan.notices.find(n => n.kind === 'dropped-pages')?.pageNumbers).toEqual([4, 7]);
    });

    it('acceptance: naming from the divider payload works', () => {
      const scan = classify(9, [
        { page: 4, kind: 'code', payload: 'INV-2026-004' },
        { page: 7, kind: 'code', payload: 'Ledger / Q3:final' }
      ]);

      const plan = planner.planDividers(stubPages(9), scan, {
        nameFromPayload: true,
        fallbackBaseName: 'stack.pdf'
      });

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2, 3], [5, 6], [8, 9]]);
      // The first part has no divider ahead of it, so it falls back.
      expect(plan.parts[0].baseName).toBe('stack_part_1');
      expect(plan.parts[1].baseName).toBe('INV-2026-004');
      // Path separators and reserved characters never reach a file name.
      expect(plan.parts[2].baseName).toBe('Ledger_Q3_final');
    });

    it('ignores the payload for naming when the option is off', () => {
      const scan = classify(5, [{ page: 3, kind: 'code', payload: 'SHOULD-NOT-APPEAR' }]);

      const plan = planner.planDividers(stubPages(5), scan, {
        nameFromPayload: false,
        fallbackBaseName: 'scan.pdf'
      });

      expect(plan.parts.map(p => p.baseName)).toEqual(['scan_part_1', 'scan_part_2']);
    });

    it('reports when no divider was found instead of writing one copy of the document', () => {
      const plan = planner.planDividers(stubPages(6), classify(6, []), {
        nameFromPayload: false
      });

      expect(plan.usable).toBe(false);
      expect(plan.parts).toEqual([]);
      expect(plan.notices.map(n => n.kind)).toContain('no-dividers');
    });

    it('drops consecutive dividers without emitting an empty part', () => {
      const scan = classify(6, [
        { page: 3, kind: 'blank' },
        { page: 4, kind: 'blank' }
      ]);

      const plan = planner.planDividers(stubPages(6), scan, { nameFromPayload: false });

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2], [5, 6]]);
      expect(plan.parts.every(p => p.pageNumbers.length > 0)).toBe(true);
      expect(plan.droppedPageNumbers).toEqual([3, 4]);
    });

    it('drops a leading or trailing divider without leaving a blank part', () => {
      const scan = classify(5, [
        { page: 1, kind: 'blank' },
        { page: 5, kind: 'blank' }
      ]);

      const plan = planner.planDividers(stubPages(5), scan, { nameFromPayload: false });

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[2, 3, 4]]);
      expect(plan.droppedPageNumbers).toEqual([1, 5]);
    });

    it('detects genuinely blank pages in a real document', async () => {
      const file = await pdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const write = (text: string) => {
          const page = doc.addPage([595, 842]);
          page.drawText(text, { x: 48, y: 760, size: 14, font });
        };
        write('Invoice A page 1');
        write('Invoice A page 2');
        doc.addPage([595, 842]); // divider: genuinely empty
        write('Invoice B page 1');
      }, 'stack.pdf');

      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const scan = await planner.scanDividers({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        detectBlank: true,
        detectBarcode: false
      });

      expect(scan.classifications.length).toBe(4);
      expect(scan.classifications[2].isDivider).toBe(true);
      expect(scan.classifications.filter(c => c.isDivider).map(c => c.pageNumber)).toEqual([3]);

      const plan = planner.planDividers(manager.pages, scan, {
        nameFromPayload: false,
        fallbackBaseName: 'stack.pdf'
      });
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2], [4]]);
    });

    it('reports scan progress per page and honours cancellation', async () => {
      const file = await textPagesFile(['a', 'b', 'c', 'd'], 'scan.pdf');
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const seen: number[] = [];
      await planner.scanDividers({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        detectBlank: true,
        detectBarcode: false,
        onProgress: p => seen.push(p.completed)
      });
      expect(seen).toEqual([1, 2, 3, 4]);

      const controller = new AbortController();
      controller.abort();
      await expect(
        planner.scanDividers({
          pages: manager.pages,
          sourceDocsMap: manager.getSourceDocsMap(),
          detectBlank: true,
          detectBarcode: false,
          signal: controller.signal
        })
      ).rejects.toThrow(/cancelled/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // B5 — split by text pattern
  // ══════════════════════════════════════════════════════════════════

  describe('B5 — split by text pattern', () => {
    const stubPages = (total: number) =>
      Array.from({ length: total }, (_, i) => ({ id: `p${i}`, displayNumber: i + 1 })) as any[];

    function scanOf(values: (string | undefined)[]): TextPatternScanResult {
      return {
        values: values.map((value, i) => ({
          pageNumber: i + 1,
          value,
          noTextLayer: false
        })),
        matchedPageCount: values.filter(v => v !== undefined).length,
        pagesWithoutText: []
      };
    }

    it('acceptance: an invoice number changing on pages 1/4/7 yields three documents named from the captures', () => {
      const scan = scanOf([
        'INV-001',
        undefined,
        undefined,
        'INV-002',
        undefined,
        undefined,
        'INV-003',
        undefined,
        undefined
      ]);

      const plan = planner.planTextPattern(stubPages(9), scan, 'invoices.pdf');

      expect(plan.usable).toBe(true);
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
      expect(plan.parts.map(p => p.baseName)).toEqual(['INV-001', 'INV-002', 'INV-003']);
    });

    it('acceptance: no match anywhere reports instead of producing one giant file', () => {
      const plan = planner.planTextPattern(stubPages(12), scanOf(Array(12).fill(undefined)), 'x.pdf');

      expect(plan.usable).toBe(false);
      expect(plan.parts).toEqual([]);
      expect(plan.notices.map(n => n.kind)).toContain('no-pattern-match');
    });

    it('keeps a repeated value in one part and only cuts when it changes', () => {
      const scan = scanOf(['A', 'A', 'A', 'B', 'B', 'A']);
      const plan = planner.planTextPattern(stubPages(6), scan, 'doc.pdf');

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2, 3], [4, 5], [6]]);
      // The value returning does start a new part — it is a new document.
      expect(plan.parts.map(p => p.baseName)).toEqual(['A', 'B', 'A_2']);
    });

    it('writes pages ahead of the first match as their own leading part', () => {
      const scan = scanOf([undefined, undefined, 'FIRST', undefined]);
      const plan = planner.planTextPattern(stubPages(4), scan, 'cover.pdf');

      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2], [3, 4]]);
      expect(plan.parts[0].baseName).toBe('cover_part_1');
      expect(plan.notices.find(n => n.kind === 'unmatched-leading-pages')?.pageNumbers).toEqual([1, 2]);
    });

    it('reports an invalid pattern rather than throwing', async () => {
      const scan = await planner.scanTextPattern({
        pages: [],
        sourceDocsMap: new Map(),
        pattern: '([unclosed'
      });

      expect(scan.patternError).toBeTruthy();
      const plan = planner.planTextPattern(stubPages(3), scan, 'x.pdf');
      expect(plan.usable).toBe(false);
      expect(plan.notices.map(n => n.kind)).toContain('invalid-pattern');
    });

    it('reads a capture group off each page of a real document', async () => {
      const file = await textPagesFile(
        [
          'Invoice INV-001 Customer A',
          'INV-001 continued',
          'Invoice INV-002 Customer B',
          'Invoice INV-003 Customer C'
        ],
        'invoices.pdf'
      );
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const scan = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: 'INV-(\\d+)'
      });

      expect(scan.values.map(v => v.value)).toEqual(['001', '001', '002', '003']);
      expect(scan.matchedPageCount).toBe(4);

      const plan = planner.planTextPattern(manager.pages, scan, 'invoices.pdf');
      expect(plan.parts.map(p => p.pageNumbers)).toEqual([[1, 2], [3], [4]]);
      expect(plan.pageRows.length).toBe(4);
      expect(plan.pageRows[0].boundary).toBe('value-change');
      expect(plan.pageRows[1].boundary).toBeUndefined();
    });

    it('restricts matching to the top band of the page when asked', async () => {
      const file = await pdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595, 842]);
        page.drawText('HEADER-TOP', { x: 48, y: 800, size: 12, font });
        page.drawText('FOOTER-BOTTOM', { x: 48, y: 40, size: 12, font });
      }, 'banded.pdf');

      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const whole = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: '(FOOTER-\\w+)'
      });
      expect(whole.values[0].value).toBe('FOOTER-BOTTOM');

      const topOnly = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: '(FOOTER-\\w+)',
        regionTopFraction: 0.2
      });
      expect(topOnly.values[0].value).toBeUndefined();

      const headerInBand = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: '(HEADER-\\w+)',
        regionTopFraction: 0.2
      });
      expect(headerInBand.values[0].value).toBe('HEADER-TOP');
    });

    it('does not carry regex state between pages', async () => {
      const file = await textPagesFile(['ID-7', 'ID-7', 'ID-8'], 'ids.pdf');
      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const scan = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: 'ID-(\\d)',
        flags: 'g' // stateful flag must be dropped, or page 2 would miss
      });

      expect(scan.values.map(v => v.value)).toEqual(['7', '7', '8']);
    });

    it('separates a page with no text layer from a page the pattern missed', async () => {
      const file = await pdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p1 = doc.addPage([595, 842]);
        p1.drawText('REF-100', { x: 48, y: 780, size: 12, font });
        doc.addPage([595, 842]); // no text at all
      }, 'mixed.pdf');

      const manager = new PdfPageManagerService();
      await manager.loadDocument(file);

      const scan = await planner.scanTextPattern({
        pages: manager.pages,
        sourceDocsMap: manager.getSourceDocsMap(),
        pattern: '(REF-\\d+)'
      });

      expect(scan.pagesWithoutText).toEqual([2]);
      expect(scan.values[1].noTextLayer).toBe(true);

      const plan = planner.planTextPattern(manager.pages, scan, 'mixed.pdf');
      expect(plan.notices.find(n => n.kind === 'pages-without-text')?.pageNumbers).toEqual([2]);
      // The text-free page still goes somewhere; it is not dropped.
      expect(plan.parts.flatMap(p => p.pageNumbers)).toEqual([1, 2]);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // File naming
  // ══════════════════════════════════════════════════════════════════

  describe('file-name sanitizing', () => {
    it('strips path separators and reserved characters', () => {
      expect(planner.sanitizeBaseName('../../etc/passwd')).toBe('.._.._etc_passwd');
      expect(planner.sanitizeBaseName('a:b*c?d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
      expect(planner.sanitizeBaseName('C:\\Windows\\System32')).toBe('C_Windows_System32');
    });

    it('drops control characters and trailing dots and spaces', () => {
      expect(planner.sanitizeBaseName('name\u0000with\u001fcontrol')).toBe('name_with_control');
      expect(planner.sanitizeBaseName('trailing dots... ')).toBe('trailing_dots');
    });

    it('caps the length and returns empty for a name with nothing usable', () => {
      const long = 'x'.repeat(200);
      expect(planner.sanitizeBaseName(long).length).toBe(planner.MAX_BASE_NAME_LENGTH);
      expect(planner.sanitizeBaseName('   ')).toBe('');
      expect(planner.sanitizeBaseName('///')).toBe('');
      expect(planner.sanitizeBaseName('')).toBe('');
    });

    it('does not leave a doubled extension', () => {
      expect(planner.sanitizeBaseName('report.pdf')).toBe('report');
    });
  });
});
