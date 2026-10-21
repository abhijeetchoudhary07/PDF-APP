import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { IdPhotoPage } from './id-photo.page';
import { IdPhotoService } from '../../../core/services/id-photo.service';
import { CompressionService } from '../../../core/services/compression.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ID_PHOTO_PRESETS } from '../../../core/models/id-photo.types';

describe('IdPhotoPage (I1 & I2)', () => {
  let component: IdPhotoPage;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: IdPhotoService,
          useValue: {
            detectFace: vi.fn().mockResolvedValue(null),
            computeCrop: vi.fn().mockReturnValue({ x: 0, y: 0, width: 300, height: 400 }),
            checkBackgroundSuitability: vi.fn().mockReturnValue({ suitable: true, variance: 0 }),
            renderIdPhoto: vi.fn().mockResolvedValue(new Blob()),
            generatePrintSheet: vi.fn().mockResolvedValue(new Blob())
          }
        },
        {
          provide: CompressionService,
          useValue: {
            compressImage: vi.fn().mockResolvedValue(new File(['test'], 'out.jpg', { type: 'image/jpeg' }))
          }
        },
        {
          provide: StorageService,
          useValue: { saveFile: vi.fn().mockResolvedValue(true) }
        },
        {
          provide: ShareService,
          useValue: { shareFile: vi.fn().mockResolvedValue(true) }
        },
        {
          provide: HistoryService,
          useValue: { addEntry: vi.fn() }
        },
        {
          provide: DocumentBridgeService,
          useValue: { consumeDocument: vi.fn().mockReturnValue(null), setDocument: vi.fn() }
        },
        {
          provide: ToastService,
          useValue: { show: vi.fn(), error: vi.fn() }
        },
        {
          provide: TranslationService,
          useValue: { instant: (k: string) => k, currentLang: () => 'en' }
        },
        {
          provide: ChangeDetectorRef,
          useValue: { detectChanges: vi.fn(), markForCheck: vi.fn() }
        }
      ]
    });

    component = TestBed.runInInjectionContext(() => new IdPhotoPage());
  });

  it('creates the component with initial empty workflow state', () => {
    expect(component).toBeTruthy();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.activeTab).toBe('crop');
  });

  it('loads standard dimensions-only presets with none named by institution', () => {
    expect(component.presets.length).toBeGreaterThanOrEqual(5);
    for (const preset of component.presets) {
      expect(preset.name).toMatch(/mm|px|KB/i);
      // Ensures no institution / exam board names are present
      expect(preset.name).not.toMatch(/ssc|upsc|ibps|gate|neet/i);
    }
  });

  it('switches between presets and updates dimensions and target KB', () => {
    const preset50x50 = ID_PHOTO_PRESETS.find(p => p.id === '50x50_200kb');
    expect(preset50x50).toBeDefined();

    component.selectPreset(preset50x50!);
    expect(component.selectedPreset.id).toBe('50x50_200kb');
    expect(component.selectedPreset.widthPx).toBe(600);
    expect(component.selectedPreset.heightPx).toBe(600);
    expect(component.selectedPreset.targetKB).toBe(200);
  });

  it('allows switching between Crop, Background, and Print Sheet tabs', () => {
    component.activeTab = 'background';
    expect(component.activeTab).toBe('background');

    component.activeTab = 'sheet';
    expect(component.activeTab).toBe('sheet');
  });

  it('resets back to empty state cleanly', () => {
    component.workflowState = 'SUCCESS';
    component.originalFile = new File(['mock'], 'photo.jpg', { type: 'image/jpeg' });
    component.reset();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.originalFile).toBeUndefined();
    expect(component.processedFile).toBeUndefined();
  });
});
