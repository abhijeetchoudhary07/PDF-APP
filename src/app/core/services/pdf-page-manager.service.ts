import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfSourceDocument,
  PdfPageItem,
  PdfPageOperation,
  PdfExportResult,
  PdfSplitConfig
} from '../models/pdf-organization.types';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import '../utilities/pdfjs-worker';

// Set worker if not already set

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfPageManagerService {
  private sourceDocsMap = new Map<string, PdfSourceDocument>();
  private activePages: PdfPageItem[] = [];
  private selectedPageIds = new Set<string>();

  // Undo/Redo stacks
  private undoStack: PdfPageOperation[] = [];
  private redoStack: PdfPageOperation[] = [];
  private readonly MAX_HISTORY = 50;

  constructor() {}

  // --- Getters ---
  get pages(): PdfPageItem[] {
    return this.activePages;
  }

  get sourceDocs(): PdfSourceDocument[] {
    return Array.from(this.sourceDocsMap.values());
  }

  get selectedIds(): Set<string> {
    return this.selectedPageIds;
  }

  get selectedCount(): number {
    return this.selectedPageIds.size;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get historyLength(): number {
    return this.undoStack.length;
  }

  // --- Document Loading ---

  async loadDocument(
    file: File,
    password?: string
  ): Promise<{
    success: boolean;
    doc?: PdfSourceDocument;
    error?: string;
    needPassword?: boolean;
  }> {
    try {
      const arrayBuffer = await file.arrayBuffer();

      let pdfLibDoc: PDFDocument;
      try {
        pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
          ignoreEncryption: false
        });
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('encrypt') || msg.includes('password')) {
          return { success: false, needPassword: true, error: 'Password protected PDF.' };
        }
        return { success: false, error: err?.message || 'Failed to load PDF document.' };
      }

      const numPages = pdfLibDoc.getPageCount();
      if (numPages === 0) {
        return { success: false, error: 'Document has no pages.' };
      }

      const docId = generateId();
      const sourceDoc: PdfSourceDocument = {
        id: docId,
        name: file.name,
        sizeBytes: file.size,
        pageCount: numPages,
        file,
        arrayBuffer
      };

      /*
       * Also open the file with pdf.js. pdf-lib handles the structural edits
       * (rotate/delete/reorder/export) but cannot rasterise, so the page
       * thumbnails and the zoom preview need a PDFDocumentProxy. Without this
       * `renderThumbnail` threw "Source document not found" for every page and
       * the organizer grid sat on "Rendering..." forever.
       *
       * The buffer is copied because pdf.js transfers ownership of what it is
       * given, which would detach the ArrayBuffer that export still needs.
       */
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer.slice(0)),
          password
        } as any);
        sourceDoc.pdfDoc = await loadingTask.promise;
      } catch {
        // Rasterising is a progressive enhancement: if pdf.js cannot open the
        // file, the page still loads and every structural operation works, the
        // thumbnails just fall back to their placeholder.
      }

      this.sourceDocsMap.set(docId, sourceDoc);

      // Extract page metadata (dimensions, original rotation) from pdf-lib
      const newPages: PdfPageItem[] = [];
      const pdfLibPages = pdfLibDoc.getPages();

      for (let i = 0; i < numPages; i++) {
        const page = pdfLibPages[i];
        let originalRotation = 0;
        let width = 595;
        let height = 842;

        try {
          const size = page.getSize();
          width = size.width;
          height = size.height;
          originalRotation = page.getRotation().angle || 0;
        } catch {
          // Fallback to defaults
        }

        newPages.push({
          id: generateId(),
          sourceDocId: docId,
          sourcePageIndex: i, // 0-indexed
          displayNumber: this.activePages.length + newPages.length + 1,
          originalRotation,
          rotation: 0,
          width,
          height,
          thumbnailLoading: false
        });
      }

      this.activePages = [...this.activePages, ...newPages];
      this.updateDisplayNumbers();

      return { success: true, doc: sourceDoc };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to load PDF document.' };
    }
  }

  async loadMultipleDocuments(
    files: File[]
  ): Promise<{ success: boolean; docs: PdfSourceDocument[]; errors: string[] }> {
    const docs: PdfSourceDocument[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const res = await this.loadDocument(file);
      if (res.success && res.doc) {
        docs.push(res.doc);
      } else {
        errors.push(`${file.name}: ${res.error || 'Failed to load'}`);
      }
    }

    return {
      success: docs.length > 0,
      docs,
      errors
    };
  }

  // --- Reset & Clear ---

  clear() {
    this.sourceDocsMap.clear();
    this.activePages = [];
    this.selectedPageIds.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  // --- Page Operations ---

  private recordOperation(op: PdfPageOperation) {
    this.undoStack.push(op);
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  private updateDisplayNumbers() {
    this.activePages.forEach((p, index) => {
      p.displayNumber = index + 1;
    });
  }

  reorderPage(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.activePages.length ||
      toIndex < 0 ||
      toIndex >= this.activePages.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const previousOrder = [...this.activePages];
    const [moved] = this.activePages.splice(fromIndex, 1);
    this.activePages.splice(toIndex, 0, moved);
    this.updateDisplayNumbers();

    this.recordOperation({
      id: generateId(),
      type: 'reorder',
      description: `Moved page ${fromIndex + 1} to position ${toIndex + 1}`,
      timestamp: Date.now(),
      undoData: previousOrder,
      redoData: [...this.activePages]
    });

    return true;
  }

  movePageToPosition(pageId: string, targetDisplayNumber: number): boolean {
    const currentIndex = this.activePages.findIndex(p => p.id === pageId);
    if (currentIndex === -1) return false;
    const targetIndex = targetDisplayNumber - 1;
    return this.reorderPage(currentIndex, targetIndex);
  }

  reorderPagesBySourceDocIds(docIdsInOrder: string[]): boolean {
    const previousOrder = [...this.activePages];
    const newOrder: PdfPageItem[] = [];
    for (const docId of docIdsInOrder) {
      newOrder.push(...this.activePages.filter(p => p.sourceDocId === docId));
    }
    if (newOrder.length === this.activePages.length) {
      this.activePages = newOrder;
      this.updateDisplayNumbers();
      this.recordOperation({
        id: generateId(),
        type: 'reorder',
        description: 'Reordered pages by source document order',
        timestamp: Date.now(),
        undoData: previousOrder,
        redoData: [...this.activePages]
      });
      return true;
    }
    return false;
  }

  rotatePages(pageIds: string[], degreesDelta: number): boolean {
    if (!pageIds || pageIds.length === 0) return false;
    const targetSet = new Set(pageIds);

    const previousRotations = new Map<string, number>();
    this.activePages.forEach(p => {
      if (targetSet.has(p.id)) {
        previousRotations.set(p.id, p.rotation);
        p.rotation = (p.rotation + degreesDelta + 360) % 360;
      }
    });

    this.recordOperation({
      id: generateId(),
      type: 'rotate',
      description: `Rotated ${pageIds.length} page(s) by ${degreesDelta}°`,
      timestamp: Date.now(),
      undoData: { previousRotations },
      redoData: { pageIds: [...pageIds], degreesDelta }
    });

    return true;
  }

  rotateAll(degreesDelta: number): boolean {
    const allIds = this.activePages.map(p => p.id);
    return this.rotatePages(allIds, degreesDelta);
  }

  deletePages(pageIds: string[]): boolean {
    if (!pageIds || pageIds.length === 0) return false;
    const targetSet = new Set(pageIds);

    const previousPages = [...this.activePages];
    this.activePages = this.activePages.filter(p => !targetSet.has(p.id));
    this.updateDisplayNumbers();

    // Deselect deleted pages
    pageIds.forEach(id => this.selectedPageIds.delete(id));

    this.recordOperation({
      id: generateId(),
      type: 'delete',
      description: `Deleted ${pageIds.length} page(s)`,
      timestamp: Date.now(),
      undoData: previousPages,
      redoData: [...this.activePages]
    });

    return true;
  }

  duplicatePages(pageIds: string[]): boolean {
    if (!pageIds || pageIds.length === 0) return false;
    const targetSet = new Set(pageIds);

    const previousPages = [...this.activePages];
    const newPagesList: PdfPageItem[] = [];

    for (const page of this.activePages) {
      newPagesList.push(page);
      if (targetSet.has(page.id)) {
        // Clone page
        const clone: PdfPageItem = {
          ...page,
          id: generateId(),
          displayNumber: 0 // will be updated
        };
        newPagesList.push(clone);
      }
    }

    this.activePages = newPagesList;
    this.updateDisplayNumbers();

    this.recordOperation({
      id: generateId(),
      type: 'duplicate',
      description: `Duplicated ${pageIds.length} page(s)`,
      timestamp: Date.now(),
      undoData: previousPages,
      redoData: [...this.activePages]
    });

    return true;
  }

  // --- Undo & Redo ---

  undo(): boolean {
    if (!this.canUndo) return false;
    const op = this.undoStack.pop()!;

    if (op.type === 'reorder' || op.type === 'delete' || op.type === 'duplicate') {
      this.activePages = [...op.undoData];
      this.updateDisplayNumbers();
    } else if (op.type === 'rotate') {
      const prevMap: Map<string, number> = op.undoData.previousRotations;
      this.activePages.forEach(p => {
        if (prevMap.has(p.id)) {
          p.rotation = prevMap.get(p.id)!;
        }
      });
    }

    this.redoStack.push(op);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const op = this.redoStack.pop()!;

    if (op.type === 'reorder' || op.type === 'delete' || op.type === 'duplicate') {
      this.activePages = [...op.redoData];
      this.updateDisplayNumbers();
    } else if (op.type === 'rotate') {
      const pageIds: string[] = op.redoData.pageIds;
      const degreesDelta: number = op.redoData.degreesDelta;
      const targetSet = new Set(pageIds);
      this.activePages.forEach(p => {
        if (targetSet.has(p.id)) {
          p.rotation = (p.rotation + degreesDelta + 360) % 360;
        }
      });
    }

    this.undoStack.push(op);
    return true;
  }

  // --- Selection Management ---

  selectPage(id: string) {
    this.selectedPageIds.add(id);
  }

  deselectPage(id: string) {
    this.selectedPageIds.delete(id);
  }

  togglePageSelection(id: string) {
    if (this.selectedPageIds.has(id)) {
      this.selectedPageIds.delete(id);
    } else {
      this.selectedPageIds.add(id);
    }
  }

  selectAll() {
    this.activePages.forEach(p => this.selectedPageIds.add(p.id));
  }

  deselectAll() {
    this.selectedPageIds.clear();
  }

  invertSelection() {
    this.activePages.forEach(p => {
      if (this.selectedPageIds.has(p.id)) {
        this.selectedPageIds.delete(p.id);
      } else {
        this.selectedPageIds.add(p.id);
      }
    });
  }

  selectEvenPages() {
    this.selectedPageIds.clear();
    this.activePages.forEach(p => {
      if (p.displayNumber % 2 === 0) {
        this.selectedPageIds.add(p.id);
      }
    });
  }

  selectOddPages() {
    this.selectedPageIds.clear();
    this.activePages.forEach(p => {
      if (p.displayNumber % 2 !== 0) {
        this.selectedPageIds.add(p.id);
      }
    });
  }

  selectRange(start: number, end: number) {
    this.selectedPageIds.clear();
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    this.activePages.forEach(p => {
      if (p.displayNumber >= min && p.displayNumber <= max) {
        this.selectedPageIds.add(p.id);
      }
    });
  }

  getSelectedPages(): PdfPageItem[] {
    return this.activePages.filter(p => this.selectedPageIds.has(p.id));
  }

  // --- Thumbnail & Preview Rendering ---

  async renderThumbnail(page: PdfPageItem, scale = 0.25): Promise<string> {
    if (page.thumbnailUrl) return page.thumbnailUrl;

    const sourceDoc = this.sourceDocsMap.get(page.sourceDocId);
    if (!sourceDoc || !sourceDoc.pdfDoc) {
      throw new Error(`Source document not found for page ${page.id}`);
    }

    page.thumbnailLoading = true;
    try {
      const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1); // pdfjs is 1-indexed
      const viewport = pdfPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Canvas 2D context not available');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await (pdfPage.render({
        canvasContext: ctx,
        viewport,
        canvas
      } as any)).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      page.thumbnailUrl = dataUrl;
      page.thumbnailLoading = false;
      return dataUrl;
    } catch (e) {
      page.thumbnailLoading = false;
      page.thumbnailError = true;
      throw e;
    }
  }

  async renderHighResPage(page: PdfPageItem, scale = 1.5): Promise<string> {
    const sourceDoc = this.sourceDocsMap.get(page.sourceDocId);
    if (!sourceDoc || !sourceDoc.pdfDoc) {
      throw new Error(`Source document not found for page ${page.id}`);
    }

    const pdfPage = await sourceDoc.pdfDoc.getPage(page.sourcePageIndex + 1);
    const viewport = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Canvas 2D context not available');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await (pdfPage.render({
      canvasContext: ctx,
      viewport,
      canvas
    } as any)).promise;

    return canvas.toDataURL('image/jpeg', 0.95);
  }

  async renderThumbnailsLazy(
    pages: PdfPageItem[],
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    let completed = 0;
    const total = pages.length;

    for (const page of pages) {
      if (signal?.aborted) break;
      if (!page.thumbnailUrl) {
        try {
          await this.renderThumbnail(page);
        } catch {
          // Page error handled inside renderThumbnail
        }
      }
      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
      // Yield thread briefly
      await new Promise(res => setTimeout(res, 0));
    }
  }

  // --- Export Engine ---

  /**
   * Generates a single PDF document from the given pages (or active pages if none provided).
   */
  async exportSinglePdf(
    pagesToExport?: PdfPageItem[],
    outputName?: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<PdfExportResult> {
    const pages = pagesToExport || this.activePages;
    if (pages.length === 0) {
      throw new Error('No pages to export.');
    }

    const newPdf = await PDFDocument.create();

    // Cache loaded pdf-lib documents to avoid reloading the same source PDF multiple times
    const loadedPdfLibDocs = new Map<string, PDFDocument>();

    const total = pages.length;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user.');
      }

      const page = pages[i];
      let pdfLibDoc = loadedPdfLibDocs.get(page.sourceDocId);

      if (!pdfLibDoc) {
        const sourceDoc = this.sourceDocsMap.get(page.sourceDocId);
        if (!sourceDoc) {
          throw new Error(`Source document ${page.sourceDocId} not found.`);
        }
        pdfLibDoc = await PDFDocument.load(sourceDoc.arrayBuffer.slice(0), {
          ignoreEncryption: true
        });
        loadedPdfLibDocs.set(page.sourceDocId, pdfLibDoc);
      }

      const [copiedPage] = await newPdf.copyPages(pdfLibDoc, [page.sourcePageIndex]);

      // Apply net rotation: original rotation + user applied rotation
      const totalRotation = (page.originalRotation + page.rotation) % 360;
      copiedPage.setRotation(degrees(totalRotation));

      newPdf.addPage(copiedPage);

      if (onProgress) {
        onProgress(Math.round(((i + 1) / total) * 90)); // 0-90% for copying
      }
    }

    if (signal?.aborted) {
      throw new Error('Export cancelled by user.');
    }

    const pdfBytes = await newPdf.save({ useObjectStreams: false });
    if (onProgress) onProgress(100);

    const name = outputName || `document_${Date.now()}.pdf`;
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const file = new File([blob], name, { type: 'application/pdf' });

    return {
      name,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: pages.length
    };
  }

  /**
   * Generates multiple PDF documents based on split chunks.
   */
  async exportSplitPdfs(
    chunks: number[][],
    baseName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<PdfExportResult[]> {
    if (chunks.length === 0) {
      throw new Error('No split chunks defined.');
    }

    const cleanBaseName = baseName.replace(/\.pdf$/i, '');
    const results: PdfExportResult[] = [];
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
      if (signal?.aborted) {
        throw new Error('Split cancelled by user.');
      }

      const chunkPageNumbers = chunks[i];
      // Map 1-indexed page numbers to corresponding active PdfPageItem
      const chunkPages = chunkPageNumbers
        .map(num => this.activePages[num - 1])
        .filter(p => !!p);

      if (chunkPages.length === 0) continue;

      const partSuffix = totalChunks > 1 ? `_part_${i + 1}` : '';
      const rangeSuffix =
        chunkPageNumbers.length === 1
          ? `_page_${chunkPageNumbers[0]}`
          : `_pages_${chunkPageNumbers[0]}-${chunkPageNumbers[chunkPageNumbers.length - 1]}`;

      const partName = `${cleanBaseName}${partSuffix}${rangeSuffix}.pdf`;

      const result = await this.exportSinglePdf(
        chunkPages,
        partName,
        undefined,
        signal
      );

      results.push(result);

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    return results;
  }
}
