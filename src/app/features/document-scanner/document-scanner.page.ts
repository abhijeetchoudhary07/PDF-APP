import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { DocumentScannerService } from '../../core/services/document-scanner.service';
import { PdfService, PdfCreationConfig } from '../../core/services/pdf.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { OcrService } from '../../core/services/ocr.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import {
  Point,
  DocumentCorners,
  ScannedPage,
  ScanMode,
  EnhancementPreset,
  EnhancementOptions
} from '../../core/models/scanner.models';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  AppModalComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type ScannerView = 'empty' | 'cropping' | 'enhancing' | 'pages_list' | 'pdf_ready';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-document-scanner',
  templateUrl: './document-scanner.page.html',
  styleUrls: ['./document-scanner.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppRelatedToolsComponent,
    AppModalComponent,
    TranslatePipe
  ]
})
export class DocumentScannerPage implements OnInit, OnDestroy {
  private scannerService = inject(DocumentScannerService);
  private pdfService = inject(PdfService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private ocrService = inject(OcrService);
  private documentBridgeService = inject(DocumentBridgeService);
  private toastService = inject(ToastService);
  private translationService = inject(TranslationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('cropCanvas', { static: false }) cropCanvasRef?: ElementRef<HTMLCanvasElement>;

  private _currentView: ScannerView = 'empty';
  get currentView(): ScannerView {
    return this._currentView;
  }
  set currentView(view: ScannerView) {
    this._currentView = view;
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo(0, 0);
      } catch {}
    }
  }

  // --- H1 & H2: CAPTURE MODES ---
  scanMode: ScanMode = 'document';
  readonly scanModes: Array<{ id: ScanMode; labelKey: string; icon: string }> = [
    { id: 'document', labelKey: 'scanner.modeDocument', icon: '📄' },
    { id: 'book', labelKey: 'scanner.modeBook', icon: '📖' },
    { id: 'id_card', labelKey: 'scanner.modeIdCard', icon: '🪪' },
    { id: 'whiteboard', labelKey: 'scanner.modeWhiteboard', icon: '📋' },
    { id: 'photo', labelKey: 'scanner.modePhoto', icon: '🖼️' },
    { id: 'table', labelKey: 'scanner.modeTable', icon: '📊' }
  ];

  // H1: ID Card multi-step state
  idCardStep: 'front' | 'back' | 'none' = 'none';
  private idCardFrontBlob?: Blob;

  // --- H3: BATCH SCANNING ---
  // Skips the crop detour on a low-confidence page so a stack of imports runs
  // straight through; everything stays reviewable in the page list.
  //
  // The auto-capture half of H3 is NOT wired up. Firing the shutter on a
  // stable quad needs a live in-app camera preview to analyse frames, and this
  // page hands off to the OS camera instead, which returns one still. The
  // decision function it would drive is DocumentScannerService.evaluateAutoCapture
  // (built and unit-tested); the preview, the CAMERA manifest permission and
  // the WebView permission plumbing are not. The toggle that used to sit in the
  // toolbar only flipped a field no code read, so it was removed rather than
  // left promising a shutter that never fires.
  batchMode = false;

  // Capture processing feedback. A single page runs edge detection, a warp,
  // enhancement, the blur score and the title OCR before anything appears on
  // screen -- seconds on a phone, with nothing to show the tap registered.
  isProcessingCapture = false;
  processingCurrent = 0;
  processingTotal = 0;

  // --- H4: BLUR GATE ---
  showBlurAlert = false;
  lastBlurScore = 0;
  pendingBlurPageId?: string;

  // --- H8: AUTO-NAMING ---
  documentFileName = '';
  isEditingFileName = false;
  // Reading the heading off page 1 needs the OCR engine, whose language data is
  // fetched once and then cached. That is a download the capture path must not
  // start on its own, so the scan lands with the instant heuristic name and the
  // user asks for the OCR read. Either way the name is only ever a proposal in
  // an editable field.
  isSuggestingName = false;
  nameSource: 'heuristic' | 'ocr' | 'manual' = 'heuristic';
  suggestedTitlePreview = '';

  // Multi-page state
  pages: ScannedPage[] = [];
  activePageIndex = 0;

