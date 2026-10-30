import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { resolveAngularResources } from '../../../test-setup';
import { TableToExcelPage } from './table-to-excel.page';
import { ScannedTableOcrService } from '../../core/services/scanned-table-ocr.service';
import { OcrService } from '../../core/services/ocr.service';
import { StorageService } from '../../core/services/storage.service';
import { FileService } from '../../core/services/file.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import { ScannedTableResult } from '../../core/models/scanned-table.types';

describe('TableToExcelPage — O5 Table OCR to Excel UI & Workflow', () => {
  let fixture: ComponentFixture<TableToExcelPage>;
  let component: TableToExcelPage;
  let scannedTableService: ScannedTableOcrService;
  let storageService: StorageService;
  let toastService: ToastService;
  let historyService: HistoryService;

  const mockTableResult: ScannedTableResult = {
    fileName: 'receipt.png',
    pageNumber: 1,
    matrix: [
      ['Item', 'Qty', 'Price'],
      ['Notebook', '2', '$10.00'],
      ['Pencil', '5', '$2.50']
    ],
    cells: [] as any,
    rowCount: 3,
    colCount: 3,
    structure: {
      rowCount: 3,
      colCount: 3,
      method: 'ruled',
      cells: [] as any,
      cellBboxes: [],
      rowBoundaries: [20, 80, 140, 200],
      colBoundaries: [20, 150, 250, 350]
    },
    confidence: 93,
    processingTimeMs: 120
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [TableToExcelPage],
      providers: [
        provideRouter([]),
        ScannedTableOcrService,
        TranslationService,
        {
          provide: OcrService,
          useValue: {
            performOcr: vi.fn().mockResolvedValue({
              pages: [{ words: [] }],
              averageConfidence: 90
            })
          }
        },
        {
          provide: StorageService,
          useValue: {
            saveFile: vi.fn().mockResolvedValue('file:///saved/receipt_table.xlsx')
          }
        },
        {
          provide: FileService,
          useValue: {
            downloadFile: vi.fn()
          }
        },
        {
          provide: ToastService,
          useValue: {
            show: vi.fn(),
            success: vi.fn(),
            error: vi.fn()
          }
        },
        {
          provide: HistoryService,
          useValue: {
            addHistoryItem: vi.fn().mockResolvedValue(true)
          }
        },
        {
          provide: DocumentBridgeService,
          useValue: {
            getOcrTarget: vi.fn().mockReturnValue(null),
            setIntelligenceTarget: vi.fn()
          }
        }
      ]
    });

    fixture = TestBed.createComponent(TableToExcelPage);
    component = fixture.componentInstance;
    scannedTableService = TestBed.inject(ScannedTableOcrService);
    storageService = TestBed.inject(StorageService);
    toastService = TestBed.inject(ToastService);
    historyService = TestBed.inject(HistoryService);

    await component.ngOnInit();
  });

  afterEach(async () => {
    await scannedTableService?.terminateWorker();
    TestBed.resetTestingModule();
  });

  describe('Workflow Navigation & File Selection', () => {
    it('initializes in select step', () => {
      expect(component.currentStep).toBe('select');
      expect(component.selectedFile).toBeNull();
      expect(component.matrix.length).toBe(0);
    });

    it('renders selected file, sets up 4 draggable boundary corner pins, and enters boundary step', async () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 600;
      mockCanvas.height = 800;
      vi.spyOn(component as any, 'renderFileToCanvas').mockResolvedValue(mockCanvas);

      const testFile = new File(['test'], 'invoice.png', { type: 'image/png' });
      await component.onFileSelected(testFile);

      expect(component.currentStep).toBe('boundary');
      expect(component.imageNaturalWidth).toBe(600);
      expect(component.imageNaturalHeight).toBe(800);

      // Verify 4 corners are placed within image bounds
      expect(component.tableCorners.topLeft.x).toBeGreaterThan(0);
      expect(component.tableCorners.topRight.x).toBeLessThan(600);
      expect(component.tableCorners.bottomRight.y).toBeLessThan(800);
      expect(component.tableCorners.bottomLeft.x).toBeGreaterThan(0);

      expect(component.boundaryPolygonPoints).toContain('%');
    });
  });

  describe('Table Detection & Grid Population', () => {
    beforeEach(() => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 600;
      mockCanvas.height = 800;
      component.sourceCanvas = mockCanvas;
      component.selectedFile = new File(['test'], 'receipt.png', { type: 'image/png' });
      component.currentStep = 'boundary';
    });

    it('runs table detection and enters editor step with populated matrix', async () => {
      vi.spyOn(scannedTableService, 'detectTableStructure').mockReturnValue(mockTableResult.structure);
      vi.spyOn(scannedTableService, 'populateTableMatrix').mockReturnValue(mockTableResult);

      await component.detectAndOcrTable();

      expect(component.currentStep).toBe('editor');
      expect(component.activeViewTab).toBe('grid');
      expect(component.matrix.length).toBe(3);
      expect(component.matrix[0]).toEqual(['Item', 'Qty', 'Price']);
      expect(toastService.success).toHaveBeenCalled();
    });
  });

  describe('Mobile Interactive Spreadsheet Grid & Actions', () => {
    beforeEach(() => {
      component.matrix = [
        ['Item', 'Qty', 'Price'],
        ['Notebook', '2', '$10.00']
      ];
      component.currentStep = 'editor';
    });

    it('computes spreadsheet column labels correctly (A, B, C, ...)', () => {
      expect(component.getColumnLabel(0)).toBe('A');
      expect(component.getColumnLabel(1)).toBe('B');
      expect(component.getColumnLabel(25)).toBe('Z');
      expect(component.getColumnLabel(26)).toBe('AA');
    });

    it('opens inline bottom-sheet cell editor when a cell is tapped', () => {
      component.selectCell(1, 0);

      expect(component.isCellDrawerOpen).toBe(true);
      expect(component.selectedCellCoord).toEqual({ row: 1, col: 0 });
      expect(component.cellInput).toBe('Notebook');
      expect(component.getSelectedCellType()).toBe('text');
    });

    it('applies updated cell content from bottom sheet', () => {
      component.selectCell(1, 0);
      component.cellInput = 'Diary';
      component.applyCellEdit();

      expect(component.matrix[1][0]).toBe('Diary');
      expect(component.isCellDrawerOpen).toBe(false);
      expect(component.selectedCellCoord).toBeNull();
    });

    it('clears cell content with clear button', () => {
      component.selectCell(1, 2);
      component.clearCellInput();

      expect(component.matrix[1][2]).toBe('');
      expect(component.isCellDrawerOpen).toBe(false);
    });

    it('adds row below selected row', () => {
      component.selectCell(0, 0);
      component.addRow();

      expect(component.matrix.length).toBe(3);
      expect(component.matrix[1]).toEqual(['', '', '']);
      expect(toastService.success).toHaveBeenCalledWith('Add Row');
    });

    it('deletes selected row while preventing zero rows', () => {
      component.selectCell(1, 0);
      component.deleteRow();

      expect(component.matrix.length).toBe(1);
      expect(toastService.success).toHaveBeenCalledWith('Delete Row');

      // Attempt deleting the only remaining row
      component.deleteRow();
      expect(component.matrix.length).toBe(1);
      expect(toastService.show).toHaveBeenCalledWith('warning', 'Table must have at least one row');
    });

    it('adds and deletes columns', () => {
      component.selectCell(0, 1);
      component.addColumn();

      expect(component.matrix[0].length).toBe(4);
      expect(toastService.success).toHaveBeenCalledWith('Add Column');

      component.deleteColumn();
      expect(component.matrix[0].length).toBe(3);
      expect(toastService.success).toHaveBeenCalledWith('Delete Column');
    });

    it('blocks adding rows beyond MAX_TABLE_ROWS', () => {
      // Set rows to MAX_TABLE_ROWS (500)
      component.matrix = Array.from({ length: 500 }, () => ['A', 'B']);
      component.addRow();

      expect(component.matrix.length).toBe(500);
      expect(toastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('500 rows'));
    });

    it('blocks adding columns beyond MAX_TABLE_COLS', () => {
      // Set cols to MAX_TABLE_COLS (100)
      component.matrix = [Array.from({ length: 100 }, () => 'val')];
      component.addColumn();

      expect(component.matrix[0].length).toBe(100);
      expect(toastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('100 columns'));
    });

    it('releases canvas GPU texture resources on resetWorkflow and ngOnDestroy', () => {
      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = 400;
      dummyCanvas.height = 300;
      component.sourceCanvas = dummyCanvas;

      component.resetWorkflow();
      expect(component.sourceCanvas).toBeNull();
      expect(dummyCanvas.width).toBe(0);
      expect(dummyCanvas.height).toBe(0);

      const anotherCanvas = document.createElement('canvas');
      anotherCanvas.width = 200;
      anotherCanvas.height = 200;
      component.sourceCanvas = anotherCanvas;

      component.ngOnDestroy();
      expect(component.sourceCanvas).toBeNull();
      expect(anotherCanvas.width).toBe(0);
      expect(anotherCanvas.height).toBe(0);
    });
  });

  describe('Sticky Bottom Actions & Quota Enforcement', () => {
    beforeEach(() => {
      component.selectedFile = new File(['test'], 'bill.png', { type: 'image/png' });
      component.matrix = [
        ['Product', 'Total'],
        ['Printer Ink', '$45.00']
      ];
      component.currentStep = 'editor';
    });

    it('exports to Excel (.xlsx) successfully and records history', async () => {
      vi.spyOn(scannedTableService, 'exportToExcelWithQuota').mockResolvedValue({
        file: new File(['mock'], 'bill_table.xlsx'),
        savedUri: 'file:///saved/bill_table.xlsx',
        quotaEnforced: true
      });

      await component.exportExcel();

      expect(scannedTableService.exportToExcelWithQuota).toHaveBeenCalled();
      expect(historyService.addHistoryItem).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'table-to-excel',
        outputFileName: 'bill_table.xlsx'
      }));
      expect(toastService.success).toHaveBeenCalled();
    });

    it('displays error if daily quota is reached on export', async () => {
      vi.spyOn(scannedTableService, 'exportToExcelWithQuota').mockResolvedValue({
        file: new File(['mock'], 'bill_table.xlsx'),
        savedUri: undefined,
        quotaEnforced: true
      });

      await component.exportExcel();

      expect(toastService.error).toHaveBeenCalled();
      expect(historyService.addHistoryItem).not.toHaveBeenCalled();
    });

    it('exports to CSV successfully', async () => {
      vi.spyOn(scannedTableService, 'exportToCsvWithQuota').mockResolvedValue({
        file: new File(['mock'], 'bill_table.csv'),
        savedUri: 'file:///saved/bill_table.csv',
        quotaEnforced: true
      });

      await component.exportCsv();

      expect(scannedTableService.exportToCsvWithQuota).toHaveBeenCalled();
      expect(toastService.success).toHaveBeenCalled();
    });
  });

  describe('Zoom and Tab Navigation', () => {
    it('switches between spreadsheet grid and scan view', () => {
      expect(component.activeViewTab).toBe('grid');
      component.activeViewTab = 'scan';
      expect(component.activeViewTab).toBe('scan');
    });

    it('adjusts zoom level within bounds', () => {
      expect(component.zoomLevel).toBe(1.0);
      component.zoomIn();
      expect(component.zoomLevel).toBe(1.2);
      component.zoomOut();
      expect(component.zoomLevel).toBe(1.0);
      component.resetZoom();
      expect(component.zoomLevel).toBe(1.0);
    });
  });
});
