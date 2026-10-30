import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  inject,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import { OcrHandwritingService } from '../../core/services/ocr-handwriting.service';
import {
  HandwritingOcrResult,
  HandwritingLine,
  HandwritingBbox
} from '../../core/models/ocr.models';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppModalComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  AppConversionAnimationComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type HandwritingStep = 'select' | 'processing' | 'result';

export interface HandwritingLanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

const PREF_KEY_ACKNOWLEDGED = 'ocr_handwriting_acknowledged';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-ocr-handwriting',
  templateUrl: './ocr-handwriting.page.html',
  styleUrls: ['./ocr-handwriting.page.scss'],
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
    AppIconComponent,
    AppModalComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    AppConversionAnimationComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class OcrHandwritingPage implements OnInit, OnDestroy {
  @ViewChild('imageScrollContainer') imageScrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('displayedImage') displayedImage?: ElementRef<HTMLImageElement>;

  private ocrHandwritingService = inject(OcrHandwritingService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private documentBridgeService = inject(DocumentBridgeService);
  private translationService = inject(TranslationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentStep: HandwritingStep = 'select';
  selectedFile?: File;
  previewUrl?: string;

  // Expectation management
  hasAcknowledgedExpectations = false;
  showExpectationModal = false;

  // Processing state
  isProcessing = false;
  processingStage: 'sauvola' | 'deskewing' | 'recognizing' = 'sauvola';
  processingStageText = '';

  // Recognition configuration
  selectedLanguage = 'eng';
  psmMode: 6 | 11 = 6;
  availableLanguages: HandwritingLanguageOption[] = [
    { code: 'eng', name: 'English', nativeName: 'English' },
    { code: 'hin', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'mar', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'ben', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'pan', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' }
  ];

  // OCR Output
  ocrResult: HandwritingOcrResult | null = null;
  editableFullText = '';
  activeLineId: string | null = null;

  // Image Viewer Controls
  imageZoom = 1.0;
  imageFilterMode: 'original' | 'sauvola' = 'original';
  activeResultTab: 'split' | 'lines' | 'text' = 'split';

  async ngOnInit(): Promise<void> {
    try {
      const storedAck = await Preferences.get({ key: PREF_KEY_ACKNOWLEDGED });
      if (storedAck && storedAck.value === 'true') {
        this.hasAcknowledgedExpectations = true;
      }
    } catch {
      // Fallback in environments where Capacitor storage isn't initialized
    }

    // If navigated from other parts of the app with an OCR target file
    const bridgedDoc = this.documentBridgeService.getOcrTarget();
    if (bridgedDoc && bridgedDoc.file) {
      this.onFileSelected(bridgedDoc.file);
    }
  }

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.ocrHandwritingService.terminateWorker().catch(() => {});
  }

  // Navigation between OCR modes
  navigateToPrinted(): void {
    this.router.navigate(['/features/pdf-ocr']);
  }

  // Upfront Expectation Management
  openExpectationModal(): void {
    this.showExpectationModal = true;
    this.cdr.detectChanges();
  }

  dismissExpectationModal(): void {
    this.showExpectationModal = false;
    this.cdr.detectChanges();
  }

  async acknowledgeAndContinue(): Promise<void> {
    this.hasAcknowledgedExpectations = true;
    this.showExpectationModal = false;
    this.cdr.detectChanges();
    try {
      await Preferences.set({ key: PREF_KEY_ACKNOWLEDGED, value: 'true' });
    } catch {}

    if (this.selectedFile && this.currentStep === 'select') {
      await this.startHandwritingOcr();
    }
  }

  // File Handling
  onFileSelected(file: File): void {
    this.selectedFile = file;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = URL.createObjectURL(file);
    this.ocrResult = null;
    this.editableFullText = '';
    this.activeLineId = null;
    this.cdr.detectChanges();
  }

  clearSelectedFile(): void {
    this.selectedFile = undefined;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = undefined;
    }
    this.ocrResult = null;
    this.cdr.detectChanges();
  }

  // Recognition Execution
  async startHandwritingOcr(): Promise<void> {
    if (!this.selectedFile) return;

    if (!this.hasAcknowledgedExpectations) {
      this.showExpectationModal = true;
      this.cdr.detectChanges();
      return;
    }

    this.isProcessing = true;
    this.currentStep = 'processing';
    this.processingStage = 'sauvola';
    this.processingStageText = this.translationService.translate('handwritingOcr.sauvolaFiltering');
    this.cdr.detectChanges();

    try {
      // Small tick for smooth animation transitions
      await new Promise(r => setTimeout(r, 200));
      this.processingStage = 'deskewing';
      this.processingStageText = this.translationService.translate('handwritingOcr.deskewing');
      this.cdr.detectChanges();

      await new Promise(r => setTimeout(r, 150));
      this.processingStage = 'recognizing';
      this.processingStageText = this.translationService.translate('handwritingOcr.recognizing');
      this.cdr.detectChanges();

      const result = await this.ocrHandwritingService.recognizeHandwriting(this.selectedFile, {
        language: this.selectedLanguage,
        psmMode: this.psmMode,
        acknowledgedExpectations: true
      });

      this.ocrResult = result;
      this.editableFullText = result.fullText;
      this.activeLineId = result.lines[0]?.id || null;
      this.currentStep = 'result';
      this.isProcessing = false;
      this.imageZoom = 1.0;
      this.imageFilterMode = 'original';

      // Save to history
      try {
        await this.historyService.addHistoryItem({
          operation: 'ocr-handwriting',
          originalFileName: this.selectedFile.name,
          outputFileName: `${this.selectedFile.name.replace(/\.[^/.]+$/, '')}_handwriting_text.txt`,
          originalSizeBytes: this.selectedFile.size,
          outputSizeBytes: result.fullText.length
        });
      } catch {}

      this.cdr.detectChanges();
    } catch (err: any) {
      this.isProcessing = false;
      this.currentStep = 'select';
      this.toastService.error(err.message || 'Handwriting recognition failed');
      this.cdr.detectChanges();
    }
  }

  // Split-view and Coordinate Navigation
  setActiveLine(line: HandwritingLine): void {
    this.activeLineId = line.id;
    this.scrollToBbox(line.bbox);
  }

  getBboxStyle(line: HandwritingLine): { left: string; top: string; width: string; height: string } {
    const origW = this.ocrResult?.imageWidth;
    const origH = this.ocrResult?.imageHeight;
    if (origW && origH && origW > 0 && origH > 0) {
      return {
        left: `${((line.bbox.x0 / origW) * 100).toFixed(2)}%`,
        top: `${((line.bbox.y0 / origH) * 100).toFixed(2)}%`,
        width: `${(((line.bbox.x1 - line.bbox.x0) / origW) * 100).toFixed(2)}%`,
        height: `${(((line.bbox.y1 - line.bbox.y0) / origH) * 100).toFixed(2)}%`
      };
    }
    return {
      left: `${line.bbox.x0}px`,
      top: `${line.bbox.y0}px`,
      width: `${line.bbox.x1 - line.bbox.x0}px`,
      height: `${line.bbox.y1 - line.bbox.y0}px`
    };
  }

  scrollToBbox(bbox: HandwritingBbox): void {
    if (!this.imageScrollContainer) return;
    const container = this.imageScrollContainer.nativeElement;
    const img = this.displayedImage?.nativeElement;
    const renderedHeight = img?.clientHeight || this.ocrResult?.imageHeight || 1;
    const naturalHeight = img?.naturalHeight || this.ocrResult?.imageHeight || renderedHeight;
    const scaleFactor = naturalHeight > 0 ? renderedHeight / naturalHeight : 1;

    const centerY = (bbox.y0 + (bbox.y1 - bbox.y0) / 2) * scaleFactor * this.imageZoom;
    const targetTop = Math.max(0, centerY - container.clientHeight / 2);
    container.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    });
  }

  onLineTextEdited(line: HandwritingLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    line.text = input.value;
    line.wordCount = line.text.split(/\s+/).filter(Boolean).length;
    // Reconstruct full text
    if (this.ocrResult) {
      this.editableFullText = this.ocrResult.lines.map(l => l.text).join('\n');
    }
  }

  onFullTextEdited(): void {
    if (this.ocrResult) {
      this.ocrResult.fullText = this.editableFullText;
      this.ocrResult.wordCount = this.getWordCount();
    }
  }

  getWordCount(): number {
    return this.editableFullText.trim().split(/\s+/).filter(Boolean).length;
  }

  // Zoom Controls
  zoomIn(): void {
    this.imageZoom = Math.min(3.0, +(this.imageZoom + 0.25).toFixed(2));
  }

  zoomOut(): void {
    this.imageZoom = Math.max(0.5, +(this.imageZoom - 0.25).toFixed(2));
  }

  resetZoom(): void {
    this.imageZoom = 1.0;
  }

  toggleImageFilter(): void {
    this.imageFilterMode = this.imageFilterMode === 'original' ? 'sauvola' : 'original';
  }

  // Clipboard & Sharing
  async copyText(): Promise<void> {
    if (!this.editableFullText) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(this.editableFullText);
      }
      this.toastService.success(
        this.translationService.translate('handwritingOcr.textCopied') || 'Text copied to clipboard!'
      );
    } catch {
      this.toastService.error('Failed to copy to clipboard');
    }
  }

  async shareRecognizedText(): Promise<void> {
    if (!this.editableFullText) return;
    try {
      await this.shareService.share({
        title: this.ocrResult?.sourceFileName
          ? `Handwriting OCR — ${this.ocrResult.sourceFileName}`
          : 'Handwriting OCR Result',
        text: this.editableFullText
      });
    } catch {
      await this.copyText();
    }
  }

  exportTextAndScans(): void {
    if (!this.ocrResult) return;

    // 1. Download Text file
    const textFile = this.ocrHandwritingService.generateTextFile(
      this.ocrResult,
      this.editableFullText
    );
    this.fileService.downloadFile(textFile);

    // 2. Download Structured JSON
    const jsonFile = this.ocrHandwritingService.generateJsonFile(
      this.ocrResult,
      this.editableFullText
    );
    this.fileService.downloadFile(jsonFile);

    this.toastService.success(
      this.translationService.translate('handwritingOcr.exportSuccess') || 'Exported successfully!'
    );
  }

  resetScan(): void {
    this.currentStep = 'select';
    this.selectedFile = undefined;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = undefined;
    }
    this.ocrResult = null;
    this.editableFullText = '';
    this.activeLineId = null;
    this.imageZoom = 1.0;
  }
}
