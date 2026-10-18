import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfOverlayService } from './pdf-overlay.service';
import {
  OVERLAY_PRESETS,
  OverlayLayer,
  defaultOverlayOptions
} from '../models/pdf-overlay.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

async function docBuffer(
  labels: string[],
  options?: { size?: { width: number; height: number }; rotation?: number }
): Promise<ArrayBuffer> {
  const size = options?.size ?? A4;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const label of labels) {
    const page = doc.addPage([size.width, size.height]);
    if (options?.rotation) page.setRotation(degrees(options.rotation));
    page.drawText(label, {
      x: 40,
      y: size.height - 60,
      size: 16,
      font,
      color: rgb(0, 0, 0)
    });
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function layer(
  id: string,
  labels: string[],
  overrides?: Partial<OverlayLayer>
): Promise<OverlayLayer> {
  const buffer = await docBuffer(labels);
  return {
    id,
    name: `${id}.pdf`,
    pageCount: labels.length,
    buffer,
    opacity: 1,
    scaleToFit: true,
    ...overrides
  };
}

/** The mapping as `base←layer:page`, which reads at a glance. */
const asMapping = (plan: { assignments: Array<{ basePageNumber: number; layerIndex: number; layerPageIndex: number }> }) =>
  plan.assignments.map(a =>
    a.layerIndex < 0 ? `${a.basePageNumber}←none` : `${a.basePageNumber}←${a.layerIndex}:${a.layerPageIndex}`
  );

describe('PdfOverlayService (C6 — overlay / underlay)', () => {
  let service: PdfOverlayService;

  beforeEach(() => {
    service = new PdfOverlayService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('sequential mapping', () => {
    it('uses the overlay pages in order, then the next overlay', () => {
      const sequence = service.overlaySequence([2, 2], {
        ...defaultOverlayOptions(),
        mode: 'sequential'
      });
      expect(sequence).toEqual([
        { layerIndex: 0, layerPageIndex: 0 },
        { layerIndex: 0, layerPageIndex: 1 },
        { layerIndex: 1, layerPageIndex: 0 },
        { layerIndex: 1, layerPageIndex: 1 }
      ]);
    });

    it('maps one overlay page onto one base page', () => {
      const plan = service.planMapping(4, [4], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←0:1', '3←0:2', '4←0:3']);
      expect(plan.uncoveredPageNumbers).toEqual([]);
    });

    it('leaves the remaining base pages bare when the overlay runs out', () => {
      const plan = service.planMapping(4, [2], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←0:1', '3←none', '4←none']);
      expect(plan.uncoveredPageNumbers).toEqual([3, 4]);
    });

    it('repeats a one-page letterhead across the whole base document', () => {
      const plan = service.planMapping(5, [1], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: true
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←0:0', '3←0:0', '4←0:0', '5←0:0']);
      expect(plan.uncoveredPageNumbers).toEqual([]);
    });

    it('cycles a two-page overlay over a longer base document', () => {
      const plan = service.planMapping(5, [2], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: true
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←0:1', '3←0:0', '4←0:1', '5←0:0']);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('interleaved mapping', () => {
    it('takes one page from each overlay in turn', () => {
      const plan = service.planMapping(4, [2, 2], {
        ...defaultOverlayOptions(),
        mode: 'interleaved',
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←1:0', '3←0:1', '4←1:1']);
    });

    it('drops an exhausted overlay out of the rotation', () => {
      const plan = service.planMapping(5, [3, 1], {
        ...defaultOverlayOptions(),
        mode: 'interleaved',
        cycle: false
      });
      // L0P0, L1P0, L0P1, L0P2, then nothing left.
      expect(asMapping(plan)).toEqual(['1←0:0', '2←1:0', '3←0:1', '4←0:2', '5←none']);
    });

    it('cycles the interleaved sequence when asked', () => {
      const plan = service.planMapping(5, [1, 1], {
        ...defaultOverlayOptions(),
        mode: 'interleaved',
        cycle: true
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←1:0', '3←0:0', '4←1:0', '5←0:0']);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('fixed-repeat mapping', () => {
    it('holds each overlay page for N base pages', () => {
      const plan = service.planMapping(6, [2], {
        ...defaultOverlayOptions(),
        mode: 'fixed-repeat',
        repeatCount: 3,
        cycle: false
      });
      expect(asMapping(plan)).toEqual([
        '1←0:0',
        '2←0:0',
        '3←0:0',
        '4←0:1',
        '5←0:1',
        '6←0:1'
      ]);
    });

    it('is the same as sequential at a repeat of one', () => {
      const repeated = service.planMapping(4, [2], {
        ...defaultOverlayOptions(),
        mode: 'fixed-repeat',
        repeatCount: 1,
        cycle: false
      });
      const sequential = service.planMapping(4, [2], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: false
      });
      expect(asMapping(repeated)).toEqual(asMapping(sequential));
    });

    it('treats a repeat below one as one rather than covering nothing', () => {
      const plan = service.planMapping(2, [1], {
        ...defaultOverlayOptions(),
        mode: 'fixed-repeat',
        repeatCount: 0,
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←none']);
    });

    it('spans two overlays with a repeat', () => {
      const plan = service.planMapping(4, [1, 1], {
        ...defaultOverlayOptions(),
        mode: 'fixed-repeat',
        repeatCount: 2,
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←0:0', '2←0:0', '3←1:0', '4←1:0']);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('degenerate input', () => {
    it('covers nothing when there are no overlay pages', () => {
      const plan = service.planMapping(3, [], defaultOverlayOptions());
      expect(asMapping(plan)).toEqual(['1←none', '2←none', '3←none']);
      expect(plan.overlayPageCount).toBe(0);
    });

    it('plans nothing for an empty base document', () => {
      const plan = service.planMapping(0, [2], defaultOverlayOptions());
      expect(plan.assignments).toEqual([]);
    });

    it('skips an overlay layer that has no pages', () => {
      const plan = service.planMapping(2, [0, 2], {
        ...defaultOverlayOptions(),
        mode: 'sequential',
        cycle: false
      });
      expect(asMapping(plan)).toEqual(['1←1:0', '2←1:1']);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('presets', () => {
    it('names its presets by what they do', () => {
      expect(OVERLAY_PRESETS.map(p => p.id)).toEqual([
        'letterhead',
        'preprinted-form',
        'watermark-sheet'
      ]);
    });

    it('puts a letterhead behind the content and repeats it', () => {
      const preset = OVERLAY_PRESETS.find(p => p.id === 'letterhead')!;
      expect(preset.options.position).toBe('background');
      expect(preset.options.cycle).toBe(true);
      expect(preset.opacity).toBe(1);
    });

    it('puts a watermark in front, see-through', () => {
      const preset = OVERLAY_PRESETS.find(p => p.id === 'watermark-sheet')!;
      expect(preset.options.position).toBe('foreground');
      expect(preset.opacity).toBeLessThan(0.5);
    });

    it('does not cycle a pre-printed form', () => {
      const preset = OVERLAY_PRESETS.find(p => p.id === 'preprinted-form')!;
      expect(preset.options.cycle).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('writing the output', () => {
    it('keeps the base page count and size, in the foreground', async () => {
      const base = await docBuffer(['B1', 'B2', 'B3']);
      const output = await service.exportOverlaid(
        base,
        [await layer('stamp', ['S1'])],
        { ...defaultOverlayOptions(), position: 'foreground', cycle: true },
        'out.pdf'
      );

      expect(output.pageCount).toBe(3);
      expect(output.basePageCount).toBe(3);

      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width, 2);
    });

    it('keeps the base page count and size, in the background', async () => {
      const base = await docBuffer(['B1', 'B2']);
      const output = await service.exportOverlaid(
        base,
        [await layer('letterhead', ['L1'])],
        { ...defaultOverlayOptions(), position: 'background', cycle: true },
        'out.pdf'
      );

      expect(output.pageCount).toBe(2);
      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPage(1).getHeight()).toBeCloseTo(A4.height, 2);
    });

    it('reports the pages it could not cover', async () => {
      const base = await docBuffer(['B1', 'B2', 'B3']);
      const output = await service.exportOverlaid(
        base,
        [await layer('form', ['F1'])],
        { ...defaultOverlayOptions(), cycle: false },
        'out.pdf'
      );

      const notice = output.notices.find(n => n.kind === 'uncovered-pages');
      expect(notice?.pageNumbers).toEqual([2, 3]);
    });

    it('reports that it repeated the overlay', async () => {
      const base = await docBuffer(['B1', 'B2', 'B3', 'B4']);
      const output = await service.exportOverlaid(
        base,
        [await layer('letterhead', ['L1'])],
        { ...defaultOverlayOptions(), cycle: true },
        'out.pdf'
      );
      expect(output.notices.find(n => n.kind === 'overlay-cycled')?.count).toBe(4);
    });

    it('reports an overlay that is a different shape from the base page', async () => {
      const base = await docBuffer(['B1']);
      const wide = await docBuffer(['W1'], { size: { width: A4.height, height: A4.width } });

      const output = await service.exportOverlaid(
        base,
        [
          {
            id: 'wide',
            name: 'wide.pdf',
            pageCount: 1,
            buffer: wide,
            opacity: 1,
            scaleToFit: true
          }
        ],
        defaultOverlayOptions(),
        'out.pdf'
      );

      expect(output.notices.some(n => n.kind === 'aspect-mismatch')).toBe(true);
    });

    it('applies opacity in both directions without failing', async () => {
      const base = await docBuffer(['B1']);
      const faint = await layer('wm', ['W'], { opacity: 0.15 });

      const front = await service.exportOverlaid(
        base,
        [faint],
        { ...defaultOverlayOptions(), position: 'foreground' },
        'front.pdf'
      );
      const behind = await service.exportOverlaid(
        base,
        [faint],
        { ...defaultOverlayOptions(), position: 'background' },
        'behind.pdf'
      );

      expect(front.pageCount).toBe(1);
      expect(behind.pageCount).toBe(1);
    });

    it('writes only the first page in preview mode', async () => {
      const base = await docBuffer(['B1', 'B2', 'B3']);
      const output = await service.exportOverlaid(
        base,
        [await layer('stamp', ['S1'])],
        defaultOverlayOptions(),
        'preview.pdf',
        undefined,
        undefined,
        true
      );
      expect(output.pageCount).toBe(1);
      expect(output.basePageCount).toBe(3);
    });

    it('handles a rotated base page', async () => {
      const base = await docBuffer(['B1'], { rotation: 90 });
      const output = await service.exportOverlaid(
        base,
        [await layer('stamp', ['S1'])],
        defaultOverlayOptions(),
        'out.pdf'
      );

      const doc = await PDFDocument.load(await output.blob.arrayBuffer());
      expect(doc.getPage(0).getRotation().angle).toBe(90);
    });

    it('refuses an overlay with no base document or no layers', async () => {
      const base = await docBuffer(['B1']);
      await expect(
        service.exportOverlaid(base, [], defaultOverlayOptions(), 'out.pdf')
      ).rejects.toThrow(/No overlay/i);
    });

    it('stops when its signal aborts', async () => {
      const base = await docBuffer(['B1', 'B2']);
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportOverlaid(
          base,
          [await layer('stamp', ['S1'])],
          defaultOverlayOptions(),
          'out.pdf',
          undefined,
          controller.signal
        )
      ).rejects.toThrow(/cancelled/i);
    });

    it('reports progress to completion', async () => {
      const base = await docBuffer(['B1', 'B2', 'B3', 'B4']);
      const seen: number[] = [];
      await service.exportOverlaid(
        base,
        [await layer('stamp', ['S1'])],
        defaultOverlayOptions(),
        'out.pdf',
        p => seen.push(p.percent)
      );
      expect(seen[seen.length - 1]).toBe(100);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('the output opens in the reader', () => {
    it('parses through pdfjs with the base text still extractable, in the foreground', async () => {
      const base = await docBuffer(['BaseText']);
      const output = await service.exportOverlaid(
        base,
        [await layer('stamp', ['StampText'])],
        { ...defaultOverlayOptions(), position: 'foreground' },
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;

      try {
        expect(pdf.numPages).toBe(1);
        const page = await pdf.getPage(1);
        const text = await page.getTextContent();
        const joined = text.items
          .map(item => ('str' in item ? item.str : ''))
          .join('');

        // Both layers' text is in the output, and still as text.
        expect(joined).toContain('BaseText');
        expect(joined).toContain('StampText');
      } finally {
        await task.destroy();
      }
    });

    it('parses through pdfjs with both layers intact, in the background', async () => {
      const base = await docBuffer(['BaseText']);
      const output = await service.exportOverlaid(
        base,
        [await layer('letterhead', ['HeadText'])],
        { ...defaultOverlayOptions(), position: 'background' },
        'out.pdf'
      );

      const task = pdfjsLib.getDocument({
        data: new Uint8Array(await output.blob.arrayBuffer())
      });
      const pdf = await task.promise;

      try {
        const page = await pdf.getPage(1);
        const text = await page.getTextContent();
        const joined = text.items
          .map(item => ('str' in item ? item.str : ''))
          .join('');

        /*
         * The underlay rewrites /Contents, so this is the assertion that it
         * wrapped rather than replaced: both the letterhead and the base text
         * have to still be there.
         */
        expect(joined).toContain('HeadText');
        expect(joined).toContain('BaseText');
      } finally {
        await task.destroy();
      }
    });
  });
});
