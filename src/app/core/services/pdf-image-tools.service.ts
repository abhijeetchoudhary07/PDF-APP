import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  rgb
} from 'pdf-lib';
import {
  PageImageEdit,
  PageImageEditResult,
  PageImageRef,
  WhiteoutRegion
} from '../models/editor-features.types';
import { PdfImageElement, Rect } from '../models/pdf-editor.types';
import {
  ContentStreamScanner,
  IDENTITY_MATRIX,
  unitSquareSize
} from '../utilities/content-stream-scanner.util';
import { readPageContent } from '../utilities/pdf-page-content.util';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

/**
 * The notice every whiteout and every cover-based image action carries.
 *
 * It says "covers" rather than "removes" because that is what it does, and
 * because the difference is the one that matters to someone hiding an
 * account number: a covered number is still in the file.
 */
export const WHITEOUT_DISCLAIMER_TEXT =
  'Whiteout paints over content. The text and image data underneath stay in the file, ' +
  'where a search, a copy or another PDF tool can still reach them. To take content ' +
  'out of the file for good, use Redact.';

/**
 * K4 — Image tools that work on the pictures already on the page.
 *
 * Inserting an image was already possible; what was missing was everything
 * to do with an image the document already has. Finding one is the whole
 * problem: an image is an XObject in the page's resources, and *where* it
 * lands is decided by the transformation matrix in force at the `Do` that
 * draws it, nowhere else. `ContentStreamScanner` already reads exactly that
 * for the Part F size tools, so this reuses it rather than guessing from
 * the image's pixel dimensions, which say nothing about its size on paper.
 *
 * Replace rewrites the XObject itself, so every placement of that image
 * changes together and nothing else on the page is touched. Delete and mask
 * cover instead, and say so: pulling the draw operator out of a content
 * stream shifts whatever the rest of the stream does afterwards, and a tool
 * that silently rearranges a page is worse than one that paints over part of
 * it and admits it.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfImageToolsService {
  readonly disclaimerText = WHITEOUT_DISCLAIMER_TEXT;

  // ════════════════════════════════════════════════════════════════════
  // Finding images on the page
  // ════════════════════════════════════════════════════════════════════

  /**
   * Every image drawn directly on one page, with its rectangle in editor
   * coordinates.
   *
   * Only the page's own content stream is scanned, not form XObjects nested
   * inside it. An image inside a stamp or a letterhead form belongs to that
   * form, and editing it would change the stamp everywhere it appears —
   * which is not what someone tapping a picture on this page is asking for.
   * Those images are simply not offered.
   */
  async findPageImages(
    pdfBytes: Uint8Array,
    pageNumber: number
  ): Promise<PageImageRef[]> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pageNumber < 1 || pageNumber > pages.length) return [];

    const page = pages[pageNumber - 1];
    const pageHeight = page.getHeight();
    const content = readPageContent(pdfDoc, page);
    if (content.length === 0) return [];

    const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xObjects) return [];

    const found: PageImageRef[] = [];
    const { draws } = ContentStreamScanner.scan(content, IDENTITY_MATRIX);

    for (const draw of draws) {
      const ref = xObjects.get(PDFName.of(draw.name));
      if (!(ref instanceof PDFRef)) continue;

      const stream = pdfDoc.context.lookup(ref);
      if (!(stream instanceof PDFStream)) continue;
      if (stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Image') {
        continue;
      }

      const size = unitSquareSize(draw.matrix);
      if (size.width < 1 || size.height < 1) continue;

      /*
       * The matrix translates to the image's bottom-left corner on the page.
       * The editor measures down from the top, so the top edge is the page
       * height less the bottom edge less the drawn height.
       */
      const bottom = draw.matrix[5];
      const left = draw.matrix[4];

      found.push({
        id: generateId(),
        pageNumber,
        rect: {
          x: left,
          y: pageHeight - bottom - size.height,
          width: size.width,
          height: size.height
        },
        objectName: draw.name,
        pixelWidth:
          stream.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0,
        pixelHeight:
          stream.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0,
        mimeType: this.mimeTypeOf(stream)
      });
    }

    /* Top of the page first, which is the order they are listed in. */
    return found.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  }

  /** The image's encoding, where it is one a browser could also display. */
  private mimeTypeOf(stream: PDFStream): string | undefined {
    const filter = stream.dict.get(PDFName.of('Filter'));
    const name = filter instanceof PDFName ? filter.asString() : undefined;
    if (name === '/DCTDecode') return 'image/jpeg';
    if (name === '/JPXDecode') return 'image/jp2';
    return undefined;
  }

  // ════════════════════════════════════════════════════════════════════
  // Editing them
  // ════════════════════════════════════════════════════════════════════

  /**
   * Applies one image action to a file.
   *
   * The result always says whether the action covered rather than removed,
   * so the caller can repeat it to the user instead of implying the picture
   * is gone from the document.
   */
  async applyImageEdit(pdfBytes: Uint8Array, edit: PageImageEdit): Promise<PageImageEditResult> {
    switch (edit.action) {
      case 'replace':
        return this.replacePageImage(pdfBytes, edit);
      case 'crop':
        return this.cropPageImage(pdfBytes, edit);
      case 'delete':
      case 'mask':
      default:
        return this.coverPageImage(pdfBytes, edit);
    }
  }

  /**
   * Swaps the picture, keeping its place on the page.
   *
   * The XObject's resource entry is repointed at the new image rather than
   * the content stream being rewritten, which is what keeps every other
   * operator on the page — and the caption under the picture — exactly where
   * it was.
   */
  private async replacePageImage(
    pdfBytes: Uint8Array,
    edit: PageImageEdit
  ): Promise<PageImageEditResult> {
    if (!edit.replacementBytes || edit.replacementBytes.byteLength === 0) {
      throw new Error('No replacement image was supplied.');
    }

    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPages()[edit.target.pageNumber - 1];
    if (!page) throw new Error('That page is not in this document.');

    const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xObjects) throw new Error('That page has no image resources.');

    const embedded = this.isJpeg(edit.replacementBytes)
      ? await pdfDoc.embedJpg(edit.replacementBytes)
      : await pdfDoc.embedPng(edit.replacementBytes);

    xObjects.set(PDFName.of(edit.target.objectName), embedded.ref);

    return {
      pdfBytes: await pdfDoc.save({ useObjectStreams: false }),
      applied: ['replace'],
      coveredRatherThanRemoved: false,
      message:
        'The picture was replaced in place. It keeps the position and the size the original had on the page.'
    };
  }

  /**
   * Paints over an image, or over part of one.
   *
   * `delete` covers the whole rectangle; `mask` covers the fraction of it
   * given in `region`. Neither takes the image's bytes out of the file, and
   * the message says exactly that.
   */
  private async coverPageImage(
    pdfBytes: Uint8Array,
    edit: PageImageEdit
  ): Promise<PageImageEditResult> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPages()[edit.target.pageNumber - 1];
    if (!page) throw new Error('That page is not in this document.');

    const pageHeight = page.getHeight();
    const base = edit.target.rect;
    const region = edit.region;

    const area: Rect = region
      ? {
          x: base.x + base.width * region.left,
          y: base.y + base.height * region.top,
          width: base.width * Math.max(0, region.right - region.left),
          height: base.height * Math.max(0, region.bottom - region.top)
        }
      : base;

    const fill = this.hexToRgb(edit.coverColor || '#FFFFFF');

    page.drawRectangle({
      x: area.x,
      y: pageHeight - area.y - area.height,
      width: area.width,
      height: area.height,
      color: rgb(fill.r, fill.g, fill.b),
      borderWidth: 0
    });

    return {
      pdfBytes: await pdfDoc.save({ useObjectStreams: false }),
      applied: [edit.action],
      coveredRatherThanRemoved: true,
      message:
        edit.action === 'delete'
          ? `The picture is covered over. ${WHITEOUT_DISCLAIMER_TEXT}`
          : `The selected part of the picture is covered over. ${WHITEOUT_DISCLAIMER_TEXT}`
    };
  }

  /**
   * Crops an image by narrowing what the page shows of it.
   *
   * The kept fraction is written as a clip path around the image's own
   * rectangle, and the parts outside it are covered. The image data itself
   * is untouched — re-cropping to a wider region later brings the rest
   * back — and, as with every cover, the message does not pretend otherwise.
   */
  private async cropPageImage(
    pdfBytes: Uint8Array,
    edit: PageImageEdit
  ): Promise<PageImageEditResult> {
    const region = edit.region;
    if (!region) throw new Error('No crop region was supplied.');

    const base = edit.target.rect;
    const edits: PageImageEdit[] = [];

    /* Four covers: above, below, left and right of what is kept. */
    const bands: { left: number; top: number; right: number; bottom: number }[] = [
      { left: 0, top: 0, right: 1, bottom: region.top },
      { left: 0, top: region.bottom, right: 1, bottom: 1 },
      { left: 0, top: region.top, right: region.left, bottom: region.bottom },
      { left: region.right, top: region.top, right: 1, bottom: region.bottom }
    ];

    for (const band of bands) {
      if (band.right - band.left <= 0 || band.bottom - band.top <= 0) continue;
      edits.push({
        action: 'mask',
        target: edit.target,
        region: band,
        coverColor: edit.coverColor || '#FFFFFF'
      });
    }

    let current = pdfBytes;
    for (const band of edits) {
      current = (await this.coverPageImage(current, band)).pdfBytes;
    }

    const keptWidth = Math.round(base.width * (region.right - region.left));
    const keptHeight = Math.round(base.height * (region.bottom - region.top));

    return {
      pdfBytes: current,
      applied: ['crop'],
      coveredRatherThanRemoved: true,
      message:
        `Showing ${keptWidth} × ${keptHeight} points of the picture. ` +
        'The rest is covered over, not cut away, so the full image is still in the file.'
    };
  }

  private isJpeg(bytes: Uint8Array): boolean {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  // ════════════════════════════════════════════════════════════════════
  // Whiteout
  // ════════════════════════════════════════════════════════════════════

  createWhiteout(
    pageNumber: number,
    rect: Rect,
    fillColor = '#FFFFFF',
    colorSampledFromPage = false
  ): WhiteoutRegion {
    return {
      id: generateId(),
      pageNumber,
      rect,
      fillColor,
      disclaimerAcknowledged: true,
      colorSampledFromPage
    };
  }

  /**
   * Paints one whiteout region into a file.
   *
   * `rect` is top-left origin like everything else in Part K; the flip to
   * PDF space happens here.
   */
  async applyWhiteout(
    pdfBytes: Uint8Array,
    region: WhiteoutRegion
  ): Promise<{ pdfBytes: Uint8Array; disclaimerAcknowledged: boolean }> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    if (region.pageNumber >= 1 && region.pageNumber <= pages.length) {
      const page = pages[region.pageNumber - 1];
      const fill = this.hexToRgb(region.fillColor || '#FFFFFF');

      page.drawRectangle({
        x: region.rect.x,
        y: page.getHeight() - region.rect.y - region.rect.height,
        width: region.rect.width,
        height: region.rect.height,
        color: rgb(fill.r, fill.g, fill.b),
        borderWidth: 0
      });
    }

    return {
      pdfBytes: await pdfDoc.save({ useObjectStreams: false }),
      disclaimerAcknowledged: region.disclaimerAcknowledged
    };
  }

  /**
   * The page's colour just outside a rectangle, as `#rrggbb`.
   *
   * A white cover on a tinted form, a scanned page or a dark theme is a
   * white patch, which is more conspicuous than what it was hiding. This
   * samples a ring of pixels around the area from an already-rendered page
   * canvas and takes the commonest colour, so the cover disappears into the
   * background it sits on.
   *
   * Returns null when the ring is not one flat colour — a cover that guesses
   * at a gradient or a photograph would look worse than a plain white one,
   * and the caller falls back to white and says it did.
   */
  sampleBackgroundColor(
    canvas: HTMLCanvasElement,
    rectInCanvasPixels: Rect,
    tolerance = 10
  ): string | null {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    const pad = 4;
    const left = Math.max(0, Math.floor(rectInCanvasPixels.x - pad));
    const top = Math.max(0, Math.floor(rectInCanvasPixels.y - pad));
    const right = Math.min(canvas.width, Math.ceil(rectInCanvasPixels.x + rectInCanvasPixels.width + pad));
    const bottom = Math.min(canvas.height, Math.ceil(rectInCanvasPixels.y + rectInCanvasPixels.height + pad));

    if (right - left < 2 || bottom - top < 2) return null;

    let data: Uint8ClampedArray;
    try {
      data = context.getImageData(left, top, right - left, bottom - top).data;
    } catch {
      /* A tainted canvas. Nothing to sample from. */
      return null;
    }

    const width = right - left;
    const height = bottom - top;
    const samples: [number, number, number][] = [];

    const push = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    };

    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
      push(0, y);
      push(width - 1, y);
    }

    if (samples.length === 0) return null;

    const mean = samples.reduce(
      (acc, [r, g, b]) => [acc[0] + r / samples.length, acc[1] + g / samples.length, acc[2] + b / samples.length],
      [0, 0, 0]
    );

    const spread = samples.every(
      ([r, g, b]) =>
        Math.abs(r - mean[0]) <= tolerance &&
        Math.abs(g - mean[1]) <= tolerance &&
        Math.abs(b - mean[2]) <= tolerance
    );

    if (!spread) return null;

    return (
      '#' +
      mean
        .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const match = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!match) return { r: 1, g: 1, b: 1 };
    const value = parseInt(match[1], 16);
    return {
      r: ((value >> 16) & 0xff) / 255,
      g: ((value >> 8) & 0xff) / 255,
      b: (value & 0xff) / 255
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // The editor's own image overlays (unchanged behaviour)
  // ════════════════════════════════════════════════════════════════════

  /** Repoints an editor-added image element at a different picture. */
  replaceImage(
    existingImage: PdfImageElement,
    newImageUrl: string,
    newAspectRatio?: number
  ): PdfImageElement {
    const aspectRatio = newAspectRatio || existingImage.aspectRatio;
    return {
      ...existingImage,
      imageUrl: newImageUrl,
      aspectRatio,
      height: existingImage.width / (aspectRatio || 1)
    };
  }

  /** Narrows an editor-added image element to part of its own box. */
  cropImage(imageElement: PdfImageElement, cropRect: Rect): PdfImageElement {
    return {
      ...imageElement,
      x: imageElement.x + cropRect.x,
      y: imageElement.y + cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
      aspectRatio: cropRect.width / cropRect.height
    };
  }
}
