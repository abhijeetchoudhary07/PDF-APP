import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { CsvParserHelper } from '../utils/csv-parser.helper';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';
import { FileReaderHelper } from '../utils/file-reader.helper';

@Injectable({
  providedIn: 'root'
})
export class CsvToPdfConverter implements IConverter {
  readonly id = 'csv-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'csv-to-pdf',
    name: 'CSV to PDF Converter',
    shortTitle: 'CSV to PDF',
    description: 'Convert comma-separated and tab-separated data files (.csv, .tsv) into clean tabular PDF documents.',
    sourceFormats: ['.csv', '.tsv'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'list',
    badge: 'CSV Table',
    acceptMimeTypes: '.csv,.tsv,text/csv,text/tab-separated-values',
    limitations: [
      'Automatically detects delimiters (comma, semicolon, tab, pipe).',
      'Paginates large tables across multiple pages with repeated header rows.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.tsv') && file.type !== 'text/csv') {
      return { valid: false, error: 'Selected file is not a CSV or TSV file.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions & {
      hasHeaderRow?: boolean;
      delimiter?: string;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 25,
        stage: 'Reading CSV data...',
        message: 'Parsing records and delimiters...'
      });

      const csvText = await FileReaderHelper.readAsText(file);
      const parsed = CsvParserHelper.parse(csvText, options.delimiter);

      if (parsed.rowCount === 0 && parsed.headers.length === 0) {
        return { success: false, error: 'No data records found in this CSV file.' };
      }

      onProgress?.({
        percent: 60,
        stage: 'Formatting tabular PDF pages...',
        message: 'Calculating column widths and grid layout...'
      });

      const pdfDoc = await PDFDocument.create();

      await PdfLayoutHelper.renderTableDocument(
        pdfDoc,
        parsed.headers,
        parsed.rows,
        {
          format: options.format || 'A4',
          orientation: options.orientation || 'Landscape',
          margin: options.margin || 30,
          fontSize: options.fontSize || 8
        },
        file.name.replace(/\.[^/.]+$/, '')
      );

      onProgress?.({
        percent: 95,
        stage: 'Saving PDF document...',
        message: 'Writing output...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'table';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          headers: parsed.headers,
          rows: parsed.rows.slice(0, 15),
          totalRows: parsed.rowCount,
          totalColumns: parsed.columnCount,
          delimiter: parsed.delimiter
        },
        metadata: {
          name: finalPdf.name,
          type: 'application/pdf',
          sizeBytes: finalPdf.size,
          lastModified: Date.now(),
          extension: 'pdf'
        }
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert CSV to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
