import { Injectable } from '@angular/core';
import { ImageEnhanceOptions, ImageEnhanceResult } from '../models/image-enhance.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class ImageEnhanceService {

  /**
   * Catmull-Rom cubic spline interpolation kernel for smooth bicubic scaling.
   */
  private cubicInterpolate(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    const d = p1;
    return a * t * t * t + b * t * t + c * t + d;
  }

  /**
   * High-quality bicubic upscale by factor of 2 or 4.
   * Produces output dimensions that are exact multiples of the input.
   */
  bicubicUpscale(sourceCanvas: HTMLCanvasElement, scale: 2 | 4): HTMLCanvasElement {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const dstW = srcW * scale;
    const dstH = srcH * scale;

    const outCanvas = createSafeCanvas(dstW, dstH);
    const srcCtx = getSafeContext(sourceCanvas);
    const dstCtx = getSafeContext(outCanvas);
    if (!srcCtx || !dstCtx) return sourceCanvas;

    const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
    const src = srcImgData.data;

    const dstImgData = dstCtx.getImageData(0, 0, dstW, dstH);
    const dst = dstImgData.data;

    // Helper to get pixel clamped at boundaries
    const getPixel = (x: number, y: number, ch: number): number => {
      const cx = Math.max(0, Math.min(srcW - 1, x));
      const cy = Math.max(0, Math.min(srcH - 1, y));
      return src[(cy * srcW + cx) * 4 + ch];
    };

    // Separable bicubic resampling:
    // First resample horizontally into intermediate buffer
    const interBuffer = new Float32Array(dstW * srcH * 4);

    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < dstW; x++) {
        const srcX = x / scale;
        const x0 = Math.floor(srcX);
        const t = srcX - x0;

        for (let ch = 0; ch < 4; ch++) {
          const p0 = getPixel(x0 - 1, y, ch);
          const p1 = getPixel(x0, y, ch);
          const p2 = getPixel(x0 + 1, y, ch);
          const p3 = getPixel(x0 + 2, y, ch);

          const val = this.cubicInterpolate(p0, p1, p2, p3, t);
          interBuffer[(y * dstW + x) * 4 + ch] = val;
        }
      }
    }

    // Helper for intermediate buffer clamped access
    const getInter = (x: number, y: number, ch: number): number => {
      const cy = Math.max(0, Math.min(srcH - 1, y));
      return interBuffer[(cy * dstW + x) * 4 + ch];
    };

    // Second resample vertically from intermediate buffer into destination
    for (let y = 0; y < dstH; y++) {
      const srcY = y / scale;
      const y0 = Math.floor(srcY);
      const t = srcY - y0;

      for (let x = 0; x < dstW; x++) {
        const dstIdx = (y * dstW + x) * 4;

        for (let ch = 0; ch < 4; ch++) {
          const p0 = getInter(x, y0 - 1, ch);
          const p1 = getInter(x, y0, ch);
          const p2 = getInter(x, y0 + 1, ch);
          const p3 = getInter(x, y0 + 2, ch);

          const val = this.cubicInterpolate(p0, p1, p2, p3, t);
          dst[dstIdx + ch] = Math.round(Math.min(255, Math.max(0, val)));
        }
      }
    }

    dstCtx.putImageData(dstImgData, 0, 0);
    return outCanvas;
  }

  /**
   * Applies unsharp masking to enhance edge contrast and readability.
   * Does not hallucinate new details, but crisply defines edges.
   */
  applyUnsharpMask(
    canvas: HTMLCanvasElement,
    amount: number = 1.2,
    radius: number = 1,
    threshold: number = 3
  ): HTMLCanvasElement {
    const w = canvas.width;
    const h = canvas.height;
    const outCanvas = createSafeCanvas(w, h);
    const srcCtx = getSafeContext(canvas);
    const dstCtx = getSafeContext(outCanvas);
    if (!srcCtx || !dstCtx) return canvas;

    const originalData = srcCtx.getImageData(0, 0, w, h);
    const orig = originalData.data;

    // Create blurred copy
    const blurred = new Uint8ClampedArray(w * h * 4);
    const r = Math.max(1, Math.round(radius));

    // Horizontal box blur
    const temp = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const minK = Math.max(0, x - r);
        const maxK = Math.min(w - 1, x + r);
        for (let k = minK; k <= maxK; k++) {
          const idx = (y * w + k) * 4;
          sumR += orig[idx];
          sumG += orig[idx + 1];
          sumB += orig[idx + 2];
          count++;
        }
        const tidx = (y * w + x) * 4;
        temp[tidx] = sumR / count;
        temp[tidx + 1] = sumG / count;
        temp[tidx + 2] = sumB / count;
      }
    }

    // Vertical box blur
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const minK = Math.max(0, y - r);
        const maxK = Math.min(h - 1, y + r);
        for (let k = minK; k <= maxK; k++) {
          const tidx = (k * w + x) * 4;
          sumR += temp[tidx];
          sumG += temp[tidx + 1];
          sumB += temp[tidx + 2];
          count++;
        }
        const bidx = (y * w + x) * 4;
        blurred[bidx] = Math.round(sumR / count);
        blurred[bidx + 1] = Math.round(sumG / count);
        blurred[bidx + 2] = Math.round(sumB / count);
      }
    }

    const outData = dstCtx.getImageData(0, 0, w, h);
    const out = outData.data;

    for (let i = 0; i < orig.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const oVal = orig[i + ch];
        const bVal = blurred[i + ch];
        const diff = oVal - bVal;

        if (Math.abs(diff) >= threshold) {
          const sharpened = oVal + amount * diff;
          out[i + ch] = Math.round(Math.min(255, Math.max(0, sharpened)));
        } else {
          out[i + ch] = oVal;
        }
      }
      out[i + 3] = orig[i + 3]; // Preserve alpha
    }

    dstCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Measures average edge contrast (gradient magnitude) across edge transitions in the canvas.
   */
  calculateEdgeContrast(canvas: HTMLCanvasElement): number {
    const ctx = getSafeContext(canvas);
    if (!ctx) return 0;

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let totalGradient = 0;
    let count = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const idxRight = (y * w + (x + 1)) * 4;
        const idxDown = ((y + 1) * w + x) * 4;

        const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        const lumRight = 0.2126 * data[idxRight] + 0.7152 * data[idxRight + 1] + 0.0722 * data[idxRight + 2];
        const lumDown = 0.2126 * data[idxDown] + 0.7152 * data[idxDown + 1] + 0.0722 * data[idxDown + 2];

        const grad = Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
        totalGradient += grad;
        count++;
      }
    }

    return count > 0 ? totalGradient / count : 0;
  }

  /**
   * Full pipeline: bicubic upscale + unsharp mask.
   */
  async enhanceImage(file: File, options: ImageEnhanceOptions): Promise<File> {
    const sourceCanvas = await this.fileToCanvas(file);
    const upscaled = this.bicubicUpscale(sourceCanvas, options.scale);
    const sharpened = this.applyUnsharpMask(
      upscaled,
      options.unsharpAmount,
      options.unsharpRadius,
      options.unsharpThreshold
    );

    const blob = await this.canvasToBlob(sharpened, file.type || 'image/jpeg');
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const ext = (file.type || 'image/jpeg').split('/')[1] || 'jpeg';
    return new File([blob], `${baseName}_enhanced_${options.scale}x.${ext}`, {
      type: file.type || 'image/jpeg',
      lastModified: Date.now()
    });
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

  async canvasToBlob(canvas: HTMLCanvasElement, mimeType: string = 'image/jpeg'): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed.'));
        }, mimeType, 0.95);
      } else {
        reject(new Error('Canvas toBlob is not supported.'));
      }
    });
  }
}
