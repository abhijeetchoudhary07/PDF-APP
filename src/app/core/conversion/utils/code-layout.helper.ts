import { PDFDocument, PDFFont, StandardFonts, rgb, RGB } from 'pdf-lib';
import { PdfLayoutHelper, PageLayoutOptions } from './pdf-layout.helper';

export interface CodeToken {
  text: string;
  color?: RGB;
  isBold?: boolean;
}

export interface HighlightedLine {
  indent: number;
  tokens: CodeToken[];
  rawText: string;
}

export interface CodeRenderResult {
  /** Characters the standard fonts could not encode and that were left out. */
  droppedCharacters: number;
  /** A short sample of those characters, for the warning text. */
  droppedSample: string;
  /** Rows actually laid out, counting soft-wrapped continuations. */
  renderedRows: number;
}

/** One laid-out row: a source line, or a continuation of one. */
interface DisplayRow {
  indent: number;
  tokens: CodeToken[];
  /** 1-based source line number, or null on a wrapped continuation row. */
  lineNumber: number | null;
}

export class CodeLayoutHelper {
  /**
   * Renders syntax-highlighted code or structured data with monospace font,
   * indentation guides, line numbers, and multi-page pagination.
   *
   * A line wider than the page is wrapped onto continuation rows rather than
   * clipped: a long URL or a base64 blob inside a JSON value is still data,
   * and silently cutting it at the right margin loses it with no sign that
   * anything is missing.
   */
  static async renderHighlightedDocument(
    pdfDoc: PDFDocument,
    lines: HighlightedLine[],
    options: PageLayoutOptions & {
      fontFamily?: 'Courier' | 'Helvetica' | 'TimesRoman';
      indentGuides?: boolean;
      showLineNumbers?: boolean;
    } = {}
  ): Promise<CodeRenderResult> {
    const font = await pdfDoc.embedFont(
      options.fontFamily === 'Helvetica'
        ? StandardFonts.Helvetica
        : options.fontFamily === 'TimesRoman'
        ? StandardFonts.TimesRoman
        : StandardFonts.Courier
    );
    const boldFont = await pdfDoc.embedFont(
      options.fontFamily === 'Helvetica'
        ? StandardFonts.HelveticaBold
        : options.fontFamily === 'TimesRoman'
        ? StandardFonts.TimesRomanBold
        : StandardFonts.CourierBold
    );

    const { width, height } = PdfLayoutHelper.getPageDimensions(options.format, options.orientation);
    const margin = options.margin ?? 40;
    const fontSize = options.fontSize ?? 10;
    const lineHeight = fontSize * (options.lineHeightRatio ?? 1.4);
    const indentGuides = options.indentGuides ?? true;
    const showLineNumbers = options.showLineNumbers ?? true;

    // Line number gutter width
    const gutterWidth = showLineNumbers ? font.widthOfTextAtSize(`${lines.length}  `, fontSize) : 0;
    const contentLeft = margin + gutterWidth;
    const contentRight = width - margin;
    const printableHeight = height - margin * 2 - 25; // 25pt for header/footer

    // Sanitize every token up front: the standard fonts throw on anything
    // outside WinAnsi, which would abort the whole document mid-page.
    let droppedCharacters = 0;
    const droppedSampleChars: string[] = [];
    const safeLines: HighlightedLine[] = lines.map(line => ({
      ...line,
      tokens: line.tokens.map(token => {
        const safe = PdfLayoutHelper.toDrawableText(token.text);
        if (safe.dropped > 0) {
          droppedCharacters += safe.dropped;
          for (const ch of safe.sample) {
            if (droppedSampleChars.length < 6 && !droppedSampleChars.includes(ch)) {
              droppedSampleChars.push(ch);
            }
          }
        }
        return { ...token, text: safe.text };
      })
    }));

    const rows = this.buildDisplayRows(safeLines, font, boldFont, fontSize, contentLeft, contentRight);

    const rowsPerPage = Math.max(1, Math.floor(printableHeight / lineHeight));
    const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

    const guideColor = rgb(0.85, 0.88, 0.92);
    const gutterTextColor = rgb(0.55, 0.6, 0.68);
    const defaultTextColor = rgb(0.12, 0.15, 0.2);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfDoc.addPage([width, height]);
      const startIdx = pageIdx * rowsPerPage;
      const endIdx = Math.min(startIdx + rowsPerPage, rows.length);

      // Draw subtle header line & page footer
      const footerText = `Page ${pageIdx + 1} of ${totalPages}`;
      const footerWidth = font.widthOfTextAtSize(footerText, 9);
      page.drawText(footerText, {
        x: width - margin - footerWidth,
        y: margin - 15,
        size: 9,
        font,
        color: gutterTextColor
      });

      let currentY = height - margin;

      for (let i = startIdx; i < endIdx; i++) {
        const row = rows[i];

        // Draw line number (source rows only; a continuation keeps the gutter
        // blank so the numbering still matches the input file)
        if (showLineNumbers && row.lineNumber !== null) {
          const numStr = String(row.lineNumber);
          const numWidth = font.widthOfTextAtSize(numStr, fontSize - 1);
          page.drawText(numStr, {
            x: contentLeft - numWidth - 8,
            y: currentY,
            size: fontSize - 1,
            font,
            color: gutterTextColor
          });
        }

        // Draw indentation guides
        if (indentGuides && row.indent > 0) {
          const indentStep = font.widthOfTextAtSize('  ', fontSize);
          for (let step = 1; step <= row.indent; step++) {
            const guideX = contentLeft + step * indentStep;
            page.drawLine({
              start: { x: guideX, y: currentY - 2 },
              end: { x: guideX, y: currentY + fontSize },
              thickness: 0.5,
              color: guideColor
            });
          }
        }

        // Render tokens
        let currentX = contentLeft;
        for (const token of row.tokens) {
          if (!token.text) continue;
          const tokenFont = token.isBold ? boldFont : font;
          const tokenColor = token.color || defaultTextColor;

          page.drawText(token.text, {
            x: currentX,
            y: currentY,
            size: fontSize,
            font: tokenFont,
            color: tokenColor
          });
          currentX += tokenFont.widthOfTextAtSize(token.text, fontSize);
        }

        currentY -= lineHeight;
      }
    }

