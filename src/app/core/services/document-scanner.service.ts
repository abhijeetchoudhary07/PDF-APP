import { Injectable } from '@angular/core';
import {
  Point,
  DocumentCorners,
  DetectionResult,
  EnhancementOptions,
  EnhancementPreset
} from '../models/scanner.models';

@Injectable({
  providedIn: 'root'
})
export class DocumentScannerService {
  constructor() {}

  /**
   * Detects document boundaries and 4 corner points with confidence scoring.
   * If confidence is below threshold, returns lowConfidence: true.
   */
  async detectDocumentEdges(imageSource: HTMLImageElement | HTMLCanvasElement | Blob): Promise<DetectionResult> {
    const canvas = await this.toCanvas(imageSource);
    const width = canvas.width;
    const height = canvas.height;

    // Downscale for fast edge analysis
    const maxDim = 500;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const sw = Math.max(10, Math.round(width * scale));
    const sh = Math.max(10, Math.round(height * scale));

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = sw;
    smallCanvas.height = sh;
    const sctx = smallCanvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) {
      return this.fallbackDetection(width, height, 0);
    }

    sctx.drawImage(canvas, 0, 0, sw, sh);
    const imgData = sctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // 1. Grayscale + Gaussian blur 3x3
    const gray = new Uint8Array(sw * sh);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    const blurred = new Uint8Array(sw * sh);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x;
        const val =
          gray[idx - sw - 1] + 2 * gray[idx - sw] + gray[idx - sw + 1] +
          2 * gray[idx - 1] + 4 * gray[idx] + 2 * gray[idx + 1] +
          gray[idx + sw - 1] + 2 * gray[idx + sw] + gray[idx + sw + 1];
        blurred[idx] = Math.round(val / 16);
      }
    }

    // 2. Sobel gradient magnitude
    const edges = new Uint8Array(sw * sh);
    let edgeSum = 0;
    let edgeCount = 0;

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x;
        const gx =
          -blurred[idx - sw - 1] + blurred[idx - sw + 1] -
          2 * blurred[idx - 1] + 2 * blurred[idx + 1] -
          blurred[idx + sw - 1] + blurred[idx + sw + 1];

        const gy =
          -blurred[idx - sw - 1] - 2 * blurred[idx - sw] - blurred[idx - sw + 1] +
          blurred[idx + sw - 1] + 2 * blurred[idx + sw] + blurred[idx + sw + 1];

        const mag = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy)));
        edges[idx] = mag;
        if (mag > 40) {
          edgeSum += mag;
          edgeCount++;
        }
      }
    }

    // 3. Find candidate corner points
    // Score quadrants: TL (min x+y), TR (max x-y), BR (max x+y), BL (min x-y)
    let bestTL: Point = { x: Math.round(sw * 0.05), y: Math.round(sh * 0.05) };
    let bestTR: Point = { x: Math.round(sw * 0.95), y: Math.round(sh * 0.05) };
    let bestBR: Point = { x: Math.round(sw * 0.95), y: Math.round(sh * 0.95) };
    let bestBL: Point = { x: Math.round(sw * 0.05), y: Math.round(sh * 0.95) };

    let minSum = Infinity;
    let maxSum = -Infinity;
    let maxDiff = -Infinity;
    let minDiff = Infinity;

    // Sample edge pixels
    let validEdgePoints = 0;
    const threshold = 55;

    for (let y = 5; y < sh - 5; y += 2) {
      for (let x = 5; x < sw - 5; x += 2) {
        const idx = y * sw + x;
        if (edges[idx] > threshold) {
          validEdgePoints++;
          const sum = x + y;
          const diff = x - y;

          if (sum < minSum) {
            minSum = sum;
            bestTL = { x, y };
          }
          if (sum > maxSum) {
            maxSum = sum;
            bestBR = { x, y };
          }
          if (diff > maxDiff) {
            maxDiff = diff;
            bestTR = { x, y };
          }
          if (diff < minDiff) {
            minDiff = diff;
            bestBL = { x, y };
          }
        }
      }
    }

    // 4. Calculate Confidence
    // Check if quad has reasonable area (> 20% of image) and enough edges
    const quadArea = this.calculatePolygonArea([bestTL, bestTR, bestBR, bestBL]);
    const totalArea = sw * sh;
    const areaRatio = quadArea / totalArea;

    let confidence = 0;
    if (areaRatio > 0.25 && areaRatio < 0.98 && validEdgePoints > 40) {
      const edgeDensityScore = Math.min(40, (validEdgePoints / (sw + sh)) * 15);
      const areaScore = Math.min(35, areaRatio * 45);
      const geometryScore = this.isReasonableQuad(bestTL, bestTR, bestBR, bestBL) ? 25 : 5;
      confidence = Math.min(95, Math.round(edgeDensityScore + areaScore + geometryScore));
    } else {
      confidence = Math.max(10, Math.round(areaRatio * 30));
    }

    const lowConfidence = confidence < 45;

    // Scale back corners to original image dimensions
    const originalCorners: DocumentCorners = lowConfidence
      ? {
          topLeft: { x: Math.round(width * 0.05), y: Math.round(height * 0.05) },
          topRight: { x: Math.round(width * 0.95), y: Math.round(height * 0.05) },
          bottomRight: { x: Math.round(width * 0.95), y: Math.round(height * 0.95) },
          bottomLeft: { x: Math.round(width * 0.05), y: Math.round(height * 0.95) }
        }
      : {
          topLeft: { x: Math.round(bestTL.x / scale), y: Math.round(bestTL.y / scale) },
          topRight: { x: Math.round(bestTR.x / scale), y: Math.round(bestTR.y / scale) },
          bottomRight: { x: Math.round(bestBR.x / scale), y: Math.round(bestBR.y / scale) },
          bottomLeft: { x: Math.round(bestBL.x / scale), y: Math.round(bestBL.y / scale) }
        };

    return {
      detected: !lowConfidence,
      confidence,
      corners: originalCorners,
      imageWidth: width,
      imageHeight: height,
      lowConfidence
    };
  }

  private fallbackDetection(width: number, height: number, confidence: number): DetectionResult {
    return {
      detected: false,
      confidence,
      corners: {
        topLeft: { x: Math.round(width * 0.05), y: Math.round(height * 0.05) },
        topRight: { x: Math.round(width * 0.95), y: Math.round(height * 0.05) },
        bottomRight: { x: Math.round(width * 0.95), y: Math.round(height * 0.95) },
        bottomLeft: { x: Math.round(width * 0.05), y: Math.round(height * 0.95) }
      },
      imageWidth: width,
      imageHeight: height,
      lowConfidence: true
    };
  }

  private calculatePolygonArea(pts: Point[]): number {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area / 2);
  }

  private isReasonableQuad(tl: Point, tr: Point, br: Point, bl: Point): boolean {
    // Top width vs Bottom width, Left height vs Right height
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

    if (topW < 20 || botW < 20 || leftH < 20 || rightH < 20) return false;
    const wRatio = Math.min(topW, botW) / Math.max(topW, botW);
    const hRatio = Math.min(leftH, rightH) / Math.max(leftH, rightH);
    return wRatio > 0.4 && hRatio > 0.4;
  }

  /**
   * Perspective warp: un-skews the quadrilateral region into an orthogonal rectangle.
   */
  async perspectiveWarp(
    imageSource: HTMLImageElement | HTMLCanvasElement | Blob,
    corners: DocumentCorners
  ): Promise<HTMLCanvasElement> {
    const srcCanvas = await this.toCanvas(imageSource);
    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;

    // Calculate target width and height based on corner distances
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

    const targetW = Math.max(100, Math.round(Math.max(topW, botW)));
    const targetH = Math.max(100, Math.round(Math.max(leftH, rightH)));

    const destCanvas = document.createElement('canvas');
    destCanvas.width = targetW;
    destCanvas.height = targetH;
    const ctx = destCanvas.getContext('2d');
    if (!ctx) return srcCanvas;

    // Perspective mapping via triangular subdivision (Triangle 1: TL-TR-BL, Triangle 2: TR-BR-BL)
    this.drawTriangleWarp(
      ctx,
      srcCanvas,
      [tl, tr, bl],
      [{ x: 0, y: 0 }, { x: targetW, y: 0 }, { x: 0, y: targetH }]
    );

    this.drawTriangleWarp(
      ctx,
      srcCanvas,
      [tr, br, bl],
      [{ x: targetW, y: 0 }, { x: targetW, y: targetH }, { x: 0, y: targetH }]
    );

    return destCanvas;
  }

  /**
   * Affine transformation for a single triangle to map source triangle to destination triangle.
   */
  private drawTriangleWarp(
    ctx: CanvasRenderingContext2D,
    src: HTMLCanvasElement,
    srcTri: [Point, Point, Point],
    destTri: [Point, Point, Point]
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(destTri[0].x, destTri[0].y);
    ctx.lineTo(destTri[1].x, destTri[1].y);
    ctx.lineTo(destTri[2].x, destTri[2].y);
    ctx.closePath();
    ctx.clip();

    const [x0, y0] = [srcTri[0].x, srcTri[0].y];
    const [x1, y1] = [srcTri[1].x, srcTri[1].y];
    const [x2, y2] = [srcTri[2].x, srcTri[2].y];

    const [u0, v0] = [destTri[0].x, destTri[0].y];
    const [u1, v1] = [destTri[1].x, destTri[1].y];
    const [u2, v2] = [destTri[2].x, destTri[2].y];

    const denom = (x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1));
    if (Math.abs(denom) < 0.0001) {
      ctx.restore();
      return;
    }

    const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / denom;
    const b = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / denom;
    const c = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / denom;

    const d = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / denom;
    const e = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / denom;
    const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / denom;

    ctx.transform(a, d, b, e, c, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  /**
   * Applies auto-enhancement presets and fine-tuning controls.
   */
  async enhanceImage(
    canvasOrBlob: HTMLCanvasElement | Blob,
    options: EnhancementOptions
  ): Promise<HTMLCanvasElement> {
    const baseCanvas = await this.toCanvas(canvasOrBlob);
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return baseCanvas;

    ctx.drawImage(baseCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const { preset, brightness, contrast, sharpen } = options;

    // Apply Preset Algorithms
    switch (preset) {
      case 'grayscale':
        for (let i = 0; i < data.length; i += 4) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = g;
          data[i + 1] = g;
          data[i + 2] = g;
        }
        break;

      case 'bw':
        // Adaptive / Otsu-inspired binarization for clean printed documents
        for (let i = 0; i < data.length; i += 4) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const val = g >= 135 ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
        break;

      case 'document':
        // Document: sharpen contrast, whiten yellowish/gray background
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (lum > 170) {
            // Push background towards pure white
            const boost = (lum - 170) * 1.5;
            r = Math.min(255, r + boost);
            g = Math.min(255, g + boost);
            b = Math.min(255, b + boost);
          } else {
            // Darken text strokes for crisp readability
            r = Math.max(0, r * 0.85);
            g = Math.max(0, g * 0.85);
            b = Math.max(0, b * 0.85);
          }

          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        break;

      case 'high_contrast':
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const val = data[i + c];
            // S-curve contrast stretch
            const norm = val / 255;
            const curve = norm < 0.5 ? 2 * norm * norm : 1 - 2 * (1 - norm) * (1 - norm);
            data[i + c] = Math.round(curve * 255);
          }
        }
        break;

      case 'original':
      default:
        // No preset modification
        break;
    }

    // Apply Fine-tuning: Brightness & Contrast
    if (brightness !== 0 || contrast !== 0) {
      const bFactor = brightness * 2.55; // -255 to 255
      const cFactor = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));

      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let val = data[i + c] + bFactor;
          if (contrast !== 0) {
            val = cFactor * (val - 128) + 128;
          }
          data[i + c] = Math.max(0, Math.min(255, val));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Apply Sharpening if requested
    if (sharpen > 0) {
      this.applySharpen(ctx, w, h, sharpen / 100);
    }

    return canvas;
  }

  private applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const copy = new Uint8ClampedArray(data);

    const a = amount * 0.6;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const up = ((y - 1) * w + x) * 4 + c;
          const down = ((y + 1) * w + x) * 4 + c;
          const left = (y * w + (x - 1)) * 4 + c;
          const right = (y * w + (x + 1)) * 4 + c;

          const center = copy[idx + c];
          const laplacian = 4 * center - copy[up] - copy[down] - copy[left] - copy[right];
          data[idx + c] = Math.max(0, Math.min(255, center + a * laplacian));
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Rotates canvas by 90, 180, or 270 degrees.
   */
  rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
    const rot = ((degrees % 360) + 360) % 360;
    if (rot === 0) return source;

    const isSwapped = rot === 90 || rot === 270;
    const dest = document.createElement('canvas');
    dest.width = isSwapped ? source.height : source.width;
    dest.height = isSwapped ? source.width : source.height;

    const ctx = dest.getContext('2d');
    if (ctx) {
      ctx.translate(dest.width / 2, dest.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(source, -source.width / 2, -source.height / 2);
    }

    return dest;
  }

  /**
   * Converts any image source to an HTMLCanvasElement.
   */
  async toCanvas(source: HTMLImageElement | HTMLCanvasElement | Blob): Promise<HTMLCanvasElement> {
    if (source instanceof HTMLCanvasElement) {
      return source;
    }

    if (source instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      canvas.width = source.naturalWidth || source.width;
      canvas.height = source.naturalHeight || source.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(source, 0, 0);
      return canvas;
    }

    // Blob / File
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(source);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  /**
   * Converts canvas to Blob.
   */
  async canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob conversion failed'));
      }, type, quality);
    });
  }
}
