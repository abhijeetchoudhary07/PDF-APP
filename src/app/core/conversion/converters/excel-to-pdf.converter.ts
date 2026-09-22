import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';

@Injectable({
  providedIn: 'root'
})
export class ExcelToPdfConverter implements IConverter {
  readonly id = 'excel-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'excel-to-pdf',
    name: 'Excel to PDF Converter',
    shortTitle: 'Excel to PDF',
    description: 'Convert Excel spreadsheets (.xlsx, .xls) into clean, printable PDF documents with table grids.',
    sourceFormats: ['.xlsx', '.xls'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'stats-chart',
    badge: 'XLSX to PDF',
    acceptMimeTypes: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
    limitations: [
      'Extracts sheet cell data, headers, and values into formatted tables.',
      'Complex custom charts and visual VBA macros are not rendered into the static table grid.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return { valid: false, error: 'Selected file is not an Excel spreadsheet (.xlsx, .xls).' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions & {
      selectedSheetIndex?: number;
      convertAllSheets?: boolean;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 25,
        stage: 'Reading Excel workbook...',
        message: 'Parsing worksheet structures...'
      });

      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        return { success: false, error: 'No worksheets found in this Excel file.' };
      }

      const pdfDoc = await PDFDocument.create();
      const sheetNamesToProcess = options.convertAllSheets
        ? wb.SheetNames
        : [wb.SheetNames[options.selectedSheetIndex || 0] || wb.SheetNames[0]];

      let firstSheetPreview: { headers: string[]; rows: string[][] } | undefined;

      for (let s = 0; s < sheetNamesToProcess.length; s++) {
        const sheetName = sheetNamesToProcess[s];
        const percent = Math.round(30 + ((s + 1) / sheetNamesToProcess.length) * 55);

        onProgress?.({
          percent,
          stage: `Rendering sheet: "${sheetName}" (${s + 1}/${sheetNamesToProcess.length})...`,
          currentItem: s + 1,
          totalItems: sheetNamesToProcess.length,
          message: 'Formatting table grid and rows...'
        });

        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;

        // Convert to array of arrays
        const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (data.length === 0) continue;

        const headers = (data[0] || []).map((h: any) => String(h || ''));
        const rows = data.slice(1).map(row => row.map((c: any) => String(c ?? '')));

        if (!firstSheetPreview) {
          firstSheetPreview = {
            headers,
            rows: rows.slice(0, 15)
          };
        }

        await PdfLayoutHelper.renderTableDocument(
          pdfDoc,
          headers,
          rows,
          {
            format: options.format || 'A4',
            orientation: options.orientation || 'Landscape', // Default landscape for spreadsheets
            margin: options.margin || 30,
            fontSize: options.fontSize || 8
          },
          sheetNamesToProcess.length > 1 ? sheetName : undefined
        );
      }

      if (pdfDoc.getPageCount() === 0) {
        return { success: false, error: 'The selected worksheet(s) contain no data.' };
      }

      onProgress?.({
        percent: 95,
        stage: 'Finalizing PDF output...',
        message: 'Saving document...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'spreadsheet';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: firstSheetPreview,
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
        error: `Failed to convert Excel to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
