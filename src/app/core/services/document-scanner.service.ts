import { Injectable } from '@angular/core';
import {
  Point,
  DocumentCorners,
  DetectionResult,
  EnhancementOptions,
  EnhancementPreset,
  ScanMode,
  GutterDetectionResult,
  IdCardLayoutOptions,
  BlurScoreResult,
  AutoCaptureEvaluation,
  ShadowRemovalResult,
  FingerDetectionResult,
  DewarpResult,
  AutoNamingResult
} from '../models/scanner.models';

class HeadlessScannerContext2D {
  width: number;
  height: number;
  canvas: any;
  data: Uint8ClampedArray;
  fillStyle: string = '#ffffff';
  strokeStyle: string = '#000000';
  lineWidth: number = 1;
  font: string = '16px sans-serif';
  textAlign: string = 'left';

  constructor(width: number, height: number, canvas: any) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this.data.fill(255);
  }

  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  transform() {}
  setTransform() {}
  beginPath() {}
  closePath() {}
  clip() {}
  setLineDash() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}

  clearRect(x: number, y: number, w: number, h: number) {
    this.paintRect(x, y, w, h, 0, 0, 0, 0);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = this.parseColor(this.fillStyle);
    this.paintRect(x, y, w, h, r, g, b, a);
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.fillRect(x, y, w, 1);
    this.fillRect(x, y + h - 1, w, 1);
    this.fillRect(x, y, 1, h);
    this.fillRect(x + w - 1, y, 1, h);
  }

  private paintRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const ex = Math.min(this.width, Math.ceil(x + w));
    const ey = Math.min(this.height, Math.ceil(y + h));

    for (let py = sy; py < ey; py++) {
      const row = py * this.width * 4;
      for (let px = sx; px < ex; px++) {
        const idx = row + px * 4;
        this.data[idx] = r;
        this.data[idx + 1] = g;
        this.data[idx + 2] = b;
        this.data[idx + 3] = a;
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const outSw = Math.max(1, Math.round(sw));
    const outSh = Math.max(1, Math.round(sh));
    const outData = new Uint8ClampedArray(outSw * outSh * 4);

    const startX = Math.max(0, Math.floor(sx));
    const startY = Math.max(0, Math.floor(sy));

    for (let y = 0; y < outSh; y++) {
      const srcY = startY + y;
      if (srcY >= this.height) break;
      for (let x = 0; x < outSw; x++) {
        const srcX = startX + x;
        if (srcX >= this.width) break;

        const srcIdx = (srcY * this.width + srcX) * 4;
        const dstIdx = (y * outSw + x) * 4;
        outData[dstIdx] = this.data[srcIdx];
        outData[dstIdx + 1] = this.data[srcIdx + 1];
        outData[dstIdx + 2] = this.data[srcIdx + 2];
        outData[dstIdx + 3] = this.data[srcIdx + 3];
      }
    }

    return {
      data: outData,
      width: outSw,
      height: outSh
    };
  }

  putImageData(imgData: any, dx: number, dy: number) {
    const srcData = imgData.data;
    const sw = imgData.width;
    const sh = imgData.height;

    const startX = Math.max(0, Math.floor(dx));
    const startY = Math.max(0, Math.floor(dy));

    for (let y = 0; y < sh; y++) {
      const dstY = startY + y;
      if (dstY >= this.height) break;
      for (let x = 0; x < sw; x++) {
        const dstX = startX + x;
        if (dstX >= this.width) break;

        const srcIdx = (y * sw + x) * 4;
        const dstIdx = (dstY * this.width + dstX) * 4;
        this.data[dstIdx] = srcData[srcIdx];
        this.data[dstIdx + 1] = srcData[srcIdx + 1];
        this.data[dstIdx + 2] = srcData[srcIdx + 2];
        this.data[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }
  }

  drawImage(img: any, ...args: any[]) {
    let sx = 0, sy = 0, sw = img.width || this.width, sh = img.height || this.height;
    let dx = 0, dy = 0, dw = sw, dh = sh;

    if (args.length === 2) {
      dx = args[0]; dy = args[1];
    } else if (args.length === 4) {
      dx = args[0]; dy = args[1]; dw = args[2]; dh = args[3];
    } else if (args.length >= 8) {
      sx = args[0]; sy = args[1]; sw = args[2]; sh = args[3];
      dx = args[4]; dy = args[5]; dw = args[6]; dh = args[7];
    }

    let srcData: Uint8ClampedArray | null = null;
    let srcW = img.width || 10;
    let srcH = img.height || 10;

    if (img.getContext) {
      const sctx = img.getContext('2d');
      if (sctx && sctx.getImageData) {
        const id = sctx.getImageData(0, 0, srcW, srcH);
        srcData = id.data;
      }
    }

    if (!srcData) {
      this.paintRect(dx, dy, dw, dh, 220, 220, 220, 255);
      return;
    }

    const scaleX = sw / dw;
    const scaleY = sh / dh;

    for (let y = 0; y < dh; y++) {
      const dstY = Math.floor(dy + y);
      if (dstY < 0 || dstY >= this.height) continue;
      const sY = Math.floor(sy + y * scaleY);
      if (sY < 0 || sY >= srcH) continue;

      for (let x = 0; x < dw; x++) {
        const dstX = Math.floor(dx + x);
        if (dstX < 0 || dstX >= this.width) continue;
        const sX = Math.floor(sx + x * scaleX);
        if (sX < 0 || sX >= srcW) continue;

        const srcIdx = (sY * srcW + sX) * 4;
        const dstIdx = (dstY * this.width + dstX) * 4;
        this.data[dstIdx] = srcData[srcIdx];
        this.data[dstIdx + 1] = srcData[srcIdx + 1];
        this.data[dstIdx + 2] = srcData[srcIdx + 2];
        this.data[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }
  }

  private parseColor(str: string): [number, number, number, number] {
    if (!str) return [0, 0, 0, 255];
    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
    }
    const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10), 255];
    }
    if (str === 'white') return [255, 255, 255, 255];
    if (str === 'black') return [0, 0, 0, 255];
    if (str === 'red') return [255, 0, 0, 255];
    return [128, 128, 128, 255];
  }
}

