import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="card"
      [class.card-hover]="hover"
      [class.card-clickable]="clickable"
      [ngClass]="variant ? 'card-' + variant : ''">
      
      <div *ngIf="hasHeader" class="card-header">
        <ng-content select="[card-header]"></ng-content>
      </div>

      <div class="card-body">
        <ng-content></ng-content>
      </div>

      <div *ngIf="hasFooter" class="card-footer">
        <ng-content select="[card-footer]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 14px);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      transition: all var(--transition-normal, 250ms);
    }

    .card-hover:hover {
      box-shadow: var(--shadow-card-hover);
      border-color: var(--color-border-hover);
      transform: translateY(-2px);
    }

    .card-clickable {
      cursor: pointer;
    }

    .card-header {
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-body {
      padding: var(--space-5, 20px);
    }

    .card-footer {
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-top: 1px solid var(--color-divider);
      background-color: var(--color-background-subtle);
    }

    /* Subdued / subtle variant */
    .card-subtle {
      background-color: var(--color-background-subtle);
      border-color: transparent;
      box-shadow: none;
    }
  `]
})
export class AppCardComponent {
  @Input() hover = false;
  @Input() clickable = false;
  @Input() variant: 'default' | 'subtle' = 'default';
  @Input() hasHeader = false;
  @Input() hasFooter = false;
}
