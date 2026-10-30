import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFName,
  PDFDict,
  PDFBool
} from 'pdf-lib';
import { StorageService } from './storage.service';
import {
  FormDataTransferFormat,
  FormFieldDataRecord,
  FormDataExportResult,
  FormDataImportFieldMatch,
  FormDataImportReport,
  PdfFormFieldType
} from '../models/pdf-forms.types';

@Injectable({
  providedIn: 'root'
})
export class PdfFormDataService {
  private storageService = inject(StorageService, { optional: true });

  // =========================================================================
  // EXPORT FORM DATA
  // =========================================================================

  /**
   * Extracts all interactive form fields from the PDF bytes and converts them
   * into the specified export format (FDF, XFDF, CSV, or JSON).
   */
  async exportFormData(
    docBytes: ArrayBuffer,
    format: FormDataTransferFormat,
    baseFileName = 'document'
  ): Promise<FormDataExportResult> {
    const fields = await this.extractFieldRecords(docBytes);
    const cleanBase = baseFileName.replace(/\.[^/.]+$/, '');
    let content = '';
    let mimeType = 'text/plain';
    let ext = format;

    switch (format) {
      case 'fdf':
        content = this.exportToFdf(fields);
        mimeType = 'application/vnd.fdf';
        ext = 'fdf';
        break;

      case 'xfdf':
        content = this.exportToXfdf(fields);
        mimeType = 'application/vnd.adobe.xfdf';
        ext = 'xfdf';
        break;

      case 'csv':
        content = this.exportToCsv(fields);
        mimeType = 'text/csv';
        ext = 'csv';
        break;

      case 'json':
        content = this.exportToJson(fields);
        mimeType = 'application/json';
        ext = 'json';
        break;
    }

    const utf8Bytes = new TextEncoder().encode(content);
    return {
      format,
      mimeType,
      fileName: `${cleanBase}_form_data.${ext}`,
      content,
      sizeBytes: utf8Bytes.byteLength,
      fieldCount: fields.length
    };
  }

  /**
   * Extracts structured field data records from a PDF document.
   */
  async extractFieldRecords(docBytes: ArrayBuffer): Promise<FormFieldDataRecord[]> {
    const pdfDoc = await PDFDocument.load(docBytes.slice(0), { ignoreEncryption: true });
    const records: FormFieldDataRecord[] = [];

    try {
      const form = pdfDoc.getForm();
      const rawFields = form.getFields();

      for (const f of rawFields) {
        const name = f.getName();
        let type: PdfFormFieldType = 'text';
        let val: any = '';
        let isChecked = false;
        let selectedOption: string | null = null;

        if (f instanceof PDFTextField) {
          type = name.toLowerCase().includes('date') || name.toLowerCase().includes('dob') ? 'date' : 'text';
          val = f.getText() || '';
        } else if (f instanceof PDFCheckBox) {
          type = 'checkbox';
          isChecked = f.isChecked();
          val = isChecked;
        } else if (f instanceof PDFRadioGroup) {
          type = 'radio';
          val = f.getSelected() || '';
          selectedOption = val || null;
        } else if (f instanceof PDFDropdown) {
          type = 'dropdown';
          const sel = f.getSelected();
          val = sel && sel.length > 0 ? sel[0] : '';
          selectedOption = val || null;
        } else if (f instanceof PDFOptionList) {
          type = 'listbox';
          const sel = f.getSelected();
          val = sel && sel.length > 0 ? sel[0] : '';
          selectedOption = val || null;
        }

        records.push({
          name,
          type,
          value: val,
          isChecked,
          selectedOption
        });
      }
    } catch {
      // Document has no form dictionary
    }

    return records;
  }

  /**
   * Generates ISO 32000-1 Annex B compliant FDF syntax with UTF-8 encoding marker.
   */
  exportToFdf(fields: FormFieldDataRecord[]): string {
    let fdf = '%FDF-1.2\n%âãÏÓ\n1 0 obj\n<<\n/FDF <<\n/Encoding /UTF-8\n/Fields [\n';
    for (const f of fields) {
      const nameEsc = this.escapePdfString(f.name);
      if (f.type === 'checkbox') {
        const checkVal = f.value === true || f.isChecked ? '/Yes' : '/Off';
        fdf += `<< /T (${nameEsc}) /V ${checkVal} >>\n`;
      } else {
        const valEsc = this.escapePdfString(f.value != null ? String(f.value) : '');
        fdf += `<< /T (${nameEsc}) /V (${valEsc}) >>\n`;
      }
    }
    fdf += '] >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
    return fdf;
  }

