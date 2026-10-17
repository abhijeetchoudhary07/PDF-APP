import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import JSZip from 'jszip';

import { PdfPageManagerService } from '../../core/services/pdf-page-manager.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import {
  PdfSourceDocument,
  PdfPageItem,
  PdfExportResult,
  PdfWorkspaceMode,
  PdfSplitMode,
  PdfSplitConfig,
  PageArrangementMode,
  PageArrangementPreview
} from '../../core/models/pdf-organization.types';
import {
  BlankPageCandidate,
  BlankDetectionProgress,
  BlankDetectionReport
} from '../../core/models/blank-page.types';
import { BlankPageService } from '../../core/services/blank-page.service';
import {
  DuplicatePageItem,
  DuplicateGroup,
  DuplicateDetectionReport,
  DuplicateDetectionProgress
} from '../../core/models/duplicate-page.types';
import { DuplicatePageService } from '../../core/services/duplicate-page.service';
import {
  PageOrientationAngle,
  PageOrientationItem,
  OrientationDetectionReport,
  OrientationDetectionProgress
} from '../../core/models/page-orientation.types';
import { PageOrientationService } from '../../core/services/page-orientation.service';
import {
  PageFlipAxis,
  PageFlipPreview,
  PageFlipState
} from '../../core/models/page-flip.types';
import { PageFlipService } from '../../core/services/page-flip.service';
import {
  PageSizeGroup,
  SelectionHelperKind,
  SelectionHelperMatch
} from '../../core/models/page-selection.types';
import {
  DocumentTrayEntry,
  TrayPageBadge
} from '../../core/models/document-tray.types';
import {
  AdvancedSplitConfig,
  AdvancedSplitMode,
  OutlineReadResult,
  SplitPlan,
  SplitPlanProgress,
  ceilingToBytes,
  defaultAdvancedSplitConfig,
  isAdvancedSplitMode
} from '../../core/models/pdf-split.types';
import { PdfSplitPlannerService } from '../../core/services/pdf-split-planner.service';
import {
  SectionPlan,
  SectioningConfig,
  SectioningMode,
  SectioningProgress,
  defaultSectioningConfig
} from '../../core/models/pdf-sectioning.types';
import { PdfSectioningService } from '../../core/services/pdf-sectioning.service';
import { GutterResult, isSectioningMode } from '../../core/models/pdf-sectioning.types';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { PdfRangeParserUtil } from '../../core/utilities/pdf-range-parser.util';
import { TranslationService } from '../../core/services/translation.service';
import { ResultPreviewComponent, PreviewData } from '../../shared/components/result-preview/result-preview.component';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppProgressComponent,
  AppModalComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  PdfPageThumbnailComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { DocumentTrayComponent } from './components/document-tray/document-tray.component';
import {
  FlipAxisOption,
  PageFlipSheetComponent
} from './components/page-flip-sheet/page-flip-sheet.component';
import {
  SelectionHelperOption,
  SmartSelectSheetComponent
} from './components/smart-select-sheet/smart-select-sheet.component';
import { SplitModePanelComponent } from './components/split-mode-panel/split-mode-panel.component';
import {
  SplitModeOption,
  SplitModePickerComponent
} from './components/split-mode-picker/split-mode-picker.component';
import { SectionPanelComponent } from './components/section-panel/section-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-organizer',
  templateUrl: './pdf-organizer.page.html',
  styleUrls: ['./pdf-organizer.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    CommonModule,
    FormsModule,
    RouterModule,
    ResultPreviewComponent,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppTabsComponent,
    AppProgressComponent,
    AppModalComponent,
    FileDropzoneComponent,
    TranslatePipe,
    DocumentTrayComponent,
    PageFlipSheetComponent,
    SmartSelectSheetComponent,
    SplitModePanelComponent,
    SplitModePickerComponent,
    SectionPanelComponent
  ],
  providers: [DecimalPipe]
})
export class PdfOrganizerPage implements OnInit, OnDestroy {
  pageManager = inject(PdfPageManagerService);
  blankPageService = inject(BlankPageService);
  duplicatePageService = inject(DuplicatePageService);
  pageOrientationService = inject(PageOrientationService);
  pageFlipService = inject(PageFlipService);
  private splitPlanner = inject(PdfSplitPlannerService);
  private sectioningService = inject(PdfSectioningService);
  private documentBridge = inject(DocumentBridgeService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private i18n = inject(TranslationService);

  /**
   * Translation for strings built in TypeScript — toast copy, progress stages.
   * The template uses the translate pipe; this is its TS-side counterpart.
   */
  private t(key: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, params);
  }

  mode: PdfWorkspaceMode = 'organize';

  modeTabs = [
    { id: 'organize', label: 'Organize', icon: 'grid-outline' },
    { id: 'merge', label: 'Merge', icon: 'documents-outline' },
    { id: 'split', label: 'Split', icon: 'cut-outline' },
    { id: 'rotate', label: 'Rotate', icon: 'sync-outline' },
    { id: 'delete', label: 'Delete', icon: 'trash-outline' },
    { id: 'extract', label: 'Extract', icon: 'copy-outline' }
  ];

  /**
   * The nine split modes: the four that ship, then the five added in B1-B5.
   *
   * These were a horizontally scrolling pill strip. Nine pills on a phone is a
   * strip whose far end nobody finds, so they are a two-column grid of cards
   * instead -- every mode visible at once, each card above the 44px touch
   * floor, no sideways scroll. Picking a mode still goes through
   * `setSplitMode`, and the four shipped modes behave exactly as before.
   */
  readonly splitModes: SplitModeOption[] = [
    {
      id: 'every-n',
      icon: 'cut',
      labelKey: 'organizer.splitModeEveryN',
      hintKey: 'organizer.splitModeEveryNHint',
      advanced: false
    },
    {
      id: 'after-selected',
      icon: 'git-branch',
      labelKey: 'organizer.splitModeCutPoints',
      hintKey: 'organizer.splitModeCutPointsHint',
      advanced: false
    },
    {
      id: 'extract',
      icon: 'list-number',
      labelKey: 'organizer.splitModeRange',
      hintKey: 'organizer.splitModeRangeHint',
      advanced: false
    },
    {
      id: 'individual',
      icon: 'copy',
      labelKey: 'organizer.splitModeIndividual',
      hintKey: 'organizer.splitModeIndividualHint',
      advanced: false
    },
    {
      id: 'max-size',
      icon: 'speedometer',
      labelKey: 'organizer.splitModeMaxSize',
      hintKey: 'organizer.splitModeMaxSizeHint',
      advanced: true
    },
    {
      id: 'doc-count',
      icon: 'albums',
      labelKey: 'organizer.splitModeDocCount',
      hintKey: 'organizer.splitModeDocCountHint',
      advanced: true
    },
    {
      id: 'chapters',
      icon: 'bookmark',
      labelKey: 'organizer.splitModeChapters',
      hintKey: 'organizer.splitModeChaptersHint',
      advanced: true
    },
    {
      id: 'divider',
      icon: 'qr-code',
      labelKey: 'organizer.splitModeDivider',
      hintKey: 'organizer.splitModeDividerHint',
      advanced: true
    },
    {
      id: 'text-pattern',
      icon: 'text-search',
      labelKey: 'organizer.splitModeTextPattern',
      hintKey: 'organizer.splitModeTextPatternHint',
      advanced: true
    },
    {
      id: 'sections',
      icon: 'grid',
      labelKey: 'organizer.splitModeSections',
      hintKey: 'organizer.splitModeSectionsHint',
      advanced: true
    },
    {
      id: 'tiles',
      icon: 'albums',
      labelKey: 'organizer.splitModeTiles',
      hintKey: 'organizer.splitModeTilesHint',
      advanced: true
    }
  ];

  // Merge Mode state
  mergeFiles: File[] = [];
  mergeDocs: { id: string; file: File; pageCount: number; size: number }[] = [];
  draggedMergeIndex: number | null = null;

  // Split Mode state
  splitMode: PdfSplitMode = 'every-n';
  splitEveryN = 2;
  splitAfterPages: number[] = [];
  splitRangeString = '';
  rangeValidationError = '';
  splitChunksPreview: number[][] = [];
  splitExportResults: PdfExportResult[] = [];

  // --- B1-B5: advanced split state ---
  advancedSplitConfig: AdvancedSplitConfig = defaultAdvancedSplitConfig();
  advancedSplitPlan: SplitPlan | null = null;
  isAnalyzingSplit = false;
  splitPlanProgress: SplitPlanProgress | null = null;
  outlineResult: OutlineReadResult | null = null;
  private splitAnalyzeAbort: AbortController | null = null;

  /*
   * A plan is only safe to export while the thing it was computed from has not
   * moved. Both signatures are recorded when the plan is made and compared
   * before it is used: the config one catches a changed ceiling or pattern, the
   * page one catches a page being deleted, reordered or rotated underneath it.
   * Exporting a stale plan would write the right page numbers over the wrong
   * pages, which is the one failure mode here that produces a plausible-looking
   * wrong file.
   */
  private plannedConfigSignature = '';
  private plannedPageSignature = '';

  // --- B6/B7: sectioning and tiling state ---
  sectioningConfig: SectioningConfig = defaultSectioningConfig();
  sectionPlan: SectionPlan | null = null;
  isScanningGutters = false;
  gutterProgress: SectioningProgress | null = null;
  private gutterResults: Map<number, GutterResult> | null = null;
  private gutterScanAbort: AbortController | null = null;

  // Drag and Drop (Pages)
  draggedPageIndex: number | null = null;
  dragOverPageIndex: number | null = null;

  // Processing & Export State
  isProcessing = false;
  processingProgress = 0;
  processingStage = '';
  abortController: AbortController | null = null;
  lastExportResult?: PdfExportResult;

  // High-Res Zoom Modal State
  zoomModalOpen = false;
  zoomPage?: PdfPageItem;
  zoomImageUrl?: string;
  isZoomLoading = false;

  // One-Tap Arrangement Modes State
  arrangementModalOpen = false;
  selectedArrangementMode: PageArrangementMode = 'reverse';
  duplexBacksReversed = true;
  arrangementPreview?: PageArrangementPreview;

