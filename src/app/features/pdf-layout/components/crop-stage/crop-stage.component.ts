import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CropRegion } from '../../../../core/models/pdf-layout.types';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';

type DragKind = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

interface DragState {
  kind: DragKind;
  pointerId: number;
  /** Where the pointer went down, as a fraction of the stage. */
  startX: number;
  startY: number;
  /** The region as it was when the drag started. */
  origin: CropRegion;
}

/**
 * The crop region, dragged on a rendered page (D2).
 *
 * The region is held in *fractions of the page, origin top-left* — the same
 * space the engine maps to a CropBox — so what is dragged here and what gets
 * written cannot drift apart. Nothing in this component knows about points,
 * rotation or MediaBox origins; that is the engine's job.
 *
 * Built for a thumb. Pointer events rather than mouse events, so one code path
 * serves touch, pen and mouse; `setPointerCapture` so a finger that slides off
 * the image keeps dragging instead of dropping the handle; and corner hit areas
 * padded out to the 44px touch floor while the visible handle stays small
 * enough not to cover the page underneath it.
 */
@Component({
  selector: 'app-crop-stage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AppIconComponent, TranslatePipe],
  templateUrl: './crop-stage.component.html',
  styleUrls: ['./crop-stage.component.scss']
})
export class CropStageComponent {
  @Input() imageUrl?: string;
  @Input({ required: true }) region!: CropRegion;
  @Input() pageNumber = 1;
  @Input() loading = false;
  @Input() disabled = false;
  /** Shown instead of the stage when there is nothing to render. */
  @Input() unavailableKey = 'layout.previewUnavailable';

  @Output() regionChange = new EventEmitter<CropRegion>();

  @ViewChild('stage') stage?: ElementRef<HTMLDivElement>;

  /** Smallest crop the handles will allow, as a fraction. */
  private readonly MIN_SIZE = 0.05;

  private drag: DragState | null = null;

  readonly corners: Array<{ kind: DragKind; labelKey: string }> = [
    { kind: 'nw', labelKey: 'layout.cropHandleTopLeft' },
    { kind: 'ne', labelKey: 'layout.cropHandleTopRight' },
    { kind: 'sw', labelKey: 'layout.cropHandleBottomLeft' },
    { kind: 'se', labelKey: 'layout.cropHandleBottomRight' }
  ];

  readonly edges: Array<{ kind: DragKind; labelKey: string }> = [
    { kind: 'n', labelKey: 'layout.cropHandleTop' },
    { kind: 's', labelKey: 'layout.cropHandleBottom' },
    { kind: 'w', labelKey: 'layout.cropHandleLeft' },
    { kind: 'e', labelKey: 'layout.cropHandleRight' }
  ];

  /** Percentages for the overlay's inline styles. */
  get boxStyle(): Record<string, string> {
    return {
      left: `${this.region.x * 100}%`,
      top: `${this.region.y * 100}%`,
      width: `${this.region.width * 100}%`,
      height: `${this.region.height * 100}%`
    };
  }

  /** How much of the page the current region keeps, for the readout. */
  get keptPercent(): number {
    return Math.round(this.region.width * this.region.height * 100);
  }

  onPointerDown(event: PointerEvent, kind: DragKind): void {
    if (this.disabled || !this.stage) return;

    const rect = this.stage.nativeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();

    this.drag = {
      kind,
      pointerId: event.pointerId,
      startX: (event.clientX - rect.left) / rect.width,
      startY: (event.clientY - rect.top) / rect.height,
      origin: { ...this.region }
    };

    /*
     * Capture on the element that went down, so a drag that leaves the image —
     * which a corner handle almost always does — keeps receiving moves instead
     * of silently stopping.
     */
    try {
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // A browser that refuses capture still works, it just loses the drag
      // if the finger leaves the element.
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId || !this.stage) return;

    const rect = this.stage.nativeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const dx = x - this.drag.startX;
    const dy = y - this.drag.startY;

    const next = this.applyDrag(this.drag.kind, this.drag.origin, dx, dy);
    this.regionChange.emit(next);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // Nothing to release.
    }
    this.drag = null;
  }

  /**
   * The region after a drag of (dx, dy) on one handle.
   *
   * `move` slides the whole box and is clamped at the page edges so it cannot
   * be pushed out of view. Every other handle moves one or two edges and is
   * clamped against the opposite edge with `MIN_SIZE` between them, so a box
   * can never be dragged inside-out — which would otherwise reach the engine
   * as a negative width.
   */
  private applyDrag(kind: DragKind, origin: CropRegion, dx: number, dy: number): CropRegion {
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

    if (kind === 'move') {
      return {
        x: Math.min(Math.max(0, origin.x + dx), 1 - origin.width),
        y: Math.min(Math.max(0, origin.y + dy), 1 - origin.height),
        width: origin.width,
        height: origin.height
      };
    }

    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.width;
    let bottom = origin.y + origin.height;

    if (kind === 'nw' || kind === 'sw' || kind === 'w') {
      left = Math.min(clamp01(origin.x + dx), right - this.MIN_SIZE);
    }
    if (kind === 'ne' || kind === 'se' || kind === 'e') {
      right = Math.max(clamp01(right + dx), left + this.MIN_SIZE);
    }
    if (kind === 'nw' || kind === 'ne' || kind === 'n') {
      top = Math.min(clamp01(origin.y + dy), bottom - this.MIN_SIZE);
    }
    if (kind === 'sw' || kind === 'se' || kind === 's') {
      bottom = Math.max(clamp01(bottom + dy), top + this.MIN_SIZE);
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
  }
}
