import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { PhotoCutoutPage } from './photo-cutout.page';
import { DocumentCutoutService } from '../../../core/services/document-cutout.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { HistoryService } from '../../../core/services/history.service';
import { DocumentBridgeService } from '../../../core/services/document-bridge.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';

describe('PhotoCutoutPage (I4)', () => {
  let component: PhotoCutoutPage;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DocumentCutoutService,
          useValue: {
            checkSuitability: vi.fn().mockReturnValue({ suitable: true, reason: '' }),
            cutoutDocumentBackground: vi.fn().mockResolvedValue(new Blob([], { type: 'image/png' }))
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

    component = TestBed.runInInjectionContext(() => new PhotoCutoutPage());
  });

  it('initializes with default tolerance and feather settings', () => {
    expect(component).toBeTruthy();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.tolerance).toBe(30);
    expect(component.feather).toBe(2);
  });

  it('allows updating tolerance and feathering values within bounds', () => {
    component.tolerance = 45;
    component.feather = 4;
    expect(component.tolerance).toBe(45);
    expect(component.feather).toBe(4);
  });

  /**
   * A cluttered photo cannot be cut out cleanly. It was reported in a banner
   * but the export button stayed live, so the refusal was advisory only and
   * the user still got a torn matte.
   */
  describe('unsuitable image handling', () => {
    it('blocks export until an unsuitable image is explicitly accepted', () => {
      component.suitability = { suitable: false, reason: 'Background is too varied.' };

      expect(component.canExport).toBe(false);

      component.acknowledgeUnsuitable();

      expect(component.canExport).toBe(true);
    });

    it('allows export straight away for a suitable image', () => {
      component.suitability = { suitable: true };

      expect(component.canExport).toBe(true);
      expect(component.overrideUnsuitable).toBe(false);
    });

    it('clears the acceptance when a different file is loaded', async () => {
      component.suitability = { suitable: false, reason: 'Background is too varied.' };
      component.acknowledgeUnsuitable();
      expect(component.canExport).toBe(true);

      component.reset();

      expect(component.overrideUnsuitable).toBe(false);
      expect(component.canExport).toBe(false);
    });
  });

  it('resets cleanly to empty state', () => {
    component.workflowState = 'SUCCESS';
    component.originalFile = new File(['mock'], 'doc.jpg', { type: 'image/jpeg' });
    component.reset();
    expect(component.workflowState).toBe('EMPTY');
    expect(component.originalFile).toBeUndefined();
    expect(component.processedFile).toBeUndefined();
  });
});
