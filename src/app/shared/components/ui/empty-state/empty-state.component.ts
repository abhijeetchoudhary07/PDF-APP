import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../button/button.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <div class="empty-state-container">
      <div class="empty-icon-circle">
        <ng-content select="[icon]"></ng-content>
        <svg *ngIf="defaultIcon" viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
      </div>

      <h3 class="empty-title">{{ title }}</h3>
      <p *ngIf="description" class="empty-desc">{{ description }}</p>

      <div *ngIf="actionLabel" class="empty-action">
        <app-button variant="primary" size="md" (clicked)="actionClicked.emit()">
          {{ actionLabel }}
        </app-button>
      </div>

      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .empty-state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-10, 40px) var(--space-4, 16px);
      max-width: 440px;
      margin: 0 auto;
    }

    .empty-icon-circle {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-background-subtle);
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-4, 16px);
      border: 1px solid var(--color-border);
    }

    .empty-title {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      margin: 0 0 var(--space-2, 8px);
    }

    .empty-desc {
      font-size: var(--font-body, 15px);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-5, 20px);
      line-height: var(--line-height-normal, 1.5);
    }

    .empty-action {
      margin-top: var(--space-2, 8px);
    }
  `]
})
export class AppEmptyStateComponent {
  @Input() title = 'No items found';
  @Input() description?: string;
  @Input() actionLabel?: string;
  @Input() defaultIcon = true;

  @Output() actionClicked = new EventEmitter<void>();
}
