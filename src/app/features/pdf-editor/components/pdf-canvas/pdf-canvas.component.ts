import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  MeasureDraft,
  PdfEditorStateService
} from '../../../../core/services/pdf-editor-state.service';
import { PdfRenderService } from '../../../../core/services/pdf-render.service';
import { PdfImageToolsService } from '../../../../core/services/pdf-image-tools.service';
import { PdfShapeMeasurementService } from '../../../../core/services/pdf-shape-measurement.service';
import {
  PdfElement,
  PdfTextElement,
  PdfImageElement,
  PdfShapeElement,
  PdfDrawingElement,
  PdfAnnotationElement,
  PdfRedaction,
  Point,
  Rect
} from '../../../../core/models/pdf-editor.types';
import { CommentThread } from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-canvas',
  templateUrl: './pdf-canvas.component.html',
  styleUrls: ['./pdf-canvas.component.scss'],
  standalone: true,
  imports: [
    AppIconComponent, TranslatePipe, CommonModule, FormsModule]
})
export class PdfCanvasComponent implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  private renderService = inject(PdfRenderService);
  private imageTools = inject(PdfImageToolsService);
  private shapes = inject(PdfShapeMeasurementService);

  @ViewChild('pdfCanvas', { static: true }) pdfCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayContainer', { static: true }) overlayRef!: ElementRef<HTMLDivElement>;

  // Dimensions & Scale
  pageWidth = 595;
  pageHeight = 842;
  renderScale = 1.0;
  isLoadingPage = false;

  // Active Drawing / Drag Creation State
  isDrawing = false;
  currentDrawPoints: Point[] = [];

  // Shape / Annotation / Redaction drag creation
  isDraggingNewElement = false;
  dragStartPoint: Point | null = null;
  currentDragRect: Rect | null = null;

  // Selected Element Transformation (Move, Resize, Rotate)
  isMoving = false;
  isResizing = false;
  isRotating = false;
  resizeHandle: string | null = null;
  dragStartMouse: Point = { x: 0, y: 0 };
  dragStartElementRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  dragStartAngle = 0;

  // Text Editing inline
  editingElementId: string | null = null;

  /*
   * K5 — the points of the measurement being taken. A distance is a drag,
   * so it fills with two points; an area is a series of taps, so it grows
   * until Finish.
   */
  measurePoints: Point[] = [];

  @Output() commentOpened = new EventEmitter<CommentThread>();

  private subs = new Subscription();

  ngOnInit() {
    this.subs.add(
      this.state.document$.subscribe(() => {
        this.renderCurrentPage();
      })
    );

    this.subs.add(
      this.state.currentPage$.subscribe(() => {
        this.renderCurrentPage();
      })
    );

    this.subs.add(
      this.state.zoom$.subscribe(zoom => {
        this.renderScale = zoom;
        this.renderCurrentPage();
      })
    );

    /*
     * A Part K tool that rewrites the file bumps this. The render service
     * caches the loaded document by id and hands back the one it already
     * has when the id is unchanged, so the new bytes have to arrive under a
     * new id or the canvas keeps painting the pages from before the edit.
     */
    this.subs.add(
      this.state.sourceRevision$.subscribe(revision => {
        if (revision === 0) return;
        void this.reloadSource(revision);
      })
    );
  }

  private async reloadSource(revision: number): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    try {
      await this.renderService.loadPdf(doc.arrayBuffer, `${doc.id}_r${revision}`);
      await this.renderCurrentPage();
    } catch (error) {
      console.error('Reloading the rewritten document failed', error);
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  async renderCurrentPage() {
    const doc = this.state.document;
    const pageNum = this.state.currentPageNumber;
    if (!doc || !this.pdfCanvasRef) return;

    this.isLoadingPage = true;
    try {
      const pageModel = this.state.currentPage;
      if (pageModel) {
        this.pageWidth = pageModel.originalWidth;
        this.pageHeight = pageModel.originalHeight;
      }

      await this.renderService.renderPageToCanvas(
        pageNum,
        this.pdfCanvasRef.nativeElement,
        this.renderScale,
        pageModel?.rotation || 0
      );
    } catch (e) {
      console.error('Error rendering PDF page', e);
    } finally {
      this.isLoadingPage = false;
    }
  }

  // --- Coordinate Transformations ---

  /**
   * Converts client mouse/touch coordinates to unscaled PDF points (independent of zoom).
   */
  private clientToPdfPoint(clientX: number, clientY: number): Point {
    const rect = this.overlayRef.nativeElement.getBoundingClientRect();
    const x = (clientX - rect.left) / this.renderScale;
    const y = (clientY - rect.top) / this.renderScale;
    return {
      x: Math.max(0, Math.min(x, this.pageWidth)),
      y: Math.max(0, Math.min(y, this.pageHeight))
    };
  }

  // --- Canvas Mouse / Touch Interaction Handlers ---

  onPointerDown(e: MouseEvent | TouchEvent) {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const point = this.clientToPdfPoint(clientX, clientY);
    const tool = this.state.activeTool;

    // If clicking directly on an element or handle, let their specific handler take precedence
    const target = e.target as HTMLElement;
    if (target.closest('.interactive-element') || target.closest('.transform-handle')) {
      return;
    }

    // Deselect if clicking on empty canvas in select mode
    if (tool === 'select') {
      this.state.setSelectedElementId(null);
      this.editingElementId = null;
      return;
    }

    if (tool === 'draw') {
      this.isDrawing = true;
      this.currentDrawPoints = [point];
      e.preventDefault();
      return;
    }

    if (
      tool === 'rectangle' ||
      tool === 'circle' ||
      tool === 'line' ||
      tool === 'arrow' ||
      tool === 'highlight' ||
      tool === 'underline' ||
      tool === 'strikethrough' ||
      tool === 'redact'
    ) {
      this.isDraggingNewElement = true;
      this.dragStartPoint = point;
      this.currentDragRect = { x: point.x, y: point.y, width: 0, height: 0 };
      e.preventDefault();
      return;
    }

    if (tool === 'text') {
      // Create new text element at click point
      const newText = this.state.addElement({
        type: 'text',
        x: point.x,
        y: point.y,
        width: 150,
        height: 36,
        rotation: 0,
        opacity: 1.0,
        text: 'Type text here',
        fontSize: this.state.toolSettings.fontSize,
        fontFamily: this.state.toolSettings.fontFamily,
        color: this.state.toolSettings.color,
        bold: false,
        italic: false,
        underline: false
      } as PdfTextElement);
      this.editingElementId = newText.id;
      this.state.setActiveTool('select');
      return;
    }

    if (tool === 'note') {
      // Create note annotation at click point
      this.state.addElement({
        type: 'annotation',
        annotationType: 'note',
        x: point.x,
        y: point.y,
        width: 28,
        height: 28,
        rotation: 0,
        opacity: 0.9,
        color: '#FFD700',
        text: 'Enter note details...',
        createdAt: Date.now()
      } as PdfAnnotationElement);
      this.state.setActiveTool('select');
      return;
    }

    /*
     * The Part K placement tools. A link and a whiteout are areas, so they
     * drag out a rectangle the same way a shape does. A comment is a point.
     * A measurement is either, depending on its mode.
     */
    if (tool === 'link' || tool === 'whiteout') {
      this.isDraggingNewElement = true;
      this.dragStartPoint = point;
      this.currentDragRect = { x: point.x, y: point.y, width: 0, height: 0 };
      e.preventDefault();
      return;
    }

    if (tool === 'comment') {
      this.placeCommentAt(point);
      return;
    }

    if (tool === 'measure') {
      const draft = this.state.measureDraft;
      if (!draft) return;

      if (draft.mode === 'area') {
        /* Each tap adds a corner; Finish closes the polygon. */
        this.measurePoints = [...this.measurePoints, point];
        e.preventDefault();
        return;
      }

      /* Distance and calibration are both a drag between two points. */
      this.isDraggingNewElement = true;
      this.dragStartPoint = point;
      this.measurePoints = [point, point];
      e.preventDefault();
      return;
    }
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const point = this.clientToPdfPoint(clientX, clientY);

    if (this.isDrawing) {
      this.currentDrawPoints.push(point);
      return;
    }

    if (this.isDraggingNewElement && this.dragStartPoint) {
      /* A measurement drag is a line, not a box: it keeps the direction the
       * finger moved, which a normalised rectangle would throw away. */
      if (this.state.activeTool === 'measure') {
        this.measurePoints = [this.dragStartPoint, point];
        return;
      }

      const minX = Math.min(this.dragStartPoint.x, point.x);
      const minY = Math.min(this.dragStartPoint.y, point.y);
      const width = Math.abs(point.x - this.dragStartPoint.x);
      const height = Math.abs(point.y - this.dragStartPoint.y);
      this.currentDragRect = { x: minX, y: minY, width, height };
      return;
    }

    if (this.isMoving && this.state.selectedElement) {
      const deltaX = (clientX - this.dragStartMouse.x) / this.renderScale;
      const deltaY = (clientY - this.dragStartMouse.y) / this.renderScale;
      this.state.selectedElement.x = Math.round(this.dragStartElementRect.x + deltaX);
      this.state.selectedElement.y = Math.round(this.dragStartElementRect.y + deltaY);
      return;
    }

    if (this.isResizing && this.state.selectedElement && this.resizeHandle) {
      this.handleResizeMove(clientX, clientY);
      return;
    }

    if (this.isRotating && this.state.selectedElement) {
      const el = this.state.selectedElement;
      const centerX = (el.x + el.width / 2) * this.renderScale;
      const centerY = (el.y + el.height / 2) * this.renderScale;
      const rect = this.overlayRef.nativeElement.getBoundingClientRect();
      const angleRad = Math.atan2(
        clientY - (rect.top + centerY),
        clientX - (rect.left + centerX)
      );
      const degrees = Math.round(angleRad * (180 / Math.PI) + 90);
      el.rotation = (degrees + 360) % 360;
      return;
    }
  }

  onPointerUp() {
    if (this.isDrawing && this.currentDrawPoints.length >= 2) {
      this.commitDrawnStroke();
    }
    this.isDrawing = false;
    this.currentDrawPoints = [];

    /* A measurement drag finishes here. */
    if (this.isDraggingNewElement && this.state.activeTool === 'measure') {
      this.finishMeasurementDrag();
      this.isDraggingNewElement = false;
      this.dragStartPoint = null;
      return;
    }

    if (this.isDraggingNewElement && this.currentDragRect) {
      const { x, y, width, height } = this.currentDragRect;
      const tool = this.state.activeTool;

      if (width > 5 || height > 5) {
        if (tool === 'rectangle' || tool === 'circle' || tool === 'line' || tool === 'arrow') {
          this.state.addElement({
            type: 'shape',
            shapeType: tool,
            x,
            y,
            width,
            height,
            rotation: 0,
            opacity: 1.0,
            strokeColor: this.state.toolSettings.color,
            strokeWidth: this.state.toolSettings.strokeWidth,
            fillColor: this.state.toolSettings.fillColor,
            strokeStyle: 'solid'
          } as PdfShapeElement);
          this.state.setActiveTool('select');
        } else if (tool === 'highlight' || tool === 'underline' || tool === 'strikethrough') {
          this.state.addElement({
            type: 'annotation',
            annotationType: tool,
            x,
            y,
            width,
            height: tool === 'underline' || tool === 'strikethrough' ? 4 : height,
            rotation: 0,
            opacity: tool === 'highlight' ? 0.35 : 1.0,
            color: this.state.toolSettings.color,
            strokeWidth: this.state.toolSettings.strokeWidth,
            createdAt: Date.now()
          } as PdfAnnotationElement);
          this.state.setActiveTool('select');
        } else if (tool === 'redact') {
          this.state.addRedaction({
            x,
            y,
            width,
            height,
            overlayColor: '#000000',
            label: 'CONFIDENTIAL'
          });
          this.state.setActiveTool('select');
        } else if (tool === 'link') {
          this.completeLinkPlacement({ x, y, width, height });
        } else if (tool === 'whiteout') {
          this.completeWhiteoutPlacement({ x, y, width, height });
        }
      }
    }
    this.isDraggingNewElement = false;
    this.dragStartPoint = null;
    this.currentDragRect = null;

    if (this.isMoving || this.isResizing || this.isRotating) {
      if (this.state.selectedElement) {
        this.state.updateElement(this.state.selectedElement.id, {
          x: this.state.selectedElement.x,
          y: this.state.selectedElement.y,
          width: this.state.selectedElement.width,
          height: this.state.selectedElement.height,
          rotation: this.state.selectedElement.rotation
        });
      }
    }
    this.isMoving = false;
    this.isResizing = false;
    this.isRotating = false;
    this.resizeHandle = null;
  }

  // --- Element Selection & Transform Starts ---

  selectElement(e: MouseEvent | TouchEvent, element: PdfElement) {
    e.stopPropagation();
    this.state.setSelectedElementId(element.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    this.isMoving = true;
    this.dragStartMouse = { x: clientX, y: clientY };
    this.dragStartElementRect = {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    };
  }

  startResize(e: MouseEvent | TouchEvent, handle: string) {
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const el = this.state.selectedElement;
    if (!el) return;

    this.isResizing = true;
    this.resizeHandle = handle;
    this.dragStartMouse = { x: clientX, y: clientY };
    this.dragStartElementRect = {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height
    };
  }

  startRotate(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    this.isRotating = true;
  }

  private handleResizeMove(clientX: number, clientY: number) {
    const el = this.state.selectedElement;
    if (!el || !this.resizeHandle) return;

    const deltaX = (clientX - this.dragStartMouse.x) / this.renderScale;
    const deltaY = (clientY - this.dragStartMouse.y) / this.renderScale;
    const orig = this.dragStartElementRect;

    let newX = orig.x;
    let newY = orig.y;
    let newW = orig.width;
    let newH = orig.height;

    if (this.resizeHandle.includes('e')) newW = Math.max(15, orig.width + deltaX);
    if (this.resizeHandle.includes('s')) newH = Math.max(15, orig.height + deltaY);
    if (this.resizeHandle.includes('w')) {
      const allowedDelta = Math.min(deltaX, orig.width - 15);
      newX = orig.x + allowedDelta;
      newW = orig.width - allowedDelta;
    }
    if (this.resizeHandle.includes('n')) {
      const allowedDelta = Math.min(deltaY, orig.height - 15);
      newY = orig.y + allowedDelta;
      newH = orig.height - allowedDelta;
    }

    el.x = Math.round(newX);
    el.y = Math.round(newY);
    el.width = Math.round(newW);
    el.height = Math.round(newH);
  }

  // --- Inline Text Editing ---

  onTextDoubleClick(element: PdfTextElement) {
    this.editingElementId = element.id;
  }

  onTextBlur(element: PdfTextElement, newText: string) {
    this.editingElementId = null;
    this.state.updateElement(element.id, { text: newText });
  }

  // ════════════════════════════════════════════════════════════════════
  // Part K — completing a placement
  // ════════════════════════════════════════════════════════════════════

  /** The hint shown along the bottom while a placement tool is armed. */
  get placementHintKey(): string | null {
    switch (this.state.activeTool) {
      case 'link':
        return 'editor.lnPlaceHint';
      case 'whiteout':
        return 'editor.woPlaceHint';
      case 'comment':
        return 'editor.cmPlaceHint';
      case 'measure':
        return this.state.measureDraft?.mode === 'area'
          ? 'editor.msTapHintArea'
          : 'editor.msTapHintDistance';
      default:
        return null;
    }
  }

  get measureDraft(): MeasureDraft | null {
    return this.state.measureDraft;
  }

  cancelPlacement(): void {
    this.measurePoints = [];
    this.state.clearPlacement();
    this.state.setActiveTool('select');
  }

  /** `x,y x,y …`, the attribute form an SVG polygon wants. */
  polygonPoints(points: Point[]): string {
    return (points || []).map(point => `${point.x},${point.y}`).join(' ');
  }

  openThread(event: Event, thread: CommentThread): void {
    event.stopPropagation();
    this.commentOpened.emit(thread);
  }

  private completeLinkPlacement(rect: Rect): void {
    const draft = this.state.linkDraft;
    if (!draft) {
      this.cancelPlacement();
      return;
    }

    /* A tap rather than a drag would make a zero-area link, which nothing
     * can click. A readable minimum is better than an invisible link. */
    const sized: Rect = {
      x: rect.x,
      y: rect.y,
      width: Math.max(24, rect.width),
      height: Math.max(16, rect.height)
    };

    const link = this.state.addLink({
      pageNumber: this.state.currentPageNumber,
      rect: sized,
      type: draft.type,
      url: draft.url,
      targetPage: draft.targetPage,
      label: draft.label,
      origin: 'added'
    });

    this.state.completePlacement({ tool: 'link', link });
  }

  private completeWhiteoutPlacement(rect: Rect): void {
    const draft = this.state.whiteoutDraft;
    if (!draft) {
      this.cancelPlacement();
      return;
    }

    /*
     * Sampling happens here and nowhere else, because this component is the
     * only place that holds the rendered page canvas. The rectangle is in
     * PDF points and the canvas is in device pixels, so it is scaled by the
     * ratio between them before any pixel is read.
     */
    let fillColor = draft.fillColor;
    let sampledFromPage = false;

    if (draft.matchPage) {
      const canvas = this.pdfCanvasRef?.nativeElement;
      const pixelsPerPoint = canvas && this.pageWidth > 0 ? canvas.width / this.pageWidth : 0;

      if (canvas && pixelsPerPoint > 0) {
        const sampled = this.imageTools.sampleBackgroundColor(canvas, {
          x: rect.x * pixelsPerPoint,
          y: rect.y * pixelsPerPoint,
          width: rect.width * pixelsPerPoint,
          height: rect.height * pixelsPerPoint
        });

        if (sampled) {
          fillColor = sampled;
          sampledFromPage = true;
        }
      }
    }

    const region = this.state.addWhiteout({
      pageNumber: this.state.currentPageNumber,
      rect,
      fillColor,
      disclaimerAcknowledged: true,
      colorSampledFromPage: sampledFromPage
    });

    this.state.completePlacement({ tool: 'whiteout', region, sampledFromPage });
  }

  private placeCommentAt(point: Point): void {
    const draft = this.state.commentDraft;
    if (!draft) {
      this.cancelPlacement();
      return;
    }

    const thread = this.state.addCommentThread({
      pageNumber: this.state.currentPageNumber,
      x: point.x,
      y: point.y,
      author: draft.author,
      initials: draft.initials,
      text: draft.text
    });

    this.state.completePlacement({ tool: 'comment', thread });
  }

  /** A distance measurement, or a calibration, from the finished drag. */
  private finishMeasurementDrag(): void {
    const draft = this.state.measureDraft;
    if (!draft || this.measurePoints.length < 2) {
      this.cancelPlacement();
      return;
    }

    const [from, to] = [this.measurePoints[0], this.measurePoints[this.measurePoints.length - 1]];
    const span = Math.hypot(to.x - from.x, to.y - from.y);

    /* A tap measures nothing; treat it as a cancel rather than record a 0. */
    if (span < 4) {
      this.cancelPlacement();
      return;
    }

    if (draft.mode === 'calibrate') {
      const calibratedScale = this.shapes.calibrateFromReference(
        from,
        to,
        draft.knownValue ?? 1,
        draft.scale.worldUnit
      );
      this.measurePoints = [];
      this.state.completePlacement({ tool: 'measure', calibratedScale });
      return;
    }

    const measurement = this.state.addMeasurement(
      this.shapes.measureDistance(from, to, draft.scale, this.state.currentPageNumber)
    );
    this.measurePoints = [];
    this.state.completePlacement({ tool: 'measure', measurement });
  }

  /** Closes an area measurement once its corners are placed. */
  finishAreaMeasurement(): void {
    const draft = this.state.measureDraft;
    if (!draft || this.measurePoints.length < 3) return;

    const measurement = this.state.addMeasurement(
      this.shapes.measureArea(
        [...this.measurePoints],
        draft.scale,
        this.state.currentPageNumber
      )
    );

    this.measurePoints = [];
    this.state.completePlacement({ tool: 'measure', measurement });
  }

  /**
   * Commits a freehand stroke, through K5's snapping when it is switched on.
   *
   * A snapped stroke becomes the shape element it was meant to be; anything
   * the recogniser is unsure about is kept exactly as drawn, which is the
   * behaviour with snapping off and the default.
   */
  private commitDrawnStroke(): void {
    const points = [...this.currentDrawPoints];
    const snap = this.shapes.recognizeStroke(points, this.state.shapeSnapEnabled);

    if (snap.detected && snap.type !== 'raw') {
      const bounds = snap.bounds;

      if (snap.type === 'line' || snap.type === 'arrow') {
        /* A line keeps its direction, so its box is the span it was drawn
         * across rather than the normalised bounding box. */
        this.state.addElement({
          type: 'shape',
          shapeType: snap.type,
          x: Math.min(snap.startPoint.x, snap.endPoint.x),
          y: Math.min(snap.startPoint.y, snap.endPoint.y),
          width: Math.max(1, Math.abs(snap.endPoint.x - snap.startPoint.x)),
          height: Math.max(1, Math.abs(snap.endPoint.y - snap.startPoint.y)),
          rotation: 0,
          opacity: 1.0,
          strokeColor: this.state.toolSettings.color,
          strokeWidth: this.state.toolSettings.strokeWidth,
          strokeStyle: 'solid'
        } as PdfShapeElement);
        return;
      }

      this.state.addElement({
        type: 'shape',
        shapeType: snap.type === 'circle' ? 'circle' : 'rectangle',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        opacity: 1.0,
        strokeColor: this.state.toolSettings.color,
        strokeWidth: this.state.toolSettings.strokeWidth,
        fillColor: this.state.toolSettings.fillColor,
        strokeStyle: 'solid'
      } as PdfShapeElement);
      return;
    }

    this.state.addElement({
      type: 'drawing',
      x: 0,
      y: 0,
      width: this.pageWidth,
      height: this.pageHeight,
      rotation: 0,
      opacity: 1.0,
      points,
      strokeColor: this.state.toolSettings.color,
      strokeWidth: this.state.toolSettings.strokeWidth
    } as PdfDrawingElement);
  }

  // --- SVG Path Generation for Drawings ---

  getSvgPath(points: Point[]): string {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }
}
