import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import '../../core/utilities/pdfjs-worker';
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { Subscription } from 'rxjs';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { ReadAloudSentence } from '../../core/models/reader-features.types';
import {
  AccessibilityTagType,
  AccessibleImageItem,
  PageAccessibilityData,
  ReadingBlock
} from '../../core/models/pdf-accessibility.types';
import { PdfAccessibilityService } from '../../core/services/pdf-accessibility.service';
import { PdfReadAloudService } from '../../core/services/pdf-read-aloud.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'app-pdf-accessibility',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './pdf-accessibility.page.html',
  styleUrls: ['./pdf-accessibility.page.scss']
})
export class PdfAccessibilityPage implements OnInit, OnDestroy {
  public accessibilityService = inject(PdfAccessibilityService);
  public readAloudService = inject(PdfReadAloudService);
  public storageService = inject(StorageService, { optional: true });
  public cdr = inject(ChangeDetectorRef);

  public readonly Math = Math;

  @ViewChild('fileInput', { static: false }) fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('pdfCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly availableTags: Array<{ tag: AccessibilityTagType; labelKey: string; color: string }> = [
    { tag: 'H1', labelKey: 'pdfAccessibility.tagH1', color: '#2563eb' },
    { tag: 'H2', labelKey: 'pdfAccessibility.tagH2', color: '#4f46e5' },
    { tag: 'H3', labelKey: 'pdfAccessibility.tagH3', color: '#0284c7' },
    { tag: 'P', labelKey: 'pdfAccessibility.tagP', color: '#059669' },
    { tag: 'Table', labelKey: 'pdfAccessibility.tagTable', color: '#d97706' },
    { tag: 'L', labelKey: 'pdfAccessibility.tagList', color: '#7c3aed' },
    { tag: 'Figure', labelKey: 'pdfAccessibility.tagFigure', color: '#0d9488' },
    { tag: 'Artifact', labelKey: 'pdfAccessibility.tagArtifact', color: '#64748b' }
  ];

  selectedFile: File | null = null;
  pdfDoc: any = null;
  sourcePdfBytes: Uint8Array | null = null;

  currentPage = 1;
  totalPages = 1;
  pagesData: PageAccessibilityData[] = [];

  // 3-Step Accessibility Mobile Stepper
  activeStep: 1 | 2 | 3 = 1;

  selectedBlockId: string | null = null;
  selectedImageId: string | null = null;

  isLoading = false;
  isSaving = false;
  loadingMessage = '';
  toastMessage = '';

  // Audio preview bar state
  isPlayingAudio = false;
  currentSpeakingIndex = -1;
  private readAloudSub?: Subscription;

  get currentPageData(): PageAccessibilityData | undefined {
    return this.pagesData.find(p => p.pageNumber === this.currentPage);
  }

  get currentBlocks(): ReadingBlock[] {
    return this.currentPageData ? this.currentPageData.blocks : [];
  }

  get currentImages(): AccessibleImageItem[] {
    return this.currentPageData ? this.currentPageData.images : [];
  }

  get totalImagesCount(): number {
    return this.pagesData.reduce((acc, p) => acc + p.images.length, 0);
  }

