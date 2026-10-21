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
      @for (toast of toastService.toasts$ | async; track toast) {
        <div
          class="toast-item"
          [ngClass]="'toast-' + toast.type"
          role="alert">
          <!-- Status Icon -->
          <div class="toast-icon-box">
            <!-- Success -->
            @if (toast.type === 'success') {
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            }
            <!-- Warning -->
            @if (toast.type === 'warning') {
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            }
            <!-- Error -->
            @if (toast.type === 'error') {
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            }
            <!-- Info -->
            @if (toast.type === 'info') {
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            }
          </div>
          <!-- Content -->
          <div class="toast-content">
            @if (toast.title) {
              <div class="toast-title">{{ toast.title }}</div>
            }
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
      }
    </div>
    `,
  styles: [`
    .toast-container {
      position: fixed;
      top: max(16px, env(safe-area-inset-top, 16px));
      left: 50%;
      transform: translateX(-50%);
      width: min(calc(100% - 32px), 440px);
      max-width: 440px;
      z-index: 100000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    }

    .toast-item {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--color-surface, #ffffff);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--color-border, #e2e8f0);
      animation: toastSlideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      transition: all 0.2s ease;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
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
      border-left: 4px solid var(--color-success, #10b981);
      .toast-icon-box {
        background-color: var(--color-success-soft, rgba(16, 185, 129, 0.12));
        color: var(--color-success, #10b981);
      }
    }

    .toast-warning {
      border-left: 4px solid var(--color-warning, #f59e0b);
      .toast-icon-box {
        background-color: var(--color-warning-soft, rgba(245, 158, 11, 0.12));
        color: var(--color-warning, #f59e0b);
      }
    }

    .toast-error {
      border-left: 4px solid var(--color-error, #ef4444);
      .toast-icon-box {
        background-color: var(--color-error-soft, rgba(239, 68, 68, 0.12));
        color: var(--color-error, #ef4444);
      }
    }

    .toast-info {
      border-left: 4px solid var(--color-info, #3b82f6);
      .toast-icon-box {
        background-color: var(--color-info-soft, rgba(59, 130, 246, 0.12));
        color: var(--color-info, #3b82f6);
      }
    }

    .toast-icon-box {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast-content {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .toast-title {
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text, #0f172a);
      line-height: 1.3;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .toast-message {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary, #475569);
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .toast-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      /*
       * A real 44px box rather than a pseudo-element overlay: the toast card
       * clips, so an overlay grown past the card's top edge simply stopped
       * receiving taps there. The card is taller than 44px whenever it has a
       * title and a message, so this costs no height.
       */
      width: var(--min-touch-target, 44px);
      height: var(--min-touch-target, 44px);
      margin: -2px -2px 0 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm, 6px);
      color: var(--color-text-muted, #94a3b8);
      cursor: pointer;
      padding: 0;
      transition: color var(--transition-fast, 150ms), background-color var(--transition-fast, 150ms);
    }

    .toast-close-btn:hover {
      color: var(--color-text, #0f172a);
      background-color: var(--color-background-subtle, rgba(0, 0, 0, 0.05));
    }

    @media (max-width: 640px) {
      .toast-container {
        top: max(12px, env(safe-area-inset-top, 12px));
        bottom: auto;
        left: 12px;
        right: 12px;
        width: auto;
        max-width: none;
        transform: none;
        gap: 8px;
      }

      .toast-item {
        padding: 10px 12px;
        border-radius: 12px;
        gap: 10px;
      }

      .toast-icon-box {
        width: 28px;
        height: 28px;
      }
    }
  `]
})
export class AppToastContainerComponent {
  public toastService = inject(ToastService);
}
