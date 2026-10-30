import { Injectable, inject } from '@angular/core';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';

import { PdfIntelligenceService } from './pdf-intelligence.service';
import { StorageService } from './storage.service';
import {
  MultiDocChatMessage,
  MultiDocCitation,
  MultiDocIndexedDocument,
  MultiDocParagraphChunk,
  MultiDocQaAnswer,
  MultiDocQaSearchScope,
  MultiDocSearchScopeItem
} from '../models/pdf-intelligence.types';

// Standard English stop words
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
export class MultiDocumentQaService extends PdfIntelligenceService {
  private storageService = inject(StorageService);

  // In-memory document corpus and inverted index
  private documents: Map<string, MultiDocIndexedDocument> = new Map();
  private paragraphChunks: MultiDocParagraphChunk[] = [];
  private invertedIndex: Map<string, Set<string>> = new Map(); // term -> set of chunk IDs
  private documentFrequencyMap: Map<string, number> = new Map(); // term -> count of chunks containing term

  // BM25 Hyperparameters
  private readonly k1 = 1.2;
  private readonly b = 0.75;
  private readonly minRelevanceScore = 0.15;

  // Maximum allowed documents in corpus (Play Store specification: 2 to 10)
  public readonly MAX_DOCUMENTS = 10;
  public readonly MIN_DOCUMENTS = 2;
  public readonly MAX_PAGES_PER_DOC = 100;
  public readonly MAX_CORPUS_CHUNKS = 5000;

  // =========================================================================
  // CORPUS INGESTION & MANAGEMENT
  // =========================================================================

  getLoadedDocuments(): MultiDocIndexedDocument[] {
    return Array.from(this.documents.values());
  }

  getEnabledDocuments(): MultiDocIndexedDocument[] {
    return Array.from(this.documents.values()).filter(doc => doc.enabled);
  }

  getAllParagraphs(): MultiDocParagraphChunk[] {
    return [...this.paragraphChunks];
  }

  clearCorpus(): void {
    this.documents.clear();
    this.paragraphChunks = [];
    this.invertedIndex.clear();
    this.documentFrequencyMap.clear();
  }

  removeDocument(documentId: string): void {
    this.documents.delete(documentId);
    this.rebuildIndex();
  }

