import '../utilities/pdf-iterator-polyfill';

import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

// Converters
import { WordToPdfConverter } from './converters/word-to-pdf.converter';
import { ExcelToPdfConverter } from './converters/excel-to-pdf.converter';
import { PptToPdfConverter } from './converters/ppt-to-pdf.converter';
import { TextToPdfConverter } from './converters/text-to-pdf.converter';
import { CsvToPdfConverter } from './converters/csv-to-pdf.converter';
import { HtmlToPdfConverter } from './converters/html-to-pdf.converter';
import { JsonToPdfConverter } from './converters/json-to-pdf.converter';
import { XmlToPdfConverter } from './converters/xml-to-pdf.converter';

import { PdfToWordConverter } from './converters/pdf-to-word.converter';
import { PdfToExcelConverter } from './converters/pdf-to-excel.converter';
import { PdfToMarkdownConverter } from './converters/pdf-to-markdown.converter';
import { PdfToHtmlConverter } from './converters/pdf-to-html.converter';
import { PdfToJsonConverter } from './converters/pdf-to-json.converter';

// Helpers
import { HtmlSanitizerHelper } from './utils/html-sanitizer.helper';

describe('Document Conversion Audit & Security Hardening Suite', () => {
  let wordToPdf: WordToPdfConverter;
  let excelToPdf: ExcelToPdfConverter;
  let pptToPdf: PptToPdfConverter;
  let textToPdf: TextToPdfConverter;
  let csvToPdf: CsvToPdfConverter;
  let htmlToPdf: HtmlToPdfConverter;
  let jsonToPdf: JsonToPdfConverter;
  let xmlToPdf: XmlToPdfConverter;

  let pdfToWord: PdfToWordConverter;
  let pdfToExcel: PdfToExcelConverter;
  let pdfToMarkdown: PdfToMarkdownConverter;
  let pdfToHtml: PdfToHtmlConverter;
  let pdfToJson: PdfToJsonConverter;

  const fixturesDir = path.resolve(__dirname, '../../../../e2e/test-data/conversion-audit');

  function loadFixtureAsFile(filename: string, mimeType: string): File {
    const filePath = path.join(fixturesDir, filename);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], filename, { type: mimeType });
  }

  beforeAll(() => {
    TestBed.configureTestingModule({});

    wordToPdf = TestBed.inject(WordToPdfConverter);
    excelToPdf = TestBed.inject(ExcelToPdfConverter);
    pptToPdf = TestBed.inject(PptToPdfConverter);
    textToPdf = TestBed.inject(TextToPdfConverter);
    csvToPdf = TestBed.inject(CsvToPdfConverter);
    htmlToPdf = TestBed.inject(HtmlToPdfConverter);
    jsonToPdf = TestBed.inject(JsonToPdfConverter);
    xmlToPdf = TestBed.inject(XmlToPdfConverter);

    pdfToWord = TestBed.inject(PdfToWordConverter);
    pdfToExcel = TestBed.inject(PdfToExcelConverter);
    pdfToMarkdown = TestBed.inject(PdfToMarkdownConverter);
    pdfToHtml = TestBed.inject(PdfToHtmlConverter);
    pdfToJson = TestBed.inject(PdfToJsonConverter);
  });

  describe('Step 2: Real Document Conversion Verification (Format-to-PDF)', () => {
    it('converts formatted Word (.docx) with headings and tables into PDF', async () => {
      const file = loadFixtureAsFile('sample-formatted.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const val = await wordToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await wordToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();
      expect(res.file.name).toBe('sample-formatted.pdf');

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('converts multi-sheet Excel (.xlsx) into PDF with table grids and sheet headers', async () => {
      const file = loadFixtureAsFile('sample-multisheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const val = await excelToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await excelToPdf.convert(file, { convertAllSheets: true });
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('converts PowerPoint (.pptx) presentation into clean PDF slides', async () => {
      const file = loadFixtureAsFile('sample-presentation.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      const val = await pptToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await pptToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBe(2);
    });

    it('converts raw text with Hindi/regional scripts and honestly reports font fallback', async () => {
      const file = loadFixtureAsFile('sample-unicode-hindi.txt', 'text/plain');
      const val = await textToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await textToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();
      expect(res.report?.indicOrRtlWarnings?.length).toBeGreaterThan(0);
      expect(res.warnings?.[0]).toContain('Devanagari');
    });

    it('converts regional CSV into PDF table grid preserving rows and columns', async () => {
      const file = loadFixtureAsFile('sample-regional.csv', 'text/csv');
      const val = await csvToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await csvToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('converts messy HTML with inline styles and tables into safe PDF pages', async () => {
      const file = loadFixtureAsFile('sample-messy.html', 'text/html');
      const val = await htmlToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await htmlToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('converts structured JSON into pretty-printed, syntax-highlighted PDF', async () => {
      const file = loadFixtureAsFile('sample-structured.json', 'application/json');
      const val = await jsonToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await jsonToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('converts valid XML into indented, syntax-highlighted PDF', async () => {
      const file = loadFixtureAsFile('sample-valid.xml', 'application/xml');
      const val = await xmlToPdf.validate(file);
      expect(val.valid).toBe(true);

      const res = await xmlToPdf.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const pdfBytes = await res.file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Step 2 & 3: Reverse Conversions (PDF-to-Format) & Resource Teardown', () => {
    it('converts multi-page PDF to editable Word (.docx) with headings and paragraph flow', async () => {
      const file = loadFixtureAsFile('sample-multi-page.pdf', 'application/pdf');
      const val = await pdfToWord.validate(file);
      expect(val.valid).toBe(true);

      const res = await pdfToWord.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();
      expect(res.file.name).toBe('sample-multi-page.docx');
      expect(res.previewData?.pages).toBe(2);
      expect(res.previewData?.wordCount).toBeGreaterThan(10);
    });

    it('converts multi-page PDF to Excel (.xlsx) extracting tabular datasets', async () => {
      const file = loadFixtureAsFile('sample-multi-page.pdf', 'application/pdf');
      const val = await pdfToExcel.validate(file);
      expect(val.valid).toBe(true);

      const res = await pdfToExcel.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();
      expect(res.file.name).toBe('sample-multi-page.xlsx');
      expect(res.previewData?.rows?.length).toBeGreaterThan(0);
    });

    it('converts multi-page PDF to Markdown (.md) preserving headings and lists', async () => {
      const file = loadFixtureAsFile('sample-multi-page.pdf', 'application/pdf');
      const val = await pdfToMarkdown.validate(file);
      expect(val.valid).toBe(true);

      const res = await pdfToMarkdown.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();
      expect(res.file.name).toBe('sample-multi-page.md');

      const mdText = await res.file.text();
      expect(mdText).toContain('# ');
      expect(mdText).toContain('Enterprise PDF Engine');
    });

    it('converts multi-page PDF to reflowable HTML with 100% offline self-contained markup', async () => {
      const file = loadFixtureAsFile('sample-multi-page.pdf', 'application/pdf');
      const val = await pdfToHtml.validate(file);
      expect(val.valid).toBe(true);

      const res = await pdfToHtml.convert(file, { mode: 'reflowable' });
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const htmlText = await res.file.text();
      expect(htmlText).toContain('<!DOCTYPE html>');
      expect(htmlText).toContain('pdf-page-section');
      expect(htmlText).not.toContain('<script');
    });

    it('converts multi-page PDF to schema-versioned structured JSON', async () => {
      const file = loadFixtureAsFile('sample-multi-page.pdf', 'application/pdf');
      const val = await pdfToJson.validate(file);
      expect(val.valid).toBe(true);

      const res = await pdfToJson.convert(file);
      expect(res.success).toBe(true);
      expect(res.file).toBeDefined();

      const jsonText = await res.file.text();
      const parsed = JSON.parse(jsonText);
      expect(parsed.schemaVersion).toBe('1.1.0');
      expect(parsed.totalPages).toBe(2);
    });
  });

  describe('Step 5: Cybersecurity Stress-Testing & Defensive Hardening', () => {
    it('defends against polyglot shell script renamed as .docx (rejects in validation)', async () => {
      const file = loadFixtureAsFile('polyglot-script.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const val = await wordToPdf.validate(file);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('invalid file signature');
    });

    it('defends against polyglot binary renamed as .xlsx (rejects in validation)', async () => {
      const polyglot = new File([new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00])], 'payload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const val = await excelToPdf.validate(polyglot);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('invalid file signature');
    });

    it('defends against polyglot script renamed as .pptx (rejects in validation)', async () => {
      const polyglot = new File(['#!/bin/bash\necho hack'], 'payload.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });
      const val = await pptToPdf.validate(polyglot);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('invalid file signature');
    });

    it('defends against XML External Entity (XXE) attacks in XML-to-PDF', async () => {
      const file = loadFixtureAsFile('xxe-attack.xml', 'application/xml');
      const res = await xmlToPdf.convert(file);
      expect(res.success).toBe(false);
      expect(res.error).toContain('External entity declarations (XXE) are disallowed');
    });

    it('defends against SSRF and script execution in HTML sanitizer', () => {
      const ssrfHtml = fs.readFileSync(path.join(fixturesDir, 'ssrf-attack.html'), 'utf8');
      const sanitized = HtmlSanitizerHelper.sanitize(ssrfHtml);

      // Script tags must be stripped
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert(');

      // Cloud metadata and loopback URLs must be stripped from attributes
      expect(sanitized).not.toContain('169.254.169.254');
      expect(sanitized).not.toContain('127.0.0.1');

      // Helper unit check
      expect(HtmlSanitizerHelper.isForbiddenUrl('http://169.254.169.254/latest/meta-data')).toBe(true);
      expect(HtmlSanitizerHelper.isForbiddenUrl('http://localhost:3000/api')).toBe(true);
      expect(HtmlSanitizerHelper.isForbiddenUrl('http://192.168.1.10/admin')).toBe(true);
      expect(HtmlSanitizerHelper.isForbiddenUrl('javascript:alert(1)')).toBe(true);
      expect(HtmlSanitizerHelper.isForbiddenUrl('https://example.com/image.png')).toBe(false);
    });

    it('defends against deeply nested tags (call stack overflow / ReDoS guard)', () => {
      const nestedHtml = fs.readFileSync(path.join(fixturesDir, 'nested-overflow.html'), 'utf8');
      // Should not throw RangeError: Maximum call stack size exceeded
      expect(() => {
        const result = HtmlSanitizerHelper.sanitize(nestedHtml);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('defends against empty or zero-byte uploads across all converters', async () => {
      const zeroFile = new File([], 'empty.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const valWord = await wordToPdf.validate(zeroFile);
      expect(valWord.valid).toBe(false);
      expect(valWord.error).toContain('empty or invalid');

      const zeroXml = new File([], 'empty.xml', { type: 'application/xml' });
      const valXml = await xmlToPdf.validate(zeroXml);
      expect(valXml.valid).toBe(false);

      const zeroExcel = new File([], 'empty.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const valExcel = await excelToPdf.validate(zeroExcel);
      expect(valExcel.valid).toBe(false);
    });
  });
});
