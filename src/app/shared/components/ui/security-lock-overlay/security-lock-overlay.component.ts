import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { AppSecurityLockService } from '../../../../core/services/app-security-lock.service';
import { AppLockConfig } from '../../../../core/models/app-security-lock.types';
import { AppIconComponent } from '../icon/icon.component';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-security-lock-overlay',
  standalone: true,
  imports: [CommonModule, AppIconComponent, TranslatePipe],
  template: `
    @if (isLocked) {
      <div class="lock-overlay-backdrop" role="dialog" aria-modal="true" data-testid="security-lock-overlay">
        <div class="lock-overlay-card">
          <div class="lock-header">
            <div class="lock-icon-wrap" [class.danger]="isLockout">
              <app-icon [name]="isLockout ? 'warning' : 'lock-closed'" size="36"></app-icon>
            </div>
            <h2 class="lock-title">{{ isLockout ? ('appLock.lockedOutTitle' | translate) : ('appLock.modalTitleEnterPin' | translate) }}</h2>
            <p class="lock-subtitle">
              {{ isLockout ? lockoutMessage : ('appLock.biometricPinDesc' | translate) }}
            </p>
          </div>

          <!-- 4-Dot Indicators -->
          <div class="pin-dots-row" [class.shake]="isPinErrorShaking" data-testid="overlay-pin-dots">
            <span class="pin-dot" [class.filled]="enteredPin.length >= 1"></span>
            <span class="pin-dot" [class.filled]="enteredPin.length >= 2"></span>
            <span class="pin-dot" [class.filled]="enteredPin.length >= 3"></span>
            <span class="pin-dot" [class.filled]="enteredPin.length >= 4"></span>
          </div>

          @if (pinErrorMessage) {
            <p class="pin-error-text" data-testid="overlay-pin-error">{{ pinErrorMessage }}</p>
          }

          <!-- 64x64px Touch Target Keypad Grid -->
          <div class="keypad-grid" [class.disabled]="isLockout">
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-1" (click)="onKeypadPress('1')">1</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-2" (click)="onKeypadPress('2')">2</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-3" (click)="onKeypadPress('3')">3</button>

            <button type="button" class="keypad-btn" data-testid="overlay-keypad-4" (click)="onKeypadPress('4')">4</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-5" (click)="onKeypadPress('5')">5</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-6" (click)="onKeypadPress('6')">6</button>

            <button type="button" class="keypad-btn" data-testid="overlay-keypad-7" (click)="onKeypadPress('7')">7</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-8" (click)="onKeypadPress('8')">8</button>
            <button type="button" class="keypad-btn" data-testid="overlay-keypad-9" (click)="onKeypadPress('9')">9</button>

            @if (canUseBiometric) {
              <button
                type="button"
                class="keypad-btn biometric"
                data-testid="btn-overlay-biometric"
                (click)="onBiometricClick()"
                aria-label="Unlock with Biometrics">
                <app-icon name="fingerprint" size="26"></app-icon>
              </button>
            } @else {
              <div class="keypad-btn empty"></div>
            }

            <button type="button" class="keypad-btn" data-testid="overlay-keypad-0" (click)="onKeypadPress('0')">0</button>

            <button
              type="button"
              class="keypad-btn backspace"
              data-testid="overlay-keypad-backspace"
              (click)="onKeypadBackspace()"
              aria-label="Backspace">
              <app-icon name="arrow-undo" size="22"></app-icon>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .lock-overlay-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      background: var(--color-background, #0f172a);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      box-sizing: border-box;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .lock-overlay-card {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .lock-icon-wrap {
      width: 68px;
      height: 68px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(99, 102, 241, 0.14);
      color: var(--color-primary, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto var(--space-3, 12px);

      &.danger {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }
    }

    .lock-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--color-text, #f8fafc);
      margin: 0 0 6px;
    }

    .lock-subtitle {
      font-size: 13px;
      color: var(--color-text-secondary, #94a3b8);
      margin: 0 0 24px;
      max-width: 280px;
    }

    .pin-dots-row {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      transition: transform 0.2s ease;

      &.shake {
        animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      }
    }

    .pin-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--color-border, #475569);
      background: transparent;
      transition: all 0.15s ease;

      &.filled {
        background: var(--color-primary, #6366f1);
        border-color: var(--color-primary, #6366f1);
        box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
      }
    }

    .pin-error-text {
      color: #ef4444;
      font-size: 13px;
      font-weight: 500;
      margin: -12px 0 18px;
    }

    .keypad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      width: 100%;
      max-width: 280px;

      &.disabled {
        opacity: 0.4;
        pointer-events: none;
      }
    }

    .keypad-btn {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: var(--color-surface, #1e293b);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      color: var(--color-text, #f8fafc);
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin: 0 auto;
      transition: all 0.12s ease;
      -webkit-tap-highlight-color: transparent;

      &:active {
        background: var(--color-primary, #6366f1);
        color: #ffffff;
        transform: scale(0.94);
      }

      &.empty {
        background: transparent;
        border: none;
        cursor: default;
      }

      &.biometric, &.backspace {
        background: var(--color-surface, #1e293b);
        color: var(--color-text-secondary, #94a3b8);

        &:active {
          background: var(--color-surface-hover, #334155);
          color: #ffffff;
        }
      }
    }

    @keyframes shake {
      10%, 90% { transform: translate3d(-2px, 0, 0); }
      20%, 80% { transform: translate3d(4px, 0, 0); }
      30%, 50%, 70% { transform: translate3d(-6px, 0, 0); }
      40%, 60% { transform: translate3d(6px, 0, 0); }
    }
  `]
})
export class AppSecurityLockOverlayComponent implements OnInit, OnDestroy {
  public securityLockService = inject(AppSecurityLockService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  isLocked = false;
  config: AppLockConfig = this.securityLockService.currentConfig;
  canUseBiometric = false;

  enteredPin = '';
  pinErrorMessage = '';
  isPinErrorShaking = false;
  isLockout = false;
  lockoutMessage = '';

  private subs = new Subscription();
  private lockoutTimer?: any;

  ngOnInit(): void {
    this.subs.add(
      this.securityLockService.isLocked$.subscribe(locked => {
        this.ngZone.run(() => {
          this.isLocked = locked;
          if (locked) {
            this.enteredPin = '';
            this.pinErrorMessage = '';
            this.checkLockoutState();
            this.attemptBiometricIfEnabled();
          }
          if (this.cdr && typeof this.cdr.detectChanges === 'function') {
            this.cdr.detectChanges();
          } else {
            this.cdr.markForCheck();
          }
        });
      })
    );

    this.subs.add(
      this.securityLockService.config$.subscribe(cfg => {
        this.ngZone.run(() => {
          this.config = cfg;
          this.checkBiometricSupport();
          if (this.cdr && typeof this.cdr.detectChanges === 'function') {
            this.cdr.detectChanges();
          } else {
            this.cdr.markForCheck();
          }
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.lockoutTimer) {
      clearInterval(this.lockoutTimer);
    }
  }

  async checkBiometricSupport(): Promise<void> {
    const supported = await this.securityLockService.isBiometricAvailable();
    this.canUseBiometric = supported && !!this.config.biometricEnabled;
    this.cdr.markForCheck();
  }

  private async attemptBiometricIfEnabled(): Promise<void> {
    if (this.canUseBiometric) {
      setTimeout(async () => {
        const success = await this.securityLockService.authenticateBiometric();
        if (success) {
          await this.hapticNotification(NotificationType.Success);
        }
      }, 350);
    }
  }

  onKeypadPress(digit: string): void {
    if (this.isLockout || this.enteredPin.length >= 4) return;
    this.enteredPin += digit;
    this.pinErrorMessage = '';
    this.hapticTick();
    this.cdr.markForCheck();

    if (this.enteredPin.length === 4) {
      setTimeout(() => this.processPin(), 120);
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

  async onBiometricClick(): Promise<void> {
    await this.hapticTick();
    const success = await this.securityLockService.authenticateBiometric();
    if (success) {
      await this.hapticNotification(NotificationType.Success);
    }
  }

  private async processPin(): Promise<void> {
    const pin = this.enteredPin;
    const res = await this.securityLockService.verifyPin(pin);

    if (res.success) {
      await this.hapticNotification(NotificationType.Success);
      this.enteredPin = '';
      this.pinErrorMessage = '';
      this.isLockout = false;
      this.cdr.markForCheck();
    } else {
      this.enteredPin = '';
      await this.triggerPinError(res.errorMessage || 'Incorrect PIN.');
      if (res.lockedUntil) {
        this.startLockoutCountdown(res.lockedUntil);
      }
    }
  }

  private checkLockoutState(): void {
    const cfg = this.securityLockService.currentConfig;
    if (cfg.lockedUntilTimestamp && Date.now() < cfg.lockedUntilTimestamp) {
      this.startLockoutCountdown(new Date(cfg.lockedUntilTimestamp));
    } else {
      this.isLockout = false;
      this.lockoutMessage = '';
    }
  }

  private startLockoutCountdown(until: Date): void {
    this.isLockout = true;
    if (this.lockoutTimer) clearInterval(this.lockoutTimer);

    const updateMsg = () => {
      const remainingSec = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 1000));
      if (remainingSec <= 0) {
        this.isLockout = false;
        this.lockoutMessage = '';
        this.pinErrorMessage = '';
        clearInterval(this.lockoutTimer);
      } else {
        this.lockoutMessage = `Too many failed attempts. Try again in ${remainingSec}s.`;
        this.pinErrorMessage = this.lockoutMessage;
      }
      this.cdr.markForCheck();
    };

    updateMsg();
    this.lockoutTimer = setInterval(updateMsg, 1000);
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

  private async hapticTick(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  private async hapticNotification(type: NotificationType): Promise<void> {
    try {
      await Haptics.notification({ type });
    } catch {}
  }
}
