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
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { PdfCombineService } from '../../core/services/pdf-combine.service';
import { PdfMergePreflightService } from '../../core/services/pdf-merge-preflight.service';
import {
  COMBINE_MODES,
  CombineMode,
  CombineNotice,
  CombineOutput,
  CombineSource,
  InsertOptions,
  InterleaveDocOptions,
  MergeOptions,
  MergePlan,
  MergePreflightReport,
  MergeResolution,
  MergeStructureOptions,
  defaultInsertOptions,
  defaultMergeOptions,
  defaultMergeResolution,
  defaultMergeStructureOptions,
  isCombineMode
} from '../../core/models/pdf-combine.types';
import { LAYOUT_PAPER_ORDER } from '../../core/models/pdf-layout.types';
import { TabItem } from '../../shared/components/ui/tabs/tabs.component';
import {
  AppButtonComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  AppPageHeaderComponent,
  AppProgressComponent,
  AppRelatedToolsComponent,
  AppTabsComponent,
  AutoScrollDirective,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { MergeListComponent } from './components/merge-list/merge-list.component';
import { PreflightSheetComponent } from './components/preflight-sheet/preflight-sheet.component';

type Stage = 'EMPTY' | 'READY' | 'WORKING' | 'DONE';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Combine Studio — C1 to C5.
 *
 * Three modes over one file list: an advanced merge with per-file page
 * subsets, sorting and generated structure (C3, C4), an interleave for
 * front/back scans (C1), and an insert that puts a PDF, an image or blank
 * pages at an exact position (C2). The pre-merge checks (C5) run before the
 * merge writes anything.
 *
 * The organizer's merge is untouched and still the quick path; this is the
 * screen for the cases it does not cover. `PdfCombineService.planMerge` with
 * no subsets and no sort returns exactly the organizer's page order, which its
 * spec asserts, so the two agree on the simple case by construction.
 *
 * Mobile first: the file list is stacked cards with button reordering rather
 * than a drag-and-drop table, the mode tabs scroll sideways, and the export
 * action is a sticky bottom bar.
 */
@Component({
  selector: 'app-pdf-combine',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pdf-combine.page.html',
  styleUrls: ['./pdf-combine.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppIconComponent,
    AppTabsComponent,
    AppProgressComponent,
    AppRelatedToolsComponent,
    AutoScrollDirective,
    FileDropzoneComponent,
    MergeListComponent,
    PreflightSheetComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfCombinePage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private fileService = inject(FileService);
  private combine = inject(PdfCombineService);
  private preflight = inject(PdfMergePreflightService);
  private storage = inject(StorageService);
  private share = inject(ShareService);
  private history = inject(HistoryService);
  private toast = inject(ToastService);
  private translate = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  stage: Stage = 'EMPTY';
  mode: CombineMode = 'merge';

  sources: CombineSource[] = [];
  mergeOptions: MergeOptions = defaultMergeOptions();
  structure: MergeStructureOptions = defaultMergeStructureOptions();
  interleaveOptions: InterleaveDocOptions[] = [];
  insertOptions: InsertOptions = defaultInsertOptions();

  /** C2: the PDF or images being inserted. */
  insertPdf?: File;
  insertPdfPageCount = 0;
  insertImages: File[] = [];

  plan: MergePlan | null = null;

  preflightReport: MergePreflightReport | null = null;
  resolution: MergeResolution = defaultMergeResolution();
  preflightOpen = false;
  inspecting = false;

  working = false;
  workPercent = 0;
  errorMessage = '';

  result: CombineOutput | null = null;
  savedUri?: string;

  readonly blankSizes = ['neighbour', ...LAYOUT_PAPER_ORDER.filter(size =>
    ['A4', 'A5', 'Letter', 'Legal'].includes(size)
  )];

  /** Exposed for the blank-count input's `max`, so the two cannot disagree. */
  get combineMaxBlanks(): number {
    return this.combine.MAX_BLANK_INSERT;
  }

  private controller: AbortController | null = null;
  private langSub?: Subscription;
  private objectUrls: string[] = [];

  // ════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const routeMode = this.route.snapshot.data?.['mode'];
    if (typeof routeMode === 'string' && isCombineMode(routeMode)) {
      this.mode = routeMode;
    }
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
  // Tabs
  // ════════════════════════════════════════════════════════════════════

  get modeTabs(): TabItem[] {
    return COMBINE_MODES.map(mode => ({
      id: mode,
      label: this.translate.translate(this.modeLabelKey(mode))
    }));
  }

  modeLabelKey(mode: CombineMode): string {
    switch (mode) {
      case 'merge':
        return 'combine.modeMerge';
      case 'interleave':
        return 'combine.modeInterleave';
      case 'insert':
      default:
        return 'combine.modeInsert';
    }
  }

  onModeChange(id: string): void {
    if (!isCombineMode(id) || this.working) return;
    this.mode = id;
    this.result = null;
    this.savedUri = undefined;
    this.errorMessage = '';
    this.recomputePlan();
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Sources
  // ════════════════════════════════════════════════════════════════════

  async addFiles(): Promise<void> {
    const files = await this.fileService.pickMultiplePdfs();
    if (files.length > 0) await this.onFilesSelected(files);
  }

  async onFilesSelected(files: File[]): Promise<void> {
    const loaded: CombineSource[] = [];

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const pageCount = await this.readPageCount(buffer);
        if (pageCount === 0) {
          this.toast.warning(
            this.translate.translate('combine.errorEmptyFile', { name: file.name })
          );
          continue;
        }

        loaded.push({
          id: generateId(),
          name: file.name,
          pageCount,
          sizeBytes: file.size,
          lastModified: file.lastModified ?? 0,
          buffer
        });
      } catch {
        this.toast.error(this.translate.translate('combine.errorRead', { name: file.name }));
      }
    }

    if (loaded.length === 0) {
      this.cdr.markForCheck();
      return;
    }

    this.sources = [...this.sources, ...loaded];
    this.interleaveOptions = this.sources.map(
      (_, index) => this.interleaveOptions[index] ?? { reversed: false }
    );
    this.stage = 'READY';
    this.result = null;
    this.preflightReport = null;
    this.recomputePlan();
    this.cdr.markForCheck();
  }

  /** Page count without keeping a parsed document around. */
  private async readPageCount(buffer: ArrayBuffer): Promise<number> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    return doc.getPageCount();
  }

  moveSource(event: { index: number; delta: number }): void {
    const { index, delta } = event;
    const target = index + delta;
    if (index < 0 || index >= this.sources.length) return;
    if (target < 0 || target >= this.sources.length) return;

    const next = [...this.sources];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    this.sources = next;

    const flags = [...this.interleaveOptions];
    const [movedFlag] = flags.splice(index, 1);
    flags.splice(target, 0, movedFlag ?? { reversed: false });
    this.interleaveOptions = flags;

    this.recomputePlan();
    this.cdr.markForCheck();
  }

  removeSource(sourceId: string): void {
    const index = this.sources.findIndex(source => source.id === sourceId);
    if (index < 0) return;

    this.sources = this.sources.filter(source => source.id !== sourceId);
    this.interleaveOptions = this.interleaveOptions.filter((_, i) => i !== index);
    this.mergeOptions = {
      ...this.mergeOptions,
      rows: this.mergeOptions.rows.filter(row => row.sourceId !== sourceId)
    };

    if (this.sources.length === 0) {
      this.stage = 'EMPTY';
      this.plan = null;
    } else {
      this.recomputePlan();
    }

    this.preflightReport = null;
    this.result = null;
    this.cdr.markForCheck();
  }

  onMergeOptionsChange(options: MergeOptions): void {
    this.mergeOptions = options;
    this.result = null;
    this.recomputePlan();
    this.cdr.markForCheck();
  }

  toggleStructure(key: keyof MergeStructureOptions, value: boolean): void {
    this.structure = { ...this.structure, [key]: value } as MergeStructureOptions;
    this.result = null;
    this.cdr.markForCheck();
  }

  onCoverTitleChange(value: string): void {
    this.structure = { ...this.structure, coverTitle: value ?? '' };
    this.cdr.markForCheck();
  }

  private recomputePlan(): void {
    this.plan =
      this.sources.length > 0
        ? this.combine.planMerge(this.sources, this.mergeOptions)
        : null;
  }

  // ════════════════════════════════════════════════════════════════════
  // C1 — interleave
  // ════════════════════════════════════════════════════════════════════

  toggleReversed(index: number): void {
    const flags = [...this.interleaveOptions];
    flags[index] = { reversed: !(flags[index]?.reversed === true) };
    this.interleaveOptions = flags;
    this.result = null;
    this.cdr.markForCheck();
  }

  isReversed(index: number): boolean {
    return this.interleaveOptions[index]?.reversed === true;
  }

  /** The resulting order, as `A1, B3, A2…` labels for the preview row. */
  get interleavePreview(): string[] {
    const plan = this.combine.planInterleave(
      this.sources.map(source => source.pageCount),
      this.interleaveOptions
    );

    return plan.order.slice(0, 48).map(ref => {
      const letter = String.fromCharCode(65 + (ref.sourceIndex % 26));
      return `${letter}${ref.pageIndex + 1}`;
    });
  }

  get interleaveTotal(): number {
    return this.sources.reduce((sum, source) => sum + source.pageCount, 0);
  }

  get interleaveUneven(): boolean {
    const counts = this.sources.map(source => source.pageCount).filter(count => count > 0);
    return counts.length > 1 && new Set(counts).size > 1;
  }

  // ════════════════════════════════════════════════════════════════════
  // C2 — insert
  // ════════════════════════════════════════════════════════════════════

  /** The document being inserted into: the first in the list. */
  get baseSource(): CombineSource | undefined {
    return this.sources[0];
  }

  updateInsert(patch: Partial<InsertOptions>): void {
    this.insertOptions = { ...this.insertOptions, ...patch };
    this.result = null;
    this.cdr.markForCheck();
  }

  onAnchorChange(raw: unknown): void {
    const max = this.baseSource?.pageCount ?? 1;
    const parsed = Number(raw);
    const anchorPage = Number.isFinite(parsed)
      ? Math.min(Math.max(1, Math.round(parsed)), max)
      : 1;
    this.updateInsert({ anchorPage });
  }

  onBlankCountChange(raw: unknown): void {
    const parsed = Number(raw);
    const blankCount = Number.isFinite(parsed)
      ? Math.min(this.combine.MAX_BLANK_INSERT, Math.max(1, Math.round(parsed)))
      : 1;
    this.updateInsert({ blankCount });
  }

  async pickInsertPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      this.insertPdfPageCount = await this.readPageCount(buffer);
      this.insertPdf = file;
      this.insertImages = [];
      this.updateInsert({ kind: 'pdf' });
    } catch {
      this.toast.error(this.translate.translate('combine.errorRead', { name: file.name }));
    }
    this.cdr.markForCheck();
  }

  async pickInsertImages(): Promise<void> {
    const files = await this.fileService.pickMultipleImages();
    if (files.length === 0) return;
    this.insertImages = files;
    this.insertPdf = undefined;
    this.insertPdfPageCount = 0;
    this.updateInsert({ kind: 'image' });
    this.cdr.markForCheck();
  }

  /** How many pages the current insertion adds. */
  get insertCount(): number {
    switch (this.insertOptions.kind) {
      case 'pdf':
        return this.insertPdfPageCount;
      case 'image':
        return this.insertImages.length;
      case 'blank':
      default:
        return this.insertOptions.blankCount;
    }
  }

  get insertResultPageCount(): number {
    return (this.baseSource?.pageCount ?? 0) + this.insertCount;
  }

  // ════════════════════════════════════════════════════════════════════
  // Export
  // ════════════════════════════════════════════════════════════════════

  get blockedReasonKey(): string | null {
    if (this.sources.length === 0) return 'combine.blockedNoFiles';

    if (this.mode === 'merge') {
      if (!this.plan || this.plan.totalPageCount === 0) return 'combine.blockedNoPages';
      return null;
    }

    if (this.mode === 'interleave') {
      if (this.sources.length < 2) return 'combine.blockedNeedTwo';
      return null;
    }

    if (this.insertOptions.kind === 'pdf' && !this.insertPdf) return 'combine.blockedNoInsertPdf';
    if (this.insertOptions.kind === 'image' && this.insertImages.length === 0) {
      return 'combine.blockedNoInsertImage';
    }
    return null;
  }

  exportLabelKey(): string {
    switch (this.mode) {
      case 'merge':
        return 'combine.exportMerge';
      case 'interleave':
        return 'combine.exportInterleave';
      case 'insert':
      default:
        return 'combine.exportInsert';
    }
  }

  private outputName(): string {
    const stem = (this.sources[0]?.name ?? 'document').replace(/\.pdf$/i, '');
    const suffix: Record<CombineMode, string> = {
      merge: 'merged',
      interleave: 'mixed',
      insert: 'inserted'
    };
    return `${stem}_${suffix[this.mode]}.pdf`;
  }

  /**
   * The merge runs the pre-merge checks first.
   *
   * A clean report goes straight through without showing anything; a report
   * with collisions or signatures opens the sheet and waits, because the
   * answer changes what gets written.
   */
  async startExport(): Promise<void> {
    if (this.working || this.blockedReasonKey) return;

    if (this.mode !== 'merge') {
      await this.runExport();
      return;
    }

    this.inspecting = true;
    this.cdr.markForCheck();

    try {
      this.preflightReport = await this.preflight.inspect(this.sources);
    } catch {
      // A report that cannot be produced must not block a merge that would
      // otherwise work: the merge proceeds as if the document were clean.
      this.preflightReport = null;
    } finally {
      this.inspecting = false;
      this.cdr.markForCheck();
    }

    if (this.preflightReport && !this.preflightReport.clean) {
      this.preflightOpen = true;
      this.cdr.markForCheck();
      return;
    }

    await this.runExport();
  }

  onResolutionChange(resolution: MergeResolution): void {
    this.resolution = resolution;
    this.cdr.markForCheck();
  }

  async proceedFromPreflight(): Promise<void> {
    this.preflightOpen = false;
    this.cdr.markForCheck();
    await this.runExport();
  }

  closePreflight(): void {
    this.preflightOpen = false;
    this.cdr.markForCheck();
  }

  private async runExport(): Promise<void> {
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
      let output: CombineOutput;

      if (this.mode === 'merge') {
        const { sources, notices } = await this.resolveSources();
        output = await this.combine.exportMerged(
          sources,
          this.mergeOptions,
          name,
          this.structure,
          onProgress,
          signal
        );
        output.notices = [...notices, ...output.notices];
      } else if (this.mode === 'interleave') {
        output = await this.combine.exportInterleaved(
          this.sources,
          this.interleaveOptions,
          name,
          onProgress,
          signal
        );
      } else {
        const base = this.baseSource;
        if (!base) throw new Error(this.translate.translate('combine.blockedNoFiles'));

        const content = await this.insertContent();
        output = await this.combine.exportWithInsertion(
          base.buffer,
          this.insertOptions,
          name,
          content,
          onProgress,
          signal
        );
      }

      this.result = output;
      this.stage = 'DONE';
      this.workPercent = 100;
    } catch (error: unknown) {
      this.stage = 'READY';
      if (signal.aborted) {
        this.toast.info(this.translate.translate('combine.cancelled'));
      } else {
        this.errorMessage =
          error instanceof Error
            ? error.message
            : this.translate.translate('combine.errorExport');
        this.toast.error(this.errorMessage);
      }
    } finally {
      this.working = false;
      this.controller = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * Applies the chosen resolution to every source before the merge.
   *
   * A source with nothing to resolve comes back with its original buffer
   * untouched, so a clean merge is not re-serialising files for no reason.
   */
  private async resolveSources(): Promise<{
    sources: CombineSource[];
    notices: CombineNotice[];
  }> {
    const report = this.preflightReport;
    if (!report || report.clean) return { sources: this.sources, notices: [] };

    const resolved: CombineSource[] = [];
    const notices: CombineNotice[] = [];

    for (let index = 0; index < this.sources.length; index++) {
      const source = this.sources[index];
      const applied = await this.preflight.applyResolution(
        source,
        index,
        this.resolution,
        report.collisions,
        report.signatures
      );
      resolved.push({ ...source, buffer: applied.buffer });
      notices.push(...applied.notices);
    }

    return { sources: resolved, notices };
  }

  /** The bytes for an insertion, read only when one is actually needed. */
  private async insertContent(): Promise<
    { pdfBuffer?: ArrayBuffer; images?: Array<{ bytes: ArrayBuffer; type: 'png' | 'jpg' }> } | undefined
  > {
    if (this.insertOptions.kind === 'pdf' && this.insertPdf) {
      return { pdfBuffer: await this.insertPdf.arrayBuffer() };
    }

    if (this.insertOptions.kind === 'image' && this.insertImages.length > 0) {
      const images: Array<{ bytes: ArrayBuffer; type: 'png' | 'jpg' }> = [];
      for (const image of this.insertImages) {
        images.push({
          bytes: await image.arrayBuffer(),
          type: /\.png$/i.test(image.name) || image.type === 'image/png' ? 'png' : 'jpg'
        });
      }
      return { images };
    }

    return undefined;
  }

  cancelExport(): void {
    this.controller?.abort();
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Saving
  // ════════════════════════════════════════════════════════════════════

  async saveResult(): Promise<void> {
    if (!this.result) return;

    try {
      const uri = await this.storage.saveFile(this.result.file, 'pdf');
      if (!uri) return; // The quota gate has already said why.

      this.savedUri = uri;
      await this.history.addHistoryItem({
        operation: `pdf_combine_${this.mode}`,
        originalFileName: this.sources[0]?.name ?? this.result.name,
        outputFileName: this.result.name,
        originalSizeBytes: this.sources.reduce((sum, source) => sum + source.sizeBytes, 0),
        outputSizeBytes: this.result.sizeBytes,
        outputPath: uri
      });

      this.toast.success(this.translate.translate('combine.savedToast'));
      this.cdr.markForCheck();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : this.translate.translate('combine.errorSave')
      );
    }
  }

  async shareResult(): Promise<void> {
    if (!this.savedUri || this.savedUri === 'web-download') {
      await this.saveResult();
      return;
    }
    await this.share.shareFile(this.savedUri, this.translate.translate('combine.title'));
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
    this.stage = this.sources.length > 0 ? 'READY' : 'EMPTY';
    this.workPercent = 0;
    this.cdr.markForCheck();
  }

  // ════════════════════════════════════════════════════════════════════
  // Notices
  // ════════════════════════════════════════════════════════════════════

  noticeKey(notice: CombineNotice): string {
    return `combine.notice.${notice.kind}`;
  }

  noticeParams(notice: CombineNotice): Record<string, unknown> {
    return {
      count: notice.count ?? 0,
      detail: notice.detail ?? '',
      pages: (notice.pageNumbers ?? []).slice(0, 12).join(', ')
    };
  }

  isWarningNotice(notice: CombineNotice): boolean {
    return (
      notice.kind === 'invalid-subset' ||
      notice.kind === 'empty-subset' ||
      notice.kind === 'signatures-stripped' ||
      notice.kind === 'fields-flattened' ||
      notice.kind === 'annotations-dropped' ||
      notice.kind === 'title-characters-dropped'
    );
  }

  get totalInputSizeKb(): number {
    return Math.round(
      this.sources.reduce((sum, source) => sum + source.sizeBytes, 0) / 1024
    );
  }
}
