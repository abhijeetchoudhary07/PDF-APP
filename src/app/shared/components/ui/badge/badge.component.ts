import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'photo'
  | 'signature'
  | 'pdf'
  | 'convert'
  | 'organize'
  | 'edit'
  | 'sign'
  | 'security'
  | 'batch'
  | 'presets';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="['badge-' + variant, size ? 'badge-' + size : '']">
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: var(--radius-full, 9999px);
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-semibold, 600);
      line-height: 1;
      white-space: nowrap;
      letter-spacing: 0.02em;
    }

    .badge-sm {
      padding: 2px 6px;
      font-size: 10px;
    }

    .badge-md {
      padding: 4px 10px;
      font-size: 12px;
    }

    .badge-lg {
      padding: 6px 14px;
      font-size: 14px;
    }

    /* Neutral */
    .badge-neutral {
      background-color: var(--color-background-subtle);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
    }

    /* Statuses */
    .badge-primary {
      background-color: var(--color-primary-soft);
      color: var(--color-primary);
    }
    .badge-secondary {
      background-color: var(--color-secondary-soft);
      color: var(--color-secondary);
    }
    .badge-success {
      background-color: var(--color-success-soft);
      color: var(--color-success);
    }
    .badge-warning {
      background-color: var(--color-warning-soft);
      color: var(--color-warning);
    }
    .badge-danger {
      background-color: var(--color-error-soft);
      color: var(--color-error);
    }

    /* Categories */
    .badge-photo {
      background-color: var(--color-photo-soft);
      color: var(--color-photo);
    }
    .badge-signature {
      background-color: var(--color-signature-soft);
      color: var(--color-signature);
    }
    .badge-pdf {
      background-color: var(--color-pdf-soft);
      color: var(--color-pdf);
    }
    .badge-convert {
      background-color: var(--color-convert-soft);
      color: var(--color-convert);
    }
    .badge-organize {
      background-color: var(--color-organize-soft);
      color: var(--color-organize);
    }
    .badge-edit {
      background-color: var(--color-edit-soft);
      color: var(--color-edit);
    }
    .badge-sign {
      background-color: var(--color-sign-soft);
      color: var(--color-sign);
    }
    .badge-security {
      background-color: var(--color-security-soft);
      color: var(--color-security);
    }
    .badge-batch {
      background-color: var(--color-batch-soft);
      color: var(--color-batch);
    }
    .badge-presets {
      background-color: var(--color-presets-soft);
      color: var(--color-presets);
    }
  `]
})
export class AppBadgeComponent {
  @Input() variant: BadgeVariant = 'primary';
  @Input() size?: 'sm' | 'md' | 'lg';
}
