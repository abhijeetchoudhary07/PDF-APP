import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { SecurityLockPage } from './security-lock.page';
import { AppSecurityLockService } from '../../core/services/app-security-lock.service';
import { AppLockConfig, PanicClearBreakdown } from '../../core/models/app-security-lock.types';

describe('SecurityLockPage — UI / UX and Panic Clear Workflow', () => {
  let page: SecurityLockPage;
  let mockSecurityLockService: any;
  let mockToastCtrl: any;
  let mockRouter: any;
  let mockCdr: any;
  let configSubject: BehaviorSubject<AppLockConfig>;

  const defaultMockConfig: AppLockConfig = {
    enabled: false,
    biometricEnabled: false,
    lockAppOnLaunch: false,
    lockVaultOnly: false,
    autoLockTimeout: 'immediate',
    autoClearCacheOnExit: false,
    failedAttempts: 0
  };

  const mockBreakdown: PanicClearBreakdown = {
    cachedFilesCount: 5,
    cachedFilesSizeBytes: 10485760,
    historyEntriesCount: 12,
    savedSignaturesCount: 2,
    preferencesKeysCount: 15,
    indexedDbDatabasesCount: 3,
    totalItemsCount: 37,
    formattedSummary: '5 cached files (10.0 MB), 12 history entries, 2 saved signatures, 15 settings entries.'
  };

  beforeEach(() => {
    configSubject = new BehaviorSubject<AppLockConfig>({ ...defaultMockConfig });

    mockSecurityLockService = {
      config$: configSubject.asObservable(),
      currentConfig: defaultMockConfig,
      isBiometricAvailable: vi.fn().mockResolvedValue(true),
      setPin: vi.fn().mockResolvedValue(undefined),
      verifyPin: vi.fn().mockResolvedValue({ success: true, attemptsRemaining: 5 }),
      changePin: vi.fn().mockResolvedValue({ success: true, attemptsRemaining: 5 }),
      disableLock: vi.fn().mockResolvedValue(undefined),
      setLockTargets: vi.fn().mockResolvedValue(undefined),
      setAutoLockTimeout: vi.fn().mockResolvedValue(undefined),
      setBiometricEnabled: vi.fn().mockResolvedValue(undefined),
      setAutoClearCacheOnExit: vi.fn().mockResolvedValue(undefined),
      clearTempCache: vi.fn().mockResolvedValue({ clearedFilesCount: 4, clearedBytes: 2048 }),
      getPanicClearBreakdown: vi.fn().mockResolvedValue(mockBreakdown),
      panicClear: vi.fn().mockResolvedValue(undefined)
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
        { provide: AppSecurityLockService, useValue: mockSecurityLockService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SecurityLockPage());
  });

  afterEach(() => {
    page.ngOnDestroy();
  });

  it('initializes with default unlocked config and checks biometric support', async () => {
    page.ngOnInit();
    await page.checkBiometricSupport();
    expect(page.config.enabled).toBe(false);
    expect(mockSecurityLockService.isBiometricAvailable).toHaveBeenCalled();
    expect(page.hasBiometricSupport).toBe(true);
  });

  it('opens PIN setup modal when toggling lock ON from disabled state', () => {
    page.ngOnInit();
    expect(page.config.enabled).toBe(false);

    page.onToggleLockClicked();
    expect(page.showPinModal).toBe(true);
    expect(page.pinModalMode).toBe('set');
    expect(page.pinModalStep).toBe(1);
  });

  it('completes 2-step PIN setup with match and sets PIN on service', async () => {
    page.openPinModal('set');

    // Step 1: enter 1-2-3-4
    page.onKeypadPress('1');
    page.onKeypadPress('2');
    page.onKeypadPress('3');
    page.onKeypadPress('4');

    expect(page.enteredPin).toBe('1234');
    (page as any).processPinStep();

    expect(page.pinModalStep).toBe(2);
    expect((page as any).tempNewPin).toBe('1234');
    expect(page.enteredPin).toBe('');

    // Step 2: confirm matching 1-2-3-4
    page.onKeypadPress('1');
    page.onKeypadPress('2');
    page.onKeypadPress('3');
    page.onKeypadPress('4');

    await (page as any).processPinStep();

    expect(mockSecurityLockService.setPin).toHaveBeenCalledWith('1234');
    expect(page.showPinModal).toBe(false);
  });

  it('detects mismatched PIN in step 2 and shows error', async () => {
    page.openPinModal('set');
    page.enteredPin = '1234';
    (page as any).processPinStep();

    // Confirm with mismatched PIN 9999
    page.enteredPin = '9999';
    await (page as any).processPinStep();

    expect(mockSecurityLockService.setPin).not.toHaveBeenCalled();
    expect(page.pinErrorMessage).toContain('PINs do not match');
    expect(page.enteredPin).toBe('');
  });

  it('handles backspace on keypad correctly', () => {
    page.openPinModal('set');
    page.onKeypadPress('5');
    page.onKeypadPress('6');
    expect(page.enteredPin).toBe('56');

    page.onKeypadBackspace();
    expect(page.enteredPin).toBe('5');
  });

  it('disables lock after verifying current PIN', async () => {
    page.config.enabled = true;
    page.onToggleLockClicked();

    expect(page.pinModalMode).toBe('disable');
    page.enteredPin = '1234';
    await (page as any).processPinStep();

    expect(mockSecurityLockService.verifyPin).toHaveBeenCalledWith('1234');
    expect(mockSecurityLockService.disableLock).toHaveBeenCalled();
    expect(page.showPinModal).toBe(false);
  });

  it('updates lock targets when options are tapped', async () => {
    await page.setLockTarget('vault');
    expect(mockSecurityLockService.setLockTargets).toHaveBeenCalledWith(false, true);

    await page.setLockTarget('app');
    expect(mockSecurityLockService.setLockTargets).toHaveBeenCalledWith(true, false);
  });

  it('updates auto-lock timeout when selected', async () => {
    await page.setAutoLockTimeout('5min');
    expect(mockSecurityLockService.setAutoLockTimeout).toHaveBeenCalledWith('5min');
  });

  it('triggers manual cache clear and displays toast', async () => {
    await page.clearCacheNow();
    expect(mockSecurityLockService.clearTempCache).toHaveBeenCalled();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );
  });

  it('handles two-step Emergency Panic Clear execution', async () => {
    // 1. Open Panic Clear Sheet
    await page.openPanicClear();
    expect(mockSecurityLockService.getPanicClearBreakdown).toHaveBeenCalled();
    expect(page.showPanicSheet).toBe(true);
    expect(page.panicSheetStep).toBe(1);
    expect(page.panicBreakdown).toBe(mockBreakdown);

    // 2. Advance to Final Step
    await page.proceedToFinalPanicConfirm();
    expect(page.panicSheetStep).toBe(2);

    // 3. Execute Panic Clear
    await page.executePanicClear();
    expect(mockSecurityLockService.panicClear).toHaveBeenCalled();
    expect(page.showPanicSheet).toBe(false);
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );
  });
});
