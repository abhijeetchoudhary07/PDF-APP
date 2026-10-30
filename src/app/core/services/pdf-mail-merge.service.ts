import { Injectable, inject } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFBool } from 'pdf-lib';
import JSZip from 'jszip';
import { StorageService } from './storage.service';
import {
  CsvParsedData,
  MailMergeFieldMapping,
  MailMergeOptions,
  MailMergeBatchResult,
  MailMergeRowResult,
  PdfFormFieldType
} from '../models/pdf-forms.types';

@Injectable({
  providedIn: 'root'
})
export class PdfMailMergeService {
  private storageService = inject(StorageService, { optional: true });

  // ==========================================
  // 1. CSV Ingestion & Parsing
  // ==========================================

  /**
   * Parses CSV text with robust support for quoted fields, escaped quotes,
   * commas, newlines (\r\n, \n, \r), and variable whitespace.
   * Enforces file size and row ceilings to protect against DoS.
   */
  parseCsv(csvText: string): CsvParsedData {
    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      return { headers: [], rows: [], totalRows: 0 };
    }

    // Security: Enforce 10 MB maximum CSV size ceiling to prevent heap exhaustion
    if (csvText.length > 10 * 1024 * 1024) {
      throw new Error('CSV file exceeds maximum allowed size (10 MB)');
    }

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    const len = csvText.length;

