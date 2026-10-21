import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
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
export class PhotoEnhancePage implements AfterViewInit {
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

  updateLivePreview() {
    if (!this.sourceImage) return;

    // Sample a 120x120 crop from center to show 100% zoom side-by-side
    const sampleSize = 100;
    const sx = Math.max(0, Math.round((this.sourceImage.width - sampleSize) / 2));
    const sy = Math.max(0, Math.round((this.sourceImage.height - sampleSize) / 2));
    const sw = Math.min(sampleSize, this.sourceImage.width - sx);
    const sh = Math.min(sampleSize, this.sourceImage.height - sy);

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sctx = sampleCanvas.getContext('2d');
    if (!sctx) return;
    sctx.drawImage(this.sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);

    // Draw original sample
    if (this.origCanvasRef?.nativeElement) {
      const oc = this.origCanvasRef.nativeElement;
      oc.width = sw;
      oc.height = sh;
      const octx = oc.getContext('2d');
      if (octx) octx.drawImage(sampleCanvas, 0, 0);
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
      ec.width = sw * this.scale;
      ec.height = sh * this.scale;
      const ectx = ec.getContext('2d');
      if (ectx) ectx.drawImage(sharpened, 0, 0);
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
    this.workflowState = 'EMPTY';
    this.originalFile = undefined;
    this.originalPreviewUrl = undefined;
    this.sourceImage = undefined;
    this.processedFile = undefined;
    this.processedPreviewUrl = undefined;
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
