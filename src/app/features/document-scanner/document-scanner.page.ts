import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { DocumentScannerService } from '../../core/services/document-scanner.service';
import { PdfService, PdfCreationConfig } from '../../core/services/pdf.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import {
  Point,
  DocumentCorners,
  ScannedPage,
  EnhancementPreset,
  EnhancementOptions
} from '../../core/models/scanner.models';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type ScannerView = 'empty' | 'cropping' | 'enhancing' | 'pages_list' | 'pdf_ready';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-document-scanner',
  templateUrl: './document-scanner.page.html',
  styleUrls: ['./document-scanner.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppRelatedToolsComponent,
    TranslatePipe
  ]
})
export class DocumentScannerPage implements OnDestroy {
  @ViewChild('cropCanvas', { static: false }) cropCanvasRef?: ElementRef<HTMLCanvasElement>;

  currentView: ScannerView = 'empty';

  // Multi-page state
  pages: ScannedPage[] = [];
  activePageIndex = 0;

  // Active page editing state
  activeCropCorners: DocumentCorners = {
    topLeft: { x: 50, y: 50 },
    topRight: { x: 350, y: 50 },
    bottomRight: { x: 350, y: 450 },
    bottomLeft: { x: 50, y: 450 }
  };
  activeConfidence = 0;
  isLowConfidence = false;
  cropMode: 'auto' | 'manual' = 'auto';

  // Enhancement state
  activeEnhancement: EnhancementOptions = {
    preset: 'document',
    brightness: 0,
    contrast: 0,
    sharpen: 20
  };
  showBeforePreview = false;

  // PDF generation state
  pdfConfig: PdfCreationConfig = {
    format: 'A4',
    orientation: 'Portrait',
    fitMode: 'fit'
  };
  generatedPdfFile?: File;
  isGeneratingPdf = false;

  // Canvas interaction
  private activeDraggingPoint: keyof DocumentCorners | null = null;
  private canvasScale = 1;
  private canvasOffsetX = 0;
  private canvasOffsetY = 0;

  constructor(
    private scannerService: DocumentScannerService,
    private pdfService: PdfService,
    private fileService: FileService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private documentBridgeService: DocumentBridgeService,
    private toastService: ToastService,
    private translationService: TranslationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    // Revoke all object URLs
    for (const p of this.pages) {
      this.fileService.revokeObjectUrl(p.originalImageUrl);
      this.fileService.revokeObjectUrl(p.processedImageUrl);
    }
  }

  get activePage(): ScannedPage | undefined {
    return this.pages[this.activePageIndex];
  }

  // --- CAMERA & CAPTURE ---

