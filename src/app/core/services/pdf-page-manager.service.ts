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
import {
  PageFlipAxis,
  PageFlipReport,
  PageFlipState
} from '../models/page-flip.types';
import { PageFlipService } from './page-flip.service';
import { BlankDetectionReport } from '../models/blank-page.types';
import { DuplicateDetectionReport } from '../models/duplicate-page.types';
import {
  PageSizeGroup,
  SelectionHelperKind,
  SelectionHelperMatch,
  SelectionHelperOptions
} from '../models/page-selection.types';
import { PageSelectionUtil } from '../utilities/page-selection.util';
import {
  DocumentTrayEntry,
  SourceSplitPlan,
  TRAY_COLOR_COUNT,
  TrayPageBadge
} from '../models/document-tray.types';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import { PageOrderExpressionUtil, PageOrderResult } from '../utilities/page-order-expression.util';
import {
  PageArrangementUtil,
  PageArrangementMode,
  PageArrangementOptions,
  PageArrangementPreview
} from '../utilities/page-arrangement.util';
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
  private nextSourceColorIndex = 0;

  // Undo/Redo stacks
  private undoStack: PdfPageOperation[] = [];
  private redoStack: PdfPageOperation[] = [];
  private readonly MAX_HISTORY = 50;

  /*
   * Constructed directly rather than injected: PageFlipService is stateless,
   * and the existing specs build this manager with `new
   * PdfPageManagerService()` outside any injection context, where a field
   * `inject()` would throw.
   */
  private readonly flipService = new PageFlipService();

  constructor() {}

  // --- Getters ---
  get pages(): PdfPageItem[] {
    return this.activePages;
  }

  get sourceDocs(): PdfSourceDocument[] {
    return Array.from(this.sourceDocsMap.values());
  }

  getSourceDocsMap(): Map<string, PdfSourceDocument> {
    return this.sourceDocsMap;
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
        /*
         * Load order, not position in the map: a document removed and another
         * added would otherwise inherit the removed one's colour, and two
         * documents on the canvas would badge the same.
         */
        colorIndex: this.nextSourceColorIndex++ % TRAY_COLOR_COUNT,
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
    for (const doc of this.sourceDocsMap.values()) {
      try {
        doc.pdfDoc?.destroy?.();
      } catch {
        // Ignore errors during destroy
      }
    }
    this.sourceDocsMap.clear();
    this.activePages = [];
    this.selectedPageIds.clear();
    this.nextSourceColorIndex = 0;
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

  /**
   * Rotates pages individually by specific degree deltas in a single undoable transaction.
   * Enables one-tap auto-rotation across a mixed-orientation document.
   */
  rotatePagesIndividually(
    rotations: { pageId: string; degreesDelta: number }[],
    description?: string
  ): boolean {
    if (!rotations || rotations.length === 0) return false;
    const previousRotations = new Map<string, number>();
    const pageMap = new Map(this.activePages.map(p => [p.id, p]));

    for (const { pageId, degreesDelta } of rotations) {
      const page = pageMap.get(pageId);
      if (page && degreesDelta !== 0) {
        if (!previousRotations.has(pageId)) {
          previousRotations.set(pageId, page.rotation);
        }
        page.rotation = (page.rotation + degreesDelta + 360) % 360;
      }
    }

    if (previousRotations.size === 0) return false;

    this.recordOperation({
      id: generateId(),
      type: 'rotate',
      description: description || `Auto-rotated ${previousRotations.size} page(s) upright`,
      timestamp: Date.now(),
      undoData: { previousRotations },
      redoData: { individualRotations: [...rotations] }
    });

    return true;
  }

  // --- Page Flipping (Mirror) ---

  /**
   * Mirrors `pageIds` about `axis` as a single undoable operation.
   *
   * Flipping is a toggle, not an accumulation: asking for the same axis twice
   * returns those pages to their original orientation, and the report says so
   * rather than claiming a flip that cancelled itself out.
   *
   * The flip is recorded on the page items and realised at export time as a
   * content-stream transform, so vector content and selectable text survive.
   * Rotation is untouched — `rotatePages` and this method compose.
   */
  flipPages(pageIds: string[], axis: PageFlipAxis): PageFlipReport | null {
    if (!pageIds || pageIds.length === 0) return null;
    const targetSet = new Set(pageIds);

    const previousFlips = new Map<string, PageFlipState>();
    const flippedDisplayNumbers: number[] = [];
    const revertedDisplayNumbers: number[] = [];

    for (const page of this.activePages) {
      if (!targetSet.has(page.id)) continue;

      previousFlips.set(page.id, this.flipService.stateOf(page));
      const next = this.flipService.composeState(this.flipService.stateOf(page), axis);
      page.flipHorizontal = next.horizontal;
      page.flipVertical = next.vertical;

      if (next.horizontal || next.vertical) {
        flippedDisplayNumbers.push(page.displayNumber);
      } else {
        revertedDisplayNumbers.push(page.displayNumber);
      }
    }

    if (previousFlips.size === 0) return null;

    this.recordOperation({
      id: generateId(),
      type: 'flip',
      description: `Flipped ${previousFlips.size} page(s) ${axis}`,
      timestamp: Date.now(),
      undoData: { previousFlips },
      redoData: { pageIds: [...pageIds], axis }
    });

    return {
      axis,
      flippedDisplayNumbers,
      revertedDisplayNumbers,
      normalizedOriginDisplayNumbers: []
    };
  }

  /** Mirrors every page in the workspace about `axis`, as one undoable step. */
  flipAll(axis: PageFlipAxis): PageFlipReport | null {
    return this.flipPages(this.activePages.map(p => p.id), axis);
  }

  /** Clears the flip on `pageIds`, as one undoable step. */
  clearFlips(pageIds: string[]): boolean {
    if (!pageIds || pageIds.length === 0) return false;
    const targetSet = new Set(pageIds);

    const previousFlips = new Map<string, PageFlipState>();
    for (const page of this.activePages) {
      if (!targetSet.has(page.id)) continue;
      if (!this.flipService.hasFlip(page)) continue;
      previousFlips.set(page.id, this.flipService.stateOf(page));
      page.flipHorizontal = false;
      page.flipVertical = false;
    }

    if (previousFlips.size === 0) return false;

    this.recordOperation({
      id: generateId(),
      type: 'flip',
      description: `Cleared the flip on ${previousFlips.size} page(s)`,
      timestamp: Date.now(),
      undoData: { previousFlips },
      redoData: { clearPageIds: [...previousFlips.keys()] }
    });

    return true;
  }

  /** The pages that currently carry a flip, in document order. */
  getFlippedPages(): PdfPageItem[] {
    return this.activePages.filter(p => this.flipService.hasFlip(p));
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

  // --- Page-Order Expression ---

  /**
   * Returns a live preview of the page order that `expression` would produce
   * without mutating the current page list.
   *
   * The preview is the same ordered array of 1-indexed page numbers that
   * `applyPageOrderExpression` would apply, so callers can render thumbnails
   * in the preview order by mapping each number to `this.pages[number - 1]`.
   *
   * Returns `PageOrderResult` — when `.valid` is false the `.error` explains
   * precisely what is wrong and where.
   */
  previewPageOrderExpression(expression: string): PageOrderResult {
    return PageOrderExpressionUtil.evaluate(expression, this.activePages.length);
  }

  /**
   * Parses `expression`, validates it against the current page set, and
   * re-orders `this.activePages` accordingly.  The operation is recorded as
   * a single undoable entry on the undo stack.
   *
   * Returns `PageOrderResult` — when `.valid` is false nothing was changed
   * and `.error` describes what went wrong.
   */
  applyPageOrderExpression(expression: string): PageOrderResult {
    const result = PageOrderExpressionUtil.evaluate(
      expression,
      this.activePages.length
    );

    if (!result.valid) {
      return result;
    }

    const previousOrder = [...this.activePages];

    // Build the new page list by mapping each 1-indexed page number from the
    // expression result to the *current* activePages array.
    // If a page appears multiple times (e.g. duplicate pages), subsequent
    // occurrences receive a new unique ID to ensure Angular trackBy and selection
    // remain unique and isolated.
    const seenIds = new Set<string>();
    const newOrder: PdfPageItem[] = result.pageOrder.map(pageNum => {
      const orig = this.activePages[pageNum - 1];
      if (!seenIds.has(orig.id)) {
        seenIds.add(orig.id);
        return { ...orig };
      }
      return {
        ...orig,
        id: generateId()
      };
    });

    this.activePages = newOrder;
    this.updateDisplayNumbers();

    // Prune selectedPageIds to retain only pages that still exist after filtering/reordering
    const activeIdSet = new Set(this.activePages.map(p => p.id));
    for (const selectedId of Array.from(this.selectedPageIds)) {
      if (!activeIdSet.has(selectedId)) {
        this.selectedPageIds.delete(selectedId);
      }
    }

    this.recordOperation({
      id: generateId(),
      type: 'reorder',
      description: `Reordered pages via expression: "${expression}"`,
      timestamp: Date.now(),
      undoData: previousOrder,
      redoData: [...this.activePages]
    });

    return result;
  }

  // --- Page Arrangement Modes (One-tap permutations) ---

  /**
   * Previews the result of an arrangement mode (Reverse, Odd-Even Split,
   * Odd-Even Merge, Duplex Sort) without mutating the document.
   *
   * Returns a PageArrangementPreview with:
   *   • permutation: 0-indexed permutation array
   *   • previousOrder: 1-indexed display numbers currently
   *   • newOrder: 1-indexed display numbers as they will appear
   */
  previewArrangement(
    mode: PageArrangementMode,
    options?: PageArrangementOptions
  ): PageArrangementPreview {
    const count = this.activePages.length;
    const permutation = PageArrangementUtil.getPermutation(mode, count, options);
    const previousOrder = this.activePages.map(p => p.displayNumber);
    const newOrder = permutation.map(idx => this.activePages[idx]?.displayNumber ?? idx + 1);

    return {
      mode,
      pageCount: count,
      permutation,
      previousOrder,
      newOrder
    };
  }

  /**
   * Applies an arrangement mode to activePages via the existing reorder path.
   * Records a single undoable 'reorder' operation on the undo stack.
   */
  applyArrangement(
    mode: PageArrangementMode,
    options?: PageArrangementOptions
  ): boolean {
    const count = this.activePages.length;
    if (count <= 1) {
      return false;
    }

    const permutation = PageArrangementUtil.getPermutation(mode, count, options);
    const previousOrder = [...this.activePages];

    const newOrder: PdfPageItem[] = permutation.map(idx => this.activePages[idx]);

    this.activePages = newOrder;
    this.updateDisplayNumbers();

    const modeLabels: Record<PageArrangementMode, string> = {
      'reverse': 'Reverse order',
      'odd-even-split': 'Odd-Even Split',
      'odd-even-merge': 'Odd-Even Merge',
      'duplex-sort': `Duplex Sort (${options?.backsReversed !== false ? 'backs reversed' : 'backs normal'})`,
      'custom-expression': 'Page-order expression'
    };

    this.recordOperation({
      id: generateId(),
      type: 'reorder',
      description: `Arranged pages: ${modeLabels[mode] || mode}`,
      timestamp: Date.now(),
      undoData: previousOrder,
      redoData: [...this.activePages]
    });

    return true;
  }

  // --- Blank Page Removal ---

  /**
   * Removes pages identified as blank as a single undoable operation on the undo stack.
   * If reviewPdfFileName is provided, records it in the operation description for auditability.
   */
  removeBlankPages(pageIds: string[], reviewPdfFileName?: string): boolean {
    if (!pageIds || pageIds.length === 0) return false;
    const targetSet = new Set(pageIds);

    const previousPages = [...this.activePages];
    this.activePages = this.activePages.filter(p => !targetSet.has(p.id));
    this.updateDisplayNumbers();

    // Deselect removed pages
    pageIds.forEach(id => this.selectedPageIds.delete(id));

    const reviewSuffix = reviewPdfFileName ? ` (Review PDF: ${reviewPdfFileName})` : '';
    this.recordOperation({
      id: generateId(),
      type: 'delete',
      description: `Removed ${pageIds.length} blank page(s)${reviewSuffix}`,
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
    } else if (op.type === 'flip') {
      const prevMap: Map<string, PageFlipState> = op.undoData.previousFlips;
      this.activePages.forEach(p => {
        const previous = prevMap.get(p.id);
        if (previous) {
          p.flipHorizontal = previous.horizontal;
          p.flipVertical = previous.vertical;
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
      if (op.redoData.individualRotations) {
        const deltaMap = new Map<string, number>(
          op.redoData.individualRotations.map((r: any) => [r.pageId, r.degreesDelta])
        );
        this.activePages.forEach(p => {
          if (deltaMap.has(p.id)) {
            p.rotation = (p.rotation + deltaMap.get(p.id)! + 360) % 360;
          }
        });
      } else {
        const pageIds: string[] = op.redoData.pageIds;
        const degreesDelta: number = op.redoData.degreesDelta;
        const targetSet = new Set(pageIds);
        this.activePages.forEach(p => {
          if (targetSet.has(p.id)) {
            p.rotation = (p.rotation + degreesDelta + 360) % 360;
          }
        });
      }
    } else if (op.type === 'flip') {
      if (op.redoData.clearPageIds) {
        const targetSet = new Set<string>(op.redoData.clearPageIds);
        this.activePages.forEach(p => {
          if (targetSet.has(p.id)) {
            p.flipHorizontal = false;
            p.flipVertical = false;
          }
        });
      } else {
        const targetSet = new Set<string>(op.redoData.pageIds);
        const axis: PageFlipAxis = op.redoData.axis;
        this.activePages.forEach(p => {
          if (targetSet.has(p.id)) {
            const next = this.flipService.composeState(this.flipService.stateOf(p), axis);
            p.flipHorizontal = next.horizontal;
            p.flipVertical = next.vertical;
          }
        });
      }
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

  // --- Additional Selection Helpers ---
  //
  // The six helpers above — all, none, odd, even, range, invert — are
  // untouched. These are additions alongside them.

  /**
   * What a helper WOULD select, without changing the current selection.
   *
   * The screen calls this first so it can say how many pages matched before
   * the selection moves under the person's feet.
   */
  previewSelectionHelper(
    kind: SelectionHelperKind,
    context: {
      blankReport?: BlankDetectionReport | null;
      duplicateReport?: DuplicateDetectionReport | null;
      options?: SelectionHelperOptions;
    } = {}
  ): SelectionHelperMatch {
    return PageSelectionUtil.match(kind, this.activePages, context);
  }

  /**
   * Runs a helper and replaces the selection with what it matched, the same
   * way `selectOddPages` replaces rather than adds.
   *
   * A helper that could not run leaves the selection alone and returns its
   * `unavailableReason`, so a missing scan never reads as "nothing matched".
   */
  applySelectionHelper(
    kind: SelectionHelperKind,
    context: {
      blankReport?: BlankDetectionReport | null;
      duplicateReport?: DuplicateDetectionReport | null;
      options?: SelectionHelperOptions;
    } = {}
  ): SelectionHelperMatch {
    const match = this.previewSelectionHelper(kind, context);
    if (match.unavailableReason) {
      return match;
    }

    this.selectedPageIds.clear();
    match.pageIds.forEach(id => this.selectedPageIds.add(id));
    return match;
  }

  /** Adds a helper's matches to the current selection instead of replacing it. */
  addSelectionHelperToSelection(
    kind: SelectionHelperKind,
    context: {
      blankReport?: BlankDetectionReport | null;
      duplicateReport?: DuplicateDetectionReport | null;
      options?: SelectionHelperOptions;
    } = {}
  ): SelectionHelperMatch {
    const match = this.previewSelectionHelper(kind, context);
    if (match.unavailableReason) {
      return match;
    }
    match.pageIds.forEach(id => this.selectedPageIds.add(id));
    return match;
  }

  /**
   * The document's page sizes, largest group first, so the screen can offer
   * "select every page that measures this" as a list.
   */
  getPageSizeGroups(): PageSizeGroup[] {
    return PageSelectionUtil.groupBySize(this.activePages);
  }

  getSelectedPages(): PdfPageItem[] {
    return this.activePages.filter(p => this.selectedPageIds.has(p.id));
  }

  // --- Multi-Document Tray ---
  //
  // loadMultipleDocuments has always put pages from several PDFs on one
  // canvas; nothing read the source back out. These are the accessors a tray
  // needs. With a single document loaded they describe exactly the one
  // document, so the single-file flow is unaffected.

  /** True once more than one document's pages share the canvas. */
  get isMultiDocument(): boolean {
    return this.sourceDocsMap.size > 1;
  }

  /**
   * The loaded documents in load order, each with the pages it still has on
   * the canvas.
   *
   * A document whose pages have all been deleted stays in the list marked
   * `emptied`, because it is still loaded and its pages can come back through
   * undo — dropping it from the tray would make the undo look like it had
   * nowhere to land.
   */
  getDocumentTray(): DocumentTrayEntry[] {
    const byDoc = new Map<string, { pageIds: string[]; displayNumbers: number[] }>();
    for (const page of this.activePages) {
      let bucket = byDoc.get(page.sourceDocId);
      if (!bucket) {
        bucket = { pageIds: [], displayNumbers: [] };
        byDoc.set(page.sourceDocId, bucket);
      }
      bucket.pageIds.push(page.id);
      bucket.displayNumbers.push(page.displayNumber);
    }

    return this.sourceDocs.map((doc, index) => {
      const bucket = byDoc.get(doc.id);
      return {
        docId: doc.id,
        name: doc.name,
        pageCount: bucket?.pageIds.length ?? 0,
        originalPageCount: doc.pageCount,
        sizeBytes: doc.sizeBytes,
        colorIndex: doc.colorIndex ?? index % TRAY_COLOR_COUNT,
        displayNumbers: bucket?.displayNumbers ?? [],
        pageIds: bucket?.pageIds ?? [],
        emptied: (bucket?.pageIds.length ?? 0) === 0
      };
    });
  }

  /**
   * The source badge for one page, or undefined if its document has gone.
   *
   * Called once per page per render, so the stored `colorIndex` is read
   * directly and the load-order scan is only a fallback for a document loaded
   * before colours were assigned.
   */
  getPageBadge(page: PdfPageItem): TrayPageBadge | undefined {
    const doc = this.sourceDocsMap.get(page.sourceDocId);
    if (!doc) return undefined;

    let colorIndex = doc.colorIndex;
    if (colorIndex === undefined) {
      const index = this.sourceDocs.findIndex(d => d.id === doc.id);
      colorIndex = index < 0 ? 0 : index % TRAY_COLOR_COUNT;
    }

    return {
      pageId: page.id,
      docId: doc.id,
      name: doc.name,
      colorIndex,
      sourcePageNumber: page.sourcePageIndex + 1
    };
  }

  /** Pages belonging to one source document, in canvas order. */
  getPagesBySourceDoc(docId: string): PdfPageItem[] {
    return this.activePages.filter(p => p.sourceDocId === docId);
  }

  /** Replaces the selection with every page from one source document. */
  selectPagesBySourceDoc(docId: string): number {
    this.selectedPageIds.clear();
    const pages = this.getPagesBySourceDoc(docId);
    pages.forEach(p => this.selectedPageIds.add(p.id));
    return pages.length;
  }

  /**
   * How the canvas would split back out by source, without exporting
   * anything, so the screen can show the parts before they are written.
   */
  getSourceSplitPlan(): SourceSplitPlan {
    const entries = this.getDocumentTray().filter(e => !e.emptied);
    return {
      entries,
      groups: entries.map(entry => ({
        entry,
        pages: this.getPagesBySourceDoc(entry.docId)
      })),
      totalPages: entries.reduce((sum, e) => sum + e.pageCount, 0)
    };
  }

  /**
   * Writes one PDF per source document, keeping each document's pages in the
   * order they currently sit on the canvas along with their rotation and flip.
   *
   * This is the inverse of the merged export, not a replacement for it:
   * `exportSinglePdf` still produces the one merged file it always did.
   */
  async exportBySourceDocument(
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<PdfExportResult[]> {
    const plan = this.getSourceSplitPlan();
    if (plan.groups.length === 0) {
      throw new Error('No pages to export.');
    }

    const results: PdfExportResult[] = [];
    const total = plan.groups.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user.');
      }

      const { entry, pages } = plan.groups[i];
      const cleanBaseName = entry.name.replace(/\.pdf$/i, '');
      const result = await this.exportSinglePdf(
        pages,
        `${cleanBaseName}_from_organizer.pdf`,
        undefined,
        signal
      );

      results.push({ ...result, sourceDocId: entry.docId, sourceDocName: entry.name });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / total) * 100));
      }
    }

    return results;
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
   * Copies one organizer page into a destination document, applying its net
   * rotation and, where one is set, its mirror.
   *
   * Extracted from `exportSinglePdf` so the size measurement the `max-size`
   * split plans with runs through exactly the same copy path the export will
   * use. A measurement taken any other way would drift from the file that
   * actually gets written, and the ceiling the person set would stop meaning
   * anything.
   *
   * `loadedPdfLibDocs` is the caller's cache, so a source PDF is parsed once
   * per job rather than once per page.
   */
  private async appendPageToDocument(
    target: PDFDocument,
    page: PdfPageItem,
    loadedPdfLibDocs: Map<string, PDFDocument>
  ): Promise<{ flipped: boolean; originNormalized: boolean }> {
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

    // Apply net rotation: original rotation + user applied rotation
    const totalRotation = (page.originalRotation + page.rotation) % 360;

    if (this.flipService.hasFlip(page)) {
      /*
       * A flipped page cannot go through copyPages: the mirror is a
       * content-stream transform, so the source page is embedded as a Form
       * XObject and drawn through a negative-scale matrix. Pages without a
       * flip keep the original copyPages path byte for byte.
       */
      const sourcePage = pdfLibDoc.getPage(page.sourcePageIndex);
      const { page: flippedPage, originNormalized } = await this.flipService.drawFlippedPage(
        target,
        sourcePage,
        this.flipService.stateOf(page)
      );
      flippedPage.setRotation(degrees(totalRotation));
      return { flipped: true, originNormalized };
    }

    const [copiedPage] = await target.copyPages(pdfLibDoc, [page.sourcePageIndex]);
    copiedPage.setRotation(degrees(totalRotation));
    target.addPage(copiedPage);
    return { flipped: false, originNormalized: false };
  }

  /**
   * Returns a function that serializes a set of active pages and reports how
   * many bytes they come to, for the `max-size` split planner's
   * add-pages-serialize-measure loop.
   *
   * The returned closure keeps its own cache of parsed source documents, so a
   * whole planning run parses each source PDF once no matter how many
   * candidate boundaries it measures. Nothing is written to disk and no quota
   * is touched: this only measures.
   *
   * Page numbers are 1-indexed positions in the active page list, the same
   * numbering `exportSplitPdfs` takes.
   */
  createChunkMeasurer(signal?: AbortSignal): (pageNumbers: number[]) => Promise<number> {
    const loadedPdfLibDocs = new Map<string, PDFDocument>();

    return async (pageNumbers: number[]): Promise<number> => {
      if (signal?.aborted) {
        throw new Error('Measurement cancelled by user.');
      }

      const pages = pageNumbers
        .map(num => this.activePages[num - 1])
        .filter((p): p is PdfPageItem => !!p);

      if (pages.length === 0) return 0;

      const probe = await PDFDocument.create();
      for (const page of pages) {
        if (signal?.aborted) {
          throw new Error('Measurement cancelled by user.');
        }
        await this.appendPageToDocument(probe, page, loadedPdfLibDocs);
      }

      // Same save options as exportSinglePdf, or the number would not predict
      // the file the export writes.
      const bytes = await probe.save({ useObjectStreams: false });
      return bytes.byteLength;
    };
  }

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

    let flippedPageCount = 0;
    const normalizedOriginPageNumbers: number[] = [];

    const total = pages.length;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user.');
      }

      const page = pages[i];
      const appended = await this.appendPageToDocument(newPdf, page, loadedPdfLibDocs);
      if (appended.flipped) {
        flippedPageCount++;
      }
      if (appended.originNormalized) {
        normalizedOriginPageNumbers.push(page.displayNumber);
      }

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
      pageCount: pages.length,
      flippedPageCount,
      normalizedOriginPageNumbers
    };
  }

  /**
   * Generates multiple PDF documents based on split chunks.
   *
   * `partBaseNames` is optional and additive: an entry supplies the file-name
   * stem for that chunk, which is how the B3-B5 modes carry a bookmark title,
   * a divider payload or a captured value into the output name. Leaving it out
   * — as the four shipped split modes do — produces exactly the
   * `<base>_part_N_pages_X-Y.pdf` names it always has. Names that collide, or
   * that sanitize down to nothing, fall back to that same scheme, so no part
   * can overwrite another.
   */
  async exportSplitPdfs(
    chunks: number[][],
    baseName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
    partBaseNames?: (string | undefined)[]
  ): Promise<PdfExportResult[]> {
    if (chunks.length === 0) {
      throw new Error('No split chunks defined.');
    }

    const cleanBaseName = baseName.replace(/\.pdf$/i, '');
    const results: PdfExportResult[] = [];
    const totalChunks = chunks.length;
    const usedNames = new Set<string>();

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

      const defaultStem = `${cleanBaseName}${partSuffix}${rangeSuffix}`;
      const suppliedStem = partBaseNames?.[i]?.trim();
      let stem = suppliedStem && suppliedStem.length > 0 ? suppliedStem : defaultStem;
      if (usedNames.has(stem.toLowerCase())) {
        stem = defaultStem;
      }
      if (usedNames.has(stem.toLowerCase())) {
        stem = `${defaultStem}_${i + 1}`;
      }
      usedNames.add(stem.toLowerCase());

      const partName = `${stem}.pdf`;

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
