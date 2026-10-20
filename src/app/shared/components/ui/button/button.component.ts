import {
  AfterContentChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  Renderer2,
  ViewChild,
  inject
} from '@angular/core';
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
      #btnEl
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
      [attr.aria-busy]="loading"
      [attr.title]="title || null"
      [attr.aria-label]="ariaLabel || title || null">
    
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
      <span class="btn-text" #btnText>
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

    /* Fluid Responsive Sizes */
    .btn-sm {
      min-height: var(--control-h-sm, 32px);
      padding: 0 var(--control-pad-x-sm, 12px);
      font-size: var(--font-small, 13px);
    }
    .btn-md {
      min-height: var(--control-h-md, 42px);
      padding: 0 var(--control-pad-x-md, 16px);
      font-size: var(--font-body, 15px);
    }
    .btn-lg {
      min-height: var(--control-h-lg, 48px);
      padding: 0 var(--control-pad-x-lg, 24px);
      font-size: var(--font-body, 15px);
      font-weight: var(--font-weight-semibold, 600);
    }
    .btn-block {
      width: 100%;
      white-space: normal;
      text-align: center;
      line-height: 1.25;
      padding-top: 8px;
      padding-bottom: 8px;
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

    /*
     * An icon in a button is the size of that button's text.
     *
     * app-icon renders a 20px SVG by default, which next to 13px (sm) or 15px
     * (md) label text read as an icon with a caption rather than a label with
     * an icon. 1em ties the glyph to whatever font-size the button has at this
     * breakpoint, so the pair grows and shrinks together on the fluid control
     * scale instead of drifting apart.
     *
     * ::ng-deep because the icon is projected in from the calling template
     * and carries that component's encapsulation attribute rather than this
     * one's, so a plainly scoped selector would never match it. The modal
     * component reaches its projected footer the same way. The width/height
     * here win over the SVG's own presentation attributes.
     *
     * .btn-icon-only is set from TypeScript when nothing but icons was
     * projected: 19 buttons in the app are a bare icon with no label, and
     * shrinking those to 13px would leave a glyph far too small to aim at.
     * Those keep app-icon's own size.
     */
    .btn:not(.btn-icon-only) .btn-text ::ng-deep app-icon > svg,
    .btn:not(.btn-icon-only) .btn-icon ::ng-deep app-icon > svg,
    .btn:not(.btn-icon-only) .btn-text ::ng-deep > svg,
    .btn:not(.btn-icon-only) .btn-icon ::ng-deep > svg {
      width: 1em;
      height: 1em;
    }

    /*
     * Keeps the glyph optically centred against the text baseline: the SVG box
     * is the full font-size while the letters only fill the cap height.
     */
    .btn-text ::ng-deep app-icon {
      flex-shrink: 0;
    }
  `]
})
export class AppButtonComponent implements AfterContentChecked {
  private renderer = inject(Renderer2);

  @ViewChild('btnEl', { static: true }) private btnEl!: ElementRef<HTMLButtonElement>;
  @ViewChild('btnText', { static: true }) private btnText!: ElementRef<HTMLElement>;

  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() block = false;
  @Input() icon = false;
  @Input() iconPosition: 'start' | 'end' = 'start';

  /*
   * Fourteen call sites put a plain `title` attribute on <app-button> and got
   * a tooltip, which is why nobody noticed there was no input behind it: with
   * no matching @Input, Angular leaves the attribute on the host <app-button>
   * element. It hovers, but the accessible name of the control is whatever is
   * projected into it -- for an icon-only button, nothing. Taking the value as
   * an input and putting it on the inner <button> fixes both, and gives the
   * tooltip somewhere to arrive from the translate pipe.
   *
   * `ariaLabel` is separate for the cases where the spoken name should differ
   * from the hover text; it falls back to `title`.
   */
  @Input() title?: string;
  @Input() ariaLabel?: string;

  @HostBinding('class.block') get isBlock() {
    return this.block;
  }

  @Output() clicked = new EventEmitter<MouseEvent>();

  private wasIconOnly: boolean | null = null;

  /**
   * Flags a button whose projected content is icons and nothing else.
   *
   * The 1em icon rule in the styles above is right for a labelled button and
   * wrong for a bare icon, and whether a label was projected is only knowable
   * from the rendered content — `@ContentChildren` sees directives, not the
   * text node a caller writes between the tags. So it is read off the DOM
   * here, after content has been checked, which also catches a label that
   * appears later because its `@if` turned true or its translation resolved.
   *
   * Applied through Renderer2 rather than a template binding on purpose: a
   * binding written during `ngAfterContentChecked` is exactly what trips
   * dev-mode's ExpressionChangedAfterItHasBeenCheckedError.
   */
  ngAfterContentChecked(): void {
    const textWrap = this.btnText?.nativeElement;
    const host = this.btnEl?.nativeElement;
    if (!textWrap || !host) return;

    const iconOnly = (textWrap.textContent ?? '').trim().length === 0;
    if (iconOnly === this.wasIconOnly) return;
    this.wasIconOnly = iconOnly;

    if (iconOnly) {
      this.renderer.addClass(host, 'btn-icon-only');
    } else {
      this.renderer.removeClass(host, 'btn-icon-only');
    }
  }

  onClick(event: MouseEvent) {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
