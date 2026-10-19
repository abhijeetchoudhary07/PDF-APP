import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPageLabelService } from './pdf-page-label.service';
import { PageLabelRange } from '../models/pdf-navigation.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

async function blankDoc(count: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  for (let i = 0; i < count; i++) {
    doc.addPage([A4.width, A4.height]).drawText(`Sheet ${i + 1}`, {
      x: 60,
      y: A4.height - 80,
      size: 12,
      font
    });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const range = (
  startPage: number,
  style: PageLabelRange['style'],
  prefix = '',
  startValue = 1
): PageLabelRange => ({
  id: `r${startPage}`,
  startPage,
  style,
  prefix,
  startValue
});

/** Reads the written /Nums array back out as plain data. */
function readNums(doc: PDFDocument) {
  const ref = doc.catalog.get(PDFName.of('PageLabels'));
  if (!(ref instanceof PDFRef)) return undefined;

  const labels = doc.context.lookupMaybe(ref, PDFDict);
  const nums = labels?.lookupMaybe(PDFName.of('Nums'), PDFArray);
  if (!nums) return undefined;

  const out: Array<{ key: number; style?: string; prefix?: string; start?: number }> = [];
  for (let i = 0; i + 1 < nums.size(); i += 2) {
    const key = nums.lookupMaybe(i, PDFNumber)?.asNumber();
    const entry = nums.lookupMaybe(i + 1, PDFDict);
    if (key === undefined || !entry) continue;

    const prefixValue = entry.get(PDFName.of('P'));
    out.push({
      key,
      style: entry.lookupMaybe(PDFName.of('S'), PDFName)?.asString(),
      prefix:
        prefixValue && 'decodeText' in prefixValue
          ? (prefixValue as { decodeText(): string }).decodeText()
          : undefined,
      start: entry.lookupMaybe(PDFName.of('St'), PDFNumber)?.asNumber()
    });
  }
  return out;
}

describe('PdfPageLabelService (E2 — page labels)', () => {
  let service: PdfPageLabelService;

  beforeEach(() => {
    service = new PdfPageLabelService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('number formatting', () => {
    it('writes roman numerals in both cases', () => {
      expect(service.toRoman(1, false)).toBe('i');
      expect(service.toRoman(4, false)).toBe('iv');
      expect(service.toRoman(9, false)).toBe('ix');
      expect(service.toRoman(14, false)).toBe('xiv');
      expect(service.toRoman(40, false)).toBe('xl');
      expect(service.toRoman(1987, true)).toBe('MCMLXXXVII');
      expect(service.toRoman(3999, true)).toBe('MMMCMXCIX');
    });

    it('falls back to digits outside the roman range', () => {
      expect(service.toRoman(0, false)).toBe('');
      expect(service.toRoman(4000, false)).toBe('4000');
    });

    it('writes letters the way the format specifies, repeating rather than carrying', () => {
      expect(service.toLetters(1, false)).toBe('a');
      expect(service.toLetters(26, false)).toBe('z');
      // 27 is 'aa', not a spreadsheet-style second column.
      expect(service.toLetters(27, false)).toBe('aa');
      expect(service.toLetters(52, false)).toBe('zz');
      expect(service.toLetters(53, true)).toBe('AAA');
    });

    it('formats a number in each style', () => {
      expect(service.formatNumber(7, 'decimal')).toBe('7');
      expect(service.formatNumber(7, 'roman-lower')).toBe('vii');
      expect(service.formatNumber(7, 'roman-upper')).toBe('VII');
      expect(service.formatNumber(7, 'letters-lower')).toBe('g');
      expect(service.formatNumber(7, 'letters-upper')).toBe('G');
      expect(service.formatNumber(7, 'none')).toBe('');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('resolving a page to a label', () => {
    it('labels the front matter in roman and the body in decimal', () => {
      const ranges = [range(1, 'roman-lower'), range(5, 'decimal')];

      expect(service.labelFor(1, ranges, 10)).toBe('i');
      expect(service.labelFor(4, ranges, 10)).toBe('iv');
      // The body restarts at 1 even though it is physical page 5.
      expect(service.labelFor(5, ranges, 10)).toBe('1');
      expect(service.labelFor(10, ranges, 10)).toBe('6');
    });

    it('honours a prefix and a starting value', () => {
      const ranges = [range(1, 'decimal', 'A-', 100)];
      expect(service.labelFor(1, ranges, 3)).toBe('A-100');
      expect(service.labelFor(3, ranges, 3)).toBe('A-102');
    });

    it('prints a prefix on its own when there is no style', () => {
      const ranges = [range(1, 'none', 'Cover'), range(2, 'decimal')];
      expect(service.labelFor(1, ranges, 4)).toBe('Cover');
      expect(service.labelFor(2, ranges, 4)).toBe('1');
    });

    it('falls back to decimal from page 1 when no range covers the start', () => {
      // A range starting at page 3 leaves pages 1-2 with no rule of their own.
      const ranges = [range(3, 'decimal', '', 1)];
      expect(service.labelFor(1, ranges, 5)).toBe('1');
      expect(service.labelFor(2, ranges, 5)).toBe('2');
      expect(service.labelFor(3, ranges, 5)).toBe('1');
    });

    it('builds a preview that marks where each range starts', () => {
      const rows = service.preview([range(1, 'roman-lower'), range(3, 'decimal')], 4);
      expect(rows.map(r => r.label)).toEqual(['i', 'ii', '1', '2']);
      expect(rows.filter(r => r.rangeStart).map(r => r.pageNumber)).toEqual([1, 3]);
    });

    it('reports labels that land on more than one page', () => {
      // Two decimal runs both counting from 1 collide on every page.
      const duplicates = service.findDuplicateLabels(
        [range(1, 'decimal'), range(3, 'decimal')],
        4
      );
      expect(duplicates).toContain('1');
      expect(duplicates).toContain('2');
    });

    it('finds no duplicates in a sensible set of ranges', () => {
      expect(
        service.findDuplicateLabels([range(1, 'roman-lower'), range(3, 'decimal')], 6)
      ).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('normalizing ranges', () => {
    it('sorts, and always covers page 1', () => {
      const normalized = service.normalizeRanges([range(5, 'decimal'), range(3, 'roman-lower')], 10);
      expect(normalized.map(r => r.startPage)).toEqual([1, 3, 5]);
      expect(normalized[0].style).toBe('decimal');
    });

    it('drops a range starting past the end', () => {
      const normalized = service.normalizeRanges([range(1, 'decimal'), range(99, 'roman-lower')], 4);
      expect(normalized.map(r => r.startPage)).toEqual([1]);
    });

    it('lets the later of two ranges on the same page win', () => {
      const normalized = service.normalizeRanges(
        [range(2, 'decimal', 'first'), range(2, 'roman-lower', 'second')],
        5
      );
      const atTwo = normalized.filter(r => r.startPage === 2);
      expect(atTwo).toHaveLength(1);
      expect(atTwo[0].prefix).toBe('second');
    });

    it('clamps a start value below 1', () => {
      expect(service.normalizeRanges([range(1, 'decimal', '', 0)], 3)[0].startValue).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('writing the number tree', () => {
    it('writes 0-indexed keys in ascending order', async () => {
      const doc = await PDFDocument.load(await blankDoc(10));
      service.writePageLabels(doc, [range(5, 'decimal'), range(1, 'roman-lower')]);

      const nums = readNums(doc);
      expect(nums?.map(n => n.key)).toEqual([0, 4]);
    });

    it('writes the right style name for each style', async () => {
      const doc = await PDFDocument.load(await blankDoc(12));
      service.writePageLabels(doc, [
        range(1, 'roman-lower'),
        range(3, 'roman-upper'),
        range(5, 'letters-lower'),
        range(7, 'letters-upper'),
        range(9, 'decimal')
      ]);

      expect(readNums(doc)?.map(n => n.style)).toEqual(['/r', '/R', '/a', '/A', '/D']);
    });

    it('omits /S entirely for a prefix-only range', async () => {
      const doc = await PDFDocument.load(await blankDoc(4));
      service.writePageLabels(doc, [range(1, 'none', 'Cover'), range(2, 'decimal')]);

      const nums = readNums(doc);
      expect(nums?.[0].style).toBeUndefined();
      expect(nums?.[0].prefix).toBe('Cover');
    });

    it('omits /St when the run counts from 1, and writes it when it does not', async () => {
      const doc = await PDFDocument.load(await blankDoc(6));
      service.writePageLabels(doc, [range(1, 'decimal'), range(3, 'decimal', '', 100)]);

      const nums = readNums(doc);
      expect(nums?.[0].start).toBeUndefined();
      expect(nums?.[1].start).toBe(100);
    });

    it('keeps a non-Latin prefix intact', async () => {
      const doc = await PDFDocument.load(await blankDoc(3));
      service.writePageLabels(doc, [range(1, 'decimal', 'परिशिष्ट-')]);
      expect(readNums(doc)?.[0].prefix).toBe('परिशिष्ट-');
    });

    it('replaces existing labels rather than appending to them', async () => {
      const doc = await PDFDocument.load(await blankDoc(8));
      service.writePageLabels(doc, [range(1, 'decimal'), range(3, 'decimal'), range(5, 'decimal')]);
      service.writePageLabels(doc, [range(1, 'roman-lower')]);

      expect(readNums(doc)).toHaveLength(1);
      expect(readNums(doc)?.[0].style).toBe('/r');
    });

    it('removes the labels when asked', async () => {
      const doc = await PDFDocument.load(await blankDoc(3));
      service.writePageLabels(doc, [range(1, 'decimal')]);

      expect(service.removePageLabels(doc)).toBe(true);
      expect(doc.catalog.get(PDFName.of('PageLabels'))).toBeUndefined();
      expect(service.hasPageLabels(doc)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('round trip', () => {
    it('reads back the ranges it wrote', async () => {
      const doc = await PDFDocument.load(await blankDoc(10));
      service.writePageLabels(doc, [
        range(1, 'roman-lower', 'fm-'),
        range(5, 'decimal', '', 1)
      ]);

      const bytes = await doc.save({ useObjectStreams: false });
      const reloaded = await PDFDocument.load(bytes);
      const read = service.readPageLabels(reloaded);

      expect(read.map(r => r.startPage)).toEqual([1, 5]);
      expect(read[0].style).toBe('roman-lower');
      expect(read[0].prefix).toBe('fm-');
      expect(read[1].style).toBe('decimal');
      expect(read[1].startValue).toBe(1);
    });

    it('reports the expected labels through pdf.js', async () => {
      const output = await service.exportWithLabels(
        await blankDoc(8),
        [range(1, 'roman-lower'), range(5, 'decimal')],
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        const labels = await pdf.getPageLabels();
        expect(labels).toEqual(['i', 'ii', 'iii', 'iv', '1', '2', '3', '4']);
      } finally {
        await task.destroy();
      }
    });

    it('reports multiple ranges and a restart through pdf.js', async () => {
      const output = await service.exportWithLabels(
        await blankDoc(7),
        [
          range(1, 'none', 'Cover'),
          range(2, 'roman-upper'),
          range(4, 'decimal', 'A-', 10)
        ],
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        expect(await pdf.getPageLabels()).toEqual([
          'Cover',
          'I',
          'II',
          'A-10',
          'A-11',
          'A-12',
          'A-13'
        ]);
      } finally {
        await task.destroy();
      }
    });

    it('reports no labels on a document that has none', async () => {
      const doc = await PDFDocument.load(await blankDoc(3));
      expect(service.readPageLabels(doc)).toEqual([]);
      expect(service.hasPageLabels(doc)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('export reporting', () => {
    it('reports how many ranges were written', async () => {
      const output = await service.exportWithLabels(
        await blankDoc(6),
        [range(1, 'roman-lower'), range(4, 'decimal')],
        'out.pdf'
      );
      expect(output.rangeCount).toBe(2);
      expect(output.notices.find(n => n.kind === 'labels-written')?.count).toBe(2);
    });

    it('reports a range that starts past the end', async () => {
      const output = await service.exportWithLabels(
        await blankDoc(3),
        [range(1, 'decimal'), range(50, 'roman-lower')],
        'out.pdf'
      );
      expect(output.notices.some(n => n.kind === 'range-past-end')).toBe(true);
    });

    it('reports duplicate labels rather than silently writing them', async () => {
      const output = await service.exportWithLabels(
        await blankDoc(4),
        [range(1, 'decimal'), range(3, 'decimal')],
        'out.pdf'
      );
      expect(output.notices.some(n => n.kind === 'duplicate-labels')).toBe(true);
    });

    it('reports clearing when there is nothing to write', async () => {
      const output = await service.exportWithLabels(await blankDoc(3), [], 'out.pdf');
      // An empty set still gets the implicit page-1 rule, so this writes one.
      expect(output.rangeCount).toBe(1);
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportWithLabels(
          await blankDoc(3),
          [range(1, 'decimal')],
          'out.pdf',
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });
  });
});
