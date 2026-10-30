import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfRedactionVerificationService } from './pdf-redaction-verification.service';
import { RedactionTarget } from '../models/pdf-redaction-verify.types';
import '../utilities/pdfjs-worker';

describe('PdfRedactionVerificationService — Forensic Audit & Rasterization Fallback', () => {
  let service: PdfRedactionVerificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfRedactionVerificationService]
    });
    service = TestBed.inject(PdfRedactionVerificationService);
  });

  describe('Masking utility', () => {
    it('masks sensitive strings properly for UI preview', () => {
      expect(service.maskSensitiveString('TOP-SECRET')).toMatch(/^T•+T$/);
      expect(service.maskSensitiveString('123')).toBe('••••');
      expect(service.maskSensitiveString('')).toBe('••••');
    });
  });

  describe('Deliberate mock failure detection (Superficial Blackout)', () => {
    it('correctly flags deliberate black rectangle overlaid over text without deleting stream operators as FAILED', async () => {
      // 1. Create a PDF document
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);

      // Draw sensitive text
      page.drawText('CONFIDENTIAL-PASS-9988', { x: 50, y: 350, size: 14 });

      // Deliberate mock failure: Draw a naive black rectangle over the text
      page.drawRectangle({
        x: 45,
        y: 345,
        width: 250,
        height: 20,
        color: rgb(0, 0, 0)
      });

      const pdfBytes = await doc.save();

      // 2. Perform forensic audit
      const targets: RedactionTarget[] = [
        {
          id: 'test-target-1',
          pageIndex: 0,
          targetText: 'CONFIDENTIAL-PASS-9988',
          boundingRect: { x: 45, y: 345, width: 250, height: 20 }
        }
      ];

      const report = await service.verifyRedactions(pdfBytes, targets);

      // 3. Assertions
      expect(report.totalAudited).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.verifiedCount).toBe(0);
      expect(report.is100PercentPurged).toBe(false);

      const item = report.items[0];
      expect(item.status).toBe('failed');
      expect(item.pass1FoundInTextLayer).toBe(true);
      expect(item.pass2FoundInContentStream).toBe(true);
      expect(item.detectedSuperficialOverlay).toBe(true);
      expect(item.failureReason).toContain('Naive black rectangle');
    });
  });

  describe('Cleanly sanitized text stream verification', () => {
    it('correctly flags a cleanly sanitized text stream as VERIFIED', async () => {
      // Create a document without the sensitive text
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('PUBLIC-APPROVED-DOCUMENT', { x: 50, y: 350, size: 14 });

      const pdfBytes = await doc.save();

      const targets: RedactionTarget[] = [
        {
          id: 'test-target-2',
          pageIndex: 0,
          targetText: 'PURGED-SECRET-TOKEN',
          boundingRect: { x: 45, y: 345, width: 250, height: 20 }
        }
      ];

      const report = await service.verifyRedactions(pdfBytes, targets);

      expect(report.totalAudited).toBe(1);
      expect(report.failedCount).toBe(0);
      expect(report.verifiedCount).toBe(1);
      expect(report.is100PercentPurged).toBe(true);

      const item = report.items[0];
      expect(item.status).toBe('verified');
      expect(item.pass1FoundInTextLayer).toBe(false);
      expect(item.pass2FoundInContentStream).toBe(false);
      expect(item.failureReason).toBeUndefined();
    });
  });

  describe('Region Rasterization Fallback', () => {
    it('removes selectable text from target bounding box while preserving adjacent text', async () => {
      // 1. Create a PDF with both sensitive text and adjacent public text
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('PATIENT-SSN-000-11-2222', { x: 50, y: 350, size: 14 });
      page.drawText('PRESERVED-MEDICAL-REPORT-2026', { x: 50, y: 250, size: 14 });

      const initialBytes = await doc.save();

      // Verify that initial document contains both
      const initialDoc = await pdfjsLib.getDocument({ data: initialBytes.slice(0) }).promise;
      const initialPage = await initialDoc.getPage(1);
      const initialText = (await initialPage.getTextContent()).items.map((i: any) => i.str).join(' ');
      expect(initialText).toContain('PATIENT-SSN-000-11-2222');
      expect(initialText).toContain('PRESERVED-MEDICAL-REPORT-2026');

      // 2. Execute region rasterization fallback
      const target: RedactionTarget = {
        id: 'target-remediate-1',
        pageIndex: 0,
        targetText: 'PATIENT-SSN-000-11-2222',
        boundingRect: { x: 45, y: 340, width: 300, height: 30 }
      };

      const result = await service.rasterizeRedactedRegion(initialBytes, target);

      expect(result.pdfBytes).toBeDefined();
      expect(result.pdfBytes.length).toBeGreaterThan(0);
      expect(result.remediatedItem.rasterized).toBe(true);

      // 3. Inspect modified PDF via pdfjs-dist
      const finalDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const finalPage = await finalDoc.getPage(1);
      const finalText = (await finalPage.getTextContent()).items.map((i: any) => i.str).join(' ');

      // Sensitive text MUST be permanently purged from text layer
      expect(finalText).not.toContain('PATIENT-SSN-000-11-2222');

      // Adjacent text MUST remain 100% intact and selectable
      expect(finalText).toContain('PRESERVED-MEDICAL-REPORT-2026');

      // Audit report of resulting PDF MUST confirm 100% verified status
      expect(result.report.is100PercentPurged).toBe(true);
      expect(result.report.verifiedCount).toBe(1);
      expect(result.report.failedCount).toBe(0);
    });
  });

  describe('Unprovable / Residual vector risk reporting', () => {
    it('reports residual_risk when vector removal cannot be mathematically proven', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([600, 400]);
      const pdfBytes = await doc.save();

      const targets: RedactionTarget[] = [
        {
          id: 'target-residual',
          pageIndex: 0,
          targetText: 'COMPLEX-FONT-DATA',
          reason: 'residual_risk'
        }
      ];

      const report = await service.verifyRedactions(pdfBytes, targets);
      expect(report.totalAudited).toBe(1);
      expect(report.residualRiskCount).toBe(1);
      expect(report.is100PercentPurged).toBe(false);
      expect(report.items[0].status).toBe('residual_risk');
    });
  });

  describe('Cybersecurity Stress-Testing — Stream Operator Smuggling', () => {
    it('detects sensitive strings split across kerning arrays [(pass) -100 (word)] TJ', async () => {
      const { PDFName } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);

      // Create content stream containing smuggled TJ kerning array
      const contentStream = doc.context.flateStream(
        'BT /F1 12 Tf 50 350 Td [(TOP) -80 (SECRET) -100 (VAULT)] TJ ET'
      );
      const streamRef = doc.context.register(contentStream);
      page.node.set(PDFName.of('Contents'), streamRef);

      const pdfBytes = await doc.save();

      const targets: RedactionTarget[] = [
        {
          id: 'smuggle-target',
          pageIndex: 0,
          targetText: 'TOPSECRETVAULT',
          boundingRect: { x: 50, y: 340, width: 200, height: 25 }
        }
      ];

      const report = await service.verifyRedactions(pdfBytes, targets);
      expect(report.totalAudited).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.items[0].streamSmugglingDetected).toBe(true);
      expect(report.items[0].failureReason).toContain('Sensitive text split and smuggled');

      // Remediate with rasterization
      const remediated = await service.rasterizeRedactedRegion(pdfBytes, targets[0]);
      expect(remediated.report.is100PercentPurged).toBe(true);
      expect(remediated.report.verifiedCount).toBe(1);
    });
  });

  describe('Cybersecurity Stress-Testing — Document Info & XMP Metadata Leakage', () => {
    it('detects sensitive strings leaked in Document Info metadata and scrubs them during rasterization', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('Public safe body text', { x: 50, y: 350, size: 12 });

      // Deliberate metadata leak
      doc.setTitle('CONFIDENTIAL-PROJECT-PEGASUS Dossier');
      doc.setSubject('Internal Eyes Only PEGASUS');

      const pdfBytes = await doc.save();

      const targets: RedactionTarget[] = [
        {
          id: 'meta-leak-target',
          pageIndex: 0,
          targetText: 'CONFIDENTIAL-PROJECT-PEGASUS',
          boundingRect: { x: 50, y: 340, width: 250, height: 25 }
        }
      ];

      const report = await service.verifyRedactions(pdfBytes, targets);
      expect(report.totalAudited).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.items[0].metadataLeakageDetected).toBe(true);
      expect(report.items[0].failureReason).toContain('metadata');

      // Remediate
      const remediated = await service.rasterizeRedactedRegion(pdfBytes, targets[0]);
      expect(remediated.report.is100PercentPurged).toBe(true);
      expect(remediated.report.verifiedCount).toBe(1);

      // Verify metadata was scrubbed in resulting PDF
      const verifyCleanDoc = await PDFDocument.load(remediated.pdfBytes);
      expect(verifyCleanDoc.getTitle()).not.toContain('CONFIDENTIAL-PROJECT-PEGASUS');
      expect(verifyCleanDoc.getTitle()).toContain('[REDACTED]');
    });
  });

  describe('Cybersecurity Stress-Testing — OCR Recovery & Contrast Silhouette Resistance', () => {
    it('guarantees complete vector stream operator scrubbing and opaque blackout coverage', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('HIGH-SECURITY-BIOMETRIC-KEY', { x: 50, y: 350, size: 14 });

      const pdfBytes = await doc.save();

      const target: RedactionTarget = {
        id: 'ocr-target',
        pageIndex: 0,
        targetText: 'HIGH-SECURITY-BIOMETRIC-KEY',
        boundingRect: { x: 45, y: 340, width: 320, height: 30 }
      };

      const result = await service.rasterizeRedactedRegion(pdfBytes, target, {
        dpi: 300,
        fillColor: '#000000'
      });

      // Assert text layer is completely empty of the biometric key
      const inspectDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const inspectPage = await inspectDoc.getPage(1);
      const textContent = await inspectPage.getTextContent();
      const allText = textContent.items.map((i: any) => i.str).join(' ');
      expect(allText).not.toContain('HIGH-SECURITY-BIOMETRIC-KEY');

      // Assert report is 100% purged
      expect(result.report.is100PercentPurged).toBe(true);
      expect(result.report.failedCount).toBe(0);
      expect(result.report.verifiedCount).toBe(1);
    });
  });

  describe('Coordinate Clamping & Transformation Resilience', () => {
    it('safely clamps out-of-bounds or negative bounding boxes without throwing', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 500]);
      const pdfBytes = await doc.save();

      const outOfBoundsTarget: RedactionTarget = {
        id: 'out-of-bounds',
        pageIndex: 0,
        targetText: 'OFF-PAGE-SECRET',
        boundingRect: { x: -100, y: -50, width: 1200, height: 900 }
      };

      const result = await service.rasterizeRedactedRegion(pdfBytes, outOfBoundsTarget);
      expect(result.pdfBytes).toBeDefined();
      expect(result.pdfBytes.length).toBeGreaterThan(0);
      expect(result.report.is100PercentPurged).toBe(true);
    });
  });
});
