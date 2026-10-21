import { Component, ChangeDetectorRef, inject, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
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
export class IdPhotoPage implements AfterViewInit {
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
    this.drawPreview();
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

  drawPreview() {
    if (!this.sourceImage || !this.previewCanvasRef?.nativeElement) return;
    const canvas = this.previewCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale canvas to display nicely on mobile
    const maxDisplayW = Math.min(canvas.parentElement?.clientWidth || (window.innerWidth - 32), 480);
    const maxDisplayH = Math.min(window.innerHeight * 0.42, 380);
    const scale = Math.min(maxDisplayW / this.sourceImage.width, maxDisplayH / this.sourceImage.height, 1);
    canvas.width = Math.round(this.sourceImage.width * scale);
    canvas.height = Math.round(this.sourceImage.height * scale);

    // Draw photo
    ctx.drawImage(this.sourceImage, 0, 0, canvas.width, canvas.height);

    // Calculate crop boundary
    const targetAspect = this.selectedPreset.widthPx / this.selectedPreset.heightPx;
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
  }

  async generateIdPhoto() {
    if (!this.sourceImage || !this.originalFile) return;

    this.isProcessing = true;
    this.processingProgress = 20;
    this.stageText = 'Aligning head and eye-line...';
    this.cdr.detectChanges();

    try {
      const targetW = this.isCustomSize ? this.customWidthPx : this.selectedPreset.widthPx;
      const targetH = this.isCustomSize ? this.customHeightPx : this.selectedPreset.heightPx;
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

      // Compress to exact KB
      const compressResult = await this.compressionService.compressToExactKB(initialFile, {
        targetKB: this.sheetMode ? Math.max(targetKB * 4, 300) : targetKB,
        outputFormat: 'image/jpeg',
        exactDimensions: { width: finalCanvas.width, height: finalCanvas.height }
      });

      this.processingProgress = 100;

      if (compressResult.success && compressResult.file) {
        this.processedFile = compressResult.file;
        this.processedPreviewUrl = URL.createObjectURL(compressResult.file);
        this.processedDims = { width: finalCanvas.width, height: finalCanvas.height };
        this.workflowState = 'SUCCESS';
        this.toast.success(this.sheetMode ? 'Print sheet ready.' : 'ID Photo ready.');
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

  openInPhotoTools() {
    if (!this.processedFile) return;
    this.documentBridge.setDocument(this.processedFile, 'photo');
  }
}
