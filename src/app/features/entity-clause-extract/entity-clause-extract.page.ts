import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import '../../core/utilities/pdfjs-worker';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { EntityClauseExtractionService } from '../../core/services/entity-clause-extraction.service';
import {
  BoundingBox,
  EntityClauseExtractionResult,
  EntityClauseTab,
  ExtractedClause,
  ExtractedEntity,
  ExtractedWordToken,
  LEGAL_DISCLAIMER
} from '../../core/models/entity-clause.types';

@Component({
  selector: 'app-entity-clause-extract',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './entity-clause-extract.page.html',
  styleUrls: ['./entity-clause-extract.page.scss']
})
export class EntityClauseExtractPage implements OnInit {
  private entityClauseService = inject(EntityClauseExtractionService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('fileInput', { static: false }) fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('documentCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewportContainer', { static: false }) viewportRef?: ElementRef<HTMLDivElement>;

  readonly DISCLAIMER = LEGAL_DISCLAIMER;

  selectedFile: File | null = null;
  isLoading = false;
  statusMessage = 'entityClause.processing';
  toastMessage = '';

  // PDF Document & Page Viewer
  pdfDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  readonly renderScale = 1.5; // PDF points to canvas render scale

  // Zoom & Pan state
  zoomScale = 1.0;
  panX = 0;
  panY = 0;
  isPanning = false;
  startX = 0;
  startY = 0;

  // Extracted Data
  extractionResult: EntityClauseExtractionResult | null = null;
  activeTab: EntityClauseTab = 'amounts';
  selectedItem: ExtractedEntity | ExtractedClause | null = null;
  showPopover = false;
  popoverCoords: { x: number; y: number } = { x: 0, y: 0 };

  // Bottom Sheet Drawer state (0 = collapsed, 0.45 = half, 0.85 = full)
  bottomSheetBreakpoint = 0.45;
  showExportModal = false;

  // Page tokens map
  pageTokens = new Map<number, ExtractedWordToken[]>();

  ngOnInit(): void {}

  triggerFileInput(): void {
    this.fileInputRef?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    await this.processFile(file);
    input.value = '';
  }

  async processFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.isLoading = true;
    this.statusMessage = 'entityClause.processing';
    this.selectedItem = null;
    this.showPopover = false;
    this.pageTokens.clear();
    this.resetZoom();
    this.cdr.markForCheck();

    try {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        await this.processPdf(file);
      } else {
        await this.processImage(file);
      }
    } catch (err: any) {
      console.error('Error extracting entities and clauses:', err);
      this.showToast('Failed to process document: ' + (err.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async processPdf(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.totalPages = this.pdfDoc.numPages;
    this.currentPage = 1;

    // Collect tokens and full text across all pages in PDF points
    const allTokens: ExtractedWordToken[] = [];
    const textLines: string[] = [];

    for (let p = 1; p <= this.totalPages; p++) {
      const page = await this.pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height;
      const textContent = await page.getTextContent();
      const pageTokensList: ExtractedWordToken[] = [];

      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim() === '') continue;
        textLines.push(item.str);

        // PDF coordinate conversion: item.transform[4] is X, item.transform[5] is Y from bottom
        const tx = item.transform[4];
        const ty = pageHeight - item.transform[5];
        const tw = item.width || Math.max(10, item.str.length * 7);
        const th = Math.abs(item.transform[3] || 12);

        const tok: ExtractedWordToken = {
          text: item.str,
          x: Math.round(tx),
          y: Math.max(0, Math.round(ty - th)),
          width: Math.round(tw),
          height: Math.round(th),
          pageNumber: p
        };

        allTokens.push(tok);
        pageTokensList.push(tok);
      }
      this.pageTokens.set(p, pageTokensList);
    }

    const fullText = textLines.join('\n');
    this.extractionResult = this.entityClauseService.extract(
      fullText,
      allTokens,
      this.totalPages,
      file.name
    );

    await this.renderCurrentPage();

    // Default select first item if present
    if (this.currentTabItems.length > 0) {
      this.selectItem(this.currentTabItems[0]);
    }
  }

  private async processImage(file: File): Promise<void> {
    // Generate simulated structured contract text for image preview testing
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const sampleText = `
      COMMERCIAL SERVICES AGREEMENT
      This Agreement is entered into on 15/10/2024 between Acme Corporation ("Client") and Beta Solutions LLC ("Contractor").
      Reference Number: REF-2024-9901
      1. Services and Payment:
      The Client agrees to pay the amount of $25,000 USD upon completion.
      A retainer deposit of $5,000 shall be paid immediately.
      2. Obligations & Deadlines:
      The Contractor must deliver all milestones within 30 days of execution.
      All deliverables shall comply with industry quality standards.
      3. Penalties & Termination:
      In the event of unexcused default, a penalty of $250 per day shall apply.
      Either party is entitled to terminate this agreement subject to 14 days notice.
    `;

    this.totalPages = 1;
    this.currentPage = 1;

    // Synthesize tokens with geometric coordinates
    const syntheticTokens: ExtractedWordToken[] = [
      { text: '15/10/2024', x: 200, y: 80, width: 80, height: 14, pageNumber: 1 },
      { text: 'Acme Corporation', x: 100, y: 110, width: 120, height: 14, pageNumber: 1 },
      { text: 'Beta Solutions LLC', x: 280, y: 110, width: 130, height: 14, pageNumber: 1 },
      { text: 'REF-2024-9901', x: 220, y: 140, width: 100, height: 14, pageNumber: 1 },
      { text: '$25,000', x: 250, y: 200, width: 70, height: 14, pageNumber: 1 },
      { text: '$5,000', x: 220, y: 230, width: 60, height: 14, pageNumber: 1 },
      { text: 'within 30 days', x: 290, y: 290, width: 100, height: 14, pageNumber: 1 },
      { text: '$250', x: 320, y: 350, width: 45, height: 14, pageNumber: 1 }
    ];

    this.extractionResult = this.entityClauseService.extract(
      sampleText,
      syntheticTokens,
      1,
      file.name
    );

    // Draw placeholder canvas for image
    if (this.canvasRef) {
      const canvas = this.canvasRef.nativeElement;
      canvas.width = 600 * this.renderScale;
      canvas.height = 800 * this.renderScale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1e293b';
        ctx.font = '16px sans-serif';
        ctx.fillText(`Document Preview: ${baseName}`, 40, 50);
        ctx.font = '12px monospace';
        const lines = sampleText.split('\n');
        lines.forEach((l, i) => {
          ctx.fillText(l.trim(), 40, 80 + i * 22);
        });
      }
    }

    if (this.currentTabItems.length > 0) {
      this.selectItem(this.currentTabItems[0]);
    }
  }

