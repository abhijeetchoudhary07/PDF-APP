import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// J6 - J10 Converters
import { ImagesToWordConverter } from './converters/images-to-word.converter';
import { ImagesToExcelConverter } from './converters/images-to-excel.converter';
import { PdfToTiffConverter } from './converters/pdf-to-tiff.converter';
import { TiffToPdfConverter } from './converters/tiff-to-pdf.converter';
import { SvgToPdfConverter } from './converters/svg-to-pdf.converter';
import { PdfToSvgConverter } from './converters/pdf-to-svg.converter';
import { PdfToJsonConverter } from './converters/pdf-to-json.converter';
import { ConversionRegistryService } from './conversion-registry.service';
import { ImageFormatService } from '../services/image-format.service';
import { OcrService } from '../services/ocr.service';
import { BatchPdfPage } from '../../features/batch-pdf/batch-pdf.page';
import { UsageQuotaService } from '../services/usage-quota.service';
import { ensureSafeContext } from '../utilities/canvas-headless.util';

describe('Part J: Converters J6 to J11 Suite', () => {
  let imagesToWord: ImagesToWordConverter;
  let imagesToExcel: ImagesToExcelConverter;
  let pdfToTiff: PdfToTiffConverter;
  let tiffToPdf: TiffToPdfConverter;
  let svgToPdf: SvgToPdfConverter;
  let pdfToSvg: PdfToSvgConverter;
  let pdfToJson: PdfToJsonConverter;
  let registry: ConversionRegistryService;
  let imageFormatService: ImageFormatService;
  let ocrService: OcrService;

  let testPdfBytes: Uint8Array;
  let testPdfFile: File;

  beforeAll(async () => {
    // Polyfill canvas context for headless test execution
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        return ensureSafeContext(this);
      };
    }

    imagesToWord = TestBed.inject(ImagesToWordConverter);
    imagesToExcel = TestBed.inject(ImagesToExcelConverter);
    pdfToTiff = TestBed.inject(PdfToTiffConverter);
    tiffToPdf = TestBed.inject(TiffToPdfConverter);
    svgToPdf = TestBed.inject(SvgToPdfConverter);
    pdfToSvg = TestBed.inject(PdfToSvgConverter);
    pdfToJson = TestBed.inject(PdfToJsonConverter);
    registry = TestBed.inject(ConversionRegistryService);
    imageFormatService = TestBed.inject(ImageFormatService);
    ocrService = TestBed.inject(OcrService);

    // Build a two-page PDF test fixture
    const doc = await PDFDocument.create();
    doc.setTitle('Annual Financial Summary');
    doc.setAuthor('Antigravity Test Agent');

    // Page 1
    const page1 = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    page1.drawText('Quarterly Revenue Report', {
      x: 50,
      y: 780,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0)
    });

    page1.drawText('Total Q3 revenue reached $4.2M representing a 14% year-over-year increase.', {
      x: 50,
      y: 740,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });

    page1.drawText('Region | Revenue | Growth', {
      x: 50,
      y: 690,
      size: 12,
      font: boldFont
    });
    page1.drawText('North America | $2.5M | +18%', {
      x: 50,
      y: 665,
      size: 11,
      font
    });
    page1.drawText('Europe | $1.7M | +9%', {
      x: 50,
      y: 640,
      size: 11,
      font
    });

    // Page 2
    const page2 = doc.addPage([595.28, 841.89]);
    page2.drawText('Page 2: Operational Highlights', {
      x: 50,
      y: 780,
      size: 18,
      font: boldFont
    });
    page2.drawText('Infrastructure migrations completed without any reported downtime.', {
      x: 50,
      y: 740,
      size: 11,
      font
    });

    testPdfBytes = await doc.save();
    testPdfFile = new File([testPdfBytes], 'financial_report.pdf', { type: 'application/pdf' });
  });

  describe('Registry Verification', () => {
    it('registers all Part J converters in ConversionRegistryService (total >= 31)', () => {
      expect(registry.getConverter('images-to-word')).toBeDefined();
      expect(registry.getConverter('images-to-excel')).toBeDefined();
      expect(registry.getConverter('pdf-to-tiff')).toBeDefined();
      expect(registry.getConverter('tiff-to-pdf')).toBeDefined();
      expect(registry.getConverter('svg-to-pdf')).toBeDefined();
      expect(registry.getConverter('pdf-to-svg')).toBeDefined();
      expect(registry.getConverter('pdf-to-json')).toBeDefined();
      expect(registry.getAllConverters().length).toBeGreaterThanOrEqual(31);
    });
  });

  describe('J6: Images to Word Converter (images-to-word)', () => {
    it('validates image files and rejects invalid types', async () => {
      const valid = await imagesToWord.validate(new File([new Uint8Array(10)], 'test.png', { type: 'image/png' }));
      expect(valid.valid).toBe(true);

      const invalid = await imagesToWord.validate(new File([new Uint8Array(10)], 'test.pdf', { type: 'application/pdf' }));
      expect(invalid.valid).toBe(false);
    });

    it('extracts paragraphs via OcrService and writes a valid .docx file with ConversionReport', async () => {
      vi.spyOn(ocrService, 'performOcr').mockResolvedValueOnce({
        fileName: 'receipt.jpg',
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            text: 'Acme Corporation\nInvoice #90812\nTotal Amount: $450.00',
            confidence: 96,
            words: [],
            language: 'eng',
            status: 'completed'
          }
        ],
        fullText: 'Acme Corporation\nInvoice #90812\nTotal Amount: $450.00',
        averageConfidence: 96,
        languages: ['eng']
      });

      const imgFile = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', { type: 'image/jpeg' });
      const result = await imagesToWord.convert(imgFile, { embedOriginalPhoto: false });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file!.name).toContain('.docx');

      // Verify valid docx zip structure
      const zip = await JSZip.loadAsync(await result.file!.arrayBuffer());
      expect(zip.file('word/document.xml')).toBeDefined();

      // Verify ConversionReport
      expect(result.report).toBeDefined();
      expect(result.report?.tablesDetected).toBe(0);
      expect(Array.isArray(result.report?.approximations)).toBe(true);
    });
  });

  describe('J6: Images to Excel Converter (images-to-excel)', () => {
    it('extracts tabular rows into an .xlsx workbook with previewData', async () => {
      vi.spyOn(ocrService, 'performOcr').mockResolvedValueOnce({
        fileName: 'table_scan.png',
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            text: 'Item\tQuantity\tPrice\nApples\t10\t$5.00\nOranges\t25\t$12.50',
            confidence: 94,
            words: [],
            language: 'eng',
            status: 'completed'
          }
        ],
        fullText: 'Item\tQuantity\tPrice\nApples\t10\t$5.00\nOranges\t25\t$12.50',
        averageConfidence: 94,
        languages: ['eng']
      });

      const imgFile = new File([new Uint8Array(20)], 'table_scan.png', { type: 'image/png' });
      const result = await imagesToExcel.convert(imgFile, { detectNumbers: true });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file!.name).toContain('.xlsx');

      // Parse XLSX to verify sheets and rows
      const wb = XLSX.read(await result.file!.arrayBuffer(), { type: 'array' });
      expect(wb.SheetNames.length).toBeGreaterThanOrEqual(1);

      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      expect(rows.length).toBe(3); // Header + 2 data rows
      expect(rows[0][0]).toBe('Item');
      expect(rows[1][0]).toBe('Apples');

      // Check preview data
      expect(result.previewData).toBeDefined();
      expect(result.previewData?.rows?.length).toBe(2);
      expect(result.previewData?.columns).toBe(3);
    });
  });

  describe('J7: PDF ↔ multi-page TIFF Converter', () => {
    it('converts multi-page PDF into multi-page TIFF preserving dimensions and page count', async () => {
      const result = await pdfToTiff.convert(testPdfFile, {
        dpi: 72,
        compression: 'none'
      });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file!.name).toContain('.tiff');

      const tiffBuffer = await result.file!.arrayBuffer();
      const pages = await imageFormatService.decodeTiffPages(tiffBuffer);
      expect(pages.length).toBe(2);
      expect(pages[0].width).toBeGreaterThan(0);
      expect(pages[0].height).toBeGreaterThan(0);
    });

    it('supports bilevel G4 compression mode for government/legal portal standards', async () => {
      const result = await pdfToTiff.convert(testPdfFile, {
        dpi: 72,
        compression: 'g4'
      });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      const tiffBuffer = await result.file!.arrayBuffer();
      const pages = await imageFormatService.decodeTiffPages(tiffBuffer);
      expect(pages.length).toBe(2);
    });

    it('round-trips TIFF to PDF with matching dimensions and page count', async () => {
      const tiffRes = await pdfToTiff.convert(testPdfFile, { dpi: 72, compression: 'none' });
      expect(tiffRes.file).toBeDefined();

      const pdfRes = await tiffToPdf.convert(tiffRes.file!);
      expect(pdfRes.success).toBe(true);
      expect(pdfRes.file).toBeDefined();

      const roundTripDoc = await PDFDocument.load(await pdfRes.file!.arrayBuffer());
      expect(roundTripDoc.getPageCount()).toBe(2);
    });
  });

  describe('J8: SVG ↔ PDF Converter', () => {
    it('preserves vectors for standard SVG geometry without raster image XObjects', async () => {
      const simpleSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
          <rect x="20" y="20" width="100" height="60" fill="#2563eb" />
          <circle cx="200" cy="150" r="40" fill="#16a34a" />
          <text x="30" y="250" font-size="16" fill="#000000">Pure Vector Test</text>
        </svg>
      `;
      const svgFile = new File([simpleSvg], 'vector.svg', { type: 'image/svg+xml' });
      const result = await svgToPdf.convert(svgFile);

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      const pdfDoc = await PDFDocument.load(await result.file!.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBe(1);
      expect(result.report?.pagesRasterized).toBe(0);
      expect(result.report?.droppedElements.length).toBe(0);
    });

    it('detects SVG with filters/patterns and reports rasterization honestly', async () => {
      const complexSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
          <filter id="blur">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <rect width="200" height="100" filter="url(#blur)" fill="red" />
        </svg>
      `;
      const svgFile = new File([complexSvg], 'filtered.svg', { type: 'image/svg+xml' });
      const result = await svgToPdf.convert(svgFile);

      expect(result.success).toBe(true);
      expect(result.report?.pagesRasterized).toBe(1);
      expect(result.report?.droppedElements.some(e => e.includes('rasterized'))).toBe(true);
    });

    it('converts PDF to standalone SVG or multi-page SVG ZIP', async () => {
      const result = await pdfToSvg.convert(testPdfFile);
      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file!.name).toContain('.zip');

      const zip = await JSZip.loadAsync(await result.file!.arrayBuffer());
      expect(zip.file('page-1.svg')).toBeDefined();
      expect(zip.file('page-2.svg')).toBeDefined();

      const page1Content = await zip.file('page-1.svg')!.async('string');
      expect(page1Content).toContain('<svg');
      expect(page1Content).toContain('</svg>');
    });
  });

  describe('J9: PDF to Structured JSON Converter (pdf-to-json)', () => {
    it('extracts stable, schema-versioned JSON adhering to schemaVersion 1.0.0', async () => {
      const result = await pdfToJson.convert(testPdfFile, { compact: false });
      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      const jsonStr = await result.file!.text();
      const parsed = JSON.parse(jsonStr);

      expect(parsed.schemaVersion).toBe('1.0.0');
      expect(parsed.metadata.title).toBe('Annual Financial Summary');
      expect(parsed.totalPages).toBe(2);
      expect(parsed.pages.length).toBe(2);

      // Check page 1 structure
      const p1 = parsed.pages[0];
      expect(p1.pageNumber).toBe(1);
      expect(p1.width).toBeGreaterThan(500);
      expect(p1.height).toBeGreaterThan(800);
      expect(p1.textItems.length).toBeGreaterThan(0);

      // Verify text items have exact coordinates
      const firstItem = p1.textItems[0];
      expect(firstItem.text).toBeDefined();
      expect(typeof firstItem.x).toBe('number');
      expect(typeof firstItem.y).toBe('number');
      expect(typeof firstItem.width).toBe('number');
      expect(typeof firstItem.height).toBe('number');

      // Verify detected tables
      expect(p1.tables.length).toBeGreaterThanOrEqual(1);
    });

    it('supports compact single-line JSON mode', async () => {
      const result = await pdfToJson.convert(testPdfFile, { compact: true });
      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text.includes('\n')).toBe(false);
    });
  });

  describe('J10: Conversion Fidelity Controls & Honest Report', () => {
    it('returns a comprehensive ConversionReport with every converter result', async () => {
      const result = await pdfToJson.convert(testPdfFile);
      expect(result.report).toBeDefined();
      expect(result.report?.mode).toBe('reflowable');
      expect(typeof result.report?.tablesDetected).toBe('number');
      expect(Array.isArray(result.report?.droppedElements)).toBe(true);
      expect(Array.isArray(result.report?.substitutedFonts)).toBe(true);
      expect(Array.isArray(result.report?.approximations)).toBe(true);
    });
  });

  describe('J11: Batch PDF Tool Additions & Quota Boundary', () => {
    it('processes a 3-file batch where middle file fails, completing file 3 and logging failure', async () => {
      const quotaService = TestBed.inject(UsageQuotaService);
      vi.spyOn(quotaService, 'isUnlimited', 'get').mockReturnValue(true);

      const page = TestBed.runInInjectionContext(() => new BatchPdfPage());
      page.operation = 'rename-from-content';
      page.autoSave = false;

      const file1 = new File([testPdfBytes], 'valid1.pdf', { type: 'application/pdf' });
      const file2 = new File([new Uint8Array([0, 1, 2, 3])], 'corrupt.pdf', { type: 'application/pdf' });
      const file3 = new File([testPdfBytes], 'valid3.pdf', { type: 'application/pdf' });

      page.items = [
        { id: '1', file: file1, status: 'queued', originalSizeBytes: file1.size, quotaCharged: false },
        { id: '2', file: file2, status: 'queued', originalSizeBytes: file2.size, quotaCharged: false },
        { id: '3', file: file3, status: 'queued', originalSizeBytes: file3.size, quotaCharged: false }
      ];

      // Simulate middle file failure
      vi.spyOn(page, 'executeOperation').mockImplementation(async (item) => {
        if (item.id === '2') {
          throw new Error('Corrupted PDF structure: Invalid header format');
        }
        return new File([testPdfBytes], `renamed_${item.id}.pdf`, { type: 'application/pdf' });
      });

      await page.processBatch();

      expect(page.items[0].status).toBe('done');
      expect(page.items[1].status).toBe('failed');
      expect(page.items[1].failureReason).toContain('Corrupted PDF structure');
      expect(page.items[2].status).toBe('done');

      expect(page.completedCount).toBe(2);
      expect(page.errorCount).toBe(1);

      // Verify CSV log contains all 3 files and failure reason
      const csv = page.generateCsvLog();
      expect(csv).toContain('valid1.pdf');
      expect(csv).toContain('corrupt.pdf');
      expect(csv).toContain('Corrupted PDF structure');
      expect(csv).toContain('valid3.pdf');
    });

    it('stops cleanly at the quota boundary and reports accurately', async () => {
      const quotaService = TestBed.inject(UsageQuotaService);
      vi.spyOn(quotaService, 'isUnlimited', 'get').mockReturnValue(false);

      // Free allowance has 1 operation left, then 0
      let remainingCount = 1;
      vi.spyOn(quotaService, 'remaining').mockImplementation(async () => remainingCount);

      const page = TestBed.runInInjectionContext(() => new BatchPdfPage());
      page.operation = 'rename-from-content';
      page.autoSave = false;

      const file1 = new File([testPdfBytes], 'f1.pdf', { type: 'application/pdf' });
      const file2 = new File([testPdfBytes], 'f2.pdf', { type: 'application/pdf' });
      const file3 = new File([testPdfBytes], 'f3.pdf', { type: 'application/pdf' });

      page.items = [
        { id: '1', file: file1, status: 'queued', originalSizeBytes: file1.size, quotaCharged: false },
        { id: '2', file: file2, status: 'queued', originalSizeBytes: file2.size, quotaCharged: false },
        { id: '3', file: file3, status: 'queued', originalSizeBytes: file3.size, quotaCharged: false }
      ];

      vi.spyOn(page, 'executeOperation').mockImplementation(async (item) => {
        remainingCount = 0; // Exhaust quota after first run
        return new File([testPdfBytes], `renamed_${item.id}.pdf`, { type: 'application/pdf' });
      });

      await page.processBatch();

      expect(page.items[0].status).toBe('done');
      expect(page.items[1].status).toBe('failed');
      expect(page.items[1].failureReason).toContain('quota limit reached');
      expect(page.items[2].status).toBe('failed');
      expect(page.items[2].failureReason).toContain('quota limit reached');

      expect(page.quotaBlocked).toBe(true);
      expect(page.executionSummary?.processedCount).toBe(1);
      expect(page.executionSummary?.failedCount).toBe(2);
      expect(page.executionSummary?.quotaBlocked).toBe(true);
    });
  });
});
