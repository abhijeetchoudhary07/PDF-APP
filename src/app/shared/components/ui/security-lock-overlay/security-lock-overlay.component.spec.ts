import '../../../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { AppSecurityLockOverlayComponent } from './security-lock-overlay.component';
import { AppSecurityLockService } from '../../../../core/services/app-security-lock.service';
import { AppLockConfig } from '../../../../core/models/app-security-lock.types';

describe('AppSecurityLockOverlayComponent', () => {
  let component: AppSecurityLockOverlayComponent;
  let mockService: any;
  let isLockedSubject: BehaviorSubject<boolean>;
  let configSubject: BehaviorSubject<AppLockConfig>;

  const defaultMockConfig: AppLockConfig = {
    enabled: true,
    biometricEnabled: true,
    lockAppOnLaunch: true,
    lockVaultOnly: false,
    autoLockTimeout: 'immediate',
    autoClearCacheOnExit: false,
    failedAttempts: 0
  };

  beforeEach(() => {
    isLockedSubject = new BehaviorSubject<boolean>(false);
    configSubject = new BehaviorSubject<AppLockConfig>({ ...defaultMockConfig });

    mockService = {
      isLocked$: isLockedSubject.asObservable(),
      config$: configSubject.asObservable(),
      currentConfig: defaultMockConfig,
      isBiometricAvailable: vi.fn().mockResolvedValue(true),
      verifyPin: vi.fn().mockResolvedValue({ success: true, attemptsRemaining: 5 }),
      authenticateBiometric: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AppSecurityLockService, useValue: mockService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    component = TestBed.runInInjectionContext(() => new AppSecurityLockOverlayComponent());
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('remains hidden when isLocked is false', () => {
    component.ngOnInit();
    expect(component.isLocked).toBe(false);
  });

  it('activates overlay when isLocked becomes true', () => {
    component.ngOnInit();
    isLockedSubject.next(true);

    expect(component.isLocked).toBe(true);
    expect(component.enteredPin).toBe('');
    expect(component.pinErrorMessage).toBe('');
  });

  it('handles keypad entry and backspace correctly', () => {
    component.ngOnInit();
    isLockedSubject.next(true);

    component.onKeypadPress('1');
    component.onKeypadPress('2');
    expect(component.enteredPin).toBe('12');

    component.onKeypadBackspace();
    expect(component.enteredPin).toBe('1');
  });

  it('processes PIN upon reaching 4 digits and clears state on success', async () => {
    component.ngOnInit();
    isLockedSubject.next(true);

    component.onKeypadPress('1');
    component.onKeypadPress('2');
    component.onKeypadPress('3');
    component.onKeypadPress('4');

    expect(component.enteredPin).toBe('1234');

    await (component as any).processPin();

    expect(mockService.verifyPin).toHaveBeenCalledWith('1234');
    expect(component.enteredPin).toBe('');
    expect(component.pinErrorMessage).toBe('');
  });

  it('displays shake animation and error text on PIN failure', async () => {
    mockService.verifyPin.mockResolvedValueOnce({
      success: false,
      attemptsRemaining: 4,
      errorMessage: 'Incorrect PIN. 4 attempts remaining.'
    });

    component.ngOnInit();
    isLockedSubject.next(true);

    component.onKeypadPress('9');
    component.onKeypadPress('9');
    component.onKeypadPress('9');
    component.onKeypadPress('9');

    await (component as any).processPin();

    expect(component.isPinErrorShaking).toBe(true);
    expect(component.pinErrorMessage).toContain('Incorrect PIN. 4 attempts remaining.');
    expect(component.enteredPin).toBe('');
  });

  it('enforces lockout countdown after 5 failed attempts', async () => {
    const lockedUntil = new Date(Date.now() + 15000);
    mockService.verifyPin.mockResolvedValueOnce({
      success: false,
      attemptsRemaining: 0,
      lockedUntil,
      errorMessage: 'Too many failed attempts. Locked for 30 seconds.'
    });

    component.ngOnInit();
    isLockedSubject.next(true);

    component.enteredPin = '0000';
    await (component as any).processPin();

    expect(component.isLockout).toBe(true);
    expect(component.lockoutMessage).toContain('Too many failed attempts');
  });

  it('calls authenticateBiometric when biometric button is clicked', async () => {
    component.ngOnInit();
    await component.checkBiometricSupport();

    expect(component.canUseBiometric).toBe(true);

    await component.onBiometricClick();
    expect(mockService.authenticateBiometric).toHaveBeenCalled();
  });
});
