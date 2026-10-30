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

import { OcrConfidenceService } from '../../core/services/ocr-confidence.service';
import { OcrService } from '../../core/services/ocr.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';

import {
  ConfidenceTier,
  ConfidenceWord,
  ConfidenceDocumentResult,
  ConfidencePageResult,
  DictionaryEntry
} from '../../core/models/ocr-confidence.types';
import { OcrDocumentResult } from '../../core/models/ocr.models';

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

import * as pdfjsLib from 'pdfjs-dist';
import '../../core/utilities/pdfjs-worker';

export type CorrectStep = 'select' | 'auditing' | 'audit';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-ocr-correct',
  templateUrl: './ocr-correct.page.html',
  styleUrls: ['./ocr-correct.page.scss'],
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
export class OcrCorrectPage implements OnInit, OnDestroy {
  @ViewChild('canvasContainer') canvasContainer?: ElementRef<HTMLDivElement>;

  private ocrConfidenceService = inject(OcrConfidenceService);
  private ocrService = inject(OcrService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private documentBridgeService = inject(DocumentBridgeService);
  private translationService = inject(TranslationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentStep: CorrectStep = 'select';
  selectedFile?: File;
  previewUrl?: string;

  // Audit results
  confidenceDoc: ConfidenceDocumentResult | null = null;
  currentPageIndex = 0;
  renderedCanvases: HTMLCanvasElement[] = [];

  // Heatmap & View options
  showHeatmap = true;
  tierFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  zoomLevel = 1.0;

  // Quick Correction Drawer State
  selectedWord: ConfidenceWord | null = null;
  isCorrectionDrawerOpen = false;
  correctionInput = '';
  addToDictionaryToggle = true;
  isReOcring = false;

  // Low-confidence carousel
  lowConfidenceWords: ConfidenceWord[] = [];
  currentCarouselIndex = 0;

  // Dictionary management modal
  isDictionaryModalOpen = false;
  dictionaryRules: DictionaryEntry[] = [];
  newRuleTarget = '';
  newRuleReplacement = '';
  newRuleMatchCase = false;
  newRuleWholeWord = false;

  async ngOnInit(): Promise<void> {
    this.dictionaryRules = await this.ocrConfidenceService.loadDictionary();

    // Check if target was passed via DocumentBridgeService
    const bridgeDoc = this.documentBridgeService.getOcrTarget();
    if (bridgeDoc && bridgeDoc.file) {
      this.onFileSelected(bridgeDoc.file);
    }
  }

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    for (const c of this.renderedCanvases) {
      c.width = 0;
      c.height = 0;
    }
    this.renderedCanvases = [];
    this.ocrConfidenceService.terminateWorker().catch(() => {});
  }

  get currentPage(): ConfidencePageResult | undefined {
    return this.confidenceDoc?.pages[this.currentPageIndex];
  }

  get currentCanvas(): HTMLCanvasElement | undefined {
    return this.renderedCanvases[this.currentPageIndex];
  }

  get filteredWords(): ConfidenceWord[] {
    const words = this.currentPage?.words || [];
    if (this.tierFilter === 'all') return words;
    return words.filter(w => w.tier === this.tierFilter);
  }

  /**
   * Computes responsive percentage-based bounding box coordinates
   * to guarantee pixel-accurate heatmap overlays across mobile, desktop, and varied DPR displays.
   */
  getWordBoxStyle(word: ConfidenceWord): { left: string; top: string; width: string; height: string } {
    const pageW = this.currentPage?.width || 0;
    const pageH = this.currentPage?.height || 0;
    if (pageW > 0 && pageH > 0) {
      return {
        left: `${((word.bbox.x / pageW) * 100).toFixed(2)}%`,
        top: `${((word.bbox.y / pageH) * 100).toFixed(2)}%`,
        width: `${((word.bbox.width / pageW) * 100).toFixed(2)}%`,
        height: `${((word.bbox.height / pageH) * 100).toFixed(2)}%`
      };
    }
    return {
      left: `${word.bbox.x}px`,
      top: `${word.bbox.y}px`,
      width: `${word.bbox.width}px`,
      height: `${word.bbox.height}px`
    };
  }

  onFileSelected(file: File): void {
    this.selectedFile = file;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = URL.createObjectURL(file);
    this.startQualityAudit();
  }

  clearSelectedFile(): void {
    this.selectedFile = undefined;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = undefined;
    }
    // Clean up GPU textures from rendered canvases
    for (const c of this.renderedCanvases) {
      c.width = 0;
      c.height = 0;
    }
    this.renderedCanvases = [];
    this.confidenceDoc = null;
    this.currentStep = 'select';
  }

