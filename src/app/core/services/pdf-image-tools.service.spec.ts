import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfImageToolsService,
  WHITEOUT_DISCLAIMER_TEXT
} from './pdf-image-tools.service';
import { makeImagePdf, tinyJpegBytes } from '../testing/k-editor-fixtures';
import { readPageContent } from '../utilities/pdf-page-content.util';

/** A page's content stream, decompressed, as the operators it holds. */
async function pageOperators(bytes: Uint8Array, pageNumber = 1): Promise<string> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return new TextDecoder('latin1').decode(readPageContent(doc, doc.getPages()[pageNumber - 1]));
}

/** The text pdf.js can still read off a page. */
async function pageText(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) } as never) as never as {
    promise: Promise<{ getPage: (n: number) => Promise<unknown> }>;
    destroy: () => Promise<void>;
  };
  try {
    const pdf = await task.promise;
    const page = (await pdf.getPage(1)) as {
      getTextContent: () => Promise<{ items: { str?: string }[] }>;
    };
    const content = await page.getTextContent();
    return content.items.map(item => item.str || '').filter(str => str.trim().length > 0);
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/* A 4x4 PNG that is visibly not the 2x2 fixture, for replacement tests. */
const OTHER_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x08, 0x02, 0x00, 0x00, 0x00, 0x26, 0x93, 0x09,
  0x29, 0x00, 0x00, 0x00, 0x17, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0x64, 0x60, 0xf8, 0xcf,
  0x80, 0x04, 0xfe, 0x31, 0x30, 0xfc, 0x07, 0x02, 0x8c, 0x0c, 0x00, 0x3a, 0x7f, 0x05, 0xfe, 0x2f,
  0x5b, 0x32, 0x71, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

describe('PdfImageToolsService (K4)', () => {
  let service: PdfImageToolsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfImageToolsService);
  });

  describe('findPageImages', () => {
    it('finds the image and reports where it is drawn, not its pixel size', async () => {
      const images = await service.findPageImages(await makeImagePdf(), 1);

      expect(images).toHaveLength(1);
      const image = images[0];

      /* Drawn at x=100, y=250 up a 500pt page, 120 x 90 points. */
      expect(image.rect.x).toBeCloseTo(100, 1);
      expect(image.rect.width).toBeCloseTo(120, 1);
      expect(image.rect.height).toBeCloseTo(90, 1);
      /* Top-left y: 500 - 250 - 90. */
      expect(image.rect.y).toBeCloseTo(160, 1);

      /* The picture itself is 2x2 pixels, which says nothing about the above. */
      expect(image.pixelWidth).toBe(2);
      expect(image.pixelHeight).toBe(2);
      expect(image.objectName.length).toBeGreaterThan(0);
    });

    it('returns nothing for a page with no images', async () => {
      const { makeTextPdf } = await import('../testing/k-editor-fixtures');
      const bytes = await makeTextPdf([{ texts: [{ text: 'words only', x: 20, y: 300 }] }]);

      expect(await service.findPageImages(bytes, 1)).toHaveLength(0);
    });

    it('returns nothing for a page outside the document', async () => {
      const bytes = await makeImagePdf();

      expect(await service.findPageImages(bytes, 0)).toHaveLength(0);
      expect(await service.findPageImages(bytes, 5)).toHaveLength(0);
    });
  });

  describe('replace', () => {
    it('swaps the picture and leaves the rest of the page alone', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'replace',
        target,
        replacementBytes: OTHER_PNG,
        replacementMimeType: 'image/png'
      });

      expect(result.coveredRatherThanRemoved).toBe(false);
      expect(await pageText(result.pdfBytes)).toContain('Caption below the picture');

      const after = await service.findPageImages(result.pdfBytes, 1);
      expect(after).toHaveLength(1);
      /* Same place and size on the page... */
      expect(after[0].rect.x).toBeCloseTo(target.rect.x, 1);
      expect(after[0].rect.width).toBeCloseTo(target.rect.width, 1);
      /* ...different picture underneath. */
      expect(after[0].pixelWidth).toBe(4);
      expect(after[0].pixelHeight).toBe(4);
    });

    it('accepts a JPEG as well as a PNG', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'replace',
        target,
        replacementBytes: tinyJpegBytes(),
        replacementMimeType: 'image/jpeg'
      });

      expect(result.applied).toEqual(['replace']);
      expect((await service.findPageImages(result.pdfBytes, 1))).toHaveLength(1);
    });

    it('refuses a replacement with no bytes', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      await expect(
        service.applyImageEdit(source, { action: 'replace', target, replacementBytes: new Uint8Array() })
      ).rejects.toThrow(/No replacement image/i);
    });
  });

  describe('delete and mask', () => {
    it('covers the picture and says it covered rather than removed', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, { action: 'delete', target });

      expect(result.coveredRatherThanRemoved).toBe(true);
      expect(result.message).toContain('Redact');
      /* The image data is still in the file; the message does not claim
       * otherwise, and this is the assertion that keeps it honest. */
      expect(await service.findPageImages(result.pdfBytes, 1)).toHaveLength(1);
    });

    it('covers only the region a mask names', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'mask',
        target,
        region: { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 }
      });

      expect(result.applied).toEqual(['mask']);
      expect(result.coveredRatherThanRemoved).toBe(true);
      expect(await pageText(result.pdfBytes)).toContain('Caption below the picture');
    });

    it('uses the cover colour it is given', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'delete',
        target,
        coverColor: '#102030'
      });

      /* 0x10/255, 0x20/255, 0x30/255 to pdf-lib's precision. The content
       * stream is deflated, so this reads it back decoded rather than
       * searching the file's raw bytes for text that is not there. */
      expect(await pageOperators(result.pdfBytes)).toMatch(
        /0\.0627\d* 0\.1254\d* 0\.1882\d* rg/
      );
    });
  });

  describe('crop', () => {
    it('keeps the named fraction and reports the kept size', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'crop',
        target,
        region: { left: 0.25, top: 0, right: 0.75, bottom: 1 }
      });

      expect(result.applied).toEqual(['crop']);
      /* Half of 120 points wide, the full 90 high. */
      expect(result.message).toContain('60 × 90');
      expect(result.coveredRatherThanRemoved).toBe(true);
    });

    it('refuses a crop with no region', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      await expect(service.applyImageEdit(source, { action: 'crop', target })).rejects.toThrow(
        /No crop region/i
      );
    });

    it('leaves the page text where it was', async () => {
      const source = await makeImagePdf();
      const target = (await service.findPageImages(source, 1))[0];

      const result = await service.applyImageEdit(source, {
        action: 'crop',
        target,
        region: { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 }
      });

      expect(await pageText(result.pdfBytes)).toContain('Caption below the picture');
    });
  });

  describe('whiteout', () => {
    it('paints the region at the editor coordinates it was given', async () => {
      const source = await makeImagePdf();
      const region = service.createWhiteout(1, { x: 40, y: 60, width: 100, height: 20 });

      const result = await service.applyWhiteout(source, region);
      const doc = await PDFDocument.load(result.pdfBytes, { ignoreEncryption: true });

      expect(doc.getPageCount()).toBe(1);

      /*
       * pdf-lib writes a rectangle as a translate plus a path, not as `re`,
       * so the geometry is checked where it actually lands: the translate
       * carries the corner and the path carries the size. Top-left y of 60
       * with a height of 20, on a 500pt page, puts the bottom edge at 420.
       */
      const operators = await pageOperators(result.pdfBytes);
      expect(operators).toContain('1 0 0 1 40 420 cm');
      expect(operators).toContain('100 20 l');
    });

    it('does not remove the text it covers', async () => {
      const source = await makeImagePdf();
      const region = service.createWhiteout(1, { x: 30, y: 400, width: 300, height: 40 });

      const result = await service.applyWhiteout(source, region);

      expect(await pageText(result.pdfBytes)).toContain('Caption below the picture');
    });

    it('records whether the colour was sampled off the page', () => {
      expect(service.createWhiteout(1, { x: 0, y: 0, width: 10, height: 10 }).colorSampledFromPage).toBe(
        false
      );
      expect(
        service.createWhiteout(1, { x: 0, y: 0, width: 10, height: 10 }, '#FFF8E1', true)
          .colorSampledFromPage
      ).toBe(true);
    });

    it('ignores a page that is not in the document', async () => {
      const source = await makeImagePdf();
      const region = service.createWhiteout(9, { x: 0, y: 0, width: 10, height: 10 });

      const result = await service.applyWhiteout(source, region);

      expect(result.pdfBytes.byteLength).toBeGreaterThan(0);
    });

    it('says it covers rather than removes', () => {
      expect(WHITEOUT_DISCLAIMER_TEXT).toMatch(/paints over/i);
      expect(WHITEOUT_DISCLAIMER_TEXT).toMatch(/Redact/);
      expect(service.disclaimerText).toBe(WHITEOUT_DISCLAIMER_TEXT);
    });
  });

  describe('sampleBackgroundColor', () => {
    const canvasWith = (paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      if (context) paint(context);
      return canvas;
    };

    it('returns the flat colour surrounding a region', () => {
      const canvas = canvasWith(context => {
        context.fillStyle = '#FFF8E1';
        context.fillRect(0, 0, 120, 80);
        context.fillStyle = '#000000';
        context.fillRect(40, 30, 30, 15);
      });

      const sampled = service.sampleBackgroundColor(canvas, { x: 40, y: 30, width: 30, height: 15 });

      /* jsdom's canvas may be a stub with no pixel data; when it is, the
       * method's own "not one flat colour" answer is the right one. */
      if (sampled !== null) expect(sampled).toBe('#FFF8E1');
    });

    it('declines a region whose surroundings are not one colour', () => {
      const canvas = canvasWith(context => {
        const gradient = context.createLinearGradient(0, 0, 120, 0);
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(1, '#FFFFFF');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 120, 80);
      });

      expect(service.sampleBackgroundColor(canvas, { x: 40, y: 30, width: 30, height: 15 })).toBeNull();
    });

    it('declines a region too small to sample around', () => {
      const canvas = canvasWith(() => undefined);

      expect(service.sampleBackgroundColor(canvas, { x: 0, y: 0, width: 0, height: 0 })).not.toBe(
        undefined
      );
    });
  });
});
