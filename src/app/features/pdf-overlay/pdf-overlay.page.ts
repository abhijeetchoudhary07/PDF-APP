import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { PdfOverlayService } from '../../core/services/pdf-overlay.service';
import {
  OVERLAY_MAPPING_MODES,
  OVERLAY_PRESETS,
  OverlayLayer,
  OverlayMappingMode,
  OverlayNotice,
  OverlayOptions,
  OverlayOutput,
  OverlayPlan,
  OverlayPosition,
  OverlayPreset,
  OverlayPresetId,
  defaultOverlayOptions
} from '../../core/models/pdf-overlay.types';
import {
  AppButtonComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  AppPageHeaderComponent,
  AppProgressComponent,
  AppRelatedToolsComponent,
  AutoScrollDirective,
  FileDropzoneComponent,
  FilePreviewComponent,
  TranslatePipe
} from '../../shared/components/ui';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Overlay / underlay — C6.
 *
 * A base document plus one or more overlay documents, laid over or under it:
 * letterhead, pre-printed forms, watermark sheets, stamp pages.
 *
 * The preview is produced by the real export path with `previewOnly` set, so
 * the picture on screen is the first page of the file that will be saved
 * rather than an approximation of it. That costs one extra single-page write
 * and removes the whole class of "the preview looked right" bugs.
 *
 * Mobile first: presets are a one-tap row, the layer list is stacked cards,
 * the opacity control is a full-width slider rather than a numeric field, and
 * the export action is a sticky bottom bar.
 */
