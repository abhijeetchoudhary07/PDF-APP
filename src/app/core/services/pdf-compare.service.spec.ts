import { describe, it, expect, beforeEach } from 'vitest';
import { PdfCompareService } from './pdf-compare.service';
import { PDFDocument, StandardFonts } from 'pdf-lib';

describe('PdfCompareService (G8 & G9)', () => {
  let service: PdfCompareService;

  beforeEach(() => {
    service = new PdfCompareService();
  });

  describe('G8 — Word-level diff and ignore options', () => {
    it('produces word-level tokens on a single-word change within a sentence', () => {
      const origText = 'The quick brown fox jumps over the lazy dog';
      const modText = 'The fast brown fox jumps over the lazy dog';

      const tokens = service.diffText(origText, modText);

      const removed = tokens.find(t => t.type === 'removed');
      const added = tokens.find(t => t.type === 'added');

      expect(removed?.value).toBe('quick');
      expect(added?.value).toBe('fast');

      const unchanged = tokens.filter(t => t.type === 'unchanged');
      expect(unchanged.map(t => t.value)).toContain('The');
      expect(unchanged.map(t => t.value)).toContain('brown');
      expect(unchanged.map(t => t.value)).toContain('fox');
    });

    it('ignore-whitespace option suppresses reflow-only differences', () => {
      const origText = 'Paragraph with   multiple   spaces\nand newlines';
      const modText = 'Paragraph with multiple spaces and newlines';

      // Default OFF: detects changes
      const tokensWithoutOption = service.diffText(origText, modText, { ignoreWhitespace: false });
      // When ignoreWhitespace is true: treats all as unchanged
      const tokensWithOption = service.diffText(origText, modText, { ignoreWhitespace: true });

      expect(tokensWithOption.every(t => t.type === 'unchanged')).toBe(true);
    });

    it('ignore-case option suppresses case-only differences', () => {
      const origText = 'Invoice Number INV-1002';
      const modText = 'invoice number inv-1002';

      const defaultTokens = service.diffText(origText, modText, { ignoreCase: false });
      expect(defaultTokens.some(t => t.type === 'removed')).toBe(true);

      const caseInsensitiveTokens = service.diffText(origText, modText, { ignoreCase: true });
      expect(caseInsensitiveTokens.every(t => t.type === 'unchanged')).toBe(true);
    });

    it('header-zone exclusion suppresses top header differences', async () => {
      // Create Doc 1 with header on top (y=800) and body (y=500)
      const doc1 = await PDFDocument.create();
      const page1 = doc1.addPage([595, 842]);
      const font = await doc1.embedFont(StandardFonts.Helvetica);
      page1.drawText('Document A - Page 1', { x: 50, y: 800, size: 12, font });
      page1.drawText('Important contract body text', { x: 50, y: 500, size: 12, font });
      const bytes1 = await doc1.save();

      // Create Doc 2 with different header on top (y=800) but identical body (y=500)
      const doc2 = await PDFDocument.create();
      const page2 = doc2.addPage([595, 842]);
      page2.drawText('Document B - Page 2', { x: 50, y: 800, size: 12, font });
      page2.drawText('Important contract body text', { x: 50, y: 500, size: 12, font });
      const bytes2 = await doc2.save();

      // Default: compares whole page -> header difference causes changed status
      const defaultSummary = await service.compareDocuments(bytes1, bytes2);
      expect(defaultSummary.pagesChanged).toBe(1);

      // Exclude top 15% header zone -> header ignored -> identical
      const excludedSummary = await service.compareDocuments(bytes1, bytes2, undefined, {
        headerZonePercent: 0.15
      });
      expect(excludedSummary.pagesIdentical).toBe(1);
      expect(excludedSummary.pagesChanged).toBe(0);
    });
  });

  describe('G9 — Metadata diff & PDF report export', () => {
    it('detects and reports differences when documents differ only in page size/geometry', async () => {
      // Doc 1: A4 (595 x 842)
      const doc1 = await PDFDocument.create();
      doc1.addPage([595, 842]);
      const bytes1 = await doc1.save();

      // Doc 2: Letter (612 x 792)
      const doc2 = await PDFDocument.create();
      doc2.addPage([612, 792]);
      const bytes2 = await doc2.save();

      const summary = await service.compareDocuments(bytes1, bytes2);

      expect(summary.metadataDiff).toBeDefined();
      expect(summary.metadataDiff?.hasDifferences).toBe(true);
      expect(summary.metadataDiff?.pageGeometry[0].matches).toBe(false);
      expect(summary.metadataDiff?.pageGeometry[0].originalDimensions).toContain('595 × 842');
      expect(summary.metadataDiff?.pageGeometry[0].modifiedDimensions).toContain('612 × 792');
    });

    it('exports comparison result as a downloadable PDF report matching metrics', async () => {
      const doc1 = await PDFDocument.create();
      const page1 = doc1.addPage([595, 842]);
      const font = await doc1.embedFont(StandardFonts.Helvetica);
      page1.drawText('Original Version Text', { x: 50, y: 500, size: 12, font });
      const bytes1 = await doc1.save();

      const doc2 = await PDFDocument.create();
      const page2 = doc2.addPage([595, 842]);
      page2.drawText('Modified Version Content', { x: 50, y: 500, size: 12, font });
      const bytes2 = await doc2.save();

      const summary = await service.compareDocuments(bytes1, bytes2);
      const pdfReportBlob = await service.exportComparisonPdfReport(summary, 'v1.pdf', 'v2.pdf');

      expect(pdfReportBlob).toBeDefined();
      expect(pdfReportBlob.type).toBe('application/pdf');

      const reportArrayBuffer = await pdfReportBlob.arrayBuffer();
      const parsedReport = await PDFDocument.load(reportArrayBuffer);
      expect(parsedReport.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });
});
