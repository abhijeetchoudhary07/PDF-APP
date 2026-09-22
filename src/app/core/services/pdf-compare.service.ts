import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import {
  CompareSummary,
  PageDiffResult,
  TextDiffToken,
  ComparisonMode
} from '../models/pdf-analysis.types';
import { PdfRenderService } from './pdf-render.service';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

@Injectable({
  providedIn: 'root'
})
export class PdfCompareService {
  private pdfRenderService: PdfRenderService;

  constructor(pdfRenderService?: PdfRenderService) {
    this.pdfRenderService = pdfRenderService ?? new PdfRenderService();
  }

  /**
   * Compares two PDF files and generates a complete comparison summary with page matching,
   * text difference analysis, and visual comparison capability.
   */
  async compareDocuments(
    originalFile: File | ArrayBuffer,
    modifiedFile: File | ArrayBuffer,
    onProgress?: (percent: number, message: string) => void
  ): Promise<CompareSummary> {
    onProgress?.(10, 'Loading documents...');

    const origBuffer = originalFile instanceof File ? await originalFile.arrayBuffer() : originalFile;
    const modBuffer = modifiedFile instanceof File ? await modifiedFile.arrayBuffer() : modifiedFile;

    const origDoc = await pdfjsLib.getDocument({ data: new Uint8Array(origBuffer.slice(0)) } as any).promise;
    const modDoc = await pdfjsLib.getDocument({ data: new Uint8Array(modBuffer.slice(0)) } as any).promise;

    const origPageCount = origDoc.numPages;
    const modPageCount = modDoc.numPages;

    onProgress?.(30, 'Extracting text from pages...');

    // Extract text per page
    const origPagesText: string[] = [];
    for (let i = 1; i <= origPageCount; i++) {
      const page = await origDoc.getPage(i);
      const text = await this.extractPageText(page);
      origPagesText.push(text);
    }

    const modPagesText: string[] = [];
    for (let i = 1; i <= modPageCount; i++) {
      const page = await modDoc.getPage(i);
      const text = await this.extractPageText(page);
      modPagesText.push(text);
    }

    onProgress?.(60, 'Aligning and matching pages...');

    // Perform page matching sequence alignment
    const matchedPairs = this.alignPages(origPagesText, modPagesText);

    onProgress?.(80, 'Analyzing text differences...');

    const pageResults: PageDiffResult[] = [];
    let totalAddedWords = 0;
    let totalRemovedWords = 0;
    let totalChangedWords = 0;
    let pagesIdentical = 0;
    let pagesChanged = 0;
    let pagesAdded = 0;
    let pagesRemoved = 0;

    for (const match of matchedPairs) {
      if (match.origIdx !== null && match.modIdx !== null) {
        const origText = origPagesText[match.origIdx];
        const modText = modPagesText[match.modIdx];
        const tokens = this.diffText(origText, modText);

        let added = 0;
        let removed = 0;
        let changed = 0;

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].type === 'added') added++;
          else if (tokens[i].type === 'removed') {
            if (i + 1 < tokens.length && tokens[i + 1].type === 'added') {
              changed++;
              i++; // count as changed pair
            } else {
              removed++;
            }
          }
        }

        const isIdentical = added === 0 && removed === 0 && changed === 0;
        if (isIdentical) {
          pagesIdentical++;
        } else {
          pagesChanged++;
        }

        totalAddedWords += added;
        totalRemovedWords += removed;
        totalChangedWords += changed;