  toggleDocument(documentId: string, enabled?: boolean): void {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.enabled = enabled !== undefined ? enabled : !doc.enabled;
    }
  }

  /**
   * Directly registers a pre-extracted document into the corpus.
   * Useful for unit tests, fixtures, and fast programmatic injection.
   */
  addDocumentDirect(doc: MultiDocIndexedDocument): void {
    if (this.documents.size >= this.MAX_DOCUMENTS) {
      throw new Error(`Maximum corpus limit reached (${this.MAX_DOCUMENTS} documents)`);
    }
    this.documents.set(doc.id, doc);
    this.rebuildIndex();
  }

  /**
   * Ingests a PDF File object, extracts page texts with pdfjs-dist, and indexes it.
   */
  async ingestPdfFile(file: File): Promise<MultiDocIndexedDocument> {
    if (this.documents.size >= this.MAX_DOCUMENTS) {
      throw new Error(`Corpus cannot exceed ${this.MAX_DOCUMENTS} PDF documents`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, this.MAX_PAGES_PER_DOC);
    const pages: { pageNumber: number; text: string }[] = [];

    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const pageParts: string[] = [];
      let lastY: number | null = null;

      for (const item of textContent.items as any[]) {
        const str = item.str || '';
        const currentY = item.transform ? item.transform[5] : null;
        if (lastY !== null && currentY !== null && Math.abs(lastY - currentY) > 16) {
          pageParts.push('\n\n');
        } else if (item.hasEOL) {
          pageParts.push('\n');
        } else {
          pageParts.push(' ');
        }
        pageParts.push(str);
        if (currentY !== null) {
          lastY = currentY;
        }
      }

      const pageText = pageParts.join('').replace(/[ \t]+/g, ' ').trim();
      pages.push({ pageNumber: p, text: pageText });
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const indexedDoc: MultiDocIndexedDocument = {
      id: docId,
      fileName: file.name,
      fileSize: file.size,
      pageCount: numPages,
      enabled: true,
      pages
    };

    this.documents.set(docId, indexedDoc);
    this.rebuildIndex();
    return indexedDoc;
  }

  // =========================================================================
  // BM25 INVERTED INDEXING
  // =========================================================================

  /**
   * Rebuilds the inverted index and BM25 term frequencies across all loaded documents.
   */
  private rebuildIndex(): void {
    this.paragraphChunks = [];
    this.invertedIndex.clear();
    this.documentFrequencyMap.clear();

    for (const doc of this.documents.values()) {
      if (this.paragraphChunks.length >= this.MAX_CORPUS_CHUNKS) break;
      for (const page of doc.pages) {
        if (this.paragraphChunks.length >= this.MAX_CORPUS_CHUNKS) break;
        if (!page.text || page.text.trim().length === 0) continue;

        const rawParagraphs = this.splitIntoParagraphs(page.text);
        for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
          if (this.paragraphChunks.length >= this.MAX_CORPUS_CHUNKS) break;
          const paraText = rawParagraphs[pIdx];
          const tokens = this.tokenizeText(paraText);
          if (tokens.length === 0) continue;

          const chunkId = `${doc.id}_p${page.pageNumber}_${pIdx}`;
          const termFrequencies = new Map<string, number>();

          tokens.forEach(token => {
            termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
          });

          const chunk: MultiDocParagraphChunk = {
            id: chunkId,
            documentId: doc.id,
            fileName: doc.fileName,
            pageNumber: page.pageNumber,
            paragraphIndex: pIdx + 1,
            text: paraText,
            wordCount: tokens.length,
            tokens,
            termFrequencies
          };

          this.paragraphChunks.push(chunk);

          // Update Inverted Index & Document Frequency
          const uniqueTermsInChunk = new Set(tokens);
          for (const term of uniqueTermsInChunk) {
            if (!this.invertedIndex.has(term)) {
              this.invertedIndex.set(term, new Set());
            }
            this.invertedIndex.get(term)!.add(chunkId);
            this.documentFrequencyMap.set(term, (this.documentFrequencyMap.get(term) || 0) + 1);
          }
        }
      }
    }
  }

  /**
   * Splits a page's text into logical paragraph chunks.
   */
  private splitIntoParagraphs(text: string): string[] {
    let rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (rawParagraphs.length <= 1 && text.includes('\n')) {
      rawParagraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
    }
    if (rawParagraphs.length <= 1 && text.length > 350) {
      // Split on sentence boundaries if whole block is one large text blob
      const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
      const chunks: string[] = [];
      let cur = '';
      for (const s of sentences) {
        if ((cur + ' ' + s).trim().length > 300 && cur.length > 50) {
          chunks.push(cur.trim());
          cur = s;
        } else {
          cur += (cur ? ' ' : '') + s;
        }
      }
      if (cur.trim()) chunks.push(cur.trim());
      if (chunks.length > 0) rawParagraphs = chunks;
    }

    const result: string[] = [];
    let pendingHeading = '';

    for (const p of rawParagraphs) {
      const trimmed = p.replace(/\s+/g, ' ').trim();
      if (!trimmed) continue;

      const isHeader = (trimmed.length < 90 && !/[.!?]$/.test(trimmed)) ||
        (/^(Section|Chapter|Part|Article|\d+\.)/i.test(trimmed) && trimmed.length < 90);

      if (isHeader) {
        pendingHeading = pendingHeading ? `${pendingHeading}: ${trimmed}` : trimmed;
        continue;
      }

      const fullText = pendingHeading ? `${pendingHeading}. ${trimmed}` : trimmed;
      pendingHeading = '';

      if (fullText.length > 25) {
        result.push(fullText);
      } else if (result.length > 0) {
        result[result.length - 1] += ' ' + fullText;
      } else {
        result.push(fullText);
      }
    }

    if (pendingHeading) {
      if (result.length > 0) {
        result[result.length - 1] += ' ' + pendingHeading;
      } else {
        result.push(pendingHeading);
      }
    }

    return result.length > 0 ? result : [text.trim()];
  }

  /**
   * Tokenizes and normalizes text for inverted index (supports English and Indic scripts).
   */
  public tokenizeText(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .split(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]+/)
      .map(t => t.trim())
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  // =========================================================================
  // QUERY & BM25 SEARCH EXECUTION
  // =========================================================================

  /**
   * Queries the multi-document corpus using BM25 ranking across all enabled documents.
   */
  async queryCorpus(question: string): Promise<MultiDocQaAnswer> {
    const trimmedQuestion = question?.trim() || '';
    const enabledDocs = this.getEnabledDocuments();
    const allDocs = this.getLoadedDocuments();

    // Empty search scope baseline
    const initialSearchScope: MultiDocQaSearchScope = {
      searchedDocumentCount: enabledDocs.length,
      totalLoadedDocumentCount: allDocs.length,
      searchedDocuments: enabledDocs.map(d => ({
        documentId: d.id,
        fileName: d.fileName,
        isRelevant: false,
        hitCount: 0
      })),
      relevantDocuments: [],
      irrelevantDocuments: enabledDocs.map(d => d.fileName)
    };

    if (!trimmedQuestion || enabledDocs.length === 0) {
      return {
        question: trimmedQuestion,
        answer: 'No relevant information found in the selected documents',
        isAnswerable: false,
        citations: [],
        searchScope: initialSearchScope,
        timestamp: Date.now()
      };
    }

    const queryTokens = this.tokenizeText(trimmedQuestion);
    if (queryTokens.length === 0) {
      return {
        question: trimmedQuestion,
        answer: 'No relevant information found in the selected documents',
        isAnswerable: false,
        citations: [],
        searchScope: initialSearchScope,
        timestamp: Date.now()
      };
    }

    // Filter chunks to enabled documents only
    const enabledDocIds = new Set(enabledDocs.map(d => d.id));
    const candidateChunks = this.paragraphChunks.filter(c => enabledDocIds.has(c.documentId));

    if (candidateChunks.length === 0) {
      return {
        question: trimmedQuestion,
        answer: 'No relevant information found in the selected documents',
        isAnswerable: false,
        citations: [],
        searchScope: initialSearchScope,
        timestamp: Date.now()
      };
    }

    // Corpus statistics
    const N = candidateChunks.length;
    const totalWords = candidateChunks.reduce((acc, c) => acc + c.wordCount, 0);
    const avgdl = totalWords / N || 1;

    // Compute BM25 scores for all candidate chunks
    const scoredChunks: { chunk: MultiDocParagraphChunk; score: number }[] = [];
    const docHitCounts = new Map<string, number>();
    enabledDocs.forEach(d => docHitCounts.set(d.id, 0));

    for (const chunk of candidateChunks) {
      let score = 0;
      const D_len = chunk.wordCount;

      for (const term of queryTokens) {
        const tf = chunk.termFrequencies.get(term) || 0;
        if (tf === 0) continue;

        // Document frequency in candidate corpus
        const n_qi = this.documentFrequencyMap.get(term) || 1;

        // Robertson-Spärck Jones IDF
        const idf = Math.log(1 + (N - n_qi + 0.5) / (n_qi + 0.5));

        // BM25 term weighting with NaN and zero-division protection
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (D_len / avgdl));
        const termScore = denominator > 0 ? idf * (numerator / denominator) : 0;
        if (!isNaN(termScore) && isFinite(termScore)) {
          score += termScore;
        }
      }

      if (!isNaN(score) && isFinite(score) && score > 0) {
        scoredChunks.push({ chunk, score });
        docHitCounts.set(chunk.documentId, (docHitCounts.get(chunk.documentId) || 0) + 1);
      }
    }

    // Sort descending by relevance score
    scoredChunks.sort((a, b) => b.score - a.score);

    // Build Search Scope Summary
    const searchScopeItems: MultiDocSearchScopeItem[] = enabledDocs.map(doc => {
      const hits = docHitCounts.get(doc.id) || 0;
      return {
        documentId: doc.id,
        fileName: doc.fileName,
        isRelevant: hits > 0,
        hitCount: hits
      };
    });

    const relevantDocs = searchScopeItems.filter(s => s.isRelevant).map(s => s.fileName);
    const irrelevantDocs = searchScopeItems.filter(s => !s.isRelevant).map(s => s.fileName);

    const searchScope: MultiDocQaSearchScope = {
      searchedDocumentCount: enabledDocs.length,
      totalLoadedDocumentCount: allDocs.length,
      searchedDocuments: searchScopeItems,
      relevantDocuments: relevantDocs,
      irrelevantDocuments: irrelevantDocs
    };

    // Unanswered / No match threshold check
    if (scoredChunks.length === 0 || scoredChunks[0].score < this.minRelevanceScore) {
      return {
        question: trimmedQuestion,
        answer: 'No relevant information found in the selected documents',
        isAnswerable: false,
        citations: [],
        searchScope,
        timestamp: Date.now()
      };
    }

    // Top passages (up to top 3)
    const topScored = scoredChunks.slice(0, 3);
    const highestScore = topScored[0].score;

    // Dual Citation Attribution: [FileName, Page X]
    const citations: MultiDocCitation[] = topScored.map(({ chunk, score }) => {
      const confidence = Math.min(99, Math.max(30, Math.round((score / highestScore) * 95)));
      const snippet = this.generateKwicSnippet(chunk.text, queryTokens);
      return {
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        pageNumber: chunk.pageNumber,
        paragraphIndex: chunk.paragraphIndex,
        snippet,
        confidence,
        formattedCitation: `[${chunk.fileName}, Page ${chunk.pageNumber}]`
      };
    });

    // Synthesize response based on top grounded passage
    const topChunk = topScored[0].chunk;
    const synthesizedAnswer = this.synthesizeAnswer(topChunk.text, topChunk.fileName, topChunk.pageNumber);

    return {
      question: trimmedQuestion,
      answer: synthesizedAnswer,
      isAnswerable: true,
      citations,
      searchScope,
      topPassageText: topChunk.text,
      timestamp: Date.now(),
      modeUsed: 'local'
    };
  }

  /**
   * Synthesizes an on-device, grounded response quoting and contextualizing the top passage.
   */
  private synthesizeAnswer(passageText: string, fileName: string, pageNumber: number): string {
    const cleanPassage = passageText.replace(/\s+/g, ' ').trim();
    return `According to [${fileName}, Page ${pageNumber}]: "${cleanPassage}"`;
  }

  /**
   * Generates a focused Key Word In Context (KWIC) snippet window centered around matched query terms.
   */
  private generateKwicSnippet(text: string, queryTokens: string[]): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= 200) {
      return clean;
    }

    const lower = clean.toLowerCase();
    let bestPos = -1;
    for (const token of queryTokens) {
      const idx = lower.indexOf(token);
      if (idx !== -1) {
        if (bestPos === -1 || idx < bestPos) {
          bestPos = idx;
        }
      }
    }

    if (bestPos === -1) {
      return clean.substring(0, 197) + '...';
    }

    const start = Math.max(0, bestPos - 60);
    const end = Math.min(clean.length, start + 200);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < clean.length ? '...' : '';
    return prefix + clean.substring(start, end).trim() + suffix;
  }

  // =========================================================================
  // TRANSCRIPT EXPORT (TXT & PDF)
  // =========================================================================

  /**
   * Exports Q&A transcript to plain text file.
   */
  async exportTranscriptTxt(
    messages: MultiDocChatMessage[],
    filename: string = 'multi-doc-qa-transcript.txt'
  ): Promise<{ file: File; savedUri?: string }> {
    const lines: string[] = [
      '====================================================',
      'MULTI-DOCUMENT Q&A TRANSCRIPT',
      `Date: ${new Date().toLocaleString()}`,
      `Loaded Documents: ${this.documents.size}`,
      '====================================================\n'
    ];

    messages.forEach((msg, idx) => {
      const sender = msg.sender === 'user' ? 'USER' : 'ASSISTANT';
      lines.push(`[${idx + 1}] ${sender} (${new Date(msg.timestamp).toLocaleTimeString()}):`);
      lines.push(`${msg.text}\n`);

      if (msg.answerData?.citations && msg.answerData.citations.length > 0) {
        lines.push('Citations:');
        msg.answerData.citations.forEach(c => {
          lines.push(`  * ${c.formattedCitation} (Confidence: ${c.confidence}%)`);
          lines.push(`    "${c.snippet}"`);
        });
        lines.push('');
      }

      if (msg.answerData?.searchScope) {
        const s = msg.answerData.searchScope;
        lines.push(`Scope: Searched ${s.searchedDocumentCount} document(s).`);
        if (s.irrelevantDocuments.length > 0) {
          lines.push(`No relevance in: ${s.irrelevantDocuments.join(', ')}`);
        }
        lines.push('');
      }
      lines.push('----------------------------------------------------\n');
    });

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const targetName = filename.endsWith('.txt') ? filename : `${filename}.txt`;
    const file = new File([blob], targetName, { type: 'text/plain' });

    const savedUri = await this.storageService.saveFile(file, 'multi-doc-qa', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Exports Q&A transcript to multi-page printable PDF.
   */
  async exportTranscriptPdf(
    messages: MultiDocChatMessage[],
    filename: string = 'multi-doc-qa-transcript.pdf'
  ): Promise<{ file: File; savedUri?: string }> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Header Title
    page.drawText('Multi-Document Q&A Transcript', {
      x: margin,
      y,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.2, 0.35)
    });
    y -= 22;

    page.drawText(`Generated on: ${new Date().toLocaleString()} | Loaded Documents: ${this.documents.size}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.45, 0.5)
    });
    y -= 25;

    // Draw separator line
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92)
    });
    y -= 20;

    for (const msg of messages) {
      if (y < margin + 60) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      const isUser = msg.sender === 'user';
      const senderLabel = isUser ? 'USER QUESTION:' : 'GROUNDED ANSWER:';
      const senderColor = isUser ? rgb(0.1, 0.4, 0.8) : rgb(0.1, 0.6, 0.3);

      page.drawText(senderLabel, {
        x: margin,
        y,
        size: 10,
        font: boldFont,
        color: senderColor
      });
      y -= 14;

      // Wrap message text
      const wrappedLines = this.wrapPdfText(msg.text, contentWidth, 10, font);
      for (const line of wrappedLines) {
        if (y < margin + 30) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(line, {
          x: margin,
          y,
          size: 9.5,
          font,
          color: rgb(0.15, 0.15, 0.15)
        });
        y -= 13;
      }

      // If citations exist
      if (msg.answerData?.citations && msg.answerData.citations.length > 0) {
        y -= 4;
        for (const c of msg.answerData.citations) {
          if (y < margin + 20) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          const safeCitation = this.sanitizePdfText(`Citation: ${c.formattedCitation} (Confidence: ${c.confidence}%)`);
          page.drawText(safeCitation, {
            x: margin + 10,
            y,
            size: 8.5,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.7)
          });
          y -= 12;
        }
      }

      y -= 12; // Gap between chat messages
    }

    const pdfBytes = await pdfDoc.save();
    const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer as any], { type: 'application/pdf' });
    const targetName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const file = new File([blob], targetName, { type: 'application/pdf' });

    const savedUri = await this.storageService.saveFile(file, 'multi-doc-qa', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  private sanitizePdfText(text: string): string {
    if (!text) return '';
    // StandardFonts.Helvetica in pdf-lib only encodes characters in the WinAnsi spectrum (\x20-\x7E, \xA0-\xFF)
    return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
  }

  private wrapPdfText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
    const cleanText = this.sanitizePdfText(text);
    const words = cleanText.replace(/\s+/g, ' ').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
