import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import {
  FindMatch,
  FindReplaceOptions,
  FindReplaceResult
} from '../models/editor-features.types';
import { PdfEditorDocument } from '../models/pdf-editor.types';
import {
  buildSearchRegex,
  matchOffsets,
  substringBounds,
  textRunsFromTextContent
} from '../utilities/pdf-text-run.util';
import { PdfTextEditorService } from './pdf-text-editor.service';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

/**
 * K1 — Find & replace across a PDF.
 *
 * Three different kinds of text live in a PDF and only two of them can be
 * edited cheaply, which is the whole shape of this service:
 *
 *   • **Form field values** are strings in an object. Replacing one is a
 *     string assignment.
 *   • **Editor-added text** is the app's own overlay model, not in the file
 *     yet. Replacing one is a property assignment.
 *   • **Page text** is glyph-drawing operators inside a content stream, drawn
 *     with a font that is usually an embedded subset. pdf-lib cannot add a
 *     glyph to someone else's subset font, so there is no in-place edit to
 *     make. The only honest option on-device is K6's route: cover the run and
 *     redraw it in a matched standard font.
 *
 * So page text is opt-in (`replaceExistingPageText`), and when it is off the
 * result says how many hits were left alone rather than counting them as
 * replaced. The modal shows that number.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfFindReplaceService {
  private textEditor = inject(PdfTextEditorService);

  /**
   * Every hit in the document: page text, form field values and the editor's
   * own text overlays.
   */
  async findMatches(
    doc: PdfEditorDocument,
    query: string,
    options: FindReplaceOptions = {}
  ): Promise<FindMatch[]> {
    if (!doc || !query || !query.trim()) return [];

    const { includeFormFields = true } = options;
    const regex = buildSearchRegex(query, options);
    const matches: FindMatch[] = [];

    matches.push(...(await this.findInPageText(doc, regex)));
    if (includeFormFields) {
      matches.push(...(await this.findInFormFields(doc, regex)));
    }
    matches.push(...this.findInEditorElements(doc, regex));

    /* Page order, then position down the page: the order someone reading the
     * document would meet them, which is the order the match list shows. */
    matches.sort((a, b) =>
      a.pageNumber !== b.pageNumber
        ? a.pageNumber - b.pageNumber
        : a.bounds.y !== b.bounds.y
          ? a.bounds.y - b.bounds.y
          : a.bounds.x - b.bounds.x
    );

    return matches.map((match, index) => ({ ...match, matchIndex: index }));
  }

  /**
   * `findMatches` under the name the modal first called it by.
   *
   * It takes the document either way round — bytes plus a model, or just the
   * model — because the search needs both halves: the file for its page text
   * and form fields, the model for the editor's own overlays.
   */
  async findAcrossDocument(
    source: ArrayBuffer | Uint8Array | PdfEditorDocument,
    query: string,
    options: FindReplaceOptions = {},
    editorDoc?: PdfEditorDocument
  ): Promise<FindMatch[]> {
    return this.findMatches(this.asEditorDocument(source, editorDoc), query, options);
  }

  private asEditorDocument(
    source: ArrayBuffer | Uint8Array | PdfEditorDocument,
    editorDoc?: PdfEditorDocument
  ): PdfEditorDocument {
    if (typeof source === 'object' && source !== null && 'pages' in source && 'arrayBuffer' in source) {
      return source as PdfEditorDocument;
    }
    if (editorDoc) return editorDoc;

    const arrayBuffer =
      source instanceof Uint8Array
        ? (source.buffer.slice(
            source.byteOffset,
            source.byteOffset + source.byteLength
          ) as ArrayBuffer)
        : (source as ArrayBuffer);

    return {
      id: 'doc',
      name: 'document.pdf',
      sizeBytes: arrayBuffer.byteLength,
      pageCount: 1,
      arrayBuffer,
      pages: []
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Finding
  // ════════════════════════════════════════════════════════════════════

  private async findInPageText(doc: PdfEditorDocument, regex: RegExp): Promise<FindMatch[]> {
    const matches: FindMatch[] = [];
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(doc.arrayBuffer.slice(0))
    });

    try {
      const pdf = await loadingTask.promise;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const pageHeight = page.getViewport({ scale: 1 }).height;
        const textContent = await page.getTextContent();
        const runs = textRunsFromTextContent(textContent, pageNumber, pageHeight);

        for (const run of runs) {
          for (const hit of matchOffsets(regex, run.text)) {
            matches.push({
              id: generateId(),
              pageNumber,
              matchIndex: 0,
              text: run.text,
              matchedText: hit.matched,
              offset: hit.offset,
              bounds: substringBounds(run, hit.offset, hit.matched.length),
              runBounds: {
                x: run.x,
                y: run.y,
                width: run.width,
                height: run.height
              },
              source: 'page-text',
              baselineY: run.baselineY,
              fontSize: run.fontSize,
              fontFamily: run.fontFamily
            });
          }
        }
      }
    } catch (error) {
      console.warn('Page-text search failed', error);
    } finally {
      /*
       * destroy() lives on the loading task, not on the document proxy. The
       * worker and its copy of the file stay alive without this, and a search
       * is run repeatedly as someone types.
       */
      try {
        await loadingTask.destroy();
      } catch {
        /* already gone */
      }
    }

    return matches;
  }

  /**
   * Hits inside AcroForm text field values.
   *
   * The page number comes from walking each page's /Annots for the widget
   * that carries this field, rather than reporting page 1 for everything: a
   * "jump to match" that always lands on the first page is not a jump.
   */
  private async findInFormFields(doc: PdfEditorDocument, regex: RegExp): Promise<FindMatch[]> {
    const matches: FindMatch[] = [];

    try {
      const pdfDoc = await PDFDocument.load(doc.arrayBuffer.slice(0), { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const widgetPages = this.widgetPageIndex(pdfDoc);

      for (const field of form.getFields()) {
        const name = field.getName();
        const value = this.textValueOf(field);
        if (!value) continue;

        for (const hit of matchOffsets(regex, value)) {
          matches.push({
            id: generateId(),
            pageNumber: widgetPages.get(name) ?? 1,
            matchIndex: 0,
            text: value,
            matchedText: hit.matched,
            offset: hit.offset,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            runBounds: { x: 0, y: 0, width: 0, height: 0 },
            source: 'form-field',
            fieldName: name
          });
        }
      }
    } catch {
      /* No AcroForm, or an encrypted form dictionary. Not an error here. */
    }

    return matches;
  }

  private findInEditorElements(doc: PdfEditorDocument, regex: RegExp): FindMatch[] {
    const matches: FindMatch[] = [];

    for (const page of doc.pages || []) {
      for (const element of page.elements || []) {
        if (element.type !== 'text') continue;
        const text = (element as { text?: string }).text;
        if (!text) continue;

        for (const hit of matchOffsets(regex, text)) {
          matches.push({
            id: generateId(),
            pageNumber: page.pageNumber,
            matchIndex: 0,
            text,
            matchedText: hit.matched,
            offset: hit.offset,
            bounds: {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height
            },
            runBounds: {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height
            },
            source: 'editor-element',
            elementId: element.id
          });
        }
      }
    }

    return matches;
  }

  /** Maps each field's fully-qualified name to the page its widget sits on. */
  private widgetPageIndex(pdfDoc: PDFDocument): Map<string, number> {
    const index = new Map<string, number>();
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
      const annots = pages[i].node.lookup(PDFName.of('Annots'));
      if (!(annots instanceof PDFArray)) continue;

      for (let j = 0; j < annots.size(); j++) {
        const dict = pdfDoc.context.lookup(annots.get(j));
        if (!(dict instanceof PDFDict)) continue;

        const name = this.qualifiedFieldName(pdfDoc, dict);
        if (name && !index.has(name)) index.set(name, i + 1);
      }
    }

    return index;
  }

  /**
   * A field's fully-qualified name: its /T joined to its parents' by dots,
   * which is the form the pdf-lib field API reports.
   */
  private qualifiedFieldName(pdfDoc: PDFDocument, widget: PDFDict): string | null {
    const parts: string[] = [];
    let node: PDFDict | undefined = widget;
    let depth = 0;

    while (node && depth < 16) {
      const title = node.get(PDFName.of('T'));
      if (title instanceof PDFString || title instanceof PDFHexString) {
        parts.unshift(title.decodeText());
      }

      const parent: PDFDict | undefined = pdfDoc.context.lookupMaybe(
        node.get(PDFName.of('Parent')),
        PDFDict
      );
      node = parent;
      depth++;
    }

    return parts.length > 0 ? parts.join('.') : null;
  }

  private textValueOf(field: unknown): string {
    try {
      const candidate = field as { getText?: () => string | undefined };
      if (typeof candidate.getText === 'function') return candidate.getText() || '';
    } catch {
      /* A non-text field, or a value pdf-lib declines to decode. */
    }
    return '';
  }

  // ════════════════════════════════════════════════════════════════════
  // Replacing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Replaces matches and returns the rewritten file.
   *
   * The caller is expected to put `updatedPdfBytes` back into the editor
   * document — form field edits and page-text rewrites live in the file, not
   * in the overlay model, so dropping the bytes drops the replacement.
   */
  async replaceAll(
    doc: PdfEditorDocument,
    matchesOrQuery: FindMatch[] | string,
    replacementText: string,
    options: FindReplaceOptions = {}
  ): Promise<FindReplaceResult> {
    const matches =
      typeof matchesOrQuery === 'string'
        ? await this.findMatches(doc, matchesOrQuery, options)
        : matchesOrQuery || [];

    const empty: FindReplaceResult = {
      matchesFound: matches.length,
      matchesReplaced: 0,
      unsupportedExistingTextSkipped: 0,
      runsRewrittenByWhiteout: 0,
      runsStillInTextLayer: 0,
      droppedCharacters: 0,
      droppedSample: '',
      replacedMatches: [],
      updatedPdfBytes: new Uint8Array(doc.arrayBuffer.slice(0))
    };

    if (matches.length === 0) return empty;

    /* Annotated, not inferred: `new Uint8Array(buffer)` narrows to
     * Uint8Array<ArrayBuffer>, while what pdf-lib's save() hands back is
     * Uint8Array<ArrayBufferLike>, and the two do not assign. */
    let bytes: Uint8Array = new Uint8Array(doc.arrayBuffer.slice(0));
    const replaced: FindMatch[] = [];

    /* 1 — Form fields. */
    const formMatches = matches.filter(match => match.source === 'form-field');
    if (formMatches.length > 0) {
      const outcome = await this.replaceInFormFields(bytes, formMatches, replacementText, options);
      bytes = outcome.bytes;
      replaced.push(...outcome.replaced);
    }

    /* 2 — The editor's own text overlays. */
    const elementMatches = matches.filter(match => match.source === 'editor-element');
    replaced.push(...this.replaceInEditorElements(doc, elementMatches, replacementText, options));

    /* 3 — Page text, only when asked for. */
    const pageMatches = matches.filter(match => match.source === 'page-text');
    let runsRewritten = 0;
    let runsStillInTextLayer = 0;
    let droppedCharacters = 0;
    let droppedSample = '';
    let skipped = 0;

    if (pageMatches.length > 0 && options.replaceExistingPageText) {
      const outcome = await this.rewritePageText(bytes, pageMatches, replacementText, options);
      bytes = outcome.bytes;
      runsRewritten = outcome.runsRewritten;
      runsStillInTextLayer = outcome.runsStillInTextLayer;
      droppedCharacters = outcome.droppedCharacters;
      droppedSample = outcome.droppedSample;
      replaced.push(...outcome.replaced);
    } else {
      skipped = pageMatches.length;
    }

    return {
      matchesFound: matches.length,
      matchesReplaced: replaced.length,
      unsupportedExistingTextSkipped: skipped,
      runsRewrittenByWhiteout: runsRewritten,
      runsStillInTextLayer,
      droppedCharacters,
      droppedSample,
      replacedMatches: replaced,
      updatedPdfBytes: bytes
    };
  }

  /** One match, same rules and same reporting as `replaceAll`. */
  async replaceOne(
    doc: PdfEditorDocument,
    match: FindMatch,
    replacementText: string,
    options: FindReplaceOptions = {}
  ): Promise<FindReplaceResult> {
    return this.replaceAll(doc, [match], replacementText, options);
  }

  private async replaceInFormFields(
    bytes: Uint8Array,
    matches: FindMatch[],
    replacementText: string,
    options: FindReplaceOptions
  ): Promise<{ bytes: Uint8Array; replaced: FindMatch[] }> {
    const replaced: FindMatch[] = [];

    try {
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();

      /*
       * Grouped by field: two hits in one value have to be applied to the
       * value once, or the second assignment overwrites the first and only
       * one of them lands.
       */
      const byField = new Map<string, FindMatch[]>();
      for (const match of matches) {
        if (!match.fieldName) continue;
        const list = byField.get(match.fieldName) || [];
        list.push(match);
        byField.set(match.fieldName, list);
      }

      let changed = false;

      for (const [fieldName, fieldMatches] of byField) {
        try {
          const field = form.getTextField(fieldName);
          const current = field.getText() || '';
          const regex = buildSearchRegex(fieldMatches[0].matchedText, {
            caseSensitive: options.caseSensitive,
            wholeWord: options.wholeWord
          });
          const next = current.replace(regex, replacementText);
          if (next === current) continue;

          field.setText(next);
          changed = true;
          replaced.push(...fieldMatches);
        } catch {
          /* Not a text field, or read-only. Left out of the replaced count. */
        }
      }

      if (changed) {
        return { bytes: new Uint8Array(await pdfDoc.save({ useObjectStreams: false })), replaced };
      }
    } catch (error) {
      console.warn('Form field replacement failed', error);
    }

    return { bytes, replaced };
  }

  private replaceInEditorElements(
    doc: PdfEditorDocument,
    matches: FindMatch[],
    replacementText: string,
    options: FindReplaceOptions
  ): FindMatch[] {
    const replaced: FindMatch[] = [];
    const byElement = new Map<string, FindMatch[]>();

    for (const match of matches) {
      if (!match.elementId) continue;
      const list = byElement.get(match.elementId) || [];
      list.push(match);
      byElement.set(match.elementId, list);
    }

    for (const [elementId, elementMatches] of byElement) {
      for (const page of doc.pages || []) {
        const element = (page.elements || []).find(candidate => candidate.id === elementId);
        if (!element || element.type !== 'text') continue;

        const textElement = element as { text: string };
        const regex = buildSearchRegex(elementMatches[0].matchedText, {
          caseSensitive: options.caseSensitive,
          wholeWord: options.wholeWord
        });
        const next = textElement.text.replace(regex, replacementText);
        if (next === textElement.text) continue;

        textElement.text = next;
        replaced.push(...elementMatches);
      }
    }

    return replaced;
  }

  /**
   * Page text, through K6's cover-and-redraw.
   *
   * The *whole run* is covered and redrawn, not just the matched word. An
   * estimate of where one word sits inside a run is good enough to scroll to
   * but not to paint over: a cover that is a few points short leaves the old
   * letters showing at the edge. Redrawing the run entire has no such edge.
   */
  private async rewritePageText(
    bytes: Uint8Array,
    matches: FindMatch[],
    replacementText: string,
    options: FindReplaceOptions
  ): Promise<{
    bytes: Uint8Array;
    replaced: FindMatch[];
    runsRewritten: number;
    runsStillInTextLayer: number;
    droppedCharacters: number;
    droppedSample: string;
  }> {
    const replaced: FindMatch[] = [];
    const samples = new Set<string>();
    let droppedCharacters = 0;
    let runsRewritten = 0;
    let runsStillInTextLayer = 0;
    let current = bytes;

    /* One rewrite per run, carrying every hit inside that run. */
    const byRun = new Map<string, FindMatch[]>();
    for (const match of matches) {
      const key = `${match.pageNumber}:${Math.round(match.runBounds.x)}:${Math.round(match.runBounds.y)}:${match.text}`;
      const list = byRun.get(key) || [];
      list.push(match);
      byRun.set(key, list);
    }

    for (const runMatches of byRun.values()) {
      const first = runMatches[0];
      const regex = buildSearchRegex(first.matchedText, {
        caseSensitive: options.caseSensitive,
        wholeWord: options.wholeWord
      });
      const newRunText = first.text.replace(regex, replacementText);
      if (newRunText === first.text) continue;

      const outcome = await this.textEditor.applyTextEdit(current, {
        runId: first.id,
        pageNumber: first.pageNumber,
        originalText: first.text,
        newText: newRunText,
        bounds: first.runBounds,
        baselineY: first.baselineY,
        fontSize: first.fontSize || first.runBounds.height,
        fontFamily: first.fontFamily || 'Helvetica',
        fallbackWhiteoutApplied: true
      });

      if (!outcome.success || !outcome.updatedPdfBytes) continue;

      current = outcome.updatedPdfBytes;
      runsRewritten++;
      if (!outcome.originalTextRemoved) runsStillInTextLayer++;
      droppedCharacters += outcome.droppedCharacters;
      if (outcome.droppedSample) samples.add(outcome.droppedSample);
      replaced.push(...runMatches);
    }

    return {
      bytes: current,
      replaced,
      runsRewritten,
      runsStillInTextLayer,
      droppedCharacters,
      droppedSample: [...samples].join(' ')
    };
  }
}
