import { Injectable } from '@angular/core';
import { RedactionRegion } from '../models/image-redaction.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class ImageRedactionService {

  /**
   * Automatically detects faces to create suggested blur regions.
   * If FaceDetector is unavailable, returns an empty array.
   */
  async detectFacesForRedaction(canvas: HTMLCanvasElement): Promise<RedactionRegion[]> {
    const regions: RedactionRegion[] = [];
    try {
      const win = window as any;
      if (typeof win.FaceDetector === 'function') {
        const detector = new win.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
        const faces = await detector.detect(canvas);
        if (faces && faces.length > 0) {
          for (let i = 0; i < faces.length; i++) {
            const b = faces[i].boundingBox;
            // Pad face box slightly to cover hair/ears
            const padX = Math.round(b.width * 0.1);
            const padY = Math.round(b.height * 0.1);
            regions.push({
              id: 'face_' + (i + 1),
              x: Math.max(0, Math.round(b.x - padX)),
              y: Math.max(0, Math.round(b.y - padY)),
              width: Math.min(canvas.width, Math.round(b.width + padX * 2)),
              height: Math.min(canvas.height, Math.round(b.height + padY * 2)),
              type: 'blur',
              intensity: 6,
              label: 'Face ' + (i + 1)
            });
          }
        }
      }
    } catch {
      // Graceful fallback
    }
    return regions;
  }

  /**
   * Permanently and irreversibly redacts the specified regions on the canvas.
   * Pixels outside the specified regions remain 100% untouched.
   */
  applyRedaction(canvas: HTMLCanvasElement, regions: RedactionRegion[]): HTMLCanvasElement {
    if (!regions || regions.length === 0) return canvas;

    const outCanvas = createSafeCanvas(canvas.width, canvas.height);
    const ctx = getSafeContext(outCanvas);
    if (!ctx) return canvas;

    ctx.drawImage(canvas, 0, 0);

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (const region of regions) {
      const rx = Math.max(0, Math.min(w - 1, Math.round(region.x)));
      const ry = Math.max(0, Math.min(h - 1, Math.round(region.y)));
      const rw = Math.max(1, Math.min(w - rx, Math.round(region.width)));
      const rh = Math.max(1, Math.min(h - ry, Math.round(region.height)));
      const intensity = Math.max(1, Math.min(10, region.intensity || 5));

      if (region.type === 'pixelate') {
        this.pixelateRegion(data, w, rx, ry, rw, rh, intensity);
      } else {
        this.blurRegion(data, w, rx, ry, rw, rh, intensity);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  /**
   * Applies pixelation (mosaic tiles) to the given bounding box.
   */
  private pixelateRegion(
    data: Uint8ClampedArray,
    canvasWidth: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    intensity: number
  ) {
    const blockSize = Math.max(3, Math.round(intensity * 2.8 + 2));

    for (let by = ry; by < ry + rh; by += blockSize) {
      for (let bx = rx; bx < rx + rw; bx += blockSize) {
        const curBlockW = Math.min(blockSize, rx + rw - bx);
        const curBlockH = Math.min(blockSize, ry + rh - by);

        let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        let count = 0;

        for (let y = by; y < by + curBlockH; y++) {
          for (let x = bx; x < bx + curBlockW; x++) {
            const idx = (y * canvasWidth + x) * 4;
            sumR += data[idx];
            sumG += data[idx + 1];
            sumB += data[idx + 2];
            sumA += data[idx + 3];
            count++;
          }
        }

        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);
        const avgA = Math.round(sumA / count);

        for (let y = by; y < by + curBlockH; y++) {
          for (let x = bx; x < bx + curBlockW; x++) {
            const idx = (y * canvasWidth + x) * 4;
            data[idx] = avgR;
            data[idx + 1] = avgG;
            data[idx + 2] = avgB;
            data[idx + 3] = avgA;
          }
        }
      }
    }
  }

  /**
   * Applies multi-pass box blur to mathematically approximate Gaussian blur
   * within the exact boundary of the region.
   */
  private blurRegion(
    data: Uint8ClampedArray,
    canvasWidth: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    intensity: number
  ) {
    const radius = Math.max(2, Math.round(intensity * 2.5 + 1));
    const passes = 3; // 3-pass box blur approximates Gaussian blur

    // Extract subregion buffer
    const sub = new Uint8ClampedArray(rw * rh * 4);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const srcIdx = ((ry + y) * canvasWidth + (rx + x)) * 4;
        const dstIdx = (y * rw + x) * 4;
        sub[dstIdx] = data[srcIdx];
        sub[dstIdx + 1] = data[srcIdx + 1];
        sub[dstIdx + 2] = data[srcIdx + 2];
        sub[dstIdx + 3] = data[srcIdx + 3];
      }
    }

    const temp = new Uint8ClampedArray(rw * rh * 4);

    for (let p = 0; p < passes; p++) {
      // Horizontal blur pass
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          let r = 0, g = 0, b = 0, a = 0, count = 0;
          const minK = Math.max(0, x - radius);
          const maxK = Math.min(rw - 1, x + radius);
          for (let k = minK; k <= maxK; k++) {
            const idx = (y * rw + k) * 4;
            r += sub[idx];
            g += sub[idx + 1];
            b += sub[idx + 2];
            a += sub[idx + 3];
            count++;
          }
          const dst = (y * rw + x) * 4;
          temp[dst] = Math.round(r / count);
          temp[dst + 1] = Math.round(g / count);
          temp[dst + 2] = Math.round(b / count);
          temp[dst + 3] = Math.round(a / count);
        }
      }

      // Vertical blur pass
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          let r = 0, g = 0, b = 0, a = 0, count = 0;
          const minK = Math.max(0, y - radius);
          const maxK = Math.min(rh - 1, y + radius);
          for (let k = minK; k <= maxK; k++) {
            const idx = (k * rw + x) * 4;
            r += temp[idx];
            g += temp[idx + 1];
            b += temp[idx + 2];
            a += temp[idx + 3];
            count++;
          }
          const dst = (y * rw + x) * 4;
          sub[dst] = Math.round(r / count);
          sub[dst + 1] = Math.round(g / count);
          sub[dst + 2] = Math.round(b / count);
          sub[dst + 3] = Math.round(a / count);
        }
      }
    }

    // Write back blurred pixels to main image data
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const srcIdx = (y * rw + x) * 4;
        const dstIdx = ((ry + y) * canvasWidth + (rx + x)) * 4;
        data[dstIdx] = sub[srcIdx];
        data[dstIdx + 1] = sub[srcIdx + 1];
        data[dstIdx + 2] = sub[srcIdx + 2];
        data[dstIdx + 3] = sub[srcIdx + 3];
      }
    }
  }

  /**
   * Measures pixel luminance variance within a specified region.
   * Used to assert that blurring significantly flattens variance.
   */
  measureRegionVariance(canvas: HTMLCanvasElement, region: { x: number; y: number; width: number; height: number }): number {
    const ctx = getSafeContext(canvas);
    if (!ctx) return 0;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;

    const values: number[] = [];
    const rx = Math.max(0, Math.round(region.x));
    const ry = Math.max(0, Math.round(region.y));
    const rw = Math.min(canvas.width - rx, Math.round(region.width));
    const rh = Math.min(canvas.height - ry, Math.round(region.height));

    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const idx = (y * w + x) * 4;
        const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        values.push(lum);
      }
    }

    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return variance;
  }

  /**
   * Applies redactions to a batch of files.
   */
  async processBatch(
    files: File[],
    getRegionsForFile: (file: File) => Promise<RedactionRegion[]>,
    onProgress?: (progressPct: number) => void
  ): Promise<File[]> {
    const results: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const regions = await getRegionsForFile(file);

      const canvas = await this.fileToCanvas(file);
      const redactedCanvas = this.applyRedaction(canvas, regions);
      const blob = await this.canvasToBlob(redactedCanvas, file.type || 'image/jpeg');
      const outFile = new File([blob], file.name, { type: file.type || 'image/jpeg', lastModified: Date.now() });
      results.push(outFile);

      if (onProgress) {
        onProgress(Math.round(((i + 1) / files.length) * 100));
      }
    }
    return results;
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
        }, mimeType, 0.92);
      } else {
        reject(new Error('Canvas toBlob is not supported.'));
      }
    });
  }
}
