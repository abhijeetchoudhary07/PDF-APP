import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfCompareService } from '../../core/services/pdf-compare.service';
import { PdfRenderService } from '../../core/services/pdf-render.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  CompareSummary,
  PageDiffResult,
  ComparisonMode,
  TextDiffToken
} from '../../core/models/pdf-analysis.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type CompareStep = 'select' | 'processing' | 'result';

export interface ChangeItem {
  matchIndex: number;
  tokenIndex: number;
  type: 'added' | 'removed' | 'changed';
  value: string;
  pageLabel: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-compare',
  templateUrl: './pdf-compare.page.html',
  styleUrls: ['./pdf-compare.page.scss'],
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
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfComparePage {
  @ViewChild('origCanvas', { static: false }) origCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('modCanvas', { static: false }) modCanvas?: ElementRef<HTMLCanvasElement>;

  currentStep: CompareStep = 'select';
  originalFile?: File;
  modifiedFile?: File;

  // Processing state
  isProcessing = false;
  progressPercent = 0;
  progressMessage = '';

  // Result state
  summary?: CompareSummary;
  selectedMode: ComparisonMode = 'side-by-side';
  activeMatchIndex = 0;
  currentChangeIndex = 0;
  allChanges: ChangeItem[] = [];

  // Visual diff state
  visualDiffUrl?: string;
  isRenderingVisual = false;

  modeTabs = [
    { id: 'side-by-side', label: 'Side-by-Side' },
    { id: 'page-by-page', label: 'Page-by-Page' },
    { id: 'text-only', label: 'Text Diff' },
    { id: 'visual', label: 'Visual Diff' }
  ];

  constructor(
    private compareService: PdfCompareService,
    private renderService: PdfRenderService,
    private fileService: FileService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  onOriginalSelected(file: File): void {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file for the original document.');
      return;
    }
    this.originalFile = file;
  }

  onModifiedSelected(file: File): void {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file for the modified document.');
      return;
    }
    this.modifiedFile = file;
  }

  canStartCompare(): boolean {
    return !!this.originalFile && !!this.modifiedFile && !this.isProcessing;
  }