  arrangementModes = [
    {
      id: 'reverse' as PageArrangementMode,
      name: 'Reverse Order',
      shortName: 'Reverse',
      icon: 'swap-horizontal-outline',
      description: 'Last page first — inverts the entire document page sequence.'
    },
    {
      id: 'odd-even-split' as PageArrangementMode,
      name: 'Odd-Even Split',
      shortName: 'Odd-Even Split',
      icon: 'git-branch-outline',
      description: 'Gathers all odd pages first, followed by all even pages.'
    },
    {
      id: 'odd-even-merge' as PageArrangementMode,
      name: 'Odd-Even Merge',
      shortName: 'Odd-Even Merge',
      icon: 'git-merge-outline',
      description: 'Inverse of split — interleaves the first half with the second half.'
    },
    {
      id: 'duplex-sort' as PageArrangementMode,
      name: 'Duplex Sort',
      shortName: 'Duplex Sort',
      icon: 'documents-outline',
      description: 'Interleaves front scans with back scans into correct reading order.'
    },
    {
      id: 'custom-expression' as PageArrangementMode,
      name: 'Page-Order Expression',
      shortName: 'Expression',
      icon: 'list-number',
      description: 'Reorder using expressions: "1,3,2,4-6", "2n-1 + 2n" (odd/even), "reverse", etc.'
    }
  ];

  customPageOrderExpression = '2n-1 + 2n';
  customExpressionError = '';
  gridDensity: 'comfortable' | 'compact' = 'comfortable';

  // Blank Page Detection & Removal State
  blankModalOpen = false;
  isScanningBlanks = false;
  blankScanProgress: BlankDetectionProgress | null = null;
  blankReport: BlankDetectionReport | null = null;
  blankThreshold = 0.001;
  private blankScanAbortController: AbortController | null = null;

  // Duplicate Page Detection & Removal State
  duplicateModalOpen = false;
  isScanningDuplicates = false;
  duplicateScanProgress: DuplicateDetectionProgress | null = null;
  duplicateReport: DuplicateDetectionReport | null = null;
  duplicateHammingThreshold = 4;
  duplicateTab: 'all' | 'exact' | 'near' = 'all';
  private duplicateScanAbortController: AbortController | null = null;

  // Auto-Rotate Upright State
  autoRotateModalOpen = false;
  isScanningOrientation = false;
  orientationScanProgress: OrientationDetectionProgress | null = null;
  orientationReport: OrientationDetectionReport | null = null;
  orientationTab: 'toRotate' | 'manualReview' | 'alreadyUpright' = 'toRotate';
  orientationConfidenceThreshold = 0.70;
  private orientationScanAbortController: AbortController | null = null;

  // --- A6: Mirror / Flip State ---
  flipModalOpen = false;
  flipAxis: PageFlipAxis = 'horizontal';
  flipScope: 'selected' | 'all' = 'selected';
  flipPreview?: PageFlipPreview;
  isFlipPreviewLoading = false;

  readonly flipAxisOptions: FlipAxisOption[] = [
    {
      id: 'horizontal',
      icon: 'flip-horizontal',
      labelKey: 'organizer.flipHorizontalLabel',
      descKey: 'organizer.flipHorizontalDesc'
    },
    {
      id: 'vertical',
      icon: 'flip-vertical',
      labelKey: 'organizer.flipVerticalLabel',
      descKey: 'organizer.flipVerticalDesc'
    },
    {
      id: 'both',
      icon: 'flip-both',
      labelKey: 'organizer.flipBothLabel',
      descKey: 'organizer.flipBothDesc'
    }
  ];

  // --- A7: Selection Helper State ---
  smartSelectModalOpen = false;
  isPreparingSmartSelect = false;
  smartSelectStage = '';
  smartSelectMatches = new Map<SelectionHelperKind, SelectionHelperMatch>();
  sizeGroups: PageSizeGroup[] = [];
  selectedSizeGroupKey = '';
  duplicateSelectScope: 'redundant' | 'all' = 'redundant';

  readonly selectionHelpers: SelectionHelperOption[] = [
    {
      id: 'blank',
      icon: 'scan',
      labelKey: 'organizer.selectBlankLabel',
      descKey: 'organizer.selectBlankDesc',
      needsScan: true
    },
    {
      id: 'duplicates',
      icon: 'copy',
      labelKey: 'organizer.selectDuplicatesLabel',
      descKey: 'organizer.selectDuplicatesDesc',
      needsScan: true
    },
    {
      id: 'landscape',
      icon: 'tablet-landscape',
      labelKey: 'organizer.selectLandscapeLabel',
      descKey: 'organizer.selectLandscapeDesc',
      needsScan: false
    },
    {
      id: 'portrait',
      icon: 'tablet-portrait',
      labelKey: 'organizer.selectPortraitLabel',
      descKey: 'organizer.selectPortraitDesc',
      needsScan: false
    }
  ];

  // --- A8: Multi-Document Tray State ---
  trayExportResults: PdfExportResult[] = [];

