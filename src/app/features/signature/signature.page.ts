import { Component, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../core/services/file.service';
import { ValidationService } from '../../core/services/validation.service';
import { CompressionService } from '../../core/services/compression.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { CompressionConfig } from '../../core/models/compression-config.model';
import { ImageService } from '../../core/services/image.service';
import { SingleFileWorkflowState, ProcessingStage, getProcessingStageLabel } from '../../core/models/file-workflow-state.model';
import { TranslationService } from '../../core/services/translation.service';
import { ImageCropperComponent } from '../../shared/components/image-cropper/image-cropper.component';
import { ResultPreviewComponent, PreviewData } from '../../shared/components/result-preview/result-preview.component';
import { ToastService } from '../../core/services/toast.service';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  BeforeAfterPreviewComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-signature',
  templateUrl: './signature.page.html',
  styleUrls: ['./signature.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    ResultPreviewComponent,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    FilePreviewComponent,
    TranslatePipe
],
  providers: [DecimalPipe]
})
export class SignaturePage implements OnDestroy {
  private fileService = inject(FileService);
  private validationService = inject(ValidationService);
  private imageService = inject(ImageService);
  private compressionService = inject(CompressionService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private modalCtrl = inject(ModalController);
  private cdr = inject(ChangeDetectorRef);
  translationService = inject(TranslationService);
  private toast = inject(ToastService);

  workflowState: SingleFileWorkflowState = 'EMPTY';
  mode: 'kb' | 'pixels' = 'kb';

  originalFile?: File;
  originalPreviewUrl?: string;
  originalWidth: number = 0;
  originalHeight: number = 0;
  targetFormat: string = 'image/jpeg';

  processedResult?: ProcessingResult;
  processedPreviewUrl?: string;
  processedImageDims?: { width: number; height: number };
  isProcessing = false;
  processingStage: ProcessingStage = 'preparing';
  stageText = 'Preparing signature...';
  errorMessage?: string;

  // Clean / Cropped Intermediate Preview
  cleanedPreviewUrl?: string;

  // Exact KB state
  targetSizes = [10, 20, 50, 100];
  selectedTargetKB = 20;

  // Exact Pixels state
  pixelPresets = [
    { label: '140 × 60 (Standard Portal)', w: 140, h: 60 },
    { label: '200 × 80 (UPSC / Banking)', w: 200, h: 80 }
  ];
  targetWidth: number = 140;
  targetHeight: number = 60;
  lockAspectRatio = true;

  // Crop State
  autoCropPadding = 10;
  autoCropThreshold = 240;

  get beforePreviewData(): PreviewData | undefined {
    if (!this.originalFile) return undefined;
    return {
      name: this.originalFile.name,
      type: this.originalFile.type,
      sizeBytes: this.originalFile.size,
      width: this.originalWidth,
      height: this.originalHeight
    };
  }

  get afterPreviewData(): PreviewData | undefined {
    if (!this.processedResult?.metadata) return undefined;
    return {
      name: this.processedResult.metadata.name,
      type: this.processedResult.metadata.type,
      sizeBytes: this.processedResult.metadata.sizeBytes,
      width: this.processedResult.dimensions?.width || this.processedImageDims?.width || this.targetWidth,
      height: this.processedResult.dimensions?.height || this.processedImageDims?.height || this.targetHeight
    };
  }

  ngOnDestroy(): void {
    this.cleanupUrls();
  }

  private cleanupUrls(): void {
    if (this.originalPreviewUrl) {
      this.fileService.revokeObjectUrl(this.originalPreviewUrl);
      this.originalPreviewUrl = undefined;
    }
    if (this.cleanedPreviewUrl) {
      this.fileService.revokeObjectUrl(this.cleanedPreviewUrl);
      this.cleanedPreviewUrl = undefined;
    }
    if (this.processedPreviewUrl) {
      this.fileService.revokeObjectUrl(this.processedPreviewUrl);
      this.processedPreviewUrl = undefined;
    }
  }

  async onFileSelected(file: File): Promise<void> {
    const validation = this.validationService.validateImage(file);
    if (!validation.valid) {
      this.errorMessage = validation.error;
      this.workflowState = 'ERROR';
      this.cdr.detectChanges();
      return;
    }

    this.cleanupUrls();
    this.errorMessage = undefined;
    this.originalFile = file;
    this.originalPreviewUrl = this.fileService.createObjectUrl(file);
    this.targetFormat = file.type || 'image/jpeg';
    this.processedResult = undefined;
    this.workflowState = 'CONFIGURING';
    this.cdr.detectChanges();

    await this.updateDimensions(file);
  }

  async selectSignature(): Promise<void> {
    const file = await this.fileService.pickImageFile();
    if (file) {
      await this.onFileSelected(file);
    }
  }

  removeSignature(): void {
    this.cleanupUrls();
    this.originalFile = undefined;
    this.processedResult = undefined;
    this.originalWidth = 0;
    this.originalHeight = 0;
    this.errorMessage = undefined;
    this.workflowState = 'EMPTY';
    this.cdr.detectChanges();
  }

  private async updateDimensions(file: File): Promise<void> {
    try {
      const dims = await this.imageService.getImageDimensions(file);
      this.originalWidth = dims.width;
      this.originalHeight = dims.height;
      this.cdr.detectChanges();
    } catch {
      // ignore
    }
  }

  async openCropper(): Promise<void> {
    const sourceUrl = this.cleanedPreviewUrl || this.originalPreviewUrl;
    if (!sourceUrl || !this.originalFile) return;

    const modal = await this.modalCtrl.create({
      component: ImageCropperComponent,
      componentProps: { imageSrc: sourceUrl }
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data) {
      const newFile = new File([data], this.originalFile.name, { type: 'image/jpeg' });
      await this.onFileSelected(newFile);
    }
  }

  async autoCrop(): Promise<void> {
    if (!this.originalFile) return;

    this.isProcessing = true;
    this.stageText = getProcessingStageLabel('analyzing', this.translationService);
    this.cdr.detectChanges();

    try {
      const croppedBlob = await this.imageService.autoCropSignature(
        this.originalFile,
        this.autoCropThreshold,
        this.autoCropPadding
      );

      if (this.cleanedPreviewUrl) {
        this.fileService.revokeObjectUrl(this.cleanedPreviewUrl);
      }

      this.cleanedPreviewUrl = this.fileService.createObjectUrl(croppedBlob);
      const newFile = new File([croppedBlob], this.originalFile.name, { type: 'image/jpeg' });
      await this.updateDimensions(newFile);
    } catch (e: any) {
      console.warn('Auto crop signature failed:', e);
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  applyPixelPreset(w: number, h: number): void {
    this.targetWidth = w;
    this.targetHeight = h;
  }

  onWidthChange(): void {
    if (this.lockAspectRatio && this.originalWidth > 0) {
      const ratio = this.originalHeight / this.originalWidth;
      this.targetHeight = Math.round(this.targetWidth * ratio);
    }
  }

  onHeightChange(): void {
    if (this.lockAspectRatio && this.originalHeight > 0) {
      const ratio = this.originalWidth / this.originalHeight;
      this.targetWidth = Math.round(this.targetHeight * ratio);
    }
  }

  async compressSignature(): Promise<void> {
    if (!this.originalFile) return;

    this.isProcessing = true;
    this.workflowState = 'PROCESSING';
    this.processingStage = 'analyzing';
    this.stageText = getProcessingStageLabel('analyzing', this.translationService);
    this.cdr.detectChanges();

    if (this.mode === 'kb') {
      const config: CompressionConfig = {
        targetKB: this.selectedTargetKB,
        outputFormat: 'image/jpeg'
      };
      this.processingStage = 'optimizing';
      this.stageText = getProcessingStageLabel('optimizing', this.translationService);
      this.cdr.detectChanges();

      this.processedResult = await this.compressionService.compressToExactKB(this.originalFile, config);
    } else {
      // Pixels Mode
      try {
        this.processingStage = 'processing';
        this.stageText = getProcessingStageLabel('processing', this.translationService);
        this.cdr.detectChanges();

        const outputFormat = 'image/jpeg';
        const blob = await this.imageService.resizeToCanvasBlob(
          this.originalFile,
          this.targetWidth,
          this.targetHeight,
          outputFormat,
          1.0
        );
        const newFile = new File([blob], this.originalFile.name, { type: outputFormat });

        this.processedResult = {
          success: true,
          file: newFile,
          dimensions: { width: this.targetWidth, height: this.targetHeight },
          metadata: {
            name: newFile.name,
            type: newFile.type,
            sizeBytes: newFile.size,
            lastModified: newFile.lastModified,
            extension: 'jpeg'
          }
        };
      } catch (e: any) {
        this.processedResult = { success: false, error: e.toString() };
      }
    }

    this.isProcessing = false;

    if (this.processedResult?.success && this.processedResult.file) {
      this.processedPreviewUrl = this.fileService.createObjectUrl(this.processedResult.file);
      this.workflowState = 'SUCCESS';
    } else {
      this.errorMessage = this.processedResult?.error || 'Failed to process signature.';
      this.workflowState = 'ERROR';
    }
    this.cdr.detectChanges();
  }

  cancelProcessing(): void {
    this.isProcessing = false;
    this.workflowState = 'CONFIGURING';
    this.cdr.detectChanges();
  }

  async saveSignature(): Promise<void> {
    if (!this.processedResult?.file || !this.originalFile) return;
    const uri = await this.storageService.saveFile(this.processedResult.file, 'signature');
    if (uri && uri !== 'web-download') {
      await this.historyService.addHistoryItem({
        operation: 'signature',
        originalFileName: this.originalFile.name,
        outputFileName: this.processedResult.file.name,
        originalSizeBytes: this.originalFile.size,
        outputSizeBytes: this.processedResult.file.size,
        originalDimensions: this.originalWidth ? `${this.originalWidth}x${this.originalHeight}` : undefined,
        outputDimensions: this.processedResult.dimensions
          ? `${this.processedResult.dimensions.width}x${this.processedResult.dimensions.height}`
          : undefined,
        outputPath: uri
      });
      this.toast.success('Saved to your Documents folder.');
    }
  }

  async shareSignature(): Promise<void> {
    // Sharing is handled via the Social Media Share modal inside app-result-preview.
    // Avoid triggering storageService.saveFile() which downloads the file on web.
  }
}

