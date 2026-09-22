import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToExcelConverter implements IConverter {
  readonly id = 'pdf-to-excel';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-excel',
    name: 'PDF to Excel Converter',
    shortTitle: 'PDF to Excel',
    description: 'Detect and extract tabular data and aligned columns from PDF into a structured Microsoft Excel (.xlsx) spreadsheet.',
    sourceFormats: ['.pdf'],
    targetFormat: 'xlsx',
    category: 'pdf-to-format',
    icon: 'grid',
    badge: 'Spreadsheet',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Extracts tables where text cells are aligned in recognizable rows and columns.',
      'Scanned paper documents without OCR cannot be parsed into spreadsheet cells.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: {
      singleSheet?: boolean;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF has no pages.' };
      }

      const wb = XLSX.utils.book_new();
      let combinedRows: string[][] = [];
      let totalCellsFound = 0;
      let firstPagePreview: { headers: string[]; rows: string[][] } | undefined;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const percent = Math.round((pageNum / numPages) * 85);
        onProgress?.({
          percent,
          stage: `Detecting tables on page ${pageNum} of ${numPages}...`,
          currentItem: pageNum,
          totalItems: numPages,
          message: 'Clustering rows and columns...'
        });

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{
          str: string;
          transform: number[];
          width: number;
          height: number;
        }>;

        const tableData = this.detectTableGrid(items);

        if (tableData.length > 0) {
          totalCellsFound += tableData.reduce((acc, row) => acc + row.length, 0);

          if (!firstPagePreview) {
            firstPagePreview = {
              headers: tableData[0] || [],
              rows: tableData.slice(1, 15) // Preview up to 15 rows
            };
          }

          if (options.singleSheet) {
            if (combinedRows.length > 0) {
              combinedRows.push([`--- Page ${pageNum} ---`]);
            }
            combinedRows = combinedRows.concat(tableData);
          } else {
            const ws = XLSX.utils.aoa_to_sheet(tableData);
            XLSX.utils.book_append_sheet(wb, ws, `Page ${pageNum}`);
          }
        }
      }

      if (options.singleSheet && combinedRows.length > 0) {
        const ws = XLSX.utils.aoa_to_sheet(combinedRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Extracted Data');
      }

      if (totalCellsFound === 0) {
        return {
          success: false,
          error: 'No tabular or text data could be extracted from this PDF. Ensure the PDF contains selectable text and table content.'
        };
      }

      onProgress?.({
        percent: 95,
        stage: 'Generating Excel workbook (.xlsx)...',
        message: 'Formatting spreadsheet...'
      });

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      const excelFile = new File([excelBuffer], `${baseName}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      return {
        success: true,
        file: excelFile,
        downloadName: excelFile.name,
        previewData: firstPagePreview,
        metadata: {
          name: excelFile.name,
          type: excelFile.type,
          sizeBytes: excelFile.size,
          lastModified: Date.now(),
          extension: 'xlsx'
        }
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to Excel: ${e?.message || e.toString()}`
      };
    }
  }

  /**
   * Detects rows and columns based on spatial coordinates of text items.
   */
  private detectTableGrid(items: Array<{ str: string; transform: number[]; width: number }>): string[][] {
    const validItems = items.filter(it => it.str && it.str.trim().length > 0);
    if (validItems.length === 0) return [];

    // Group items into rows by Y coordinate (tolerance 4 points)
    // In PDF coordinates, top of page has highest Y
    validItems.sort((a, b) => b.transform[5] - a.transform[5]);

    const rowGroups: Array<{ y: number; items: typeof validItems }> = [];
    for (const item of validItems) {
      const y = item.transform[5];
      const existing = rowGroups.find(r => Math.abs(r.y - y) <= 4);
      if (existing) {
        existing.items.push(item);
      } else {
        rowGroups.push({ y, items: [item] });
      }
    }

    // Identify common column X coordinates across all rows
    const allX: number[] = [];
    rowGroups.forEach(r => {
      r.items.forEach(it => allX.push(it.transform[4]));
    });

    // Cluster X coordinates with tolerance
    const colClusters: number[] = [];
    allX.sort((a, b) => a - b);
    for (const x of allX) {
      const cluster = colClusters.find(c => Math.abs(c - x) <= 15);
      if (!cluster) {
        colClusters.push(x);
      }
    }
    colClusters.sort((a, b) => a - b);

    // Build 2D array
    const grid: string[][] = [];
    for (const row of rowGroups) {
      // Sort row items left to right
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);

      const cells: string[] = new Array(Math.max(colClusters.length, 1)).fill('');
      for (const item of row.items) {
        const itemX = item.transform[4];
        // Find nearest column cluster
        let bestCol = 0;
        let minDiff = Infinity;
        for (let c = 0; c < colClusters.length; c++) {
          const diff = Math.abs(colClusters[c] - itemX);
          if (diff < minDiff) {
            minDiff = diff;
            bestCol = c;
          }
        }
        cells[bestCol] = cells[bestCol] ? `${cells[bestCol]} ${item.str.trim()}` : item.str.trim();
      }

      // Only add row if not completely blank
      if (cells.some(c => c.length > 0)) {
        // Trim trailing empty cells
        while (cells.length > 0 && cells[cells.length - 1] === '') {
          cells.pop();
        }
        grid.push(cells);
      }
    }

    return grid;
  }
}
