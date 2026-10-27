import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PhotoSheetPage } from './photo-sheet.page';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { PhotoSheetService } from '../../../core/services/photo-sheet.service';
import { ChangeDetectorRef } from '@angular/core';
import { createSafeCanvas } from '../../../core/utilities/canvas-headless.util';

describe('PhotoSheetPage', () => {
  let page: PhotoSheetPage;
  let mockSheetService: any;
  let mockStorageService: any;
  let mockToastService: any;

  beforeEach(() => {
    const fakeCanvas = createSafeCanvas(600, 800);

    mockSheetService = {
      renderSheetCanvas: vi.fn().mockReturnValue(fakeCanvas),
      exportToPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('/storage/photo_sheet.jpg')
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PhotoSheetService, useValue: mockSheetService },
        { provide: FileService, useValue: { pickMultipleImages: vi.fn() } },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: { shareFile: vi.fn() } },
        { provide: ToastService, useValue: mockToastService },
        { provide: HistoryService, useValue: { addHistoryItem: vi.fn() } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new PhotoSheetPage());
  });

  it('initializes in EMPTY workflow state with defaults', () => {
    expect(page.workflowState).toBe('EMPTY');
    expect(page.paperSize).toBe('a4');
    expect(page.rows).toBe(3);
    expect(page.columns).toBe(2);
    expect(page.totalCells).toBe(6);
  });

  it('transitions to CONFIGURING on file selection and triggers sheet rendering', async () => {
    const file = new File(['test_photo'], 'portrait.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    expect(page.workflowState).toBe('CONFIGURING');
    expect(page.files.length).toBe(1);
    expect(mockSheetService.renderSheetCanvas).toHaveBeenCalled();
  });

  /**
   * Regression: the first paint ran one statement after `workflowState` became
   * CONFIGURING, before Angular had rendered that block, so the ViewChild was
   * undefined, the paint was skipped and nothing retried. The user uploaded
   * photos and sat looking at an empty box.
   */
  describe('preview paints on the first render', () => {
    function attachCanvasOnDemand() {
      const canvas = createSafeCanvas(1, 1);
      let attached = false;
      // The ViewChild only exists once change detection has run, which is
      // exactly the ordering that used to lose the first paint.
      Object.defineProperty(page, 'sheetCanvasRef', {
        configurable: true,
        get: () => (attached ? { nativeElement: canvas } : undefined)
      });
      (page as any).cdr = { markForCheck: vi.fn(), detectChanges: vi.fn(() => { attached = true; }) };
      return canvas;
    }

    it('paints the sheet even though the canvas appears only after change detection', async () => {
      const canvas = attachCanvasOnDemand();
      page.loadedImageCanvases = [createSafeCanvas(400, 500)];

      page.updateSheetPreview();

      expect(canvas.width).toBe(600);
      expect(canvas.height).toBe(800);
    });

    it('still paints when the canvas is already present', () => {
      const canvas = createSafeCanvas(1, 1);
      (page as any).sheetCanvasRef = { nativeElement: canvas };
      page.loadedImageCanvases = [createSafeCanvas(400, 500)];

      page.updateSheetPreview();

      expect(canvas.width).toBe(600);
    });
  });

  it('applies grid preset and recalculates layout', () => {
    page.applyGridPreset({ rows: 2, columns: 2 });
    expect(page.rows).toBe(2);
    expect(page.columns).toBe(2);
    expect(page.totalCells).toBe(4);
  });

  it('exports sheet as image', async () => {
    const file = new File(['test_photo'], 'portrait.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    await page.exportAsImage();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockToastService.success).toHaveBeenCalled();
  });

  it('exports sheet as PDF', async () => {
    const file = new File(['test_photo'], 'portrait.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    await page.exportAsPdf();
    expect(mockSheetService.exportToPdf).toHaveBeenCalled();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockToastService.success).toHaveBeenCalled();
  });
});
