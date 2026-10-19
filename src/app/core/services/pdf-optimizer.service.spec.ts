import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, PDFName, PDFNumber, PDFStream, StandardFonts, rgb } from 'pdf-lib';
import { PdfOptimizerService } from './pdf-optimizer.service';
import { PdfImageInventoryService } from './pdf-image-inventory.service';
import {
  defaultColourPathOptions,
  defaultDownsampleOptions,
  defaultFitLimitOptions,
  defaultStructureOptions
} from '../models/pdf-optimize.types';
import { makePng } from '../testing/png-fixture';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** A text-only document — nothing for the image passes to do. */
async function textDoc(pages = 2): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([A4.width, A4.height]).drawText(`Vector text page ${i + 1} with digital text content.`, {
      x: 60,
      y: 700,
      size: 14,
      font,
      color: rgb(0, 0, 0)
    });
  }
  return toBuffer(await doc.save({ useObjectStreams: false }));
}

/** The same logo embedded separately on each page — the dedupe fixture. */
async function repeatedLogoDoc(pages: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const logoBytes = makePng({ width: 64, height: 64, noiseSeed: 42 });

  for (let i = 0; i < pages; i++) {
    // Embedded once per page on purpose: that is what a merge of per-page
    // scans produces, and what this pass exists to collapse.
    const png = await doc.embedPng(logoBytes);
    doc.addPage([A4.width, A4.height]).drawImage(png, {
      x: 40,
      y: 700,
      width: 64,
      height: 64
    });
  }

  return toBuffer(await doc.save({ useObjectStreams: false }));
}

/** One image drawn at a known size, for the DPI maths. */
async function imageDoc(
  pixels: [number, number],
  drawnPt: [number, number],
  seed = 5
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(makePng({ width: pixels[0], height: pixels[1], noiseSeed: seed }));
  doc.addPage([A4.width, A4.height]).drawImage(png, {
    x: 40,
    y: 200,
    width: drawnPt[0],
    height: drawnPt[1]
  });
  return toBuffer(await doc.save({ useObjectStreams: false }));
}

/** Counts image XObjects in a document. */
async function imageObjectCount(buffer: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  let count = 0;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFStream &&
      object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() === '/Image'
    ) {
      count++;
    }
  }
  return count;
}

