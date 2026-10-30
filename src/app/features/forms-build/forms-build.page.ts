import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import * as pdfjsLib from 'pdfjs-dist';

import { PdfFormBuilderService } from '../../core/services/pdf-form-builder.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  FormBuilderField,
  PdfFormFieldType,
  PdfFieldCoordinates
} from '../../core/models/pdf-forms.types';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

export interface FieldToolItem {
  type: PdfFormFieldType;
  labelKey: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-forms-build',
  templateUrl: './forms-build.page.html',
  styleUrls: ['./forms-build.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    TranslatePipe
  ]
})
export class FormsBuildPage implements OnInit, OnDestroy {
  private pdfFormBuilder = inject(PdfFormBuilderService);
  private fileService = inject(FileService);
  private documentBridge = inject(DocumentBridgeService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('pdfCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewportContainer') viewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pageOverlay') overlayRef?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  // Document State
  pdfBytes: ArrayBuffer | null = null;
  fileName = 'document.pdf';
  pdfDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  pageWidth = 595; // PDF points
  pageHeight = 842; // PDF points
  pageRotation = 0; // degrees

  // Canvas Viewport & Zoom
  zoomScale = 1.0;
  readonly minZoom = 1.0;
  readonly maxZoom = 3.0;
  dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1.0) : 1.0;
  renderedWidth = 0;
  renderedHeight = 0;
  isLoading = false;
  isSaving = false;

  // Form Fields
  fields: FormBuilderField[] = [];
  selectedFieldId: string | null = null;

  // Placement Mode
  activeToolType: PdfFormFieldType | null = null;

  // Bottom Sheet Inspector Breakpoint: 0 (closed), 0.45 (half), 0.85 (expanded)
  sheetBreakpoint: 0 | 0.45 | 0.85 = 0;
  virtualKeyboardHeight = 0;

  // Preview Mode (interactive filling)
  isPreviewMode = false;
  previewValues: Record<string, any> = {};

  // Drag & Resize State
  private isDragging = false;
  private isResizing = false;
  private resizeHandle: 'tl' | 'tr' | 'br' | 'bl' | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialFieldCoords: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
  private longPressTimer: any = null;
  private isLongPressDragActive = false;
  private mouseMoveListener?: (e: MouseEvent) => void;
  private mouseUpListener?: (e: MouseEvent) => void;

  // Pinch-to-zoom State
  private initialPinchDist = 0;
  private initialPinchScale = 1.0;

  // Options input for active field
  optionsString = '';

  // Bottom Thumb-Zone Tool Rail items
  readonly availableTools: FieldToolItem[] = [
    { type: 'text', labelKey: 'formsBuild.typeText', icon: 'document-text', defaultWidth: 160, defaultHeight: 32 },
    { type: 'checkbox', labelKey: 'formsBuild.typeCheckbox', icon: 'checkmark-circle', defaultWidth: 28, defaultHeight: 28 },
    { type: 'radio', labelKey: 'formsBuild.typeRadio', icon: 'radio-button-on', defaultWidth: 28, defaultHeight: 28 },
    { type: 'dropdown', labelKey: 'formsBuild.typeDropdown', icon: 'chevron-down-circle', defaultWidth: 160, defaultHeight: 32 },
    { type: 'listbox', labelKey: 'formsBuild.typeList', icon: 'list', defaultWidth: 180, defaultHeight: 64 },
    { type: 'date', labelKey: 'formsBuild.typeDate', icon: 'calendar', defaultWidth: 150, defaultHeight: 32 },
    { type: 'signature', labelKey: 'formsBuild.typeSignature', icon: 'pencil', defaultWidth: 180, defaultHeight: 56 }
  ];

  private visualViewportHandler?: () => void;

