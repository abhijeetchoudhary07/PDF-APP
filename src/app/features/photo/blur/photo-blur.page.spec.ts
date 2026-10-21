import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { PhotoBlurPage } from './photo-blur.page';
import { ImageRedactionService } from '../../../core/services/image-redaction.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';

describe('PhotoBlurPage (I3)', () => {
  let component: PhotoBlurPage;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ImageRedactionService,
          useValue: {
            detectFaces: vi.fn().mockResolvedValue([]),
            applyRedactions: vi.fn().mockResolvedValue(new Blob()),
            redactBatch: vi.fn().mockResolvedValue([])
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

    component = TestBed.runInInjectionContext(() => new PhotoBlurPage());
  });

  it('initializes with empty state and default blur mode', () => {
    expect(component).toBeTruthy();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.selectedType).toBe('blur');
    expect(component.intensity).toBe(6);
  });

  it('can toggle between blur and pixelate redaction modes', () => {
    component.selectedType = 'pixelate';
    expect(component.selectedType).toBe('pixelate');
    component.selectedType = 'blur';
    expect(component.selectedType).toBe('blur');
  });

  it('manages redaction regions and clear all', () => {
    component.regions = [
      { id: '1', x: 10, y: 10, width: 50, height: 50, type: 'blur', intensity: 5 },
      { id: '2', x: 70, y: 70, width: 40, height: 40, type: 'pixelate', intensity: 7 }
    ];
    expect(component.regions.length).toBe(2);

    component.removeRegion(0);
    expect(component.regions.length).toBe(1);
    expect(component.regions[0].id).toBe('2');

    component.clearAllRegions();
    expect(component.regions.length).toBe(0);
  });

  it('resets all state cleanly', () => {
    component.workflowState = 'SUCCESS';
    component.originalFile = new File(['mock'], 'blur.jpg', { type: 'image/jpeg' });
    component.regions = [{ id: '1', x: 0, y: 0, width: 20, height: 20, type: 'blur', intensity: 5 }];
    component.reset();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.originalFile).toBeUndefined();
    expect(component.regions.length).toBe(0);
  });
});
