import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { OcrService } from '../../services/ocr.service';
import { OcrWord } from '../../models/ocr.models';
import { ImagesToExcelOptions, ConversionReport } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class ImagesToExcelConverter implements IConverter {
  readonly id = 'images-to-excel';
  readonly metadata: ConverterMetadata = {
    id: 'images-to-excel',
    name: 'Images to Excel Converter',
    shortTitle: 'Images to Excel',
    description: 'Detect and extract tabular data and text from photos and scans via OCR into an Excel (.xlsx) spreadsheet.',
    sourceFormats: ['.jpg', '.jpeg', '.png', '.webp', '.bmp'],
    targetFormat: 'xlsx',
    category: 'format-to-pdf',
    icon: 'grid',
    badge: 'Table OCR',
    acceptMimeTypes: 'image/jpeg,image/png,image/webp,image/bmp',
    limitations: [
      'Columns are found from where the words actually sit on the page, so a printed table keeps its grid even without ruling lines or delimiters.',
      'Complex merged header cells and hand-drawn borders are normalized into standard grid cells.'
    ],
    disclaimer: '100% private, on-device OCR. Your spreadsheet data is generated locally without cloud uploads.'
  };

  private ocrService = inject(OcrService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') ||
      ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].some(ext => name.endsWith(ext));
    if (!isImage) {
      return { valid: false, error: 'Selected file is not a supported image.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: ImagesToExcelOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const report: ConversionReport = {
      approximations: [],
      droppedElements: [],
      substitutedFonts: [],
      tablesDetected: 0,
      pagesRasterized: 0,
      indicOrRtlWarnings: []
    };
    const warnings: string[] = [];

    try {
      onProgress?.({ percent: 15, stage: 'Running local OCR engine on image...' });

      const language = options.ocrLanguage || 'eng';
      const ocrDoc = await this.ocrService.performOcr(
        file,
        language,
        undefined,
        (event: any) => {
          onProgress?.({
            percent: 20 + Math.floor(event.progress * 60),
            stage: event.message || 'Extracting tabular data from image...'
          });
        }
      );

      onProgress?.({ percent: 85, stage: 'Analyzing table rows and columns...' });

      const rawText = ocrDoc.fullText || '';
      const words = (ocrDoc.pages || []).flatMap(page => page.words || []);
      const useGeometry = options.autoDetectColumns !== false && words.length > 1;

      let tableRows: string[][] = [];
      let detectionMethod = 'delimiters';

      if (useGeometry) {
        const detected = this.rowsFromWordGeometry(words);
        if (detected.length > 0) {
          tableRows = detected;
          detectionMethod = 'word positions';
        }
      }

      if (tableRows.length === 0) {
        tableRows = this.rowsFromDelimiters(rawText);
      }

      if (tableRows.length === 0) {
        tableRows = [['Recognized Content'], [rawText.trim() || 'No text detected']];
        report.approximations.push('No table structure found; wrapped the text into a single column');
      } else {
        report.tablesDetected = 1;
        report.approximations.push(`Columns detected from ${detectionMethod}`);
      }

      if (ocrDoc.averageConfidence > 0 && ocrDoc.averageConfidence < 70) {
        warnings.push(
          `OCR confidence was ${Math.round(ocrDoc.averageConfidence)}%. Check the values against the image.`
        );
        report.approximations.push(
          `Low OCR confidence (${Math.round(ocrDoc.averageConfidence)}%) on this image`
        );
      }

      // Normalize row widths so every row has the same number of cells.
      const maxCols = Math.max(...tableRows.map(r => r.length), 1);
      const normalizedRows = tableRows.map(row => {
        const padded = [...row];
        while (padded.length < maxCols) padded.push('');
        return padded;
      });

      onProgress?.({ percent: 92, stage: 'Compiling .xlsx workbook...' });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(normalizedRows);
      // Column widths from the content, so the sheet opens readable.
      ws['!cols'] = Array.from({ length: maxCols }, (_, col) => ({
        wch: Math.min(
          60,
          Math.max(10, ...normalizedRows.map(row => (row[col] || '').length + 2))
        )
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'Extracted Data');

      const outBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const outName = file.name.replace(/\.[^/.]+$/, '') + '.xlsx';
      const outFile = new File([outBuffer], outName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      onProgress?.({ percent: 100, stage: 'Excel spreadsheet generated successfully' });

      const headers = normalizedRows.length > 0 ? normalizedRows[0] : ['Column 1'];
      const dataRows = normalizedRows.length > 1 ? normalizedRows.slice(1, 10) : [];

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        previewData: {
          headers,
          rows: dataRows,
          columns: headers.length
        },
        warnings: warnings.length ? warnings : undefined,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Image to Excel conversion failed: ${err.message || err}`,
        report
      };
    }
  }

  /**
   * Rows and columns from where the OCR engine found each word.
   *
   * Splitting the recognized text on commas and double spaces only works for
   * a table that happens to print its separators. A photographed table is
   * aligned in space, not punctuation: the columns are the vertical gaps that
   * no word crosses, so that is what this looks for.
   */
  private rowsFromWordGeometry(words: OcrWord[]): string[][] {
    const usable = words.filter(
      w => w.text && w.text.trim().length > 0 && w.bbox && w.bbox.x1 > w.bbox.x0
    );
    if (usable.length < 2) return [];

    const heights = usable.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] || 10;

    // Group into lines by the vertical centre of each word.
    const sorted = [...usable].sort(
      (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2
    );
    const lines: OcrWord[][] = [];
    let currentLine: OcrWord[] = [];
    let currentCentre = -Infinity;

    for (const word of sorted) {
      const centre = (word.bbox.y0 + word.bbox.y1) / 2;
      if (currentLine.length === 0 || Math.abs(centre - currentCentre) <= medianHeight * 0.6) {
        currentLine.push(word);
        currentCentre = currentLine.reduce((sum, w) => sum + (w.bbox.y0 + w.bbox.y1) / 2, 0) / currentLine.length;
      } else {
        lines.push(currentLine);
        currentLine = [word];
        currentCentre = centre;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    if (lines.length < 2) return [];

    // Find the vertical gutters: x ranges no word occupies on any line.
    const minX = Math.min(...usable.map(w => w.bbox.x0));
    const maxX = Math.max(...usable.map(w => w.bbox.x1));
    const span = maxX - minX;
    if (span <= 0) return [];

    const bucketWidth = Math.max(1, Math.round(medianHeight / 4));
    const bucketCount = Math.ceil(span / bucketWidth) + 1;
    const occupied = new Uint8Array(bucketCount);

    for (const word of usable) {
      const from = Math.floor((word.bbox.x0 - minX) / bucketWidth);
      const to = Math.ceil((word.bbox.x1 - minX) / bucketWidth);
      for (let b = Math.max(0, from); b < Math.min(bucketCount, to); b++) occupied[b] = 1;
    }

    // A gutter has to be wider than an ordinary word space to count.
    const minGutterBuckets = Math.max(2, Math.ceil((medianHeight * 0.9) / bucketWidth));
    const boundaries: number[] = [];
    let runStart = -1;

    for (let b = 0; b <= bucketCount; b++) {
      const isFree = b < bucketCount && occupied[b] === 0;
      if (isFree && runStart < 0) {
        runStart = b;
      } else if (!isFree && runStart >= 0) {
        const runLength = b - runStart;
        // Ignore the margins: only interior gaps separate columns.
        if (runLength >= minGutterBuckets && runStart > 0 && b < bucketCount) {
          boundaries.push(minX + ((runStart + b) / 2) * bucketWidth);
        }
        runStart = -1;
      }
    }

    if (boundaries.length === 0) return [];

    const columnOf = (word: OcrWord): number => {
      const centre = (word.bbox.x0 + word.bbox.x1) / 2;
      let column = 0;
      for (const boundary of boundaries) {
        if (centre > boundary) column++;
      }
      return column;
    };

    const rows: string[][] = [];
    for (const line of lines) {
      const cells: string[][] = Array.from({ length: boundaries.length + 1 }, () => []);
      for (const word of [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
        cells[columnOf(word)].push(word.text.trim());
      }
      const row = cells.map(cell => cell.join(' ').trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
    }

    return rows;
  }

  /** The original delimiter heuristic, for text with no usable geometry. */
  private rowsFromDelimiters(rawText: string): string[][] {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rows: string[][] = [];

    for (const line of lines) {
      let cols: string[];
      if (line.includes('\t')) {
        cols = line.split('\t').map(c => c.trim());
      } else if (line.includes('|')) {
        cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      } else if (line.includes(',') && line.split(',').length >= 2) {
        cols = line.split(',').map(c => c.trim());
      } else {
        cols = line.split(/\s{2,}/).map(c => c.trim());
      }
      if (cols.length > 0) rows.push(cols);
    }

    return rows;
  }
}
