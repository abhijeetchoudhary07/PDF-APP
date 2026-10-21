import { Injectable } from '@angular/core';
import {
  PageImageRef,
  WhiteoutRegion,
  ImageToolAction
} from '../models/editor-features.types';
import { PdfImageElement, Rect } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

export const WHITEOUT_DISCLAIMER_TEXT =
  'Notice: Whiteout visually covers content rather than permanently removing underlying text and metadata streams. For irreversible privacy redaction, use the Redact tool.';

@Injectable({
  providedIn: 'root'
})
export class PdfImageToolsService {
  constructor() {}

  readonly disclaimerText = WHITEOUT_DISCLAIMER_TEXT;

  /**
   * Replaces the image source and dimensions of an existing image element
   * leaving all other elements on the page untouched.
   */
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

  /**
   * Creates a cropped version of an image element
   */
  cropImage(
    imageElement: PdfImageElement,
    cropRect: Rect
  ): PdfImageElement {
    return {
      ...imageElement,
      x: imageElement.x + cropRect.x,
      y: imageElement.y + cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
      aspectRatio: cropRect.width / cropRect.height
    };
  }

  /**
   * Creates an opaque whiteout region to cover arbitrary visual content
   */
  createWhiteout(
    pageNumber: number,
    rect: Rect,
    fillColor: string = '#FFFFFF'
  ): WhiteoutRegion {
    return {
      id: generateId(),
      pageNumber,
      rect,
      fillColor,
      disclaimerAcknowledged: true
    };
  }

  /**
   * Applies whiteout visual overlay onto the PDF binary
   * Note: This visually covers content without permanently destroying underlying text streams.
   */
  async applyWhiteout(
    pdfBytes: Uint8Array,
    region: WhiteoutRegion
  ): Promise<{ pdfBytes: Uint8Array; disclaimerAcknowledged: boolean }> {
    const { PDFDocument, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (region.pageNumber >= 1 && region.pageNumber <= pages.length) {
      const page = pages[region.pageNumber - 1];
      const pageHeight = page.getHeight();
      const pdfY = pageHeight - region.rect.y - region.rect.height;

      page.drawRectangle({
        x: region.rect.x,
        y: pdfY,
        width: region.rect.width,
        height: region.rect.height,
        color: rgb(1, 1, 1),
        borderWidth: 0
      });
    }

    const updatedBytes = await pdfDoc.save({ useObjectStreams: false });
    return {
      pdfBytes: updatedBytes,
      disclaimerAcknowledged: region.disclaimerAcknowledged
    };
  }
}