  async renderCurrentPage(): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef) return;

    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: this.renderScale });

      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport } as any).promise;
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error rendering page:', e);
    }
  }

  async setPage(pageNum: number): Promise<void> {
    if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) return;
    this.currentPage = pageNum;
    await this.renderCurrentPage();
  }

  get currentTabItems(): (ExtractedEntity | ExtractedClause)[] {
    if (!this.extractionResult) return [];

    switch (this.activeTab) {
      case 'amounts':
        return this.extractionResult.entities.filter(e => e.type === 'amount');
      case 'datesDeadlines':
        return this.extractionResult.entities.filter(e => e.type === 'date' || e.type === 'deadline');
      case 'parties':
        return this.extractionResult.entities.filter(e => e.type === 'party');
      case 'clauses':
        return this.extractionResult.clauses;
      default:
        return [];
    }
  }

  get currentPageItems(): (ExtractedEntity | ExtractedClause)[] {
    if (!this.extractionResult) return [];
    const all = [...this.extractionResult.entities, ...this.extractionResult.clauses];
    return all.filter(item => item.pageNumber === this.currentPage);
  }

  setActiveTab(tab: EntityClauseTab): void {
    this.activeTab = tab;
    const items = this.currentTabItems;
    if (items.length > 0) {
      this.selectItem(items[0]);
    } else {
      this.selectedItem = null;
      this.showPopover = false;
    }
    this.cdr.markForCheck();
  }

  /**
   * Tapping an item jumps the document canvas directly to that exact passage.
   */
  async jumpToItem(item: ExtractedEntity | ExtractedClause): Promise<void> {
    if (item.pageNumber !== this.currentPage) {
      await this.setPage(item.pageNumber);
    }

    this.selectItem(item);

    // Scroll viewport to center on the target bounding box (taking zoom scale into account)
    if (this.viewportRef && item.boundingBox) {
      const container = this.viewportRef.nativeElement;
      const midX = (item.boundingBox.x + (item.boundingBox.width || 60) / 2) * this.renderScale;
      const midY = (item.boundingBox.y + (item.boundingBox.height || 18) / 2) * this.renderScale;

      const targetX = midX * this.zoomScale;
      const targetY = midY * this.zoomScale;

      container.scrollTo({
        left: Math.max(0, targetX - container.clientWidth / 2),
        top: Math.max(0, targetY - container.clientHeight / 2),
        behavior: 'smooth'
      });
    }
  }

  selectItem(item: ExtractedEntity | ExtractedClause): void {
    this.selectedItem = item;
    this.showPopover = true;

    // Calculate popover coordinates on canvas
    if (item.boundingBox) {
      this.popoverCoords = {
        x: item.boundingBox.x * this.renderScale,
        y: (item.boundingBox.y + item.boundingBox.height + 8) * this.renderScale
      };
    }
    this.cdr.markForCheck();
  }

  closePopover(): void {
    this.showPopover = false;
    this.cdr.markForCheck();
  }

  isEntity(item: any): item is ExtractedEntity {
    return item && 'type' in item;
  }

  isClause(item: any): item is ExtractedClause {
    return item && 'modalMarkers' in item;
  }

  // Zoom controls
  zoomIn(): void {
    this.zoomScale = Math.min(3.0, +(this.zoomScale + 0.25).toFixed(2));
    this.cdr.markForCheck();
  }

  zoomOut(): void {
    this.zoomScale = Math.max(0.6, +(this.zoomScale - 0.25).toFixed(2));
    this.cdr.markForCheck();
  }

  resetZoom(): void {
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.cdr.markForCheck();
  }

  // Touch and pan handlers
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isPanning = true;
      this.startX = event.touches[0].clientX - this.panX;
      this.startY = event.touches[0].clientY - this.panY;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isPanning || event.touches.length !== 1) return;
    this.panX = event.touches[0].clientX - this.startX;
    this.panY = event.touches[0].clientY - this.startY;
  }

  onTouchEnd(): void {
    this.isPanning = false;
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.isPanning = true;
      this.startX = event.clientX - this.panX;
      this.startY = event.clientY - this.panY;
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    this.panX = event.clientX - this.startX;
    this.panY = event.clientY - this.startY;
  }

  onMouseUp(): void {
    this.isPanning = false;
  }

  // Bottom Sheet Drawer toggle
  toggleBottomSheet(): void {
    if (this.bottomSheetBreakpoint === 0) {
      this.bottomSheetBreakpoint = 0.45;
    } else if (this.bottomSheetBreakpoint === 0.45) {
      this.bottomSheetBreakpoint = 0.85;
    } else {
      this.bottomSheetBreakpoint = 0.45;
    }
    this.cdr.markForCheck();
  }

  setBreakpoint(bp: number): void {
    this.bottomSheetBreakpoint = bp;
    this.cdr.markForCheck();
  }

  // Export handlers
  async exportCsv(): Promise<void> {
    if (!this.extractionResult) return;
    try {
      const fileName = (this.selectedFile?.name.replace(/\.[^.]+$/, '') || 'document') + '-entities-clauses.csv';
      const res = await this.entityClauseService.exportToCsv(this.extractionResult, fileName);
      this.showToast(`Exported ${res.file.name} successfully`);
      this.showExportModal = false;
    } catch (err: any) {
      this.showToast('Export failed: ' + err.message);
    }
  }

  async exportJson(): Promise<void> {
    if (!this.extractionResult) return;
    try {
      const fileName = (this.selectedFile?.name.replace(/\.[^.]+$/, '') || 'document') + '-entities-clauses.json';
      const res = await this.entityClauseService.exportToJson(this.extractionResult, fileName);
      this.showToast(`Exported ${res.file.name} successfully`);
      this.showExportModal = false;
    } catch (err: any) {
      this.showToast('Export failed: ' + err.message);
    }
  }

  printSummaryReport(): void {
    if (!this.extractionResult) return;
    const html = this.entityClauseService.generatePrintableReport(this.extractionResult);
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 300);
    } else {
      // If popup blocker prevents window.open, trigger blob download of HTML report
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.selectedFile?.name || 'document'}-report.html`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Report opened / downloaded successfully');
    }
    this.showExportModal = false;
    this.cdr.markForCheck();
  }

  showToast(msg: string): void {
    this.toastMessage = msg;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toastMessage = '';
      this.cdr.markForCheck();
    }, 3500);
  }
}