  async captureFromCamera(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await Camera.getPhoto({
          quality: 100,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera
        });

        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          await this.processNewCapture(blob);
        }
      } else {
        // Desktop / Web: fallback to file input / gallery
        const file = await this.fileService.pickImageFile();
        if (file) {
          await this.processNewCapture(file);
        }
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('User cancelled')) {
        this.toastService.show('error', 'Camera access error or permission denied.');
      }
    }
  }

  async importFromGallery(): Promise<void> {
    const files = await this.fileService.pickMultipleImages();
    if (files.length > 0) {
      for (const f of files) {
        await this.processNewCapture(f);
      }
    }
  }

  private async processNewCapture(blobOrFile: Blob | File): Promise<void> {
    const originalUrl = this.fileService.createObjectUrl(blobOrFile);
    const canvas = await this.scannerService.toCanvas(blobOrFile);

    // Auto edge detection
    const detection = await this.scannerService.detectDocumentEdges(canvas);

    this.activeCropCorners = { ...detection.corners };
    this.activeConfidence = detection.confidence;
    this.isLowConfidence = detection.lowConfidence;
    this.cropMode = detection.lowConfidence ? 'manual' : 'auto';

    // Perspective warp & default enhancement
    const warpedCanvas = await this.scannerService.perspectiveWarp(canvas, this.activeCropCorners);
    const enhancedCanvas = await this.scannerService.enhanceImage(warpedCanvas, this.activeEnhancement);
    const processedBlob = await this.scannerService.canvasToBlob(enhancedCanvas);
    const processedUrl = this.fileService.createObjectUrl(processedBlob);

    const newPage: ScannedPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      pageNumber: this.pages.length + 1,
      originalImageBlob: blobOrFile,
      originalImageUrl: originalUrl,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      corners: { ...this.activeCropCorners },
      detectionConfidence: detection.confidence,
      lowConfidence: detection.lowConfidence,
      rotation: 0,
      enhancement: { ...this.activeEnhancement },
      processedImageBlob: processedBlob,
      processedImageUrl: processedUrl,
      processedWidth: enhancedCanvas.width,
      processedHeight: enhancedCanvas.height
    };

    this.pages.push(newPage);
    this.activePageIndex = this.pages.length - 1;

    // If edge detection confidence was low, show manual crop view immediately
    if (detection.lowConfidence) {
      this.currentView = 'cropping';
      setTimeout(() => this.drawCropCanvas(), 50);
    } else {
      this.currentView = 'pages_list';
    }

    this.cdr.detectChanges();
  }

  // --- CROP & CORNER ADJUSTMENT ---

  openCropEditor(index: number): void {
    this.activePageIndex = index;
    const page = this.pages[index];
    if (!page) return;

    this.activeCropCorners = { ...page.corners };
    this.activeConfidence = page.detectionConfidence;
    this.isLowConfidence = page.lowConfidence;
    this.cropMode = 'manual';
    this.currentView = 'cropping';
    this.cdr.detectChanges();

    setTimeout(() => this.drawCropCanvas(), 50);
  }

  async applyCrop(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.corners = { ...this.activeCropCorners };
    page.lowConfidence = false;

    // Re-warp and re-enhance
    const warpedCanvas = await this.scannerService.perspectiveWarp(
      page.originalImageBlob,
      page.corners
    );
    const enhancedCanvas = await this.scannerService.enhanceImage(
      warpedCanvas,
      page.enhancement
    );
    const newBlob = await this.scannerService.canvasToBlob(enhancedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = newBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(newBlob);
    page.processedWidth = enhancedCanvas.width;
    page.processedHeight = enhancedCanvas.height;

    this.currentView = 'pages_list';
    this.cdr.detectChanges();
  }

  cancelCrop(): void {
    this.currentView = 'pages_list';
  }

  resetCropToAuto(): void {
    const page = this.activePage;
    if (!page) return;

    this.activeCropCorners = {
      topLeft: { x: Math.round(page.originalWidth * 0.05), y: Math.round(page.originalHeight * 0.05) },
      topRight: { x: Math.round(page.originalWidth * 0.95), y: Math.round(page.originalHeight * 0.05) },
      bottomRight: { x: Math.round(page.originalWidth * 0.95), y: Math.round(page.originalHeight * 0.95) },
      bottomLeft: { x: Math.round(page.originalWidth * 0.05), y: Math.round(page.originalHeight * 0.95) }
    };
    this.drawCropCanvas();
  }

  // --- ENHANCEMENT EDITING ---

  openEnhanceEditor(index: number): void {
    this.activePageIndex = index;
    const page = this.pages[index];
    if (!page) return;

    this.activeEnhancement = { ...page.enhancement };
    this.currentView = 'enhancing';
    this.cdr.detectChanges();
  }

  async selectPreset(preset: EnhancementPreset): Promise<void> {
    this.activeEnhancement.preset = preset;
    await this.refreshEnhancedPage();
  }

  async onFilterParamChange(): Promise<void> {
    await this.refreshEnhancedPage();
  }

  private async refreshEnhancedPage(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.enhancement = { ...this.activeEnhancement };

    const warpedCanvas = await this.scannerService.perspectiveWarp(
      page.originalImageBlob,
      page.corners
    );
    const enhancedCanvas = await this.scannerService.enhanceImage(
      warpedCanvas,
      page.enhancement
    );
    const newBlob = await this.scannerService.canvasToBlob(enhancedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = newBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(newBlob);
    page.processedWidth = enhancedCanvas.width;
    page.processedHeight = enhancedCanvas.height;

    this.cdr.detectChanges();
  }

  doneEnhancing(): void {
    this.currentView = 'pages_list';
  }

  // --- MULTI-PAGE ACTIONS ---

  async rotateActivePage(): Promise<void> {
    const page = this.activePage;
    if (!page) return;

    page.rotation = (page.rotation + 90) % 360;
    const canvas = await this.scannerService.toCanvas(page.processedImageBlob);
    const rotatedCanvas = this.scannerService.rotateCanvas(canvas, 90);
    const rotatedBlob = await this.scannerService.canvasToBlob(rotatedCanvas);

    this.fileService.revokeObjectUrl(page.processedImageUrl);
    page.processedImageBlob = rotatedBlob;
    page.processedImageUrl = this.fileService.createObjectUrl(rotatedBlob);
    page.processedWidth = rotatedCanvas.width;
    page.processedHeight = rotatedCanvas.height;

    this.cdr.detectChanges();
  }

  deletePage(index: number): void {
    const page = this.pages[index];
    if (page) {
      this.fileService.revokeObjectUrl(page.originalImageUrl);
      this.fileService.revokeObjectUrl(page.processedImageUrl);
      this.pages.splice(index, 1);

      // Re-index
      this.pages.forEach((p, idx) => (p.pageNumber = idx + 1));
      if (this.activePageIndex >= this.pages.length) {
        this.activePageIndex = Math.max(0, this.pages.length - 1);
      }

      if (this.pages.length === 0) {
        this.currentView = 'empty';
      }
      this.cdr.detectChanges();
    }
  }

  movePage(fromIndex: number, direction: 'up' | 'down'): void {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= this.pages.length) return;

    const temp = this.pages[fromIndex];
    this.pages[fromIndex] = this.pages[toIndex];
    this.pages[toIndex] = temp;

    this.pages.forEach((p, idx) => (p.pageNumber = idx + 1));
    this.activePageIndex = toIndex;
    this.cdr.detectChanges();
  }

  // --- PDF GENERATION & OCR HANDOFF ---

  async generatePdf(): Promise<void> {
    if (this.pages.length === 0) return;

    this.isGeneratingPdf = true;
    this.cdr.detectChanges();

    try {
      const files: File[] = [];
      for (const p of this.pages) {
        files.push(
          new File([p.processedImageBlob], `scanned_page_${p.pageNumber}.jpg`, {
            type: 'image/jpeg'
          })
        );
      }

      const result = await this.pdfService.imagesToPdf(files, this.pdfConfig);
      if (result.success && result.file) {
        this.generatedPdfFile = result.file;
        this.currentView = 'pdf_ready';
        await this.historyService.addHistoryItem({
          operation: 'scanner',
          originalFileName: `Scanned Document (${this.pages.length} pages)`,
          outputFileName: result.file.name,
          originalSizeBytes: result.file.size,
          outputSizeBytes: result.file.size,
          outputDimensions: `${this.pages.length} pages`
        });
        this.toastService.show('success', 'Scanned PDF created successfully!');
      } else {
        this.toastService.show('error', result.error || 'Failed to create PDF.');
      }
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Error generating PDF.');
    } finally {
      this.isGeneratingPdf = false;
      this.cdr.detectChanges();
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.generatedPdfFile) return;
    await this.storageService.saveFile(this.generatedPdfFile);
    this.toastService.show('success', 'PDF saved to device!');
  }

  async sharePdf(): Promise<void> {
    if (!this.generatedPdfFile) return;
    await this.shareService.shareFile(this.generatedPdfFile);
  }

  /**
   * "Make Searchable" naturally bridges into the Smart PDF OCR feature.
   */
  makeSearchableWithOcr(): void {
    if (!this.generatedPdfFile) return;

    this.documentBridgeService.setOcrTarget({
      file: this.generatedPdfFile,
      source: 'scanner',
      metadata: { pageCount: this.pages.length }
    });

    this.router.navigate(['/features/pdf-ocr']);
  }

  scanForQrCodes(): void {
    if (!this.generatedPdfFile) return;

    this.documentBridgeService.setQrTarget({
      file: this.generatedPdfFile,
      source: 'scanner'
    });

    this.router.navigate(['/features/qr-barcode']);
  }

  resetScanner(): void {
    for (const p of this.pages) {
      this.fileService.revokeObjectUrl(p.originalImageUrl);
      this.fileService.revokeObjectUrl(p.processedImageUrl);
    }
    this.pages = [];
    this.generatedPdfFile = undefined;
    this.currentView = 'empty';
    this.cdr.detectChanges();
  }

  // --- CANVAS INTERACTION FOR 4-CORNER DRAG ---

  private drawCropCanvas(): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    const page = this.activePage;
    if (!canvas || !page) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Fit image inside container dimensions
      const maxW = canvas.parentElement?.clientWidth || 400;
      const maxH = 500;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      this.canvasScale = scale;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw quadrilateral
      const pts = [
        this.scalePoint(this.activeCropCorners.topLeft, scale),
        this.scalePoint(this.activeCropCorners.topRight, scale),
        this.scalePoint(this.activeCropCorners.bottomRight, scale),
        this.scalePoint(this.activeCropCorners.bottomLeft, scale)
      ];

      // Draw polygon outline
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fill();

      // Draw 4 Corner Handles
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
      }
    };
    img.src = page.originalImageUrl;
  }

  private scalePoint(p: Point, scale: number): Point {
    return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) };
  }

  onCanvasPointerDown(e: MouseEvent | TouchEvent): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const hitRadius = 24;
    const corners = this.activeCropCorners;
    const scale = this.canvasScale;

    const hit = (p: Point) => Math.hypot(p.x * scale - x, p.y * scale - y) < hitRadius;

    if (hit(corners.topLeft)) this.activeDraggingPoint = 'topLeft';
    else if (hit(corners.topRight)) this.activeDraggingPoint = 'topRight';
    else if (hit(corners.bottomRight)) this.activeDraggingPoint = 'bottomRight';
    else if (hit(corners.bottomLeft)) this.activeDraggingPoint = 'bottomLeft';
  }

  onCanvasPointerMove(e: MouseEvent | TouchEvent): void {
    if (!this.activeDraggingPoint) return;
    const canvas = this.cropCanvasRef?.nativeElement;
    const page = this.activePage;
    if (!canvas || !page) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / this.canvasScale;
    const y = (clientY - rect.top) / this.canvasScale;

    // Clamp within original image boundaries
    const clampedX = Math.max(0, Math.min(page.originalWidth, Math.round(x)));
    const clampedY = Math.max(0, Math.min(page.originalHeight, Math.round(y)));

    this.activeCropCorners[this.activeDraggingPoint] = { x: clampedX, y: clampedY };
    this.drawCropCanvas();
  }

  onCanvasPointerUp(): void {
    this.activeDraggingPoint = null;
  }
}
