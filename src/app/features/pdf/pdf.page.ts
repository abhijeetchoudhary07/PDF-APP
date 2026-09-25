import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FileService } from '../../core/services/file.service';
import { PdfService, PdfCreationConfig } from '../../core/services/pdf.service';
import { PdfRenderService } from '../../core/services/pdf-render.service';
import { ValidationService } from '../../core/services/validation.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { SingleFileWorkflowState, ProcessingStage, getProcessingStageLabel } from '../../core/models/file-workflow-state.model';
import { TranslationService } from '../../core/services/translation.service';
import { ResultPreviewComponent, PreviewData } from '../../shared/components/result-preview/result-preview.component';
import { ToastService } from '../../core/services/toast.service';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  PdfPageThumbnailComponent,
  BeforeAfterPreviewComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf',
  templateUrl: './pdf.page.html',
  styleUrls: ['./pdf.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ResultPreviewComponent,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    FilePreviewComponent,
    PdfPageThumbnailComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfPage implements OnInit, OnDestroy {
  mode: 'dashboard' | 'compress' | 'create' | 'extract' = 'dashboard';
  workflowState: SingleFileWorkflowState = 'EMPTY';

  // Compress State
  originalFile?: File;
  originalPdfThumbnailUrl?: string;
  originalPdfPageCount?: number;
  processedResult?: ProcessingResult & { targetMissed?: boolean };
  processedPdfThumbnailUrl?: string;
  isProcessing = false;
  processingStage: ProcessingStage = 'preparing';
  stageText = 'Preparing PDF...';
  errorMessage?: string;
  targetSizes = [100, 200, 500, 1024, 2048]; // KB
  selectedTargetKB = 500;

  // Create State
  imageFiles: File[] = [];
  imageThumbnailUrls: string[] = [];
  createConfig: PdfCreationConfig = {
    format: 'A4',
    orientation: 'Portrait',
    fitMode: 'fit'
  };

  // Extract State
  extractPdfFile?: File;
  extractPdfThumbnailUrl?: string;
  pdfPageCount: number = 0;
  pagesArray: number[] = [];
  selectedPages: boolean[] = [];
  extractedImages: File[] = [];
  extractedImageUrls: string[] = [];
  extractPageThumbnails: Map<number, string> = new Map();

  constructor(
    private fileService: FileService,
    private pdfService: PdfService,
    private pdfRenderService: PdfRenderService,
    private validationService: ValidationService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private cdr: ChangeDetectorRef,
    public translationService: TranslationService,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    const routeMode = this.route.snapshot.data['mode'] || this.route.snapshot.queryParams['mode'];
    if (routeMode && ['dashboard', 'compress', 'create', 'extract'].includes(routeMode)) {
      this.mode = routeMode;
    }
    this.route.data.subscribe(data => {
      if (data['mode'] && ['dashboard', 'compress', 'create', 'extract'].includes(data['mode'])) {
        this.mode = data['mode'];
        this.cdr.markForCheck();
      }
    });
    this.route.queryParams.subscribe(params => {
      if (params['mode'] && ['dashboard', 'compress', 'create', 'extract'].includes(params['mode'])) {
        this.mode = params['mode'];
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.cleanupUrls();
  }

  private cleanupUrls(): void {
    if (this.originalPdfThumbnailUrl) {
      this.fileService.revokeObjectUrl(this.originalPdfThumbnailUrl);
    }
    if (this.processedPdfThumbnailUrl) {
      this.fileService.revokeObjectUrl(this.processedPdfThumbnailUrl);
    }
    for (const url of this.imageThumbnailUrls) {
      this.fileService.revokeObjectUrl(url);
    }
    for (const url of this.extractedImageUrls) {
      this.fileService.revokeObjectUrl(url);
    }
    this.imageThumbnailUrls = [];
    this.extractedImageUrls = [];
  }

  get beforePreviewData(): PreviewData | undefined {
    if (this.mode === 'compress') {
      if (!this.originalFile) return undefined;
      return {
        name: this.originalFile.name,
        type: 'application/pdf',
        sizeBytes: this.originalFile.size,
        pages: this.originalPdfPageCount
      };
    } else if (this.mode === 'create') {
      const totalSize = this.imageFiles.reduce((acc, f) => acc + f.size, 0);
      return {
        name: `${this.imageFiles.length} Images`,
        type: 'Mixed',
        sizeBytes: totalSize,
        pages: this.imageFiles.length
      };
    }
    return undefined;
  }

  get afterPreviewData(): PreviewData | undefined {
    if (!this.processedResult?.metadata) return undefined;
    return {
      name: this.processedResult.metadata.name,
      type: 'application/pdf',
      sizeBytes: this.processedResult.metadata.sizeBytes,
      pages: this.originalPdfPageCount
    };
  }

  // --- Compress Logic ---
  async onCompressPdfSelected(file: File): Promise<void> {
    const val = this.validationService.validatePdf(file);
    if (!val.valid) {
      this.errorMessage = val.error;
      this.workflowState = 'ERROR';
      this.cdr.detectChanges();
      return;
    }

    this.errorMessage = undefined;
    this.originalFile = file;
    this.processedResult = undefined;
    this.workflowState = 'CONFIGURING';
    this.cdr.detectChanges();

    try {
      this.originalPdfPageCount = await this.pdfService.getPdfPageCount(file);
      const buffer = await file.arrayBuffer();
      const docId = `pdf_thumb_${Date.now()}`;
      await this.pdfRenderService.loadPdf(buffer, docId);
      this.originalPdfThumbnailUrl = await this.pdfRenderService.getPageThumbnail(1, docId, 0.3);
      this.cdr.detectChanges();
    } catch {
      // ignore thumbnail error
    }
  }

  async selectPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (file) {
      await this.onCompressPdfSelected(file);
    }
  }

  removeCompressPdf(): void {
    this.cleanupUrls();
    this.originalFile = undefined;
    this.processedResult = undefined;
    this.originalPdfPageCount = undefined;
    this.errorMessage = undefined;
    this.workflowState = 'EMPTY';
    this.cdr.detectChanges();
  }

  async compressPdf(): Promise<void> {
    if (!this.originalFile) return;

    this.isProcessing = true;
    this.workflowState = 'PROCESSING';
    this.processingStage = 'analyzing';
    this.stageText = getProcessingStageLabel('analyzing', this.translationService);
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.isProcessing) {
        this.processingStage = 'optimizing';
        this.stageText = getProcessingStageLabel('optimizing', this.translationService);
        this.cdr.detectChanges();
      }
    }, 400);

    this.processedResult = await this.pdfService.compressPdfToExactKB(
      this.originalFile,
      { targetKB: this.selectedTargetKB }
    );
    this.isProcessing = false;

    if (this.processedResult.success && this.processedResult.file) {
      this.workflowState = 'SUCCESS';
      try {
        const buffer = await this.processedResult.file.arrayBuffer();
        const docId = `pdf_comp_${Date.now()}`;
        await this.pdfRenderService.loadPdf(buffer, docId);
        this.processedPdfThumbnailUrl = await this.pdfRenderService.getPageThumbnail(1, docId, 0.3);
      } catch {
        // ignore
      }
    } else {
      this.errorMessage = this.processedResult.error || 'Failed to compress PDF.';
      this.workflowState = 'ERROR';
    }
    this.cdr.detectChanges();
  }

  cancelProcessing(): void {
    this.isProcessing = false;
    this.workflowState = 'CONFIGURING';
    this.cdr.detectChanges();
  }

  // --- Create Logic ---
  onImagesDropped(files: File[]): void {
    const validImages = files.filter(f => f.type.startsWith('image/'));
    if (validImages.length > 0) {
      this.imageFiles = [...this.imageFiles, ...validImages];
      for (const f of validImages) {
        this.imageThumbnailUrls.push(this.fileService.createObjectUrl(f));
      }
      this.processedResult = undefined;
      this.cdr.detectChanges();
    }
  }

  async selectImages(): Promise<void> {
    const files = await this.fileService.pickMultipleImages();
    if (files && files.length > 0) {
      this.onImagesDropped(files);
    }
  }

  removeImage(index: number): void {
    if (this.imageThumbnailUrls[index]) {
      this.fileService.revokeObjectUrl(this.imageThumbnailUrls[index]);
      this.imageThumbnailUrls.splice(index, 1);
    }
    this.imageFiles.splice(index, 1);
    this.cdr.detectChanges();
  }

  moveImage(index: number, direction: -1 | 1): void {
    if (index + direction < 0 || index + direction >= this.imageFiles.length) return;
    const tempF = this.imageFiles[index];
    this.imageFiles[index] = this.imageFiles[index + direction];
    this.imageFiles[index + direction] = tempF;

    const tempU = this.imageThumbnailUrls[index];
    this.imageThumbnailUrls[index] = this.imageThumbnailUrls[index + direction];
    this.imageThumbnailUrls[index + direction] = tempU;
    this.cdr.detectChanges();
  }

  async createPdf(): Promise<void> {
    if (this.imageFiles.length === 0) return;
    this.isProcessing = true;
    this.workflowState = 'PROCESSING';
    this.stageText = 'Generating PDF from images...';
    this.cdr.detectChanges();

    this.processedResult = await this.pdfService.imagesToPdf(this.imageFiles, this.createConfig);
    this.isProcessing = false;

    if (this.processedResult.success) {
      this.workflowState = 'SUCCESS';
    } else {
      this.toast.error('Could not create the PDF: ' + this.processedResult.error);
      this.workflowState = 'ERROR';
    }
    this.cdr.detectChanges();
  }

  // --- Extract Logic ---
  async onExtractPdfSelected(file: File): Promise<void> {
    const val = this.validationService.validatePdf(file);
    if (!val.valid) {
      // `error` is optional on the result, and an empty toast would tell the
      // person nothing at all about why their file was turned away.
      this.toast.warning(val.error || 'That file is not a PDF this app can read.');
      return;
    }

    this.extractPdfFile = file;
    this.extractedImages = [];
    this.extractPageThumbnails.clear();
    this.isProcessing = true;
    this.stageText = 'Reading PDF pages...';
    this.cdr.detectChanges();

    try {
      this.pdfPageCount = await this.pdfService.getPdfPageCount(file);
      this.pagesArray = Array.from({ length: this.pdfPageCount }, (_, i) => i + 1);
      this.selectedPages = new Array(this.pdfPageCount).fill(true);

      const buffer = await file.arrayBuffer();
      const docId = `extract_${Date.now()}`;
      await this.pdfRenderService.loadPdf(buffer, docId);

      // Lazy load first 12 thumbnails
      const thumbLimit = Math.min(this.pdfPageCount, 12);
      for (let p = 1; p <= thumbLimit; p++) {
        const thumb = await this.pdfRenderService.getPageThumbnail(p, docId, 0.25);
        this.extractPageThumbnails.set(p, thumb);
      }
    } catch (e: any) {
      this.toast.error('Could not read that PDF: ' + e);
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  async selectExtractPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (file) {
      await this.onExtractPdfSelected(file);
    }
  }

  toggleSelectAll(select: boolean): void {
    this.selectedPages = new Array(this.pdfPageCount).fill(select);
  }

  togglePage(index: number): void {
    this.selectedPages[index] = !this.selectedPages[index];
  }

  async extractSelectedPages(): Promise<void> {
    if (!this.extractPdfFile) return;
    const pagesToExtract = this.pagesArray.filter((_, i) => this.selectedPages[i]);
    if (pagesToExtract.length === 0) {
      this.toast.warning('Select at least one page to extract.');
      return;
    }

    this.isProcessing = true;
    this.stageText = `Extracting ${pagesToExtract.length} pages as images...`;
    this.cdr.detectChanges();

    try {
      this.extractedImages = await this.pdfService.extractPagesToImages(this.extractPdfFile, pagesToExtract);
      this.extractedImageUrls = this.extractedImages.map(img => this.fileService.createObjectUrl(img));
    } catch (e: any) {
      this.toast.error('Could not extract the images: ' + e);
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  async savePdf(): Promise<void> {
    if (!this.processedResult?.file) return;
    const uri = await this.storageService.saveFile(this.processedResult.file, 'document');
    if (uri && uri !== 'web-download') {
      await this.historyService.addHistoryItem({
        operation: 'pdf',
        originalFileName: this.originalFile?.name || `${this.imageFiles.length} Images`,
        outputFileName: this.processedResult.file.name,
        originalSizeBytes: this.originalFile?.size || 0,
        outputSizeBytes: this.processedResult.file.size,
        outputPath: uri
      });
      this.toast.success('Saved to your Documents folder.');
    }
  }

  async sharePdf(): Promise<void> {
    // Sharing is handled via the Social Media Share modal inside app-result-preview.
    // Avoid triggering storageService.saveFile() which downloads the file on web.
  }

  async saveCompressedPdf(): Promise<void> {
    return this.savePdf();
  }

  async shareCompressedPdf(): Promise<void> {
    return this.sharePdf();
  }

  async saveCreatedPdf(): Promise<void> {
    return this.savePdf();
  }

  async shareCreatedPdf(): Promise<void> {
    return this.sharePdf();
  }

  async saveExtractedImage(file: File): Promise<void> {
    const uri = await this.storageService.saveFile(file, 'photo');
    if (uri && uri !== 'web-download') {
      this.toast.success('Saved to your Documents folder.');
    }
  }
}
