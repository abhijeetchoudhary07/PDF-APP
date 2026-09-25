import '../utilities/pdf-iterator-polyfill';

import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ConversionRegistryService } from './conversion-registry.service';
import { PdfLayoutHelper } from './utils/pdf-layout.helper';
import { HtmlSanitizerHelper } from './utils/html-sanitizer.helper';
import { CsvParserHelper } from './utils/csv-parser.helper';
import { RtfParserHelper } from './utils/rtf-parser.helper';

// Converters
import { PdfToPngConverter } from './converters/pdf-to-png.converter';
import { PdfToWordConverter } from './converters/pdf-to-word.converter';
import { PdfToExcelConverter } from './converters/pdf-to-excel.converter';
import { PdfToPptConverter } from './converters/pdf-to-ppt.converter';
import { WordToPdfConverter } from './converters/word-to-pdf.converter';
import { ExcelToPdfConverter } from './converters/excel-to-pdf.converter';
import { PptToPdfConverter } from './converters/ppt-to-pdf.converter';
import { TextToPdfConverter } from './converters/text-to-pdf.converter';
import { RtfToPdfConverter } from './converters/rtf-to-pdf.converter';
import { HtmlToPdfConverter } from './converters/html-to-pdf.converter';
import { CsvToPdfConverter } from './converters/csv-to-pdf.converter';
import { EpubToPdfConverter } from './converters/epub-to-pdf.converter';
import { ZipToPdfConverter } from './converters/zip-to-pdf.converter';
import { OpenDocumentToPdfConverter } from './converters/opendocument-to-pdf.converter';
import { PagesToPdfConverter } from './converters/pages-to-pdf.converter';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

