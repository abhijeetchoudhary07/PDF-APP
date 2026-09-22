import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant =
  | 'text'
  | 'title'
  | 'block'
  | 'circle'
  | 'thumbnail'
  | 'tool-card'
  | 'list-row'
  | 'preview';

/**
 * Shimmer placeholder used while content is being fetched or generated.
 *
 * Skeletons are for *content* loading — a history list being read from storage,
 * a thumbnail being rasterised. Work with a real duration and stages (compress,
 * convert, export) uses the progress component instead, so the two never get
 * confused on screen.
 *
 * Each variant deliberately mirrors the shape of what replaces it, so the layout
 * does not jump when the real content arrives.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
  template: `
    <div class="sk-wrap" [attr.aria-busy]="true" [attr.aria-live]="'polite'">
      <ng-container [ngSwitch]="variant">

        <!-- A tool tile: icon, title, two description lines, footer link -->
        <div *ngSwitchCase="'tool-card'" class="sk-card" [style.height.px]="height || null">
          <div class="sk sk-icon"></div>
          <div class="sk sk-line w-55 mt-16"></div>
          <div class="sk sk-line w-90 mt-10 thin"></div>
          <div class="sk sk-line w-70 mt-6 thin"></div>
          <div class="sk sk-line w-35 mt-20 thin"></div>
        </div>

        <!-- A history / preset row: leading square, two lines, trailing action -->
        <div *ngSwitchCase="'list-row'" class="sk-row">
          <div class="sk sk-square"></div>
          <div class="sk-row-body">
            <div class="sk sk-line w-45"></div>
            <div class="sk sk-line w-70 mt-8 thin"></div>
          </div>
          <div class="sk sk-pill"></div>
        </div>

        <!-- A page thumbnail in the PDF workspace -->
        <div *ngSwitchCase="'thumbnail'" class="sk sk-thumb" [style.height.px]="height || 180"></div>

        <!-- A large preview surface -->
        <div *ngSwitchCase="'preview'" class="sk sk-preview" [style.height.px]="height || 320"></div>

        <div *ngSwitchCase="'circle'" class="sk sk-circle"
             [style.width.px]="size" [style.height.px]="size"></div>

        <div *ngSwitchCase="'title'" class="sk sk-line sk-title" [style.width]="width"></div>

        <div *ngSwitchCase="'block'" class="sk sk-block"
             [style.height.px]="height || 120" [style.width]="width"></div>

        <!-- default: one or more text lines -->
        <ng-container *ngSwitchDefault>
          <div *ngFor="let l of lineArray; let i = index"
               class="sk sk-line thin"
               [class.mt-8]="i > 0"
               [style.width]="i === lineArray.length - 1 && lines > 1 ? '60%' : width"></div>
        </ng-container>

      </ng-container>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .sk-wrap { display: block; }

    .sk {
      position: relative;
      overflow: hidden;
      background-color: var(--color-surface-sunken);
      border-radius: var(--radius-sm);
    }

    /*
     * The sheen is a pseudo-element translating across the block rather than an
     * animated background-position, so it stays on the compositor.
     */
    .sk::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background-image: linear-gradient(
        90deg,
        transparent 0%,
        var(--color-surface-hover) 45%,
        var(--color-surface-hover) 55%,
        transparent 100%
      );
      animation: skShimmer 1.4s ease-in-out infinite;
    }

    @keyframes skShimmer {
      100% { transform: translateX(100%); }
    }

    .sk-line { height: 14px; }
    .sk-line.thin { height: 10px; }
    .sk-title { height: 24px; border-radius: var(--radius-sm); }

    .w-35 { width: 35%; }
    .w-45 { width: 45%; }
    .w-55 { width: 55%; }
    .w-70 { width: 70%; }
    .w-90 { width: 90%; }

    .mt-6  { margin-top: 6px; }
    .mt-8  { margin-top: 8px; }
    .mt-10 { margin-top: 10px; }
    .mt-16 { margin-top: 16px; }
    .mt-20 { margin-top: 20px; }

    .sk-icon { width: 44px; height: 44px; border-radius: var(--radius-md); }
    .sk-square { width: 48px; height: 48px; border-radius: var(--radius-md); flex-shrink: 0; }
    .sk-circle { border-radius: var(--radius-full); }
    .sk-pill { width: 72px; height: 30px; border-radius: var(--radius-full); flex-shrink: 0; }
    .sk-block { width: 100%; border-radius: var(--radius-md); }
    .sk-thumb { width: 100%; border-radius: var(--radius-md); }
    .sk-preview { width: 100%; border-radius: var(--radius-lg); }

    .sk-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background-color: var(--color-surface);
      padding: var(--space-5);
    }

    .sk-row {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background-color: var(--color-surface);
      padding: var(--space-4);
    }
    .sk-row-body { flex: 1; min-width: 0; }

    /* A shimmer that never stops is noise for anyone sensitive to motion. */
    @media (prefers-reduced-motion: reduce) {
      .sk::after { animation: none; }
      .sk { opacity: 0.7; }
    }
  `]
})
export class AppSkeletonComponent {
  @Input() variant: SkeletonVariant = 'text';

  /** Number of lines for the default text variant. */
  @Input() lines = 1;

  /** CSS width for line/block variants. */
  @Input() width = '100%';

  /** Pixel height for block/thumbnail/preview variants. */
  @Input() height?: number;

  /** Diameter for the circle variant. */
  @Input() size = 40;

  get lineArray(): number[] {
    return Array.from({ length: Math.max(1, this.lines) }, (_, i) => i);
  }
}
