import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PageSizeGroup,
  SelectionHelperKind,
  SelectionHelperMatch
} from '../../../../core/models/page-selection.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppModalComponent,
  AppProgressComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

export interface SelectionHelperOption {
  id: SelectionHelperKind;
  icon: string;
  labelKey: string;
  descKey: string;
  needsScan: boolean;
}

/**
 * The organizer's smart page-selection sheet (A7).
 *
 * Presentational: the page owns the selection, the scans the blank and
 * duplicate helpers depend on, and the match counts; this renders them and
 * emits what was tapped. Each helper shows its match count before it is
 * applied, and a helper whose scan has not run says so rather than showing a
 * zero that would read as "nothing matched".
 */
@Component({
  selector: 'app-smart-select-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    AppIconComponent,
    AppButtonComponent,
    AppModalComponent,
    AppProgressComponent,
    TranslatePipe
  ],
  templateUrl: './smart-select-sheet.component.html',
  styleUrls: ['./smart-select-sheet.component.scss']
})
export class SmartSelectSheetComponent {
  @Input() isOpen = false;
  @Input() helpers: SelectionHelperOption[] = [];
  @Input() matches = new Map<SelectionHelperKind, SelectionHelperMatch>();
  @Input() sizeGroups: PageSizeGroup[] = [];
  @Input() selectedSizeGroupKey = '';
  @Input() duplicateScope: 'redundant' | 'all' = 'redundant';

  /** True while a blank or duplicate scan a helper depends on is running. */
  @Input() scanning = false;
  @Input() scanPercent = 0;
  @Input() scanStage = '';

  @Output() applyHelper = new EventEmitter<SelectionHelperKind>();
  @Output() duplicateScopeChange = new EventEmitter<'redundant' | 'all'>();
  @Output() sizeGroupChange = new EventEmitter<string>();
  @Output() cancelScan = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}