        pageResults.push({
          originalPageNumber: match.origIdx + 1,
          modifiedPageNumber: match.modIdx + 1,
          status: isIdentical ? 'identical' : 'modified',
          similarityScore: match.similarity,
          addedCount: added,
          removedCount: removed,
          changedCount: changed,
          originalText: origText,
          modifiedText: modText,
          tokens
        });
      } else if (match.origIdx !== null && match.modIdx === null) {
        // Deleted page
        pagesRemoved++;
        const origText = origPagesText[match.origIdx];
        const tokens = this.tokenize(origText).map(t => ({
          type: 'removed' as const,
          value: t
        }));
        totalRemovedWords += tokens.length;

        pageResults.push({
          originalPageNumber: match.origIdx + 1,
          modifiedPageNumber: null,
          status: 'deleted',
          similarityScore: 0,
          addedCount: 0,
          removedCount: tokens.length,
          changedCount: 0,
          originalText: origText,
          modifiedText: '',
          tokens
        });
      } else if (match.origIdx === null && match.modIdx !== null) {
        // Inserted page
        pagesAdded++;
        const modText = modPagesText[match.modIdx];
        const tokens = this.tokenize(modText).map(t => ({
          type: 'added' as const,
          value: t
        }));
        totalAddedWords += tokens.length;

        pageResults.push({
          originalPageNumber: null,
          modifiedPageNumber: match.modIdx + 1,
          status: 'inserted',
          similarityScore: 0,
          addedCount: tokens.length,
          removedCount: 0,
          changedCount: 0,
          originalText: '',
          modifiedText: modText,
          tokens
        });
      }
    }

    onProgress?.(100, 'Comparison completed');

    return {
      pagesCompared: Math.max(origPageCount, modPageCount),
      pagesIdentical,
      pagesChanged,
      pagesAdded,
      pagesRemoved,
      totalAddedWords,
      totalRemovedWords,
      totalChangedWords,
      pageMatches: pageResults
    };
  }

  /**
   * Generates a side-by-side visual difference between two page canvases.
   */
  async generateVisualDiff(
    origCanvas: HTMLCanvasElement,
    modCanvas: HTMLCanvasElement
  ): Promise<string> {
    const width = Math.max(origCanvas.width, modCanvas.width);
    const height = Math.max(origCanvas.height, modCanvas.height);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d');
    if (!diffCtx) return '';

    // Draw modified canvas as base with slight tint
    diffCtx.fillStyle = '#FFFFFF';
    diffCtx.fillRect(0, 0, width, height);
    diffCtx.drawImage(modCanvas, 0, 0);

    const origCtx = origCanvas.getContext('2d');
    const modCtx = modCanvas.getContext('2d');
    if (!origCtx || !modCtx) return diffCanvas.toDataURL();

    const origData = origCtx.getImageData(0, 0, origCanvas.width, origCanvas.height);
    const modData = modCtx.getImageData(0, 0, modCanvas.width, modCanvas.height);
    const diffData = diffCtx.getImageData(0, 0, width, height);

    const dArr = diffData.data;
    const oArr = origData.data;
    const mArr = modData.data;

    const minW = Math.min(origCanvas.width, modCanvas.width);
    const minH = Math.min(origCanvas.height, modCanvas.height);

    for (let y = 0; y < minH; y++) {
      for (let x = 0; x < minW; x++) {
        const oIdx = (y * origCanvas.width + x) * 4;
        const mIdx = (y * modCanvas.width + x) * 4;
        const dIdx = (y * width + x) * 4;

        const rDiff = Math.abs(oArr[oIdx] - mArr[mIdx]);
        const gDiff = Math.abs(oArr[oIdx + 1] - mArr[mIdx + 1]);
        const bDiff = Math.abs(oArr[oIdx + 2] - mArr[mIdx + 2]);

        // If difference exceeds threshold, highlight in vivid magenta/crimson
        if (rDiff + gDiff + bDiff > 45) {
          dArr[dIdx] = 239;     // R
          dArr[dIdx + 1] = 68;  // G
          dArr[dIdx + 2] = 68;  // B
          dArr[dIdx + 3] = 220; // Alpha
        }
      }
    }

    diffCtx.putImageData(diffData, 0, 0);
    return diffCanvas.toDataURL('image/png');
  }

  /**
   * Reusable page alignment algorithm.
   * Handles: same page count, different page count, inserted pages, deleted pages.
   */
  alignPages(
    origPagesText: string[],
    modPagesText: string[]
  ): { origIdx: number | null; modIdx: number | null; similarity: number }[] {
    const N = origPagesText.length;
    const M = modPagesText.length;

    // Fast path: if identical page counts and similar text per index
    if (N === M) {
      let isOneToOne = true;
      const directMatches: { origIdx: number | null; modIdx: number | null; similarity: number }[] = [];
      for (let i = 0; i < N; i++) {
        const sim = this.calculateSimilarity(origPagesText[i], modPagesText[i]);
        if (sim < 0.2 && (origPagesText[i].trim() !== '' || modPagesText[i].trim() !== '')) {
          isOneToOne = false;
          break;
        }
        directMatches.push({ origIdx: i, modIdx: i, similarity: sim });
      }
      if (isOneToOne) {
        return directMatches;
      }
    }

    // Dynamic Programming Sequence Alignment (Needleman-Wunsch variation for pages)
    // DP table: dp[i][j] stores maximum alignment score
    const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(0));
    const GAP_PENALTY = -0.15;

    for (let i = 0; i <= N; i++) dp[i][0] = i * GAP_PENALTY;
    for (let j = 0; j <= M; j++) dp[0][j] = j * GAP_PENALTY;

    // Compute similarity matrix
    const simMatrix: number[][] = Array.from({ length: N }, (_, i) =>
      Array.from({ length: M }, (_, j) => this.calculateSimilarity(origPagesText[i], modPagesText[j]))
    );

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        const sim = simMatrix[i - 1][j - 1];
        const matchScore = sim >= 0.3 ? sim : -0.2;
        dp[i][j] = Math.max(
          dp[i - 1][j - 1] + matchScore,
          dp[i - 1][j] + GAP_PENALTY,
          dp[i][j - 1] + GAP_PENALTY
        );
      }
    }

    // Backtrack to find optimal alignment
    let i = N;
    let j = M;
    const reversedAlignment: { origIdx: number | null; modIdx: number | null; similarity: number }[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0) {
        const sim = simMatrix[i - 1][j - 1];
        const matchScore = sim >= 0.3 ? sim : -0.2;
        if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + matchScore)) < 1e-6) {
          reversedAlignment.push({ origIdx: i - 1, modIdx: j - 1, similarity: sim });
          i--;
          j--;
          continue;
        }
      }

      if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_PENALTY)) < 1e-6) {
        reversedAlignment.push({ origIdx: i - 1, modIdx: null, similarity: 0 });
        i--;
      } else {
        reversedAlignment.push({ origIdx: null, modIdx: j - 1, similarity: 0 });
        j--;
      }
    }

    return reversedAlignment.reverse();
  }

  /**
   * Word-level diff using Longest Common Subsequence (LCS).
   */
  diffText(origText: string, modText: string): TextDiffToken[] {
    const origTokens = this.tokenize(origText);
    const modTokens = this.tokenize(modText);

    const N = origTokens.length;
    const M = modTokens.length;

    // LCS table
    const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(0));

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        if (origTokens[i - 1] === modTokens[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack
    let i = N;
    let j = M;
    const result: TextDiffToken[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origTokens[i - 1] === modTokens[j - 1]) {
        result.push({
          type: 'unchanged',
          value: origTokens[i - 1],
          originalIndex: i - 1,
          modifiedIndex: j - 1
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.push({
          type: 'added',
          value: modTokens[j - 1],
          modifiedIndex: j - 1
        });
        j--;
      } else if (i > 0) {
        result.push({
          type: 'removed',
          value: origTokens[i - 1],
          originalIndex: i - 1
        });
        i--;
      }
    }

    return result.reverse();
  }

  /**
   * Tokenizes text into words and significant punctuation while preserving layout.
   */
  tokenize(text: string): string[] {
    if (!text) return [];
    // Split by whitespace but keep tokens
    return text.trim().split(/\s+/).filter(t => t.length > 0);
  }

  /**
   * Computes Jaccard word-similarity between two strings.
   */
  calculateSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(this.tokenize(text1.toLowerCase()));
    const tokens2 = new Set(this.tokenize(text2.toLowerCase()));

    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

    let intersection = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) intersection++;
    }

    const union = tokens1.size + tokens2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private async extractPageText(page: any): Promise<string> {
    try {
      const textContent = await page.getTextContent();
      return textContent.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .trim();
    } catch {
      return '';
    }
  }

  /**
   * Generates a downloadable text report.
   */
  generateTextReport(summary: CompareSummary, origName: string, modName: string): string {
    const lines: string[] = [
      '==================================================',
      'PDF COMPARISON REPORT',
      '==================================================',
      `Original File: ${origName}`,
      `Modified File: ${modName}`,
      `Generated: ${new Date().toLocaleString()}`,
      '--------------------------------------------------',
      'SUMMARY STATISTICS',
      '--------------------------------------------------',
      `Pages Compared:   ${summary.pagesCompared}`,
      `Pages Identical:  ${summary.pagesIdentical}`,
      `Pages Changed:    ${summary.pagesChanged}`,
      `Pages Added:      ${summary.pagesAdded}`,
      `Pages Removed:    ${summary.pagesRemoved}`,
      `Words Added:      +${summary.totalAddedWords}`,
      `Words Removed:    -${summary.totalRemovedWords}`,
      `Words Changed:    ~${summary.totalChangedWords}`,
      '--------------------------------------------------',
      'PAGE-BY-PAGE DETAILS',
      '--------------------------------------------------'
    ];

    for (const match of summary.pageMatches) {
      const origStr = match.originalPageNumber ? `Page ${match.originalPageNumber}` : '(None)';
      const modStr = match.modifiedPageNumber ? `Page ${match.modifiedPageNumber}` : '(None)';
      lines.push(
        `[${match.status.toUpperCase()}] Original ${origStr} -> Modified ${modStr} | ` +
        `Added: ${match.addedCount}, Removed: ${match.removedCount}, Changed: ${match.changedCount}`
      );
    }

    return lines.join('\n');
  }
}
