import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  PdfExportResult,
  PdfPageItem,
  PdfSourceDocument
} from '../models/pdf-organization.types';
import { SplitPlanNotice } from '../models/pdf-split.types';
import {
  GutterResult,
  MM_TO_PT,
  PAPER_SIZES_PT,
  SectionGridOptions,
  SectionPiece,
  SectionPlan,
  SectioningProgress,
  TilingOptions,
  UserSpaceRect,
  VisualRect
} from '../models/pdf-sectioning.types';
import '../utilities/pdfjs-worker';

/**
 * Cuts within a page: a grid of sections (B6) or a poster's worth of printable
 * tiles (B7).
 *
 * Both do the same thing to the file — copy the source page once per piece and
 * give each copy its own CropBox, the technique the editor's export pipeline
 * already uses. Nothing is rasterised and nothing is re-encoded: a vector page
 * cut into four stays four vector pages, and the text on them stays selectable.
 *
 * Planning and writing are separate, as they are for B1-B5: `planSections` and
 * `planTiles` return the rectangles, the screen draws them over a preview, and
 * only `exportSectionedPdf` writes anything.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfSectioningService {
  /** Most pieces one source page may be cut into, so a typo cannot hang a phone. */
  readonly MAX_PIECES_PER_PAGE = 400;

  /**
   * Sheet count past which the plan says so before the person commits to it.
   * Twenty sheets is about where a poster stops being a print and starts being
   * an afternoon, and it is cheaper to hear that before the paper comes out.
   */
  readonly LARGE_SHEET_COUNT = 20;

  /** Width in pixels the gutter scan renders a page to. */
  readonly GUTTER_SCAN_WIDTH = 600;

  // ════════════════════════════════════════════════════════════════════
  // Geometry — visual space to user space
  // ════════════════════════════════════════════════════════════════════

  /**
   * The page as the reader sees it: /Rotate 90 or 270 swaps width and height.
   *
   * Grids are laid out in this space and mapped back afterwards, because "the
   * left half of a spread" means the left half of what is on screen. Laying the
   * grid out in user space instead would cut a rotated scan along the wrong
   * axis, which looks like a bug in the splitter and is really a bug in the
   * coordinate system.
   */
  visualSize(
    widthPt: number,
    heightPt: number,
    rotation: number
  ): { width: number; height: number } {
    const turned = this.normalizeRotation(rotation) % 180 !== 0;
    return turned
      ? { width: heightPt, height: widthPt }
      : { width: widthPt, height: heightPt };
  }

  /**
   * Maps a rectangle the reader sees onto the box pdf-lib wants.
   *
   * Visual space has its origin top-left and already has the rotation applied;
   * user space has its origin bottom-left at the page box's own corner. Each
   * rotation is an axis swap and/or a flip, so mapping the two opposite corners
   * and normalising is enough — no trigonometry, and no rounding drift.
   */
  visualRectToUserRect(
    rect: VisualRect,
    pageBox: UserSpaceRect,
    rotation: number
  ): UserSpaceRect {
    const rot = this.normalizeRotation(rotation);
    const w = pageBox.width;
    const h = pageBox.height;

    const corner = (vx: number, vy: number): { u: number; v: number } => {
      switch (rot) {
        case 90:
          // Visual x runs along user +y, visual y (downwards) along user +x.
          return { u: vy, v: vx };
        case 180:
          return { u: w - vx, v: vy };
        case 270:
          return { u: w - vy, v: h - vx };
        default:
          return { u: vx, v: h - vy };
      }
    };

    const a = corner(rect.x, rect.y);
    const b = corner(rect.x + rect.width, rect.y + rect.height);

    const minU = Math.min(a.u, b.u);
    const maxU = Math.max(a.u, b.u);
    const minV = Math.min(a.v, b.v);
    const maxV = Math.max(a.v, b.v);

    return {
      x: pageBox.x + minU,
      y: pageBox.y + minV,
      width: maxU - minU,
      height: maxV - minV
    };
  }

  private normalizeRotation(rotation: number): number {
    const r = Math.round((rotation % 360) / 90) * 90;
    return ((r % 360) + 360) % 360;
  }

  // ════════════════════════════════════════════════════════════════════
  // B6 — page sectioning
  // ════════════════════════════════════════════════════════════════════

  /**
   * Cuts every page into a rows x columns grid.
   *
   * `gutters` carries a per-page cut fraction for the book-spread case, keyed
   * by source page number; a page with no entry is cut down the middle. The
   * caller runs the scan, because it needs a renderer and this does not.
   */
  planSections(
    pages: PdfPageItem[],
    options: SectionGridOptions,
    gutters?: Map<number, GutterResult>
  ): SectionPlan {
    const notices: SplitPlanNotice[] = [];
    const rows = Math.max(1, Math.floor(options.rows));
    const columns = Math.max(1, Math.floor(options.columns));
    const perPage = rows * columns;

    if (pages.length === 0) {
      return this.emptyPlan('sections', notices);
    }
    if (perPage > this.MAX_PIECES_PER_PAGE) {
      return this.emptyPlan('sections', [
        { kind: 'grid-too-fine', count: perPage, detail: String(this.MAX_PIECES_PER_PAGE) }
      ]);
    }
    if (perPage === 1) {
      // A 1x1 grid copies the document. Saying so beats writing it.
      return this.emptyPlan('sections', [{ kind: 'single-part' }]);
    }

    const pieces: SectionPiece[] = [];
    const piecesPerPage: number[] = [];
    let gutterUsedCount = 0;
    let gutterMissedCount = 0;

    /* A gutter is only meaningful for a spread cut once down the middle. */
    const gutterApplies = options.useGutterDetection && rows === 1 && columns === 2;

    pages.forEach((page, index) => {
      const pageNumber = index + 1;
      const pageBox: UserSpaceRect = { x: 0, y: 0, width: page.width, height: page.height };
      const rotation = (page.originalRotation || 0) + (page.rotation || 0);
      const vis = this.visualSize(pageBox.width, pageBox.height, rotation);

      let splitFraction = 0.5;
      let gutterApplied = false;
      if (gutterApplies) {
        const found = gutters?.get(pageNumber);
        if (found?.found) {
          splitFraction = found.fraction;
          gutterApplied = true;
          gutterUsedCount++;
        } else if (gutters) {
          gutterMissedCount++;
        }
      }

      /*
       * Column edges, as fractions. The two-column gutter case is the only one
       * with uneven columns; every other grid divides evenly.
       */
      const columnEdges: number[] = [];
      if (gutterApplies) {
        columnEdges.push(0, splitFraction, 1);
      } else {
        for (let c = 0; c <= columns; c++) columnEdges.push(c / columns);
      }
      const rowEdges: number[] = [];
      for (let r = 0; r <= rows; r++) rowEdges.push(r / rows);

      const cells: { row: number; column: number }[] = [];
      if (options.order === 'ttb') {
        for (let c = 0; c < columns; c++) {
          for (let r = 0; r < rows; r++) cells.push({ row: r, column: c });
        }
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < columns; c++) cells.push({ row: r, column: c });
        }
      }

      for (const cell of cells) {
        const visual: VisualRect = {
          x: columnEdges[cell.column] * vis.width,
          y: rowEdges[cell.row] * vis.height,
          width: (columnEdges[cell.column + 1] - columnEdges[cell.column]) * vis.width,
          height: (rowEdges[cell.row + 1] - rowEdges[cell.row]) * vis.height
        };

        pieces.push({
          sourcePageNumber: pageNumber,
          outputIndex: pieces.length,
          row: cell.row,
          column: cell.column,
          cropBox: this.visualRectToUserRect(visual, pageBox, rotation),
          visual,
          widthPt: visual.width,
          heightPt: visual.height,
          gutterApplied: gutterApplied || undefined
        });
      }

      piecesPerPage[index] = cells.length;
    });

    if (gutterUsedCount > 0) {
      notices.push({ kind: 'gutter-applied', count: gutterUsedCount });
    }
    if (gutterApplies && gutterMissedCount > 0) {
      notices.push({ kind: 'gutter-not-found', count: gutterMissedCount });
    }

    return {
      mode: 'sections',
      pieces,
      notices,
      usable: pieces.length > 0,
      sourcePageCount: pages.length,
      piecesPerPage,
      totalPieces: pieces.length,
      tileGrid: { rows, columns }
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // B6 — gutter detection
  // ════════════════════════════════════════════════════════════════════

  /**
   * Column-by-column ink totals across a rendered page.
   *
   * A book scan's gutter is the one vertical band near the middle with
   * essentially no ink in it; this is the profile that band shows up in.
   */
  computeColumnProfile(
    data: Uint8ClampedArray | number[],
    width: number,
    height: number
  ): number[] {
    const profile = new Array(width).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = data[i + 3];
        if (alpha < 10) continue; // transparent reads as paper
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 245) profile[x]++;
      }
    }
    return profile;
  }

  /**
   * Finds the whitespace valley nearest the centre of a column profile.
   *
   * Only a band around the middle is searched — the margins at the outer edges
   * of a scan are emptier than the gutter and would win every time. Within that
   * band the longest run of near-empty columns is the gutter, and its centre is
   * the cut. A page with no such run reports `found: false` rather than
   * inventing a fraction, and the caller falls back to the midpoint and says so.
   */
  findGutterInProfile(
    profile: number[],
    options?: { searchBand?: number; inkTolerance?: number; minRunFraction?: number }
  ): GutterResult {
    const width = profile.length;
    if (width < 8) return { found: false, fraction: 0.5 };

    const band = options?.searchBand ?? 0.18; // +/- 18% around the centre
    const inkTolerance = options?.inkTolerance ?? 0.18;
    const minRunFraction = options?.minRunFraction ?? 0.004;

    const from = Math.max(0, Math.floor(width * (0.5 - band)));
    const to = Math.min(width - 1, Math.ceil(width * (0.5 + band)));
    if (to <= from) return { found: false, fraction: 0.5 };

    const pageMean = profile.reduce((a, b) => a + b, 0) / width;
    if (pageMean <= 0) {
      // A blank page has no gutter to find, and no content to misplace either.
      return { found: false, fraction: 0.5 };
    }

    const threshold = pageMean * inkTolerance;
    const minRun = Math.max(2, Math.floor(width * minRunFraction));

    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;

    for (let x = from; x <= to + 1; x++) {
      const low = x <= to && profile[x] <= threshold;
      if (low) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const length = x - runStart;
        /*
         * Ties go to the run nearest the centre: a scan often has a slim margin
         * inside the search band as well as the gutter, and the gutter is the
         * one in the middle.
         */
        const better =
          length > bestLength ||
          (length === bestLength &&
            Math.abs(runStart + length / 2 - width / 2) <
              Math.abs(bestStart + bestLength / 2 - width / 2));
        if (better) {
          bestStart = runStart;
          bestLength = length;
        }
        runStart = -1;
      }
    }

    if (bestStart < 0 || bestLength < minRun) {
      return { found: false, fraction: 0.5 };
    }

    const centre = bestStart + bestLength / 2;
    let valleyInk = 0;
    for (let x = bestStart; x < bestStart + bestLength; x++) valleyInk += profile[x];
    const valleyMean = valleyInk / bestLength;

    return {
      found: true,
      fraction: Math.min(0.95, Math.max(0.05, centre / width)),
      valleyRatio: valleyMean / pageMean
    };
  }

  /**
   * Renders each page and reads its gutter.
   *
   * Rendering needs a real canvas, so a page that cannot be rasterised here
   * simply has no entry in the returned map and is cut down the middle, which
   * the plan then reports.
   */
  async scanGutters(
    pages: PdfPageItem[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    options?: { signal?: AbortSignal; onProgress?: (p: SectioningProgress) => void }
  ): Promise<Map<number, GutterResult>> {
    const results = new Map<number, GutterResult>();
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      if (options?.signal?.aborted) {
        throw new Error('Gutter scan cancelled by user.');
      }

      const page = pages[i];
      const sourceDoc = sourceDocsMap.get(page.sourceDocId);
      if (sourceDoc?.pdfDoc) {
        try {
          const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
          const result = await this.scanPageGutter(pdfPage);
          if (result) results.set(i + 1, result);
        } catch {
          // No entry means the midpoint, and the plan says the scan missed it.
        }
      }

      options?.onProgress?.({
        phase: 'measuring',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  private async scanPageGutter(pdfPage: any): Promise<GutterResult | null> {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = this.GUTTER_SCAN_WIDTH / Math.max(1, baseViewport.width);
    const viewport = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, canvas, viewport } as any).promise;

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const profile = this.computeColumnProfile(image.data, canvas.width, canvas.height);
    return this.findGutterInProfile(profile);
  }

  // ════════════════════════════════════════════════════════════════════
  // B7 — poster tiling
  // ════════════════════════════════════════════════════════════════════

  /**
   * Works out how many sheets a page needs and where each one sits.
   *
   * Tiles step by one sheet minus the overlap, so every seam repeats the set
   * amount of the picture and the sheets can be trimmed and butted together.
   * The last tile in a row or column is pulled back against the page edge
   * rather than hanging off it, so its seam repeats more, never less.
   */
  planTiles(pages: PdfPageItem[], options: TilingOptions): SectionPlan {
    const notices: SplitPlanNotice[] = [];
    if (pages.length === 0) {
      return this.emptyPlan('tiles', notices);
    }

    const overlapPt = Math.max(0, options.overlapMm) * MM_TO_PT;
    const pieces: SectionPiece[] = [];
    const piecesPerPage: number[] = [];
    let fitsOneSheetCount = 0;
    let gridRows = 0;
    let gridColumns = 0;

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const pageNumber = index + 1;
      const pageBox: UserSpaceRect = { x: 0, y: 0, width: page.width, height: page.height };
      const rotation = (page.originalRotation || 0) + (page.rotation || 0);
      const vis = this.visualSize(pageBox.width, pageBox.height, rotation);

      const sheet = this.sheetSize(options, vis);
      const columns = this.tileCount(vis.width, sheet.width, overlapPt);
      const rows = this.tileCount(vis.height, sheet.height, overlapPt);

      gridRows = Math.max(gridRows, rows);
      gridColumns = Math.max(gridColumns, columns);

      if (rows * columns === 1) fitsOneSheetCount++;

      if (rows * columns > this.MAX_PIECES_PER_PAGE) {
        return this.emptyPlan('tiles', [
          {
            kind: 'grid-too-fine',
            count: rows * columns,
            detail: String(this.MAX_PIECES_PER_PAGE)
          }
        ]);
      }

      const xs = this.tileOffsets(vis.width, sheet.width, overlapPt, columns);
      const ys = this.tileOffsets(vis.height, sheet.height, overlapPt, rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const visual: VisualRect = {
            x: xs[c],
            y: ys[r],
            width: Math.min(sheet.width, vis.width),
            height: Math.min(sheet.height, vis.height)
          };
          pieces.push({
            sourcePageNumber: pageNumber,
            outputIndex: pieces.length,
            row: r,
            column: c,
            cropBox: this.visualRectToUserRect(visual, pageBox, rotation),
            visual,
            widthPt: visual.width,
            heightPt: visual.height
          });
        }
      }
      piecesPerPage[index] = rows * columns;
    }

    if (fitsOneSheetCount === pages.length) {
      notices.push({ kind: 'page-fits-one-sheet', count: fitsOneSheetCount });
    }
    if (pieces.length >= this.LARGE_SHEET_COUNT) {
      notices.push({ kind: 'large-sheet-count', count: pieces.length });
    }

    return {
      mode: 'tiles',
      pieces,
      notices,
      usable: pieces.length > 0,
      sourcePageCount: pages.length,
      piecesPerPage,
      totalPieces: pieces.length,
      tileGrid: { rows: gridRows, columns: gridColumns }
    };
  }

  /** The sheet, turned whichever way needs fewer of them when set to `auto`. */
  private sheetSize(
    options: TilingOptions,
    visual: { width: number; height: number }
  ): { width: number; height: number } {
    const portrait = PAPER_SIZES_PT[options.paper] ?? PAPER_SIZES_PT.A4;
    const landscape = { width: portrait.height, height: portrait.width };

    if (options.orientation === 'portrait') return portrait;
    if (options.orientation === 'landscape') return landscape;

    const overlapPt = Math.max(0, options.overlapMm) * MM_TO_PT;
    const count = (sheet: { width: number; height: number }) =>
      this.tileCount(visual.width, sheet.width, overlapPt) *
      this.tileCount(visual.height, sheet.height, overlapPt);

    return count(landscape) < count(portrait) ? landscape : portrait;
  }

  /**
   * Tiles needed to cover `span`, each `sheet` long, repeating `overlap`.
   *
   * The first tile covers a whole sheet and each one after it adds a sheet
   * minus the overlap, so this is what is left over divided by that step.
   */
  private tileCount(span: number, sheet: number, overlap: number): number {
    if (span <= sheet) return 1;
    const step = sheet - Math.min(overlap, sheet * 0.9);
    if (step <= 0) return 1;
    return Math.max(1, Math.ceil((span - overlap) / step));
  }

  private tileOffsets(span: number, sheet: number, overlap: number, count: number): number[] {
    if (count <= 1) return [0];
    const step = sheet - Math.min(overlap, sheet * 0.9);
    const offsets: number[] = [];
    for (let i = 0; i < count; i++) {
      // The last tile is pulled back onto the page instead of hanging off it.
      offsets.push(i === count - 1 ? Math.max(0, span - sheet) : i * step);
    }
    return offsets;
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Writes the plan as one document: a copy of the source page per piece, each
   * carrying its own CropBox.
   *
   * The page content is copied, never redrawn, so the output is as sharp as the
   * input was. Crop marks and tile numbers are the only things added, and only
   * when asked for.
   */
  async exportSectionedPdf(
    plan: SectionPlan,
    pages: PdfPageItem[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    outputName: string,
    decoration?: { cropMarks?: boolean; numbering?: boolean },
    onProgress?: (progress: SectioningProgress) => void,
    signal?: AbortSignal
  ): Promise<PdfExportResult> {
    if (!plan.usable || plan.pieces.length === 0) {
      throw new Error('No pieces to write.');
    }

    const target = await PDFDocument.create();
    const loaded = new Map<string, PDFDocument>();
    let font: any = null;
    const total = plan.pieces.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user.');
      }

      const piece = plan.pieces[i];
      const sourcePage = pages[piece.sourcePageNumber - 1];
      if (!sourcePage) continue;

      let sourcePdf = loaded.get(sourcePage.sourceDocId);
      if (!sourcePdf) {
        const sourceDoc = sourceDocsMap.get(sourcePage.sourceDocId);
        if (!sourceDoc) {
          throw new Error(`Source document ${sourcePage.sourceDocId} not found.`);
        }
        sourcePdf = await PDFDocument.load(sourceDoc.arrayBuffer.slice(0), {
          ignoreEncryption: true
        });
        loaded.set(sourcePage.sourceDocId, sourcePdf);
      }

      const [copied] = await target.copyPages(sourcePdf, [sourcePage.sourcePageIndex]);
      const added = target.addPage(copied);

      /*
       * Plans are laid out in a 0,0 space, because that is what the preview
       * draws and what the page item's width/height describe. A MediaBox that
       * starts somewhere else -- uncommon, but real, and the flip path already
       * meets it -- would put every crop box out by its origin, so the offset
       * goes on here, against the page actually being written.
       */
      let originX = 0;
      let originY = 0;
      try {
        const media = added.getMediaBox();
        originX = media.x;
        originY = media.y;
      } catch {
        // A MediaBox the source declared oddly is not worth failing the cut for.
      }

      const { x, y, width, height } = piece.cropBox;
      added.setCropBox(x + originX, y + originY, width, height);

      const rotation =
        ((sourcePage.originalRotation || 0) + (sourcePage.rotation || 0)) % 360;
      added.setRotation(degrees(rotation));

      const placed: UserSpaceRect = {
        x: x + originX,
        y: y + originY,
        width,
        height
      };

      if (decoration?.cropMarks) {
        this.drawCropMarks(added, placed);
      }
      if (decoration?.numbering) {
        if (!font) font = await target.embedFont(StandardFonts.Helvetica);
        this.drawTileLabel(added, placed, piece, rotation, font);
      }

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
    }

    if (signal?.aborted) {
      throw new Error('Export cancelled by user.');
    }

    const bytes = await target.save({ useObjectStreams: false });
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: plan.pieces.length
    };
  }

  /**
   * Corner marks just inside the tile, for trimming and butting sheets.
   *
   * Drawn at the four corners of the CropBox in user space. A set of four
   * corners is the same set whichever way the page is turned, so this needs no
   * rotation handling — unlike the label below.
   */
  private drawCropMarks(page: PDFPage, box: UserSpaceRect): void {
    const length = Math.min(18, Math.min(box.width, box.height) * 0.06);
    const inset = Math.min(6, length / 2);
    const ink = rgb(0.45, 0.45, 0.45);
    const thickness = 0.5;

    const corners: { x: number; y: number; dx: number; dy: number }[] = [
      { x: box.x + inset, y: box.y + inset, dx: 1, dy: 1 },
      { x: box.x + box.width - inset, y: box.y + inset, dx: -1, dy: 1 },
      { x: box.x + inset, y: box.y + box.height - inset, dx: 1, dy: -1 },
      { x: box.x + box.width - inset, y: box.y + box.height - inset, dx: -1, dy: -1 }
    ];

    for (const c of corners) {
      page.drawLine({
        start: { x: c.x, y: c.y },
        end: { x: c.x + c.dx * length, y: c.y },
        thickness,
        color: ink
      });
      page.drawLine({
        start: { x: c.x, y: c.y },
        end: { x: c.x, y: c.y + c.dy * length },
        thickness,
        color: ink
      });
    }
  }

  /**
   * A row/column label inside the tile, so a stack of sheets can be put back
   * together.
   *
   * Counter-rotated against the page's own /Rotate, or the label would come out
   * sideways on exactly the scanned pages most likely to need one.
   */
  private drawTileLabel(
    page: PDFPage,
    box: UserSpaceRect,
    piece: SectionPiece,
    rotation: number,
    font: any
  ): void {
    const text = `R${piece.row + 1}C${piece.column + 1}`;
    const size = 8;
    const pad = 10;
    const rot = this.normalizeRotation(rotation);

    /*
     * Anchor at the corner that reads as bottom-left once the page is turned,
     * so every tile's label sits in the same visual place.
     */
    let x: number;
    let y: number;
    switch (rot) {
      case 90:
        x = box.x + pad;
        y = box.y + pad;
        break;
      case 180:
        x = box.x + box.width - pad;
        y = box.y + box.height - pad;
        break;
      case 270:
        x = box.x + box.width - pad;
        y = box.y + box.height - pad;
        break;
      default:
        x = box.x + pad;
        y = box.y + pad;
    }

    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0.4, 0.4, 0.4),
      rotate: degrees(-rot)
    });
  }

  private emptyPlan(
    mode: 'sections' | 'tiles',
    notices: SplitPlanNotice[]
  ): SectionPlan {
    return {
      mode,
      pieces: [],
      notices,
      usable: false,
      sourcePageCount: 0,
      piecesPerPage: [],
      totalPieces: 0
    };
  }
}
