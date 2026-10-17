import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PdfPageItem, PdfSourceDocument } from '../models/pdf-organization.types';
import {
  AdvancedSplitMode,
  DividerPageClassification,
  DividerPlanOptions,
  DividerScanOptions,
  DividerScanResult,
  MaxSizeSplitOptions,
  OutlineBookmark,
  OutlineReadResult,
  SplitPagePreviewRow,
  SplitPlan,
  SplitPlanNotice,
  SplitPlanPart,
  TextPatternPageValue,
  TextPatternScanOptions,
  TextPatternScanResult
} from '../models/pdf-split.types';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import { BlankPageService } from './blank-page.service';
import { QrBarcodeService } from './qr-barcode.service';
import '../utilities/pdfjs-worker';

/**
 * Plans the five split modes added in B1–B5: by output file size, by document
 * count, by bookmark, at divider sheets, and by a text pattern.
 *
 * Nothing here writes a PDF. Each method returns a `SplitPlan` — a list of
 * parts with the page numbers and file names they would get — which the screen
 * shows before the person commits to it, and which
 * `PdfPageManagerService.exportSplitPdfs` then writes. Keeping planning and
 * writing apart is what makes the previews honest: the plan the person
 * approves is the plan that is written, part for part.
 *
 * The four split modes that ship are untouched and still come out of
 * `PdfRangeParserUtil.calculateSplitChunks`.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfSplitPlannerService {
  /**
   * Constructed rather than injected, following
   * `PdfPageManagerService`'s PageFlipService precedent: both of these are
   * stateless, and the specs build this planner with `new
   * PdfSplitPlannerService()` outside any injection context, where a field
   * `inject()` would throw.
   */
  private readonly blankPageService = new BlankPageService();
  private readonly qrBarcodeService = new QrBarcodeService();

  /** Default cap on the binary search's serialize-and-measure calls. */
  readonly DEFAULT_MAX_MEASUREMENTS = 240;

  /** Render scale for the barcode pass. A code needs more pixels than blankness does. */
  readonly DEFAULT_BARCODE_SCALE = 1.4;

  /** Longest file-name stem a plan will produce, before the `.pdf`. */
  readonly MAX_BASE_NAME_LENGTH = 60;

  // ════════════════════════════════════════════════════════════════════
  // B1 — split by output file size
  // ════════════════════════════════════════════════════════════════════

  /**
   * Splits so that every part comes out at or below `ceilingBytes`.
   *
   * The boundary of each part is found by binary search over its length: add
   * pages, serialize, measure, adjust — the same loop shape the target-KB
   * compressor uses. A PDF only grows as pages are added to it, so "fits" is
   * monotonic in the length and a binary search is sound; `maxMeasurements`
   * still caps the whole job, because this runs on a phone.
   *
   * A page that is over the ceiling on its own cannot be split any further.
   * That page becomes its own part, is flagged `overCeiling`, and is named in
   * an `oversized-page` notice so the screen can offer the compressor — the
   * rest of the job still completes.
   */
  async planMaxSize(
    pageNumbers: number[],
    options: MaxSizeSplitOptions
  ): Promise<SplitPlan> {
    const pages = [...pageNumbers];
    const ceiling = options.ceilingBytes;
    const budget = options.maxMeasurements ?? this.DEFAULT_MAX_MEASUREMENTS;
    const notices: SplitPlanNotice[] = [];
    const parts: SplitPlanPart[] = [];
    const oversizedPages: number[] = [];

    if (pages.length === 0) {
      return this.emptyPlan('max-size', notices);
    }
    if (!Number.isFinite(ceiling) || ceiling <= 0) {
      throw new Error('A positive size ceiling is required.');
    }

    let measurements = 0;
    let budgetSpent = false;
    const measure = async (slice: number[]): Promise<number> => {
      if (options.signal?.aborted) {
        throw new Error('Split planning cancelled by user.');
      }
      measurements++;
      return options.measureBytes(slice);
    };

    let start = 0;
    while (start < pages.length) {
      if (options.signal?.aborted) {
        throw new Error('Split planning cancelled by user.');
      }

      const remaining = pages.length - start;

      // The single page is the floor: if it does not fit, nothing will.
      const firstSize = await measure(pages.slice(start, start + 1));
      if (firstSize > ceiling) {
        parts.push({
          pageNumbers: [pages[start]],
          sizeBytes: firstSize,
          overCeiling: true
        });
        oversizedPages.push(pages[start]);
        start += 1;
        this.reportMeasureProgress(options, parts.length, start, pages.length);
        continue;
      }

      let bestLength = 1;
      let bestSize = firstSize;

      // Binary search the longest prefix that still fits under the ceiling.
      let low = 1; // known to fit
      let high = remaining; // not yet known
      while (low < high) {
        if (measurements >= budget) {
          budgetSpent = true;
          break;
        }
        const mid = Math.floor((low + high + 1) / 2);
        const size = await measure(pages.slice(start, start + mid));
        if (size <= ceiling) {
          low = mid;
          bestLength = mid;
          bestSize = size;
        } else {
          high = mid - 1;
        }
      }

      parts.push({
        pageNumbers: pages.slice(start, start + bestLength),
        sizeBytes: bestSize
      });
      start += bestLength;
      this.reportMeasureProgress(options, parts.length, start, pages.length);

      if (budgetSpent) {
        // Spend what is left of the document in one part rather than stopping
        // halfway with pages silently missing from the plan.
        if (start < pages.length) {
          const tail = pages.slice(start);
          const tailSize = await options.measureBytes(tail);
          parts.push({
            pageNumbers: tail,
            sizeBytes: tailSize,
            overCeiling: tailSize > ceiling
          });
          start = pages.length;
        }
        notices.push({ kind: 'measure-budget-spent', count: measurements });
        break;
      }
    }

    if (oversizedPages.length > 0) {
      notices.push({ kind: 'oversized-page', pageNumbers: oversizedPages });
    }
    if (parts.length === 1) {
      notices.push({ kind: 'single-part' });
    }

    return {
      mode: 'max-size',
      parts,
      droppedPageNumbers: [],
      notices,
      pageRows: [],
      usable: parts.length > 0,
      totalPagesCovered: parts.reduce((sum, p) => sum + p.pageNumbers.length, 0)
    };
  }

  private reportMeasureProgress(
    options: MaxSizeSplitOptions,
    partsDone: number,
    pagesConsumed: number,
    totalPages: number
  ): void {
    if (!options.onProgress) return;

    /*
     * Parts completed is the unit the person sees, but the total is not known
     * until the job ends, so it is estimated from the average part length so
     * far. The percentage comes from pages consumed, which only ever moves
     * forward.
     */
    const averageLength = pagesConsumed / Math.max(1, partsDone);
    const remaining = Math.max(0, totalPages - pagesConsumed);
    const estimatedTotal = partsDone + Math.ceil(remaining / Math.max(1, averageLength));

    options.onProgress({
      phase: 'measuring',
      completed: partsDone,
      total: Math.max(partsDone, estimatedTotal),
      percent: Math.min(100, Math.round((pagesConsumed / totalPages) * 100))
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // B2 — split by document count
  // ════════════════════════════════════════════════════════════════════

  /**
   * Divides into exactly N files, as evenly as the page count allows, with the
   * remainder going to the earliest parts.
   *
   * The arithmetic lives in `PdfRangeParserUtil.calculateSplitChunks` next to
   * the four shipped modes; this wraps it in a plan so the screen can render
   * every new mode's preview the same way.
   */
  planDocCount(totalPages: number, docCount: number | undefined): SplitPlan {
    const validation = PdfRangeParserUtil.validateDocCount(totalPages, docCount);

    if (!validation.valid) {
      return this.emptyPlan('doc-count', [
        {
          kind: 'count-too-large',
          count: validation.docCount,
          detail: validation.reason ?? 'exceeds-pages'
        }
      ]);
    }

    const chunks = PdfRangeParserUtil.calculateSplitChunks(totalPages, {
      mode: 'doc-count',
      docCount: validation.docCount
    });

    const notices: SplitPlanNotice[] = [];
    if (chunks.length === 1) {
      notices.push({ kind: 'single-part' });
    }

    return {
      mode: 'doc-count',
      parts: chunks.map(pageNumbers => ({ pageNumbers })),
      droppedPageNumbers: [],
      notices,
      pageRows: [],
      usable: chunks.length > 0,
      totalPagesCovered: totalPages
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // B3 — split by bookmarks / chapters
  // ════════════════════════════════════════════════════════════════════

  /**
   * Reads the outline of every loaded document and resolves each entry to the
   * page it points at.
   *
   * A destination is either an array whose first element is a page reference,
   * or the name of one, which `getDestination` resolves first. Either way the
   * page reference goes through `getPageIndex` — resolving by name is the part
   * that is easy to skip and the reason bookmarks in many PDFs look unresolved.
   */
  async readOutline(
    sourceDocs: PdfSourceDocument[],
    signal?: AbortSignal
  ): Promise<OutlineReadResult> {
    const bookmarks: OutlineBookmark[] = [];
    const documentsWithoutOutline: string[] = [];

    for (const doc of sourceDocs) {
      if (signal?.aborted) {
        throw new Error('Outline reading cancelled by user.');
      }
      if (!doc.pdfDoc) {
        documentsWithoutOutline.push(doc.name);
        continue;
      }

      let outline: any[] | null = null;
      try {
        outline = await doc.pdfDoc.getOutline();
      } catch {
        outline = null;
      }

      if (!outline || outline.length === 0) {
        documentsWithoutOutline.push(doc.name);
        continue;
      }

      const before = bookmarks.length;
      await this.collectOutlineItems(doc, outline, 1, bookmarks, signal);
      if (bookmarks.length === before) {
        // An outline whose destinations none of them resolve is, for splitting
        // purposes, the same as no outline at all.
        documentsWithoutOutline.push(doc.name);
      }
    }

    let maxLevel = 0;
    const countsByLevel: number[] = [];
    for (const bookmark of bookmarks) {
      maxLevel = Math.max(maxLevel, bookmark.level);
      countsByLevel[bookmark.level - 1] = (countsByLevel[bookmark.level - 1] ?? 0) + 1;
    }
    for (let i = 0; i < maxLevel; i++) {
      countsByLevel[i] = countsByLevel[i] ?? 0;
    }

    return { bookmarks, maxLevel, countsByLevel, documentsWithoutOutline };
  }

  private async collectOutlineItems(
    doc: PdfSourceDocument,
    items: any[],
    level: number,
    out: OutlineBookmark[],
    signal?: AbortSignal
  ): Promise<void> {
    for (const item of items) {
      if (signal?.aborted) {
        throw new Error('Outline reading cancelled by user.');
      }

      const pageIndex = await this.resolveDestinationPageIndex(doc, item);
      if (pageIndex !== null) {
        out.push({
          title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : '',
          level,
          sourceDocId: doc.id,
          sourcePageIndex: pageIndex
        });
      }

      if (Array.isArray(item?.items) && item.items.length > 0) {
        await this.collectOutlineItems(doc, item.items, level + 1, out, signal);
      }
    }
  }

  private async resolveDestinationPageIndex(
    doc: PdfSourceDocument,
    item: any
  ): Promise<number | null> {
    try {
      let dest = item?.dest;
      if (typeof dest === 'string') {
        dest = await doc.pdfDoc.getDestination(dest);
      }
      if (!Array.isArray(dest) || dest.length === 0) return null;

      const index = await doc.pdfDoc.getPageIndex(dest[0]);
      return typeof index === 'number' && index >= 0 ? index : null;
    } catch {
      return null;
    }
  }

  /**
   * Splits at every bookmark at or above the chosen level: level 1 cuts at
   * top-level chapters only, level 2 cuts at chapters and their sections too.
   *
   * Each part is named from the bookmark that opens it. Pages ahead of the
   * first bookmark are written as their own leading part and reported, rather
   * than being folded into the first chapter or quietly dropped.
   */
  planChapters(
    pages: PdfPageItem[],
    outline: OutlineReadResult,
    level: number,
    fallbackBaseName = 'document'
  ): SplitPlan {
    const notices: SplitPlanNotice[] = [];

    if (pages.length === 0) {
      return this.emptyPlan('chapters', notices);
    }
    if (outline.bookmarks.length === 0) {
      return this.emptyPlan('chapters', [
        { kind: 'no-outline', detail: outline.documentsWithoutOutline.join(', ') }
      ]);
    }

    const selected = outline.bookmarks.filter(b => b.level <= level && b.level >= 1);
    if (selected.length === 0) {
      return this.emptyPlan('chapters', [{ kind: 'empty-level', count: level }]);
    }

    // (docId, sourcePageIndex) -> the title of the shallowest bookmark there.
    const titleByPage = new Map<string, { title: string; level: number }>();
    for (const bookmark of selected) {
      const key = `${bookmark.sourceDocId}:${bookmark.sourcePageIndex}`;
      const existing = titleByPage.get(key);
      if (!existing || bookmark.level < existing.level) {
        titleByPage.set(key, { title: bookmark.title, level: bookmark.level });
      }
    }

    const parts: SplitPlanPart[] = [];
    const pageRows: SplitPagePreviewRow[] = [];
    let current: SplitPlanPart | null = null;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1;
      const hit = titleByPage.get(`${page.sourceDocId}:${page.sourcePageIndex}`);

      if (hit) {
        current = { pageNumbers: [], sourceLabel: hit.title };
        parts.push(current);
        pageRows.push({ pageNumber, value: hit.title, boundary: 'bookmark' });
      } else if (!current) {
        current = { pageNumbers: [] };
        parts.push(current);
        pageRows.push({ pageNumber });
      } else {
        pageRows.push({ pageNumber });
      }

      current.pageNumbers.push(pageNumber);
    }

    const leading = parts.length > 0 && parts[0].sourceLabel === undefined;
    if (leading) {
      notices.push({
        kind: 'unmatched-leading-pages',
        pageNumbers: [...parts[0].pageNumbers]
      });
    }
    if (parts.length === 1) {
      notices.push({ kind: 'single-part' });
    }

    this.assignBaseNames(parts, fallbackBaseName);

    return {
      mode: 'chapters',
      parts,
      droppedPageNumbers: [],
      notices,
      pageRows,
      usable: parts.length > 0,
      totalPagesCovered: pages.length
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // B4 — split at blank pages or divider sheets
  // ════════════════════════════════════════════════════════════════════

  /**
   * Classifies every page as a divider sheet or not, for a stack that was
   * batch-scanned with separator sheets between documents.
   *
   * Blankness comes from `BlankPageService` and codes from
   * `QrBarcodeService` — neither is re-implemented here; this only decides
   * which signals count as a divider and reports what it saw.
   */
  async scanDividers(options: DividerScanOptions): Promise<DividerScanResult> {
    const classifications: DividerPageClassification[] = [];
    const total = options.pages.length;
    const barcodeScale = options.barcodeScale ?? this.DEFAULT_BARCODE_SCALE;
    let blankCount = 0;
    let codeCount = 0;

    for (let i = 0; i < total; i++) {
      if (options.signal?.aborted) {
        throw new Error('Divider scan cancelled by user.');
      }

      const page = options.pages[i];
      const pageNumber = i + 1;
      const sourceDoc = options.sourceDocsMap.get(page.sourceDocId);

      let isBlank = false;
      let barcodePayload: string | undefined;

      if (sourceDoc?.pdfDoc) {
        let pdfPage: any = null;
        try {
          pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
        } catch {
          pdfPage = null;
        }

        if (pdfPage && options.detectBlank) {
          try {
            const analysis = await this.blankPageService.analyzePage(pdfPage, {
              threshold: options.blankThreshold
            });
            isBlank = analysis.isBlank;
          } catch {
            // A page that cannot be analysed is not a divider: a wrong guess
            // here drops a real page out of the output.
            isBlank = false;
          }
        }

        if (pdfPage && options.detectBarcode) {
          barcodePayload = await this.decodeFirstCode(pdfPage, barcodeScale);
        }
      }

      if (isBlank) blankCount++;
      if (barcodePayload) codeCount++;

      const dividerByBlank = options.detectBlank && isBlank;
      const dividerByCode = options.detectBarcode && !!barcodePayload;

      classifications.push({
        pageNumber,
        isBlank,
        barcodePayload,
        isDivider: dividerByBlank || dividerByCode,
        dividerKind: dividerByCode ? 'code' : dividerByBlank ? 'blank' : undefined
      });

      options.onProgress?.({
        phase: 'scanning',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });

      // Yield so the UI stays responsive and cancellation is observed.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { classifications, blankCount, codeCount };
  }

  /** Renders a page and returns the payload of the first code found on it. */
  private async decodeFirstCode(pdfPage: any, scale: number): Promise<string | undefined> {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return undefined;
    }

    try {
      const viewport = pdfPage.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, canvas, viewport } as any).promise;

      const results = await this.qrBarcodeService.scanCanvasForBarcodes(canvas);
      const payload = results.find(r => r.rawContent && r.rawContent.trim().length > 0);
      return payload ? payload.rawContent.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Turns a divider classification into parts. The divider sheet itself is
   * dropped from the output — that is the whole point of a separator page —
   * and every dropped page is listed on the plan so nothing disappears
   * silently.
   */
  planDividers(
    pages: PdfPageItem[],
    scan: DividerScanResult,
    options: DividerPlanOptions
  ): SplitPlan {
    const notices: SplitPlanNotice[] = [];
    if (pages.length === 0) {
      return this.emptyPlan('divider', notices);
    }

    const byPage = new Map<number, DividerPageClassification>();
    for (const item of scan.classifications) {
      byPage.set(item.pageNumber, item);
    }

    const dividerCount = scan.classifications.filter(c => c.isDivider).length;
    if (dividerCount === 0) {
      return this.emptyPlan('divider', [{ kind: 'no-dividers' }]);
    }

    const parts: SplitPlanPart[] = [];
    const pageRows: SplitPagePreviewRow[] = [];
    const droppedPageNumbers: number[] = [];

    let current: SplitPlanPart | null = null;
    /** Payload of the divider that opened the part now being filled. */
    let pendingLabel: string | undefined;

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = i + 1;
      const info = byPage.get(pageNumber);

      if (info?.isDivider) {
        droppedPageNumbers.push(pageNumber);
        pageRows.push({
          pageNumber,
          value: info.barcodePayload,
          boundary: info.dividerKind === 'code' ? 'divider-code' : 'divider-blank',
          dropped: true
        });
        // Close the part now open; the next content page starts a new one.
        current = null;
        pendingLabel = options.nameFromPayload ? info.barcodePayload : undefined;
        continue;
      }

      if (!current) {
        current = { pageNumbers: [], sourceLabel: pendingLabel };
        parts.push(current);
        pendingLabel = undefined;
      }
      current.pageNumbers.push(pageNumber);
      pageRows.push({ pageNumber });
    }

    if (droppedPageNumbers.length > 0) {
      notices.push({ kind: 'dropped-pages', pageNumbers: droppedPageNumbers });
    }
    if (parts.length === 1) {
      notices.push({ kind: 'single-part' });
    }

    this.assignBaseNames(parts, options.fallbackBaseName ?? 'document');

    return {
      mode: 'divider',
      parts,
      droppedPageNumbers,
      notices,
      pageRows,
      usable: parts.length > 0,
      totalPagesCovered: parts.reduce((sum, p) => sum + p.pageNumbers.length, 0)
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // B5 — split by text pattern
  // ════════════════════════════════════════════════════════════════════

  /**
   * Reads one value per page by running a regular expression over the page's
   * text layer, optionally restricted to a band at the top of the page.
   *
   * The value is the first capture group when the pattern has one, otherwise
   * the whole match. A page whose text layer is empty is recorded as such
   * instead of being treated as a page the pattern failed to match — a scanned
   * stack with no OCR layer would otherwise look like a pattern problem.
   */
  async scanTextPattern(options: TextPatternScanOptions): Promise<TextPatternScanResult> {
    let regex: RegExp;
    try {
      regex = this.compilePattern(options.pattern, options.flags);
    } catch (error: any) {
      return {
        values: [],
        matchedPageCount: 0,
        pagesWithoutText: [],
        patternError: error?.message || 'Invalid pattern'
      };
    }

    const values: TextPatternPageValue[] = [];
    const pagesWithoutText: number[] = [];
    const total = options.pages.length;
    let matchedPageCount = 0;

    for (let i = 0; i < total; i++) {
      if (options.signal?.aborted) {
        throw new Error('Text pattern scan cancelled by user.');
      }

      const page = options.pages[i];
      const pageNumber = i + 1;
      const sourceDoc = options.sourceDocsMap.get(page.sourceDocId);

      let text = '';
      if (sourceDoc?.pdfDoc) {
        try {
          const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
          text = await this.readPageText(pdfPage, options.regionTopFraction);
        } catch {
          text = '';
        }
      }

      const trimmed = text.trim();
      const noTextLayer = trimmed.length === 0;
      if (noTextLayer) {
        pagesWithoutText.push(pageNumber);
      }

      let value: string | undefined;
      if (!noTextLayer) {
        const match = regex.exec(trimmed);
        const captured = match ? (match[1] ?? match[0]) : undefined;
        if (typeof captured === 'string' && captured.trim().length > 0) {
          value = captured.trim();
          matchedPageCount++;
        }
      }

      values.push({
        pageNumber,
        value,
        noTextLayer,
        excerpt: trimmed.slice(0, 80)
      });

      options.onProgress?.({
        phase: 'reading',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { values, matchedPageCount, pagesWithoutText };
  }

  /**
   * Compiles the pattern, dropping the stateful flags.
   *
   * `g` and `y` carry `lastIndex` between calls, so one regex reused across
   * pages would start each page where the previous one stopped and miss
   * matches. The scan wants the first match on each page, independently.
   */
  private compilePattern(pattern: string, flags?: string): RegExp {
    if (!pattern || !pattern.trim()) {
      throw new Error('A pattern is required.');
    }
    const safeFlags = (flags ?? '').replace(/[gy]/g, '');
    return new RegExp(pattern, safeFlags);
  }

  /**
   * Joins a page's text items, optionally keeping only those in a band at the
   * top of the page.
   *
   * PDF user space has its origin at the bottom-left, so "the top 20%" is the
   * band above `y0 + height * 0.8`, read off each item's transform.
   */
  private async readPageText(pdfPage: any, regionTopFraction?: number): Promise<string> {
    const textContent = await pdfPage.getTextContent();
    const items: any[] = Array.isArray(textContent?.items) ? textContent.items : [];
    if (items.length === 0) return '';

    let minY = -Infinity;
    if (
      typeof regionTopFraction === 'number' &&
      regionTopFraction > 0 &&
      regionTopFraction < 1
    ) {
      const view: number[] = Array.isArray(pdfPage?.view) ? pdfPage.view : [0, 0, 0, 0];
      const bottom = view[1] ?? 0;
      const top = view[3] ?? 0;
      const height = top - bottom;
      if (height > 0) {
        minY = bottom + height * (1 - regionTopFraction);
      }
    }

    const pieces: string[] = [];
    for (const item of items) {
      if (typeof item?.str !== 'string') continue;
      if (minY > -Infinity) {
        const y = Array.isArray(item.transform) ? Number(item.transform[5]) : NaN;
        if (!Number.isFinite(y) || y < minY) continue;
      }
      pieces.push(item.str);
      if (item.hasEOL) pieces.push('\n');
    }

    return pieces.join(' ').replace(/[ \t]+/g, ' ').trim();
  }

  /**
   * Starts a new part whenever the captured value changes.
   *
   * A page the pattern did not match continues the part it falls in — an
   * invoice's second page rarely repeats the invoice number — so a value only
   * ends a part when a different value appears. Pages ahead of the first match
   * form their own leading part and are reported.
   *
   * When nothing matched anywhere the plan is unusable: one file containing
   * the whole document would look like a split that worked.
   */
  planTextPattern(
    pages: PdfPageItem[],
    scan: TextPatternScanResult,
    fallbackBaseName = 'document'
  ): SplitPlan {
    const notices: SplitPlanNotice[] = [];

    if (scan.patternError) {
      return this.emptyPlan('text-pattern', [
        { kind: 'invalid-pattern', detail: scan.patternError }
      ]);
    }
    if (pages.length === 0) {
      return this.emptyPlan('text-pattern', notices);
    }
    if (scan.matchedPageCount === 0) {
      const kinds: SplitPlanNotice[] = [{ kind: 'no-pattern-match' }];
      if (scan.pagesWithoutText.length === pages.length) {
        kinds.push({ kind: 'pages-without-text', pageNumbers: scan.pagesWithoutText });
      }
      return this.emptyPlan('text-pattern', kinds);
    }

    const valueByPage = new Map<number, TextPatternPageValue>();
    for (const entry of scan.values) {
      valueByPage.set(entry.pageNumber, entry);
    }

    const parts: SplitPlanPart[] = [];
    const pageRows: SplitPagePreviewRow[] = [];
    let current: SplitPlanPart | null = null;
    let currentValue: string | undefined;

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = i + 1;
      const entry = valueByPage.get(pageNumber);
      const value = entry?.value;

      if (value !== undefined && value !== currentValue) {
        current = { pageNumbers: [], sourceLabel: value };
        parts.push(current);
        currentValue = value;
        pageRows.push({ pageNumber, value, boundary: 'value-change' });
      } else {
        if (!current) {
          current = { pageNumbers: [] };
          parts.push(current);
        }
        pageRows.push({ pageNumber, value });
      }

      current.pageNumbers.push(pageNumber);
    }

    if (parts.length > 0 && parts[0].sourceLabel === undefined) {
      notices.push({
        kind: 'unmatched-leading-pages',
        pageNumbers: [...parts[0].pageNumbers]
      });
    }
    if (scan.pagesWithoutText.length > 0) {
      notices.push({ kind: 'pages-without-text', pageNumbers: scan.pagesWithoutText });
    }
    if (parts.length === 1) {
      notices.push({ kind: 'single-part' });
    }

    this.assignBaseNames(parts, fallbackBaseName);

    return {
      mode: 'text-pattern',
      parts,
      droppedPageNumbers: [],
      notices,
      pageRows,
      usable: parts.length > 0,
      totalPagesCovered: pages.length
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Shared helpers
  // ════════════════════════════════════════════════════════════════════

  /**
   * Names every part that has a label to be named from, and makes the set
   * unique so two chapters called "Appendix" do not write over each other.
   */
  private assignBaseNames(parts: SplitPlanPart[], fallbackBaseName: string): void {
    const fallback = this.sanitizeBaseName(fallbackBaseName) || 'document';
    const used = new Set<string>();

    parts.forEach((part, index) => {
      const fromLabel = part.sourceLabel ? this.sanitizeBaseName(part.sourceLabel) : '';
      const stem = fromLabel || `${fallback}_part_${index + 1}`;
      part.baseName = this.uniquify(stem, used);
    });
  }

  /**
   * Makes a bookmark title, decoded payload or captured value safe to use as a
   * file name on Android and in a ZIP entry.
   *
   * Path separators and the characters Windows reserves go first — a payload is
   * data off a scanned sheet, not a name anyone vetted — then control
   * characters, then the trailing dots and spaces that some filesystems strip
   * on their own.
   */
  sanitizeBaseName(input: string): string {
    if (!input) return '';

    const cleaned = input
      .replace(/\.pdf$/i, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .replace(/ /g, '_');

    if (!cleaned) return '';
    return cleaned.slice(0, this.MAX_BASE_NAME_LENGTH).replace(/[._-]+$/g, '');
  }

  private uniquify(stem: string, used: Set<string>): string {
    const base = stem || 'part';
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let suffix = 2;
    while (used.has(`${base}_${suffix}`)) {
      suffix++;
    }
    const unique = `${base}_${suffix}`;
    used.add(unique);
    return unique;
  }

  private emptyPlan(mode: AdvancedSplitMode, notices: SplitPlanNotice[]): SplitPlan {
    return {
      mode,
      parts: [],
      droppedPageNumbers: [],
      notices,
      pageRows: [],
      usable: false,
      totalPagesCovered: 0
    };
  }
}