  // Active page editing state
  activeCropCorners: DocumentCorners = {
    topLeft: { x: 50, y: 50 },
    topRight: { x: 350, y: 50 },
    bottomRight: { x: 350, y: 450 },
    bottomLeft: { x: 50, y: 450 }
  };
  activeConfidence = 0;
  isLowConfidence = false;
  cropMode: 'auto' | 'manual' = 'auto';

  // Enhancement state
  activeEnhancement: EnhancementOptions = {
    preset: 'document',
    brightness: 0,
    contrast: 0,
    sharpen: 20
  };
  showBeforePreview = false;

  // PDF generation state
  pdfConfig: PdfCreationConfig = {
    format: 'A4',
    orientation: 'Portrait',
    fitMode: 'fit'
  };
  generatedPdfFile?: File;
  isGeneratingPdf = false;

  // Canvas interaction
  private activeDraggingPoint: keyof DocumentCorners | null = null;
  private canvasScale = 1;

  ngOnInit(): void {
    this.scanMode = this.scannerService.getScanMode();
  }

  ngOnDestroy(): void {
    for (const p of this.pages) {
      this.fileService.revokeObjectUrl(p.originalImageUrl);
      this.fileService.revokeObjectUrl(p.processedImageUrl);
    }
  }

  get activePage(): ScannedPage | undefined {
    return this.pages[this.activePageIndex];
  }

