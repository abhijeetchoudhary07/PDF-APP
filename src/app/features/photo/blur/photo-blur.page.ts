import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageRedactionService } from '../../../core/services/image-redaction.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { RedactionRegion } from '../../../core/models/image-redaction.types';
import { SingleFileWorkflowState } from '../../../core/models/file-workflow-state.model';
import { ResultPreviewComponent, PreviewData } from '../../../shared/components/result-preview/result-preview.component';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  AppConversionAnimationComponent,
  TranslatePipe
} from '../../../shared/components/ui';

@Component({
  selector: 'app-photo-blur',
  templateUrl: './photo-blur.page.html',
  styleUrls: ['./photo-blur.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    ResultPreviewComponent,
    AppConversionAnimationComponent,
    TranslatePipe
  ]
})
export class PhotoBlurPage implements AfterViewInit, OnDestroy {
  private redactionService = inject(ImageRedactionService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private documentBridge = inject(DocumentBridgeService);
  private toast = inject(ToastService);
  translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('redactCanvas') redactCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';

  originalFile?: File;
  originalPreviewUrl?: string;
  sourceImage?: HTMLImageElement;
  imgWidth = 0;
  imgHeight = 0;

  // Redaction regions
  regions: RedactionRegion[] = [];
  selectedType: 'blur' | 'pixelate' = 'blur';
  intensity = 6;
  isDetectingFaces = false;

  // Touch/Mouse drawing state
  isDrawing = false;
  startX = 0;
  startY = 0;
  currentX = 0;
  currentY = 0;
  displayScale = 1;

  // Processing state
  isProcessing = false;
  processingProgress = 0;
  stageText = '';
  errorMessage?: string;

  processedFile?: File;
  processedPreviewUrl?: string;

  ngAfterViewInit() {
    this.redrawCanvas();
  }

  /**
   * The canvas is sized from the viewport, so a rotation or a soft-keyboard
   * resize has to re-lay it out — otherwise it keeps the old size and the
   * drawn regions no longer line up with what is on screen.
   */
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    this.redrawCanvas();
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
      width: this.imgWidth || undefined,
      height: this.imgHeight || undefined
    };
  }

  async onFileSelected(file: File) {
    this.releasePreviewUrls();
    this.originalFile = file;
    this.errorMessage = undefined;
    this.workflowState = 'CONFIGURING';
    this.originalPreviewUrl = URL.createObjectURL(file);
    this.regions = [];

    const img = new Image();
    img.onload = async () => {
      this.sourceImage = img;
      this.imgWidth = img.width;
      this.imgHeight = img.height;
      this.redrawCanvas();
      this.autoDetectFaces();
    };
    img.src = this.originalPreviewUrl;
  }

  async autoDetectFaces() {
    if (!this.sourceImage) return;
    this.isDetectingFaces = true;
    this.cdr.detectChanges();

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.sourceImage.width;
      tempCanvas.height = this.sourceImage.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(this.sourceImage, 0, 0);
        const detected = await this.redactionService.detectFacesForRedaction(tempCanvas);
        if (detected.length > 0) {
          this.regions = [...this.regions, ...detected];
          this.toast.success(`Detected ${detected.length} face(s).`);
        }
      }
    } catch {
      // Fallback: draw manually
    } finally {
      this.isDetectingFaces = false;
      this.redrawCanvas();
      this.cdr.detectChanges();
    }
  }

  /**
   * Maps a pointer position to source-image pixels.
   *
   * The canvas backing store and its on-screen box are not the same size — the
   * viewport card caps it with `max-width: 100%` — so the conversion has to go
   * through the live bounding rect. Scaling by `displayScale` alone put every
   * drawn region short of where it was drawn, leaving part of the face or plate
   * the user meant to hide still visible.
   */
  private toImageCoords(e: PointerEvent): { x: number; y: number } {
    const canvas = this.redactCanvasRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const img = this.sourceImage!;
    const scaleX = rect.width > 0 ? img.width / rect.width : 1;
    const scaleY = rect.height > 0 ? img.height / rect.height : 1;
    return {
      x: this.clamp((e.clientX - rect.left) * scaleX, 0, img.width),
      y: this.clamp((e.clientY - rect.top) * scaleY, 0, img.height)
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // Pointer / Touch drawing handlers for mobile
  onPointerDown(e: PointerEvent) {
    if (!this.sourceImage || !this.redactCanvasRef?.nativeElement) return;
    e.preventDefault();
    // Capture so a drag that leaves the canvas still ends on this element.
    try {
      this.redactCanvasRef.nativeElement.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is unavailable on some older WebViews; drawing still works.
    }
    const p = this.toImageCoords(e);
    this.isDrawing = true;
    this.startX = p.x;
    this.startY = p.y;
    this.currentX = p.x;
    this.currentY = p.y;
  }

  onPointerMove(e: PointerEvent) {
    if (!this.isDrawing || !this.sourceImage || !this.redactCanvasRef?.nativeElement) return;
    e.preventDefault();
    const p = this.toImageCoords(e);
    this.currentX = p.x;
    this.currentY = p.y;
    this.redrawCanvas();
  }

  onPointerUp(e?: PointerEvent) {
    if (!this.isDrawing || !this.sourceImage) return;
    this.isDrawing = false;

    if (e && this.redactCanvasRef?.nativeElement) {
      try {
        this.redactCanvasRef.nativeElement.releasePointerCapture(e.pointerId);
      } catch {
        // Nothing to release.
      }
    }

    let x = Math.min(this.startX, this.currentX);
    let y = Math.min(this.startY, this.currentY);
    let width = Math.abs(this.currentX - this.startX);
    let height = Math.abs(this.currentY - this.startY);

    // A tap is a region too: the on-screen instruction offers it, and on a
    // phone it is far easier than a precise drag. Drop a box around the tap,
    // sized relative to the photo so it is useful at any resolution.
    const minDragPx = Math.max(10, this.sourceImage.width * 0.02);
    if (width < minDragPx && height < minDragPx) {
      const tapSize = Math.round(Math.min(this.sourceImage.width, this.sourceImage.height) * 0.18);
      width = tapSize;
      height = tapSize;
      x = this.startX - tapSize / 2;
      y = this.startY - tapSize / 2;
    }

    x = this.clamp(x, 0, this.sourceImage.width - 1);
    y = this.clamp(y, 0, this.sourceImage.height - 1);
    width = this.clamp(width, 1, this.sourceImage.width - x);
    height = this.clamp(height, 1, this.sourceImage.height - y);

    this.regions.push({
      id: 'region_' + Date.now() + '_' + this.regions.length,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      type: this.selectedType,
      intensity: this.intensity,
      label: `Region ${this.regions.length + 1}`
    });

    this.redrawCanvas();
    this.cdr.detectChanges();
  }

  /**
   * Mode and intensity are page-level controls, so they apply to every marked
   * region — otherwise moving the slider silently changes nothing the user can
   * see, because the overlay only tints the region.
   */
  setRedactionType(type: 'blur' | 'pixelate') {
    this.selectedType = type;
    this.regions = this.regions.map(r => ({ ...r, type }));
    this.redrawCanvas();
  }

  onIntensityChange() {
    this.regions = this.regions.map(r => ({ ...r, intensity: this.intensity }));
    this.redrawCanvas();
  }

  removeRegion(index: number) {
    this.regions.splice(index, 1);
    this.redrawCanvas();
  }

  clearAllRegions() {
    this.regions = [];
    this.redrawCanvas();
  }

  /**
   * The viewport card is padded, so `clientWidth` overstates what the canvas
   * can occupy; the surplus was handed straight back by `max-width: 100%` as a
   * CSS downscale, which is what knocked the drawn regions out of alignment.
   */
  private availableCanvasWidth(canvas: HTMLCanvasElement): number {
    const parent = canvas.parentElement;
    if (!parent) return Math.max(160, window.innerWidth - 32);
    const cs = getComputedStyle(parent);
    const padding = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
    return Math.max(160, parent.clientWidth - padding);
  }

  redrawCanvas() {
    if (!this.sourceImage || !this.redactCanvasRef?.nativeElement) return;
    const canvas = this.redactCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxDisplayW = Math.min(this.availableCanvasWidth(canvas), 540);
    const maxDisplayH = Math.min(window.innerHeight * 0.45, 420);
    this.displayScale = Math.min(maxDisplayW / this.sourceImage.width, maxDisplayH / this.sourceImage.height, 1);
    canvas.width = Math.round(this.sourceImage.width * this.displayScale);
    canvas.height = Math.round(this.sourceImage.height * this.displayScale);

    // Draw base image
    ctx.drawImage(this.sourceImage, 0, 0, canvas.width, canvas.height);

    // Draw existing regions
    for (const r of this.regions) {
      const rx = Math.round(r.x * this.displayScale);
      const ry = Math.round(r.y * this.displayScale);
      const rw = Math.round(r.width * this.displayScale);
      const rh = Math.round(r.height * this.displayScale);

      // Semi-transparent overlay indicating redaction
      ctx.fillStyle = r.type === 'pixelate' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(rx, ry, rw, rh);

      ctx.strokeStyle = r.type === 'pixelate' ? '#2563eb' : '#dc2626';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);

      // Tag label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(rx, ry - 18, Math.min(rw, 60), 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px sans-serif';
      ctx.fillText(r.type, rx + 4, ry - 5);
    }

    // Draw active drawing box
    if (this.isDrawing) {
      const x = Math.min(this.startX, this.currentX) * this.displayScale;
      const y = Math.min(this.startY, this.currentY) * this.displayScale;
      const w = Math.abs(this.currentX - this.startX) * this.displayScale;
      const h = Math.abs(this.currentY - this.startY) * this.displayScale;

      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  async exportRedacted() {
    if (!this.sourceImage || !this.originalFile) return;

    if (this.regions.length === 0) {
      this.toast.info('Draw at least one region to blur or pixelate.');
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 30;
    this.stageText = 'Permanently redacting image details...';
    this.cdr.detectChanges();

    try {
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = this.sourceImage.width;
      fullCanvas.height = this.sourceImage.height;
      const fctx = fullCanvas.getContext('2d')!;
      fctx.drawImage(this.sourceImage, 0, 0);

      this.processingProgress = 60;
      this.cdr.detectChanges();

      const redactedCanvas = this.redactionService.applyRedaction(fullCanvas, this.regions);

      this.processingProgress = 85;
      this.stageText = 'Finalizing exported file...';
      this.cdr.detectChanges();

      const outType = this.originalFile.type || 'image/jpeg';
      const blob = await this.redactionService.canvasToBlob(redactedCanvas, outType);
      const baseName = this.originalFile.name.replace(/\.[^/.]+$/, '');
      const ext = outType.split('/')[1] || 'jpeg';

      this.processedFile = new File([blob], `${baseName}_redacted.${ext}`, {
        type: outType,
        lastModified: Date.now()
      });
      this.processedPreviewUrl = URL.createObjectURL(this.processedFile);
      this.workflowState = 'SUCCESS';
      this.toast.success('Image redacted and saved.');
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to redact image.';
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
    this.regions = [];
    this.processedFile = undefined;
    this.errorMessage = undefined;
    this.isDrawing = false;
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
}
