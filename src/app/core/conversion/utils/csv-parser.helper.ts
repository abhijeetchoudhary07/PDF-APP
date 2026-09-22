export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  delimiter: string;
}

export class CsvParserHelper {
  /**
   * Safely parses CSV text into structured headers and rows.
   * Handles quoted values, escaped quotes, newlines inside quotes, and auto-detects delimiter.
   */
  static parse(csvText: string, forcedDelimiter?: string): ParsedCsv {
    if (!csvText || !csvText.trim()) {
      return { headers: [], rows: [], rowCount: 0, columnCount: 0, delimiter: ',' };
    }

    const delimiter = forcedDelimiter || this.detectDelimiter(csvText);
    const rawRows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;
    let i = 0;

    while (i < csvText.length) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote: ""
          currentCell += '"';
          i += 2;
          continue;
        }
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }

      if (!insideQuotes && char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      }

      if (!insideQuotes && (char === '\r' || char === '\n')) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          rawRows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      }

      currentCell += char;
      i++;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rawRows.push(currentRow);
      }
    }

    if (rawRows.length === 0) {
      return { headers: [], rows: [], rowCount: 0, columnCount: 0, delimiter };
    }

    const headers = rawRows[0];
    const rows = rawRows.slice(1);
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));

    // Normalize row lengths
    const normalizedRows = rows.map(r => {
      while (r.length < colCount) r.push('');
      return r;
    });

    return {
      headers,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
      columnCount: colCount,
      delimiter
    };
  }

  private static detectDelimiter(sample: string): string {
    const firstLines = sample.split(/\r?\n/).slice(0, 5).join('\n');
    const commaCount = (firstLines.match(/,/g) || []).length;
    const semicolonCount = (firstLines.match(/;/g) || []).length;
    const tabCount = (firstLines.match(/\t/g) || []).length;
    const pipeCount = (firstLines.match(/\|/g) || []).length;

    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
    if (pipeCount > commaCount) return '|';
    return ',';
  }
}
