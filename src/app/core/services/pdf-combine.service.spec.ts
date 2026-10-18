import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfCombineService } from './pdf-combine.service';
import {
  CombineSource,
  defaultInsertOptions,
  defaultMergeOptions,
  defaultMergeStructureOptions
} from '../models/pdf-combine.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;
const A5 = LAYOUT_PAPER_SIZES_PT.A5;

async function buildPdf(
  labels: string[],
  size: { width: number; height: number } = A4
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = doc.addPage([size.width, size.height]);
    page.drawText(label, {
      x: 40,
      y: size.height - 60,
      size: 18,
      font,
      color: rgb(0, 0, 0)
    });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function source(
  id: string,
  name: string,
  labels: string[],
  extra?: { lastModified?: number; sizeBytes?: number; size?: { width: number; height: number } }
): Promise<CombineSource> {
  const buffer = await buildPdf(labels, extra?.size);
  return {
    id,
    name,
    pageCount: labels.length,
    sizeBytes: extra?.sizeBytes ?? buffer.byteLength,
    lastModified: extra?.lastModified ?? 0,
    buffer
  };
}

/** The output order as `docIndex:pageIndex` pairs, which reads at a glance. */
const asOrder = (refs: Array<{ sourceIndex: number; pageIndex: number }>) =>
  refs.map(ref => `${ref.sourceIndex}:${ref.pageIndex}`);

describe('PdfCombineService (Part C — combining)', () => {
  let service: PdfCombineService;

  beforeEach(() => {
    service = new PdfCombineService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('C1 — alternate & mix (interleave)', () => {
    it('takes one page from each document in turn', () => {
      const plan = service.planInterleave([3, 3]);
      expect(asOrder(plan.order)).toEqual(['0:0', '1:0', '0:1', '1:1', '0:2', '1:2']);
      expect(plan.uneven).toBe(false);
      expect(plan.totalPageCount).toBe(6);
    });

    it('reads a reversed document from the back', () => {
      const plan = service.planInterleave([3, 3], [{ reversed: false }, { reversed: true }]);
      // A1, B3, A2, B2, A3, B1 — the front/back phone-scanning case.
      expect(asOrder(plan.order)).toEqual(['0:0', '1:2', '0:1', '1:1', '0:2', '1:0']);
    });

    it('appends the remainder when the documents are of unequal length', () => {
      const plan = service.planInterleave([4, 2]);
      expect(asOrder(plan.order)).toEqual(['0:0', '1:0', '0:1', '1:1', '0:2', '0:3']);
      expect(plan.uneven).toBe(true);
      expect(plan.perDocCount).toEqual([4, 2]);
    });

    it('handles the shorter document being first', () => {
      const plan = service.planInterleave([2, 4]);
      expect(asOrder(plan.order)).toEqual(['0:0', '1:0', '0:1', '1:1', '1:2', '1:3']);
    });

    it('mixes three documents', () => {
      const plan = service.planInterleave([2, 2, 2]);
      expect(asOrder(plan.order)).toEqual(['0:0', '1:0', '2:0', '0:1', '1:1', '2:1']);
    });

    it('is a copy for a single document and empty for none', () => {
      expect(asOrder(service.planInterleave([3]).order)).toEqual(['0:0', '0:1', '0:2']);
      expect(service.planInterleave([]).totalPageCount).toBe(0);
      expect(service.planInterleave([0, 0]).totalPageCount).toBe(0);
    });

    it('ignores a document with no pages without breaking the alternation', () => {
      const plan = service.planInterleave([2, 0, 2]);
      expect(asOrder(plan.order)).toEqual(['0:0', '2:0', '0:1', '2:1']);
      expect(plan.uneven).toBe(false);
    });

    it('writes the mixed document', async () => {
      const a = await source('a', 'front.pdf', ['A1', 'A2', 'A3']);
      const b = await source('b', 'back.pdf', ['B1', 'B2', 'B3']);

      const output = await service.exportInterleaved(
        [a, b],
        [{ reversed: false }, { reversed: true }],
        'mixed.pdf'
      );

      expect(output.pageCount).toBe(6);
      expect(output.sourcePageCount).toBe(6);
      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPageCount()).toBe(6);
    });

    it('reports an uneven mix rather than leaving it to be noticed', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3', 'A4']);
      const b = await source('b', 'b.pdf', ['B1']);

      const output = await service.exportInterleaved([a, b], [], 'mixed.pdf');
      expect(output.notices.some(n => n.kind === 'uneven-interleave')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('C2 — insert pages', () => {
    it('inserts at the start', () => {
      const plan = service.planInsert(4, 2, 1, 'before');
      expect(plan.insertAt).toBe(0);
      expect(asOrder(plan.order)).toEqual(['1:0', '1:1', '0:0', '0:1', '0:2', '0:3']);
      expect(plan.totalPageCount).toBe(6);
    });

    it('inserts in the middle', () => {
      const plan = service.planInsert(4, 1, 2, 'after');
      expect(plan.insertAt).toBe(2);
      expect(asOrder(plan.order)).toEqual(['0:0', '0:1', '1:0', '0:2', '0:3']);
    });

    it('inserts at the end', () => {
      const plan = service.planInsert(4, 2, 4, 'after');
      expect(plan.insertAt).toBe(4);
      expect(asOrder(plan.order)).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1']);
    });

    it('clamps an anchor outside the document rather than failing', () => {
      expect(service.planInsert(4, 1, 99, 'after').insertAt).toBe(4);
      expect(service.planInsert(4, 1, -5, 'before').insertAt).toBe(0);
      expect(service.planInsert(0, 2, 1, 'after').insertAt).toBe(0);
    });

    it('sizes a blank page from its neighbour by default', () => {
      const neighbour = { width: 300, height: 500 };
      expect(service.blankPageSize('neighbour', neighbour)).toEqual(neighbour);
      expect(service.blankPageSize('A5', neighbour)).toEqual(A5);
      expect(service.blankPageSize('A5', neighbour, true)).toEqual({
        width: A5.height,
        height: A5.width
      });
      // No neighbour to copy — A4 rather than a zero-sized page.
      expect(service.blankPageSize('neighbour', undefined)).toEqual(A4);
    });

    it('inserts blanks that match the neighbouring page dimensions', async () => {
      const base = await buildPdf(['P1', 'P2'], A5);
      const output = await service.exportWithInsertion(
        base,
        { ...defaultInsertOptions(), kind: 'blank', anchorPage: 1, side: 'after', blankCount: 2 },
        'out.pdf'
      );

      expect(output.pageCount).toBe(4);
      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPage(1).getWidth()).toBeCloseTo(A5.width, 2);
      expect(doc.getPage(1).getHeight()).toBeCloseTo(A5.height, 2);
      expect(output.notices.find(n => n.kind === 'blanks-inserted')?.count).toBe(2);
    });

    it('inserts another PDF at the chosen position', async () => {
      const base = await buildPdf(['P1', 'P2', 'P3']);
      const insert = await buildPdf(['X1', 'X2']);

      const output = await service.exportWithInsertion(
        base,
        { ...defaultInsertOptions(), kind: 'pdf', anchorPage: 2, side: 'before' },
        'out.pdf',
        { pdfBuffer: insert }
      );

      expect(output.pageCount).toBe(5);
      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPageCount()).toBe(5);
    });

    it('caps a runaway blank count', async () => {
      const base = await buildPdf(['P1']);
      const output = await service.exportWithInsertion(
        base,
        { ...defaultInsertOptions(), kind: 'blank', blankCount: 100000 },
        'out.pdf'
      );
      expect(output.pageCount).toBe(1 + service.MAX_BLANK_INSERT);
    });

    it('refuses a PDF insertion with nothing to insert', async () => {
      const base = await buildPdf(['P1']);
      await expect(
        service.exportWithInsertion(base, { ...defaultInsertOptions(), kind: 'pdf' }, 'out.pdf')
      ).rejects.toThrow(/No PDF/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('C3 — merge: page subsets and sorting', () => {
    it('merging with no subsets and no sort gives every page in list order', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3']);
      const b = await source('b', 'b.pdf', ['B1', 'B2']);

      const plan = service.planMerge([a, b], defaultMergeOptions());

      // Exactly what the shipped merge produces: file order, every page.
      expect(asOrder(plan.order)).toEqual(['0:0', '0:1', '0:2', '1:0', '1:1']);
      expect(plan.totalPageCount).toBe(5);
      expect(plan.notices).toEqual([]);
    });

    it('respects per-file subsets and orders them correctly', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3', 'A4']);
      const b = await source('b', 'b.pdf', ['B1', 'B2']);

      const plan = service.planMerge([a, b], {
        ...defaultMergeOptions(),
        rows: [
          { sourceId: 'a', subset: '1-3' },
          { sourceId: 'b', subset: '' }
        ]
      });

      expect(asOrder(plan.order)).toEqual(['0:0', '0:1', '0:2', '1:0', '1:1']);
      expect(plan.entries[0].pageNumbers).toEqual([1, 2, 3]);
      expect(plan.entries[1].pageNumbers).toEqual([1, 2]);
    });

    it('reads a subset expression in the order it was written', () => {
      expect(service.parseSubset('1-3', 5).pages).toEqual([1, 2, 3]);
      expect(service.parseSubset('5, 1-2', 5).pages).toEqual([5, 1, 2]);
      // A descending range is the shortest way to say "backwards".
      expect(service.parseSubset('3-1', 5).pages).toEqual([3, 2, 1]);
      // A repeat keeps its first position rather than doubling the page.
      expect(service.parseSubset('2, 1-3', 5).pages).toEqual([2, 1, 3]);
      expect(service.parseSubset('  ', 5)).toEqual({ valid: true, pages: [] });
    });

    it('rejects a subset that names a page the document does not have', () => {
      expect(service.parseSubset('9', 5).valid).toBe(false);
      expect(service.parseSubset('1-9', 5).valid).toBe(false);
      expect(service.parseSubset('abc', 5).valid).toBe(false);
      expect(service.parseSubset('0', 5).valid).toBe(false);
      expect(service.parseSubset('1--3', 5).valid).toBe(false);
    });

    it('takes a non-contiguous subset in the order written', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3', 'A4', 'A5']);
      const plan = service.planMerge([a], {
        ...defaultMergeOptions(),
        rows: [{ sourceId: 'a', subset: '5, 1-2' }]
      });
      expect(plan.entries[0].pageNumbers).toEqual([5, 1, 2]);
      expect(asOrder(plan.order)).toEqual(['0:4', '0:0', '0:1']);
    });

    it('takes the whole file and says so when a subset cannot be read', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const plan = service.planMerge([a], {
        ...defaultMergeOptions(),
        rows: [{ sourceId: 'a', subset: 'nonsense' }]
      });

      expect(plan.entries[0].pageNumbers).toEqual([1, 2]);
      expect(plan.entries[0].subsetInvalid).toBe(true);
      expect(plan.notices.some(n => n.kind === 'invalid-subset')).toBe(true);
    });

    it('reports the first output page of every source as the selection changes', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3']);
      const b = await source('b', 'b.pdf', ['B1', 'B2']);
      const c = await source('c', 'c.pdf', ['C1']);

      const plan = service.planMerge([a, b, c], {
        ...defaultMergeOptions(),
        rows: [{ sourceId: 'a', subset: '2' }]
      });

      expect(plan.entries.map(e => e.firstOutputPage)).toEqual([1, 2, 4]);
      expect(plan.totalPageCount).toBe(4);
    });

    it('sorts by name numerically, by date and by size, in both directions', async () => {
      const files = [
        await source('s10', 'scan_10.pdf', ['x'], { lastModified: 300, sizeBytes: 100 }),
        await source('s2', 'scan_2.pdf', ['x'], { lastModified: 100, sizeBytes: 300 }),
        await source('s1', 'scan_1.pdf', ['x'], { lastModified: 200, sizeBytes: 200 })
      ];

      expect(service.sortSources(files, 'name', 'asc').map(f => f.id)).toEqual([
        's1',
        's2',
        's10'
      ]);
      expect(service.sortSources(files, 'name', 'desc').map(f => f.id)).toEqual([
        's10',
        's2',
        's1'
      ]);
      expect(service.sortSources(files, 'date', 'asc').map(f => f.id)).toEqual([
        's2',
        's1',
        's10'
      ]);
      expect(service.sortSources(files, 'size', 'desc').map(f => f.id)).toEqual([
        's2',
        's1',
        's10'
      ]);
    });

    it('leaves the list exactly as arranged when the sort is none', async () => {
      const files = [
        await source('z', 'z.pdf', ['x']),
        await source('a', 'a.pdf', ['x'])
      ];
      expect(service.sortSources(files, 'none', 'asc').map(f => f.id)).toEqual(['z', 'a']);
    });

    it('is a stable sort — equal rows keep their relative order', async () => {
      const files = [
        await source('first', 'same.pdf', ['x'], { sizeBytes: 500 }),
        await source('second', 'same.pdf', ['x'], { sizeBytes: 500 }),
        await source('third', 'same.pdf', ['x'], { sizeBytes: 500 })
      ];
      expect(service.sortSources(files, 'size', 'asc').map(f => f.id)).toEqual([
        'first',
        'second',
        'third'
      ]);
      expect(service.sortSources(files, 'name', 'asc').map(f => f.id)).toEqual([
        'first',
        'second',
        'third'
      ]);
    });

    it('applies the sort to the merged order', async () => {
      const a = await source('a', 'b_second.pdf', ['A1']);
      const b = await source('b', 'a_first.pdf', ['B1']);

      const plan = service.planMerge([a, b], {
        ...defaultMergeOptions(),
        sortBy: 'name',
        sortDirection: 'asc'
      });

      // b sorts first by name, and keeps its own source index in the refs.
      expect(asOrder(plan.order)).toEqual(['1:0', '0:0']);
      expect(plan.entries[0].sourceName).toBe('a_first.pdf');
    });

    it('writes the merged document', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3']);
      const b = await source('b', 'b.pdf', ['B1', 'B2']);

      const output = await service.exportMerged(
        [a, b],
        { ...defaultMergeOptions(), rows: [{ sourceId: 'a', subset: '1,3' }] },
        'merged.pdf'
      );

      expect(output.pageCount).toBe(4);
      expect(output.sourcePageCount).toBe(5);
      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPageCount()).toBe(4);
    });

    it('refuses a merge with nothing selected', async () => {
      await expect(
        service.exportMerged([], defaultMergeOptions(), 'merged.pdf')
      ).rejects.toThrow(/No pages/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('C4 — merge: bookmarks, TOC, cover & separators', () => {
    it('adds nothing when all four options are off', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const plan = service.planMerge([a], defaultMergeOptions());
      const structure = service.planStructure(plan, defaultMergeStructureOptions());

      expect(structure.totalPageCount).toBe(2);
      expect(structure.coverPage).toBeUndefined();
      expect(structure.tocPage).toBeUndefined();
      expect(structure.order.every(ref => ref.generated === undefined)).toBe(true);
    });

    it('counts its own generated pages when numbering the entries', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const b = await source('b', 'b.pdf', ['B1']);
      const plan = service.planMerge([a, b], defaultMergeOptions());

      const structure = service.planStructure(plan, {
        bookmarks: true,
        tableOfContents: true,
        coverPage: true,
        coverTitle: 'Bundle',
        separators: true
      });

      // cover(1) toc(2) sep(3) A1(4) A2(5) sep(6) B1(7)
      expect(structure.coverPage).toBe(1);
      expect(structure.tocPage).toBe(2);
      expect(structure.entries.map(e => e.outputPage)).toEqual([4, 7]);
      expect(structure.totalPageCount).toBe(7);
    });

    it('numbers entries correctly with only a contents page', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const b = await source('b', 'b.pdf', ['B1']);
      const plan = service.planMerge([a, b], defaultMergeOptions());

      const structure = service.planStructure(plan, {
        ...defaultMergeStructureOptions(),
        tableOfContents: true
      });

      expect(structure.entries.map(e => e.outputPage)).toEqual([2, 4]);
      expect(structure.entries.map(e => e.pageCount)).toEqual([2, 1]);
    });

    it('writes an outline that reopens with the right titles and page targets', async () => {
      const a = await source('a', 'application.pdf', ['A1', 'A2', 'A3']);
      const b = await source('b', 'receipt.pdf', ['B1']);

      const output = await service.exportMerged(
        [a, b],
        defaultMergeOptions(),
        'bundle.pdf',
        { ...defaultMergeStructureOptions(), bookmarks: true }
      );

      expect(output.notices.find(n => n.kind === 'outline-written')?.count).toBe(2);

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;

      try {
        const outline = await pdf.getOutline();
        expect(outline).toBeTruthy();
        expect(outline!.map(item => item.title)).toEqual(['application.pdf', 'receipt.pdf']);

        // The targets are the merged positions, not the source positions.
        const first = await pdf.getPageIndex(outline![0].dest![0] as never);
        const second = await pdf.getPageIndex(outline![1].dest![0] as never);
        expect(first).toBe(0);
        expect(second).toBe(3);
      } finally {
        await task.destroy();
      }
    });

    it('keeps a non-Latin file name intact in the bookmark', async () => {
      const a = await source('a', 'दस्तावेज़.pdf', ['A1']);
      const output = await service.exportMerged(
        [a],
        defaultMergeOptions(),
        'bundle.pdf',
        { ...defaultMergeStructureOptions(), bookmarks: true }
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        const outline = await pdf.getOutline();
        expect(outline![0].title).toBe('दस्तावेज़.pdf');
      } finally {
        await task.destroy();
      }
    });

    it('drops characters the built-in font cannot draw rather than failing', () => {
      const safe = service.toDrawableText('दस्तावेज़ form.pdf');
      expect(safe.dropped).toBeGreaterThan(0);
      expect(safe.text).toContain('form.pdf');

      const latin = service.toDrawableText('Application Förm 2026.pdf');
      expect(latin.dropped).toBe(0);
      expect(latin.text).toBe('Application Förm 2026.pdf');
    });

    it('reports the dropped characters on the output', async () => {
      const a = await source('a', 'दस्तावेज़.pdf', ['A1']);
      const output = await service.exportMerged(
        [a],
        defaultMergeOptions(),
        'bundle.pdf',
        { ...defaultMergeStructureOptions(), tableOfContents: true }
      );

      expect(output.notices.some(n => n.kind === 'title-characters-dropped')).toBe(true);
    });

    it('adds the cover, contents and separators it was asked for', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const b = await source('b', 'b.pdf', ['B1']);

      const output = await service.exportMerged(
        [a, b],
        defaultMergeOptions(),
        'bundle.pdf',
        {
          bookmarks: true,
          tableOfContents: true,
          coverPage: true,
          coverTitle: 'Admission bundle',
          separators: true
        }
      );

      expect(output.pageCount).toBe(7);
      expect(output.notices.find(n => n.kind === 'cover-added')?.count).toBe(1);
      expect(output.notices.find(n => n.kind === 'toc-added')?.count).toBe(1);
      expect(output.notices.find(n => n.kind === 'separators-added')?.count).toBe(2);

      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPageCount()).toBe(7);
      expect(doc.catalog.get(PDFName.of('Outlines'))).toBeDefined();
    });

    it('gives generated pages the size of the first merged page', async () => {
      const a = await source('a', 'a.pdf', ['A1'], { size: A5 });
      const output = await service.exportMerged(
        [a],
        defaultMergeOptions(),
        'bundle.pdf',
        { ...defaultMergeStructureOptions(), coverPage: true }
      );

      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A5.width, 2);
    });

    it('stops a merge when its signal aborts', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2']);
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportMerged(
          [a],
          defaultMergeOptions(),
          'bundle.pdf',
          defaultMergeStructureOptions(),
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });

    it('reports progress to completion', async () => {
      const a = await source('a', 'a.pdf', ['A1', 'A2', 'A3', 'A4']);
      const seen: number[] = [];
      await service.exportMerged(
        [a],
        defaultMergeOptions(),
        'bundle.pdf',
        defaultMergeStructureOptions(),
        p => seen.push(p.percent)
      );
      expect(seen[seen.length - 1]).toBe(100);
    });
  });
});