describe('PdfOptimizerService (F1, F2, F3, F6)', () => {
  let service: PdfOptimizerService;
  let inventoryService: PdfImageInventoryService;

  beforeEach(() => {
    // Both are providedIn: 'root', so TestBed wires the real collaborator.
    service = TestBed.inject(PdfOptimizerService);
    inventoryService = TestBed.inject(PdfImageInventoryService);
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F1 — the DPI ceiling', () => {
    it('halves an image at 600 DPI when the ceiling is 300', async () => {
      // 600px across 72pt is 600 DPI; the 300 ceiling asks for half of it.
      const inventory = await inventoryService.inventory(await imageDoc([600, 600], [72, 72]));
      const plan = service.planDownsample(inventory, {
        ...defaultDownsampleOptions(),
        ceiling: 300
      });

      expect(plan.candidateCount).toBe(1);
      const row = plan.rows[0];
      expect(row.originalDpi).toBe(600);
      expect(row.newDpi).toBe(300);
      expect(row.newPixels).toEqual({ width: 300, height: 300 });
      expect(row.savedBytes).toBeGreaterThan(0);
    });

    it('works the target size out from the resolution, not the pixel count', () => {
      expect(service.targetPixelsFor(600, 400, 600, 300)).toEqual({ width: 300, height: 200 });
      expect(service.targetPixelsFor(600, 400, 150, 300)).toEqual({ width: 600, height: 400 });
      expect(service.targetPixelsFor(600, 400, 600, 'none')).toEqual({
        width: 600,
        height: 400
      });
    });

    it('leaves an image already under the ceiling alone', async () => {
      // 150px across 72pt is 150 DPI, comfortably under 300.
      const inventory = await inventoryService.inventory(await imageDoc([150, 150], [72, 72]));
      const plan = service.planDownsample(inventory, {
        ...defaultDownsampleOptions(),
        ceiling: 300
      });

      expect(plan.candidateCount).toBe(0);
      expect(plan.rows[0].skippedReason).toBe('already-under');
      expect(plan.estimatedSavedBytes).toBe(0);
    });

    it('judges an image by its largest placement', async () => {
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(makePng({ width: 600, height: 600, noiseSeed: 8 }));
      // Small on one page, large on another.
      doc.addPage([A4.width, A4.height]).drawImage(png, { x: 40, y: 600, width: 288, height: 288 });
      doc.addPage([A4.width, A4.height]).drawImage(png, { x: 40, y: 600, width: 72, height: 72 });

      const inventory = await inventoryService.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      const plan = service.planDownsample(inventory, {
        ...defaultDownsampleOptions(),
        ceiling: 300
      });

      // The 600 DPI placement decides, not the 150 DPI one.
      expect(plan.rows[0].originalDpi).toBe(600);
      expect(plan.rows[0].newPixels.width).toBe(300);
    });

    it('skips an image whose saving would be trivial', async () => {
      // 330 DPI against a 300 ceiling is about a 17% pixel saving; a 40%
      // minimum gain rejects it rather than re-encoding for nothing.
      const inventory = await inventoryService.inventory(await imageDoc([330, 330], [72, 72]));
      const plan = service.planDownsample(inventory, {
        ...defaultDownsampleOptions(),
        ceiling: 300,
        minGain: 0.4
      });

      expect(plan.rows[0].skippedReason).toBe('no-gain');
      expect(plan.candidateCount).toBe(0);
    });

    it('reports every image, including the ones nothing happens to', async () => {
      const doc = await PDFDocument.create();
      const big = await doc.embedPng(makePng({ width: 600, height: 600, noiseSeed: 1 }));
      const small = await doc.embedPng(makePng({ width: 100, height: 100, noiseSeed: 2 }));
      const page = doc.addPage([A4.width, A4.height]);
      page.drawImage(big, { x: 40, y: 500, width: 72, height: 72 });
      page.drawImage(small, { x: 200, y: 500, width: 72, height: 72 });

      const inventory = await inventoryService.inventory(
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      const plan = service.planDownsample(inventory, {
        ...defaultDownsampleOptions(),
        ceiling: 300
      });

      expect(plan.rows).toHaveLength(2);
      expect(plan.rows.filter(r => r.skippedReason).length).toBe(1);
    });

    it('no-limit is a no-op that returns the file untouched', async () => {
      const source = await imageDoc([100, 100], [72, 72]);
      const output = await service.exportDownsampled(
        source,
        { ...defaultDownsampleOptions(), ceiling: 'none' },
        'out.pdf'
      );

      expect(output.sizeBytes).toBe(source.byteLength);
      expect(output.savedBytes).toBe(0);
      expect(output.notices.some(n => n.kind === 'nothing-to-do')).toBe(true);

      const roundTripped = await output.blob.arrayBuffer();
      expect(new Uint8Array(roundTripped)).toEqual(new Uint8Array(source));
    });

    it('leaves a text-only document byte-identical', async () => {
      const source = await textDoc(3);
      const output = await service.exportDownsampled(
        source,
        { ...defaultDownsampleOptions(), ceiling: 150 },
        'out.pdf'
      );

      // No images to resample, so vector text comes back exactly as it went in.
      expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(new Uint8Array(source));
      expect(output.notices.some(n => n.kind === 'images-already-under')).toBe(true);
    });

    it('reports that it cannot resample when the device has no canvas', async () => {
      // jsdom has no 2D context, which is exactly this path.
      const output = await service.exportDownsampled(
        await imageDoc([600, 600], [72, 72]),
        { ...defaultDownsampleOptions(), ceiling: 150 },
        'out.pdf'
      );

      expect(output.notices.some(n => n.kind === 'resampling-unavailable')).toBe(true);
      expect(output.savedBytes).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F2 — grayscale and mono', () => {
    it('finds a text layer on a digital document', async () => {
      const report = await service.probeTextLayer(await textDoc(2));
      expect(report.hasTextLayer).toBe(true);
      expect(report.characterCount).toBeGreaterThan(0);
    });

    it('finds no text layer on an image-only document', async () => {
      const report = await service.probeTextLayer(await imageDoc([200, 200], [200, 200]));
      expect(report.hasTextLayer).toBe(false);
      expect(report.characterCount).toBe(0);
    });

    it('picks a threshold that separates the histogram', () => {
      // A clean bimodal histogram: dark ink at 20, light paper at 230.
      const histogram = new Array<number>(256).fill(0);
      histogram[20] = 1000;
      histogram[230] = 4000;

      const threshold = service.otsuThreshold(histogram);
      expect(threshold).toBeGreaterThan(20);
      expect(threshold).toBeLessThan(230);
    });

    it('does not collapse a flat histogram to black', () => {
      const histogram = new Array<number>(256).fill(0);
      histogram[200] = 5000;
      // Everything is one value, so no cut separates anything; the result
      // must not be a threshold that turns the whole page black.
      expect(service.otsuThreshold(histogram)).toBeLessThanOrEqual(200);
    });

    it('returns a safe default for an empty histogram', () => {
      expect(service.otsuThreshold(new Array<number>(256).fill(0))).toBe(128);
    });

    it('builds a grey histogram weighted by luminance', () => {
      // One pure blue pixel: BT.601 luma is 29, not 85.
      const histogram = service.greyHistogram(new Uint8ClampedArray([0, 0, 255, 255]));
      expect(histogram[29]).toBe(1);
    });

    it('converts to grayscale by luminance', () => {
      const data = new Uint8ClampedArray([0, 0, 255, 255]);
      service.applyColourPath(data, 'grayscale', 128);
      expect([data[0], data[1], data[2]]).toEqual([29, 29, 29]);
      expect(data[3]).toBe(255);
    });

    it('converts to mono at the threshold', () => {
      const dark = new Uint8ClampedArray([60, 60, 60, 255]);
      service.applyColourPath(dark, 'mono', 128);
      expect([dark[0], dark[1], dark[2]]).toEqual([0, 0, 0]);

      const light = new Uint8ClampedArray([200, 200, 200, 255]);
      service.applyColourPath(light, 'mono', 128);
      expect([light[0], light[1], light[2]]).toEqual([255, 255, 255]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F3 — identical-image dedupe', () => {
    it('finds ten copies of one logo and keeps one', async () => {
      const source = await repeatedLogoDoc(10);
      expect(await imageObjectCount(source)).toBe(10);

      const doc = await PDFDocument.load(source);
      const plan = service.planDedupe(doc);

      expect(plan.groups).toHaveLength(1);
      expect(plan.duplicateCount).toBe(9);
      expect(plan.groups[0].dropKeys).toHaveLength(9);
      expect(plan.estimatedSavedBytes).toBeGreaterThan(0);
    });

    it('ends with one image object and the same page count', async () => {
      const source = await repeatedLogoDoc(10);
      const output = await service.exportDeduped(source, 'out.pdf');

      expect(await imageObjectCount(await output.blob.arrayBuffer())).toBe(1);
      expect(output.pageCount).toBe(10);
      expect(output.savedBytes).toBeGreaterThan(0);
      expect(output.notices.find(n => n.kind === 'duplicates-collapsed')?.count).toBe(9);
    });

    it('leaves every page still drawing the image', async () => {
      const output = await service.exportDeduped(await repeatedLogoDoc(6), 'out.pdf');
      const inventory = await inventoryService.inventory(await output.blob.arrayBuffer());

      // One object, still placed on all six pages.
      expect(inventory.images).toHaveLength(1);
      expect(inventoryService.pagesFor(inventory, inventory.images[0].key)).toEqual([
        1, 2, 3, 4, 5, 6
      ]);
    });

    it('is a no-op on a document with no duplicates', async () => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < 3; i++) {
        const png = await doc.embedPng(makePng({ width: 50, height: 50, noiseSeed: i + 1 }));
        doc.addPage([A4.width, A4.height]).drawImage(png, {
          x: 40,
          y: 400,
          width: 50,
          height: 50
        });
      }
      const source = toBuffer(await doc.save({ useObjectStreams: false }));

      const output = await service.exportDeduped(source, 'out.pdf');
      expect(output.notices.some(n => n.kind === 'no-duplicates')).toBe(true);
      expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(new Uint8Array(source));
    });

    it('is a no-op on a document with no images at all', async () => {
      const source = await textDoc(2);
      const output = await service.exportDeduped(source, 'out.pdf');
      expect(output.savedBytes).toBe(0);
      expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(new Uint8Array(source));
    });

    it('does not collapse images that merely share bytes at different sizes', async () => {
      const doc = await PDFDocument.load(await repeatedLogoDoc(2));
      // Change one copy's declared width: same bytes, different meaning.
      for (const [, object] of doc.context.enumerateIndirectObjects()) {
        if (
          object instanceof PDFStream &&
          object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() === '/Image'
        ) {
          object.dict.set(PDFName.of('Width'), PDFNumber.of(32));
          break;
        }
      }

      const plan = service.planDedupe(doc);
      expect(plan.groups).toHaveLength(0);
    });

    it('hashes identical streams the same and different streams differently', async () => {
      const doc = await PDFDocument.load(await repeatedLogoDoc(2));
      const streams: PDFStream[] = [];
      for (const [, object] of doc.context.enumerateIndirectObjects()) {
        if (
          object instanceof PDFStream &&
          object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() === '/Image'
        ) {
          streams.push(object);
        }
      }

      expect(streams.length).toBeGreaterThanOrEqual(2);
      expect(service.hashImageStream(streams[0])).toBe(service.hashImageStream(streams[1]));

      const other = await PDFDocument.load(await imageDoc([64, 64], [64, 64], 99));
      let otherStream: PDFStream | undefined;
      for (const [, object] of other.context.enumerateIndirectObjects()) {
        if (
          object instanceof PDFStream &&
          object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() === '/Image'
        ) {
          otherStream = object;
        }
      }
      expect(service.hashImageStream(streams[0])).not.toBe(
        service.hashImageStream(otherStream!)
      );
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportDeduped(await repeatedLogoDoc(4), 'out.pdf', {
          signal: controller.signal
        })
      ).rejects.toThrow(/cancelled/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F6 — structure', () => {
    it('finds the objects the document actually references', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      const reachable = service.reachableRefs(doc);
      expect(reachable.size).toBeGreaterThan(0);
      expect(reachable.size).toBeLessThanOrEqual(
        doc.context.enumerateIndirectObjects().length
      );
    });

    it('drops an object nothing references and keeps the rest', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      const before = doc.context.enumerateIndirectObjects().length;

      // An object registered and referenced by nothing at all.
      doc.context.register(doc.context.obj({ Orphan: true }));
      expect(doc.context.enumerateIndirectObjects().length).toBe(before + 1);

      const dropped = service.dropOrphans(doc);
      expect(dropped).toBeGreaterThanOrEqual(1);
      expect(doc.context.enumerateIndirectObjects().length).toBe(before);
    });

    it('does not drop anything from a clean document', async () => {
      const doc = await PDFDocument.load(await textDoc(3));
      const before = doc.context.enumerateIndirectObjects().length;
      service.dropOrphans(doc);
      expect(doc.context.enumerateIndirectObjects().length).toBe(before);
    });

    it('renders identically after the pass, page for page', async () => {
      const source = await textDoc(4);
      const output = await service.exportStructureOptimized(
        source,
        { ...defaultStructureOptions(), verify: true },
        'out.pdf'
      );

      expect(output.pageCount).toBe(4);
      expect(output.notices.some(n => n.kind === 'verification-failed')).toBe(false);

      const verification = await service.verify(source, await output.blob.arrayBuffer());
      expect(verification.matches).toBe(true);
    });

    it('reports the object count before and after', async () => {
      const doc = await PDFDocument.load(await textDoc(2));
      doc.context.register(doc.context.obj({ Orphan: true }));
      const withOrphan = toBuffer(await doc.save({ useObjectStreams: false }));

      const output = await service.exportStructureOptimized(
        withOrphan,
        { ...defaultStructureOptions(), verify: false },
        'out.pdf'
      );

      expect(output.report.objectsBefore).toBeGreaterThan(output.report.objectsAfter);
      expect(output.report.orphansDropped).toBeGreaterThanOrEqual(1);
      expect(output.notices.some(n => n.kind === 'orphans-dropped')).toBe(true);
    });

    it('strips metadata only when asked', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([A4.width, A4.height]);
      doc.setTitle('Confidential draft');
      doc.setAuthor('Someone');
      const source = toBuffer(await doc.save({ useObjectStreams: false }));

      const kept = await service.exportStructureOptimized(
        source,
        { ...defaultStructureOptions(), stripMetadata: false, verify: false },
        'kept.pdf'
      );
      expect((await PDFDocument.load(await kept.blob.arrayBuffer())).getTitle()).toBe(
        'Confidential draft'
      );

      const stripped = await service.exportStructureOptimized(
        source,
        { ...defaultStructureOptions(), stripMetadata: true, verify: false },
        'stripped.pdf'
      );
      expect(
        (await PDFDocument.load(await stripped.blob.arrayBuffer())).getTitle()
      ).toBeUndefined();
    });

    it('reports the byte saving when the rewrite is smaller', async () => {
      const output = await service.exportStructureOptimized(
        await repeatedLogoDoc(8),
        { ...defaultStructureOptions(), verify: false },
        'out.pdf'
      );
      expect(output.report.bytesBefore).toBeGreaterThan(0);
      expect(output.report.bytesAfter).toBeGreaterThan(0);
    });

    it('says which method the verification used', async () => {
      // jsdom cannot render, so the fallback path is what runs here.
      const source = await textDoc(2);
      const verification = await service.verify(source, source);
      expect(verification.matches).toBe(true);
      expect(verification.method).toBe('structural');
    });

    it('catches a page count that changed', async () => {
      const four = await textDoc(4);
      const two = await textDoc(2);
      const verification = await service.verify(four, two);
      expect(verification.matches).toBe(false);
      expect(verification.detail).toContain('page count');
    });

    it('catches text that went missing', async () => {
      const before = await textDoc(2);

      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.addPage([A4.width, A4.height]).drawText('Vector text page 1', {
        x: 60,
        y: 700,
        size: 14,
        font,
        color: rgb(0, 0, 0)
      });
      // Second page deliberately blank, standing in for a dropped object.
      doc.addPage([A4.width, A4.height]);

      const verification = await service.verify(
        before,
        toBuffer(await doc.save({ useObjectStreams: false }))
      );
      expect(verification.matches).toBe(false);
      expect(verification.differingPages).toContain(2);
    });

    it('stops when its signal aborts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.exportStructureOptimized(
          await textDoc(2),
          defaultStructureOptions(),
          'out.pdf',
          { signal: controller.signal }
        )
      ).rejects.toThrow(/cancelled/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F2 — exportColourPath', () => {
    it('returns untouched with nothing-to-do when path is colour', async () => {
      const source = await textDoc(1);
      const res = await service.exportColourPath(
        source,
        { ...defaultColourPathOptions(), path: 'colour' },
        'out.pdf'
      );
      expect(res.savedBytes).toBe(0);
      expect(res.notices.some(n => n.kind === 'nothing-to-do')).toBe(true);
    });

    it('warns has-text-layer when digital text is present without confirmedScan', async () => {
      const source = await textDoc(2);
      const res = await service.exportColourPath(
        source,
        { ...defaultColourPathOptions(), path: 'grayscale', confirmedScan: false },
        'out.pdf'
      );
      expect(res.notices.some(n => n.kind === 'has-text-layer')).toBe(true);
      expect(res.savedBytes).toBe(0);
    });

    it('reports resampling-unavailable in environments without canvas 2d context', async () => {
      // jsdom has no canvas 2D context
      const source = await imageDoc([100, 100], [72, 72]);
      const res = await service.exportColourPath(
        source,
        { ...defaultColourPathOptions(), path: 'grayscale', confirmedScan: true },
        'out.pdf'
      );
      expect(res.notices.some(n => n.kind === 'resampling-unavailable')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F4 — before/after proof view', () => {
    it('calculates saved bytes and percentages accurately', () => {
      const estimates = [
        { pageNumber: 1, beforeBytes: 1000, afterBytes: 400 },
        { pageNumber: 2, beforeBytes: 2000, afterBytes: 1800 },
        { pageNumber: 3, beforeBytes: 1500, afterBytes: 300 }
      ];

      const summary = service.buildProofSummary(4500, 2500, estimates, true);
      expect(summary.beforeBytes).toBe(4500);
      expect(summary.afterBytes).toBe(2500);
      expect(summary.savedBytes).toBe(2000);
      expect(summary.savedPercent).toBe(44);
      expect(summary.textRasterized).toBe(true);

      // Best page saving percentage: page 3 saved (1500 - 300) / 1500 = 80%
      expect(summary.worstPage?.pageNumber).toBe(3);
      expect(summary.worstPage?.savedPercent).toBe(80);

      // Lowest page saving percentage: page 2 saved (2000 - 1800) / 2000 = 10%
      expect(summary.bestPage?.pageNumber).toBe(2);
      expect(summary.bestPage?.savedPercent).toBe(10);
    });

    it('handles empty page estimates safely', () => {
      const summary = service.buildProofSummary(1000, 800, [], false);
      expect(summary.savedBytes).toBe(200);
      expect(summary.savedPercent).toBe(20);
      expect(summary.worstPage).toBeUndefined();
      expect(summary.bestPage).toBeUndefined();
      expect(summary.textRasterized).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('F5 — fit upload limit chain', () => {
    it('stops immediately when target is already met', async () => {
      const source = await textDoc(1);
      const targetKB = Math.ceil(source.byteLength / 1024) + 10;
      const res = await service.fitUploadLimit(
        source,
        { ...defaultFitLimitOptions(), targetKB },
        'out.pdf'
      );

      expect(res.targetMet).toBe(true);
      expect(res.suggestSplit).toBe(false);
      expect(res.steps.every(s => !s.ran && s.skippedReason === 'target-already-met')).toBe(true);
      expect(res.notices.some(n => n.kind === 'nothing-to-do')).toBe(true);
    });

    it('reports target-unreachable and suggests split when ceiling cannot be reached', async () => {
      const source = await textDoc(2);
      // Impossibly tiny target: 0.1 KB
      const res = await service.fitUploadLimit(
        source,
        { ...defaultFitLimitOptions(), targetKB: 0.1 },
        'out.pdf'
      );

      expect(res.targetMet).toBe(false);
      expect(res.suggestSplit).toBe(true);
      expect(res.notices.some(n => n.kind === 'target-unreachable')).toBe(true);
    });

    it('skips steps not in allowedSteps', async () => {
      const source = await textDoc(2);
      const res = await service.fitUploadLimit(
        source,
        { ...defaultFitLimitOptions(), allowedSteps: ['downsample'], targetKB: 1 },
        'out.pdf'
      );

      const metadataStep = res.steps.find(s => s.kind === 'strip-metadata');
      expect(metadataStep?.ran).toBe(false);
      expect(metadataStep?.skippedReason).toBe('not-allowed');
    });
  });
});

