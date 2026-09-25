import { Component, Input, Output, EventEmitter, HostBinding, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      class="btn"
      [ngClass]="[
        'btn-' + variant,
        'btn-' + size,
        block ? 'btn-block' : '',
        loading ? 'btn-loading' : ''
      ]"
      [disabled]="disabled || loading"
      (click)="onClick($event)"
      [attr.aria-disabled]="disabled || loading"
      [attr.aria-busy]="loading">
    
      <!-- Loading Spinner -->
      @if (loading) {
        <span class="spinner" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-linecap="round"></path>
          </svg>
        </span>
      }
    
      <!-- Icon Prefix -->
      @if (icon && iconPosition === 'start' && !loading) {
        <span class="btn-icon icon-start">
          <ng-content select="[icon-start]"></ng-content>
        </span>
      }
    
      <!-- Button Content -->
      <span class="btn-text">
        <ng-content></ng-content>
      </span>
    
      <!-- Icon Suffix -->
      @if (icon && iconPosition === 'end' && !loading) {
        <span class="btn-icon icon-end">
          <ng-content select="[icon-end]"></ng-content>
        </span>
      }
    </button>
    `,
  styles: [`
    :host {
      display: inline-block;
    }
    :host(.block) {
      display: block;
      width: 100%;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      font-family: inherit;
      font-weight: var(--font-weight-medium, 500);
      line-height: 1;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 10px);
      cursor: pointer;
      user-select: none;
      transition: all var(--transition-fast, 150ms);
      text-decoration: none;
      white-space: nowrap;
      vertical-align: middle;
      position: relative;
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      pointer-events: none;
    }

    /*
     * Press feedback for every variant. Only .btn-primary had it, so ghost and
     * outline buttons felt inert under a finger; the variant rules that set
     * their own transform still win on specificity.
     */
    .btn:active:not(:disabled) {
      transform: translateY(1px) scale(0.985);
    }

    /* Sizes */
    .btn-sm {
      height: 32px;
      padding: 0 var(--space-3, 12px);
      font-size: var(--font-small, 13px);
    }
    .btn-md {
      height: 42px;
      padding: 0 var(--space-4, 16px);
      font-size: var(--font-body, 15px);
    }
    .btn-lg {
      height: 48px;
      padding: 0 var(--space-6, 24px);
      font-size: var(--font-body, 15px);
      font-weight: var(--font-weight-semibold, 600);
    }
    .btn-block {
      width: 100%;
    }

    /* Variants */
    .btn-primary {
      background-color: var(--color-primary);
      color: var(--color-primary-contrast);
      border-color: var(--color-primary);
    }
    .btn-primary:hover:not(:disabled) {
      background-color: var(--color-primary-hover);
      border-color: var(--color-primary-hover);
      box-shadow: var(--shadow-sm);
    }
    .btn-primary:active:not(:disabled) {
      background-color: var(--color-primary-active);
      transform: translateY(1px);
    }

    .btn-secondary {
      background-color: var(--color-secondary);
      color: var(--color-secondary-contrast);
      border-color: var(--color-secondary);
    }
    .btn-secondary:hover:not(:disabled) {
      background-color: var(--color-secondary-hover);
      border-color: var(--color-secondary-hover);
    }

    .btn-outline {
      background-color: transparent;
      color: var(--color-text);
      border-color: var(--color-border);
    }
    .btn-outline:hover:not(:disabled) {
      background-color: var(--color-surface-hover);
      border-color: var(--color-border-hover);
      color: var(--color-primary);
    }

    .btn-ghost {
      background-color: transparent;
      color: var(--color-text-secondary);
      border-color: transparent;
    }
    .btn-ghost:hover:not(:disabled) {
      background-color: var(--color-background-subtle);
      color: var(--color-text);
    }

    .btn-danger {
      background-color: var(--color-error);
      color: var(--color-error-contrast);
      border-color: var(--color-error);
    }
    .btn-danger:hover:not(:disabled) {
      background-color: var(--color-error-hover);
      border-color: var(--color-error-hover);
    }

    .btn-success {
      background-color: var(--color-success);
      color: var(--color-success-contrast);
      border-color: var(--color-success);
    }
    .btn-success:hover:not(:disabled) {
      background-color: var(--color-success-hover);
      border-color: var(--color-success-hover);
    }

    .btn-warning {
      background-color: var(--color-warning);
      color: var(--color-warning-contrast);
      border-color: var(--color-warning);
    }
    .btn-warning:hover:not(:disabled) {
      background-color: var(--color-warning-hover);
      border-color: var(--color-warning-hover);
    }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      animation: spin 750ms linear infinite;
    }
    .spinner svg {
      width: 100%;
      height: 100%;
    }
    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }

    .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class AppButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() block = false;
  @Input() icon = false;
  @Input() iconPosition: 'start' | 'end' = 'start';

  @HostBinding('class.block') get isBlock() {
    return this.block;
  }

  @Output() clicked = new EventEmitter<MouseEvent>();

  onClick(event: MouseEvent) {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