  /**
   * Generates Adobe-standard XFDF XML syntax.
   */
  exportToXfdf(fields: FormFieldDataRecord[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n  <fields>\n';
    for (const f of fields) {
      const nameEsc = this.escapeXml(f.name);
      let valStr = '';
      if (f.type === 'checkbox') {
        valStr = f.value === true || f.isChecked ? 'Yes' : 'Off';
      } else {
        valStr = f.value != null ? String(f.value) : '';
      }
      const valEsc = this.escapeXml(valStr);
      xml += `    <field name="${nameEsc}">\n      <value>${valEsc}</value>\n    </field>\n`;
    }
    xml += '  </fields>\n</xfdf>';
    return xml;
  }

  /**
   * Generates RFC 4180 compliant CSV format with header row and single values row.
   */
  exportToCsv(fields: FormFieldDataRecord[]): string {
    const headers = fields.map(f => this.escapeCsv(f.name)).join(',');
    const values = fields.map(f => {
      if (f.type === 'checkbox') {
        return this.escapeCsv(f.value === true || f.isChecked ? 'true' : 'false');
      }
      return this.escapeCsv(f.value != null ? String(f.value) : '');
    }).join(',');

    return `${headers}\r\n${values}`;
  }

  /**
   * Generates schema-valid JSON object with structured field records.
   */
  exportToJson(fields: FormFieldDataRecord[]): string {
    const obj: Record<string, FormFieldDataRecord> = {};
    for (const f of fields) {
      obj[f.name] = {
        name: f.name,
        type: f.type,
        value: f.value,
        isChecked: f.isChecked,
        selectedOption: f.selectedOption
      };
    }
    return JSON.stringify(obj, null, 2);
  }

  // =========================================================================
  // PARSE & DETECT IMPORT FORMAT
  // =========================================================================

  /**
   * Detects the data format from content markers.
   */
  detectFormat(content: string): FormDataTransferFormat {
    const trimmed = content.trim();
    if (trimmed.startsWith('%FDF')) {
      return 'fdf';
    }
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<xfdf') || /<fields>[\s\S]*<\/fields>/i.test(trimmed)) {
      return 'xfdf';
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return 'json';
    }
    return 'csv';
  }

  /**
   * Parses raw content in any of the 4 formats into a name-value mapping.
   */
  parseFormData(
    content: string,
    formatHint?: FormDataTransferFormat
  ): { data: Record<string, any>; format: FormDataTransferFormat } {
    const trimmed = content ? content.trim() : '';
    if (!trimmed) {
      throw new Error('Import data stream is empty');
    }

    const format = formatHint || this.detectFormat(trimmed);
    let data: Record<string, any> = {};

    switch (format) {
      case 'fdf':
        data = this.parseFdf(trimmed);
        break;

      case 'xfdf':
        data = this.parseXfdf(trimmed);
        break;

      case 'csv':
        data = this.parseCsv(trimmed);
        break;

      case 'json':
        data = this.parseJson(trimmed);
        break;

      default:
        throw new Error(`Unsupported form data format: ${format}`);
    }

    return { data, format };
  }

  /**
   * Parses FDF text into key-value pairs with literal, hex string, and name support.
   */
  parseFdf(fdfText: string): Record<string, any> {
    if (!fdfText.includes('%FDF')) {
      throw new Error('Invalid FDF header: missing %FDF identifier');
    }

    const result: Record<string, any> = Object.create(null);
    // Matches << /T (...) or <hex> /V (...) or <hex> or /Name >>
    const fieldRegex = /<<\s*\/T\s*(?:\(((?:\\\(|\\\)|[^)])+)\)|<([0-9a-fA-F\s]+)>)\s*\/V\s*(?:\(((?:\\\(|\\\)|[\s\S])*?)\)|<([0-9a-fA-F\s]+)>|\/([^\s>]+))\s*>>/g;
    let match;

