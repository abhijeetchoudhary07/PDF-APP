import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { PdfOptimizePage } from './pdf-optimize.page';
import { PdfOptimizerService } from '../../core/services/pdf-optimizer.service';
import { PdfImageInventoryService } from '../../core/services/pdf-image-inventory.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';

describe('PdfOptimizePage', () => {
  let optimizerService: Partial<PdfOptimizerService>;
  let inventoryService: Partial<PdfImageInventoryService>;
  let storageService: Partial<StorageService>;
  let shareService: Partial<ShareService>;
  let historyService: Partial<HistoryService>;
  let toastService: Partial<ToastService>;
  let bridgeService: Partial<DocumentBridgeService>;
  let router: Partial<Router>;

  beforeEach(() => {
    optimizerService = {
      planDownsample: vi.fn(),
      exportDownsampled: vi.fn(),
      planDedupe: vi.fn(),
      exportDeduped: vi.fn(),
      probeTextLayer: vi.fn().mockResolvedValue({ hasTextLayer: false, characterCount: 0, sampledPages: 0 }),
      exportColourPath: vi.fn(),
      buildProofSummary: vi.fn().mockReturnValue({
        beforeBytes: 1000,
        afterBytes: 500,
        savedBytes: 500,
        savedPercent: 50,
        pages: [],
        textRasterized: false
      }),
      renderProofPage: vi.fn(),
      exportStructureOptimized: vi.fn(),
      fitUploadLimit: vi.fn()
    };

    inventoryService = {
      inventory: vi.fn().mockResolvedValue({
        images: [],
        placements: [],
        unusedImageKeys: [],
        inlineImageCount: 0,
        totalImageBytes: 0,
        pageCount: 1,
        truncated: false
      })
    };

    storageService = {
      saveFile: vi.fn().mockResolvedValue(true)
    };

    shareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    historyService = {
      addEntry: vi.fn()
    };

    toastService = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    bridgeService = {
      consumeDocument: vi.fn().mockReturnValue(null),
      setDocument: vi.fn()
    };

    router = {
      navigate: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PdfOptimizerService, useValue: optimizerService },
        { provide: PdfImageInventoryService, useValue: inventoryService },
        { provide: StorageService, useValue: storageService },
        { provide: ShareService, useValue: shareService },
        { provide: HistoryService, useValue: historyService },
        { provide: ToastService, useValue: toastService },
        { provide: DocumentBridgeService, useValue: bridgeService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: () => null })
          }
        },
        {
          provide: ChangeDetectorRef,
          useValue: {
            detectChanges: vi.fn(),
            markForCheck: vi.fn()
          }
        }
      ]
    });
  });

  function createComponent(): PdfOptimizePage {
    const page = TestBed.runInInjectionContext(() => new PdfOptimizePage());
    page.ngOnInit();
    return page;
  }

  it('creates the optimize page component', () => {
    const page = createComponent();
    expect(page).toBeTruthy();
  });

  it('defaults to select step and images mode', () => {
    const page = createComponent();
    expect(page.currentStep).toBe('select');
    expect(page.activeMode).toBe('images');
  });

  it('switches modes smoothly', () => {
    const page = createComponent();
    page.setMode('colour');
    expect(page.activeMode).toBe('colour');

    page.setMode('duplicates');
    expect(page.activeMode).toBe('duplicates');

    page.setMode('fit');
    expect(page.activeMode).toBe('fit');

    page.setMode('structure');
    expect(page.activeMode).toBe('structure');

    page.setMode('proof');
    expect(page.activeMode).toBe('proof');
  });

  it('updates target preset on click', () => {
    const page = createComponent();
    page.setTargetPreset(200);
    expect(page.targetKB).toBe(200);
  });

  it('resets all state back to select step on resetAll()', () => {
    const page = createComponent();
    page.currentStep = 'configure';
    page.targetKB = 1000;
    page.resetAll();
    expect(page.currentStep).toBe('select');
    expect(page.selectedFile).toBeUndefined();
  });

  it('sets proof view mode', () => {
    const page = createComponent();
    page.setProofViewMode('before');
    expect(page.proofViewMode).toBe('before');
    page.setProofViewMode('after');
    expect(page.proofViewMode).toBe('after');
  });

  describe('reporting a pass that made the file bigger', () => {
    /*
     * A rasterising path can multiply a text document's size. The screen
     * shows the sign-free number beside a word that carries the direction,
     * so the percentage itself must never arrive negative.
     */
    it('reports the magnitude without its sign when the file grew', () => {
      const page = createComponent();
      page.outputResult = { savedBytes: -229077, savedPercent: -4753 } as any;
      expect(page.absSavedPercent).toBe(4753);
    });

    it('still reports a real saving unchanged', () => {
      const page = createComponent();
      page.outputResult = { savedBytes: 6874, savedPercent: 28 } as any;
      expect(page.absSavedPercent).toBe(28);
    });

    it('reports zero when nothing has run yet', () => {
      const page = createComponent();
      expect(page.absSavedPercent).toBe(0);
      expect(page.absProofPercent).toBe(0);
    });

    it('takes the proof percentage from the proof summary, not the output', () => {
      const page = createComponent();
      page.proofSummary = { savedBytes: -500, savedPercent: -120 } as any;
      expect(page.absProofPercent).toBe(120);
    });
  });

  it('clears a previous fit chain before running another mode', async () => {
    const page = createComponent();
    page.selectedFile = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    page.pdfBuffer = new ArrayBuffer(8);
    page.fitResult = { steps: [{ kind: 'dedupe' }], suggestSplit: true } as any;

    // The images path is what runs; the stale fit ledger must not survive it.
    (optimizerService.exportDownsampled as any) = vi.fn().mockResolvedValue({
      name: 'a_resampled.pdf',
      file: new File(['y'], 'a_resampled.pdf'),
      blob: { arrayBuffer: async () => new ArrayBuffer(4) },
      sizeBytes: 4,
      pageCount: 1,
      notices: [],
      originalSizeBytes: 8,
      savedBytes: 4,
      savedPercent: 50,
      rasterized: false
    });

    page.activeMode = 'images';
    await page.runCurrentOptimization();

    expect(page.fitResult).toBeUndefined();
  });
});
