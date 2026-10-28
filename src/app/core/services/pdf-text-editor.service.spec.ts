import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfTextEditorService } from './pdf-text-editor.service';
import { makeTextPdf } from '../testing/k-editor-fixtures';
import { TextEditCommand } from '../models/editor-features.types';

/** The text pdf.js can still read off a page, run by run. */
async function pageText(bytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) } as never) as never as {
    promise: Promise<{ getPage: (n: number) => Promise<unknown> }>;
    destroy: () => Promise<void>;
  };
  try {
    const pdf = await task.promise;
    const page = (await pdf.getPage(pageNumber)) as {
      getTextContent: () => Promise<{ items: { str?: string }[] }>;
    };
    const content = await page.getTextContent();
    return content.items.map(item => item.str || '').filter(str => str.trim().length > 0);
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

describe('PdfTextEditorService (K6)', () => {
  let service: PdfTextEditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfTextEditorService);
  });

  const onePage = () =>
    makeTextPdf([
      {
        width: 420,
        height: 600,
        texts: [
          { text: 'Invoice total', x: 50, y: 500, size: 18 },
          { text: 'Serif subtitle', x: 50, y: 450, size: 12, font: 'TimesRoman' },
          { text: 'MONO CODE 42', x: 50, y: 400, size: 10, font: 'Courier' }
        ]
      }
    ]);

  describe('extractTextRuns', () => {
    it('reports every run with its position, size and family', async () => {
      const runs = await service.extractTextRuns(await onePage(), 1);

      expect(runs).toHaveLength(3);

      const invoice = runs.find(run => run.text === 'Invoice total')!;
      expect(invoice.x).toBeCloseTo(50, 1);
      expect(invoice.fontSize).toBeCloseTo(18, 1);
      /* Baseline drawn 500 up a 600pt page is 100 down from the top. */
      expect(invoice.baselineY).toBeCloseTo(100, 1);
      expect(invoice.fontFamily).toBe('Helvetica');

      expect(runs.find(run => run.text === 'Serif subtitle')!.fontFamily).toBe('TimesRoman');
      expect(runs.find(run => run.text === 'MONO CODE 42')!.fontFamily).toBe('Courier');
    });

    it('puts the run box above its baseline, not below it', async () => {
      const runs = await service.extractTextRuns(await onePage(), 1);
      const run = runs.find(candidate => candidate.text === 'Invoice total')!;

      expect(run.y).toBeLessThan(run.baselineY);
      expect(run.y + run.height).toBeGreaterThan(run.baselineY);
    });

    it('returns nothing for a page number outside the document', async () => {
      expect(await service.extractTextRuns(await onePage(), 9)).toHaveLength(0);
      expect(await service.extractTextRuns(await onePage(), 0)).toHaveLength(0);
    });
  });

  describe('canEmbedDirectly', () => {
    it('accepts a base-14 font with encodable text', () => {
      expect(service.canEmbedDirectly('Helvetica', 'Plain ASCII')).toBe(true);
      expect(service.canEmbedDirectly('Times-Roman', 'Café façade')).toBe(true);
    });

    it('rejects a subset font', () => {
      expect(service.canEmbedDirectly('BAAAAA+ArialMT', 'Plain ASCII')).toBe(false);
    });

    it('rejects a non-base-14 embedded font', () => {
      expect(service.canEmbedDirectly('Lato-Regular', 'Plain ASCII')).toBe(false);
    });

    it('rejects text the standard fonts cannot encode', () => {
      expect(service.canEmbedDirectly('Helvetica', 'नमस्ते')).toBe(false);
      expect(service.canEmbedDirectly('Helvetica', 'বাংলা')).toBe(false);
    });
  });

  describe('applyTextEdit', () => {
    const commandFor = (
      run: { id: string; x: number; y: number; width: number; height: number; baselineY: number; fontSize: number; fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier' },
      newText: string
    ): TextEditCommand => ({
      runId: run.id,
      pageNumber: 1,
      originalText: 'Invoice total',
      newText,
      bounds: { x: run.x, y: run.y, width: run.width, height: run.height },
      baselineY: run.baselineY,
      fontSize: run.fontSize,
      fontFamily: run.fontFamily,
      fallbackWhiteoutApplied: false
    });

    it('preserves font, size and position for a single-word edit', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1)).find(
        candidate => candidate.text === 'Invoice total'
      )!;

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Invoice settled'));
      expect(result.success).toBe(true);

      const after = (await service.extractTextRuns(result.updatedPdfBytes!, 1)).find(
        candidate => candidate.text === 'Invoice settled'
      );

      expect(after).toBeDefined();
      expect(after!.x).toBeCloseTo(run.x, 0);
      expect(after!.baselineY).toBeCloseTo(run.baselineY, 0);
      expect(after!.fontSize).toBeCloseTo(run.fontSize, 0);
      expect(after!.fontFamily).toBe(run.fontFamily);
    });

    it('leaves the output selectable and searchable', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Replaced wording'));
      const extracted = await pageText(result.updatedPdfBytes!);

      expect(extracted).toContain('Replaced wording');
    });

    it('takes the original wording out of the text layer', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1)).find(
        candidate => candidate.text === 'Invoice total'
      )!;

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Invoice settled'));

      expect(result.originalTextRemoved).toBe(true);
      expect(await pageText(result.updatedPdfBytes!)).not.toContain('Invoice total');
    });

    it('leaves the document\'s other runs untouched', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1)).find(
        candidate => candidate.text === 'Invoice total'
      )!;

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Invoice settled'));
      const extracted = await pageText(result.updatedPdfBytes!);

      expect(extracted).toContain('Serif subtitle');
      expect(extracted).toContain('MONO CODE 42');
    });

    it('always reports the cover-and-redraw, because that is what it does', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Plain edit'));

      expect(result.usedFallbackWhiteout).toBe(true);
      expect(result.message).toMatch(/covered and redrawn/i);
      expect(result.droppedCharacters).toBe(0);
    });

    it('names the characters it could not draw instead of substituting quietly', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];

      const result = await service.applyTextEdit(bytes, commandFor(run, 'कुल राशि'));

      expect(result.droppedCharacters).toBeGreaterThan(0);
      expect(result.droppedSample.length).toBeGreaterThan(0);
      expect(result.message).toMatch(/Devanagari/i);
      expect(result.command.fallbackNotice).toBeTruthy();
    });

    it('maps smart punctuation rather than dropping it', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];

      const result = await service.applyTextEdit(bytes, commandFor(run, '“Total” — paid…'));

      expect(result.droppedCharacters).toBe(0);
      expect(await pageText(result.updatedPdfBytes!)).toContain('"Total" - paid...');
    });

    it('rejects a page number outside the document', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];
      const command = { ...commandFor(run, 'x'), pageNumber: 12 };

      await expect(service.applyTextEdit(bytes, command)).rejects.toThrow(/outside this document/i);
    });

    it('covers with a sampled colour when one is supplied', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1))[0];

      const result = await service.applyTextEdit(bytes, commandFor(run, 'Tinted'), '#FFF8E1');

      expect(result.success).toBe(true);
      expect(await pageText(result.updatedPdfBytes!)).toContain('Tinted');
    });

    it('deletes a run when the replacement is empty', async () => {
      const bytes = await onePage();
      const run = (await service.extractTextRuns(bytes, 1)).find(
        candidate => candidate.text === 'Invoice total'
      )!;

      const result = await service.applyTextEdit(bytes, commandFor(run, ''));
      const extracted = await pageText(result.updatedPdfBytes!);

      expect(extracted).not.toContain('Invoice total');
      expect(extracted).toContain('Serif subtitle');
    });
  });
});
