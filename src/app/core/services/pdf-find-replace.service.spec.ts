import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfFindReplaceService } from './pdf-find-replace.service';
import {
  asEditorDocument,
  makeFormPdf,
  makeTextPdf
} from '../testing/k-editor-fixtures';
import { PdfEditorDocument } from '../models/pdf-editor.types';

/**
 * K1 — Find & replace.
 *
 * The positions asserted here are the ones the fixture was drawn at: the
 * fixture puts "Alpha" on a baseline 500 points up from the bottom of a
 * 600-point page, so the editor's top-down y for that run's baseline is 100.
 * Checking the number rather than merely "a hit was found" is what catches
 * the coordinate flip that made the first version of this feature paint its
 * replacements at the wrong end of the page.
 */
describe('PdfFindReplaceService (K1)', () => {
  let service: PdfFindReplaceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfFindReplaceService);
  });

  const fixture = async (): Promise<PdfEditorDocument> =>
    asEditorDocument(
      await makeTextPdf([
        {
          width: 420,
          height: 600,
          texts: [
            { text: 'Alpha beta Alpha gamma', x: 50, y: 500, size: 14 },
            { text: 'delta epsilon', x: 50, y: 400, size: 14 }
          ]
        },
        {
          width: 420,
          height: 600,
          texts: [{ text: 'Alpha on the second page', x: 60, y: 300, size: 12 }]
        }
      ])
    );

  describe('hit counts', () => {
    it('finds every occurrence across every page', async () => {
      const matches = await service.findMatches(await fixture(), 'Alpha');

      expect(matches).toHaveLength(3);
      expect(matches.filter(match => match.pageNumber === 1)).toHaveLength(2);
      expect(matches.filter(match => match.pageNumber === 2)).toHaveLength(1);
      expect(matches.every(match => match.source === 'page-text')).toBe(true);
    });

    it('numbers the matches in reading order', async () => {
      const matches = await service.findMatches(await fixture(), 'a');
      const indices = matches.map(match => match.matchIndex);

      expect(indices).toEqual([...indices].sort((a, b) => a - b));
      expect(new Set(indices).size).toBe(matches.length);
    });

    it('honours case sensitivity', async () => {
      const doc = await fixture();

      expect(await service.findMatches(doc, 'alpha')).toHaveLength(3);
      expect(await service.findMatches(doc, 'alpha', { caseSensitive: true })).toHaveLength(0);
      expect(await service.findMatches(doc, 'Alpha', { caseSensitive: true })).toHaveLength(3);
    });

    it('honours whole-word matching', async () => {
      const doc = await asEditorDocument(
        await makeTextPdf([{ texts: [{ text: 'cat catalogue concat cat', x: 40, y: 500 }] }])
      );

      expect(await service.findMatches(doc, 'cat')).toHaveLength(4);
      expect(await service.findMatches(doc, 'cat', { wholeWord: true })).toHaveLength(2);
    });

    it('treats a query with regex characters literally', async () => {
      const doc = await asEditorDocument(
        await makeTextPdf([{ texts: [{ text: 'total (net) 40.00 and 4x00', x: 40, y: 500 }] }])
      );

      expect(await service.findMatches(doc, '(net)')).toHaveLength(1);
      expect(await service.findMatches(doc, '40.00')).toHaveLength(1);
    });

    it('returns nothing for an empty query', async () => {
      expect(await service.findMatches(await fixture(), '   ')).toHaveLength(0);
    });
  });

  describe('positions', () => {
    it('reports the run baseline in the editor top-down space', async () => {
      const matches = await service.findMatches(await fixture(), 'beta');

      expect(matches).toHaveLength(1);
      /* Drawn at a baseline of y=500 on a 600pt page. */
      expect(matches[0].baselineY).toBeCloseTo(100, 1);
      expect(matches[0].fontSize).toBeCloseTo(14, 1);
      expect(matches[0].runBounds.x).toBeCloseTo(50, 1);
      /* The box top sits above the baseline by the font's ascent. */
      expect(matches[0].runBounds.y).toBeLessThan(100);
      expect(matches[0].runBounds.y).toBeGreaterThan(80);
    });

    it('places a hit inside its run rather than at the run start', async () => {
      const matches = await service.findMatches(await fixture(), 'gamma');

      expect(matches).toHaveLength(1);
      expect(matches[0].offset).toBe(17);
      expect(matches[0].bounds.x).toBeGreaterThan(matches[0].runBounds.x + 10);
      expect(matches[0].bounds.width).toBeLessThan(matches[0].runBounds.width);
    });

    it('resolves the matched font family for the redraw', async () => {
      const doc = await asEditorDocument(
        await makeTextPdf([
          {
            texts: [
              { text: 'serif target', x: 40, y: 500, font: 'TimesRoman' },
              { text: 'mono target', x: 40, y: 450, font: 'Courier' }
            ]
          }
        ])
      );

      const matches = await service.findMatches(doc, 'target');
      const families = matches.map(match => match.fontFamily).sort();

      expect(families).toEqual(['Courier', 'TimesRoman']);
    });
  });

  describe('form fields', () => {
    it('finds values inside form fields and names the field', async () => {
      const doc = await asEditorDocument(
        await makeFormPdf([
          { name: 'applicant.city', value: 'Pune district' },
          { name: 'applicant.state', value: 'Maharashtra' }
        ])
      );

      const matches = await service.findMatches(doc, 'Pune');

      expect(matches).toHaveLength(1);
      expect(matches[0].source).toBe('form-field');
      expect(matches[0].fieldName).toBe('applicant.city');
    });

    it('reports the page the field widget actually sits on', async () => {
      const doc = await asEditorDocument(
        await makeFormPdf([{ name: 'notes', value: 'findable' }], 3)
      );

      const matches = await service.findMatches(doc, 'findable');

      expect(matches).toHaveLength(1);
      expect(matches[0].pageNumber).toBe(3);
    });

    it('skips form fields when they are excluded', async () => {
      const doc = await asEditorDocument(
        await makeFormPdf([{ name: 'notes', value: 'findable' }])
      );

      expect(await service.findMatches(doc, 'findable', { includeFormFields: false })).toHaveLength(0);
    });

    it('replaces a form field value and leaves no match behind', async () => {
      const doc = await asEditorDocument(
        await makeFormPdf([{ name: 'applicant.city', value: 'Pune district' }])
      );

      const result = await service.replaceAll(doc, 'Pune', 'Nashik');

      expect(result.matchesFound).toBe(1);
      expect(result.matchesReplaced).toBe(1);
      expect(result.updatedPdfBytes).toBeDefined();

      const rewritten = await PDFDocument.load(result.updatedPdfBytes!, { ignoreEncryption: true });
      expect(rewritten.getForm().getTextField('applicant.city').getText()).toBe('Nashik district');

      doc.arrayBuffer = result.updatedPdfBytes!.buffer.slice(
        result.updatedPdfBytes!.byteOffset,
        result.updatedPdfBytes!.byteOffset + result.updatedPdfBytes!.byteLength
      ) as ArrayBuffer;
      expect(await service.findMatches(doc, 'Pune')).toHaveLength(0);
    });

    it('applies both hits when one field value matches twice', async () => {
      const doc = await asEditorDocument(
        await makeFormPdf([{ name: 'notes', value: 'red car and red bike' }])
      );

      const result = await service.replaceAll(doc, 'red', 'blue');

      expect(result.matchesFound).toBe(2);
      expect(result.matchesReplaced).toBe(2);

      const rewritten = await PDFDocument.load(result.updatedPdfBytes!, { ignoreEncryption: true });
      expect(rewritten.getForm().getTextField('notes').getText()).toBe('blue car and blue bike');
    });
  });

  describe('editor-added text', () => {
    const withOverlay = async (): Promise<PdfEditorDocument> => {
      const doc = await asEditorDocument(await makeTextPdf([{ texts: [] }]));
      doc.pages[0].elements.push({
        id: 'el-1',
        type: 'text',
        pageNumber: 1,
        x: 20,
        y: 30,
        width: 180,
        height: 24,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
        text: 'draft heading',
        fontSize: 16,
        fontFamily: 'Helvetica',
        color: '#000000',
        bold: false,
        italic: false,
        underline: false
      });
      return doc;
    };

    it('finds and replaces text the editor added', async () => {
      const doc = await withOverlay();

      const found = await service.findMatches(doc, 'draft');
      expect(found).toHaveLength(1);
      expect(found[0].source).toBe('editor-element');
      expect(found[0].elementId).toBe('el-1');

      const result = await service.replaceAll(doc, found, 'final');
      expect(result.matchesReplaced).toBe(1);
      expect((doc.pages[0].elements[0] as { text: string }).text).toBe('final heading');
      expect(await service.findMatches(doc, 'draft')).toHaveLength(0);
    });
  });

  describe('page text', () => {
    it('leaves page text alone by default and says how many it skipped', async () => {
      const doc = await fixture();

      const result = await service.replaceAll(doc, 'Alpha', 'Omega');

      expect(result.matchesFound).toBe(3);
      expect(result.matchesReplaced).toBe(0);
      expect(result.unsupportedExistingTextSkipped).toBe(3);
      expect(result.runsRewrittenByWhiteout).toBe(0);
    });

    it('rewrites page text when asked, and leaves no match behind', async () => {
      const doc = await fixture();

      const result = await service.replaceAll(doc, 'Alpha', 'Omega', {
        replaceExistingPageText: true
      });

      expect(result.matchesReplaced).toBe(3);
      expect(result.unsupportedExistingTextSkipped).toBe(0);
      /* Two runs hold the three hits: one run on page 1 holds two of them. */
      expect(result.runsRewrittenByWhiteout).toBe(2);

      doc.arrayBuffer = result.updatedPdfBytes!.buffer.slice(
        result.updatedPdfBytes!.byteOffset,
        result.updatedPdfBytes!.byteOffset + result.updatedPdfBytes!.byteLength
      ) as ArrayBuffer;

      expect(await service.findMatches(doc, 'Alpha')).toHaveLength(0);
      expect(await service.findMatches(doc, 'Omega')).toHaveLength(3);
      /* Gone from the text layer, not merely covered over. */
      expect(result.runsStillInTextLayer).toBe(0);
    });

    it('keeps the rewritten text at the original position and size', async () => {
      const doc = await fixture();
      const before = (await service.findMatches(doc, 'beta'))[0];

      const result = await service.replaceAll(doc, 'beta', 'zeta', {
        replaceExistingPageText: true
      });

      doc.arrayBuffer = result.updatedPdfBytes!.buffer.slice(
        result.updatedPdfBytes!.byteOffset,
        result.updatedPdfBytes!.byteOffset + result.updatedPdfBytes!.byteLength
      ) as ArrayBuffer;

      const after = (await service.findMatches(doc, 'zeta'))[0];

      expect(after.baselineY).toBeCloseTo(before.baselineY!, 0);
      expect(after.fontSize).toBeCloseTo(before.fontSize!, 0);
      expect(after.runBounds.x).toBeCloseTo(before.runBounds.x, 0);
    });

    it('reports characters the standard fonts cannot draw', async () => {
      const doc = await fixture();

      const result = await service.replaceAll(doc, 'Alpha', 'अल्फा', {
        replaceExistingPageText: true
      });

      expect(result.droppedCharacters).toBeGreaterThan(0);
      expect(result.droppedSample.length).toBeGreaterThan(0);
    });

    it('does not count a run as replaced when the replacement changes nothing', async () => {
      const doc = await fixture();

      const result = await service.replaceAll(doc, 'Alpha', 'Alpha', {
        replaceExistingPageText: true
      });

      expect(result.matchesReplaced).toBe(0);
      expect(result.runsRewrittenByWhiteout).toBe(0);
    });
  });

  describe('replaceOne', () => {
    it('replaces a single match and leaves its siblings in place', async () => {
      const doc = await asEditorDocument(
        await makeFormBothFields()
      );

      const matches = await service.findMatches(doc, 'red');
      expect(matches).toHaveLength(2);

      const result = await service.replaceOne(doc, matches[0], 'blue');

      expect(result.matchesReplaced).toBe(1);

      const rewritten = await PDFDocument.load(result.updatedPdfBytes!, { ignoreEncryption: true });
      const values = [
        rewritten.getForm().getTextField('one').getText(),
        rewritten.getForm().getTextField('two').getText()
      ];
      expect(values.filter(value => value?.includes('red'))).toHaveLength(1);
      expect(values.filter(value => value?.includes('blue'))).toHaveLength(1);
    });
  });

  describe('empty results', () => {
    it('returns a zeroed result when nothing matches', async () => {
      const result = await service.replaceAll(await fixture(), 'nosuchword', 'x');

      expect(result).toMatchObject({
        matchesFound: 0,
        matchesReplaced: 0,
        unsupportedExistingTextSkipped: 0,
        runsRewrittenByWhiteout: 0,
        runsStillInTextLayer: 0,
        droppedCharacters: 0
      });
      expect(result.updatedPdfBytes).toBeDefined();
    });
  });
});

async function makeFormBothFields(): Promise<Uint8Array> {
  return makeFormPdf([
    { name: 'one', value: 'red one' },
    { name: 'two', value: 'red two' }
  ]);
}
