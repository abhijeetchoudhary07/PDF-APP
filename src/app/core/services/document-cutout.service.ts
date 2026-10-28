import { Injectable } from '@angular/core';
import { DocumentCutoutOptions, DocumentCutoutSuitability } from '../models/document-cutout.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class DocumentCutoutService {

  /**
   * Evaluates if the image is a document/signature on a plain paper background.
   * Reports cluttered photos as unsuitable rather than producing torn or noisy output.
   */
  evaluateSuitability(canvas: HTMLCanvasElement): DocumentCutoutSuitability {
    const ctx = getSafeContext(canvas);
    if (!ctx) {
      return { suitable: false, reason: 'Unable to read canvas context.' };
    }

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample border pixels (top, bottom, left, right 8% perimeter) to measure background paper
    const borderSamples: Array<{ r: number; g: number; b: number; lum: number }> = [];
    const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
    const borderInset = Math.max(2, Math.floor(Math.min(w, h) * 0.08));

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const isBorder = (y < borderInset || y >= h - borderInset || x < borderInset || x >= w - borderInset);
        if (isBorder) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Shared luminosity logic from SignatureProcessingService (Rec. 709)
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          borderSamples.push({ r, g, b, lum });
        }
      }
    }

    if (borderSamples.length === 0) {
      return { suitable: false, reason: 'No background samples could be gathered.' };
    }

    const avgLum = borderSamples.reduce((sum, s) => sum + s.lum, 0) / borderSamples.length;
    const variance = borderSamples.reduce((sum, s) => sum + Math.pow(s.lum - avgLum, 2), 0) / borderSamples.length;
    const stdDev = Math.sqrt(variance);

    // If stdDev is high, the image background has strong patterns/objects/clutter (not plain paper)
    if (stdDev > 26 || avgLum < 120) {
      return {
        suitable: false,
        reason: 'Image background is too varied or dark for clean document cutout. Please use a scan or photo of a document or signature on plain white/light paper.',
        backgroundVariance: stdDev
      };
    }

    const avgR = Math.round(borderSamples.reduce((sum, s) => sum + s.r, 0) / borderSamples.length);
    const avgG = Math.round(borderSamples.reduce((sum, s) => sum + s.g, 0) / borderSamples.length);
    const avgB = Math.round(borderSamples.reduce((sum, s) => sum + s.b, 0) / borderSamples.length);

    // Find darkest content (ink) to check contrast
    let minLum = 255;
    for (let i = 0; i < data.length; i += 4 * step) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum < minLum) minLum = lum;
    }

    const contrastRatio = (avgLum + 5) / (minLum + 5);
    if (contrastRatio < 1.3) {
      return {
        suitable: false,
        reason: 'Insufficient contrast between ink/text and background paper.',
        paperColor: { r: avgR, g: avgG, b: avgB },
        contrastRatio,
        backgroundVariance: stdDev
      };
    }

    return {
      suitable: true,
      paperColor: { r: avgR, g: avgG, b: avgB },
      contrastRatio,
      backgroundVariance: stdDev
    };
  }

  /**
   * Cuts out paper background to produce a transparent PNG while cleanly preserving ink.
   * Shared luminosity logic from SignatureProcessingService with configurable tolerance & feather.
   */
  cutoutBackground(canvas: HTMLCanvasElement, options?: Partial<DocumentCutoutOptions>): HTMLCanvasElement {
    const opts: DocumentCutoutOptions = {
      tolerance: options?.tolerance ?? 30,
      feather: options?.feather ?? 2,
      removeDustNoise: options?.removeDustNoise ?? true
    };

    const outCanvas = createSafeCanvas(canvas.width, canvas.height);
    const ctx = getSafeContext(outCanvas);
    if (!ctx) return canvas;

    ctx.drawImage(canvas, 0, 0);

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Estimate baseline paper background color from border samples
    let sumR = 0, sumG = 0, sumB = 0, sampleCount = 0;
    const borderInset = Math.max(2, Math.floor(Math.min(w, h) * 0.05));

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (y < borderInset || y >= h - borderInset || x < borderInset || x >= w - borderInset) {
          const idx = (y * w + x) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          sampleCount++;
        }
      }
    }

    const paperR = sampleCount > 0 ? sumR / sampleCount : 250;
    const paperG = sampleCount > 0 ? sumG / sampleCount : 250;
    const paperB = sampleCount > 0 ? sumB / sampleCount : 250;
    // Shared Rec. 709 relative luminosity
    const paperLum = 0.2126 * paperR + 0.7152 * paperG + 0.0722 * paperB;

    // Tolerance maps to threshold distance from paper luminance
    const thresholdDelta = opts.tolerance * 0.9;
    const featherDelta = Math.max(1, opts.feather * 6);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) continue;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const distFromPaper = paperLum - lum;

      if (distFromPaper <= thresholdDelta - featherDelta) {
        // Pure background paper -> 100% transparent
        data[i + 3] = 0;
      } else if (distFromPaper < thresholdDelta + featherDelta) {
        // Feathered edge transition zone
        const t = (distFromPaper - (thresholdDelta - featherDelta)) / (featherDelta * 2);
        data[i + 3] = Math.round(Math.min(255, Math.max(0, t * 255)));
      } else {
        // Crisp ink content -> Keep fully opaque with original ink color
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  async processFile(file: File, options?: Partial<DocumentCutoutOptions>): Promise<File> {
    const canvas = await this.fileToCanvas(file);
    const cutoutCanvas = this.cutoutBackground(canvas, options);
    const blob = await this.canvasToBlob(cutoutCanvas, 'image/png');
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    return new File([blob], `${baseName}_cutout.png`, { type: 'image/png', lastModified: Date.now() });
  }

  async fileToCanvas(file: File): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = createSafeCanvas(img.width, img.height);
        const ctx = getSafeContext(canvas);
        if (ctx) ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image file into canvas.'));
      };
      img.src = url;
    });
  }

  async canvasToBlob(canvas: HTMLCanvasElement, mimeType: string = 'image/png'): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed.'));
        }, mimeType, 1.0);
      } else {
        reject(new Error('Canvas toBlob is not supported.'));
      }
    });
  }
}
