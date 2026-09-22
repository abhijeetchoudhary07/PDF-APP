import { Component, Input, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppInputComponent),
      multi: true
    }
  ],
  template: `
    <div class="input-wrapper" [class.input-disabled]="disabled" [class.has-error]="error">
      <label *ngIf="label" class="input-label">
        {{ label }}
        <span *ngIf="required" class="required-star">*</span>
      </label>

      <div class="input-container">
        <span *ngIf="hasPrefix" class="input-affix prefix">
          <ng-content select="[prefix]"></ng-content>
        </span>

        <input
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [value]="value"
          (input)="onInput($event)"
          (blur)="onBlur()"
          class="native-input"
          [attr.min]="min"
          [attr.max]="max"
          [attr.step]="step" />

        <span *ngIf="hasSuffix" class="input-affix suffix">
          <ng-content select="[suffix]"></ng-content>
        </span>
      </div>

      <p *ngIf="hint && !error" class="input-hint">{{ hint }}</p>
      <p *ngIf="error" class="input-error">{{ error }}</p>
    </div>
  `,
  styles: [`
    .input-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .input-label {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text);
    }

    .required-star {
      color: var(--color-error);
    }

    .input-container {
      display: flex;
      align-items: center;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 10px);
      transition: all var(--transition-fast, 150ms);
      overflow: hidden;
    }

    .input-container:focus-within {
      border-color: var(--color-primary);
      box-shadow: var(--focus-ring);
    }

    .has-error .input-container {
      border-color: var(--color-error);
    }
    .has-error .input-container:focus-within {
      box-shadow: 0 0 0 3px var(--color-error-soft);
    }

    .native-input {
      flex: 1;
      height: 42px;
      padding: 0 var(--space-3, 12px);
      font-family: inherit;
      font-size: var(--font-body, 15px);
      color: var(--color-text);
      background: transparent;
      border: none;
      outline: none;
      width: 100%;
    }

    .native-input::placeholder {
      color: var(--color-text-muted);
    }

    .input-affix {
      display: flex;
      align-items: center;
      padding: 0 var(--space-3, 12px);
      color: var(--color-text-muted);
    }

    .input-hint {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .input-error {
      font-size: var(--font-caption, 12px);
      color: var(--color-error);
      margin: 0;
    }

    .input-disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class AppInputComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() placeholder = '';
  @Input() type = 'text';
  @Input() hint?: string;
  @Input() error?: string;
  @Input() required = false;
  @Input() disabled = false;
  @Input() min?: number | string;
  @Input() max?: number | string;
  @Input() step?: number | string;
  @Input() hasPrefix = false;
  @Input() hasSuffix = false;

  value: any = '';

  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(val: any): void {
    this.value = val !== undefined && val !== null ? val : '';
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

  onInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.value = val;
    this.onChange(val);
  }

  onBlur() {
    this.onTouched();
  }
}