  ngOnInit() {
    // Read route param or query param for mode
    this.route.paramMap.subscribe(params => {
      const routeMode = params.get('mode') as PdfWorkspaceMode;
      if (routeMode && this.isValidMode(routeMode)) {
        this.setMode(routeMode);
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const qMode = params.get('mode') as PdfWorkspaceMode;
      if (qMode && this.isValidMode(qMode)) {
        this.setMode(qMode);
      }
    });

    // Check URL path directly for sub-routes like /features/pdf/merge
    const currentUrl = this.router.url;
    if (currentUrl.includes('/pdf/merge')) this.mode = 'merge';
    else if (currentUrl.includes('/pdf/split')) this.mode = 'split';
    else if (currentUrl.includes('/pdf/rotate')) this.mode = 'rotate';
    else if (currentUrl.includes('/pdf/delete')) this.mode = 'delete';
    else if (currentUrl.includes('/pdf/extract')) this.mode = 'extract';
    else if (currentUrl.includes('/pdf/organize')) this.mode = 'organize';
  }

  ngOnDestroy() {
    this.cancelProcessing();
    if (this.duplicateScanAbortController) {
      this.duplicateScanAbortController.abort();
    }
    if (this.blankScanAbortController) {
      this.blankScanAbortController.abort();
    }
    if (this.orientationScanAbortController) {
      this.orientationScanAbortController.abort();
    }
    if (this.splitAnalyzeAbort) {
      this.splitAnalyzeAbort.abort();
    }
    if (this.gutterScanAbort) {
      this.gutterScanAbort.abort();
    }
    this.pageManager.clear();
  }

  private isValidMode(mode: string): mode is PdfWorkspaceMode {
    return ['organize', 'merge', 'split', 'rotate', 'delete', 'extract'].includes(mode);
  }

  setMode(newMode: PdfWorkspaceMode) {
    this.mode = newMode;
    this.lastExportResult = undefined;
    this.splitExportResults = [];
    if (newMode === 'split') {
      this.updateSplitPreview();
    } else {
      this.discardSplitPlan();
    }
  }

  // --- Document Upload & File Handling ---

  async selectPdfFile() {
    const file = await this.fileService.pickPdfFile();
    if (file) {
      await this.processSinglePdf(file);
    }
  }

  async selectMultiplePdfs() {
    const files = await this.fileService.pickMultiplePdfs();
    if (files && files.length > 0) {
      await this.processMultiplePdfs(files);
    }
  }

  async onFileDropped(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const dt = event.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const files = Array.from(dt.files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      if (files.length === 0) {
        this.showToast('Please upload PDF files.', 'warning');
        return;
      }
      if (this.mode === 'merge' || files.length > 1) {
        await this.processMultiplePdfs(files);
      } else {
        await this.processSinglePdf(files[0]);
      }
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async processSinglePdf(file: File, password?: string) {
    this.isProcessing = true;
    this.processingStage = 'Loading PDF document...';
    this.lastExportResult = undefined;
    this.splitExportResults = [];
    this.pageManager.clear();

    const res = await this.pageManager.loadDocument(file, password);
    this.isProcessing = false;

    if (res.needPassword) {
      await this.promptPassword(file);
      return;
    }

    if (!res.success) {
      this.showToast(res.error || 'Failed to load PDF.', 'danger');
      return;
    }

    this.showToast(`Loaded ${res.doc?.name} (${res.doc?.pageCount} pages)`, 'success');
    // A plan, an outline and a set of gutter readings all belong to the
    // document they were taken from.
    this.discardSplitPlan();
    this.outlineResult = null;
    this.gutterResults = null;
    this.updateSplitPreview();
    if (isAdvancedSplitMode(this.splitMode)) {
      this.onAdvancedModeSelected(this.advancedSplitMode);
    }
    this.recomputeSectionPlan();

    // Trigger lazy thumbnail rendering in background for first 20 pages
    this.renderThumbnailsForVisible();
  }

  private async promptPassword(file: File) {
    const alert = await this.alertCtrl.create({
      header: 'Password Protected PDF',
      message: `"${file.name}" is encrypted. Enter password to unlock:`,
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Enter password'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Unlock',
          handler: (data) => {
            if (data.password) {
              this.processSinglePdf(file, data.password);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async processMultiplePdfs(files: File[]) {
    this.isProcessing = true;
    this.processingStage = 'Reading selected PDFs...';
    this.lastExportResult = undefined;
    this.splitExportResults = [];

    const res = await this.pageManager.loadMultipleDocuments(files);
    this.isProcessing = false;

    if (res.docs.length > 0) {
      const newDocs = res.docs.map(d => ({
        id: d.id,
        file: d.file || new File([d.arrayBuffer], d.name, { type: 'application/pdf' }),
        pageCount: d.pageCount,
        size: d.sizeBytes
      }));
      this.mergeDocs = [...this.mergeDocs, ...newDocs];

      const totalP = this.pageManager.pages.length;
      this.showToast(`Loaded ${res.docs.length} PDF(s) (${totalP} pages total)`, 'success');
      /*
       * The same reset the single-file path does. Without it the chunk preview
       * keeps whatever it held before the load -- an empty array when the
       * screen opened with no document -- and the Export button reads zero
       * files for a canvas that plainly has pages on it.
       */
      this.discardSplitPlan();
      this.outlineResult = null;
      this.gutterResults = null;
      this.updateSplitPreview();
      if (isAdvancedSplitMode(this.splitMode)) {
        this.onAdvancedModeSelected(this.advancedSplitMode);
      }
      this.recomputeSectionPlan();
      this.renderThumbnailsForVisible();
    }

    if (res.errors.length > 0) {
      this.showToast(`Errors loading some files:\n${res.errors.join(', ')}`, 'warning');
    }
  }

  // --- Thumbnail Rendering ---

  private async renderThumbnailsForVisible() {
    const pagesToRender = this.pageManager.pages.slice(0, 30);
    this.pageManager.renderThumbnailsLazy(pagesToRender);
  }

  onThumbnailIntersect(page: PdfPageItem) {
    if (!page.thumbnailUrl && !page.thumbnailLoading && !page.thumbnailError) {
      this.pageManager.renderThumbnail(page).catch(() => {});
    }
  }

  // --- Page Operations (Accessible Mobile + Desktop) ---

  movePageLeft(index: number) {
    if (index > 0) {
      this.pageManager.reorderPage(index, index - 1);
    }
  }

  movePageRight(index: number) {
    if (index < this.pageManager.pages.length - 1) {
      this.pageManager.reorderPage(index, index + 1);
    }
  }

  async promptMoveToPosition(page: PdfPageItem) {
    const total = this.pageManager.pages.length;
    const alert = await this.alertCtrl.create({
      header: 'Move Page',
      message: `Move Page ${page.displayNumber} to position (1 - ${total}):`,
      inputs: [
        {
          name: 'target',
          type: 'number',
          min: 1,
          max: total,
          value: page.displayNumber
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Move',
          handler: (data) => {
            const target = Number(data.target);
            if (target >= 1 && target <= total && target !== page.displayNumber) {
              this.pageManager.movePageToPosition(page.id, target);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  rotatePage(page: PdfPageItem, delta: number) {
    this.pageManager.rotatePages([page.id], delta);
  }

  duplicatePage(page: PdfPageItem) {
    this.pageManager.duplicatePages([page.id]);
    this.showToast(`Duplicated Page ${page.displayNumber}`, 'success');
  }

  deletePage(page: PdfPageItem) {
    if (this.pageManager.pages.length <= 1) {
      this.showToast('Cannot delete the last remaining page.', 'warning');
      return;
    }
    this.pageManager.deletePages([page.id]);
    this.showToast(`Deleted Page ${page.displayNumber}`, 'medium');
  }

  // --- One-Tap Page Arrangement Actions ---

  openArrangementModal(mode: PageArrangementMode = 'reverse') {
    if (this.pageManager.pages.length <= 1) {
      this.showToast('Load a document with at least 2 pages to rearrange.', 'warning');
      return;
    }
    this.selectedArrangementMode = mode;
    this.updateArrangementPreview();
    this.arrangementModalOpen = true;
  }

  closeArrangementModal() {
    this.arrangementModalOpen = false;
  }

  selectArrangementMode(mode: PageArrangementMode) {
    this.selectedArrangementMode = mode;
    this.updateArrangementPreview();
  }

  toggleDuplexBacks() {
    this.duplexBacksReversed = !this.duplexBacksReversed;
    this.updateArrangementPreview();
  }

  updateArrangementPreview() {
    if (this.pageManager.pages.length <= 1) {
      this.arrangementPreview = undefined;
      return;
    }

    if (this.selectedArrangementMode === 'custom-expression') {
      const res = this.pageManager.previewPageOrderExpression(this.customPageOrderExpression);
      if (res.valid) {
        this.customExpressionError = '';
        this.arrangementPreview = {
          mode: 'custom-expression',
          pageCount: this.pageManager.pages.length,
          permutation: res.pageOrder.map(p => p - 1),
          previousOrder: this.pageManager.pages.map(p => p.displayNumber),
          newOrder: res.pageOrder
        };
      } else {
        this.customExpressionError = res.error || 'Invalid expression';
        this.arrangementPreview = undefined;
      }
      return;
    }

    this.customExpressionError = '';
    this.arrangementPreview = this.pageManager.previewArrangement(
      this.selectedArrangementMode,
      { backsReversed: this.duplexBacksReversed }
    );
  }

  toggleGridDensity() {
    this.gridDensity = this.gridDensity === 'comfortable' ? 'compact' : 'comfortable';
  }

  onExpressionInputChanged() {
    this.updateArrangementPreview();
  }

  setExpressionPreset(expr: string) {
    this.customPageOrderExpression = expr;
    this.updateArrangementPreview();
  }

  insertExpressionToken(token: string) {
    if (!this.customPageOrderExpression.trim() || this.customPageOrderExpression === '2n-1 + 2n') {
      if (token === '+' || token === ',') {
        this.customPageOrderExpression = (this.customPageOrderExpression || '') + ' ' + token + ' ';
      } else {
        this.customPageOrderExpression = token;
      }
    } else {
      if (token === '+' || token === ',') {
        this.customPageOrderExpression += ' ' + token + ' ';
      } else {
        const trimmed = this.customPageOrderExpression.trim();
        const needsComma = !trimmed.endsWith(',') && !trimmed.endsWith('+');
        this.customPageOrderExpression = trimmed + (needsComma ? ', ' : ' ') + token;
      }
    }
    this.updateArrangementPreview();
  }

  clearExpression() {
    this.customPageOrderExpression = '';
    this.updateArrangementPreview();
  }

  applyCurrentArrangement() {
    if (this.selectedArrangementMode === 'custom-expression') {
      const res = this.pageManager.applyPageOrderExpression(this.customPageOrderExpression);
      if (res.valid) {
        this.showToast('Applied page-order expression. (Undo available)', 'success');
        this.closeArrangementModal();
        this.renderThumbnailsForVisible();
      } else {
        this.showToast(res.error || 'Invalid expression', 'warning');
      }
      return;
    }

    const success = this.pageManager.applyArrangement(
      this.selectedArrangementMode,
      { backsReversed: this.duplexBacksReversed }
    );

    if (success) {
      const modeInfo = this.arrangementModes.find(m => m.id === this.selectedArrangementMode);
      this.showToast(`Applied ${modeInfo?.name || 'arrangement'} (Undo available)`, 'success');
      this.closeArrangementModal();
      this.renderThumbnailsForVisible();
    } else {
      this.showToast('Could not arrange pages.', 'warning');
    }
  }

  // --- Blank Page Detection & Removal Actions ---

  async openBlankDetectionModal() {
    if (this.pageManager.pages.length === 0) {
      this.showToast('Load a document first to detect blank pages.', 'warning');
      return;
    }
    this.blankModalOpen = true;
    this.startBlankScan();
  }

  closeBlankDetectionModal() {
    if (this.isScanningBlanks && this.blankScanAbortController) {
      this.blankScanAbortController.abort();
    }
    this.blankModalOpen = false;
    this.isScanningBlanks = false;
  }

  async startBlankScan() {
    if (this.pageManager.pages.length === 0) return;
    this.isScanningBlanks = true;
    this.blankScanAbortController = new AbortController();
    this.blankScanProgress = {
      currentPage: 0,
      totalPages: this.pageManager.pages.length,
      percent: 0,
      foundBlankCount: 0,
      stage: 'Starting scan...'
    };

    try {
      this.blankReport = await this.blankPageService.analyzePages(
        this.pageManager.pages,
        this.pageManager.getSourceDocsMap(),
        {
          threshold: this.blankThreshold,
          signal: this.blankScanAbortController.signal,
          onProgress: p => {
            this.blankScanProgress = p;
          }
        }
      );
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) {
        this.showToast('Blank page scan cancelled.', 'medium');
      } else {
        this.showToast(`Scan failed: ${e.message}`, 'danger');
      }
    } finally {
      this.isScanningBlanks = false;
      this.blankScanAbortController = null;
    }
  }

  cancelBlankScan() {
    if (this.blankScanAbortController) {
      this.blankScanAbortController.abort();
    }
  }

  onBlankThresholdChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newThreshold = parseFloat(input.value);
    if (!isNaN(newThreshold) && this.blankReport) {
      this.blankThreshold = newThreshold;
      this.blankReport = this.blankPageService.recomputeReport(
        this.blankReport.candidates,
        this.blankThreshold
      );
    }
  }

  setBlankPreset(threshold: number) {
    if (!this.blankReport) return;
    this.blankThreshold = threshold;
    this.blankReport = this.blankPageService.recomputeReport(
      this.blankReport.candidates,
      this.blankThreshold
    );
  }

  toggleBlankCandidate(candidate: BlankPageCandidate) {
    candidate.selectedForRemoval = !candidate.selectedForRemoval;
    if (this.blankReport) {
      this.blankReport.selectedCandidates = this.blankReport.blankCandidates.filter(
        c => c.selectedForRemoval
      );
    }
  }

  selectAllBlanks(selected: boolean) {
    if (!this.blankReport) return;
    this.blankReport.blankCandidates.forEach(c => {
      c.selectedForRemoval = selected;
    });
    this.blankReport.selectedCandidates = this.blankReport.blankCandidates.filter(
      c => c.selectedForRemoval
    );
  }

  get selectedBlankCount(): number {
    return this.blankReport?.selectedCandidates.length ?? 0;
  }

  async removeSelectedBlanks() {
    if (!this.blankReport || this.selectedBlankCount === 0) return;
    const toRemove = this.blankReport.selectedCandidates;
    if (toRemove.length >= this.pageManager.pages.length) {
      this.showToast('Cannot remove all pages. At least one page must remain.', 'warning');
      return;
    }
    const pageIds = toRemove.map(c => c.pageId);
    const pagesToExport = toRemove.map(c => this.pageManager.pages[c.pageIndex]);

    this.isProcessing = true;
    this.processingStage = 'Generating review PDF of removed pages...';

    try {
      const docName = this.pageManager.sourceDocs[0]?.name || 'document.pdf';
      const reviewResult = await this.blankPageService.createReviewPdf(
        pagesToExport,
        this.pageManager.getSourceDocsMap(),
        docName
      );

      const uri = await this.storageService.saveFile(reviewResult.reviewPdfFile, 'document');
      this.pageManager.removeBlankPages(pageIds, reviewResult.reviewPdfFile.name);

      const uriNote = uri && uri !== 'web-download' ? ` Review PDF saved to ${uri}.` : ' Review PDF downloaded.';
      this.showToast(`Removed ${toRemove.length} blank page(s).${uriNote} (Undo available)`, 'success');

      this.closeBlankDetectionModal();
      this.renderThumbnailsForVisible();
    } catch (e: any) {
      this.showToast(`Failed to remove blank pages: ${e.message}`, 'danger');
    } finally {
      this.isProcessing = false;
    }
  }

  // --- Duplicate Page Detection & Removal Actions ---

  async openDuplicateModal() {
    if (this.pageManager.pages.length === 0) {
      this.showToast('Load a document first to find duplicate pages.', 'warning');
      return;
    }
    this.duplicateModalOpen = true;
    this.startDuplicateScan();
  }

  closeDuplicateModal() {
    if (this.isScanningDuplicates && this.duplicateScanAbortController) {
      this.duplicateScanAbortController.abort();
    }
    this.duplicateModalOpen = false;
    this.isScanningDuplicates = false;
  }

  async startDuplicateScan() {
    if (this.pageManager.pages.length === 0) return;
    this.isScanningDuplicates = true;
    this.duplicateScanAbortController = new AbortController();
    this.duplicateScanProgress = {
      currentPage: 0,
      totalPages: this.pageManager.pages.length,
      percent: 0,
      exactGroupCount: 0,
      nearGroupCount: 0,
      stage: 'Starting duplicate analysis...'
    };

    try {
      this.duplicateReport = await this.duplicatePageService.analyzePages(
        this.pageManager.pages,
        this.pageManager.getSourceDocsMap(),
        {
          hammingThreshold: this.duplicateHammingThreshold,
          signal: this.duplicateScanAbortController.signal,
          onProgress: p => {
            this.duplicateScanProgress = p;
          }
        }
      );
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) {
        this.showToast('Duplicate page scan cancelled.', 'medium');
      } else {
        this.showToast(`Duplicate scan failed: ${e.message}`, 'danger');
      }
    } finally {
      this.isScanningDuplicates = false;
      this.duplicateScanAbortController = null;
    }
  }

  cancelDuplicateScan() {
    if (this.duplicateScanAbortController) {
      this.duplicateScanAbortController.abort();
    }
  }

  onHammingThresholdChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newThreshold = parseInt(input.value, 10);
    if (!isNaN(newThreshold) && this.duplicateReport) {
      this.duplicateHammingThreshold = newThreshold;
      this.duplicateReport = this.duplicatePageService.recomputeReport(
        this.duplicateReport.fingerprints,
        this.duplicateHammingThreshold
      );
    }
  }

  setHammingPreset(threshold: number) {
    if (!this.duplicateReport) return;
    this.duplicateHammingThreshold = threshold;
    this.duplicateReport = this.duplicatePageService.recomputeReport(
      this.duplicateReport.fingerprints,
      this.duplicateHammingThreshold
    );
  }

  keepFirstInAllDuplicateGroups() {
    if (!this.duplicateReport) return;
    for (const group of [...this.duplicateReport.exactGroups, ...this.duplicateReport.nearGroups]) {
      this.setGroupKeepFirst(group);
    }
  }

  keepAllInDuplicateGroups() {
    if (!this.duplicateReport) return;
    for (const group of [...this.duplicateReport.exactGroups, ...this.duplicateReport.nearGroups]) {
      this.setGroupKeepAll(group);
    }
  }

  setDuplicateTab(tab: 'all' | 'exact' | 'near') {
    this.duplicateTab = tab;
  }

  toggleKeepDuplicate(item: DuplicatePageItem) {
    item.keep = !item.keep;
  }

  setGroupKeepFirst(group: DuplicateGroup) {
    group.pages.forEach((p, idx) => {
      p.keep = idx === 0;
    });
  }

  setGroupKeepAll(group: DuplicateGroup) {
    group.pages.forEach(p => {
      p.keep = true;
    });
  }

  get visibleDuplicateGroups(): DuplicateGroup[] {
    if (!this.duplicateReport) return [];
    if (this.duplicateTab === 'exact') return this.duplicateReport.exactGroups;
    if (this.duplicateTab === 'near') return this.duplicateReport.nearGroups;
    return [...this.duplicateReport.exactGroups, ...this.duplicateReport.nearGroups];
  }

  get duplicatePagesToRemoveCount(): number {
    if (!this.duplicateReport) return 0;
    const toRemoveSet = new Set<string>();
    for (const group of [...this.duplicateReport.exactGroups, ...this.duplicateReport.nearGroups]) {
      for (const page of group.pages) {
        if (!page.keep) {
          toRemoveSet.add(page.pageId);
        }
      }
    }
    return toRemoveSet.size;
  }

  removeSelectedDuplicates() {
    if (!this.duplicateReport) return;
    const toRemoveSet = new Set<string>();
    for (const group of [...this.duplicateReport.exactGroups, ...this.duplicateReport.nearGroups]) {
      for (const page of group.pages) {
        if (!page.keep) {
          toRemoveSet.add(page.pageId);
        }
      }
    }

    const pageIds = Array.from(toRemoveSet);
    if (pageIds.length === 0) return;

    if (pageIds.length >= this.pageManager.pages.length) {
      this.showToast('Cannot remove all pages. At least one page must remain.', 'warning');
      return;
    }

    this.pageManager.deletePages(pageIds);
    this.showToast(`Removed ${pageIds.length} duplicate page(s). (Undo available)`, 'success');
    this.closeDuplicateModal();
    this.renderThumbnailsForVisible();
  }

  // --- Auto-Rotate Upright Actions ---

  async openAutoRotateModal() {
    if (this.pageManager.pages.length === 0) {
      this.showToast('Load a document first to detect page orientation.', 'warning');
      return;
    }
    this.autoRotateModalOpen = true;
    this.startAutoRotateScan();
  }

  closeAutoRotateModal() {
    if (this.isScanningOrientation && this.orientationScanAbortController) {
      this.orientationScanAbortController.abort();
    }
    this.autoRotateModalOpen = false;
    this.isScanningOrientation = false;
  }

  async startAutoRotateScan() {
    if (this.pageManager.pages.length === 0) return;
    this.isScanningOrientation = true;
    this.orientationScanAbortController = new AbortController();
    this.orientationScanProgress = {
      currentPage: 0,
      totalPages: this.pageManager.pages.length,
      percent: 0,
      stage: 'Detecting page orientation...',
      rotatedCandidatesCount: 0,
      manualReviewCount: 0
    };

    try {
      this.orientationReport = await this.pageOrientationService.analyzePages(
        this.pageManager.pages,
        this.pageManager.getSourceDocsMap(),
        {
          confidenceThreshold: this.orientationConfidenceThreshold,
          signal: this.orientationScanAbortController.signal,
          onProgress: p => {
            this.orientationScanProgress = p;
          }
        }
      );
      if (this.orientationReport.toRotate.length > 0) {
        this.orientationTab = 'toRotate';
      } else if (this.orientationReport.manualReview.length > 0) {
        this.orientationTab = 'manualReview';
      } else {
        this.orientationTab = 'alreadyUpright';
      }
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) {
        this.showToast('Orientation detection cancelled.', 'medium');
      } else {
        this.showToast(`Orientation scan failed: ${e.message}`, 'danger');
      }
    } finally {
      this.isScanningOrientation = false;
      this.orientationScanAbortController = null;
    }
  }

  cancelAutoRotateScan() {
    if (this.orientationScanAbortController) {
      this.orientationScanAbortController.abort();
    }
  }

  setOrientationTab(tab: 'toRotate' | 'manualReview' | 'alreadyUpright') {
    this.orientationTab = tab;
  }

  toggleSelectOrientationItem(item: PageOrientationItem) {
    item.selectedForRotation = !item.selectedForRotation;
  }

  selectAllToRotate(select: boolean) {
    if (!this.orientationReport) return;
    this.orientationReport.toRotate.forEach(item => {
      item.selectedForRotation = select;
    });
  }

  rotateManualItem(item: PageOrientationItem, delta: number) {
    this.pageManager.rotatePages([item.pageId], delta);
    item.suggestedRotation = (((item.suggestedRotation - delta) % 360 + 360) % 360) as PageOrientationAngle;
    item.alreadyUpright = item.suggestedRotation === 0;
    this.showToast(`Rotated Page ${item.displayNumber} by ${delta}°`, 'success');
    this.renderThumbnailsForVisible();
  }

  get selectedAutoRotateCount(): number {
    return this.orientationReport?.toRotate.filter(p => p.selectedForRotation).length ?? 0;
  }

  applyAutoRotation() {
    if (!this.orientationReport) return;
    const selected = this.orientationReport.toRotate.filter(p => p.selectedForRotation);
    if (selected.length === 0) return;

    const rotations = selected.map(p => ({
      pageId: p.pageId,
      degreesDelta: p.suggestedRotation
    }));

    this.pageManager.rotatePagesIndividually(rotations, `Auto-rotated ${selected.length} page(s) upright`);
    this.showToast(`Auto-rotated ${selected.length} page(s) upright. (Undo available)`, 'success');
    this.closeAutoRotateModal();
    this.renderThumbnailsForVisible();
  }

  // --- A6: Mirror / Flip Actions ---

  get flipTargetPages(): PdfPageItem[] {
    if (this.flipScope === 'all') {
      return this.pageManager.pages;
    }
    return this.pageManager.getSelectedPages();
  }

  get flipTargetCount(): number {
    return this.flipTargetPages.length;
  }

  get flippedPageCount(): number {
    return this.pageManager.getFlippedPages().length;
  }

  /** The page the preview shows: the first page the flip would affect. */
  get flipPreviewPage(): PdfPageItem | undefined {
    return this.flipTargetPages[0];
  }

  async openFlipModal() {
    if (this.pageManager.pages.length === 0) {
      this.showToast(this.t('organizer.flipNoDocument'), 'warning');
      return;
    }
    // Default to the selection when there is one, the whole document otherwise.
    this.flipScope = this.pageManager.selectedCount > 0 ? 'selected' : 'all';
    this.flipModalOpen = true;
    await this.updateFlipPreview();
  }

  closeFlipModal() {
    this.flipModalOpen = false;
    this.flipPreview = undefined;
    this.isFlipPreviewLoading = false;
  }

  async setFlipAxis(axis: PageFlipAxis) {
    this.flipAxis = axis;
    await this.updateFlipPreview();
  }

  async setFlipScope(scope: 'selected' | 'all') {
    this.flipScope = scope;
    await this.updateFlipPreview();
  }

  /**
   * Renders what the flip would do to the first affected page.
   *
   * The preview composes the requested axis onto whatever flip that page
   * already carries, so re-applying an axis is previewed as the revert it is.
   */
  async updateFlipPreview() {
    const page = this.flipPreviewPage;
    if (!page) {
      this.flipPreview = undefined;
      return;
    }

    this.isFlipPreviewLoading = true;
    try {
      const resultState: PageFlipState = this.pageFlipService.composeState(
        this.pageFlipService.stateOf(page),
        this.flipAxis
      );
      this.flipPreview = await this.pageFlipService.renderFlipPreview(
        page,
        this.pageManager.getSourceDocsMap(),
        resultState
      );
    } catch {
      this.flipPreview = undefined;
    } finally {
      this.isFlipPreviewLoading = false;
    }
  }

  applyFlip() {
    const targets = this.flipTargetPages;
    if (targets.length === 0) {
      this.showToast(this.t('organizer.flipNoSelection'), 'warning');
      return;
    }

    const report = this.pageManager.flipPages(
      targets.map(p => p.id),
      this.flipAxis
    );

    if (!report) {
      this.showToast(this.t('organizer.flipFailed'), 'warning');
      return;
    }

    /*
     * Report both halves. Flipping is a toggle, so a second pass over pages
     * that were already flipped un-flips them, and saying only "flipped N
     * pages" would be wrong.
     */
    const parts: string[] = [];
    if (report.flippedDisplayNumbers.length > 0) {
      parts.push(
        this.t('organizer.flipAppliedCount', { count: report.flippedDisplayNumbers.length })
      );
    }
    if (report.revertedDisplayNumbers.length > 0) {
      parts.push(
        this.t('organizer.flipRevertedCount', { count: report.revertedDisplayNumbers.length })
      );
    }

    this.showToast(`${parts.join(' ')} ${this.t('organizer.undoAvailable')}`.trim(), 'success');
    this.closeFlipModal();
  }

  clearAllFlips() {
    const flipped = this.pageManager.getFlippedPages();
    if (flipped.length === 0) return;

    this.pageManager.clearFlips(flipped.map(p => p.id));
    this.showToast(
      `${this.t('organizer.flipClearedCount', { count: flipped.length })} ${this.t('organizer.undoAvailable')}`,
      'medium'
    );
    this.closeFlipModal();
  }

  /**
   * The CSS transform for a thumbnail, combining rotation and flip.
   *
   * CSS applies the rightmost function first, so this mirrors and then
   * rotates — the same order the exported page composes them in.
   */
  pageThumbnailTransform(page: PdfPageItem): string {
    const parts = [`rotate(${page.rotation}deg)`];
    if (page.flipHorizontal) parts.push('scaleX(-1)');
    if (page.flipVertical) parts.push('scaleY(-1)');
    return parts.join(' ');
  }

  /** A short badge for the flip a page carries, or an empty string. */
  pageFlipBadge(page: PdfPageItem): string {
    if (page.flipHorizontal && page.flipVertical) return this.t('organizer.flipBadgeBoth');
    if (page.flipHorizontal) return this.t('organizer.flipBadgeHorizontal');
    if (page.flipVertical) return this.t('organizer.flipBadgeVertical');
    return '';
  }

  // --- A7: Selection Helper Actions ---

  async openSmartSelectModal() {
    if (this.pageManager.pages.length === 0) {
      this.showToast(this.t('organizer.smartSelectNoDocument'), 'warning');
      return;
    }
    this.smartSelectModalOpen = true;
    this.sizeGroups = this.pageManager.getPageSizeGroups();
    if (!this.sizeGroups.some(g => g.key === this.selectedSizeGroupKey)) {
      this.selectedSizeGroupKey = this.sizeGroups[0]?.key ?? '';
    }
    this.refreshSmartSelectCounts();
  }

  closeSmartSelectModal() {
    this.smartSelectModalOpen = false;
    this.isPreparingSmartSelect = false;
    this.smartSelectStage = '';
  }

  /**
   * Recomputes every helper's match count against the current document,
   * WITHOUT changing the selection. Blank and duplicate counts stay unknown
   * until their scan has run, which the card says rather than showing a zero.
   */
  refreshSmartSelectCounts() {
    this.smartSelectMatches = new Map();
    for (const helper of this.selectionHelpers) {
      this.smartSelectMatches.set(
        helper.id,
        this.pageManager.previewSelectionHelper(helper.id, {
          blankReport: this.blankReport,
          duplicateReport: this.duplicateReport,
          options: { duplicateScope: this.duplicateSelectScope }
        })
      );
    }
    this.smartSelectMatches.set(
      'size',
      this.pageManager.previewSelectionHelper('size', {
        options: { sizeGroupKey: this.selectedSizeGroupKey }
      })
    );
  }

  matchFor(kind: SelectionHelperKind): SelectionHelperMatch | undefined {
    return this.smartSelectMatches.get(kind);
  }

  /** Progress of whichever scan a helper is currently waiting on. */
  get smartSelectScanPercent(): number {
    return this.blankScanProgress?.percent ?? this.duplicateScanProgress?.percent ?? 0;
  }

  setDuplicateSelectScope(scope: 'redundant' | 'all') {
    this.duplicateSelectScope = scope;
    this.refreshSmartSelectCounts();
  }

  setSelectedSizeGroup(key: string) {
    this.selectedSizeGroupKey = key;
    this.refreshSmartSelectCounts();
  }

  /**
   * Runs the blank or duplicate scan a helper depends on, reusing a scan that
   * has already run in this session rather than paying for it twice.
   */
  async prepareSmartSelect(kind: SelectionHelperKind) {
    if (kind !== 'blank' && kind !== 'duplicates') return;
    if (kind === 'blank' && this.blankReport) return;
    if (kind === 'duplicates' && this.duplicateReport) return;

    this.isPreparingSmartSelect = true;
    this.smartSelectStage =
      kind === 'blank'
        ? this.t('organizer.smartSelectScanningBlanks')
        : this.t('organizer.smartSelectScanningDuplicates');

    try {
      if (kind === 'blank') {
        this.blankScanAbortController = new AbortController();
        this.blankReport = await this.blankPageService.analyzePages(
          this.pageManager.pages,
          this.pageManager.getSourceDocsMap(),
          {
            threshold: this.blankThreshold,
            signal: this.blankScanAbortController.signal,
            onProgress: p => {
              this.blankScanProgress = p;
              this.smartSelectStage = p.stage;
            }
          }
        );
      } else {
        this.duplicateScanAbortController = new AbortController();
        this.duplicateReport = await this.duplicatePageService.analyzePages(
          this.pageManager.pages,
          this.pageManager.getSourceDocsMap(),
          {
            hammingThreshold: this.duplicateHammingThreshold,
            signal: this.duplicateScanAbortController.signal,
            onProgress: p => {
              this.duplicateScanProgress = p;
              this.smartSelectStage = p.stage;
            }
          }
        );
      }
      this.refreshSmartSelectCounts();
    } catch (e: any) {
      this.showToast(
        this.t('organizer.smartSelectScanFailed', { error: e?.message || '' }),
        'danger'
      );
    } finally {
      this.isPreparingSmartSelect = false;
      this.smartSelectStage = '';
      this.blankScanAbortController = null;
      this.duplicateScanAbortController = null;
    }
  }

  cancelSmartSelectScan() {
    this.blankScanAbortController?.abort();
    this.duplicateScanAbortController?.abort();
  }

  /**
   * Applies a helper. A helper whose scan has not run yet runs it first, so
   * the person taps once rather than being told to go and scan.
   */
  async applySmartSelect(kind: SelectionHelperKind, additive = false) {
    await this.prepareSmartSelect(kind);

    const context = {
      blankReport: this.blankReport,
      duplicateReport: this.duplicateReport,
      options: {
        duplicateScope: this.duplicateSelectScope,
        sizeGroupKey: this.selectedSizeGroupKey
      }
    };

    const match = additive
      ? this.pageManager.addSelectionHelperToSelection(kind, context)
      : this.pageManager.applySelectionHelper(kind, context);

    if (match.unavailableReason) {
      this.showToast(match.unavailableReason, 'warning');
      return;
    }

    if (match.matchedCount === 0) {
      this.showToast(this.t('organizer.smartSelectNoMatches'), 'medium');
      this.refreshSmartSelectCounts();
      return;
    }

    this.showToast(
      this.t('organizer.smartSelectApplied', { count: match.matchedCount }),
      'success'
    );
    this.refreshSmartSelectCounts();
    this.closeSmartSelectModal();

    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  /** A dimensions-first label for a size group: never a form or board name. */
  sizeGroupLabel(group: PageSizeGroup): string {
    return `${group.widthPt} × ${group.heightPt} pt`;
  }

  sizeGroupSubLabel(group: PageSizeGroup): string {
    const mm = `${group.widthMm} × ${group.heightMm} mm`;
    return group.standardName ? `${mm} · ${group.standardName}` : mm;
  }

  // --- A8: Multi-Document Tray Actions ---

  get documentTray(): DocumentTrayEntry[] {
    return this.pageManager.getDocumentTray();
  }

  get isMultiDocument(): boolean {
    return this.pageManager.isMultiDocument;
  }

  pageSourceBadge(page: PdfPageItem): TrayPageBadge | undefined {
    return this.pageManager.getPageBadge(page);
  }

  selectTrayDocument(entry: DocumentTrayEntry) {
    if (entry.emptied) {
      this.showToast(this.t('organizer.trayDocumentEmptied', { name: entry.name }), 'medium');
      return;
    }
    const count = this.pageManager.selectPagesBySourceDoc(entry.docId);
    this.showToast(
      this.t('organizer.traySelectedFromDocument', { count, name: entry.name }),
      'success'
    );
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  removeTrayDocument(entry: DocumentTrayEntry) {
    const pageIds = this.pageManager.getPagesBySourceDoc(entry.docId).map(p => p.id);
    if (pageIds.length === 0) return;

    if (pageIds.length >= this.pageManager.pages.length) {
      this.showToast(this.t('organizer.trayCannotRemoveLast'), 'warning');
      return;
    }

    this.pageManager.deletePages(pageIds);
    this.mergeDocs = this.mergeDocs.filter(d => d.id !== entry.docId);
    this.showToast(
      `${this.t('organizer.trayRemovedDocument', { count: pageIds.length, name: entry.name })} ${this.t('organizer.undoAvailable')}`,
      'medium'
    );
    this.updateSplitPreview();
  }

  /** Writes one PDF per source document instead of one merged file. */
  async exportSplitBySource() {
    if (this.pageManager.pages.length === 0) {
      this.showToast(this.t('organizer.trayNothingToExport'), 'warning');
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 0;
    this.processingStage = this.t('organizer.trayExportingBySource');
    this.abortController = new AbortController();
    this.lastExportResult = undefined;
    this.splitExportResults = [];

    try {
      const results = await this.pageManager.exportBySourceDocument(
        progress => (this.processingProgress = progress),
        this.abortController.signal
      );

      // Reuse the existing multi-result preview and ZIP path.
      this.splitExportResults = results;
      this.trayExportResults = results;

      await this.logHistoryItem(
        `PDF: Split back out by source (${results.length} files)`,
        this.pageManager.sourceDocs.map(d => d.name).join(', '),
        `${results.length} files`,
        this.pageManager.sourceDocs.reduce((sum, d) => sum + d.sizeBytes, 0),
        results.reduce((sum, r) => sum + r.sizeBytes, 0)
      );

      this.showToast(
        this.t('organizer.trayExportDone', { count: results.length }),
        'success'
      );
    } catch (e: any) {
      if (e.message?.includes('cancelled')) {
        this.showToast(this.t('organizer.exportCancelled'), 'medium');
      } else {
        this.showToast(this.t('organizer.trayExportFailed', { error: e.message }), 'danger');
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  // --- Multi-Select Actions ---

  toggleSelectPage(page: PdfPageItem) {
    this.pageManager.togglePageSelection(page.id);
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  selectAll() {
    this.pageManager.selectAll();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  deselectAll() {
    this.pageManager.deselectAll();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  invertSelection() {
    this.pageManager.invertSelection();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  rotateSelected(delta: number) {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    this.pageManager.rotatePages(selectedIds, delta);
  }

  deleteSelected() {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    if (selectedIds.length >= this.pageManager.pages.length) {
      this.showToast('Cannot delete all pages. At least one page must remain.', 'warning');
      return;
    }
    this.pageManager.deletePages(selectedIds);
    this.showToast(`Deleted ${selectedIds.length} page(s)`, 'medium');
    this.updateSplitPreview();
  }

  duplicateSelected() {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    this.pageManager.duplicatePages(selectedIds);
    this.showToast(`Duplicated ${selectedIds.length} page(s)`, 'success');
  }

  rotateAll(delta: number) {
    this.pageManager.rotateAll(delta);
  }

  // --- Drag & Drop (Pages) ---

  onPageDragStart(event: DragEvent, index: number) {
    this.draggedPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${index}`);
    }
  }

  onPageDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onPageDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedPageIndex !== null && this.draggedPageIndex !== index) {
      this.pageManager.reorderPage(this.draggedPageIndex, index);
    }
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  onPageDragEnd() {
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  // --- Merge Mode Reordering ---

  moveMergeDoc(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= this.mergeDocs.length) return;
    const temp = this.mergeDocs[index];
    this.mergeDocs[index] = this.mergeDocs[target];
    this.mergeDocs[target] = temp;
    this.syncPagesWithMergeDocs();
  }

  removeMergeDoc(index: number) {
    const [removed] = this.mergeDocs.splice(index, 1);
    if (removed) {
      const pagesToDelete = this.pageManager.pages
        .filter(p => p.sourceDocId === removed.id)
        .map(p => p.id);
      if (pagesToDelete.length > 0) {
        this.pageManager.deletePages(pagesToDelete);
      }
    }
  }

  private syncPagesWithMergeDocs() {
    const docIds = this.mergeDocs.map(d => d.id);
    this.pageManager.reorderPagesBySourceDocIds(docIds);
  }

  // --- Split Mode Logic ---

  setSplitMode(mode: PdfSplitMode) {
    if (this.splitMode === mode) return;

    this.splitMode = mode;
    // A plan belongs to the mode it was made in; it never carries over.
    this.discardSplitPlan();
    this.updateSplitPreview();

    if (isSectioningMode(mode)) {
      this.recomputeSectionPlan();
    } else if (isAdvancedSplitMode(mode)) {
      this.onAdvancedModeSelected(mode);
    }
  }

  /** True while one of the five B1-B5 modes is selected. */
  get isAdvancedSplit(): boolean {
    return isAdvancedSplitMode(this.splitMode);
  }

  get advancedSplitMode(): AdvancedSplitMode {
    return this.splitMode as AdvancedSplitMode;
  }

  // --- B1-B5: advanced split planning ---

  /**
   * Doc-count needs no document inspection, so its plan appears immediately.
   * Chapters reads the outline up front, because the level picker cannot be
   * drawn until the levels are known.
   */
  private onAdvancedModeSelected(mode: AdvancedSplitMode) {
    if (this.pageManager.pages.length === 0) return;

    if (mode === 'doc-count') {
      this.planDocCountNow();
    } else if (mode === 'chapters' && !this.outlineResult) {
      void this.analyzeSplitPlan();
    }
  }

  onAdvancedConfigChange(config: AdvancedSplitConfig) {
    this.advancedSplitConfig = config;

    if (this.splitMode === 'doc-count') {
      // Cheap enough to re-plan on every keystroke, and the preview is the
      // only feedback that an N is out of range.
      this.planDocCountNow();
      return;
    }

    if (this.splitMode === 'chapters' && this.outlineResult) {
      /*
       * The outline is already in hand, so moving the level picker re-plans
       * straight away rather than sending the person back to a button to read
       * the same outline again.
       */
      this.advancedSplitPlan = this.splitPlanner.planChapters(
        this.pageManager.pages,
        this.outlineResult,
        config.chapterLevel,
        this.splitBaseName
      );
      this.recordPlanSignatures();
      return;
    }

    /*
     * Everything else has to be re-measured or re-read. The existing plan stays
     * on screen -- it is still what was computed -- but `advancedPlanStale`
     * marks it and `executeExport` refuses it.
     */
  }

  private planDocCountNow() {
    const total = this.pageManager.pages.length;
    if (total === 0) {
      this.advancedSplitPlan = null;
      return;
    }
    this.advancedSplitPlan = this.splitPlanner.planDocCount(
      total,
      this.advancedSplitConfig.docCount
    );
    this.recordPlanSignatures();
  }

  /** Runs the mode's analysis pass and stores the plan it produces. */
  async analyzeSplitPlan() {
    if (this.isAnalyzingSplit) return;
    if (this.pageManager.pages.length === 0) {
      this.showToast(this.t('organizer.splitNoDocument'), 'warning');
      return;
    }

    const mode = this.advancedSplitMode;
    this.isAnalyzingSplit = true;
    this.splitPlanProgress = null;
    this.splitAnalyzeAbort = new AbortController();
    const signal = this.splitAnalyzeAbort.signal;
    const onProgress = (progress: SplitPlanProgress) => {
      this.splitPlanProgress = progress;
    };

    try {
      switch (mode) {
        case 'max-size':
          this.advancedSplitPlan = await this.planMaxSize(signal, onProgress);
          break;
        case 'doc-count':
          this.advancedSplitPlan = this.splitPlanner.planDocCount(
            this.pageManager.pages.length,
            this.advancedSplitConfig.docCount
          );
          break;
        case 'chapters':
          this.advancedSplitPlan = await this.planChapters(signal);
          break;
        case 'divider':
          this.advancedSplitPlan = await this.planDividers(signal, onProgress);
          break;
        case 'text-pattern':
          this.advancedSplitPlan = await this.planTextPattern(signal, onProgress);
          break;
      }

      this.recordPlanSignatures();

      if (this.advancedSplitPlan && !this.advancedSplitPlan.usable) {
        // The panel renders the reason; the toast is for someone who has
        // already scrolled past it.
        this.showToast(this.t('organizer.splitPlanNotUsable'), 'warning');
      }
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) {
        this.showToast(this.t('organizer.splitAnalyzeCancelled'), 'medium');
      } else {
        this.showToast(this.t('organizer.splitAnalyzeFailed', { error: e?.message || '' }), 'danger');
      }
    } finally {
      this.isAnalyzingSplit = false;
      this.splitPlanProgress = null;
      this.splitAnalyzeAbort = null;
    }
  }

  cancelSplitAnalyze() {
    this.splitAnalyzeAbort?.abort();
  }

  private async planMaxSize(
    signal: AbortSignal,
    onProgress: (p: SplitPlanProgress) => void
  ): Promise<SplitPlan> {
    const pageNumbers = this.pageManager.pages.map((_, i) => i + 1);
    return this.splitPlanner.planMaxSize(pageNumbers, {
      ceilingBytes: this.advancedCeilingBytes,
      measureBytes: this.pageManager.createChunkMeasurer(signal),
      signal,
      onProgress
    });
  }

  private async planChapters(signal: AbortSignal): Promise<SplitPlan> {
    this.outlineResult = await this.splitPlanner.readOutline(
      this.pageManager.sourceDocs,
      signal
    );

    // Clamp a level left over from a previous document to what this one has.
    const maxLevel = Math.max(1, this.outlineResult.maxLevel);
    if (this.advancedSplitConfig.chapterLevel > maxLevel) {
      this.advancedSplitConfig = { ...this.advancedSplitConfig, chapterLevel: maxLevel };
    }

    return this.splitPlanner.planChapters(
      this.pageManager.pages,
      this.outlineResult,
      this.advancedSplitConfig.chapterLevel,
      this.splitBaseName
    );
  }

  private async planDividers(
    signal: AbortSignal,
    onProgress: (p: SplitPlanProgress) => void
  ): Promise<SplitPlan> {
    const scan = await this.splitPlanner.scanDividers({
      pages: this.pageManager.pages,
      sourceDocsMap: this.pageManager.getSourceDocsMap(),
      detectBlank: this.advancedSplitConfig.dividerBlank,
      detectBarcode: this.advancedSplitConfig.dividerBarcode,
      blankThreshold: this.blankThreshold,
      signal,
      onProgress
    });

    return this.splitPlanner.planDividers(this.pageManager.pages, scan, {
      nameFromPayload:
        this.advancedSplitConfig.dividerBarcode &&
        this.advancedSplitConfig.dividerNameFromPayload,
      fallbackBaseName: this.splitBaseName
    });
  }

  private async planTextPattern(
    signal: AbortSignal,
    onProgress: (p: SplitPlanProgress) => void
  ): Promise<SplitPlan> {
    const config = this.advancedSplitConfig;
    const scan = await this.splitPlanner.scanTextPattern({
      pages: this.pageManager.pages,
      sourceDocsMap: this.pageManager.getSourceDocsMap(),
      pattern: config.textPattern.trim(),
      flags: config.textIgnoreCase ? 'i' : '',
      regionTopFraction: config.textUseRegion
        ? Math.min(1, Math.max(0.01, config.textRegionPercent / 100))
        : undefined,
      signal,
      onProgress
    });

    return this.splitPlanner.planTextPattern(
      this.pageManager.pages,
      scan,
      this.splitBaseName
    );
  }

  get advancedCeilingBytes(): number {
    return ceilingToBytes(
      this.advancedSplitConfig.sizeValue,
      this.advancedSplitConfig.sizeUnit
    );
  }

  /** Outline nesting levels the loaded documents actually have. */
  get outlineLevels(): number[] {
    const max = this.outlineResult?.maxLevel ?? 0;
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  get outlineCountsByLevel(): number[] {
    return this.outlineResult?.countsByLevel ?? [];
  }

  get outlineChecked(): boolean {
    return this.outlineResult !== null;
  }

  private get splitBaseName(): string {
    const doc = this.pageManager.sourceDocs[0];
    return doc ? doc.name.replace(/\.pdf$/i, '') : 'document';
  }

  private currentConfigSignature(): string {
    return `${this.splitMode}|${JSON.stringify(this.advancedSplitConfig)}`;
  }

  /**
   * Cheap stand-in for the whole page list. The length and the first and last
   * ids catch a reorder or a deletion at either end, and the undo depth moves
   * on every recorded operation, which covers the rest -- all without walking
   * the page array on every change-detection pass.
   */
  private currentPageSignature(): string {
    const pages = this.pageManager.pages;
    const first = pages[0]?.id ?? '';
    const last = pages[pages.length - 1]?.id ?? '';
    return `${pages.length}|${first}|${last}|${this.pageManager.historyLength}`;
  }

  private recordPlanSignatures() {
    this.plannedConfigSignature = this.currentConfigSignature();
    this.plannedPageSignature = this.currentPageSignature();
  }

  /** How many files the Export button is about to write, in either mode. */
  get splitOutputCount(): number {
    if (this.isSectioningSplit) {
      return this.sectionPlan?.totalPieces ?? 0;
    }
    if (this.isAdvancedSplit) {
      return this.advancedSplitPlan?.parts.length ?? 0;
    }
    return this.splitChunksPreview.length;
  }

  /**
   * Sectioning and tiling write one document with more pages in it, so the
   * button counts pages rather than files and says so.
   */
  get splitGenerateKey(): string {
    if (this.splitMode === 'tiles') return 'organizer.tileGenerateBtn';
    if (this.splitMode === 'sections') return 'organizer.sectionGenerateBtn';
    return 'organizer.splitGenerateBtn';
  }

  /**
   * The four shipped modes compute their chunks as you type and are exportable
   * whenever there are any. The five new ones need a plan that is both usable
   * and current -- the button says why when it is not.
   */
  get canExportSplit(): boolean {
    if (this.isProcessing || this.isAnalyzingSplit || this.isScanningGutters) return false;
    if (this.isSectioningSplit) {
      const plan = this.sectionPlan;
      return !!plan && plan.usable && plan.pieces.length > 0;
    }
    if (!this.isAdvancedSplit) return this.pageManager.pages.length > 0;

    const plan = this.advancedSplitPlan;
    return !!plan && plan.usable && plan.parts.length > 0 && !this.advancedPlanStale;
  }

  get splitExportBlockedKey(): string {
    if (this.isScanningGutters) return 'organizer.sectionScanningShort';
    if (this.isSectioningSplit) return 'organizer.sectionNothingToWrite';
    if (this.isAnalyzingSplit) return 'organizer.splitAnalyzing';
    if (!this.advancedSplitPlan) return 'organizer.splitNeedsPlan';
    if (this.advancedPlanStale) return 'organizer.splitPlanStale';
    if (!this.advancedSplitPlan.usable) return 'organizer.splitPlanNotUsable';
    return 'organizer.splitNeedsPlan';
  }

  get advancedPlanStale(): boolean {
    if (!this.advancedSplitPlan) return false;
    return (
      this.plannedConfigSignature !== this.currentConfigSignature() ||
      this.plannedPageSignature !== this.currentPageSignature()
    );
  }

  private discardSplitPlan() {
    this.advancedSplitPlan = null;
    this.splitPlanProgress = null;
    this.plannedConfigSignature = '';
    this.plannedPageSignature = '';
    this.sectionPlan = null;
  }

  // --- B6/B7: sectioning and tiling ---

  /** True while one of the two modes that cut inside a page is selected. */
  get isSectioningSplit(): boolean {
    return isSectioningMode(this.splitMode);
  }

  get sectioningMode(): SectioningMode {
    return this.splitMode as SectioningMode;
  }

  /**
   * Both modes are planned from the page dimensions alone, so the preview can
   * follow the controls without anyone pressing anything. Only the gutter scan
   * reads the document, and it keeps its answers in `gutterResults` so moving
   * the other controls does not re-run it.
   */
  recomputeSectionPlan() {
    if (!this.isSectioningSplit || this.pageManager.pages.length === 0) {
      this.sectionPlan = null;
      return;
    }

    const pages = this.pageManager.pages;
    this.sectionPlan =
      this.splitMode === 'tiles'
        ? this.sectioningService.planTiles(pages, {
            paper: this.sectioningConfig.paper,
            orientation: this.sectioningConfig.orientation,
            overlapMm: this.sectioningConfig.overlapMm,
            cropMarks: this.sectioningConfig.cropMarks,
            numbering: this.sectioningConfig.numbering
          })
        : this.sectioningService.planSections(
            pages,
            {
              rows: this.sectioningConfig.rows,
              columns: this.sectioningConfig.columns,
              order: this.sectioningConfig.order,
              useGutterDetection: this.sectioningConfig.useGutterDetection
            },
            this.gutterResults ?? undefined
          );
  }

  onSectioningConfigChange(config: SectioningConfig) {
    const gridChanged =
      config.rows !== this.sectioningConfig.rows ||
      config.columns !== this.sectioningConfig.columns;

    this.sectioningConfig = config;

    // A grid that is no longer a two-page spread has no gutter to apply.
    if (gridChanged && !(config.rows === 1 && config.columns === 2)) {
      this.gutterResults = null;
    }

    this.recomputeSectionPlan();
  }

  /** Reads each page's gutter, then re-plans with what it found. */
  async runGutterScan() {
    if (this.isScanningGutters || this.pageManager.pages.length === 0) return;

    this.isScanningGutters = true;
    this.gutterProgress = null;
    this.gutterScanAbort = new AbortController();

    try {
      this.gutterResults = await this.sectioningService.scanGutters(
        this.pageManager.pages,
        this.pageManager.getSourceDocsMap(),
        {
          signal: this.gutterScanAbort.signal,
          onProgress: progress => (this.gutterProgress = progress)
        }
      );
      this.recomputeSectionPlan();
    } catch (e: any) {
      this.gutterResults = null;
      if (e?.message?.includes('cancelled')) {
        this.showToast(this.t('organizer.sectionGutterCancelled'), 'medium');
        // The toggle came on to start this scan; it goes back off with it.
        this.sectioningConfig = { ...this.sectioningConfig, useGutterDetection: false };
      } else {
        this.showToast(
          this.t('organizer.sectionGutterFailed', { error: e?.message || '' }),
          'danger'
        );
      }
      this.recomputeSectionPlan();
    } finally {
      this.isScanningGutters = false;
      this.gutterProgress = null;
      this.gutterScanAbort = null;
    }
  }

  cancelGutterScan() {
    this.gutterScanAbort?.abort();
  }

  /** The first page, drawn behind the grid in the preview. */
  get sectionPreviewThumbnail(): string | undefined {
    return this.pageManager.pages[0]?.thumbnailUrl;
  }

  get sectionPreviewWidth(): number {
    const page = this.pageManager.pages[0];
    if (!page) return 595;
    return this.sectioningService.visualSize(
      page.width,
      page.height,
      (page.originalRotation || 0) + (page.rotation || 0)
    ).width;
  }

  get sectionPreviewHeight(): number {
    const page = this.pageManager.pages[0];
    if (!page) return 842;
    return this.sectioningService.visualSize(
      page.width,
      page.height,
      (page.originalRotation || 0) + (page.rotation || 0)
    ).height;
  }

  /**
   * Writes the sections or tiles as one document.
   *
   * Unlike the five page-range modes this produces a single file with more
   * pages than it started with, so it goes through `lastExportResult` and the
   * single-result preview rather than the split results list.
   */
  private async exportSectionedDocument() {
    this.recomputeSectionPlan();
    const plan = this.sectionPlan;

    if (!plan || !plan.usable || plan.pieces.length === 0) {
      this.showToast(this.t('organizer.sectionNothingToWrite'), 'warning');
      this.isProcessing = false;
      return;
    }

    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name.replace(/\.pdf$/i, '') : 'document';
    const suffix = plan.mode === 'tiles' ? 'tiles' : 'sections';
    const outputName = `${baseName}_${suffix}.pdf`;

    this.processingStage = this.t(
      plan.mode === 'tiles' ? 'organizer.tileWriting' : 'organizer.sectionWriting',
      { count: plan.totalPieces }
    );

    const result = await this.sectioningService.exportSectionedPdf(
      plan,
      this.pageManager.pages,
      this.pageManager.getSourceDocsMap(),
      outputName,
      plan.mode === 'tiles'
        ? {
            cropMarks: this.sectioningConfig.cropMarks,
            numbering: this.sectioningConfig.numbering
          }
        : undefined,
      progress => (this.processingProgress = progress.percent),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    await this.logHistoryItem(
      plan.mode === 'tiles'
        ? `PDF: Tiled into ${plan.totalPieces} sheets`
        : `PDF: Sectioned into ${plan.totalPieces} pages`,
      originalDoc?.name || 'document.pdf',
      result.name,
      originalDoc?.sizeBytes || 0,
      result.sizeBytes
    );

    this.showToast(
      this.t(
        plan.mode === 'tiles' ? 'organizer.tileCreated' : 'organizer.sectionCreated',
        { count: plan.totalPieces }
      ),
      'success'
    );
  }

  /**
   * Carries the pages that are over the size ceiling on their own to the
   * compressor, which is the tool that can actually help them. The pages are
   * assembled in memory and handed over through DocumentBridgeService -- no
   * file is saved here, so the free-tier daily quota is untouched.
   */
  async handOffOversizedToCompressor(pageNumbers: number[]) {
    if (pageNumbers.length === 0) return;

    const pages = pageNumbers
      .map(num => this.pageManager.pages[num - 1])
      .filter(p => !!p);

    if (pages.length === 0) {
      this.showToast(this.t('organizer.splitHandOffFailed', { error: '' }), 'warning');
      return;
    }

    this.isProcessing = true;
    this.processingStage = this.t('organizer.splitHandOffPreparing');

    try {
      const ranges = PdfRangeParserUtil.formatRange(pageNumbers).replace(/[\s,]+/g, '_');
      const result = await this.pageManager.exportSinglePdf(
        pages,
        `${this.splitBaseName}_oversized_${ranges}.pdf`
      );

      this.documentBridge.setCompressTarget({
        file: result.file,
        suggestedTargetKB: Math.max(1, Math.round(this.advancedCeilingBytes / 1024)),
        source: 'organizer-split'
      });

      await this.router.navigate(['/features/pdf-compress']);
    } catch (e: any) {
      this.showToast(
        this.t('organizer.splitHandOffFailed', { error: e?.message || '' }),
        'danger'
      );
    } finally {
      this.isProcessing = false;
    }
  }

  onRangeInputChanged() {
    const totalPages = this.pageManager.pages.length;
    const result = PdfRangeParserUtil.parseRange(this.splitRangeString, totalPages);
    if (!result.valid) {
      this.rangeValidationError = result.error || 'Invalid range';
      return;
    }
    this.rangeValidationError = '';

    // Synchronize page selection with range
    this.pageManager.deselectAll();
    result.pages.forEach(pNum => {
      const page = this.pageManager.pages[pNum - 1];
      if (page) this.pageManager.selectPage(page.id);
    });

    this.updateSplitPreview();
  }

  private syncRangeInputWithSelection() {
    const selectedPages = this.pageManager.getSelectedPages().map(p => p.displayNumber);
    this.splitRangeString = PdfRangeParserUtil.formatRange(selectedPages);
    this.rangeValidationError = '';
  }

  toggleSplitAfterPage(pageNum: number) {
    const idx = this.splitAfterPages.indexOf(pageNum);
    if (idx >= 0) {
      this.splitAfterPages.splice(idx, 1);
    } else {
      this.splitAfterPages.push(pageNum);
      this.splitAfterPages.sort((a, b) => a - b);
    }
    this.updateSplitPreview();
  }

  updateSplitPreview() {
    const totalPages = this.pageManager.pages.length;
    if (totalPages === 0) {
      this.splitChunksPreview = [];
      return;
    }

    /*
     * The five B1-B5 modes are planned, not computed: they get their preview
     * from `advancedSplitPlan`. Running them through `calculateSplitChunks`
     * would fall into its default branch and show one chunk of the whole
     * document, which looks like a working plan and is not one.
     */
    if (isAdvancedSplitMode(this.splitMode) || isSectioningMode(this.splitMode)) {
      this.splitChunksPreview = [];
      return;
    }

    const config: PdfSplitConfig = {
      mode: this.splitMode,
      everyN: this.splitEveryN,
      afterPages: this.splitAfterPages,
      selectedPageNumbers: this.pageManager.getSelectedPages().map(p => p.displayNumber)
    };

    this.splitChunksPreview = PdfRangeParserUtil.calculateSplitChunks(totalPages, config);
  }

  // --- High-Res Zoom Preview ---

  async openZoomModal(page: PdfPageItem) {
    this.zoomPage = page;
    this.zoomModalOpen = true;
    this.isZoomLoading = true;
    this.zoomImageUrl = undefined;

    try {
      this.zoomImageUrl = await this.pageManager.renderHighResPage(page);
    } catch {
      this.zoomImageUrl = page.thumbnailUrl;
    } finally {
      this.isZoomLoading = false;
    }
  }

  closeZoomModal() {
    this.zoomModalOpen = false;
    this.zoomPage = undefined;
    this.zoomImageUrl = undefined;
  }

  prevZoomPage() {
    if (!this.zoomPage) return;
    const currentIndex = this.pageManager.pages.findIndex(p => p.id === this.zoomPage!.id);
    if (currentIndex > 0) {
      this.openZoomModal(this.pageManager.pages[currentIndex - 1]);
    }
  }

  nextZoomPage() {
    if (!this.zoomPage) return;
    const currentIndex = this.pageManager.pages.findIndex(p => p.id === this.zoomPage!.id);
    if (currentIndex < this.pageManager.pages.length - 1) {
      this.openZoomModal(this.pageManager.pages[currentIndex + 1]);
    }
  }

  // --- Export Execution ---

  cancelProcessing() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  async executeExport() {
    if (this.pageManager.pages.length === 0) {
      this.showToast('Please upload a PDF first.', 'warning');
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 0;
    this.abortController = new AbortController();

    try {
      switch (this.mode) {
        case 'organize':
        case 'rotate':
        case 'delete':
          await this.exportOrganizedPdf();
          break;
        case 'extract':
          await this.exportExtractedPdf();
          break;
        case 'split':
          await this.exportSplitPdfs();
          break;
        case 'merge':
          await this.exportMergedPdf();
          break;
      }
    } catch (e: any) {
      if (e.message?.includes('cancelled')) {
        this.showToast('Operation cancelled.', 'medium');
      } else {
        this.showToast(`Export failed: ${e.message}`, 'danger');
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  private async exportOrganizedPdf() {
    this.processingStage = 'Generating PDF...';
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name.replace(/\.pdf$/i, '') : 'document';
    const outputName = `${baseName}_organized_${Date.now()}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      this.pageManager.pages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    await this.logHistoryItem(
      this.mode === 'rotate' ? 'PDF: Rotated Pages' : this.mode === 'delete' ? 'PDF: Deleted Pages' : 'PDF: Organized',
      originalDoc?.name || 'document.pdf',
      result.name,
      originalDoc?.sizeBytes || 0,
      result.sizeBytes
    );
    this.showToast('PDF exported successfully!', 'success');
  }

  private async exportExtractedPdf() {
    const selectedPages = this.pageManager.getSelectedPages();
    if (selectedPages.length === 0) {
      this.showToast('Please select at least one page to extract.', 'warning');
      this.isProcessing = false;
      return;
    }

    this.processingStage = 'Extracting selected pages...';
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name.replace(/\.pdf$/i, '') : 'document';
    const pageRanges = PdfRangeParserUtil.formatRange(selectedPages.map(p => p.displayNumber));
    const outputName = `${baseName}_extracted_${pageRanges.replace(/[\s,]+/g, '_')}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      selectedPages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    await this.logHistoryItem(
      `PDF: Extracted pages ${pageRanges}`,
      originalDoc?.name || 'document.pdf',
      result.name,
      originalDoc?.sizeBytes || 0,
      result.sizeBytes
    );
    this.showToast('Extracted PDF generated!', 'success');
  }

  private async exportSplitPdfs() {
    if (isSectioningMode(this.splitMode)) {
      await this.exportSectionedDocument();
      return;
    }

    if (isAdvancedSplitMode(this.splitMode)) {
      await this.exportPlannedSplitPdfs();
      return;
    }

    this.updateSplitPreview();
    if (this.splitChunksPreview.length === 0) {
      this.showToast('No split chunks defined.', 'warning');
      this.isProcessing = false;
      return;
    }

    this.processingStage = `Splitting into ${this.splitChunksPreview.length} PDF(s)...`;
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name : 'document.pdf';

    const results = await this.pageManager.exportSplitPdfs(
      this.splitChunksPreview,
      baseName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.splitExportResults = results;
    await this.logHistoryItem(
      `PDF: Split into ${results.length} files`,
      originalDoc?.name || 'document.pdf',
      `${results.length} split files`,
      originalDoc?.sizeBytes || 0,
      results.reduce((sum, r) => sum + r.sizeBytes, 0)
    );
    this.showToast(`Successfully created ${results.length} PDF parts!`, 'success');
  }

  /**
   * Writes the plan one of the five new modes produced.
   *
   * The plan is checked against the document first. An unusable or stale plan
   * is refused with the reason rather than exported: the page numbers in it are
   * positions, so writing them after the pages have moved would produce a file
   * that looks right and is not.
   */
  private async exportPlannedSplitPdfs() {
    const plan = this.advancedSplitPlan;

    if (!plan || plan.parts.length === 0) {
      this.showToast(this.t('organizer.splitNeedsPlan'), 'warning');
      this.isProcessing = false;
      return;
    }
    if (!plan.usable) {
      this.showToast(this.t('organizer.splitPlanNotUsable'), 'warning');
      this.isProcessing = false;
      return;
    }
    if (this.advancedPlanStale) {
      this.showToast(this.t('organizer.splitPlanStale'), 'warning');
      this.isProcessing = false;
      return;
    }

    this.processingStage = this.t('organizer.splitWritingParts', { count: plan.parts.length });
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name : 'document.pdf';

    const results = await this.pageManager.exportSplitPdfs(
      plan.parts.map(part => part.pageNumbers),
      baseName,
      progress => (this.processingProgress = progress),
      this.abortController?.signal,
      plan.parts.map(part => part.baseName)
    );

    this.splitExportResults = results;
    await this.logHistoryItem(
      `PDF: Split into ${results.length} files (${plan.mode})`,
      originalDoc?.name || 'document.pdf',
      `${results.length} split files`,
      originalDoc?.sizeBytes || 0,
      results.reduce((sum, r) => sum + r.sizeBytes, 0)
    );

    /*
     * Never let a partial result pass for a clean one: a dropped divider sheet
     * or a page that stayed over the ceiling is said out loud, not left for the
     * person to notice in the file list.
     */
    this.showToast(this.t('organizer.splitCreatedParts', { count: results.length }), 'success');

    if (plan.droppedPageNumbers.length > 0) {
      this.showToast(
        this.t('organizer.splitDroppedDividers', {
          count: plan.droppedPageNumbers.length,
          pages: PdfRangeParserUtil.formatRange(plan.droppedPageNumbers)
        }),
        'medium'
      );
    }

    const overCeiling = plan.parts.filter(part => part.overCeiling);
    if (overCeiling.length > 0) {
      this.showToast(
        this.t('organizer.splitStillOverCeiling', {
          pages: PdfRangeParserUtil.formatRange(overCeiling.flatMap(p => p.pageNumbers))
        }),
        'warning'
      );
    }
  }

  private async exportMergedPdf() {
    this.processingStage = 'Merging documents...';
    const outputName = `merged_${Date.now()}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      this.pageManager.pages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    const totalOriginalSize = this.pageManager.sourceDocs.reduce((sum, d) => sum + d.sizeBytes, 0);

    await this.logHistoryItem(
      `PDF: Merged ${this.pageManager.sourceDocs.length} PDFs`,
      `${this.pageManager.sourceDocs.length} files`,
      result.name,
      totalOriginalSize,
      result.sizeBytes
    );
    this.showToast('Merged PDF created successfully!', 'success');
  }

  // --- Save, Share & Download ---

  async saveResult(result: PdfExportResult) {
    const uri = await this.storageService.saveFile(result.file, 'document');
    if (uri && uri !== 'web-download') {
      this.showToast(`Saved to ${uri}`, 'success');
    }
  }

  async shareResult(result: PdfExportResult) {
    const uri = await this.storageService.saveFile(result.file, 'document_share');
    if (uri && uri !== 'web-download') {
      await this.shareService.shareFile(uri, result.name);
    }
  }

  async downloadAllSplitAsZip() {
    if (this.splitExportResults.length === 0) return;

    this.isProcessing = true;
    this.processingStage = 'Packaging ZIP archive...';

    try {
      const zip = new JSZip();
      for (const res of this.splitExportResults) {
        zip.file(res.name, res.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `split_pdfs_${Date.now()}.zip`, { type: 'application/zip' });
      const uri = await this.storageService.saveFile(zipFile, 'archive');

      if (uri && uri !== 'web-download') {
        this.showToast(`Saved ZIP to ${uri}`, 'success');
      } else {
        this.showToast('Downloaded ZIP archive.', 'success');
      }
    } catch (e: any) {
      this.showToast(`ZIP generation failed: ${e.message}`, 'danger');
    } finally {
      this.isProcessing = false;
    }
  }

  private async logHistoryItem(
    operation: string,
    originalName: string,
    outputName: string,
    origSize: number,
    outSize: number
  ) {
    await this.historyService.addHistoryItem({
      operation,
      originalFileName: originalName,
      outputFileName: outputName,
      originalSizeBytes: origSize,
      outputSizeBytes: outSize,
      outputPath: 'web-download'
    });
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' | 'medium' = 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  get beforePreviewData(): PreviewData | undefined {
    const doc = this.pageManager.sourceDocs[0];
    if (!doc) return undefined;
    return {
      name: doc.name,
      type: 'application/pdf',
      sizeBytes: doc.sizeBytes,
      pages: doc.pageCount
    };
  }

  get afterPreviewData(): PreviewData | undefined {
    if (!this.lastExportResult) return undefined;
    return {
      name: this.lastExportResult.name,
      type: 'application/pdf',
      sizeBytes: this.lastExportResult.sizeBytes,
      pages: this.lastExportResult.pageCount
    };
  }
}
