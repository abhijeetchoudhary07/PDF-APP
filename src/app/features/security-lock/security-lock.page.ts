import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Subscription } from 'rxjs';

import { AppSecurityLockService } from '../../core/services/app-security-lock.service';
import {
  AppLockConfig,
  AutoLockTimeout,
  PanicClearBreakdown
} from '../../core/models/app-security-lock.types';

import {
  AppHeaderComponent,
  AppIconComponent,
  AppBadgeComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-security-lock',
  templateUrl: './security-lock.page.html',
  styleUrls: ['./security-lock.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppIconComponent,
    AppBadgeComponent,
    TranslatePipe
  ]
})
export class SecurityLockPage implements OnInit, OnDestroy {
  private securityLockService = inject(AppSecurityLockService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  config: AppLockConfig = {
    enabled: false,
    biometricEnabled: false,
    lockAppOnLaunch: false,
    lockVaultOnly: false,
    autoLockTimeout: 'immediate',
    autoClearCacheOnExit: false,
    failedAttempts: 0
  };

  hasBiometricSupport = false;
  isClearingCache = false;
  isPanicClearing = false;

  // PIN Keypad Modal State
  showPinModal = false;
  pinModalMode: 'set' | 'change' | 'disable' = 'set';
  pinModalStep: 1 | 2 | 3 = 1;
  enteredPin = '';
  tempNewPin = '';
  pinErrorMessage = '';
  isPinErrorShaking = false;

  // Panic Clear Confirmation Bottom Sheet State
  showPanicSheet = false;
  panicSheetStep: 1 | 2 = 1;
  panicBreakdown: PanicClearBreakdown | null = null;

  private configSub?: Subscription;

  ngOnInit(): void {
    this.configSub = this.securityLockService.config$.subscribe(cfg => {
      this.config = { ...cfg };
      this.cdr.markForCheck();
    });

    this.checkBiometricSupport();
  }

  ngOnDestroy(): void {
    this.configSub?.unsubscribe();
  }

  async checkBiometricSupport(): Promise<void> {
    this.hasBiometricSupport = await this.securityLockService.isBiometricAvailable();
    this.cdr.markForCheck();
  }

  // --- LOCK TOGGLE & CONFIGURATION ---

  onToggleLockClicked(): void {
    if (this.config.enabled) {
      // Disabling requires confirming current PIN
      this.openPinModal('disable');
    } else {
      // Enabling requires setting up a 4-digit PIN
      this.openPinModal('set');
    }
  }

  async setLockTarget(target: 'app' | 'vault'): Promise<void> {
    await this.hapticTick();
    if (target === 'app') {
      await this.securityLockService.setLockTargets(true, false);
    } else {
      await this.securityLockService.setLockTargets(false, true);
    }
  }

  async setAutoLockTimeout(timeout: AutoLockTimeout): Promise<void> {
    await this.hapticTick();
    await this.securityLockService.setAutoLockTimeout(timeout);
  }

  async toggleBiometric(): Promise<void> {
    await this.hapticTick();
    await this.securityLockService.setBiometricEnabled(!this.config.biometricEnabled);
  }

  async toggleAutoClearCache(): Promise<void> {
    await this.hapticTick();
    await this.securityLockService.setAutoClearCacheOnExit(!this.config.autoClearCacheOnExit);
  }

  async clearCacheNow(): Promise<void> {
    this.isClearingCache = true;
    this.cdr.markForCheck();

    try {
      const res = await this.securityLockService.clearTempCache();
      await this.hapticNotification(NotificationType.Success);
      await this.showToast(
        `Temporary cache cleared successfully! (${res.clearedFilesCount} files removed)`,
        'success'
      );
    } catch {
      await this.showToast('Failed to clear temporary cache.', 'danger');
    } finally {
      this.isClearingCache = false;
      this.cdr.markForCheck();
    }
  }

  // --- PIN MODAL MANAGEMENT ---

  openPinModal(mode: 'set' | 'change' | 'disable'): void {
    this.pinModalMode = mode;
    this.pinModalStep = 1;
    this.enteredPin = '';
    this.tempNewPin = '';
    this.pinErrorMessage = '';
    this.isPinErrorShaking = false;
    this.showPinModal = true;
    this.hapticTick();
    this.cdr.markForCheck();
  }

  closePinModal(): void {
    this.showPinModal = false;
    this.enteredPin = '';
    this.tempNewPin = '';
    this.pinErrorMessage = '';
    this.isPinErrorShaking = false;
    this.cdr.markForCheck();
  }

  onKeypadPress(digit: string): void {
    if (this.enteredPin.length >= 4) return;
    this.enteredPin += digit;
    this.pinErrorMessage = '';
    this.hapticTick();
    this.cdr.markForCheck();

    if (this.enteredPin.length === 4) {
      setTimeout(() => this.processPinStep(), 150);
    }
  }

  onKeypadBackspace(): void {
    if (this.enteredPin.length > 0) {
      this.enteredPin = this.enteredPin.slice(0, -1);
      this.pinErrorMessage = '';
      this.hapticTick();
      this.cdr.markForCheck();
    }
  }

  private async processPinStep(): Promise<void> {
    const pin = this.enteredPin;

    if (this.pinModalMode === 'set') {
      if (this.pinModalStep === 1) {
        // Step 1: Save first entry, move to confirmation
        this.tempNewPin = pin;
        this.enteredPin = '';
        this.pinModalStep = 2;
        this.cdr.markForCheck();
      } else if (this.pinModalStep === 2) {
        // Step 2: Confirm PIN
        if (pin === this.tempNewPin) {
          await this.securityLockService.setPin(pin);
          await this.hapticNotification(NotificationType.Success);
          await this.showToast('Security PIN set successfully!', 'success');
          this.closePinModal();
        } else {
          await this.triggerPinError('PINs do not match. Please try again.');
          this.enteredPin = '';
          this.pinModalStep = 2;
        }
      }
    } else if (this.pinModalMode === 'change') {
      if (this.pinModalStep === 1) {
        // Step 1: Verify current PIN
        const verifyRes = await this.securityLockService.verifyPin(pin);
        if (verifyRes.success) {
          this.enteredPin = '';
          this.pinModalStep = 2;
          this.cdr.markForCheck();
        } else {
          await this.triggerPinError(verifyRes.errorMessage || 'Incorrect PIN.');
          this.enteredPin = '';
        }
      } else if (this.pinModalStep === 2) {
        // Step 2: Enter new PIN
        this.tempNewPin = pin;
        this.enteredPin = '';
        this.pinModalStep = 3;
        this.cdr.markForCheck();
      } else if (this.pinModalStep === 3) {
        // Step 3: Confirm new PIN
        if (pin === this.tempNewPin) {
          await this.securityLockService.setPin(pin);
          await this.hapticNotification(NotificationType.Success);
          await this.showToast('Security PIN updated successfully!', 'success');
          this.closePinModal();
        } else {
          await this.triggerPinError('PINs do not match. Please try again.');
          this.enteredPin = '';
        }
      }
    } else if (this.pinModalMode === 'disable') {
      // Verify current PIN to disable
      const verifyRes = await this.securityLockService.verifyPin(pin);
      if (verifyRes.success) {
        await this.securityLockService.disableLock();
        await this.hapticNotification(NotificationType.Success);
        await this.showToast('Security lock disabled.', 'success');
        this.closePinModal();
      } else {
        await this.triggerPinError(verifyRes.errorMessage || 'Incorrect PIN.');
        this.enteredPin = '';
      }
    }
  }

  private async triggerPinError(message: string): Promise<void> {
    this.pinErrorMessage = message;
    this.isPinErrorShaking = true;
    await this.hapticNotification(NotificationType.Error);
    this.cdr.markForCheck();

    setTimeout(() => {
      this.isPinErrorShaking = false;
      this.cdr.markForCheck();
    }, 500);
  }

  getModalTitle(): string {
    if (this.pinModalMode === 'set') {
      return this.pinModalStep === 1
        ? 'appLock.modalTitleSetPin'
        : 'appLock.modalTitleConfirmPin';
    } else if (this.pinModalMode === 'change') {
      if (this.pinModalStep === 1) return 'appLock.modalTitleChangePinCurrent';
      if (this.pinModalStep === 2) return 'appLock.modalTitleChangePinNew';
      return 'appLock.modalTitleConfirmPin';
    } else {
      return 'appLock.modalTitleEnterPin';
    }
  }

  // --- EMERGENCY PANIC CLEAR BOTTOM SHEET ---

  async openPanicClear(): Promise<void> {
    await this.hapticTick();
    this.panicBreakdown = await this.securityLockService.getPanicClearBreakdown();
    this.panicSheetStep = 1;
    this.showPanicSheet = true;
    this.cdr.markForCheck();
  }

  closePanicSheet(): void {
    this.showPanicSheet = false;
    this.panicSheetStep = 1;
    this.cdr.markForCheck();
  }

  async proceedToFinalPanicConfirm(): Promise<void> {
    await this.hapticNotification(NotificationType.Warning);
    this.panicSheetStep = 2;
    this.cdr.markForCheck();
  }

  async executePanicClear(): Promise<void> {
    this.isPanicClearing = true;
    this.cdr.markForCheck();

    try {
      await this.securityLockService.panicClear();
      await this.hapticNotification(NotificationType.Success);
      await this.showToast(
        'All local data, cache, and preferences have been permanently wiped.',
        'success'
      );
      this.closePanicSheet();
    } catch {
      await this.showToast('Panic clear encountered an error.', 'danger');
    } finally {
      this.isPanicClearing = false;
      this.cdr.markForCheck();
    }
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  private async hapticTick() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  private async hapticNotification(type: NotificationType) {
    try {
      await Haptics.notification({ type });
    } catch {}
  }
}
