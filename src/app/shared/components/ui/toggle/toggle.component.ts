import { Component, Input, Output, EventEmitter, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-toggle',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppToggleComponent),
      multi: true
    }
  ],
  template: `
    <div class="toggle-wrapper" [class.toggle-disabled]="disabled" (click)="toggle()">
      <div
        class="toggle-track"
        [class.checked]="checked"
        role="switch"
        [attr.aria-checked]="checked"
        [attr.aria-disabled]="disabled"
        tabindex="0"
        (keydown.space)="$event.preventDefault(); toggle()"
        (keydown.enter)="$event.preventDefault(); toggle()">
        <div class="toggle-thumb"></div>
      </div>

      <div *ngIf="label" class="toggle-label-group">
        <span class="toggle-label">{{ label }}</span>
        <span *ngIf="description" class="toggle-desc">{{ description }}</span>
      </div>
    </div>
  `,
  styles: [`
    .toggle-wrapper {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3, 12px);
      cursor: pointer;
      user-select: none;
    }

    .toggle-track {
      width: 44px;
      height: 24px;
      background-color: var(--color-border);
      border-radius: var(--radius-full, 9999px);
      padding: 2px;
      transition: background-color var(--transition-fast, 150ms);
      position: relative;
      flex-shrink: 0;
    }

    .toggle-track:focus-visible {
      box-shadow: var(--focus-ring);
      outline: none;
    }

    .toggle-track.checked {
      background-color: var(--color-primary);
    }

    .toggle-thumb {
      width: 20px;
      height: 20px;
      background-color: #ffffff;
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-sm);
      transition: transform var(--transition-fast, 150ms);
    }

    .toggle-track.checked .toggle-thumb {
      transform: translateX(20px);
    }

    .toggle-label-group {
      display: flex;
      flex-direction: column;
    }

    .toggle-label {
      font-size: var(--font-body, 15px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text);
    }

    .toggle-desc {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
    }

    .toggle-disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }
  `]
})
export class AppToggleComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() description?: string;
  @Input() disabled = false;

  @Output() checkedChange = new EventEmitter<boolean>();

  checked = false;

  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(val: boolean): void {
    this.checked = !!val;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.onChange(this.checked);
    this.onTouched();
    this.checkedChange.emit(this.checked);
  }
}
