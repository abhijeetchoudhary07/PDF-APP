import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfPageItem } from '../../../../core/models/pdf-organization.types';
import { PageFlipAxis, PageFlipPreview } from '../../../../core/models/page-flip.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppModalComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

export interface FlipAxisOption {
  id: PageFlipAxis;
  icon: string;
  labelKey: string;
  descKey: string;
}

/**
 * The organizer's mirror / flip sheet (A6).
 *
 * Presentational: the page owns the flip state, the preview rendering and the
 * undoable operation; this renders the choices and emits what was tapped. A
 * separate component rather than more markup in the organizer because the
 * organizer's own stylesheet was already within a few kilobytes of the
 * `anyComponentStyle` build budget.
 */
@Component({
  selector: 'app-page-flip-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AppIconComponent, AppButtonComponent, AppModalComponent, TranslatePipe],
  templateUrl: './page-flip-sheet.component.html',
  styleUrls: ['./page-flip-sheet.component.scss']
})
export class PageFlipSheetComponent {
  @Input() isOpen = false;
  @Input() axisOptions: FlipAxisOption[] = [];
  @Input() axis: PageFlipAxis = 'horizontal';
  @Input() scope: 'selected' | 'all' = 'selected';
  @Input() selectedCount = 0;
  @Input() totalCount = 0;

  /** How many pages the current axis and scope would act on. */
  @Input() targetCount = 0;

  /** How many pages in the whole workspace already carry a flip. */
  @Input() flippedCount = 0;

  @Input() previewPage?: PdfPageItem;
  @Input() preview?: PageFlipPreview;
  @Input() previewLoading = false;

  @Output() axisChange = new EventEmitter<PageFlipAxis>();
  @Output() scopeChange = new EventEmitter<'selected' | 'all'>();
  @Output() apply = new EventEmitter<void>();
  @Output() clearFlips = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  /**
   * The CSS mirror for the thumbnail stand-in, used only when no rasterised
   * preview could be produced. Mirrors the state the preview was computed
   * for, which is the axis composed onto whatever flip the page already has.
   */
  get fallbackPreviewTransform(): string {
    const state = this.preview?.state;
    const parts: string[] = [];
    if (state?.horizontal) parts.push('scaleX(-1)');
    if (state?.vertical) parts.push('scaleY(-1)');
    return parts.join(' ');
  }
}
