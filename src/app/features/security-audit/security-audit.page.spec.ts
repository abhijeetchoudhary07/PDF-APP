import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { SecurityAuditPage } from './security-audit.page';
import { PdfHiddenContentAuditService } from '../../core/services/pdf-hidden-content-audit.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  HiddenContentAuditReport,
  HiddenContentCategorySummary,
  HiddenContentFinding
} from '../../core/models/pdf-hidden-content.types';

describe('SecurityAuditPage — UI / UX and Handoff Workflow', () => {
  let page: SecurityAuditPage;
  let mockAuditService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockFileService: any;
  let mockDocumentBridge: any;
  let mockToastCtrl: any;
  let mockRouter: any;
  let mockCdr: any;

  const mockFinding1: HiddenContentFinding = {
    id: 'f1',
    category: 'invisible_text',
    pageIndex: 0,
    pageNumber: 1,
    title: 'Invisible Text (White on White)',
    description: 'Text fill color matches white background',
    severity: 'high',
    snippetText: 'SECRET_KEY',
    recommendedTool: {
      id: 'pdf_privacy_sanitizer',
      route: '/features/pdf/privacy-sanitizer',
      labelKey: 'hiddenAudit.remediateSanitize'
    }
  };

  const mockReport: HiddenContentAuditReport = {
    fileName: 'document.pdf',
    fileSizeBytes: 10240,
    pageCount: 3,
    auditedAt: new Date(),
    totalFindings: 1,
    highSeverityCount: 1,
    warningSeverityCount: 0,
    infoSeverityCount: 0,
    riskLevel: 'high',
    riskScore: 70,
    categories: {
      ocg_layers: {
        category: 'ocg_layers',
        titleKey: 'hiddenAudit.categoryOcg',
        descKey: 'hiddenAudit.categoryOcgDesc',
        icon: 'layers',
        count: 0,
        findings: []
      },
      off_page_objects: {
        category: 'off_page_objects',
        titleKey: 'hiddenAudit.categoryOffPage',
        descKey: 'hiddenAudit.categoryOffPageDesc',
        icon: 'expand',
        count: 0,
        findings: []
      },
      invisible_text: {
        category: 'invisible_text',
        titleKey: 'hiddenAudit.categoryInvisibleText',
        descKey: 'hiddenAudit.categoryInvisibleTextDesc',
        icon: 'eye-off',
        count: 1,
        findings: [mockFinding1]
      },
      off_page_annots: {
        category: 'off_page_annots',
        titleKey: 'hiddenAudit.categoryOffPageAnnots',
        descKey: 'hiddenAudit.categoryOffPageAnnotsDesc',
        icon: 'chatbubble',
        count: 0,
        findings: []
      },
      scripts_attachments: {
        category: 'scripts_attachments',
        titleKey: 'hiddenAudit.categoryScriptsAttachments',
        descKey: 'hiddenAudit.categoryScriptsAttachmentsDesc',
        icon: 'attach',
        count: 0,
        findings: []
      }
    },
    allFindings: [mockFinding1]
  };

  beforeEach(() => {
    mockAuditService = {
      auditDocument: vi.fn().mockResolvedValue(mockReport),
      exportAuditReportPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///path/to/saved_report.pdf')
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockFileService = {
      downloadFile: vi.fn()
    };

    mockDocumentBridge = {
      consumeDocument: vi.fn().mockReturnValue(null),
      setDocument: vi.fn()
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined)
      })
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfHiddenContentAuditService, useValue: mockAuditService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: FileService, useValue: mockFileService },
        { provide: DocumentBridgeService, useValue: mockDocumentBridge },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SecurityAuditPage());
  });

  it('initializes with default clean state', () => {
    expect(page.currentFile).toBeNull();
    expect(page.report).toBeNull();
    expect(page.isScanning).toBe(false);
    expect(page.isExporting).toBe(false);
  });

  it('rejects non-PDF files gracefully with warning toast', async () => {
    const invalidFile = new File(['hello'], 'document.docx', { type: 'application/vnd.word' });
    await page.handleFileSelected(invalidFile);

    expect(mockAuditService.auditDocument).not.toHaveBeenCalled();
    expect(page.report).toBeNull();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'warning' })
    );
  });

  it('processes valid PDF document and updates report dashboard', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(pdfFile);

    expect(mockAuditService.auditDocument).toHaveBeenCalledWith(pdfFile);
    expect(page.report).toBe(mockReport);
    expect(page.pageCount).toBe(3);
    expect(page.fileName).toBe('sample.pdf');

    // Category with findings should be expanded
    expect(page.isCategoryExpanded('invisible_text')).toBe(true);
    // Categories without findings should be collapsed
    expect(page.isCategoryExpanded('ocg_layers')).toBe(false);
  });

  it('toggles category expansion on demand', () => {
    page.expandedCategories.ocg_layers = false;
    page.toggleCategory('ocg_layers');
    expect(page.expandedCategories.ocg_layers).toBe(true);
    page.toggleCategory('ocg_layers');
    expect(page.expandedCategories.ocg_layers).toBe(false);
  });

  it('calculates risk gauge colors and circular offsets accurately', () => {
    expect(page.getRiskMeterColor('low')).toBe('#10b981');
    expect(page.getRiskMeterColor('moderate')).toBe('#f59e0b');
    expect(page.getRiskMeterColor('high')).toBe('#ef4444');

    page.report = mockReport; // 70% risk score
    const offset = page.getRiskScoreOffset();
    // 251.32 - (70/100)*251.32 = ~75.4
    expect(offset).toBeCloseTo(75.4, 0);
  });

  it('hands off document to DocumentBridgeService and navigates to Privacy Sanitizer', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'confidential.pdf', { type: 'application/pdf' });
    page.currentFile = pdfFile;
    page.report = mockReport;

    await page.sanitizeDocumentNow();

    expect(mockDocumentBridge.setDocument).toHaveBeenCalledWith(
      pdfFile,
      'pdf',
      expect.objectContaining({
        source: 'audit',
        reportFindings: 1
      })
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/features/pdf/privacy-sanitizer'],
      { state: { file: pdfFile } }
    );
  });

  it('remediates with specific tool route via DocumentBridgeService', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'test.pdf', { type: 'application/pdf' });
    page.currentFile = pdfFile;

    await page.remediateWithTool('/features/pdf/crop');

    expect(mockDocumentBridge.setDocument).toHaveBeenCalledWith(pdfFile, 'pdf', { source: 'audit' });
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/features/pdf/crop'],
      { state: { file: pdfFile } }
    );
  });

  it('exports audit report as PDF and saves it via StorageService', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'audit_test.pdf', { type: 'application/pdf' });
    page.currentFile = pdfFile;
    page.fileName = pdfFile.name;
    page.report = mockReport;

    await page.exportAuditReportPdf();

    expect(mockAuditService.exportAuditReportPdf).toHaveBeenCalledWith(mockReport);
    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      'security_audit'
    );
    expect(page.savedReportUrl).toBe('file:///path/to/saved_report.pdf');
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );
  });

  it('resets workflow when resetAudit is called', () => {
    page.currentFile = new File([], 'temp.pdf');
    page.report = mockReport;
    page.savedReportUrl = 'some-url';

    page.resetAudit();

    expect(page.currentFile).toBeNull();
    expect(page.report).toBeNull();
    expect(page.savedReportUrl).toBeNull();
    expect(page.fileName).toBe('');
  });

  it('picks up document handed off via DocumentBridgeService on ngOnInit', () => {
    const file = new File(['%PDF-1.4'], 'bridged.pdf', { type: 'application/pdf' });
    mockDocumentBridge.consumeDocument.mockReturnValue({
      file,
      source: 'pdf'
    });

    const handleSpy = vi.spyOn(page, 'handleFileSelected');
    page.ngOnInit();

    expect(mockDocumentBridge.consumeDocument).toHaveBeenCalled();
    expect(handleSpy).toHaveBeenCalledWith(file);
  });
});