    while ((match = fieldRegex.exec(fdfText)) !== null) {
      let key = '';
      if (match[1] !== undefined) {
        key = this.decodePdfString(match[1]);
      } else if (match[2] !== undefined) {
        key = this.decodePdfHexString(match[2]);
      }
      if (!key) continue;

      let val: any = '';
      if (match[3] !== undefined) {
        val = this.decodePdfString(match[3]);
      } else if (match[4] !== undefined) {
        val = this.decodePdfHexString(match[4]);
      } else if (match[5] !== undefined) {
        val = match[5];
      }
      result[key] = val;
    }

    return result;
  }

  /**
   * Parses XFDF XML text into key-value pairs with strict XXE and DTD bomb protection.
   */
  parseXfdf(xmlText: string): Record<string, any> {
    const trimmed = xmlText.trim();
    if (!trimmed.includes('<xfdf') && !trimmed.includes('<fields>')) {
      throw new Error('Malformed XFDF: missing <xfdf> or <fields> root');
    }

    // Cybersecurity: Reject XML entity declarations, external DTDs, and SYSTEM references (XXE Protection)
    if (/<!ENTITY/i.test(trimmed) || /<!DOCTYPE/i.test(trimmed) || /\bSYSTEM\b/i.test(trimmed) || /\bPUBLIC\b/i.test(trimmed)) {
      throw new Error('XML entity declarations, external DTDs, and SYSTEM references are prohibited in XFDF (XXE Protection)');
    }

    const result: Record<string, any> = Object.create(null);

    // Standard regex extractor that functions identically in Node and Browser
    const fieldRegex = /<field\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/field>/gi;
    let match;

    while ((match = fieldRegex.exec(trimmed)) !== null) {
      const fieldName = this.decodeXml(match[1]);
      const body = match[2];
      const valMatch = /<value>([\s\S]*?)<\/value>/i.exec(body);
      if (valMatch) {
        result[fieldName] = this.decodeXml(valMatch[1]);
      } else {
        result[fieldName] = '';
      }
    }

    return result;
  }

  /**
   * Parses RFC 4180 CSV text into key-value pairs with formula unquoting.
   */
  parseCsv(csvText: string): Record<string, any> {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < csvText.length) {
      const char = csvText[i];
      const next = csvText[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else if (char === '"') {
          inQuotes = false;
          i++;
          continue;
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
          currentRow.push(currentField);
          currentField = '';
          i++;
          continue;
        } else if (char === '\r' && next === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i += 2;
          continue;
        } else if (char === '\n' || char === '\r') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }
    }

    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    if (rows.length < 2) {
      throw new Error('Malformed CSV: expected header row and values row');
    }

    const headers = rows[0];
    const values = rows[1];
    const result: Record<string, any> = Object.create(null);

    for (let j = 0; j < headers.length; j++) {
      let h = headers[j].trim();
      if (h.startsWith("'") && /^[=+\-@\t\r]/.test(h.slice(1))) {
        h = h.slice(1);
      }
      if (h) {
        let val = values[j] !== undefined ? values[j] : '';
        // Unquote neutralized formula if safe to restore
        if (typeof val === 'string' && val.startsWith("'") && /^[=+\-@\t\r]/.test(val.slice(1))) {
          val = val.slice(1);
        }
        result[h] = val;
      }
    }

    return result;
  }

  /**
   * Parses JSON text into key-value pairs with prototype pollution protection.
   */
  parseJson(jsonText: string): Record<string, any> {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err: any) {
      throw new Error(`Malformed JSON syntax: ${err.message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Malformed JSON: root must be an object');
    }

    const keys = Object.keys(parsed);
    if (keys.length > 5000) {
      throw new Error('JSON payload exceeds maximum allowed field count (5000)');
    }

    const result: Record<string, any> = Object.create(null);
    for (const [key, val] of Object.entries(parsed)) {
      // Prototype Pollution Protection
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      if (val && typeof val === 'object' && !Array.isArray(val) && 'value' in val) {
        // Structured { name, type, value, isChecked }
        const item = val as any;
        if (item.type === 'checkbox' && typeof item.isChecked === 'boolean') {
          result[key] = item.isChecked;
        } else {
          result[key] = item.value;
        }
      } else {
        result[key] = val;
      }
    }

    return result;
  }

  // =========================================================================
  // IMPORT PREVIEW & AUDIT REPORT
  // =========================================================================

  /**
   * Inspects the PDF document, parses the raw data content, runs a 3-tier
   * matching algorithm (exact, case-insensitive, fuzzy alphanumeric),
   * and returns an audit report with matched and unmatched fields.
   */
  async previewImport(
    docBytes: ArrayBuffer,
    rawContent: string,
    formatHint?: FormDataTransferFormat
  ): Promise<FormDataImportReport> {
    const errors: string[] = [];
    let parsedData: Record<string, any> = {};
    let detectedFormat: FormDataTransferFormat | undefined;

    try {
      const res = this.parseFormData(rawContent, formatHint);
      parsedData = res.data;
      detectedFormat = res.format;
    } catch (err: any) {
      errors.push(err.message || 'Failed to parse import content');
      return {
        totalDocumentFields: 0,
        totalImportedValues: 0,
        matchedCount: 0,
        matchedFields: [],
        unmatchedFields: [],
        errors
      };
    }

    const docFields = await this.extractFieldRecords(docBytes);
    const matchedFields: FormDataImportFieldMatch[] = [];
    const unmatchedFields: Array<{ name: string; value: any }> = [];
    const usedImportKeys = new Set<string>();

    for (const docField of docFields) {
      const match = this.findMatchingKey(docField.name, parsedData);
      if (match) {
        usedImportKeys.add(match.key);
        matchedFields.push({
          name: docField.name,
          originalValue: docField.value,
          newValue: match.value,
          type: docField.type,
          included: true
        });
      }
    }

    // Identify all unmatched import keys
    for (const [key, val] of Object.entries(parsedData)) {
      if (!usedImportKeys.has(key)) {
        unmatchedFields.push({
          name: key,
          value: val
        });
      }
    }

    return {
      totalDocumentFields: docFields.length,
      totalImportedValues: Object.keys(parsedData).length,
      matchedCount: matchedFields.length,
      matchedFields,
      unmatchedFields,
      formatDetected: detectedFormat,
      errors
    };
  }

  /**
   * 3-Tier Field Matching:
   * 1. Exact match
   * 2. Case-insensitive match
   * 3. Normalized alphanumeric fuzzy match
   */
  private findMatchingKey(
    targetName: string,
    data: Record<string, any>
  ): { key: string; value: any } | null {
    // Tier 1: Exact match
    if (Object.prototype.hasOwnProperty.call(data, targetName)) {
      return { key: targetName, value: data[targetName] };
    }

    // Tier 2: Case-insensitive match
    const lowerTarget = targetName.toLowerCase();
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase() === lowerTarget) {
        return { key, value };
      }
    }

    // Tier 3: Fuzzy alphanumeric match
    const normTarget = this.normalizeAlphanumeric(targetName);
    for (const [key, value] of Object.entries(data)) {
      if (this.normalizeAlphanumeric(key) === normTarget) {
        return { key, value };
      }
    }

    return null;
  }

  private normalizeAlphanumeric(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // =========================================================================
  // APPLY IMPORT TO PDF
  // =========================================================================

  /**
   * Applies matched field values to the PDF document and returns the updated PDF bytes.
   */
  async applyImport(
    docBytes: ArrayBuffer,
    matchesOrDict: FormDataImportFieldMatch[] | Record<string, any>
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(docBytes.slice(0), { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    const valueMap = new Map<string, any>();
    if (Array.isArray(matchesOrDict)) {
      for (const m of matchesOrDict) {
        if (m.included !== false) {
          valueMap.set(m.name, m.newValue);
        }
      }
    } else {
      for (const [k, v] of Object.entries(matchesOrDict)) {
        valueMap.set(k, v);
      }
    }

    const rawFields = form.getFields();
    for (const f of rawFields) {
      const name = f.getName();
      if (!valueMap.has(name)) continue;

      const val = valueMap.get(name);
      try {
        if (f instanceof PDFTextField) {
          let strVal = '';
          if (val !== null && val !== undefined) {
            strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
          f.setText(strVal);
        } else if (f instanceof PDFCheckBox) {
          const isTrue =
            val === true ||
            String(val).toLowerCase() === 'true' ||
            String(val).toLowerCase() === 'yes' ||
            String(val).toLowerCase() === 'on' ||
            String(val) === '1' ||
            String(val) === '/Yes';
          if (isTrue) {
            f.check();
          } else {
            f.uncheck();
          }
        } else if (f instanceof PDFRadioGroup) {
          try {
            f.select(String(val));
          } catch {
            const options = f.getOptions();
            const opt = options.find(o => o.toLowerCase() === String(val).toLowerCase());
            if (opt) f.select(opt);
          }
        } else if (f instanceof PDFDropdown) {
          try {
            f.select(String(val));
          } catch {
            const options = f.getOptions();
            const opt = options.find(o => o.toLowerCase() === String(val).toLowerCase());
            if (opt) f.select(opt);
          }
        } else if (f instanceof PDFOptionList) {
          const arr = Array.isArray(val) ? val.map(String) : [String(val)];
          f.select(arr);
        }
      } catch (err) {
        console.warn(`Failed to set field value for ${name}:`, err);
      }
    }

    try {
      const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
      if (acroForm) {
        acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True);
      }
    } catch {}

    try {
      return await pdfDoc.save({ useObjectStreams: false });
    } catch {
      return await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false });
    }
  }

  // =========================================================================
  // FILE STORAGE HELPER
  // =========================================================================

  /**
   * Packages export result into a File and saves via StorageService for daily quota.
   */
  async saveExportFile(
    result: FormDataExportResult,
    folder = 'forms'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number; uri?: string }> {
    const blob = new Blob([result.content], { type: result.mimeType });
    const file = new File([blob], result.fileName, { type: result.mimeType });

    let uri: string | undefined;
    if (this.storageService) {
      try {
        uri = await this.storageService.saveFile(file, folder);
      } catch (err) {
        console.warn('StorageService.saveFile error:', err);
      }
    }

    return {
      file,
      blob,
      sizeBytes: file.size,
      uri
    };
  }

  // =========================================================================
  // ESCAPING HELPERS
  // =========================================================================

  private escapePdfString(str: string): string {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }

  private decodePdfString(str: string): string {
    const unescaped = str.replace(/\\([\\()nrtbf]|([0-7]{1,3}))/g, (_, esc, oct) => {
      if (oct) return String.fromCharCode(parseInt(oct, 8));
      switch (esc) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'b': return '\b';
        case 'f': return '\f';
        case '(': return '(';
        case ')': return ')';
        case '\\': return '\\';
        default: return esc;
      }
    });

    if (unescaped.startsWith('\uFEFF')) {
      return unescaped.slice(1);
    }
    if (unescaped.length >= 2 && unescaped.charCodeAt(0) === 0xfe && unescaped.charCodeAt(1) === 0xff) {
      let decoded = '';
      for (let i = 2; i < unescaped.length; i += 2) {
        const hi = unescaped.charCodeAt(i);
        const lo = i + 1 < unescaped.length ? unescaped.charCodeAt(i + 1) : 0;
        decoded += String.fromCharCode((hi << 8) | lo);
      }
      return decoded;
    }

    return unescaped;
  }

  private decodePdfHexString(hex: string): string {
    const clean = hex.replace(/[\s\r\n\t]/g, '');
    if (!clean) return '';
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
      const byteHex = clean.substr(i, 2);
      bytes.push(parseInt(byteHex.padEnd(2, '0'), 16));
    }

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let str = '';
      for (let i = 2; i < bytes.length; i += 2) {
        const code = (bytes[i] << 8) | (bytes[i + 1] || 0);
        str += String.fromCharCode(code);
      }
      return str;
    }

    try {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch {
      return String.fromCharCode(...bytes);
    }
  }

  private escapeXml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private decodeXml(str: string): string {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  private escapeCsv(val: any): string {
    let str = String(val ?? '');
    // Cybersecurity: Neutralize CSV Formula Injection (=, +, -, @, \t, \r)
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}
