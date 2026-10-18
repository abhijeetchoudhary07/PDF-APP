import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BookletPlan,
  CropOptions,
  LAYOUT_PAPER_ORDER,
  LayoutMode,
  LayoutOrientation,
  LayoutPaperSize,
  LayoutStudioConfig,
  LayoutTargetSize,
  LongPageOptions,
  LongPagePlan,
  MAX_LAYOUT_SCALE,
  MIN_LAYOUT_SCALE,
  MarginsOptions,
  NUP_CHOICES,
  NormalizeOptions,
  NupOptions,
  NupPlan,
  NupPerSheet,
  PDF_MAX_PAGE_DIMENSION_PT,
  PageSizeSurvey,
  TONE_DPI_CHOICES,
  TONE_PASSES,
  ToneEstimate,
  ToneOptions,
  TonePass,
  BookletOptions
} from '../../../../core/models/pdf-layout.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppProgressComponent,
  AutoScrollDirective,
  TranslatePipe
} from '../../../../shared/components/ui';

/** A size choice on the picker, including "leave it alone". */
interface SizeChoice {
  value: LayoutTargetSize;
  labelKey?: string;
  label?: string;
}

/**
 * The controls for the Layout Studio's seven operations (D1–D7).
 *
 * Presentational by design, exactly like the organizer's split panel: the page
 * owns the document, runs the planners and holds the plans; this renders the
 * settings for whichever mode is active, shows the plan it is handed, and
 * emits a new config when something is tapped. Nothing is written from here.
 *
 * Laid out for a phone held in one hand. Every control is full width or part of
 * a wrapping chip row, nothing is narrower than the 44px touch floor, and the
 * size pickers scroll sideways under `appAutoScroll` rather than clipping — a
 * nine-entry paper list does not fit across a 360px screen and must not be
 * allowed to try.
 */
@Component({
  selector: 'app-layout-mode-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    AppIconComponent,
    AppButtonComponent,
    AppProgressComponent,
    AutoScrollDirective,
    TranslatePipe
  ],
  templateUrl: './layout-mode-panel.component.html',
  styleUrls: ['./layout-mode-panel.component.scss']
})
export class LayoutModePanelComponent {
  @Input({ required: true }) mode!: LayoutMode;
  @Input({ required: true }) config!: LayoutStudioConfig;
  @Input() pageCount = 0;
  @Input() busy = false;

  /** D1: what the loaded document's page sizes look like. */
  @Input() survey: PageSizeSurvey | null = null;
  /** D4/D5/D6: the plan for the current settings, recomputed by the page. */
  @Input() nupPlan: NupPlan | null = null;
  @Input() bookletPlan: BookletPlan | null = null;
  @Input() longPlan: LongPagePlan | null = null;

  /** D2: the auto-trim scan. */
  @Input() scanning = false;
  @Input() scanPercent = 0;
  @Input() autoCropFound = 0;
  @Input() autoCropBlank = 0;

  /** D7: the measured size estimate. */
  @Input() toneEstimate: ToneEstimate | null = null;
  @Input() toneEstimating = false;

  @Output() configChange = new EventEmitter<LayoutStudioConfig>();
  @Output() autoTrim = new EventEmitter<void>();
  @Output() cancelScan = new EventEmitter<void>();
  @Output() resetCrop = new EventEmitter<void>();
  @Output() estimateTone = new EventEmitter<void>();

  readonly paperSizes: LayoutPaperSize[] = LAYOUT_PAPER_ORDER;
  readonly nupChoices: NupPerSheet[] = NUP_CHOICES;
  readonly tonePasses: TonePass[] = TONE_PASSES;
  readonly dpiChoices = TONE_DPI_CHOICES;
  readonly minScale = MIN_LAYOUT_SCALE;
  readonly maxScale = MAX_LAYOUT_SCALE;
  readonly maxPageDimension = PDF_MAX_PAGE_DIMENSION_PT;