@Component({
  selector: 'app-pdf-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pdf-overlay.page.html',
  styleUrls: ['./pdf-overlay.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppIconComponent,
    AppProgressComponent,
    AppRelatedToolsComponent,
    AutoScrollDirective,
    FileDropzoneComponent,
    FilePreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfOverlayPage implements OnInit, OnDestroy {
  private fileService = inject(FileService);
  private overlay = inject(PdfOverlayService);
  private storage = inject(StorageService);
  private share = inject(ShareService);
  private history = inject(HistoryService);
  private toast = inject(ToastService);
  private translate = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  baseFile?: File;
  baseBuffer?: ArrayBuffer;
  basePageCount = 0;

  layers: OverlayLayer[] = [];
  options: OverlayOptions = defaultOverlayOptions();
  activePreset: OverlayPresetId = 'letterhead';

  plan: OverlayPlan | null = null;

  previewUrl?: string;
  previewLoading = false;

  working = false;
  workPercent = 0;
  errorMessage = '';

  result: OverlayOutput | null = null;
  savedUri?: string;

  readonly presets: OverlayPreset[] = OVERLAY_PRESETS;
  readonly mappingModes: OverlayMappingMode[] = OVERLAY_MAPPING_MODES;

  private controller: AbortController | null = null;
  private langSub?: Subscription;
  private objectUrls: string[] = [];

  // ════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.applyPreset(this.presets[0]);
    this.langSub = this.translate.currentLang$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.controller?.abort();
    this.langSub?.unsubscribe();
    for (const url of this.objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Already revoked.
      }
    }
    this.objectUrls = [];
  }

  // ════════════════════════════════════════════════════════════════════
  // Files
  // ════════════════════════════════════════════════════════════════════

  async pickBase(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (file) await this.onBaseSelected(file);
  }

  async onBaseSelected(file: File): Promise<void> {
    try {
      const buffer = await file.arrayBuffer();
      this.basePageCount = await this.readPageCount(buffer);
      if (this.basePageCount === 0) {
        throw new Error(this.translate.translate('overlay.errorEmptyBase'));
      }

      this.baseFile = file;
      this.baseBuffer = buffer;
      this.result = null;
      this.previewUrl = undefined;
      this.recomputePlan();
      this.cdr.markForCheck();
      if (this.layers.length > 0) void this.renderPreview();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : this.translate.translate('overlay.errorRead')
      );
    }
  }

  async addLayers(): Promise<void> {
    const files = await this.fileService.pickMultiplePdfs();
    if (files.length === 0) return;
    await this.onLayersSelected(files);
  }

  async onLayersSelected(files: File[]): Promise<void> {
    const added: OverlayLayer[] = [];
    const presetOpacity = this.presets.find(p => p.id === this.activePreset)?.opacity ?? 1;

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const pageCount = await this.readPageCount(buffer);
        if (pageCount === 0) {
          this.toast.warning(
            this.translate.translate('overlay.errorEmptyLayer', { name: file.name })
          );
          continue;
        }

        added.push({
          id: generateId(),
          name: file.name,
          pageCount,
          buffer,
          opacity: presetOpacity,
          scaleToFit: true
        });
      } catch {
        this.toast.error(this.translate.translate('overlay.errorRead'));
      }
    }

    if (added.length === 0) {
      this.cdr.markForCheck();
      return;
    }

    this.layers = [...this.layers, ...added];
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
    if (this.baseBuffer) void this.renderPreview();
  }

  private async readPageCount(buffer: ArrayBuffer): Promise<number> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    return doc.getPageCount();
  }

  removeBase(): void {
    this.baseFile = undefined;
    this.baseBuffer = undefined;
    this.basePageCount = 0;
    this.previewUrl = undefined;
    this.plan = null;
    this.result = null;
    this.cdr.markForCheck();
  }

  removeLayer(layerId: string): void {
    this.layers = this.layers.filter(layer => layer.id !== layerId);
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
    if (this.baseBuffer && this.layers.length > 0) void this.renderPreview();
    else this.previewUrl = undefined;
  }

  moveLayer(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.layers.length) return;

    const next = [...this.layers];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    this.layers = next;
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
  }

  updateLayer(layerId: string, patch: Partial<OverlayLayer>): void {
    this.layers = this.layers.map(layer =>
      layer.id === layerId ? { ...layer, ...patch } : layer
    );
    this.result = null;
    this.cdr.markForCheck();
  }

  onOpacityChange(layerId: string, raw: unknown): void {
    const parsed = Number(raw);
    const opacity = Number.isFinite(parsed) ? Math.min(1, Math.max(0.02, parsed)) : 1;
    this.updateLayer(layerId, { opacity });
  }

  opacityPercent(layer: OverlayLayer): number {
    return Math.round(layer.opacity * 100);
  }

  // ════════════════════════════════════════════════════════════════════
  // Options
  // ════════════════════════════════════════════════════════════════════

  applyPreset(preset: OverlayPreset): void {
    this.activePreset = preset.id;
    this.options = { ...preset.options };
    this.layers = this.layers.map(layer => ({ ...layer, opacity: preset.opacity }));
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
    if (this.baseBuffer && this.layers.length > 0) void this.renderPreview();
  }

  updateOptions(patch: Partial<OverlayOptions>): void {
    this.options = { ...this.options, ...patch };
    // Any change away from a preset's own settings makes the choice custom.
    this.activePreset = 'custom';
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
    if (this.baseBuffer && this.layers.length > 0) void this.renderPreview();
  }

  setPosition(position: OverlayPosition): void {
    this.updateOptions({ position });
  }

  setMode(mode: OverlayMappingMode): void {
    this.updateOptions({ mode });
  }

  onRepeatChange(raw: unknown): void {
    const parsed = Number(raw);
    const repeatCount = Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.round(parsed))) : 1;
    this.updateOptions({ repeatCount });
  }

  modeLabelKey(mode: OverlayMappingMode): string {
    switch (mode) {
      case 'sequential':
        return 'overlay.modeSequential';
      case 'interleaved':
        return 'overlay.modeInterleaved';
      case 'fixed-repeat':
      default:
        return 'overlay.modeFixedRepeat';
    }
  }

  modeDescKey(mode: OverlayMappingMode): string {
    switch (mode) {
      case 'sequential':
        return 'overlay.modeSequentialDesc';
      case 'interleaved':
        return 'overlay.modeInterleavedDesc';
      case 'fixed-repeat':
      default:
        return 'overlay.modeFixedRepeatDesc';
    }
  }

  private recomputePlan(): void {
    if (this.basePageCount === 0 || this.layers.length === 0) {
      this.plan = null;
      return;
    }
    this.plan = this.overlay.planMapping(
      this.basePageCount,
      this.layers.map(layer => layer.pageCount),
      this.options
    );
  }

  /** The mapping as `1←A1` labels for the preview row. */
  get mappingLabels(): string[] {
    if (!this.plan) return [];
    return this.plan.assignments.slice(0, 40).map(assignment => {
      if (assignment.layerIndex < 0) {
        return `${assignment.basePageNumber}·—`;
      }
      const letter = String.fromCharCode(65 + (assignment.layerIndex % 26));
      return `${assignment.basePageNumber}·${letter}${assignment.layerPageIndex + 1}`;
    });
  }

  get uncoveredCount(): number {
    return this.plan?.uncoveredPageNumbers.length ?? 0;
  }

  // ════════════════════════════════════════════════════════════════════
  // Preview
  // ════════════════════════════════════════════════════════════════════

  /**
   * Renders page 1 of the composite, through the real export path.
   *
   * `previewOnly` writes a one-page document, which is then rasterised for
   * display. Slower than drawing an approximation on a canvas, and worth it:
   * the preview and the output cannot disagree about opacity, stacking order
   * or placement, because they are the same code.
   */
  async renderPreview(): Promise<void> {
    if (!this.baseBuffer || this.layers.length === 0) return;

    this.previewLoading = true;
    this.cdr.markForCheck();

    try {
      const composite = await this.overlay.exportOverlaid(
        this.baseBuffer,
        this.layers,
        this.options,
        'preview.pdf',
        undefined,
        undefined,
        true
      );

      const bytes = await composite.blob.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(bytes)
      } as Parameters<typeof pdfjsLib.getDocument>[0]);
      const pdf = await task.promise;

      try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 760 / Math.max(1, base.width));
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

  // ════════════════════════════════════════════════════════════════════
  // Export
  // ════════════════════════════════════════════════════════════════════

  get blockedReasonKey(): string | null {
    if (!this.baseBuffer) return 'overlay.blockedNoBase';
    if (this.layers.length === 0) return 'overlay.blockedNoLayer';
    if (this.plan && this.plan.overlayPageCount === 0) return 'overlay.blockedNoOverlayPages';
    return null;
  }

  private outputName(): string {
    const stem = (this.baseFile?.name ?? 'document').replace(/\.pdf$/i, '');
    const suffix = this.options.position === 'background' ? 'underlay' : 'overlay';
    return `${stem}_${suffix}.pdf`;
  }

  async runExport(): Promise<void> {
    if (!this.baseBuffer || this.working || this.blockedReasonKey) return;

    this.working = true;
    this.workPercent = 0;
    this.errorMessage = '';
    this.result = null;
    this.savedUri = undefined;
    this.controller = new AbortController();
    this.cdr.markForCheck();

    const signal = this.controller.signal;

    try {
      this.result = await this.overlay.exportOverlaid(
        this.baseBuffer,
        this.layers,
        this.options,
        this.outputName(),
        progress => {
          this.workPercent = progress.percent;
          this.cdr.markForCheck();
        },
        signal
      );
      this.workPercent = 100;
    } catch (error: unknown) {
      if (signal.aborted) {
        this.toast.info(this.translate.translate('overlay.cancelled'));
      } else {
        this.errorMessage =
          error instanceof Error
            ? error.message
            : this.translate.translate('overlay.errorExport');
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

  async saveResult(): Promise<void> {
    if (!this.result || !this.baseFile) return;

    try {
      const uri = await this.storage.saveFile(this.result.file, 'pdf');
      if (!uri) return; // The quota gate has already said why.

      this.savedUri = uri;
      await this.history.addHistoryItem({
        operation: `pdf_overlay_${this.options.position}`,
        originalFileName: this.baseFile.name,
        outputFileName: this.result.name,
        originalSizeBytes: this.baseFile.size,
        outputSizeBytes: this.result.sizeBytes,
        outputPath: uri
      });

      this.toast.success(this.translate.translate('overlay.savedToast'));
      this.cdr.markForCheck();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : this.translate.translate('overlay.errorSave')
      );
    }
  }

  async shareResult(): Promise<void> {
    if (!this.savedUri || this.savedUri === 'web-download') {
      await this.saveResult();
      return;
    }
    await this.share.shareFile(this.savedUri, this.translate.translate('overlay.title'));
  }

  previewResult(): void {
    if (!this.result) return;
    const url = URL.createObjectURL(this.result.blob);
    this.objectUrls.push(url);
    window.open(url, '_blank');
  }

  startOver(): void {
    this.result = null;
    this.savedUri = undefined;
    this.workPercent = 0;
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Notices
  // ════════════════════════════════════════════════════════════════════

  noticeKey(notice: OverlayNotice): string {
    return `overlay.notice.${notice.kind}`;
  }

  noticeParams(notice: OverlayNotice): Record<string, unknown> {
    return {
      count: notice.count ?? 0,
      detail: notice.detail ?? '',
      pages: (notice.pageNumbers ?? []).slice(0, 12).join(', ')
    };
  }

  isWarningNotice(notice: OverlayNotice): boolean {
    return (
      notice.kind === 'uncovered-pages' ||
      notice.kind === 'annotations-dropped' ||
      notice.kind === 'empty-overlay-page'
    );
  }

  layerLetter(index: number): string {
    return String.fromCharCode(65 + (index % 26));
  }
}
