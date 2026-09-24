import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

/**
 * The "we are not the government" notice.
 *
 * Google Play treats an app named and themed around official exam and job
 * forms as making a government claim unless it disclaims one, so the same
 * wording has to appear somewhere a reviewer (and a user) will actually find
 * it. Keeping it in one component means the footer, Settings and the About
 * page can never drift apart — they all render this single string.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-gov-disclaimer',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="gov-disclaimer" [class.is-compact]="compact" role="note" data-testid="gov-disclaimer">
      <div class="gd-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div class="gd-body">
        <span class="gd-title" *ngIf="!compact">{{ 'footer.govDisclaimerTitle' | translate }}</span>
        <p class="gd-text">{{ 'footer.govDisclaimer' | translate }}</p>
      </div>
    </div>
  `,
  styles: [`
    .gov-disclaimer {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-lg, 14px);
      background-color: var(--color-warning-soft);
    }

    .gov-disclaimer.is-compact {
      padding: var(--space-3, 12px);
      border-radius: var(--radius-md, 10px);
    }

    .gd-icon {
      display: flex;
      flex-shrink: 0;
      color: var(--color-warning);
    }

    .gd-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .gd-title {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      /* Body text colour rather than the amber accent: amber-on-amber does not
         clear 4.5:1, and this line has to be readable, not decorative. */
      color: var(--color-text);
    }

    .gd-text {
      margin: 0;
      font-size: var(--font-caption, 12px);
      line-height: var(--line-height-normal, 1.5);
      color: var(--color-text-secondary);
    }
  `]
})
export class AppGovDisclaimerComponent {
  /** Drops the heading, for tight places like a settings row. */
  @Input() compact = false;
}
