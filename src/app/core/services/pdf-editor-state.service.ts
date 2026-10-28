import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { PDFDocument } from 'pdf-lib';
import {
  PdfEditorDocument,
  PdfEditorPage,
  PdfElement,
  PdfCropBox,
  PdfWatermark,
  PdfPageNumberingConfig,
  PdfRedaction,
  EditorTool,
  ToolSettings,
  EditorCommand
} from '../models/pdf-editor.types';
import {
  PdfHyperlink,
  CommentThread,
  CommentReply,
  MeasurementResult,
  MeasurementScale,
  TextEditCommand,
  WhiteoutRegion
} from '../models/editor-features.types';

/** A link waiting for the rectangle that will make it tappable. */
export interface LinkDraft {
  type: 'url' | 'page';
  url?: string;
  targetPage?: number;
  label?: string;
}

/** A comment waiting for the spot its pin goes. */
export interface CommentDraft {
  author: string;
  initials: string;
  text: string;
}

/** A whiteout waiting for its area. `matchPage` samples the colour behind. */
export interface WhiteoutDraft {
  fillColor: string;
  matchPage: boolean;
}

/** A measurement waiting for its points. */
export interface MeasureDraft {
  mode: 'distance' | 'area' | 'calibrate';
  scale: MeasurementScale;
  /** `calibrate` only: what the drawn length represents. */
  knownValue?: number;
}

