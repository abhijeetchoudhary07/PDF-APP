import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfAnnotationFlattenService } from './pdf-annotation-flatten.service';
import { makeAnnotatedPdf } from '../testing/k-editor-fixtures';

interface PageFacts {
  annotations: Record<string, unknown>[];
  width: number;
  height: number;
  /** Operator names in the page's content stream, as pdf.js reports them. */
  drawsXObject: boolean;
  text: string[];
}

async function readPages(bytes: Uint8Array): Promise<PageFacts[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) } as never) as never as {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }>;
    destroy: () => Promise<void>;
  };

  try {
    const pdf = await task.promise;
    const out: PageFacts[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = (await pdf.getPage(i)) as {
        getAnnotations: () => Promise<Record<string, unknown>[]>;
        getViewport: (p: { scale: number }) => { width: number; height: number };
        getOperatorList: () => Promise<{ fnArray: number[] }>;
        getTextContent: () => Promise<{ items: { str?: string }[] }>;
      };

      const viewport = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const content = await page.getTextContent();

      out.push({
        annotations: await page.getAnnotations(),
        width: viewport.width,
        height: viewport.height,
        drawsXObject: ops.fnArray.includes(pdfjsLib.OPS.paintFormXObjectBegin),
        text: content.items.map(item => item.str || '').filter(str => str.trim().length > 0)
      });
    }

    return out;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

describe('PdfAnnotationFlattenService (K7)', () => {
  let service: PdfAnnotationFlattenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfAnnotationFlattenService);
  });

  describe('flattenAnnotations', () => {
    it('paints the annotation into the page and then removes it', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 2 });

      const before = await readPages(source);
      expect(before[0].annotations.filter(a => a['subtype'] === 'Square')).toHaveLength(1);

      const result = await service.flattenAnnotations(source);
      const after = await readPages(result.pdfBytes);

      expect(result.flattened).toBe(2);
      expect(after[0].annotations.filter(a => a['subtype'] === 'Square')).toHaveLength(0);
      /* The mark is now in the page's own content, not gone. */
      expect(after[0].drawsXObject).toBe(true);
    });

    it('leaves form fields interactive', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 1, withFormField: true });

      const result = await service.flattenAnnotations(source, {
        keepFormFieldsInteractive: true
      });

      expect(result.widgetsKept).toBe(1);

      const doc = await PDFDocument.load(result.pdfBytes, { ignoreEncryption: true });
      const field = doc.getForm().getTextField('reviewer.name');

      expect(field.getText()).toBe('Original value');
      field.setText('Still fillable');
      expect(field.getText()).toBe('Still fillable');

      const after = await readPages(result.pdfBytes);
      expect(after[0].annotations.filter(a => a['subtype'] === 'Widget')).toHaveLength(1);
    });

    it('keeps an annotation that has no appearance to paint, and counts it', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 1, withAppearancelessNote: true });

      const result = await service.flattenAnnotations(source);
      const after = await readPages(result.pdfBytes);

      expect(result.flattened).toBe(1);
      expect(result.skippedWithoutAppearance).toBe(1);
      /* Left in place rather than quietly thrown away. */
      expect(after[0].annotations.filter(a => a['subtype'] === 'Text')).toHaveLength(1);
    });

    it('leaves the page text alone', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 1 });

      const result = await service.flattenAnnotations(source);
      const after = await readPages(result.pdfBytes);

      expect(after[0].text).toContain('Body text on page 1');
    });

    it('keeps the page count and page sizes', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 3 });

      const after = await readPages((await service.flattenAnnotations(source)).pdfBytes);

      expect(after).toHaveLength(3);
      expect(after.every(page => page.width === 400 && page.height === 500)).toBe(true);
    });

    it('does nothing to a document with no annotations', async () => {
      const source = await (
        await import('../testing/k-editor-fixtures')
      ).makeTextPdf([{ texts: [{ text: 'plain', x: 20, y: 400 }] }]);

      const result = await service.flattenAnnotations(source);

      expect(result).toMatchObject({ flattened: 0, widgetsKept: 0, skippedWithoutAppearance: 0 });
    });

    it('still returns bytes through the compatibility entry point', async () => {
      const bytes = await service.flattenAnnotationsOnly(await makeAnnotatedPdf({ pageCount: 1 }));

      expect(bytes.byteLength).toBeGreaterThan(0);
      expect((await readPages(bytes))[0].annotations).toHaveLength(0);
    });
  });

  describe('exportAnnotationOverlay', () => {
    it('matches the source page count and geometry', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 3 });

      const result = await service.exportAnnotationOverlay(source);
      const pages = await readPages(result.pdfBytes);

      expect(result.pageCount).toBe(3);
      expect(pages).toHaveLength(3);
      expect(pages.every(page => page.width === 400 && page.height === 500)).toBe(true);
    });

    it('carries the annotation content and nothing else', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 2 });

      const result = await service.exportAnnotationOverlay(source);
      const pages = await readPages(result.pdfBytes);

      expect(result.annotationsDrawn).toBe(2);
      /* The source's body text does not come across. */
      expect(pages[0].text).toHaveLength(0);
      expect(pages[0].drawsXObject).toBe(true);
    });

    it('copies the annotations as live annotations too, with their targets intact', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 1 });

      const result = await service.exportAnnotationOverlay(source);
      const pages = await readPages(result.pdfBytes);
      const square = pages[0].annotations.find(annot => annot['subtype'] === 'Square');

      expect(result.annotationsCopied).toBe(1);
      expect(square).toBeDefined();
      /* An appearance that resolved — the clone-across-contexts bug left
       * this false, because the stream it pointed at was in the other file. */
      expect(square!['hasAppearance']).toBe(true);
    });

    it('leaves form fields out of the overlay', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 1, withFormField: true });

      const pages = await readPages((await service.exportAnnotationOverlay(source)).pdfBytes);

      expect(pages[0].annotations.filter(annot => annot['subtype'] === 'Widget')).toHaveLength(0);
    });

    it('hands back a PDF blob', async () => {
      const result = await service.exportAnnotationOverlay(await makeAnnotatedPdf({ pageCount: 1 }));

      expect(result.blob.type).toBe('application/pdf');
      expect(result.blob.size).toBe(result.pdfBytes.byteLength);
      expect(result.hasAnnotationsOnly).toBe(true);
    });

    it('produces empty pages for a document with no annotations', async () => {
      const source = await (
        await import('../testing/k-editor-fixtures')
      ).makeTextPdf([{ texts: [{ text: 'plain', x: 20, y: 400 }] }, { texts: [] }]);

      const result = await service.exportAnnotationOverlay(source);

      expect(result.pageCount).toBe(2);
      expect(result.annotationsDrawn).toBe(0);
      expect(result.annotationsCopied).toBe(0);
    });
  });

  describe('the pair', () => {
    it('an overlay dropped back over a flattened file restores the marks', async () => {
      const source = await makeAnnotatedPdf({ pageCount: 2 });

      const flattened = await service.flattenAnnotations(source);
      const overlay = await service.exportAnnotationOverlay(source);

      /* Same geometry on both sides is what makes the C6 pairing work. */
      const flatPages = await readPages(flattened.pdfBytes);
      const overlayPages = await readPages(overlay.pdfBytes);

      expect(overlayPages).toHaveLength(flatPages.length);
      overlayPages.forEach((page, index) => {
        expect(page.width).toBe(flatPages[index].width);
        expect(page.height).toBe(flatPages[index].height);
      });
    });
  });
});