describe('Conversion Architecture — Phase 1', () => {
  /*
   * Resolved from TestBed, not constructed by hand.
   *
   * The registry takes all fifteen converters through `inject()`, so building
   * it with `new` would throw; asking the injector for each converter as well
   * means the specs below assert against the same instances the registry holds.
   */
  let registry: ConversionRegistryService;
  let pdfToPng: PdfToPngConverter;
  let pdfToWord: PdfToWordConverter;
  let pdfToExcel: PdfToExcelConverter;
  let pdfToPpt: PdfToPptConverter;
  let wordToPdf: WordToPdfConverter;
  let excelToPdf: ExcelToPdfConverter;
  let pptToPdf: PptToPdfConverter;
  let textToPdf: TextToPdfConverter;
  let rtfToPdf: RtfToPdfConverter;
  let htmlToPdf: HtmlToPdfConverter;
  let csvToPdf: CsvToPdfConverter;
  let epubToPdf: EpubToPdfConverter;
  let zipToPdf: ZipToPdfConverter;
  let openDocToPdf: OpenDocumentToPdfConverter;
  let pagesToPdf: PagesToPdfConverter;

  beforeAll(() => {
    registry = TestBed.inject(ConversionRegistryService);
    pdfToPng = TestBed.inject(PdfToPngConverter);
    pdfToWord = TestBed.inject(PdfToWordConverter);
    pdfToExcel = TestBed.inject(PdfToExcelConverter);
    pdfToPpt = TestBed.inject(PdfToPptConverter);
    wordToPdf = TestBed.inject(WordToPdfConverter);
    excelToPdf = TestBed.inject(ExcelToPdfConverter);
    pptToPdf = TestBed.inject(PptToPdfConverter);
    textToPdf = TestBed.inject(TextToPdfConverter);
    rtfToPdf = TestBed.inject(RtfToPdfConverter);
    htmlToPdf = TestBed.inject(HtmlToPdfConverter);
    csvToPdf = TestBed.inject(CsvToPdfConverter);
    epubToPdf = TestBed.inject(EpubToPdfConverter);
    zipToPdf = TestBed.inject(ZipToPdfConverter);
    openDocToPdf = TestBed.inject(OpenDocumentToPdfConverter);
    pagesToPdf = TestBed.inject(PagesToPdfConverter);
  });

  describe('ConversionRegistryService', () => {
    it('should register all 15 converters', () => {
      const all = registry.getAllConverters();
      expect(all.length).toBe(15);
    });

    it('should categorize converters correctly', () => {
      const pdfToFormat = registry.getConvertersByCategory('pdf-to-format');
      const formatToPdf = registry.getConvertersByCategory('format-to-pdf');

      expect(pdfToFormat.length).toBe(4); // PDF to PNG, Word, Excel, PPT
      expect(formatToPdf.length).toBe(11); // Word, Excel, PPT, TXT, RTF, HTML, CSV, EPUB, ZIP, OpenDoc, Pages
    });

    it('should retrieve converters by ID', () => {
      expect(registry.getConverter('pdf-to-png')).toBeDefined();
      expect(registry.getConverter('pdf-to-word')).toBeDefined();
      expect(registry.getConverter('pdf-to-excel')).toBeDefined();
      expect(registry.getConverter('pdf-to-ppt')).toBeDefined();
      expect(registry.getConverter('word-to-pdf')).toBeDefined();
      expect(registry.getConverter('excel-to-pdf')).toBeDefined();
      expect(registry.getConverter('ppt-to-pdf')).toBeDefined();
      expect(registry.getConverter('text-to-pdf')).toBeDefined();
      expect(registry.getConverter('rtf-to-pdf')).toBeDefined();
      expect(registry.getConverter('html-to-pdf')).toBeDefined();
      expect(registry.getConverter('csv-to-pdf')).toBeDefined();
      expect(registry.getConverter('epub-to-pdf')).toBeDefined();
      expect(registry.getConverter('zip-to-pdf')).toBeDefined();
      expect(registry.getConverter('opendocument-to-pdf')).toBeDefined();
      expect(registry.getConverter('pages-to-pdf')).toBeDefined();
    });
  });

  describe('HtmlSanitizerHelper', () => {
    it('should strip script tags and onload handlers', () => {
      const maliciousHtml = `<div><h1>Title</h1><script>alert('xss')</script><img src="x" onerror="alert(1)"><p>Safe text</p></div>`;
      const cleanHtml = HtmlSanitizerHelper.sanitize(maliciousHtml);

      expect(cleanHtml).not.toContain('<script>');
      expect(cleanHtml).not.toContain('onerror');
      expect(cleanHtml).toContain('Title');
      expect(cleanHtml).toContain('Safe text');
    });

    it('should extract structured plain text with preserved paragraphs', () => {
      const html = `<h1>Document Header</h1><p>First paragraph.</p><p>Second paragraph.</p>`;
      const text = HtmlSanitizerHelper.extractStructuredText(html);

      expect(text).toContain('Document Header');
      expect(text).toContain('First paragraph.');
      expect(text).toContain('Second paragraph.');
    });
  });

  describe('CsvParserHelper', () => {
    it('should parse simple comma-separated CSV', () => {
      const csv = `Name,Age,City\nAlice,30,New York\nBob,25,San Francisco`;
      const parsed = CsvParserHelper.parse(csv);

      expect(parsed.headers).toEqual(['Name', 'Age', 'City']);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows[0]).toEqual(['Alice', '30', 'New York']);
      expect(parsed.rows[1]).toEqual(['Bob', '25', 'San Francisco']);
    });

    it('should handle quoted fields with commas and escaped quotes', () => {
      const csv = `"Full Name","Address, State","Notes"\n"Smith, John","123 Main St, CA","He said ""Hello"""`;
      const parsed = CsvParserHelper.parse(csv);

      expect(parsed.headers).toEqual(['Full Name', 'Address, State', 'Notes']);
      expect(parsed.rows[0][0]).toBe('Smith, John');
      expect(parsed.rows[0][1]).toBe('123 Main St, CA');
      expect(parsed.rows[0][2]).toBe('He said "Hello"');
    });

    it('should auto-detect tab delimiter', () => {
      const tsv = `Col1\tCol2\tCol3\nVal1\tVal2\tVal3`;
      const parsed = CsvParserHelper.parse(tsv);

      expect(parsed.delimiter).toBe('\t');
      expect(parsed.headers).toEqual(['Col1', 'Col2', 'Col3']);
      expect(parsed.rows[0]).toEqual(['Val1', 'Val2', 'Val3']);
    });
  });

  describe('RtfParserHelper', () => {
    it('should parse RTF control words and format spans', () => {
      const rtf = `{\\rtf1\\ansi\\b Bold Title\\b0\\par Regular paragraph text.}`;
      const paras = RtfParserHelper.parse(rtf);

      expect(paras.length).toBeGreaterThanOrEqual(1);
      const plainText = RtfParserHelper.toPlainText(paras);
      expect(plainText).toContain('Bold Title');
      expect(plainText).toContain('Regular paragraph text.');
    });
  });

  describe('PdfLayoutHelper', () => {
    it('should calculate page dimensions for A4 and Letter in portrait and landscape', () => {
      const a4Portrait = PdfLayoutHelper.getPageDimensions('A4', 'Portrait');
      expect(a4Portrait.width).toBeCloseTo(595.28, 1);
      expect(a4Portrait.height).toBeCloseTo(841.89, 1);

      const a4Landscape = PdfLayoutHelper.getPageDimensions('A4', 'Landscape');
      expect(a4Landscape.width).toBeCloseTo(841.89, 1);
      expect(a4Landscape.height).toBeCloseTo(595.28, 1);

      const letterPortrait = PdfLayoutHelper.getPageDimensions('Letter', 'Portrait');
      expect(letterPortrait.width).toBe(612);
      expect(letterPortrait.height).toBe(792);
    });
  });

  describe('TextToPdfConverter', () => {
    it('should convert text to a valid PDF', async () => {
      const sampleText = 'Hello World!\nThis is an offline document conversion test.\n\nParagraph 2.';
      const dummyFile = new File([''], 'test.txt', { type: 'text/plain' });

      const result = await textToPdf.convert(dummyFile, { rawText: sampleText });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file?.type).toBe('application/pdf');
      expect(result.file?.name).toBe('test.pdf');
      expect(result.previewData?.characterCount).toBe(sampleText.length);
    });
  });

  describe('CsvToPdfConverter', () => {
    it('should convert CSV to a tabular PDF', async () => {
      const csvData = `ID,Product,Price,Quantity\n1,Laptop,999,5\n2,Mouse,25,50\n3,Keyboard,75,30`;
      const file = new File([csvData], 'products.csv', { type: 'text/csv' });

      const result = await csvToPdf.convert(file);

      expect(result.success).toBe(true);
      expect(result.file?.type).toBe('application/pdf');
      expect(result.previewData?.totalRows).toBe(3);
      expect(result.previewData?.totalColumns).toBe(4);
      expect(result.previewData?.headers).toEqual(['ID', 'Product', 'Price', 'Quantity']);
    });
  });

  describe('HtmlToPdfConverter', () => {
    it('should convert sanitized HTML to PDF', async () => {
      const html = `<html><body><h1>Invoice #1024</h1><p>Customer: John Doe</p><p>Total: $1,250</p></body></html>`;
      const file = new File([html], 'invoice.html', { type: 'text/html' });

      const result = await htmlToPdf.convert(file);

      expect(result.success).toBe(true);
      expect(result.file?.type).toBe('application/pdf');
      expect(result.previewData?.pageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RtfToPdfConverter', () => {
    it('should convert RTF to PDF', async () => {
      const rtf = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Helvetica;}}\\f0\\fs24 \\b Important Notice\\b0\\par This document has been converted from RTF.}`;
      const file = new File([rtf], 'notice.rtf', { type: 'application/rtf' });

      const result = await rtfToPdf.convert(file);

      expect(result.success).toBe(true);
      expect(result.file?.type).toBe('application/pdf');
      expect(result.previewData?.paragraphCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ZipToPdfConverter', () => {
    it('should inspect ZIP and compile supported files into PDF', async () => {
      const zip = new JSZip();
      zip.file('readme.txt', 'This is a test readme file inside zip.');
      zip.file('data.csv', 'ColA,ColB\n1,2\n3,4');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'bundle.zip', { type: 'application/zip' });

      const entries = await zipToPdf.inspectZip(zipFile);
      expect(entries.length).toBe(2);
      expect(entries.every(e => e.supported)).toBe(true);

      const result = await zipToPdf.convert(zipFile);
      expect(result.success).toBe(true);
      expect(result.file?.type).toBe('application/pdf');
      expect(result.previewData?.compiledFilesCount).toBe(2);
    });
  });

  describe('PagesToPdfConverter', () => {
    it('should extract embedded QuickLook/Preview.pdf when present', async () => {
      // Create a mock Apple Pages package with QuickLook/Preview.pdf
      const zip = new JSZip();
      const mockPdfDoc = await PDFDocument.create();
      mockPdfDoc.addPage([500, 500]);
      const pdfBytes = await mockPdfDoc.save();

      zip.file('QuickLook/Preview.pdf', pdfBytes);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const pagesFile = new File([zipBlob], 'Document.pages', { type: 'application/x-iwork-pages-sffpages' });

      const result = await pagesToPdf.convert(pagesFile);
      expect(result.success).toBe(true);
      expect(result.previewData?.source).toBe('Embedded Native QuickLook PDF');
    });

    it('should provide clear, helpful guidance when no preview is embedded', async () => {
      const zip = new JSZip();
      zip.file('Index/Document.iwa', new Uint8Array([1, 2, 3])); // Proprietary iWork without preview
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const pagesFile = new File([zipBlob], 'Unpreviewed.pages', { type: 'application/x-iwork-pages-sffpages' });

      const result = await pagesToPdf.convert(pagesFile);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Apple Pages');
      expect(result.error).toContain('Export To > PDF');
    });
  });

  describe('Validation handling across converters', () => {
    it('should reject empty files', async () => {
      const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
      const val = await pdfToPng.validate(emptyFile);
      expect(val.valid).toBe(false);
    });

    it('should reject non-PDF file for PDF converters', async () => {
      const textFile = new File(['some text'], 'doc.txt', { type: 'text/plain' });
      const val = await pdfToWord.validate(textFile);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('PDF');
    });

    it('should reject legacy binary .doc with clear guidance', async () => {
      const docFile = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'old.doc', { type: 'application/msword' });
      const val = await wordToPdf.validate(docFile);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('Legacy binary Word');
    });

    it('should reject legacy binary .ppt with clear guidance', async () => {
      const pptFile = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'old.ppt', { type: 'application/vnd.ms-powerpoint' });
      const val = await pptToPdf.validate(pptFile);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('Legacy binary PowerPoint');
    });
  });
});
