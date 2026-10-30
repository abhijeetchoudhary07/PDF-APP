import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

import { FormsBuildPage } from './forms-build.page';
import { PdfFormBuilderService } from '../../core/services/pdf-form-builder.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';

describe('FormsBuildPage', () => {
  let page: FormsBuildPage;
  let mockBuilderService: any;
  let mockFileService: any;
  let mockBridgeService: any;
  let mockAlertCtrl: any;
  let mockToastCtrl: any;

  beforeEach(() => {
    mockBuilderService = {
      cssToPdfCoordinates: vi.fn().mockImplementation((opts) => ({
        pageNumber: 1,
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height
      })),
      pdfToCssCoordinates: vi.fn().mockImplementation((opts) => ({
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height
      })),
      saveFormPdf: vi.fn().mockResolvedValue({
        file: new File(['dummy'], 'output.pdf', { type: 'application/pdf' }),
        blob: new Blob(['dummy']),
        sizeBytes: 1024,
        uri: 'file:///path/output.pdf'
      })
    };

    mockFileService = {
      pickPdfFile: vi.fn()
    };

    mockBridgeService = {
      consumeDocument: vi.fn().mockReturnValue(null)
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfFormBuilderService, useValue: mockBuilderService },
        { provide: FileService, useValue: mockFileService },
        { provide: DocumentBridgeService, useValue: mockBridgeService },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new FormsBuildPage());
  });

  it('initializes with default values', () => {
    expect(page.zoomScale).toBe(1.0);
    expect(page.currentPage).toBe(1);
    expect(page.fields.length).toBe(0);
    expect(page.selectedFieldId).toBeNull();
    expect(page.sheetBreakpoint).toBe(0);
    expect(page.isPreviewMode).toBe(false);
  });

  it('toggles placement mode when a tool is clicked', () => {
    page.toggleTool('text');
    expect(page.activeToolType).toBe('text');

    page.toggleTool('text');
    expect(page.activeToolType).toBeNull();

    page.toggleTool('checkbox');
    expect(page.activeToolType).toBe('checkbox');
    page.cancelPlacement();
    expect(page.activeToolType).toBeNull();
  });

  it('places a field at coordinates and selects it', () => {
    page.placeFieldAtCoordinates('text', 60, 100, 160, 32);

    expect(page.fields.length).toBe(1);
    const created = page.fields[0];
    expect(created.type).toBe('text');
    expect(created.name).toBe('text_1');
    expect(page.selectedFieldId).toBe(created.id);
    expect(page.sheetBreakpoint).toBe(0.45);
  });

  it('supports selecting and deleting fields', () => {
    page.placeFieldAtCoordinates('dropdown', 50, 50, 180, 32);
    const fieldId = page.fields[0].id;
    expect(page.selectedFieldId).toBe(fieldId);

    page.deleteSelectedField();
    expect(page.fields.length).toBe(0);
    expect(page.selectedFieldId).toBeNull();
    expect(page.sheetBreakpoint).toBe(0);
  });

  it('updates options when optionsString changes', () => {
    page.placeFieldAtCoordinates('dropdown', 50, 50, 180, 32);
    page.optionsString = 'Option A, Option B, Option C';
    page.onOptionsStringChange();

    expect(page.selectedField?.options).toEqual(['Option A', 'Option B', 'Option C']);
  });

  it('handles zoom controls within bounds', () => {
    page.zoomIn();
    expect(page.zoomScale).toBe(1.25);

    page.zoomOut();
    expect(page.zoomScale).toBe(1.0);

    // Cannot zoom below minZoom (1.0)
    page.zoomOut();
    expect(page.zoomScale).toBe(1.0);

    page.setZoom(2.5);
    expect(page.zoomScale).toBe(2.5);

    page.resetZoom();
    expect(page.zoomScale).toBe(1.0);
  });

  it('toggles preview mode and preserves values', () => {
    page.placeFieldAtCoordinates('text', 50, 50, 150, 30);
    const field = page.fields[0];
    field.defaultValue = 'Test Value';

    page.togglePreviewMode();
    expect(page.isPreviewMode).toBe(true);
    expect(page.previewValues[field.id]).toBe('Test Value');

    page.togglePreviewMode();
    expect(page.isPreviewMode).toBe(false);
  });

  it('saves form PDF via builder service', async () => {
    page.pdfBytes = new ArrayBuffer(500);
    page.fileName = 'test.pdf';
    page.placeFieldAtCoordinates('signature', 50, 150, 200, 60);

    await page.saveFormPdf();
    expect(mockBuilderService.saveFormPdf).toHaveBeenCalled();
    expect(mockToastCtrl.create).toHaveBeenCalled();
  });

  it('places each of the 7 field types with correct defaults', () => {
    const types = ['text', 'checkbox', 'radio', 'dropdown', 'listbox', 'date', 'signature'] as const;
    for (const t of types) {
      page.placeFieldAtCoordinates(t, 50, 50, 160, 32);
    }
    expect(page.fields.length).toBe(7);
    expect(page.fields.map(f => f.type)).toEqual(types);
  });

  it('generates unique names for multiple fields of the same type', () => {
    page.placeFieldAtCoordinates('text', 50, 50, 160, 32);
    page.placeFieldAtCoordinates('text', 50, 90, 160, 32);
    page.placeFieldAtCoordinates('text', 50, 130, 160, 32);

    expect(page.fields[0].name).toBe('text_1');
    expect(page.fields[1].name).toBe('text_2');
    expect(page.fields[2].name).toBe('text_3');
  });

  it('edits field properties in the inspector model', () => {
    page.placeFieldAtCoordinates('text', 50, 50, 160, 32);
    const field = page.selectedField!;

    field.name = 'userEmail';
    field.label = 'Work Email Address';
    field.isRequired = true;
    field.isReadOnly = true;
    field.defaultValue = 'user@example.com';
    field.maxLength = 100;
    field.tabOrder = 1;

    expect(field.name).toBe('userEmail');
    expect(field.label).toBe('Work Email Address');
    expect(field.isRequired).toBe(true);
    expect(field.isReadOnly).toBe(true);
    expect(field.defaultValue).toBe('user@example.com');
    expect(field.maxLength).toBe(100);
    expect(field.tabOrder).toBe(1);
  });

  it('selects field and opens bottom sheet on click', () => {
    page.placeFieldAtCoordinates('checkbox', 50, 50, 28, 28);
    const field = page.fields[0];
    page.closeSheet();
    expect(page.sheetBreakpoint).toBe(0);

    const mockEvent = { stopPropagation: vi.fn() } as any;
    page.onFieldClick(mockEvent, field);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(page.selectedFieldId).toBe(field.id);
    expect(page.sheetBreakpoint).toBe(0.45);
  });

  it('repositions field via mouse drag and drop', () => {
    page.renderedWidth = 600;
    page.renderedHeight = 800;
    page.placeFieldAtCoordinates('text', 50, 50, 150, 30);
    const field = page.fields[0];

    const mouseDownEvent = { button: 0, clientX: 100, clientY: 100, stopPropagation: vi.fn() } as any;
    page.onFieldMouseDown(mouseDownEvent, field);

    // Simulate window mousemove (moved +30px X, +40px Y)
    const mouseMoveEvent = { clientX: 130, clientY: 140, preventDefault: vi.fn() } as any;
    (page as any).onWindowMouseMove(mouseMoveEvent, field);

    expect(field.canvasCoordinates?.x).toBe(80); // 50 + 30
    expect(field.canvasCoordinates?.y).toBe(90); // 50 + 40

    // Simulate mouseup
    (page as any).onWindowMouseUp({} as any, field);
    expect((page as any).isDragging).toBe(false);
  });

  it('resizes field bounding box via corner handle', () => {
    page.renderedWidth = 600;
    page.renderedHeight = 800;
    page.placeFieldAtCoordinates('text', 50, 50, 150, 30);
    const field = page.fields[0];
    page.selectField(field.id);

    const mouseDownEvent = { button: 0, clientX: 200, clientY: 80, stopPropagation: vi.fn(), preventDefault: vi.fn() } as any;
    page.onResizeHandleMouseDown(mouseDownEvent, 'br');

    // Drag bottom-right handle by +50px X, +20px Y
    const mouseMoveEvent = { clientX: 250, clientY: 100, preventDefault: vi.fn() } as any;
    (page as any).onWindowResizeMouseMove(mouseMoveEvent);

    expect(field.canvasCoordinates?.width).toBe(200); // 150 + 50
    expect(field.canvasCoordinates?.height).toBe(50); // 30 + 20

    (page as any).onWindowResizeMouseUp({} as any);
    expect((page as any).isResizing).toBe(false);
  });
});