  private async triggerHaptic(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch {}
    }
  }

  changeScanMode(mode: ScanMode): void {
    this.scanMode = mode;
    this.scannerService.setScanMode(mode);
    this.triggerHaptic(ImpactStyle.Light);
    if (mode === 'id_card') {
      this.idCardStep = 'front';
    } else {
      this.idCardStep = 'none';
      this.idCardFrontBlob = undefined;
    }
    this.cdr.detectChanges();
  }


  // --- CAMERA & CAPTURE ---

  async captureFromCamera(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await Camera.getPhoto({
          quality: 100,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera
        });

        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          this.beginProcessing(1);
          this.processingCurrent = 1;
          try {
            await this.processNewCapture(blob);
          } finally {
            this.endProcessing();
          }
        }
      } else {
        // Desktop / Web: fallback to file input / gallery
        const file = await this.fileService.pickImageFile();
        if (file) {
          this.beginProcessing(1);
          this.processingCurrent = 1;
          try {
            await this.processNewCapture(file);
          } finally {
            this.endProcessing();
          }
        }
      }
    } catch (err: any) {
      this.endProcessing();
      if (err?.message && !err.message.includes('User cancelled')) {
        this.toastService.show('error', 'Camera access error or permission denied.');
      }
    }
  }

  async importFromGallery(): Promise<void> {
    const files = await this.fileService.pickMultipleImages();
    if (files.length === 0) return;
    this.beginProcessing(files.length);
    try {
      for (const f of files) {
        this.processingCurrent++;
        this.cdr.detectChanges();
        await this.processNewCapture(f);
      }
    } finally {
      this.endProcessing();
    }
  }

  private beginProcessing(total: number): void {
    this.isProcessingCapture = true;
    this.processingTotal = total;
    this.processingCurrent = 0;
    this.cdr.detectChanges();
  }

  private endProcessing(): void {
    this.isProcessingCapture = false;
    this.processingTotal = 0;
    this.processingCurrent = 0;
    this.cdr.detectChanges();
  }

  async processNewCapture(blobOrFile: Blob | File): Promise<void> {
    this.triggerHaptic(ImpactStyle.Medium);

    // H1: ID Card flow
    if (this.scanMode === 'id_card') {
      if (this.idCardStep === 'front' || !this.idCardFrontBlob) {
        this.idCardFrontBlob = blobOrFile;
        this.idCardStep = 'back';
        this.toastService.show('info', this.translationService.translate('scanner.idCardStep2'));
        this.cdr.detectChanges();
        return;
      } else if (this.idCardStep === 'back' && this.idCardFrontBlob) {
        try {
          const composite = await this.scannerService.layoutIdCard(this.idCardFrontBlob, blobOrFile);
          const combinedBlob = await this.scannerService.canvasToBlob(composite);
          this.idCardStep = 'front';
          this.idCardFrontBlob = undefined;
          await this.addSingleScannedPage(combinedBlob, 'id_card', { alreadyComposed: true });
          this.toastService.show('success', this.translationService.translate('scanner.idCardCaptured'));
          return;
        } catch (e: any) {
          this.toastService.show('error', 'Failed to combine ID card: ' + e?.message);
        }
      }
    }

    // H1: Book Spread flow
    if (this.scanMode === 'book') {
      try {
        const canvas = await this.scannerService.toCanvas(blobOrFile);
        const gutter = this.scannerService.detectGutter(canvas);
        const [leftCanvas, rightCanvas] = await this.scannerService.splitBookSpread(canvas, gutter.gutterX);
        const leftBlob = await this.scannerService.canvasToBlob(leftCanvas);
        const rightBlob = await this.scannerService.canvasToBlob(rightCanvas);

        await this.addSingleScannedPage(leftBlob, 'book');
        await this.addSingleScannedPage(rightBlob, 'book');
        this.toastService.show('success', this.translationService.translate('scanner.bookSpreadGutterDetected'));
        this.currentView = 'pages_list';
        this.cdr.detectChanges();
        return;
      } catch (e: any) {
        this.toastService.show('error', 'Book split error: ' + e?.message);
      }
    }

    // Standard document, whiteboard, photo, or table capture
    await this.addSingleScannedPage(blobOrFile, this.scanMode);
  }

  private async addSingleScannedPage(
    blobOrFile: Blob | File,
    mode: ScanMode = 'document',
    opts: { alreadyComposed?: boolean } = {}
  ): Promise<void> {
    const originalUrl = this.fileService.createObjectUrl(blobOrFile);
    const canvas = await this.scannerService.toCanvas(blobOrFile);

    // A composed sheet (the ID-card layout) is already square-on and carries
    // its own white margins and labels. Detecting edges on it finds the card
    // artwork rather than the page, so warping to that quad crops the labels
    // off and throws away the true card proportions.
    const fullPage = this.scannerService.fullPageCorners(canvas.width, canvas.height);
    const detection = opts.alreadyComposed
      ? { corners: fullPage, confidence: 100, lowConfidence: false }
      : await this.scannerService.detectDocumentEdges(canvas);

    this.activeCropCorners = { ...detection.corners };
    this.activeConfidence = detection.confidence;
    this.isLowConfidence = detection.lowConfidence;
    this.cropMode = detection.lowConfidence ? 'manual' : 'auto';

    // Preset selection based on mode
    let targetPreset: EnhancementPreset = 'document';
    if (mode === 'whiteboard') targetPreset = 'whiteboard';
    else if (mode === 'photo') targetPreset = 'photo';

    const enhancementConfig: EnhancementOptions = {
      preset: targetPreset,
      brightness: 0,
      contrast: 0,
      sharpen: targetPreset === 'photo' ? 0 : 20
    };

    // Perspective warp & enhancement
    const warpedCanvas = opts.alreadyComposed
      ? canvas
      : await this.scannerService.perspectiveWarp(canvas, this.activeCropCorners);
    const enhancedCanvas = opts.alreadyComposed
      ? warpedCanvas
      : await this.scannerService.enhanceImage(warpedCanvas, enhancementConfig);
    const processedBlob = await this.scannerService.canvasToBlob(enhancedCanvas);
    const processedUrl = this.fileService.createObjectUrl(processedBlob);

    // H4: Blur gate sharpness score
    const blurRes = await this.scannerService.calculateBlurScore(enhancedCanvas);

    // H6: Finger detection check
    const fingerRes = await this.scannerService.detectFingerIntrusions(enhancedCanvas);

    // H7: Curvature detection check. Measure only -- `dewarpCurvature` would
    // also build the straightened canvas, which capture then discarded.
    const curvatureRes = await this.scannerService.detectCurvature(enhancedCanvas);

    const newPage: ScannedPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      pageNumber: this.pages.length + 1,
      originalImageBlob: blobOrFile,
      originalImageUrl: originalUrl,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      corners: { ...this.activeCropCorners },
      detectionConfidence: detection.confidence,
      lowConfidence: detection.lowConfidence,
      rotation: 0,
      enhancement: { ...enhancementConfig },
      processedImageBlob: processedBlob,
      processedImageUrl: processedUrl,
      processedWidth: enhancedCanvas.width,
      processedHeight: enhancedCanvas.height,
      scanMode: mode,
      blurScore: blurRes.score,
      blurPercent: blurRes.scorePercent,
      isBlurry: blurRes.isBlurry,
      fingerDetected: fingerRes.detected,
      curvatureDetected: curvatureRes.curvatureDetected,
      curvatureMagnitude: curvatureRes.curvatureMagnitude,
      shadowRemovalApplied: false,
      fingerRemoved: false,
      dewarpApplied: false
    };

    this.pages.push(newPage);
    this.activePageIndex = this.pages.length - 1;

    // H8: Auto-naming proposal from first page
    if (this.pages.length === 1 || !this.documentFileName) {
      const titleRes = await this.scannerService.suggestDocumentTitle(enhancedCanvas);
      this.documentFileName = titleRes.sanitizedFileName;
    }

    // H4: Blur prompt if blurry
    if (blurRes.isBlurry) {
      this.lastBlurScore = blurRes.scorePercent;
      this.pendingBlurPageId = newPage.id;
      this.showBlurAlert = true;
    }

    // View navigation: if low confidence and not in batch mode, open crop editor
    if (detection.lowConfidence && !this.batchMode) {
      this.currentView = 'cropping';
      setTimeout(() => this.drawCropCanvas(), 50);
    } else {
      this.currentView = 'pages_list';
    }

    this.cdr.detectChanges();
  }

  // --- H4: BLUR RETAKE ACTIONS ---

  retakeBlurPage(): void {
    this.showBlurAlert = false;
    if (this.pendingBlurPageId) {
      const idx = this.pages.findIndex(p => p.id === this.pendingBlurPageId);
      if (idx !== -1) {
        this.deletePage(idx);
      }
    }
    this.pendingBlurPageId = undefined;
    this.captureFromCamera();
  }

  keepBlurPage(): void {
    this.showBlurAlert = false;
    this.pendingBlurPageId = undefined;
  }

  retakeSpecificPage(index: number): void {
    this.deletePage(index);
    this.captureFromCamera();
  }

  // --- H5: SHADOW REMOVAL TOGGLE ---

  async toggleShadowRemoval(page?: ScannedPage): Promise<void> {
    const p = page || this.activePage;
    if (!p) return;
    this.triggerHaptic(ImpactStyle.Light);
    p.shadowRemovalApplied = !p.shadowRemovalApplied;
    await this.reprocessPage(p);
  }

  // --- H6: FINGER REMOVAL TOGGLE ---

  async toggleFingerRemoval(page?: ScannedPage): Promise<void> {
    const p = page || this.activePage;
    if (!p) return;
    this.triggerHaptic(ImpactStyle.Light);
    p.fingerRemoved = !p.fingerRemoved;
    await this.reprocessPage(p);
  }

  // --- H7: DEWARP CURVATURE TOGGLE ---

  async toggleDewarp(page?: ScannedPage): Promise<void> {
    const p = page || this.activePage;
    if (!p) return;
    this.triggerHaptic(ImpactStyle.Light);
    p.dewarpApplied = !p.dewarpApplied;
    await this.reprocessPage(p);
  }

  private async reprocessPage(page: ScannedPage): Promise<void> {
    const warpedCanvas = await this.scannerService.perspectiveWarp(page.originalImageBlob, page.corners);
    const enhancedCanvas = await this.scannerService.enhanceImage(warpedCanvas, {
      ...page.enhancement,
      removeShadows: page.shadowRemovalApplied,
      removeFinger: page.fingerRemoved,
      dewarpCurvature: page.dewarpApplied
    });
    const newBlob = await this.scannerService.canvasToBlob(enhancedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = newBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(newBlob);
    page.processedWidth = enhancedCanvas.width;
    page.processedHeight = enhancedCanvas.height;

    this.cdr.detectChanges();
  }


  // --- CROP & CORNER ADJUSTMENT ---

  openCropEditor(index: number): void {
    this.activePageIndex = index;
    const page = this.pages[index];
    if (!page) return;

    this.activeCropCorners = { ...page.corners };
    this.activeConfidence = page.detectionConfidence;
    this.isLowConfidence = page.lowConfidence;
    this.cropMode = 'manual';
    this.currentView = 'cropping';
    this.cdr.detectChanges();

    setTimeout(() => this.drawCropCanvas(), 50);
  }

  async applyCrop(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.corners = { ...this.activeCropCorners };
    page.lowConfidence = false;

    // Re-warp and re-enhance
    const warpedCanvas = await this.scannerService.perspectiveWarp(
      page.originalImageBlob,
      page.corners
    );
    const enhancedCanvas = await this.scannerService.enhanceImage(
      warpedCanvas,
      page.enhancement
    );
    const newBlob = await this.scannerService.canvasToBlob(enhancedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = newBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(newBlob);
    page.processedWidth = enhancedCanvas.width;
    page.processedHeight = enhancedCanvas.height;

    this.currentView = 'pages_list';
    this.cdr.detectChanges();
  }

  cancelCrop(): void {
    this.currentView = 'pages_list';
  }

  resetCropToAuto(): void {
    const page = this.activePage;
    if (!page) return;

    this.activeCropCorners = {
      topLeft: { x: Math.round(page.originalWidth * 0.05), y: Math.round(page.originalHeight * 0.05) },
      topRight: { x: Math.round(page.originalWidth * 0.95), y: Math.round(page.originalHeight * 0.05) },
      bottomRight: { x: Math.round(page.originalWidth * 0.95), y: Math.round(page.originalHeight * 0.95) },
      bottomLeft: { x: Math.round(page.originalWidth * 0.05), y: Math.round(page.originalHeight * 0.95) }
    };
    this.drawCropCanvas();
  }

  // --- ENHANCEMENT EDITING ---

  openEnhanceEditor(index: number): void {
    this.activePageIndex = index;
    const page = this.pages[index];
    if (!page) return;

    this.activeEnhancement = { ...page.enhancement };
    this.currentView = 'enhancing';
    this.cdr.detectChanges();
  }

  async selectPreset(preset: EnhancementPreset): Promise<void> {
    this.activeEnhancement.preset = preset;
    await this.refreshEnhancedPage();
  }

  async onFilterParamChange(): Promise<void> {
    await this.refreshEnhancedPage();
  }

  private async refreshEnhancedPage(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.enhancement = { ...this.activeEnhancement };

    const warpedCanvas = await this.scannerService.perspectiveWarp(
      page.originalImageBlob,
      page.corners
    );
    const enhancedCanvas = await this.scannerService.enhanceImage(
      warpedCanvas,
      page.enhancement
    );
    const newBlob = await this.scannerService.canvasToBlob(enhancedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = newBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(newBlob);
    page.processedWidth = enhancedCanvas.width;
    page.processedHeight = enhancedCanvas.height;

    this.cdr.detectChanges();
  }

  doneEnhancing(): void {
    this.currentView = 'pages_list';
  }

  // --- MULTI-PAGE ACTIONS ---

  async rotateActivePage(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.rotation = (page.rotation + 90) % 360;
    const canvas = await this.scannerService.toCanvas(page.processedImageBlob);
    const rotatedCanvas = this.scannerService.rotateCanvas(canvas, 90);
    const rotatedBlob = await this.scannerService.canvasToBlob(rotatedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = rotatedBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(rotatedBlob);
    page.processedWidth = rotatedCanvas.width;
    page.processedHeight = rotatedCanvas.height;

    this.cdr.detectChanges();
  }

  deletePage(index: number): void {
    const page = this.pages[index];
    if (page) {
      this.fileService.revokeObjectUrl(page.originalImageUrl);
      this.fileService.revokeObjectUrl(page.processedImageUrl);
      this.pages.splice(index, 1);

      // Re-index
      this.pages.forEach((p, idx) => (p.pageNumber = idx + 1));
      if (this.activePageIndex >= this.pages.length) {
        this.activePageIndex = Math.max(0, this.pages.length - 1);
      }

      if (this.pages.length === 0) {
        this.currentView = 'empty';
      }
      this.cdr.detectChanges();
    }
  }

  movePage(fromIndex: number, direction: 'up' | 'down'): void {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= this.pages.length) return;

    const temp = this.pages[fromIndex];
    this.pages[fromIndex] = this.pages[toIndex];
    this.pages[toIndex] = temp;

    this.pages.forEach((p, idx) => (p.pageNumber = idx + 1));
    this.activePageIndex = toIndex;
    this.cdr.detectChanges();
  }

  // --- PDF GENERATION & OCR HANDOFF ---

  cancelIdCardScan(): void {
    this.idCardStep = 'front';
    this.idCardFrontBlob = undefined;
    this.cdr.detectChanges();
  }

  toggleBatchMode(): void {
    this.batchMode = !this.batchMode;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.detectChanges();
  }

  /**
   * Typing is left alone; the name is sanitized when the field is committed.
   *
   * Sanitizing on every keystroke ate word separators: `sanitizeFileName`
   * collapses whitespace to `_` and then strips a trailing one, so the space in
   * "My Receipt" was removed the moment it was typed and the next letter landed
   * against the previous word. It also fought the caret on every edit.
   */
  onDocumentFileNameInput(name: string): void {
    this.documentFileName = name;
    this.nameSource = 'manual';
  }

  commitDocumentFileName(): void {
    const clean = this.scannerService.sanitizeFileName(this.documentFileName || '');
    if (clean !== this.documentFileName) {
      this.documentFileName = clean;
      this.cdr.detectChanges();
    }
  }

  /**
   * H8: reads the heading off the top of page 1 and proposes it as the name.
   *
   * Top 35% only -- that is where a title lives, and a strip is a fraction of
   * the OCR cost of a full page. The result goes into the same editable field,
   * never straight onto the file.
   */
  async suggestNameFromContent(): Promise<void> {
    const first = this.pages[0];
    if (!first || this.isSuggestingName) return;

    this.isSuggestingName = true;
    this.cdr.detectChanges();

    try {
      const canvas = await this.scannerService.toCanvas(first.processedImageBlob);
      const stripHeight = Math.max(1, Math.round(canvas.height * 0.35));
      const strip = this.scannerService.createCanvas(canvas.width, stripHeight);
      const ctx = this.scannerService.getContext(strip);
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(canvas, 0, 0, canvas.width, stripHeight, 0, 0, canvas.width, stripHeight);

      const stripBlob = await this.scannerService.canvasToBlob(strip, 'image/png');
      const ocr = await this.ocrService.recognizeRegionWords(stripBlob, 'eng');
      const ranked = this.scannerService.rankTitleLines(ocr.words, stripHeight);

      const result = await this.scannerService.suggestDocumentTitle(
        canvas,
        ranked.length > 0 ? ranked.join('\n') : ocr.text
      );

      this.documentFileName = result.sanitizedFileName;
      this.suggestedTitlePreview = result.proposedTitle;
      this.nameSource = result.source === 'ocr' ? 'ocr' : 'heuristic';

      if (result.source === 'ocr') {
        this.toastService.show('success', this.translationService.translate('scanner.nameFromTextDone'));
      } else {
        this.toastService.show('info', this.translationService.translate('scanner.nameFromTextEmpty'));
      }
    } catch (err: any) {
      this.toastService.show('error', this.translationService.translate('scanner.nameFromTextFailed'));
    } finally {
      this.isSuggestingName = false;
      this.cdr.detectChanges();
    }
  }

  async generatePdf(): Promise<void> {
    if (this.pages.length === 0) return;

    this.isGeneratingPdf = true;
    this.cdr.detectChanges();

    try {
      const files: File[] = [];
      for (const p of this.pages) {
        files.push(
          new File([p.processedImageBlob], `scanned_page_${p.pageNumber}.jpg`, {
            type: 'image/jpeg'
          })
        );
      }

      const result = await this.pdfService.imagesToPdf(files, this.pdfConfig);
      if (result.success && result.file) {
        let finalFile = result.file;
        if (this.documentFileName && this.documentFileName.trim()) {
          const sanitized = this.scannerService.sanitizeFileName(this.documentFileName.trim());
          const fullName = sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
          finalFile = new File([result.file], fullName, { type: 'application/pdf' });
        }
        this.generatedPdfFile = finalFile;
        this.currentView = 'pdf_ready';
        await this.historyService.addHistoryItem({
          operation: 'scanner',
          originalFileName: `Scanned Document (${this.pages.length} pages)`,
          outputFileName: finalFile.name,
          originalSizeBytes: finalFile.size,
          outputSizeBytes: finalFile.size,
          outputDimensions: `${this.pages.length} pages`
        });
        this.toastService.show('success', 'Scanned PDF created successfully!');
      } else {
        this.toastService.show('error', result.error || 'Failed to create PDF.');
      }
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Error generating PDF.');
    } finally {
      this.isGeneratingPdf = false;
      this.cdr.detectChanges();
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.generatedPdfFile) return;
    await this.storageService.saveFile(this.generatedPdfFile);
    this.toastService.show('success', 'PDF saved to device!');
  }

  async sharePdf(): Promise<void> {
    if (!this.generatedPdfFile) return;
    await this.shareService.shareFile(this.generatedPdfFile);
  }

  /**
   * "Make Searchable" naturally bridges into the Smart PDF OCR feature.
   */
  makeSearchableWithOcr(): void {
    if (!this.generatedPdfFile) return;

    this.documentBridgeService.setOcrTarget({
      file: this.generatedPdfFile,
      source: 'scanner',
      metadata: { pageCount: this.pages.length }
    });

    this.router.navigate(['/features/pdf-ocr']);
  }

  scanForQrCodes(): void {
    if (!this.generatedPdfFile) return;

    this.documentBridgeService.setQrTarget({
      file: this.generatedPdfFile,
      source: 'scanner'
    });

    this.router.navigate(['/features/qr-barcode']);
  }

  resetScanner(): void {
    for (const p of this.pages) {
      this.fileService.revokeObjectUrl(p.originalImageUrl);
      this.fileService.revokeObjectUrl(p.processedImageUrl);
    }
    this.pages = [];
    this.generatedPdfFile = undefined;
    this.currentView = 'empty';
    this.cdr.detectChanges();
  }

  // --- CANVAS INTERACTION FOR 4-CORNER DRAG ---

  private drawCropCanvas(): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    const page = this.activePage;
    if (!canvas || !page) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Fit image inside container dimensions
      const maxW = canvas.parentElement?.clientWidth || 400;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      const maxH = isMobile
        ? Math.min(window.innerHeight * 0.42, 340)
        : 480;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      this.canvasScale = scale;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw quadrilateral
      const pts = [
        this.scalePoint(this.activeCropCorners.topLeft, scale),
        this.scalePoint(this.activeCropCorners.topRight, scale),
        this.scalePoint(this.activeCropCorners.bottomRight, scale),
        this.scalePoint(this.activeCropCorners.bottomLeft, scale)
      ];

      // Draw polygon outline
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fill();

      // Draw 4 Corner Handles
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
      }
    };
    img.src = page.originalImageUrl;
  }

  private scalePoint(p: Point, scale: number): Point {
    return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) };
  }

  onCanvasPointerDown(e: MouseEvent | TouchEvent): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const hitRadius = 24;
    const corners = this.activeCropCorners;
    const scale = this.canvasScale;

    const hit = (p: Point) => Math.hypot(p.x * scale - x, p.y * scale - y) < hitRadius;

    if (hit(corners.topLeft)) this.activeDraggingPoint = 'topLeft';
    else if (hit(corners.topRight)) this.activeDraggingPoint = 'topRight';
    else if (hit(corners.bottomRight)) this.activeDraggingPoint = 'bottomRight';
    else if (hit(corners.bottomLeft)) this.activeDraggingPoint = 'bottomLeft';
  }

  onCanvasPointerMove(e: MouseEvent | TouchEvent): void {
    if (!this.activeDraggingPoint) return;
    const canvas = this.cropCanvasRef?.nativeElement;
    const page = this.activePage;
    if (!canvas || !page) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / this.canvasScale;
    const y = (clientY - rect.top) / this.canvasScale;

    // Clamp within original image boundaries
    const clampedX = Math.max(0, Math.min(page.originalWidth, Math.round(x)));
    const clampedY = Math.max(0, Math.min(page.originalHeight, Math.round(y)));

    this.activeCropCorners[this.activeDraggingPoint] = { x: clampedX, y: clampedY };
    this.drawCropCanvas();
  }

  onCanvasPointerUp(): void {
    this.activeDraggingPoint = null;
  }
}
