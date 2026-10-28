import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BatchPage } from './batch.page';
import { FileService } from '../../core/services/file.service';
import { CompressionService } from '../../core/services/compression.service';
import { StorageService } from '../../core/services/storage.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { BatchImageService } from '../../core/services/batch-image.service';
import { ImageMetadataService } from '../../core/services/image-metadata.service';

describe('BatchPage (I10 Batch Suite Additions)', () => {
  let page: BatchPage;
  let mockFileService: any;
  let mockCompressionService: any;
  let mockStorageService: any;
  let mockBatchImageService: any;
  let mockMetadataService: any;
  let mockToastService: any;

  beforeEach(() => {
    mockFileService = {
      pickMultipleImages: vi.fn().mockResolvedValue([
        new File(['12345'], 'file1.jpg', { type: 'image/jpeg' }),
        new File(['12345678901234567890'], 'file2.jpg', { type: 'image/jpeg' })
      ])
    };

    mockCompressionService = {
      compressToExactKB: vi.fn().mockResolvedValue({
        success: true,
        file: new File(['compressed'], 'file.jpg', { type: 'image/jpeg' }),
        metadata: { sizeBytes: 30000 }
      })
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('/storage/file.jpg')
    };

    mockBatchImageService = {
      shouldSkipIfUnderTarget: vi.fn().mockImplementation((size: number, targetKB: number) => {
        return size <= targetKB * 1024;
      }),
      expandRenamePattern: vi.fn().mockReturnValue('IMG_2024_01_01_1.jpg'),
      exportCombinedPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
    };

    mockMetadataService = {
      extractMetadata: vi.fn().mockResolvedValue({
        camera: { orientation: 1 },
        dates: { dateTimeOriginal: new Date('2024-01-01T10:00:00Z') }
      })
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: FileService, useValue: mockFileService },
        { provide: CompressionService, useValue: mockCompressionService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: HistoryService, useValue: { addHistoryItem: vi.fn() } },
        { provide: ToastService, useValue: mockToastService },
        { provide: BatchImageService, useValue: mockBatchImageService },
        { provide: ImageMetadataService, useValue: mockMetadataService }
      ]
    });

    page = TestBed.runInInjectionContext(() => new BatchPage());
  });

  it('initializes with default batch settings and I10 options', () => {
    expect(page.items.length).toBe(0);
    expect(page.targetKB).toBe(50);
    expect(page.autoRotateExif).toBe(true);
    expect(page.skipIfUnderTarget).toBe(true);
    expect(page.pdfExportMode).toBe('individual');
  });

  it('adds selected files to queue', async () => {
    await page.selectFiles();
    expect(page.items.length).toBe(2);
    expect(page.items[0].file.name).toBe('file1.jpg');
    expect(page.items[1].file.name).toBe('file2.jpg');
  });

  it('skips files already under target KB', async () => {
    await page.selectFiles();
    // Target is 50 KB. File 1 is 5 bytes -> should be skipped
    page.skipIfUnderTarget = true;
    await page.processBatch();

    expect(page.items[0].status).toBe('skipped');
    expect(page.items[0].result?.file).toBe(page.items[0].file);
  });

  it('supports per-file target KB override', async () => {
    await page.selectFiles();
    page.items[0].targetKB = 100; // specific target
    await page.processBatch();

    expect(mockBatchImageService.shouldSkipIfUnderTarget).toHaveBeenCalledWith(5, 100);
  });

  it('inserts rename token into pattern', () => {
    page.insertRenameToken('{yyyy}');
    page.insertRenameToken('_{mm}');
    expect(page.renameTemplate).toBe('{yyyy}_{mm}');
  });

  it('exports combined PDF when combined mode is selected', async () => {
    await page.selectFiles();
    page.items[0].status = 'done';
    page.items[0].result = { success: true, file: page.items[0].file };
    page.pdfExportMode = 'combined-pdf';

    await page.saveAll();
    expect(mockBatchImageService.exportCombinedPdf).toHaveBeenCalled();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockToastService.success).toHaveBeenCalledWith('Combined PDF saved to your Documents folder.');
  });
});
