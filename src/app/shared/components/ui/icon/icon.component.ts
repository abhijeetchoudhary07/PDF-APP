import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ICON_PATHS, resolveIconName } from './icon.registry';

/**
 * Native inline-SVG icon, the replacement for the previous ion-icon usage.
 *
 * Accepts the same names the templates already used (including the `-outline`
 * suffix) so the migration is a tag swap. Unknown names render nothing rather
 * than an empty box, and every icon inherits `currentColor` and font size.
 */
export type IconSize = number | 'sm' | 'md' | 'lg' | 'inherit' | string;

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
  template: `
    <svg
      [attr.width]="numericSize"
      [attr.height]="numericSize"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label || null"
      [class.icon-sm]="sizeToken === 'sm'"
      [class.icon-md]="sizeToken === 'md'"
      [class.icon-lg]="sizeToken === 'lg'"
      [class.icon-inherit]="sizeToken === 'inherit'"
      [innerHTML]="paths"></svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
      color: inherit;
    }
    svg {
      display: block;
    }
    svg.icon-sm {
      width: var(--icon-sm, 16px);
      height: var(--icon-sm, 16px);
    }
    svg.icon-md {
      width: var(--icon-md, 20px);
      height: var(--icon-md, 20px);
    }
    svg.icon-lg {
      width: var(--icon-lg, 24px);
      height: var(--icon-lg, 24px);
    }
    svg.icon-inherit {
      width: 1em;
      height: 1em;
    }
  `]
})
export class AppIconComponent {
  private sanitizer = inject(DomSanitizer);

  @Input() set name(value: string) {
    const key = resolveIconName(value || '');
    this.paths = key
      ? this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[key])
      : null;
  }

  /**
   * Numeric size in pixels (default 20), or responsive token ('sm' | 'md' | 'lg' | 'inherit').
   * When a non-numeric token is supplied, SVG width/height attributes are omitted and the
   * icon is sized via CSS tokens / 1em to support responsive fluid scaling and 200% font zoom.
   */
  @Input() size: IconSize = 20;
  @Input() strokeWidth = 2;

  /** Set only when the icon carries meaning on its own; otherwise it stays aria-hidden. */
  @Input() label?: string;

  paths: SafeHtml | null = null;

  get isNumericSize(): boolean {
    if (typeof this.size === 'number') {
      return true;
    }
    if (typeof this.size === 'string') {
      const trimmed = this.size.trim();
      if (['sm', 'md', 'lg', 'inherit'].includes(trimmed)) {
        return false;
      }
      return !isNaN(Number(trimmed)) && trimmed !== '';
    }
    return false;
  }

  get numericSize(): number | null {
    if (this.isNumericSize) {
      return Number(this.size);
    }
    return null;
  }

  get sizeToken(): 'sm' | 'md' | 'lg' | 'inherit' | null {
    if (!this.isNumericSize && typeof this.size === 'string') {
      const trimmed = this.size.trim();
      if (['sm', 'md', 'lg', 'inherit'].includes(trimmed)) {
        return trimmed as 'sm' | 'md' | 'lg' | 'inherit';
      }
    }
    return null;
  }
}