  async startQualityAudit(): Promise<void> {
    if (!this.selectedFile) return;

    this.currentStep = 'auditing';
    this.cdr.detectChanges();

    try {
      // 1. Render file to canvas(es)
      this.renderedCanvases = await this.renderFileToCanvases(this.selectedFile);

      // 2. Perform or extract OCR document
      const rawOcrResult = await this.ocrService.performOcr(
        this.selectedFile,
        'eng',
        undefined,
        undefined
      );

      // 3. Build confidence quality audit & apply persistent dictionary
      const auditDoc = await this.ocrConfidenceService.auditOcrDocument(
        rawOcrResult,
        this.renderedCanvases
      );

      this.confidenceDoc = auditDoc;
      this.currentPageIndex = 0;
      this.updateLowConfidenceQueue();
      this.currentStep = 'audit';
      this.cdr.detectChanges();

      // Log to history
      try {
        await this.historyService.addHistoryItem({
          operation: 'ocr-correct',
          originalFileName: this.selectedFile.name,
          outputFileName: `${this.selectedFile.name.replace(/\.[^/.]+$/, '')}_audit.json`,
          originalSizeBytes: this.selectedFile.size,
          outputSizeBytes: auditDoc.fullText.length
        });
      } catch {}

    } catch (err: any) {
      this.currentStep = 'select';
      this.toastService.error(err.message || 'Failed to analyze document OCR confidence');
      this.cdr.detectChanges();
    }
  }

