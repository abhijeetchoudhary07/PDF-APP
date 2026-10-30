import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as pdfjsLib from 'pdfjs-dist';

import {
  ScannedTableOcrService,
  MAX_TABLE_ROWS,
  MAX_TABLE_COLS
} from '../../core/services/scanned-table-ocr.service';
import { OcrService } from '../../core/services/ocr.service';
import { StorageService } from '../../core/services/storage.service';
import { FileService } from '../../core/services/file.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import { TRANSLATIONS } from '../../core/i18n/translations';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import {
  ScannedTableResult,
  TableCornerPoints,
  TableStructure,
  TableCellType,
  Point2D
} from '../../core/models/scanned-table.types';
import { OcrDocumentResult, OcrWord } from '../../core/models/ocr.models';

export type TableWorkflowStep = 'select' | 'boundary' | 'detecting' | 'editor';

@Component({
  selector: 'app-table-to-excel',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './table-to-excel.page.html',
  styleUrls: ['./table-to-excel.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class TableToExcelPage implements OnInit, OnDestroy {
  private scannedTableService = inject(ScannedTableOcrService);
  private ocrService = inject(OcrService);
  private storageService = inject(StorageService);
  private fileService = inject(FileService);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private documentBridgeService = inject(DocumentBridgeService);
  public translationService = inject(TranslationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cropBoundaryContainer') cropBoundaryContainerRef?: ElementRef<HTMLDivElement>;

  currentStep: TableWorkflowStep = 'select';
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  sourceCanvas: HTMLCanvasElement | null = null;

  // Image / Document display metrics
  imageNaturalWidth = 800;
  imageNaturalHeight = 1000;
  displayScale = 1.0;
  zoomLevel = 1.0;

  // 4 Draggable Corner Pins for Table Boundary Area
  tableCorners: TableCornerPoints = {
    topLeft: { x: 50, y: 50 },
    topRight: { x: 550, y: 50 },
    bottomRight: { x: 550, y: 450 },
    bottomLeft: { x: 50, y: 450 }
  };
  activeDraggingCorner: keyof TableCornerPoints | null = null;

  // OCR words cache
  cachedOcrWords: OcrWord[] = [];

  // Table recognition and spreadsheet grid
  tableResult: ScannedTableResult | null = null;
  matrix: string[][] = [];
  activeViewTab: 'grid' | 'scan' = 'grid';

  // Bottom-sheet cell editor
  selectedCellCoord: { row: number; col: number } | null = null;
  cellInput = '';
  isCellDrawerOpen = false;

  // Export state
  isExporting = false;

  async ngOnInit(): Promise<void> {
    const bridgeDoc = this.documentBridgeService.getOcrTarget();
    if (bridgeDoc && bridgeDoc.file) {
      this.onFileSelected(bridgeDoc.file);
    }
  }

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    if (this.sourceCanvas) {
      this.sourceCanvas.width = 0;
      this.sourceCanvas.height = 0;
      this.sourceCanvas = null;
    }
    this.scannedTableService.terminateWorker().catch(() => {});
  }

  get t(): any {
    const lang = this.translationService.currentLang;
    return (TRANSLATIONS[lang] as any)?.tableToExcel || (TRANSLATIONS['en'] as any)?.tableToExcel || {};
  }

  navigateBack(): void {
    this.router.navigate(['/features/pdf']);
  }

  // File Selection & Pre-rendering
  async onFileSelected(file: File): Promise<void> {
    this.selectedFile = file;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = URL.createObjectURL(file);
    this.currentStep = 'detecting';
    this.cdr.detectChanges();

    try {
      // 1. Render file to canvas
      this.sourceCanvas = await this.renderFileToCanvas(file);
      this.imageNaturalWidth = this.sourceCanvas.width;
      this.imageNaturalHeight = this.sourceCanvas.height;

      // 2. Initialize default 4 corners to inner 85% bounds
      const padX = Math.round(this.imageNaturalWidth * 0.08);
      const padY = Math.round(this.imageNaturalHeight * 0.08);
      this.tableCorners = {
        topLeft: { x: padX, y: padY },
        topRight: { x: this.imageNaturalWidth - padX, y: padY },
        bottomRight: { x: this.imageNaturalWidth - padX, y: this.imageNaturalHeight - padY },
        bottomLeft: { x: padX, y: this.imageNaturalHeight - padY }
      };

      // 3. Run initial fast OCR pass to extract word bounding boxes
      try {
        const rawOcr = await this.ocrService.performOcr(file, 'eng');
        this.cachedOcrWords = rawOcr.pages[0]?.words || [];
      } catch {
        this.cachedOcrWords = [];
      }

      this.currentStep = 'boundary';
      this.cdr.detectChanges();
    } catch (err: any) {
      this.currentStep = 'select';
      this.toastService.error(err.message || 'Failed to render document preview');
      this.cdr.detectChanges();
    }
  }

  private async renderFileToCanvas(file: File): Promise<HTMLCanvasElement> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) } as any);
      try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        try {
          const viewport = page.getViewport({ scale: 2.0 });

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport } as any).promise;
          }
          return canvas;
        } finally {
          if (typeof (page as any).cleanup === 'function') {
            (page as any).cleanup();
          }
        }
      } finally {
        await loadingTask.destroy();
      }
    } else {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
            resolve(canvas);
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  }

  // Draggable Corner Pins Management
  onPinPointerDown(corner: keyof TableCornerPoints, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeDraggingCorner = corner;
    (event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);
  }

  onPinPointerMove(event: PointerEvent): void {
    if (!this.activeDraggingCorner || !this.cropBoundaryContainerRef) return;
    event.preventDefault();

    const container = this.cropBoundaryContainerRef.nativeElement;
    const rect = container.getBoundingClientRect();

    const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

    // Convert relative display coordinate back to image natural coordinates
    const scaleX = this.imageNaturalWidth / rect.width;
    const scaleY = this.imageNaturalHeight / rect.height;

    const naturalX = Math.round(relativeX * scaleX);
    const naturalY = Math.round(relativeY * scaleY);

    this.tableCorners[this.activeDraggingCorner] = {
      x: Math.max(0, Math.min(this.imageNaturalWidth, naturalX)),
      y: Math.max(0, Math.min(this.imageNaturalHeight, naturalY))
    };

    this.cdr.detectChanges();
  }

  onPinPointerUp(event: PointerEvent): void {
    if (this.activeDraggingCorner) {
      try {
        (event.target as HTMLElement)?.releasePointerCapture?.(event.pointerId);
      } catch {}
      this.activeDraggingCorner = null;
    }
  }

  getCornerDisplayPercent(corner: keyof TableCornerPoints): { x: number; y: number } {
    const pt = this.tableCorners[corner];
    const xPct = (pt.x / this.imageNaturalWidth) * 100;
    const yPct = (pt.y / this.imageNaturalHeight) * 100;
    return { x: xPct, y: yPct };
  }

  get boundaryPolygonPoints(): string {
    const tl = this.getCornerDisplayPercent('topLeft');
    const tr = this.getCornerDisplayPercent('topRight');
    const br = this.getCornerDisplayPercent('bottomRight');
    const bl = this.getCornerDisplayPercent('bottomLeft');
    return `${tl.x}%,${tl.y}% ${tr.x}%,${tr.y}% ${br.x}%,${br.y}% ${bl.x}%,${bl.y}%`;
  }

  // Detect & OCR Table from User-Selected Boundary
  async detectAndOcrTable(): Promise<void> {
    if (!this.sourceCanvas || !this.selectedFile) return;

    this.currentStep = 'detecting';
    this.cdr.detectChanges();

    try {
      // 1. Calculate axis-aligned bounding box from 4 corners
      const minX = Math.min(this.tableCorners.topLeft.x, this.tableCorners.bottomLeft.x);
      const maxX = Math.max(this.tableCorners.topRight.x, this.tableCorners.bottomRight.x);
      const minY = Math.min(this.tableCorners.topLeft.y, this.tableCorners.topRight.y);
      const maxY = Math.max(this.tableCorners.bottomLeft.y, this.tableCorners.bottomRight.y);

      const tableBbox = {
        x: Math.max(0, minX),
        y: Math.max(0, minY),
        width: Math.max(10, maxX - minX),
        height: Math.max(10, maxY - minY)
      };

      // 2. Detect table structure (ruled or borderless)
      const structure = this.scannedTableService.detectTableStructure(
        this.sourceCanvas,
        tableBbox,
        this.cachedOcrWords
      );

      // 3. Populate 2D table matrix
      this.tableResult = this.scannedTableService.populateTableMatrix(
        structure,
        this.cachedOcrWords,
        this.selectedFile.name,
        1
      );

      this.matrix = this.tableResult.matrix.map(row => [...row]);

      this.currentStep = 'editor';
      this.activeViewTab = 'grid';
      this.toastService.success(
        structure.method === 'ruled'
          ? this.t['ruledDetected'] || 'Ruled Table detected!'
          : this.t['borderlessDetected'] || 'Borderless Table layout detected!'
      );
      this.cdr.detectChanges();
    } catch (err: any) {
      this.currentStep = 'boundary';
      this.toastService.error(err.message || 'Failed to detect table structure');
      this.cdr.detectChanges();
    }
  }

  // Mobile Spreadsheet Grid Actions
  getColumnLabel(index: number): string {
    let label = '';
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode((i % 26) + 65) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  }

  selectCell(row: number, col: number): void {
    this.selectedCellCoord = { row, col };
    this.cellInput = this.matrix[row]?.[col] || '';
    this.isCellDrawerOpen = true;
    this.cdr.detectChanges();
  }

  closeCellDrawer(): void {
    this.isCellDrawerOpen = false;
    this.selectedCellCoord = null;
  }

  applyCellEdit(): void {
    if (!this.selectedCellCoord) return;
    const { row, col } = this.selectedCellCoord;
    if (this.matrix[row] !== undefined) {
      this.matrix[row][col] = this.cellInput.trim();
    }
    this.closeCellDrawer();
    this.cdr.detectChanges();
  }

  clearCellInput(): void {
    this.cellInput = '';
    this.applyCellEdit();
  }

  getSelectedCellType(): TableCellType {
    if (!this.selectedCellCoord) return 'text';
    const val = this.matrix[this.selectedCellCoord.row]?.[this.selectedCellCoord.col] || '';
    return this.scannedTableService.inferCellDataType(val);
  }

  // Row and Column Insertion / Deletion
  addRow(): void {
    if (this.matrix.length >= MAX_TABLE_ROWS) {
      this.toastService.show('warning', `Table cannot exceed ${MAX_TABLE_ROWS} rows.`);
      return;
    }

    const colCount = Math.max(1, this.matrix[0]?.length || 1);
    const newRow = Array.from({ length: colCount }, () => '');

    if (this.selectedCellCoord) {
      this.matrix.splice(this.selectedCellCoord.row + 1, 0, newRow);
    } else {
      this.matrix.push(newRow);
    }
    this.toastService.success(this.t['addRow'] || 'Row added');
    this.cdr.detectChanges();
  }

  deleteRow(): void {
    if (this.matrix.length <= 1) {
      this.toastService.show('warning', 'Table must have at least one row');
      return;
    }

    const targetRow = this.selectedCellCoord ? this.selectedCellCoord.row : this.matrix.length - 1;
    this.matrix.splice(targetRow, 1);
    this.closeCellDrawer();
    this.toastService.success(this.t['deleteRow'] || 'Row deleted');
    this.cdr.detectChanges();
  }

  addColumn(): void {
    if ((this.matrix[0]?.length || 0) >= MAX_TABLE_COLS) {
      this.toastService.show('warning', `Table cannot exceed ${MAX_TABLE_COLS} columns.`);
      return;
    }

    const insertCol = this.selectedCellCoord
      ? this.selectedCellCoord.col + 1
      : (this.matrix[0]?.length || 0);

    for (const row of this.matrix) {
      row.splice(insertCol, 0, '');
    }
    this.toastService.success(this.t['addCol'] || 'Column added');
    this.cdr.detectChanges();
  }

  deleteColumn(): void {
    if ((this.matrix[0]?.length || 0) <= 1) {
      this.toastService.show('warning', 'Table must have at least one column');
      return;
    }

    const targetCol = this.selectedCellCoord
      ? this.selectedCellCoord.col
      : (this.matrix[0]?.length || 1) - 1;

    for (const row of this.matrix) {
      row.splice(targetCol, 1);
    }
    this.closeCellDrawer();
    this.toastService.success(this.t['deleteCol'] || 'Column deleted');
    this.cdr.detectChanges();
  }

  // Export Actions with Daily Quota Enforcement
  async exportExcel(): Promise<void> {
    if (!this.selectedFile || this.matrix.length === 0 || this.isExporting) return;

    this.isExporting = true;
    this.cdr.detectChanges();

    const baseName = this.selectedFile.name.replace(/\.[^/.]+$/, '');
    const outName = `${baseName}_table.xlsx`;

    try {
      const res = await this.scannedTableService.exportToExcelWithQuota(this.matrix, outName);
      if (!res.savedUri) {
        this.toastService.error(
          this.t['quotaExceeded'] || 'Daily operation quota reached. Upgrade to continue.'
        );
        return;
      }

      await this.historyService.addHistoryItem({
        operation: 'table-to-excel',
        originalFileName: this.selectedFile.name,
        outputFileName: outName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: res.file.size
      });

      this.toastService.success(this.t['exportSuccess'] || 'Excel file exported successfully!');
    } catch (err: any) {
      this.toastService.error(err.message || 'Failed to export Excel file');
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  async exportCsv(): Promise<void> {
    if (!this.selectedFile || this.matrix.length === 0 || this.isExporting) return;

    this.isExporting = true;
    this.cdr.detectChanges();

    const baseName = this.selectedFile.name.replace(/\.[^/.]+$/, '');
    const outName = `${baseName}_table.csv`;

    try {
      const res = await this.scannedTableService.exportToCsvWithQuota(this.matrix, outName);
      if (!res.savedUri) {
        this.toastService.error(
          this.t['quotaExceeded'] || 'Daily operation quota reached. Upgrade to continue.'
        );
        return;
      }

      await this.historyService.addHistoryItem({
        operation: 'table-to-csv',
        originalFileName: this.selectedFile.name,
        outputFileName: outName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: res.file.size
      });

      this.toastService.success(this.t['exportSuccess'] || 'CSV file exported successfully!');
    } catch (err: any) {
      this.toastService.error(err.message || 'Failed to export CSV file');
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  // Scan Viewer Zoom Controls
  zoomIn(): void {
    this.zoomLevel = Math.min(2.5, +(this.zoomLevel + 0.2).toFixed(1));
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(0.6, +(this.zoomLevel - 0.2).toFixed(1));
  }

  resetZoom(): void {
    this.zoomLevel = 1.0;
  }

  resetWorkflow(): void {
    this.currentStep = 'select';
    this.selectedFile = null;
    if (this.sourceCanvas) {
      this.sourceCanvas.width = 0;
      this.sourceCanvas.height = 0;
      this.sourceCanvas = null;
    }
    this.tableResult = null;
    this.matrix = [];
    this.closeCellDrawer();
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
