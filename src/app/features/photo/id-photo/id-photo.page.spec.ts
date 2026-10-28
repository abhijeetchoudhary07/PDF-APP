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

  /**
   * `FaceDetector` ships in almost no Android WebView, so on the devices this
   * app targets the manual guide is the only path to a correct crop. It was
   * drawn but could not be moved, which made the tool a lottery on any photo
   * where the head was not dead centre.
   */
  describe('manual guide adjustment', () => {
    const IMG_W = 1000;
    const IMG_H = 1200;

    function attachCanvas() {
      const canvas = {
        width: 300,
        height: 360,
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        getBoundingClientRect: () => ({ left: 10, top: 40, width: 250, height: 300 }) as DOMRect,
        parentElement: null,
        getContext: () => null
      } as unknown as HTMLCanvasElement;

      component.previewCanvasRef = { nativeElement: canvas };
      component.sourceImage = { width: IMG_W, height: IMG_H } as HTMLImageElement;
      component.imgWidth = IMG_W;
      component.imgHeight = IMG_H;
      (component as any).previewScale = 250 / IMG_W;
      (component as any).drawPreview = vi.fn();
      (component as any).checkBackgroundSuitability = vi.fn();
      component.currentFaceBox = { x: 400, y: 300, width: 200, height: 250 };
    }

    function pointerAt(sourceX: number, sourceY: number) {
      return {
        clientX: 10 + (sourceX / IMG_W) * 250,
        clientY: 40 + (sourceY / IMG_H) * 300,
        pointerId: 1,
        preventDefault: () => undefined
      } as unknown as PointerEvent;
    }

    beforeEach(() => attachCanvas());

    it('moves the guide by the dragged distance', () => {
      const before = { ...component.currentFaceBox };

      component.onGuidePointerDown(pointerAt(before.x + 100, before.y + 125));
      component.onGuidePointerMove(pointerAt(before.x + 140, before.y + 185));
      component.onGuidePointerUp();

      expect(component.currentFaceBox.x).toBe(before.x + 40);
      expect(component.currentFaceBox.y).toBe(before.y + 60);
      expect(component.currentFaceBox.width).toBe(before.width);
      expect(component.currentFaceBox.height).toBe(before.height);
    });

    it('resizes from a corner handle without moving the opposite corner', () => {
      const before = { ...component.currentFaceBox };

      component.onGuidePointerDown(pointerAt(before.x + before.width, before.y + before.height));
      component.onGuidePointerMove(pointerAt(before.x + before.width + 50, before.y + before.height + 50));
      component.onGuidePointerUp();

      expect(component.currentFaceBox.x).toBe(before.x);
      expect(component.currentFaceBox.y).toBe(before.y);
      expect(component.currentFaceBox.width).toBe(before.width + 50);
      expect(component.currentFaceBox.height).toBe(before.height + 50);
    });

    it('keeps the guide inside the photo when dragged past the edge', () => {
      component.onGuidePointerDown(pointerAt(500, 425));
      component.onGuidePointerMove(pointerAt(5000, 5000));
      component.onGuidePointerUp();

      const b = component.currentFaceBox;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(IMG_W);
      expect(b.y + b.height).toBeLessThanOrEqual(IMG_H);
    });

    it('treats an edited guide as the manual path even after a detection', () => {
      component.detectedFace = { x: 400, y: 300, width: 200, height: 250 };
      component.manualGuideMode = false;

      component.onGuidePointerDown(pointerAt(500, 425));
      component.onGuidePointerMove(pointerAt(520, 445));
      component.onGuidePointerUp();

      expect(component.manualGuideMode).toBe(true);
    });

    it('restores the detected box when the guide is reset', () => {
      component.detectedFace = { x: 410, y: 310, width: 180, height: 220 };
      component.currentFaceBox = { x: 0, y: 0, width: 100, height: 100 };

      component.resetGuide();

      expect(component.currentFaceBox).toEqual({ x: 410, y: 310, width: 180, height: 220 });
      expect(component.manualGuideMode).toBe(false);
    });
  });

  /**
   * The custom width / height / KB fields existed but nothing could set
   * `isCustomSize`, so an exact portal spec was unreachable.
   */
  describe('custom output size', () => {
    it('uses the custom dimensions once custom size is chosen', () => {
      (component as any).drawPreview = vi.fn();

      component.useCustomSize();
      component.customWidthPx = 200;
      component.customHeightPx = 230;
      component.customTargetKB = 40;
      component.onCustomSizeChange();

      expect(component.isCustomSize).toBe(true);
      expect(component.outputWidthPx).toBe(200);
      expect(component.outputHeightPx).toBe(230);
    });

    it('clamps out-of-range custom values instead of producing a broken canvas', () => {
      (component as any).drawPreview = vi.fn();

      component.useCustomSize();
      component.customWidthPx = 0;
      component.customHeightPx = 99999;
      component.customTargetKB = 0;
      component.onCustomSizeChange();

      expect(component.customWidthPx).toBeGreaterThanOrEqual(50);
      expect(component.customHeightPx).toBeLessThanOrEqual(4000);
      expect(component.customTargetKB).toBeGreaterThanOrEqual(5);
    });

    it('falls back to the selected preset when custom size is off', () => {
      (component as any).drawPreview = vi.fn();

      component.selectPreset(component.presets[2]);

      expect(component.isCustomSize).toBe(false);
      expect(component.outputWidthPx).toBe(component.presets[2].widthPx);
      expect(component.outputHeightPx).toBe(component.presets[2].heightPx);
    });
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
