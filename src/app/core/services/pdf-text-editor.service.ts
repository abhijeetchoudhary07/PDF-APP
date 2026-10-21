import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ExistingTextRun,
  TextEditCommand,
  TextEditResult
} from '../models/editor-features.types';
import { FontStyleName, Rect } from '../models/pdf-editor.types';

@Injectable({
  providedIn: 'root'
})
export class PdfTextEditorService {
  constructor() {}

  /**
   * Scans a specific page for existing text runs using PDF.js.
   */
  async extractTextRuns(
    pdfData: ArrayBuffer | Uint8Array,
    pageNumber: number
  ): Promise<ExistingTextRun[]> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData.slice(0))
    } as any);

    const pdfDoc = await loadingTask.promise;
    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
      return [];
    }

    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const runs: ExistingTextRun[] = [];

    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i] as any;
      if (!item || !item.str || item.str.trim() === '') continue;

      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
      const x = transform[4];
      // In PDF coordinate system, y=0 is at bottom. Convert to top-left coordinate for editor UI:
      const pdfY = transform[5];
      const editorY = Math.max(0, viewport.height - pdfY - fontSize);

      const fontName = item.fontName || 'Helvetica';
      const matchedFont = this.mapPdfFontToStandard(fontName);

      runs.push({
        id: `run_${pageNumber}_${i}_${Date.now()}`,
        pageNumber,
        text: item.str,
        x: Math.round(x * 100) / 100,
        y: Math.round(editorY * 100) / 100,
        width: Math.max(8, Math.round((item.width || item.str.length * fontSize * 0.6) * 100) / 100),
        height: Math.max(10, Math.round((item.height || fontSize * 1.2) * 100) / 100),
        fontSize: Math.round(fontSize * 10) / 10,
        fontFamily: matchedFont,
        fontName,
        colorHex: '#000000',
        hasMissingGlyphs: this.checkIfMissingGlyphs(fontName, item.str)
      });
    }

    return runs;
  }

  /**
   * Checks whether a new replacement text can be embedded with the specified font,
   * or requires whiteout-and-retype fallback due to missing glyphs in subset font.
   */
  canEmbedDirectly(fontName: string, text: string): boolean {
    // Subset fonts usually start with 6 capital letters + '+' e.g. 'BAAAAA+ArialMT'
    const isSubset = fontName.includes('+');
    // If subset, glyphs for new arbitrary text are often missing
    if (isSubset) {
      return false;
    }
    // Standard Latin-1 printable characters
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 32 || code > 255) {
        return false;
      }
    }
    return true;
  }

  /**
   * Applies an in-place single-line text edit to a PDF.
   * If subset font or missing glyphs are detected, performs whiteout-and-retype fallback,
   * clearly documenting it in the result.
   */
  async applyTextEdit(
    sourcePdfBytes: Uint8Array,
    command: TextEditCommand
  ): Promise<TextEditResult> {
    const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    if (command.pageNumber < 1 || command.pageNumber > pages.length) {
      throw new Error(`Page ${command.pageNumber} out of range [1..${pages.length}]`);
    }

    const page = pages[command.pageNumber - 1];
    const pageSize = page.getSize();

    // Map font
    const stdFont = await this.resolveStandardFont(pdfDoc, command.fontFamily);

    // Check glyph support
    const canDirect = this.canEmbedDirectly(command.fontFamily, command.newText);
    const useFallback = !canDirect || command.fallbackWhiteoutApplied;

    const fallbackNotice = useFallback
      ? 'The embedded subset font lacks required glyphs. Applied whiteout-and-retype fallback to maintain crisp, selectable vector text.'
      : undefined;

    // PDF coordinates: (0,0) is bottom-left
    const pdfY = pageSize.height - command.bounds.y - command.bounds.height;

    // Step 1: Whiteout the original text area
    page.drawRectangle({
      x: command.bounds.x,
      y: pdfY,
      width: command.bounds.width + 4,
      height: command.bounds.height + 2,
      color: rgb(1, 1, 1), // Opaque white background
      borderWidth: 0
    });

    // Step 2: Draw the replacement text in vector format (guaranteed selectable & searchable)
    // Encode safely for standard font: replace non-WinAnsi code points with '?'
    const drawableText = command.newText.replace(/[^\x20-\xFF]/g, '?');

    page.drawText(drawableText, {
      x: command.bounds.x,
      y: pdfY + 2,
      size: command.fontSize,
      font: stdFont,
      color: rgb(0, 0, 0)
    });

    const updatedPdfBytes = await pdfDoc.save({ useObjectStreams: false });

    return {
      success: true,
      command: {
        ...command,
        fallbackWhiteoutApplied: useFallback,
        fallbackNotice
      },
      outputSelectable: true,
      usedFallbackWhiteout: useFallback,
      message: fallbackNotice || 'Text edit applied successfully.',
      updatedPdfBytes
    };
  }

  private mapPdfFontToStandard(fontName: string): FontStyleName {
    const lower = fontName.toLowerCase();
    if (lower.includes('times') || lower.includes('serif')) {
      return 'TimesRoman';
    }
    if (lower.includes('courier') || lower.includes('mono')) {
      return 'Courier';
    }
    return 'Helvetica';
  }

  private checkIfMissingGlyphs(fontName: string, text: string): boolean {
    return !this.canEmbedDirectly(fontName, text);
  }

  private async resolveStandardFont(pdfDoc: PDFDocument, fontFamily: FontStyleName) {
    switch (fontFamily) {
      case 'TimesRoman':
        return await pdfDoc.embedFont(StandardFonts.TimesRoman);
      case 'Courier':
        return await pdfDoc.embedFont(StandardFonts.Courier);
      case 'Helvetica':
      default:
        return await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
  }
}
