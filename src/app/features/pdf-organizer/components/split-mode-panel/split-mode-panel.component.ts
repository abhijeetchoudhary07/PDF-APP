import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdvancedSplitConfig,
  AdvancedSplitMode,
  SIZE_CEILING_PRESETS,
  SizeCeilingPreset,
  SizeUnit,
  SplitNoticeKind,
  SplitPagePreviewRow,
  SplitPlan,
  SplitPlanNotice,
  SplitPlanProgress
} from '../../../../core/models/pdf-split.types';
import { PdfRangeParserUtil } from '../../../../core/utilities/pdf-range-parser.util';
import {
  AppButtonComponent,
  AppIconComponent,
  AppProgressComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

/** The notices that stop an export, as opposed to the ones that just inform. */
const BLOCKING_NOTICES: SplitNoticeKind[] = [
  'no-outline',
  'empty-level',
  'no-dividers',
  'no-pattern-match',
  'invalid-pattern',
  'count-too-large'
];

/** A notice kind that is worth a warning tone without blocking the export. */
const WARNING_NOTICES: SplitNoticeKind[] = [
  'oversized-page',
  'measure-budget-spent',
  'pages-without-text',
  'single-part'
];

/**
 * The controls and plan preview for the five split modes added in B1–B5.
 *
 * Presentational by design: the organizer owns the document, runs the planner
 * and holds the plan; this renders the settings for whichever mode is active,
 * shows the plan it is given, and emits what was tapped. Nothing is written
 * from here.
 *
 * Laid out for a phone held in one hand: every control is full width, stacked,
 * and at or above the 44px touch floor, and the part list and page table are
 * card rows rather than a table that would need sideways scrolling.
 */
@Component({
  selector: 'app-split-mode-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    AppIconComponent,
    AppButtonComponent,
    AppProgressComponent,
    TranslatePipe
  ],
  templateUrl: './split-mode-panel.component.html',
  styleUrls: ['./split-mode-panel.component.scss']
})
export class SplitModePanelComponent {
  @Input({ required: true }) mode!: AdvancedSplitMode;
  @Input({ required: true }) config!: AdvancedSplitConfig;
  @Input() totalPages = 0;

  /** Nesting levels the loaded outline actually has, for the B3 level picker. */
  @Input() outlineLevels: number[] = [];
  /** How many bookmarks sit at each level, indexed by level - 1. */
  @Input() outlineCountsByLevel: number[] = [];
  /** Null until an outline read has happened, so "no outline" is not shown too early. */
  @Input() outlineChecked = false;

  @Input() plan: SplitPlan | null = null;
  /** True when the plan no longer matches the settings on screen. */
  @Input() planStale = false;

  @Input() analyzing = false;
  @Input() progress: SplitPlanProgress | null = null;
  /** True while an export is running, so the panel's controls stand down. */
  @Input() busy = false;

  @Output() configChange = new EventEmitter<AdvancedSplitConfig>();
  @Output() analyze = new EventEmitter<void>();
  @Output() cancelAnalyze = new EventEmitter<void>();
  /** The person asked to take an oversized page to the compressor. */
  @Output() compressorHandOff = new EventEmitter<number[]>();

  readonly sizePresets: SizeCeilingPreset[] = SIZE_CEILING_PRESETS;
  readonly sizeUnits: SizeUnit[] = ['KB', 'MB'];
  readonly regionPresets = [10, 20, 30, 50];

  /** Collapsed by default: on a long document the per-page list is the longest thing here. */
  pageRowsExpanded = false;

  /** Emits a copy of the config with one field replaced. */
  update(patch: Partial<AdvancedSplitConfig>): void {
    this.configChange.emit({ ...this.config, ...patch });
  }

  applySizePreset(preset: SizeCeilingPreset): void {
    this.update({ sizeValue: preset.value, sizeUnit: preset.unit });
  }

  isSizePresetActive(preset: SizeCeilingPreset): boolean {
    return this.config.sizeValue === preset.value && this.config.sizeUnit === preset.unit;
  }

  /** Clamps the typed ceiling so a blank or zero entry cannot reach the planner. */
  onSizeValueChange(raw: unknown): void {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    this.update({ sizeValue: value });
  }

  onDocCountChange(raw: unknown): void {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? Math.floor(parsed) : 1;
    this.update({ docCount: Math.max(1, value) });
  }

  onRegionPercentChange(raw: unknown): void {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? Math.round(parsed) : 20;
    this.update({ textRegionPercent: Math.min(100, Math.max(1, value)) });
  }

  /**
   * At least one divider signal has to be on, or the scan would classify
   * nothing and the plan would come back empty for no visible reason.
   */
  toggleDividerBlank(): void {
    const next = !this.config.dividerBlank;
    this.update({
      dividerBlank: next,
      dividerBarcode: next ? this.config.dividerBarcode : true
    });
  }