    return {
      droppedCharacters,
      droppedSample: droppedSampleChars.join(' '),
      renderedRows: rows.length
    };
  }

  /**
   * Flattens source lines into rows that each fit between the gutter and the
   * right margin, splitting a token across rows when it is itself too wide.
   */
  private static buildDisplayRows(
    lines: HighlightedLine[],
    font: PDFFont,
    boldFont: PDFFont,
    fontSize: number,
    contentLeft: number,
    contentRight: number
  ): DisplayRow[] {
    const available = Math.max(fontSize, contentRight - contentLeft);
    const rows: DisplayRow[] = [];

    lines.forEach((line, idx) => {
      let currentTokens: CodeToken[] = [];
      let usedWidth = 0;
      let isFirstRow = true;

      const flush = () => {
        rows.push({
          indent: isFirstRow ? line.indent : 0,
          tokens: currentTokens,
          lineNumber: isFirstRow ? idx + 1 : null
        });
        isFirstRow = false;
        currentTokens = [];
        usedWidth = 0;
      };

      for (const token of line.tokens) {
        const tokenFont = token.isBold ? boldFont : font;
        let remaining = token.text;

        while (remaining.length > 0) {
          const remainingWidth = tokenFont.widthOfTextAtSize(remaining, fontSize);

          if (usedWidth + remainingWidth <= available) {
            currentTokens.push({ ...token, text: remaining });
            usedWidth += remainingWidth;
            break;
          }

          // Find how much of this token still fits on the current row.
          const fitChars = this.charsThatFit(remaining, tokenFont, fontSize, available - usedWidth);

          if (fitChars === 0) {
            // Nothing fits here; start a fresh row and try again. An empty
            // current row with nothing fitting would loop forever, so force
            // at least one character onto it.
            if (currentTokens.length === 0 && usedWidth === 0) {
              currentTokens.push({ ...token, text: remaining.slice(0, 1) });
              remaining = remaining.slice(1);
            }
            flush();
            continue;
          }

          currentTokens.push({ ...token, text: remaining.slice(0, fitChars) });
          remaining = remaining.slice(fitChars);
          flush();
        }
      }

      // Always emit the source row, even when the line is blank, so vertical
      // spacing matches the input.
      flush();
    });

    return rows;
  }

  private static charsThatFit(text: string, font: PDFFont, fontSize: number, maxWidth: number): number {
    if (maxWidth <= 0) return 0;

    let low = 0;
    let high = text.length;

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (font.widthOfTextAtSize(text.slice(0, mid), fontSize) <= maxWidth) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
  }
}
