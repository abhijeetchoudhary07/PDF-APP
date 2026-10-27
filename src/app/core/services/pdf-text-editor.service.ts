import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFArray, PDFDict, PDFDocument, PDFFont, PDFName, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ExistingTextRun,
  TextEditCommand,
  TextEditResult
} from '../models/editor-features.types';
import { FontStyleName } from '../models/pdf-editor.types';
import { PdfLayoutHelper } from '../conversion/utils/pdf-layout.helper';
import { readPageContent, writePageContent } from '../utilities/pdf-page-content.util';
import {
  blankShowTextOperand,
  findShowTextOps,
  matchShowTextOp
} from '../utilities/pdf-show-text-locator.util';
import {
  coverRectForRun,
  standardFontForFamily,
  textRunsFromTextContent
} from '../utilities/pdf-text-run.util';

/**
 * K6 — Editing text that is already in the file.
 *
 * SCOPE, STATED PLAINLY, because the UI repeats it and the code has to match:
 *
 *   In scope — one run of text, on one line, replaced at the same position and
 *   the same size. The result stays real text: selectable, searchable,
 *   copyable.
 *
 *   Out of scope — paragraph reflow, multi-column layout, re-spacing
 *   justified text. Editing one word in a justified paragraph leaves the rest
 *   of that line where it was.
 *
 * HOW, equally plainly. Page text is drawn with the font embedded in the
 * file, and that font is nearly always a *subset*: it carries only the glyphs
 * the document already uses. pdf-lib has no way to add a glyph to someone
 * else's subset, so there is no edit-in-place to perform. What happens
 * instead, every time, is cover-and-redraw: the run's area is painted over
 * and the new text is drawn in the standard font matching that run's family —
 * Helvetica, Times or Courier — at the run's own size.
 *
 * `canEmbedDirectly` is therefore not "can we edit in place", which is never
 * true; it is "will the redraw look like the original", which is true when
 * the run was already set in one of the base-14 faces and every character of
 * the new text is encodable. When it is false the result says the font was
 * substituted, and when characters cannot be drawn at all the result names
 * them. Nothing is swapped quietly.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfTextEditorService {
  /**
   * Every editable text run on one page, in the editor's coordinate space.
   *
   * `fontName` is the base font the file declares for that family where one
   * could be matched, so the UI can say whether the redraw will use the same
   * face or a stand-in.
   */
  async extractTextRuns(
    pdfData: ArrayBuffer | Uint8Array,
    pageNumber: number
  ): Promise<ExistingTextRun[]> {
    const bytes =
      pdfData instanceof Uint8Array ? new Uint8Array(pdfData) : new Uint8Array(pdfData.slice(0));

    const baseFonts = await this.pageBaseFonts(bytes, pageNumber);

    const loadingTask = pdfjsLib.getDocument({ data: bytes });

    try {
      const pdf = await loadingTask.promise;
      if (pageNumber < 1 || pageNumber > pdf.numPages) return [];

      const page = await pdf.getPage(pageNumber);
      const pageHeight = page.getViewport({ scale: 1 }).height;
      const runs = textRunsFromTextContent(await page.getTextContent(), pageNumber, pageHeight);

      return runs
        /*
         * A rotated or skewed run is left out. Redrawing it needs the full
         * text matrix, not a position and a size, and offering an edit that
         * lands the replacement flat on an angled label is worse than not
         * offering it.
         */
        .filter(run => run.isAxisAligned)
        .map(run => {
          const fontName = this.matchBaseFont(baseFonts, run.fontFamily);
          return {
            id: run.id,
            pageNumber: run.pageNumber,
            text: run.text,
            x: Math.round(run.x * 100) / 100,
            y: Math.round(run.y * 100) / 100,
            width: Math.round(run.width * 100) / 100,
            height: Math.round(run.height * 100) / 100,
            baselineY: Math.round(run.baselineY * 100) / 100,
            fontSize: Math.round(run.fontSize * 10) / 10,
            fontFamily: run.fontFamily,
            fontName,
            colorHex: '#000000',
            hasMissingGlyphs: !this.canEmbedDirectly(fontName, run.text)
          } satisfies ExistingTextRun;
        });
    } finally {
      try {
        await loadingTask.destroy();
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * Whether redrawing `text` in the standard font will look like the original.
   *
   * False for a subset font, because a subset means the document carries its
   * own cut of some face we cannot reproduce; false when any character falls
   * outside what the standard fonts encode. Either way the caller reports a
   * substitution.
   */
  canEmbedDirectly(fontName: string, text: string): boolean {
    if (fontName.includes('+')) return false;
    if (!this.isBase14(fontName)) return false;
    return PdfLayoutHelper.toDrawableText(text).dropped === 0;
  }

  /**
   * Covers a run and redraws it.
   *
   * The cover is sized from the font's ascent and descent, not from the font
   * size: a box of exactly `fontSize` starting at the cap line leaves the
   * tails of g, y and p showing under the replacement.
   */
  async applyTextEdit(
    sourcePdfBytes: Uint8Array,
    command: TextEditCommand,
    /**
     * What the cover is painted in. White is right for an ordinary document;
     * a tinted or dark page needs the colour sampled off the page behind the
     * run, which is what `PdfImageToolsService.sampleBackgroundColor` is for.
     */
    coverColor = '#FFFFFF'
  ): Promise<TextEditResult> {
    const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    if (command.pageNumber < 1 || command.pageNumber > pages.length) {
      throw new Error(`Page ${command.pageNumber} is outside this document's 1..${pages.length}.`);
    }

    const page = pages[command.pageNumber - 1];
    const pageHeight = page.getSize().height;
    const font = await this.resolveStandardFont(pdfDoc, command.fontFamily);

    const drawable = PdfLayoutHelper.toDrawableText(command.newText);
    const substituted = !this.canEmbedDirectly(
      command.fontFamily,
      command.newText
    );

    /* Top-left space in, PDF space out. This is the only conversion here. */
    const baselineY = command.baselineY ?? command.bounds.y + command.bounds.height;
    const cover = coverRectForRun({
      x: command.bounds.x,
      baselineY,
      width: Math.max(command.bounds.width, font.widthOfTextAtSize(drawable.text, command.fontSize)),
      fontSize: command.fontSize
    });

    /*
     * Silencing comes BEFORE the redraw, and the order is load-bearing twice
     * over. Covering the run hides it from the eye only: until the operator
     * that drew it is emptied, the old words are still in the text layer, and
     * a replacement whose replaced text is still findable has replaced
     * nothing. And the replacement is drawn at the same place and size as the
     * original, so searching for that operator afterwards would find two
     * candidates and refuse to pick between them.
     */
    const originalTextRemoved = this.silenceOriginalRun(
      pdfDoc,
      command.pageNumber - 1,
      command.bounds.x,
      pageHeight - baselineY,
      command.fontSize
    );

    const coverPdfY = pageHeight - cover.y - cover.height;
    const background = this.parseHex(coverColor, { r: 1, g: 1, b: 1 });

    page.drawRectangle({
      x: cover.x,
      y: coverPdfY,
      width: cover.width,
      height: cover.height,
      color: rgb(background.r, background.g, background.b),
      borderWidth: 0
    });

    if (drawable.text.length > 0) {
      const ink = this.parseHex(command.colorHex || '#000000');
      page.drawText(drawable.text, {
        x: command.bounds.x,
        y: pageHeight - baselineY,
        size: command.fontSize,
        font,
        color: rgb(ink.r, ink.g, ink.b)
      });
    }

    const updatedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const notices: string[] = [];

    notices.push(
      `The original run was covered and redrawn in ${this.fontLabel(command.fontFamily)} at ${command.fontSize}pt.`
    );
    if (substituted) {
      notices.push(
        'The font embedded in this file could not be reused, so a matching standard font was substituted — the letter shapes may differ slightly.'
      );
    }
    if (!originalTextRemoved) {
      notices.push(
        'The original wording could not be taken out of the text layer, so a text search or a copy of this page can still reach it. Use Redact to remove content for good.'
      );
    }
    if (drawable.dropped > 0) {
      notices.push(PdfLayoutHelper.describeDroppedText(drawable.dropped, drawable.sample));
    }

    return {
      success: true,
      command: {
        ...command,
        baselineY,
        fallbackWhiteoutApplied: true,
        fallbackNotice:
          substituted || drawable.dropped > 0 || !originalTextRemoved
            ? notices.join(' ')
            : undefined
      },
      outputSelectable: true,
      /*
       * Always true, and said so rather than reported as a condition: there
       * is no in-place glyph edit to fall back *from*. The UI states it.
       */
      usedFallbackWhiteout: true,
      originalTextRemoved,
      droppedCharacters: drawable.dropped,
      droppedSample: drawable.sample,
      message: notices.join(' '),
      updatedPdfBytes
    };
  }

  /**
   * Empties the show-text operator that drew a run, if it can be found.
   *
   * Matching is by position and size, never by the string's bytes: a run set
   * in a subset font is stored under that font's own codes, which cannot be
   * derived from the visible text. Returns false when there is no single safe
   * candidate, and the caller says so rather than assuming it worked.
   */
  private silenceOriginalRun(
    pdfDoc: PDFDocument,
    pageIndex: number,
    x: number,
    baselinePdfY: number,
    fontSize: number
  ): boolean {
    try {
      const page = pdfDoc.getPages()[pageIndex];
      const content = readPageContent(pdfDoc, page);
      if (content.length === 0) return false;

      const op = matchShowTextOp(findShowTextOps(content), { x, baselinePdfY, fontSize });
      if (!op) return false;

      writePageContent(pdfDoc, page, blankShowTextOperand(content, op));
      return true;
    } catch {
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Fonts
  // ════════════════════════════════════════════════════════════════════

  /** The /BaseFont names declared in one page's /Resources /Font dictionary. */
  private async pageBaseFonts(bytes: Uint8Array, pageNumber: number): Promise<string[]> {
    try {
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      if (pageNumber < 1 || pageNumber > pages.length) return [];

      const resources = pages[pageNumber - 1].node.Resources();
      const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
      if (!fonts) return [];

      const names: string[] = [];
      for (const [, value] of fonts.entries()) {
        const dict = pdfDoc.context.lookupMaybe(value, PDFDict);
        const base = dict?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.asString();
        if (base) names.push(base.replace(/^\//, ''));

        /* A Type0 font's real face is on its descendant, not on the wrapper. */
        const descendants = dict?.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        if (descendants && descendants.size() > 0) {
          const child = pdfDoc.context.lookupMaybe(descendants.get(0), PDFDict);
          const childBase = child?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.asString();
          if (childBase) names.push(childBase.replace(/^\//, ''));
        }
      }

      return names;
    } catch {
      return [];
    }
  }

  /**
   * The page font that belongs to the same family pdf.js resolved this run to.
   *
   * pdf.js reports the family it chose (`serif`, `sans-serif`, `monospace`),
   * never the file's own name for the font, so this is a family-level match.
   * When no page font lands in that family the standard font's own name is
   * returned, which is the truthful answer: that is what will be drawn.
   */
  private matchBaseFont(baseFonts: string[], family: FontStyleName): string {
    for (const name of baseFonts) {
      if (standardFontForFamily(this.familyHintFor(name)) === family) return name;
    }
    return family;
  }

  /** Turns a /BaseFont name into something `standardFontForFamily` can read. */
  private familyHintFor(baseFont: string): string {
    const lower = baseFont.toLowerCase();
    if (lower.includes('courier') || lower.includes('mono')) return 'monospace';
    if (
      lower.includes('times') ||
      lower.includes('georgia') ||
      lower.includes('garamond') ||
      lower.includes('book') ||
      (lower.includes('serif') && !lower.includes('sans'))
    ) {
      return 'serif';
    }
    return 'sans-serif';
  }

  private isBase14(fontName: string): boolean {
    const bare = fontName.replace(/^\//, '').replace(/^[A-Z]{6}\+/, '').toLowerCase();
    return [
      'helvetica',
      'helvetica-bold',
      'helvetica-oblique',
      'helvetica-boldoblique',
      'courier',
      'courier-bold',
      'courier-oblique',
      'courier-boldoblique',
      'times-roman',
      'times-bold',
      'times-italic',
      'times-bolditalic',
      'symbol',
      'zapfdingbats',
      /* The three names this app's own FontStyleName uses. */
      'timesroman'
    ].includes(bare);
  }

  private fontLabel(family: FontStyleName): string {
    switch (family) {
      case 'TimesRoman':
        return 'Times Roman';
      case 'Courier':
        return 'Courier';
      default:
        return 'Helvetica';
    }
  }

  private async resolveStandardFont(
    pdfDoc: PDFDocument,
    fontFamily: FontStyleName
  ): Promise<PDFFont> {
    switch (fontFamily) {
      case 'TimesRoman':
        return pdfDoc.embedFont(StandardFonts.TimesRoman);
      case 'Courier':
        return pdfDoc.embedFont(StandardFonts.Courier);
      default:
        return pdfDoc.embedFont(StandardFonts.Helvetica);
    }
  }

  /**
   * `#rrggbb` to pdf-lib's 0..1 channels.
   *
   * `fallback` matters: a malformed cover colour that defaulted to black
   * would paint a black bar across the page, which is the one outcome worse
   * than not covering at all.
   */
  private parseHex(
    hex: string,
    fallback: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
  ): { r: number; g: number; b: number } {
    const match = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!match) return fallback;
    const value = parseInt(match[1], 16);
    return {
      r: ((value >> 16) & 0xff) / 255,
      g: ((value >> 8) & 0xff) / 255,
      b: (value & 0xff) / 255
    };
  }
}
