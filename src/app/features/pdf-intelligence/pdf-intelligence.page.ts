import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { PdfIntelligenceService } from '../../core/services/pdf-intelligence.service';
import { PdfExtractorService } from '../../core/services/pdf-extractor.service';
import { PdfRenderService } from '../../core/services/pdf-render.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { SupportedLanguage } from '../../core/i18n/i18n.types';
import {
  DocumentAnalysis,
  DocumentSummary,
  DocumentQaAnswer,
  DocumentTranslationResult,
  IntelligenceMode
} from '../../core/models/pdf-intelligence.types';
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

export type IntelligenceTab = 'overview' | 'summary' | 'search' | 'qa' | 'translate';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-intelligence',
  templateUrl: './pdf-intelligence.page.html',
  styleUrls: ['./pdf-intelligence.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfIntelligencePage implements OnInit {
  intelligenceService = inject(PdfIntelligenceService);
  private extractorService = inject(PdfExtractorService);
  private renderService = inject(PdfRenderService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private analyticsService = inject(AnalyticsService);
  private bridgeService = inject(DocumentBridgeService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentStep: 'select' | 'analyzing' | 'workspace' = 'select';
  selectedFile?: File;

  // Active workbench tab
  activeTab: IntelligenceTab = 'overview';
  workspaceTabs: { id: IntelligenceTab; label: string }[] = [
    { id: 'overview', label: 'Overview & Stats' },
    { id: 'summary', label: 'Summary' },
    { id: 'search', label: 'Search' },
    { id: 'qa', label: 'Document Q&A' },
    { id: 'translate', label: 'Translate' }
  ];

  // Analysis state
  isAnalyzing = false;
  analysisProgressPct = 0;
  analysisProgressMsg = '';
  pageTexts: { pageNumber: number; text: string; paragraphs?: string[] }[] = [];
  analysis?: DocumentAnalysis;
  summary?: DocumentSummary;

  // Search state
  searchQuery: string = '';
  searchResults: { pageNumber: number; snippet: string; matchIndex: number; matchCount: number }[] = [];
  currentMatchIndex: number = 0;

  // Q&A state
  questionInput: string = '';
  isAnswering: boolean = false;
  qaHistory: DocumentQaAnswer[] = [];
  suggestedQuestions: string[] = [
    'What is the main topic or objective of this document?',
    'What are the eligibility criteria or requirements?',
    'What are the important dates or deadlines?',
    'What instructions or rules must be followed?'
  ];

  // Translation state
  targetLanguage: SupportedLanguage = 'hi';
  translationScope: 'summary' | 'full' | 'page' = 'summary';
  translationResult?: DocumentTranslationResult;
  isTranslating: boolean = false;
  availableLanguages: { code: SupportedLanguage; label: string }[] = [
    { code: 'hi', label: 'हिन्दी (Hindi)' },
    { code: 'mr', label: 'मराठी (Marathi)' },
    { code: 'bn', label: 'বাংলা (Bengali)' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
    { code: 'en', label: 'English' }
  ];

  // AI Privacy Mode State
  activeMode: IntelligenceMode = 'local';
  showPrivacyModal = false;

  // PDF Page Preview & Citation Jumps
  @ViewChild('previewCanvas') previewCanvas?: ElementRef<HTMLCanvasElement>;
  currentPagePreview = 1;
  isRenderingPreview = false;

  async ngOnInit() {
    // Check for incoming target from bridge (e.g. from OCR or Extractor)
    const target = this.bridgeService.getIntelligenceTarget();
    if (target?.file) {
      this.onFileSelected(target.file);
    }
  }

  // =========================================================================
  // FILE SELECTION & EXTRACTION PIPELINE
  // =========================================================================
  async onFileSelected(file: File) {
    this.selectedFile = file;
    this.currentStep = 'analyzing';
    this.isAnalyzing = true;
    this.analysisProgressPct = 10;
    this.analysisProgressMsg = 'Extracting document text layer...';
    this.cdr.markForCheck();

    try {
      // 1. Extract text and structure using existing PdfExtractorService
      const extracted = await this.extractorService.extractContent(
        file,
        {
          extractText: true,
          extractImages: false,
          extractTables: false,
          extractAttachments: false
        },
        (pct, msg) => {
          this.analysisProgressPct = Math.min(80, Math.floor(pct * 0.8));
          this.analysisProgressMsg = msg;
          this.cdr.markForCheck();
        }
      );

      this.pageTexts = extracted.pageTexts;

      // 2. Perform Local Document Analysis
      this.analysisProgressPct = 85;
      this.analysisProgressMsg = 'Analyzing document structure, headings, and keywords...';
      this.cdr.markForCheck();

      this.analysis = this.intelligenceService.analyzeDocument(this.pageTexts);

      // 3. Generate Summaries & Key Points
      this.analysisProgressPct = 95;
      this.analysisProgressMsg = 'Generating summaries and key points...';
      this.cdr.markForCheck();

      this.summary = this.intelligenceService.summarize(this.analysis, this.pageTexts);

      this.currentStep = 'workspace';
      this.recordIntelligenceHistory(file.name);
      this.analyticsService.logEvent('pdf_intelligence_analyzed', {
        pages: this.pageTexts.length,
        words: this.analysis.wordCount,
        reliable: this.analysis.isExtractionReliable
      });

      // Render page 1 preview
      setTimeout(() => this.renderCurrentPagePreview(), 150);
    } catch (err) {
      console.error('Error analyzing document', err);
      this.toastService.error('Failed to analyze PDF document');
      this.currentStep = 'select';
    } finally {
      this.isAnalyzing = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // WORKSPACE NAVIGATION & PREVIEW
  // =========================================================================
  setTab(tab: IntelligenceTab) {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  jumpToPage(pageNum: number) {
    if (!this.analysis || pageNum < 1 || pageNum > this.analysis.pageCount) return;
    this.currentPagePreview = pageNum;
    this.renderCurrentPagePreview();
    this.toastService.success(`Jumped to Page ${pageNum}`);
  }

  async renderCurrentPagePreview() {
    if (!this.selectedFile || !this.previewCanvas) return;
    this.isRenderingPreview = true;
    this.cdr.markForCheck();

    try {
      const buffer = await this.selectedFile.arrayBuffer();
      await this.renderService.loadPdf(buffer, this.selectedFile.name);
      await this.renderService.renderPageToCanvas(
        this.currentPagePreview,
        this.previewCanvas.nativeElement,
        1.0
      );
    } catch (err) {
      console.warn('Could not render page preview', err);
    } finally {
      this.isRenderingPreview = false;
      this.cdr.markForCheck();
    }
  }

  handoffToOcr() {
    if (this.selectedFile) {
      this.bridgeService.setOcrTarget({
        file: this.selectedFile,
        source: 'custom'
      });
      this.router.navigate(['/features/pdf-ocr']);
    }
  }

  // =========================================================================
  // SEARCH
  // =========================================================================
  onSearch() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.currentMatchIndex = 0;
      return;
    }

    this.searchResults = this.intelligenceService.searchDocument(this.searchQuery, this.pageTexts);
    this.currentMatchIndex = this.searchResults.length > 0 ? 1 : 0;

    if (this.searchResults.length > 0) {
      this.jumpToPage(this.searchResults[0].pageNumber);
    }
  }

  nextMatch() {
    if (this.searchResults.length === 0) return;
    this.currentMatchIndex = this.currentMatchIndex >= this.searchResults.length ? 1 : this.currentMatchIndex + 1;
    const match = this.searchResults[this.currentMatchIndex - 1];
    if (match) {
      this.jumpToPage(match.pageNumber);
    }
  }

  prevMatch() {
    if (this.searchResults.length === 0) return;
    this.currentMatchIndex = this.currentMatchIndex <= 1 ? this.searchResults.length : this.currentMatchIndex - 1;
    const match = this.searchResults[this.currentMatchIndex - 1];
    if (match) {
      this.jumpToPage(match.pageNumber);
    }
  }

  // =========================================================================
  // GROUNDED Q&A
  // =========================================================================
  askQuestion(questionText?: string) {
    const q = questionText || this.questionInput;
    if (!q.trim()) return;

    this.isAnswering = true;
    this.cdr.markForCheck();

    try {
      const answer = this.intelligenceService.answerQuestion(q, this.pageTexts);
      this.qaHistory.unshift(answer);
      this.questionInput = '';
      this.analyticsService.logEvent('pdf_qa_asked', { grounded: answer.groundedInDocument });

      if (answer.citations.length > 0) {
        this.jumpToPage(answer.citations[0].pageNumber);
      }
    } finally {
      this.isAnswering = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // TRANSLATION
  // =========================================================================
  async runTranslation() {
    if (this.translationScope === 'summary') {
      await this.translateSummary();
      return;
    }

    if (this.pageTexts.length === 0) return;
    this.isTranslating = true;
    this.cdr.markForCheck();

    try {
      const scopeConfig = this.translationScope === 'page'
        ? { scope: 'pages' as const, pageNumbers: [this.currentPagePreview] }
        : { scope: 'full' as const };

      this.translationResult = await this.intelligenceService.translateDocument(
        this.pageTexts,
        this.targetLanguage,
        scopeConfig
      );
      const scopeDesc = this.translationScope === 'page'
        ? `Page ${this.currentPagePreview}`
        : 'Full Document';
      this.toastService.success(`${scopeDesc} translated into ${this.targetLanguage.toUpperCase()}`);
      this.analyticsService.logEvent('pdf_translated', {
        targetLanguage: this.targetLanguage,
        scope: this.translationScope
      });
    } catch (err) {
      console.error('Translation error', err);
      this.toastService.error('Translation failed');
    } finally {
      this.isTranslating = false;
      this.cdr.markForCheck();
    }
  }

  async translateSummary() {
    if (!this.summary) return;
    this.isTranslating = true;
    this.cdr.markForCheck();

    try {
      this.translationResult = await this.intelligenceService.translateDocumentSummary(
        this.summary,
        this.targetLanguage
      );
      this.toastService.success(`Summary translated into ${this.targetLanguage.toUpperCase()}`);
      this.analyticsService.logEvent('pdf_translated', { targetLanguage: this.targetLanguage, scope: 'summary' });
    } catch (err) {
      this.toastService.error('Translation failed');
    } finally {
      this.isTranslating = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // AI PRIVACY CONTROLS
  // =========================================================================
  toggleAiMode(targetMode: IntelligenceMode) {
    if (targetMode === 'ai-assisted' && !this.intelligenceService.config.userAcceptedDisclosure) {
      this.showPrivacyModal = true;
    } else {
      this.activeMode = targetMode;
      this.intelligenceService.setMode(targetMode);
    }
  }

  acceptAiPrivacy() {
    this.intelligenceService.updateAiConfig({ userAcceptedDisclosure: true });
    this.activeMode = 'ai-assisted';
    this.intelligenceService.setMode('ai-assisted');
    this.showPrivacyModal = false;
    this.toastService.success('AI-Assisted Mode activated with privacy disclosure');
  }

  cancelAiPrivacy() {
    this.showPrivacyModal = false;
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  exportSummaryTxt() {
    if (!this.summary) return;
    const blob = this.intelligenceService.exportSummaryTxt(this.summary, this.selectedFile?.name);
    this.fileService.downloadBlob(blob, `summary_${Date.now()}.txt`);
    this.toastService.success('Summary TXT exported');
  }

  async exportSummaryPdf() {
    if (!this.summary) return;
    try {
      const blob = await this.intelligenceService.exportSummaryPdf(
        this.selectedFile?.name || 'Document',
        this.summary
      );
      this.fileService.downloadBlob(blob, `summary_${Date.now()}.pdf`);
      this.toastService.success('Summary PDF exported');
    } catch {
      this.toastService.error('Could not export Summary PDF');
    }
  }

  exportStructuredJson() {
    if (!this.analysis || !this.summary) return;
    const blob = this.intelligenceService.exportStructuredJson(this.analysis, this.summary);
    this.fileService.downloadBlob(blob, `intelligence_report_${Date.now()}.json`);
    this.toastService.success('Structured JSON exported');
  }

  exportTranslationTxt() {
    if (!this.translationResult) return;
    const blob = this.intelligenceService.exportTranslationTxt(this.translationResult);
    this.fileService.downloadBlob(blob, `translation_${this.translationResult.targetLanguage}_${Date.now()}.txt`);
    this.toastService.success('Translation TXT exported');
  }

  resetWorkspace() {
    this.selectedFile = undefined;
    this.currentStep = 'select';
    this.analysis = undefined;
    this.summary = undefined;
    this.pageTexts = [];
    this.searchResults = [];
    this.qaHistory = [];
    this.translationResult = undefined;
  }

  private async recordIntelligenceHistory(fileName: string) {
    try {
      await this.historyService.addHistoryItem({
        operation: 'pdf-intelligence',
        originalFileName: fileName,
        outputFileName: 'Intelligence Analysis',
        originalSizeBytes: this.selectedFile?.size || 0,
        outputSizeBytes: 0
      });
    } catch {
      // ignore
    }
  }
}
