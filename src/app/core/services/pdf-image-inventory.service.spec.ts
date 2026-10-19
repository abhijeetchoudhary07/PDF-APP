import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfImageInventoryService } from './pdf-image-inventory.service';
import { makePng } from '../testing/png-fixture';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** A document with one image drawn at a known size on a known page. */
async function imageDoc(
  placements: Array<{ pixels: [number, number]; drawnPt: [number, number]; seed?: number }>
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();

  for (const placement of placements) {
    const png = await doc.embedPng(
      makePng({
        width: placement.pixels[0],
        height: placement.pixels[1],
        noiseSeed: placement.seed
      })
    );
    const page = doc.addPage([A4.width, A4.height]);
    page.drawImage(png, {
      x: 40,
      y: 100,
      width: placement.drawnPt[0],
      height: placement.drawnPt[1]
    });
  }

  return toBuffer(await doc.save({ useObjectStreams: false }));
}

describe('PdfImageInventoryService (the read every Part F pass starts from)', () => {
  let service: PdfImageInventoryService;

  beforeEach(() => {
    service = new PdfImageInventoryService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('finding images', () => {
    it('finds an image XObject with its pixel size and filter', async () => {
      const inventory = await service.inventory(
        await imageDoc([{ pixels: [400, 300], drawnPt: [200, 150] }])
      );

      expect(inventory.images).toHaveLength(1);
      expect(inventory.images[0].pixelWidth).toBe(400);
      expect(inventory.images[0].pixelHeight).toBe(300);
      expect(inventory.images[0].filters).toContain('/FlateDecode');
      expect(inventory.images[0].streamBytes).toBeGreaterThan(0);
      expect(inventory.images[0].reEncodable).toBe(true);
    });

    it('finds nothing in a document with no images', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.addPage([A4.width, A4.height]).drawText('Text only', {
        x: 60,
        y: 700,
        size: 14,
        font,
        color: rgb(0, 0, 0)
      });

      const inventory = await service.inventory(toBuffer(await doc.save({ useObjectStreams: false })));
      expect(inventory.images).toEqual([]);
      expect(inventory.placements).toEqual([]);
      expect(inventory.totalImageBytes).toBe(0);
    });

    it('totals the image bytes across the document', async () => {
      const inventory = await service.inventory(
        await imageDoc([
          { pixels: [100, 100], drawnPt: [100, 100], seed: 1 },
          { pixels: [200, 200], drawnPt: [100, 100], seed: 2 }
        ])
      );

      expect(inventory.images).toHaveLength(2);
      expect(inventory.totalImageBytes).toBe(
        inventory.images[0].streamBytes + inventory.images[1].streamBytes
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('measuring resolution', () => {
    it('works out DPI from the drawn size, not the pixel count alone', async () => {
      // 300px across 72pt — one inch — is 300 DPI.
      const inventory = await service.inventory(
        await imageDoc([{ pixels: [300, 300], drawnPt: [72, 72] }])
      );

      expect(inventory.placements).toHaveLength(1);
      expect(Math.round(inventory.placements[0].dpiX)).toBe(300);
      expect(Math.round(inventory.placements[0].dpiY)).toBe(300);
      expect(Math.round(inventory.placements[0].effectiveDpi)).toBe(300);
    });

    it('calls the same image different resolutions at different sizes', async () => {
      /*
       * This is the whole reason the content stream is scanned: a 600px image
       * is 600 DPI across one inch and 150 DPI across four. A ceiling that
       * could not tell them apart would ruin one or ignore the other.
       */
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(makePng({ width: 600, height: 600, noiseSeed: 7 }));

      const small = doc.addPage([A4.width, A4.height]);
      small.drawImage(png, { x: 40, y: 600, width: 72, height: 72 });

      const large = doc.addPage([A4.width, A4.height]);
      large.drawImage(png, { x: 40, y: 300, width: 288, height: 288 });

      const inventory = await service.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );

      const byPage = new Map(
        inventory.placements.map(p => [p.pageNumber, Math.round(p.effectiveDpi)])
      );
      expect(byPage.get(1)).toBe(600);
      expect(byPage.get(2)).toBe(150);

      // The peak is what a ceiling has to judge by.
      expect(Math.round(service.peakDpiFor(inventory, inventory.images[0].key))).toBe(600);
    });

    it('records the drawn size in points', async () => {
      const inventory = await service.inventory(
        await imageDoc([{ pixels: [400, 200], drawnPt: [200, 100] }])
      );

      expect(Math.round(inventory.placements[0].drawnWidthPt)).toBe(200);
      expect(Math.round(inventory.placements[0].drawnHeightPt)).toBe(100);
    });

    it('handles a non-square aspect by reporting each axis', async () => {
      // 400px over 100pt is 288 DPI; 200px over 100pt is 144 DPI.
      const inventory = await service.inventory(
        await imageDoc([{ pixels: [400, 200], drawnPt: [100, 100] }])
      );

      const placement = inventory.placements[0];
      expect(Math.round(placement.dpiX)).toBe(288);
      expect(Math.round(placement.dpiY)).toBe(144);
      expect(Math.round(placement.effectiveDpi)).toBe(288);
    });

    it('lists the pages an image appears on', async () => {
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(makePng({ width: 100, height: 100, noiseSeed: 3 }));
      for (let i = 0; i < 3; i++) {
        doc.addPage([A4.width, A4.height]).drawImage(png, {
          x: 40,
          y: 100,
          width: 100,
          height: 100
        });
      }

      const inventory = await service.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      expect(service.pagesFor(inventory, inventory.images[0].key)).toEqual([1, 2, 3]);
    });

    it('attributes image bytes to each page they appear on', async () => {
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(makePng({ width: 120, height: 120, noiseSeed: 9 }));
      for (let i = 0; i < 2; i++) {
        doc.addPage([A4.width, A4.height]).drawImage(png, {
          x: 40,
          y: 100,
          width: 120,
          height: 120
        });
      }

      const inventory = await service.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      const byPage = service.imageBytesByPage(inventory);
      expect(byPage.get(1)).toBe(inventory.images[0].streamBytes);
      expect(byPage.get(2)).toBe(inventory.images[0].streamBytes);
    });

    it('counts an image drawn twice on one page once for that page', async () => {
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(makePng({ width: 80, height: 80, noiseSeed: 4 }));
      const page = doc.addPage([A4.width, A4.height]);
      page.drawImage(png, { x: 40, y: 500, width: 80, height: 80 });
      page.drawImage(png, { x: 200, y: 500, width: 80, height: 80 });

      const inventory = await service.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      expect(inventory.placements).toHaveLength(2);
      expect(service.imageBytesByPage(inventory).get(1)).toBe(
        inventory.images[0].streamBytes
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('unused images', () => {
    it('reports an image nothing draws', async () => {
      const doc = await PDFDocument.create();
      // Embedded and referenced by nothing on any page.
      const orphan = await doc.embedPng(makePng({ width: 50, height: 50, noiseSeed: 11 }));
      const used = await doc.embedPng(makePng({ width: 60, height: 60, noiseSeed: 12 }));
      doc.addPage([A4.width, A4.height]).drawImage(used, {
        x: 40,
        y: 100,
        width: 60,
        height: 60
      });
      // Force the orphan to be written even though nothing draws it.
      await orphan.embed();

      const inventory = await service.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      expect(inventory.images.length).toBeGreaterThanOrEqual(1);
      expect(inventory.unusedImageKeys.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('running it', () => {
    it('reports progress to completion', async () => {
      const seen: number[] = [];
      await service.inventory(
        await imageDoc([
          { pixels: [60, 60], drawnPt: [60, 60], seed: 1 },
          { pixels: [60, 60], drawnPt: [60, 60], seed: 2 },
          { pixels: [60, 60], drawnPt: [60, 60], seed: 3 }
        ]),
        { onProgress: p => seen.push(p.percent) }
      );
      expect(seen[seen.length - 1]).toBe(100);
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.inventory(await imageDoc([{ pixels: [60, 60], drawnPt: [60, 60] }]), {
          signal: controller.signal
        })
      ).rejects.toThrow(/cancelled/i);
    });

    it('accepts an already-loaded document', async () => {
      const buffer = await imageDoc([{ pixels: [100, 100], drawnPt: [50, 50] }]);
      const doc = await PDFDocument.load(buffer);
      const inventory = await service.inventory(doc);
      expect(inventory.images).toHaveLength(1);
    });
  });
});
