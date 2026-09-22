import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ICON_PATHS, resolveIconName } from './icon.registry';

/**
 * Native inline-SVG icon, the replacement for the previous ion-icon usage.
 *
 * Accepts the same names the templates already used (including the `-outline`
 * suffix) so the migration is a tag swap. Unknown names render nothing rather
 * than an empty box, and every icon inherits `currentColor` and font size.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label || null"
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
    svg { display: block; }
  `]
})
export class AppIconComponent {
  @Input() set name(value: string) {
    const key = resolveIconName(value || '');
    this.paths = key
      ? this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[key])
      : null;
  }

  /** Pixel size for both axes. Defaults to something that sits well in body text. */
  @Input() size = 20;
  @Input() strokeWidth = 2;

  /** Set only when the icon carries meaning on its own; otherwise it stays aria-hidden. */
  @Input() label?: string;

  paths: SafeHtml | null = null;

  constructor(private sanitizer: DomSanitizer) {}
}