  private async renderFileToCanvases(file: File): Promise<HTMLCanvasElement[]> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) } as any);
      try {
        const pdf = await loadingTask.promise;
        const canvases: HTMLCanvasElement[] = [];
        const numPages = Math.min(pdf.numPages, 10); // Audit up to 10 pages smoothly

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          try {
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
            }
            canvases.push(canvas);
          } finally {
            if (typeof (page as any).cleanup === 'function') {
              (page as any).cleanup();
            }
          }
        }
        return canvases;
      } finally {
        await loadingTask.destroy();
      }
    } else {
      return new Promise<HTMLCanvasElement[]>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
            resolve([canvas]);
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  }

  updateLowConfidenceQueue(): void {
    if (!this.confidenceDoc) {
      this.lowConfidenceWords = [];
      return;
    }
    this.lowConfidenceWords = this.confidenceDoc.allWords.filter(
      w => (w.tier === 'low' || w.tier === 'medium') && !w.isReviewed
    );
    if (this.currentCarouselIndex >= this.lowConfidenceWords.length) {
      this.currentCarouselIndex = Math.max(0, this.lowConfidenceWords.length - 1);
    }
  }

  // Quick Correction Drawer
  openCorrectionDrawer(word: ConfidenceWord): void {
    this.selectedWord = word;
    this.correctionInput = word.text;
    this.isCorrectionDrawerOpen = true;

    // Ensure crop image is available
    if (!word.cropDataUrl && this.currentCanvas) {
      word.cropDataUrl = this.ocrConfidenceService.cropMagnifiedWord(this.currentCanvas, word.bbox);
    }

    this.scrollToWordBbox(word);
  }

  closeCorrectionDrawer(): void {
    this.isCorrectionDrawerOpen = false;
    this.selectedWord = null;
  }

  chooseSuggestion(candidate: string): void {
    this.correctionInput = candidate;
  }

  async applyCorrection(replaceEverywhere: boolean): Promise<void> {
    if (!this.confidenceDoc || !this.selectedWord) return;

    const wordId = this.selectedWord.id;
    const replacement = this.correctionInput.trim();
    if (!replacement) return;

    this.confidenceDoc = await this.ocrConfidenceService.replaceWordInDocument(
      this.confidenceDoc,
      wordId,
      replacement,
      replaceEverywhere,
      this.addToDictionaryToggle
    );

    this.updateLowConfidenceQueue();
    this.dictionaryRules = await this.ocrConfidenceService.loadDictionary();

    this.toastService.success(
      replaceEverywhere
        ? `Replaced all matching occurrences with "${replacement}"`
        : `Replaced with "${replacement}"`
    );

    this.closeCorrectionDrawer();
    this.cdr.detectChanges();
  }

  async enhanceAndReOcr(): Promise<void> {
    if (!this.selectedWord || !this.currentCanvas) return;

    this.isReOcring = true;
    try {
      const reResult = await this.ocrConfidenceService.reOcrRegion(
        this.currentCanvas,
        this.selectedWord
      );

      this.selectedWord.text = reResult.text;
      this.selectedWord.confidence = reResult.confidence;
      this.selectedWord.tier = this.ocrConfidenceService.classifyTier(reResult.confidence);
      this.selectedWord.isCorrected = true;
      this.selectedWord.isReviewed = true;
      this.correctionInput = reResult.text;

      this.toastService.success(
        this.translationService.translate('ocrConfidence.reOcrSuccess') || 'Region enhanced and re-recognized!'
      );
      this.updateLowConfidenceQueue();
      this.cdr.detectChanges();
    } catch {
      this.toastService.error('Targeted re-OCR failed');
    } finally {
      this.isReOcring = false;
    }
  }

  // Low-confidence carousel
  get currentCarouselWord(): ConfidenceWord | undefined {
    return this.lowConfidenceWords[this.currentCarouselIndex];
  }

  acceptCarouselWord(word: ConfidenceWord, event?: Event): void {
    event?.stopPropagation();
    word.isReviewed = true;
    if (this.confidenceDoc) {
      const matched = this.confidenceDoc.allWords.find(w => w.id === word.id);
      if (matched) matched.isReviewed = true;
    }
    this.updateLowConfidenceQueue();
    this.toastService.success(`Accepted "${word.text}"`);
    this.cdr.detectChanges();
  }

  nextCarouselWord(): void {
    if (this.currentCarouselIndex < this.lowConfidenceWords.length - 1) {
      this.currentCarouselIndex++;
      const nextWord = this.currentCarouselWord;
      if (nextWord) this.scrollToWordBbox(nextWord);
    }
  }

  prevCarouselWord(): void {
    if (this.currentCarouselIndex > 0) {
      this.currentCarouselIndex--;
      const prevWord = this.currentCarouselWord;
      if (prevWord) this.scrollToWordBbox(prevWord);
    }
  }

  scrollToWordBbox(word: ConfidenceWord): void {
    if (word.pageNumber - 1 !== this.currentPageIndex) {
      this.currentPageIndex = word.pageNumber - 1;
      this.cdr.detectChanges();
    }

    if (!this.canvasContainer) return;
    const container = this.canvasContainer.nativeElement;
    const centerY = word.bbox.y * this.zoomLevel;
    const targetTop = Math.max(0, centerY - container.clientHeight / 2);
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  // Page Navigation
  prevPage(): void {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
    }
  }

  nextPage(): void {
    if (this.confidenceDoc && this.currentPageIndex < this.confidenceDoc.pages.length - 1) {
      this.currentPageIndex++;
    }
  }

  // Zoom controls
  zoomIn(): void {
    this.zoomLevel = Math.min(2.5, +(this.zoomLevel + 0.2).toFixed(2));
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.2).toFixed(2));
  }

  resetZoom(): void {
    this.zoomLevel = 1.0;
  }

  // Dictionary management modal
  openDictionaryModal(): void {
    this.isDictionaryModalOpen = true;
  }

  closeDictionaryModal(): void {
    this.isDictionaryModalOpen = false;
    this.newRuleTarget = '';
    this.newRuleReplacement = '';
  }

  async addRuleFromModal(): Promise<void> {
    if (!this.newRuleTarget.trim() || !this.newRuleReplacement.trim()) return;

    await this.ocrConfidenceService.addCorrectionRule(
      this.newRuleTarget,
      this.newRuleReplacement,
      this.newRuleMatchCase,
      false,
      this.newRuleWholeWord
    );

    this.dictionaryRules = await this.ocrConfidenceService.loadDictionary();
    this.newRuleTarget = '';
    this.newRuleReplacement = '';
    this.toastService.success(
      this.translationService.translate('ocrConfidence.ruleAdded') || 'Rule added to dictionary!'
    );
  }

  async deleteRuleFromModal(id: string): Promise<void> {
    await this.ocrConfidenceService.deleteCorrectionRule(id);
    this.dictionaryRules = await this.ocrConfidenceService.loadDictionary();
    this.toastService.success(
      this.translationService.translate('ocrConfidence.ruleDeleted') || 'Rule removed.'
    );
  }

  // Sticky Bottom Actions
  async saveCorrectedDocument(): Promise<void> {
    if (!this.confidenceDoc) return;

    // 1. Plain text export
    const textFile = this.ocrConfidenceService.exportCorrectedTextFile(this.confidenceDoc);
    this.fileService.downloadFile(textFile);

    // 2. Structured Quality Audit JSON
    const jsonFile = this.ocrConfidenceService.exportCorrectedJsonFile(this.confidenceDoc);
    this.fileService.downloadFile(jsonFile);

    // 3. Searchable PDF with corrected text layer
    if (this.selectedFile) {
      try {
        const ocrDoc = this.ocrConfidenceService.toOcrDocumentResult(this.confidenceDoc);
        const pdfFile = await this.ocrService.generateSearchablePdf(this.selectedFile, ocrDoc);
        this.fileService.downloadFile(pdfFile);
      } catch (err) {
        console.warn('Searchable PDF export skipped or generated warning:', err);
      }
    }

    this.toastService.success(
      this.translationService.translate('ocrConfidence.exportSuccess') || 'Saved corrected files!'
    );
  }

  async shareCorrectedText(): Promise<void> {
    if (!this.confidenceDoc) return;
    try {
      await this.shareService.share({
        title: `Corrected OCR — ${this.confidenceDoc.fileName}`,
        text: this.confidenceDoc.fullText
      });
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(this.confidenceDoc.fullText);
        this.toastService.success(
          this.translationService.translate('ocrConfidence.textCopied') || 'Text copied to clipboard!'
        );
      }
    }
  }
}
