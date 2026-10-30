import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { SearchRedactPage } from './search-redact.page';
import { PdfSearchRedactService } from '../../core/services/pdf-search-redact.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import { PatternMatchItem, SearchRedactResult } from '../../core/models/pdf-search-redact.types';

describe('SearchRedactPage — UI / UX and Pattern Redaction Workflow', () => {
  let page: SearchRedactPage;
  let mockSearchRedactService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockFileService: any;
  let mockAlertCtrl: any;
  let mockToastCtrl: any;
  let mockRouter: any;
  let mockCdr: any;

  const mockMatches: PatternMatchItem[] = [
    {
      id: 'match-1',
      pageIndex: 0,
      pageNumber: 1,
      presetType: 'email',
      matchedText: 'john@example.com',
      maskedText: 'j•••••••••m',
      contextBefore: 'Contact us at',
      contextAfter: 'for inquiries',
      boundingRect: { x: 50, y: 350, width: 120, height: 16 },
      selected: true
    },
    {
      id: 'match-2',
      pageIndex: 0,
      pageNumber: 1,
      presetType: 'phone',
      matchedText: '+91 9876543210',
      maskedText: '+••••••••10',
      contextBefore: 'Helpline:',
      contextAfter: '(Toll-free)',
      boundingRect: { x: 50, y: 300, width: 100, height: 16 },
      selected: true
    }
  ];

  const mockRedactionResult: SearchRedactResult = {
    pdfBytes: new Uint8Array([1, 2, 3]),
    fileName: 'contract.pdf',
    totalMatchesFound: 2,
    redactedCount: 2,
    unselectedCount: 0,
    redactedTargets: [],
    auditReport: {
      fileName: 'contract.pdf',
      totalPages: 1,
      auditedAt: new Date(),
      totalAudited: 2,
      verifiedCount: 2,
      residualRiskCount: 0,
      failedCount: 0,
      items: [],
      is100PercentPurged: true
    }
  };

  beforeEach(() => {
    mockSearchRedactService = {
      scanForPatterns: vi.fn().mockResolvedValue([...mockMatches]),
      applyPatternRedactions: vi.fn().mockResolvedValue(mockRedactionResult),
      compileSafeRegex: vi.fn().mockImplementation((pattern: string) => {
        if (pattern.includes('(a+)+')) throw new Error('ReDoS vulnerability detected');
        return new RegExp(pattern, 'g');
      }),
      maskSensitiveString: vi.fn().mockReturnValue('••••')
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///saved/pattern_redacted.pdf')
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
        { provide: PdfSearchRedactService, useValue: mockSearchRedactService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: FileService, useValue: mockFileService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SearchRedactPage());
  });

  it('initializes in empty dropzone state with default presets active', () => {
    page.ngOnInit();
    expect(page.currentFile).toBeNull();
    expect(page.isPresetActive('email')).toBe(true);
    expect(page.isPresetActive('phone')).toBe(true);
    expect(page.isPresetActive('aadhaar')).toBe(true);
    expect(page.matches.length).toBe(0);
  });

  it('loads file and automatically triggers pattern scan', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'contract.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    expect(page.currentFile).toBe(file);
    expect(page.fileName).toBe('contract.pdf');
    expect(mockSearchRedactService.scanForPatterns).toHaveBeenCalled();
    expect(page.matches.length).toBe(2);
    expect(page.scanCompleted).toBe(true);
  });

  it('toggles pattern presets on and off', async () => {
    expect(page.isPresetActive('email')).toBe(true);
    await page.togglePreset('email');
    expect(page.isPresetActive('email')).toBe(false);

    await page.togglePreset('email');
    expect(page.isPresetActive('email')).toBe(true);
  });

  it('validates custom regex and surfaces ReDoS errors', async () => {
    page.customRegex = '(a+)+$';
    await page.applyCustomRegex();

    expect(page.customRegexError).toContain('ReDoS vulnerability');
  });

  it('toggles Select All and individual item selection', () => {
    page.matches = [
      { ...mockMatches[0], selected: true },
      { ...mockMatches[1], selected: true }
    ];

    expect(page.isAllSelected()).toBe(true);
    expect(page.getSelectedCount()).toBe(2);

    page.toggleSelectAll();
    expect(page.isAllSelected()).toBe(false);
    expect(page.getSelectedCount()).toBe(0);

    page.toggleMatch(page.matches[0]);
    expect(page.getSelectedCount()).toBe(1);
    expect(page.matches[0].selected).toBe(true);
  });

  it('executes bulk redaction on selected items and saves result', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'contract.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    await page.executeRedactions();

    expect(mockSearchRedactService.applyPatternRedactions).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Array),
      expect.objectContaining({ verifyWithN4: true })
    );
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(page.redactionResult).toEqual(mockRedactionResult);
  });

  it('navigates to forensic verification audit with redacted file', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'contract.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);
    page.openInVerificationAudit();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/features/pdf/security/redact-verify'],
      expect.objectContaining({ state: expect.any(Object) })
    );
  });

  it('resets workflow when resetWorkflow is called', async () => {
    const file = new File(['%PDF-1.4 mock content'], 'contract.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.resetWorkflow();
    expect(page.currentFile).toBeNull();
    expect(page.currentPdfBytes).toBeNull();
    expect(page.matches.length).toBe(0);
    expect(page.scanCompleted).toBe(false);
  });
});
