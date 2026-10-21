import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PhotoWatermarkPage } from './photo-watermark.page';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { ImageWatermarkService } from '../../../core/services/image-watermark.service';
import { ChangeDetectorRef } from '@angular/core';
import { createSafeCanvas } from '../../../core/utilities/canvas-headless.util';

describe('PhotoWatermarkPage', () => {
  let page: PhotoWatermarkPage;
  let mockWatermarkService: any;
  let mockStorageService: any;
  let mockToastService: any;

  beforeEach(() => {
    const fakeCanvas = createSafeCanvas(200, 200);

    mockWatermarkService = {
      getPresets: vi.fn().mockReturnValue([
        {
          id: 'confidential',
          name: 'Confidential',
          isBuiltin: true,
          options: {
            mode: 'tile',
            position: 'center',
            opacity: 0.25,
            textConfig: {
              type: 'text',
              text: 'CONFIDENTIAL',
              fontSize: 36,
              color: '#dc2626',
              opacity: 0.25,
              rotationDegrees: -30
            }
          }
        }
      ]),
      applyWatermark: vi.fn().mockReturnValue(fakeCanvas),
      savePreset: vi.fn(),
      deletePreset: vi.fn()
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('/storage/watermarked.jpg')
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ImageWatermarkService, useValue: mockWatermarkService },
        { provide: FileService, useValue: { pickMultipleImages: vi.fn() } },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: { shareFile: vi.fn() } },
        { provide: ToastService, useValue: mockToastService },
        { provide: HistoryService, useValue: { addHistoryItem: vi.fn() } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new PhotoWatermarkPage());
  });

  it('initializes in EMPTY workflow state and loads presets', () => {
    expect(page.workflowState).toBe('EMPTY');
    expect(page.presets.length).toBe(1);
    expect(page.textValue).toBe('CONFIDENTIAL');
    expect(page.selectedPosition).toBe('center');
  });

  it('transitions to CONFIGURING on file selection', async () => {
    const file = new File(['test_image_data'], 'sample.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    expect(page.workflowState).toBe('CONFIGURING');
    expect(page.files.length).toBe(1);
    expect(mockWatermarkService.applyWatermark).toHaveBeenCalled();
  });

  it('applies a preset configuration correctly', () => {
    const preset = page.presets[0];
    page.applyPreset(preset);

    expect(page.layoutMode).toBe('tile');
    expect(page.textValue).toBe('CONFIDENTIAL');
    expect(page.textColor).toBe('#dc2626');
    expect(page.rotationDegrees).toBe(-30);
  });

  it('saves watermarked file to storage service', async () => {
    const file = new File(['test_image_data'], 'sample.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    await page.saveOutput();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockToastService.success).toHaveBeenCalled();
  });
});
