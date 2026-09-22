export interface RtfSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
}

export interface RtfParagraph {
  spans: RtfSpan[];
  align?: 'left' | 'center' | 'right';
}

export class RtfParserHelper {
  /**
   * Parses RTF string into structured paragraphs and spans.
   */
  static parse(rtfText: string): RtfParagraph[] {
    const paragraphs: RtfParagraph[] = [];
    let currentParagraph: RtfParagraph = { spans: [], align: 'left' };
    let currentSpan: RtfSpan = { text: '' };

    let bold = false;
    let italic = false;
    let underline = false;
    let fontSize = 11;
    let align: 'left' | 'center' | 'right' = 'left';

    let i = 0;
    const len = rtfText.length;

    // Check header
    if (!rtfText.startsWith('{\\rtf')) {
      // Treat as plain text fallback
      return rtfText.split(/\r?\n/).map(line => ({
        spans: [{ text: line }],
        align: 'left'
      }));
    }

    while (i < len) {
      const char = rtfText[i];

      if (char === '{' || char === '}') {
        // Group start/end
        i++;
        continue;
      }

      if (char === '\\') {
        i++;
        if (i >= len) break;

        const next = rtfText[i];

        // Escaped characters: \\, \{, \}
        if (next === '\\' || next === '{' || next === '}') {
          currentSpan.text += next;
          i++;
          continue;
        }

        // Hex escape: \'hh
        if (next === "'") {
          const hex = rtfText.substr(i + 1, 2);
          const code = parseInt(hex, 16);
          if (!isNaN(code)) {
            currentSpan.text += String.fromCharCode(code);
            i += 3;
            continue;
          }
        }

        // Read control word
        let word = '';
        while (i < len && /[a-zA-Z]/.test(rtfText[i])) {
          word += rtfText[i];
          i++;
        }

        // Read optional numeric parameter
        let param = '';
        if (i < len && (rtfText[i] === '-' || /[0-9]/.test(rtfText[i]))) {
          if (rtfText[i] === '-') {
            param += '-';
            i++;
          }
          while (i < len && /[0-9]/.test(rtfText[i])) {
            param += rtfText[i];
            i++;
          }
        }

        // Skip single delimiter space after control word
        if (i < len && rtfText[i] === ' ') {
          i++;
        }

        // Handle control words
        switch (word) {
          case 'b':
            this.pushSpan(currentParagraph, currentSpan);
            bold = param !== '0';
            currentSpan = { text: '', bold, italic, underline, fontSize };
            break;
          case 'i':
            this.pushSpan(currentParagraph, currentSpan);
            italic = param !== '0';
            currentSpan = { text: '', bold, italic, underline, fontSize };
            break;
          case 'ul':
          case 'ulnone':
            this.pushSpan(currentParagraph, currentSpan);
            underline = word === 'ul';
            currentSpan = { text: '', bold, italic, underline, fontSize };
            break;
          case 'fs':
            this.pushSpan(currentParagraph, currentSpan);
            fontSize = Math.round((parseInt(param, 10) || 24) / 2); // fs is half-points
            currentSpan = { text: '', bold, italic, underline, fontSize };
            break;
          case 'ql':
            align = 'left';
            currentParagraph.align = align;
            break;
          case 'qc':
            align = 'center';
            currentParagraph.align = align;
            break;
          case 'qr':
            align = 'right';
            currentParagraph.align = align;
            break;
          case 'par':
          case 'line':
            this.pushSpan(currentParagraph, currentSpan);
            if (currentParagraph.spans.length > 0 || currentParagraph.spans.some(s => s.text)) {
              paragraphs.push(currentParagraph);
            }
            currentParagraph = { spans: [], align };
            currentSpan = { text: '', bold, italic, underline, fontSize };
            break;
          case 'u':
            // Unicode escape \uN
            const uCode = parseInt(param, 10);
            if (!isNaN(uCode)) {
              currentSpan.text += String.fromCharCode(uCode < 0 ? uCode + 65536 : uCode);
            }
            break;
        }

        continue;
      }

      if (char === '\r' || char === '\n') {
        // Raw newlines in RTF are ignored unless preceded by \par
        i++;
        continue;
      }

      currentSpan.text += char;
      i++;
    }

    this.pushSpan(currentParagraph, currentSpan);
    if (currentParagraph.spans.length > 0) {
      paragraphs.push(currentParagraph);
    }

    return paragraphs;
  }

  private static pushSpan(p: RtfParagraph, s: RtfSpan) {
    if (s.text) {
      p.spans.push({ ...s });
    }
  }

  /**
   * Converts parsed RTF into clean plain text.
   */
  static toPlainText(paragraphs: RtfParagraph[]): string {
    return paragraphs
      .map(p => p.spans.map(s => s.text).join(''))
      .filter(t => t.trim().length > 0)
      .join('\n\n');
  }
}
