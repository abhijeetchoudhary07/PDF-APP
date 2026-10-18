import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { PdfLayoutService } from '../../core/services/pdf-layout.service';
import { PdfToneService } from '../../core/services/pdf-tone.service';
import {
  BookletPlan,
  CropRegion,
  LAYOUT_MODES,
  LayoutMode,
  LayoutNotice,
  LayoutOutput,
  LayoutStudioConfig,
  LongPagePlan,
  NupPlan,
  PT_PER_MM,
  PageSizeSurvey,
  ToneEstimate,
  defaultLayoutStudioConfig,
  fullCropRegion,
  isLayoutMode
} from '../../core/models/pdf-layout.types';
import { TabItem } from '../../shared/components/ui/tabs/tabs.component';
import {
  AppButtonComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  AppPageHeaderComponent,
  AppProgressComponent,
  AppTabsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  AppRelatedToolsComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { CropStageComponent } from './components/crop-stage/crop-stage.component';
import { LayoutModePanelComponent } from './components/layout-mode-panel/layout-mode-panel.component';

type Stage = 'EMPTY' | 'READY' | 'WORKING' | 'DONE';

/**
 * Page Size & Layout Studio — D1 to D7.
 *
 * One document in, one document out, through whichever of the seven geometry
 * passes is selected. The page owns the file, the plans and the preview; the
 * panel renders the settings and the crop stage renders the region. Nothing
 * here does PDF geometry itself — that is `PdfLayoutService` and
 * `PdfToneService`, both of which are unit-tested on their own.
 *
 * Mobile first, in the ways that actually matter on a phone:
 *   • The mode tabs scroll sideways under `appAutoScroll` instead of clipping
 *     seven labels across 360px.
 *   • The export action is a sticky bottom bar (`.export-bar`), so it is under
 *     the thumb rather than below a screenful of settings.
 *   • Every job reports progress and is cancellable, and the page-by-page
 *     engines yield to the event loop so the UI keeps responding on a
 *     mid-range device.
 *   • The preview renders one page at a time at screen resolution, not the
 *     whole document — a 200-page file must not be rasterised to show a crop
 *     box.
 */
@Component({
  selector: 'app-pdf-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pdf-layout.page.html',
  styleUrls: ['./pdf-layout.page.scss'],
  imports: [
    CommonModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppIconComponent,
    AppTabsComponent,
    AppProgressComponent,
    FileDropzoneComponent,
    FilePreviewComponent,
    AppRelatedToolsComponent,
    CropStageComponent,
    LayoutModePanelComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfLayoutPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private fileService = inject(FileService);
  private layout = inject(PdfLayoutService);
  private tone = inject(PdfToneService);
  private storage = inject(StorageService);
  private share = inject(ShareService);
  private history = inject(HistoryService);
  private toast = inject(ToastService);
  private translate = inject(TranslationService);
  private alerts = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  stage: Stage = 'EMPTY';
  mode: LayoutMode = 'normalize';
  config: LayoutStudioConfig = defaultLayoutStudioConfig();

  file?: File;
  buffer?: ArrayBuffer;
  pageCount = 0;
  survey: PageSizeSurvey | null = null;

  /** 1-indexed page the preview and the `current` scope refer to. */
  currentPage = 1;
  previewUrl?: string;
  previewLoading = false;

  nupPlan: NupPlan | null = null;
  bookletPlan: BookletPlan | null = null;
  longPlan: LongPagePlan | null = null;
  toneEstimate: ToneEstimate | null = null;
  toneEstimating = false;

  scanning = false;
  scanPercent = 0;
  autoCropRegions = new Map<number, CropRegion>();
  autoCropFound = 0;
  autoCropBlank = 0;

  working = false;
  workPercent = 0;
  errorMessage = '';

  result: LayoutOutput | null = null;
  savedUri?: string;

  private controller: AbortController | null = null;
  private langSub?: Subscription;
  private objectUrls: string[] = [];

  // ════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const routeMode = this.route.snapshot.data?.['mode'];
    if (typeof routeMode === 'string' && isLayoutMode(routeMode)) {
      this.mode = routeMode;
    }

    /*
     * The tab labels are built from translations, so they are rebuilt when the
     * language changes rather than staying in whichever language the page was
     * opened in.
     */
    this.langSub = this.translate.currentLang$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.controller?.abort();
    this.langSub?.unsubscribe();
    this.releasePreviews();
  }

  private releasePreviews(): void {
    for (const url of this.objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Already revoked, or never a blob URL.
      }
    }
    this.objectUrls = [];
  }

  // ════════════════════════════════════════════════════════════════════
  // Tabs
  // ════════════════════════════════════════════════════════════════════

  get modeTabs(): TabItem[] {
    return LAYOUT_MODES.map(mode => ({
      id: mode,
      label: this.translate.translate(this.modeLabelKey(mode))
    }));
  }

  modeLabelKey(mode: LayoutMode): string {
    switch (mode) {
      case 'normalize':
        return 'layout.modeNormalize';
      case 'crop':
        return 'layout.modeCrop';
      case 'margins':
        return 'layout.modeMargins';
      case 'nup':
        return 'layout.modeNup';
      case 'booklet':
        return 'layout.modeBooklet';
      case 'long-page':
        return 'layout.modeLongPage';
      case 'tone':
      default:
        return 'layout.modeTone';
    }
  }

  onModeChange(id: string): void {
    if (!isLayoutMode(id) || this.working) return;
    this.mode = id;
    this.result = null;
    this.savedUri = undefined;
    this.recomputePlans();
    if (this.mode === 'crop' && !this.previewUrl) void this.renderPreview();
    this.cdr.markForCheck();
  }

  get isCropMode(): boolean {
    return this.mode === 'crop';
  }

  // ════════════════════════════════════════════════════════════════════
  // File handling
  // ════════════════════════════════════════════════════════════════════

  async pickFile(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (file) await this.onFileSelected(file);
  }

  async onFileSelected(file: File): Promise<void> {
    this.reset(false);
    this.file = file;

    try {
      this.buffer = await file.arrayBuffer();
      this.survey = await this.layout.surveyDocument(this.buffer);
      this.pageCount = this.survey.pageCount;

      if (this.pageCount === 0) {
        throw new Error(this.translate.translate('layout.errorNoPages'));
      }

      this.stage = 'READY';
      this.recomputePlans();
      this.cdr.markForCheck();

      // The preview is only needed by the crop stage; everything else shows a plan.
      if (this.mode === 'crop') void this.renderPreview();

      if (this.survey.mixed && this.mode === 'normalize') {
        this.toast.info(
          this.translate.translate('layout.mixedSizesToast', {
            count: this.survey.groups.length
          })
        );
      }
    } catch (error: unknown) {
      this.stage = 'EMPTY';
      this.errorMessage =
        error instanceof Error ? error.message : this.translate.translate('layout.errorLoad');
      this.toast.error(this.errorMessage);
      this.cdr.markForCheck();
    }
  }

  removeFile(): void {
    this.reset(true);
    this.cdr.markForCheck();
  }

  private reset(toEmpty: boolean): void {
    this.controller?.abort();
    this.controller = null;
    this.releasePreviews();

    this.file = undefined;
    this.buffer = undefined;
    this.pageCount = 0;
    this.survey = null;
    this.currentPage = 1;
    this.previewUrl = undefined;
    this.previewLoading = false;
    this.nupPlan = null;
    this.bookletPlan = null;
    this.longPlan = null;
    this.toneEstimate = null;
    this.toneEstimating = false;
    this.scanning = false;
    this.scanPercent = 0;
    this.autoCropRegions.clear();
    this.autoCropFound = 0;
    this.autoCropBlank = 0;
    this.working = false;
    this.workPercent = 0;
    this.errorMessage = '';
    this.result = null;
    this.savedUri = undefined;

    if (toEmpty) this.stage = 'EMPTY';
  }

  // ════════════════════════════════════════════════════════════════════
  // Plans & preview
  // ════════════════════════════════════════════════════════════════════

  onConfigChange(config: LayoutStudioConfig): void {
    this.config = config;
    this.result = null;
    this.savedUri = undefined;
    // A changed tone setting invalidates a measured estimate.
    if (this.mode === 'tone') this.toneEstimate = null;
    this.recomputePlans();
    this.cdr.markForCheck();
  }

  /**
   * Recomputes the N-up, booklet and long-page plans.
   *
   * All three are synchronous and cheap — they work on page sizes, not page
   * content — so they are recomputed on every settings change rather than
   * behind an "analyse" button.
   */
  private recomputePlans(): void {
    const sizes = this.pageSizes();
    if (sizes.length === 0) {
      this.nupPlan = null;
      this.bookletPlan = null;
      this.longPlan = null;
      return;
    }

    this.nupPlan = this.layout.planNup(sizes, this.config.nup);
    this.bookletPlan = this.layout.planBooklet(sizes.length, this.config.booklet);
    this.longPlan = this.layout.planLongPage(sizes, this.config.longPage);
  }

  /** Visual page sizes, taken from the survey rather than re-parsing the file. */
  private pageSizes(): Array<{ width: number; height: number }> {
    if (!this.survey) return [];

    const sizes: Array<{ width: number; height: number }> = new Array(this.survey.pageCount);
    for (const group of this.survey.groups) {
      for (const pageNumber of group.pageNumbers) {
        sizes[pageNumber - 1] = { width: group.widthPt, height: group.heightPt };
      }
    }
    return sizes.filter(Boolean);
  }

  /** Renders the current page for the crop stage, at screen resolution. */
  async renderPreview(): Promise<void> {
    if (!this.buffer || this.pageCount === 0) return;

    this.previewLoading = true;
    this.cdr.markForCheck();

    try {
      const pdfjsLib = await import('pdfjs-dist');
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(this.buffer.slice(0))
      } as Parameters<typeof pdfjsLib.getDocument>[0]);
      const pdf = await task.promise;

      try {
        const page = await pdf.getPage(Math.min(this.currentPage, pdf.numPages));
        const base = page.getViewport({ scale: 1 });
        // Wide enough to drag a crop box on, small enough not to stall a phone.
        const scale = Math.min(2, 900 / Math.max(1, base.width));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context.');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: ctx,
          canvas,
          viewport
        } as Parameters<typeof page.render>[0]).promise;

        this.previewUrl = canvas.toDataURL('image/jpeg', 0.85);
      } finally {
        await task.destroy();
      }
    } catch {
      this.previewUrl = undefined;
    } finally {
      this.previewLoading = false;
      this.cdr.markForCheck();
    }
  }

  async goToPage(delta: number): Promise<void> {
    const next = Math.min(Math.max(1, this.currentPage + delta), this.pageCount);
    if (next === this.currentPage) return;
    this.currentPage = next;
    await this.renderPreview();
  }

  onCropRegionChange(region: CropRegion): void {
    this.config = { ...this.config, crop: { ...this.config.crop, region } };
    this.result = null;
    this.cdr.markForCheck();
  }

  resetCropRegion(): void {
    this.autoCropRegions.clear();
    this.autoCropFound = 0;
    this.autoCropBlank = 0;
    this.onCropRegionChange(fullCropRegion());
  }

  // ════════════════════════════════════════════════════════════════════
  // Auto-trim (D2)
  // ════════════════════════════════════════════════════════════════════

  async runAutoTrim(): Promise<void> {
    if (!this.buffer || this.scanning) return;

    this.scanning = true;
    this.scanPercent = 0;
    this.autoCropRegions.clear();
    this.autoCropFound = 0;
    this.autoCropBlank = 0;
    this.controller = new AbortController();
    this.cdr.markForCheck();

    try {
      const pages = this.layout.resolveScope(
        this.pageCount,
        this.config.crop.scope,
        this.config.crop.rangeString,
        this.currentPage
      );

      const bounds = await this.layout.scanContentBounds(this.buffer, pages, {
        inkThreshold: this.config.crop.inkThreshold,
        signal: this.controller.signal,
        onProgress: progress => {
          this.scanPercent = progress.percent;
          this.cdr.markForCheck();
        }
      });

      const sizes = this.pageSizes();
      const padded: Array<{ pageNumber: number; region: CropRegion }> = [];

      for (const entry of bounds) {
        if (!entry.region) {
          this.autoCropBlank++;
          continue;
        }
        const size = sizes[entry.pageNumber - 1];
        const region = this.layout.padRegion(
          entry.region,
          this.config.crop.paddingMm * PT_PER_MM,
          size?.width ?? 595,
          size?.height ?? 842
        );
        padded.push({ pageNumber: entry.pageNumber, region });
      }

      this.autoCropFound = padded.length;

      if (padded.length === 0) {
        this.toast.warning(this.translate.translate('layout.cropScanNothing'));
        return;
      }

      if (this.config.crop.uniform) {
        const union = this.layout.unionRegion(padded.map(entry => entry.region));
        if (union) {
          for (const entry of padded) this.autoCropRegions.set(entry.pageNumber, union);
          this.onCropRegionChange(union);
        }
      } else {
        for (const entry of padded) this.autoCropRegions.set(entry.pageNumber, entry.region);
        const forCurrent = this.autoCropRegions.get(this.currentPage);
        if (forCurrent) this.onCropRegionChange(forCurrent);
      }

      this.toast.success(
        this.translate.translate('layout.cropScanResult', { count: this.autoCropFound })
      );
    } catch (error: unknown) {
      if (!this.controller?.signal.aborted) {
        this.toast.error(
          error instanceof Error ? error.message : this.translate.translate('layout.errorScan')
        );
      }
    } finally {
      this.scanning = false;
      this.controller = null;
      this.cdr.markForCheck();
    }
  }

  cancelScan(): void {
    this.controller?.abort();
    this.scanning = false;
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Tone estimate (D7)
  // ════════════════════════════════════════════════════════════════════

  async runToneEstimate(): Promise<void> {
    if (!this.buffer || this.toneEstimating) return;

    this.toneEstimating = true;
    this.toneEstimate = null;
    this.cdr.markForCheck();

    try {
      this.toneEstimate = await this.tone.estimate(this.buffer, this.config.tone);
    } catch {
      this.toneEstimate = {
        samplePageBytes: 0,
        estimatedBytes: 0,
        pageCount: this.pageCount,
        samplePixels: { width: 0, height: 0 },
        unavailableReason: 'estimate-failed'
      };
    } finally {
      this.toneEstimating = false;
      this.cdr.markForCheck();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Export
  // ════════════════════════════════════════════════════════════════════

  /** The file-name stem for the current mode's output. */
  private outputName(): string {
    const stem = (this.file?.name ?? 'document').replace(/\.pdf$/i, '');
    const suffix: Record<LayoutMode, string> = {
      normalize: 'resized',
      crop: 'cropped',
      margins: 'margins',
      nup: `${this.config.nup.perSheet}up`,
      booklet: 'booklet',
      'long-page': 'longpage',
      tone: this.config.tone.pass === 'high-contrast' ? 'contrast' : this.config.tone.pass
    };
    return `${stem}_${suffix[this.mode]}.pdf`;
  }

  exportLabelKey(): string {
    switch (this.mode) {
      case 'normalize':
        return 'layout.exportNormalize';
      case 'crop':
        return 'layout.exportCrop';
      case 'margins':
        return 'layout.exportMargins';
      case 'nup':
        return 'layout.exportNup';
      case 'booklet':
        return 'layout.exportBooklet';
      case 'long-page':
        return 'layout.exportLongPage';
      case 'tone':
      default:
        return 'layout.exportTone';
    }
  }

  /**
   * Whether the export can run, and why not when it cannot.
   *
   * The long-page limit is the one blocking case: a stack over 14,400 units
   * with splitting switched off cannot be written at all, so the button is
   * disabled rather than left to throw.
   */
  get blockedReasonKey(): string | null {
    if (this.pageCount === 0) return 'layout.blockedNoFile';
    if (
      this.mode === 'long-page' &&
      this.longPlan?.exceedsLimit &&
      !this.config.longPage.splitWhenTooTall
    ) {
      return 'layout.blockedLongLimit';
    }
    if (this.mode === 'crop') {
      const region = this.config.crop.region;
      const whole =
        region.x <= 1e-6 &&
        region.y <= 1e-6 &&
        region.width >= 1 - 1e-6 &&
        region.height >= 1 - 1e-6;
      if (whole && this.autoCropRegions.size === 0) return 'layout.blockedNoCrop';
    }
    return null;
  }

  async runExport(): Promise<void> {
    if (!this.buffer || this.working || this.blockedReasonKey) return;

    this.working = true;
    this.workPercent = 0;
    this.errorMessage = '';
    this.result = null;
    this.savedUri = undefined;
    this.stage = 'WORKING';
    this.controller = new AbortController();
    this.cdr.markForCheck();

    const onProgress = (progress: { percent: number }) => {
      this.workPercent = progress.percent;
      this.cdr.markForCheck();
    };
    const signal = this.controller.signal;
    const name = this.outputName();

    try {
      let output: LayoutOutput;

      switch (this.mode) {
        case 'normalize':
          output = await this.layout.exportNormalized(
            this.buffer,
            this.config.normalize,
            name,
            onProgress,
            signal
          );
          break;
        case 'crop':
          output = await this.layout.exportCropped(
            this.buffer,
            this.config.crop,
            name,
            this.autoCropRegions.size > 0 ? this.autoCropRegions : undefined,
            onProgress,
            signal,
            this.currentPage
          );
          break;
        case 'margins':
          output = await this.layout.exportWithMargins(
            this.buffer,
            this.config.margins,
            name,
            onProgress,
            signal
          );
          break;
        case 'nup':
          output = await this.layout.exportNup(
            this.buffer,
            this.config.nup,
            name,
            onProgress,
            signal
          );
          break;
        case 'booklet':
          output = await this.layout.exportBooklet(
            this.buffer,
            this.config.booklet,
            name,
            onProgress,
            signal
          );
          break;
        case 'long-page':
          output = await this.layout.exportLongPage(
            this.buffer,
            this.config.longPage,
            name,
            onProgress,
            signal
          );
          break;
        case 'tone':
        default:
          output = await this.tone.exportToned(
            this.buffer,
            this.config.tone,
            name,
            onProgress,
            signal
          );
          break;
      }

      this.result = output;
      this.stage = 'DONE';
      this.workPercent = 100;
    } catch (error: unknown) {
      this.stage = 'READY';
      if (signal.aborted) {
        this.toast.info(this.translate.translate('layout.cancelled'));
      } else {
        this.errorMessage =
          error instanceof Error
            ? error.message
            : this.translate.translate('layout.errorExport');
        this.toast.error(this.errorMessage);
      }
    } finally {
      this.working = false;
      this.controller = null;
      this.cdr.markForCheck();
    }
  }

  cancelExport(): void {
    this.controller?.abort();
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Saving
  // ════════════════════════════════════════════════════════════════════

  /**
   * Saves through `StorageService.saveFile`, which is where the free-tier
   * daily quota is enforced. Nothing here writes a file any other way.
   */
  async saveResult(): Promise<void> {
    if (!this.result || !this.file) return;

    try {
      const uri = await this.storage.saveFile(this.result.file, 'pdf');
      if (!uri) return; // The quota gate already told the person why.

      this.savedUri = uri;
      await this.history.addHistoryItem({
        operation: `pdf_layout_${this.mode}`,
        originalFileName: this.file.name,
        outputFileName: this.result.name,
        originalSizeBytes: this.file.size,
        outputSizeBytes: this.result.sizeBytes,
        outputPath: uri
      });

      this.toast.success(this.translate.translate('layout.savedToast'));
      this.cdr.markForCheck();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : this.translate.translate('layout.errorSave')
      );
    }
  }

  async shareResult(): Promise<void> {
    if (!this.savedUri || this.savedUri === 'web-download') {
      await this.saveResult();
      return;
    }
    await this.share.shareFile(this.savedUri, this.translate.translate('layout.title'));
  }

  /** Opens the finished file in a new tab, for a look before saving. */
  previewResult(): void {
    if (!this.result) return;
    const url = URL.createObjectURL(this.result.blob);
    this.objectUrls.push(url);
    window.open(url, '_blank');
  }

  startOver(): void {
    this.result = null;
    this.savedUri = undefined;
    this.stage = this.file ? 'READY' : 'EMPTY';
    this.workPercent = 0;
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Notices
  // ════════════════════════════════════════════════════════════════════

  /** A translation key per notice kind, so no English is built in a service. */
  noticeKey(notice: LayoutNotice): string {
    return `layout.notice.${notice.kind}`;
  }

  noticeParams(notice: LayoutNotice): Record<string, unknown> {
    return {
      count: notice.count ?? 0,
      detail: notice.detail ?? '',
      pages: (notice.pageNumbers ?? []).slice(0, 12).join(', ')
    };
  }

  /** Notices that are warnings rather than information. */
  isWarningNotice(notice: LayoutNotice): boolean {
    return (
      notice.kind === 'annotations-dropped' ||
      notice.kind === 'raster-output' ||
      notice.kind === 'raster-page-skipped' ||
      notice.kind === 'long-page-limit' ||
      notice.kind === 'crop-box-empty' ||
      notice.kind === 'enlarged-pages' ||
      notice.kind === 'scale-clamped'
    );
  }

  /** Size change as a signed percentage, for the result card. */
  get sizeDeltaPercent(): number {
    if (!this.result || !this.file || this.file.size === 0) return 0;
    return Math.round(((this.result.sizeBytes - this.file.size) / this.file.size) * 100);
  }

  async showRasterWarning(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.translate.translate('layout.toneRasterTitle'),
      message: this.translate.translate('layout.toneRasterBody'),
      buttons: [this.translate.translate('common.close')]
    });
    await alert.present();
  }
}
