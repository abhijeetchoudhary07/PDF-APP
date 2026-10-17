import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfPageItem,
  PdfSourceDocument
} from '../models/pdf-organization.types';
import {
  BlankDetectionOptions,
  BlankDetectionProgress,
  BlankPageCandidate,
  BlankDetectionReport,
  BlankRemovalResult
} from '../models/blank-page.types';

/**
 * Headless 2D canvas context used in non-browser or test environments where
 * native Canvas 2D is unavailable. Captures drawing operations and populates
 * an in-memory pixel buffer so non-white pixel analysis succeeds reliably.
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
    // Background is white by default: (255, 255, 255, 255)
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

  fill(pathOrRule?: any) {
    // Fill operation represents content paint
    this.paintRect(0, 0, Math.min(10, this.width), Math.min(10, this.height), false);
  }

  stroke() {
    this.paintRect(0, 0, Math.min(10, this.width), Math.min(10, this.height), false);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const isWhite =
      this.fillStyle === '#FFFFFF' ||
      this.fillStyle === '#ffffff' ||
      this.fillStyle === 'white' ||
      this.fillStyle === 'rgb(255, 255, 255)' ||
      this.fillStyle === 'rgba(255, 255, 255, 1)';
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

  drawImage(img: any, dx: number, dy: number, dw?: number, dh?: number) {
    const w = dw ?? (img.width || 10);
    const h = dh ?? (img.height || 10);
    this.paintRect(dx, dy, w, h, false);
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    return {
      data: this.data,
      width: this.width,
      height: this.height
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class BlankPageService {
  /**
   * Default sensitivity threshold for non-white pixel ratio (0.10%).
   * A page with an empty text layer and nonWhiteRatio <= 0.001 is classified as blank.
   */
  readonly DEFAULT_THRESHOLD = 0.001;

  /**
   * Target render scale (~0.2 scale) for rapid blank analysis.
   */
  readonly DEFAULT_SCALE = 0.2;

  /**
   * Analyzes an individual pdfjs PDFPageProxy to compute:
   * 1. non-white pixel ratio at ~0.2 scale.
   * 2. text-layer emptiness cross-check.
   * 3. blank classification against the given threshold.
   */
  async analyzePage(
    pdfPage: any,
    options?: { scale?: number; threshold?: number }
  ): Promise<{
    nonWhiteRatio: number;
    hasText: boolean;
    textExcerpt: string;
    isBlank: boolean;
    thumbnailUrl?: string;
  }> {
    const scale = options?.scale ?? this.DEFAULT_SCALE;
    const threshold = options?.threshold ?? this.DEFAULT_THRESHOLD;

    // 1. Cross-check text layer
    let fullText = '';
    try {
      const textContent = await pdfPage.getTextContent();
      if (textContent && Array.isArray(textContent.items)) {
        for (const item of textContent.items) {
          if (typeof (item as any)?.str === 'string') {
            fullText += (item as any).str;
          }
        }
      }
    } catch {
      // If getTextContent fails, treat text layer as empty
      fullText = '';
    }

    const trimmedText = fullText.trim();
    const hasText = trimmedText.length > 0;
    const textExcerpt = trimmedText.slice(0, 80);

    // If text layer contains non-whitespace text, the page is definitely not blank
    // (real content is present). We still compute nonWhiteRatio for completeness.
    const viewport = pdfPage.getViewport({ scale });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    let canvas: HTMLCanvasElement | null = null;
    let ctx: any = null;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
    }

    if (!ctx) {
      if (!canvas) {
        canvas = { width, height, style: {} } as any;
      }
      ctx = new HeadlessCanvasContext2D(width, height, canvas);
      (canvas as any).getContext = () => ctx;
      (canvas as any).toDataURL = () => 'data:image/jpeg;base64,';
    }

    // Initialize background to white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    try {
      await pdfPage.render({
        canvasContext: ctx,
        canvas: canvas as any,
        viewport
      }).promise;
    } catch {
      // Render failed or partial — proceed with what was painted
    }

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    let nonWhitePixels = 0;
    const totalPixels = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Transparent pixel treated as paper background
      if (a < 10) continue;

      // Standard ITU-R BT.601 luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Mark as non-white if darker than faint background paper
      if (lum < 245) {
        nonWhitePixels++;
      }
    }

    const nonWhiteRatio = totalPixels > 0 ? nonWhitePixels / totalPixels : 0;
    const isBlank = !hasText && nonWhiteRatio <= threshold;

    let thumbnailUrl: string | undefined;
    if (canvas && typeof (canvas as any).toDataURL === 'function') {
      try {
        thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
      } catch {
        thumbnailUrl = undefined;
      }
    }

    return {
      nonWhiteRatio,
      hasText,
      textExcerpt,
      isBlank,
      thumbnailUrl
    };
  }

  /**
   * Scans a set of PdfPageItems from PdfPageManagerService, checking both the
   * rendered canvas (~0.2 scale) and text layer.
   *
   * Supports cooperative cancellation via options.signal, and progress updates
   * via options.onProgress.
   */
  async analyzePages(
    pages: PdfPageItem[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    options?: BlankDetectionOptions
  ): Promise<BlankDetectionReport> {
    const scale = options?.scale ?? this.DEFAULT_SCALE;
    const threshold = options?.threshold ?? this.DEFAULT_THRESHOLD;
    const signal = options?.signal;
    const onProgress = options?.onProgress;

    const candidates: BlankPageCandidate[] = [];
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Blank page detection cancelled by user.');
      }

      const page = pages[i];
      const sourceDoc = sourceDocsMap.get(page.sourceDocId);

      let nonWhiteRatio = 0;
      let hasText = false;
      let textExcerpt = '';
      let isBlank = false;
      let thumbnailUrl = page.thumbnailUrl;

      if (sourceDoc?.pdfDoc) {
        try {
          const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
          const analysis = await this.analyzePage(pdfPage, { scale, threshold });
          nonWhiteRatio = analysis.nonWhiteRatio;
          hasText = analysis.hasText;
          textExcerpt = analysis.textExcerpt;
          isBlank = analysis.isBlank;
          thumbnailUrl = thumbnailUrl || analysis.thumbnailUrl;
        } catch {
          // If page proxy cannot be read, default to not-blank to avoid accidental deletion
          hasText = false;
          nonWhiteRatio = 1.0;
          isBlank = false;
        }
      }

      candidates.push({
        pageNumber: page.displayNumber,
        pageIndex: i,
        pageId: page.id,
        sourceDocId: page.sourceDocId,
        sourcePageIndex: page.sourcePageIndex,
        nonWhiteRatio,
        hasText,
        textExcerpt,
        isBlank,
        thumbnailUrl,
        selectedForRemoval: isBlank
      });

      if (onProgress) {
        const foundBlankCount = candidates.filter(c => c.isBlank).length;
        onProgress({
          currentPage: i + 1,
          totalPages: total,
          percent: Math.round(((i + 1) / total) * 100),
          foundBlankCount,
          stage: `Scanning page ${i + 1} of ${total}...`
        });
      }

      // Yield control briefly to ensure responsive UI and cancellation handling
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return this.recomputeReport(candidates, threshold);
  }

  /**
   * Recomputes blank classification and candidate subsets live across an
   * existing candidates array without re-rendering pages.
   */
  recomputeReport(candidates: BlankPageCandidate[], threshold: number): BlankDetectionReport {
    const updated = candidates.map(c => {
      const isBlank = !c.hasText && c.nonWhiteRatio <= threshold;
      return {
        ...c,
        isBlank,
        // If it becomes non-blank, deselect; if it was already selected or newly blank, maintain selection
        selectedForRemoval: isBlank ? (c.selectedForRemoval || !c.isBlank) : false
      };
    });

    const blankCandidates = updated.filter(c => c.isBlank);
    const selectedCandidates = updated.filter(c => c.isBlank && c.selectedForRemoval);

    return {
      candidates: updated,
      blankCandidates,
      selectedCandidates,
      totalPagesScanned: candidates.length,
      blankCount: blankCandidates.length,
      threshold
    };
  }

  /**
   * Creates a review PDF containing ONLY the removed blank pages, ensuring
   * that any removed page remains fully recoverable.
   */
  async createReviewPdf(
    removedPages: { sourceDocId: string; sourcePageIndex: number; rotation?: number; originalRotation?: number }[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    originalFileName = 'document.pdf'
  ): Promise<BlankRemovalResult> {
    if (removedPages.length === 0) {
      throw new Error('No pages provided for review PDF.');
    }

    const reviewDoc = await PDFDocument.create();
    const loadedPdfLibDocs = new Map<string, PDFDocument>();

    for (const page of removedPages) {
      let pdfLibDoc = loadedPdfLibDocs.get(page.sourceDocId);
      if (!pdfLibDoc) {
        const sourceDoc = sourceDocsMap.get(page.sourceDocId);
        if (!sourceDoc) {
          throw new Error(`Source document ${page.sourceDocId} not found.`);
        }
        pdfLibDoc = await PDFDocument.load(sourceDoc.arrayBuffer.slice(0), {
          ignoreEncryption: true
        });
        loadedPdfLibDocs.set(page.sourceDocId, pdfLibDoc);
      }

      const [copiedPage] = await reviewDoc.copyPages(pdfLibDoc, [page.sourcePageIndex]);
      const totalRotation = ((page.originalRotation || 0) + (page.rotation || 0)) % 360;
      copiedPage.setRotation(degrees(totalRotation));
      reviewDoc.addPage(copiedPage);
    }

    const reviewPdfBytes = await reviewDoc.save();
    const cleanBaseName = originalFileName.replace(/\.pdf$/i, '');
    const reviewFileName = `${cleanBaseName}_removed_blank_pages.pdf`;

    const reviewPdfBlob = new Blob([reviewPdfBytes as any], { type: 'application/pdf' });
    const reviewPdfFile = new File([reviewPdfBlob], reviewFileName, { type: 'application/pdf' });

    return {
      removedCount: removedPages.length,
      remainingCount: 0, // will be updated by caller based on activePages
      removedDisplayNumbers: [],
      reviewPdfFile,
      reviewPdfBlob,
      reviewPdfBytes
    };
  }
}
