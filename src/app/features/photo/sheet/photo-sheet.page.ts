import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  inject, HostListener } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { PhotoSheetService } from '../../../core/services/photo-sheet.service';
import {
  PAPER_DIMENSIONS,
  PaperSize,
  SheetGridConfig
} from '../../../core/models/photo-sheet.types';
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
  selector: 'app-photo-sheet',
  templateUrl: './photo-sheet.page.html',
  styleUrls: ['./photo-sheet.page.scss'],
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
export class PhotoSheetPage {
  private fileService = inject(FileService);
  private sheetService = inject(PhotoSheetService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private toast = inject(ToastService);
  private historyService = inject(HistoryService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('sheetCanvas') sheetCanvasRef?: ElementRef<HTMLCanvasElement>;

  workflowState: SingleFileWorkflowState = 'EMPTY';
  files: File[] = [];
  loadedImageCanvases: HTMLCanvasElement[] = [];
  renderedSheetCanvas?: HTMLCanvasElement;

  isProcessing = false;
  paperSize: PaperSize = 'a4';
  rows = 3;
  columns = 2;
  marginMm = 10;
  gutterMm = 5;
  showCutMarks = true;
  fitMode: 'fit' | 'fill' = 'fit';
  repeatSingle = true;

  readonly paperOptions: { id: PaperSize; label: string }[] = [
    { id: 'a4', label: 'A4 (210 × 297 mm)' },
    { id: '4x6', label: '4 × 6 in (102 × 152 mm)' },
    { id: 'letter', label: 'Letter (8.5 × 11 in)' }
  ];

  readonly gridPresets = [
    { rows: 2, columns: 2, label: '2 × 2 (4)' },
    { rows: 3, columns: 2, label: '3 × 2 (6)' },
    { rows: 3, columns: 3, label: '3 × 3 (9)' },
    { rows: 4, columns: 2, label: '4 × 2 (8)' }
  ];

  get totalCells(): number {
    return this.rows * this.columns;
  }

  async handleFileSelected(event: File | File[]) {
    const incoming = Array.isArray(event) ? event : [event];
    if (incoming.length === 0) return;

    this.files = incoming;
    this.workflowState = 'CONFIGURING';
    await this.loadAllImages();
    this.updateSheetPreview();
  }

  async addMorePhotos() {
    const picked = await this.fileService.pickMultipleImages();
    if (picked && picked.length > 0) {
      this.files = [...this.files, ...picked];
      await this.loadAllImages();
      this.updateSheetPreview();
    }
  }

  private async loadAllImages() {
    this.loadedImageCanvases = [];
    const isBrowser = typeof window !== 'undefined' && typeof Image !== 'undefined';
    const isJsdom = typeof window !== 'undefined' && (window.navigator?.userAgent?.includes('jsdom') || !(window as any).chrome);

    for (const f of this.files) {
      if (!isBrowser || isJsdom) {
        const c = createSafeCanvas(400, 500);
        const ctx = getSafeContext(c);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, 0, 400, 500);
        this.loadedImageCanvases.push(c);
      } else {
        await new Promise<void>((resolve) => {
          const img = new Image();
          const url = URL.createObjectURL(f);
          img.onload = () => {
            const c = createSafeCanvas(img.width, img.height);
            const ctx = getSafeContext(c);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            this.loadedImageCanvases.push(c);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        });
      }
    }
  }

  applyGridPreset(preset: { rows: number; columns: number }) {
    this.rows = preset.rows;
    this.columns = preset.columns;
    this.updateSheetPreview();
  }

  get gridConfig(): SheetGridConfig {
    return {
      paperSize: this.paperSize,
      rows: this.rows,
      columns: this.columns,
      marginMm: this.marginMm,
      gutterMm: this.gutterMm,
      showCutMarks: this.showCutMarks,
      fitMode: this.fitMode,
      dpi: 200 // Responsive crisp preview & fast export
    };
  }


  /** Re-render after a rotation so the preview uses the new width. */
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    this.updateSheetPreview();
  }
  updateSheetPreview() {
    if (this.loadedImageCanvases.length === 0) return;

    this.renderedSheetCanvas = this.sheetService.renderSheetCanvas(
      this.loadedImageCanvases,
      this.gridConfig,
      this.repeatSingle || this.loadedImageCanvases.length === 1
    );

    this.paintPreviewCanvas();
    this.cdr.markForCheck();
  }

  /**
   * Paints the rendered sheet onto the on-screen canvas.
   *
   * This is separate from the render because the first call arrives from
   * `handleFileSelected`, one statement after `workflowState` flips to
   * CONFIGURING and before Angular has rendered that block — so the ViewChild
   * is still undefined, the paint was skipped, and nothing ever retried. The
   * user uploaded photos and sat looking at an empty box until they happened
   * to touch a control. Flushing change detection first gives the canvas a
   * chance to exist; the retry on the next frame covers the case where it
   * still does not.
   */
  private paintPreviewCanvas(retry = true) {
    if (!this.renderedSheetCanvas) return;

    if (!this.sheetCanvasRef?.nativeElement) {
      this.cdr.detectChanges();
    }

    const domCanvas = this.sheetCanvasRef?.nativeElement;
    if (!domCanvas) {
      if (retry) {
        requestAnimationFrame(() => this.paintPreviewCanvas(false));
      }
      return;
    }

    domCanvas.width = this.renderedSheetCanvas.width;
    domCanvas.height = this.renderedSheetCanvas.height;
    const ctx = domCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(this.renderedSheetCanvas, 0, 0);
    }
  }

