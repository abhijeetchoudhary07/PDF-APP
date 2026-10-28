import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class BatchImageService {

  /**
   * Expand filename rename template with standard and EXIF date tokens.
   * Backwards compatible: existing rename templates like '{name}_min' or 'doc_{n}'
   * produce identical outputs to before.
   */
  expandRenamePattern(
    template: string,
    originalFileName: string,
    indexOneBased: number,
    date?: Date
  ): string {
    const lastDotIndex = originalFileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? originalFileName.substring(0, lastDotIndex) : originalFileName;
    const ext = lastDotIndex > 0 ? originalFileName.substring(lastDotIndex) : '';

    const effectiveDate = date && !isNaN(date.getTime()) ? date : new Date();

    const yyyy = String(effectiveDate.getFullYear());
    const mm = String(effectiveDate.getMonth() + 1).padStart(2, '0');
    const dd = String(effectiveDate.getDate()).padStart(2, '0');
    const hh = String(effectiveDate.getHours()).padStart(2, '0');
    const min = String(effectiveDate.getMinutes()).padStart(2, '0');

    const n = String(indexOneBased);
    const nn = String(indexOneBased).padStart(2, '0');
    const nnn = String(indexOneBased).padStart(3, '0');

    let result = template
      .replace(/\{name\}/gi, baseName)
      .replace(/\{nnn\}/gi, nnn)
      .replace(/\{nn\}/gi, nn)
      .replace(/\{n\}/gi, n)
      .replace(/\{yyyy\}/gi, yyyy)
      .replace(/\{mm\}/gi, mm)
      .replace(/\{dd\}/gi, dd)
      .replace(/\{hh\}/gi, hh)
      .replace(/\{min\}/gi, min);

    // If template doesn't specify extension, append original extension
    if (!result.includes('.')) {
      result += ext;
    }

    return result;
  }

  /**
   * Test whether a file is already under the target ceiling in KB.
   * If true, it can be skipped to preserve byte-identical fidelity.
   */
  shouldSkipIfUnderTarget(fileSizeBytes: number, targetKB: number): boolean {
    if (!targetKB || targetKB <= 0) return false;
    return fileSizeBytes <= targetKB * 1024;
  }

  /**
   * Auto-rotate canvas according to EXIF orientation tag (1-8).
   * Transforms phone photos into true upright orientation.
   */
  applyExifOrientation(sourceCanvas: HTMLCanvasElement, orientation: number = 1): HTMLCanvasElement {
    if (!orientation || orientation <= 1 || orientation > 8) {
      return sourceCanvas;
    }

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;

    // For 90 or 270 degree rotations, swap output width & height
    const swapDims = orientation >= 5 && orientation <= 8;
    const dstW = swapDims ? srcH : srcW;
    const dstH = swapDims ? srcW : srcH;

    const outCanvas = createSafeCanvas(dstW, dstH);
    const ctx = getSafeContext(outCanvas);

    ctx.save();

    switch (orientation) {
      case 2: // Horizontal flip
        ctx.translate(dstW, 0);
        ctx.scale(-1, 1);
        break;
      case 3: // 180 rotate
        ctx.translate(dstW, dstH);
        ctx.rotate(Math.PI);
        break;
      case 4: // Vertical flip
        ctx.translate(0, dstH);
        ctx.scale(1, -1);
        break;
      case 5: // 90 CCW + horizontal flip
        ctx.rotate(-0.5 * Math.PI);
        ctx.scale(-1, 1);
        break;
      case 6: // 90 CW (standard portrait rotation on phones)
        ctx.translate(dstW, 0);
        ctx.rotate(0.5 * Math.PI);
        break;
      case 7: // 90 CW + horizontal flip
        ctx.translate(dstW, dstH);
        ctx.rotate(0.5 * Math.PI);
        ctx.scale(1, -1);
        break;
      case 8: // 90 CCW (270 CW)
        ctx.translate(0, dstH);
        ctx.rotate(-0.5 * Math.PI);
        break;
    }

    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();

    return outCanvas;
  }

  /**
   * Export an array of image files into a single combined multi-page PDF document.
   */
  async exportCombinedPdf(imageFiles: File[]): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    for (const file of imageFiles) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      try {
        let image;
        if (file.type === 'image/png') {
          image = await pdfDoc.embedPng(bytes);
        } else {
          image = await pdfDoc.embedJpg(bytes);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height
        });
      } catch {
        // Fallback: standard A4 blank page if image decode fails
        pdfDoc.addPage([595.28, 841.89]);
      }
    }

    return await pdfDoc.save();
  }

  /**
   * Export a single image file into an individual 1-page PDF document.
   */
  async exportOnePdfPerFile(imageFile: File): Promise<Uint8Array> {
    return this.exportCombinedPdf([imageFile]);
  }
}