    while (i < len) {
      const char = csvText[i];
      const nextChar = i + 1 < len ? csvText[i + 1] : '';

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote: "" -> "
            currentField += '"';
            i += 2;
            continue;
          } else {
            // End of quoted field
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
          continue;
        } else if (char === ',') {
          currentRow.push(currentField.trim());
          currentField = '';
          i++;
          continue;
        } else if (char === '\r') {
          if (nextChar === '\n') {
            i++;
          }
          currentRow.push(currentField.trim());
          currentField = '';
          if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          i++;
          continue;
        } else if (char === '\n') {
          currentRow.push(currentField.trim());
          currentField = '';
          if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }
    }

    // Push trailing field/row if any
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    if (rows.length === 0) {
      return { headers: [], rows: [], totalRows: 0 };
    }

    // Security: Enforce maximum row count ceiling (5,000 rows) to prevent heap exhaustion
    if (rows.length > 5001) {
      throw new Error('CSV exceeds maximum allowed batch size (5,000 rows)');
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows: Record<string, string>[] = [];

    for (let r = 1; r < rows.length; r++) {
      const rowArr = rows[r];
      // Skip completely empty lines
      if (rowArr.length === 1 && rowArr[0] === '') continue;

      const record: Record<string, string> = {};
      for (let h = 0; h < headers.length; h++) {
        const headerName = headers[h];
        if (headerName) {
          let cellVal = h < rowArr.length ? rowArr[h] : '';
          // Strip formula-neutralizing single quote if present
          if (cellVal.startsWith("'") && /^[=+\-@\t\r]/.test(cellVal.slice(1))) {
            cellVal = cellVal.slice(1);
          }
          record[headerName] = cellVal;
        }
      }
      dataRows.push(record);
    }

    return {
      headers,
      rows: dataRows,
      totalRows: dataRows.length
    };
  }

  // ==========================================
  // 2. Auto-Mapping Algorithm
  // ==========================================

  /**
   * Compares CSV column headers against PDF form field names and automatically
   * suggests matches using exact, normalized, and Levenshtein distance metrics.
   */
  autoMapFields(
    fields: Array<{ name: string; type?: PdfFormFieldType }>,
    headers: string[]
  ): MailMergeFieldMapping[] {
    const mappings: MailMergeFieldMapping[] = [];

    for (const field of fields) {
      let bestHeader: string | null = null;
      let highestSimilarity = 0;

      for (const header of headers) {
        const sim = this.calculateSimilarity(field.name, header);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestHeader = header;
        }
      }

      // 60% similarity threshold for auto-matching
      const isAutoMatched = highestSimilarity >= 0.6 && bestHeader !== null;

      mappings.push({
        fieldName: field.name,
        fieldType: field.type || 'text',
        csvColumn: isAutoMatched ? bestHeader : null,
        isAutoMatched,
        confidence: Math.round(highestSimilarity * 100) / 100
      });
    }

    return mappings;
  }

  /**
   * Computes string similarity score between 0.0 and 1.0.
   */
  calculateSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const normA = a.trim().toLowerCase();
    const normB = b.trim().toLowerCase();

    // 1. Exact case-insensitive match
    if (normA === normB) return 1.0;

    // 2. Normalized alphanumeric match (stripping spaces, underscores, dashes)
    const cleanA = normA.replace(/[^a-z0-9]/g, '');
    const cleanB = normB.replace(/[^a-z0-9]/g, '');
    if (cleanA && cleanB && cleanA === cleanB) return 0.95;

    // 3. Substring containment
    if (cleanA && cleanB && (cleanA.includes(cleanB) || cleanB.includes(cleanA))) {
      const lenDiff = Math.abs(cleanA.length - cleanB.length);
      const penalty = lenDiff / Math.max(cleanA.length, cleanB.length);
      return Math.max(0.7, 0.9 - penalty * 0.2);
    }

    // 4. Levenshtein Distance
    const dist = this.levenshteinDistance(cleanA || normA, cleanB || normB);
    const maxLen = Math.max((cleanA || normA).length, (cleanB || normB).length);
    if (maxLen === 0) return 1.0;

    return Math.max(0, 1 - dist / maxLen);
  }

  /**
   * Classic Levenshtein edit distance computation.
   */
  levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    const aLen = a.length;
    const bLen = b.length;

    for (let i = 0; i <= aLen; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= bLen; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[aLen][bLen];
  }

  // ==========================================
  // 3. File Naming Generator
  // ==========================================

  /**
   * Generates a sanitized file name from a tokenized pattern like
   * "Invoice_{InvoiceNo}_{CustomerName}.pdf" and row data.
   */
  generateTokenizedFileName(
    pattern: string,
    row: Record<string, string>,
    index: number
  ): string {
    let name = pattern && pattern.trim() ? pattern.trim() : 'Document_{index}.pdf';

    // Replace {index} and {rowIndex}
    name = name.replace(/\{index\}/gi, String(index + 1));
    name = name.replace(/\{rowIndex\}/gi, String(index + 1));

    // Replace any {columnName}
    name = name.replace(/\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (row[trimmedKey] !== undefined) {
        return row[trimmedKey];
      }
      // Case-insensitive lookup fallback
      const foundKey = Object.keys(row).find(
        k => k.toLowerCase() === trimmedKey.toLowerCase()
      );
      if (foundKey && row[foundKey] !== undefined) {
        return row[foundKey];
      }
      return match;
    });

    // Security: Neutralize Zip Slip and Directory Traversal attacks (../, ..\, /, null bytes)
    name = name.replace(/%2e%2e|\.\.[\/\\]|\.\./gi, '').replace(/^[.\s\\/]+/, '');
    name = name.replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_').replace(/_+/g, '_').trim();

    if (!name || name === '.pdf' || name === '_') {
      name = `Document_${index + 1}.pdf`;
    }

    if (!name.toLowerCase().endsWith('.pdf')) {
      name += '.pdf';
    }

    return name;
  }

  // ==========================================
  // 4. Batch Mail-Merge Execution
  // ==========================================

  /**
   * Executes batch mail-merge across CSV rows with 60fps responsive chunking,
   * quota tracking, tokenized naming, optional field flattening, and ZIP packaging.
   */
  async executeMailMerge(
    templatePdfBytes: ArrayBuffer | Uint8Array,
    rows: Record<string, string>[],
    mappings: MailMergeFieldMapping[],
    options: MailMergeOptions
  ): Promise<MailMergeBatchResult> {
    const startTime = Date.now();
    const rowResults: MailMergeRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const total = rows.length;

    // Check storage quota upfront if StorageService is present
    let quotaLimit = Infinity;
    if (this.storageService) {
      try {
        const quotaStatus = await this.storageService.getQuotaStatus();
        if (!quotaStatus.isUnlimited && quotaStatus.remaining !== null) {
          quotaLimit = quotaStatus.remaining;
        }
      } catch {
        // Fallback to infinite in test/mock environment
      }
    }
    if (options.maxRecords && options.maxRecords < quotaLimit) {
      quotaLimit = options.maxRecords;
    }

    // Active mappings map (fieldName -> csvColumn)
    const activeMappings = mappings.filter(m => m.csvColumn !== null && m.csvColumn !== undefined);

    for (let i = 0; i < total; i++) {
      // Check abort signal
      if (options.abortSignal?.aborted) {
        rowResults.push({
          rowIndex: i + 1,
          fileName: `Row_${i + 1}.pdf`,
          status: 'skipped',
          error: 'Batch operation cancelled by user'
        });
        skippedCount++;
        continue;
      }

      // Check quota limit
      if (successCount >= quotaLimit) {
        rowResults.push({
          rowIndex: i + 1,
          fileName: `Row_${i + 1}.pdf`,
          status: 'skipped',
          error: 'Daily free quota limit reached'
        });
        skippedCount++;
        continue;
      }

      const row = rows[i];
      const fileName = this.generateTokenizedFileName(options.namingPattern, row, i);

      try {
        // Clone template PDF in-memory
        const pdfDoc = await PDFDocument.load(templatePdfBytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();

        // Inject mapped field values
        for (const mapping of activeMappings) {
          if (!mapping.csvColumn) continue;
          const rawVal = row[mapping.csvColumn];
          const val = rawVal !== undefined ? rawVal : '';

          try {
            this.setFieldValue(form, mapping.fieldName, val);
          } catch (fieldErr: any) {
            console.warn(`Warning setting field ${mapping.fieldName}:`, fieldErr?.message);
          }
        }

        // Optional flattening
        if (options.flatten) {
          try {
            form.flatten();
          } catch {
            try {
              // Fallback for non-WinAnsi regional scripts (Hindi, Bengali, Marathi, etc.)
              form.flatten({ updateFieldAppearances: false });
            } catch (err: any) {
              console.warn('Form flattening skipped:', err?.message);
            }
          }
        }

        // In AcroForm, set NeedAppearances = true so PDF viewers render appearances using native OS Unicode fonts
        try {
          const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
          if (acroForm) {
            acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True);
          }
        } catch {}

        let pdfBytes: Uint8Array;
        try {
          pdfBytes = await pdfDoc.save();
        } catch {
          // Fallback if WinAnsi encoding fails on regional scripts (Hindi, Bengali, Marathi, etc.)
          pdfBytes = await pdfDoc.save({ updateFieldAppearances: false });
        }

        rowResults.push({
          rowIndex: i + 1,
          fileName,
          status: 'success',
          pdfBytes
        });
        successCount++;
      } catch (err: any) {
        console.error(`Error processing row ${i + 1}:`, err);
        rowResults.push({
          rowIndex: i + 1,
          fileName,
          status: 'error',
          error: err?.message || 'Unknown processing error'
        });
        failedCount++;
      }

      // Report progress
      if (options.onProgress) {
        const current = i + 1;
        const percent = Math.round((current / total) * 100);
        options.onProgress({
          current,
          total,
          percent,
          statusText: `Processing ${current} of ${total}...`
        });
      }

      // Yield every 2 records so the mobile UI remains 60fps responsive
      if (i % 2 === 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Optional ZIP archive packaging
    let zipBlob: Blob | undefined;
    let zipFileName: string | undefined;

    if (options.bundleAsZip && successCount > 0) {
      const zip = new JSZip();
      for (const res of rowResults) {
        if (res.status === 'success' && res.pdfBytes) {
          // Security: Guarantee entry name has no path separators or traversal
          const safeZipName = res.fileName.replace(/[\\/]/g, '_').replace(/\.\./g, '');
          zip.file(safeZipName, res.pdfBytes);
        }
      }
      zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      zipFileName = 'mail_merge_bundle.zip';
    }

    return {
      totalRows: total,
      successCount,
      failedCount,
      skippedCount,
      rowResults,
      zipBlob,
      zipFileName,
      durationMs: Date.now() - startTime
    };
  }

  // ==========================================
  // Field Value Injection Helper
  // ==========================================

  private setFieldValue(form: any, fieldName: string, val: string): void {
    let field: any;
    try {
      field = form.getField(fieldName);
    } catch {
      return;
    }

    if (!field) return;

    const constructorName = field.constructor?.name || '';

    if (constructorName.includes('PDFTextField') || typeof field.setText === 'function') {
      field.setText(val ?? '');
    } else if (constructorName.includes('PDFCheckBox') || typeof field.check === 'function') {
      const isChecked = this.isTruthy(val);
      if (isChecked) {
        field.check();
      } else {
        field.uncheck();
      }
    } else if (constructorName.includes('PDFRadioGroup') || typeof field.select === 'function') {
      if (val) {
        try {
          field.select(val);
        } catch {
          // If option is not found in radio group, ignore without crashing
        }
      }
    } else if (constructorName.includes('PDFDropdown') || typeof field.select === 'function') {
      if (val) {
        try {
          field.select(val);
        } catch {
          // If option is not found in dropdown, ignore without crashing
        }
      }
    } else if (constructorName.includes('PDFOptionList') || typeof field.select === 'function') {
      if (val) {
        try {
          field.select([val]);
        } catch {
          // If option is not found in list, ignore without crashing
        }
      }
    }
  }

  private isTruthy(val: any): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      return s === 'true' || s === 'yes' || s === '1' || s === 'on' || s === 'checked';
    }
    return false;
  }
}
