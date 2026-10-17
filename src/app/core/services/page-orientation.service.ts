import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfPageItem,
  PdfSourceDocument
} from '../models/pdf-organization.types';
import {
  PageOrientationAngle,
  PageOrientationItem,
  OrientationDetectionReport,
  OrientationDetectionOptions,
  OrientationDetectionProgress,
  DecideOrientationInput,
  DecideOrientationResult,
  TextItemTransformData
} from '../models/page-orientation.types';

/**
 * Headless 2D canvas context used in non-browser or test environments where
 * native Canvas 2D is unavailable.
 */
class HeadlessCanvasContext2D {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  fillStyle: string = '#000000';
  canvas: any;

  constructor(width: number, height: number, canvas: any) {
    this.width = width;
    this.height = height;
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.data.fill(255);
  }

  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  save() {}
  restore() {}
  transform() {}
  setTransform() {}
  translate() {}
  scale() {}
  rotate() {}
  beginPath() {}
  closePath() {}
  rect() {}
  clip() {}
  setLineDash() {}
  clearRect() {}

  fill() {
    this.paintRect(0, 0, Math.min(10, this.width), Math.min(10, this.height), false);
  }

  stroke() {
    this.paintRect(0, 0, Math.min(10, this.width), Math.min(10, this.height), false);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const isWhite =
      this.fillStyle === '#FFFFFF' ||
      this.fillStyle === '#ffffff' ||
      this.fillStyle === 'white';
    this.paintRect(x, y, w, h, isWhite);
  }

