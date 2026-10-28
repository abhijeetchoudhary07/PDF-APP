import { PDFDocument, PDFFont, StandardFonts, rgb, RGB } from 'pdf-lib';

export interface PageLayoutOptions {
  format?: 'A4' | 'Letter';
  orientation?: 'Portrait' | 'Landscape';
  margin?: number; // points
  fontSize?: number;
  lineHeightRatio?: number;
}

export interface DrawableTextResult {
  text: string;
  dropped: number;
  /** A short sample of the characters that could not be drawn, for the warning. */
  sample: string;
}

export class PdfLayoutHelper {
  /*
   * Punctuation the standard fonts cannot encode but that has an obvious
   * Latin-1 stand-in. Mapping these first keeps an ordinary document — a
   * markdown note with em dashes and curly quotes, JSON copied out of an
   * editor — readable instead of pocked with holes.
   */
  private static readonly PUNCTUATION_FALLBACKS: Record<string, string> = {
    '‘': "'", '’': "'", '‚': ',', '‛': "'",
    '“': '"', '”': '"', '„': '"', '‟': '"',
    '‐': '-', '‑': '-', '‒': '-', '–': '-',
    '—': '-', '―': '-', '−': '-',
    '…': '...', '•': '-', '·': '-', '●': '-',
    '▪': '-', '▫': '-', '○': '-', '‣': '-',
    '→': '->', '←': '<-', '⇒': '=>', '⇐': '<=',
    '✓': 'v', '✔': 'v', '✅': 'v', '✗': 'x',
    '✘': 'x', '❌': 'x', ' ': ' ', ' ': ' ',
    ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
    '₹': 'Rs.', '™': 'TM', '′': "'", '″': '"'
  };

  /**
   * Text the built-in fonts can actually draw.
   *
   * pdf-lib's standard fonts are WinAnsi-encoded and *throw* on a character
   * they cannot encode, so a single Devanagari letter in a note, a JSON value
   * or an email subject would fail the whole conversion rather than print
   * oddly. Typographic punctuation is mapped to its Latin-1 equivalent and
   * anything still outside the codepage is dropped; the caller reports the
   * count so the person is told rather than handed a quietly thinned
   * document.
   */
  static toDrawableText(text: string): DrawableTextResult {
    let out = '';
    let dropped = 0;
    const sampleChars: string[] = [];

    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;

      // Tab and newline are handled by the layout, not the encoder.
      if (char === '\n' || char === '\r' || char === '\t') {
        out += char;
        continue;
      }

      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
        out += char;
        continue;
      }

      const fallback = this.PUNCTUATION_FALLBACKS[char];
      if (fallback !== undefined) {
        out += fallback;
        continue;
      }

