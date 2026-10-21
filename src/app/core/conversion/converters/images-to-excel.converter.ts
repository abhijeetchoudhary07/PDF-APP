import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { OcrService } from '../../services/ocr.service';
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
      'Extracts structured rows and columns based on detected tabular alignments and delimiters.',
      'Complex merged header cells and hand-drawn borders may be normalized into standard grid cells.'
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

    try {
      onProgress?.({ percent: 15, stage: 'Running local OCR engine on image...' });

      const ocrDoc = await this.ocrService.performOcr(
        file,
        (options.ocrLanguage || 'eng') as any,
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
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      const tableRows: string[][] = [];

      for (const line of lines) {
        let cols: string[];
        if (line.includes('\t')) {
          cols = line.split('\t').map(c => c.trim());
        } else if (line.includes('|')) {
          cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        } else if (line.includes(',') && line.split(',').length >= 2) {
          cols = line.split(',').map(c => c.trim());
        } else {
          // Multiple whitespace separation
          cols = line.split(/\s{2,}/).map(c => c.trim());
        }
        if (cols.length > 0) {
          tableRows.push(cols);
        }
      }

      if (tableRows.length === 0) {
        tableRows.push(['Recognized Content']);
        tableRows.push([rawText.trim() || 'No text detected']);
        report.approximations.push('No explicit delimiters found; wrapped text into single-column sheet');
      } else {
        report.tablesDetected = 1;
      }

      // Normalize row widths
      const maxCols = Math.max(...tableRows.map(r => r.length), 1);
      const normalizedRows = tableRows.map(row => {
        const padded = [...row];
        while (padded.length < maxCols) {
          padded.push('');
        }
        return padded;
      });

      onProgress?.({ percent: 92, stage: 'Compiling .xlsx workbook...' });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(normalizedRows);
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
}
