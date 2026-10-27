import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IdPhotoService } from '../../../core/services/id-photo.service';
import { CompressionService } from '../../../core/services/compression.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import {
  FaceBoundingBox,
  IdPhotoPreset,
  ID_PHOTO_PRESETS,
  IdPhotoCropOptions,
  IdPhotoBackgroundOptions,
  PrintSheetOptions,
  BackgroundSuitabilityResult
} from '../../../core/models/id-photo.types';
import { SingleFileWorkflowState } from '../../../core/models/file-workflow-state.model';
import { ResultPreviewComponent, PreviewData } from '../../../shared/components/result-preview/result-preview.component';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  AppConversionAnimationComponent,
  AutoScrollDirective,
  TranslatePipe
} from '../../../shared/components/ui';

@Component({
  selector: 'app-id-photo',
  templateUrl: './id-photo.page.html',
  styleUrls: ['./id-photo.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    ResultPreviewComponent,
    AppConversionAnimationComponent,
    AutoScrollDirective,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class IdPhotoPage implements AfterViewInit, OnDestroy {
  private idPhotoService = inject(IdPhotoService);
  private compressionService = inject(CompressionService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private documentBridge = inject(DocumentBridgeService);
  private toast = inject(ToastService);
  translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';
  activeTab: 'crop' | 'background' | 'sheet' = 'crop';

  originalFile?: File;
  originalPreviewUrl?: string;
  sourceImage?: HTMLImageElement;
  imgWidth = 0;
  imgHeight = 0;

  // Face Detection & Crop State
  detectedFace: FaceBoundingBox | null = null;
  currentFaceBox: FaceBoundingBox = { x: 0, y: 0, width: 0, height: 0 };
  headHeightPct = 72; // 72% head height ratio
  eyeLinePct = 43; // 43% from top of crop
  isFaceDetecting = false;
  manualGuideMode = true;

  /**
   * Guide-dragging state. `FaceDetector` ships in almost no Android WebView, so
   * on the devices this app targets the manual guide is not a fallback — it is
   * the only path, and it is useless if the box cannot be moved to the face.
   */
  private dragMode: 'none' | 'move' | 'resize' = 'none';
  private activeHandle: 'tl' | 'tr' | 'bl' | 'br' | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragStartBox: FaceBoundingBox = { x: 0, y: 0, width: 0, height: 0 };
  /** Scale from source pixels to on-screen pixels, kept for hit-testing handles. */
  private previewScale = 1;

  // Presets & Sizing
  presets: IdPhotoPreset[] = ID_PHOTO_PRESETS;
  selectedPreset: IdPhotoPreset = ID_PHOTO_PRESETS[0];
  customTargetKB = 50;
  isCustomSize = false;
  customWidthPx = 413;
  customHeightPx = 531;

  // Background Replacement (I2)
  replaceBackground = false;
  selectedBgColor: 'white' | 'light-blue' = 'white';
  suitability: BackgroundSuitabilityResult = { suitable: true, variance: 0 };

  // Print Sheet (I2)
  sheetPaperSize: '4x6' | 'a4' = '4x6';
  sheetCopies = 6;
  includeCutMarks = true;
  sheetGapMm = 3;
  sheetMode = false;

  // Processing & Output
  isProcessing = false;
  processingProgress = 0;
  stageText = '';
  errorMessage?: string;

  processedFile?: File;
  processedPreviewUrl?: string;
  processedDims?: { width: number; height: number };

  ngAfterViewInit() {
    this.drawPreview();
  }

  /**
   * The preview is sized from the viewport, so a rotation has to re-lay it out;
   * otherwise the canvas keeps its old size and the guide stops lining up with
   * the photo under it.
   */
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    this.drawPreview();
  }

  ngOnDestroy() {
    this.releasePreviewUrls();
  }

  private releasePreviewUrls() {
    if (this.originalPreviewUrl) URL.revokeObjectURL(this.originalPreviewUrl);
    if (this.processedPreviewUrl) URL.revokeObjectURL(this.processedPreviewUrl);
    this.originalPreviewUrl = undefined;
    this.processedPreviewUrl = undefined;
  }

  get beforePreviewData(): PreviewData | undefined {
    if (!this.originalFile) return undefined;
    return {
      name: this.originalFile.name,
      type: this.originalFile.type,
      sizeBytes: this.originalFile.size,
      width: this.imgWidth || undefined,
      height: this.imgHeight || undefined
    };
  }

  get afterPreviewData(): PreviewData | undefined {
    if (!this.processedFile) return undefined;
    return {
      name: this.processedFile.name,
      type: this.processedFile.type,
      sizeBytes: this.processedFile.size,
      width: this.processedDims?.width,
      height: this.processedDims?.height
    };
  }

  async onFileSelected(file: File) {
    this.releasePreviewUrls();
    this.originalFile = file;
    this.errorMessage = undefined;
    this.workflowState = 'CONFIGURING';
    this.originalPreviewUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = async () => {
      this.sourceImage = img;
      this.imgWidth = img.width;
      this.imgHeight = img.height;

      // Initial face box: attempt auto-detection via FaceDetector API
      this.isFaceDetecting = true;
      this.cdr.detectChanges();

      try {
        const detected = await this.idPhotoService.detectFace(img);
        if (detected) {
          this.detectedFace = detected;
          this.currentFaceBox = { ...detected };
          this.manualGuideMode = false;
        } else {
          // Primary fallback: sensible centered manual guide box
          this.detectedFace = null;
          this.currentFaceBox = this.idPhotoService.getDefaultFaceBox(img.width, img.height);
          this.manualGuideMode = true;
        }
      } catch {
        this.currentFaceBox = this.idPhotoService.getDefaultFaceBox(img.width, img.height);
        this.manualGuideMode = true;
      } finally {
        this.isFaceDetecting = false;
        this.checkBackgroundSuitability();
        this.drawPreview();
        this.cdr.detectChanges();
      }
    };
    img.src = this.originalPreviewUrl;
  }

  selectPreset(preset: IdPhotoPreset) {
    this.selectedPreset = preset;
    this.isCustomSize = false;
    this.customWidthPx = preset.widthPx;
    this.customHeightPx = preset.heightPx;
    this.customTargetKB = preset.targetKB;
    this.drawPreview();
  }

  /** Exact px and KB entry, for a portal spec no preset covers. */
  useCustomSize() {
    this.isCustomSize = true;
    this.drawPreview();
  }

  onCustomSizeChange() {
    this.customWidthPx = Math.round(this.clamp(Number(this.customWidthPx) || 1, 50, 4000));
    this.customHeightPx = Math.round(this.clamp(Number(this.customHeightPx) || 1, 50, 4000));
    this.customTargetKB = Math.round(this.clamp(Number(this.customTargetKB) || 1, 5, 2000));
    this.drawPreview();
  }

  /** Width / height actually used for the crop and the output. */
  get outputWidthPx(): number {
    return this.isCustomSize ? this.customWidthPx : this.selectedPreset.widthPx;
  }

  get outputHeightPx(): number {
    return this.isCustomSize ? this.customHeightPx : this.selectedPreset.heightPx;
  }

  async autoDetectFace() {
    if (!this.sourceImage) return;
    this.isFaceDetecting = true;
    this.cdr.detectChanges();
    try {
      const detected = await this.idPhotoService.detectFace(this.sourceImage);
      if (detected) {
        this.detectedFace = detected;
        this.currentFaceBox = { ...detected };
        this.manualGuideMode = false;
        this.toast.success('Face detected successfully.');
      } else {
        this.toast.info('No face detected. The manual guide overlay is active for adjustment.');
        this.manualGuideMode = true;
      }
    } catch {
      this.toast.info('Manual guide overlay is active for positioning.');
      this.manualGuideMode = true;
    } finally {
      this.isFaceDetecting = false;
      this.drawPreview();
      this.cdr.detectChanges();
    }
  }

  onParamChange() {
    this.drawPreview();
  }

  checkBackgroundSuitability() {
    if (!this.sourceImage) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.sourceImage.width;
    tempCanvas.height = this.sourceImage.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.sourceImage, 0, 0);
    this.suitability = this.idPhotoService.checkBackgroundSuitability(tempCanvas, this.currentFaceBox);
  }

  /** Source-image coordinates for a pointer event over the preview canvas. */
  private toImageCoords(e: PointerEvent): { x: number; y: number } {
    const canvas = this.previewCanvasRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const img = this.sourceImage!;
    const scaleX = rect.width > 0 ? img.width / rect.width : 1;
    const scaleY = rect.height > 0 ? img.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** Corner handle positions in source coordinates. */
  private handlePositions(): Array<{ id: 'tl' | 'tr' | 'bl' | 'br'; x: number; y: number }> {
    const b = this.currentFaceBox;
    return [
      { id: 'tl', x: b.x, y: b.y },
      { id: 'tr', x: b.x + b.width, y: b.y },
      { id: 'bl', x: b.x, y: b.y + b.height },
      { id: 'br', x: b.x + b.width, y: b.y + b.height }
    ];
  }

  onGuidePointerDown(e: PointerEvent) {
    if (!this.sourceImage || !this.previewCanvasRef?.nativeElement) return;
    e.preventDefault();
    try {
      this.previewCanvasRef.nativeElement.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is unavailable on some older WebViews; dragging still works.
    }

    const p = this.toImageCoords(e);
    this.dragStart = p;
    this.dragStartBox = { ...this.currentFaceBox };

    // A 22px on-screen grab radius, expressed in source pixels.
    const grabRadius = 22 / Math.max(this.previewScale, 0.0001);
    const hit = this.handlePositions().find(
      h => Math.abs(h.x - p.x) <= grabRadius && Math.abs(h.y - p.y) <= grabRadius
    );

    if (hit) {
      this.dragMode = 'resize';
      this.activeHandle = hit.id;
    } else {
      this.dragMode = 'move';
      this.activeHandle = null;
      const b = this.currentFaceBox;
      const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
      if (!inside) {
        // Tapping away from the guide recentres it there, which beats dragging
        // the box across the photo one thumb-width at a time.
        this.currentFaceBox = {
          ...b,
          x: Math.round(p.x - b.width / 2),
          y: Math.round(p.y - b.height / 2)
        };
        this.dragStartBox = { ...this.currentFaceBox };
        this.clampFaceBox();
        this.markGuideEdited();
        this.drawPreview();
      }
    }
  }

  onGuidePointerMove(e: PointerEvent) {
    if (this.dragMode === 'none' || !this.sourceImage) return;
    e.preventDefault();
    const p = this.toImageCoords(e);
    const dx = p.x - this.dragStart.x;
    const dy = p.y - this.dragStart.y;
    const start = this.dragStartBox;
    const minSize = Math.max(24, this.sourceImage.width * 0.05);

    if (this.dragMode === 'move') {
      this.currentFaceBox = {
        ...start,
        x: Math.round(start.x + dx),
        y: Math.round(start.y + dy)
      };
    } else if (this.dragMode === 'resize' && this.activeHandle) {
      let { x, y, width, height } = start;
      const right = start.x + start.width;
      const bottom = start.y + start.height;

      if (this.activeHandle === 'tl' || this.activeHandle === 'bl') {
        x = Math.min(start.x + dx, right - minSize);
        width = right - x;
      } else {
        width = Math.max(minSize, start.width + dx);
      }
      if (this.activeHandle === 'tl' || this.activeHandle === 'tr') {
        y = Math.min(start.y + dy, bottom - minSize);
        height = bottom - y;
      } else {
        height = Math.max(minSize, start.height + dy);
      }

      this.currentFaceBox = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      };
    }

    this.clampFaceBox();
    this.markGuideEdited();
    this.drawPreview();
  }

  onGuidePointerUp(e?: PointerEvent) {
    if (this.dragMode === 'none') return;
    this.dragMode = 'none';
    this.activeHandle = null;
    if (e && this.previewCanvasRef?.nativeElement) {
      try {
        this.previewCanvasRef.nativeElement.releasePointerCapture(e.pointerId);
      } catch {
        // Nothing to release.
      }
    }
    // The guide defines the background sample area, so re-read it once settled.
    this.checkBackgroundSuitability();
    this.cdr.detectChanges();
  }

  /** Keeps the guide inside the photo and no smaller than a usable box. */
  private clampFaceBox() {
    if (!this.sourceImage) return;
    const iw = this.sourceImage.width;
    const ih = this.sourceImage.height;
    const minSize = Math.max(24, Math.round(iw * 0.05));
    let { x, y, width, height } = this.currentFaceBox;

    width = this.clamp(width, minSize, iw);
    height = this.clamp(height, minSize, ih);
    x = this.clamp(x, 0, iw - width);
    y = this.clamp(y, 0, ih - height);

    this.currentFaceBox = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  /** Once the user moves the guide it is theirs, not the detector's. */
  private markGuideEdited() {
    if (!this.manualGuideMode) {
      this.manualGuideMode = true;
    }
  }

  resetGuide() {
    if (!this.sourceImage) return;
    this.currentFaceBox = this.detectedFace
      ? { ...this.detectedFace }
      : this.idPhotoService.getDefaultFaceBox(this.sourceImage.width, this.sourceImage.height);
    this.manualGuideMode = !this.detectedFace;
    this.checkBackgroundSuitability();
    this.drawPreview();
    this.cdr.detectChanges();
  }

  /**
   * The viewport card is padded, so `clientWidth` overstates the room the
   * canvas actually has; the surplus comes straight back as a CSS downscale
   * through `max-width: 100%`, which throws off pointer hit-testing.
   */
  private availableCanvasWidth(canvas: HTMLCanvasElement): number {
    const parent = canvas.parentElement;
    if (!parent) return Math.max(160, window.innerWidth - 32);
    const cs = getComputedStyle(parent);
    const padding = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
    return Math.max(160, parent.clientWidth - padding);
  }

  drawPreview() {
    if (!this.sourceImage || !this.previewCanvasRef?.nativeElement) return;
    const canvas = this.previewCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale canvas to display nicely on mobile
    const maxDisplayW = Math.min(this.availableCanvasWidth(canvas), 480);
    const maxDisplayH = Math.min(window.innerHeight * 0.42, 380);
    const scale = Math.min(maxDisplayW / this.sourceImage.width, maxDisplayH / this.sourceImage.height, 1);
    this.previewScale = scale;
    canvas.width = Math.round(this.sourceImage.width * scale);
    canvas.height = Math.round(this.sourceImage.height * scale);

    // Draw photo
    ctx.drawImage(this.sourceImage, 0, 0, canvas.width, canvas.height);

    // Calculate crop boundary
    const targetAspect = this.outputWidthPx / this.outputHeightPx;
    const crop = this.idPhotoService.calculateCropBox(
      this.sourceImage.width,
      this.sourceImage.height,
      this.currentFaceBox,
      {
        headHeightRatio: this.headHeightPct / 100,
        eyeLineRatio: this.eyeLinePct / 100,
        aspectRatio: targetAspect
      }
    );

    // Darken areas outside crop box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = Math.round(crop.x * scale);
    const cy = Math.round(crop.y * scale);
    const cw = Math.round(crop.width * scale);
    const ch = Math.round(crop.height * scale);

    // Clear inside crop area to show photo
    ctx.drawImage(
      this.sourceImage,
      crop.x, crop.y, crop.width, crop.height,
      cx, cy, cw, ch
    );

    // Draw crop box border
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    // Draw face guide oval / box
    const fx = Math.round(this.currentFaceBox.x * scale);
    const fy = Math.round(this.currentFaceBox.y * scale);
    const fw = Math.round(this.currentFaceBox.width * scale);
    const fh = Math.round(this.currentFaceBox.height * scale);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    // Draw head guide oval
    ctx.beginPath();
    ctx.ellipse(fx + fw / 2, fy + fh / 2, fw / 2, fh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw eye-line marker
    const eyeY = fy + Math.round(fh * 0.42);
    ctx.strokeStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx, eyeY);
    ctx.lineTo(cx + cw, eyeY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Corner grab handles. They are the only way to resize the guide, so they
    // are drawn big enough to find and hit with a thumb.
    const handleRadius = 9;
    for (const h of this.handlePositions()) {
      const hx = Math.round(h.x * scale);
      const hy = Math.round(h.y * scale);
      ctx.beginPath();
      ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#4f46e5';
      ctx.stroke();
    }
  }

  async generateIdPhoto() {
    if (!this.sourceImage || !this.originalFile) return;

    this.isProcessing = true;
    this.processingProgress = 20;
    this.stageText = 'Aligning head and eye-line...';
    this.cdr.detectChanges();

    try {
      const targetW = this.outputWidthPx;
      const targetH = this.outputHeightPx;
      const targetKB = this.isCustomSize ? this.customTargetKB : this.selectedPreset.targetKB;

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = this.sourceImage.width;
      fullCanvas.height = this.sourceImage.height;
      const fctx = fullCanvas.getContext('2d')!;
      fctx.drawImage(this.sourceImage, 0, 0);

      this.processingProgress = 40;
      this.stageText = 'Cropping to standard passport geometry...';
      this.cdr.detectChanges();

      const cropOpts: IdPhotoCropOptions = {
        headHeightRatio: this.headHeightPct / 100,
        eyeLineRatio: this.eyeLinePct / 100,
        aspectRatio: targetW / targetH
      };

      const bgOpts: IdPhotoBackgroundOptions = {
        replace: this.replaceBackground,
        color: this.selectedBgColor
      };

      // Replacement is skipped on a cluttered background rather than tearing a
      // matte, so say so instead of quietly handing back an unchanged photo.
      if (this.replaceBackground && !this.suitability.suitable) {
        this.toast.info(
          this.suitability.reason ||
            'Background was left as-is: it is too cluttered for a clean replacement.'
        );
      }

      const idPhotoCanvas = this.idPhotoService.renderIdPhoto(
        fullCanvas,
        this.currentFaceBox,
        cropOpts,
        targetW,
        targetH,
        bgOpts
      );

      this.processingProgress = 65;

      let finalCanvas = idPhotoCanvas;
      if (this.sheetMode) {
        this.stageText = 'Laying out print sheet with cut marks...';
        this.cdr.detectChanges();

        const sheetOpts: PrintSheetOptions = {
          paperSize: this.sheetPaperSize,
          copies: this.sheetCopies,
          gapMm: this.sheetGapMm,
          includeCutMarks: this.includeCutMarks,
          dpi: 300
        };
        finalCanvas = this.idPhotoService.generatePrintSheet(idPhotoCanvas, sheetOpts);
      }

      this.stageText = 'Optimizing to exact KB target...';
      this.cdr.detectChanges();

      // Convert final canvas to blob
      const rawBlob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob(b => b ? resolve(b) : reject('Blob conversion failed'), 'image/jpeg', 0.95);
      });

      const initialFile = new File([rawBlob], this.sheetMode ? 'id_photo_sheet.jpg' : 'id_photo.jpg', {
        type: 'image/jpeg'
      });

      /*
       * A print sheet is a master for paper, not an upload: a KB ceiling only
       * puts JPEG blocking on something about to be printed at 300 DPI, and the
       * 25-iteration quality search over a 1200x1800 canvas is most of the wait.
       * Encode it once at high quality instead. The KB target still governs the
       * single photo, where meeting a portal's size limit is the whole point.
       */
      if (this.sheetMode) {
        const sheetBlob = await new Promise<Blob>((resolve, reject) => {
          finalCanvas.toBlob(
            b => (b ? resolve(b) : reject(new Error('Sheet encoding failed'))),
            'image/jpeg',
            0.95
          );
        });
        this.processedFile = new File([sheetBlob], 'id_photo_sheet.jpg', { type: 'image/jpeg' });
        this.processedPreviewUrl = URL.createObjectURL(this.processedFile);
        this.processedDims = { width: finalCanvas.width, height: finalCanvas.height };
        this.processingProgress = 100;
        this.workflowState = 'SUCCESS';
        this.toast.success('Print sheet ready.');
        return;
      }

      const compressResult = await this.compressionService.compressToExactKB(initialFile, {
        targetKB,
        outputFormat: 'image/jpeg',
        exactDimensions: { width: finalCanvas.width, height: finalCanvas.height }
      });

      this.processingProgress = 100;

      if (compressResult.success && compressResult.file) {
        this.processedFile = compressResult.file;
        this.processedPreviewUrl = URL.createObjectURL(compressResult.file);
        this.processedDims = { width: finalCanvas.width, height: finalCanvas.height };
        this.workflowState = 'SUCCESS';
        this.toast.success('ID Photo ready.');
      } else {
        this.processedFile = initialFile;
        this.processedPreviewUrl = URL.createObjectURL(initialFile);
        this.processedDims = { width: finalCanvas.width, height: finalCanvas.height };
        this.workflowState = 'SUCCESS';
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to generate ID photo.';
      this.toast.error(this.errorMessage || 'An error occurred.');
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  reset() {
    this.releasePreviewUrls();
    this.workflowState = 'EMPTY';
    this.originalFile = undefined;
    this.sourceImage = undefined;
    this.processedFile = undefined;
    this.errorMessage = undefined;
    this.detectedFace = null;
    this.manualGuideMode = true;
    this.activeTab = 'crop';
    this.dragMode = 'none';
    this.suitability = { suitable: true, variance: 0 };
  }

  async saveOutput() {
    if (!this.processedFile || !this.originalFile) return;
    const uri = await this.storageService.saveFile(this.processedFile, 'photo');
    if (uri && uri !== 'web-download') {
      await this.historyService.addHistoryItem({
        operation: 'photo',
        originalFileName: this.originalFile.name,
        outputFileName: this.processedFile.name,
        originalSizeBytes: this.originalFile.size,
        outputSizeBytes: this.processedFile.size,
        outputPath: uri
      });
      this.toast.success('Saved to your device.');
    }
  }

  async shareOutput() {
    if (!this.processedFile) return;
    await this.shareService.shareFile(this.processedFile);
  }

  openInPhotoTools() {
    if (!this.processedFile) return;
    this.documentBridge.setDocument(this.processedFile, 'photo');
  }
}
