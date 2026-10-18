import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import {
  BookletOptions,
  BookletPlan,
  BookletSide,
  ContentBounds,
  CropOptions,
  CropRegion,
  LayoutNotice,
  LayoutOutput,
  LayoutProgress,
  LongPageOptions,
  LongPagePlan,
  MAX_LAYOUT_SCALE,
  MIN_LAYOUT_SCALE,
  MarginsOptions,
  NormalizeOptions,
  NupCell,
  NupOptions,
  NupPlan,
  PDF_MAX_PAGE_DIMENSION_PT,
  PT_PER_MM,
  PageSizeSurvey,
  fullCropRegion,
  LayoutTargetSize,
  LayoutOrientation,
  marginsInPoints,
  matchStandardPaper,
  nextLargerPaper,
  orientSize,
  paperSizePt
} from '../models/pdf-layout.types';
import { PdfDrawPageUtil, DrawSourceRect } from '../utilities/pdf-draw-page.util';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import { PdfSectioningService } from './pdf-sectioning.service';
import '../utilities/pdfjs-worker';

/**
 * Page geometry: D1-D6.
 *
 * Every pass here re-draws pages through `PdfDrawPageUtil` rather than
 * rasterising them, so a vector page stays vector and its text stays
 * selectable, searchable and extractable. Cropping is the exception and the
 * cheapest of the lot: it copies the page whole and gives the copy a new
 * CropBox, which is the technique the editor's export pipeline already uses.
 *
 * Planning and writing are kept apart, as they are for the split modes:
 * `surveyPageSizes`, `planNup`, `planBooklet` and `planLongPage` are
 * synchronous and write nothing, so a screen can show the sheet count, the
 * padding and the page limit *before* the person commits to an export. Only
 * the `export*` methods produce a file.
 *
 * What a re-draw cannot carry is the interactive layer. Links, form fields and
 * annotations hang off the page object, not off its content stream, so a page
 * that is scaled into a new sheet loses them. Every method that re-draws counts
 * them first and reports `annotations-dropped` rather than letting it pass
 * quietly.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfLayoutService {
  /** Pages between yields to the event loop, so a long job keeps the UI alive. */
  private readonly YIELD_EVERY = 4;

  /** Width in pixels the auto-crop ink scan renders a page to. */
  readonly CROP_SCAN_WIDTH = 700;

  /**
   * Constructed rather than injected, for the same reason `PageFlipService` is
   * in the page manager: the sectioning service is stateless, takes no
   * dependencies, and the specs here build this service with `new` outside any
   * injection context, where a field `inject()` would throw. Its
   * visual-to-user-space mapping is reused rather than copied — there must be
   * exactly one place in the app that knows how /Rotate moves a rectangle.
   */
  private readonly sectioning = new PdfSectioningService();

  // ════════════════════════════════════════════════════════════════════
  // Shared helpers
  // ════════════════════════════════════════════════════════════════════

  private async load(buffer: ArrayBuffer): Promise<PDFDocument> {
    return PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
  }

  /** The source page facts every pass needs, in one shape. */
  private geometryOf(page: PDFPage): {
    box: DrawSourceRect;
    rotation: number;
    visualWidth: number;
    visualHeight: number;
  } {
    const box = PdfDrawPageUtil.mediaBoxOf(page);
    const rotation = PdfDrawPageUtil.normalizeRotation(page.getRotation().angle);
    const visual = PdfDrawPageUtil.visualSize(box.width, box.height, rotation);
    return { box, rotation, visualWidth: visual.width, visualHeight: visual.height };
  }

  /** How many annotations the whole document carries, for the lossiness notice. */
  private countAnnotations(doc: PDFDocument): number {
    let total = 0;
    for (const page of doc.getPages()) {
      try {
        const annots = page.node.Annots();
        total += annots ? annots.size() : 0;
      } catch {
        // A page whose /Annots cannot be read contributes nothing to the count.
      }
    }
    return total;
  }

  private noteAnnotations(doc: PDFDocument, notices: LayoutNotice[]): void {
    const count = this.countAnnotations(doc);
    if (count > 0) {
      notices.push({ kind: 'annotations-dropped', count });
    }
  }

  /**
   * Embeds a source page, or returns undefined when there is nothing on it.
   *
   * A page with no content stream is legal and common — every blank page this
   * app inserts is one — and `embedPage` refuses it. The target page is still
   * created at the right size by the caller, so a blank sheet in gives a blank
   * sheet out rather than a failed export.
   */
  private async embedIfDrawable(
    target: PDFDocument,
    page: PDFPage,
    rotation: number
  ): Promise<Awaited<ReturnType<typeof PdfDrawPageUtil.embedSource>> | undefined> {
    if (!PdfDrawPageUtil.hasContents(page)) return undefined;
    return PdfDrawPageUtil.embedSource(target, page, { rotation });
  }

  private clampScale(scale: number, notices: LayoutNotice[]): number {
    const wanted = Number.isFinite(scale) ? scale : 1;
    const clamped = Math.min(MAX_LAYOUT_SCALE, Math.max(MIN_LAYOUT_SCALE, wanted));
    if (Math.abs(clamped - wanted) > 1e-9) {
      notices.push({
        kind: 'scale-clamped',
        detail: `${Math.round(clamped * 100)}%`
      });
    }
    return clamped;
  }

  private checkAborted(signal: AbortSignal | undefined, what: string): void {
    if (signal?.aborted) throw new Error(`${what} cancelled by user.`);
  }

  private async yieldEvery(index: number): Promise<void> {
    if ((index + 1) % this.YIELD_EVERY === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  private report(
    onProgress: ((p: LayoutProgress) => void) | undefined,
    phase: LayoutProgress['phase'],
    completed: number,
    total: number
  ): void {
    onProgress?.({
      phase,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 100
    });
  }

  private async finish(
    doc: PDFDocument,
    outputName: string,
    sourcePageCount: number,
    notices: LayoutNotice[]
  ): Promise<LayoutOutput> {
    const bytes = await doc.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });
    const first = doc.getPageCount() > 0 ? doc.getPage(0) : undefined;

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: doc.getPageCount(),
      sourcePageCount,
      notices,
      outputSize: first ? this.visiblePageSize(first) : undefined
    };
  }

  /**
   * The page size a reader will actually show.
   *
   * `getSize()` returns the MediaBox, and the crop path deliberately leaves
   * the MediaBox alone so a crop can be widened again later. Reporting that
   * number tells someone who just trimmed 40% off a page that its size did not
   * change, which is both wrong and the opposite of reassuring — readers and
   * printers use the CropBox.
   */
  private visiblePageSize(page: PDFPage): { width: number; height: number } {
    try {
      const crop = page.getCropBox();
      if (crop.width > 0 && crop.height > 0) {
        return { width: crop.width, height: crop.height };
      }
    } catch {
      // No CropBox, or one the source declared oddly: fall back to the sheet.
    }
    return { width: page.getWidth(), height: page.getHeight() };
  }

  /**
   * Which 1-indexed pages a scope covers.
   *
   * An unparseable or empty range falls back to every page rather than to
   * none: a typo in a range box should not silently produce an untouched
   * document that looks like the tool did nothing.
   */
  resolveScope(
    pageCount: number,
    scope: 'all' | 'range' | 'current',
    rangeString?: string,
    currentPage = 1
  ): number[] {
    const every = Array.from({ length: pageCount }, (_, i) => i + 1);
    if (scope === 'all') return every;
    if (scope === 'current') {
      const page = Math.min(Math.max(1, Math.round(currentPage)), pageCount);
      return pageCount > 0 ? [page] : [];
    }

    const parsed = PdfRangeParserUtil.parse(rangeString ?? '', pageCount);
    return parsed.length > 0 ? parsed : every;
  }

  /** The target sheet size for a pass, honouring `original` and `auto`. */
  targetSizeFor(
    target: LayoutTargetSize,
    orientation: LayoutOrientation,
    source: { width: number; height: number }
  ): { width: number; height: number } {
    const base =
      target === 'original'
        ? { width: source.width, height: source.height }
        : paperSizePt(target, 'portrait');

    if (orientation === 'auto') {
      // Follow the content: a landscape page lands on a landscape sheet.
      const wantLandscape = source.width > source.height;
      return orientSize(base, wantLandscape ? 'landscape' : 'portrait');
    }
    return orientSize(base, orientation);
  }

  // ════════════════════════════════════════════════════════════════════
  // D1 — normalize page size & scale
  // ════════════════════════════════════════════════════════════════════

  /**
   * Groups a document's pages by their effective size.
   *
   * The screen uses this the moment a file loads, to say "this document has
   * three different page sizes" and offer normalization as the fix. Sizes are
   * effective: a portrait sheet carrying a 90° rotation measures landscape to a
   * reader and is grouped as such.
   */
  surveyPageSizes(
    pages: Array<{ width: number; height: number; rotation?: number }>
  ): PageSizeSurvey {
    const groups = new Map<string, PageSizeSurvey['groups'][number]>();

    pages.forEach((page, index) => {
      const visual = PdfDrawPageUtil.visualSize(
        page.width,
        page.height,
        page.rotation ?? 0
      );
      const widthPt = Math.round(visual.width);
      const heightPt = Math.round(visual.height);
      const key = `${widthPt}x${heightPt}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          widthPt,
          heightPt,
          standardName: matchStandardPaper(visual.width, visual.height),
          orientation:
            widthPt === heightPt
              ? 'square'
              : widthPt > heightPt
                ? 'landscape'
                : 'portrait',
          pageNumbers: []
        };
        groups.set(key, group);
      }
      group.pageNumbers.push(index + 1);
    });

    const ordered = Array.from(groups.values()).sort(
      (a, b) => b.pageNumbers.length - a.pageNumbers.length
    );
    const dominant = ordered[0];

    return {
      groups: ordered,
      mixed: ordered.length > 1,
      pageCount: pages.length,
      dominant: dominant
        ? {
            widthPt: dominant.widthPt,
            heightPt: dominant.heightPt,
            standardName: dominant.standardName
          }
        : undefined
    };
  }

  /** The same survey, read straight off a file. */
  async surveyDocument(buffer: ArrayBuffer): Promise<PageSizeSurvey> {
    const doc = await this.load(buffer);
    return this.surveyPageSizes(
      doc.getPages().map(page => {
        const geometry = this.geometryOf(page);
        return {
          width: geometry.box.width,
          height: geometry.box.height,
          rotation: geometry.rotation
        };
      })
    );
  }

  /**
   * Writes every page at one size, scaled and centred inside it.
   *
   * `target: 'original'` at scale 1 is a true no-op and takes the `copyPages`
   * path: nothing is re-drawn, so annotations, links and form fields all
   * survive. Any other setting re-draws, and says what that costs.
   */
  async exportNormalized(
    buffer: ArrayBuffer,
    options: NormalizeOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    const scale = this.clampScale(options.scale, notices);
    const isNoOp = options.target === 'original' && Math.abs(scale - 1) < 1e-9;

    const target = await PDFDocument.create();

    if (isNoOp) {
      const copied = await target.copyPages(source, pages.map((_, i) => i));
      copied.forEach((page, i) => {
        target.addPage(page);
        this.report(onProgress, 'writing', i + 1, total);
      });
      notices.push({ kind: 'unchanged-pages', count: total });
      return this.finish(target, outputName, total, notices);
    }

    this.noteAnnotations(source, notices);

    const unchanged: number[] = [];
    const enlarged: number[] = [];

    for (let i = 0; i < total; i++) {
      this.checkAborted(signal, 'Resize');

      const sourcePage = pages[i];
      const geometry = this.geometryOf(sourcePage);
      const sheet = this.targetSizeFor(options.target, options.orientation, {
        width: geometry.visualWidth,
        height: geometry.visualHeight
      });

      const newPage = target.addPage([sheet.width, sheet.height]);
      const embedded = await this.embedIfDrawable(target, sourcePage, geometry.rotation);
      if (!embedded) {
        this.report(onProgress, 'writing', i + 1, total);
        continue;
      }

      const fit = PdfDrawPageUtil.fitScale(
        geometry.visualWidth,
        geometry.visualHeight,
        sheet.width,
        sheet.height,
        'contain'
      );
      let factor = fit.scaleX * scale;
      if (options.shrinkOnly) factor = Math.min(1, factor);

      if (Math.abs(factor - 1) < 1e-4) {
        unchanged.push(i + 1);
      } else if (factor > 1) {
        enlarged.push(i + 1);
      }

      const drawnWidth = geometry.visualWidth * factor;
      const drawnHeight = geometry.visualHeight * factor;
      const origin = options.centre
        ? PdfDrawPageUtil.centreIn(
            { x: 0, y: 0, width: sheet.width, height: sheet.height },
            drawnWidth,
            drawnHeight
          )
        : { x: 0, y: 0 };

      PdfDrawPageUtil.draw(newPage, embedded, {
        x: origin.x,
        y: origin.y,
        scaleX: factor,
        scaleY: factor
      });

      this.report(onProgress, 'writing', i + 1, total);
      await this.yieldEvery(i);
    }

    if (unchanged.length > 0) {
      notices.push({ kind: 'unchanged-pages', count: unchanged.length, pageNumbers: unchanged });
    }
    if (enlarged.length > 0) {
      notices.push({ kind: 'enlarged-pages', count: enlarged.length, pageNumbers: enlarged });
    }

    return this.finish(target, outputName, total, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // D2 — crop / trim margins
  // ════════════════════════════════════════════════════════════════════

  /**
   * The content bounding box of a rasterised page, as visual fractions.
   *
   * Scans row and column ink profiles rather than every pixel twice: a pixel
   * darker than `threshold` on any channel counts as ink. Returns undefined for
   * a page with no ink at all, which the caller reports and leaves uncropped —
   * trimming a blank page to nothing is never what was wanted.
   */
  contentBoundsFromPixels(
    data: Uint8ClampedArray | Uint8Array | number[],
    width: number,
    height: number,
    threshold = 245
  ): CropRegion | undefined {
    if (width <= 0 || height <= 0) return undefined;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width; x++) {
        const i = rowStart + x * 4;
        const alpha = data[i + 3];
        // A fully transparent pixel is paper, whatever colour it claims to be.
        if (alpha === 0) continue;
        if (data[i] <= threshold || data[i + 1] <= threshold || data[i + 2] <= threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) return undefined;

    return {
      x: minX / width,
      y: minY / height,
      width: (maxX - minX + 1) / width,
      height: (maxY - minY + 1) / height
    };
  }

  /**
   * Renders each page in scope and reads its content box.
   *
   * Needs a real canvas, so a page that cannot be rasterised here simply has
   * no bounds and is reported rather than cropped to a guess.
   */
  async scanContentBounds(
    buffer: ArrayBuffer,
    pageNumbers: number[],
    options?: {
      inkThreshold?: number;
      onProgress?: (p: LayoutProgress) => void;
      signal?: AbortSignal;
    }
  ): Promise<ContentBounds[]> {
    const results: ContentBounds[] = [];

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return pageNumbers.map(pageNumber => ({ pageNumber }));
    }

    const pdfjsLib = await import('pdfjs-dist');
    /*
     * The loading task, not the document proxy, is what owns the worker:
     * `PDFDocumentProxy` has no `destroy()` in pdfjs 6, so closing the proxy
     * leaves the worker running for the life of the page.
     */
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdf = await task.promise;

    try {
      for (let i = 0; i < pageNumbers.length; i++) {
        this.checkAborted(options?.signal, 'Scan');
        const pageNumber = pageNumbers[i];

        try {
          const page = await pdf.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const scale = this.CROP_SCAN_WIDTH / Math.max(1, base.width);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));

          let ctx: CanvasRenderingContext2D | null = null;
          try {
            ctx = canvas.getContext('2d');
          } catch {
            ctx = null;
          }
          if (!ctx) {
            results.push({ pageNumber });
            continue;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({
            canvasContext: ctx,
            canvas,
            viewport
          } as Parameters<typeof page.render>[0]).promise;

          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const region = this.contentBoundsFromPixels(
            image.data,
            canvas.width,
            canvas.height,
            options?.inkThreshold ?? 245
          );

          results.push({
            pageNumber,
            region,
            coverage: region ? region.width * region.height : 0
          });
        } catch {
          results.push({ pageNumber });
        }

        this.report(options?.onProgress, 'rendering', i + 1, pageNumbers.length);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      try {
        await task.destroy();
      } catch {
        // A document that will not close is not worth failing the scan for.
      }
    }

    return results;
  }

  /** The smallest region containing all of them — the uniform auto-crop box. */
  unionRegion(regions: CropRegion[]): CropRegion | undefined {
    const usable = regions.filter(r => r.width > 0 && r.height > 0);
    if (usable.length === 0) return undefined;

    const left = Math.min(...usable.map(r => r.x));
    const top = Math.min(...usable.map(r => r.y));
    const right = Math.max(...usable.map(r => r.x + r.width));
    const bottom = Math.max(...usable.map(r => r.y + r.height));

    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /** Grows a region by a padding in points, clamped to the page. */
  padRegion(
    region: CropRegion,
    paddingPt: number,
    visualWidth: number,
    visualHeight: number
  ): CropRegion {
    if (paddingPt <= 0 || visualWidth <= 0 || visualHeight <= 0) return { ...region };

    const padX = paddingPt / visualWidth;
    const padY = paddingPt / visualHeight;
    const x = Math.max(0, region.x - padX);
    const y = Math.max(0, region.y - padY);

    return {
      x,
      y,
      width: Math.min(1 - x, region.width + padX * 2),
      height: Math.min(1 - y, region.height + padY * 2)
    };
  }

  /**
   * Copies the document and gives the pages in scope a new CropBox.
   *
   * Nothing is re-drawn: a cropped page is the same page with a smaller window
   * onto it, so its text stays selectable and its annotations stay put. The
   * MediaBox is left alone deliberately — readers and printers use the CropBox,
   * and keeping the MediaBox means the crop can be widened again later without
   * having lost anything.
   *
   * `perPageRegions` carries the auto-crop result, keyed by 1-indexed page
   * number; a page with no entry falls back to `options.region`.
   */
  async exportCropped(
    buffer: ArrayBuffer,
    options: CropOptions,
    outputName: string,
    perPageRegions?: Map<number, CropRegion>,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal,
    currentPage = 1
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    const scope = new Set(
      this.resolveScope(total, options.scope, options.rangeString, currentPage)
    );

    const target = await PDFDocument.create();
    const copied = await target.copyPages(source, pages.map((_, i) => i));

    const untouched: number[] = [];
    const emptyBoxes: number[] = [];

    for (let i = 0; i < total; i++) {
      this.checkAborted(signal, 'Crop');

      const page = copied[i];
      target.addPage(page);
      const pageNumber = i + 1;

      if (!scope.has(pageNumber)) {
        this.report(onProgress, 'writing', pageNumber, total);
        continue;
      }

      const region = perPageRegions?.get(pageNumber) ?? options.region;
      if (!region || region.width <= 0 || region.height <= 0) {
        emptyBoxes.push(pageNumber);
        this.report(onProgress, 'writing', pageNumber, total);
        continue;
      }

      const isFullPage =
        region.x <= 1e-6 &&
        region.y <= 1e-6 &&
        region.width >= 1 - 1e-6 &&
        region.height >= 1 - 1e-6;
      if (isFullPage) {
        untouched.push(pageNumber);
        this.report(onProgress, 'writing', pageNumber, total);
        continue;
      }

      const geometry = this.geometryOf(page);
      const visualRect = {
        x: region.x * geometry.visualWidth,
        y: region.y * geometry.visualHeight,
        width: region.width * geometry.visualWidth,
        height: region.height * geometry.visualHeight
      };

      /*
       * The region arrives in visual space (origin top-left, rotation already
       * applied), because that is the space a drag on the preview is measured
       * in. The CropBox wants user space, origin bottom-left, at the page
       * box's own corner.
       */
      const userRect = this.sectioning.visualRectToUserRect(
        visualRect,
        { x: 0, y: 0, width: geometry.box.width, height: geometry.box.height },
        geometry.rotation
      );

      try {
        page.setCropBox(
          geometry.box.x + userRect.x,
          geometry.box.y + userRect.y,
          userRect.width,
          userRect.height
        );
      } catch {
        emptyBoxes.push(pageNumber);
      }

      this.report(onProgress, 'writing', pageNumber, total);
      await this.yieldEvery(i);
    }

    if (untouched.length > 0) {
      notices.push({
        kind: 'crop-no-margin-found',
        count: untouched.length,
        pageNumbers: untouched
      });
    }
    if (emptyBoxes.length > 0) {
      notices.push({ kind: 'crop-box-empty', count: emptyBoxes.length, pageNumbers: emptyBoxes });
    }

    return this.finish(target, outputName, total, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // D3 — add margins & padding
  // ════════════════════════════════════════════════════════════════════

  /**
   * Grows the page and insets the content: the inverse of cropping, for binding
   * or annotation space.
   *
   * With `growToNextPaper` the page becomes the next standard size up and the
   * content is centred in it; a page already larger than A0 has no next size,
   * so it falls back to the entered measurements and says so.
   */
  async exportWithMargins(
    buffer: ArrayBuffer,
    options: MarginsOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    this.noteAnnotations(source, notices);

    const edges = marginsInPoints(options);
    const target = await PDFDocument.create();
    const noNextSize: number[] = [];

    for (let i = 0; i < total; i++) {
      this.checkAborted(signal, 'Margins');

      const sourcePage = pages[i];
      const geometry = this.geometryOf(sourcePage);
      const embedded = await this.embedIfDrawable(target, sourcePage, geometry.rotation);

      let sheetWidth: number;
      let sheetHeight: number;
      let offsetX: number;
      let offsetY: number;

      if (options.growToNextPaper) {
        const next = nextLargerPaper(geometry.visualWidth, geometry.visualHeight);
        if (next) {
          const sheet = orientSize(
            paperSizePt(next, 'portrait'),
            geometry.visualWidth > geometry.visualHeight ? 'landscape' : 'portrait'
          );
          sheetWidth = sheet.width;
          sheetHeight = sheet.height;
          offsetX = (sheetWidth - geometry.visualWidth) / 2;
          offsetY = (sheetHeight - geometry.visualHeight) / 2;
        } else {
          noNextSize.push(i + 1);
          sheetWidth = geometry.visualWidth + edges.left + edges.right;
          sheetHeight = geometry.visualHeight + edges.top + edges.bottom;
          offsetX = edges.left;
          offsetY = edges.bottom;
        }
      } else {
        sheetWidth = geometry.visualWidth + edges.left + edges.right;
        sheetHeight = geometry.visualHeight + edges.top + edges.bottom;
        offsetX = edges.left;
        offsetY = edges.bottom;
      }

      const newPage = target.addPage([sheetWidth, sheetHeight]);
      if (embedded) {
        PdfDrawPageUtil.draw(newPage, embedded, {
          x: offsetX,
          y: offsetY,
          scaleX: 1,
          scaleY: 1
        });
      }

      this.report(onProgress, 'writing', i + 1, total);
      await this.yieldEvery(i);
    }

    if (noNextSize.length > 0) {
      notices.push({
        kind: 'unchanged-pages',
        count: noNextSize.length,
        pageNumbers: noNextSize,
        detail: 'A0'
      });
    }

    return this.finish(target, outputName, total, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // D4 — N-up multi-page layout
  // ════════════════════════════════════════════════════════════════════

  /**
   * Rows and columns for a count, on a sheet of a given shape.
   *
   * The long side of the sheet gets the larger factor, which is what makes
   * 2-up on portrait paper two stacked landscape halves and 2-up on landscape
   * paper two side-by-side portrait halves — the arrangement that wastes no
   * paper in either case.
   */
  nupGrid(perSheet: number, sheetWidth: number, sheetHeight: number): { rows: number; columns: number } {
    const factors: Record<number, [number, number]> = {
      2: [1, 2],
      4: [2, 2],
      6: [2, 3],
      9: [3, 3]
    };
    const [small, large] = factors[perSheet] ?? [1, Math.max(1, Math.floor(perSheet))];

    return sheetWidth >= sheetHeight
      ? { rows: small, columns: large }
      : { rows: large, columns: small };
  }

  /**
   * Where every page lands, worked out before anything is written so the sheet
   * count can be on screen first.
   *
   * The sheet size comes from the first page when `sheet` is `original`, which
   * is the only sensible reading of "keep the paper I already have" for a
   * document that is all one size; a mixed document should be normalized first,
   * and the screen says so.
   */
  planNup(
    pageSizes: Array<{ width: number; height: number }>,
    options: NupOptions
  ): NupPlan {
    const pageCount = pageSizes.length;
    const first = pageSizes[0] ?? { width: paperSizePt('A4').width, height: paperSizePt('A4').height };
    const sheet = this.targetSizeFor(options.sheet, options.orientation, first);

    const grid = this.nupGrid(options.perSheet, sheet.width, sheet.height);
    const margin = Math.max(0, options.marginMm) * PT_PER_MM;
    const gutter = Math.max(0, options.gutterMm) * PT_PER_MM;

    const usableWidth = Math.max(1, sheet.width - margin * 2 - gutter * (grid.columns - 1));
    const usableHeight = Math.max(1, sheet.height - margin * 2 - gutter * (grid.rows - 1));
    const cellWidth = usableWidth / grid.columns;
    const cellHeight = usableHeight / grid.rows;

    const perSheet = grid.rows * grid.columns;
    const sheetCount = pageCount > 0 ? Math.ceil(pageCount / perSheet) : 0;
    const cells: NupCell[] = [];

    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
      for (let slot = 0; slot < perSheet; slot++) {
        /*
         * Row-major fills across each row and then moves down; column-major
         * fills down each column and then moves right. Either way the cell's
         * screen position is the same grid — only which page goes in it
         * changes.
         */
        const row =
          options.order === 'column-major'
            ? slot % grid.rows
            : Math.floor(slot / grid.columns);
        const column =
          options.order === 'column-major'
            ? Math.floor(slot / grid.rows)
            : slot % grid.columns;

        const pageNumber = sheetIndex * perSheet + slot + 1;
        cells.push({
          sheetIndex,
          row,
          column,
          cellIndex: sheetIndex * perSheet + slot,
          x: margin + column * (cellWidth + gutter),
          // Row 0 is the top row, and user space counts up from the bottom.
          y: sheet.height - margin - (row + 1) * cellHeight - row * gutter,
          width: cellWidth,
          height: cellHeight,
          sourcePageNumber: pageNumber <= pageCount ? pageNumber : undefined
        });
      }
    }

    return {
      rows: grid.rows,
      columns: grid.columns,
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      sheetCount,
      cells,
      emptyCellCount: cells.filter(cell => cell.sourcePageNumber === undefined).length
    };
  }

  /**
   * Writes the N-up sheets.
   *
   * Each page is fitted into its cell with its aspect ratio kept and centred,
   * and a page whose shape does not match the cell's is turned a quarter turn
   * when that fits it larger — the difference between a readable 2-up of a
   * portrait document and two thin strips.
   */
  async exportNup(
    buffer: ArrayBuffer,
    options: NupOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    this.noteAnnotations(source, notices);

    const geometries = pages.map(page => this.geometryOf(page));
    const plan = this.planNup(
      geometries.map(g => ({ width: g.visualWidth, height: g.visualHeight })),
      options
    );

    const target = await PDFDocument.create();
    const sheets: PDFPage[] = [];
    for (let i = 0; i < plan.sheetCount; i++) {
      sheets.push(target.addPage([plan.sheetWidth, plan.sheetHeight]));
    }

    let drawn = 0;
    for (const cell of plan.cells) {
      this.checkAborted(signal, 'N-up');
      if (cell.sourcePageNumber === undefined) continue;

      const index = cell.sourcePageNumber - 1;
      const geometry = geometries[index];
      const embedded = await this.embedIfDrawable(target, pages[index], geometry.rotation);
      if (!embedded) {
        drawn++;
        this.report(onProgress, 'writing', drawn, total);
        continue;
      }

      /*
       * Turning the page a quarter turn is worth it only when it genuinely
       * fits larger — compare the two contained scales and take the better.
       */
      const upright = PdfDrawPageUtil.fitScale(
        geometry.visualWidth,
        geometry.visualHeight,
        cell.width,
        cell.height,
        'contain'
      ).scaleX;
      const turned = PdfDrawPageUtil.fitScale(
        geometry.visualHeight,
        geometry.visualWidth,
        cell.width,
        cell.height,
        'contain'
      ).scaleX;
      const extraRotation = turned > upright * 1.02 ? 90 : 0;

      PdfDrawPageUtil.drawFitted(
        sheets[cell.sheetIndex],
        embedded,
        { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
        { fit: 'contain', extraRotation }
      );

      if (options.border) {
        sheets[cell.sheetIndex].drawRectangle({
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          borderColor: rgb(0.78, 0.78, 0.78),
          borderWidth: 0.5
        });
      }

      drawn++;
      this.report(onProgress, 'writing', drawn, total);
      await this.yieldEvery(drawn - 1);
    }

    if (plan.emptyCellCount > 0) {
      notices.push({ kind: 'partial-last-sheet', count: plan.emptyCellCount });
    }

    return this.finish(target, outputName, total, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // D5 — booklet imposition
  // ════════════════════════════════════════════════════════════════════

  /**
   * Saddle-stitch imposition: the page order that reads correctly once the
   * stack is printed double-sided, folded in half and nested.
   *
   * For a padded count of n, the sides pair up as (n,1), (2,n-1), (n-2,3),
   * (4,n-3)… — the outermost sheet carries the last and first pages, and each
   * sheet inwards moves one step closer to the middle. An 8-page booklet
   * therefore reads 8,1,2,7,6,3,4,5 across its four sides.
   *
   * Padding is always to a multiple of four, because one folded sheet holds
   * four pages and a sheet cannot be half printed.
   */
  planBooklet(pageCount: number, options: BookletOptions): BookletPlan {
    const count = Math.max(0, Math.floor(pageCount));
    const padded = count > 0 ? Math.ceil(count / 4) * 4 : 0;
    const sheetCount = padded / 4;
    const sides: BookletSide[] = [];
    const sequence: number[] = [];

    const creepPt = Math.max(0, options.creepMm) * PT_PER_MM;

    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
      // Front: the outer pair. Back: the pair just inside it.
      const outerHigh = padded - sheetIndex * 2;
      const outerLow = sheetIndex * 2 + 1;
      const innerLow = sheetIndex * 2 + 2;
      const innerHigh = padded - sheetIndex * 2 - 1;

      /*
       * Creep: a folded stack's inner sheets stick out further than its outer
       * ones, so the outermost sheet's content shifts furthest towards the
       * fold and the innermost does not shift at all. Linear in the sheet's
       * distance from the middle, which is the usual approximation and is
       * accurate enough for anything a phone is going to print.
       */
      const sheetCreep =
        sheetCount > 1 ? creepPt * ((sheetCount - 1 - sheetIndex) / (sheetCount - 1)) : 0;

      const front: BookletSide = {
        outputIndex: sheetIndex * 2,
        sheetIndex,
        side: 'front',
        left: options.binding === 'right' ? outerLow : outerHigh,
        right: options.binding === 'right' ? outerHigh : outerLow,
        creepPt: sheetCreep
      };
      const back: BookletSide = {
        outputIndex: sheetIndex * 2 + 1,
        sheetIndex,
        side: 'back',
        left: options.binding === 'right' ? innerHigh : innerLow,
        right: options.binding === 'right' ? innerLow : innerHigh,
        creepPt: sheetCreep
      };

      sides.push(front, back);
      sequence.push(front.left, front.right, back.left, back.right);
    }

    return {
      sides,
      paddedPageCount: padded,
      blanksAdded: padded - count,
      sheetCount,
      sequence
    };
  }

  /** Writes the imposed booklet, two source pages to each output side. */
  async exportBooklet(
    buffer: ArrayBuffer,
    options: BookletOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    this.noteAnnotations(source, notices);

    const geometries = pages.map(page => this.geometryOf(page));
    const plan = this.planBooklet(total, options);

    /*
     * The sheet is a landscape pair of the source page, so a folded half is
     * the same shape as the page it came from and nothing has to be squeezed.
     * An explicit paper size overrides that.
     */
    const first = geometries[0];
    const sheet =
      options.sheet === 'original'
        ? { width: first.visualWidth * 2, height: first.visualHeight }
        : orientSize(paperSizePt(options.sheet, 'portrait'), 'landscape');

    const target = await PDFDocument.create();
    const halfWidth = sheet.width / 2;

    for (let i = 0; i < plan.sides.length; i++) {
      this.checkAborted(signal, 'Booklet');
      const side = plan.sides[i];
      const outputPage = target.addPage([sheet.width, sheet.height]);

      for (const half of ['left', 'right'] as const) {
        const pageNumber = side[half];
        if (pageNumber < 1 || pageNumber > total) continue; // a padding blank

        const index = pageNumber - 1;
        const geometry = geometries[index];
        const embedded = await this.embedIfDrawable(target, pages[index], geometry.rotation);
        if (!embedded) continue;

        // Both halves creep towards the fold, which is the inner edge of each.
        const creepShift = half === 'left' ? side.creepPt : -side.creepPt;

        PdfDrawPageUtil.drawFitted(
          outputPage,
          embedded,
          {
            x: (half === 'left' ? 0 : halfWidth) + creepShift,
            y: 0,
            width: halfWidth,
            height: sheet.height
          },
          { fit: 'contain' }
        );
      }

      if (options.foldMark) {
        outputPage.drawLine({
          start: { x: halfWidth, y: 0 },
          end: { x: halfWidth, y: sheet.height },
          color: rgb(0.8, 0.8, 0.8),
          thickness: 0.5,
          dashArray: [3, 3]
        });
      }

      this.report(onProgress, 'writing', i + 1, plan.sides.length);
      await this.yieldEvery(i);
    }

    if (plan.blanksAdded > 0) {
      notices.push({ kind: 'booklet-padding', count: plan.blanksAdded });
    }

    return this.finish(target, outputName, total, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // D6 — single long page
  // ════════════════════════════════════════════════════════════════════

  /**
   * Works out the stack before writing it, because of the format's own ceiling.
   *
   * PDF caps a page dimension at 14,400 units. A 60-page document stacked at A4
   * width is over 50,000 units tall, and a reader given that page either
   * refuses it or clips it — so the limit is checked here, reported, and the
   * stack broken into several long pages if that is what was asked for. The
   * alternative is a file that looks fine until someone else opens it.
   */
  planLongPage(
    pageSizes: Array<{ width: number; height: number }>,
    options: LongPageOptions
  ): LongPagePlan {
    const count = pageSizes.length;
    if (count === 0) {
      return {
        widthPt: 0,
        columns: [],
        totalHeightPt: 0,
        exceedsLimit: false,
        outputPageCount: 0
      };
    }

    const widths = pageSizes.map(p => p.width);
    const widthPt =
      options.widthMode === 'narrowest'
        ? Math.min(...widths)
        : options.widthMode === 'first'
          ? widths[0]
          : Math.max(...widths);

    const gapPt = Math.max(0, options.gapMm) * PT_PER_MM;
    const scaledHeights = pageSizes.map(p =>
      p.width > 0 ? p.height * (widthPt / p.width) : p.height
    );

    const totalHeightPt =
      scaledHeights.reduce((sum, h) => sum + h, 0) + gapPt * Math.max(0, count - 1);
    const exceedsLimit = totalHeightPt > PDF_MAX_PAGE_DIMENSION_PT;

    if (!exceedsLimit || !options.splitWhenTooTall) {
      return {
        widthPt,
        columns: [
          {
            sourcePageNumbers: pageSizes.map((_, i) => i + 1),
            heightPt: totalHeightPt
          }
        ],
        totalHeightPt,
        exceedsLimit,
        outputPageCount: 1
      };
    }

    // Greedily fill each long page up to the limit, never splitting a page.
    const columns: LongPagePlan['columns'] = [];
    let current: number[] = [];
    let currentHeight = 0;

    for (let i = 0; i < count; i++) {
      const pageHeight = scaledHeights[i];
      const withGap = current.length > 0 ? pageHeight + gapPt : pageHeight;

      if (current.length > 0 && currentHeight + withGap > PDF_MAX_PAGE_DIMENSION_PT) {
        columns.push({ sourcePageNumbers: current, heightPt: currentHeight });
        current = [i + 1];
        currentHeight = pageHeight;
      } else {
        current.push(i + 1);
        currentHeight += withGap;
      }
    }
    if (current.length > 0) {
      columns.push({ sourcePageNumbers: current, heightPt: currentHeight });
    }

    return {
      widthPt,
      columns,
      totalHeightPt,
      exceedsLimit,
      outputPageCount: columns.length
    };
  }

  /** Writes the stack the plan describes, top page first. */
  async exportLongPage(
    buffer: ArrayBuffer,
    options: LongPageOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const source = await this.load(buffer);
    const notices: LayoutNotice[] = [];
    const pages = source.getPages();
    const total = pages.length;
    if (total === 0) throw new Error('This document has no pages.');

    this.noteAnnotations(source, notices);

    const geometries = pages.map(page => this.geometryOf(page));
    const plan = this.planLongPage(
      geometries.map(g => ({ width: g.visualWidth, height: g.visualHeight })),
      options
    );

    if (plan.exceedsLimit && !options.splitWhenTooTall) {
      throw new Error(
        `One long page would be ${Math.round(plan.totalHeightPt)} units tall, over the ` +
          `${PDF_MAX_PAGE_DIMENSION_PT}-unit limit the PDF format allows.`
      );
    }

    const gapPt = Math.max(0, options.gapMm) * PT_PER_MM;
    const target = await PDFDocument.create();
    let written = 0;

    for (const column of plan.columns) {
      this.checkAborted(signal, 'Stack');
      const longPage = target.addPage([plan.widthPt, column.heightPt]);

      if (options.fillGaps) {
        longPage.drawRectangle({
          x: 0,
          y: 0,
          width: plan.widthPt,
          height: column.heightPt,
          color: rgb(1, 1, 1)
        });
      }

      // Stack downwards from the top, which is how the result will be read.
      let cursorY = column.heightPt;

      for (const pageNumber of column.sourcePageNumbers) {
        this.checkAborted(signal, 'Stack');
        const index = pageNumber - 1;
        const geometry = geometries[index];
        const scale =
          geometry.visualWidth > 0 ? plan.widthPt / geometry.visualWidth : 1;
        const drawnHeight = geometry.visualHeight * scale;

        const embedded = await this.embedIfDrawable(target, pages[index], geometry.rotation);
        if (embedded) {
          PdfDrawPageUtil.draw(longPage, embedded, {
            x: 0,
            y: cursorY - drawnHeight,
            scaleX: scale,
            scaleY: scale
          });
        }

        cursorY -= drawnHeight + gapPt;
        written++;
        this.report(onProgress, 'writing', written, total);
        await this.yieldEvery(written - 1);
      }
    }

    if (plan.exceedsLimit) {
      notices.push({
        kind: 'long-page-limit',
        count: Math.round(plan.totalHeightPt),
        detail: String(PDF_MAX_PAGE_DIMENSION_PT)
      });
      notices.push({ kind: 'long-page-split', count: plan.columns.length });
    }

    return this.finish(target, outputName, total, notices);
  }

  /** The crop region a screen starts from: the whole page. */
  initialCropRegion(): CropRegion {
    return fullCropRegion();
  }
}