  async startComparison(): Promise<void> {
    if (!this.originalFile || !this.modifiedFile) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.progressPercent = 5;
    this.progressMessage = 'Preparing documents for comparison...';

    try {
      this.summary = await this.compareService.compareDocuments(
        this.originalFile,
        this.modifiedFile,
        (pct, msg) => {
          this.progressPercent = pct;
          this.progressMessage = msg;
          this.cdr.detectChanges();
        }
      );

      this.buildChangesList();
      this.currentStep = 'result';
      this.activeMatchIndex = 0;
      this.currentChangeIndex = 0;

      // Add to history
      await this.historyService.addHistoryItem({
        operation: 'Compared PDF',
        originalFileName: this.originalFile.name,
        outputFileName: this.modifiedFile.name,
        originalSizeBytes: this.originalFile.size,
        outputSizeBytes: this.modifiedFile.size
      });

      this.toastService.success('Comparison completed successfully.');
      this.cdr.detectChanges();
    } catch (err: any) {
      this.toastService.error('Comparison failed: ' + (err?.message || err));
      this.currentStep = 'select';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  buildChangesList(): void {
    this.allChanges = [];
    if (!this.summary) return;

    this.summary.pageMatches.forEach((match, matchIdx) => {
      const pageLabel = match.modifiedPageNumber
        ? `Page ${match.modifiedPageNumber}`
        : `Page ${match.originalPageNumber}`;

      match.tokens.forEach((token, tokenIdx) => {
        if (token.type === 'added' || token.type === 'removed') {
          this.allChanges.push({
            matchIndex: matchIdx,
            tokenIndex: tokenIdx,
            type: token.type,
            value: token.value,
            pageLabel
          });
        }
      });
    });

    this.currentChangeIndex = 0;
  }

  get totalChanges(): number {
    return this.allChanges.length;
  }

  get currentChange(): ChangeItem | undefined {
    if (this.totalChanges === 0 || this.currentChangeIndex < 0 || this.currentChangeIndex >= this.totalChanges) {
      return undefined;
    }
    return this.allChanges[this.currentChangeIndex];
  }

  nextChange(): void {
    if (this.currentChangeIndex < this.totalChanges - 1) {
      this.currentChangeIndex++;
      const change = this.currentChange;
      if (change && change.matchIndex !== this.activeMatchIndex) {
        this.selectMatch(change.matchIndex);
      }
      this.cdr.detectChanges();
    }
  }

  prevChange(): void {
    if (this.currentChangeIndex > 0) {
      this.currentChangeIndex--;
      const change = this.currentChange;
      if (change && change.matchIndex !== this.activeMatchIndex) {
        this.selectMatch(change.matchIndex);
      }
      this.cdr.detectChanges();
    }
  }

  isTokenActiveChange(tokenIndex: number): boolean {
    const change = this.currentChange;
    return !!change && change.matchIndex === this.activeMatchIndex && change.tokenIndex === tokenIndex;
  }

  setMode(mode: string): void {
    this.selectedMode = mode as ComparisonMode;
    if (this.selectedMode === 'visual') {
      this.renderCurrentVisualPair();
    }
  }

  get currentMatch(): PageDiffResult | undefined {
    if (!this.summary || this.summary.pageMatches.length === 0) return undefined;
    return this.summary.pageMatches[this.activeMatchIndex];
  }

  get currentTokens(): TextDiffToken[] {
    return this.currentMatch?.tokens || [];
  }

  get totalMatches(): number {
    return this.summary?.pageMatches.length || 0;
  }

  selectMatch(index: number): void {
    if (index >= 0 && index < this.totalMatches) {
      this.activeMatchIndex = index;
      if (this.selectedMode === 'visual') {
        this.renderCurrentVisualPair();
      }
    }
  }

  prevMatch(): void {
    if (this.activeMatchIndex > 0) {
      this.selectMatch(this.activeMatchIndex - 1);
    }
  }

  nextMatch(): void {
    if (this.activeMatchIndex < this.totalMatches - 1) {
      this.selectMatch(this.activeMatchIndex + 1);
    }
  }

  async renderCurrentVisualPair(): Promise<void> {
    const match = this.currentMatch;
    if (!match || !this.originalFile || !this.modifiedFile) return;

    if (match.originalPageNumber === null || match.modifiedPageNumber === null) {
      this.visualDiffUrl = undefined;
      return;
    }

    this.isRenderingVisual = true;
    this.cdr.detectChanges();

    try {
      const origCanvas = document.createElement('canvas');
      const modCanvas = document.createElement('canvas');

      const origDoc = await this.renderService.loadPdf(
        await this.originalFile.arrayBuffer(),
        'orig_' + this.originalFile.name
      );
      const modDoc = await this.renderService.loadPdf(
        await this.modifiedFile.arrayBuffer(),
        'mod_' + this.modifiedFile.name
      );

      await this.renderService.renderPageToCanvas(match.originalPageNumber, origCanvas, 1.0);
      await this.renderService.renderPageToCanvas(match.modifiedPageNumber, modCanvas, 1.0);

      this.visualDiffUrl = await this.compareService.generateVisualDiff(origCanvas, modCanvas);
    } catch {
      this.visualDiffUrl = undefined;
    } finally {
      this.isRenderingVisual = false;
      this.cdr.detectChanges();
    }
  }

  downloadReport(): void {
    if (!this.summary || !this.originalFile || !this.modifiedFile) return;

    const reportText = this.compareService.generateTextReport(
      this.summary,
      this.originalFile.name,
      this.modifiedFile.name
    );

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const file = new File([blob], 'pdf_comparison_report.txt', { type: 'text/plain' });
    this.fileService.downloadFile(file);
    this.toastService.success('Report downloaded.');
  }

  reset(): void {
    this.currentStep = 'select';
    this.originalFile = undefined;
    this.modifiedFile = undefined;
    this.summary = undefined;
    this.visualDiffUrl = undefined;
    this.allChanges = [];
    this.currentChangeIndex = 0;
  }
}
