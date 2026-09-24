import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { SearchMatch, Rect } from '../models/pdf-editor.types';
import '../utilities/pdfjs-worker';

export interface RenderPageResult {
  width: number;
  height: number;
  scale: number;
  viewport: any;
}

@Injectable({
  providedIn: 'root'
})
export class PdfRenderService {
  private activePdfDoc: any = null;
  private currentDocId: string | null = null;
  private thumbnailCache = new Map<string, string>(); // key: `${docId}_p${pageNumber}`
  private currentRenderTask: any = null;

  constructor() {}

  async loadPdf(arrayBuffer: ArrayBuffer, docId: string): Promise<any> {
    if (this.currentDocId === docId && this.activePdfDoc) {
      return this.activePdfDoc;
    }

    if (this.activePdfDoc) {
      try {
        await this.activePdfDoc.destroy();
      } catch {
        // ignore
      }
      this.activePdfDoc = null;
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0))
    } as any);

    this.activePdfDoc = await loadingTask.promise;
    this.currentDocId = docId;
    return this.activePdfDoc;
  }

  async getPage(pageNumber: number): Promise<any> {
    if (!this.activePdfDoc) {
      throw new Error('No PDF document currently loaded in PdfRenderService.');
    }
    return await this.activePdfDoc.getPage(pageNumber);
  }

  /**
   * Renders a specific page onto an HTMLCanvasElement with device pixel ratio scaling.
   */
  async renderPageToCanvas(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number,
    rotation: number = 0
  ): Promise<RenderPageResult> {
    if (this.currentRenderTask) {
      try {
        this.currentRenderTask.cancel();
      } catch {
        // ignore cancel error
      }
      this.currentRenderTask = null;
    }

    const page = await this.getPage(pageNumber);
    const dpr = window.devicePixelRatio || 1;

    // The viewport scale includes DPR for crisp retina rendering
    const viewport = page.getViewport({ scale: scale * dpr, rotation });
    const cssViewport = page.getViewport({ scale, rotation });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(cssViewport.width)}px`;
    canvas.style.height = `${Math.floor(cssViewport.height)}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.currentRenderTask = page.render({
      canvasContext: ctx,
      viewport
    } as any);

    try {
      await this.currentRenderTask.promise;
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        throw e;
      }
    } finally {
      this.currentRenderTask = null;
    }

    return {
      width: cssViewport.width,
      height: cssViewport.height,
      scale,
      viewport: cssViewport
    };
  }

  /**
   * Generates a thumbnail data URL for a given page.
   */
  async getPageThumbnail(
    pageNumber: number,
    docId: string,
    scale = 0.25
  ): Promise<string> {
    const cacheKey = `${docId}_p${pageNumber}`;
    if (this.thumbnailCache.has(cacheKey)) {
      return this.thumbnailCache.get(cacheKey)!;
    }

    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await (page.render({
      canvasContext: ctx,
      viewport
    } as any)).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    this.thumbnailCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  /**
   * Searches for a text string across all pages and returns match locations.
   */
  async searchText(query: string): Promise<SearchMatch[]> {
    if (!this.activePdfDoc || !query || query.trim().length === 0) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const matches: SearchMatch[] = [];
    const totalPages = this.activePdfDoc.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await this.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      let fullPageText = '';
      const itemRanges: { start: number; end: number; item: any }[] = [];

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          const start = fullPageText.length;
          fullPageText += item.str + ' ';
          itemRanges.push({ start, end: fullPageText.length - 1, item });
        }
      }

      let searchIndex = 0;
      let matchIdx = 0;
      const lowerPageText = fullPageText.toLowerCase();

      while ((searchIndex = lowerPageText.indexOf(normalizedQuery, searchIndex)) !== -1) {
        // Find which item this match corresponds to for approximate bounds
        const matchedItemRange = itemRanges.find(
          r => searchIndex >= r.start && searchIndex <= r.end
        );

        let bounds: Rect | undefined;
        if (matchedItemRange && matchedItemRange.item.transform) {
          const t = matchedItemRange.item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
          const x = t[4];
          const y = viewport.height - t[5] - (matchedItemRange.item.height || 12);
          const width = matchedItemRange.item.width || 50;
          const height = matchedItemRange.item.height || 14;
          bounds = { x, y, width, height };
        }

        matches.push({
          pageNumber: pageNum,
          matchIndex: matchIdx++,
          text: fullPageText.substring(searchIndex, searchIndex + query.length),
          bounds
        });

        searchIndex += normalizedQuery.length;
      }
    }

    return matches;
  }

  clear() {
    if (this.currentRenderTask) {
      try {
        this.currentRenderTask.cancel();
      } catch {}
      this.currentRenderTask = null;
    }
    if (this.activePdfDoc) {
      try {
        this.activePdfDoc.destroy();
      } catch {}
      this.activePdfDoc = null;
    }
    this.currentDocId = null;
    this.thumbnailCache.clear();
  }
}
