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
  LastReadPosition,
  ReaderSpread,
  LazyPageWindow,
  ReflowImage,
  ReaderOutlineRow
} from '../models/reader-features.types';
import { Rect } from '../models/pdf-editor.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: 'normal',
  scrollMode: 'paged',
  pageSpread: 'single',
  fontSize: 16,
  reflowMode: false
};

/**
 * One pdf.js text item, flattened: where its characters sit in the page's
 * concatenated text, and where it sits on the page in CSS space at scale 1.
 */
interface TextSpan {
  /** Index of the item's first character in the page's flattened text. */
  start: number;
  /** One past its last character -- not counting the separator space. */
  end: number;
  length: number;
  x: number;
  /** Distance from the page's top edge, already flipped out of PDF space. */
  top: number;
  width: number;
  height: number;
}

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

  /**
   * Scans the document for `query`, page by page, reporting as it goes.
   *
   * `signal` is optional and defaults to undefined, which reproduces the
   * original uncancellable behaviour exactly. Pass one and a superseded search
   * stops at the next page boundary instead of racing the new one into the
   * same result object -- typing in the search box used to leave two scans
   * interleaving their hits.
   *
   * The scan yields to the event loop after every page, so a 500-page
   * document stays scrollable while it runs and the partial counts shown to
   * the reader actually paint.
   */
  async searchDocumentIncremental(
    pdfDoc: any,
    query: string,
    onPageProgress?: (result: IncrementalSearchResult) => void,
    signal?: AbortSignal
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
      if (signal?.aborted) {
        // Not complete: the caller asked us to stop, and saying otherwise
        // would have the UI report "no matches" for a scan that never ran.
        return result;
      }

      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        const spans = this.buildTextSpans(textContent.items || [], viewport.height);
        const lowerFull = spans.text.toLowerCase();

        let searchIndex = 0;
        let matchIndexOnPage = 0;
        const pageMatches: IncrementalSearchMatch[] = [];

        while ((searchIndex = lowerFull.indexOf(normalizedQuery, searchIndex)) !== -1) {
          const rects = this.rectsForRange(
            spans,
            searchIndex,
            searchIndex + normalizedQuery.length
          );

          // Surrounding context snippets (30 chars before, match, 30 chars after)
          const startContext = Math.max(0, searchIndex - 30);
          const endContext = Math.min(
            spans.text.length,
            searchIndex + normalizedQuery.length + 30
          );
          const prefix = spans.text.substring(startContext, searchIndex).trimStart();
          const matchText = spans.text.substring(
            searchIndex,
            searchIndex + normalizedQuery.length
          );
          const suffix = spans.text
            .substring(searchIndex + normalizedQuery.length, endContext)
            .trimEnd();

          const match: IncrementalSearchMatch = {
            id: `m_${pageNum}_${matchIndexOnPage}`,
            pageNumber: pageNum,
            matchIndex: result.totalMatches,
            text: matchText,
            snippetPrefix: (startContext > 0 ? '… ' : '') + prefix,
            snippetMatch: matchText,
            snippetSuffix: suffix + (endContext < spans.text.length ? ' …' : ''),
            bounds: rects[0],
            rects
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

      // Hand the frame back so the partial count paints and scrolling stays
      // smooth. Skipped on the last page: nothing is waiting on it.
      if (pageNum < totalPages) {
        await new Promise(res => setTimeout(res, 0));
      }
    }

    result.isComplete = true;
    return result;
  }

  /**
   * Flattens a page's text items into one string plus the geometry of each
   * item's slice of it.
   *
   * A space is appended after every item, exactly as the previous
   * implementation did, so a query spanning two items still matches. The
   * span's `end` is the end of the item's own characters, not of that space,
   * which is what makes a character-accurate rectangle possible.
   *
   * `top` is already flipped into CSS space (y down from the page's top edge)
   * at scale 1, so a caller only has to multiply by its zoom.
   */
  private buildTextSpans(
    items: any[],
    viewportHeight: number
  ): { text: string; spans: TextSpan[] } {
    let text = '';
    const spans: TextSpan[] = [];

    for (const item of items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;

      const str = item.str;
      const start = text.length;
      text += str + ' ';

      if (str.length === 0) continue;

      const transform = item.transform;
      const x = transform ? transform[4] : 0;
      const baseline = transform ? transform[5] : 0;
      /*
       * pdf.js reports height 0 for some items. The vertical scale of the
       * text matrix is the glyph size, so fall back to that before the
       * arbitrary 12 the old code used.
       */
      const fallbackHeight = transform ? Math.abs(transform[3] || transform[0] || 12) : 12;
      const height = item.height && item.height > 0 ? item.height : fallbackHeight;

      spans.push({
        start,
        end: start + str.length,
        length: str.length,
        x,
        top: viewportHeight - baseline - height,
        width: item.width && item.width > 0 ? item.width : 0,
        height
      });
    }

    return { text, spans };
  }

  /**
   * Rectangles covering characters `[from, to)` of a page's flattened text.
   *
   * One rectangle per text item the range touches, each narrowed to the
   * characters actually matched. The old code took the whole item's box for
   * the first item only, so searching "the" inside a full line of prose lit
   * up the entire line, and a hit split across two items lost half its
   * geometry.
   *
   * Characters are assumed evenly spaced within an item. That is not true of
   * proportional type, but it is the only information pdf.js gives at this
   * level, and it keeps the box inside the right word.
   */
  private rectsForRange(
    built: { text: string; spans: TextSpan[] },
    from: number,
    to: number
  ): Rect[] {
    const rects: Rect[] = [];
    const spans = built.spans;
    if (spans.length === 0) return rects;

    // Spans are in ascending `start` order, so the first candidate is found
    // by binary search rather than a scan from the top for every hit.
    let lo = 0;
    let hi = spans.length - 1;
    let first = spans.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid].end > from) {
        first = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    for (let i = first; i < spans.length; i++) {
      const span = spans[i];
      if (span.start >= to) break;

      const overlapStart = Math.max(from, span.start);
      const overlapEnd = Math.min(to, span.end);
      if (overlapEnd <= overlapStart) continue;

      const fracStart = (overlapStart - span.start) / span.length;
      const fracEnd = (overlapEnd - span.start) / span.length;

      const width = span.width > 0
        ? span.width * (fracEnd - fracStart)
        : span.height * 0.55 * (overlapEnd - overlapStart);

      rects.push({
        x: span.x + (span.width > 0 ? span.width * fracStart : 0),
        y: span.top,
        width,
        height: span.height
      });
    }

    return rects;
  }

  getScaledMatchBounds(bounds: Rect, scale: number): Rect {
    return {
      x: Math.round(bounds.x * scale),
      y: Math.round(bounds.y * scale),
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale)
    };
  }

  /** L1 — every rectangle of a hit, scaled to the reader's current zoom. */
  getScaledMatchRects(match: IncrementalSearchMatch, scale: number): Rect[] {
    const source = match.rects && match.rects.length > 0
      ? match.rects
      : (match.bounds ? [match.bounds] : []);
    return source.map(r => this.getScaledMatchBounds(r, scale));
  }

  // --- L3: Text Reflow for Narrow Screens ---

  /**
   * The page's text as reading-order blocks. Signature and return shape are
   * unchanged; the positions needed to interleave images are produced by
   * `buildReflowBlocks` and dropped here.
   */
  async extractReflowBlocks(pdfDoc: any, pageNumber: number): Promise<ReflowBlock[]> {
    const built = await this.buildReflowBlocks(pdfDoc, pageNumber);
    return built.blocks;
  }

  /**
   * Reading-order text blocks plus each block's top edge in CSS space.
   *
   * The tops are what let `extractReflowContent` place images between
   * paragraphs instead of dumping them all at the end. They are returned
   * rather than stashed on the service so two pages reflowing at once cannot
   * read each other's positions.
   */
  private async buildReflowBlocks(
    pdfDoc: any,
    pageNumber: number
  ): Promise<{ blocks: ReflowBlock[]; tops: number[] }> {
    const empty = { blocks: [] as ReflowBlock[], tops: [] as number[] };
    if (!pdfDoc) return empty;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items || [];

      if (items.length === 0) return empty;

      /*
       * Page height is needed to turn PDF y (up from the bottom) into the CSS
       * top (down from the top) that image positions are also expressed in.
       * A fixture page without a viewport falls back to A4.
       */
      let pageHeight = 842;
      try {
        pageHeight = page.getViewport({ scale: 1.0 }).height || 842;
      } catch {
        // Keep the fallback.
      }

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

      if (itemsWithPos.length === 0) return empty;

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
      const tops: number[] = [];
      let currentParagraph = '';
      let paragraphTopY = 0;
      let lastY = 0;

      const cssTop = (pdfY: number, h: number) => pageHeight - (pdfY + h);

      const flushParagraph = () => {
        if (!currentParagraph.trim()) return;
        blocks.push({
          id: `reflow_${pageNumber}_${blocks.length}`,
          type: 'paragraph',
          text: currentParagraph.trim(),
          pageNumber,
          fontSize: 16
        });
        tops.push(paragraphTopY);
        currentParagraph = '';
      };

      for (let i = 0; i < orderedItems.length; i++) {
        const item = orderedItems[i];
        const text = item.text;
        const currentY = item.y;
        const itemSize = item.size;
        const isItemHeading = itemSize >= bodyFontSize * 1.25;

        if (isItemHeading) {
          flushParagraph();
          blocks.push({
            id: `reflow_${pageNumber}_${blocks.length}`,
            type: 'heading',
            text: text.trim(),
            pageNumber,
            fontSize: 20
          });
          tops.push(cssTop(currentY, item.h));
          lastY = currentY;
          continue;
        }

        const yGap = Math.abs(lastY - currentY);
        if (lastY !== 0 && yGap > 18) {
          flushParagraph();
        }

        if (!currentParagraph) {
          paragraphTopY = cssTop(currentY, item.h);
        }
        currentParagraph += (currentParagraph ? ' ' : '') + text;
        lastY = currentY;
      }

      flushParagraph();

      return { blocks, tops };
    } catch (e) {
      console.warn(`Could not extract reflow text for page ${pageNumber}`, e);
      return empty;
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
          /*
           * Left empty rather than defaulted to an English literal: this
           * string is rendered, and the sidebar supplies the fallback
           * through the translate pipe so it is not English in a Hindi UI.
           */
          title: node.title || '',
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

  /**
   * L4 — the outline tree as a flat list of visible rows.
   *
   * `expandedKeys` holds the paths the reader has opened; a node's children
   * are included only when its own path is in that set, so the list is
   * exactly what should be on screen. Depth is carried on the row for
   * indentation, which is what lets a nested outline render at any depth
   * from one flat `@for`.
   */
  flattenOutline(
    items: ReaderOutlineItem[],
    expandedKeys: Set<string>,
    depth: number = 0,
    prefix: string = ''
  ): ReaderOutlineRow[] {
    const rows: ReaderOutlineRow[] = [];
    if (!items || items.length === 0) return rows;

    items.forEach((item, index) => {
      const key = prefix ? `${prefix}.${index}` : `${index}`;
      const children = item.items || [];
      const hasChildren = children.length > 0;
      const expanded = hasChildren && expandedKeys.has(key);

      rows.push({
        key,
        title: item.title || '',
        pageNumber: item.pageNumber,
        depth,
        hasChildren,
        expanded
      });

      if (expanded) {
        rows.push(...this.flattenOutline(children, expandedKeys, depth + 1, key));
      }
    });

    return rows;
  }

  /**
   * L4 — every expandable path in the outline, for an "expand all" default.
   *
   * A two-level outline is more useful open than closed; a deep one is not,
   * so the reader only pre-expands down to `maxDepth`.
   */
  collectExpandableKeys(
    items: ReaderOutlineItem[],
    maxDepth: number = 1,
    depth: number = 0,
    prefix: string = ''
  ): string[] {
    const keys: string[] = [];
    if (!items || depth > maxDepth) return keys;

    items.forEach((item, index) => {
      const key = prefix ? `${prefix}.${index}` : `${index}`;
      const children = item.items || [];
      if (children.length > 0) {
        keys.push(key);
        keys.push(...this.collectExpandableKeys(children, maxDepth, depth + 1, key));
      }
    });

    return keys;
  }

  /** L4 — the outline entry covering `pageNumber`, for the current-section mark. */
  findOutlineRowForPage(rows: ReaderOutlineRow[], pageNumber: number): ReaderOutlineRow | null {
    let best: ReaderOutlineRow | null = null;
    for (const row of rows) {
      if (row.pageNumber <= pageNumber && (!best || row.pageNumber >= best.pageNumber)) {
        best = row;
      }
    }
    return best;
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


  // --- L3: Inline images in reading order ---

  /**
   * Pulls the images a page paints, with the device-space position needed to
   * drop each one into the reading order.
   *
   * The operator list is the only place pdf.js exposes an image's placement,
   * so the current transform matrix has to be tracked through it by hand:
   * `transform` multiplies into the CTM, `save`/`restore` push and pop it.
   * The image XObject itself is drawn into a unit square, so the CTM's scale
   * terms *are* its on-page width and height.
   *
   * Returns [] on anything unexpected -- a page whose images cannot be read
   * still reflows its text, which is the point of the view.
   */
  async extractReflowImages(
    pdfDoc: any,
    pageNumber: number,
    maxImages: number = 12
  ): Promise<ReflowImage[]> {
    if (!pdfDoc) return [];

    try {
      const page = await pdfDoc.getPage(pageNumber);
      if (typeof page.getOperatorList !== 'function') return [];

      const ops = await page.getOperatorList();
      const fnArray: number[] = ops?.fnArray || [];
      const argsArray: any[] = ops?.argsArray || [];
      if (fnArray.length === 0) return [];

      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height;

      /*
       * pdf.js only exports its OPS table when the full library is loaded;
       * the numeric literals are the stable wire values and are what the
       * repo's other operator-list walkers already fall back to.
       */
      const OP_SAVE = 10;
      const OP_RESTORE = 11;
      const OP_TRANSFORM = 12;
      const OP_PAINT_IMAGE = 85;
      const OP_PAINT_INLINE_IMAGE = 86;

      // Identity CTM: [a, b, c, d, e, f].
      let ctm: number[] = [1, 0, 0, 1, 0, 0];
      const stack: number[][] = [];
      const found: ReflowImage[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < fnArray.length && found.length < maxImages; i++) {
        const fn = fnArray[i];

        if (fn === OP_SAVE) {
          stack.push([...ctm]);
          continue;
        }
        if (fn === OP_RESTORE) {
          ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
          continue;
        }
        if (fn === OP_TRANSFORM) {
          const m = argsArray[i];
          if (Array.isArray(m) && m.length >= 6) {
            ctm = this.multiplyMatrix(m, ctm);
          }
          continue;
        }
        if (fn !== OP_PAINT_IMAGE && fn !== OP_PAINT_INLINE_IMAGE) {
          continue;
        }

        const args = argsArray[i];
        const name = fn === OP_PAINT_IMAGE
          ? (Array.isArray(args) ? args[0] : null)
          : `inline_${i}`;
        if (!name || seen.has(name)) continue;
        seen.add(name);

        const imgObj = fn === OP_PAINT_INLINE_IMAGE
          ? (Array.isArray(args) ? args[0] : null)
          : await this.resolveImageObject(page, name);
        if (!imgObj) continue;

        // The unit square maps to |a| x |d| user-space units under the CTM.
        const onPageWidth = Math.abs(ctm[0]) || imgObj.width || 0;
        const onPageHeight = Math.abs(ctm[3]) || imgObj.height || 0;

        // A decorative hairline or a 1px spacer is noise in a reading view.
        if (onPageWidth < 24 || onPageHeight < 24) continue;

        const dataUrl = this.imageObjectToDataUrl(imgObj);
        if (!dataUrl) continue;

        found.push({
          dataUrl,
          // ctm[5] is the bottom edge in PDF space; flip to a CSS top.
          top: pageHeight - (ctm[5] + onPageHeight),
          width: onPageWidth,
          height: onPageHeight
        });
      }

      return found.sort((a, b) => a.top - b.top);
    } catch (e) {
      console.warn(`Could not extract reflow images for page ${pageNumber}`, e);
      return [];
    }
  }

  /** Matrix product `a * b`, both in pdf.js's [a,b,c,d,e,f] order. */
  private multiplyMatrix(a: number[], b: number[]): number[] {
    return [
      a[0] * b[0] + a[1] * b[2],
      a[0] * b[1] + a[1] * b[3],
      a[2] * b[0] + a[3] * b[2],
      a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4],
      a[4] * b[1] + a[5] * b[3] + b[5]
    ];
  }

  /**
   * An image XObject by name. `objs.get` is callback-style when the object is
   * not resolved yet, which is why this is not a plain lookup.
   */
  private async resolveImageObject(page: any, name: string): Promise<any> {
    const objs = page.objs;
    const commonObjs = page.commonObjs;

    try {
      if (objs?.has?.(name)) return objs.get(name);
      if (commonObjs?.has?.(name)) return commonObjs.get(name);
      if (!objs?.get) return null;

      return await new Promise<any>(resolve => {
        // A name that never resolves would hang the reflow view.
        const timer = setTimeout(() => resolve(null), 2000);
        try {
          objs.get(name, (obj: any) => {
            clearTimeout(timer);
            resolve(obj);
          });
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  /**
   * Paints a pdf.js image object onto a canvas and returns it as a data URL.
   *
   * Mirrors the channel handling PdfExtractorService already does for its
   * image export -- RGB, RGBA and single-channel greyscale all turn up.
   */
  private imageObjectToDataUrl(imgObj: any): string | null {
    try {
      const width = imgObj.width || imgObj.bitmap?.width || 0;
      const height = imgObj.height || imgObj.bitmap?.height || 0;
      if (width <= 0 || height <= 0) return null;

      /*
       * Through createSafeCanvas, like the rest of the repo's image paths:
       * a raw getContext('2d') throws outside a real browser, which would
       * make every figure silently vanish in a headless run.
       */
      const canvas = createSafeCanvas(width, height);
      const ctx = getSafeContext(canvas);
      if (!ctx) return null;

      if (imgObj.bitmap) {
        ctx.drawImage(imgObj.bitmap, 0, 0);
      } else if (typeof ImageBitmap !== 'undefined' && imgObj instanceof ImageBitmap) {
        ctx.drawImage(imgObj as any, 0, 0);
      } else if (imgObj.data) {
        const imgData = ctx.createImageData(width, height);
        const src = imgObj.data;

        if (src.length === width * height * 4) {
          imgData.data.set(src);
        } else if (src.length === width * height * 3) {
          let s = 0;
          let d = 0;
          while (s < src.length) {
            imgData.data[d] = src[s];
            imgData.data[d + 1] = src[s + 1];
            imgData.data[d + 2] = src[s + 2];
            imgData.data[d + 3] = 255;
            s += 3;
            d += 4;
          }
        } else {
          let d = 0;
          for (let i = 0; i < src.length && d < imgData.data.length; i++) {
            const v = src[i];
            imgData.data[d] = v;
            imgData.data[d + 1] = v;
            imgData.data[d + 2] = v;
            imgData.data[d + 3] = 255;
            d += 4;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } else {
        return null;
      }

      return canvas.toDataURL('image/jpeg', 0.75);
    } catch {
      return null;
    }
  }

  /**
   * L3 — the page as a single reading column: text blocks in reading order
   * with the page's images interleaved at the right vertical position.
   *
   * Text blocks carry no `top` of their own once built, so images are placed
   * against the ordered text by comparing the image's top edge with the top
   * edge of each text run. Where images cannot be read the result is exactly
   * `extractReflowBlocks`, unchanged.
   */
  async extractReflowContent(
    pdfDoc: any,
    pageNumber: number,
    includeImages: boolean = true
  ): Promise<ReflowBlock[]> {
    const built = await this.buildReflowBlocks(pdfDoc, pageNumber);
    if (!includeImages) return built.blocks;

    const images = await this.extractReflowImages(pdfDoc, pageNumber);
    if (images.length === 0) return built.blocks;

    return this.interleaveImages(built.blocks, built.tops, images, pageNumber);
  }

  /**
   * Drops each image into the text stream at its vertical position.
   *
   * `buildReflowBlocks` returns blocks in reading order, and
   * `blockTops[i]` is the top edge of block i, so an image whose top sits
   * above block i's top belongs before it. Images past the last block land at
   * the end.
   */
  private interleaveImages(
    textBlocks: ReflowBlock[],
    blockTops: number[],
    images: ReflowImage[],
    pageNumber: number
  ): ReflowBlock[] {
    const out: ReflowBlock[] = [];
    let imgIdx = 0;

    const pushImage = (img: ReflowImage) => {
      out.push({
        id: `reflow_img_${pageNumber}_${out.length}`,
        type: 'image',
        imageUrl: img.dataUrl,
        pageNumber,
        imageWidth: Math.round(img.width),
        imageHeight: Math.round(img.height)
      });
    };

    for (let i = 0; i < textBlocks.length; i++) {
      const blockTop = blockTops[i];
      if (typeof blockTop === 'number') {
        while (imgIdx < images.length && images[imgIdx].top <= blockTop) {
          pushImage(images[imgIdx++]);
        }
      }
      out.push(textBlocks[i]);
    }

    while (imgIdx < images.length) {
      pushImage(images[imgIdx++]);
    }

    return out;
  }

  // --- L2: Page spread & continuous-scroll windows ---

  /**
   * L2 — the pages a spread shows, left to right.
   *
   * Spreads are paired from page 1 (1|2, 3|4, ...) so the pairing never
   * shifts as you page through. `isPartial` marks the lone page a document
   * with an odd page count ends on, which the view uses to centre it rather
   * than leave a gap where its partner would be.
   */
  getSpread(
    currentPage: number,
    totalPages: number,
    mode: ReaderPageSpread
  ): ReaderSpread {
    const total = Math.max(1, totalPages);
    const page = Math.max(1, Math.min(total, currentPage));

    if (mode !== 'two-page' || total === 1) {
      return { pages: [page], isPartial: false };
    }

    const left = page % 2 === 1 ? page : page - 1;
    const right = left + 1;

    if (right > total) {
      return { pages: [left], isPartial: true };
    }
    return { pages: [left, right], isPartial: false };
  }

  /**
   * L2 / L6 — the slice of a long page list worth mounting, plus the spacer
   * heights that keep the scrollbar the size the full list would make it.
   *
   * A 500-page continuous view cannot hold 500 canvases, and a 500-row
   * thumbnail sidebar cannot render 500 images. Both ask this what is on
   * screen, render only that, and leave `padBefore` / `padAfter` as empty
   * space so scroll position and scrollbar length stay truthful.
   *
   * `overscan` rows either side are included so a slow scroll does not hit a
   * blank edge.
   */
  calculateLazyWindow(
    scrollTop: number,
    viewportHeight: number,
    itemHeight: number,
    totalPages: number,
    overscan: number = 3
  ): LazyPageWindow {
    const total = Math.max(0, Math.floor(totalPages));
    const height = itemHeight > 0 ? itemHeight : 1;

    if (total === 0) {
      return { start: 0, end: 0, pages: [], padBefore: 0, padAfter: 0 };
    }

    const safeScroll = Math.max(0, scrollTop);
    const safeViewport = Math.max(0, viewportHeight);

    const firstVisible = Math.floor(safeScroll / height);
    const visibleCount = Math.ceil(safeViewport / height);

    const endIndex = Math.min(total - 1, firstVisible + visibleCount + overscan);
    /*
     * Clamped against endIndex, not just against zero. A scroll position past
     * the end of the list -- which momentum and rubber-banding both produce --
     * put the start beyond the last row, and the window came back empty: a
     * blank sidebar at the bottom of a long document.
     */
    const startIndex = Math.min(
      Math.max(0, firstVisible - overscan),
      endIndex
    );

    const pages: number[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      pages.push(i + 1);
    }

    return {
      start: startIndex + 1,
      end: endIndex + 1,
      pages,
      padBefore: startIndex * height,
      padAfter: Math.max(0, (total - 1 - endIndex) * height)
    };
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