  readonly orientations: Array<{ value: LayoutOrientation; labelKey: string }> = [
    { value: 'auto', labelKey: 'layout.orientAuto' },
    { value: 'portrait', labelKey: 'layout.orientPortrait' },
    { value: 'landscape', labelKey: 'layout.orientLandscape' }
  ];

  readonly scalePresets = [0.5, 0.75, 1, 1.25, 1.5];
  readonly paddingPresets = [0, 2, 5, 10];
  readonly marginPresets = [5, 10, 15, 20];
  readonly gapPresets = [0, 2, 5, 10];
  readonly creepPresets = [0, 1, 2, 3];

  /** Size choices, with "keep original" first because it is the safe answer. */
  get sizeChoices(): SizeChoice[] {
    return [
      { value: 'original', labelKey: 'layout.keepOriginal' },
      ...this.paperSizes.map(size => ({ value: size as LayoutTargetSize, label: size }))
    ];
  }

  /** Emits a copy of the config with one section replaced. */
  private emit(patch: Partial<LayoutStudioConfig>): void {
    this.configChange.emit({ ...this.config, ...patch });
  }

  updateNormalize(patch: Partial<NormalizeOptions>): void {
    this.emit({ normalize: { ...this.config.normalize, ...patch } });
  }

  updateCrop(patch: Partial<CropOptions>): void {
    this.emit({ crop: { ...this.config.crop, ...patch } });
  }

  updateMargins(patch: Partial<MarginsOptions>): void {
    this.emit({ margins: { ...this.config.margins, ...patch } });
  }

  updateNup(patch: Partial<NupOptions>): void {
    this.emit({ nup: { ...this.config.nup, ...patch } });
  }

  updateBooklet(patch: Partial<BookletOptions>): void {
    this.emit({ booklet: { ...this.config.booklet, ...patch } });
  }

  updateLongPage(patch: Partial<LongPageOptions>): void {
    this.emit({ longPage: { ...this.config.longPage, ...patch } });
  }

  updateTone(patch: Partial<ToneOptions>): void {
    this.emit({ tone: { ...this.config.tone, ...patch } });
  }

