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

export class CodeLayoutHelper {
  /**
   * Renders syntax-highlighted code or structured data with monospace font,
   * indentation guides, line numbers, and multi-page pagination.
   */
  static async renderHighlightedDocument(
    pdfDoc: PDFDocument,
    lines: HighlightedLine[],
    options: PageLayoutOptions & {
      fontFamily?: 'Courier' | 'Helvetica' | 'TimesRoman';
      indentGuides?: boolean;
      showLineNumbers?: boolean;
    } = {}
  ): Promise<void> {
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
    const printableWidth = width - contentLeft - margin;
    const printableHeight = height - margin * 2 - 25; // 25pt for header/footer

    const linesPerPage = Math.max(1, Math.floor(printableHeight / lineHeight));
    const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

    const guideColor = rgb(0.85, 0.88, 0.92);
    const gutterTextColor = rgb(0.55, 0.6, 0.68);
    const defaultTextColor = rgb(0.12, 0.15, 0.2);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfDoc.addPage([width, height]);
      const startIdx = pageIdx * linesPerPage;
      const endIdx = Math.min(startIdx + linesPerPage, lines.length);

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
        const item = lines[i];
        const lineNum = i + 1;

        // Draw line number
        if (showLineNumbers) {
          const numStr = String(lineNum);
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
        if (indentGuides && item.indent > 0) {
          const indentStep = font.widthOfTextAtSize('  ', fontSize);
          for (let step = 1; step <= item.indent; step++) {
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
        for (const token of item.tokens) {
          const tokenFont = token.isBold ? boldFont : font;
          const tokenColor = token.color || defaultTextColor;

          // Check width and wrap if needed
          const tWidth = tokenFont.widthOfTextAtSize(token.text, fontSize);
          if (currentX + tWidth <= width - margin) {
            page.drawText(token.text, {
              x: currentX,
              y: currentY,
              size: fontSize,
              font: tokenFont,
              color: tokenColor
            });
            currentX += tWidth;
          } else {
            // Token overflows page width: truncate or clip nicely
            const maxChars = Math.max(1, Math.floor((width - margin - currentX) / (fontSize * 0.6)));
            const clipped = token.text.slice(0, maxChars);
            if (clipped) {
              page.drawText(clipped, {
                x: currentX,
                y: currentY,
                size: fontSize,
                font: tokenFont,
                color: tokenColor
              });
            }
            break;
          }
        }

        currentY -= lineHeight;
      }
    }
  }
}