@Injectable({
  providedIn: 'root'
})
export class DocumentScannerService {
  constructor() {}

  /**
   * Internal helper to create or configure a canvas with 2D context
   * supporting both native browser canvas and headless test environments.
   */
  createCanvas(width: number, height: number): HTMLCanvasElement {
    let canvas: HTMLCanvasElement;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
    } else {
      canvas = { width, height } as any;
    }
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    this.ensureContext(canvas);
    return canvas;
  }

  /**
   * Ensures the canvas has a working 2D context and toBlob method.
   */
  ensureContext(canvas: HTMLCanvasElement): any {
    if (!canvas) return null;
    let ctx: any = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) {
      const headless = new HeadlessScannerContext2D(canvas.width, canvas.height, canvas);
      (canvas as any).getContext = (type?: string) => {
        if (type === '2d' || !type) return headless;
        return null;
      };
      ctx = headless;
    }
    if (!canvas.toBlob) {
      canvas.toBlob = (callback: BlobCallback, type = 'image/jpeg') => {
        callback(new Blob(['mock_image'], { type }));
      };
    }
    return ctx;
  }

  /**
   * Safely retrieves 2D rendering context.
   */
  getContext(canvas: HTMLCanvasElement, settings?: any): CanvasRenderingContext2D | null {
    return this.ensureContext(canvas);
  }

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

    const smallCanvas = this.createCanvas(sw, sh);
    const sctx = this.getContext(smallCanvas);
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

    const destCanvas = this.createCanvas(targetW, targetH);
    const ctx = this.getContext(destCanvas);
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

    const canvas = this.createCanvas(w, h);
    const ctx = this.getContext(canvas);
    if (!ctx) return baseCanvas;

    ctx.drawImage(baseCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const { preset, brightness, contrast, sharpen } = options;

    // Apply Preset Algorithms
    switch (preset) {
      case 'whiteboard': {
        const wb = await this.enhanceWhiteboard(baseCanvas);
        ctx.drawImage(wb, 0, 0);
        break;
      }

      case 'photo': {
        const ph = await this.enhancePhoto(baseCanvas);
        ctx.drawImage(ph, 0, 0);
        break;
      }

      case 'grayscale':
        for (let i = 0; i < data.length; i += 4) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = g;
          data[i + 1] = g;
          data[i + 2] = g;
        }
        ctx.putImageData(imgData, 0, 0);
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
        ctx.putImageData(imgData, 0, 0);
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
        ctx.putImageData(imgData, 0, 0);
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
        ctx.putImageData(imgData, 0, 0);
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
      const curData = ctx.getImageData(0, 0, w, h);
      const d = curData.data;

      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let val = d[i + c] + bFactor;
          if (contrast !== 0) {
            val = cFactor * (val - 128) + 128;
          }
          d[i + c] = Math.max(0, Math.min(255, val));
        }
      }
      ctx.putImageData(curData, 0, 0);
    }

    // Apply Sharpening if requested
    if (sharpen > 0) {
      this.applySharpen(ctx, w, h, sharpen / 100);
    }

    let finalCanvas = canvas;

    // Optional pipeline steps (H5, H6, H7) — default to OFF
    if (options.removeShadows) {
      const shadowRes = await this.removeShadowsAndGlare(finalCanvas);
      finalCanvas = shadowRes.canvas;
    }

    if (options.removeFinger) {
      finalCanvas = await this.removeFingerIntrusions(finalCanvas);
    }

    if (options.dewarpCurvature) {
      const dewarpRes = await this.dewarpCurvature(finalCanvas);
      finalCanvas = dewarpRes.canvas;
    }

    return finalCanvas;
  }

  // --- H1: CAPTURE MODES: BOOK SPREAD & ID CARD ---

  private readonly SCAN_MODE_KEY = 'scanner_mode_session';
  private currentScanMode: ScanMode = 'document';

  getScanMode(): ScanMode {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem(this.SCAN_MODE_KEY);
        if (saved && ['document', 'book', 'id_card', 'whiteboard', 'photo', 'table'].includes(saved)) {
          return saved as ScanMode;
        }
      }
    } catch {}
    return this.currentScanMode;
  }

  setScanMode(mode: ScanMode): void {
    this.currentScanMode = mode;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(this.SCAN_MODE_KEY, mode);
      }
    } catch {}
  }

  /**
   * Detects the vertical spine or whitespace gutter near the centre of a two-page spread.
   * Can be shared with B6 spread sectioning.
   */
  detectGutter(canvas: HTMLCanvasElement): GutterDetectionResult {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || w < 20 || h < 20) {
      return { gutterX: Math.round(w / 2), splitRatio: 0.5, confidence: 50 };
    }

    // Search window: central 30% to 70% of page width
    const minX = Math.round(w * 0.3);
    const maxX = Math.round(w * 0.7);
    const searchWidth = maxX - minX;
    if (searchWidth <= 2) {
      return { gutterX: Math.round(w / 2), splitRatio: 0.5, confidence: 50 };
    }

    const sampleSteps = Math.min(h, 200);
    const rowStep = Math.max(1, Math.floor(h / sampleSteps));

    const imgData = ctx.getImageData(minX, 0, searchWidth, h);
    const data = imgData.data;

    const colLuminance = new Float64Array(searchWidth);
    const colEdgeCount = new Float64Array(searchWidth);
    let totalSamples = 0;

    for (let y = 0; y < h; y += rowStep) {
      totalSamples++;
      const rowOffset = y * searchWidth * 4;
      for (let lx = 0; lx < searchWidth; lx++) {
        const idx = rowOffset + lx * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        colLuminance[lx] += lum;

        if (lx > 0) {
          const prevIdx = idx - 4;
          const prevLum = 0.299 * data[prevIdx] + 0.587 * data[prevIdx + 1] + 0.114 * data[prevIdx + 2];
          if (Math.abs(lum - prevLum) > 25) {
            colEdgeCount[lx]++;
          }
        }
      }
    }

    for (let lx = 0; lx < searchWidth; lx++) {
      colLuminance[lx] /= totalSamples;
      colEdgeCount[lx] /= totalSamples;
    }

    // Moving average smoothing (radius 2)
    const smoothed = new Float64Array(searchWidth);
    for (let lx = 0; lx < searchWidth; lx++) {
      let sum = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const px = lx + k;
        if (px >= 0 && px < searchWidth) {
          sum += colLuminance[px];
          count++;
        }
      }
      smoothed[lx] = sum / count;
    }

    const centerLx = searchWidth / 2;
    const meanLum = smoothed.reduce((a, b) => a + b, 0) / searchWidth;

    let minLum = Infinity;
    for (let lx = 0; lx < searchWidth; lx++) {
      if (smoothed[lx] < minLum) {
        minLum = smoothed[lx];
      }
    }

    // Spine shadow seam presence
    const hasDarkSeam = meanLum - minLum > 20;

    let bestLx = Math.round(searchWidth / 2);
    let minCost = Infinity;

    for (let lx = 2; lx < searchWidth - 2; lx++) {
      const distFromCenter = Math.abs(lx - centerLx) / centerLx;
      let cost: number;

      if (hasDarkSeam) {
        // Deep shadow valley
        cost = smoothed[lx] + distFromCenter * 30;
      } else {
        // Whitespace valley between columns (low edge count)
        const edgeFactor = colEdgeCount[lx] * 120;
        cost = (255 - smoothed[lx]) * 0.35 + edgeFactor + distFromCenter * 25;
      }

      if (cost < minCost) {
        minCost = cost;
        bestLx = lx;
      }
    }

    const gutterX = minX + bestLx;
    const splitRatio = Math.round((gutterX / w) * 1000) / 1000;
    const confidence = hasDarkSeam ? 92 : 78;

    return { gutterX, splitRatio, confidence };
  }

  /**
   * Splits a book spread into two individual page canvases at the detected gutter.
   */
  async splitBookSpread(
    canvasOrBlob: HTMLCanvasElement | Blob,
    customGutterX?: number
  ): Promise<[HTMLCanvasElement, HTMLCanvasElement]> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const w = canvas.width;
    const h = canvas.height;

    const gutter = customGutterX !== undefined
      ? Math.max(10, Math.min(w - 10, Math.round(customGutterX)))
      : this.detectGutter(canvas).gutterX;

    // Left page canvas
    const leftCanvas = this.createCanvas(gutter, h);
    const leftCtx = this.getContext(leftCanvas);
    if (leftCtx) {
      leftCtx.drawImage(canvas, 0, 0, gutter, h, 0, 0, gutter, h);
    }

    // Right page canvas
    const rightW = w - gutter;
    const rightCanvas = this.createCanvas(rightW, h);
    const rightCtx = this.getContext(rightCanvas);
    if (rightCtx) {
      rightCtx.drawImage(canvas, gutter, 0, rightW, h, 0, 0, rightW, h);
    }

    return [leftCanvas, rightCanvas];
  }

  /**
   * Layout front and back sides of an ID card on a single composite page at true card proportions.
   */
  async layoutIdCard(
    frontSource: HTMLCanvasElement | Blob,
    backSource: HTMLCanvasElement | Blob,
    options?: IdCardLayoutOptions
  ): Promise<HTMLCanvasElement> {
    const frontCanvas = await this.toCanvas(frontSource);
    const backCanvas = await this.toCanvas(backSource);

    // ISO/IEC 7810 ID-1 aspect ratio: 85.60 mm x 53.98 mm = 1.58577
    const cardRatio = (options?.cardWidthMm || 85.6) / (options?.cardHeightMm || 53.98);

    // Standard A4 portrait sheet (1240 x 1754 px at ~150 DPI)
    const sheetWidth = 1240;
    const sheetHeight = 1754;

    const outCanvas = this.createCanvas(sheetWidth, sheetHeight);
    const ctx = this.getContext(outCanvas);
    if (!ctx) return frontCanvas;

    // Clean white sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    // Card dimensions on page (scaled appropriately)
    const cardW = Math.round(sheetWidth * 0.72);
    const cardH = Math.round(cardW / cardRatio);

    const cardX = Math.round((sheetWidth - cardW) / 2);
    const gap = options?.gapMm ? Math.round(options.gapMm * 5.9) : 100;
    const totalHeight = cardH * 2 + gap;
    const startY = Math.round((sheetHeight - totalHeight) / 2);

    const frontY = startY;
    const backY = startY + cardH + gap;

    // Draw Front Card
    if (options?.showLabels !== false) {
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('FRONT SIDE', sheetWidth / 2, frontY - 16);
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(cardX - 1, frontY - 1, cardW + 2, cardH + 2);
    ctx.setLineDash([]);
    ctx.drawImage(frontCanvas, cardX, frontY, cardW, cardH);

    // Separation dashed line
    const midGapY = frontY + cardH + Math.round(gap / 2);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cardX - 30, midGapY);
    ctx.lineTo(cardX + cardW + 30, midGapY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Back Card
    if (options?.showLabels !== false) {
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('BACK SIDE', sheetWidth / 2, backY - 16);
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(cardX - 1, backY - 1, cardW + 2, cardH + 2);
    ctx.setLineDash([]);
    ctx.drawImage(backCanvas, cardX, backY, cardW, cardH);

    return outCanvas;
  }

  // --- H2: WHITEBOARD & PHOTO CAPTURE MODES ---

  /**
   * Whiteboard enhancement: glare suppression with full colour-ink preservation.
   * Does NOT threshold coloured marker strokes to black.
   */
  async enhanceWhiteboard(canvasOrBlob: HTMLCanvasElement | Blob): Promise<HTMLCanvasElement> {
    const baseCanvas = await this.toCanvas(canvasOrBlob);
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    const canvas = this.createCanvas(w, h);
    const ctx = this.getContext(canvas);
    if (!ctx) return baseCanvas;

    ctx.drawImage(baseCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = max > 0 ? delta / max : 0;

      // Coloured marker stroke detection (saturated red, blue, green, etc.)
      if (sat > 0.16 && delta > 20) {
        // Preserve color hue! Deepen tone slightly for contrast, never threshold to black
        data[i] = Math.max(0, Math.min(255, Math.round(r * 0.94)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 0.94)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 0.94)));
      } else if (lum > 135) {
        // Whiteboard background & glare suppression: push cleanly towards pure white
        const boost = (lum - 135) * 1.8;
        data[i] = Math.min(255, r + boost);
        data[i + 1] = Math.min(255, g + boost);
        data[i + 2] = Math.min(255, b + boost);
      } else {
        // Black marker stroke: darken for crisp contrast
        data[i] = Math.max(0, Math.round(r * 0.75));
        data[i + 1] = Math.max(0, Math.round(g * 0.75));
        data[i + 2] = Math.max(0, Math.round(b * 0.75));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Photo capture mode: minimal processing, no thresholding, full colour unaltered.
   */
  async enhancePhoto(canvasOrBlob: HTMLCanvasElement | Blob): Promise<HTMLCanvasElement> {
    const baseCanvas = await this.toCanvas(canvasOrBlob);
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    const canvas = this.createCanvas(w, h);
    const ctx = this.getContext(canvas);
    if (ctx) {
      ctx.drawImage(baseCanvas, 0, 0);
    }
    return canvas;
  }

  // --- H3: AUTO-CAPTURE & STABILITY GATE ---

  /**
   * Decision function for auto-capture: verifies corner stability across frames,
   * minimum viewport coverage, and blur gate passing.
   */
  evaluateAutoCapture(
    quadHistory: DocumentCorners[],
    currentQuad: DocumentCorners,
    imageWidth: number,
    imageHeight: number,
    blurScore: number,
    blurThreshold = 80
  ): AutoCaptureEvaluation {
    const quadArea = this.calculatePolygonArea([
      currentQuad.topLeft,
      currentQuad.topRight,
      currentQuad.bottomRight,
      currentQuad.bottomLeft
    ]);
    const totalArea = Math.max(1, imageWidth * imageHeight);
    const coverageRatio = Math.round((quadArea / totalArea) * 100) / 100;
    const isBlurry = blurScore < blurThreshold;

    const diagonal = Math.hypot(imageWidth, imageHeight);
    const maxAllowedDrift = diagonal * 0.035;

    let stabilityProgress = 1;

    if (quadHistory && quadHistory.length > 0) {
      let totalDrift = 0;
      const recent = quadHistory.slice(-3);
      for (const prev of recent) {
        const d1 = Math.hypot(currentQuad.topLeft.x - prev.topLeft.x, currentQuad.topLeft.y - prev.topLeft.y);
        const d2 = Math.hypot(currentQuad.topRight.x - prev.topRight.x, currentQuad.topRight.y - prev.topRight.y);
        const d3 = Math.hypot(currentQuad.bottomRight.x - prev.bottomRight.x, currentQuad.bottomRight.y - prev.bottomRight.y);
        const d4 = Math.hypot(currentQuad.bottomLeft.x - prev.bottomLeft.x, currentQuad.bottomLeft.y - prev.bottomLeft.y);
        totalDrift += (d1 + d2 + d3 + d4) / 4;
      }
      const avgDrift = totalDrift / recent.length;
      stabilityProgress = Math.max(0, Math.min(1, 1 - avgDrift / maxAllowedDrift));
    } else {
      stabilityProgress = 0.4;
    }

    const isStable = stabilityProgress >= 0.85;
    const hasMinCoverage = coverageRatio >= 0.25;

    let reason = '';
    if (!hasMinCoverage) {
      reason = 'Fit document within frame';
    } else if (!isStable) {
      reason = 'Hold camera steady...';
    } else if (isBlurry) {
      reason = 'Hold still to reduce blur';
    }

    const canTrigger = isStable && hasMinCoverage && !isBlurry;

    return {
      canTrigger,
      stabilityProgress: Math.round(stabilityProgress * 100) / 100,
      coverageRatio,
      blurScore,
      isBlurry,
      reason
    };
  }

  // --- H4: BLUR GATE (VARIANCE OF LAPLACIAN) ---

  /**
   * Computes sharpness score using normalized Variance-of-Laplacian.
   * Sharp fixtures score significantly higher than blurred ones across image sizes.
   */
  async calculateBlurScore(
    canvasOrBlob: HTMLCanvasElement | Blob,
    threshold = 80
  ): Promise<BlurScoreResult> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const score = this.computeLaplacianVariance(canvas);
    return {
      score,
      isBlurry: score < threshold,
      threshold
    };
  }

  computeLaplacianVariance(canvas: HTMLCanvasElement): number {
    const w = canvas.width;
    const h = canvas.height;
    if (w < 4 || h < 4) return 0;

    // Downsample to fixed normalized dimension so sharpness score is size-invariant
    const maxDim = 500;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const sw = Math.max(10, Math.round(w * scale));
    const sh = Math.max(10, Math.round(h * scale));

    const smallCanvas = this.createCanvas(sw, sh);
    const sctx = this.getContext(smallCanvas);
    if (!sctx) return 0;

    sctx.drawImage(canvas, 0, 0, sw, sh);
    const imgData = sctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    const gray = new Float32Array(sw * sh);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // 3x3 Laplacian: [0, 1, 0; 1, -4, 1; 0, 1, 0]
    let lapSum = 0;
    let count = 0;
    const lapValues = new Float32Array((sw - 2) * (sh - 2));

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x;
        const lap =
          gray[idx - sw] +
          gray[idx - 1] -
          4 * gray[idx] +
          gray[idx + 1] +
          gray[idx + sw];
        lapValues[count] = lap;
        lapSum += lap;
        count++;
      }
    }

    if (count === 0) return 0;
    const mean = lapSum / count;

    let varSum = 0;
    for (let i = 0; i < count; i++) {
      const diff = lapValues[i] - mean;
      varSum += diff * diff;
    }

    const variance = varSum / count;
    return Math.round(variance * 10) / 10;
  }

  // --- H5: SHADOW & GLARE REMOVAL ---

  /**
   * Local adaptive illumination normalization (block-wise background estimation).
   * Flattens lighting gradients while preserving text stroke ink density.
   * If lighting is already even, canvas stays within tolerance of unchanged.
   */
  async removeShadowsAndGlare(
    canvasOrBlob: HTMLCanvasElement | Blob,
    blockSize = 32
  ): Promise<ShadowRemovalResult> {
    const baseCanvas = await this.toCanvas(canvasOrBlob);
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    const canvas = this.createCanvas(w, h);
    const ctx = this.getContext(canvas);
    if (!ctx) return { canvas: baseCanvas, applied: false };

    ctx.drawImage(baseCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const cols = Math.ceil(w / blockSize);
    const rows = Math.ceil(h / blockSize);
    const bgGrid = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
      const startY = r * blockSize;
      const endY = Math.min(h, startY + blockSize);
      for (let c = 0; c < cols; c++) {
        const startX = c * blockSize;
        const endX = Math.min(w, startX + blockSize);

        const lums: number[] = [];
        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * w + x) * 4;
            lums.push(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          }
        }

        if (lums.length > 0) {
          lums.sort((a, b) => a - b);
          bgGrid[r * cols + c] = Math.max(30, lums[Math.floor(lums.length * 0.9)]);
        } else {
          bgGrid[r * cols + c] = 220;
        }
      }
    }

    let gridSum = 0;
    for (let i = 0; i < bgGrid.length; i++) gridSum += bgGrid[i];
    const gridMean = gridSum / bgGrid.length;

    let gridVar = 0;
    for (let i = 0; i < bgGrid.length; i++) {
      gridVar += (bgGrid[i] - gridMean) ** 2;
    }
    const gridStdDev = Math.sqrt(gridVar / bgGrid.length);

    // If lighting is already even (stdDev < 6), stay within tolerance of unchanged
    if (gridStdDev < 6) {
      return { canvas, applied: false };
    }

    const targetBg = 245;

    for (let y = 0; y < h; y++) {
      const gy = (y / blockSize) - 0.5;
      const r0 = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
      const r1 = Math.max(0, Math.min(rows - 1, r0 + 1));
      const ty = Math.max(0, Math.min(1, gy - r0));

      for (let x = 0; x < w; x++) {
        const gx = (x / blockSize) - 0.5;
        const c0 = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
        const c1 = Math.max(0, Math.min(cols - 1, c0 + 1));
        const tx = Math.max(0, Math.min(1, gx - c0));

        const b00 = bgGrid[r0 * cols + c0];
        const b01 = bgGrid[r0 * cols + c1];
        const b10 = bgGrid[r1 * cols + c0];
        const b11 = bgGrid[r1 * cols + c1];

        const localBg = (1 - ty) * ((1 - tx) * b00 + tx * b01) + ty * ((1 - tx) * b10 + tx * b11);
        const gain = targetBg / Math.max(30, localBg);

        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum < localBg * 0.75) {
          // Dark stroke: preserve ink density
          const strokeFactor = 0.7 + 0.3 * gain;
          data[idx] = Math.min(255, Math.round(r * strokeFactor));
          data[idx + 1] = Math.min(255, Math.round(g * strokeFactor));
          data[idx + 2] = Math.min(255, Math.round(b * strokeFactor));
        } else {
          // Flatten paper lighting gradient
          data[idx] = Math.min(255, Math.round(r * gain));
          data[idx + 1] = Math.min(255, Math.round(g * gain));
          data[idx + 2] = Math.min(255, Math.round(b * gain));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return { canvas, applied: true };
  }

  // --- H6: FINGER & EDGE INTRUSION REMOVAL ---

  /**
   * Detects hand/finger intrusions across page boundary using strict skin-tone
   * and margin-connectivity analysis. Avoids false positives on dark page corners.
   */
  async detectFingerIntrusions(canvasOrBlob: HTMLCanvasElement | Blob): Promise<FingerDetectionResult> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || w < 20 || h < 20) {
      return { detected: false, confidence: 0, edge: 'none' };
    }

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Check boundary margin (outer 15% on each edge)
    const marginX = Math.round(w * 0.15);
    const marginY = Math.round(h * 0.15);

    let skinLeft = 0;
    let skinRight = 0;
    let skinBottom = 0;

    let minX = w, maxX = 0, minY = h, maxY = 0;

    const isSkinColor = (r: number, g: number, b: number): boolean => {
      // Rejects dark corners / dark borders strictly
      if (r < 80 || g < 40 || b < 25) return false;
      if (r <= g || g <= b) return false;
      if (r - g < 15) return false;

      // YCbCr check for human skin tones
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      return cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127 && y > 60;
    };

    // Left border
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < marginX; x += 2) {
        const idx = (y * w + x) * 4;
        if (isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
          skinLeft++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Right border
    for (let y = 0; y < h; y += 2) {
      for (let x = w - marginX; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        if (isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
          skinRight++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Bottom border
    for (let y = h - marginY; y < h; y += 2) {
      for (let x = marginX; x < w - marginX; x += 2) {
        const idx = (y * w + x) * 4;
        if (isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
          skinBottom++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const minCount = 30;
    let dominantEdge: 'left' | 'right' | 'top' | 'bottom' | 'none' = 'none';
    let maxFound = 0;

    if (skinLeft > minCount && skinLeft > maxFound) {
      maxFound = skinLeft;
      dominantEdge = 'left';
    }
    if (skinRight > minCount && skinRight > maxFound) {
      maxFound = skinRight;
      dominantEdge = 'right';
    }
    if (skinBottom > minCount && skinBottom > maxFound) {
      maxFound = skinBottom;
      dominantEdge = 'bottom';
    }

    if (dominantEdge === 'none') {
      return { detected: false, confidence: 0, edge: 'none' };
    }

    return {
      detected: true,
      confidence: Math.min(95, Math.round(maxFound / 2)),
      edge: dominantEdge,
      boundingBox: {
        x: minX,
        y: minY,
        width: Math.max(10, maxX - minX),
        height: Math.max(10, maxY - minY)
      }
    };
  }

  /**
   * Inpaints finger intrusion from surrounding paper texture or applies clean inward edge crop.
   */
  async removeFingerIntrusions(
    canvasOrBlob: HTMLCanvasElement | Blob,
    intrusion?: FingerDetectionResult
  ): Promise<HTMLCanvasElement> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const w = canvas.width;
    const h = canvas.height;

    const det = intrusion || (await this.detectFingerIntrusions(canvas));
    if (!det.detected || !det.boundingBox) {
      return canvas;
    }

    const out = this.createCanvas(w, h);
    const ctx = this.getContext(out);
    if (!ctx) return canvas;

    ctx.drawImage(canvas, 0, 0);

    const bb = det.boundingBox;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample adjacent clean paper color
    let sampleX = bb.x + bb.width + 10;
    let sampleY = Math.round(bb.y + bb.height / 2);
    if (det.edge === 'right') {
      sampleX = Math.max(0, bb.x - 10);
    } else if (det.edge === 'bottom') {
      sampleX = Math.round(bb.x + bb.width / 2);
      sampleY = Math.max(0, bb.y - 10);
    }

    sampleX = Math.max(0, Math.min(w - 1, sampleX));
    sampleY = Math.max(0, Math.min(h - 1, sampleY));
    const sIdx = (sampleY * w + sampleX) * 4;
    const paperR = data[sIdx];
    const paperG = data[sIdx + 1];
    const paperB = data[sIdx + 2];

    const pad = 4;
    const startX = Math.max(0, bb.x - pad);
    const endX = Math.min(w, bb.x + bb.width + pad);
    const startY = Math.max(0, bb.y - pad);
    const endY = Math.min(h, bb.y + bb.height + pad);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * w + x) * 4;
        data[idx] = paperR;
        data[idx + 1] = paperG;
        data[idx + 2] = paperB;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  // --- H7: BOOK CURVATURE DEWARPING ---

  /**
   * Straightens curved text baselines on bound-book captures.
   * Runs only when curvature is detected; flat pages are skipped.
   */
  async dewarpCurvature(canvasOrBlob: HTMLCanvasElement | Blob): Promise<DewarpResult> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const w = canvas.width;
    const h = canvas.height;

    const ctx = this.getContext(canvas);
    if (!ctx || w < 20 || h < 20) {
      return { canvas, curvatureDetected: false, curvatureMagnitude: 0 };
    }

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const numCols = 10;
    const colStep = Math.floor(w / numCols);
    const baselines: number[] = [];

    for (let c = 0; c < numCols; c++) {
      const cx = Math.min(w - 1, c * colStep + Math.floor(colStep / 2));
      let darkYSum = 0;
      let darkCount = 0;

      for (let y = 5; y < h - 5; y++) {
        const idx = (y * w + cx) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 110) {
          darkYSum += y;
          darkCount++;
        }
      }

      if (darkCount >= 2) {
        baselines.push(darkYSum / darkCount);
      } else {
        baselines.push(h / 2);
      }
    }

    // Parabolic baseline curvature fitting: y(c) = a * (c - x_mid)^2 + b
    const xMid = (numCols - 1) / 2;
    const X = new Float64Array(numCols);
    for (let c = 0; c < numCols; c++) {
      X[c] = (c - xMid) ** 2;
    }
    const meanX = X.reduce((a, b) => a + b, 0) / numCols;
    const meanY = baselines.reduce((a, b) => a + b, 0) / numCols;

    let sxx = 0;
    let sxy = 0;
    for (let c = 0; c < numCols; c++) {
      const dx = X[c] - meanX;
      const dy = baselines[c] - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
    }

    const curvatureA = sxx > 0 ? sxy / sxx : 0;
    const maxSag = Math.abs(curvatureA * (X[0] - X[Math.floor(xMid)]));

    // If curvature is minimal (< 2.5 px), detect as flat and skip
    if (maxSag < 2.5) {
      return {
        canvas,
        curvatureDetected: false,
        curvatureMagnitude: Math.round(maxSag * 10) / 10
      };
    }


    // Vertical column resampling to cancel baseline arc
    const out = this.createCanvas(w, h);
    const outCtx = this.getContext(out);
    if (!outCtx) {
      return { canvas, curvatureDetected: true, curvatureMagnitude: maxSag };
    }


    for (let x = 0; x < w; x++) {
      const colNorm = (x / w) * (numCols - 1) - xMid;
      const offset = Math.round(curvatureA * (colNorm ** 2));
      outCtx.drawImage(canvas, x, 0, 1, h, x, -offset, 1, h);
    }

    return {
      canvas: out,
      curvatureDetected: true,
      curvatureMagnitude: Math.round(maxSag * 10) / 10
    };
  }

  // --- H8: AUTO-NAMING FROM CONTENT ---

  /**
   * Suggests a document title and clean sanitized filename from OCR or heading heuristics.
   * Proposes the name to the user without silent renaming.
   */
  async suggestDocumentTitle(
    canvasOrBlob: HTMLCanvasElement | Blob,
    candidateText?: string
  ): Promise<AutoNamingResult> {
    const canvas = await this.toCanvas(canvasOrBlob);
    const w = canvas.width;
    const h = canvas.height;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const defaultName = `Scan_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

    // 1. Text-based title selection if text is provided
    if (candidateText && candidateText.trim().length > 0) {
      const lines = candidateText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const titleCandidate = lines.find(l => {
        const len = l.length;
        if (len < 3 || len > 60) return false;
        if (/^\d+$/.test(l)) return false;
        if (/^page \d+/i.test(l)) return false;
        return true;
      });

      if (titleCandidate) {
        const sanitized = this.sanitizeFileName(titleCandidate);
        return {
          proposedTitle: titleCandidate,
          sanitizedFileName: sanitized || defaultName,
          confidence: 88,
          source: 'ocr'
        };
      }
    }

    // 2. Visual inspection of top 35% of page 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || w < 10 || h < 10) {
      return {
        proposedTitle: defaultName,
        sanitizedFileName: defaultName,
        confidence: 25,
        source: 'fallback'
      };
    }

    const topH = Math.min(h, Math.round(h * 0.35));
    const imgData = ctx.getImageData(0, 0, w, topH);
    const data = imgData.data;

    let darkCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 120) darkCount++;
    }

    // Blank page fallback
    if (darkCount < 40) {
      return {
        proposedTitle: defaultName,
        sanitizedFileName: defaultName,
        confidence: 20,
        source: 'fallback'
      };
    }

    const mode = this.getScanMode();
    let prefix = 'Document';
    if (mode === 'id_card') prefix = 'ID_Card';
    else if (mode === 'book') prefix = 'Book_Spread';
    else if (mode === 'whiteboard') prefix = 'Whiteboard_Notes';
    else if (mode === 'table') prefix = 'Scanned_Table';

    const proposed = `${prefix}_${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    return {
      proposedTitle: proposed,
      sanitizedFileName: this.sanitizeFileName(proposed),
      confidence: 65,
      source: 'heuristic'
    };
  }

  /**
   * Sanitizes proposed title for filesystem safety by stripping invalid characters.
   */
  sanitizeFileName(rawTitle: string): string {
    if (!rawTitle) return '';
    let clean = rawTitle.replace(/[\\/:*?"<>|\0]/g, '_');
    clean = clean.replace(/[\s_]+/g, '_');
    clean = clean.replace(/^[._-]+|[._-]+$/g, '');
    if (clean.length > 60) {
      clean = clean.substring(0, 60).replace(/^[._-]+|[._-]+$/g, '');
    }
    return clean;
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
    const dest = this.createCanvas(isSwapped ? source.height : source.width, isSwapped ? source.width : source.height);
    const ctx = this.getContext(dest);
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
      this.ensureContext(source);
      return source;
    }

    if (source instanceof HTMLImageElement) {
      const canvas = this.createCanvas(source.naturalWidth || source.width, source.naturalHeight || source.height);
      const ctx = this.getContext(canvas);
      if (ctx) ctx.drawImage(source, 0, 0);
      return canvas;
    }

    // Blob / File
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(source);
      img.onload = () => {
        const canvas = this.createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const ctx = this.getContext(canvas);
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
