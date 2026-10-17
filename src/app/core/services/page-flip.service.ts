import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { PdfPageItem, PdfSourceDocument } from '../models/pdf-organization.types';
import {
  PageFlipAxis,
  PageFlipMatrix,
  PageFlipPreview,
  PageFlipState,
  PageFlipTransform
} from '../models/page-flip.types';

/**
 * Horizontal and vertical page flipping.
 *
 * The flip is a content-stream transform, not a re-render: the source page is
 * embedded as a Form XObject and drawn through a mirroring `cm` matrix, so
 * vector art stays vector and text stays text — selectable, searchable and
 * extractable in the output, which rasterising would destroy.
 *
 * A flip is deliberately NOT the same thing as a rotation. `/Rotate 180`
 * turns the sheet and leaves the text readable; flipping both axes mirrors it.
 * Nothing here touches the existing rotation path.
 */
@Injectable({
  providedIn: 'root'
})
export class PageFlipService {
  /** The no-op transform, returned whenever neither axis is set. */
  readonly IDENTITY_MATRIX: PageFlipMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  /**
   * The matrix that mirrors a `boxWidth` x `boxHeight` box about the requested
   * axis, in the box's own coordinate space.
   *
   * Horizontal mirrors about x = w/2, so (x, y) → (w - x, y):
   *     -1 0 0 1 w 0 cm
   * Vertical mirrors about y = h/2, so (x, y) → (x, h - y):
   *     1 0 0 -1 0 h cm
   * Both composes the two, so (x, y) → (w - x, h - y):
   *     -1 0 0 -1 w h cm
   *
   * The translate components are what keep the mirrored content on the page:
   * a bare negative scale would push it off the left or bottom edge.
   */
  getFlipMatrix(
    axis: PageFlipAxis | PageFlipState,
    boxWidth: number,
    boxHeight: number
  ): PageFlipMatrix {
    const state = this.toState(axis);

    if (!state.horizontal && !state.vertical) {
      return { ...this.IDENTITY_MATRIX };
    }

    return {
      a: state.horizontal ? -1 : 1,
      b: 0,
      c: 0,
      d: state.vertical ? -1 : 1,
      e: state.horizontal ? boxWidth : 0,
      f: state.vertical ? boxHeight : 0
    };
  }

  /**
   * The matrix plus the box it applies to, which is what the draw path and the
   * preview both need.
   */
  getFlipTransform(
    axis: PageFlipAxis | PageFlipState,
    boxWidth: number,
    boxHeight: number
  ): PageFlipTransform {
    const state = this.toState(axis);
    const matrix = this.getFlipMatrix(state, boxWidth, boxHeight);
    return {
      state,
      matrix,
      boxWidth,
      boxHeight,
      isIdentity: !state.horizontal && !state.vertical
    };
  }

  /**
   * Applies `axis` to an existing flip state.
   *
   * Flipping is an involution: the same axis twice is the identity, so this
   * toggles rather than accumulates. 'both' toggles each axis independently,
   * which means a horizontally-flipped page asked to flip 'both' ends up
   * vertically flipped only.
   */
  composeState(current: PageFlipState | undefined, axis: PageFlipAxis): PageFlipState {
    const base: PageFlipState = {
      horizontal: current?.horizontal === true,
      vertical: current?.vertical === true
    };

    if (axis === 'horizontal' || axis === 'both') {
      base.horizontal = !base.horizontal;
    }
    if (axis === 'vertical' || axis === 'both') {
      base.vertical = !base.vertical;
    }

    return base;
  }

  /** True when a page item carries any flip. */
  hasFlip(page: Pick<PdfPageItem, 'flipHorizontal' | 'flipVertical'> | undefined): boolean {
    return page?.flipHorizontal === true || page?.flipVertical === true;
  }

  /** Reads the flip state off a page item. */
  stateOf(page: Pick<PdfPageItem, 'flipHorizontal' | 'flipVertical'> | undefined): PageFlipState {
    return {
      horizontal: page?.flipHorizontal === true,
      vertical: page?.flipVertical === true
    };
  }

