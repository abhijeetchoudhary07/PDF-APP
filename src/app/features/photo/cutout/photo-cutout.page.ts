import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentCutoutService } from '../../../core/services/document-cutout.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { DocumentCutoutSuitability } from '../../../core/models/document-cutout.types';
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
  selector: 'app-photo-cutout',
  templateUrl: './photo-cutout.page.html',
  styleUrls: ['./photo-cutout.page.scss'],
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
export class PhotoCutoutPage implements AfterViewInit, OnDestroy {
  private cutoutService = inject(DocumentCutoutService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private documentBridge = inject(DocumentBridgeService);
  private toast = inject(ToastService);
  translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';

  originalFile?: File;
  originalPreviewUrl?: string;
  sourceImage?: HTMLImageElement;
  imgWidth = 0;
  imgHeight = 0;

  suitability?: DocumentCutoutSuitability;
  tolerance = 30;
  feather = 2;
  /** Set once the user accepts that an unsuitable image will cut out badly. */
  overrideUnsuitable = false;

  isProcessing = false;
  processingProgress = 0;
  stageText = '';
  errorMessage?: string;

  processedFile?: File;
  processedPreviewUrl?: string;

  ngAfterViewInit() {
    this.updatePreview();
  }

  /** Re-lay the preview out after a rotation so it uses the new width. */
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    this.updatePreview();
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

  /**
   * A cluttered photo cannot be cut out cleanly, so exporting one is a
   * deliberate choice rather than the default.
   */
  get canExport(): boolean {
    return !!this.suitability && (this.suitability.suitable || this.overrideUnsuitable);
  }

  acknowledgeUnsuitable() {
    this.overrideUnsuitable = true;
    this.cdr.detectChanges();
  }

  /**
   * The viewport card is padded, so `clientWidth` overstates the room the
   * canvas has and the surplus returns as a CSS downscale.
   */
  private availableCanvasWidth(canvas: HTMLCanvasElement): number {
    const parent = canvas.parentElement;
    if (!parent) return Math.max(160, window.innerWidth - 32);
    const cs = getComputedStyle(parent);
    const padding = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
    return Math.max(160, parent.clientWidth - padding);
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
    this.overrideUnsuitable = false;
    this.originalFile = file;
    this.errorMessage = undefined;
    this.workflowState = 'CONFIGURING';
    this.originalPreviewUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      this.sourceImage = img;
      this.imgWidth = img.width;
      this.imgHeight = img.height;

      // Check suitability on full canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        this.suitability = this.cutoutService.evaluateSuitability(tempCanvas);
      }

      this.updatePreview();
      this.cdr.detectChanges();
    };
    img.src = this.originalPreviewUrl;
  }

  updatePreview() {
    if (!this.sourceImage || !this.previewCanvasRef?.nativeElement) return;
    const canvas = this.previewCanvasRef.nativeElement;

    const maxDisplayW = Math.min(this.availableCanvasWidth(canvas), 520);
    const maxDisplayH = Math.min(window.innerHeight * 0.42, 380);
    const scale = Math.min(maxDisplayW / this.sourceImage.width, maxDisplayH / this.sourceImage.height, 1);
    canvas.width = Math.round(this.sourceImage.width * scale);
    canvas.height = Math.round(this.sourceImage.height * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tctx = tempCanvas.getContext('2d');
    if (!tctx) return;
    tctx.drawImage(this.sourceImage, 0, 0, canvas.width, canvas.height);

    const cutout = this.cutoutService.cutoutBackground(tempCanvas, {
      tolerance: this.tolerance,
      feather: this.feather
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutout, 0, 0);
  }

  onParamChange() {
    this.updatePreview();
  }

  async exportCutout() {
    if (!this.originalFile || !this.sourceImage) return;
    if (!this.canExport) {
      this.toast.info(
        this.suitability?.reason ||
          'This image is not suitable for a clean cutout.'
      );
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 30;
    this.stageText = 'Removing document background...';
    this.cdr.detectChanges();

    try {
      this.processingProgress = 60;
      this.cdr.detectChanges();

      this.processedFile = await this.cutoutService.processFile(this.originalFile, {
        tolerance: this.tolerance,
        feather: this.feather
      });

      this.processingProgress = 100;
      this.processedPreviewUrl = URL.createObjectURL(this.processedFile);
      this.workflowState = 'SUCCESS';
      this.toast.success('Transparent PNG generated.');
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to remove background.';
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
    this.suitability = undefined;
    this.overrideUnsuitable = false;
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
