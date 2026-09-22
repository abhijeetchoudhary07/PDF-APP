import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-wrapper">
      <div *ngIf="stage || label || (showPercentage && !indeterminate)" class="progress-meta">
        <span *ngIf="stage || label" class="stage-text">{{ stage || label }}</span>
        <span *ngIf="showPercentage && !indeterminate" class="percent-text">{{ value }}%</span>
      </div>

      <div class="progress-track" role="progressbar" [attr.aria-valuenow]="indeterminate ? null : value" aria-valuemin="0" aria-valuemax="100">
        <div
          class="progress-fill"
          [class.indeterminate]="indeterminate"
          [style.width.%]="indeterminate ? null : value"
          [ngClass]="color ? 'fill-' + color : 'fill-primary'">
        </div>
      </div>
    </div>
  `,
  styles: [`
    .progress-wrapper {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .progress-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--font-small, 13px);
    }

    .stage-text {
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text);
    }

    .percent-text {
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-primary);
    }

    .progress-track {
      width: 100%;
      height: 8px;
      background-color: var(--color-border);
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      border-radius: var(--radius-full, 9999px);
      transition: width var(--transition-normal, 250ms);
      position: relative;
    }

    .progress-fill.indeterminate {
      width: 40% !important;
      animation: indeterminate 1.5s infinite linear;
    }

    @keyframes indeterminate {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(350%);
      }
    }

    .fill-primary {
      background-color: var(--color-primary);
    }
    .fill-success {
      background-color: var(--color-success);
    }
    .fill-warning {
      background-color: var(--color-warning);
    }
    .fill-danger {
      background-color: var(--color-error);
    }
  `]
})
export class AppProgressComponent {
  @Input() value = 0;
  @Input() stage?: string;
  @Input() label?: string;
  @Input() showPercentage = true;
  @Input() indeterminate = false;
  @Input() color: 'primary' | 'success' | 'warning' | 'danger' = 'primary';
  @Input() set variant(val: 'primary' | 'success' | 'warning' | 'danger') {
    this.color = val;
  }
  get variant(): 'primary' | 'success' | 'warning' | 'danger' {
    return this.color;
  }
}
