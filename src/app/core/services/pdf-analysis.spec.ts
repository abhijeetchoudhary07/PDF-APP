import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfCompareService } from './pdf-compare.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfHeaderFooterService } from './pdf-header-footer.service';
import { PdfRepairService } from './pdf-repair.service';
import { PdfExtractorService } from './pdf-extractor.service';
import { PdfRenderService } from './pdf-render.service';
import { PdfPageManagerService } from './pdf-page-manager.service';

describe('Phase 2: PDF Analysis, Privacy & Document Manipulation', () => {
  let compareService: PdfCompareService;
  let privacyService: PdfPrivacyService;
  let headerFooterService: PdfHeaderFooterService;
  let repairService: PdfRepairService;
  let extractorService: PdfExtractorService;

  beforeEach(() => {
    const renderService = new PdfRenderService();
    compareService = new PdfCompareService(renderService);

    privacyService = new PdfPrivacyService();
    headerFooterService = new PdfHeaderFooterService();
    repairService = new PdfRepairService();

    const pageManager = new PdfPageManagerService();
    extractorService = new PdfExtractorService(pageManager);
  });

  // Helper to create a test PDF with text
  async function createTestPdf(pageTexts: string[], metadata?: { title?: string; author?: string }): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    if (metadata?.title) doc.setTitle(metadata.title);
    if (metadata?.author) doc.setAuthor(metadata.author);

    for (const text of pageTexts) {
      const page = doc.addPage([595, 842]);
      page.drawText(text, { x: 50, y: 750, size: 12, font });
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  // ==========================================
  // 1. PDF COMPARE TESTS
  // ==========================================
  describe('PDF Compare Service', () => {
    it('should tokenize text correctly', () => {
      const text = 'Hello world, this is a test!';
      const tokens = compareService.tokenize(text);
      expect(tokens).toEqual(['Hello', 'world,', 'this', 'is', 'a', 'test!']);
    });

    it('should calculate similarity score between similar and distinct texts', () => {
      const textA = 'Government of India Application Form';
      const textB = 'Government of India Exam Form';
      const textC = 'Totally different content unrelated';

      const simAB = compareService.calculateSimilarity(textA, textB);
      const simAC = compareService.calculateSimilarity(textA, textC);

      expect(simAB).toBeGreaterThan(0.5);
      expect(simAC).toBeLessThan(0.2);
    });

    it('should diff text tokens identifying added and removed words', () => {
      const orig = 'The quick brown fox jumps';
      const mod = 'The fast brown fox jumps high';

      const diff = compareService.diffText(orig, mod);

      const removed = diff.filter(t => t.type === 'removed').map(t => t.value);
      const added = diff.filter(t => t.type === 'added').map(t => t.value);
      const unchanged = diff.filter(t => t.type === 'unchanged').map(t => t.value);

      expect(removed).toContain('quick');
      expect(added).toContain('fast');
      expect(added).toContain('high');
      expect(unchanged).toContain('The');
      expect(unchanged).toContain('brown');
      expect(unchanged).toContain('fox');
      expect(unchanged).toContain('jumps');
    });

    it('should align pages correctly with identical, inserted, and deleted pages', () => {
      const origPages = ['Page One content', 'Page Two content', 'Page Three content'];
      const modPages = ['Page One content', 'Inserted Page Extra', 'Page Two content'];

      const alignment = compareService.alignPages(origPages, modPages);
      expect(alignment.length).toBeGreaterThanOrEqual(3);

      // Verify page 1 aligns with page 1
      const p1Match = alignment.find(m => m.origIdx === 0 && m.modIdx === 0);
      expect(p1Match).toBeDefined();
    });

    it('should generate a formatted text comparison report', () => {
      const summary = {
        pagesCompared: 2,
        pagesIdentical: 1,
        pagesChanged: 1,
        pagesAdded: 0,
        pagesRemoved: 0,
        totalAddedWords: 3,
        totalRemovedWords: 2,
        totalChangedWords: 1,
        pageMatches: [
          {
            originalPageNumber: 1,
            modifiedPageNumber: 1,
            status: 'identical' as const,
            similarityScore: 1.0,
            addedCount: 0,
            removedCount: 0,
            changedCount: 0,
            originalText: 'Sample text',
            modifiedText: 'Sample text',
            tokens: []
          }
        ]
      };

      const report = compareService.generateTextReport(summary, 'orig.pdf', 'mod.pdf');
      expect(report).toContain('PDF COMPARISON REPORT');
      expect(report).toContain('Pages Compared:   2');
      expect(report).toContain('Words Added:      +3');
    });
  });

  // ==========================================
  // 2. PDF PRIVACY SANITIZER TESTS
  // ==========================================
  describe('PDF Privacy Sanitizer Service', () => {
    it('should scan and detect document metadata', async () => {
      const pdfBytes = await createTestPdf(['Confidential content'], {
        title: 'Secret Document',
        author: 'John Doe'
      });

      const report = await privacyService.scanPdf(pdfBytes);

      expect(report.hasMetadata).toBe(true);
      expect(report.metadataDetails['Title']).toBe('Secret Document');
      expect(report.metadataDetails['Author']).toBe('John Doe');
      expect(report.items.some(i => i.id === 'meta_author')).toBe(true);
    });

    it('should sanitize metadata and produce verified clean report', async () => {
      const pdfBytes = await createTestPdf(['Clean page content'], {
        title: 'Sensitive Title',
        author: 'Jane Doe'
      });

      const result = await privacyService.sanitizePdf(pdfBytes, {
        removeMetadata: true,
        removeComments: true,
        removeAttachments: true,
        removeForms: true,
        removeScripts: true,
        removeHiddenContent: true
      });

      expect(result.beforeReport.hasMetadata).toBe(true);
      expect(result.afterReport.hasMetadata).toBe(false);
      expect(result.afterReport.metadataDetails['Author']).toBeUndefined();
      expect(result.itemsRemovedCount).toBeGreaterThanOrEqual(1);
      expect(result.sanitizedFile).toBeDefined();
    });
  });

  // ==========================================
  // 3. HEADER & FOOTER STUDIO TESTS
  // ==========================================
  describe('PDF Header & Footer Service', () => {
    it('should resolve dynamic template placeholders accurately', () => {
      const template = 'Document: {title} | Page {page} of {totalPages} | Date: {date}';
      const resolved = headerFooterService.resolveTemplate(
        template,
        2,
        10,
        '2026-09-22',
        'sample.pdf',
        'Official Notice'
      );

      expect(resolved).toBe('Document: Official Notice | Page 2 of 10 | Date: 2026-09-22');
    });

    it('should apply header and footer across PDF pages', async () => {
      const pdfBytes = await createTestPdf(['Page 1 Body', 'Page 2 Body']);

      const result = await headerFooterService.applyHeaderFooter(
        pdfBytes,
        {
          header: { leftText: 'CONFIDENTIAL', centerText: '', rightText: '{date}' },
          footer: { leftText: '', centerText: 'Page {page} of {totalPages}', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 10,
          fontColor: '#333333',
          topMargin: 36,
          bottomMargin: 36,
          leftMargin: 40,
          rightMargin: 40,
          pageTargetMode: 'all',
          firstPageMode: 'include',
          startPageNumber: 1
        },
        'test.pdf',
        'output.pdf'
      );

      expect(result.pagesModified).toBe(2);
      expect(result.file.size).toBeGreaterThan(0);

      // Verify the resulting PDF can be loaded
      const modifiedDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(modifiedDoc.getPageCount()).toBe(2);
    });

    it('should support skip first page behavior', async () => {
      const pdfBytes = await createTestPdf(['Cover Page', 'Content Page 1', 'Content Page 2']);

      const result = await headerFooterService.applyHeaderFooter(
        pdfBytes,
        {
          header: { leftText: 'Header', centerText: '', rightText: '' },
          footer: { leftText: '', centerText: 'Page {page}', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 10,
          fontColor: '#000000',
          topMargin: 36,
          bottomMargin: 36,
          leftMargin: 40,
          rightMargin: 40,
          pageTargetMode: 'all',
          firstPageMode: 'skip',
          startPageNumber: 1
        }
      );

      // Page 1 skipped, pages 2 and 3 modified
      expect(result.pagesModified).toBe(2);
    });
  });

  // ==========================================
  // 4. PDF REPAIR & RECOVERY TESTS
  // ==========================================
  describe('PDF Repair & Recovery Service', () => {
    it('should diagnose healthy PDF correctly', async () => {
      const pdfBytes = await createTestPdf(['Sample diagnostic page']);
      const report = await repairService.diagnosePdf(pdfBytes);

      expect(report.headerValid).toBe(true);
      expect(report.xrefValid).toBe(true);
      expect(report.trailerValid).toBe(true);
      expect(report.pageCount).toBe(1);
      expect(report.validPagesCount).toBe(1);
      expect(report.overallStatus).toBe('healthy');
    });

    it('should detect missing header and startxref issues on malformed data', async () => {
      const corruptedBytes = new TextEncoder().encode('Not a valid PDF file at all');
      const report = await repairService.diagnosePdf(corruptedBytes.buffer);

      expect(report.headerValid).toBe(false);
      expect(report.overallStatus).toBe('error');
      expect(report.issues.some(i => i.code === 'HEADER_CORRUPTED')).toBe(true);
    });

    it('should safely recover pages from a valid PDF into a new structure', async () => {
      const pdfBytes = await createTestPdf(['Page A', 'Page B']);
      const result = await repairService.repairPdf(pdfBytes);

      expect(result.originalPagesCount).toBe(2);
      expect(result.recoveredPagesCount).toBe(2);
      expect(result.failedPagesCount).toBe(0);
      expect(result.recoveryLog.length).toBeGreaterThan(0);
      expect(result.recoveredFile.size).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 5. PDF CONTENT EXTRACTOR TESTS
  // ==========================================
  describe('PDF Content Extractor Service', () => {
    it('should export table data to CSV properly formatted', () => {
      const tableData = {
        id: 'tbl_1',
        pageNumber: 1,
        headers: ['Name', 'Role', 'Department'],
        rows: [
          ['Alice', 'Engineer', 'IT'],
          ['Bob', 'Manager', 'Operations']
        ],
        confidence: 0.9
      };

      const csvFile = extractorService.exportTableAsCsv(tableData, 'test.csv');
      expect(csvFile.name).toBe('test.csv');
      expect(csvFile.size).toBeGreaterThan(0);
    });

    it('should export table data to XLSX Excel file', () => {
      const tableData = {
        id: 'tbl_1',
        pageNumber: 1,
        headers: ['ID', 'Value'],
        rows: [['1', 'Alpha'], ['2', 'Beta']],
        confidence: 0.85
      };

      const xlsxFile = extractorService.exportTableAsExcel(tableData, 'test.xlsx');
      expect(xlsxFile.name).toBe('test.xlsx');
      expect(xlsxFile.size).toBeGreaterThan(0);
    });

    it('should export extracted images into a ZIP archive', async () => {
      const dummyBlob = new Blob(['fake image data'], { type: 'image/png' });
      const images = [
        {
          id: 'img_1',
          pageNumber: 1,
          format: 'png' as const,
          width: 100,
          height: 100,
          sizeBytes: 15,
          dataUrl: 'data:image/png;base64,',
          blob: dummyBlob,
          name: 'image_1.png',
          selected: true
        }
      ];

      const zipFile = await extractorService.exportImagesAsZip(images, 'test_images.zip');
      expect(zipFile.name).toBe('test_images.zip');
      expect(zipFile.size).toBeGreaterThan(0);
    });

    it('should support page extraction and export via page manager', async () => {
      const pdfBytes = await createTestPdf(['Page 1 Extracted', 'Page 2 Extracted', 'Page 3 Extracted']);
      const file = new File([pdfBytes], 'pages_doc.pdf', { type: 'application/pdf' });

      const loadRes = await extractorService.pageManager.loadDocument(file);
      expect(loadRes.success).toBe(true);
      expect(extractorService.pageManager.pages.length).toBe(3);

      const selectedPages = [
        extractorService.pageManager.pages[0],
        extractorService.pageManager.pages[2]
      ];
      const exportRes = await extractorService.pageManager.exportSinglePdf(selectedPages, 'selected_pages.pdf');

      expect(exportRes).toBeDefined();
      expect(exportRes.file).toBeDefined();
      expect(exportRes.file?.name).toBe('selected_pages.pdf');
      expect(exportRes.file?.size).toBeGreaterThan(0);

      // Verify the exported PDF contains exactly 2 pages
      const exportedDoc = await PDFDocument.load(await exportRes.file!.arrayBuffer());
      expect(exportedDoc.getPageCount()).toBe(2);
    });
  });

  // ==========================================
  // 6. ADDITIONAL EDGE CASE & LAYOUT TESTS
  // ==========================================
  describe('Layout & Edge Case Tests', () => {
    it('should handle different first page headers and footers', async () => {
      const pdfBytes = await createTestPdf(['Page 1 (Title)', 'Page 2 (Body)']);

      const result = await headerFooterService.applyHeaderFooter(
        pdfBytes,
        {
          header: { leftText: 'Header Left', centerText: 'General Header', rightText: '' },
          footer: { leftText: '', centerText: 'Page {page} of {totalPages}', rightText: '' },
          firstPageHeader: { leftText: '', centerText: 'CONFIDENTIAL COVER', rightText: '' },
          firstPageFooter: { leftText: '', centerText: 'Title Page', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 11,
          fontColor: '#1e293b',
          topMargin: 36,
          bottomMargin: 36,
          leftMargin: 40,
          rightMargin: 40,
          pageTargetMode: 'all',
          firstPageMode: 'different',
          startPageNumber: 1
        }
      );

      expect(result.pagesModified).toBe(2);
      expect(result.file.size).toBeGreaterThan(0);
    });

    it('should support custom page range targeting', async () => {
      const pdfBytes = await createTestPdf(['Page 1', 'Page 2', 'Page 3', 'Page 4']);

      const result = await headerFooterService.applyHeaderFooter(
        pdfBytes,
        {
          header: { leftText: '', centerText: 'Targeted Header', rightText: '' },
          footer: { leftText: '', centerText: 'Page {page}', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 10,
          fontColor: '#000000',
          topMargin: 30,
          bottomMargin: 30,
          leftMargin: 30,
          rightMargin: 30,
          pageTargetMode: 'custom',
          customPageRange: '2, 4',
          firstPageMode: 'include',
          startPageNumber: 1
        }
      );

      // Only pages 2 and 4 modified
      expect(result.pagesModified).toBe(2);
    });

    it('should apply header/footer to landscape pages without error', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      // Landscape: 842 x 595
      const landscapePage = doc.addPage([842, 595]);
      landscapePage.drawText('Landscape content', { x: 50, y: 500, size: 14, font });
      const landscapePdfBytes = await doc.save();

      const result = await headerFooterService.applyHeaderFooter(
        landscapePdfBytes.buffer.slice(landscapePdfBytes.byteOffset, landscapePdfBytes.byteOffset + landscapePdfBytes.byteLength) as ArrayBuffer,
        {
          header: { leftText: 'Landscape Doc', centerText: '', rightText: '{date}' },
          footer: { leftText: '', centerText: 'Page {page} of {totalPages}', rightText: '' },
          fontFamily: 'Helvetica',
          fontSize: 10,
          fontColor: '#333333',
          topMargin: 36,
          bottomMargin: 36,
          leftMargin: 40,
          rightMargin: 40,
          pageTargetMode: 'all',
          firstPageMode: 'include',
          startPageNumber: 1
        }
      );

      expect(result.pagesModified).toBe(1);
      const modifiedDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      const page = modifiedDoc.getPage(0);
      expect(page.getWidth()).toBe(842);
      expect(page.getHeight()).toBe(595);
    });
  });
});
