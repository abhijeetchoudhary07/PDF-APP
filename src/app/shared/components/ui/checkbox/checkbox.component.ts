import { Component, Input, Output, EventEmitter, forwardRef, ChangeDetectionStrategy } from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-checkbox',
  standalone: true,
  imports: [],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppCheckboxComponent),
      multi: true
    }
  ],
  template: `
    <label class="checkbox-wrapper" [class.checkbox-disabled]="disabled">
      <input
        type="checkbox"
        class="native-checkbox"
        [checked]="checked"
        [disabled]="disabled"
        (change)="onCheckboxChange($event)" />
    
      <span class="custom-box" [class.checked]="checked" aria-hidden="true">
        @if (checked) {
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        }
      </span>
    
      @if (label) {
        <span class="checkbox-label">{{ label }}</span>
      }
      <ng-content></ng-content>
    </label>
    `,
  styles: [`
    .checkbox-wrapper {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      cursor: pointer;
      user-select: none;
      font-size: var(--font-body, 15px);
      color: var(--color-text);
    }

    .native-checkbox {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .custom-box {
      width: 18px;
      height: 18px;
      border: 1.5px solid var(--color-border-hover);
      border-radius: var(--radius-xs, 4px);
      background-color: var(--color-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast, 150ms);
      flex-shrink: 0;
    }

    .native-checkbox:focus-visible + .custom-box {
      box-shadow: var(--focus-ring);
      border-color: var(--color-primary);
    }

    .custom-box.checked {
      background-color: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .checkbox-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class AppCheckboxComponent implements ControlValueAccessor {
  @Input() label?: string;
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

  onCheckboxChange(event: Event) {
    if (this.disabled) return;
    this.checked = (event.target as HTMLInputElement).checked;
    this.onChange(this.checked);
    this.onTouched();
    this.checkedChange.emit(this.checked);
  }
}
