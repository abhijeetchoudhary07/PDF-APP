import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString
} from 'pdf-lib';
import {
  NavigationProgress,
  PAGE_LABEL_STYLE_NAMES,
  PageLabelNotice,
  PageLabelOutput,
  PageLabelPreviewRow,
  PageLabelRange,
  PageLabelStyle
} from '../models/pdf-navigation.types';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Logical page labels — E2.
 *
 * A PDF's pages are numbered by position, but what a reader *prints* beside
 * them is a separate structure: /PageLabels, a number tree mapping a 0-indexed
 * page to a rule for labelling it and everything after it. That is how a
 * scanned book shows `i, ii, iii` for its front matter and then restarts at
 * `1` for the body — the thing that is otherwise impossible to express, and
 * the thing people filling in forms keep asking for when the printed page
 * numbers do not match the PDF's.
 *
 * pdf-lib has no API for it, so the tree is built here. The format is small
 * but exact:
 *
 *   /PageLabels << /Nums [ 0 << /S /r >> 4 << /S /D /St 1 /P (A-) >> ] >>
 *
 * The /Nums array alternates key and value and **must be sorted by key**;
 * readers binary-search it. /S is the style, /P an optional prefix and /St the
 * value the run counts from, defaulting to 1. A run with a prefix and no /S
 * prints the prefix alone, which is how a cover sheet is labelled.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfPageLabelService {
  /** Most ranges one document may carry, so a typo cannot hang a phone. */
  readonly MAX_RANGES = 200;

  // ════════════════════════════════════════════════════════════════════
  // Formatting — pure
  // ════════════════════════════════════════════════════════════════════

  /**
   * Roman numerals for 1-3999, which is the whole useful range: a document
   * with four thousand pages of front matter is not a case worth modelling.
   */
  toRoman(value: number, upper: boolean): string {
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1) return '';
    if (n > 3999) return String(n);

    const table: Array<[number, string]> = [
      [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
      [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
      [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
    ];

    let rest = n;
    let out = '';
    for (const [amount, numeral] of table) {
      while (rest >= amount) {
        out += numeral;
        rest -= amount;
      }
    }
    return upper ? out.toUpperCase() : out;
  }

  /**
   * Letter labels: a, b … z, aa, bb … zz, aaa …
   *
   * The repeated form is what the PDF spec specifies, not the spreadsheet-style
   * a, b … z, aa, ab. 27 is `aa`, not `aa` meaning 1x26+1.
   */
  toLetters(value: number, upper: boolean): string {
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1) return '';

    const letterIndex = (n - 1) % 26;
    const repeat = Math.floor((n - 1) / 26) + 1;
    const letter = String.fromCharCode(97 + letterIndex).repeat(repeat);
    return upper ? letter.toUpperCase() : letter;
  }

  /** The numeric part of a label, in one style. */
  formatNumber(value: number, style: PageLabelStyle): string {
    switch (style) {
      case 'decimal':
        return String(Math.max(1, Math.floor(value)));
      case 'roman-lower':
        return this.toRoman(value, false);
      case 'roman-upper':
        return this.toRoman(value, true);
      case 'letters-lower':
        return this.toLetters(value, false);
      case 'letters-upper':
        return this.toLetters(value, true);
      case 'none':
      default:
        return '';
    }
  }

  /**
   * The ranges a document actually uses: sorted, clamped into the page count,
   * de-duplicated by start page, and guaranteed to cover page 1.
   *
   * Everything downstream — the preview, the writer, the duplicate check —
   * goes through this, so none of them can disagree about which range a page
   * falls in.
   */
  normalizeRanges(ranges: PageLabelRange[], pageCount: number): PageLabelRange[] {
    const usable = ranges
      .filter(range => Number.isFinite(range.startPage) && range.startPage >= 1)
      .filter(range => range.startPage <= Math.max(1, pageCount))
      .map(range => ({
        ...range,
        startPage: Math.floor(range.startPage),
        startValue: Math.max(1, Math.floor(range.startValue) || 1),
        prefix: range.prefix ?? ''
      }))
      .sort((a, b) => a.startPage - b.startPage)
      .slice(0, this.MAX_RANGES);

    /* A later range starting on the same page replaces the earlier one. */
    const byStart = new Map<number, PageLabelRange>();
    for (const range of usable) byStart.set(range.startPage, range);

    const out = [...byStart.values()].sort((a, b) => a.startPage - b.startPage);

    /*
     * The format requires an entry for page 0. Without one a reader has no
     * rule for the pages before the first range and falls back to the physical
     * number, which makes the labels look like they were half applied.
     */
    if (out.length === 0 || out[0].startPage !== 1) {
      out.unshift({
        id: 'implicit-first',
        startPage: 1,
        style: 'decimal',
        prefix: '',
        startValue: 1
      });
    }

    return out;
  }

  /** The label one page gets, given the ranges. */
  labelFor(pageNumber: number, ranges: PageLabelRange[], pageCount: number): string {
    const normalized = this.normalizeRanges(ranges, pageCount);

    let active = normalized[0];
    for (const range of normalized) {
      if (range.startPage <= pageNumber) active = range;
      else break;
    }
    if (!active) return String(pageNumber);

    const offset = pageNumber - active.startPage;
    const value = active.startValue + offset;
    return `${active.prefix}${this.formatNumber(value, active.style)}`;
  }

  /** Every page's label, for the preview list. */
  preview(ranges: PageLabelRange[], pageCount: number, limit = 400): PageLabelPreviewRow[] {
    const normalized = this.normalizeRanges(ranges, pageCount);
    const starts = new Set(normalized.map(range => range.startPage));
    const rows: PageLabelPreviewRow[] = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, limit); pageNumber++) {
      rows.push({
        pageNumber,
        label: this.labelFor(pageNumber, normalized, pageCount),
        rangeStart: starts.has(pageNumber) || undefined
      });
    }
    return rows;
  }

  /**
   * Labels that land on more than one page.
   *
   * Worth reporting rather than preventing: two pages labelled `A-1` is
   * usually a mistake in the ranges, but a document that genuinely has an
   * unnumbered insert is allowed to repeat a prefix-only label.
   */
  findDuplicateLabels(ranges: PageLabelRange[], pageCount: number): string[] {
    const seen = new Map<string, number>();
    const normalized = this.normalizeRanges(ranges, pageCount);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const label = this.labelFor(pageNumber, normalized, pageCount);
      if (label.length === 0) continue;
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }

    return [...seen.entries()].filter(([, count]) => count > 1).map(([label]) => label);
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Writes /PageLabels, replacing whatever was there.
   *
   * Keys are 0-indexed page numbers and the array is written in ascending key
   * order, because readers binary-search it rather than scanning.
   */
  writePageLabels(doc: PDFDocument, ranges: PageLabelRange[]): number {
    const context = doc.context;
    const pageCount = doc.getPageCount();

    this.removePageLabels(doc);
    if (pageCount === 0) return 0;

    const normalized = this.normalizeRanges(ranges, pageCount);
    if (normalized.length === 0) return 0;

    const nums: Array<PDFNumber | PDFDict> = [];
    for (const range of normalized) {
      const entry = context.obj({}) as PDFDict;

      const styleName = PAGE_LABEL_STYLE_NAMES[range.style];
      if (styleName) entry.set(PDFName.of('S'), PDFName.of(styleName));

      if (range.prefix.length > 0) {
        // Hex, not a literal string: a prefix may be in any script.
        entry.set(PDFName.of('P'), PDFHexString.fromText(range.prefix));
      }

      // /St defaults to 1, so it is only worth writing when it differs.
      if (range.startValue !== 1) {
        entry.set(PDFName.of('St'), PDFNumber.of(range.startValue));
      }

      nums.push(PDFNumber.of(range.startPage - 1), entry);
    }

    const labels = context.obj({}) as PDFDict;
    labels.set(PDFName.of('Nums'), context.obj(nums));
    doc.catalog.set(PDFName.of('PageLabels'), context.register(labels));

    return normalized.length;
  }

  /** Removes /PageLabels, so pages fall back to their physical numbers. */
  removePageLabels(doc: PDFDocument): boolean {
    const had = doc.catalog.get(PDFName.of('PageLabels')) !== undefined;
    if (had) doc.catalog.delete(PDFName.of('PageLabels'));
    return had;
  }

  /**
   * Reads whatever /PageLabels the document already carries.
   *
   * Done from the dictionaries rather than through pdf.js: pdf.js exposes the
   * resolved label strings, and this screen has to edit the *rules*.
   */
  readPageLabels(doc: PDFDocument): PageLabelRange[] {
    try {
      const labels = doc.catalog.lookupMaybe(PDFName.of('PageLabels'), PDFDict);
      const nums = labels?.lookupMaybe(PDFName.of('Nums'), PDFArray);
      if (!nums) return [];

      const ranges: PageLabelRange[] = [];

      for (let i = 0; i + 1 < nums.size(); i += 2) {
        const key = nums.lookupMaybe(i, PDFNumber);
        const entry = nums.lookupMaybe(i + 1, PDFDict);
        if (!key || !entry) continue;

        const styleName = entry.lookupMaybe(PDFName.of('S'), PDFName)?.asString();
        const style = this.styleFromName(styleName);

        const prefixValue = entry.get(PDFName.of('P'));
        let prefix = '';
        if (prefixValue instanceof PDFString || prefixValue instanceof PDFHexString) {
          try {
            prefix = prefixValue.decodeText();
          } catch {
            prefix = '';
          }
        }

        const start = entry.lookupMaybe(PDFName.of('St'), PDFNumber)?.asNumber();

        ranges.push({
          id: newId(),
          startPage: Math.max(1, Math.floor(key.asNumber()) + 1),
          style,
          prefix,
          startValue: Math.max(1, Math.floor(start ?? 1))
        });
      }

      return ranges.sort((a, b) => a.startPage - b.startPage);
    } catch {
      /*
       * A /PageLabels this cannot parse is reported as "none" rather than
       * throwing: the screen's job is to let someone write correct labels,
       * and refusing to open the file helps nobody.
       */
      return [];
    }
  }

  /** Maps a /S name back onto a style. */
  private styleFromName(name: string | undefined): PageLabelStyle {
    switch (name) {
      case '/D':
        return 'decimal';
      case '/r':
        return 'roman-lower';
      case '/R':
        return 'roman-upper';
      case '/a':
        return 'letters-lower';
      case '/A':
        return 'letters-upper';
      default:
        return 'none';
    }
  }

  /** True when the document already declares page labels. */
  hasPageLabels(doc: PDFDocument): boolean {
    try {
      return doc.catalog.get(PDFName.of('PageLabels')) !== undefined;
    } catch {
      return false;
    }
  }

  /** Writes the ranges onto the document and returns the saved file. */
  async exportWithLabels(
    buffer: ArrayBuffer,
    ranges: PageLabelRange[],
    outputName: string,
    onProgress?: (p: NavigationProgress) => void,
    signal?: AbortSignal
  ): Promise<PageLabelOutput> {
    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    if (signal?.aborted) throw new Error('Page label write cancelled by user.');

    const notices: PageLabelNotice[] = [];
    const pageCount = doc.getPageCount();

    const dropped = ranges.filter(range => range.startPage > pageCount).length;
    if (dropped > 0) notices.push({ kind: 'range-past-end', count: dropped });

    const startPages = ranges.map(range => range.startPage);
    const overlapping = startPages.length - new Set(startPages).size;
    if (overlapping > 0) notices.push({ kind: 'overlapping-ranges', count: overlapping });

    onProgress?.({ phase: 'writing', completed: 0, total: 1, percent: 0 });
    const written = this.writePageLabels(doc, ranges);
    onProgress?.({ phase: 'writing', completed: 1, total: 1, percent: 100 });

    const duplicates = this.findDuplicateLabels(ranges, pageCount);
    if (duplicates.length > 0) {
      notices.push({
        kind: 'duplicate-labels',
        count: duplicates.length,
        detail: duplicates.slice(0, 5).join(', ')
      });
    }

    notices.push(
      written > 0 ? { kind: 'labels-written', count: written } : { kind: 'labels-cleared' }
    );

    const bytes = await doc.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount,
      notices,
      rangeCount: written
    };
  }
}