  async ngOnInit(): Promise<void> {
    // Setup Visual Viewport listener for virtual keyboard adjustment
    if (typeof window !== 'undefined' && window.visualViewport) {
      this.visualViewportHandler = () => {
        if (!window.visualViewport) return;
        const windowHeight = window.innerHeight;
        const viewportHeight = window.visualViewport.height;
        this.virtualKeyboardHeight = Math.max(0, windowHeight - viewportHeight);
        this.cdr.markForCheck();
      };
      window.visualViewport.addEventListener('resize', this.visualViewportHandler);
      window.visualViewport.addEventListener('scroll', this.visualViewportHandler);
    }

    // Check if document was handed over from DocumentBridge
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      await this.loadPdfFile(bridged.file);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && window.visualViewport && this.visualViewportHandler) {
      window.visualViewport.removeEventListener('resize', this.visualViewportHandler);
      window.visualViewport.removeEventListener('scroll', this.visualViewportHandler);
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    this.cleanupMouseListeners();
  }

  get selectedField(): FormBuilderField | undefined {
    return this.fields.find(f => f.id === this.selectedFieldId);
  }

  get currentPageFields(): FormBuilderField[] {
    return this.fields.filter(
      f => (f.coordinates?.pageNumber ?? 1) === this.currentPage
    );
  }

