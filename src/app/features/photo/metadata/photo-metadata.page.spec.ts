import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PhotoMetadataPage } from './photo-metadata.page';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { ImageMetadataService } from '../../../core/services/image-metadata.service';
import { ChangeDetectorRef } from '@angular/core';

describe('PhotoMetadataPage', () => {
  let page: PhotoMetadataPage;
  let mockMetadataService: any;
  let mockFileService: any;
  let mockStorageService: any;
  let mockToastService: any;

  beforeEach(() => {
    mockMetadataService = {
      extractMetadata: vi.fn().mockResolvedValue({
        fileName: 'test.jpg',
        fileSizeBytes: 2048,
        mimeType: 'image/jpeg',
        hasExif: true,
        camera: { make: 'Canon', model: 'EOS R5' },
        gps: { latitude: 28.6139, longitude: 77.2090, mapsUrl: 'https://maps.google.com' },
        dates: { dateTimeOriginal: new Date('2024-01-01T10:00:00Z') },
        rawTags: {}
      }),
      batchShiftDates: vi.fn().mockResolvedValue([
        { fileName: 'test.jpg', success: true, repairedDate: new Date('2024-01-01T12:00:00Z') }
      ]),
      stripMetadata: vi.fn().mockResolvedValue(new Blob(['clean_data'], { type: 'image/jpeg' }))
    };

    mockFileService = {
      pickMultipleImages: vi.fn().mockResolvedValue([new File(['test'], 'picked.jpg', { type: 'image/jpeg' })])
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('/storage/clean_test.jpg')
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ImageMetadataService, useValue: mockMetadataService },
        { provide: FileService, useValue: mockFileService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: { shareFile: vi.fn() } },
        { provide: ToastService, useValue: mockToastService },
        { provide: HistoryService, useValue: { addHistoryItem: vi.fn() } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new PhotoMetadataPage());
  });

  it('initializes in EMPTY workflow state', () => {
    expect(page.workflowState).toBe('EMPTY');
    expect(page.files.length).toBe(0);
    expect(page.selectedIndex).toBe(0);
  });

  it('loads metadata when files are selected', async () => {
    const file = new File(['test_bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    expect(page.workflowState).toBe('CONFIGURING');
    expect(page.files.length).toBe(1);
    expect(page.metadataList.length).toBe(1);
    expect(page.currentMeta?.camera.make).toBe('Canon');
    expect(page.currentMeta?.gps?.latitude).toBeCloseTo(28.6139);
  });

  it('applies date shift via metadata service', async () => {
    const file = new File(['test_bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    page.dateShiftOffset = { days: 0, hours: 2, minutes: 0, seconds: 0 };
    await page.applyDateShift();

    expect(mockMetadataService.batchShiftDates).toHaveBeenCalledWith([file], page.dateShiftOffset);
    expect(page.repairResults.length).toBe(1);
    expect(mockToastService.success).toHaveBeenCalled();
  });

  it('strips metadata on request', async () => {
    const file = new File(['test_bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await page.handleFileSelected(file);

    await page.stripMetadataCurrent();
    expect(mockMetadataService.stripMetadata).toHaveBeenCalledWith(file);
    expect(page.cleanedBlob).toBeDefined();
    expect(mockToastService.success).toHaveBeenCalled();
  });
});
