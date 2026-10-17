import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { BlankPageService } from './blank-page.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { BlankPageCandidate } from '../models/blank-page.types';

// Helper to create a PDF File in memory
async function createPdfFile(
  buildDoc: (doc: PDFDocument) => Promise<void>,
  fileName = 'test.pdf'
): Promise<File> {
  const doc = await PDFDocument.create();
  await buildDoc(doc);
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

describe('BlankPageService', () => {
  let service: BlankPageService;

  beforeEach(() => {
    service = new BlankPageService();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance Criteria: Core Fixtures
  // ════════════════════════════════════════════════════════════════════

  describe('Acceptance Fixtures (Default Sensitivity)', () => {
    it('Acceptance test: a truly empty page must be flagged as blank', async () => {
      const file = await createPdfFile(async doc => {
        doc.addPage([595, 842]); // completely empty page
      }, 'empty.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        threshold: service.DEFAULT_THRESHOLD
      });

      expect(report.totalPagesScanned).toBe(1);
      expect(report.blankCount).toBe(1);
      expect(report.blankCandidates.length).toBe(1);
      expect(report.blankCandidates[0].pageNumber).toBe(1);
      expect(report.blankCandidates[0].isBlank).toBe(true);
      expect(report.blankCandidates[0].hasText).toBe(false);
      expect(report.blankCandidates[0].nonWhiteRatio).toBe(0);
    });

    it('Acceptance test: a faint-text fixture must NOT be flagged at default sensitivity', async () => {
      const file = await createPdfFile(async doc => {
        const page = doc.addPage([595, 842]);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        // Faint contract clause or signature watermark
        page.drawText('Confidential Agreement — Section 4.2 Termination Clause', {
          x: 50,
          y: 750,
          size: 10,
          font,
          color: rgb(0.85, 0.85, 0.85) // faint gray text
        });
      }, 'faint_text.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        threshold: service.DEFAULT_THRESHOLD
      });

      expect(report.totalPagesScanned).toBe(1);
      // Must NOT be flagged as blank: text layer is present and non-empty!
      expect(report.blankCount).toBe(0);
      expect(report.blankCandidates.length).toBe(0);
      expect(report.candidates[0].hasText).toBe(true);
      expect(report.candidates[0].isBlank).toBe(false);
    });

    it('Acceptance test: a scanned page with speckle noise must NOT be flagged at default sensitivity', async () => {
      const file = await createPdfFile(async doc => {
        const page = doc.addPage([595, 842]);
        // Simulate scanner dust / speckle noise across the sheet (no text layer)
        for (let i = 0; i < 40; i++) {
          page.drawRectangle({
            x: 60 + (i * 17) % 450,
            y: 80 + (i * 23) % 700,
            width: 3,
            height: 3,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
      }, 'speckle_noise.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        threshold: service.DEFAULT_THRESHOLD
      });

      expect(report.totalPagesScanned).toBe(1);
      // Speckle noise produces a non-white pixel ratio > 0.001
      expect(report.candidates[0].hasText).toBe(false);
      expect(report.candidates[0].nonWhiteRatio).toBeGreaterThan(service.DEFAULT_THRESHOLD);
      // Must NOT be flagged at default sensitivity
      expect(report.blankCount).toBe(0);
      expect(report.candidates[0].isBlank).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Acceptance Criteria: Progress & Cancellation on 100-page document
  // ════════════════════════════════════════════════════════════════════

  describe('Progress and Cancellation on 100-Page Document', () => {
    it('Acceptance test: progress reports accurately across a 100-page document', async () => {
      const file = await createPdfFile(async doc => {
        for (let i = 0; i < 100; i++) {
          doc.addPage([595, 842]);
        }
      }, 'hundred_pages.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(100);

      const progressSnapshots: { current: number; total: number; percent: number }[] = [];

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        threshold: service.DEFAULT_THRESHOLD,
        onProgress: p => {
          progressSnapshots.push({
            current: p.currentPage,
            total: p.totalPages,
            percent: p.percent
          });
        }
      });

      expect(report.totalPagesScanned).toBe(100);
      expect(report.blankCount).toBe(100);
      expect(progressSnapshots.length).toBe(100);
      expect(progressSnapshots[0]).toEqual({ current: 1, total: 100, percent: 1 });
      expect(progressSnapshots[99]).toEqual({ current: 100, total: 100, percent: 100 });
    });

    it('Acceptance test: cancellation aborts scan cleanly on a 100-page document', async () => {
      const file = await createPdfFile(async doc => {
        for (let i = 0; i < 100; i++) {
          doc.addPage([595, 842]);
        }
      }, 'hundred_pages_cancel.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const abortController = new AbortController();
      let pagesScannedBeforeCancel = 0;

      await expect(
        service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
          threshold: service.DEFAULT_THRESHOLD,
          signal: abortController.signal,
          onProgress: p => {
            pagesScannedBeforeCancel = p.currentPage;
            if (p.currentPage >= 5) {
              abortController.abort();
            }
          }
        })
      ).rejects.toThrow('Blank page detection cancelled by user.');

      // Execution aborted early at or right after page 5, well before 100
      expect(pagesScannedBeforeCancel).toBeLessThan(10);
      expect(abortController.signal.aborted).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Adjustable Sensitivity & Live Recomputation
  // ════════════════════════════════════════════════════════════════════

  describe('Adjustable Sensitivity Threshold', () => {
    it('should dynamically update blank count when adjusting threshold without re-rendering', () => {
      const candidates: BlankPageCandidate[] = [
        {
          pageNumber: 1,
          pageIndex: 0,
          pageId: 'p1',
          sourceDocId: 'd1',
          sourcePageIndex: 0,
          nonWhiteRatio: 0.0, // truly blank
          hasText: false,
          isBlank: true,
          selectedForRemoval: true
        },
        {
          pageNumber: 2,
          pageIndex: 1,
          pageId: 'p2',
          sourceDocId: 'd1',
          sourcePageIndex: 1,
          nonWhiteRatio: 0.0012, // speckle noise
          hasText: false,
          isBlank: false,
          selectedForRemoval: false
        },
        {
          pageNumber: 3,
          pageIndex: 2,
          pageId: 'p3',
          sourceDocId: 'd1',
          sourcePageIndex: 2,
          nonWhiteRatio: 0.045, // normal text page
          hasText: true,
          isBlank: false,
          selectedForRemoval: false
        }
      ];

      // At default threshold 0.001 -> only page 1 is blank
      const defaultReport = service.recomputeReport(candidates, 0.001);
      expect(defaultReport.blankCount).toBe(1);
      expect(defaultReport.blankCandidates.map(c => c.pageNumber)).toEqual([1]);

      // When user increases sensitivity slider to 0.002 -> page 1 AND page 2 (speckles) become blank
      const highSensReport = service.recomputeReport(candidates, 0.002);
      expect(highSensReport.blankCount).toBe(2);
      expect(highSensReport.blankCandidates.map(c => c.pageNumber)).toEqual([1, 2]);

      // When user lowers sensitivity to strict 0.000 -> only truly 0-pixel pages
      const strictReport = service.recomputeReport(candidates, 0.0);
      expect(strictReport.blankCount).toBe(1);
      expect(strictReport.blankCandidates.map(c => c.pageNumber)).toEqual([1]);
    });

    it('should never flag a page that has text regardless of high threshold', () => {
      const candidates: BlankPageCandidate[] = [
        {
          pageNumber: 1,
          pageIndex: 0,
          pageId: 'p1',
          sourceDocId: 'd1',
          sourcePageIndex: 0,
          nonWhiteRatio: 0.0005, // low pixel ratio but real text
          hasText: true,
          textExcerpt: '1',
          isBlank: false,
          selectedForRemoval: false
        }
      ];

      // Even at very high threshold (0.05), text layer cross-check keeps it protected
      const report = service.recomputeReport(candidates, 0.05);
      expect(report.blankCount).toBe(0);
      expect(report.candidates[0].isBlank).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Review PDF Emission & Recovery
  // ════════════════════════════════════════════════════════════════════

  describe('Review PDF Emission', () => {
    it('Acceptance test: removal ALWAYS emits a valid review PDF of removed pages', async () => {
      // 4-page doc: Page 1 (Content), Page 2 (Blank), Page 3 (Content), Page 4 (Blank)
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p1 = doc.addPage([595, 842]);
        p1.drawText('Page 1 Content', { x: 50, y: 700, size: 12, font });

        doc.addPage([595, 842]); // Page 2 Blank

        const p3 = doc.addPage([595, 842]);
        p3.drawText('Page 3 Content', { x: 50, y: 700, size: 12, font });

        doc.addPage([595, 842]); // Page 4 Blank
      }, 'mixed_doc.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(4);

      // Detect blanks
      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap());
      expect(report.blankCount).toBe(2);
      expect(report.blankCandidates.map(c => c.pageNumber)).toEqual([2, 4]);

      // Create review PDF for the blank pages
      const removedPages = report.blankCandidates.map(c => mgr.pages[c.pageIndex]);
      const reviewResult = await service.createReviewPdf(
        removedPages,
        mgr.getSourceDocsMap(),
        'mixed_doc.pdf'
      );

      // Check review PDF output
      expect(reviewResult.removedCount).toBe(2);
      expect(reviewResult.reviewPdfFile.name).toBe('mixed_doc_removed_blank_pages.pdf');
      expect(reviewResult.reviewPdfBytes.length).toBeGreaterThan(0);

      // Verify the generated review PDF can be parsed and has exactly 2 pages
      const parsedReviewDoc = await PDFDocument.load(reviewResult.reviewPdfBytes);
      expect(parsedReviewDoc.getPageCount()).toBe(2);

      // Apply removal in manager
      const blankIds = report.blankCandidates.map(c => c.pageId);
      const success = mgr.removeBlankPages(blankIds, reviewResult.reviewPdfFile.name);
      expect(success).toBe(true);

      // Manager should now have 2 active pages left (Page 1 and Page 3)
      expect(mgr.pages.length).toBe(2);
      expect(mgr.pages.map(p => p.sourcePageIndex)).toEqual([0, 2]);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. Undo & Redo Integration
  // ════════════════════════════════════════════════════════════════════

  describe('Undo/Redo with PdfPageManagerService', () => {
    it('should record blank page removal as a single undoable operation that restores document state', async () => {
      const file = await createPdfFile(async doc => {
        doc.addPage([595, 842]); // Page 1 Blank
        const p2 = doc.addPage([595, 842]); // Page 2 Content
        const font = await doc.embedFont(StandardFonts.Helvetica);
        p2.drawText('Keep this page', { x: 50, y: 700, size: 12, font });
        doc.addPage([595, 842]); // Page 3 Blank
      }, 'undo_test.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(3);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap());
      expect(report.blankCount).toBe(2);

      const blankIds = report.blankCandidates.map(c => c.pageId);
      mgr.removeBlankPages(blankIds, 'review.pdf');

      expect(mgr.pages.length).toBe(1);
      expect(mgr.pages[0].displayNumber).toBe(1);
      expect(mgr.canUndo).toBe(true);

      // Undo operation
      mgr.undo();
      expect(mgr.pages.length).toBe(3);
      expect(mgr.pages.map(p => p.displayNumber)).toEqual([1, 2, 3]);

      // Redo operation
      mgr.redo();
      expect(mgr.pages.length).toBe(1);
      expect(mgr.pages[0].displayNumber).toBe(1);
    });
  });
});
