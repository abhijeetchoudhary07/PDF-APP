import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import {
  LayoutNotice,
  LayoutOutput,
  LayoutProgress,
  ToneEstimate,
  ToneOptions,
  TonePass
} from '../models/pdf-layout.types';
import { PdfDrawPageUtil } from '../utilities/pdf-draw-page.util';
import '../utilities/pdfjs-worker';

/**
 * The slice of a pdf.js page this service uses.
 *
 * Structural rather than the imported `PDFPageProxy`: pdf.js's own render
 * options type does not include the `canvas` property its v6 runtime requires,
 * so the call site has to widen it anyway, and naming only what is used keeps
 * the renderer swappable in a test.
 */
type PdfjsPageLike = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: Record<string, unknown>) => { promise: Promise<void> };
};

/**
 * Tone passes — D7. Grayscale, invert and high contrast over a whole document.
 *
 * This is the one pass in Part D that rasterises, and that changes what the
 * file *is*: the output has no text layer, so nothing in it can be selected,
 * searched, copied or read by a screen reader, and a page of body text can
 * easily come out several times larger than it went in. Neither of those is
 * acceptable as a surprise, so:
 *
 *   • `advanceNotices()` returns the warning before anything runs, for the
 *     screen to show next to the export button rather than in the result.
 *   • `estimate()` renders one page and measures it, so the size on screen is
 *     a measurement rather than a guess.
 *
 * There is no vector route to this. A colour operator is not a document-wide
 * setting in PDF — it is thousands of operands spread through every content
 * stream, inside form XObjects, patterns, shadings and embedded images — so
 * "make this document grey" genuinely means re-rendering it.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfToneService {
  readonly MIN_DPI = 72;
  readonly MAX_DPI = 300;

  /**
   * How hard the high-contrast curve pushes away from the mid-point.
   *
   * Three is steep enough to lift a faint pencil scan into readable black
   * without the hard thresholding that eats thin strokes and leaves text
   * edges jagged — a binary cut looks sharper on a thumbnail and worse at
   * reading size.
   */
  private readonly CONTRAST_GAIN = 3;

  /** Resolution the estimate and the export both use, clamped to a sane range. */
  resolveDpi(dpi: number): number {
    if (!Number.isFinite(dpi)) return 150;
    return Math.min(this.MAX_DPI, Math.max(this.MIN_DPI, Math.round(dpi)));
  }

  /**
   * The warnings a tone pass carries, available before it is run.
   *
   * Returned rather than thrown or logged: the screen puts these above the
   * export button, which is the only place a "this cannot be undone" notice
   * does any good.
   */
  advanceNotices(): LayoutNotice[] {
    return [{ kind: 'raster-output' }];
  }

  /**
   * Applies a tone pass to RGBA pixels, in place.
   *
   * Luminance is the BT.601 weighting (0.299/0.587/0.114) rather than a flat
   * average of the channels: a flat average turns saturated blue ink almost
   * black and yellow highlighter almost white, which is backwards.
   */
  applyTone(
    data: Uint8ClampedArray | Uint8Array,
    pass: TonePass,
    threshold = 150
  ): void {
    const mid = Math.min(255, Math.max(0, Math.round(threshold)));

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (pass === 'invert') {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
        continue;
      }

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      if (pass === 'grayscale') {
        const v = Math.round(luma);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        continue;
      }

      // high-contrast: grey first, then a steep curve about the mid-point.
      const stretched = (luma - mid) * this.CONTRAST_GAIN + 128;
      const v = Math.round(Math.min(255, Math.max(0, stretched)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  /**
   * Renders one page at the chosen settings and reports what the whole
   * document would come to.
   *
   * Measured, not modelled: the first page is actually rendered and encoded,
   * and the number on screen is that page's bytes times the page count plus a
   * small allowance for the document structure. A 2% structural allowance is
   * generous for a file whose weight is entirely in its images.
   */
  async estimate(
    buffer: ArrayBuffer,
    options: ToneOptions,
    signal?: AbortSignal
  ): Promise<ToneEstimate> {
    const empty: ToneEstimate = {
      samplePageBytes: 0,
      estimatedBytes: 0,
      pageCount: 0,
      samplePixels: { width: 0, height: 0 }
    };

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return {
        ...empty,
        unavailableReason: 'This device cannot render a sample page here.'
      };
    }

    const pdfjsLib = await import('pdfjs-dist');
    /*
     * The loading task owns the worker; `PDFDocumentProxy` has no `destroy()`
     * in pdfjs 6, so the task is what has to be closed.
     */
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdf = await task.promise;

    try {
      const pageCount = pdf.numPages;
      if (pageCount === 0) return empty;
      if (signal?.aborted) throw new Error('Estimate cancelled by user.');

      const page = await pdf.getPage(1);
      const rendered = await this.renderTonedPage(page as unknown as PdfjsPageLike, options);
      if (!rendered) {
        return {
          ...empty,
          pageCount,
          unavailableReason: 'This device cannot render a sample page here.'
        };
      }

      const samplePageBytes = this.base64Bytes(rendered.dataUrl);

      return {
        samplePageBytes,
        estimatedBytes: Math.round(samplePageBytes * pageCount * 1.02),
        pageCount,
        samplePixels: { width: rendered.width, height: rendered.height }
      };
    } finally {
      try {
        await task.destroy();
      } catch {
        // A document that will not close is not worth failing the estimate for.
      }
    }
  }

  /**
   * Writes the toned document.
   *
   * Each page becomes one image on a page of exactly the original's visual
   * size, so the output measures the same and prints the same. A page that
   * will not rasterise on this device is copied across untouched and reported
   * — a document that is nine-tenths grey and says so is better than one that
   * silently lost a page.
   */
  async exportToned(
    buffer: ArrayBuffer,
    options: ToneOptions,
    outputName: string,
    onProgress?: (p: LayoutProgress) => void,
    signal?: AbortSignal
  ): Promise<LayoutOutput> {
    const notices: LayoutNotice[] = this.advanceNotices();
    const source = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    const sourcePages = source.getPages();
    const total = sourcePages.length;
    if (total === 0) throw new Error('This document has no pages.');

    const canRender =
      typeof document !== 'undefined' && typeof document.createElement === 'function';

    const target = await PDFDocument.create();
    const skipped: number[] = [];

    const pdfjsLib = canRender ? await import('pdfjs-dist') : undefined;
    const task = pdfjsLib
      ? pdfjsLib.getDocument({
          data: new Uint8Array(buffer.slice(0))
        } as Parameters<typeof pdfjsLib.getDocument>[0])
      : undefined;
    const pdf = task ? await task.promise : undefined;

    try {
      for (let i = 0; i < total; i++) {
        if (signal?.aborted) throw new Error('Tone pass cancelled by user.');

        const sourcePage = sourcePages[i];
        const box = PdfDrawPageUtil.mediaBoxOf(sourcePage);
        const rotation = PdfDrawPageUtil.normalizeRotation(sourcePage.getRotation().angle);
        const visual = PdfDrawPageUtil.visualSize(box.width, box.height, rotation);

        let drawn = false;
        if (pdf) {
          try {
            const page = await pdf.getPage(i + 1);
            const rendered = await this.renderTonedPage(
              page as unknown as PdfjsPageLike,
              options
            );
            if (rendered) {
              const image = await target.embedJpg(rendered.dataUrl);
              const outputPage = target.addPage([visual.width, visual.height]);
              outputPage.drawImage(image, {
                x: 0,
                y: 0,
                width: visual.width,
                height: visual.height
              });
              drawn = true;
            }
          } catch {
            drawn = false;
          }
        }

        if (!drawn) {
          const [copied] = await target.copyPages(source, [i]);
          target.addPage(copied);
          skipped.push(i + 1);
        }

        onProgress?.({
          phase: 'rendering',
          completed: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100)
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      if (task) {
        try {
          await task.destroy();
        } catch {
          // See above: a close that fails does not invalidate the output.
        }
      }
    }

    if (skipped.length > 0) {
      notices.push({
        kind: 'raster-page-skipped',
        count: skipped.length,
        pageNumbers: skipped
      });
    }

    const bytes = await target.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });
    const first = target.getPageCount() > 0 ? target.getPage(0) : undefined;

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: target.getPageCount(),
      sourcePageCount: total,
      notices,
      outputSize: first ? { width: first.getWidth(), height: first.getHeight() } : undefined
    };
  }

  /**
   * Renders one pdfjs page, applies the tone and encodes it.
   *
   * Returns undefined rather than throwing when there is no usable 2D canvas,
   * which is the headless and locked-down-browser case; the caller copies the
   * page instead and reports it.
   */
  private async renderTonedPage(
    page: PdfjsPageLike,
    options: ToneOptions
  ): Promise<{ dataUrl: string; width: number; height: number } | undefined> {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return undefined;
    }

    const dpi = this.resolveDpi(options.dpi);
    const viewport = page.getViewport({ scale: dpi / 72 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return undefined;

    // White behind the page: an inverted transparent background would
    // otherwise come out as a black border round white paper.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.applyTone(image.data, options.pass, options.threshold);
    ctx.putImageData(image, 0, 0);

    const quality = Math.min(1, Math.max(0.3, options.quality));
    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      width: canvas.width,
      height: canvas.height
    };
  }

  /** Decoded byte length of a base64 data URI, without decoding it. */
  private base64Bytes(dataUrl: string): number {
    const comma = dataUrl.indexOf(',');
    const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
}
