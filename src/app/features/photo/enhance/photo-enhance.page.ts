import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageEnhanceService } from '../../../core/services/image-enhance.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ImageEnhanceOptions } from '../../../core/models/image-enhance.types';
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
  selector: 'app-photo-enhance',
  templateUrl: './photo-enhance.page.html',
  styleUrls: ['./photo-enhance.page.scss'],
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
export class PhotoEnhancePage implements AfterViewInit, OnDestroy {
  private enhanceService = inject(ImageEnhanceService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private documentBridge = inject(DocumentBridgeService);
  private toast = inject(ToastService);
  translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('origCanvas') origCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('enhancedCanvas') enhancedCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';

  originalFile?: File;
  originalPreviewUrl?: string;
  sourceImage?: HTMLImageElement;
  imgWidth = 0;
  imgHeight = 0;

  // Options
  scale: 2 | 4 = 2;
  unsharpAmount = 1.3;
  unsharpRadius = 1;
  unsharpThreshold = 3;

  isProcessing = false;
  processingProgress = 0;
  stageText = '';
  errorMessage?: string;

  processedFile?: File;
  processedPreviewUrl?: string;
  enhancedDims?: { width: number; height: number };

  ngAfterViewInit() {
    this.updateLivePreview();
  }

  /**
   * The comparison is sized from the pane's on-screen width, so a rotation has
   * to re-render it; otherwise the canvases keep the old width and stop being
   * the 1:1 the label promises.
   */
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    this.updateLivePreview();
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
      width: this.enhancedDims?.width || (this.imgWidth ? this.imgWidth * this.scale : undefined),
      height: this.enhancedDims?.height || (this.imgHeight ? this.imgHeight * this.scale : undefined)
    };
  }

  async onFileSelected(file: File) {
    this.releasePreviewUrls();
    this.originalFile = file;
    this.errorMessage = undefined;
    this.workflowState = 'CONFIGURING';
    this.originalPreviewUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      this.sourceImage = img;
      this.imgWidth = img.width;
      this.imgHeight = img.height;
      this.updateLivePreview();
      this.cdr.detectChanges();
    };
    img.src = this.originalPreviewUrl;
  }

  /**
   * Re-renders once on the next frame if the pane measured differently before
   * layout settled, which is the case on the first paint after an upload.
   */
  private paneRecheckQueued = false;
  private schedulePaneRecheck(usedPane: number) {
    if (this.paneRecheckQueued || typeof requestAnimationFrame !== 'function') return;
    this.paneRecheckQueued = true;
    requestAnimationFrame(() => {
      this.paneRecheckQueued = false;
      if (!this.sourceImage) return;
      if (Math.abs(this.panePixelSize() - usedPane) > 1) {
        this.updateLivePreview();
      }
    });
  }

  /**
   * Chooses which part of the photo to show in the comparison.
   *
   * The geometric centre is the wrong answer for the images this tool is for:
   * a scanned form or certificate is text at the top over a lot of blank
   * paper, so a centre crop is two identical empty squares and the user cannot
   * tell whether the enhancement did anything. This scores a coarse grid by
   * local gradient energy and returns the busiest tile, falling back to the
   * centre when the image is genuinely uniform.
   */
  private pickDetailedRegion(sw: number, sh: number): { x: number; y: number } {
    const img = this.sourceImage!;
    const centre = {
      x: Math.max(0, Math.round((img.width - sw) / 2)),
      y: Math.max(0, Math.round((img.height - sh) / 2))
    };
    if (img.width <= sw && img.height <= sh) return centre;

    // Score on a small proxy of the image: cheap, and detail survives it.
    const PROXY = 96;
    const proxy = document.createElement('canvas');
    proxy.width = Math.max(1, Math.min(PROXY, img.width));
    proxy.height = Math.max(1, Math.min(PROXY, img.height));
    const pctx = proxy.getContext('2d');
    if (!pctx) return centre;
    pctx.drawImage(img, 0, 0, proxy.width, proxy.height);

    let data: Uint8ClampedArray;
    try {
      data = pctx.getImageData(0, 0, proxy.width, proxy.height).data;
    } catch {
      return centre;
    }

    const stepX = Math.max(1, Math.round((sw / img.width) * proxy.width));
    const stepY = Math.max(1, Math.round((sh / img.height) * proxy.height));

    let bestScore = -1;
    let best = centre;
    for (let ty = 0; ty + stepY <= proxy.height; ty += Math.max(1, Math.floor(stepY / 2))) {
      for (let tx = 0; tx + stepX <= proxy.width; tx += Math.max(1, Math.floor(stepX / 2))) {
        let score = 0;
        for (let y = ty; y < ty + stepY - 1; y++) {
          for (let x = tx; x < tx + stepX - 1; x++) {
            const i = (y * proxy.width + x) * 4;
            const right = (y * proxy.width + x + 1) * 4;
            const down = ((y + 1) * proxy.width + x) * 4;
            score += Math.abs(data[i] - data[right]) + Math.abs(data[i] - data[down]);
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = {
            x: Math.max(0, Math.min(img.width - sw, Math.round((tx / proxy.width) * img.width))),
            y: Math.max(0, Math.min(img.height - sh, Math.round((ty / proxy.height) * img.height)))
          };
        }
      }
    }

    return bestScore > 0 ? best : centre;
  }

  /**
   * The width one comparison pane actually has on screen, in CSS pixels.
   * The card is padded and the row is a two-up grid, so the canvas cannot be
   * sized from the viewport without the surplus coming back as a CSS
   * downscale.
   */
  private panePixelSize(): number {
    const box = this.origCanvasRef?.nativeElement?.parentElement;
    if (!box) return 140;
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
    const padY = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
    const availW = box.clientWidth - padX;
    const availH = box.clientHeight - padY;
    // The sample is square, so the smaller edge governs: the box is a fixed
    // height, and overflowing it would clip the comparison.
    let available = Math.min(availW > 0 ? availW : 140, availH > 0 ? availH : 140);

    /*
     * A hard ceiling from the viewport. The canvases now carry explicit pixel
     * sizes, so an over-measurement no longer gets silently clamped by
     * `max-width` -- it pushes the two-up row off the side of the screen. The
     * box can read wider than it ends up on the first pass, before layout has
     * settled, so cap at half the viewport less the gutters either way.
     */
    const viewportCap = Math.floor(window.innerWidth / 2) - 28;
    if (viewportCap > 60) available = Math.min(available, viewportCap);

    return Math.round(Math.max(80, Math.min(available, 220)));
  }

  /**
   * Renders the before/after comparison at a true 1:1.
   *
   * The label promises 100%, which only means something if both panes show the
   * same part of the photo at the same magnification with no browser
   * resampling on top. Previously the "before" pane was drawn at 1:1 of the
   * source while the "after" pane was the 2x or 4x output, and `max-width:
   * 100%` then squashed each by a different ratio -- so the two sides were at
   * different zooms and neither was at 100%, which is exactly the resampling
   * that hides the sharpening the preview exists to judge.
   *
   * Both canvases are now sized to the pane in CSS pixels and cover the same
   * source region. The original is magnified by the same factor with smoothing
   * off, so what the user compares is the raw enlarged pixels against the
   * enhanced ones.
   */
  updateLivePreview() {
    if (!this.sourceImage) return;

    const pane = this.panePixelSize();
    this.schedulePaneRecheck(pane);
    // Source pixels that, once upscaled, exactly fill the pane.
    const srcSample = Math.max(16, Math.round(pane / this.scale));

    const sw = Math.min(srcSample, this.sourceImage.width);
    const sh = Math.min(srcSample, this.sourceImage.height);
    const { x: sx, y: sy } = this.pickDetailedRegion(sw, sh);

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sctx = sampleCanvas.getContext('2d');
    if (!sctx) return;
    sctx.drawImage(this.sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);

    const outW = sw * this.scale;
    const outH = sh * this.scale;

    // Before: the same region at the same magnification, unsmoothed, so the
    // original's real detail level is visible rather than a browser blur.
    if (this.origCanvasRef?.nativeElement) {
      const oc = this.origCanvasRef.nativeElement;
      oc.width = outW;
      oc.height = outH;
      oc.style.width = outW + 'px';
      oc.style.height = outH + 'px';
      const octx = oc.getContext('2d');
      if (octx) {
        octx.imageSmoothingEnabled = false;
        octx.clearRect(0, 0, outW, outH);
        octx.drawImage(sampleCanvas, 0, 0, sw, sh, 0, 0, outW, outH);
      }
    }

    // Upscale & enhance sample
    const upscaled = this.enhanceService.bicubicUpscale(sampleCanvas, this.scale);
    const sharpened = this.enhanceService.applyUnsharpMask(
      upscaled,
      this.unsharpAmount,
      this.unsharpRadius,
      this.unsharpThreshold
    );

    if (this.enhancedCanvasRef?.nativeElement) {
      const ec = this.enhancedCanvasRef.nativeElement;
      ec.width = outW;
      ec.height = outH;
      ec.style.width = outW + 'px';
      ec.style.height = outH + 'px';
      const ectx = ec.getContext('2d');
      if (ectx) {
        ectx.clearRect(0, 0, outW, outH);
        ectx.drawImage(sharpened, 0, 0);
      }
    }
  }

  onParamChange() {
    this.updateLivePreview();
  }

  async exportEnhanced() {
    if (!this.originalFile || !this.sourceImage) return;

    this.isProcessing = true;
    this.processingProgress = 20;
    this.stageText = `Bicubic upscaling to ${this.scale}x resolution...`;
    this.cdr.detectChanges();

    try {
      this.processingProgress = 50;
      this.stageText = 'Sharpening text edges with unsharp mask...';
      this.cdr.detectChanges();

      const opts: ImageEnhanceOptions = {
        scale: this.scale,
        unsharpAmount: this.unsharpAmount,
        unsharpRadius: this.unsharpRadius,
        unsharpThreshold: this.unsharpThreshold
      };

      this.processedFile = await this.enhanceService.enhanceImage(this.originalFile, opts);
      this.enhancedDims = {
        width: this.imgWidth * this.scale,
        height: this.imgHeight * this.scale
      };

      this.processingProgress = 100;
      this.processedPreviewUrl = URL.createObjectURL(this.processedFile);
      this.workflowState = 'SUCCESS';
      this.toast.success('Enhanced image ready.');
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to enhance image.';
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
