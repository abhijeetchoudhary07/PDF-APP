import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PdfPageItem, PdfSourceDocument } from '../models/pdf-organization.types';
import {
  PageFingerprint,
  DuplicatePageItem,
  DuplicateGroup,
  DuplicateDetectionOptions,
  DuplicateDetectionReport,
  DuplicateDetectionProgress
} from '../models/duplicate-page.types';

/**
 * Headless Canvas 2D context used in test/node environments without native canvas.
 * Implements drawing operations and generates deterministic pixel data for hashing.
 */
class HeadlessCanvasContext2D {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  fillStyle: any = '#000000';
  strokeStyle: any = '#000000';
  lineWidth: number = 1;
  font: string = '10px sans-serif';
  canvas: any;

  private transformMatrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private matrixStack: [number, number, number, number, number, number][] = [];
  private currentPath: { x: number; y: number }[] = [];

  constructor(width: number, height: number, canvas: any) {
    this.width = width;
    this.height = height;
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.data.fill(255); // White background by default
  }

  getTransform() {
    const [a, b, c, d, e, f] = this.transformMatrix;
    return { a, b, c, d, e, f };
  }

  save() {
    this.matrixStack.push([...this.transformMatrix]);
  }

  restore() {
    if (this.matrixStack.length > 0) {
      this.transformMatrix = this.matrixStack.pop()!;
    }
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.transformMatrix = [a, b, c, d, e, f];
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [a1, b1, c1, d1, e1, f1] = this.transformMatrix;
    this.transformMatrix = [
      a1 * a + c1 * b,
      b1 * a + d1 * b,
      a1 * c + c1 * d,
      b1 * c + d1 * d,
      a1 * e + c1 * f + e1,
      b1 * e + d1 * f + f1
    ];
  }

  translate(tx: number, ty: number) {
    this.transform(1, 0, 0, 1, tx, ty);
  }

  scale(sx: number, sy: number) {
    this.transform(sx, 0, 0, sy, 0, 0);
  }

  rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }

  beginPath() {
    this.currentPath = [];
  }

  closePath() {}

  moveTo(x: number, y: number) {
    this.currentPath.push(this.transformPoint(x, y));
  }

  lineTo(x: number, y: number) {
    this.currentPath.push(this.transformPoint(x, y));
  }

  bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, x: number, y: number) {
    this.currentPath.push(this.transformPoint(x, y));
  }

  quadraticCurveTo(_cpx: number, _cpy: number, x: number, y: number) {
    this.currentPath.push(this.transformPoint(x, y));
  }

  arc(x: number, y: number, r: number) {
    this.currentPath.push(this.transformPoint(x - r, y - r));
    this.currentPath.push(this.transformPoint(x + r, y + r));
  }

  rect(x: number, y: number, w: number, h: number) {
    this.currentPath.push(this.transformPoint(x, y));
    this.currentPath.push(this.transformPoint(x + w, y));
    this.currentPath.push(this.transformPoint(x + w, y + h));
    this.currentPath.push(this.transformPoint(x, y + h));
  }

  clip() {}
  setLineDash() {}
  clearRect(x: number, y: number, w: number, h: number) {
    this.fillRectHelper(x, y, w, h, true);
  }

  fill(pathOrRule?: any) {
    if (pathOrRule?.points) {
      this.paintPoints(pathOrRule.points);
    } else {
      this.paintCurrentPath();
    }
  }

  stroke(pathOrRule?: any) {
    if (pathOrRule?.points) {
      this.paintPoints(pathOrRule.points);
    } else {
      this.paintCurrentPath();
    }
  }

  private paintPoints(points: { x: number; y: number }[]) {
    if (!points || points.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of points) {
      const transformed = this.transformPoint(pt.x, pt.y);
      if (transformed.x < minX) minX = transformed.x;
      if (transformed.x > maxX) maxX = transformed.x;
      if (transformed.y < minY) minY = transformed.y;
      if (transformed.y > maxY) maxY = transformed.y;
    }
    if (minX <= maxX && minY <= maxY) {
      const rw = Math.max(1, maxX - minX);
      const rh = Math.max(1, maxY - minY);
      this.paintRect(minX, minY, rw, rh, this.isColorWhite(this.fillStyle));
    }
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.fillRectHelper(x, y, w, h, this.isColorWhite(this.fillStyle));
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.fillRectHelper(x, y, w, h, false);
  }

  fillText(text: string, x: number, y: number) {
    const pt = this.transformPoint(x, y);
    const textW = Math.max(4, (text?.length || 1) * 3);
    const textH = 4;
    this.paintRect(pt.x, pt.y - textH, textW, textH, false);
  }

  strokeText(text: string, x: number, y: number) {
    this.fillText(text, x, y);
  }

  measureText(text: string) {
    return { width: (text?.length || 0) * 8 };
  }

  drawImage(img: any, dx: number, dy: number, dw?: number, dh?: number) {
    const w = dw ?? (img.width || 10);
    const h = dh ?? (img.height || 10);
    const pt1 = this.transformPoint(dx, dy);
    const pt2 = this.transformPoint(dx + w, dy + h);
    const minX = Math.min(pt1.x, pt2.x);
    const minY = Math.min(pt1.y, pt2.y);
    const rw = Math.max(1, Math.abs(pt2.x - pt1.x));
    const rh = Math.max(1, Math.abs(pt2.y - pt1.y));
    this.paintRect(minX, minY, rw, rh, false);
  }

  createLinearGradient() {
    return { addColorStop() {} };
  }

  createRadialGradient() {
    return { addColorStop() {} };
  }

  createPattern() {
    return null;
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    return {
      data: this.data,
      width: this.width,
      height: this.height
    };
  }

  private transformPoint(x: number, y: number): { x: number; y: number } {
    const [a, b, c, d, e, f] = this.transformMatrix;
    return {
      x: a * x + c * y + e,
      y: b * x + d * y + f
    };
  }

  private paintCurrentPath() {
    if (this.currentPath.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of this.currentPath) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    if (minX <= maxX && minY <= maxY) {
      const rw = Math.max(1, maxX - minX);
      const rh = Math.max(1, maxY - minY);
      this.paintRect(minX, minY, rw, rh, this.isColorWhite(this.fillStyle));
    }
  }

  private fillRectHelper(x: number, y: number, w: number, h: number, isWhite: boolean) {
    const pt1 = this.transformPoint(x, y);
    const pt2 = this.transformPoint(x + w, y + h);
    const minX = Math.min(pt1.x, pt2.x);
    const minY = Math.min(pt1.y, pt2.y);
    const rw = Math.max(1, Math.abs(pt2.x - pt1.x));
    const rh = Math.max(1, Math.abs(pt2.y - pt1.y));
    this.paintRect(minX, minY, rw, rh, isWhite);
  }

  private isColorWhite(color: any): boolean {
    if (!color || typeof color !== 'string') return false;
    const c = color.trim().toLowerCase();
    return c === '#ffffff' || c === '#fff' || c === 'white' || c.startsWith('rgb(255, 255, 255)');
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
}

/**
 * Disjoint-Set Union (Union-Find) for order-independent component grouping.
 */
