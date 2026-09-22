import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
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

  constructor() {}

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

  // --- Undo / Redo Command Execution ---

  private executeCommand(cmd: EditorCommand) {
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
    this.updateUndoRedoSubjects();
    this.isDirtySubject.next(true);
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const cmd = this.redoStack.pop()!;
    cmd.redo();
    this.undoStack.push(cmd);
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

  private notifyDocumentChanged() {
    const doc = this.document;
    if (doc) {
      this.documentSubject.next({ ...doc });
    }
  }
}
