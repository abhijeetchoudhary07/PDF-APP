import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFContentStream,
  PDFDocument,
  PDFName,
  PDFPage,
  concatTransformationMatrix,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  setGraphicsState
} from 'pdf-lib';
import {
  OverlayAssignment,
  OverlayLayer,
  OverlayNotice,
  OverlayOptions,
  OverlayOutput,
  OverlayPlan,
  OverlayProgress
} from '../models/pdf-overlay.types';
import { PdfDrawPageUtil, EmbeddedSourcePage } from '../utilities/pdf-draw-page.util';

/**
 * Overlay and underlay — C6.
 *
 * The base document is always copied page by page with `copyPages`, so its
 * text, its structure and (in the foreground case) its links and form fields
 * all survive. The overlay is embedded as a Form XObject and drawn through a
 * matrix: nothing is rasterised on either side.
 *
 * Foreground and background are not symmetrical, and the difference is worth
 * stating because it is the whole reason this file is longer than it looks:
 *
 *   • **Foreground** appends to the page's content stream. `page.drawPage()`
 *     does exactly that, and the page is otherwise untouched.
 *
 *   • **Background** has to get *in front of* content that is already there.
 *     A content stream cannot be prepended to through the public API, so the
 *     draw is emitted as its own stream and `wrapContentStreams` puts it
 *     first. That rewrites the page's /Contents entry, which is why the
 *     underlay path reports the annotations it cannot carry — and why it is
 *     not simply used for both directions.
 *
 * Planning is separate and synchronous: `planMapping` returns which overlay
 * page covers which base page, so the screen can show the mapping and the
 * uncovered pages before anything is written.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfOverlayService {
  /** Aspect-ratio difference past which a shape mismatch is worth reporting. */
  private readonly ASPECT_TOLERANCE = 0.02;

  // ════════════════════════════════════════════════════════════════════
  // Mapping
  // ════════════════════════════════════════════════════════════════════

  /**
   * The flat sequence of overlay pages a mode produces, before it meets the
   * base document.
   *
   *   • `sequential` — every page of the first layer, then the next layer's.
   *     One overlay page per base page, in order: the pre-printed form case.
   *   • `interleaved` — one page from each layer in turn, which is how two
   *     alternating stamp sheets are applied.
   *   • `fixed-repeat` — each overlay page held for N base pages, which is how
   *     a letterhead covers a run of pages before the next letterhead takes
   *     over.
   */
  overlaySequence(
    layerPageCounts: number[],
    options: OverlayOptions
  ): Array<{ layerIndex: number; layerPageIndex: number }> {
    const counts = layerPageCounts.map(n => Math.max(0, Math.floor(n)));
    const flat: Array<{ layerIndex: number; layerPageIndex: number }> = [];

    if (options.mode === 'interleaved') {
      const rounds = counts.length > 0 ? Math.max(0, ...counts) : 0;
      for (let round = 0; round < rounds; round++) {
        for (let layerIndex = 0; layerIndex < counts.length; layerIndex++) {
          if (round < counts[layerIndex]) {
            flat.push({ layerIndex, layerPageIndex: round });
          }
        }
      }
      return flat;
    }

    for (let layerIndex = 0; layerIndex < counts.length; layerIndex++) {
      for (let pageIndex = 0; pageIndex < counts[layerIndex]; pageIndex++) {
        flat.push({ layerIndex, layerPageIndex: pageIndex });
      }
    }

    if (options.mode === 'fixed-repeat') {
      const repeat = Math.max(1, Math.floor(options.repeatCount));
      if (repeat === 1) return flat;

      const repeated: Array<{ layerIndex: number; layerPageIndex: number }> = [];
      for (const entry of flat) {
        for (let i = 0; i < repeat; i++) repeated.push({ ...entry });
      }
      return repeated;
    }

    return flat;
  }

  /**
   * Which overlay page covers which base page.
   *
   * An overlay shorter than the base document is the normal case, not an edge
   * case: `cycle` repeats the sequence so a one-page letterhead reaches every
   * page, and without it the remaining pages are left bare and reported. Either
   * way nothing is guessed at and nothing is silent.
   */
  planMapping(
    basePageCount: number,
    layerPageCounts: number[],
    options: OverlayOptions
  ): OverlayPlan {
    const pageCount = Math.max(0, Math.floor(basePageCount));
    const sequence = this.overlaySequence(layerPageCounts, options);
    const assignments: OverlayAssignment[] = [];
    const uncoveredPageNumbers: number[] = [];

    for (let i = 0; i < pageCount; i++) {
      const basePageNumber = i + 1;

      if (sequence.length === 0) {
        assignments.push({ basePageNumber, layerIndex: -1, layerPageIndex: 0 });
        uncoveredPageNumbers.push(basePageNumber);
        continue;
      }

      const index = options.cycle ? i % sequence.length : i;
      const entry = sequence[index];

      if (!entry) {
        assignments.push({ basePageNumber, layerIndex: -1, layerPageIndex: 0 });
        uncoveredPageNumbers.push(basePageNumber);
        continue;
      }

      assignments.push({
        basePageNumber,
        layerIndex: entry.layerIndex,
        layerPageIndex: entry.layerPageIndex
      });
    }

    return {
      assignments,
      basePageCount: pageCount,
      uncoveredPageNumbers,
      overlayPageCount: sequence.length
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Lays the overlays onto the base document.
   *
   * `previewOnly` writes just the first page, which is what the screen's
   * preview renders — the same code path as the real export, so what is on
   * screen is what gets saved.
   */
  async exportOverlaid(
    baseBuffer: ArrayBuffer,
    layers: OverlayLayer[],
    options: OverlayOptions,
    outputName: string,
    onProgress?: (p: OverlayProgress) => void,
    signal?: AbortSignal,
    previewOnly = false
  ): Promise<OverlayOutput> {
    const base = await PDFDocument.load(baseBuffer.slice(0), { ignoreEncryption: true });
    const basePages = base.getPages();
    if (basePages.length === 0) throw new Error('The base document has no pages.');
    if (layers.length === 0) throw new Error('No overlay document was chosen.');

    const notices: OverlayNotice[] = [];
    const layerDocs: PDFDocument[] = [];
    for (const layer of layers) {
      layerDocs.push(
        await PDFDocument.load(layer.buffer.slice(0), { ignoreEncryption: true })
      );
    }

    const plan = this.planMapping(
      basePages.length,
      layerDocs.map(doc => doc.getPageCount()),
      options
    );

    const target = await PDFDocument.create();
    const pageLimit = previewOnly ? Math.min(1, basePages.length) : basePages.length;

    /*
     * One embed per overlay page, reused across every base page it covers: a
     * one-page letterhead over 200 pages embeds once and is drawn 200 times,
     * rather than being embedded 200 times.
     */
    const embedCache = new Map<string, EmbeddedSourcePage | undefined>();
    const emptyOverlayPages = new Set<string>();
    const droppedAnnotationPages: number[] = [];
    const mismatchedPages: number[] = [];

    for (let i = 0; i < pageLimit; i++) {
      if (signal?.aborted) throw new Error('Overlay cancelled by user.');

      const [copied] = await target.copyPages(base, [i]);
      const page = target.addPage(copied);
      const assignment = plan.assignments[i];

      if (assignment && assignment.layerIndex >= 0) {
        const layer = layers[assignment.layerIndex];
        const layerDoc = layerDocs[assignment.layerIndex];
        const cacheKey = `${assignment.layerIndex}:${assignment.layerPageIndex}`;

        let embedded = embedCache.get(cacheKey);
        if (!embedCache.has(cacheKey)) {
          const overlayPage = layerDoc.getPage(assignment.layerPageIndex);
          embedded = PdfDrawPageUtil.hasContents(overlayPage)
            ? await PdfDrawPageUtil.embedSource(target, overlayPage)
            : undefined;
          if (!embedded) emptyOverlayPages.add(cacheKey);
          embedCache.set(cacheKey, embedded);
        }

        if (embedded) {
          const placed = this.placeOverlay(page, embedded, layer, options);
          if (placed.aspectMismatch) mismatchedPages.push(i + 1);
          if (placed.annotationsDropped) droppedAnnotationPages.push(i + 1);
        }
      }

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total: pageLimit,
        percent: Math.round(((i + 1) / pageLimit) * 100)
      });
    }

    if (plan.uncoveredPageNumbers.length > 0 && !previewOnly) {
      notices.push({
        kind: 'uncovered-pages',
        count: plan.uncoveredPageNumbers.length,
        pageNumbers: plan.uncoveredPageNumbers
      });
    }
    if (options.cycle && plan.overlayPageCount > 0 && plan.basePageCount > plan.overlayPageCount) {
      notices.push({
        kind: 'overlay-cycled',
        count: Math.ceil(plan.basePageCount / plan.overlayPageCount)
      });
    }
    if (emptyOverlayPages.size > 0) {
      notices.push({ kind: 'empty-overlay-page', count: emptyOverlayPages.size });
    }
    if (droppedAnnotationPages.length > 0) {
      notices.push({
        kind: 'annotations-dropped',
        count: droppedAnnotationPages.length,
        pageNumbers: droppedAnnotationPages
      });
    }
    if (mismatchedPages.length > 0) {
      notices.push({
        kind: 'aspect-mismatch',
        count: mismatchedPages.length,
        pageNumbers: mismatchedPages
      });
    }

    const bytes = await target.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: target.getPageCount(),
      basePageCount: basePages.length,
      notices
    };
  }

  /**
   * Draws one overlay onto one base page, over or under its content.
   *
   * Returns what the caller has to report: whether the two pages are different
   * shapes, and whether putting the overlay underneath cost the page its
   * annotations.
   */
  private placeOverlay(
    page: PDFPage,
    embedded: EmbeddedSourcePage,
    layer: OverlayLayer,
    options: OverlayOptions
  ): { aspectMismatch: boolean; annotationsDropped: boolean } {
    const box = PdfDrawPageUtil.mediaBoxOf(page);
    const rotation = PdfDrawPageUtil.normalizeRotation(page.getRotation().angle);
    const visual = PdfDrawPageUtil.visualSize(box.width, box.height, rotation);

    const baseAspect = visual.height > 0 ? visual.width / visual.height : 1;
    const overlayAspect =
      embedded.visualHeight > 0 ? embedded.visualWidth / embedded.visualHeight : 1;
    const aspectMismatch =
      Math.abs(baseAspect - overlayAspect) / Math.max(baseAspect, 0.0001) >
      this.ASPECT_TOLERANCE;

    const fit = layer.scaleToFit
      ? PdfDrawPageUtil.fitScale(
          embedded.visualWidth,
          embedded.visualHeight,
          visual.width,
          visual.height,
          'contain'
        )
      : { scaleX: 1, scaleY: 1 };

    const drawnWidth = embedded.visualWidth * fit.scaleX;
    const drawnHeight = embedded.visualHeight * fit.scaleY;

    /*
     * Centred in the base page's *visual* box, then shifted by the box origin:
     * a base page whose MediaBox does not start at (0,0) would otherwise get
     * the overlay offset by that origin.
     */
    const centred = PdfDrawPageUtil.centreIn(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      rotation % 180 === 0 ? drawnWidth : drawnHeight,
      rotation % 180 === 0 ? drawnHeight : drawnWidth
    );

    const placement = PdfDrawPageUtil.placement(embedded, {
      x: centred.x,
      y: centred.y,
      scaleX: fit.scaleX,
      scaleY: fit.scaleY,
      /*
       * The base page's own rotation is applied by the reader *after* the
       * content is composed, so the overlay has to be turned the same way to
       * come out the right way up on a rotated page.
       */
      extraRotation: rotation
    });

    const opacity = Math.min(1, Math.max(0, layer.opacity));

    if (options.position === 'foreground') {
      page.drawPage(embedded.embedded, {
        x: placement.x,
        y: placement.y,
        xScale: placement.xScale,
        yScale: placement.yScale,
        rotate: degrees(placement.rotate),
        ...(opacity < 1 ? { opacity } : {})
      });
      return { aspectMismatch, annotationsDropped: false };
    }

    const annotationsDropped = this.drawUnderneath(page, embedded, placement, opacity);
    return { aspectMismatch, annotationsDropped };
  }

  /**
   * Puts the overlay behind the page's existing content.
   *
   * The draw is emitted as its own content stream and `wrapContentStreams`
   * makes it the first one, so the base content paints over it. The graphics
   * state is pushed and popped around it, so nothing the overlay sets — a
   * transform, an alpha — can leak into the page's own content and change how
   * the base document looks.
   *
   * Returns true when the page carried annotations, which this path cannot
   * carry across.
   */
  private drawUnderneath(
    page: PDFPage,
    embedded: EmbeddedSourcePage,
    placement: ReturnType<typeof PdfDrawPageUtil.placement>,
    opacity: number
  ): boolean {
    const context = page.doc.context;
    const xObjectKey = page.node.newXObject('Underlay', embedded.embedded.ref);

    const operators = [pushGraphicsState()];

    if (opacity < 1) {
      const gsKey = page.node.newExtGState(
        'UnderlayGS',
        context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity })
      );
      operators.push(setGraphicsState(gsKey));
    }

    // The same translate / rotate / scale order pdf-lib's own drawPage emits.
    operators.push(concatTransformationMatrix(1, 0, 0, 1, placement.x, placement.y));
    if (placement.rotate !== 0) {
      const radians = (placement.rotate * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      operators.push(concatTransformationMatrix(cos, sin, -sin, cos, 0, 0));
    }
    operators.push(
      concatTransformationMatrix(placement.xScale, 0, 0, placement.yScale, 0, 0)
    );
    operators.push(drawObject(xObjectKey));
    operators.push(popGraphicsState());

    const startRef = context.register(
      PDFContentStream.of(context.obj({}), operators, true)
    );
    const endRef = context.register(PDFContentStream.of(context.obj({}), [], true));

    const annots = page.node.Annots();
    const hadAnnotations = !!annots && annots.size() > 0;

    page.node.wrapContentStreams(startRef, endRef);

    /*
     * The annotations are still listed on the page, but their appearance
     * streams are not part of the content this rewrote, so a reader that
     * regenerates them can place them over the underlay in a different order
     * than the original. Reported rather than claimed as unchanged.
     */
    return hadAnnotations;
  }

  /** True when a document declares an outline, used by the screen's summary. */
  hasOutline(doc: PDFDocument): boolean {
    try {
      return doc.catalog.get(PDFName.of('Outlines')) !== undefined;
    } catch {
      return false;
    }
  }
}