  toggleDividerBarcode(): void {
    const next = !this.config.dividerBarcode;
    this.update({
      dividerBarcode: next,
      dividerBlank: next ? this.config.dividerBlank : true,
      // Naming from a payload is meaningless without the code pass.
      dividerNameFromPayload: next ? this.config.dividerNameFromPayload : false
    });
  }

  /** True when the active mode has everything it needs to be analyzed. */
  get canAnalyze(): boolean {
    if (this.analyzing || this.busy || this.totalPages === 0) return false;
    if (this.mode === 'text-pattern') return this.config.textPattern.trim().length > 0;
    if (this.mode === 'max-size') return this.config.sizeValue > 0;
    return true;
  }

  get analyzeLabelKey(): string {
    if (this.plan) return 'organizer.splitReanalyze';
    switch (this.mode) {
      case 'max-size':
        return 'organizer.splitMeasureParts';
      case 'chapters':
        return 'organizer.splitReadOutline';
      case 'divider':
        return 'organizer.splitScanDividers';
      case 'text-pattern':
        return 'organizer.splitReadPattern';
      default:
        return 'organizer.splitPlanPreviewBtn';
    }
  }

  get progressLabelKey(): string {
    switch (this.progress?.phase) {
      case 'measuring':
        return 'organizer.splitProgressMeasuring';
      case 'scanning':
        return 'organizer.splitProgressScanning';
      default:
        return 'organizer.splitProgressReading';
    }
  }

  get progressParams(): Record<string, number> {
    return {
      completed: this.progress?.completed ?? 0,
      total: this.progress?.total ?? 0
    };
  }

  /** Notices that keep the export disabled, newest understanding first. */
  get blockingNotices(): SplitPlanNotice[] {
    return (this.plan?.notices ?? []).filter(n => BLOCKING_NOTICES.includes(n.kind));
  }

  get advisoryNotices(): SplitPlanNotice[] {
    return (this.plan?.notices ?? []).filter(n => !BLOCKING_NOTICES.includes(n.kind));
  }

  noticeIsWarning(notice: SplitPlanNotice): boolean {
    return WARNING_NOTICES.includes(notice.kind);
  }

  /** `oversized-page` is the one notice that comes with an action attached. */
  oversizedPageNumbers(): number[] {
    const notice = (this.plan?.notices ?? []).find(n => n.kind === 'oversized-page');
    return notice?.pageNumbers ?? [];
  }

  noticeKey(notice: SplitPlanNotice): string {
    switch (notice.kind) {
      case 'oversized-page':
        return 'organizer.splitNoticeOversizedPage';
      case 'no-outline':
        return 'organizer.splitNoticeNoOutline';
      case 'empty-level':
        return 'organizer.splitNoticeEmptyLevel';
      case 'no-dividers':
        return 'organizer.splitNoticeNoDividers';
      case 'dropped-pages':
        return 'organizer.splitNoticeDroppedPages';
      case 'no-pattern-match':
        return 'organizer.splitNoticeNoPatternMatch';
      case 'invalid-pattern':
        return 'organizer.splitNoticeInvalidPattern';
      case 'count-too-large':
        return 'organizer.splitNoticeCountTooLarge';
      case 'single-part':
        return 'organizer.splitNoticeSinglePart';
      case 'measure-budget-spent':
        return 'organizer.splitNoticeMeasureBudget';
      case 'pages-without-text':
        return 'organizer.splitNoticePagesWithoutText';
      case 'unmatched-leading-pages':
        return 'organizer.splitNoticeLeadingPages';
      default:
        return 'organizer.splitNoticeGeneric';
    }
  }

  noticeParams(notice: SplitPlanNotice): Record<string, string | number> {
    const pages = notice.pageNumbers ?? [];
    return {
      count: notice.count ?? pages.length,
      pages: PdfRangeParserUtil.formatRange(pages),
      total: this.totalPages,
      detail: notice.detail ?? ''
    };
  }

  boundaryKey(row: SplitPagePreviewRow): string {
    switch (row.boundary) {
      case 'bookmark':
        return 'organizer.splitBoundaryBookmark';
      case 'divider-blank':
        return 'organizer.splitBoundaryBlank';
      case 'divider-code':
        return 'organizer.splitBoundaryCode';
      case 'value-change':
        return 'organizer.splitBoundaryValue';
      default:
        return '';
    }
  }

  formatPages(pageNumbers: number[]): string {
    return PdfRangeParserUtil.formatRange(pageNumbers);
  }

  /** KB below a megabyte, MB above it, to one decimal either way. */
  formatSize(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  outlineCountAt(level: number): number {
    return this.outlineCountsByLevel[level - 1] ?? 0;
  }

  get visiblePageRows(): SplitPagePreviewRow[] {
    const rows = this.plan?.pageRows ?? [];
    return this.pageRowsExpanded ? rows : rows.slice(0, 6);
  }

  get hiddenPageRowCount(): number {
    const rows = this.plan?.pageRows ?? [];
    return this.pageRowsExpanded ? 0 : Math.max(0, rows.length - 6);
  }
}
