import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { SecurityBatchPage } from './security-batch.page';
import { PdfBatchSecurityService } from '../../core/services/pdf-batch-security.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { BatchSecurityQueueItem, BatchSecuritySummary } from '../../core/models/pdf-security.types';

describe('SecurityBatchPage', () => {
  let page: SecurityBatchPage;
  let mockPdfBatchSecurityService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockAlertCtrl: any;
  let mockToastCtrl: any;
  let mockRouter: any;

  const mockItem1: BatchSecurityQueueItem = {
    id: 'item-1',
    name: 'contract.pdf',
    file: new File(['mock1'], 'contract.pdf', { type: 'application/pdf' }),
    sizeBytes: 2048,
    pageCount: 2,
    status: 'ready'
  };

  const mockItem2: BatchSecurityQueueItem = {
    id: 'item-2',
    name: 'invoice.pdf',
    file: new File(['mock2'], 'invoice.pdf', { type: 'application/pdf' }),
    sizeBytes: 1024,
    pageCount: 1,
    status: 'ready'
  };

  beforeEach(() => {
    mockPdfBatchSecurityService = {
      inspectBatchFiles: vi.fn().mockResolvedValue([mockItem1, mockItem2]),
      processBatchProtect: vi.fn().mockResolvedValue({
        mode: 'protect',
        total: 2,
        successCount: 2,
        failureCount: 0,
        items: [mockItem1, mockItem2]
      } as BatchSecuritySummary),
      processBatchUnlock: vi.fn().mockResolvedValue({
        mode: 'unlock',
        total: 2,
        successCount: 2,
        failureCount: 0,
        items: [mockItem1, mockItem2]
      } as BatchSecuritySummary),
      createZipPackage: vi.fn().mockResolvedValue({
        blob: new Blob(['zip-bytes'], { type: 'application/zip' }),
        fileName: 'secured_pdfs.zip',
        fileCount: 2
      }),
      saveAllIndividually: vi.fn().mockResolvedValue({
        savedCount: 2,
        errors: []
      })
    };

    mockStorageService = {
      getQuotaStatus: vi.fn().mockResolvedValue({
        remaining: 50,
        isUnlimited: false,
        limit: 50,
        canStart: true
      }),
      saveFile: vi.fn().mockResolvedValue('file:///data/saved.pdf')
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfBatchSecurityService, useValue: mockPdfBatchSecurityService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SecurityBatchPage());
  });

  // =========================================================================
  // 1. INITIALIZATION & DEFAULTS
  // =========================================================================
  describe('Initialization', () => {
    it('initializes with protect mode, AES-256 standard, and empty queue', async () => {
      await page.ngOnInit();
      expect(page.mode).toBe('protect');
      expect(page.encryptionStandard).toBe('aes-256');
      expect(page.queue.length).toBe(0);
      expect(page.isProcessing).toBe(false);
      expect(page.isSummaryOpen).toBe(false);
      expect(page.quotaRemaining).toBe(50);
      expect(page.canStartBatch).toBe(false);
    });
  });

  // =========================================================================
  // 2. MODE SWITCHING & CONFIGURATION
  // =========================================================================
  describe('Mode & Standard Switching', () => {
    it('switches between protect and unlock modes', () => {
      page.setMode('unlock');
      expect(page.mode).toBe('unlock');

      page.setMode('protect');
      expect(page.mode).toBe('protect');
    });

    it('sets encryption standard correctly', () => {
      page.setStandard('aes-128');
      expect(page.encryptionStandard).toBe('aes-128');

      page.setStandard('rc4-128');
      expect(page.encryptionStandard).toBe('rc4-128');
    });

    it('updates user password when passphrase generator triggers', () => {
      page.onPassphraseGenerated('correct-horse-battery-staple');
      expect(page.userPassword).toBe('correct-horse-battery-staple');
      expect(page.confirmUserPassword).toBe('correct-horse-battery-staple');
    });
  });

  // =========================================================================
  // 3. QUEUE MANAGEMENT
  // =========================================================================
  describe('Queue Management', () => {
    it('adds inspected files to the queue without duplicates', async () => {
      const files = [mockItem1.file, mockItem2.file];
      await page.onFilesSelected(files);

      expect(page.queue.length).toBe(2);
      expect(page.queue[0].name).toBe('contract.pdf');
      expect(page.queue[1].name).toBe('invoice.pdf');

      // Adding duplicate should not duplicate
      await page.onFilesSelected(files);
      expect(page.queue.length).toBe(2);
    });

    it('removes an item from queue by ID', async () => {
      await page.onFilesSelected([mockItem1.file, mockItem2.file]);
      page.removeQueueItem('item-1');

      expect(page.queue.length).toBe(1);
      expect(page.queue[0].id).toBe('item-2');
    });

    it('clears the entire queue and resets summary state', async () => {
      await page.onFilesSelected([mockItem1.file, mockItem2.file]);
      page.clearQueue();

      expect(page.queue.length).toBe(0);
      expect(page.summary).toBeNull();
      expect(page.isSummaryOpen).toBe(false);
    });
  });

  // =========================================================================
  // 4. VALIDATION (canStartBatch)
  // =========================================================================
  describe('Validation (canStartBatch)', () => {
    beforeEach(async () => {
      await page.onFilesSelected([mockItem1.file]);
    });

    it('protect mode requires matching user passwords', () => {
      page.setMode('protect');
      page.userPassword = 'TestPassword123!';
      page.confirmUserPassword = 'WrongMismatch!';
      expect(page.canStartBatch).toBe(false);

      page.confirmUserPassword = 'TestPassword123!';
      expect(page.canStartBatch).toBe(true);

      // If owner password set, it must match confirmation
      page.ownerPassword = 'OwnerPassword456!';
      page.confirmOwnerPassword = 'MismatchOwner!';
      expect(page.canStartBatch).toBe(false);

      page.confirmOwnerPassword = 'OwnerPassword456!';
      expect(page.canStartBatch).toBe(true);
    });

    it('unlock mode requires master password or per-file passwords', () => {
      page.setMode('unlock');
      page.masterPassword = '';
      expect(page.canStartBatch).toBe(false);

      page.masterPassword = 'MasterPassword123!';
      expect(page.canStartBatch).toBe(true);

      // Or per-file password
      page.masterPassword = '';
      page.setFilePassword('item-1', 'PerFilePwd!');
      expect(page.canStartBatch).toBe(true);
    });
  });

  // =========================================================================
  // 5. BATCH EXECUTION & SUMMARY
  // =========================================================================
  describe('Batch Execution', () => {
    beforeEach(async () => {
      await page.onFilesSelected([mockItem1.file, mockItem2.file]);
    });

    it('executes batch protect successfully and opens summary sheet', async () => {
      page.setMode('protect');
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'Password123!';

      await page.startBatch();

      expect(mockPdfBatchSecurityService.processBatchProtect).toHaveBeenCalled();
      expect(page.summary).toBeDefined();
      expect(page.summary!.successCount).toBe(2);
      expect(page.isProcessing).toBe(false);
      expect(page.isSummaryOpen).toBe(true);
    });

    it('executes batch unlock successfully and opens summary sheet', async () => {
      page.setMode('unlock');
      page.masterPassword = 'UnlockMasterPwd!';

      await page.startBatch();

      expect(mockPdfBatchSecurityService.processBatchUnlock).toHaveBeenCalled();
      expect(page.summary).toBeDefined();
      expect(page.summary!.successCount).toBe(2);
      expect(page.isSummaryOpen).toBe(true);
    });

    it('allows cancelling an in-progress batch', async () => {
      let resolvePromise: any;
      const deferred = new Promise(res => { resolvePromise = res; });
      mockPdfBatchSecurityService.processBatchProtect.mockReturnValue(deferred);

      page.setMode('protect');
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'Password123!';

      const batchPromise = page.startBatch();
      expect(page.isProcessing).toBe(true);

      page.cancelBatch();
      resolvePromise({ mode: 'protect', total: 2, successCount: 0, failureCount: 0, items: [] });
      await batchPromise;

      expect(page.isProcessing).toBe(false);
    });
  });

  // =========================================================================
  // 6. EXPORT ACTIONS
  // =========================================================================
  describe('Export Actions', () => {
    beforeEach(async () => {
      await page.onFilesSelected([mockItem1.file]);
      page.userPassword = 'Pwd!';
      page.confirmUserPassword = 'Pwd!';
      await page.startBatch();
    });

    it('downloads ZIP archive through ShareService and shows toast', async () => {
      await page.downloadZip();

      expect(mockPdfBatchSecurityService.createZipPackage).toHaveBeenCalled();
      expect(mockShareService.shareFile).toHaveBeenCalled();
      expect(mockToastCtrl.create).toHaveBeenCalled();
    });

    it('saves all files individually and shows toast', async () => {
      await page.saveAllIndividually();

      expect(mockPdfBatchSecurityService.saveAllIndividually).toHaveBeenCalled();
      expect(mockToastCtrl.create).toHaveBeenCalled();
    });

    it('clears sensitive passwords and aborts running jobs on ngOnDestroy', () => {
      page.userPassword = 'SensitiveUserSecret!';
      page.ownerPassword = 'SensitiveOwnerSecret!';
      page.masterPassword = 'SensitiveMasterSecret!';

      page.ngOnDestroy();

      expect(page.userPassword).toBe('');
      expect(page.ownerPassword).toBe('');
      expect(page.masterPassword).toBe('');
    });
  });
});
