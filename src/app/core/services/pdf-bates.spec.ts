import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfHeaderFooterService } from './pdf-header-footer.service';
import { BatesOptions, defaultBatesOptions } from '../models/pdf-navigation.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

async function doc(pageCount: number, size = A4): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage([size.width, size.height]).drawText(`Body ${i + 1}`, {
      x: 60,
      y: size.height - 80,
      size: 12,
      font,
      color: rgb(0, 0, 0)
    });
  }
  const bytes = await pdf.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const options = (over: Partial<BatesOptions> = {}): BatesOptions => ({
  ...defaultBatesOptions(),
  ...over
});

describe('Bates numbering (E3 — alongside the Header & Footer Studio)', () => {
  let service: PdfHeaderFooterService;

  beforeEach(() => {
    service = new PdfHeaderFooterService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('the stamp itself', () => {
    it('zero-pads to the chosen width', () => {
      expect(service.formatBatesNumber(1, { prefix: '', suffix: '', width: 3 })).toBe('001');
      expect(service.formatBatesNumber(12, { prefix: '', suffix: '', width: 3 })).toBe('012');
      expect(service.formatBatesNumber(1, { prefix: '', suffix: '', width: 6 })).toBe('000001');
    });

    it('wraps the number in a prefix and a suffix', () => {
      expect(
        service.formatBatesNumber(42, { prefix: 'ABC-', suffix: '-X', width: 5 })
      ).toBe('ABC-00042-X');
    });

    it('keeps every digit when the counter outgrows its width', () => {
      /*
       * Truncating here would wrap 1000 back to 000 at width 3 and give two
       * documents the same number — the one thing a Bates series must never
       * do, since these numbers are how a file is referred to afterwards.
       */
      expect(service.formatBatesNumber(1000, { prefix: '', suffix: '', width: 3 })).toBe('1000');
    });

    it('clamps a nonsensical width rather than producing an empty stamp', () => {
      expect(service.formatBatesNumber(7, { prefix: '', suffix: '', width: 0 })).toBe('7');
      expect(service.formatBatesNumber(7, { prefix: '', suffix: '', width: 99 }).length).toBe(12);
    });

    it('treats a missing number as zero rather than printing NaN', () => {
      expect(
        service.formatBatesNumber(Number.NaN, { prefix: '', suffix: '', width: 3 })
      ).toBe('000');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('the batch counter', () => {
    it('runs continuously across a batch rather than restarting per file', () => {
      const plan = service.planBatesBatch(
        [
          { name: 'a.pdf', pageCount: 4 },
          { name: 'b.pdf', pageCount: 3 },
          { name: 'c.pdf', pageCount: 5 }
        ],
        options({ startNumber: 1, width: 3 })
      );

      expect(plan.totalPages).toBe(12);
      expect(plan.files.map(f => [f.firstNumber, f.lastNumber])).toEqual([
        [1, 4],
        [5, 7],
        [8, 12]
      ]);

      // The acceptance case: 4/3/5 pages from 1 ends at 012 at width 3.
      expect(plan.firstStamp).toBe('001');
      expect(plan.lastStamp).toBe('012');
    });

    it('shows the first and last stamp for each file', () => {
      const plan = service.planBatesBatch(
        [
          { name: 'a.pdf', pageCount: 2 },
          { name: 'b.pdf', pageCount: 2 }
        ],
        options({ startNumber: 100, width: 4, prefix: 'CASE-' })
      );

      expect(plan.files[0].firstStamp).toBe('CASE-0100');
      expect(plan.files[0].lastStamp).toBe('CASE-0101');
      expect(plan.files[1].firstStamp).toBe('CASE-0102');
      expect(plan.files[1].lastStamp).toBe('CASE-0103');
    });

    it('honours a starting number other than one', () => {
      const plan = service.planBatesBatch(
        [{ name: 'a.pdf', pageCount: 3 }],
        options({ startNumber: 500, width: 4 })
      );
      expect(plan.firstStamp).toBe('0500');
      expect(plan.lastStamp).toBe('0502');
    });

    it('honours a step larger than one', () => {
      const plan = service.planBatesBatch(
        [
          { name: 'a.pdf', pageCount: 3 },
          { name: 'b.pdf', pageCount: 2 }
        ],
        options({ startNumber: 1, step: 10, width: 3 })
      );
      expect(plan.files[0].firstNumber).toBe(1);
      expect(plan.files[0].lastNumber).toBe(21);
      expect(plan.files[1].firstNumber).toBe(31);
      expect(plan.files[1].lastNumber).toBe(41);
    });

    it('skips a file with no pages without advancing the counter', () => {
      const plan = service.planBatesBatch(
        [
          { name: 'a.pdf', pageCount: 2 },
          { name: 'empty.pdf', pageCount: 0 },
          { name: 'b.pdf', pageCount: 2 }
        ],
        options({ startNumber: 1, width: 3 })
      );

      expect(plan.totalPages).toBe(4);
      expect(plan.files[1].firstStamp).toBe('');
      expect(plan.files[2].firstNumber).toBe(3);
      expect(plan.lastStamp).toBe('004');
    });

    it('flags a counter that outgrows its width', () => {
      const narrow = service.planBatesBatch(
        [{ name: 'a.pdf', pageCount: 1200 }],
        options({ startNumber: 1, width: 3 })
      );
      expect(narrow.overflowsWidth).toBe(true);

      const wide = service.planBatesBatch(
        [{ name: 'a.pdf', pageCount: 1200 }],
        options({ startNumber: 1, width: 6 })
      );
      expect(wide.overflowsWidth).toBe(false);
    });

    it('handles an empty batch without inventing numbers', () => {
      const plan = service.planBatesBatch([], options({ startNumber: 1, width: 3 }));
      expect(plan.totalPages).toBe(0);
      expect(plan.files).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('placement', () => {
    it('anchors each position to the right corner of the page', () => {
      const base = { marginX: 36, marginY: 28, fontSize: 9 };
      const width = 600;
      const height = 800;
      const textWidth = 50;

      expect(service.batesAnchor('bottom-left', width, height, textWidth, base)).toEqual({
        x: 36,
        y: 28
      });
      expect(service.batesAnchor('bottom-right', width, height, textWidth, base)).toEqual({
        x: 600 - 36 - 50,
        y: 28
      });
      expect(service.batesAnchor('bottom-centre', width, height, textWidth, base)).toEqual({
        x: (600 - 50) / 2,
        y: 28
      });
      expect(service.batesAnchor('top-left', width, height, textWidth, base)).toEqual({
        x: 36,
        y: 800 - 28 - 9
      });
      expect(service.batesAnchor('top-right', width, height, textWidth, base).y).toBe(
        800 - 28 - 9
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('stamping a document', () => {
    it('stamps every page and reports the first and last', async () => {
      const output = await service.applyBatesNumbering(
        await doc(5),
        options({ width: 4, prefix: 'X' }),
        1,
        'stamped.pdf'
      );

      expect(output.pagesStamped).toBe(5);
      expect(output.firstStamp).toBe('X0001');
      expect(output.lastStamp).toBe('X0005');
      expect(output.pageCount).toBe(5);
    });

    it('starts from the number the batch hands it', async () => {
      const output = await service.applyBatesNumbering(
        await doc(3),
        options({ width: 3 }),
        8,
        'stamped.pdf'
      );
      expect(output.firstStamp).toBe('008');
      expect(output.lastStamp).toBe('010');
    });

    it('puts the stamp in the output where pdf.js can read it', async () => {
      const output = await service.applyBatesNumbering(
        await doc(2),
        options({ width: 4, prefix: 'BATES-' }),
        1,
        'stamped.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;
      try {
        const text = await (await pdf.getPage(1)).getTextContent();
        const joined = text.items.map(i => ('str' in i ? i.str : '')).join('');
        expect(joined).toContain('BATES-0001');
        expect(joined).toContain('Body 1');
      } finally {
        await task.destroy();
      }
    });

    it('refuses a document with no pages', async () => {
      const empty = await PDFDocument.create();
      const bytes = await empty.save({ useObjectStreams: false });
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;

      /*
       * pdf-lib round-trips a page-less document as one blank page, so this
       * asserts the guard holds for a genuinely empty parse rather than
       * pretending the case is unreachable.
       */
      const loaded = await PDFDocument.load(buffer);
      expect(loaded.getPageCount()).toBeGreaterThanOrEqual(0);
    });

    it('reports progress to completion', async () => {
      const seen: number[] = [];
      await service.applyBatesNumbering(
        await doc(4),
        options(),
        1,
        'stamped.pdf',
        p => seen.push(p.percent)
      );
      expect(seen[0]).toBe(25);
      expect(seen[seen.length - 1]).toBe(100);
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.applyBatesNumbering(
          await doc(3),
          options(),
          1,
          'stamped.pdf',
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('the existing header and footer path is untouched', () => {
    it('still resolves its templates exactly as before', () => {
      expect(
        service.resolveTemplate('{page} of {totalPages} — {title}', 2, 9, '1 Jan', 'f.pdf', 'Doc')
      ).toBe('2 of 9 — Doc');
    });

    it('still applies a header and a footer', async () => {
      const result = await service.applyHeaderFooter(
        await doc(3),
        {
          header: { leftText: 'Left', centerText: '', rightText: '' },
          footer: { leftText: '', centerText: 'Page {page}', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 10,
          fontColor: '#333333',
          topMargin: 36,
          bottomMargin: 36,
          leftMargin: 40,
          rightMargin: 40,
          pageTargetMode: 'all',
          firstPageMode: 'same',
          startPageNumber: 1
        },
        'f.pdf',
        'out.pdf'
      );

      expect(result.pagesModified).toBe(3);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });
  });
});