  /**
   * Clamps a typed number so a blank, negative or absurd entry cannot reach an
   * engine. Every numeric input on this panel goes through it.
   */
  private clamped(raw: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  onScaleChange(raw: unknown): void {
    this.updateNormalize({
      scale: this.clamped(raw, this.minScale, this.maxScale, 1)
    });
  }

  onScalePercentChange(raw: unknown): void {
    const percent = this.clamped(raw, this.minScale * 100, this.maxScale * 100, 100);
    this.updateNormalize({ scale: Math.round(percent) / 100 });
  }

  get scalePercent(): number {
    return Math.round(this.config.normalize.scale * 100);
  }

  onPaddingChange(raw: unknown): void {
    this.updateCrop({ paddingMm: this.clamped(raw, 0, 50, 2) });
  }

  onInkThresholdChange(raw: unknown): void {
    this.updateCrop({ inkThreshold: Math.round(this.clamped(raw, 100, 254, 245)) });
  }

  onMarginAllChange(raw: unknown): void {
    this.updateMargins({ all: this.clamped(raw, 0, 200, 10) });
  }

  onMarginEdgeChange(edge: 'top' | 'right' | 'bottom' | 'left', raw: unknown): void {
    this.updateMargins({ [edge]: this.clamped(raw, 0, 200, 10) } as Partial<MarginsOptions>);
  }

  onGutterChange(raw: unknown): void {
    this.updateNup({ gutterMm: this.clamped(raw, 0, 50, 4) });
  }

  onNupMarginChange(raw: unknown): void {
    this.updateNup({ marginMm: this.clamped(raw, 0, 50, 8) });
  }

  onCreepChange(raw: unknown): void {
    this.updateBooklet({ creepMm: this.clamped(raw, 0, 20, 0) });
  }

  onGapChange(raw: unknown): void {
    this.updateLongPage({ gapMm: this.clamped(raw, 0, 50, 0) });
  }

  onDpiChange(raw: unknown): void {
    this.updateTone({ dpi: Math.round(this.clamped(raw, 72, 300, 150)) });
  }

  onQualityChange(raw: unknown): void {
    this.updateTone({ quality: this.clamped(raw, 0.3, 1, 0.82) });
  }

  onThresholdChange(raw: unknown): void {
    this.updateTone({ threshold: Math.round(this.clamped(raw, 0, 255, 150)) });
  }

  onCropEdgeChange(
    edge: 'top' | 'right' | 'bottom' | 'left',
    raw: unknown
  ): void {
    const percent = this.clamped(raw, 0, 45, 0) / 100;
    const region = { ...this.config.crop.region };

    /*
     * The four boxes are "how much to trim off this edge", which is a far
     * easier thing to type than a region's x/y/width/height. Each one is
     * clamped against the opposite edge so the box cannot be inverted.
     */
    if (edge === 'left') {
      const right = region.x + region.width;
      region.x = Math.min(percent, right - 0.05);
      region.width = right - region.x;
    } else if (edge === 'right') {
      region.width = Math.max(0.05, 1 - percent - region.x);
    } else if (edge === 'top') {
      const bottom = region.y + region.height;
      region.y = Math.min(percent, bottom - 0.05);
      region.height = bottom - region.y;
    } else {
      region.height = Math.max(0.05, 1 - percent - region.y);
    }

    this.updateCrop({ region });
  }

  /** The trim on one edge as a percentage, for the numeric inputs. */
  cropEdgePercent(edge: 'top' | 'right' | 'bottom' | 'left'): number {
    const region = this.config.crop.region;
    switch (edge) {
      case 'top':
        return Math.round(region.y * 1000) / 10;
      case 'left':
        return Math.round(region.x * 1000) / 10;
      case 'right':
        return Math.round((1 - region.x - region.width) * 1000) / 10;
      case 'bottom':
      default:
        return Math.round((1 - region.y - region.height) * 1000) / 10;
    }
  }

  /** Sheets the current N-up settings would print. */
  get nupSheetCount(): number {
    return this.nupPlan?.sheetCount ?? 0;
  }

  /** Height one long page would need, rounded for display. */
  get longHeightPt(): number {
    return Math.round(this.longPlan?.totalHeightPt ?? 0);
  }

  get longExceedsLimit(): boolean {
    return this.longPlan?.exceedsLimit === true;
  }

  /** Estimated output size in KB, for the tone warning. */
  get toneEstimateKb(): number {
    return Math.round((this.toneEstimate?.estimatedBytes ?? 0) / 1024);
  }

  readonly marginEdges: Array<{ key: 'top' | 'right' | 'bottom' | 'left'; labelKey: string }> = [
    { key: 'top', labelKey: 'layout.edgeTop' },
    { key: 'right', labelKey: 'layout.edgeRight' },
    { key: 'bottom', labelKey: 'layout.edgeBottom' },
    { key: 'left', labelKey: 'layout.edgeLeft' }
  ];

  marginEdgeValue(edge: 'top' | 'right' | 'bottom' | 'left'): number {
    return this.config.margins[edge];
  }

  /** A translation key per tone pass, so no English is built here. */
  tonePassKey(pass: TonePass): string {
    switch (pass) {
      case 'grayscale':
        return 'layout.toneGrayscale';
      case 'invert':
        return 'layout.toneInvert';
      case 'high-contrast':
      default:
        return 'layout.toneContrast';
    }
  }

  tonePassDescKey(pass: TonePass): string {
    switch (pass) {
      case 'grayscale':
        return 'layout.toneGrayscaleDesc';
      case 'invert':
        return 'layout.toneInvertDesc';
      case 'high-contrast':
      default:
        return 'layout.toneContrastDesc';
    }
  }
}
