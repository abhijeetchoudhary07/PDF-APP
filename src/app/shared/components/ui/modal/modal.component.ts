import { Component, Input, Output, EventEmitter, HostListener, ChangeDetectionStrategy, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div #backdrop class="modal-backdrop" (click)="onBackdropClick($event)">
        <div
          class="modal-dialog"
          [ngClass]="size ? 'modal-' + size : 'modal-md'"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title">
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
              <ng-content select="[modal-footer], [slot=footer], .modal-footer-actions, .zoom-footer-actions, .share-footer-actions"></ng-content>
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
      max-height: min(90dvh, 880px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideUp var(--transition-fast, 150ms) ease-out;
    }

    .modal-sm { max-width: 420px; }
    .modal-md { max-width: 560px; }
    .modal-lg { max-width: 780px; }
    .modal-full { max-width: 95vw; height: 90vh; height: min(92dvh, 92vh); }

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
      min-width: 0;
      flex: 1;
    }

    .modal-title {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      margin: 0;
      word-break: break-word;
    }

    .modal-subtitle {
      font-size: var(--font-small, 13px);
      color: var(--color-text-secondary);
      margin: 0;
      word-break: break-word;
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
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      min-height: 32px;
      border-radius: var(--radius-sm, 6px);
      flex-shrink: 0;
    }

    .modal-close-btn:hover {
      color: var(--color-text);
      background-color: var(--color-background-subtle);
    }

    .modal-body {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      -webkit-overflow-scrolling: touch;
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

    .modal-footer ::ng-deep [modal-footer],
    .modal-footer ::ng-deep [slot=footer] {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2, 8px);
      width: 100%;
    }

    @media (max-width: 640px) {
      .modal-backdrop {
        padding: 10px;
        align-items: center;
      }

      .modal-dialog {
        width: 100%;
        max-width: 100%;
        max-height: calc(100vh - 20px);
        max-height: calc(100dvh - 20px);
        border-radius: var(--radius-lg, 14px);
        margin: 0;
      }

      .modal-sm, .modal-md, .modal-lg {
        max-width: 100%;
      }

      .modal-full {
        max-width: 100vw;
        height: 100vh;
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .modal-header {
        padding: 12px 16px;
      }

      .modal-title {
        font-size: 16px;
      }

      .modal-subtitle {
        font-size: 12px;
      }

      .modal-close-btn {
        min-width: 38px;
        min-height: 38px;
        font-size: 26px;
      }

      .modal-body {
        padding: 14px 16px;
        max-height: calc(100vh - 130px);
        max-height: calc(100dvh - 130px);
      }

      .modal-footer {
        padding: 10px 16px;
        flex-direction: column-reverse;
        align-items: stretch;
        gap: 8px;
      }

      .modal-footer ::ng-deep > * {
        width: 100%;
      }

      .modal-footer ::ng-deep [modal-footer]:not(.zoom-footer-actions),
      .modal-footer ::ng-deep [slot=footer]:not(.zoom-footer-actions) {
        flex-direction: column-reverse;
        align-items: stretch;
        gap: 8px;
        width: 100%;
      }

      .modal-footer ::ng-deep app-button,
      .modal-footer ::ng-deep .btn,
      .modal-footer ::ng-deep button {
        width: 100%;
        display: block;
      }
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
export class AppModalComponent implements OnDestroy {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle?: string;
  @Input() size: 'sm' | 'md' | 'lg' | 'full' = 'md';
  @Input() hasFooter = false;
  @Input() closeOnBackdrop = true;

  @Output() closed = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();

  private static openModalCount = 0;
  private isRegisteredOpen = false;
  private backdropEl: HTMLElement | null = null;

  @ViewChild('backdrop') set backdropRef(ref: ElementRef<HTMLElement> | undefined) {
    if (ref?.nativeElement && typeof document !== 'undefined') {
      this.backdropEl = ref.nativeElement;
      if (this.backdropEl.parentElement !== document.body) {
        document.body.appendChild(this.backdropEl);
      }
      if (!this.isRegisteredOpen) {
        AppModalComponent.openModalCount++;
        this.isRegisteredOpen = true;
        document.body.classList.add('modal-open');
      }
    } else {
      if (this.backdropEl && this.backdropEl.parentElement === document.body) {
        document.body.removeChild(this.backdropEl);
      }
      this.backdropEl = null;
      if (this.isRegisteredOpen && typeof document !== 'undefined') {
        AppModalComponent.openModalCount = Math.max(0, AppModalComponent.openModalCount - 1);
        this.isRegisteredOpen = false;
        if (AppModalComponent.openModalCount === 0 && !document.querySelector('.search-backdrop, .onboarding-backdrop')) {
          document.body.classList.remove('modal-open');
        }
      }
    }
  }

  ngOnDestroy(): void {
    if (this.backdropEl && this.backdropEl.parentElement === document.body) {
      document.body.removeChild(this.backdropEl);
      this.backdropEl = null;
    }
    if (this.isRegisteredOpen && typeof document !== 'undefined') {
      AppModalComponent.openModalCount = Math.max(0, AppModalComponent.openModalCount - 1);
      this.isRegisteredOpen = false;
      if (AppModalComponent.openModalCount === 0 && !document.querySelector('.search-backdrop, .onboarding-backdrop')) {
        document.body.classList.remove('modal-open');
      }
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (this.isOpen) {
      this.close();
    }
  }

  close() {
    this.isOpen = false;
    this.closed.emit();
    this.closeModal.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }
}
