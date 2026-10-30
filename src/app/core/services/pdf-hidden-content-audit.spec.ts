import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  rgb
} from 'pdf-lib';
import { PdfHiddenContentAuditService } from './pdf-hidden-content-audit.service';
import { DocumentBridgeService } from './document-bridge.service';
import '../utilities/pdfjs-worker';

describe('PdfHiddenContentAuditService — Forensic Hidden-Content Audit', () => {
  let service: PdfHiddenContentAuditService;
  let bridgeService: DocumentBridgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfHiddenContentAuditService, DocumentBridgeService]
    });
    service = TestBed.inject(PdfHiddenContentAuditService);
    bridgeService = TestBed.inject(DocumentBridgeService);
  });

  describe('Clean document verification', () => {
    it('produces zero false positives on clean standard document', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);
      page.drawText('Normal public document content with dark text.', {
        x: 50,
        y: 350,
        size: 12,
        color: rgb(0.1, 0.1, 0.1)
      });
      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);

      expect(report.totalFindings).toBe(0);
      expect(report.highSeverityCount).toBe(0);
      expect(report.warningSeverityCount).toBe(0);
      expect(report.riskLevel).toBe('low');
      expect(report.riskScore).toBe(0);
    });
  });

  describe('1. Hidden OCG Layers Detector', () => {
    it('detects hidden Optional Content Group (OCG) layers disabled by default', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 400]);

      // Construct OCG structure with disabled layer
      const context = doc.context;
      const ocgDict = context.obj({
        Type: 'OCG',
        Name: PDFString.of('Confidential Redlines Layer')
      });
      const ocgRef = context.register(ocgDict);

      const dDict = context.obj({
        BaseState: PDFName.of('ON'),
        OFF: context.obj([ocgRef])
      });

      const ocPropsDict = context.obj({
        OCGs: context.obj([ocgRef]),
        D: dDict
      });
      const ocPropsRef = context.register(ocPropsDict);
      doc.catalog.set(PDFName.of('OCProperties'), ocPropsRef);

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      expect(report.categories.ocg_layers.count).toBe(1);

      const finding = report.categories.ocg_layers.findings[0];
      expect(finding.title).toContain('Confidential Redlines Layer');
      expect(finding.severity).toBe('warning');
      expect(finding.recommendedTool?.route).toContain('privacy-sanitizer');
    });
  });

  describe('2. Off-Page Content Detector', () => {
    it('detects text positioned outside visible CropBox / MediaBox boundaries', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);

      // Page dimensions are [0, 0, 500, 400]
      // Draw text at (x: 850, y: 350) which is far off-page to the right
      page.drawText('OFF-PAGE-SECRET-COORDINATES-99', {
        x: 850,
        y: 350,
        size: 14
      });

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      expect(report.categories.off_page_objects.count).toBeGreaterThanOrEqual(1);

      const offPageFinding = report.categories.off_page_objects.findings.find(f =>
        f.snippetText?.includes('OFF-PAGE-SECRET')
      );
      expect(offPageFinding).toBeDefined();
      expect(offPageFinding?.severity).toBe('high');
      expect(offPageFinding?.pageNumber).toBe(1);
    });
  });

  describe('3. Invisible / Low-Contrast Text Detector', () => {
    it('detects pure white-on-white text (1 1 1 rg) without flagging ordinary light-grey text', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);

      // 1. Draw ordinary light-grey text (e.g. 0.85 0.85 0.85 rgb or 0.85 g)
      // Must NOT be flagged as invisible white-on-white
      page.drawText('Ordinary Light Grey Watermark', {
        x: 50,
        y: 300,
        size: 12,
        color: rgb(0.85, 0.85, 0.85)
      });

      // 2. Draw pure white text (1, 1, 1 rgb)
      // MUST be flagged as high-risk invisible white-on-white text
      page.drawText('HIDDEN-WHITE-KEY-999', {
        x: 50,
        y: 200,
        size: 12,
        color: rgb(1, 1, 1)
      });

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);

      // Verify white text detected
      const whiteFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('HIDDEN-WHITE-KEY-999')
      );
      expect(whiteFinding).toBeDefined();
      expect(whiteFinding?.severity).toBe('high');

      // Verify ordinary light-grey watermark is NOT flagged
      const greyFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('Ordinary Light Grey Watermark')
      );
      expect(greyFinding).toBeUndefined();
    });

    it('detects micro-font invisible text (size < 0.5pt)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);

      // Draw text with 0.2pt font size
      page.drawText('MICRO-TRACKING-ID-X7', {
        x: 50,
        y: 100,
        size: 0.2
      });

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      const microFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('MICRO-TRACKING-ID-X7')
      );
      expect(microFinding).toBeDefined();
      expect(microFinding?.severity).toBe('high');
      expect(microFinding?.title).toContain('Micro-Font');
    });
  });

  describe('4. Off-Page Annotations Detector', () => {
    it('detects annotations positioned beyond page boundary coordinates', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);
      const context = doc.context;

      // Create an annotation with Rect [600, 500, 650, 550] outside page [0, 0, 500, 400]
      const annotDict = context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: context.obj([600, 500, 650, 550]),
        Contents: PDFString.of('Secret Note hidden outside visible crop')
      });
      const annotRef = context.register(annotDict);

      page.node.set(PDFName.of('Annots'), context.obj([annotRef]));

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      expect(report.categories.off_page_annots.count).toBe(1);

      const finding = report.categories.off_page_annots.findings[0];
      expect(finding.title).toContain('Off-Page Text Annotation');
      expect(finding.severity).toBe('warning');
    });
  });

  describe('5. Embedded Scripts & Attachments Detector', () => {
    it('detects OpenAction and embedded file attachments', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 400]);
      const context = doc.context;

      // 1. Add OpenAction
      const actionDict = context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of('app.alert("Hello");')
      });
      doc.catalog.set(PDFName.of('OpenAction'), context.register(actionDict));

      // 2. Add EmbeddedFiles tree
      const namesDict = context.obj({
        EmbeddedFiles: context.obj({
          Names: context.obj([])
        })
      });
      doc.catalog.set(PDFName.of('Names'), context.register(namesDict));

      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      expect(report.categories.scripts_attachments.count).toBe(2);

      expect(report.allFindings.some(f => f.id === 'script-openaction')).toBe(true);
      expect(report.allFindings.some(f => f.id === 'attach-embedded-files')).toBe(true);
      expect(report.riskLevel).toBe('high');
    });
  });

  describe('Remediation Handoff Bridge', () => {
    it('correctly sets target document in bridge for Privacy Sanitizer handoff', () => {
      const dummyFile = new File(['%PDF content'], 'confidential_report.pdf', { type: 'application/pdf' });

      bridgeService.setDocument(dummyFile, 'pdf', { source: 'audit' });

      const consumed = bridgeService.consumeDocument();
      expect(consumed).toBeDefined();
      expect(consumed?.file.name).toBe('confidential_report.pdf');
      expect(consumed?.metadata?.['source']).toBe('audit');

      // Ensure single-use consumption
      expect(bridgeService.consumeDocument()).toBeNull();
    });
  });

  describe('PDF Audit Report Export', () => {
    it('generates a downloadable forensic PDF audit report document', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 400]);
      const pdfBytes = await doc.save();

      const report = await service.auditDocument(pdfBytes);
      const exportedReportPdf = await service.exportAuditReportPdf(report);

      expect(exportedReportPdf).toBeDefined();
      expect(exportedReportPdf.length).toBeGreaterThan(0);

      // Verify exported report is valid PDF
      const loadedReport = await PDFDocument.load(exportedReportPdf);
      expect(loadedReport.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Step 2: Real Test Data Scenarios & 100% Accuracy', () => {
    it('detects hidden CAD layers in engineering drawings where default state is /OFF', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([800, 600]);

      const context = doc.context;
      const cadLayerDict = context.obj({
        Type: 'OCG',
        Name: PDFString.of('CAD_Electrical_Wiring_Confidential_Off')
      });
      const cadLayerRef = context.register(cadLayerDict);

      const dDict = context.obj({
        BaseState: PDFName.of('ON'),
        OFF: context.obj([cadLayerRef])
      });

      const ocPropsDict = context.obj({
        OCGs: context.obj([cadLayerRef]),
        D: dDict
      });
      doc.catalog.set(PDFName.of('OCProperties'), context.register(ocPropsDict));

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      expect(report.categories.ocg_layers.count).toBe(1);
      const cadFinding = report.categories.ocg_layers.findings[0];
      expect(cadFinding.title).toContain('CAD_Electrical_Wiring_Confidential_Off');
      expect(cadFinding.severity).toBe('warning');
    });

    it('detects embedded ZIP attachment hidden as a page FileAttachment annotation', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);
      const context = doc.context;

      // Create embedded zip file specification
      const fileSpecDict = context.obj({
        Type: 'Filespec',
        F: PDFString.of('exfiltrated_archive.zip'),
        UF: PDFString.of('exfiltrated_archive.zip')
      });

      const fileAnnotDict = context.obj({
        Type: 'Annot',
        Subtype: PDFName.of('FileAttachment'),
        Rect: context.obj([50, 50, 70, 70]),
        FS: context.register(fileSpecDict),
        Contents: PDFString.of('Encrypted archive attachment')
      });
      const annotRef = context.register(fileAnnotDict);
      page.node.set(PDFName.of('Annots'), context.obj([annotRef]));

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      expect(report.categories.scripts_attachments.count).toBeGreaterThanOrEqual(1);
      const zipFinding = report.categories.scripts_attachments.findings.find(f =>
        f.title.includes('exfiltrated_archive.zip')
      );
      expect(zipFinding).toBeDefined();
      expect(zipFinding?.severity).toBe('high');
    });

    it('verifies 100% accuracy with 0 false positives on ordinary light grey watermarks and headers', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);

      // Legitimate document content
      page.drawText('CONFIDENTIAL DRAFT WATERMARK', {
        x: 100,
        y: 400,
        size: 32,
        color: rgb(0.88, 0.88, 0.88) // Light grey watermark (NOT pure white)
      });
      page.drawText('Header Title: Annual Compliance Report', {
        x: 50,
        y: 750,
        size: 14,
        color: rgb(0.2, 0.2, 0.2)
      });
      page.drawText('Footer: Page 1 of 1 — Government of India', {
        x: 50,
        y: 40,
        size: 9,
        color: rgb(0.4, 0.4, 0.4)
      });

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      expect(report.totalFindings).toBe(0);
      expect(report.riskLevel).toBe('low');
      expect(report.riskScore).toBe(0);
    });
  });

  describe('Step 5: Cybersecurity Stress-Testing & Steganography Detection', () => {
    it('detects steganography / data exfiltration hidden inside zero-opacity transparent graphics state (/ca 0)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);
      const context = doc.context;

      // Create ExtGState with /ca 0 (zero fill alpha)
      const extGStateDict = context.obj({
        Type: 'ExtGState',
        ca: 0.0,
        CA: 0.0
      });
      const gsRef = context.register(extGStateDict);

      const resourcesDict = context.obj({
        ExtGState: context.obj({
          GSZeroAlpha: gsRef
        })
      });
      page.node.set(PDFName.of('Resources'), context.register(resourcesDict));

      // Append content stream invoking zero opacity state
      const contentStream = context.register(
        doc.context.flateStream(
          '/GSZeroAlpha gs\nBT\n/F1 12 Tf\n(STEGANOGRAPHY_SECRET_PASSWORD_EXFIL_2026) Tj\nET\n'
        )
      );
      page.node.set(PDFName.of('Contents'), contentStream);

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      expect(report.categories.invisible_text.count).toBeGreaterThanOrEqual(1);
      const opacityFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('STEGANOGRAPHY_SECRET')
      );
      expect(opacityFinding).toBeDefined();
      expect(opacityFinding?.title).toContain('Zero-Opacity');
      expect(opacityFinding?.severity).toBe('high');
    });

    it('detects evasive font encodings concealing malicious phishing / C2 URLs in invisible text', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);

      // White text concealing phishing C2 URL
      page.drawText('https://malicious-c2-exfil.org/api/token?leak=admin', {
        x: 50,
        y: 200,
        size: 10,
        color: rgb(1, 1, 1) // pure white
      });

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      const urlFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('malicious-c2-exfil.org')
      );
      expect(urlFinding).toBeDefined();
      expect(urlFinding?.severity).toBe('high');
      expect(urlFinding?.title).toContain('Malicious URL');
    });

    it('detects microscopic text exfiltration payload (size 0.05pt)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);

      page.drawText('EXFILTRATED_RSA_PRIVATE_KEY_CHUNK_AAFF99', {
        x: 100,
        y: 150,
        size: 0.05 // microscopic
      });

      const pdfBytes = await doc.save();
      const report = await service.auditDocument(pdfBytes);

      const microFinding = report.categories.invisible_text.findings.find(f =>
        f.snippetText?.includes('EXFILTRATED_RSA')
      );
      expect(microFinding).toBeDefined();
      expect(microFinding?.severity).toBe('high');
      expect(microFinding?.title).toContain('Micro-Font');
    });
  });
});
