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
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }
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
