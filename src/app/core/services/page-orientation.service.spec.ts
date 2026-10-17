import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { PageOrientationService } from './page-orientation.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { PageOrientationAngle } from '../models/page-orientation.types';

// Helper to create in-memory PDF File
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

describe('PageOrientationService', () => {
  let service: PageOrientationService;

  beforeEach(() => {
    service = new PageOrientationService();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Acceptance Criteria: Pure Angle-Decision Function (0/90/180/270)
  // ════════════════════════════════════════════════════════════════════

  describe('Pure Angle-Decision Function (0/90/180/270)', () => {
    it('Acceptance test: 0° fixture (normal horizontal text) is detected as upright', () => {
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'Standard horizontal reading line of text in English', transform: [12, 0, 0, 12, 50, 700] },
          { str: 'Second paragraph continuing horizontal flow on page', transform: [12, 0, 0, 12, 50, 680] }
        ],
        currentRotation: 0
      });

      expect(decision.detectedAngle).toBe(0);
      expect(decision.suggestedRotation).toBe(0);
      expect(decision.alreadyUpright).toBe(true);
      expect(decision.needsManualReview).toBe(false);
      expect(decision.confidence).toBe(1.0);
    });

    it('Acceptance test: 90° fixture (rotated text pointing up) suggests 90° clockwise rotation', () => {
      // At 90°, cos(90) = 0, sin(90) = 1. Transform: [0, 12, -12, 0, 100, 100]
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'This document was scanned or printed sideways at ninety degrees', transform: [0, 12, -12, 0, 100, 100] }
        ],
        currentRotation: 0
      });

      expect(decision.detectedAngle).toBe(90);
      expect(decision.suggestedRotation).toBe(90);
      expect(decision.alreadyUpright).toBe(false);
      expect(decision.needsManualReview).toBe(false);
      expect(decision.confidence).toBe(1.0);
    });

    it('Acceptance test: 180° fixture (upside-down text) suggests 180° rotation', () => {
      // At 180°, cos(180) = -1, sin(180) = 0. Transform: [-12, 0, 0, -12, 500, 500]
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'This page was inserted upside down into the sheet feeder', transform: [-12, 0, 0, -12, 500, 500] }
        ],
        currentRotation: 0
      });

      expect(decision.detectedAngle).toBe(180);
      expect(decision.suggestedRotation).toBe(180);
      expect(decision.alreadyUpright).toBe(false);
      expect(decision.needsManualReview).toBe(false);
      expect(decision.confidence).toBe(1.0);
    });

    it('Acceptance test: 270° fixture (rotated text pointing down) suggests 270° clockwise rotation', () => {
      // At 270°, cos(270) = 0, sin(270) = -1. Transform: [0, -12, 12, 0, 400, 700]
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'Text running vertically downwards at two hundred seventy degrees', transform: [0, -12, 12, 0, 400, 700] }
        ],
        currentRotation: 0
      });

      expect(decision.detectedAngle).toBe(270);
      expect(decision.suggestedRotation).toBe(270);
      expect(decision.alreadyUpright).toBe(false);
      expect(decision.needsManualReview).toBe(false);
      expect(decision.confidence).toBe(1.0);
    });

    it('should correctly account for existing page visual rotation', () => {
      // Text stream is at 90°, but page is ALREADY rotated by 90° CW in the viewer
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'Text stream was created at 90 degrees but page is rotated 90', transform: [0, 12, -12, 0, 100, 100] }
        ],
        currentRotation: 90
      });

      // Visual angle on screen is (90 - 90) = 0° (upright!)
      expect(decision.detectedAngle).toBe(0);
      expect(decision.suggestedRotation).toBe(0);
      expect(decision.alreadyUpright).toBe(true);
      expect(decision.needsManualReview).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Acceptance Criteria: Blank & Near-Blank Pages
  // ════════════════════════════════════════════════════════════════════

  describe('Blank & Near-Blank Page Acceptance', () => {
    it('Acceptance test: A blank page lands in the manual-review group, not the rotated set', async () => {
      const file = await createPdfFile(async doc => {
        doc.addPage([595, 842]); // Completely blank page
      }, 'empty.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(1);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        enableOcrFallback: false
      });

      // Must be in manual review group!
      expect(report.manualReview.length).toBe(1);
      expect(report.toRotate.length).toBe(0);
      expect(report.alreadyUpright.length).toBe(0);

      const item = report.manualReview[0];
      expect(item.needsManualReview).toBe(true);
      expect(item.selectedForRotation).toBe(false);
      expect(item.isNearBlank).toBe(true);
      expect(item.confidence).toBe(0);
    });

    it('Acceptance test: Insufficient text length without OCR lands in manual review', () => {
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'Page 1', transform: [10, 0, 0, 10, 100, 100] } // only 6 chars, < minTextLength 10
        ],
        currentRotation: 0,
        minTextLength: 10
      });

      expect(decision.needsManualReview).toBe(true);
      expect(decision.confidence).toBe(0);
      expect(decision.suggestedRotation).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Low-Confidence & Mixed Text Orientations
  // ════════════════════════════════════════════════════════════════════

  describe('Low-Confidence and Conflicting Orientations', () => {
    it('Acceptance test: Conflicting text orientations below threshold land in manual review', () => {
      // 50 chars at 0°, 50 chars at 90° (50% dominant < 70% threshold)
      const decision = service.decidePageOrientation({
        textItems: [
          { str: '12345678901234567890123456789012345678901234567890', transform: [10, 0, 0, 10, 50, 50] },
          { str: 'ABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJ', transform: [0, 10, -10, 0, 100, 100] }
        ],
        currentRotation: 0,
        confidenceThreshold: 0.70
      });

      expect(decision.needsManualReview).toBe(true);
      expect(decision.confidence).toBe(0.5);
      expect(decision.alreadyUpright).toBe(false);
    });

    it('Dominant text above threshold passes high-confidence even with small perpendicular headers', () => {
      // 90 chars at 0°, 10 chars at 90° (90% dominant >= 70% threshold)
      const decision = service.decidePageOrientation({
        textItems: [
          { str: 'Main text body content spanning multiple full sentences and paragraphs with ample character count.', transform: [10, 0, 0, 10, 50, 50] },
          { str: 'Col Header', transform: [0, 10, -10, 0, 100, 100] }
        ],
        currentRotation: 0,
        confidenceThreshold: 0.70
      });

      expect(decision.needsManualReview).toBe(false);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.70);
      expect(decision.alreadyUpright).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. End-to-End Multi-Page PDF Fixture Analysis
  // ════════════════════════════════════════════════════════════════════

  describe('End-to-End Multi-Page PDF Analysis', () => {
    it('correctly analyzes a 4-page PDF with 0°, 90°, 180°, and blank pages', async () => {
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);

        // Page 1: 0° Upright
        const p1 = doc.addPage([500, 500]);
        p1.drawText('This is upright page one content with plenty of text.', {
          x: 50,
          y: 400,
          size: 14,
          font,
          rotate: degrees(0)
        });

        // Page 2: 90° Rotated
        const p2 = doc.addPage([500, 500]);
        p2.drawText('This is page two content rotated at ninety degrees.', {
          x: 200,
          y: 200,
          size: 14,
          font,
          rotate: degrees(90)
        });

        // Page 3: 180° Upside Down
        const p3 = doc.addPage([500, 500]);
        p3.drawText('This is page three upside down content across line.', {
          x: 400,
          y: 400,
          size: 14,
          font,
          rotate: degrees(180)
        });

        // Page 4: Completely blank
        doc.addPage([500, 500]);
      }, 'mixed_orientations.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);
      expect(mgr.pages.length).toBe(4);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        enableOcrFallback: false
      });

      expect(report.totalPagesScanned).toBe(4);

      // Page 1 should be already upright
      expect(report.alreadyUpright.length).toBe(1);
      expect(report.alreadyUpright[0].displayNumber).toBe(1);
      expect(report.alreadyUpright[0].suggestedRotation).toBe(0);

      // Pages 2 and 3 should be in toRotate
      expect(report.toRotate.length).toBe(2);
      const page2 = report.toRotate.find(p => p.displayNumber === 2);
      expect(page2).toBeDefined();
      expect(page2?.suggestedRotation).toBe(90);

      const page3 = report.toRotate.find(p => p.displayNumber === 3);
      expect(page3).toBeDefined();
      expect(page3?.suggestedRotation).toBe(180);

      // Page 4 (blank) must land in manualReview
      expect(report.manualReview.length).toBe(1);
      expect(report.manualReview[0].displayNumber).toBe(4);
      expect(report.manualReview[0].isNearBlank).toBe(true);
    });

    it('supports OCR detector callback for scanned pages with no text layer', async () => {
      const file = await createPdfFile(async doc => {
        // Scanned image page with no text layer
        const p = doc.addPage([500, 500]);
        p.drawRectangle({ x: 50, y: 50, width: 400, height: 400 });
      }, 'scanned.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      // Pass simulated OCR detector returning 90° with 92% confidence
      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        ocrDetector: async () => ({
          orientationDegrees: 90 as PageOrientationAngle,
          confidence: 0.92
        })
      });

      expect(report.toRotate.length).toBe(1);
      expect(report.toRotate[0].method).toBe('tesseract-osd');
      expect(report.toRotate[0].suggestedRotation).toBe(90);
      expect(report.toRotate[0].confidence).toBe(0.92);
      expect(report.manualReview.length).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. Undo & Redo Integration with PdfPageManagerService
  // ════════════════════════════════════════════════════════════════════

  describe('Undo & Redo with PdfPageManagerService', () => {
    it('applies individual auto-rotations as a single undoable transaction', async () => {
      const file = await createPdfFile(async doc => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const p1 = doc.addPage([500, 500]);
        p1.drawText('Page 1 Upright Text Content', { x: 50, y: 300, size: 12, font });
        const p2 = doc.addPage([500, 500]);
        p2.drawText('Page 2 Rotated 90 Text Content', { x: 200, y: 200, size: 12, font, rotate: degrees(90) });
        const p3 = doc.addPage([500, 500]);
        p3.drawText('Page 3 Rotated 180 Text Content', { x: 300, y: 300, size: 12, font, rotate: degrees(180) });
      }, 'multirotate.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const report = await service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
        enableOcrFallback: false
      });

      const rotations = report.toRotate.map(p => ({
        pageId: p.pageId,
        degreesDelta: p.suggestedRotation
      }));

      expect(rotations.length).toBe(2);

      // Apply auto-rotations in one single undoable transaction
      const success = mgr.rotatePagesIndividually(rotations);
      expect(success).toBe(true);

      expect(mgr.pages[0].rotation).toBe(0);
      expect(mgr.pages[1].rotation).toBe(90);
      expect(mgr.pages[2].rotation).toBe(180);
      expect(mgr.canUndo).toBe(true);

      // Undo reverts all auto-rotations at once
      mgr.undo();
      expect(mgr.pages[0].rotation).toBe(0);
      expect(mgr.pages[1].rotation).toBe(0);
      expect(mgr.pages[2].rotation).toBe(0);

      // Redo restores them
      mgr.redo();
      expect(mgr.pages[0].rotation).toBe(0);
      expect(mgr.pages[1].rotation).toBe(90);
      expect(mgr.pages[2].rotation).toBe(180);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 6. Cooperative Cancellation & Progress
  // ════════════════════════════════════════════════════════════════════

  describe('Cooperative Cancellation', () => {
    it('aborts cleanly when signal is aborted', async () => {
      const file = await createPdfFile(async doc => {
        for (let i = 0; i < 5; i++) {
          doc.addPage([500, 500]);
        }
      }, 'cancel.pdf');

      const mgr = new PdfPageManagerService();
      await mgr.loadDocument(file);

      const controller = new AbortController();
      controller.abort();

      await expect(
        service.analyzePages(mgr.pages, mgr.getSourceDocsMap(), {
          signal: controller.signal
        })
      ).rejects.toThrow('cancelled by user');
    });
  });
});
