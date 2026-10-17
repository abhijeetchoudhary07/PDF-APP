import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfSplitMode } from '../../../../core/models/pdf-organization.types';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';

export interface SplitModeOption {
  id: PdfSplitMode;
  icon: string;
  labelKey: string;
  hintKey: string;
  /** True for the five modes added in B1-B5, which plan before they write. */
  advanced: boolean;
}

/**
 * Picks one of the nine split modes.
 *
 * This was a horizontally scrolling pill strip holding four modes. Nine pills
 * is a strip whose far end nobody finds on a phone, so it is a two-column grid
 * of cards: every mode visible at once, each card above the 44px touch floor,
 * and no sideways scroll at 320px.
 *
 * Its own component rather than markup in the organizer page, so these styles
 * are budgeted separately from that page's already sizeable stylesheet.
 */
@Component({
  selector: 'app-split-mode-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AppIconComponent, TranslatePipe],
  templateUrl: './split-mode-picker.component.html',
  styleUrls: ['./split-mode-picker.component.scss']
})
export class SplitModePickerComponent {
  @Input() modes: SplitModeOption[] = [];
  @Input() activeMode: PdfSplitMode = 'every-n';
  @Input() disabled = false;
  /** Labels the group for a screen reader; the page supplies the translated text. */
  @Input() groupLabel = '';

  @Output() modeSelected = new EventEmitter<PdfSplitMode>();
}
