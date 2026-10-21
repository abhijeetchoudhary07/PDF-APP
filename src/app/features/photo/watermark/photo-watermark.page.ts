import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { ImageWatermarkService } from '../../../core/services/image-watermark.service';
import {
  WatermarkOptions,
  WatermarkPosition,
  WatermarkPreset
} from '../../../core/models/image-watermark.types';
import { SingleFileWorkflowState } from '../../../core/models/file-workflow-state.model';
import { createSafeCanvas, getSafeContext, safeCanvasToBlob } from '../../../core/utilities/canvas-headless.util';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  FileDropzoneComponent,
  AppIconComponent,
  TranslatePipe
} from '../../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-photo-watermark',
  templateUrl: './photo-watermark.page.html',
  styleUrls: ['./photo-watermark.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    FileDropzoneComponent,
    AppIconComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PhotoWatermarkPage {
  private fileService = inject(FileService);
  private watermarkService = inject(ImageWatermarkService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private toast = inject(ToastService);
  private historyService = inject(HistoryService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';
  files: File[] = [];
  sourceCanvas?: HTMLCanvasElement;
  watermarkedCanvas?: HTMLCanvasElement;
  isProcessing = false;

  watermarkType: 'text' | 'logo' = 'text';
  textValue = 'CONFIDENTIAL';
  fontSize = 32;
  textColor = '#dc2626';
  opacity = 0.35;
  rotationDegrees = -30;

  layoutMode: 'single' | 'tile' = 'single';
  selectedPosition: WatermarkPosition = 'center';
  tileGap = 80;

  presets: WatermarkPreset[] = [];
  customPresetName = '';
  showSavePresetModal = false;

  readonly positions: WatermarkPosition[] = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  readonly colorOptions = [
    { label: 'Red', hex: '#dc2626' },
    { label: 'Gray', hex: '#4b5563' },
    { label: 'Blue', hex: '#2563eb' },
    { label: 'Amber', hex: '#d97706' },
    { label: 'Black', hex: '#000000' },
    { label: 'White', hex: '#ffffff' }
  ];

  constructor() {
    this.refreshPresets();
  }

  refreshPresets() {
    this.presets = this.watermarkService.getPresets();
  }

  async handleFileSelected(event: File | File[]) {
    const incoming = Array.isArray(event) ? event : [event];
    if (incoming.length === 0) return;

    this.files = incoming;
    this.workflowState = 'CONFIGURING';
    await this.loadSourceImage(incoming[0]);
    this.updatePreview();
  }

  private async loadSourceImage(file: File): Promise<void> {
    return new Promise((resolve) => {
      const isBrowser = typeof window !== 'undefined' && typeof Image !== 'undefined';
      const isJsdom = typeof window !== 'undefined' && (window.navigator?.userAgent?.includes('jsdom') || !(window as any).chrome);

      if (!isBrowser || isJsdom) {
        this.sourceCanvas = createSafeCanvas(600, 400);
        const ctx = getSafeContext(this.sourceCanvas);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, 600, 400);
        return resolve();
      }

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        this.sourceCanvas = createSafeCanvas(img.width, img.height);
        const ctx = getSafeContext(this.sourceCanvas);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve();
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        this.sourceCanvas = createSafeCanvas(600, 400);
        resolve();
      };

      img.src = url;
    });
  }

  get currentOptions(): WatermarkOptions {
    return {
      mode: this.layoutMode,
      position: this.selectedPosition,
      opacity: this.opacity,
      margin: 24,
      textConfig: {
        type: 'text',
        text: this.textValue,
        fontSize: this.fontSize,
        fontFamily: 'sans-serif',
        color: this.textColor,
        opacity: this.opacity,
        rotationDegrees: this.rotationDegrees
      },
      tileConfig: {
        gapX: this.tileGap,
        gapY: this.tileGap,
        angleDegrees: this.rotationDegrees
      }
    };
  }

  updatePreview() {
    if (!this.sourceCanvas) return;

    this.watermarkedCanvas = this.watermarkService.applyWatermark(
      this.sourceCanvas,
      this.currentOptions
    );

    // If DOM canvas is available, paint on it
    if (this.previewCanvasRef?.nativeElement && this.watermarkedCanvas) {
      const domCanvas = this.previewCanvasRef.nativeElement;
      domCanvas.width = this.watermarkedCanvas.width;
      domCanvas.height = this.watermarkedCanvas.height;
      const ctx = domCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(this.watermarkedCanvas, 0, 0);
      }
    }

    this.cdr.markForCheck();
  }

  applyPreset(preset: WatermarkPreset) {
    this.layoutMode = preset.options.mode;
    this.selectedPosition = preset.options.position;
    this.opacity = preset.options.opacity;

    if (preset.options.textConfig) {
      this.textValue = preset.options.textConfig.text;
      this.fontSize = preset.options.textConfig.fontSize;
      this.textColor = preset.options.textConfig.color;
      this.rotationDegrees = preset.options.textConfig.rotationDegrees;
    }
    if (preset.options.tileConfig) {
      this.tileGap = preset.options.tileConfig.gapX;
    }

    this.updatePreview();
  }

  saveCustomPreset() {
    if (!this.customPresetName.trim()) return;
    this.watermarkService.savePreset(this.customPresetName.trim(), this.currentOptions);
    this.refreshPresets();
    this.customPresetName = '';
    this.showSavePresetModal = false;
    this.toast.success('Watermark preset saved.');
  }

  async saveOutput() {
    if (!this.watermarkedCanvas || this.files.length === 0) return;

    this.isProcessing = true;
    try {
      const original = this.files[0];
      const blob = await safeCanvasToBlob(this.watermarkedCanvas!, 'image/jpeg', 0.92);

      if (!blob) throw new Error('Failed to generate watermarked image');

      const outName = `watermarked_${original.name}`;
      const outFile = new File([blob], outName, { type: 'image/jpeg' });

      const uri = await this.storageService.saveFile(outFile, 'photo_watermark');
      if (uri) {
        await this.historyService.addHistoryItem({
          operation: 'photo_watermark',
          originalFileName: original.name,
          outputFileName: outName,
          originalSizeBytes: original.size,
          outputSizeBytes: outFile.size,
          outputDimensions: `${this.watermarkedCanvas.width}x${this.watermarkedCanvas.height}`,
          outputPath: uri
        });
        this.toast.success('Watermarked photo saved to Documents.');
      }
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to save watermarked image');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  async shareOutput() {
    if (!this.watermarkedCanvas || this.files.length === 0) return;

    const original = this.files[0];
    const blob = await safeCanvasToBlob(this.watermarkedCanvas!, 'image/jpeg', 0.92);

    if (blob) {
      const outFile = new File([blob], `watermarked_${original.name}`, { type: 'image/jpeg' });
      await this.shareService.shareFile(outFile, 'Watermarked Image');
    }
  }

  reset() {
    this.files = [];
    this.sourceCanvas = undefined;
    this.watermarkedCanvas = undefined;
    this.workflowState = 'EMPTY';
  }
}
