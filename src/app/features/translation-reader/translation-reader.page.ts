import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import '../../core/utilities/pdfjs-worker';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { SupportedLanguage } from '../../core/i18n/i18n.types';
import {
  ScrollLockPageBound,
  TranslationSession
} from '../../core/models/pdf-intelligence.types';
import { TranslationReaderService } from '../../core/services/translation-reader.service';
import { StorageService } from '../../core/services/storage.service';

export interface TargetLanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeName: string;
}

@Component({
  selector: 'app-translation-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './translation-reader.page.html',
  styleUrls: ['./translation-reader.page.scss']
})
export class TranslationReaderPage implements OnInit, OnDestroy {
  public translationReaderService = inject(TranslationReaderService);
  public storageService = inject(StorageService, { optional: true });
  public cdr = inject(ChangeDetectorRef);

  public readonly Math = Math;

  @ViewChild('fileInput', { static: false }) fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('originalPane', { static: false }) originalPaneRef?: ElementRef<HTMLElement>;
  @ViewChild('translatedPane', { static: false }) translatedPaneRef?: ElementRef<HTMLElement>;
  @ViewChild('splitContainer', { static: false }) splitContainerRef?: ElementRef<HTMLElement>;

  readonly targetLanguages: TargetLanguageOption[] = [
    { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'mr', label: 'Marathi', nativeName: 'मराठी' },
    { code: 'bn', label: 'Bengali', nativeName: 'বাংলা' },
    { code: 'pa', label: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
    { code: 'en', label: 'English', nativeName: 'English' }
  ];

  selectedFile: File | null = null;
  pdfDoc: any = null;
  rawPageTexts: { pageNumber: number; text: string }[] = [];
  session: TranslationSession | null = null;

  selectedLanguage: SupportedLanguage = 'hi';
  isScrollLockEnabled = true;
  isSyncingScroll = false;
  currentPageIndex = 0;

  // Split view responsive state & ratio (percent)
  splitRatio = 50; // default 50% split
  isPortrait = true;
  isDraggingDivider = false;
  private dragStartCoord = 0;
  private dragStartRatio = 50;
  private pointerMoveListener?: (e: PointerEvent) => void;
  private pointerUpListener?: () => void;
  private touchMoveListener?: (e: TouchEvent) => void;
  private touchEndListener?: () => void;

  isLoading = false;
  isExporting = false;
  loadingMessage = 'translationReader.translating';
  toastMessage = '';
  showSummaryModal = false;

  renderedPages = new Set<number>();

  ngOnInit(): void {
    this.checkOrientation();
  }

  ngOnDestroy(): void {
    this.cleanupDividerListeners();
    this.clearCanvases();
    this.renderedPages.clear();
    this.pdfDoc = null;
  }

  private clearCanvases(): void {
    for (const pageNumber of this.renderedPages) {
      const canvas = document.getElementById(`pdf-canvas-p${pageNumber}`) as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }

  private cleanupDividerListeners(): void {
    if (this.pointerMoveListener) {
      window.removeEventListener('pointermove', this.pointerMoveListener);
      this.pointerMoveListener = undefined;
    }
    if (this.pointerUpListener) {
      window.removeEventListener('pointerup', this.pointerUpListener);
      this.pointerUpListener = undefined;
    }
    if (this.touchMoveListener) {
      window.removeEventListener('touchmove', this.touchMoveListener);
      this.touchMoveListener = undefined;
    }
    if (this.touchEndListener) {
      window.removeEventListener('touchend', this.touchEndListener);
      this.touchEndListener = undefined;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.checkOrientation();
  }

  private checkOrientation(): void {
    if (typeof window !== 'undefined') {
      this.isPortrait = window.innerHeight > window.innerWidth;
      this.cdr.markForCheck();
    }
  }

  triggerFileInput(): void {
    this.fileInputRef?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    await this.processPdfFile(file);
    input.value = '';
  }

  async loadSampleDocument(): Promise<void> {
    this.isLoading = true;
    this.loadingMessage = 'translationReader.translating';
    this.cdr.markForCheck();

    try {
      const sampleFile = await this.generateSamplePdf();
      await this.processPdfFile(sampleFile);
    } catch (err: any) {
      console.error('Failed to create sample PDF:', err);
      this.showToast('Failed to load sample document: ' + (err.message || 'Unknown error'));
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async processPdfFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.isLoading = true;
    this.loadingMessage = 'translationReader.translating';
    this.session = null;
    this.renderedPages.clear();
    this.currentPageIndex = 0;
    this.cdr.markForCheck();

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = this.pdfDoc.numPages;

      const pageTexts: { pageNumber: number; text: string }[] = [];
      for (let p = 1; p <= numPages; p++) {
        const page = await this.pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items as any[])
          .map(i => i.str || '')
          .filter(s => s.trim().length > 0)
          .join(' ');
        pageTexts.push({ pageNumber: p, text: pageText });
      }

      this.rawPageTexts = pageTexts;

      // Prepare translation session
      this.session = await this.translationReaderService.prepareTranslationSession(
        file,
        pageTexts,
        this.selectedLanguage
      );

      this.cdr.detectChanges();

      // Render PDF canvas pages on the left / top pane
      await this.renderAllCanvases();
    } catch (err: any) {
      console.error('Error processing PDF file:', err);
      this.showToast('Error processing document: ' + (err.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async changeLanguage(lang: SupportedLanguage): Promise<void> {
    if (this.selectedLanguage === lang && this.session) return;
    this.selectedLanguage = lang;

    if (!this.selectedFile || this.rawPageTexts.length === 0) return;

    this.isLoading = true;
    this.loadingMessage = 'translationReader.translating';
    this.cdr.markForCheck();

    try {
      this.session = await this.translationReaderService.prepareTranslationSession(
        this.selectedFile,
        this.rawPageTexts,
        this.selectedLanguage
      );
    } catch (err: any) {
      console.error('Failed to translate:', err);
      this.showToast('Translation error: ' + (err.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async renderAllCanvases(): Promise<void> {
    if (!this.pdfDoc || !this.session) return;

    for (const pageItem of this.session.pages) {
      await this.renderPageCanvas(pageItem.pageNumber);
    }
  }

  async renderPageCanvas(pageNumber: number): Promise<void> {
    if (!this.pdfDoc || this.renderedPages.has(pageNumber)) return;

    try {
      const page = await this.pdfDoc.getPage(pageNumber);
      const canvasId = `pdf-canvas-p${pageNumber}`;
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
      if (!canvas) return;

      const viewport = page.getViewport({ scale: 1.15 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport } as any).promise;
      this.renderedPages.add(pageNumber);
    } catch (err) {
      console.error(`Error rendering page canvas ${pageNumber}:`, err);
    }
  }

  // =========================================================================
  // SYNCHRONIZED SCROLL-LOCK ENGINE
  // =========================================================================

  toggleScrollLock(): void {
    this.isScrollLockEnabled = !this.isScrollLockEnabled;
    if (this.isScrollLockEnabled) {
      this.syncFromOriginal();
    }
    this.cdr.markForCheck();
  }

  onOriginalPaneScroll(event: Event): void {
    if (!this.isScrollLockEnabled || this.isSyncingScroll || !this.session) return;

    this.syncFromOriginal();
  }

  private syncFromOriginal(): void {
    if (!this.originalPaneRef || !this.translatedPaneRef) return;
    this.isSyncingScroll = true;

    try {
      const origEl = this.originalPaneRef.nativeElement;
      const transEl = this.translatedPaneRef.nativeElement;

      const origBounds = this.getPageBounds(origEl);
      const transBounds = this.getPageBounds(transEl);

      const res = this.translationReaderService.computeTargetScrollOffset(
        origEl.scrollTop,
        origBounds,
        transBounds
      );

      transEl.scrollTop = res.targetScrollTop;
      this.currentPageIndex = res.pageIndex;
      this.cdr.markForCheck();
    } finally {
      requestAnimationFrame(() => {
        this.isSyncingScroll = false;
      });
    }
  }

  onTranslatedPaneScroll(event: Event): void {
    if (!this.isScrollLockEnabled || this.isSyncingScroll || !this.session) return;

    this.syncFromTranslated();
  }

  private syncFromTranslated(): void {
    if (!this.originalPaneRef || !this.translatedPaneRef) return;
    this.isSyncingScroll = true;

    try {
      const origEl = this.originalPaneRef.nativeElement;
      const transEl = this.translatedPaneRef.nativeElement;

      const origBounds = this.getPageBounds(origEl);
      const transBounds = this.getPageBounds(transEl);

      const res = this.translationReaderService.computeTargetScrollOffset(
        transEl.scrollTop,
        transBounds,
        origBounds
      );

      origEl.scrollTop = res.targetScrollTop;
      this.currentPageIndex = res.pageIndex;
      this.cdr.markForCheck();
    } finally {
      requestAnimationFrame(() => {
        this.isSyncingScroll = false;
      });
    }
  }

  getPageBounds(container: HTMLElement): ScrollLockPageBound[] {
    const cards = container.querySelectorAll<HTMLElement>('.page-card');
    const bounds: ScrollLockPageBound[] = [];

    cards.forEach((card, idx) => {
      bounds.push({
        pageIndex: idx,
        offsetTop: card.offsetTop,
        height: card.offsetHeight
      });
    });

    return bounds;
  }

  scrollToPage(pageIndex: number): void {
    if (!this.session || pageIndex < 0 || pageIndex >= this.session.pages.length) return;
    this.currentPageIndex = pageIndex;
    this.isSyncingScroll = true;
    this.cdr.markForCheck();

    const origEl = this.originalPaneRef?.nativeElement;
    const transEl = this.translatedPaneRef?.nativeElement;
    if (!origEl || !transEl) {
      this.isSyncingScroll = false;
      return;
    }

    const origBounds = this.getPageBounds(origEl);
    const transBounds = this.getPageBounds(transEl);

    if (origBounds[pageIndex]) {
      origEl.scrollTo({
        top: origBounds[pageIndex].offsetTop,
        behavior: 'auto'
      });
    }

    if (transBounds[pageIndex]) {
      transEl.scrollTo({
        top: transBounds[pageIndex].offsetTop,
        behavior: 'auto'
      });
    }

    setTimeout(() => {
      this.isSyncingScroll = false;
    }, 150);
  }

  prevPage(): void {
    this.scrollToPage(Math.max(0, this.currentPageIndex - 1));
  }

  nextPage(): void {
    if (!this.session) return;
    this.scrollToPage(Math.min(this.session.pages.length - 1, this.currentPageIndex + 1));
  }

  // =========================================================================
  // DRAGGABLE DIVIDER RESIZE
  // =========================================================================

  onDividerPointerDown(event: PointerEvent): void {
    this.cleanupDividerListeners();
    this.isDraggingDivider = true;
    this.dragStartCoord = this.isPortrait ? event.clientY : event.clientX;
    this.dragStartRatio = this.splitRatio;

    this.pointerMoveListener = (e: PointerEvent) => {
      if (!this.isDraggingDivider || !this.splitContainerRef) return;
      const rect = this.splitContainerRef.nativeElement.getBoundingClientRect();
      const totalDimension = this.isPortrait ? rect.height : rect.width;
      const currentCoord = this.isPortrait ? e.clientY : e.clientX;
      const delta = currentCoord - this.dragStartCoord;
      const deltaPercent = (delta / totalDimension) * 100;

      const newRatio = Math.min(80, Math.max(20, this.dragStartRatio + deltaPercent));
      this.splitRatio = Math.round(newRatio);
      this.cdr.markForCheck();
    };

    this.pointerUpListener = () => {
      this.isDraggingDivider = false;
      this.cleanupDividerListeners();
      this.cdr.markForCheck();
    };

    window.addEventListener('pointermove', this.pointerMoveListener);
    window.addEventListener('pointerup', this.pointerUpListener);
  }

  // Touch fallback
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 0) return;
    this.cleanupDividerListeners();
    this.isDraggingDivider = true;
    const touch = event.touches[0];
    this.dragStartCoord = this.isPortrait ? touch.clientY : touch.clientX;
    this.dragStartRatio = this.splitRatio;

    this.touchMoveListener = (e: TouchEvent) => {
      if (!this.isDraggingDivider || !this.splitContainerRef || e.touches.length === 0) return;
      const rect = this.splitContainerRef.nativeElement.getBoundingClientRect();
      const totalDimension = this.isPortrait ? rect.height : rect.width;
      const currentCoord = this.isPortrait ? e.touches[0].clientY : e.touches[0].clientX;
      const delta = currentCoord - this.dragStartCoord;
      const deltaPercent = (delta / totalDimension) * 100;

      const newRatio = Math.min(80, Math.max(20, this.dragStartRatio + deltaPercent));
      this.splitRatio = Math.round(newRatio);
      this.cdr.markForCheck();
    };

    this.touchEndListener = () => {
      this.isDraggingDivider = false;
      this.cleanupDividerListeners();
      this.cdr.markForCheck();
    };

    window.addEventListener('touchmove', this.touchMoveListener);
    window.addEventListener('touchend', this.touchEndListener);
  }

  // =========================================================================
  // MULTI-FORMAT EXPORT (PDF & DOCX)
  // =========================================================================

  async exportPdf(): Promise<void> {
    if (!this.session || this.isExporting) return;
    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const pdfBlob = await this.translationReaderService.exportToPdf({
        fileName: this.session.fileName,
        targetLanguage: this.session.targetLanguage,
        sourceLanguage: this.session.sourceLanguage,
        executiveSummary: this.session.executiveSummary,
        pages: this.session.pages,
        includeSummary: true
      });

      const baseName = this.session.fileName.replace(/\.[^/.]+$/, '');
      const outName = `${baseName}_translated_${this.session.targetLanguage}.pdf`;
      const file = new File([pdfBlob], outName, { type: 'application/pdf' });

      if (this.storageService) {
        await this.storageService.saveFile(file, 'translated_pdf', undefined, { preserveName: true });
      } else {
        this.downloadBlob(pdfBlob, outName);
      }

      this.showToast('translationReader.exportSuccess');
    } catch (err: any) {
      console.error('PDF export failed:', err);
      this.showToast('translationReader.exportError');
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  async exportDocx(): Promise<void> {
    if (!this.session || this.isExporting) return;
    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const docxBlob = await this.translationReaderService.exportToDocx({
        fileName: this.session.fileName,
        title: `${this.session.fileName} (Translation)`,
        targetLanguage: this.session.targetLanguage,
        sourceLanguage: this.session.sourceLanguage,
        executiveSummary: this.session.executiveSummary,
        pages: this.session.pages,
        includeSummary: true
      });

      const baseName = this.session.fileName.replace(/\.[^/.]+$/, '');
      const outName = `${baseName}_translated_${this.session.targetLanguage}.docx`;
      const file = new File([docxBlob], outName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      if (this.storageService) {
        await this.storageService.saveFile(file, 'translated_docx', undefined, { preserveName: true });
      } else {
        this.downloadBlob(docxBlob, outName);
      }

      this.showToast('translationReader.exportSuccess');
    } catch (err: any) {
      console.error('DOCX export failed:', err);
      this.showToast('translationReader.exportError');
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private showToast(msgKey: string): void {
    this.toastMessage = msgKey;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toastMessage = '';
      this.cdr.markForCheck();
    }, 3500);
  }

  toggleSummaryModal(): void {
    this.showSummaryModal = !this.showSummaryModal;
    this.cdr.markForCheck();
  }

  // =========================================================================
  // SAMPLE DOCUMENT GENERATOR
  // =========================================================================

  private async generateSamplePdf(): Promise<File> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('Government Examination Guidelines & Eligibility Notice', {
      x: 50,
      y: 780,
      font: boldFont,
      size: 15
    });
    p1.drawText('Section 1: General Candidate Instructions and Rules', {
      x: 50,
      y: 740,
      font: boldFont,
      size: 12
    });
    p1.drawText('This official document outlines the mandatory requirements and rules for the examination.', {
      x: 50,
      y: 715,
      font,
      size: 10
    });
    p1.drawText('All applicants must submit their complete application before the prescribed deadline.', {
      x: 50,
      y: 695,
      font,
      size: 10
    });
    p1.drawText('Minimum age eligibility criteria requires candidates to be at least 21 years old on the date of notice.', {
      x: 50,
      y: 675,
      font,
      size: 10
    });
    p1.drawText('Candidates must ensure all details entered in the application form are accurate and complete.', {
      x: 50,
      y: 655,
      font,
      size: 10
    });

    // Page 2
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Document Verification & Concluding Summary', {
      x: 50,
      y: 780,
      font: boldFont,
      size: 15
    });
    p2.drawText('Section 2: Verification of Certificates and Identity', {
      x: 50,
      y: 740,
      font: boldFont,
      size: 12
    });
    p2.drawText('Original certificates must be presented at the time of official verification.', {
      x: 50,
      y: 715,
      font,
      size: 10
    });
    p2.drawText('Any forged documents or false statements will lead to immediate cancellation of the application.', {
      x: 50,
      y: 695,
      font,
      size: 10
    });
    p2.drawText('Conclusion: Final merit list will be published on the official government website.', {
      x: 50,
      y: 660,
      font: boldFont,
      size: 11
    });

    const pdfBytes = await doc.save();
    return new File([pdfBytes as any], 'sample-recruitment-notice.pdf', { type: 'application/pdf' });
  }
}
