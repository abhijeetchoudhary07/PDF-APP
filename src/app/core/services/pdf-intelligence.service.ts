import { Injectable, inject } from '@angular/core';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { SupportedLanguage } from '../i18n/i18n.types';
import {
  DocumentAnalysis,
  DocumentSummary,
  DocumentHeading,
  DocumentSection,
  DocumentKeyword,
  DocumentQaAnswer,
  DocumentTranslationResult,
  IntelligenceMode,
  AiProviderConfig
} from '../models/pdf-intelligence.types';
import { IntelligenceProvider, IntelligenceTranslationScope } from './intelligence-provider.interface';
import { LocalIntelligenceProvider } from './local-intelligence.provider';
import { RemoteAIProvider } from './remote-ai.provider';

// Common stop words for keyword extraction and heuristics
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'shall', 'may', 'might', 'must', 'page'
]);

@Injectable({
  providedIn: 'root'
})
export class PdfIntelligenceService {
  private activeMode: IntelligenceMode = 'local';
  private aiConfig: AiProviderConfig = {
    providerName: 'local',
    userAcceptedDisclosure: false
  };

  public localProvider: LocalIntelligenceProvider;
  public remoteProvider: RemoteAIProvider;

  constructor() {
    const localProvider = inject(LocalIntelligenceProvider);
    const remoteProvider = inject(RemoteAIProvider);

    this.localProvider = localProvider || new LocalIntelligenceProvider();
    this.remoteProvider = remoteProvider || new RemoteAIProvider();
  }

  get mode(): IntelligenceMode {
    return this.activeMode;
  }

  setMode(mode: IntelligenceMode) {
    this.activeMode = mode;
  }

  get config(): AiProviderConfig {
    return this.aiConfig;
  }

  updateAiConfig(config: Partial<AiProviderConfig>) {
    this.aiConfig = { ...this.aiConfig, ...config };
    this.remoteProvider.setConfig(this.aiConfig);
  }

  get activeProvider(): IntelligenceProvider {
    return this.activeMode === 'ai-assisted' ? this.remoteProvider : this.localProvider;
  }

  // =========================================================================
  // STAGE 1 — LOCAL DOCUMENT ANALYSIS
  // =========================================================================

  /**
   * Analyzes text extracted from PDF pages.
   */
  analyzeDocument(
    pageTexts: { pageNumber: number; text: string; paragraphs?: string[] }[]
  ): DocumentAnalysis {
    let totalWords = 0;
    let totalChars = 0;
    const allParagraphs: string[] = [];
    const headings: DocumentHeading[] = [];
    const sections: DocumentSection[] = [];
    const wordFrequency: Map<string, number> = new Map();

    let currentSectionTitle = 'Introduction';
    let currentSectionContent: string[] = [];
    let currentSectionPage = 1;

    for (const page of pageTexts) {
      const pageText = page.text || '';
      totalChars += pageText.length;

      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      for (const line of lines) {
        const words = line.split(/\s+/).filter(w => w.length > 0);
        totalWords += words.length;

        // Word frequency counting (lowercased, alphanumeric)
        for (const rawWord of words) {
          const clean = rawWord.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/g, '');
          if (clean.length > 2 && !STOP_WORDS.has(clean)) {
            wordFrequency.set(clean, (wordFrequency.get(clean) || 0) + 1);
          }
        }

        // Heading detection heuristics
        const isHeading = this.detectIsHeading(line, words);
        if (isHeading) {
          if (currentSectionContent.length > 0) {
            const contentStr = currentSectionContent.join(' ');
            sections.push({
              title: currentSectionTitle,
              pageNumber: currentSectionPage,
              content: contentStr,
              wordCount: contentStr.split(/\s+/).length
            });
            currentSectionContent = [];
          }

          currentSectionTitle = line;
          currentSectionPage = page.pageNumber;
          headings.push({
            text: line,
            level: line.length < 35 ? 1 : 2,
            pageNumber: page.pageNumber
          });
        } else {
          currentSectionContent.push(line);
        }

        if (line.length > 60) {
          allParagraphs.push(line);
        }
      }
    }

    // Flush final section
    if (currentSectionContent.length > 0) {
      const contentStr = currentSectionContent.join(' ');
      sections.push({
        title: currentSectionTitle,
        pageNumber: currentSectionPage,
        content: contentStr,
        wordCount: contentStr.split(/\s+/).length
      });
    }

    // Language detection
    const detectedLanguage = this.detectScriptLanguage(pageTexts.map(p => p.text).join(' '));

