import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { RedactVerifyPage } from './redact-verify.page';
import { PdfRedactionVerificationService } from '../../core/services/pdf-redaction-verification.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import { RedactionAuditReport } from '../../core/models/pdf-redaction-verify.types';

describe('RedactVerifyPage — UI / UX and Remediation Flow', () => {
  let page: RedactVerifyPage;
  let mockRedactionService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockFileService: any;
  let mockAlertCtrl: any;
  let mockToastCtrl: any;
  let mockRouter: any;
  let mockCdr: any;

  const mockReportFailed: RedactionAuditReport = {
    fileName: 'sample_redacted.pdf',
    totalPages: 1,
    auditedAt: new Date(),
    totalAudited: 1,
    verifiedCount: 0,
    residualRiskCount: 0,
    failedCount: 1,
    is100PercentPurged: false,
    items: [
      {
        id: 'item-1',
        pageIndex: 0,
        pageNumber: 1,
        targetText: 'SSN-1234',
        maskedText: 'S••••4',
        status: 'failed',
        pass1FoundInTextLayer: true,
        pass2FoundInContentStream: true,
        detectedSuperficialOverlay: true,
        failureReason: 'Naive black rectangle drawn over text without deleting underlying stream operators (superficial blackout).'
      }
    ]
  };

  const mockReportVerified: RedactionAuditReport = {
    fileName: 'sample_redacted.pdf',
    totalPages: 1,
    auditedAt: new Date(),
    totalAudited: 1,
    verifiedCount: 1,
    residualRiskCount: 0,
    failedCount: 0,
    is100PercentPurged: true,
    items: [
      {
        id: 'item-1',
        pageIndex: 0,
        pageNumber: 1,
        targetText: 'SSN-1234',
        maskedText: 'S••••4',
        status: 'verified',
        pass1FoundInTextLayer: false,
        pass2FoundInContentStream: false,
        detectedSuperficialOverlay: false,
        rasterized: true
      }
    ]
  };

  beforeEach(() => {
    mockRedactionService = {
      verifyRedactions: vi.fn().mockResolvedValue(mockReportFailed),
      rasterizeRedactedRegion: vi.fn().mockResolvedValue({
        pdfBytes: new Uint8Array([1, 2, 3]),
        report: mockReportVerified,
        remediatedItem: mockReportVerified.items[0]
      }),
      maskSensitiveString: vi.fn().mockImplementation((text: string) => `M•${text.slice(-1)}`)
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///saved/verified_redacted.pdf')
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockFileService = {
      getCurrentFile: vi.fn().mockReturnValue(null)
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn()
      })
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn()
      })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfRedactionVerificationService, useValue: mockRedactionService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: FileService, useValue: mockFileService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new RedactVerifyPage());
  });

  it('initializes in empty dropzone state', () => {
    page.ngOnInit();
    expect(page.currentFile).toBeNull();
    expect(page.auditReport).toBeNull();
    expect(page.comparisonView).toBe('redacted');
  });

  it('loads file and runs audit on file selection', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    expect(page.currentFile).toBe(file);
    expect(page.fileName).toBe('secret_doc.pdf');
    expect(mockRedactionService.verifyRedactions).toHaveBeenCalled();
    expect(page.auditReport).toEqual(mockReportFailed);
  });

  it('dynamically adds target snippet and re-triggers audit', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.newSnippetText = 'CONFIDENTIAL-KEY-55';
    await page.addTargetSnippet();

    expect(page.targets.length).toBeGreaterThan(0);
    expect(page.targets.some(t => t.targetText === 'CONFIDENTIAL-KEY-55')).toBe(true);
    expect(page.newSnippetText).toBe('');
    expect(mockRedactionService.verifyRedactions).toHaveBeenCalledTimes(2);
  });

  it('triggers one-tap rasterization fallback and updates to verified state', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    const itemToRemediate = mockReportFailed.items[0];
    mockRedactionService.verifyRedactions.mockResolvedValueOnce(mockReportVerified);

    await page.remediateWithRasterization(itemToRemediate);

    expect(mockRedactionService.rasterizeRedactedRegion).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ id: 'item-1', targetText: 'SSN-1234' }),
      expect.objectContaining({ dpi: 300 })
    );
    expect(page.isRemediating).toBe(false);
  });

  it('enforces claim integrity: warns user if attempting to approve non-purged PDF', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    // auditReport is mockReportFailed (is100PercentPurged = false)
    await page.approveAndSavePdf();

    // AlertController.create should be called to warn about residual risk
    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Residual Risk Detected' })
    );
    expect(mockStorageService.saveFile).not.toHaveBeenCalled();
  });

  it('saves verified PDF when audit report is 100% purged', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    // Switch report to 100% verified
    page.auditReport = mockReportVerified;

    await page.approveAndSavePdf();

    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      'verified_redacted_pdf'
    );
    expect(page.savedFileUrl).toBe('file:///saved/verified_redacted.pdf');
  });

  it('toggles comparison views and handles zoom adjustments', () => {
    expect(page.comparisonView).toBe('redacted');
    page.toggleComparisonView('original');
    expect(page.comparisonView).toBe('original');
    page.toggleComparisonView('split');
    expect(page.comparisonView).toBe('split');

    expect(page.zoomLevel).toBe(1.0);
    page.setZoom(0.15);
    expect(page.zoomLevel).toBeCloseTo(1.15, 2);
    page.setZoom(-0.5);
    expect(page.zoomLevel).toBeCloseTo(0.75, 2); // clamped at 0.75 minimum

    // Tap-to-zoom toggles
    page.zoomLevel = 1.0;
    page.toggleTapZoom();
    expect(page.zoomLevel).toBe(1.5);
    page.toggleTapZoom();
    expect(page.zoomLevel).toBe(1.0);
  });

  it('resets workflow when resetWorkflow is called', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'secret_doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.resetWorkflow();
    expect(page.currentFile).toBeNull();
    expect(page.currentPdfBytes).toBeNull();
    expect(page.auditReport).toBeNull();
  });
});
