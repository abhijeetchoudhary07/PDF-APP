import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfOutlineService } from './pdf-outline.service';
import { HeadingCandidate, OutlineNode } from '../models/pdf-navigation.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

/** A plain N-page document with a line of text on each page. */
async function textDoc(count: number, lines?: string[][]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < count; i++) {
    const page = doc.addPage([A4.width, A4.height]);
    const content = lines?.[i] ?? [`Page ${i + 1}`];
    content.forEach((line, index) => {
      page.drawText(line, {
        x: 60,
        y: A4.height - 80 - index * 30,
        size: 12,
        font,
        color: rgb(0, 0, 0)
      });
    });
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * A document whose text is set at deliberately different sizes, so the
 * heading heuristic has something real to rank.
 */
async function headingDoc(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: Array<Array<{ text: string; size: number }>> = [
    [
      { text: 'Chapter One', size: 24 },
      { text: 'Section A', size: 16 },
      { text: 'Body text that fills the page and is set at the usual size.', size: 11 },
      { text: 'More body text at exactly the same size as the line above.', size: 11 }
    ],
    [
      { text: 'Section B', size: 16 },
      { text: 'Body text again, still at the usual reading size for this file.', size: 11 }
    ],
    [
      { text: 'Chapter Two', size: 24 },
      { text: 'Body text closing the document out at the usual size.', size: 11 }
    ]
  ];

  for (const lines of pages) {
    const page = doc.addPage([A4.width, A4.height]);
    let y = A4.height - 90;
    for (const line of lines) {
      page.drawText(line.text, {
        x: 60,
        y,
        size: line.size,
        font: line.size >= 16 ? bold : font,
        color: rgb(0, 0, 0)
      });
      y -= line.size * 2.2;
    }
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const node = (
  title: string,
  pageIndex: number,
  children: OutlineNode[] = [],
  collapsed?: boolean
): OutlineNode => ({
  id: `${title}-${pageIndex}`,
  title,
  pageIndex,
  children,
  collapsed
});

/** Reads the written outline back out of the object graph. */
function readGraph(doc: PDFDocument) {
  const outlinesRef = doc.catalog.get(PDFName.of('Outlines'));
  if (!(outlinesRef instanceof PDFRef)) return undefined;
  const root = doc.context.lookupMaybe(outlinesRef, PDFDict);
  if (!root) return undefined;

  const service = new PdfOutlineService();

  const walk = (ref: unknown, parentRef: PDFRef, depth = 0): unknown[] => {
    const out: unknown[] = [];
    let current = ref;

    while (current instanceof PDFRef && depth < 20) {
      const item = doc.context.lookupMaybe(current, PDFDict);
      if (!item) break;

      const firstChild = item.get(PDFName.of('First'));
      out.push({
        title: service.titleOf(item),
        count: item.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber(),
        parentMatches: item.get(PDFName.of('Parent'))?.toString() === parentRef.toString(),
        hasPrev: item.get(PDFName.of('Prev')) !== undefined,
        hasNext: item.get(PDFName.of('Next')) !== undefined,
        destPage: service.destinationPageRef(item)?.toString(),
        children: firstChild ? walk(firstChild, current, depth + 1) : []
      });

      current = item.get(PDFName.of('Next'));
    }

    return out;
  };

  return {
    type: root.lookupMaybe(PDFName.of('Type'), PDFName)?.asString(),
    count: root.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber(),
    firstIsRef: root.get(PDFName.of('First')) instanceof PDFRef,
    lastIsRef: root.get(PDFName.of('Last')) instanceof PDFRef,
    items: walk(root.get(PDFName.of('First')), outlinesRef)
  };
}

describe('PdfOutlineService (E1 — bookmarks & outline editor)', () => {
  let service: PdfOutlineService;

  beforeEach(() => {
    service = new PdfOutlineService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('counting', () => {
    it('counts every visible item at all levels', () => {
      const tree = [
        node('A', 0, [node('A1', 0), node('A2', 1)]),
        node('B', 2)
      ];
      // A, A1, A2, B
      expect(service.visibleCount(tree)).toBe(4);
    });

    it('stops counting under a collapsed item', () => {
      const tree = [
        node('A', 0, [node('A1', 0), node('A2', 1)], true),
        node('B', 2)
      ];
      // A and B are visible; A's children are not.
      expect(service.visibleCount(tree)).toBe(2);
    });

    it('gives a leaf no /Count at all', () => {
      expect(service.countFor(node('Leaf', 0))).toBeUndefined();
    });

    it('gives an open parent a positive count and a closed one a negative count', () => {
      const children = [node('A1', 0), node('A2', 1, [node('A2a', 1)])];

      const open = node('A', 0, children);
      expect(service.countFor(open)).toBe(3);

      const closed = node('A', 0, children, true);
      expect(service.countFor(closed)).toBe(-3);
    });

    it('a closed item reports what it would show, not what its own children show', () => {
      // A is closed; A2 inside it is also closed. A's magnitude counts A1 and
      // A2 but not A2a, because A2a would still be hidden when A is opened.
      const tree = node('A', 0, [node('A1', 0), node('A2', 1, [node('A2a', 1)], true)], true);
      expect(service.countFor(tree)).toBe(-2);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('writing the object graph', () => {
    it('writes a correct root dictionary', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      service.writeOutline(doc, [node('One', 0), node('Two', 1)]);

      const graph = readGraph(doc);
      expect(graph?.type).toBe('/Outlines');
      expect(graph?.count).toBe(2);
      expect(graph?.firstIsRef).toBe(true);
      expect(graph?.lastIsRef).toBe(true);
    });

    it('links siblings both ways and names the right parent', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      service.writeOutline(doc, [node('One', 0), node('Two', 1), node('Three', 2)]);

      const items = readGraph(doc)?.items as Array<Record<string, unknown>>;
      expect(items.map(i => i['title'])).toEqual(['One', 'Two', 'Three']);
      expect(items.map(i => i['hasPrev'])).toEqual([false, true, true]);
      expect(items.map(i => i['hasNext'])).toEqual([true, true, false]);
      expect(items.every(i => i['parentMatches'])).toBe(true);
    });

    it('nests children under their parent, with the parent as their /Parent', async () => {
      const doc = await PDFDocument.load(await textDoc(4));
      service.writeOutline(doc, [
        node('Chapter', 0, [node('Part one', 1), node('Part two', 2)]),
        node('Appendix', 3)
      ]);

      const items = readGraph(doc)?.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);

      const children = items[0]['children'] as Array<Record<string, unknown>>;
      expect(children.map(c => c['title'])).toEqual(['Part one', 'Part two']);
      expect(children.every(c => c['parentMatches'])).toBe(true);
      expect(items[0]['count']).toBe(2);
    });

    it('writes a negative /Count for a collapsed item', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      service.writeOutline(doc, [
        node('Closed', 0, [node('Hidden one', 1), node('Hidden two', 2)], true)
      ]);

      const items = readGraph(doc)?.items as Array<Record<string, unknown>>;
      expect(items[0]['count']).toBe(-2);
      // The root only counts what a reader would show.
      expect(readGraph(doc)?.count).toBe(1);
    });

    it('points each destination at the right page object', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      service.writeOutline(doc, [node('First', 0), node('Third', 2)]);

      const items = readGraph(doc)?.items as Array<Record<string, unknown>>;
      expect(items[0]['destPage']).toBe(doc.getPage(0).ref.toString());
      expect(items[1]['destPage']).toBe(doc.getPage(2).ref.toString());
    });

    it('clamps a destination past the end rather than writing a dangling one', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      service.writeOutline(doc, [node('Too far', 99)]);

      const items = readGraph(doc)?.items as Array<Record<string, unknown>>;
      expect(items[0]['destPage']).toBe(doc.getPage(1).ref.toString());
    });

    it('sets the page mode so the bookmark pane opens', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      service.writeOutline(doc, [node('One', 0)]);
      expect(doc.catalog.lookupMaybe(PDFName.of('PageMode'), PDFName)?.asString()).toBe(
        '/UseOutlines'
      );
    });

    it('replaces an existing outline rather than appending to it', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      service.writeOutline(doc, [node('Old A', 0), node('Old B', 1), node('Old C', 2)]);
      service.writeOutline(doc, [node('New', 0)]);

      const graph = readGraph(doc);
      expect(graph?.count).toBe(1);
      expect((graph?.items as Array<Record<string, unknown>>).map(i => i['title'])).toEqual([
        'New'
      ]);
    });

    it('removes the outline and the page mode it set', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      service.writeOutline(doc, [node('One', 0)]);

      expect(service.removeOutline(doc)).toBe(true);
      expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
      expect(doc.catalog.get(PDFName.of('PageMode'))).toBeUndefined();
    });

    it('writes nothing for an empty tree', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      expect(service.writeOutline(doc, [])).toBe(0);
      expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('round trip through pdf.js', () => {
    it('reopens with the same tree, titles and page targets', async () => {
      const source = await textDoc(5);
      const written = await service.exportWithOutline(
        source,
        [
          node('Introduction', 0),
          node('Body', 1, [node('First part', 2), node('Second part', 3)]),
          node('Appendix', 4)
        ],
        'out.pdf'
      );

      expect(written.bookmarkCount).toBe(5);

      const reread = await service.readOutline(await written.blob.arrayBuffer());
      expect(reread.nodes.map(n => n.title)).toEqual(['Introduction', 'Body', 'Appendix']);
      expect(reread.nodes.map(n => n.pageIndex)).toEqual([0, 1, 4]);
      expect(reread.nodes[1].children.map(n => n.title)).toEqual([
        'First part',
        'Second part'
      ]);
      expect(reread.nodes[1].children.map(n => n.pageIndex)).toEqual([2, 3]);
    });

    it('survives a non-Latin title', async () => {
      const written = await service.exportWithOutline(
        await textDoc(2),
        [node('अध्याय एक', 0), node('পরিশিষ্ট', 1)],
        'out.pdf'
      );

      const reread = await service.readOutline(await written.blob.arrayBuffer());
      expect(reread.nodes.map(n => n.title)).toEqual(['अध्याय एक', 'পরিশিষ্ট']);
    });

    it('reports a document with no outline rather than guessing', async () => {
      const result = await service.readOutline(await textDoc(2));
      expect(result.nodes).toEqual([]);
      expect(result.notices.some(n => n.kind === 'no-outline')).toBe(true);
    });

    it('reopens a collapsed branch as collapsed', async () => {
      const written = await service.exportWithOutline(
        await textDoc(3),
        [node('Closed', 0, [node('Hidden', 1)], true)],
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await written.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        const outline = await pdf.getOutline();
        expect(outline).toHaveLength(1);
        expect(outline![0].count).toBeLessThan(0);
        expect(outline![0].items).toHaveLength(1);
      } finally {
        await task.destroy();
      }
    });

    it('produces a document pdf.js opens without repair', async () => {
      const written = await service.exportWithOutline(
        await textDoc(4),
        [node('A', 0, [node('A1', 1)]), node('B', 2)],
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await written.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        expect(pdf.numPages).toBe(4);
        const outline = await pdf.getOutline();
        expect(outline).toHaveLength(2);
      } finally {
        await task.destroy();
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('generating from headings', () => {
    it('ranks the larger sizes as headings and ignores the body', () => {
      const runs = [
        { text: 'Chapter One', fontSize: 24, pageIndex: 0, y: 700 },
        { text: 'Section A', fontSize: 16, pageIndex: 0, y: 650 },
        { text: 'Body line one', fontSize: 11, pageIndex: 0, y: 600 },
        { text: 'Body line two', fontSize: 11, pageIndex: 0, y: 580 },
        { text: 'Body line three', fontSize: 11, pageIndex: 1, y: 700 }
      ];

      const headings = service.scanHeadings(runs);
      expect(headings.map(h => h.text)).toEqual(['Chapter One', 'Section A']);
      expect(headings.map(h => h.level)).toEqual([1, 2]);
    });

    it('joins runs that share a line', () => {
      const runs = [
        { text: 'Chapter', fontSize: 24, pageIndex: 0, y: 700 },
        { text: 'One', fontSize: 24, pageIndex: 0, y: 700 },
        { text: 'Body text here', fontSize: 11, pageIndex: 0, y: 600 },
        { text: 'More body text', fontSize: 11, pageIndex: 0, y: 580 }
      ];
      expect(service.scanHeadings(runs)[0].text).toBe('Chapter One');
    });

    it('finds nothing when every line is the same size', () => {
      const runs = Array.from({ length: 6 }, (_, i) => ({
        text: `Line ${i}`,
        fontSize: 11,
        pageIndex: 0,
        y: 700 - i * 20
      }));
      expect(service.scanHeadings(runs)).toEqual([]);
    });

    it('ignores a long line even when it is set large', () => {
      const runs = [
        { text: 'x'.repeat(400), fontSize: 24, pageIndex: 0, y: 700 },
        { text: 'Body line', fontSize: 11, pageIndex: 0, y: 600 },
        { text: 'Body line two', fontSize: 11, pageIndex: 0, y: 580 }
      ];
      expect(service.scanHeadings(runs)).toEqual([]);
    });

    it('nests headings by level', () => {
      const headings: HeadingCandidate[] = [
        { text: 'Chapter One', pageIndex: 0, fontSize: 24, level: 1 },
        { text: 'Section A', pageIndex: 0, fontSize: 16, level: 2 },
        { text: 'Section B', pageIndex: 1, fontSize: 16, level: 2 },
        { text: 'Chapter Two', pageIndex: 2, fontSize: 24, level: 1 }
      ];

      const tree = service.headingsToTree(headings);
      expect(tree.map(n => n.title)).toEqual(['Chapter One', 'Chapter Two']);
      expect(tree[0].children.map(n => n.title)).toEqual(['Section A', 'Section B']);
      expect(tree[1].children).toEqual([]);
    });

    it('puts a document that starts deep at the root rather than dropping it', () => {
      const tree = service.headingsToTree([
        { text: 'Section A', pageIndex: 0, fontSize: 16, level: 2 },
        { text: 'Section B', pageIndex: 1, fontSize: 16, level: 2 }
      ]);
      expect(tree).toHaveLength(2);
    });

    it('reads a real document and builds a tree from it', async () => {
      const result = await service.generateFromHeadings(await headingDoc());

      expect(result.notices.some(n => n.kind === 'generated-from-headings')).toBe(true);
      expect(result.nodes.map(n => n.title)).toEqual(['Chapter One', 'Chapter Two']);
      expect(result.nodes[0].children.map(n => n.title)).toEqual(['Section A', 'Section B']);
      expect(result.nodes[1].pageIndex).toBe(2);
    });

    it('says there is no text layer rather than inventing one', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([A4.width, A4.height]).drawRectangle({
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        color: rgb(0, 0, 0)
      });
      const bytes = await doc.save({ useObjectStreams: false });

      const result = await service.generateFromHeadings(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      );
      expect(result.nodes).toEqual([]);
      expect(result.notices.some(n => n.kind === 'no-text-layer')).toBe(true);
    });

    it('says no headings stood out rather than making every line one', async () => {
      const flat = await textDoc(3, [
        ['All the same size here'],
        ['Still the same size'],
        ['And again the same size']
      ]);
      const result = await service.generateFromHeadings(flat);
      expect(result.nodes).toEqual([]);
      expect(result.notices.some(n => n.kind === 'no-headings-found')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('tree editing', () => {
    const base = (): OutlineNode[] => [
      node('A', 0, [node('A1', 1)]),
      node('B', 2),
      node('C', 3)
    ];

    it('never mutates the tree it was given', () => {
      const tree = base();
      service.addNode(tree, 'D', 4);
      service.removeNode(tree, 'B-2');
      service.moveNode(tree, 'C-3', -1);
      expect(tree.map(n => n.title)).toEqual(['A', 'B', 'C']);
    });

    it('adds after a named node, or at the end without one', () => {
      expect(service.addNode(base(), 'New', 1, 'B-2').map(n => n.title)).toEqual([
        'A',
        'B',
        'New',
        'C'
      ]);
      expect(service.addNode(base(), 'New', 1).map(n => n.title)).toEqual([
        'A',
        'B',
        'C',
        'New'
      ]);
    });

    it('renames and repoints a node', () => {
      const next = service.updateNode(base(), 'A1-1', { title: 'Renamed', pageIndex: 5 });
      expect(next[0].children[0].title).toBe('Renamed');
      expect(next[0].children[0].pageIndex).toBe(5);
    });

    it('removes a node and everything under it', () => {
      const next = service.removeNode(base(), 'A-0');
      expect(next.map(n => n.title)).toEqual(['B', 'C']);
      expect(service.totalCount(next)).toBe(2);
    });

    it('moves a node among its siblings and stops at the ends', () => {
      expect(service.moveNode(base(), 'C-3', -1).map(n => n.title)).toEqual(['A', 'C', 'B']);
      expect(service.moveNode(base(), 'A-0', -1).map(n => n.title)).toEqual(['A', 'B', 'C']);
      expect(service.moveNode(base(), 'C-3', 1).map(n => n.title)).toEqual(['A', 'B', 'C']);
    });

    it('indents under the sibling above, and does nothing to the first item', () => {
      const next = service.indentNode(base(), 'B-2');
      expect(next.map(n => n.title)).toEqual(['A', 'C']);
      expect(next[0].children.map(n => n.title)).toEqual(['A1', 'B']);

      expect(service.indentNode(base(), 'A-0').map(n => n.title)).toEqual(['A', 'B', 'C']);
    });

    it('outdents to sit after its old parent', () => {
      const next = service.outdentNode(base(), 'A1-1');
      expect(next.map(n => n.title)).toEqual(['A', 'A1', 'B', 'C']);
      expect(next[0].children).toEqual([]);
    });

    it('does nothing when outdenting a root-level node', () => {
      expect(service.outdentNode(base(), 'B-2').map(n => n.title)).toEqual(['A', 'B', 'C']);
    });

    it('reports depth and total count', () => {
      const tree = base();
      expect(service.depthOf(tree, 'A-0')).toBe(0);
      expect(service.depthOf(tree, 'A1-1')).toBe(1);
      expect(service.totalCount(tree)).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('cancellation', () => {
    it('stops a write when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportWithOutline(
          await textDoc(2),
          [node('One', 0)],
          'out.pdf',
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });

    it('stops a heading scan when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.generateFromHeadings(await headingDoc(), undefined, {
          signal: controller.signal
        })
      ).rejects.toThrow(/cancelled/i);
    });
  });
});
