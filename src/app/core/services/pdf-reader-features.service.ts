import { Injectable } from '@angular/core';
import {
  ReaderTheme,
  ReaderScrollMode,
  ReaderPageSpread,
  ReaderPreferences,
  IncrementalSearchMatch,
  IncrementalSearchResult,
  ReaderOutlineItem,
  ReflowBlock,
  ReadAloudSentence,
  ScrubWindow,
  LastReadPosition
} from '../models/reader-features.types';
import { Rect } from '../models/pdf-editor.types';

const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: 'normal',
  scrollMode: 'paged',
  pageSpread: 'single',
  fontSize: 16,
  reflowMode: false
};

@Injectable({
  providedIn: 'root'
})
export class PdfReaderFeaturesService {
  private readonly PREF_KEY_PREFIX = 'pdf_reader_pref_';
  private readonly LAST_READ_PREFIX = 'pdf_last_read_';

  // --- L2: Reading Modes & Preference Persistence ---

  getPreferences(docId: string): ReaderPreferences {
    if (!docId) return { ...DEFAULT_PREFERENCES };
    try {
      const stored = localStorage.getItem(`${this.PREF_KEY_PREFIX}${docId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          theme: parsed.theme || DEFAULT_PREFERENCES.theme,
          scrollMode: parsed.scrollMode || DEFAULT_PREFERENCES.scrollMode,
          pageSpread: parsed.pageSpread || DEFAULT_PREFERENCES.pageSpread,
          fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_PREFERENCES.fontSize,
          reflowMode: !!parsed.reflowMode
        };
      }
    } catch {
      // Fallback on storage errors
    }
    return { ...DEFAULT_PREFERENCES };
  }

  savePreferences(docId: string, prefs: Partial<ReaderPreferences>): ReaderPreferences {
    const current = this.getPreferences(docId);
    const updated: ReaderPreferences = { ...current, ...prefs };
    if (docId) {
      try {
        localStorage.setItem(`${this.PREF_KEY_PREFIX}${docId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not persist reader preferences', e);
      }
    }
    return updated;
  }

  // --- L4: Last-Read Position ---

  getLastReadPosition(docId: string): LastReadPosition | null {
    if (!docId) return null;
    try {
      const raw = localStorage.getItem(`${this.LAST_READ_PREFIX}${docId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.pageNumber === 'number' && parsed.pageNumber > 0) {
          return { pageNumber: parsed.pageNumber, timestamp: parsed.timestamp || Date.now() };
        }
      }
    } catch {}
    return null;
  }

  saveLastReadPosition(docId: string, pageNumber: number): void {
    if (!docId || pageNumber < 1) return;
    try {
      const pos: LastReadPosition = { pageNumber, timestamp: Date.now() };
      localStorage.setItem(`${this.LAST_READ_PREFIX}${docId}`, JSON.stringify(pos));
    } catch (e) {
      console.warn('Could not save last read position', e);
    }
  }

  clearLastReadPosition(docId: string): void {
    if (!docId) return;
    try {
      localStorage.removeItem(`${this.LAST_READ_PREFIX}${docId}`);
    } catch {}
  }

  // --- L1: Incremental Text Search with Highlighting ---

  async searchDocumentIncremental(
    pdfDoc: any,
    query: string,
    onPageProgress?: (result: IncrementalSearchResult) => void
  ): Promise<IncrementalSearchResult> {
    const totalPages = pdfDoc ? (pdfDoc.numPages || 1) : 0;
    const result: IncrementalSearchResult = {
      query: query || '',
      totalMatches: 0,
      matchesByPage: new Map(),
      matches: [],
      isComplete: false,
      searchedPages: 0,
      totalPages
    };

    if (!pdfDoc || !query || query.trim().length === 0) {
      result.isComplete = true;
      return result;
    }

    const normalizedQuery = query.toLowerCase().trim();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        let fullText = '';
        const itemRanges: { start: number; end: number; item: any }[] = [];

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string') {
            const start = fullText.length;
            fullText += item.str + ' ';
            itemRanges.push({ start, end: fullText.length - 1, item });
          }
        }

        const lowerFull = fullText.toLowerCase();
        let searchIndex = 0;
        let matchIndexOnPage = 0;
        const pageMatches: IncrementalSearchMatch[] = [];

        while ((searchIndex = lowerFull.indexOf(normalizedQuery, searchIndex)) !== -1) {
          // Bounding rectangle from transform
          const matchedItemRange = itemRanges.find(
            r => searchIndex >= r.start && searchIndex <= r.end
          );

          let bounds: Rect | undefined;
          if (matchedItemRange && matchedItemRange.item.transform) {
            const t = matchedItemRange.item.transform;
            const x = t[4];
            const y = viewport.height - t[5] - (matchedItemRange.item.height || 12);
            const width = matchedItemRange.item.width || 50;
            const height = matchedItemRange.item.height || 14;
            bounds = { x, y, width, height };
          }

          // Surrounding context snippets (30 chars before, match, 30 chars after)
          const startContext = Math.max(0, searchIndex - 30);
          const endContext = Math.min(fullText.length, searchIndex + normalizedQuery.length + 30);
          const prefix = fullText.substring(startContext, searchIndex).trimStart();
          const matchText = fullText.substring(searchIndex, searchIndex + normalizedQuery.length);
          const suffix = fullText.substring(searchIndex + normalizedQuery.length, endContext).trimEnd();

          const match: IncrementalSearchMatch = {
            id: `m_${pageNum}_${matchIndexOnPage}`,
            pageNumber: pageNum,
            matchIndex: result.totalMatches,
            text: matchText,
            snippetPrefix: (startContext > 0 ? '… ' : '') + prefix,
            snippetMatch: matchText,
            snippetSuffix: suffix + (endContext < fullText.length ? ' …' : ''),
            bounds
          };

          pageMatches.push(match);
          result.matches.push(match);
          result.totalMatches++;
          matchIndexOnPage++;
          searchIndex += normalizedQuery.length;
        }

        if (pageMatches.length > 0) {
          result.matchesByPage.set(pageNum, pageMatches);
        }
      } catch (err) {
        console.warn(`Error searching page ${pageNum}`, err);
      }

      result.searchedPages = pageNum;
      if (onPageProgress) {
        onPageProgress({ ...result, matches: [...result.matches] });
      }
    }

    result.isComplete = true;
    return result;
  }

  getScaledMatchBounds(bounds: Rect, scale: number): Rect {
    return {
      x: Math.round(bounds.x * scale),
      y: Math.round(bounds.y * scale),
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale)
    };
  }

  // --- L3: Text Reflow for Narrow Screens ---

  async extractReflowBlocks(pdfDoc: any, pageNumber: number): Promise<ReflowBlock[]> {
    if (!pdfDoc) return [];
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items || [];

      if (items.length === 0) return [];

      const itemsWithPos = items
        .filter(i => 'str' in i && typeof i.str === 'string' && i.str.trim().length > 0)
        .map(i => ({
          item: i,
          x: i.transform ? i.transform[4] : 0,
          y: i.transform ? i.transform[5] : 0,
          w: i.width || 50,
          h: i.height || 12,
          size: Math.round(i.transform ? Math.abs(i.transform[0]) : 12),
          text: i.str.trim()
        }));

      if (itemsWithPos.length === 0) return [];

      // Calculate typical body font size (lower percentile of font sizes)
      const fontSizes = itemsWithPos.map(i => i.size).sort((a, b) => a - b);
      const minFontSize = fontSizes[0] || 12;
      const bodyFontSize = fontSizes[Math.floor(fontSizes.length * 0.25)] || minFontSize;

      const minX = Math.min(...itemsWithPos.map(i => i.x));
      const maxX = Math.max(...itemsWithPos.map(i => i.x + i.w));
      const width = maxX - minX;
      const midX = minX + width / 2;

      // Detect two-column layout: items split on left and right of midX
      const leftCol = itemsWithPos.filter(i => (i.x + i.w) <= midX + width * 0.05);
      const rightCol = itemsWithPos.filter(i => i.x >= midX - width * 0.05);

      const isTwoColumn = leftCol.length >= 2 && rightCol.length >= 2 &&
        (leftCol.length + rightCol.length) >= itemsWithPos.length * 0.75;

      let orderedItems: typeof itemsWithPos = [];
      if (isTwoColumn) {
        // In PDF coordinates Y increases upwards, so descending Y is top-to-bottom
        const sortedLeft = [...leftCol].sort((a, b) => b.y - a.y);
        const sortedRight = [...rightCol].sort((a, b) => b.y - a.y);
        const topColY = Math.max(
          Math.max(...sortedLeft.map(i => i.y)),
          Math.max(...sortedRight.map(i => i.y))
        );
        const headers = itemsWithPos
          .filter(i => !leftCol.includes(i) && !rightCol.includes(i) && i.y > topColY)
          .sort((a, b) => b.y - a.y);
        const footers = itemsWithPos
          .filter(i => !leftCol.includes(i) && !rightCol.includes(i) && i.y <= topColY)
          .sort((a, b) => b.y - a.y);

        orderedItems = [...headers, ...sortedLeft, ...sortedRight, ...footers];
      } else {
        // Single column: top to bottom, then left to right
        orderedItems = [...itemsWithPos].sort((a, b) => {
          const diffY = b.y - a.y;
          if (Math.abs(diffY) > 8) {
            return diffY;
          }
          return a.x - b.x;
        });
      }

      const blocks: ReflowBlock[] = [];
      let currentParagraph = '';
      let lastY = 0;

      for (let i = 0; i < orderedItems.length; i++) {
        const item = orderedItems[i];
        const text = item.text;
        const currentY = item.y;
        const itemSize = item.size;
        const isItemHeading = itemSize >= bodyFontSize * 1.25;

        if (isItemHeading) {
          if (currentParagraph.trim()) {
            blocks.push({
              id: `reflow_${pageNumber}_${blocks.length}`,
              type: 'paragraph',
              text: currentParagraph.trim(),
              pageNumber,
              fontSize: 16
            });
            currentParagraph = '';
          }
          blocks.push({
            id: `reflow_${pageNumber}_${blocks.length}`,
            type: 'heading',
            text: text.trim(),
            pageNumber,
            fontSize: 20
          });
          lastY = currentY;
          continue;
        }

        const yGap = Math.abs(lastY - currentY);
        if (lastY !== 0 && yGap > 18) {
          if (currentParagraph.trim()) {
            blocks.push({
              id: `reflow_${pageNumber}_${blocks.length}`,
              type: 'paragraph',
              text: currentParagraph.trim(),
              pageNumber,
              fontSize: 16
            });
            currentParagraph = '';
          }
        }

        currentParagraph += (currentParagraph ? ' ' : '') + text;
        lastY = currentY;
      }

      if (currentParagraph.trim()) {
        blocks.push({
          id: `reflow_${pageNumber}_${blocks.length}`,
          type: 'paragraph',
          text: currentParagraph.trim(),
          pageNumber,
          fontSize: 16
        });
      }

      return blocks;
    } catch (e) {
      console.warn(`Could not extract reflow text for page ${pageNumber}`, e);
      return [];
    }
  }

  // --- L4: Document Outline / Bookmarks Sidebar ---

  async extractOutline(pdfDoc: any): Promise<ReaderOutlineItem[]> {
    if (!pdfDoc || typeof pdfDoc.getOutline !== 'function') {
      return [];
    }

    try {
      const outline = await pdfDoc.getOutline();
      if (!outline || outline.length === 0) {
        return [];
      }

      const mapNode = async (node: any): Promise<ReaderOutlineItem> => {
        let pageNum = 1;
        if (node.dest) {
          try {
            if (typeof node.dest === 'string') {
              const destObj = await pdfDoc.getDestination(node.dest);
              if (destObj && destObj.length > 0) {
                const ref = destObj[0];
                const pageIndex = await pdfDoc.getPageIndex(ref);
                pageNum = pageIndex + 1;
              }
            } else if (Array.isArray(node.dest) && node.dest.length > 0) {
              const ref = node.dest[0];
              const pageIndex = await pdfDoc.getPageIndex(ref);
              pageNum = pageIndex + 1;
            }
          } catch {}
        }

        const childItems: ReaderOutlineItem[] = [];
        if (node.items && node.items.length > 0) {
          for (const child of node.items) {
            childItems.push(await mapNode(child));
          }
        }

        return {
          title: node.title || 'Untitled Section',
          pageNumber: pageNum,
          dest: node.dest,
          items: childItems.length > 0 ? childItems : undefined,
          expanded: false
        };
      };

      const result: ReaderOutlineItem[] = [];
      for (const item of outline) {
        result.push(await mapNode(item));
      }
      return result;
    } catch (e) {
      console.warn('Could not extract PDF outline', e);
      return [];
    }
  }

  // --- L5: Read-Aloud Sentence Segmentation ---

  segmentSentences(text: string, pageNumber: number): ReadAloudSentence[] {
    if (!text || text.trim().length === 0) return [];

    const cleaned = text.replace(/\s+/g, ' ').trim();
    const sentences: ReadAloudSentence[] = [];

    // Use Intl.Segmenter if available, fallback to sentence delimiter regex
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' });
      const segments = segmenter.segment(cleaned);
      let idx = 0;
      for (const seg of segments) {
        const sentenceText = seg.segment.trim();
        if (sentenceText) {
          sentences.push({
            index: idx++,
            text: sentenceText,
            pageNumber,
            startIndex: seg.index,
            endIndex: seg.index + seg.segment.length
          });
        }
      }
    } else {
      // Regex fallback
      const matches = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [cleaned];
      let offset = 0;
      matches.forEach((s, idx) => {
        const trimmed = s.trim();
        if (trimmed) {
          sentences.push({
            index: idx,
            text: trimmed,
            pageNumber,
            startIndex: offset,
            endIndex: offset + s.length
          });
        }
        offset += s.length;
      });
    }

    return sentences;
  }

  isSpeechSynthesisAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  // --- L6: Thumbnail Scrubbing Window ---

  calculateScrubWindow(activePage: number, totalPages: number, radius: number = 2): ScrubWindow {
    const validTotal = Math.max(1, totalPages);
    const validActive = Math.max(1, Math.min(validTotal, activePage));
    const windowStart = Math.max(1, validActive - radius);
    const windowEnd = Math.min(validTotal, validActive + radius);

    const pagesToPreload: number[] = [];
    for (let p = windowStart; p <= windowEnd; p++) {
      pagesToPreload.push(p);
    }

    return {
      pageCount: validTotal,
      windowStart,
      windowEnd,
      activePage: validActive,
      pagesToPreload
    };
  }
}