  /**
   * Copies `sourcePage` into `targetDoc` with the flip applied, and returns the
   * new page.
   *
   * The source page is embedded as a Form XObject with an explicit bounding box
   * taken from its MediaBox, so a MediaBox that does not start at the origin is
   * normalised instead of clipped — no content is dropped. A CropBox that
   * differs from the MediaBox is mirrored to match, so the visible area still
   * frames the same content after the flip.
   *
   * The caller owns the /Rotate entry: rotation is applied to the page the way
   * the existing export path applies it, after this returns. /Rotate is applied
   * by the viewer after the content is composed, so flip-then-rotate is the
   * order a reader sees.
   */
  async drawFlippedPage(
    targetDoc: PDFDocument,
    sourcePage: PDFPage,
    state: PageFlipState
  ): Promise<{ page: PDFPage; originNormalized: boolean }> {
    const mediaBox = sourcePage.getMediaBox();
    const width = mediaBox.width;
    const height = mediaBox.height;

    const embedded = await targetDoc.embedPage(sourcePage, {
      left: mediaBox.x,
      bottom: mediaBox.y,
      right: mediaBox.x + width,
      top: mediaBox.y + height
    });

    const newPage = targetDoc.addPage([width, height]);
    const matrix = this.getFlipMatrix(state, width, height);

    /*
     * pdf-lib's drawPage emits `translate(x, y)` then `scale(xScale, yScale)`,
     * which composes to exactly the matrix above — the negative scales are
     * passed through to the `cm` operator untouched.
     */
    newPage.drawPage(embedded, {
      x: matrix.e,
      y: matrix.f,
      xScale: matrix.a,
      yScale: matrix.d
    });

    let cropBox: { x: number; y: number; width: number; height: number } | undefined;
    try {
      cropBox = sourcePage.getCropBox();
    } catch {
      cropBox = undefined;
    }

    if (
      cropBox &&
      (cropBox.x !== mediaBox.x ||
        cropBox.y !== mediaBox.y ||
        cropBox.width !== width ||
        cropBox.height !== height)
    ) {
      // Move the CropBox into the normalised 0,0 space, then mirror it.
      const relX = cropBox.x - mediaBox.x;
      const relY = cropBox.y - mediaBox.y;
      const flippedX = state.horizontal ? width - relX - cropBox.width : relX;
      const flippedY = state.vertical ? height - relY - cropBox.height : relY;
      try {
        newPage.setCropBox(flippedX, flippedY, cropBox.width, cropBox.height);
      } catch {
        // A CropBox the source declared oddly is not worth failing the flip for.
      }
    }

    return {
      page: newPage,
      originNormalized: mediaBox.x !== 0 || mediaBox.y !== 0
    };
  }

  /**
   * Renders a rasterised preview of what `state` would do to `page`.
   *
   * The preview mirrors the canvas with the same matrix the output uses, so
   * what it shows and what gets written cannot drift apart. It is a preview
   * only — the saved PDF is never rasterised.
   *
   * Returns `unavailableReason` rather than throwing when there is no 2D
   * canvas (headless test runs, or a browser that refuses the context): the
   * flip still works, only the picture is missing.
   */
  async renderFlipPreview(
    page: PdfPageItem,
    sourceDocsMap: Map<string, PdfSourceDocument>,
    state: PageFlipState,
    scale = 0.7
  ): Promise<PageFlipPreview> {
    const sourceDoc = sourceDocsMap.get(page.sourceDocId);
    const transform = this.getFlipTransform(state, page.width, page.height);

    const base: PageFlipPreview = {
      displayNumber: page.displayNumber,
      state: transform.state,
      transform
    };

    if (!sourceDoc?.pdfDoc) {
      return { ...base, unavailableReason: 'This page could not be rasterised for preview.' };
    }

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return { ...base, unavailableReason: 'Preview rendering is not available here.' };
    }

    try {
      const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
      const viewport = pdfPage.getViewport({ scale });
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) {
        return { ...base, unavailableReason: 'Preview rendering is not available here.' };
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      /*
       * The same mirror, in canvas space. Canvas y grows downward where PDF y
       * grows upward, but a mirror about a centre line is unaffected by that:
       * the horizontal flip is still scale(-1, 1) about x = w/2 and the
       * vertical flip still scale(1, -1) about y = h/2.
       */
      ctx.save();
      ctx.translate(
        transform.state.horizontal ? width : 0,
        transform.state.vertical ? height : 0
      );
      ctx.scale(transform.state.horizontal ? -1 : 1, transform.state.vertical ? -1 : 1);

      await pdfPage.render({
        canvasContext: ctx,
        canvas,
        viewport
      }).promise;

      ctx.restore();

      return { ...base, imageUrl: canvas.toDataURL('image/jpeg', 0.85) };
    } catch {
      return { ...base, unavailableReason: 'This page could not be rasterised for preview.' };
    }
  }

  private toState(axis: PageFlipAxis | PageFlipState): PageFlipState {
    if (typeof axis === 'string') {
      return {
        horizontal: axis === 'horizontal' || axis === 'both',
        vertical: axis === 'vertical' || axis === 'both'
      };
    }
    return { horizontal: axis.horizontal === true, vertical: axis.vertical === true };
  }
}
