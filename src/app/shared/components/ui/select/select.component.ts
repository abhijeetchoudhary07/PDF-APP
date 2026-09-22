import { Component, Input, Output, EventEmitter, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SelectOption {
  value: any;
  label: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelectComponent),
      multi: true
    }
  ],
  template: `
    <div class="select-wrapper" [class.select-disabled]="disabled">
      <label *ngIf="label" class="select-label">
        {{ label }}
        <span *ngIf="required" class="required-star">*</span>
      </label>

      <div class="select-container">
        <select
          [disabled]="disabled"
          [ngModel]="value"
          (ngModelChange)="onSelectChange($event)"
          (blur)="onBlur()"
          class="native-select">
          <option *ngIf="placeholder" value="" disabled selected>{{ placeholder }}</option>
          <option *ngFor="let opt of options" [value]="opt.value">{{ opt.label }}</option>
          <ng-content></ng-content>
        </select>

        <span class="chevron-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>

      <p *ngIf="hint" class="select-hint">{{ hint }}</p>
    </div>
  `,
  styles: [`
    .select-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .select-label {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text);
    }

    .required-star {
      color: var(--color-error);
    }

    .select-container {
      position: relative;
      display: flex;
      align-items: center;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 10px);
      transition: all var(--transition-fast, 150ms);
      overflow: hidden;
    }

    .select-container:focus-within {
      border-color: var(--color-primary);
      box-shadow: var(--focus-ring);
    }

    .native-select {
      appearance: none;
      -webkit-appearance: none;
      flex: 1;
      height: 42px;
      padding: 0 var(--space-8, 32px) 0 var(--space-3, 12px);
      font-family: inherit;
      font-size: var(--font-body, 15px);
      color: var(--color-text);
      background: transparent;
      border: none;
      outline: none;
      width: 100%;
      cursor: pointer;
    }

    .chevron-icon {
      position: absolute;
      right: var(--space-3, 12px);
      pointer-events: none;
      display: flex;
      align-items: center;
      color: var(--color-text-muted);
    }

    .select-hint {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .select-disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class AppSelectComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() placeholder = '';
  @Input() options: SelectOption[] = [];
  @Input() hint?: string;
  @Input() required = false;
  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<any>();

  value: any = '';

  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(val: any): void {
    this.value = val;
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

  onSelectChange(val: any) {
    this.value = val;
    this.onChange(val);
    this.valueChange.emit(val);
  }

  onBlur() {
    this.onTouched();
  }
}