export type PlacementCompleted =
  | { tool: 'link'; link: PdfHyperlink }
  | { tool: 'comment'; thread: CommentThread }
  | { tool: 'whiteout'; region: WhiteoutRegion; sampledFromPage: boolean }
  | { tool: 'measure'; measurement: MeasurementResult }
  | { tool: 'measure'; calibratedScale: MeasurementScale };

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfEditorStateService {
  // Document state
  private documentSubject = new BehaviorSubject<PdfEditorDocument | null>(null);
  public document$: Observable<PdfEditorDocument | null> = this.documentSubject.asObservable();

  // Navigation & View state
  private currentPageSubject = new BehaviorSubject<number>(1); // 1-indexed
  public currentPage$: Observable<number> = this.currentPageSubject.asObservable();

  private zoomSubject = new BehaviorSubject<number>(1.0); // 1.0 = 100%
  public zoom$: Observable<number> = this.zoomSubject.asObservable();

  private fitModeSubject = new BehaviorSubject<'width' | 'page' | 'custom'>('custom');
  public fitMode$: Observable<'width' | 'page' | 'custom'> = this.fitModeSubject.asObservable();

  // Active Tool & Settings
  private activeToolSubject = new BehaviorSubject<EditorTool>('select');
  public activeTool$: Observable<EditorTool> = this.activeToolSubject.asObservable();

  private toolSettingsSubject = new BehaviorSubject<ToolSettings>({
    color: '#FF0000',
    fillColor: undefined,
    strokeWidth: 2,
    fontSize: 16,
    fontFamily: 'Helvetica',
    opacity: 1.0,
    shapeType: 'rectangle',
    annotationType: 'highlight'
  });
  public toolSettings$: Observable<ToolSettings> = this.toolSettingsSubject.asObservable();

  // Selection
  private selectedElementIdSubject = new BehaviorSubject<string | null>(null);
  public selectedElementId$: Observable<string | null> = this.selectedElementIdSubject.asObservable();

  // Undo / Redo Stacks
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private canUndoSubject = new BehaviorSubject<boolean>(false);
  private canRedoSubject = new BehaviorSubject<boolean>(false);
  public canUndo$: Observable<boolean> = this.canUndoSubject.asObservable();
  public canRedo$: Observable<boolean> = this.canRedoSubject.asObservable();

  // Dirty state & Export state
  private isDirtySubject = new BehaviorSubject<boolean>(false);
  public isDirty$: Observable<boolean> = this.isDirtySubject.asObservable();

  private isExportingSubject = new BehaviorSubject<boolean>(false);
  public isExporting$: Observable<boolean> = this.isExportingSubject.asObservable();

  private exportProgressSubject = new BehaviorSubject<number>(0);
  public exportProgress$: Observable<number> = this.exportProgressSubject.asObservable();

  // Redaction preview mode (show true blackouts without applying)
  private redactionPreviewSubject = new BehaviorSubject<boolean>(false);
  public redactionPreview$: Observable<boolean> = this.redactionPreviewSubject.asObservable();

  private readonly MAX_HISTORY = 50;

  /**
   * Bumped every time the source bytes are swapped.
   *
   * The canvas puts it into the id it hands PdfRenderService, which caches
   * by id and returns the document it already holds when the id has not
   * changed — so without this, a rewritten file would keep rendering the
   * pages it used to have.
   *
   * The reload itself is the canvas's job, not this service's: rendering is
   * not state, and reaching for the renderer from here would mean this
   * service could only be built inside an injection context.
   */
  private sourceRevisionSubject = new BehaviorSubject<number>(0);
  public sourceRevision$: Observable<number> = this.sourceRevisionSubject.asObservable();

  constructor() {}

  get sourceRevision(): number {
    return this.sourceRevisionSubject.value;
  }

  // --- Getters ---

  get document(): PdfEditorDocument | null {
    return this.documentSubject.value;
  }

  get currentPageNumber(): number {
    return this.currentPageSubject.value;
  }

  get zoom(): number {
    return this.zoomSubject.value;
  }

  get activeTool(): EditorTool {
    return this.activeToolSubject.value;
  }

  get toolSettings(): ToolSettings {
    return this.toolSettingsSubject.value;
  }

  get selectedElementId(): string | null {
    return this.selectedElementIdSubject.value;
  }

  get currentPage(): PdfEditorPage | null {
    const doc = this.document;
    if (!doc) return null;
    return doc.pages.find(p => p.pageNumber === this.currentPageNumber) || null;
  }

  get selectedElement(): PdfElement | null {
    const page = this.currentPage;
    const elId = this.selectedElementId;
    if (!page || !elId) return null;
    return page.elements.find(e => e.id === elId) || null;
  }

  // --- Document Initialization ---

  initDocument(doc: PdfEditorDocument) {
    this.documentSubject.next(doc);
    this.currentPageSubject.next(1);
    this.zoomSubject.next(1.0);
    this.selectedElementIdSubject.next(null);
    this.activeToolSubject.next('select');
    this.undoStack = [];
    this.redoStack = [];
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(false);
  }

  clearDocument() {
    this.documentSubject.next(null);
    this.currentPageSubject.next(1);
    this.selectedElementIdSubject.next(null);
    this.undoStack = [];
    this.redoStack = [];
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(false);
  }

  // --- Navigation & Zoom ---

  setCurrentPage(pageNumber: number) {
    const doc = this.document;
    if (!doc) return;
    const clamped = Math.max(1, Math.min(pageNumber, doc.pageCount));
    if (clamped !== this.currentPageNumber) {
      this.currentPageSubject.next(clamped);
      this.selectedElementIdSubject.next(null);
    }
  }

  nextPage(): boolean {
    const doc = this.document;
    if (!doc || this.currentPageNumber >= doc.pageCount) return false;
    this.setCurrentPage(this.currentPageNumber + 1);
    return true;
  }

  prevPage(): boolean {
    if (this.currentPageNumber <= 1) return false;
    this.setCurrentPage(this.currentPageNumber - 1);
    return true;
  }

  setZoom(zoom: number) {
    const clamped = Math.max(0.2, Math.min(zoom, 4.0)); // 20% to 400%
    this.zoomSubject.next(Math.round(clamped * 100) / 100);
    this.fitModeSubject.next('custom');
  }

  zoomIn() {
    this.setZoom(this.zoom + 0.2);
  }

  zoomOut() {
    this.setZoom(this.zoom - 0.2);
  }

  setFitMode(mode: 'width' | 'page' | 'custom') {
    this.fitModeSubject.next(mode);
  }

  // --- Tool & Settings ---

  setActiveTool(tool: EditorTool) {
    this.activeToolSubject.next(tool);
    if (tool !== 'select') {
      this.selectedElementIdSubject.next(null);
    }
  }

  updateToolSettings(settings: Partial<ToolSettings>) {
    this.toolSettingsSubject.next({
      ...this.toolSettingsSubject.value,
      ...settings
    });
  }

  setSelectedElementId(id: string | null) {
    this.selectedElementIdSubject.next(id);
    if (id) {
      this.activeToolSubject.next('select');
    }
  }

  // --- Elements (Add, Update, Delete) ---

  addElement(element: Omit<PdfElement, 'id' | 'pageNumber' | 'zIndex'>): PdfElement {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    const newElement: PdfElement = {
      ...element,
      id: generateId(),
      pageNumber: page.pageNumber,
      zIndex: page.elements.length + 1
    } as PdfElement;

    const previousElements = [...page.elements];
    page.elements.push(newElement);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_ELEMENT',
      description: `Add ${newElement.type}`,
      timestamp: Date.now(),
      undo: () => {
        page.elements = [...previousElements];
        this.selectedElementIdSubject.next(null);
        this.notifyDocumentChanged();
      },
      redo: () => {
        page.elements = [...previousElements, newElement];
        this.selectedElementIdSubject.next(newElement.id);
        this.notifyDocumentChanged();
      }
    });

    this.selectedElementIdSubject.next(newElement.id);
    this.notifyDocumentChanged();
    return newElement;
  }

  updateElement(elementId: string, updates: Partial<PdfElement>) {
    const page = this.currentPage;
    if (!page) return;

    const elIndex = page.elements.findIndex(e => e.id === elementId);
    if (elIndex === -1) return;

    const originalElement = { ...page.elements[elIndex] };
    const updatedElement = { ...originalElement, ...updates } as PdfElement;

    page.elements[elIndex] = updatedElement;

    this.executeCommand({
      id: generateId(),
      type: 'UPDATE_ELEMENT',
      description: `Update ${updatedElement.type}`,
      timestamp: Date.now(),
      undo: () => {
        const idx = page.elements.findIndex(e => e.id === elementId);
        if (idx !== -1) page.elements[idx] = originalElement;
        this.notifyDocumentChanged();
      },
      redo: () => {
        const idx = page.elements.findIndex(e => e.id === elementId);
        if (idx !== -1) page.elements[idx] = updatedElement;
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  deleteElement(elementId: string) {
    const page = this.currentPage;
    if (!page) return;

    const elIndex = page.elements.findIndex(e => e.id === elementId);
    if (elIndex === -1) return;

    const removed = page.elements[elIndex];
    page.elements.splice(elIndex, 1);

    this.executeCommand({
      id: generateId(),
      type: 'DELETE_ELEMENT',
      description: `Delete ${removed.type}`,
      timestamp: Date.now(),
      undo: () => {
        page.elements.splice(elIndex, 0, removed);
        this.selectedElementIdSubject.next(removed.id);
        this.notifyDocumentChanged();
      },
      redo: () => {
        const idx = page.elements.findIndex(e => e.id === elementId);
        if (idx !== -1) page.elements.splice(idx, 1);
        this.selectedElementIdSubject.next(null);
        this.notifyDocumentChanged();
      }
    });

    this.selectedElementIdSubject.next(null);
    this.notifyDocumentChanged();
  }

  deleteSelectedElement() {
    const id = this.selectedElementId;
    if (id) this.deleteElement(id);
  }

  // --- Cropping ---

  setPageCrop(pageNumber: number, cropBox: PdfCropBox) {
    const doc = this.document;
    if (!doc) return;
    const page = doc.pages.find(p => p.pageNumber === pageNumber);
    if (!page) return;

    const prevCrop = page.cropBox ? { ...page.cropBox } : undefined;
    page.cropBox = { ...cropBox };

    this.executeCommand({
      id: generateId(),
      type: 'SET_CROP',
      description: `Crop page ${pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        page.cropBox = prevCrop;
        this.notifyDocumentChanged();
      },
      redo: () => {
        page.cropBox = { ...cropBox };
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  setCropAllPages(cropBox: PdfCropBox) {
    const doc = this.document;
    if (!doc) return;

    const prevCrops = doc.pages.map(p => ({ pageNumber: p.pageNumber, crop: p.cropBox ? { ...p.cropBox } : undefined }));

    doc.pages.forEach(p => {
      p.cropBox = { ...cropBox };
    });

    this.executeCommand({
      id: generateId(),
      type: 'SET_CROP',
      description: `Crop all pages`,
      timestamp: Date.now(),
      undo: () => {
        prevCrops.forEach(item => {
          const page = doc.pages.find(p => p.pageNumber === item.pageNumber);
          if (page) page.cropBox = item.crop;
        });
        this.notifyDocumentChanged();
      },
      redo: () => {
        doc.pages.forEach(p => {
          p.cropBox = { ...cropBox };
        });
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  resetCrop(pageNumber?: number) {
    const doc = this.document;
    if (!doc) return;

    if (pageNumber) {
      const page = doc.pages.find(p => p.pageNumber === pageNumber);
      if (!page || !page.cropBox) return;
      const prevCrop = { ...page.cropBox };
      page.cropBox = undefined;

      this.executeCommand({
        id: generateId(),
        type: 'RESET_CROP',
        description: `Reset crop on page ${pageNumber}`,
        timestamp: Date.now(),
        undo: () => {
          page.cropBox = prevCrop;
          this.notifyDocumentChanged();
        },
        redo: () => {
          page.cropBox = undefined;
          this.notifyDocumentChanged();
        }
      });
    } else {
      const prevCrops = doc.pages.map(p => ({ pageNumber: p.pageNumber, crop: p.cropBox ? { ...p.cropBox } : undefined }));
      doc.pages.forEach(p => {
        p.cropBox = undefined;
      });

      this.executeCommand({
        id: generateId(),
        type: 'RESET_CROP',
        description: `Reset crop on all pages`,
        timestamp: Date.now(),
        undo: () => {
          prevCrops.forEach(item => {
            const page = doc.pages.find(p => p.pageNumber === item.pageNumber);
            if (page) page.cropBox = item.crop;
          });
          this.notifyDocumentChanged();
        },
        redo: () => {
          doc.pages.forEach(p => {
            p.cropBox = undefined;
          });
          this.notifyDocumentChanged();
        }
      });
    }

    this.notifyDocumentChanged();
  }

  // --- Watermark ---

  setWatermark(watermark: PdfWatermark | undefined) {
    const doc = this.document;
    if (!doc) return;

    const prevWatermark = doc.watermark ? { ...doc.watermark } : undefined;
    doc.watermark = watermark ? { ...watermark } : undefined;

    this.executeCommand({
      id: generateId(),
      type: 'SET_WATERMARK',
      description: watermark ? 'Apply watermark' : 'Remove watermark',
      timestamp: Date.now(),
      undo: () => {
        const currentDoc = this.document;
        if (currentDoc) {
          currentDoc.watermark = prevWatermark;
          this.documentSubject.next({ ...currentDoc, watermark: prevWatermark });
        }
      },
      redo: () => {
        const currentDoc = this.document;
        if (currentDoc) {
          currentDoc.watermark = watermark ? { ...watermark } : undefined;
          this.documentSubject.next({ ...currentDoc, watermark: currentDoc.watermark });
        }
      }
    });

    this.documentSubject.next({ ...doc, watermark: doc.watermark });
  }

  // --- Page Numbering ---

  setPageNumbering(config: PdfPageNumberingConfig | undefined) {
    const doc = this.document;
    if (!doc) return;

    const prevConfig = doc.pageNumbering ? { ...doc.pageNumbering } : undefined;
    doc.pageNumbering = config ? { ...config } : undefined;

    this.executeCommand({
      id: generateId(),
      type: 'SET_PAGE_NUMBERING',
      description: config ? 'Set page numbers' : 'Remove page numbers',
      timestamp: Date.now(),
      undo: () => {
        const currentDoc = this.document;
        if (currentDoc) {
          currentDoc.pageNumbering = prevConfig;
          this.documentSubject.next({ ...currentDoc, pageNumbering: prevConfig });
        }
      },
      redo: () => {
        const currentDoc = this.document;
        if (currentDoc) {
          currentDoc.pageNumbering = config ? { ...config } : undefined;
          this.documentSubject.next({ ...currentDoc, pageNumbering: currentDoc.pageNumbering });
        }
      }
    });

    this.documentSubject.next({ ...doc, pageNumbering: doc.pageNumbering });
  }

  // --- Redactions ---

  addRedaction(redaction: Omit<PdfRedaction, 'id' | 'pageNumber' | 'isApplied'>): PdfRedaction {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    const newRedaction: PdfRedaction = {
      ...redaction,
      id: generateId(),
      pageNumber: page.pageNumber,
      isApplied: false
    };

    page.redactions.push(newRedaction);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_REDACTION',
      description: `Mark area for redaction`,
      timestamp: Date.now(),
      undo: () => {
        const idx = page.redactions.findIndex(r => r.id === newRedaction.id);
        if (idx !== -1) page.redactions.splice(idx, 1);
        this.notifyDocumentChanged();
      },
      redo: () => {
        page.redactions.push(newRedaction);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
    return newRedaction;
  }

  deleteRedaction(redactionId: string) {
    const page = this.currentPage;
    if (!page) return;

    const idx = page.redactions.findIndex(r => r.id === redactionId);
    if (idx === -1) return;

    const removed = page.redactions[idx];
    page.redactions.splice(idx, 1);

    this.executeCommand({
      id: generateId(),
      type: 'DELETE_REDACTION',
      description: `Remove redaction mark`,
      timestamp: Date.now(),
      undo: () => {
        page.redactions.splice(idx, 0, removed);
        this.notifyDocumentChanged();
      },
      redo: () => {
        const i = page.redactions.findIndex(r => r.id === redactionId);
        if (i !== -1) page.redactions.splice(i, 1);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  applyAllRedactions() {
    const doc = this.document;
    if (!doc) return;

    const unappliedList: { pageNumber: number; id: string }[] = [];
    doc.pages.forEach(p => {
      p.redactions.forEach(r => {
        if (!r.isApplied) {
          unappliedList.push({ pageNumber: p.pageNumber, id: r.id });
          r.isApplied = true;
        }
      });
    });

    if (unappliedList.length === 0) return;

    this.executeCommand({
      id: generateId(),
      type: 'APPLY_REDACTION',
      description: `Apply ${unappliedList.length} redactions`,
      timestamp: Date.now(),
      undo: () => {
        unappliedList.forEach(item => {
          const page = doc.pages.find(p => p.pageNumber === item.pageNumber);
          const r = page?.redactions.find(red => red.id === item.id);
          if (r) r.isApplied = false;
        });
        this.notifyDocumentChanged();
      },
      redo: () => {
        unappliedList.forEach(item => {
          const page = doc.pages.find(p => p.pageNumber === item.pageNumber);
          const r = page?.redactions.find(red => red.id === item.id);
          if (r) r.isApplied = true;
        });
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  setRedactionPreview(preview: boolean) {
    this.redactionPreviewSubject.next(preview);
  }

  /**
   * Replaces the document's own bytes with a rewritten file.
   *
   * Some Part K tools do not add an overlay — they change what is in the
   * file. A find & replace writes new form field values and redraws page
   * text; a link delete strips an annotation; a picture replace repoints an
   * XObject. None of that can live in the overlay model, so the editor's
   * source has to be swapped, and everything reading from it told.
   *
   * It is undoable like any other edit: the previous bytes are kept in the
   * command's closure. The page *models* are deliberately left alone —
   * these rewrites never change the page count or page sizes, and rebuilding
   * the models would throw away the annotations, links and comments the user
   * has placed on top.
   */
  async replaceSourceBytes(bytes: Uint8Array, description: string): Promise<void> {
    const doc = this.document;
    if (!doc) return;

    const previous = doc.arrayBuffer;
    const next = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    const apply = async (buffer: ArrayBuffer) => {
      const current = this.document;
      if (!current) return;

      current.arrayBuffer = buffer;
      current.sizeBytes = buffer.byteLength;

      /*
       * A page count that changed would leave the page models describing a
       * document that is no longer there. No K tool does that, but checking
       * costs nothing and the alternative is a blank canvas with no clue why.
       */
      try {
        const probe = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
        current.pageCount = probe.getPageCount();
      } catch {
        /* Leave the count as it was; whoever renders next will surface a
         * real problem with the bytes. */
      }

      this.notifyDocumentChanged();
      /* Last, so anything reloading off this already sees the new buffer. */
      this.sourceRevisionSubject.next(this.sourceRevisionSubject.value + 1);
    };

    await apply(next);

    this.executeCommand({
      id: generateId(),
      type: 'REPLACE_SOURCE',
      description,
      timestamp: Date.now(),
      undo: () => {
        void apply(previous);
      },
      redo: () => {
        void apply(next);
      }
    });
  }

  // --- Undo / Redo Command Execution ---

  private executeCommand(cmd: EditorCommand) {
    if (cmd.type === 'REPLACE_SOURCE') {
      // Memory hardening: Limit heavy whole-file ArrayBuffer closures to avoid heap exhaustion
      const replaceSourceCmds = this.undoStack.filter(c => c.type === 'REPLACE_SOURCE');
      if (replaceSourceCmds.length >= 10) {
        const oldestIdx = this.undoStack.findIndex(c => c.type === 'REPLACE_SOURCE');
        if (oldestIdx !== -1) {
          this.undoStack.splice(oldestIdx, 1);
        }
      }
    }
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(true);
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const cmd = this.undoStack.pop()!;
    cmd.undo();
    this.redoStack.push(cmd);
    if (this.redoStack.length > this.MAX_HISTORY) {
      this.redoStack.shift();
    }
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(true);
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const cmd = this.redoStack.pop()!;
    cmd.redo();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(true);
    return true;
  }

  private updateUndoRedoSubjects() {
    this.canUndoSubject.next(this.undoStack.length > 0);
    this.canRedoSubject.next(this.redoStack.length > 0);
  }

  // --- Export State ---

  setExporting(isExporting: boolean, progress = 0) {
    this.isExportingSubject.next(isExporting);
    this.exportProgressSubject.next(progress);
  }

  // ════════════════════════════════════════════════════════════════════
  // Placement drafts
  // ════════════════════════════════════════════════════════════════════
  /*
   * Four of the Part K tools need a place on the page before they can do
   * anything: a link needs a rectangle to be tappable, a comment needs a
   * spot for its pin, a whiteout needs an area, a measurement needs its
   * points. Asking for coordinates in a form is not how anyone wants to
   * place a box on a phone.
   *
   * So the sheet collects everything EXCEPT the geometry, parks it here as a
   * draft, and closes. The canvas picks the draft up, lets the user draw or
   * tap, and completes it. `placementCompleted$` then tells the editor page
   * what landed, so it can confirm it and offer the sheet again.
   */

  private linkDraftSubject = new BehaviorSubject<LinkDraft | null>(null);
  public linkDraft$ = this.linkDraftSubject.asObservable();

  private commentDraftSubject = new BehaviorSubject<CommentDraft | null>(null);
  public commentDraft$ = this.commentDraftSubject.asObservable();

  private whiteoutDraftSubject = new BehaviorSubject<WhiteoutDraft | null>(null);
  public whiteoutDraft$ = this.whiteoutDraftSubject.asObservable();

  private measureDraftSubject = new BehaviorSubject<MeasureDraft | null>(null);
  public measureDraft$ = this.measureDraftSubject.asObservable();

  private placementCompletedSubject = new Subject<PlacementCompleted>();
  public placementCompleted$ = this.placementCompletedSubject.asObservable();

  /** K5's pen snapping, which the freehand draw tool reads. */
  private shapeSnapSubject = new BehaviorSubject<boolean>(false);
  public shapeSnap$ = this.shapeSnapSubject.asObservable();

  get linkDraft(): LinkDraft | null {
    return this.linkDraftSubject.value;
  }

  get commentDraft(): CommentDraft | null {
    return this.commentDraftSubject.value;
  }

  get whiteoutDraft(): WhiteoutDraft | null {
    return this.whiteoutDraftSubject.value;
  }

  get measureDraft(): MeasureDraft | null {
    return this.measureDraftSubject.value;
  }

  get shapeSnapEnabled(): boolean {
    return this.shapeSnapSubject.value;
  }

  setShapeSnapEnabled(enabled: boolean): void {
    this.shapeSnapSubject.next(enabled);
  }

  /** Arms one of the placement tools, clearing any other draft first. */
  startPlacement(
    tool: 'link' | 'comment' | 'whiteout' | 'measure',
    draft: LinkDraft | CommentDraft | WhiteoutDraft | MeasureDraft
  ): void {
    this.clearPlacement();

    switch (tool) {
      case 'link':
        this.linkDraftSubject.next(draft as LinkDraft);
        break;
      case 'comment':
        this.commentDraftSubject.next(draft as CommentDraft);
        break;
      case 'whiteout':
        this.whiteoutDraftSubject.next(draft as WhiteoutDraft);
        break;
      case 'measure':
        this.measureDraftSubject.next(draft as MeasureDraft);
        break;
    }

    this.setSelectedElementId(null);
    this.activeToolSubject.next(tool);
  }

  /** Drops every draft and returns to the select tool. */
  clearPlacement(): void {
    if (this.linkDraftSubject.value) this.linkDraftSubject.next(null);
    if (this.commentDraftSubject.value) this.commentDraftSubject.next(null);
    if (this.whiteoutDraftSubject.value) this.whiteoutDraftSubject.next(null);
    if (this.measureDraftSubject.value) this.measureDraftSubject.next(null);
  }

  /** Called by the canvas once something has been placed. */
  completePlacement(event: PlacementCompleted): void {
    this.clearPlacement();
    this.activeToolSubject.next('select');
    this.placementCompletedSubject.next(event);
  }

  // --- K2: Hyperlinks ---

  addLink(link: Omit<PdfHyperlink, 'id'>): PdfHyperlink {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    if (!page.links) page.links = [];

    const newLink: PdfHyperlink = {
      ...link,
      id: generateId()
    };

    page.links.push(newLink);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_LINK',
      description: `Add link on page ${page.pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        if (page.links) {
          const idx = page.links.findIndex(l => l.id === newLink.id);
          if (idx !== -1) page.links.splice(idx, 1);
        }
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (!page.links) page.links = [];
        page.links.push(newLink);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
    return newLink;
  }

  deleteLink(linkId: string) {
    const page = this.currentPage;
    if (!page || !page.links) return;

    const idx = page.links.findIndex(l => l.id === linkId);
    if (idx === -1) return;

    const removed = page.links[idx];
    page.links.splice(idx, 1);

    this.executeCommand({
      id: generateId(),
      type: 'DELETE_LINK',
      description: `Delete link`,
      timestamp: Date.now(),
      undo: () => {
        if (!page.links) page.links = [];
        page.links.splice(idx, 0, removed);
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (page.links) {
          const i = page.links.findIndex(l => l.id === linkId);
          if (i !== -1) page.links.splice(i, 1);
        }
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  // --- K3: Comments & Reviews ---

  addCommentThread(thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies' | 'resolved'>): CommentThread {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    if (!page.comments) page.comments = [];

    const newThread: CommentThread = {
      ...thread,
      id: generateId(),
      createdAt: Date.now(),
      resolved: false,
      replies: []
    };

    page.comments.push(newThread);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_COMMENT',
      description: `Add comment thread on page ${page.pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        if (page.comments) {
          const idx = page.comments.findIndex(c => c.id === newThread.id);
          if (idx !== -1) page.comments.splice(idx, 1);
        }
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (!page.comments) page.comments = [];
        page.comments.push(newThread);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
    return newThread;
  }

  addCommentReply(threadId: string, reply: Omit<CommentReply, 'id' | 'createdAt'>): CommentReply | null {
    const doc = this.document;
    if (!doc) return null;

    let targetThread: CommentThread | undefined;
    for (const p of doc.pages) {
      if (p.comments) {
        targetThread = p.comments.find(c => c.id === threadId);
        if (targetThread) break;
      }
    }

    if (!targetThread) return null;

    const newReply: CommentReply = {
      ...reply,
      id: generateId(),
      createdAt: Date.now()
    };

    targetThread.replies.push(newReply);
    this.notifyDocumentChanged();
    return newReply;
  }

  resolveCommentThread(threadId: string, resolved: boolean) {
    const doc = this.document;
    if (!doc) return;

    for (const p of doc.pages) {
      if (p.comments) {
        const thread = p.comments.find(c => c.id === threadId);
        if (thread) {
          thread.resolved = resolved;
          this.executeCommand({
            id: generateId(),
            type: 'RESOLVE_COMMENT',
            description: `${resolved ? 'Resolve' : 'Reopen'} comment thread`,
            timestamp: Date.now(),
            undo: () => {
              thread.resolved = !resolved;
              this.notifyDocumentChanged();
            },
            redo: () => {
              thread.resolved = resolved;
              this.notifyDocumentChanged();
            }
          });
          this.notifyDocumentChanged();
          return;
        }
      }
    }
  }

  deleteCommentThread(threadId: string) {
    const doc = this.document;
    if (!doc) return;

    for (const page of doc.pages) {
      if (!page.comments) continue;
      const idx = page.comments.findIndex(c => c.id === threadId);
      if (idx !== -1) {
        const removed = page.comments[idx];
        page.comments.splice(idx, 1);

        this.executeCommand({
          id: generateId(),
          type: 'DELETE_COMMENT',
          description: `Delete comment thread`,
          timestamp: Date.now(),
          undo: () => {
            if (!page.comments) page.comments = [];
            page.comments.splice(idx, 0, removed);
            this.notifyDocumentChanged();
          },
          redo: () => {
            if (page.comments) {
              const i = page.comments.findIndex(c => c.id === threadId);
              if (i !== -1) page.comments.splice(i, 1);
            }
            this.notifyDocumentChanged();
          }
        });

        this.notifyDocumentChanged();
        return;
      }
    }
  }

  // --- K4: Whiteout ---

  addWhiteout(region: Omit<WhiteoutRegion, 'id'>): WhiteoutRegion {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    if (!page.whiteouts) page.whiteouts = [];

    const newWhiteout: WhiteoutRegion = {
      ...region,
      id: generateId()
    };

    page.whiteouts.push(newWhiteout);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_WHITEOUT',
      description: `Add whiteout on page ${page.pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        if (page.whiteouts) {
          const idx = page.whiteouts.findIndex(w => w.id === newWhiteout.id);
          if (idx !== -1) page.whiteouts.splice(idx, 1);
        }
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (!page.whiteouts) page.whiteouts = [];
        page.whiteouts.push(newWhiteout);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
    return newWhiteout;
  }

  deleteWhiteout(whiteoutId: string) {
    const page = this.currentPage;
    if (!page || !page.whiteouts) return;

    const idx = page.whiteouts.findIndex(w => w.id === whiteoutId);
    if (idx === -1) return;

    const removed = page.whiteouts[idx];
    page.whiteouts.splice(idx, 1);

    this.executeCommand({
      id: generateId(),
      type: 'DELETE_WHITEOUT',
      description: `Delete whiteout`,
      timestamp: Date.now(),
      undo: () => {
        if (!page.whiteouts) page.whiteouts = [];
        page.whiteouts.splice(idx, 0, removed);
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (page.whiteouts) {
          const i = page.whiteouts.findIndex(w => w.id === whiteoutId);
          if (i !== -1) page.whiteouts.splice(i, 1);
        }
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  // --- K5: Measurements ---

  addMeasurement(measurement: Omit<MeasurementResult, 'id'>): MeasurementResult {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    if (!page.measurements) page.measurements = [];

    const newMeasurement: MeasurementResult = {
      ...measurement,
      id: generateId()
    };

    page.measurements.push(newMeasurement);

    this.executeCommand({
      id: generateId(),
      type: 'ADD_MEASUREMENT',
      description: `Add ${measurement.type} measurement on page ${page.pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        if (page.measurements) {
          const idx = page.measurements.findIndex(m => m.id === newMeasurement.id);
          if (idx !== -1) page.measurements.splice(idx, 1);
        }
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (!page.measurements) page.measurements = [];
        page.measurements.push(newMeasurement);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
    return newMeasurement;
  }

  deleteMeasurement(measurementId: string) {
    const page = this.currentPage;
    if (!page || !page.measurements) return;

    const idx = page.measurements.findIndex(m => m.id === measurementId);
    if (idx === -1) return;

    const removed = page.measurements[idx];
    page.measurements.splice(idx, 1);

    this.executeCommand({
      id: generateId(),
      type: 'DELETE_MEASUREMENT',
      description: `Delete measurement`,
      timestamp: Date.now(),
      undo: () => {
        if (!page.measurements) page.measurements = [];
        page.measurements.splice(idx, 0, removed);
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (page.measurements) {
          const i = page.measurements.findIndex(m => m.id === measurementId);
          if (i !== -1) page.measurements.splice(i, 1);
        }
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  // --- K6: Text Edits ---

  addTextEdit(edit: TextEditCommand) {
    const page = this.currentPage;
    if (!page) throw new Error('No active page');

    if (!page.textEdits) page.textEdits = [];

    page.textEdits.push(edit);

    this.executeCommand({
      id: generateId(),
      type: 'EDIT_EXISTING_TEXT',
      description: `Edit text on page ${page.pageNumber}`,
      timestamp: Date.now(),
      undo: () => {
        if (page.textEdits) {
          const idx = page.textEdits.findIndex(e => e.runId === edit.runId);
          if (idx !== -1) page.textEdits.splice(idx, 1);
        }
        this.notifyDocumentChanged();
      },
      redo: () => {
        if (!page.textEdits) page.textEdits = [];
        page.textEdits.push(edit);
        this.notifyDocumentChanged();
      }
    });

    this.notifyDocumentChanged();
  }

  private notifyDocumentChanged() {
    const doc = this.document;
    if (doc) {
      this.documentSubject.next({ ...doc });
    }
  }
}
