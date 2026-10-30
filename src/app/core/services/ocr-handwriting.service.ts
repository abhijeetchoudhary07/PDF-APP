import { Injectable, inject } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';
import {
  HandwritingLine,
  HandwritingOcrOptions,
  HandwritingOcrResult,
  HandwritingBbox
} from '../models/ocr.models';
import { OcrModelManagerService } from './ocr-model-manager.service';

export const MAX_HANDWRITING_DIMENSION = 2000;

/**
 * Strips non-printable control characters, null bytes, and malicious scripts from OCR text
 */
export function sanitizeHandwritingText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|style|svg|img|link|meta)\b[^>]*>/gi, '')
    .trim();
}

@Injectable({
  providedIn: 'root'
})
export class OcrHandwritingService {
  private modelManager = inject(OcrModelManagerService);
  private activeWorker: Worker | null = null;
  private isCancelled = false;

  /**
   * Caps canvas dimensions to maxDim (default 2000px) to prevent memory exhaustion,
   * calculation lag, and dimension bomb attacks during morphological & Sauvola passes.
   */
  downscaleCanvasIfNeeded(
    canvas: HTMLCanvasElement,
    maxDim: number = MAX_HANDWRITING_DIMENSION
  ): HTMLCanvasElement {
    const { width, height } = canvas;
    if (width <= maxDim && height <= maxDim) {
      return canvas;
    }

    const scale = Math.min(maxDim / width, maxDim / height);
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetW;
    scaledCanvas.height = targetH;
    const ctx = scaledCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, targetW, targetH);
    }
    return scaledCanvas;
  }

  /**
   * Applies Sauvola Adaptive Binarization to an image or canvas.
   * Isolates faint pen strokes and varied pencil pressure while rejecting paper textures.
   */
  applySauvolaBinarization(
    imageData: ImageData,
    k: number = 0.34,
    windowSize: number = 21
  ): ImageData {
    const { width, height, data } = imageData;
    const gray = new Uint8Array(width * height);

    // 1. Convert to grayscale & contrast stretch
    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const lum = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      );
      gray[i] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    // Stretch contrast across full range
    const range = Math.max(1, maxLum - minLum);
    for (let i = 0; i < width * height; i++) {
      gray[i] = Math.min(255, Math.max(0, Math.round(((gray[i] - minLum) / range) * 255)));
    }

    // 2. Build Integral Image (Sum) and Integral Squared Image (SumSq)
    // Using Float64Array to prevent overflow on high-resolution images
    const integral = new Float64Array((width + 1) * (height + 1));
    const integralSq = new Float64Array((width + 1) * (height + 1));

    const stride = width + 1;
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      let rowSumSq = 0;
      const grayOffset = y * width;
      for (let x = 0; x < width; x++) {
        const val = gray[grayOffset + x];
        rowSum += val;
        rowSumSq += val * val;

        const intIdx = (y + 1) * stride + (x + 1);
        const topIdx = y * stride + (x + 1);
        integral[intIdx] = integral[topIdx] + rowSum;
        integralSq[intIdx] = integralSq[topIdx] + rowSumSq;
      }
    }

    // 3. Compute Sauvola threshold T(x, y) = m * (1 + k * (s / 128 - 1))
    const halfWin = Math.floor(windowSize / 2);
    const outData = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - halfWin);
      const y1 = Math.min(height, y + halfWin + 1);

      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - halfWin);
        const x1 = Math.min(width, x + halfWin + 1);

        const area = (x1 - x0) * (y1 - y0);

        // Calculate sum from integral image: D - B - C + A
        const idxA = y0 * stride + x0;
        const idxB = y0 * stride + x1;
        const idxC = y1 * stride + x0;
        const idxD = y1 * stride + x1;

        const sum = integral[idxD] - integral[idxB] - integral[idxC] + integral[idxA];
        const sumSq = integralSq[idxD] - integralSq[idxB] - integralSq[idxC] + integralSq[idxA];

        const mean = sum / area;
        const variance = Math.max(0, sumSq / area - mean * mean);
        const stdDev = Math.sqrt(variance);

        const threshold = mean * (1 + k * (stdDev / 128 - 1));

        const pixelIdx = y * width + x;
        const outIdx = pixelIdx * 4;

        // Is it ink (darker than threshold)?
        const isInk = gray[pixelIdx] < threshold;
        const val = isInk ? 0 : 255;

        outData[outIdx] = val;
        outData[outIdx + 1] = val;
        outData[outIdx + 2] = val;
        outData[outIdx + 3] = 255;
      }
    }

    return {
      data: outData,
      width,
      height,
      colorSpace: 'srgb'
    } as ImageData;
  }

  /**
   * Morphological line dilation to reconnect micro-breaks in handwriting pen strokes.
   */
  applyStrokeReconnection(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const outData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = (rowOffset + x) * 4;
        // If current pixel is white (background)
        if (data[idx] > 128) {
          // Count ink neighbors in 8-neighborhood (0 is ink)
          let inkNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * width + (x + dx)) * 4;
              if (data[nIdx] < 128) inkNeighbors++;
            }
          }

          // If surrounded by ink on at least 3 sides or opposite sides, reconnect
          const leftInk = data[(rowOffset + (x - 1)) * 4] < 128;
          const rightInk = data[(rowOffset + (x + 1)) * 4] < 128;
          const topInk = data[((y - 1) * width + x) * 4] < 128;
          const bottomInk = data[((y + 1) * width + x) * 4] < 128;

          if (inkNeighbors >= 4 || (leftInk && rightInk) || (topInk && bottomInk)) {
            outData[idx] = 0;
            outData[idx + 1] = 0;
            outData[idx + 2] = 0;
          }
        }
      }
    }

    return {
      data: outData,
      width,
      height,
      colorSpace: 'srgb'
    } as ImageData;
  }

  /**
   * Computes dominant text skew angle and deskews the canvas.
   */
  deskewCanvas(canvas: HTMLCanvasElement): { deskewedCanvas: HTMLCanvasElement; angle: number } {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { deskewedCanvas: canvas, angle: 0 };

    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height);

    // Approximate dominant angle by testing projections across -4 to +4 degrees
    let bestAngle = 0;
    let maxVariance = 0;

    // Test a sample slice to keep computation extremely fast (< 5ms)
    const sampleH = Math.min(height, 400);
    const startY = Math.floor((height - sampleH) / 2);

    for (let angle = -4; angle <= 4; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      const tan = Math.tan(rad);
      const rowSums = new Float32Array(sampleH);

      for (let y = 0; y < sampleH; y++) {
        const actualY = startY + y;
        let sum = 0;
        for (let x = 0; x < width; x += 4) {
          const shiftY = Math.round(actualY + (x - width / 2) * tan);
          if (shiftY >= 0 && shiftY < height) {
            const idx = (shiftY * width + x) * 4;
            if (imgData.data[idx] < 128) sum++;
          }
        }
        rowSums[y] = sum;
      }

      // Variance of row sums: sharper peaks when text lines are horizontal
      let mean = 0;
      for (let i = 0; i < sampleH; i++) mean += rowSums[i];
      mean /= sampleH;

      let variance = 0;
      for (let i = 0; i < sampleH; i++) {
        const diff = rowSums[i] - mean;
        variance += diff * diff;
      }

      if (variance > maxVariance) {
        maxVariance = variance;
        bestAngle = angle;
      }
    }

    if (Math.abs(bestAngle) === 0) {
      return { deskewedCanvas: canvas, angle: 0 };
    }

    // Apply rotation
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = width;
    rotCanvas.height = height;
    const rotCtx = rotCanvas.getContext('2d');
    if (!rotCtx) return { deskewedCanvas: canvas, angle: 0 };

    rotCtx.fillStyle = '#FFFFFF';
    rotCtx.fillRect(0, 0, width, height);
    rotCtx.save();
    rotCtx.translate(width / 2, height / 2);
    rotCtx.rotate((-bestAngle * Math.PI) / 180);
    rotCtx.drawImage(canvas, -width / 2, -height / 2);
    rotCtx.restore();

    return { deskewedCanvas: rotCanvas, angle: bestAngle };
  }

  /**
   * Complete handwriting preprocessing pipeline:
   * 1. Adaptive Sauvola Binarization
   * 2. Morphological Stroke Reconnection
   * 3. Deskewing and Line Normalization
   */
  preprocessHandwriting(
    canvas: HTMLCanvasElement,
    options?: HandwritingOcrOptions
  ): { processedCanvas: HTMLCanvasElement; deskewAngle: number } {
    // Downscale oversized canvas if dimensions exceed MAX_HANDWRITING_DIMENSION (protect against dimension bombs)
    const inputCanvas = this.downscaleCanvasIfNeeded(canvas, MAX_HANDWRITING_DIMENSION);
    const ctx = inputCanvas.getContext('2d');
    if (!ctx) return { processedCanvas: inputCanvas, deskewAngle: 0 };

    const { width, height } = inputCanvas;
    let currentData = ctx.getImageData(0, 0, width, height);

    // 1. Sauvola
    if (options?.applySauvola !== false) {
      const k = options?.sauvolaK ?? 0.34;
      const win = options?.sauvolaWindow ?? 21;
      currentData = this.applySauvolaBinarization(currentData, k, win);
    }

    // 2. Stroke reconnection
    if (options?.applyDilation !== false) {
      currentData = this.applyStrokeReconnection(currentData);
    }

    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = width;
    stageCanvas.height = height;
    const stageCtx = stageCanvas.getContext('2d');
    if (stageCtx) {
      stageCtx.putImageData(currentData, 0, 0);
    }

    // 3. Deskew
    if (options?.applyDeskew !== false) {
      const { deskewedCanvas, angle } = this.deskewCanvas(stageCanvas);
      if (deskewedCanvas !== stageCanvas) {
        stageCanvas.width = 0;
        stageCanvas.height = 0;
      }
      return { processedCanvas: deskewedCanvas, deskewAngle: angle };
    }

    return { processedCanvas: stageCanvas, deskewAngle: 0 };
  }

  /**
   * Crops a bounding box region from a canvas with immediate GPU memory cleanup.
   */
  cropRegion(canvas: HTMLCanvasElement, bbox: HandwritingBbox): string {
    const cropCanvas = document.createElement('canvas');
    try {
      const w = Math.max(1, Math.round(bbox.x1 - bbox.x0));
      const h = Math.max(1, Math.round(bbox.y1 - bbox.y0));
      cropCanvas.width = w;
      cropCanvas.height = h;

      const ctx = cropCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(canvas, bbox.x0, bbox.y0, w, h, 0, 0, w, h);
        return cropCanvas.toDataURL('image/jpeg', 0.85);
      }
      return '';
    } finally {
      cropCanvas.width = 0;
      cropCanvas.height = 0;
    }
  }

  /**
   * Main Handwriting OCR Execution:
   * Enforces upfront expectation acknowledgement before execution.
   * Runs dedicated preprocessing and tuned PSM 6/11 recognition.
   */
  async recognizeHandwriting(
    source: File | HTMLCanvasElement,
    options: HandwritingOcrOptions = {}
  ): Promise<HandwritingOcrResult> {
    // ENFORCE UPFRONT EXPECTATION MANAGEMENT
    if (!options.acknowledgedExpectations) {
      throw new Error(
        'Handwriting recognition expectation notice must be acknowledged before execution.'
      );
    }

    this.isCancelled = false;

    // Load canvas from File if needed
    let originalCanvas: HTMLCanvasElement;
    let fileName = 'handwriting.png';

    if (source instanceof File) {
      fileName = source.name;
      originalCanvas = await this.fileToCanvas(source);
    } else {
      originalCanvas = source;
    }

    const originalImageUrl = originalCanvas.toDataURL('image/jpeg', 0.9);

    // Apply dedicated handwriting preprocessing
    const { processedCanvas } = this.preprocessHandwriting(originalCanvas, options);
    const processedImageUrl = processedCanvas.toDataURL('image/jpeg', 0.9);

    if (this.isCancelled) throw new Error('Handwriting OCR job was cancelled.');

    // Configure tuned Tesseract handwriting worker
    const lang = options.language || 'eng';
    const psm = options.psmMode ?? 6; // PSM 6: Single uniform block of text

    const worker = await this.getOrCreateWorker(lang);
    if (this.isCancelled) {
      await this.terminateWorker();
      throw new Error('Handwriting OCR job was cancelled.');
    }

    // Set handwriting-tuned parameters
    const params: Record<string, any> = {
      tessedit_pageseg_mode: String(psm) as any,
      textord_heavy_nr: '1',
      textord_min_linesize: '1.5'
    };
    if (options.charWhitelist) {
      params['tessedit_char_whitelist'] = options.charWhitelist;
    }
    await worker.setParameters(params);

    // Recognize processed canvas
    const ocrResult = await worker.recognize(processedCanvas);
    if (this.isCancelled) throw new Error('Handwriting OCR job was cancelled.');

    // Release processed canvas memory immediately
    processedCanvas.width = 0;
    processedCanvas.height = 0;

    const tLines = (ocrResult.data as any).lines || [];
    const lines: HandwritingLine[] = [];
    let fullText = '';
    let totalConfidence = 0;

    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];
      const text = sanitizeHandwritingText(line.text || '');
      if (text.length === 0) continue;

      const bbox: HandwritingBbox = {
        x0: line.bbox ? line.bbox.x0 : 0,
        y0: line.bbox ? line.bbox.y0 : 0,
        x1: line.bbox ? line.bbox.x1 : originalCanvas.width,
        y1: line.bbox ? line.bbox.y1 : originalCanvas.height
      };

      const cropDataUrl = this.cropRegion(originalCanvas, bbox);
      const conf = line.confidence || 0;
      totalConfidence += conf;

      lines.push({
        id: `hw_line_${i + 1}`,
        text,
        confidence: Math.round(conf),
        bbox,
        cropDataUrl,
        wordCount: text.split(/\s+/).filter(Boolean).length
      });

      fullText += text + '\n';
    }

    // Fallback if no lines were segmented
    if (lines.length === 0 && ocrResult.data.text.trim().length > 0) {
      const text = sanitizeHandwritingText(ocrResult.data.text);
      const bbox: HandwritingBbox = {
        x0: 0,
        y0: 0,
        x1: originalCanvas.width,
        y1: originalCanvas.height
      };
      lines.push({
        id: 'hw_line_1',
        text,
        confidence: Math.round(ocrResult.data.confidence || 75),
        bbox,
        cropDataUrl: originalImageUrl,
        wordCount: text.split(/\s+/).filter(Boolean).length
      });
      fullText = text;
      totalConfidence = ocrResult.data.confidence || 75;
    }

    const averageConfidence =
      lines.length > 0 ? Math.round(totalConfidence / lines.length) : Math.round(ocrResult.data.confidence || 0);

    const sanitizedFullText = sanitizeHandwritingText(fullText);
    const wordCount = sanitizedFullText.split(/\s+/).filter(Boolean).length;

    return {
      fullText: sanitizedFullText,
      averageConfidence,
      lines,
      originalImageUrl,
      processedImageUrl,
      sourceFileName: fileName,
      pageCount: 1,
      lineCount: lines.length,
      wordCount,
      acknowledgedExpectations: true,
      isHandwritingPipeline: true,
      imageWidth: originalCanvas.width,
      imageHeight: originalCanvas.height
    };
  }

  /**
   * Generates a plain text file from handwriting OCR result with input sanitization.
   */
  generateTextFile(ocrResult: HandwritingOcrResult, customText?: string): File {
    const rawText = customText !== undefined ? customText : ocrResult.fullText;
    const textToExport = sanitizeHandwritingText(rawText);
    const baseName = ocrResult.sourceFileName.replace(/\.[^/.]+$/, '');
    const blob = new Blob([textToExport], { type: 'text/plain;charset=utf-8' });
    return new File([blob], `${baseName}_handwriting_text.txt`, { type: 'text/plain' });
  }

  /**
   * Generates structured JSON export from handwriting OCR result with input sanitization.
   */
  generateJsonFile(ocrResult: HandwritingOcrResult, customText?: string): File {
    const baseName = ocrResult.sourceFileName.replace(/\.[^/.]+$/, '');
    const rawText = customText !== undefined ? customText : ocrResult.fullText;
    const exportData = {
      ...ocrResult,
      fullText: sanitizeHandwritingText(rawText),
      exportedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], `${baseName}_handwriting_structured.json`, { type: 'application/json' });
  }

  cancelJob(): void {
    this.isCancelled = true;
  }

  async terminateWorker(): Promise<void> {
    if (this.activeWorker) {
      try {
        await this.activeWorker.terminate();
      } catch {}
      this.activeWorker = null;
    }
  }

  private async getOrCreateWorker(language: string): Promise<Worker> {
    if (this.activeWorker) {
      return this.activeWorker;
    }

    const workerOpts: any = this.modelManager
      ? await this.modelManager.getWorkerOptions(language)
      : {
          langPath: '/assets/tesseract',
          cachePath: '.',
          gzip: true
        };

    if (typeof process !== 'undefined' && process.versions && (process.versions as any).node) {
      try {
        const path = require('node:path');
        workerOpts['workerPath'] = path.resolve(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js');
      } catch {}
    }

    const worker = await createWorker(language, 1, workerOpts);
    this.activeWorker = worker;
    return worker;
  }

  private async fileToCanvas(file: File): Promise<HTMLCanvasElement> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) } as any);
      try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        try {
          const viewport = page.getViewport({ scale: 2.0 }); // 2x for sharp handwriting strokes

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
          }
          return this.downscaleCanvasIfNeeded(canvas, MAX_HANDWRITING_DIMENSION);
        } finally {
          if (typeof (page as any).cleanup === 'function') {
            (page as any).cleanup();
          }
        }
      } finally {
        await loadingTask.destroy();
      }
    } else {
      return new Promise<HTMLCanvasElement>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
            resolve(this.downscaleCanvasIfNeeded(canvas, MAX_HANDWRITING_DIMENSION));
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  }
}