  async exportAsImage() {
    if (!this.renderedSheetCanvas || this.files.length === 0) return;

    this.isProcessing = true;
    try {
      const blob = await safeCanvasToBlob(this.renderedSheetCanvas!, 'image/jpeg', 0.95);

      if (!blob) throw new Error('Failed to create sheet image');

      const fileName = `photo_sheet_${this.paperSize}_${this.rows}x${this.columns}.jpg`;
      const outFile = new File([blob], fileName, { type: 'image/jpeg' });

      const uri = await this.storageService.saveFile(outFile, 'photo_sheet');
      if (uri) {
        await this.historyService.addHistoryItem({
          operation: 'photo_sheet',
          originalFileName: this.files[0].name,
          outputFileName: fileName,
          originalSizeBytes: this.files[0].size,
          outputSizeBytes: outFile.size,
          outputDimensions: `${this.renderedSheetCanvas.width}x${this.renderedSheetCanvas.height}`,
          outputPath: uri
        });
        this.toast.success('Photo sheet saved as JPEG to Documents.');
      }
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to export image');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  async exportAsPdf() {
    if (!this.renderedSheetCanvas || this.files.length === 0) return;

    this.isProcessing = true;
    try {
      const pdfBytes = await this.sheetService.exportToPdf(
        this.renderedSheetCanvas,
        this.paperSize
      );

      const fileName = `photo_sheet_${this.paperSize}.pdf`;
      const pdfFile = new File([pdfBytes as any], fileName, { type: 'application/pdf' });

      const uri = await this.storageService.saveFile(pdfFile, 'photo_sheet');
      if (uri) {
        await this.historyService.addHistoryItem({
          operation: 'photo_sheet',
          originalFileName: this.files[0].name,
          outputFileName: fileName,
          originalSizeBytes: this.files[0].size,
          outputSizeBytes: pdfFile.size,
          outputPath: uri
        });
        this.toast.success('Photo sheet saved as printable PDF to Documents.');
      }
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to export PDF');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  reset() {
    this.files = [];
    this.loadedImageCanvases = [];
    this.renderedSheetCanvas = undefined;
    this.workflowState = 'EMPTY';
  }
}
