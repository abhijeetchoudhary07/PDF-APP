import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { SecurityProtectPage } from './security-protect.page';
import { FileService } from '../../core/services/file.service';
import { PdfSecurityService } from '../../core/services/pdf-security.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ValidationService } from '../../core/services/validation.service';

describe('SecurityProtectPage', () => {
  let page: SecurityProtectPage;
  let mockFileService: any;
  let mockPdfSecurityService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockHistoryService: any;
  let mockValidationService: any;
  let mockAlertCtrl: any;
  let mockToastCtrl: any;
  let mockRouter: any;

  beforeEach(() => {
    mockFileService = {
      pickPdfFile: vi.fn()
    };

    mockPdfSecurityService = {
      detectSecurity: vi.fn().mockResolvedValue({
        isEncrypted: false,
        requiresUserPassword: false,
        hasPermissionsRestricted: false
      }),
      protectPdf: vi.fn().mockResolvedValue({
        file: new File(['mock-protected-pdf'], 'sample_protected.pdf', { type: 'application/pdf' }),
        blob: new Blob(['mock-protected-pdf'], { type: 'application/pdf' }),
        sizeBytes: 1024,
        uri: 'file:///data/sample_protected.pdf'
      })
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue(true)
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockHistoryService = {
      addHistoryItem: vi.fn()
    };

    mockValidationService = {
      validatePdfFile: vi.fn().mockResolvedValue({ valid: true })
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
        { provide: FileService, useValue: mockFileService },
        { provide: PdfSecurityService, useValue: mockPdfSecurityService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SecurityProtectPage());
  });

  describe('Initialization', () => {
    it('initializes with default standard AES-256 and empty state', () => {
      expect(page.encryptionStandard).toBe('aes-256');
      expect(page.workflowState).toBe('EMPTY');
      expect(page.userPassword).toBe('');
      expect(page.confirmUserPassword).toBe('');
      expect(page.ownerPassword).toBe('');
      expect(page.confirmOwnerPassword).toBe('');
      expect(page.canExecute).toBe(false);
    });
  });

  describe('Standard Selection', () => {
    it('updates standard to aes-128 and rc4-128', () => {
      page.setStandard('aes-128');
      expect(page.encryptionStandard).toBe('aes-128');

      page.setStandard('rc4-128');
      expect(page.encryptionStandard).toBe('rc4-128');

      page.setStandard('aes-256');
      expect(page.encryptionStandard).toBe('aes-256');
    });
  });

  describe('Validation & canExecute', () => {
    it('prevents execution when no file is loaded', () => {
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'Password123!';
      expect(page.canExecute).toBe(false);
    });

    it('prevents execution when passwords mismatch', () => {
      page.loadedFile = new File(['%PDF-1.4 mock'], 'test.pdf', { type: 'application/pdf' });
      page.arrayBuffer = new ArrayBuffer(100);
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'DifferentPassword';
      expect(page.canExecute).toBe(false);
    });

    it('prevents execution when owner passwords mismatch if owner password is provided', () => {
      page.loadedFile = new File(['%PDF-1.4 mock'], 'test.pdf', { type: 'application/pdf' });
      page.arrayBuffer = new ArrayBuffer(100);
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'Password123!';
      page.ownerPassword = 'OwnerSecret';
      page.confirmOwnerPassword = 'MismatchOwner';
      expect(page.canExecute).toBe(false);
    });

    it('allows execution when file is loaded and user passwords match', () => {
      page.loadedFile = new File(['%PDF-1.4 mock'], 'test.pdf', { type: 'application/pdf' });
      page.arrayBuffer = new ArrayBuffer(100);
      page.userPassword = 'Password123!';
      page.confirmUserPassword = 'Password123!';
      expect(page.canExecute).toBe(true);
    });
  });

  describe('Permissions Toggles', () => {
    it('updates granular permissions when toggles are pressed', () => {
      expect(page.permissions.allowCopying).toBe(true);
      page.toggleCopying();
      expect(page.permissions.allowCopying).toBe(false);

      expect(page.permissions.allowModifying).toBe(true);
      page.toggleModifying();
      expect(page.permissions.allowModifying).toBe(false);

      page.togglePrinting('none');
      expect(page.permissions.allowPrinting).toBe('none');

      page.togglePrinting('high-resolution');
      expect(page.permissions.allowPrinting).toBe('high-resolution');
    });
  });

  describe('Protection Execution Flow', () => {
    it('encrypts document, tracks quota via storageService, and transitions to SUCCESS', async () => {
      page.loadedFile = new File(['%PDF-1.4 mock'], 'doc.pdf', { type: 'application/pdf' });
      page.arrayBuffer = new ArrayBuffer(100);
      page.userPassword = 'SecretPass123!';
      page.confirmUserPassword = 'SecretPass123!';
      page.encryptionStandard = 'aes-256';

      await page.executeProtect();

      expect(mockPdfSecurityService.protectPdf).toHaveBeenCalledWith(
        page.arrayBuffer,
        expect.objectContaining({
          userPassword: 'SecretPass123!',
          encryptionLevel: 'aes-256'
        }),
        expect.any(String)
      );

      expect(mockHistoryService.addHistoryItem).toHaveBeenCalled();
      expect(page.workflowState).toBe('SUCCESS');
      expect(page.resultFile).toBeDefined();
    });

    it('resets workflow when resetConfig() is called', () => {
      page.userPassword = 'Test';
      page.confirmUserPassword = 'Test';
      page.resultFile = new File(['mock'], 'result.pdf');

      page.resetConfig();

      expect(page.userPassword).toBe('');
      expect(page.confirmUserPassword).toBe('');
      expect(page.resultFile).toBeUndefined();
    });
  });
});
