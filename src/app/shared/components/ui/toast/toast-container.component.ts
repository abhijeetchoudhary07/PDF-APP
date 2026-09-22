import { Component, ChangeDetectionStrategy } from '@angular/core';
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

        <!-- Text Content -->
        <div class="toast-content">
          <span *ngIf="toast.title" class="toast-title">{{ toast.title }}</span>
          <span class="toast-message">{{ toast.message }}</span>
        </div>

        <!-- Dismiss Button -->
        <button
          type="button"
          class="toast-dismiss-btn"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Dismiss notification">
          &times;
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: var(--space-6, 24px);
      right: var(--space-6, 24px);
      z-index: 5000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 380px;
      width: calc(100% - 32px);
      pointer-events: none;
    }

    .toast-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-lg, 12px);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-lg);
      pointer-events: auto;
      animation: toastSlideIn var(--transition-fast, 150ms) ease-out;
    }

    .toast-icon-box {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .toast-content {
      flex: 1;
      display: flex;
      flex-direction: column;
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
  constructor(public toastService: ToastService) {}
}
