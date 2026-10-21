import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { PhotoEnhancePage } from './photo-enhance.page';
import { ImageEnhanceService } from '../../../core/services/image-enhance.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';

describe('PhotoEnhancePage (I5)', () => {
  let component: PhotoEnhancePage;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ImageEnhanceService,
          useValue: {
            enhanceImage: vi.fn().mockResolvedValue({
              blob: new Blob([], { type: 'image/jpeg' }),
              width: 1000,
              height: 1000,
              scale: 2,
              unsharpApplied: true
            })
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

    component = TestBed.runInInjectionContext(() => new PhotoEnhancePage());
  });

  it('initializes with default 2x scale and unsharp mask settings', () => {
    expect(component).toBeTruthy();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.scale).toBe(2);
    expect(component.unsharpAmount).toBe(1.3);
    expect(component.unsharpThreshold).toBe(3);
  });

  it('can switch between 2x and 4x upscale multipliers', () => {
    component.scale = 4;
    expect(component.scale).toBe(4);
    component.scale = 2;
    expect(component.scale).toBe(2);
  });

  it('resets cleanly to empty state', () => {
    component.workflowState = 'SUCCESS';
    component.originalFile = new File(['mock'], 'scan.jpg', { type: 'image/jpeg' });
    component.reset();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.originalFile).toBeUndefined();
    expect(component.processedFile).toBeUndefined();
  });
});
