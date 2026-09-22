import { Component, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../core/services/file.service';
import { ValidationService } from '../../core/services/validation.service';
import { CompressionService, CompressionConfig } from '../../core/services/compression.service';
import { ImageService } from '../../core/services/image.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { SingleFileWorkflowState, ProcessingStage, getProcessingStageLabel } from '../../core/models/file-workflow-state.model';
import { TranslationService } from '../../core/services/translation.service';
import { ImageCropperComponent } from '../../shared/components/image-cropper/image-cropper.component';
import { ResultPreviewComponent, PreviewData } from '../../shared/components/result-preview/result-preview.component';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  TranslatePipe
} from '../../shared/components/ui';

export interface FormPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  maxKB: number;
  description: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-photo',
  templateUrl: './photo.page.html',
  styleUrls: ['./photo.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    FilePreviewComponent,
    ResultPreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PhotoPage implements OnDestroy {
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
  stageText = 'Preparing image...';
  errorMessage?: string;

  // Exact KB state
  targetSizes = [20, 50, 100, 200, 300];
  selectedTargetKB = 50;

  // Exact Pixels state
  pixelPresets = [
    { label: '200 × 230 (PAN Card)', w: 200, h: 230 },
    { label: '413 × 531 (Passport)', w: 413, h: 531 },
    { label: '300 × 400', w: 300, h: 400 },
    { label: '600 × 800', w: 600, h: 800 }
  ];
  targetWidth: number = 200;
  targetHeight: number = 230;
  lockAspectRatio = true;

  // Smart Form Presets (Indian Portals)
  formPresets: FormPreset[] = [
    {
      id: 'pan',
      name: 'PAN Card Photo',
      width: 200,
      height: 230,
      maxKB: 50,
      description: '200 × 230 px, under 50 KB'
    },
    {
      id: 'passport',
      name: 'Passport Photo',
      width: 413,
      height: 531,
      maxKB: 50,
      description: '3.5 × 4.5 cm (413 × 531 px), 20–50 KB'
    },
    {
      id: 'ssc',
      name: 'SSC / UPSC Exam',
      width: 140,
      height: 180,
      maxKB: 50,
      description: 'Standard exam portal requirement'
    }
  ];
  selectedPresetId?: string;

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

  constructor(
    private fileService: FileService,
    private validationService: ValidationService,
    private compressionService: CompressionService,
    private imageService: ImageService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private modalCtrl: ModalController,
    private cdr: ChangeDetectorRef,
    public translationService: TranslationService
  ) {}

  ngOnDestroy(): void {
    this.cleanupUrls();
  }

  private cleanupUrls(): void {
    if (this.originalPreviewUrl) {
      this.fileService.revokeObjectUrl(this.originalPreviewUrl);
      this.originalPreviewUrl = undefined;
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

    try {
      const dims = await this.imageService.getImageDimensions(file);
      this.originalWidth = dims.width;
      this.originalHeight = dims.height;

      if (!this.selectedPresetId) {
        this.targetWidth = dims.width;
        this.targetHeight = dims.height;
      }
      this.cdr.detectChanges();
    } catch {
      // ignore dimensions failure
    }
  }

  async selectPhoto(): Promise<void> {
    const file = await this.fileService.pickImageFile();
    if (file) {
      await this.onFileSelected(file);
    }
  }

  removePhoto(): void {
    this.cleanupUrls();
    this.originalFile = undefined;
    this.processedResult = undefined;
    this.originalWidth = 0;
    this.originalHeight = 0;
    this.errorMessage = undefined;
    this.workflowState = 'EMPTY';
    this.cdr.detectChanges();
  }

  applyPreset(preset: FormPreset): void {
    this.selectedPresetId = preset.id;
    this.targetWidth = preset.width;
    this.targetHeight = preset.height;
    this.selectedTargetKB = preset.maxKB;
    this.mode = 'kb';
    this.cdr.detectChanges();
  }

  applyPixelPreset(w: number, h: number): void {
    this.targetWidth = w;
    this.targetHeight = h;
    this.selectedPresetId = undefined;
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

  async openCropper(): Promise<void> {
    if (!this.originalFile) return;

    const imageUrl = this.fileService.createObjectUrl(this.originalFile);

    const modal = await this.modalCtrl.create({
      component: ImageCropperComponent,
      componentProps: { imageSrc: imageUrl }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    this.fileService.revokeObjectUrl(imageUrl);

    if (data) {
      const newFile = new File([data], this.originalFile.name, { type: 'image/jpeg' });
      await this.onFileSelected(newFile);
    }
  }

  async compressPhoto(): Promise<void> {
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
          0.95
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
      this.errorMessage = this.processedResult?.error || 'Failed to process photo.';
      this.workflowState = 'ERROR';
    }
    this.cdr.detectChanges();
  }

  cancelProcessing(): void {
    this.isProcessing = false;
    this.workflowState = 'CONFIGURING';
    this.cdr.detectChanges();
  }

  async savePhoto(): Promise<void> {
    if (!this.processedResult?.file || !this.originalFile) return;
    const uri = await this.storageService.saveFile(this.processedResult.file, 'photo');
    if (uri && uri !== 'web-download') {
      await this.historyService.addHistoryItem({
        operation: 'photo',
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
      alert('Photo saved to: ' + uri);
    }
  }

  async sharePhoto(): Promise<void> {
    if (!this.processedResult?.file) return;
    const uri = await this.storageService.saveFile(this.processedResult.file, 'photo_share');
    if (uri && uri !== 'web-download') {
      await this.shareService.shareFile(uri, 'Form Photo');
    }
  }
}

