import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  OVERLAP_PRESETS_MM,
  PaperSize,
  SECTION_PRESETS,
  SectionOrder,
  SectionPiece,
  SectionPlan,
  SectionPreset,
  SectioningConfig,
  SectioningMode,
  SectioningProgress
} from '../../../../core/models/pdf-sectioning.types';
import { SplitPlanNotice } from '../../../../core/models/pdf-split.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppProgressComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

/** Notices that leave nothing worth writing. */
const BLOCKING_NOTICES = new Set(['single-part', 'grid-too-fine']);

/**
 * The controls and live preview for page sectioning (B6) and poster tiling
 * (B7).
 *
 * Unlike the five page-range split modes, these two are planned from the page
 * dimensions alone, so the preview redraws as the settings move and there is
 * nothing to press first. Only the gutter scan reads the document, and only
 * when it is switched on.
 *
 * The preview is an SVG laid out in the page's own visual coordinates, so a
 * tile's rectangle on screen is the rectangle that will be written — overlaps
 * included, which is the whole point of showing it before printing.
 */
@Component({
  selector: 'app-section-panel',
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
  templateUrl: './section-panel.component.html',
  styleUrls: ['./section-panel.component.scss']
})
export class SectionPanelComponent {
  @Input({ required: true }) mode!: SectioningMode;
  @Input({ required: true }) config!: SectioningConfig;
  @Input() plan: SectionPlan | null = null;
  @Input() totalPages = 0;

  /** The first page, drawn behind the grid so the cuts can be judged. */
  @Input() previewThumbnailUrl?: string;
  /** Visual size of that page in points, after its rotation. */
  @Input() previewWidth = 595;
  @Input() previewHeight = 842;

  @Input() busy = false;
  @Input() scanning = false;
  @Input() progress: SectioningProgress | null = null;

  @Output() configChange = new EventEmitter<SectioningConfig>();
  @Output() scanGutters = new EventEmitter<void>();
  @Output() cancelScan = new EventEmitter<void>();

  readonly presets: SectionPreset[] = SECTION_PRESETS;
  readonly overlapPresets = OVERLAP_PRESETS_MM;
  readonly papers: PaperSize[] = ['A4', 'Letter'];
  readonly orientations: Array<'auto' | 'portrait' | 'landscape'> = [
    'auto',
    'portrait',
    'landscape'
  ];

  update(patch: Partial<SectioningConfig>): void {
    this.configChange.emit({ ...this.config, ...patch });
  }

  applyPreset(preset: SectionPreset): void {
    this.update({ rows: preset.rows, columns: preset.columns });
  }

  isPresetActive(preset: SectionPreset): boolean {
    return this.config.rows === preset.rows && this.config.columns === preset.columns;
  }

  setRows(raw: unknown): void {
    this.update({ rows: this.clampGrid(raw) });
  }

  setColumns(raw: unknown): void {
    this.update({ columns: this.clampGrid(raw) });
  }

  private clampGrid(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.min(20, Math.max(1, Math.floor(n)));
  }

  setOverlap(raw: unknown): void {
    const n = Number(raw);
    this.update({ overlapMm: Number.isFinite(n) ? Math.min(50, Math.max(0, n)) : 0 });
  }

  setOrder(order: SectionOrder): void {
    this.update({ order });
  }

  /** Only a spread cut once down the middle has a gutter to look for. */
  get gutterAvailable(): boolean {
    return this.mode === 'sections' && this.config.rows === 1 && this.config.columns === 2;
  }

  toggleGutter(): void {
    const next = !this.config.useGutterDetection;
    this.update({ useGutterDetection: next });
    if (next) this.scanGutters.emit();
  }

  // ─────────── Preview geometry ───────────

  /** Pieces to outline. The preview draws the first page's share of the plan. */
  get previewPieces(): SectionPiece[] {
    return (this.plan?.pieces ?? []).filter(p => p.sourcePageNumber === 1);
  }

  get viewBox(): string {
    return `0 0 ${this.previewWidth} ${this.previewHeight}`;
  }

  /** Keeps the preview box the page's shape, so the grid is not distorted. */
  get previewAspect(): string {
    const w = Math.max(1, this.previewWidth);
    const h = Math.max(1, this.previewHeight);
    return `${w} / ${h}`;
  }

  /** A stroke that stays about a pixel wide whatever the page size. */
  get strokeWidth(): number {
    return Math.max(this.previewWidth, this.previewHeight) / 320;
  }

  get labelSize(): number {
    return Math.max(this.previewWidth, this.previewHeight) / 22;
  }

  pieceLabel(piece: SectionPiece): string {
    return this.mode === 'tiles'
      ? `R${piece.row + 1}C${piece.column + 1}`
      : String(piece.outputIndex + 1);
  }

  // ─────────── Plan reporting ───────────

  get blockingNotices(): SplitPlanNotice[] {
    return (this.plan?.notices ?? []).filter(n => BLOCKING_NOTICES.has(n.kind));
  }

  get advisoryNotices(): SplitPlanNotice[] {
    return (this.plan?.notices ?? []).filter(n => !BLOCKING_NOTICES.has(n.kind));
  }

  noticeIsWarning(notice: SplitPlanNotice): boolean {
    return notice.kind === 'large-sheet-count' || notice.kind === 'gutter-not-found';
  }

  noticeKey(notice: SplitPlanNotice): string {
    switch (notice.kind) {
      case 'gutter-applied':
        return 'organizer.sectionNoticeGutterApplied';
      case 'gutter-not-found':
        return 'organizer.sectionNoticeGutterNotFound';
      case 'page-fits-one-sheet':
        return 'organizer.sectionNoticeFitsOneSheet';
      case 'large-sheet-count':
        return 'organizer.sectionNoticeLargeSheetCount';
      case 'grid-too-fine':
        return 'organizer.sectionNoticeGridTooFine';
      case 'single-part':
        return 'organizer.sectionNoticeSinglePiece';
      default:
        return 'organizer.splitNoticeGeneric';
    }
  }

  noticeParams(notice: SplitPlanNotice): Record<string, string | number> {
    return { count: notice.count ?? 0, detail: notice.detail ?? '' };
  }

  get progressLabelKey(): string {
    return 'organizer.sectionScanningGutters';
  }

  get progressParams(): Record<string, number> {
    return {
      completed: this.progress?.completed ?? 0,
      total: this.progress?.total ?? 0
    };
  }

  /** Finished size of a piece, for the summary line. */
  get pieceSizeMm(): { width: number; height: number } | null {
    const piece = this.previewPieces[0];
    if (!piece) return null;
    return {
      width: Math.round((piece.widthPt / 72) * 25.4),
      height: Math.round((piece.heightPt / 72) * 25.4)
    };
  }
}
