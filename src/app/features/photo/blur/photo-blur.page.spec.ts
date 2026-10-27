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

  /**
   * Regression: the canvas backing store and its on-screen box are different
   * sizes (the viewport card caps it with max-width), and mapping pointer
   * positions through `displayScale` alone put every region short of where it
   * was drawn — part of the face or plate the user meant to hide stayed
   * visible. The mapping must go through the live bounding rect.
   */
  describe('pointer to image mapping', () => {
    function attachCanvas(imgW: number, imgH: number, cssW: number, cssH: number, backingW: number) {
      const canvas = {
        width: backingW,
        height: Math.round((backingW * imgH) / imgW),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        getBoundingClientRect: () => ({ left: 20, top: 50, width: cssW, height: cssH }) as DOMRect,
        parentElement: null
      } as unknown as HTMLCanvasElement;

      component.redactCanvasRef = { nativeElement: canvas };
      component.sourceImage = { width: imgW, height: imgH } as HTMLImageElement;
      component.imgWidth = imgW;
      component.imgHeight = imgH;
      // Deliberately stale: the old code trusted this value for hit-testing.
      component.displayScale = backingW / imgW;
      (component as any).redrawCanvas = vi.fn();
      return { left: 20, top: 50, cssW, cssH };
    }

    function pointerAt(sourceX: number, sourceY: number, imgW: number, imgH: number, box: any) {
      return {
        clientX: box.left + (sourceX / imgW) * box.cssW,
        clientY: box.top + (sourceY / imgH) * box.cssH,
        pointerId: 1,
        preventDefault: () => undefined
      } as unknown as PointerEvent;
    }

    it('places a dragged region exactly where it was drawn on a CSS-scaled canvas', () => {
      const imgW = 1000;
      const imgH = 700;
      // Backing store 335px wide but laid out at 311px: a 7.7% discrepancy.
      const box = attachCanvas(imgW, imgH, 311, 217.7, 335);

      component.onPointerDown(pointerAt(255, 470, imgW, imgH, box));
      component.onPointerMove(pointerAt(505, 560, imgW, imgH, box));
      component.onPointerUp();

      expect(component.regions).toHaveLength(1);
      const region = component.regions[0];
      expect(region.x).toBe(255);
      expect(region.y).toBe(470);
      expect(region.width).toBe(250);
      expect(region.height).toBe(90);
    });

    it('turns a tap into a region centred on the tap', () => {
      const imgW = 1000;
      const imgH = 700;
      const box = attachCanvas(imgW, imgH, 311, 217.7, 335);

      const tap = pointerAt(800, 220, imgW, imgH, box);
      component.onPointerDown(tap);
      component.onPointerUp();

      expect(component.regions).toHaveLength(1);
      const r = component.regions[0];
      expect(Math.round(r.x + r.width / 2)).toBe(800);
      expect(Math.round(r.y + r.height / 2)).toBe(220);
      expect(r.width).toBeGreaterThan(0);
    });

    it('keeps a region inside the image when the drag runs past the edge', () => {
      const imgW = 1000;
      const imgH = 700;
      const box = attachCanvas(imgW, imgH, 311, 217.7, 335);

      component.onPointerDown(pointerAt(900, 600, imgW, imgH, box));
      component.onPointerMove(pointerAt(1400, 1000, imgW, imgH, box));
      component.onPointerUp();

      const r = component.regions[0];
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(imgW);
      expect(r.y + r.height).toBeLessThanOrEqual(imgH);
    });
  });

  it('applies the intensity slider to every region already marked', () => {
    component.regions = [
      { id: 'a', x: 0, y: 0, width: 10, height: 10, type: 'blur', intensity: 3 },
      { id: 'b', x: 20, y: 20, width: 10, height: 10, type: 'blur', intensity: 3 }
    ];
    (component as any).redrawCanvas = vi.fn();

    component.intensity = 9;
    component.onIntensityChange();

    expect(component.regions.map(r => r.intensity)).toEqual([9, 9]);
  });

  it('applies a redaction-style change to every region already marked', () => {
    component.regions = [
      { id: 'a', x: 0, y: 0, width: 10, height: 10, type: 'blur', intensity: 5 }
    ];
    (component as any).redrawCanvas = vi.fn();

    component.setRedactionType('pixelate');

    expect(component.selectedType).toBe('pixelate');
    expect(component.regions[0].type).toBe('pixelate');
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
