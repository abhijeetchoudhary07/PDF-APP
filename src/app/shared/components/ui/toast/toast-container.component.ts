import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastMessage } from '../../../../core/services/toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <div
        *ngFor="let toast of toastService.toasts$ | async"
        class="toast-item"
        [ngClass]="'toast-' + toast.type"
        role="alert">
        
        <!-- Status Icon -->
        <div class="toast-icon-box">
          <!-- Success -->
          <svg *ngIf="toast.type === 'success'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>

          <!-- Warning -->
          <svg *ngIf="toast.type === 'warning'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>

          <!-- Error -->
          <svg *ngIf="toast.type === 'error'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>

          <!-- Info -->
          <svg *ngIf="toast.type === 'info'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>

        <!-- Content -->
        <div class="toast-content">
          <div class="toast-title" *ngIf="toast.title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>

        <!-- Close Button -->
        <button
          type="button"
          class="toast-close-btn"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Close notification">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: env(safe-area-inset-top, 16px);
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 440px;
      z-index: 99999;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .toast-item {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--ion-background-color, #ffffff);
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.08));
      animation: toastSlideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition: all 0.2s ease;
    }

    @keyframes toastSlideDown {
      from {
        opacity: 0;
        transform: translateY(-16px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Toast Variants */
    .toast-success {
      border-left: 4px solid var(--ion-color-success, #2dd36f);
      .toast-icon-box { color: var(--ion-color-success, #2dd36f); }
    }

    .toast-warning {
      border-left: 4px solid var(--ion-color-warning, #ffc409);
      .toast-icon-box { color: var(--ion-color-warning, #e0a800); }
    }

    .toast-error {
      border-left: 4px solid var(--ion-color-danger, #eb445a);
      .toast-icon-box { color: var(--ion-color-danger, #eb445a); }
    }

    .toast-info {
      border-left: 4px solid var(--ion-color-primary, #3880ff);
      .toast-icon-box { color: var(--ion-color-primary, #3880ff); }
    }

    .toast-icon-box {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
    }

    .toast-content {
      flex: 1;
      gap: 2px;
      min-width: 0;
    }

    .toast-title {
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
    }

    .toast-message {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      line-height: 1.35;
    }

    .toast-dismiss-btn {
      background: transparent;
      border: none;
      font-size: 20px;
      line-height: 1;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 0 4px;
      transition: color var(--transition-fast, 150ms);
    }

    .toast-dismiss-btn:hover {
      color: var(--color-text);
    }

    /* Colors */
    .toast-success .toast-icon-box {
      background-color: var(--color-success-soft);
      color: var(--color-success);
    }
    .toast-success {
      border-left: 4px solid var(--color-success);
    }

    .toast-warning .toast-icon-box {
      background-color: var(--color-warning-soft);
      color: var(--color-warning);
    }
    .toast-warning {
      border-left: 4px solid var(--color-warning);
    }

    .toast-error .toast-icon-box {
      background-color: var(--color-error-soft);
      color: var(--color-error);
    }
    .toast-error {
      border-left: 4px solid var(--color-error);
    }

    .toast-info .toast-icon-box {
      background-color: var(--color-info-soft);
      color: var(--color-info);
    }
    .toast-info {
      border-left: 4px solid var(--color-info);
    }

    @media (max-width: 640px) {
      .toast-container {
        right: 16px;
        left: 16px;
        bottom: 16px;
        max-width: 100%;
        width: auto;
      }
    }
  `]
})
export class AppToastContainerComponent {
  public toastService = inject(ToastService);
}