  private paintRect(x: number, y: number, w: number, h: number, isWhite: boolean) {
    const val = isWhite ? 255 : 0;
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.ceil(x + w));
    const endY = Math.min(this.height, Math.ceil(y + h));
    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const idx = (py * this.width + px) * 4;
        this.data[idx] = val;
        this.data[idx + 1] = val;
        this.data[idx + 2] = val;
        this.data[idx + 3] = 255;
      }
    }
  }

  getImageData(_sx: number, _sy: number, sw: number, sh: number) {
    return {
      width: sw,
      height: sh,
      data: this.data
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class PageOrientationService {
  readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.70;
  readonly DEFAULT_MIN_TEXT_LENGTH = 10;
  readonly DEFAULT_SCALE = 0.2;

  constructor() {}

  /**
   * Pure angle-decision function.
   * Given text-item transforms and optional OCR/blank inputs, computes the visual
   * reading orientation, suggested clockwise rotation correction, confidence, and
   * manual-review grouping flag.
   */
  decidePageOrientation(input: DecideOrientationInput): DecideOrientationResult {
    const threshold = input.confidenceThreshold ?? this.DEFAULT_CONFIDENCE_THRESHOLD;
    const minTextLength = input.minTextLength ?? this.DEFAULT_MIN_TEXT_LENGTH;
    const currentRotation = ((input.currentRotation || 0) % 360 + 360) % 360;

    // 1. Check for Near-Blank / Empty conditions
    if (input.isNearBlank) {
      return {
        detectedAngle: 0,
        suggestedRotation: 0,
        confidence: 0,
        method: 'fallback',
        needsManualReview: true,
        alreadyUpright: false,
        textLength: 0,
        isNearBlank: true,
        reason: 'Near-blank page; requires manual inspection'
      };
    }

    // 2. Aggregate text-item transforms
    const bins: Record<PageOrientationAngle, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
    let totalChars = 0;

    for (const item of input.textItems) {
      const text = (item.str || '').trim();
      if (!text || !item.transform || item.transform.length < 2) continue;

      const [a, b] = item.transform;
      // In PDF coordinate space, vector (a, b) defines text reading direction
      const rad = Math.atan2(b, a);
      const deg = (Math.round((rad * 180) / Math.PI) % 360 + 360) % 360;

      // Snap to closest cardinal angle
      let snapped: PageOrientationAngle = 0;
      if (deg >= 45 && deg < 135) snapped = 90;
      else if (deg >= 135 && deg < 225) snapped = 180;
      else if (deg >= 225 && deg < 315) snapped = 270;
      else snapped = 0;

      const weight = text.length;
      bins[snapped] += weight;
      totalChars += weight;
    }

    // 3. Fallback to OCR if text layer is absent or insufficient
    if (totalChars < minTextLength) {
      if (input.ocrResult && typeof input.ocrResult.orientationDegrees === 'number') {
        const ocrAngle = ((input.ocrResult.orientationDegrees % 360 + 360) % 360) as PageOrientationAngle;
        const ocrConf = input.ocrResult.confidence || 0;

        // Visual angle calculation
        const visualAngle = ((ocrAngle - currentRotation) % 360 + 360) % 360 as PageOrientationAngle;
        const suggested = visualAngle;

        if (ocrConf >= threshold) {
          return {
            detectedAngle: visualAngle,
            suggestedRotation: suggested,
            confidence: ocrConf,
            method: 'tesseract-osd',
            needsManualReview: false,
            alreadyUpright: suggested === 0,
            textLength: totalChars,
            isNearBlank: false,
            reason: suggested === 0 ? 'OCR confirms page is upright' : `OCR suggests rotating ${suggested}° CW`
          };
        } else {
          return {
            detectedAngle: visualAngle,
            suggestedRotation: suggested,
            confidence: ocrConf,
            method: 'tesseract-osd',
            needsManualReview: true,
            alreadyUpright: false,
            textLength: totalChars,
            isNearBlank: false,
            reason: 'Low OCR confidence for scanned page'
          };
        }
      }

      // No text layer and no high-confidence OCR: Must land in manual review group!
      return {
        detectedAngle: 0,
        suggestedRotation: 0,
        confidence: 0,
        method: 'fallback',
        needsManualReview: true,
        alreadyUpright: false,
        textLength: totalChars,
        isNearBlank: totalChars === 0,
        reason: totalChars === 0 ? 'No text layer found; manual review required' : 'Insufficient text characters for orientation'
      };
    }

    // 4. Identify dominant text orientation
    const angles: PageOrientationAngle[] = [0, 90, 180, 270];
    let dominantAngle: PageOrientationAngle = 0;
    let maxCount = -1;

    for (const ang of angles) {
      if (bins[ang] > maxCount) {
        maxCount = bins[ang];
        dominantAngle = ang;
      }
    }

    const confidence = totalChars > 0 ? maxCount / totalChars : 0;

    // Calculate visual orientation on screen given page's current rotation
    const visualAngle = ((dominantAngle - currentRotation) % 360 + 360) % 360 as PageOrientationAngle;
    const suggestedRotation = visualAngle;

    // Check confidence against threshold
    if (confidence < threshold) {
      return {
        detectedAngle: visualAngle,
        suggestedRotation,
        confidence,
        method: 'text-transform',
        needsManualReview: true,
        alreadyUpright: false,
        textLength: totalChars,
        isNearBlank: false,
        reason: `Mixed text directions (dominant ${Math.round(confidence * 100)}% < ${Math.round(threshold * 100)}% threshold)`
      };
    }

    const alreadyUpright = suggestedRotation === 0;

    return {
      detectedAngle: visualAngle,
      suggestedRotation,
      confidence,
      method: 'text-transform',
      needsManualReview: false,
      alreadyUpright,
      textLength: totalChars,
      isNearBlank: false,
      reason: alreadyUpright
        ? 'Page text is already upright'
        : `Page text oriented at ${visualAngle}°; rotate ${suggestedRotation}° CW`
    };
  }

  /**
   * Scans an array of active pages and generates a comprehensive orientation report.
   * High-confidence pages needing rotation are grouped into `toRotate`.
   * High-confidence upright pages are grouped into `alreadyUpright`.
   * Low-confidence, near-blank, or ambiguous pages are grouped into `manualReview`.
   */
  async analyzePages(
    pages: PdfPageItem[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    options?: OrientationDetectionOptions
  ): Promise<OrientationDetectionReport> {
    const threshold = options?.confidenceThreshold ?? this.DEFAULT_CONFIDENCE_THRESHOLD;
    const minTextLength = options?.minTextLength ?? this.DEFAULT_MIN_TEXT_LENGTH;
    const signal = options?.signal;
    const onProgress = options?.onProgress;

    const items: PageOrientationItem[] = [];
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Orientation detection cancelled by user.');
      }

      const page = pages[i];
      const sourceDoc = sourceDocsMap.get(page.sourceDocId);

      let textItems: TextItemTransformData[] = [];
      let textExcerpt = '';
      let isNearBlank = false;
      let ocrResult: { orientationDegrees: PageOrientationAngle; confidence: number } | null = null;
      let thumbnailUrl = page.thumbnailUrl;

      if (sourceDoc?.pdfDoc) {
        try {
          const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);

          // 1. Extract digital text items with transforms
          const textContent = await pdfPage.getTextContent();
          if (textContent && Array.isArray(textContent.items)) {
            for (const item of textContent.items) {
              if ('str' in item && typeof item.str === 'string') {
                const str = item.str.trim();
                if (str.length > 0) {
                  textItems.push({
                    str: item.str,
                    transform: (item as any).transform || [1, 0, 0, 1, 0, 0]
                  });
                  if (textExcerpt.length < 80) {
                    textExcerpt += (textExcerpt ? ' ' : '') + str;
                  }
                }
              }
            }
          }

          // 2. If no text items, check if page is blank or scanned
          if (textItems.length === 0) {
            const viewport = pdfPage.getViewport({ scale: this.DEFAULT_SCALE });
            let canvas: any = null;
            let ctx: any = null;

            if (typeof document !== 'undefined') {
              canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.floor(viewport.width));
              canvas.height = Math.max(1, Math.floor(viewport.height));
              try {
                ctx = canvas.getContext('2d', { willReadFrequently: true });
              } catch {
                ctx = null;
              }
            }

            if (!ctx) {
              if (!canvas) {
                canvas = { width: Math.max(1, Math.floor(viewport.width)), height: Math.max(1, Math.floor(viewport.height)), style: {} };
              }
              ctx = new HeadlessCanvasContext2D(
                Math.max(1, Math.floor(viewport.width)),
                Math.max(1, Math.floor(viewport.height)),
                canvas
              );
              canvas.getContext = () => ctx;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, ctx.width, ctx.height);

            try {
              await (pdfPage.render({
                canvasContext: ctx,
                viewport,
                canvas
              } as any)).promise;
            } catch {
              // Proceed with what was painted
            }

            // Check non-white pixel density
            const imgData = ctx.getImageData(0, 0, ctx.width, ctx.height);
            const data = imgData.data;
            let nonWhitePixels = 0;
            const totalPixels = ctx.width * ctx.height;

            for (let pIdx = 0; pIdx < data.length; pIdx += 4) {
              const r = data[pIdx];
              const g = data[pIdx + 1];
              const b = data[pIdx + 2];
              if (r < 245 || g < 245 || b < 245) {
                nonWhitePixels++;
              }
            }

            const nonWhiteRatio = totalPixels > 0 ? nonWhitePixels / totalPixels : 0;
            if (nonWhiteRatio < 0.001) {
              // Completely blank or near-blank page
              isNearBlank = true;
            } else if (options?.ocrDetector) {
              // Scanned page: Invoke OCR detector if provided
              try {
                ocrResult = await options.ocrDetector(canvas || ctx);
              } catch {
                ocrResult = null;
              }
            } else if (options?.enableOcrFallback) {
              // Try Tesseract OSD
              ocrResult = await this.detectWithTesseract(canvas, signal);
            }
          }
        } catch {
          // If reading fails, flag for manual review
          isNearBlank = false;
        }
      }

      // Compute total current visual rotation
      const currentRotation = ((page.originalRotation || 0) + (page.rotation || 0)) % 360;

      // Decide orientation
      const decision = this.decidePageOrientation({
        textItems,
        currentRotation,
        confidenceThreshold: threshold,
        minTextLength,
        ocrResult,
        isNearBlank
      });

      items.push({
        pageId: page.id,
        pageIndex: i,
        displayNumber: page.displayNumber,
        sourceDocId: page.sourceDocId,
        sourcePageIndex: page.sourcePageIndex,
        thumbnailUrl,

        detectedAngle: decision.detectedAngle,
        suggestedRotation: decision.suggestedRotation,
        confidence: decision.confidence,
        method: decision.method,

        textLength: decision.textLength,
        textExcerpt: textExcerpt.substring(0, 100),
        isNearBlank: decision.isNearBlank,
        reason: decision.reason,

        needsManualReview: decision.needsManualReview,
        alreadyUpright: decision.alreadyUpright,
        selectedForRotation: !decision.needsManualReview && !decision.alreadyUpright
      });

      if (onProgress) {
        const toRotateCount = items.filter(it => it.selectedForRotation).length;
        const manualCount = items.filter(it => it.needsManualReview).length;
        onProgress({
          currentPage: i + 1,
          totalPages: total,
          percent: Math.round(((i + 1) / total) * 100),
          stage: `Analyzing page ${i + 1} of ${total}...`,
          rotatedCandidatesCount: toRotateCount,
          manualReviewCount: manualCount
        });
      }
    }

    return this.buildReport(items, threshold);
  }

  /**
   * Recomputes grouping from previously analyzed items without re-rendering or scanning.
   */
  recomputeReport(
    items: PageOrientationItem[],
    confidenceThreshold: number
  ): OrientationDetectionReport {
    const updated = items.map(item => {
      let needsManualReview = item.needsManualReview;
      let alreadyUpright = item.alreadyUpright;
      let selectedForRotation = item.selectedForRotation;

      if (!item.isNearBlank && item.textLength >= this.DEFAULT_MIN_TEXT_LENGTH) {
        needsManualReview = item.confidence < confidenceThreshold;
        alreadyUpright = !needsManualReview && item.suggestedRotation === 0;
        selectedForRotation = !needsManualReview && !alreadyUpright;
      }

      return {
        ...item,
        needsManualReview,
        alreadyUpright,
        selectedForRotation
      };
    });

    return this.buildReport(updated, confidenceThreshold);
  }

  private buildReport(
    items: PageOrientationItem[],
    confidenceThreshold: number
  ): OrientationDetectionReport {
    const toRotate = items.filter(p => !p.needsManualReview && !p.alreadyUpright);
    const alreadyUpright = items.filter(p => !p.needsManualReview && p.alreadyUpright);
    const manualReview = items.filter(p => p.needsManualReview);

    return {
      pages: items,
      toRotate,
      alreadyUpright,
      manualReview,
      totalPagesScanned: items.length,
      confidenceThreshold
    };
  }

  /**
   * Safely attempts Tesseract.js OSD detection if available.
   * Gracefully returns null if Tesseract cannot initialize or lacks legacy OSD assets.
   */
  private async detectWithTesseract(
    canvasSource: any,
    signal?: AbortSignal
  ): Promise<{ orientationDegrees: PageOrientationAngle; confidence: number } | null> {
    if (!canvasSource) return null;
    try {
      const tesseract = await import('tesseract.js');
      if (!tesseract || !tesseract.createWorker) return null;

      const worker = await tesseract.createWorker('osd', 1, {
        legacyCore: true,
        legacyLang: true,
        logger: () => {}
      });

      try {
        if (signal?.aborted) return null;
        const res = await (worker as any).detect(canvasSource);
        const data = res?.data;
        if (data && typeof data.orientation_degrees === 'number') {
          const deg = ((data.orientation_degrees % 360 + 360) % 360) as PageOrientationAngle;
          const conf = (data.orientation_confidence || 0) / 100;
          return { orientationDegrees: deg, confidence: conf };
        }
      } finally {
        await worker.terminate();
      }
    } catch {
      // Graceful fallback to null
    }
    return null;
  }
}
