import { Component, Input, Output, EventEmitter, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div class="modal-backdrop" (click)="onBackdropClick($event)">
        <div class="modal-dialog" [ngClass]="size ? 'modal-' + size : 'modal-md'" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <h3 class="modal-title">{{ title }}</h3>
              @if (subtitle) {
                <p class="modal-subtitle">{{ subtitle }}</p>
              }
            </div>
            <button
              type="button"
              class="modal-close-btn"
              (click)="close()"
              aria-label="Close dialog">
              &times;
            </button>
          </div>
          <!-- Body -->
          <div class="modal-body">
            <ng-content></ng-content>
          </div>
          <!-- Footer -->
          @if (hasFooter) {
            <div class="modal-footer">
              <ng-content select="[modal-footer]"></ng-content>
            </div>
          }
        </div>
      </div>
    }
    `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      animation: fadeIn var(--transition-fast, 150ms) ease-out;
    }

    .modal-dialog {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 14px);
      box-shadow: var(--shadow-modal);
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideUp var(--transition-fast, 150ms) ease-out;
    }

    .modal-sm { max-width: 420px; }
    .modal-md { max-width: 560px; }
    .modal-lg { max-width: 780px; }
    .modal-full { max-width: 95vw; height: 90vh; }

    .modal-header {
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-divider);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3, 12px);
    }

    .modal-title-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .modal-title {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: var(--font-small, 13px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      font-size: 24px;
      line-height: 1;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 0;
      transition: color var(--transition-fast, 150ms);
    }

    .modal-close-btn:hover {
      color: var(--color-text);
    }

    .modal-body {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      flex: 1;
    }

    .modal-footer {
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-top: 1px solid var(--color-divider);
      background-color: var(--color-background-subtle);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2, 8px);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(16px) scale(0.98); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
  `]
})
export class AppModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle?: string;
  @Input() size: 'sm' | 'md' | 'lg' | 'full' = 'md';
  @Input() hasFooter = false;
  @Input() closeOnBackdrop = true;

  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (this.isOpen) {
      this.close();
    }
  }

  close() {
    this.isOpen = false;
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }
}