  ngOnInit(): void {
    this.readAloudSub = this.readAloudService.state$.subscribe(state => {
      this.isPlayingAudio = state.isPlaying;
      if (!state.isPlaying) {
        this.currentSpeakingIndex = -1;
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.readAloudService.stop();
    this.readAloudSub?.unsubscribe();
    if (this.pdfDoc?.destroy) {
      this.pdfDoc.destroy().catch(() => {});
    }
    this.pdfDoc = null;
    this.sourcePdfBytes = null;
    this.pagesData = [];
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
    this.loadingMessage = 'Loading sample document...';
    this.cdr.markForCheck();

    try {
      const sampleFile = await this.generateSampleAccessiblePdf();
      await this.processPdfFile(sampleFile);
    } catch (err: any) {
      console.error('Failed to load sample:', err);
      this.showToast('Error loading sample: ' + (err.message || 'Unknown error'));
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async processPdfFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.isLoading = true;
    this.loadingMessage = 'Analyzing document structure & reading order...';
    this.pagesData = [];
    this.currentPage = 1;
    this.selectedBlockId = null;
    this.selectedImageId = null;
    this.cdr.markForCheck();

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.sourcePdfBytes = new Uint8Array(arrayBuffer);

      this.pdfDoc = await pdfjsLib.getDocument({ data: this.sourcePdfBytes }).promise;
      this.totalPages = this.pdfDoc.numPages;

      // Extract items and infer structure for all pages
      for (let p = 1; p <= this.totalPages; p++) {
        const page = await this.pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        const rawItems: Array<{
          str: string;
          x: number;
          y: number;
          width: number;
          height: number;
          fontSize?: number;
          fontName?: string;
        }> = [];

        for (const item of textContent.items as any[]) {
          if (!item.str || item.str.trim().length === 0) continue;
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const fontSize = Math.hypot(transform[0], transform[1]) || 12;

          rawItems.push({
            str: item.str,
            x: transform[4],
            y: transform[5],
            width: item.width || fontSize * item.str.length * 0.6,
            height: item.height || fontSize,
            fontSize,
            fontName: item.fontName
          });
        }

        // Mock/extract images for the page
        const imagesOnPage = await this.extractImagesFromPage(p, viewport.width, viewport.height);

        // Infer page structure
        const pageData = this.accessibilityService.inferPageStructure(
          p,
          viewport.width,
          viewport.height,
          rawItems,
          imagesOnPage
        );

        this.pagesData.push(pageData);
      }

      this.cdr.detectChanges();
      await this.renderCurrentPageCanvas();
    } catch (err: any) {
      console.error('Error processing PDF:', err);
      this.showToast('Failed to analyze document: ' + (err.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async extractImagesFromPage(
    pageNum: number,
    pageWidth: number,
    pageHeight: number
  ): Promise<AccessibleImageItem[]> {
    // Check for images embedded on page
    const images: AccessibleImageItem[] = [];
    if (!this.sourcePdfBytes) return images;

    try {
      const doc = await PDFDocument.load(this.sourcePdfBytes);
      const page = doc.getPage(pageNum - 1);
      const resources = page.node.Resources();
      const xObjects = resources?.lookup(PDFName.of('XObject')) as any;

      if (xObjects && typeof xObjects.dict === 'object') {
        let imgIdx = 0;
        const entries = xObjects.entries ? xObjects.entries() : [];
        for (const [name, obj] of entries) {
          const dict = doc.context.lookup(obj) as any;
          if (dict && dict.lookup && dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image') {
            const w = Number(dict.lookup(PDFName.of('Width'))?.toString() || 150);
            const h = Number(dict.lookup(PDFName.of('Height'))?.toString() || 120);

            images.push({
              id: `img-p${pageNum}-${imgIdx}`,
              pageNumber: pageNum,
              indexOnPage: imgIdx,
              name: `Image_${name.asString() || imgIdx + 1}`,
              bbox: {
                x: 50 + (imgIdx * 120) % (pageWidth - 200),
                y: pageHeight - 250 - imgIdx * 100,
                width: Math.min(180, w * 0.5),
                height: Math.min(140, h * 0.5)
              },
              altText: '',
              hasUserAltText: false
            });
            imgIdx++;
          }
        }
      }
    } catch (e) {
      // Graceful fallback
    }

    return images;
  }

  // =========================================================================
  // STEPPER NAVIGATION
  // =========================================================================

  setStep(step: 1 | 2 | 3): void {
    this.activeStep = step;
    this.cdr.markForCheck();
  }

  async setPage(pageNum: number): Promise<void> {
    if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) return;
    this.currentPage = pageNum;
    this.selectedBlockId = null;
    this.selectedImageId = null;
    this.stopAudio();
    this.cdr.detectChanges();
    await this.renderCurrentPageCanvas();
  }

  prevPage(): void {
    this.setPage(this.currentPage - 1);
  }

  nextPage(): void {
    this.setPage(this.currentPage + 1);
  }

  goToPage(pageNum: number): void {
    this.setPage(pageNum);
  }

  // =========================================================================
  // CANVAS RENDERING & OVERLAYS
  // =========================================================================

  async renderCurrentPageCanvas(): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef) return;

    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: 1.0 });

      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render base PDF
      await page.render({ canvasContext: ctx, viewport } as any).promise;

      this.cdr.markForCheck();
    } catch (err) {
      console.error('Error rendering page canvas:', err);
    }
  }

  // =========================================================================
  // STEP 1: STRUCTURE TAGGING
  // =========================================================================

  selectBlock(block: ReadingBlock): void {
    this.selectedBlockId = block.id;
    this.cdr.markForCheck();
  }

  updateBlockTag(block: ReadingBlock, newTag: AccessibilityTagType): void {
    block.tag = newTag;
    block.isArtifact = newTag === 'Artifact';
    if (block.isArtifact && !block.artifactType) {
      block.artifactType = 'Decorative';
    }
    block.confidence = 1.0; // User manual review sets 100% confidence
    this.cdr.markForCheck();
  }

  getTagColor(tag: AccessibilityTagType): string {
    const found = this.availableTags.find(t => t.tag === tag);
    return found ? found.color : '#64748b';
  }

  // =========================================================================
  // STEP 2: IMAGE ALT-TEXT ENGINE
  // =========================================================================

  selectImage(img: AccessibleImageItem): void {
    this.selectedImageId = img.id;
    this.cdr.markForCheck();
  }

  suggestOcrForImage(img: AccessibleImageItem): void {
    const surrounding = this.currentBlocks.map(b => b.text).join(' ');
    const suggestion = this.accessibilityService.suggestAltText(img, surrounding);
    img.altText = suggestion;
    img.ocrSuggestion = suggestion;
    img.hasUserAltText = true;

    // Update corresponding block if present
    const block = this.currentBlocks.find(b => b.id.includes(img.id));
    if (block) {
      block.altText = suggestion;
      block.text = suggestion;
    }

    this.showToast('Generated description suggestion for ' + img.name);
    this.cdr.markForCheck();
  }

  toggleImageDecorative(img: AccessibleImageItem): void {
    img.isDecorative = !img.isDecorative;
    const block = this.currentBlocks.find(b => b.id.includes(img.id));
    if (block) {
      block.tag = img.isDecorative ? 'Artifact' : 'Figure';
      block.isArtifact = img.isDecorative;
      block.artifactType = img.isDecorative ? 'Decorative' : undefined;
    }
    this.cdr.markForCheck();
  }

  // =========================================================================
  // STEP 3: VISUAL READING ORDER EDITOR
  // =========================================================================

  draggedBlockIndex: number | null = null;

  onDragStart(event: DragEvent, index: number): void {
    this.draggedBlockIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    if (this.draggedBlockIndex === null || !this.currentPageData) return;

    const sourceIndex = this.draggedBlockIndex;
    this.draggedBlockIndex = null;

    if (sourceIndex === targetIndex) return;

    const blocks = this.currentPageData.blocks;
    const [movedBlock] = blocks.splice(sourceIndex, 1);
    blocks.splice(targetIndex, 0, movedBlock);

    this.reindexReadingOrder();
  }

  moveBlockUp(index: number): void {
    if (index <= 0 || !this.currentPageData) return;
    const blocks = this.currentPageData.blocks;
    const temp = blocks[index];
    blocks[index] = blocks[index - 1];
    blocks[index - 1] = temp;

    this.reindexReadingOrder();
  }

  moveBlockDown(index: number): void {
    if (!this.currentPageData || index >= this.currentPageData.blocks.length - 1) return;
    const blocks = this.currentPageData.blocks;
    const temp = blocks[index];
    blocks[index] = blocks[index + 1];
    blocks[index + 1] = temp;

    this.reindexReadingOrder();
  }

  private reindexReadingOrder(): void {
    if (!this.currentPageData) return;
    this.currentPageData.blocks.forEach((b, idx) => {
      b.orderIndex = idx + 1;
    });
    this.cdr.markForCheck();
  }

  // =========================================================================
  // AUDIO PREVIEW BAR (TEXT-TO-SPEECH READ-ALOUD)
  // =========================================================================

  toggleAudioPreview(): void {
    if (this.isPlayingAudio) {
      this.stopAudio();
    } else {
      this.startAudioPreview();
    }
  }

  startAudioPreview(): void {
    if (!this.currentPageData) return;

    // Build sentence sequence from reading order (excluding artifacts)
    const activeBlocks = this.currentPageData.blocks.filter(b => !b.isArtifact && b.tag !== 'Artifact');
    if (activeBlocks.length === 0) {
      this.showToast('No readable text blocks on this page.');
      return;
    }

    const sentences: ReadAloudSentence[] = activeBlocks.map((b, idx) => {
      const text = b.tag === 'Figure' ? (b.altText || 'Figure with no description') : b.text;
      return {
        index: idx,
        pageNumber: this.currentPage,
        text,
        startIndex: 0,
        endIndex: text.length
      };
    });

    if (!this.readAloudService.isAvailable()) {
      this.showToast('Speech synthesis is not available on this device.');
      return;
    }

    try {
      this.isPlayingAudio = true;
      this.currentSpeakingIndex = 0;
      this.readAloudService.playPage(this.currentPage, sentences, () => {
        this.isPlayingAudio = false;
        this.currentSpeakingIndex = -1;
        this.cdr.markForCheck();
      });
    } catch (err) {
      console.error('Speech synthesis error:', err);
      this.isPlayingAudio = false;
      this.currentSpeakingIndex = -1;
      this.showToast('Unable to start speech synthesis.');
      this.cdr.markForCheck();
    }
  }

  stopAudio(): void {
    this.readAloudService.stop();
    this.isPlayingAudio = false;
    this.currentSpeakingIndex = -1;
    this.cdr.markForCheck();
  }

  // =========================================================================
  // SAVE TAGGED ACCESSIBLE PDF
  // =========================================================================

  async saveTaggedPdf(): Promise<void> {
    if (!this.sourcePdfBytes || this.isSaving) return;
    this.isSaving = true;
    this.loadingMessage = 'pdfAccessibility.saving';
    this.cdr.markForCheck();

    try {
      const taggedBlob = await this.accessibilityService.createTaggedPdf(this.sourcePdfBytes, {
        fileName: this.selectedFile?.name || 'document.pdf',
        documentTitle: this.selectedFile?.name.replace(/\.[^/.]+$/, ''),
        pages: this.pagesData
      });

      const baseName = (this.selectedFile?.name || 'document').replace(/\.[^/.]+$/, '');
      const outName = `${baseName}_tagged_accessible.pdf`;
      const file = new File([taggedBlob], outName, { type: 'application/pdf' });

      if (this.storageService) {
        await this.storageService.saveFile(file, 'accessible_pdf', undefined, { preserveName: true });
      } else {
        this.downloadBlob(taggedBlob, outName);
      }

      this.showToast('pdfAccessibility.saveSuccess');
    } catch (err: any) {
      console.error('Failed to save tagged PDF:', err);
      this.showToast('pdfAccessibility.saveError');
    } finally {
      this.isSaving = false;
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

  // =========================================================================
  // SAMPLE ACCESSIBLE PDF BUILDER
  // =========================================================================

  private async generateSampleAccessiblePdf(): Promise<File> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1: Multi-column newspaper layout with headers, paragraphs and list
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('Official Examination & Civil Service Notification 2026', { x: 50, y: 800, font: boldFont, size: 16 });
    p1.drawText('Section 1: General Examination Instructions', { x: 50, y: 760, font: boldFont, size: 13 });

    // Col 0
    p1.drawText('All registered candidates must download', { x: 50, y: 725, font, size: 10 });
    p1.drawText('and print their official admit card before', { x: 50, y: 708, font, size: 10 });
    p1.drawText('reporting to their allotted examination hall.', { x: 50, y: 691, font, size: 10 });
    p1.drawText('• Valid government photo identification proof', { x: 50, y: 660, font, size: 10 });
    p1.drawText('• Two passport-sized color photographs', { x: 50, y: 642, font, size: 10 });

    // Col 1
    p1.drawText('Electronic devices, smart watches, and calculators', { x: 310, y: 725, font, size: 10 });
    p1.drawText('are strictly prohibited inside the center.', { x: 310, y: 708, font, size: 10 });
    p1.drawText('Violation leads to immediate exam disqualification.', { x: 310, y: 691, font, size: 10 });
    p1.drawText('• Candidate signature on attendance sheet', { x: 310, y: 660, font, size: 10 });
    p1.drawText('• Biometric fingerprint verification scan', { x: 310, y: 642, font, size: 10 });

    p1.drawText('Page 1 of 2  •  Official Examination Council', { x: 50, y: 30, font, size: 9 });

    // Page 2: Table and Signatory section
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Section 2: Examination Schedule & Key Deadlines', { x: 50, y: 800, font: boldFont, size: 14 });
    p2.drawText('Paper 1: General Studies | 10:00 AM - 12:00 PM | Max Marks: 200', { x: 50, y: 760, font, size: 10.5 });
    p2.drawText('Paper 2: Aptitude Test  | 02:00 PM - 04:00 PM | Max Marks: 200', { x: 50, y: 735, font, size: 10.5 });
    p2.drawText('Authorized Signatory: Controller of Examinations, Government of India.', { x: 50, y: 680, font: boldFont, size: 11 });
    p2.drawText('Page 2 of 2  •  Official Examination Council', { x: 50, y: 30, font, size: 9 });

    const bytes = await doc.save();
    return new File([bytes as any], 'sample-accessible-policy.pdf', { type: 'application/pdf' });
  }
}
