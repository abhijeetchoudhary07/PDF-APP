import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { HistoryPage } from './history.page';
import { HistoryService } from '../../core/services/history.service';
import { ShareService } from '../../core/services/share.service';
import { AppSecurityLockService } from '../../core/services/app-security-lock.service';

describe('HistoryPage — Vault Lock Gating', () => {
  let page: HistoryPage;
  let mockHistoryService: any;
  let mockShareService: any;
  let mockAlertCtrl: any;
  let mockSecurityLockService: any;
  let isVaultLockedSubject: BehaviorSubject<boolean>;

  const sampleItems = [
    {
      id: 'h1',
      operation: 'pdf',
      originalFileName: 'contract.pdf',
      outputFileName: 'contract_protected.pdf',
      originalSizeBytes: 1024,
      outputSizeBytes: 2048,
      date: Date.now()
    }
  ];

  beforeEach(() => {
    isVaultLockedSubject = new BehaviorSubject<boolean>(false);

    mockHistoryService = {
      getHistory: vi.fn().mockResolvedValue([...sampleItems])
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockSecurityLockService = {
      isVaultLocked$: isVaultLockedSubject.asObservable(),
      isVaultCurrentlyLocked: false,
      currentConfig: {
        enabled: false,
        lockVaultOnly: false,
        biometricEnabled: false
      },
      isBiometricAvailable: vi.fn().mockResolvedValue(false),
      verifyPin: vi.fn().mockResolvedValue({ success: true }),
      unlockVault: vi.fn().mockImplementation(() => {
        isVaultLockedSubject.next(false);
      }),
      authenticateBiometric: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: ShareService, useValue: mockShareService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: AppSecurityLockService, useValue: mockSecurityLockService }
      ]
    });

    page = TestBed.runInInjectionContext(() => new HistoryPage());
  });

  it('renders history items directly when vault lock is disabled', async () => {
    await page.ngOnInit();
    expect(page.isVaultLocked).toBe(false);
    expect(page.history.length).toBe(1);
    expect(page.filteredHistory.length).toBe(1);
  });

  it('gates history content when lockVaultOnly is active and vault is locked', async () => {
    mockSecurityLockService.currentConfig = {
      enabled: true,
      lockVaultOnly: true,
      biometricEnabled: false
    };
    mockSecurityLockService.isVaultCurrentlyLocked = true;
    isVaultLockedSubject.next(true);

    await page.ngOnInit();
    expect(page.isVaultLocked).toBe(true);
  });

  it('unlocks history vault when correct PIN is entered', async () => {
    mockSecurityLockService.currentConfig = {
      enabled: true,
      lockVaultOnly: true,
      biometricEnabled: false
    };
    mockSecurityLockService.isVaultCurrentlyLocked = true;
    isVaultLockedSubject.next(true);

    await page.ngOnInit();
    expect(page.isVaultLocked).toBe(true);

    page.vaultPinInput = '1234';
    await page.unlockVaultWithPin();

    expect(mockSecurityLockService.verifyPin).toHaveBeenCalledWith('1234');
    expect(mockSecurityLockService.unlockVault).toHaveBeenCalled();
    expect(page.isVaultLocked).toBe(false);
    expect(page.vaultPinInput).toBe('');
    expect(page.vaultPinError).toBe('');
  });

  it('shows error and keeps vault locked on incorrect PIN', async () => {
    mockSecurityLockService.currentConfig = {
      enabled: true,
      lockVaultOnly: true,
      biometricEnabled: false
    };
    mockSecurityLockService.isVaultCurrentlyLocked = true;
    mockSecurityLockService.verifyPin.mockResolvedValueOnce({
      success: false,
      errorMessage: 'Incorrect PIN. 4 attempts remaining.'
    });

    await page.ngOnInit();
    page.isVaultLocked = true;

    page.vaultPinInput = '0000';
    await page.unlockVaultWithPin();

    expect(mockSecurityLockService.unlockVault).not.toHaveBeenCalled();
    expect(page.isVaultLocked).toBe(true);
    expect(page.vaultPinError).toBe('Incorrect PIN. 4 attempts remaining.');
  });

  it('unlocks vault via biometric verification when available', async () => {
    page.isVaultLocked = true;

    await page.unlockVaultWithBiometric();

    expect(mockSecurityLockService.authenticateBiometric).toHaveBeenCalled();
    expect(mockSecurityLockService.unlockVault).toHaveBeenCalled();
    expect(page.isVaultLocked).toBe(false);
  });
});