      dropped++;
      if (sampleChars.length < 6 && !sampleChars.includes(char)) {
        sampleChars.push(char);
      }
    }

    return { text: out, dropped, sample: sampleChars.join(' ') };
  }

  /**
   * The sentence shown to the person when characters had to be dropped.
   *
   * Named scripts rather than code points: "Devanagari" tells a user what is
   * missing from their document, `U+0926` does not.
   */
  static describeDroppedText(dropped: number, sample: string): string {
    if (dropped <= 0) return '';

    const scripts = new Set<string>();
    for (const char of sample) {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0x0900 && code <= 0x097f) scripts.add('Devanagari (Hindi/Marathi)');
      else if (code >= 0x0980 && code <= 0x09ff) scripts.add('Bengali');
      else if (code >= 0x0a00 && code <= 0x0a7f) scripts.add('Gurmukhi (Punjabi)');
      else if (code >= 0x0a80 && code <= 0x0aff) scripts.add('Gujarati');
      else if (code >= 0x0b80 && code <= 0x0bff) scripts.add('Tamil');
      else if (code >= 0x0c00 && code <= 0x0c7f) scripts.add('Telugu');
      else if (code >= 0x0c80 && code <= 0x0cff) scripts.add('Kannada');
      else if (code >= 0x0d00 && code <= 0x0d7f) scripts.add('Malayalam');
      else if (code >= 0x0590 && code <= 0x05ff) scripts.add('Hebrew');
      else if (code >= 0x0600 && code <= 0x06ff) scripts.add('Arabic');
      else if (code >= 0x4e00 && code <= 0x9fff) scripts.add('CJK');
      else if (code >= 0x1f000) scripts.add('emoji');
    }

    const scriptList = Array.from(scripts);
    const where = scriptList.length > 0 ? ` (${scriptList.join(', ')})` : '';
    return (
      `${dropped} character${dropped === 1 ? '' : 's'}${where} could not be drawn with the ` +
      `built-in PDF fonts and were left out. Text in Latin scripts is unaffected.`
    );
  }

  static getPageDimensions(
    format: 'A4' | 'Letter' = 'A4',
    orientation: 'Portrait' | 'Landscape' = 'Portrait'
  ): { width: number; height: number } {
    let width = format === 'A4' ? 595.28 : 612;
    let height = format === 'A4' ? 841.89 : 792;
    if (orientation === 'Landscape') {
      return { width: height, height: width };
    }
    return { width, height };
  }

  static wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    // Split by existing newlines first
    const rawLines = text.split(/\r?\n/);

    for (const rawLine of rawLines) {
      if (rawLine.trim() === '') {
        lines.push('');
        continue;
      }

      const words = rawLine.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          // If a single word is longer than maxWidth, slice it
          if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
            let part = '';
            for (const char of word) {
              if (font.widthOfTextAtSize(part + char, fontSize) <= maxWidth) {
                part += char;
              } else {
                lines.push(part);
                part = char;
              }
            }
            currentLine = part;
          } else {
            currentLine = word;
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Renders multi-page text document with page numbers and headers.
   */
  static async renderTextDocument(
    pdfDoc: PDFDocument,
    text: string,
    options: PageLayoutOptions = {},
    fontType: StandardFonts = StandardFonts.Helvetica
  ): Promise<DrawableTextResult> {
    const font = await pdfDoc.embedFont(fontType);

    /*
     * Sanitized before it is measured, not just before it is drawn: wrapping
     * has to be computed from the characters that will actually appear, or
     * the lines come out short.
     */
    const safe = this.toDrawableText(text);
    text = safe.text;

    const { width, height } = this.getPageDimensions(options.format, options.orientation);
    const margin = options.margin ?? 40;
    const fontSize = options.fontSize ?? 11;
    const lineHeight = fontSize * (options.lineHeightRatio ?? 1.35);
    const printableWidth = width - margin * 2;
    const printableHeight = height - margin * 2 - 20; // 20pt for footer

    const lines = this.wrapText(text, font, fontSize, printableWidth);
    const linesPerPage = Math.floor(printableHeight / lineHeight);
    const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfDoc.addPage([width, height]);
      const startLine = pageIdx * linesPerPage;
      const endLine = Math.min(startLine + linesPerPage, lines.length);

      let currentY = height - margin - fontSize;

      for (let i = startLine; i < endLine; i++) {
        const line = lines[i];
        if (line) {
          page.drawText(line, {
            x: margin,
            y: currentY,
            size: fontSize,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
        currentY -= lineHeight;
      }

      // Draw footer page number
      const pageNumText = `Page ${pageIdx + 1} of ${totalPages}`;
      const pageNumWidth = font.widthOfTextAtSize(pageNumText, 9);
      page.drawText(pageNumText, {
        x: (width - pageNumWidth) / 2,
        y: margin / 2,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    return safe;
  }

  /**
   * Renders structured tabular data to PDF pages with headers, borders, and zebra striping.
   */
  static async renderTableDocument(
    pdfDoc: PDFDocument,
    headers: string[],
    rows: string[][],
    options: PageLayoutOptions = {},
    title?: string
  ): Promise<DrawableTextResult> {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Every cell, header and the title go through the encoder before they are
    // measured for column fit.
    let dropped = 0;
    const sampleChars: string[] = [];
    const clean = (value: string): string => {
      const result = this.toDrawableText(String(value ?? ''));
      if (result.dropped > 0) {
        dropped += result.dropped;
        for (const ch of result.sample) {
          if (sampleChars.length < 6 && !sampleChars.includes(ch)) sampleChars.push(ch);
        }
      }
      return result.text;
    };

    headers = headers.map(clean);
    rows = rows.map(row => row.map(clean));
    title = title === undefined ? undefined : clean(title);

    const { width, height } = this.getPageDimensions(options.format, options.orientation);
    const margin = options.margin ?? 36;
    const fontSize = options.fontSize ?? 9;
    const rowHeight = 22;
    const printableWidth = width - margin * 2;
    const colCount = Math.max(headers.length, ...rows.map(r => r.length), 1);
    const colWidth = printableWidth / colCount;

    let currentY = height - margin;
    let page = pdfDoc.addPage([width, height]);

    // Draw document title if present
    if (title) {
      page.drawText(title, {
        x: margin,
        y: currentY - 14,
        size: 14,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= 32;
    }

    const drawHeader = (p: typeof page, y: number) => {
      // Header background
      p.drawRectangle({
        x: margin,
        y: y - rowHeight + 4,
        width: printableWidth,
        height: rowHeight,
        color: rgb(0.92, 0.94, 0.98),
      });

      for (let c = 0; c < colCount; c++) {
        const text = headers[c] || `Col ${c + 1}`;
        const truncated = this.truncateToWidth(text, boldFont, fontSize, colWidth - 8);
        p.drawText(truncated, {
          x: margin + c * colWidth + 4,
          y: y - rowHeight + 8,
          size: fontSize,
          font: boldFont,
          color: rgb(0.15, 0.25, 0.45),
        });
      }
      return y - rowHeight;
    };

    currentY = drawHeader(page, currentY);

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      if (currentY - rowHeight < margin + 20) {
        // Add new page
        page = pdfDoc.addPage([width, height]);
        currentY = height - margin;
        currentY = drawHeader(page, currentY);
      }

      const row = rows[rIdx];
      const isEven = rIdx % 2 === 0;

      // Row background
      if (isEven) {
        page.drawRectangle({
          x: margin,
          y: currentY - rowHeight + 4,
          width: printableWidth,
          height: rowHeight,
          color: rgb(0.98, 0.98, 0.99),
        });
      }

      // Row border bottom
      page.drawLine({
        start: { x: margin, y: currentY - rowHeight + 4 },
        end: { x: margin + printableWidth, y: currentY - rowHeight + 4 },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      for (let c = 0; c < colCount; c++) {
        const val = String(row[c] ?? '');
        const truncated = this.truncateToWidth(val, font, fontSize, colWidth - 8);
        page.drawText(truncated, {
          x: margin + c * colWidth + 4,
          y: currentY - rowHeight + 8,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }

      currentY -= rowHeight;
    }

    return { text: '', dropped, sample: sampleChars.join(' ') };
  }

  private static truncateToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
      return text;
    }
    let truncated = text;
    while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated ? `${truncated}...` : '';
  }
}
