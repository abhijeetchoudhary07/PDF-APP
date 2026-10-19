import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream
} from 'pdf-lib';
import {
  ColourPathOptions,
  DedupePlan,
  DownsampleOptions,
  DownsamplePlan,
  DownsampleRow,
  DpiCeiling,
  DuplicateImageGroup,
  FIT_STEP_ORDER,
  FitLimitOptions,
  FitLimitResult,
  FitStepKind,
  FitStepResult,
  OptimizeNotice,
  OptimizeOutput,
  OptimizeProgress,
  PdfImageInventory,
  ProofPageRow,
  ProofRender,
  ProofSummary,
  StructureOptions,
  StructureReport,
  TextLayerReport,
  VerificationResult,
  defaultStructureOptions
} from '../models/pdf-optimize.types';
import { PdfImageInventoryService } from './pdf-image-inventory.service';
import '../utilities/pdfjs-worker';

/**
 * The lossless and opt-in size passes — F1, F2, F3 and F6.
 *
 * None of this touches the compression that already ships.
 * `CompressionService.compressToExactKB` and
 * `PdfService.compressPdfToExactKB` keep their three presets and their
 * target-KB behaviour exactly as they are; every method here is a separate
 * path somebody chooses on purpose.
 *
 * The rule the whole file is built around: **a pass that cannot prove what it
 * did does not ship its output.** Dropping an object that turned out to be
 * live, or collapsing two images that were not really identical, produces a
 * file that opens cleanly and is quietly missing something — the worst kind of
 * bug for a document somebody is about to submit. So each destructive pass
 * verifies its result first and reports the method it used to do so.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfOptimizerService {
  private inventoryService = inject(PdfImageInventoryService);

  /** Pages the verifier compares, at most. */
  readonly MAX_VERIFY_PAGES = 40;

  /** Pages the text-layer probe samples. */
  readonly TEXT_PROBE_PAGES = 5;

  /** A document with fewer characters than this has no usable text layer. */
  readonly TEXT_LAYER_MIN_CHARS = 20;

  // ════════════════════════════════════════════════════════════════════
  // F1 — DPI ceiling: planning
  // ════════════════════════════════════════════════════════════════════

  /**
   * What a ceiling would do, worked out before anything is rewritten.
   *
   * Every image gets a row, including the ones nothing will happen to and why
   * — "already under", "not re-encodable", "is a mask". A report that only
   * lists what changed leaves somebody wondering why their biggest scan was
   * ignored.
   */
  planDownsample(
    inventory: PdfImageInventory,
    options: DownsampleOptions
  ): DownsamplePlan {
    const rows: DownsampleRow[] = [];

    if (options.ceiling === 'none') {
      return {
        rows: inventory.images.map(image => ({
          imageKey: image.key,
          pageNumbers: this.inventoryService.pagesFor(inventory, image.key),
          originalPixels: { width: image.pixelWidth, height: image.pixelHeight },
          newPixels: { width: image.pixelWidth, height: image.pixelHeight },
          originalDpi: Math.round(this.inventoryService.peakDpiFor(inventory, image.key)),
          newDpi: Math.round(this.inventoryService.peakDpiFor(inventory, image.key)),
          originalBytes: image.streamBytes,
          newBytes: image.streamBytes,
          savedBytes: 0,
          skippedReason: 'already-under'
        })),
        candidateCount: 0,
        estimatedSavedBytes: 0,
        totalImageBytes: inventory.totalImageBytes
      };
    }

    const ceiling = options.ceiling;
    let candidateCount = 0;
    let estimatedSavedBytes = 0;

    for (const image of inventory.images) {
      const pageNumbers = this.inventoryService.pagesFor(inventory, image.key);
      const peakDpi = this.inventoryService.peakDpiFor(inventory, image.key);

      const row: DownsampleRow = {
        imageKey: image.key,
        pageNumbers,
        originalPixels: { width: image.pixelWidth, height: image.pixelHeight },
        newPixels: { width: image.pixelWidth, height: image.pixelHeight },
        originalDpi: Math.round(peakDpi),
        newDpi: Math.round(peakDpi),
        originalBytes: image.streamBytes,
        newBytes: image.streamBytes,
        savedBytes: 0
      };

      if (image.isMask) {
        row.skippedReason = 'is-mask';
        rows.push(row);
        continue;
      }
      if (!image.reEncodable) {
        row.skippedReason = 'not-re-encodable';
        rows.push(row);
        continue;
      }
      if (peakDpi <= 0 || peakDpi <= ceiling) {
        row.skippedReason = 'already-under';
        rows.push(row);
        continue;
      }

      /*
       * The scale is the ratio of the ceiling to the resolution it is actually
       * printed at — judged by its *largest* placement, so a logo used once
       * small and once large is not blurred to suit the small one.
       */
      const scale = ceiling / peakDpi;
      const newWidth = Math.max(1, Math.round(image.pixelWidth * scale));
      const newHeight = Math.max(1, Math.round(image.pixelHeight * scale));

      /*
       * Bytes scale with pixel count, roughly. This is an estimate and the UI
       * says so — the real figure comes back in the report after the run.
       */
      const pixelRatio =
        (newWidth * newHeight) / Math.max(1, image.pixelWidth * image.pixelHeight);
      const estimatedBytes = Math.round(image.streamBytes * pixelRatio);
      const saved = image.streamBytes - estimatedBytes;

      if (saved <= 0 || saved / Math.max(1, image.streamBytes) < options.minGain) {
        row.skippedReason = 'no-gain';
        rows.push(row);
        continue;
      }

      row.newPixels = { width: newWidth, height: newHeight };
      row.newDpi = Math.round(ceiling);
      row.newBytes = estimatedBytes;
      row.savedBytes = saved;
      rows.push(row);

      candidateCount++;
      estimatedSavedBytes += saved;
    }

    return {
      rows,
      candidateCount,
      estimatedSavedBytes,
      totalImageBytes: inventory.totalImageBytes
    };
  }

  /** The pixel size an image is resampled to, for one ceiling. */
  targetPixelsFor(
    pixelWidth: number,
    pixelHeight: number,
    currentDpi: number,
    ceiling: DpiCeiling
  ): { width: number; height: number } {
    if (ceiling === 'none' || currentDpi <= 0 || currentDpi <= ceiling) {
      return { width: pixelWidth, height: pixelHeight };
    }
    const scale = ceiling / currentDpi;
    return {
      width: Math.max(1, Math.round(pixelWidth * scale)),
      height: Math.max(1, Math.round(pixelHeight * scale))
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // F1 — DPI ceiling: writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Resamples the images a ceiling applies to, and leaves everything else
   * exactly as it was.
   *
   * Only the image streams are rewritten — page content, text, vector art and
   * the document structure are untouched — which is what keeps the text in a
   * scanned-and-OCR'd document selectable after the scan behind it shrinks.
   * `ceiling: 'none'` returns the input bytes unchanged.
   */
  async exportDownsampled(
    buffer: ArrayBuffer,
    options: DownsampleOptions,
    outputName: string,
    callbacks?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<OptimizeOutput> {
    const originalSizeBytes = buffer.byteLength;
    const notices: OptimizeNotice[] = [];

    if (options.ceiling === 'none') {
      notices.push({ kind: 'nothing-to-do' });
      return this.unchanged(buffer, outputName, notices);
    }

    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    const inventory = await this.inventoryService.inventory(doc, {
      onProgress: callbacks?.onProgress,
      signal: callbacks?.signal
    });

    const plan = this.planDownsample(inventory, options);
    if (plan.candidateCount === 0) {
      notices.push({ kind: 'images-already-under', count: inventory.images.length });
      return this.unchanged(buffer, outputName, notices);
    }

    if (!this.canRaster()) {
      notices.push({ kind: 'resampling-unavailable' });
      return this.unchanged(buffer, outputName, notices);
    }

    const byKey = new Map(inventory.images.map(image => [image.key, image]));
    const targets = plan.rows.filter(row => !row.skippedReason);

    let done = 0;
    let skipped = 0;
    let resampled = 0;
    let savedBytes = 0;

    for (const row of targets) {
      if (callbacks?.signal?.aborted) throw new Error('Resampling cancelled by user.');

      const image = byKey.get(row.imageKey);
      const ref = this.refFromKey(doc, row.imageKey);
      if (!image || !ref) {
        skipped++;
        continue;
      }

      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFStream)) {
        skipped++;
        continue;
      }

      const encoded = await this.resampleStream(
        stream,
        row.newPixels.width,
        row.newPixels.height,
        options.quality
      );

      if (!encoded) {
        skipped++;
      } else if (encoded.length >= image.streamBytes) {
        /*
         * A resample that came out larger is thrown away. It happens on small
         * images and on art with flat colour, where JPEG does worse than the
         * Flate bitmap it replaced.
         */
        skipped++;
      } else {
        this.replaceWithJpeg(doc, ref, encoded, row.newPixels.width, row.newPixels.height);
        savedBytes += image.streamBytes - encoded.length;
        resampled++;
      }

      done++;
      callbacks?.onProgress?.({
        phase: 'writing',
        completed: done,
        total: targets.length,
        percent: Math.round((done / targets.length) * 100)
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (resampled > 0) {
      notices.push({ kind: 'images-downsampled', count: resampled, bytes: savedBytes });
    }
    if (skipped > 0) {
      notices.push({ kind: 'image-skipped', count: skipped });
    }
    if (resampled === 0) {
      notices.push({ kind: 'nothing-to-do' });
    }

    const bytes = await doc.save({ useObjectStreams: false });
    return this.finish(bytes, outputName, originalSizeBytes, notices, false);
  }

  /** Looks an indirect reference back up from the key the inventory reports. */
  private refFromKey(doc: PDFDocument, key: string): PDFRef | undefined {
    for (const [ref] of doc.context.enumerateIndirectObjects()) {
      if (ref.toString() === key) return ref;
    }
    return undefined;
  }

  /** Cached answer, so the probe below runs once rather than per page. */
  private rasterSupport: boolean | undefined;

  /**
   * True when this device can actually rasterise.
   *
   * Probing for a real 2D context, not just for `document.createElement`.
   * jsdom has the element and returns null from `getContext`, so the cheap
   * check reports yes and every later render quietly produces nothing — which
   * would make the verifier claim it compared pixels when it compared nothing
   * at all. A verification that lies about its method is worse than no
   * verification.
   */
  private canRaster(): boolean {
    if (this.rasterSupport !== undefined) return this.rasterSupport;

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      this.rasterSupport = false;
      return false;
    }

    try {
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      this.rasterSupport = probe.getContext('2d') !== null;
    } catch {
      this.rasterSupport = false;
    }

    return this.rasterSupport;
  }

  /**
   * Decodes an image stream, redraws it smaller and returns JPEG bytes.
   *
   * Two decode routes, both without a network round trip: a DCTDecode stream
   * is already a JPEG and goes straight into an ImageBitmap, and a Flate'd
   * 8-bit RGB or grey bitmap is rebuilt into ImageData directly. Anything else
   * returns undefined and is reported as skipped rather than guessed at.
   */
  private async resampleStream(
    stream: PDFStream,
    width: number,
    height: number,
    quality: number
  ): Promise<Uint8Array | undefined> {
    try {
      const source = await this.decodeToBitmapSource(stream);
      if (!source) return undefined;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (source instanceof ImageData) {
        // ImageData cannot be scaled by drawImage, so it goes through a staging
        // canvas at its own size first.
        const staging = document.createElement('canvas');
        staging.width = source.width;
        staging.height = source.height;
        const stagingCtx = staging.getContext('2d');
        if (!stagingCtx) return undefined;
        stagingCtx.putImageData(source, 0, 0);
        ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0.3, quality)));
      return this.dataUrlToBytes(dataUrl);
    } catch {
      return undefined;
    }
  }

  /** Turns an image stream into something `drawImage` or `putImageData` takes. */
  private async decodeToBitmapSource(
    stream: PDFStream
  ): Promise<CanvasImageSource | ImageData | undefined> {
    const dict = stream.dict;
    const filters = this.filterNames(dict);

    if (filters.includes('/DCTDecode') && stream instanceof PDFRawStream) {
      const blob = new Blob([stream.contents as BlobPart], { type: 'image/jpeg' });
      if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob);
      }
      return undefined;
    }

    if (!(stream instanceof PDFRawStream)) return undefined;

    let decoded: Uint8Array;
    try {
      decoded = decodePDFRawStream(stream).decode();
    } catch {
      return undefined;
    }

    const width = dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0;
    const height = dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0;
    const bpc = dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber() ?? 8;
    const space = this.colorSpaceName(dict);

    if (width <= 0 || height <= 0 || bpc !== 8) return undefined;

    const components = space === '/DeviceGray' ? 1 : space === '/DeviceRGB' ? 3 : 0;
    if (components === 0) return undefined;
    if (decoded.length < width * height * components) return undefined;

    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const src = i * components;
      const dst = i * 4;
      if (components === 1) {
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = decoded[src];
      } else {
        rgba[dst] = decoded[src];
        rgba[dst + 1] = decoded[src + 1];
        rgba[dst + 2] = decoded[src + 2];
      }
      rgba[dst + 3] = 255;
    }

    return new ImageData(rgba, width, height);
  }

  private filterNames(dict: PDFDict): string[] {
    const filter = dict.get(PDFName.of('Filter'));
    if (filter instanceof PDFName) return [filter.asString()];
    if (filter instanceof PDFArray) {
      const out: string[] = [];
      for (let i = 0; i < filter.size(); i++) {
        const entry = filter.lookupMaybe(i, PDFName);
        if (entry) out.push(entry.asString());
      }
      return out;
    }
    return [];
  }

  private colorSpaceName(dict: PDFDict): string | undefined {
    const space = dict.get(PDFName.of('ColorSpace'));
    if (space instanceof PDFName) return space.asString();
    if (space instanceof PDFArray && space.size() > 0) {
      return space.lookupMaybe(0, PDFName)?.asString();
    }
    return undefined;
  }

  /** Decoded bytes of a base64 data URI. */
  private dataUrlToBytes(dataUrl: string): Uint8Array {
    const comma = dataUrl.indexOf(',');
    const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(payload);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  /**
   * Swaps an image object's contents for JPEG bytes.
   *
   * The dictionary is rewritten rather than patched: a stream that was a
   * Flate'd bitmap carries /DecodeParms and possibly a /Predictor that mean
   * nothing to a JPEG, and leaving either behind produces a file that some
   * readers show and others refuse.
   */
  private replaceWithJpeg(
    doc: PDFDocument,
    ref: PDFRef,
    jpegBytes: Uint8Array,
    width: number,
    height: number
  ): void {
    const existing = doc.context.lookup(ref);
    if (!(existing instanceof PDFStream)) return;

    const previous = existing.dict;
    const replacement = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
      Length: jpegBytes.length
    }) as PDFDict;

    /* An /SMask is a separate object and stays valid, so it is carried over. */
    const smask = previous.get(PDFName.of('SMask'));
    if (smask) replacement.set(PDFName.of('SMask'), smask);

    doc.context.assign(ref, PDFRawStream.of(replacement, jpegBytes));
  }

  // ════════════════════════════════════════════════════════════════════
  // F2 — text-layer probe for the raster paths
  // ════════════════════════════════════════════════════════════════════

  /**
   * Whether the document has text a raster path would destroy.
   *
   * This is the gate in front of grayscale and mono. A scan has no text layer
   * and loses nothing by being rasterised; a digital document loses everything
   * — selection, search, copy, screen readers — and has to be asked about
   * first.
   */
  async probeTextLayer(
    buffer: ArrayBuffer,
    signal?: AbortSignal
  ): Promise<TextLayerReport> {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(buffer.slice(0))
      } as Parameters<typeof pdfjsLib.getDocument>[0]);
      const pdf = await task.promise;

      try {
        const sampled = Math.min(this.TEXT_PROBE_PAGES, pdf.numPages);
        let characterCount = 0;

        for (let pageNumber = 1; pageNumber <= sampled; pageNumber++) {
          if (signal?.aborted) throw new Error('Text probe cancelled by user.');
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          for (const item of content.items) {
            if ('str' in item) characterCount += item.str.trim().length;
          }
        }

        return {
          hasTextLayer: characterCount >= this.TEXT_LAYER_MIN_CHARS,
          characterCount,
          sampledPages: sampled
        };
      } finally {
        await task.destroy();
      }
    } catch (error) {
      if (error instanceof Error && /cancelled/i.test(error.message)) throw error;
      return {
        hasTextLayer: false,
        characterCount: 0,
        sampledPages: 0,
        unavailable: true
      };
    }
  }

  /**
   * The adaptive threshold for the 1-bit path.
   *
   * Otsu's method: the cut that best separates the histogram into two groups.
   * A fixed mid-grey turns a slightly dark scan entirely black, which is the
   * usual way mono conversion ruins a document.
   */
  otsuThreshold(histogram: number[]): number {
    const total = histogram.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 128;

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * (histogram[i] ?? 0);

    let sumBackground = 0;
    let weightBackground = 0;
    let bestVariance = -1;
    let plateauStart = -1;
    let plateauEnd = -1;

    for (let t = 0; t < 256; t++) {
      weightBackground += histogram[t] ?? 0;
      if (weightBackground === 0) continue;

      const weightForeground = total - weightBackground;
      if (weightForeground === 0) break;

      sumBackground += t * (histogram[t] ?? 0);
      const meanBackground = sumBackground / weightBackground;
      const meanForeground = (sum - sumBackground) / weightForeground;

      const variance =
        weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

      if (variance > bestVariance) {
        bestVariance = variance;
        plateauStart = t;
        plateauEnd = t;
      } else if (variance === bestVariance) {
        plateauEnd = t;
      }
    }

    /*
     * A cleanly separated scan gives the same variance for every cut between
     * its two peaks, and the first of those is right at the edge of the ink —
     * a threshold that turns the ink itself white. Taking the middle of the
     * plateau puts the cut between the two groups, which is what the method is
     * for.
     */
    if (plateauStart < 0) return 128;
    return Math.round((plateauStart + plateauEnd) / 2);
  }

  /** The grey histogram of RGBA pixels, for the threshold. */
  greyHistogram(data: Uint8ClampedArray | Uint8Array): number[] {
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const luma = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
      histogram[Math.min(255, Math.max(0, luma))]++;
    }
    return histogram;
  }

  /** Applies a colour path to RGBA pixels, in place. */
  applyColourPath(
    data: Uint8ClampedArray | Uint8Array,
    path: 'grayscale' | 'mono',
    threshold: number
  ): void {
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value =
        path === 'mono' ? (luma >= threshold ? 255 : 0) : Math.round(luma);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

  /**
   * Converts the document to grayscale or 1-bit monochrome by rasterising.
   *
   * Warning: this destroys vector sharpness and strips the text layer.
   * A document with a digital text layer requires confirmedScan: true
   * before running.
   */
  async exportColourPath(
    buffer: ArrayBuffer,
    options: ColourPathOptions,
    outputName: string,
    callbacks?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<OptimizeOutput> {
    const originalSizeBytes = buffer.byteLength;
    const notices: OptimizeNotice[] = [];

    if (options.path === 'colour') {
      notices.push({ kind: 'nothing-to-do' });
      return this.unchanged(buffer, outputName, notices);
    }

    const textProbe = await this.probeTextLayer(buffer, callbacks?.signal);
    if (textProbe.hasTextLayer && !options.confirmedScan) {
      notices.push({ kind: 'has-text-layer', count: textProbe.characterCount });
      return this.unchanged(buffer, outputName, notices);
    }

    if (!this.canRaster()) {
      notices.push({ kind: 'resampling-unavailable' });
      return this.unchanged(buffer, outputName, notices);
    }

    const pdfjsLib = await import('pdfjs-dist');
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdf = await task.promise;

    try {
      const sourceDoc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
      const targetDoc = await PDFDocument.create();
      const numPages = pdf.numPages;
      const targetDpi = Math.min(300, Math.max(72, Math.round(options.dpi || 150)));
      const quality = Math.min(1, Math.max(0.3, options.quality || 0.8));

      for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
        if (callbacks?.signal?.aborted) throw new Error('Colour pass cancelled by user.');

        const page = await pdf.getPage(pageNumber);
        const sourcePage = sourceDoc.getPage(pageNumber - 1);
        const visualWidth = sourcePage.getWidth();
        const visualHeight = sourcePage.getHeight();

        const viewport = page.getViewport({ scale: targetDpi / 72 });
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
          notices.push({ kind: 'resampling-unavailable' });
          return this.unchanged(buffer, outputName, notices);
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hist = this.greyHistogram(imgData.data);
        const threshold = Math.min(
          255,
          Math.max(0, this.otsuThreshold(hist) + (options.monoBias || 0))
        );

        this.applyColourPath(imgData.data, options.path, threshold);
        ctx.putImageData(imgData, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const embeddedImage = await targetDoc.embedJpg(dataUrl);

        const newPage = targetDoc.addPage([visualWidth, visualHeight]);
        newPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: visualWidth,
          height: visualHeight
        });

        callbacks?.onProgress?.({
          phase: 'rendering',
          completed: pageNumber,
          total: numPages,
          percent: Math.round((pageNumber / numPages) * 100)
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      notices.push({ kind: 'text-rasterized' });
      const bytes = await targetDoc.save({ useObjectStreams: false });
      return this.finish(bytes, outputName, originalSizeBytes, notices, true);
    } finally {
      await task.destroy();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // F3 — identical-image dedupe
  // ════════════════════════════════════════════════════════════════════

  /**
   * A content hash for an image stream.
   *
   * FNV-1a over the raw bytes, salted with the dictionary entries that decide
   * how those bytes are interpreted. Two streams with identical bytes but
   * different /Width are not the same image, and collapsing them would scale
   * one of them wrongly.
   */
  hashImageStream(stream: PDFStream): string {
    const dict = stream.dict;
    const salt = [
      dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0,
      dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0,
      dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber() ?? 0,
      this.colorSpaceName(dict) ?? '',
      this.filterNames(dict).join('+')
    ].join('|');

    let hash = 0x811c9dc5;
    for (let i = 0; i < salt.length; i++) {
      hash ^= salt.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    const bytes =
      stream instanceof PDFRawStream ? stream.contents : new Uint8Array(0);
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    /* Length is part of the key too, so a prefix cannot collide with a whole. */
    return `${hash.toString(16)}:${bytes.length}:${salt}`;
  }

  /** Groups of byte-identical images, largest saving first. */
  planDedupe(doc: PDFDocument): DedupePlan {
    const byHash = new Map<string, Array<{ ref: PDFRef; stream: PDFStream }>>();

    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFStream)) continue;
      if (object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Image') {
        continue;
      }

      const hash = this.hashImageStream(object);
      const bucket = byHash.get(hash);
      if (bucket) bucket.push({ ref, stream: object });
      else byHash.set(hash, [{ ref, stream: object }]);
    }

    const groups: DuplicateImageGroup[] = [];
    let duplicateCount = 0;
    let estimatedSavedBytes = 0;

    for (const bucket of byHash.values()) {
      if (bucket.length < 2) continue;

      const [keep, ...drop] = bucket;
      const dict = keep.stream.dict;
      const bytesEach =
        keep.stream instanceof PDFRawStream ? keep.stream.contents.length : 0;
      const saved = bytesEach * drop.length;

      groups.push({
        keepKey: keep.ref.toString(),
        dropKeys: drop.map(entry => entry.ref.toString()),
        pixelWidth: dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0,
        pixelHeight: dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0,
        bytesEach,
        savedBytes: saved
      });

      duplicateCount += drop.length;
      estimatedSavedBytes += saved;
    }

    groups.sort((a, b) => b.savedBytes - a.savedBytes);
    return { groups, duplicateCount, estimatedSavedBytes };
  }

  /**
   * Points every reference to a duplicate at the one kept copy, then deletes
   * the copies.
   *
   * References live in /Resources /XObject dictionaries — on pages, and on
   * form XObjects, which is why every dictionary in the file is swept rather
   * than just the pages. An /SMask or /Mask entry can point at an image too.
   */
  applyDedupe(doc: PDFDocument, plan: DedupePlan): number {
    if (plan.groups.length === 0) return 0;

    const replacement = new Map<string, PDFRef>();
    for (const group of plan.groups) {
      const keepRef = this.refFromKey(doc, group.keepKey);
      if (!keepRef) continue;
      for (const dropKey of group.dropKeys) replacement.set(dropKey, keepRef);
    }
    if (replacement.size === 0) return 0;

    let rewritten = 0;

    const rewriteDict = (dict: PDFDict): void => {
      for (const [name, value] of dict.entries()) {
        if (value instanceof PDFRef) {
          const target = replacement.get(value.toString());
          if (target) {
            dict.set(name, target);
            rewritten++;
          }
        }
      }
    };

    const rewriteArray = (array: PDFArray): void => {
      for (let i = 0; i < array.size(); i++) {
        const value = array.get(i);
        if (value instanceof PDFRef) {
          const target = replacement.get(value.toString());
          if (target) {
            array.set(i, target);
            rewritten++;
          }
        }
      }
    };

    for (const [, object] of doc.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict) rewriteDict(object);
      else if (object instanceof PDFArray) rewriteArray(object);
      else if (object instanceof PDFStream) rewriteDict(object.dict);
    }

    /* The page tree's own dictionaries are reachable, but sweep them anyway:
     * a page not registered as an indirect object would otherwise be missed. */
    for (const page of doc.getPages()) {
      const resources = page.node.Resources();
      if (resources) {
        rewriteDict(resources);
        const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
        if (xObjects) rewriteDict(xObjects);
      }
    }

    for (const key of replacement.keys()) {
      const ref = this.refFromKey(doc, key);
      if (ref) doc.context.delete(ref);
    }

    return rewritten;
  }

  // ════════════════════════════════════════════════════════════════════
  // F6 — structure
  // ════════════════════════════════════════════════════════════════════

  /**
   * Every object reachable from the document's roots.
   *
   * A straightforward mark phase: start at the catalog and the trailer's
   * /Info, follow every reference through dictionaries, arrays and stream
   * dictionaries, and stop at anything already seen.
   */
  reachableRefs(doc: PDFDocument): Set<string> {
    const seen = new Set<string>();
    const queue: PDFObject[] = [];

    const push = (value: PDFObject | undefined): void => {
      if (!value) return;
      if (value instanceof PDFRef) {
        if (seen.has(value.toString())) return;
        seen.add(value.toString());
        const looked = doc.context.lookup(value);
        if (looked) queue.push(looked);
        return;
      }
      queue.push(value);
    };

    push(doc.context.trailerInfo.Root);
    push(doc.context.trailerInfo.Info);
    push(doc.context.trailerInfo.Encrypt);
    push(doc.catalog);

    let guard = 0;
    while (queue.length > 0 && guard++ < 2000000) {
      const object = queue.pop()!;

      if (object instanceof PDFDict) {
        for (const [, value] of object.entries()) push(value);
      } else if (object instanceof PDFArray) {
        for (let i = 0; i < object.size(); i++) push(object.get(i));
      } else if (object instanceof PDFStream) {
        for (const [, value] of object.dict.entries()) push(value);
      }
    }

    return seen;
  }

  /** Deletes everything nothing references. Returns how many went. */
  dropOrphans(doc: PDFDocument): number {
    const reachable = this.reachableRefs(doc);
    const all = doc.context.enumerateIndirectObjects();

    let dropped = 0;
    for (const [ref] of all) {
      if (reachable.has(ref.toString())) continue;
      doc.context.delete(ref);
      dropped++;
    }
    return dropped;
  }

  /** Removes the document information dictionary and the XMP packet. */
  stripMetadata(doc: PDFDocument): boolean {
    let removed = false;

    if (doc.context.trailerInfo.Info) {
      doc.context.trailerInfo.Info = undefined as unknown as PDFObject;
      removed = true;
    }

    try {
      if (doc.catalog.get(PDFName.of('Metadata')) !== undefined) {
        doc.catalog.delete(PDFName.of('Metadata'));
        removed = true;
      }
    } catch {
      // A catalog that will not take a delete is not worth failing the pass for.
    }

    return removed;
  }

  // ════════════════════════════════════════════════════════════════════
  // Verification
  // ════════════════════════════════════════════════════════════════════

  /**
   * Checks that a rewritten document still renders the same.
   *
   * Pixels when a canvas is available, and a structural comparison — page
   * count, page sizes and extracted text — when it is not. Either way the
   * method used is reported, because "verified" meaning two different things
   * is how a check stops being worth anything.
   */
  async verify(
    before: ArrayBuffer,
    after: ArrayBuffer,
    options?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<VerificationResult> {
    const pdfjsLib = await import('pdfjs-dist');

    const beforeTask = pdfjsLib.getDocument({
      data: new Uint8Array(before.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const afterTask = pdfjsLib.getDocument({
      data: new Uint8Array(after.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);

    try {
      const beforePdf = await beforeTask.promise;
      const afterPdf = await afterTask.promise;

      if (beforePdf.numPages !== afterPdf.numPages) {
        return {
          matches: false,
          method: 'structural',
          differingPages: [],
          detail: `page count ${beforePdf.numPages} became ${afterPdf.numPages}`
        };
      }

      const canRender = this.canRaster();
      const total = Math.min(beforePdf.numPages, this.MAX_VERIFY_PAGES);
      const differingPages: number[] = [];

      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        if (options?.signal?.aborted) throw new Error('Verification cancelled by user.');

        const beforePage = await beforePdf.getPage(pageNumber);
        const afterPage = await afterPdf.getPage(pageNumber);

        const beforeView = beforePage.getViewport({ scale: 1 });
        const afterView = afterPage.getViewport({ scale: 1 });
        if (
          Math.abs(beforeView.width - afterView.width) > 1 ||
          Math.abs(beforeView.height - afterView.height) > 1
        ) {
          differingPages.push(pageNumber);
          continue;
        }

        if (canRender) {
          const same = await this.renderMatches(beforePage, afterPage);
          if (!same) differingPages.push(pageNumber);
        } else {
          const beforeText = await this.pageText(beforePage);
          const afterText = await this.pageText(afterPage);
          if (beforeText !== afterText) differingPages.push(pageNumber);
        }

        options?.onProgress?.({
          phase: 'verifying',
          completed: pageNumber,
          total,
          percent: Math.round((pageNumber / total) * 100)
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      return {
        matches: differingPages.length === 0,
        method: canRender ? 'render' : 'structural',
        differingPages
      };
    } finally {
      try {
        await beforeTask.destroy();
      } catch {
        // See below.
      }
      try {
        await afterTask.destroy();
      } catch {
        // A document that will not close does not invalidate the comparison.
      }
    }
  }

  private async pageText(page: {
    getTextContent(params?: any): Promise<any>;
  }): Promise<string> {
    const content = await page.getTextContent();
    const items = (content && Array.isArray(content.items)) ? content.items : [];
    return items.map((item: any) => (typeof item?.str === 'string' ? item.str : '')).join('');
  }

  /**
   * Renders both pages small and compares them with a tolerance.
   *
   * Exact pixel equality is the wrong test: re-encoding an image legitimately
   * moves values by a few levels, and a check that fails on that would reject
   * every successful optimisation. The comparison is at a low resolution with
   * a per-pixel tolerance, which catches a missing or moved element and
   * ignores re-encoding noise.
   */
  private async renderMatches(
    beforePage: { getViewport(p: { scale: number }): { width: number; height: number }; render(p: unknown): { promise: Promise<void> } },
    afterPage: { getViewport(p: { scale: number }): { width: number; height: number }; render(p: unknown): { promise: Promise<void> } }
  ): Promise<boolean> {
    const draw = async (page: typeof beforePage): Promise<ImageData | undefined> => {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1, 220 / Math.max(1, base.width));
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
      if (!ctx) return undefined;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    const a = await draw(beforePage);
    const b = await draw(afterPage);
    if (!a || !b) return true; // Nothing could be compared; do not claim a mismatch.
    if (a.width !== b.width || a.height !== b.height) return false;

    const tolerance = 36;
    let differing = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (
        Math.abs(a.data[i] - b.data[i]) > tolerance ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance
      ) {
        differing++;
      }
    }

    /* Up to 2% of pixels may move; past that something is actually gone. */
    return differing / (a.width * a.height) <= 0.02;
  }

  // ════════════════════════════════════════════════════════════════════
  // The structure pass itself
  // ════════════════════════════════════════════════════════════════════

  /**
   * A lossless pass: drop what nothing references, rewrite with object
   * streams, optionally strip metadata.
   *
   * Labelled "optimize structure" throughout. It is **not** linearization:
   * pdf-lib has no linearizing writer, so nothing here may be described as
   * Fast Web View or promise a faster first page as a guarantee.
   */
  async exportStructureOptimized(
    buffer: ArrayBuffer,
    options: StructureOptions = defaultStructureOptions(),
    outputName = 'document_optimized.pdf',
    callbacks?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<OptimizeOutput & { report: StructureReport }> {
    const originalSizeBytes = buffer.byteLength;
    const notices: OptimizeNotice[] = [];

    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    const objectsBefore = doc.context.enumerateIndirectObjects().length;

    if (callbacks?.signal?.aborted) throw new Error('Structure pass cancelled by user.');

    let orphansDropped = 0;
    if (options.dropOrphans) {
      orphansDropped = this.dropOrphans(doc);
      if (orphansDropped > 0) {
        notices.push({ kind: 'orphans-dropped', count: orphansDropped });
      }
    }

    if (options.stripMetadata) this.stripMetadata(doc);

    callbacks?.onProgress?.({ phase: 'writing', completed: 1, total: 2, percent: 50 });

    const bytes = await doc.save({ useObjectStreams: options.useObjectStreams });
    const objectsAfter = doc.context.enumerateIndirectObjects().length;

    const report: StructureReport = {
      objectsBefore,
      objectsAfter,
      orphansDropped,
      bytesBefore: originalSizeBytes,
      bytesAfter: bytes.length
    };

    const asBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    if (options.verify) {
      const verification = await this.verify(buffer, asBuffer, {
        onProgress: callbacks?.onProgress,
        signal: callbacks?.signal
      });

      if (!verification.matches) {
        /*
         * The rewritten file renders differently, so it is thrown away and the
         * original returned untouched. A smaller file that is missing
         * something is not a smaller file, it is a broken one.
         */
        notices.push({
          kind: 'verification-failed',
          count: verification.differingPages.length,
          detail: verification.detail
        });
        const unchanged = await this.unchanged(buffer, outputName, notices);
        return { ...unchanged, report };
      }

      if (verification.method === 'structural') {
        notices.push({ kind: 'verification-structural' });
      }
    }

    if (bytes.length < originalSizeBytes) {
      notices.push({
        kind: 'structure-rewritten',
        bytes: originalSizeBytes - bytes.length
      });
    } else {
      notices.push({ kind: 'nothing-to-do' });
    }

    callbacks?.onProgress?.({ phase: 'writing', completed: 2, total: 2, percent: 100 });

    const finished = await this.finish(bytes, outputName, originalSizeBytes, notices, false);
    return { ...finished, report };
  }

  /**
   * Collapses repeated images, verifying the result before accepting it.
   *
   * The verification is the point. Two streams that hash the same are almost
   * certainly the same picture, but "almost certainly" is not good enough to
   * rewrite somebody's document on, so the output is rendered against the
   * input and dropped if anything moved.
   */
  async exportDeduped(
    buffer: ArrayBuffer,
    outputName: string,
    callbacks?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal; verify?: boolean }
  ): Promise<OptimizeOutput & { plan: DedupePlan }> {
    const originalSizeBytes = buffer.byteLength;
    const notices: OptimizeNotice[] = [];

    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    const plan = this.planDedupe(doc);

    if (plan.groups.length === 0) {
      notices.push({ kind: 'no-duplicates' });
      const unchanged = await this.unchanged(buffer, outputName, notices);
      return { ...unchanged, plan };
    }

    if (callbacks?.signal?.aborted) throw new Error('Dedupe cancelled by user.');

    this.applyDedupe(doc, plan);
    callbacks?.onProgress?.({ phase: 'writing', completed: 1, total: 2, percent: 50 });

    const bytes = await doc.save({ useObjectStreams: false });
    const asBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    if (callbacks?.verify !== false) {
      const verification = await this.verify(buffer, asBuffer, {
        onProgress: callbacks?.onProgress,
        signal: callbacks?.signal
      });

      if (!verification.matches) {
        notices.push({
          kind: 'verification-failed',
          count: verification.differingPages.length,
          detail: verification.detail
        });
        const unchanged = await this.unchanged(buffer, outputName, notices);
        return { ...unchanged, plan };
      }

      if (verification.method === 'structural') {
        notices.push({ kind: 'verification-structural' });
      }
    }

    notices.push({
      kind: 'duplicates-collapsed',
      count: plan.duplicateCount,
      bytes: Math.max(0, originalSizeBytes - bytes.length)
    });

    callbacks?.onProgress?.({ phase: 'writing', completed: 2, total: 2, percent: 100 });

    const finished = await this.finish(bytes, outputName, originalSizeBytes, notices, false);
    return { ...finished, plan };
  }

  // ════════════════════════════════════════════════════════════════════
  // F4 — before/after proof view
  // ════════════════════════════════════════════════════════════════════

  /**
   * Calculates size savings overall and page by page, identifying the
   * best and worst saving pages.
   */
  buildProofSummary(
    beforeBytes: number,
    afterBytes: number,
    pageEstimates: Array<{ pageNumber: number; beforeBytes: number; afterBytes: number }> = [],
    textRasterized = false
  ): ProofSummary {
    const savedBytes = beforeBytes - afterBytes;
    const savedPercent = beforeBytes > 0 ? Math.round((savedBytes / beforeBytes) * 100) : 0;

    const pages: ProofPageRow[] = pageEstimates.map(p => {
      const pageSaved = p.beforeBytes - p.afterBytes;
      const pagePercent = p.beforeBytes > 0 ? Math.round((pageSaved / p.beforeBytes) * 100) : 0;
      return {
        pageNumber: p.pageNumber,
        beforeBytes: p.beforeBytes,
        afterBytes: p.afterBytes,
        savedBytes: pageSaved,
        savedPercent: pagePercent
      };
    });

    let worstPage: ProofPageRow | undefined;
    let bestPage: ProofPageRow | undefined;

    if (pages.length > 0) {
      const sorted = [...pages].sort((a, b) => b.savedPercent - a.savedPercent);
      worstPage = sorted[0];
      bestPage = sorted[sorted.length - 1];
    }

    return {
      beforeBytes,
      afterBytes,
      savedBytes,
      savedPercent,
      worstPage,
      bestPage,
      pages,
      textRasterized
    };
  }

  /**
   * Renders the before and after versions of a specific page for visual comparison.
   */
  async renderProofPage(
    beforeBuffer: ArrayBuffer,
    afterBuffer: ArrayBuffer,
    pageNumber: number,
    dpi = 96
  ): Promise<ProofRender> {
    if (!this.canRaster()) {
      return {
        pageNumber,
        unavailableReason: 'Canvas rendering is not supported on this device'
      };
    }

    try {
      const pdfjsLib = await import('pdfjs-dist');

      const renderOne = async (buf: ArrayBuffer): Promise<string | undefined> => {
        const task = pdfjsLib.getDocument({
          data: new Uint8Array(buf.slice(0))
        } as Parameters<typeof pdfjsLib.getDocument>[0]);
        const pdf = await task.promise;
        try {
          if (pageNumber < 1 || pageNumber > pdf.numPages) return undefined;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: dpi / 72 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) return undefined;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;
          return canvas.toDataURL('image/jpeg', 0.85);
        } finally {
          await task.destroy();
        }
      };

      const [beforeUrl, afterUrl] = await Promise.all([
        renderOne(beforeBuffer),
        renderOne(afterBuffer)
      ]);

      return {
        pageNumber,
        beforeUrl,
        afterUrl
      };
    } catch (err: any) {
      return {
        pageNumber,
        unavailableReason: err?.message || 'Failed to render proof'
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // F5 — fit the upload limit chain
  // ════════════════════════════════════════════════════════════════════

  /**
   * Sequentially runs optimization passes until the file size is under targetKB.
   * Order: strip-metadata -> structure -> dedupe -> downsample -> grayscale -> mono.
   * Stops as soon as the target is reached.
   */
  async fitUploadLimit(
    buffer: ArrayBuffer,
    options: FitLimitOptions,
    outputName: string,
    callbacks?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<FitLimitResult> {
    const originalSizeBytes = buffer.byteLength;
    const targetBytes = (options.targetKB || 500) * 1024;
    let currentBuffer: ArrayBuffer = buffer.slice(0);
    const steps: FitStepResult[] = [];
    const allNotices: OptimizeNotice[] = [];
    let textRasterized = false;

    // Check if target is already met
    if (currentBuffer.byteLength <= targetBytes) {
      allNotices.push({ kind: 'nothing-to-do' });
      const unchanged = await this.unchanged(currentBuffer, outputName, allNotices);
      const allSkipped: FitStepResult[] = FIT_STEP_ORDER.map(kind => ({
        kind,
        ran: false,
        skippedReason: 'target-already-met',
        beforeBytes: originalSizeBytes,
        afterBytes: originalSizeBytes,
        savedBytes: 0,
        notices: []
      }));
      return {
        ...unchanged,
        steps: allSkipped,
        targetBytes,
        targetMet: true,
        suggestSplit: false
      };
    }

    let completedSteps = 0;
    const totalPossibleSteps = FIT_STEP_ORDER.length;

    for (const stepKind of FIT_STEP_ORDER) {
      if (callbacks?.signal?.aborted) throw new Error('Fit limit chain cancelled by user.');

      const beforeBytes = currentBuffer.byteLength;

      if (beforeBytes <= targetBytes) {
        steps.push({
          kind: stepKind,
          ran: false,
          skippedReason: 'target-already-met',
          beforeBytes,
          afterBytes: beforeBytes,
          savedBytes: 0,
          notices: []
        });
        continue;
      }

      if (!options.allowedSteps.includes(stepKind)) {
        steps.push({
          kind: stepKind,
          ran: false,
          skippedReason: 'not-allowed',
          beforeBytes,
          afterBytes: beforeBytes,
          savedBytes: 0,
          notices: []
        });
        continue;
      }

      callbacks?.onProgress?.({
        phase: 'measuring',
        completed: completedSteps,
        total: totalPossibleSteps,
        percent: Math.round((completedSteps / totalPossibleSteps) * 100),
        label: `Running ${stepKind}...`
      });

      let stepRan = false;
      let stepSkippedReason: FitStepResult['skippedReason'];
      let stepRasterized = false;
      const stepNotices: OptimizeNotice[] = [];
      let newBuffer = currentBuffer;

      try {
        switch (stepKind) {
          case 'strip-metadata': {
            const doc = await PDFDocument.load(currentBuffer.slice(0), { ignoreEncryption: true });
            const stripped = this.stripMetadata(doc);
            if (stripped) {
              const savedBytes = await doc.save({ useObjectStreams: false });
              if (savedBytes.length < beforeBytes) {
                newBuffer = savedBytes.buffer.slice(
                  savedBytes.byteOffset,
                  savedBytes.byteOffset + savedBytes.byteLength
                ) as ArrayBuffer;
                stepRan = true;
              } else {
                stepSkippedReason = 'no-effect';
              }
            } else {
              stepSkippedReason = 'no-effect';
            }
            break;
          }

          case 'structure': {
            const result = await this.exportStructureOptimized(
              currentBuffer,
              { ...defaultStructureOptions(), verify: false },
              outputName,
              { signal: callbacks?.signal }
            );
            const resBuffer = await result.blob.arrayBuffer();
            if (resBuffer.byteLength < beforeBytes) {
              newBuffer = resBuffer;
              stepRan = true;
              stepNotices.push(...result.notices);
            } else {
              stepSkippedReason = 'no-effect';
            }
            break;
          }

          case 'dedupe': {
            const result = await this.exportDeduped(
              currentBuffer,
              outputName,
              { verify: false, signal: callbacks?.signal }
            );
            const resBuffer = await result.blob.arrayBuffer();
            if (resBuffer.byteLength < beforeBytes) {
              newBuffer = resBuffer;
              stepRan = true;
              stepNotices.push(...result.notices);
            } else {
              stepSkippedReason = 'no-effect';
            }
            break;
          }

          case 'downsample': {
            const result = await this.exportDownsampled(
              currentBuffer,
              { ceiling: options.downsampleCeiling, quality: 0.8, minGain: 0.05 },
              outputName,
              { signal: callbacks?.signal }
            );
            const resBuffer = await result.blob.arrayBuffer();
            if (resBuffer.byteLength < beforeBytes) {
              newBuffer = resBuffer;
              stepRan = true;
              stepNotices.push(...result.notices);
            } else {
              stepSkippedReason = 'no-effect';
            }
            break;
          }

          case 'grayscale': {
            const probe = await this.probeTextLayer(currentBuffer, callbacks?.signal);
            if (probe.hasTextLayer && !options.confirmedScan) {
              stepSkippedReason = 'needs-confirmation';
              break;
            }
            const result = await this.exportColourPath(
              currentBuffer,
              { path: 'grayscale', monoBias: 0, dpi: 150, quality: 0.8, confirmedScan: options.confirmedScan },
              outputName,
              { signal: callbacks?.signal }
            );
            const resBuffer = await result.blob.arrayBuffer();
            if (resBuffer.byteLength < beforeBytes && result.rasterized) {
              newBuffer = resBuffer;
              stepRan = true;
              stepRasterized = true;
              textRasterized = true;
              stepNotices.push(...result.notices);
            } else {
              stepSkippedReason = result.notices.some(n => n.kind === 'resampling-unavailable')
                ? 'unavailable'
                : 'no-effect';
            }
            break;
          }

          case 'mono': {
            const probe = await this.probeTextLayer(currentBuffer, callbacks?.signal);
            if (probe.hasTextLayer && !options.confirmedScan) {
              stepSkippedReason = 'needs-confirmation';
              break;
            }
            const result = await this.exportColourPath(
              currentBuffer,
              { path: 'mono', monoBias: 0, dpi: 150, quality: 0.8, confirmedScan: options.confirmedScan },
              outputName,
              { signal: callbacks?.signal }
            );
            const resBuffer = await result.blob.arrayBuffer();
            if (resBuffer.byteLength < beforeBytes && result.rasterized) {
              newBuffer = resBuffer;
              stepRan = true;
              stepRasterized = true;
              textRasterized = true;
              stepNotices.push(...result.notices);
            } else {
              stepSkippedReason = result.notices.some(n => n.kind === 'resampling-unavailable')
                ? 'unavailable'
                : 'no-effect';
            }
            break;
          }
        }
      } catch {
        stepSkippedReason = 'no-effect';
      }

      currentBuffer = newBuffer;
      const afterBytes = currentBuffer.byteLength;
      const savedBytes = beforeBytes - afterBytes;

      steps.push({
        kind: stepKind,
        ran: stepRan,
        skippedReason: stepSkippedReason,
        beforeBytes,
        afterBytes,
        savedBytes: Math.max(0, savedBytes),
        rasterized: stepRasterized,
        notices: stepNotices
      });

      allNotices.push(...stepNotices);
      completedSteps++;
    }

    const targetMet = currentBuffer.byteLength <= targetBytes;
    if (targetMet) {
      allNotices.push({ kind: 'target-met-early' });
    } else {
      allNotices.push({ kind: 'target-unreachable' });
    }

    const output = await this.finish(
      new Uint8Array(currentBuffer),
      outputName,
      originalSizeBytes,
      allNotices,
      textRasterized
    );

    return {
      ...output,
      steps,
      targetBytes,
      targetMet,
      suggestSplit: !targetMet
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Results
  // ════════════════════════════════════════════════════════════════════

  private async unchanged(
    buffer: ArrayBuffer,
    outputName: string,
    notices: OptimizeNotice[]
  ): Promise<OptimizeOutput> {
    const blob = new Blob([buffer.slice(0) as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    let pageCount = 0;
    try {
      const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
      pageCount = doc.getPageCount();
    } catch {
      pageCount = 0;
    }

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount,
      notices,
      originalSizeBytes: buffer.byteLength,
      savedBytes: 0,
      savedPercent: 0,
      rasterized: false
    };
  }

  private async finish(
    bytes: Uint8Array,
    outputName: string,
    originalSizeBytes: number,
    notices: OptimizeNotice[],
    rasterized: boolean
  ): Promise<OptimizeOutput> {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    let pageCount = 0;
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount();
    } catch {
      pageCount = 0;
    }

    const savedBytes = originalSizeBytes - file.size;
    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount,
      notices,
      originalSizeBytes,
      savedBytes,
      savedPercent:
        originalSizeBytes > 0 ? Math.round((savedBytes / originalSizeBytes) * 100) : 0,
      rasterized
    };
  }
}
