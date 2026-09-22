import { AppIconComponent } from '../../../../shared/components/ui';
import { Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Input,
  Output,
  EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { Subscription } from 'rxjs';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfRenderService } from '../../../../core/services/pdf-render.service';
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

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-canvas',
  templateUrl: './pdf-canvas.component.html',
  styleUrls: ['./pdf-canvas.component.scss'],
  standalone: true,
  imports: [
    AppIconComponent,CommonModule, FormsModule, IonicModule]
})
export class PdfCanvasComponent implements OnInit, OnDestroy {
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

  private subs = new Subscription();

  constructor(
    public state: PdfEditorStateService,
    private renderService: PdfRenderService
  ) {}

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
      this.state.addElement({
        type: 'drawing',
        x: 0,
        y: 0,
        width: this.pageWidth,
        height: this.pageHeight,
        rotation: 0,
        opacity: 1.0,
        points: [...this.currentDrawPoints],
        strokeColor: this.state.toolSettings.color,
        strokeWidth: this.state.toolSettings.strokeWidth
      } as PdfDrawingElement);
    }
    this.isDrawing = false;
    this.currentDrawPoints = [];

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
