import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { PrivacyCardPage } from './privacy-card.page';
import { PdfPrivacyReportCardService } from '../../core/services/pdf-privacy-report-card.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { PrivacyReportCard } from '../../core/models/pdf-privacy-card.types';

describe('PrivacyCardPage — UI / UX and Handoff Workflow', () => {
  let page: PrivacyCardPage;
  let mockReportService: any;
  let mockDocumentBridge: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockToastCtrl: any;
  let mockRouter: any;
  let mockCdr: any;

  const mockReportCard: PrivacyReportCard = {
    fileName: 'confidential_contract.pdf',
    fileSizeBytes: 20480,
    evaluatedAt: new Date(),
    score: 65,
    grade: 'C',
    headlineSummary: 'Moderate Exposure Risk',
    plainLanguageSummary: 'This document reveals author information and software traces.',
    cards: {
      creator: {
        id: 'creator',
        titleKey: 'privacyCard.cardCreatorTitle',
        icon: 'person',
        hasExposure: true,
        headline: 'Identifies author as "John Doe"',
        bulletPoints: ['Author: "John Doe"'],
        severity: 'warning'
      },
      device: {
        id: 'device',
        titleKey: 'privacyCard.cardDeviceTitle',
        icon: 'desktop',
        hasExposure: true,
        headline: 'Exposes generation tools',
        bulletPoints: ['PDF Engine: "Adobe Acrobat 2024"'],
        severity: 'warning'
      },
      timeLocation: {
        id: 'time_location',
        titleKey: 'privacyCard.cardTimeLocationTitle',
        icon: 'time',
        hasExposure: false,
        headline: 'No timestamp or location traces',
        bulletPoints: ['No creation timestamp or GPS coordinates found.'],
        severity: 'clean'
      },
      concealed: {
        id: 'concealed',
        titleKey: 'privacyCard.cardConcealedTitle',
        icon: 'eye-off',
        hasExposure: false,
        headline: 'Zero concealed or invisible content',
        bulletPoints: ['No hidden layers, invisible text, or embedded scripts.'],
        severity: 'clean'
      }
    },
    deductions: [
      {
        reason: 'Personal Name revealed in author field ("John Doe")',
        points: 15,
        category: 'name'
      },
      {
        reason: 'Software or OS trace exposed ("Adobe Acrobat 2024")',
        points: 10,
        category: 'software'
      }
    ],
    rawDetails: {
      author: 'John Doe',
      creator: 'Adobe Acrobat 2024',
      gpsCount: 0,
      cameraModels: [],
      hiddenElementsCount: 0,
      attachmentsCount: 0
    }
  };

  beforeEach(() => {
    mockReportService = {
      generateReportCard: vi.fn().mockResolvedValue(mockReportCard),
      exportReportCardPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
    };

    mockDocumentBridge = {
      consumeDocument: vi.fn().mockReturnValue(null),
      setDocument: vi.fn()
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///path/to/saved_report.pdf')
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
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
        { provide: PdfPrivacyReportCardService, useValue: mockReportService },
        { provide: DocumentBridgeService, useValue: mockDocumentBridge },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new PrivacyCardPage());
  });

  it('initializes with default clean state', () => {
    expect(page.currentFile).toBeNull();
    expect(page.fileName).toBe('');
    expect(page.fileSize).toBe(0);
    expect(page.reportCard).toBeNull();
    expect(page.isEvaluating).toBe(false);
    expect(page.isExporting).toBe(false);
    expect(page.savedReportUrl).toBeNull();
  });

  it('rejects non-PDF files gracefully with warning toast', async () => {
    const invalidFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
    await page.handleFileSelected(invalidFile);

    expect(mockReportService.generateReportCard).not.toHaveBeenCalled();
    expect(page.reportCard).toBeNull();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'warning' })
    );
  });

  it('generates report card for valid PDF file', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'doc.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(pdfFile);

    expect(mockReportService.generateReportCard).toHaveBeenCalledWith(pdfFile);
    expect(page.reportCard).toEqual(mockReportCard);
    expect(page.fileName).toBe('doc.pdf');
    expect(page.isEvaluating).toBe(false);
  });

  it('handles report card evaluation failure gracefully', async () => {
    mockReportService.generateReportCard.mockRejectedValueOnce(new Error('Corrupt PDF'));
    const pdfFile = new File(['corrupt'], 'bad.pdf', { type: 'application/pdf' });

    await page.handleFileSelected(pdfFile);

    expect(page.reportCard).toBeNull();
    expect(page.isEvaluating).toBe(false);
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  it('maps letter grades to appropriate status colors', () => {
    expect(page.getGradeColor('A+')).toBe('#10b981');
    expect(page.getGradeColor('A')).toBe('#10b981');
    expect(page.getGradeColor('B')).toBe('#2563eb');
    expect(page.getGradeColor('C')).toBe('#f59e0b');
    expect(page.getGradeColor('D')).toBe('#ef4444');
    expect(page.getGradeColor('F')).toBe('#ef4444');
  });

  it('hands off document to DocumentBridgeService and navigates to Privacy Sanitizer', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'target.pdf', { type: 'application/pdf' });
    page.currentFile = pdfFile;
    page.reportCard = mockReportCard;

    await page.sanitizeDocumentNow();

    expect(mockDocumentBridge.setDocument).toHaveBeenCalledWith(
      pdfFile,
      'pdf',
      expect.objectContaining({
        source: 'privacy-card',
        reportScore: 65,
        reportGrade: 'C'
      })
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/features/pdf/privacy-sanitizer'],
      { state: { file: pdfFile } }
    );
  });

  it('exports report card as PDF and saves it via StorageService', async () => {
    const pdfFile = new File(['%PDF-1.4 dummy'], 'report_input.pdf', { type: 'application/pdf' });
    page.currentFile = pdfFile;
    page.fileName = pdfFile.name;
    page.reportCard = mockReportCard;

    await page.exportReportCardPdf();

    expect(mockReportService.exportReportCardPdf).toHaveBeenCalledWith(mockReportCard);
    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      'privacy_report_card'
    );
    expect(page.savedReportUrl).toBe('file:///path/to/saved_report.pdf');
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );
  });

  it('shares exported report PDF via ShareService', async () => {
    page.fileName = 'audit.pdf';
    page.reportCard = mockReportCard;
    page.savedReportUrl = 'file:///path/to/saved_report.pdf';

    await page.shareReport();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(
      'file:///path/to/saved_report.pdf',
      'audit_privacy_report_card.pdf'
    );
  });

  it('resets workflow when resetReport is called', () => {
    page.currentFile = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
    page.fileName = 'test.pdf';
    page.fileSize = 1000;
    page.reportCard = mockReportCard;
    page.savedReportUrl = 'some-url';

    page.resetReport();

    expect(page.currentFile).toBeNull();
    expect(page.fileName).toBe('');
    expect(page.fileSize).toBe(0);
    expect(page.reportCard).toBeNull();
    expect(page.savedReportUrl).toBeNull();
  });

  it('auto-loads document bridged from another feature on init', () => {
    const bridgedFile = new File(['%PDF-1.4'], 'bridged.pdf', { type: 'application/pdf' });
    mockDocumentBridge.consumeDocument.mockReturnValueOnce({
      file: bridgedFile,
      type: 'pdf'
    });

    const spy = vi.spyOn(page, 'handleFileSelected').mockResolvedValue(undefined);
    page.ngOnInit();

    expect(spy).toHaveBeenCalledWith(bridgedFile);
  });
});