    // Keywords (top 15)
    const keywords: DocumentKeyword[] = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({
        word,
        count,
        score: Math.min(100, Math.round((count / Math.max(1, totalWords)) * 1000))
      }));

    // Quality notice
    const isExtractionReliable = totalWords >= 25;
    const extractionNotice = !isExtractionReliable
      ? 'Very little or no digital text was found in this document. It may contain scanned images. Run Smart PDF OCR for best results.'
      : undefined;

    return {
      wordCount: totalWords,
      charCount: totalChars,
      pageCount: pageTexts.length,
      detectedLanguage,
      readingTimeMinutes: Math.max(1, Math.ceil(totalWords / 200)),
      headings,
      paragraphs: allParagraphs,
      keywords,
      sections,
      isExtractionReliable,
      extractionNotice
    };
  }

  // =========================================================================
  // SUMMARIZATION & KEY POINTS
  // =========================================================================

  /**
   * Generates summary through active provider (Local on-device or Remote AI).
   */
  summarize(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentSummary {
    const res = this.localProvider.summarize(analysis, pageTexts);
    res.modeUsed = this.activeMode;
    return res;
  }

  async summarizeAsync(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): Promise<DocumentSummary> {
    const res = await this.activeProvider.summarize(analysis, pageTexts);
    res.modeUsed = this.activeMode;
    return res;
  }

  async extractKeyPoints(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): Promise<string[]> {
    return await this.activeProvider.extractKeyPoints(analysis, pageTexts);
  }

  // =========================================================================
  // DOCUMENT SEARCH
  // =========================================================================

  searchDocument(
    query: string,
    pageTexts: { pageNumber: number; text: string }[]
  ): { pageNumber: number; snippet: string; matchIndex: number; matchCount: number }[] {
    if (!query || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();
    const results: { pageNumber: number; snippet: string; matchIndex: number; matchCount: number }[] = [];

    pageTexts.forEach(page => {
      const text = page.text || '';
      const lower = text.toLowerCase();
      let pos = 0;

      while ((pos = lower.indexOf(q, pos)) !== -1) {
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + q.length + 40);
        const snippet = (start > 0 ? '...' : '') + text.substring(start, end).replace(/\s+/g, ' ') + (end < text.length ? '...' : '');

        results.push({
          pageNumber: page.pageNumber,
          snippet,
          matchIndex: results.length + 1,
          matchCount: 1
        });
        pos += q.length;
      }
    });

    return results;
  }

  // =========================================================================
  // GROUNDED DOCUMENT Q&A
  // =========================================================================

  answerQuestion(
    question: string,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentQaAnswer {
    const res = this.localProvider.answer(question, pageTexts);
    res.modeUsed = this.activeMode;
    return res;
  }

  async answerQuestionAsync(
    question: string,
    pageTexts: { pageNumber: number; text: string }[]
  ): Promise<DocumentQaAnswer> {
    const res = await this.activeProvider.answer(question, pageTexts);
    res.modeUsed = this.activeMode;
    return res;
  }

  // =========================================================================
  // TRANSLATION
  // =========================================================================

  async translateContent(
    text: string,
    targetLanguage: SupportedLanguage
  ): Promise<string> {
    return await this.activeProvider.translate(text, targetLanguage);
  }

  async translateDocumentSummary(
    summary: DocumentSummary,
    targetLanguage: SupportedLanguage
  ): Promise<DocumentTranslationResult> {
    const translatedQuick = await this.translateContent(summary.quickSummary, targetLanguage);
    const translatedPoints = await Promise.all(
      summary.keyPoints.map(kp => this.translateContent(kp, targetLanguage))
    );

    const fullTranslated = [
      `[${targetLanguage.toUpperCase()}] ${translatedQuick}`,
      '',
      'Key Points:',
      ...translatedPoints.map(p => `• ${p}`)
    ].join('\n');

    return {
      sourceLanguage: 'English',
      targetLanguage,
      translatedText: fullTranslated,
      translatedSummary: translatedQuick,
      modeUsed: this.activeMode
    };
  }

  /**
   * Translate full document text, selected pages, or custom text while preserving original.
   */
  async translateDocument(
    pageTexts: { pageNumber: number; text: string }[],
    targetLanguage: SupportedLanguage,
    scope: IntelligenceTranslationScope = { scope: 'full' }
  ): Promise<DocumentTranslationResult> {
    let pagesToTranslate = pageTexts;

    if (scope.scope === 'pages' && scope.pageNumbers && scope.pageNumbers.length > 0) {
      pagesToTranslate = pageTexts.filter(p => scope.pageNumbers!.includes(p.pageNumber));
    } else if (scope.scope === 'custom' && scope.customText) {
      const translated = await this.translateContent(scope.customText, targetLanguage);
      return {
        sourceLanguage: 'English',
        targetLanguage,
        translatedText: translated,
        modeUsed: this.activeMode
      };
    }

    const translatedPages: { pageNumber: number; text: string }[] = [];
    for (const page of pagesToTranslate) {
      const translated = await this.translateContent(page.text || '', targetLanguage);
      translatedPages.push({ pageNumber: page.pageNumber, text: translated });
    }

    const fullText = translatedPages
      .map(p => `--- [Page ${p.pageNumber}] ---\n${p.text}`)
      .join('\n\n');

    return {
      sourceLanguage: 'English',
      targetLanguage,
      translatedText: fullText,
      translatedPages,
      modeUsed: this.activeMode
    };
  }

  // =========================================================================
  // EXPORT GENERATORS
  // =========================================================================

  exportSummaryTxt(summary: DocumentSummary, docTitle?: string): Blob {
    const lines = [
      '==================================================',
      'DOCUMENT INTELLIGENCE SUMMARY REPORT',
      `Document: ${docTitle || 'Untitled Document'}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Processing Mode: ${summary.modeUsed.toUpperCase()}`,
      '==================================================\n',
      'QUICK SUMMARY:',
      summary.quickSummary,
      '\n--------------------------------------------------',
      'KEY POINTS:'
    ];

    summary.keyPoints.forEach((kp, idx) => {
      lines.push(`${idx + 1}. ${kp}`);
    });

    if (summary.sectionSummaries.length > 0) {
      lines.push('\n--------------------------------------------------');
      lines.push('SECTION BREAKDOWN:');
      summary.sectionSummaries.forEach(sec => {
        lines.push(`\n[Page ${sec.pageNumber}] ${sec.sectionTitle}:`);
        lines.push(`  ${sec.summary}`);
      });
    }

    if (summary.extractionQualityNotice) {
      lines.push('\n--------------------------------------------------');
      lines.push(`NOTICE: ${summary.extractionQualityNotice}`);
    }

    return new Blob([lines.join('\n')], { type: 'text/plain' });
  }

  async exportSummaryPdf(docTitle: string, summary: DocumentSummary): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 60;

    // Header
    page.drawText('Document Intelligence Summary', {
      x: 50,
      y,
      size: 20,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1)
    });
    y -= 25;

    page.drawText(`File: ${docTitle}  •  Mode: ${summary.modeUsed.toUpperCase()}  •  Date: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4)
    });
    y -= 35;

    // Quick Summary Title
    page.drawText('Executive Summary', {
      x: 50,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.15, 0.25, 0.45)
    });
    y -= 20;

    // Quick Summary Body
    const quickLines = this.wrapText(summary.quickSummary, 85);
    for (const line of quickLines.slice(0, 6)) {
      page.drawText(line, {
        x: 50,
        y,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
      y -= 16;
    }
    y -= 15;

    // Key Points
    page.drawText('Key Points', {
      x: 50,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.15, 0.25, 0.45)
    });
    y -= 20;

    for (const kp of summary.keyPoints.slice(0, 5)) {
      const kpLines = this.wrapText(`•  ${kp}`, 80);
      for (const line of kpLines) {
        page.drawText(line, {
          x: 50,
          y,
          size: 10,
          font,
          color: rgb(0.2, 0.2, 0.2)
        });
        y -= 16;
      }
      y -= 6;
    }

    // Footer
    page.drawText('Generated with Indian Form Helper • 100% On-Device & Safe', {
      x: 50,
      y: 40,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }

  exportStructuredJson(analysis: DocumentAnalysis, summary: DocumentSummary): Blob {
    const payload = {
      analysis,
      summary,
      exportedAt: new Date().toISOString()
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  exportTranslationTxt(result: DocumentTranslationResult): Blob {
    const lines = [
      '==================================================',
      `TRANSLATION REPORT (${result.targetLanguage.toUpperCase()})`,
      `Source Language: ${result.sourceLanguage}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Mode: ${result.modeUsed.toUpperCase()}`,
      '==================================================\n',
      result.translatedText
    ];
    return new Blob([lines.join('\n')], { type: 'text/plain' });
  }

  // =========================================================================
  // HEURISTIC HELPERS
  // =========================================================================

  private detectIsHeading(line: string, words: string[]): boolean {
    if (words.length === 0 || words.length > 12) return false;
    if (line.endsWith('.') && words.length > 6) return false;

    if (/^(\d+(\.\d+)*|[A-Z]\.|\b(Section|Chapter|Part|Article|Clause)\b)/i.test(line)) {
      return true;
    }

    if (line === line.toUpperCase() && words.length <= 8 && /[A-Z]/.test(line)) {
      return true;
    }

    const isTitleCase = words.every(w => /^[A-Z]/.test(w) || STOP_WORDS.has(w.toLowerCase()));
    if (isTitleCase && words.length <= 6 && line.length < 50) {
      return true;
    }

    return false;
  }

  private detectScriptLanguage(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'Hindi / Marathi (Devanagari)';
    if (/[\u0980-\u09FF]/.test(text)) return 'Bengali (Bangla)';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'Punjabi (Gurmukhi)';
    return 'English (Latin)';
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}

// Export DocumentIntelligenceService as direct alias for architectural completeness
export { PdfIntelligenceService as DocumentIntelligenceService };