class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      // Always attach higher index to lower index for deterministic root selection
      if (rootI < rootJ) {
        this.parent[rootJ] = rootI;
      } else {
        this.parent[rootI] = rootJ;
      }
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class DuplicatePageService {
  /**
   * Default Hamming distance threshold for near-duplicate grouping.
   * Out of 64 bits in the dHash, a distance <= 4 indicates near-identical visual layout.
   */
  readonly DEFAULT_HAMMING_THRESHOLD = 4;

  /**
   * Computes normalized text hash and excerpt for a page.
   */
  async computeTextFingerprint(pdfPage: any): Promise<{
    hasText: boolean;
    normalizedText: string;
    textHash: string;
    textExcerpt: string;
  }> {
    let fullText = '';
    try {
      const textContent = await pdfPage.getTextContent();
      if (textContent && Array.isArray(textContent.items)) {
        for (const item of textContent.items) {
          if (typeof (item as any)?.str === 'string') {
            fullText += (item as any).str + ' ';
          }
        }
      }
    } catch {
      fullText = '';
    }

    const normalized = fullText
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasText = normalized.length > 0;
    const textExcerpt = normalized.slice(0, 80);
    const textHash = hasText ? this.hashString(normalized) : '';

    return {
      hasText,
      normalizedText: normalized,
      textHash,
      textExcerpt
    };
  }

  /**
   * Computes 64-bit dHash (difference hash) of a downscaled page render.
   * Downsamples the render into a 9x8 grayscale grid and compares adjacent pixels.
   */
  async computeDHash(pdfPage: any): Promise<{ dHash: string; thumbnailUrl?: string }> {
    // Render downscaled at 36x32 (or proportional) to capture raster features
    const targetW = 36;
    const targetH = 32;

    const viewport = pdfPage.getViewport({ scale: 0.2 });
    const width = Math.max(targetW, Math.floor(viewport.width));
    const height = Math.max(targetH, Math.floor(viewport.height));

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

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    try {
      await pdfPage.render({
        canvasContext: ctx,
        canvas: canvas as any,
        viewport
      }).promise;
    } catch {
      // Fallback
    }

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Resample data into a 9x8 grayscale grid (9 columns, 8 rows)
    const gridCols = 9;
    const gridRows = 8;
    const grid: number[][] = Array.from({ length: gridRows }, () => new Array(gridCols).fill(0));
    const counts: number[][] = Array.from({ length: gridRows }, () => new Array(gridCols).fill(0));

    const cellW = width / gridCols;
    const cellH = height / gridRows;

    for (let y = 0; y < height; y++) {
      const gy = Math.min(gridRows - 1, Math.floor(y / cellH));
      for (let x = 0; x < width; x++) {
        const gx = Math.min(gridCols - 1, Math.floor(x / cellW));
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        grid[gy][gx] += lum;
        counts[gy][gx]++;
      }
    }

    // Compute averages
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const count = counts[gy][gx];
        grid[gy][gx] = count > 0 ? grid[gy][gx] / count : 255;
      }
    }

    // Compute 64 difference bits: compare grid[y][x] > grid[y][x + 1]
    let dHash = '';
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        dHash += grid[gy][gx] > grid[gy][gx + 1] ? '1' : '0';
      }
    }

    let thumbnailUrl: string | undefined;
    if (canvas && typeof (canvas as any).toDataURL === 'function') {
      try {
        thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
      } catch {
        thumbnailUrl = undefined;
      }
    }

    return { dHash, thumbnailUrl };
  }

  /**
   * Computes the Hamming distance (number of bit differences) between two 64-bit dHash strings.
   */
  hammingDistance(hashA: string, hashB: string): number {
    if (!hashA || !hashB) return 64;
    let dist = 0;
    const len = Math.min(hashA.length, hashB.length);
    for (let i = 0; i < len; i++) {
      if (hashA[i] !== hashB[i]) dist++;
    }
    return dist + Math.abs(hashA.length - hashB.length);
  }

  /**
   * Computes word-level Jaccard similarity between two normalized text strings.
   * Returns a value between 0.0 (completely different) and 1.0 (identical).
   */
  computeTextSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 0));
    const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 0));
    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Groups fingerprints into exact duplicate groups and near duplicate groups.
   *
   * Grouping is guaranteed to be order-independent:
   * - Uses symmetric pairwise conditions:
   *     exact: (hasText && textHashA === textHashB) || (!hasText && dHashA === dHashB)
   *     near:  dHashDistance <= threshold (for pairs not in the same exact group)
   * - Finds connected components via Union-Find.
   * - Sorts items within each group in document page order, designating the first
   *   occurrence as "keep" and subsequent occurrences as "remove".
   */
  groupFingerprints(
    fingerprints: PageFingerprint[],
    hammingThreshold: number = this.DEFAULT_HAMMING_THRESHOLD
  ): { exactGroups: DuplicateGroup[]; nearGroups: DuplicateGroup[] } {
    const n = fingerprints.length;
    if (n <= 1) {
      return { exactGroups: [], nearGroups: [] };
    }

    // 1. Group Exact Duplicates
    const exactUf = new UnionFind(n);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = fingerprints[i];
        const b = fingerprints[j];

        let isExact = false;
        if (a.hasText && b.hasText) {
          isExact = a.textHash === b.textHash;
        } else if (!a.hasText && !b.hasText) {
          isExact = a.dHash === b.dHash;
        }

        if (isExact) {
          exactUf.union(i, j);
        }
      }
    }

    // Collect exact components
    const exactComponents = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = exactUf.find(i);
      if (!exactComponents.has(root)) {
        exactComponents.set(root, []);
      }
      exactComponents.get(root)!.push(i);
    }

    const exactGroups: DuplicateGroup[] = [];
    const inExactGroup = new Set<number>();

    for (const indices of Array.from(exactComponents.values())) {
      if (indices.length >= 2) {
        // Sort indices by pageIndex ascending so original is first
        indices.sort((a, b) => fingerprints[a].pageIndex - fingerprints[b].pageIndex);
        indices.forEach(idx => inExactGroup.add(idx));

        const pages: DuplicatePageItem[] = indices.map((idx, pos) => ({
          pageId: fingerprints[idx].pageId,
          pageIndex: fingerprints[idx].pageIndex,
          pageNumber: fingerprints[idx].pageNumber,
          sourceDocId: fingerprints[idx].sourceDocId,
          sourcePageIndex: fingerprints[idx].sourcePageIndex,
          thumbnailUrl: fingerprints[idx].thumbnailUrl,
          textExcerpt: fingerprints[idx].textExcerpt,
          dHash: fingerprints[idx].dHash,
          // Keep-first is the default
          keep: pos === 0,
          isFirst: pos === 0
        }));

        exactGroups.push({
          id: `exact_${fingerprints[indices[0]].pageId}`,
          type: 'exact',
          pages,
          distance: 0
        });
      }
    }

    // 2. Group Near-Duplicates (excluding pairs already in the same exact group)
    const nearUf = new UnionFind(n);
    const minPairDistance = new Map<string, number>();

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // Skip if already in the same exact group
        if (exactUf.find(i) === exactUf.find(j)) continue;

        const a = fingerprints[i];
        const b = fingerprints[j];
        const dist = this.hammingDistance(a.dHash, b.dHash);

        let isNear = false;
        if (dist <= hammingThreshold) {
          if (a.hasText && b.hasText) {
            // When both pages have a text layer, verify textual similarity so distinct documents
            // sharing a common letterhead/template are not false-flagged as duplicates.
            const sim = this.computeTextSimilarity(
              a.normalizedText || a.textExcerpt || '',
              b.normalizedText || b.textExcerpt || ''
            );
            isNear = sim >= 0.70;
          } else {
            isNear = true;
          }
        }

        if (isNear) {
          nearUf.union(i, j);
          const key = i < j ? `${i}_${j}` : `${j}_${i}`;
          minPairDistance.set(key, dist);
        }
      }
    }

    const nearComponents = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = nearUf.find(i);
      if (!nearComponents.has(root)) {
        nearComponents.set(root, []);
      }
      nearComponents.get(root)!.push(i);
    }

    const nearGroups: DuplicateGroup[] = [];

    for (const indices of Array.from(nearComponents.values())) {
      if (indices.length >= 2) {
        // Sort indices by pageIndex ascending
        indices.sort((a, b) => fingerprints[a].pageIndex - fingerprints[b].pageIndex);

        // Compute average distance between members
        let totalDist = 0;
        let count = 0;
        for (let a = 0; a < indices.length; a++) {
          for (let b = a + 1; b < indices.length; b++) {
            const key = `${indices[a]}_${indices[b]}`;
            if (minPairDistance.has(key)) {
              totalDist += minPairDistance.get(key)!;
              count++;
            }
          }
        }
        const avgDistance = count > 0 ? Math.round(totalDist / count) : 1;

        const pages: DuplicatePageItem[] = indices.map((idx, pos) => ({
          pageId: fingerprints[idx].pageId,
          pageIndex: fingerprints[idx].pageIndex,
          pageNumber: fingerprints[idx].pageNumber,
          sourceDocId: fingerprints[idx].sourceDocId,
          sourcePageIndex: fingerprints[idx].sourcePageIndex,
          thumbnailUrl: fingerprints[idx].thumbnailUrl,
          textExcerpt: fingerprints[idx].textExcerpt,
          dHash: fingerprints[idx].dHash,
          // Keep-first is the default
          keep: pos === 0,
          isFirst: pos === 0
        }));

        nearGroups.push({
          id: `near_${fingerprints[indices[0]].pageId}`,
          type: 'near',
          pages,
          distance: avgDistance
        });
      }
    }

    // Sort groups deterministically by lowest page index
    exactGroups.sort((a, b) => a.pages[0].pageIndex - b.pages[0].pageIndex);
    nearGroups.sort((a, b) => a.pages[0].pageIndex - b.pages[0].pageIndex);

    return { exactGroups, nearGroups };
  }

  /**
   * Scans document pages to generate fingerprints and group exact and near duplicates.
   */
  async analyzePages(
    pages: PdfPageItem[],
    sourceDocsMap: Map<string, PdfSourceDocument>,
    options?: DuplicateDetectionOptions
  ): Promise<DuplicateDetectionReport> {
    const threshold = options?.hammingThreshold ?? this.DEFAULT_HAMMING_THRESHOLD;
    const signal = options?.signal;
    const onProgress = options?.onProgress;

    const fingerprints: PageFingerprint[] = [];
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Duplicate page scan cancelled by user.');
      }

      const page = pages[i];
      const sourceDoc = sourceDocsMap.get(page.sourceDocId);

      let dHash = '0000000000000000000000000000000000000000000000000000000000000000';
      let hasText = false;
      let textExcerpt = '';
      let textHash = '';
      let normalizedText = '';
      let thumbnailUrl = page.thumbnailUrl;

      if (sourceDoc?.pdfDoc) {
        try {
          const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);

          // 1. Text fingerprint
          const textRes = await this.computeTextFingerprint(pdfPage);
          hasText = textRes.hasText;
          textExcerpt = textRes.textExcerpt;
          textHash = textRes.textHash;
          normalizedText = textRes.normalizedText;

          // 2. Visual dHash
          const dHashRes = await this.computeDHash(pdfPage);
          dHash = dHashRes.dHash;
          thumbnailUrl = thumbnailUrl || dHashRes.thumbnailUrl;
        } catch {
          // Fallback
        }
      }

      fingerprints.push({
        pageId: page.id,
        pageIndex: i,
        pageNumber: page.displayNumber,
        sourceDocId: page.sourceDocId,
        sourcePageIndex: page.sourcePageIndex,
        dHash,
        hasText,
        textExcerpt,
        textHash,
        normalizedText,
        thumbnailUrl
      });

      if (onProgress) {
        onProgress({
          currentPage: i + 1,
          totalPages: total,
          percent: Math.round(((i + 1) / total) * 100),
          exactGroupCount: 0,
          nearGroupCount: 0,
          stage: `Analyzing page ${i + 1} of ${total}...`
        });
      }

      // Cooperative yield
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return this.recomputeReport(fingerprints, threshold);
  }

  /**
   * Recomputes exact and near duplicate groups from existing fingerprints without re-rendering.
   */
  recomputeReport(
    fingerprints: PageFingerprint[],
    threshold: number
  ): DuplicateDetectionReport {
    const { exactGroups, nearGroups } = this.groupFingerprints(fingerprints, threshold);

    let totalDuplicatesFound = 0;
    let totalDuplicatesToRemove = 0;

    for (const g of exactGroups) {
      totalDuplicatesFound += g.pages.length - 1;
      totalDuplicatesToRemove += g.pages.filter(p => !p.keep).length;
    }
    for (const g of nearGroups) {
      totalDuplicatesFound += g.pages.length - 1;
      totalDuplicatesToRemove += g.pages.filter(p => !p.keep).length;
    }

    return {
      fingerprints,
      exactGroups,
      nearGroups,
      totalDuplicatesFound,
      totalDuplicatesToRemove,
      hammingThreshold: threshold
    };
  }

  /**
   * Fast, deterministic 64-bit string hash (FNV-1a variant).
   */
  private hashString(str: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ (code >> 8), 0x01000193);
    }
    return (
      (h1 >>> 0).toString(16).padStart(8, '0') +
      (h2 >>> 0).toString(16).padStart(8, '0')
    );
  }
}
