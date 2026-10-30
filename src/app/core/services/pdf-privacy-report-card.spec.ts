import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';

import { PdfPrivacyReportCardService } from './pdf-privacy-report-card.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfMetadataEditorService } from './pdf-metadata-editor.service';
import { PdfHiddenContentAuditService } from './pdf-hidden-content-audit.service';

describe('PdfPrivacyReportCardService — Per-Document Privacy Report Card', () => {
  let service: PdfPrivacyReportCardService;
  let mockPrivacyService: any;
  let mockMetadataService: any;
  let mockHiddenAuditService: any;

  beforeEach(() => {
    mockPrivacyService = {
      scanPdf: vi.fn().mockResolvedValue({
        items: [],
        metadataDetails: {},
        attachmentCount: 0,
        commentCount: 0,
        formFieldCount: 0,
        scriptCount: 0,
        hiddenContentCount: 0
      })
    };

    mockMetadataService = {
      readMetadata: vi.fn().mockResolvedValue({
        metadata: {},
        hasXmpStream: false,
        hasInfoDict: false,
        pageCount: 1,
        fileName: 'test.pdf',
        fileSizeBytes: 2048
      })
    };

    mockHiddenAuditService = {
      auditDocument: vi.fn().mockResolvedValue({
        fileName: 'test.pdf',
        fileSizeBytes: 2048,
        pageCount: 1,
        auditedAt: new Date(),
        totalFindings: 0,
        highSeverityCount: 0,
        warningSeverityCount: 0,
        infoSeverityCount: 0,
        riskLevel: 'low',
        riskScore: 0,
        categories: {
          ocg_layers: { count: 0, findings: [] },
          off_page_objects: { count: 0, findings: [] },
          invisible_text: { count: 0, findings: [] },
          off_page_annots: { count: 0, findings: [] },
          scripts_attachments: { count: 0, findings: [] }
        },
        allFindings: []
      })
    };

    TestBed.configureTestingModule({
      providers: [
        PdfPrivacyReportCardService,
        { provide: PdfPrivacyService, useValue: mockPrivacyService },
        { provide: PdfMetadataEditorService, useValue: mockMetadataService },
        { provide: PdfHiddenContentAuditService, useValue: mockHiddenAuditService }
      ]
    });

    service = TestBed.inject(PdfPrivacyReportCardService);
  });

  it('evaluates completely clean document with Grade A+ and 100% score', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes, 'clean_doc.pdf');

    expect(report.score).toBe(100);
    expect(report.grade).toBe('A+');
    expect(report.deductions.length).toBe(0);
    expect(report.headlineSummary).toContain('High Privacy Protection');
    expect(report.plainLanguageSummary).toContain('highly sanitized and reveals zero');
    expect(report.cards.creator.hasExposure).toBe(false);
    expect(report.cards.device.hasExposure).toBe(false);
    expect(report.cards.timeLocation.hasExposure).toBe(false);
    expect(report.cards.concealed.hasExposure).toBe(false);
  });

  it('deducts 15 points for Personal Name (Author) exposure', async () => {
    mockMetadataService.readMetadata.mockResolvedValue({
      metadata: { author: 'John Doe' },
      hasXmpStream: true,
      hasInfoDict: true,
      pageCount: 1,
      fileName: 'doc.pdf',
      fileSizeBytes: 2048
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    expect(report.score).toBe(85);
    expect(report.grade).toBe('A');
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'name', points: 15 })
    );
    expect(report.plainLanguageSummary).toContain("authored by 'John Doe'");
  });

  it('deducts 10 points for Software/OS version trace in Creator / Producer', async () => {
    mockMetadataService.readMetadata.mockResolvedValue({
      metadata: { creator: 'Word 2024 for macOS 15.1' },
      hasXmpStream: true,
      hasInfoDict: true,
      pageCount: 1,
      fileName: 'doc.pdf',
      fileSizeBytes: 2048
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    expect(report.score).toBe(90);
    expect(report.grade).toBe('A');
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'software', points: 10 })
    );
  });

  it('formulates plain-language synthesis when Author, Software, and Date are all present', async () => {
    const creationDate = new Date(2026, 9, 28); // Oct 28, 2026
    mockMetadataService.readMetadata.mockResolvedValue({
      metadata: {
        author: 'John Doe',
        creator: 'Word 2024',
        producer: 'macOS 15.1',
        creationDate
      },
      hasXmpStream: true,
      hasInfoDict: true,
      pageCount: 1,
      fileName: 'contract.pdf',
      fileSizeBytes: 4096
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Score: 100 - 15 (author) - 10 (software) = 75 (Grade B)
    expect(report.score).toBe(75);
    expect(report.grade).toBe('B');
    expect(report.plainLanguageSummary).toContain("created by 'John Doe'");
    expect(report.plainLanguageSummary).toContain("Word 2024");
    expect(report.plainLanguageSummary).toContain("October 28, 2026");
  });

  it('detects GPS EXIF in embedded images and applies -25 deduction', async () => {
    // Spy on scanEmbeddedImagesForExif to return mock GPS coordinates
    vi.spyOn(service, 'scanEmbeddedImagesForExif').mockResolvedValue({
      totalImages: 2,
      imagesWithGps: 2,
      imagesWithCamera: 1,
      cameraModels: ['iPhone 15 Pro'],
      gpsLocations: [{ lat: 18.9220, lon: 72.8347 }]
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Score: 100 - 15 (camera) - 25 (gps) = 60 (Grade C)
    expect(report.score).toBe(60);
    expect(report.grade).toBe('C');
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'gps', points: 25 })
    );
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'device', points: 15 })
    );
    expect(report.plainLanguageSummary).toContain('2 photos with embedded GPS locations');
    expect(report.cards.timeLocation.severity).toBe('danger');
  });

  it('deducts -20 for concealed layers / invisible text and -30 for embedded scripts', async () => {
    mockHiddenAuditService.auditDocument.mockResolvedValue({
      fileName: 'hidden_leak.pdf',
      fileSizeBytes: 5000,
      pageCount: 1,
      auditedAt: new Date(),
      totalFindings: 2,
      highSeverityCount: 2,
      warningSeverityCount: 0,
      infoSeverityCount: 0,
      riskLevel: 'high',
      riskScore: 80,
      categories: {
        ocg_layers: { count: 1, findings: [{ id: 'ocg-1' }] },
        off_page_objects: { count: 0, findings: [] },
        invisible_text: { count: 1, findings: [{ id: 'inv-1' }] },
        off_page_annots: { count: 0, findings: [] },
        scripts_attachments: { count: 1, findings: [{ id: 'scr-1' }] }
      },
      allFindings: [{ id: 'ocg-1' }, { id: 'inv-1' }, { id: 'scr-1' }]
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Deductions: -20 (hidden) - 30 (scripts/attachments) = 50 (Grade D)
    expect(report.score).toBe(50);
    expect(report.grade).toBe('D');
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'hidden', points: 20 })
    );
    expect(report.deductions).toContainEqual(
      expect.objectContaining({ category: 'attachments', points: 30 })
    );
    expect(report.cards.concealed.severity).toBe('danger');
  });

  it('exports a single-page PDF report card with valid PDF headers', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes, 'export_test.pdf');
    const pdfOutput = await service.exportReportCardPdf(report);

    expect(pdfOutput).toBeInstanceOf(Uint8Array);
    expect(pdfOutput.byteLength).toBeGreaterThan(1000);

    // Verify it parses back through pdf-lib
    const parsedPdf = await PDFDocument.load(pdfOutput);
    expect(parsedPdf.getPageCount()).toBe(1);
  });

  // --- CYBERSECURITY STRESS TESTS (Prompt N9 Step 5) ---

  it('strictly prevents Grade A or A+ when embedded images contain GPS coordinates', async () => {
    // Even if other deductions were zero, GPS leaks user physical location
    vi.spyOn(service, 'scanEmbeddedImagesForExif').mockResolvedValue({
      totalImages: 1,
      imagesWithGps: 1,
      imagesWithCamera: 0,
      cameraModels: [],
      personalNames: [],
      gpsLocations: [{ lat: 28.6139, lon: 77.209 }]
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Verified: Score cannot exceed 65 and Grade cannot be A+, A, or B
    expect(report.score).toBeLessThanOrEqual(65);
    expect(['C', 'D', 'F']).toContain(report.grade);
    expect(report.grade).not.toBe('A+');
    expect(report.grade).not.toBe('A');
    expect(report.grade).not.toBe('B');
    expect(report.cards.timeLocation.severity).toBe('danger');
    expect(report.cards.timeLocation.bulletPoints).toContainEqual(
      expect.stringContaining('28.6139°, 77.2090°')
    );
  });

  it('strictly prevents Grade A or A+ when embedded images contain personal names in EXIF', async () => {
    vi.spyOn(service, 'scanEmbeddedImagesForExif').mockResolvedValue({
      totalImages: 1,
      imagesWithGps: 0,
      imagesWithCamera: 0,
      cameraModels: [],
      personalNames: ['Jane Photographer'],
      gpsLocations: []
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Verified: Personal name in image leaks photographer identity, grade capped at B max
    expect(report.score).toBeLessThanOrEqual(75);
    expect(report.grade).not.toBe('A+');
    expect(report.grade).not.toBe('A');
    expect(report.grade).toBe('B');
    expect(report.deductions).toContainEqual(
      expect.objectContaining({
        category: 'name',
        points: 15,
        reason: expect.stringContaining('Jane Photographer')
      })
    );
    expect(report.plainLanguageSummary).toContain("Discloses photographer identity 'Jane Photographer'");
  });

  it('neutralizes XSS script payloads in metadata and applies malicious payload deduction', async () => {
    mockMetadataService.readMetadata.mockResolvedValue({
      metadata: {
        author: '<script>alert("XSS")</script>',
        title: '<img src=x onerror=alert(1)>Invoice',
        creator: 'Word 2024; javascript:alert(document.cookie)'
      },
      hasXmpStream: true,
      hasInfoDict: true,
      pageCount: 1,
      fileName: 'xss_exploit.pdf',
      fileSizeBytes: 2048
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // 1. Script tags must be stripped from all text disclosures
    expect(report.plainLanguageSummary).not.toContain('<script>');
    expect(report.plainLanguageSummary).not.toContain('</script>');
    expect(report.plainLanguageSummary).not.toContain('javascript:');
    expect(report.cards.creator.headline).not.toContain('<script>');
    expect(report.cards.creator.headline).not.toContain('onerror=');

    // 2. Malicious payload is penalized with -30 points deduction
    expect(report.deductions).toContainEqual(
      expect.objectContaining({
        category: 'attachments',
        points: 30,
        reason: 'Malicious script injection payload detected in document metadata'
      })
    );

    // 3. Document score must be severely capped (score <= 55, Grade C or worse)
    expect(report.score).toBeLessThanOrEqual(55);
    expect(report.grade).not.toBe('A+');
    expect(report.grade).not.toBe('A');
    expect(report.grade).not.toBe('B');
  });

  it('safely handles non-WinAnsi Unicode characters and curly quotes during PDF export without throwing', async () => {
    mockMetadataService.readMetadata.mockResolvedValue({
      metadata: {
        author: 'अभिजित चौधरी (Abhijeet) “Smart” & ‘Secure’',
        creator: 'Writer Pro — Advanced • Engine'
      },
      hasXmpStream: true,
      hasInfoDict: true,
      pageCount: 1,
      fileName: 'unicode_contract.pdf',
      fileSizeBytes: 3000
    });

    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdfBytes = await doc.save();

    const report = await service.generateReportCard(pdfBytes);

    // Should export without WinAnsi encoding exception
    const exportedPdfBytes = await service.exportReportCardPdf(report);
    expect(exportedPdfBytes).toBeInstanceOf(Uint8Array);
    expect(exportedPdfBytes.byteLength).toBeGreaterThan(1500);

    const parsedPdf = await PDFDocument.load(exportedPdfBytes);
    expect(parsedPdf.getPageCount()).toBe(1);
  });
});
