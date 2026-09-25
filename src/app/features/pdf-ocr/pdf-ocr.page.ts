import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { FileService } from '../../core/services/file.service';
import { ValidationService } from '../../core/services/validation.service';
import { OcrService } from '../../core/services/ocr.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToastService } from '../../core/services/toast.service';
import {
  OcrSupportedLanguage,
  OcrLanguageOption,
  OCR_SUPPORTED_LANGUAGES,
  OcrProgressEvent,
  OcrDocumentResult,
  OcrPageResult
} from '../../core/models/ocr.models';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type OcrWorkflowStep = 'select' | 'detect' | 'configure' | 'processing' | 'result';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-ocr',
  templateUrl: './pdf-ocr.page.html',
  styleUrls: ['./pdf-ocr.page.scss'],
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
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfOcrPage implements OnInit, OnDestroy {
  currentStep: OcrWorkflowStep = 'select';
  selectedFile?: File;
  previewUrl?: string;

  // Detection state
  isDetecting = false;
  hasSelectableText = false;
  textSample = '';
  totalPages = 0;
  pagesWithText: number[] = [];
  scannedPages: number[] = [];

  // Configuration state
  availableLanguages: OcrLanguageOption[] = OCR_SUPPORTED_LANGUAGES;
  selectedLanguage: OcrSupportedLanguage = 'eng';
  selectedSecondaryLang: OcrSupportedLanguage | 'none' = 'none';

  pageSelectionMode: 'all' | 'custom' | 'scanned_only' = 'all';
  selectedPageNumbers: number[] = [];

  // Processing state
  isProcessing = false;
  processingStage: OcrProgressEvent['stage'] = 'initializing';
  progressValue = 0;
  progressPercent = 0;
  progressMessage = '';
  currentPageProcessing = 1;

  // Result state
  ocrResult?: OcrDocumentResult;
  activePageIndex = 0;
  searchQuery = '';
  isCopied = false;
  isExporting = false;

  constructor(
    private fileService: FileService,
    private validationService: ValidationService,
    private ocrService: OcrService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private documentBridgeService: DocumentBridgeService,
    private translationService: TranslationService,
    private toastService: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  analyzeWithIntelligence(): void {
    if (this.selectedFile) {
      this.documentBridgeService.setIntelligenceTarget({
        file: this.selectedFile,
        text: this.ocrResult?.fullText,
        source: 'ocr'
      });
      this.router.navigate(['/features/pdf-intelligence']);
    }
  }

  ngOnInit(): void {
    // Check if a document was passed from Document Scanner or other features
    const bridgedDoc = this.documentBridgeService.getOcrTarget();
    if (bridgedDoc && bridgedDoc.file) {
      this.onFileSelected(bridgedDoc.file);
    }
  }

  ngOnDestroy(): void {
    this.ocrService.cancelJob();
    this.clearPreviewUrl();
  }

  get activePage(): OcrPageResult | undefined {
    if (!this.ocrResult || !this.ocrResult.pages) return undefined;
    return this.ocrResult.pages[this.activePageIndex];
  }

  get filteredPageText(): string {
    if (!this.activePage) return '';
    return this.activePage.text;
  }

  get isPdf(): boolean {
    if (!this.selectedFile) return false;
    return this.selectedFile.type === 'application/pdf' || this.selectedFile.name.toLowerCase().endsWith('.pdf');
  }

  async onFileSelected(file: File): Promise<void> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const val = this.validationService.validatePdf(file);
      if (!val.valid) {
        this.toastService.show('error', val.error || 'Invalid PDF file');
        return;
      }
    } else {
      const val = this.validationService.validateImage(file);
      if (!val.valid) {
        this.toastService.show('error', val.error || 'Invalid image file');
        return;
      }
    }

    this.clearPreviewUrl();
    this.selectedFile = file;
    this.previewUrl = this.fileService.createObjectUrl(file);

    if (isPdf) {
      await this.runTextDetection(file);
    } else {
      this.hasSelectableText = false;
      this.totalPages = 1;
      this.selectedPageNumbers = [1];
      this.currentStep = 'configure';
    }
    this.cdr.detectChanges();
  }

  private async runTextDetection(file: File): Promise<void> {
    this.currentStep = 'detect';
    this.isDetecting = true;
    this.cdr.detectChanges();

    try {
      const detection = await this.ocrService.detectSelectableText(file);
      this.hasSelectableText = detection.hasText;
      this.textSample = detection.textSample;
      this.totalPages = detection.pageCount;
      this.pagesWithText = detection.pagesWithText;
      this.scannedPages = detection.scannedPages;

      // Initialize all pages selected by default
      this.selectedPageNumbers = Array.from({ length: this.totalPages }, (_, i) => i + 1);

      if (this.hasSelectableText && this.scannedPages.length > 0) {
        this.pageSelectionMode = 'scanned_only';
        this.selectedPageNumbers = [...this.scannedPages];
      } else {
        this.pageSelectionMode = 'all';
      }

      this.currentStep = 'detect';
    } catch {
      /*
       * Detection fails when pdf.js cannot open the document at all -- a
       * truncated download, a renamed file that was never a PDF, a damaged
       * scan. This used to fall through to the configure step as though the
       * file were a one-page scan: the person picked a broken file, saw the
       * OCR settings, chose languages, started recognition, and only then hit
       * a failure -- or worse, got an empty result and no explanation.
       *
       * There is no recovering here. OCR renders its pages through the same
       * parser that just refused the file, so anything detection cannot open,
       * recognition cannot read either. Say so and go back to the picker with
       * the file cleared, so the next choice starts from a clean state.
       */
      this.toastService.show(
        'error',
        'That PDF could not be opened. It may be damaged or incomplete -- try another file.',
      );
      this.clearPreviewUrl();
      this.selectedFile = undefined;
      this.hasSelectableText = false;
      this.textSample = '';
      this.totalPages = 0;
      this.selectedPageNumbers = [];
      this.currentStep = 'select';
    } finally {
      this.isDetecting = false;
      this.cdr.detectChanges();
    }
  }

  proceedToOcrConfig(): void {
    this.currentStep = 'configure';
  }

  async extractExistingDigitalText(): Promise<void> {
    if (!this.selectedFile) return;
    this.isProcessing = true;
    this.currentStep = 'processing';
    this.progressMessage = 'Extracting digital text...';
    this.progressValue = 0.5;
    this.progressPercent = 50;
    this.cdr.detectChanges();

    try {
      this.ocrOperationId = `ocr_${Date.now()}`;
      this.ocrResult = await this.ocrService.extractExistingText(
        this.selectedFile,
        this.selectedPageNumbers
      );
      this.activePageIndex = 0;
      this.currentStep = 'result';
      this.recordHistory('extract_digital_text', this.ocrResult.fullText.length);
    } catch (err: any) {
      this.toastService.error(err?.message || 'Failed to extract text.');
      this.currentStep = 'detect';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  onPageSelectionModeChange(mode: 'all' | 'custom' | 'scanned_only'): void {
    this.pageSelectionMode = mode;
    if (mode === 'all') {
      this.selectedPageNumbers = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    } else if (mode === 'scanned_only') {
      this.selectedPageNumbers = [...this.scannedPages];
    }
  }

  togglePageNumber(pageNum: number): void {
    const idx = this.selectedPageNumbers.indexOf(pageNum);
    if (idx > -1) {
      /*
       * The last page used to be undroppable -- the splice was guarded by
       * `length > 1`. That left the checkbox and the state disagreeing: the
       * browser had already drawn the box unchecked, and because
       * `isPageSelected` still returned true the `[checked]` binding never
       * changed, so Angular had nothing to write back. The page looked
       * deselected and was still queued for recognition.
       *
       * Emptying the set is allowed instead. The start button already binds
       * its disabled state to `selectedPageNumbers.length === 0`, which is
       * the rule the template was written around.
       */
      this.selectedPageNumbers.splice(idx, 1);
    } else {
      this.selectedPageNumbers.push(pageNum);
      this.selectedPageNumbers.sort((a, b) => a - b);
    }
  }

  isPageSelected(pageNum: number): boolean {
    return this.selectedPageNumbers.includes(pageNum);
  }

  async startOcr(): Promise<void> {
    if (!this.selectedFile) return;

    this.isProcessing = true;
    this.currentStep = 'processing';
    this.progressValue = 0.05;
    this.progressPercent = 5;
    this.progressMessage = 'Initializing local OCR engine...';
    this.cdr.detectChanges();

    const languages: OcrSupportedLanguage[] = [this.selectedLanguage];
    if (this.selectedSecondaryLang !== 'none' && this.selectedSecondaryLang !== this.selectedLanguage) {
      languages.push(this.selectedSecondaryLang);
    }

    try {
      this.ocrOperationId = `ocr_${Date.now()}`;
      this.ocrResult = await this.ocrService.performOcr(
        this.selectedFile,
        languages,
        this.selectedPageNumbers,
        (evt: OcrProgressEvent) => {
          this.processingStage = evt.stage;
          this.progressValue = evt.progress;
          this.progressPercent = Math.round(evt.progress * 100);
          if (evt.message) this.progressMessage = evt.message;
          if (evt.pageNumber) this.currentPageProcessing = evt.pageNumber;
          this.cdr.detectChanges();
        }
      );

      this.activePageIndex = 0;
      this.currentStep = 'result';
      this.recordHistory('ocr', this.ocrResult.fullText.length);
      this.toastService.show('success', 'OCR completed successfully!');
    } catch (err: any) {
      if (err?.message !== 'OCR job was cancelled.') {
        this.toastService.show('error', err?.message || 'OCR processing failed.');
      }
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  cancelOcr(): void {
    this.ocrService.cancelJob();
    this.isProcessing = false;
    this.currentStep = 'configure';
    this.toastService.show('info', 'OCR cancelled.');
    this.cdr.detectChanges();
  }

  // Result Navigation & Actions
  prevPage(): void {
    if (this.activePageIndex > 0) {
      this.activePageIndex--;
    }
  }

  nextPage(): void {
    if (this.ocrResult && this.activePageIndex < this.ocrResult.pages.length - 1) {
      this.activePageIndex++;
    }
  }

  goToPage(index: number): void {
    if (this.ocrResult && index >= 0 && index < this.ocrResult.pages.length) {
      this.activePageIndex = index;
    }
  }

  async copyText(text?: string): Promise<void> {
    const textToCopy = text !== undefined ? text : this.activePage?.text || '';
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      this.isCopied = true;
      this.toastService.show('success', 'Text copied to clipboard!');
      setTimeout(() => (this.isCopied = false), 2000);
    } catch {
      this.toastService.show('error', 'Failed to copy to clipboard.');
    }
  }

  async copyAllText(): Promise<void> {
    if (!this.ocrResult?.fullText) return;
    await this.copyText(this.ocrResult.fullText);
  }

  /**
   * One OCR run is one operation, however many ways its output is exported.
   *
   * Set when the text is produced and passed to every save below, so taking the
   * text, the searchable PDF and the JSON from a single run costs one of the
   * free tier's daily operations rather than three.
   */
  private ocrOperationId: string | null = null;

  async downloadTextFile(): Promise<void> {
    if (!this.ocrResult || !this.selectedFile) return;
    const txtFile = this.ocrService.generateTextFile(this.ocrResult, this.selectedFile.name);
    await this.storageService.saveFile(txtFile, 'file', this.ocrOperationId ?? undefined);
    this.toastService.show('success', 'Extracted text saved!');
  }

  async downloadSearchablePdf(): Promise<void> {
    if (!this.ocrResult || !this.selectedFile) return;

    this.isExporting = true;
    this.cdr.detectChanges();

    try {
      const searchablePdf = await this.ocrService.generateSearchablePdf(
        this.selectedFile,
        this.ocrResult
      );
      await this.storageService.saveFile(searchablePdf, 'file', this.ocrOperationId ?? undefined);
      this.toastService.show('success', 'Searchable PDF saved with invisible text layer!');
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to generate searchable PDF.');
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  async downloadStructuredJson(): Promise<void> {
    if (!this.ocrResult || !this.selectedFile) return;
    const jsonFile = this.ocrService.generateJsonFile(this.ocrResult, this.selectedFile.name);
    await this.storageService.saveFile(jsonFile, 'file', this.ocrOperationId ?? undefined);
    this.toastService.show('success', 'Structured OCR JSON saved!');
  }

  async shareResult(): Promise<void> {
    if (!this.ocrResult || !this.selectedFile) return;
    const txtFile = this.ocrService.generateTextFile(this.ocrResult, this.selectedFile.name);
    await this.shareService.shareFile(txtFile);
  }

  resetAll(): void {
    this.ocrService.cancelJob();
    this.clearPreviewUrl();
    this.selectedFile = undefined;
    this.ocrResult = undefined;
    this.ocrOperationId = null;
    this.hasSelectableText = false;
    this.textSample = '';
    this.totalPages = 0;
    this.currentStep = 'select';
    this.cdr.detectChanges();
  }

  private clearPreviewUrl(): void {
    if (this.previewUrl) {
      this.fileService.revokeObjectUrl(this.previewUrl);
      this.previewUrl = undefined;
    }
  }

  private async recordHistory(action: string, textLength: number): Promise<void> {
    if (!this.selectedFile) return;
    try {
      await this.historyService.addHistoryItem({
        operation: 'ocr',
        originalFileName: this.selectedFile.name,
        outputFileName: `${this.selectedFile.name.replace(/\.[^/.]+$/, '')}_searchable.pdf`,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: textLength
      });
    } catch {
      // ignore
    }
  }
}