  // --- Document Loading ---
  async pickPdf(): Promise<void> {
    try {
      const file = await this.fileService.pickPdfFile();
      if (file) {
        await this.loadPdfFile(file);
      } else if (this.fileInputRef) {
        this.fileInputRef.nativeElement.click();
      }
    } catch {
      if (this.fileInputRef) {
        this.fileInputRef.nativeElement.click();
      }
    }
  }

  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.loadPdfFile(input.files[0]);
    }
  }

  async loadPdfFile(file: File): Promise<void> {
    this.isLoading = true;
    this.fileName = file.name;
    this.cdr.markForCheck();

    try {
      const fileBytes = await file.arrayBuffer();
      // Keep a dedicated ArrayBuffer copy on main thread so pdf.js web worker transfer does not detach this.pdfBytes
      this.pdfBytes = fileBytes.slice(0);
      // Load through pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBytes)
      });
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;
      this.fields = [];
      this.selectedFieldId = null;
      this.sheetBreakpoint = 0;

      // Force change detection so @if (pdfBytes) renders the canvas in the DOM
      this.cdr.detectChanges();
      await this.renderPage();
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'Error Opening PDF',
        message: err.message || 'Could not parse PDF file.',
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  // --- PDF Page Rendering ---
  async renderPage(): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef) return;

    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      this.pageRotation = page.rotate || 0;

      // Base unscaled viewport to get page point geometry
      const baseVp = page.getViewport({ scale: 1.0, rotation: this.pageRotation });
      this.pageWidth = page.view ? page.view[2] - page.view[0] : baseVp.width;
      this.pageHeight = page.view ? page.view[3] - page.view[1] : baseVp.height;

      // Render scaled viewport
      const viewport = page.getViewport({
        scale: this.zoomScale,
        rotation: this.pageRotation
      });

      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      this.dpr = dpr;
      this.renderedWidth = viewport.width;
      this.renderedHeight = viewport.height;

      // HTML5 canvas backing resolution
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderContext = {
        canvasContext: ctx,
        viewport
      };

      await page.render(renderContext).promise;
      ctx.restore();

      // Update CSS positions of existing fields for current zoom & rotation
      this.updateAllFieldsCanvasCoordinates();
    } catch (err) {
      console.warn('Canvas render issue:', err);
    } finally {
      this.cdr.markForCheck();
    }
  }

  // --- Zoom Controls ---
  setZoom(scale: number): void {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
    if (Math.abs(this.zoomScale - clamped) > 0.01) {
      this.zoomScale = Math.round(clamped * 100) / 100;
      this.renderPage();
    }
  }

  zoomIn(): void {
    this.setZoom(this.zoomScale + 0.25);
  }

  zoomOut(): void {
    this.setZoom(this.zoomScale - 0.25);
  }

  resetZoom(): void {
    this.setZoom(1.0);
  }

  // --- Page Navigation ---
  async goToPage(pageNum: number): Promise<void> {
    if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) return;
    this.currentPage = pageNum;
    this.selectedFieldId = null;
    this.sheetBreakpoint = 0;
    await this.renderPage();
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  // --- Tool Selection & Placement Mode ---
  toggleTool(toolType: PdfFormFieldType): void {
    if (this.activeToolType === toolType) {
      this.activeToolType = null;
    } else {
      this.activeToolType = toolType;
      this.selectedFieldId = null;
      this.sheetBreakpoint = 0;
      this.emitHaptic('light');
    }
    this.cdr.markForCheck();
  }

  cancelPlacement(): void {
    this.activeToolType = null;
    this.cdr.markForCheck();
  }

  // --- Canvas Touch / Click Placement ---
  onCanvasTouchEnd(event: TouchEvent): void {
    if (!this.activeToolType) return;
    event.preventDefault();
    this.onCanvasClick(event);
  }

  onCanvasClick(event: MouseEvent | TouchEvent): void {
    if (!this.activeToolType || !this.overlayRef) return;

    const rect = this.overlayRef.nativeElement.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if ('changedTouches' in event && (event as any).changedTouches.length > 0) {
      clientX = (event as any).changedTouches[0].clientX;
      clientY = (event as any).changedTouches[0].clientY;
    } else if ('clientX' in event) {
      clientX = (event as MouseEvent).clientX;
      clientY = (event as MouseEvent).clientY;
    } else {
      return;
    }

    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;

    const tool = this.availableTools.find(t => t.type === this.activeToolType);
    const w = (tool?.defaultWidth || 160) * this.zoomScale;
    const h = (tool?.defaultHeight || 32) * this.zoomScale;

    // Centered at tap position
    const boxX = Math.max(0, Math.min(this.renderedWidth - w, cssX - w / 2));
    const boxY = Math.max(0, Math.min(this.renderedHeight - h, cssY - h / 2));

    this.placeFieldAtCoordinates(this.activeToolType, boxX, boxY, w, h);
    this.activeToolType = null;
    this.emitHaptic('light');
  }

  placeFieldAtCoordinates(
    type: PdfFormFieldType,
    cssX: number,
    cssY: number,
    cssWidth: number,
    cssHeight: number
  ): void {
    const id = `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let count = this.fields.filter(f => f.type === type).length + 1;
    let name = `${type}_${count}`;
    while (this.fields.some(f => f.name === name)) {
      count++;
      name = `${type}_${count}`;
    }
    const label = `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`;

    // Convert CSS coordinates to PDF Points
    const pdfCoords = this.pdfFormBuilder.cssToPdfCoordinates({
      x: cssX,
      y: cssY,
      width: cssWidth,
      height: cssHeight,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      rotation: this.pageRotation,
      scale: this.zoomScale,
      dpr: 1.0
    });
    pdfCoords.pageNumber = this.currentPage;

    const newField: FormBuilderField = {
      id,
      name,
      label,
      type,
      value: type === 'checkbox' ? false : '',
      defaultValue: type === 'checkbox' ? false : '',
      isNative: true,
      isRequired: false,
      isReadOnly: false,
      isMultiline: type === 'text',
      tabOrder: this.fields.length + 1,
      options: ['dropdown', 'radio', 'listbox'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      multiselect: type === 'listbox',
      coordinates: pdfCoords,
      canvasCoordinates: {
        x: cssX,
        y: cssY,
        width: cssWidth,
        height: cssHeight
      }
    };

    this.fields.push(newField);
    this.selectField(newField.id);
  }

  // --- Field Selection & Click ---
  onFieldClick(event: MouseEvent, field: FormBuilderField): void {
    if (this.isPreviewMode) return;
    event.stopPropagation();
    this.selectField(field.id);
  }

  // --- Field Selection & Bottom Sheet ---
  selectField(fieldId: string): void {
    this.selectedFieldId = fieldId;
    const f = this.selectedField;
    if (f) {
      this.optionsString = f.options ? f.options.join(', ') : '';
      this.sheetBreakpoint = 0.45; // open half sheet
    }
    this.cdr.markForCheck();
  }

  closeSheet(): void {
    this.sheetBreakpoint = 0;
    this.selectedFieldId = null;
    this.cdr.markForCheck();
  }

  expandSheet(): void {
    this.sheetBreakpoint = 0.85;
    this.cdr.markForCheck();
  }

  deleteSelectedField(): void {
    if (!this.selectedFieldId) return;
    this.fields = this.fields.filter(f => f.id !== this.selectedFieldId);
    this.closeSheet();
    this.emitHaptic('light');
  }

  onOptionsStringChange(): void {
    const f = this.selectedField;
    if (!f) return;
    f.options = this.optionsString
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // --- Coordinates Transformation Sync ---
  updateAllFieldsCanvasCoordinates(): void {
    for (const f of this.fields) {
      if (!f.coordinates || f.coordinates.pageNumber !== this.currentPage) continue;
      const css = this.pdfFormBuilder.pdfToCssCoordinates({
        x: f.coordinates.x,
        y: f.coordinates.y,
        width: f.coordinates.width,
        height: f.coordinates.height,
        pageWidth: this.pageWidth,
        pageHeight: this.pageHeight,
        rotation: this.pageRotation,
        scale: this.zoomScale,
        dpr: 1.0
      });
      f.canvasCoordinates = css;
    }
  }

  syncFieldPdfCoordinates(field: FormBuilderField): void {
    if (!field.canvasCoordinates) return;
    const pdfCoords = this.pdfFormBuilder.cssToPdfCoordinates({
      x: field.canvasCoordinates.x,
      y: field.canvasCoordinates.y,
      width: field.canvasCoordinates.width,
      height: field.canvasCoordinates.height,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      rotation: this.pageRotation,
      scale: this.zoomScale,
      dpr: 1.0
    });
    pdfCoords.pageNumber = this.currentPage;
    field.coordinates = pdfCoords;
  }

  // --- Drag & Move Field ---
  onFieldTouchStart(event: TouchEvent, field: FormBuilderField): void {
    if (this.isPreviewMode) return;
    event.stopPropagation();
    this.selectField(field.id);

    const touch = event.touches[0];
    this.dragStartX = touch.clientX;
    this.dragStartY = touch.clientY;
    this.initialFieldCoords = { ...(field.canvasCoordinates || { x: 0, y: 0, width: 100, height: 30 }) };

    // Long press detection for repositioning haptic tick
    this.isLongPressDragActive = false;
    this.longPressTimer = setTimeout(() => {
      this.isLongPressDragActive = true;
      this.isDragging = true;
      this.emitHaptic('light');
    }, 280);
  }

  onFieldTouchMove(event: TouchEvent, field: FormBuilderField): void {
    if (this.isPreviewMode) return;
    const touch = event.touches[0];
    const dx = touch.clientX - this.dragStartX;
    const dy = touch.clientY - this.dragStartY;

    if (Math.hypot(dx, dy) > 8 && !this.isLongPressDragActive) {
      clearTimeout(this.longPressTimer);
      this.isDragging = true;
    }

    if (!this.isDragging || !field.canvasCoordinates) return;
    event.preventDefault();

    const newX = Math.max(0, Math.min(this.renderedWidth - field.canvasCoordinates.width, this.initialFieldCoords.x + dx));
    const newY = Math.max(0, Math.min(this.renderedHeight - field.canvasCoordinates.height, this.initialFieldCoords.y + dy));

    field.canvasCoordinates.x = Math.round(newX);
    field.canvasCoordinates.y = Math.round(newY);
    this.syncFieldPdfCoordinates(field);
    this.cdr.markForCheck();
  }

  onFieldTouchEnd(event: TouchEvent, field: FormBuilderField): void {
    if (this.isPreviewMode) return;
    clearTimeout(this.longPressTimer);
    if (this.isDragging) {
      this.isDragging = false;
      this.emitHaptic('light');
    }
  }

  // --- Corner Resize Handles ---
  onResizeHandleMouseDown(event: MouseEvent, handle: 'tl' | 'tr' | 'br' | 'bl'): void {
    if (this.isPreviewMode || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    this.isResizing = true;
    this.resizeHandle = handle;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;

    const f = this.selectedField;
    if (f?.canvasCoordinates) {
      this.initialFieldCoords = { ...f.canvasCoordinates };
    }

    this.cleanupMouseListeners();
    this.mouseMoveListener = (e: MouseEvent) => this.onWindowResizeMouseMove(e);
    this.mouseUpListener = (e: MouseEvent) => this.onWindowResizeMouseUp(e);
    window.addEventListener('mousemove', this.mouseMoveListener);
    window.addEventListener('mouseup', this.mouseUpListener);
  }

  private onWindowResizeMouseMove(event: MouseEvent): void {
    if (!this.isResizing || !this.selectedField?.canvasCoordinates) return;
    event.preventDefault();

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    this.applyResizeDelta(dx, dy);
  }

  private onWindowResizeMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.emitHaptic('light');
    }
    this.cleanupMouseListeners();
  }

  onFieldMouseDown(event: MouseEvent, field: FormBuilderField): void {
    if (this.isPreviewMode || event.button !== 0) return;
    event.stopPropagation();
    this.selectField(field.id);

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialFieldCoords = { ...(field.canvasCoordinates || { x: 0, y: 0, width: 100, height: 30 }) };

    this.cleanupMouseListeners();
    this.mouseMoveListener = (e: MouseEvent) => this.onWindowMouseMove(e, field);
    this.mouseUpListener = (e: MouseEvent) => this.onWindowMouseUp(e, field);
    window.addEventListener('mousemove', this.mouseMoveListener);
    window.addEventListener('mouseup', this.mouseUpListener);
  }

  private onWindowMouseMove(event: MouseEvent, field: FormBuilderField): void {
    if (!this.isDragging || !field.canvasCoordinates) return;
    event.preventDefault();
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;

    const newX = Math.max(0, Math.min(this.renderedWidth - field.canvasCoordinates.width, this.initialFieldCoords.x + dx));
    const newY = Math.max(0, Math.min(this.renderedHeight - field.canvasCoordinates.height, this.initialFieldCoords.y + dy));

    field.canvasCoordinates.x = Math.round(newX);
    field.canvasCoordinates.y = Math.round(newY);
    this.syncFieldPdfCoordinates(field);
    this.cdr.markForCheck();
  }

  private onWindowMouseUp(event: MouseEvent, field: FormBuilderField): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.emitHaptic('light');
    }
    this.cleanupMouseListeners();
  }

  private cleanupMouseListeners(): void {
    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener);
      this.mouseMoveListener = undefined;
    }
    if (this.mouseUpListener) {
      window.removeEventListener('mouseup', this.mouseUpListener);
      this.mouseUpListener = undefined;
    }
  }

  private applyResizeDelta(dx: number, dy: number): void {
    const field = this.selectedField;
    if (!field?.canvasCoordinates) return;
    const coords = field.canvasCoordinates;

    const minW = 20 * this.zoomScale;
    const minH = 20 * this.zoomScale;

    switch (this.resizeHandle) {
      case 'br': {
        const nw = Math.max(minW, this.initialFieldCoords.width + dx);
        const nh = Math.max(minH, this.initialFieldCoords.height + dy);
        coords.width = Math.min(this.renderedWidth - coords.x, Math.round(nw));
        coords.height = Math.min(this.renderedHeight - coords.y, Math.round(nh));
        break;
      }
      case 'bl': {
        const nw = Math.max(minW, this.initialFieldCoords.width - dx);
        const nh = Math.max(minH, this.initialFieldCoords.height + dy);
        const nx = this.initialFieldCoords.x + (this.initialFieldCoords.width - nw);
        coords.x = Math.max(0, Math.round(nx));
        coords.width = Math.round(nw);
        coords.height = Math.min(this.renderedHeight - coords.y, Math.round(nh));
        break;
      }
      case 'tr': {
        const nw = Math.max(minW, this.initialFieldCoords.width + dx);
        const nh = Math.max(minH, this.initialFieldCoords.height - dy);
        const ny = this.initialFieldCoords.y + (this.initialFieldCoords.height - nh);
        coords.y = Math.max(0, Math.round(ny));
        coords.width = Math.min(this.renderedWidth - coords.x, Math.round(nw));
        coords.height = Math.round(nh);
        break;
      }
      case 'tl': {
        const nw = Math.max(minW, this.initialFieldCoords.width - dx);
        const nh = Math.max(minH, this.initialFieldCoords.height - dy);
        const nx = this.initialFieldCoords.x + (this.initialFieldCoords.width - nw);
        const ny = this.initialFieldCoords.y + (this.initialFieldCoords.height - nh);
        coords.x = Math.max(0, Math.round(nx));
        coords.y = Math.max(0, Math.round(ny));
        coords.width = Math.round(nw);
        coords.height = Math.round(nh);
        break;
      }
    }

    this.syncFieldPdfCoordinates(field);
    this.cdr.markForCheck();
  }

  // --- Corner Resize Handles ---
  onResizeHandleTouchStart(event: TouchEvent, handle: 'tl' | 'tr' | 'br' | 'bl'): void {
    event.stopPropagation();
    event.preventDefault();
    this.isResizing = true;
    this.resizeHandle = handle;
    const touch = event.touches[0];
    this.dragStartX = touch.clientX;
    this.dragStartY = touch.clientY;

    const f = this.selectedField;
    if (f?.canvasCoordinates) {
      this.initialFieldCoords = { ...f.canvasCoordinates };
    }
    this.emitHaptic('light');
  }

  onResizeHandleTouchMove(event: TouchEvent): void {
    if (!this.isResizing || !this.selectedField?.canvasCoordinates) return;
    event.preventDefault();
    event.stopPropagation();

    const touch = event.touches[0];
    const dx = touch.clientX - this.dragStartX;
    const dy = touch.clientY - this.dragStartY;
    this.applyResizeDelta(dx, dy);
  }

  onResizeHandleTouchEnd(event: TouchEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.emitHaptic('light');
    }
  }

  // --- Pinch-to-zoom on Viewport ---
  onViewportTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      this.initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      this.initialPinchScale = this.zoomScale;
    }
  }

  onViewportTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2 && this.initialPinchDist > 0) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = currentDist / this.initialPinchDist;
      this.setZoom(this.initialPinchScale * ratio);
    }
  }

  // --- Preview Mode ---
  togglePreviewMode(): void {
    this.isPreviewMode = !this.isPreviewMode;
    this.selectedFieldId = null;
    this.sheetBreakpoint = 0;
    this.activeToolType = null;
    if (this.isPreviewMode) {
      // Initialize preview values
      for (const f of this.fields) {
        this.previewValues[f.id] = f.defaultValue ?? f.value ?? '';
      }
    }
    this.emitHaptic('light');
    this.cdr.markForCheck();
  }

  // --- Export and Save PDF ---
  async saveFormPdf(): Promise<void> {
    if (!this.pdfBytes) return;

    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      const outName = this.fileName.replace(/\.pdf$/i, '') + '_forms.pdf';
      const result = await this.pdfFormBuilder.saveFormPdf(this.pdfBytes, this.fields, outName);

      this.emitHaptic('medium');
      const toast = await this.toastCtrl.create({
        message: `Saved ${result.file.name} (${Math.round(result.sizeBytes / 1024)} KB)`,
        duration: 3000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'Save Failed',
        message: err.message || 'Failed to save form PDF.',
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  private async emitHaptic(style: 'light' | 'medium'): Promise<void> {
    try {
      await Haptics.impact({
        style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium
      });
    } catch {
      // Non-capacitor fallback
    }
  }
}
