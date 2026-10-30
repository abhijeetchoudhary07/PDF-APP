import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PDFDocument } from 'pdf-lib';

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined)
  },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR'
  }
}));

import { RecipeBatchPage } from './recipe-batch.page';
import { RecipeBatchService, BUILTIN_STARTER_RECIPES } from '../../core/services/recipe-batch.service';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import { StarterRecipe, Recipe, BatchFileQueueItem, BatchPipelineResult } from '../../core/models/recipe.types';

describe('RecipeBatchPage — Batch Recipe Runner UI', () => {
  let component: RecipeBatchPage;
  let mockBatchService: any;
  let mockRecipeService: any;
  let mockStorageService: any;
  let mockToastService: any;
  let mockRoute: any;

  async function createTestPdf(name: string): Promise<File> {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const bytes = await doc.save();
    return new File([bytes as any], name, { type: 'application/pdf' });
  }

  beforeEach(() => {
    mockBatchService = {
      getStarterRecipes: vi.fn().mockReturnValue([
        { ...BUILTIN_STARTER_RECIPES[0] },
        { ...BUILTIN_STARTER_RECIPES[1] },
        { ...BUILTIN_STARTER_RECIPES[2] }
      ]),
      getStarterRecipeById: vi.fn().mockImplementation((id: string) => {
        return BUILTIN_STARTER_RECIPES.find(r => r.id === id || r.starterId === id);
      }),
      checkQuotaForBatch: vi.fn().mockResolvedValue({
        canProceed: true,
        requiredOps: 2,
        remainingOps: 15,
        isUnlimited: false,
        message: '2 files x 1 save = 2 operations. Remaining today: 15.'
      }),
      runBatch: vi.fn().mockImplementation(async (files: File[], recipe: Recipe, options: any) => {
        const items: BatchFileQueueItem[] = [];
        for (const f of files) {
          const out = await createTestPdf(`out_${f.name}`);
          items.push({
            fileId: `id_${f.name}`,
            fileName: f.name,
            fileSize: f.size,
            status: 'completed',
            originalFile: f,
            outputFile: out
          });
        }
        return {
          success: true,
          totalFiles: files.length,
          completedCount: files.length,
          failedCount: 0,
          skippedQuotaCount: 0,
          items,
          executionLog: ['[Batch Start]', '[Batch Summary]'],
          totalExecutionTimeMs: 150
        } as BatchPipelineResult;
      }),
      createZipPackage: vi.fn().mockResolvedValue({
        blob: new Blob(['dummy zip'], { type: 'application/zip' }),
        fileName: 'batch_outputs.zip',
        fileCount: 2
      })
    };

    mockRecipeService = {
      getRecipes: vi.fn().mockResolvedValue([
        {
          id: 'custom-1',
          name: 'My Custom Workflow',
          description: 'A custom user pipeline',
          steps: [],
          isCustom: true
        }
      ])
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('/mock/saved/path')
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn()
    };

    mockRoute = {
      snapshot: {
        queryParamMap: {
          get: vi.fn().mockReturnValue(null)
        }
      }
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: RecipeBatchService, useValue: mockBatchService },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    component = TestBed.runInInjectionContext(() => new RecipeBatchPage());
  });

  it('initializes with 3 starter recipes and selects the first one by default', async () => {
    await component.ngOnInit();
    expect(component.starterRecipes.length).toBe(3);
    expect(component.selectedRecipe).toBeDefined();
    expect(component.selectedRecipe?.id).toBe('starter-compress-number');
    expect(component.customRecipes.length).toBe(1);
  });

  it('selects starter recipe from query parameter if present', async () => {
    mockRoute.snapshot.queryParamMap.get = vi.fn().mockImplementation((key: string) => {
      if (key === 'starter') return 'starter-scan-cleanup';
      return null;
    });

    await component.ngOnInit();
    expect(component.selectedRecipe?.id).toBe('starter-scan-cleanup');
  });

  it('selects custom recipe from query parameter if present', async () => {
    mockRoute.snapshot.queryParamMap.get = vi.fn().mockImplementation((key: string) => {
      if (key === 'recipe') return 'custom-1';
      return null;
    });

    await component.ngOnInit();
    expect(component.selectedRecipe?.id).toBe('custom-1');
  });

  it('switches active starter recipe on card selection', async () => {
    await component.ngOnInit();
    const starter3 = component.starterRecipes[2];
    await component.selectStarter(starter3);

    expect(component.selectedRecipe?.id).toBe('starter-submission-prep');
  });

  it('switches recipe via dropdown selector', async () => {
    await component.ngOnInit();
    await component.onRecipeDropdownChange('custom-1');

    expect(component.selectedRecipe?.id).toBe('custom-1');
  });

  it('adds files to the batch queue, rejecting non-PDF files', async () => {
    await component.ngOnInit();

    const pdf1 = await createTestPdf('file1.pdf');
    const pdf2 = await createTestPdf('file2.pdf');
    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await component.onFilesAdded([pdf1, pdf2]);
    expect(component.files.length).toBe(2);
    expect(component.queueItems.length).toBe(2);
    expect(component.queueItems[0].fileName).toBe('file1.pdf');

    // Reject non-PDFs
    await component.onFilesAdded([textFile]);
    expect(mockToastService.error).toHaveBeenCalledWith('Please upload PDF document files.');
  });

  it('removes an individual file and clears the queue', async () => {
    await component.ngOnInit();

    const pdf1 = await createTestPdf('f1.pdf');
    const pdf2 = await createTestPdf('f2.pdf');
    await component.onFilesAdded([pdf1, pdf2]);

    expect(component.files.length).toBe(2);
    await component.removeFile(0);
    expect(component.files.length).toBe(1);
    expect(component.files[0].name).toBe('f2.pdf');

    await component.clearQueue();
    expect(component.files.length).toBe(0);
    expect(component.queueItems.length).toBe(0);
  });

  it('executes batch recipe runner, updating queue and showing summary card', async () => {
    await component.ngOnInit();

    const pdf1 = await createTestPdf('a.pdf');
    const pdf2 = await createTestPdf('b.pdf');
    await component.onFilesAdded([pdf1, pdf2]);

    await component.startBatch();

    expect(mockBatchService.runBatch).toHaveBeenCalled();
    expect(component.isRunning).toBe(false);
    expect(component.isCompleted).toBe(true);
    expect(component.batchResult?.completedCount).toBe(2);
    expect(mockToastService.success).toHaveBeenCalledWith(
      'Batch completed: 2 file(s) processed successfully.'
    );
  });

  it('cancels batch when cancelBatch() is called', async () => {
    await component.ngOnInit();
    component.isRunning = true;
    component.cancelBatch();

    expect(component.cancelSignal.isCancelled).toBe(true);
    expect(component.isCancelled).toBe(true);
    expect(mockToastService.info).toHaveBeenCalledWith(
      'Cancelling batch execution after current step...'
    );
  });

  it('downloads all completed outputs as a ZIP file', async () => {
    await component.ngOnInit();

    const pdf1 = await createTestPdf('doc.pdf');
    await component.onFilesAdded([pdf1]);
    await component.startBatch();

    await component.downloadAllZip();

    expect(mockBatchService.createZipPackage).toHaveBeenCalled();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockToastService.success).toHaveBeenCalledWith(
      'ZIP downloaded: 2 files bundled.'
    );
  });

  it('downloads an individual completed file', async () => {
    await component.ngOnInit();

    const pdf1 = await createTestPdf('single.pdf');
    const item: BatchFileQueueItem = {
      fileId: 'item-1',
      fileName: 'single.pdf',
      fileSize: 1024,
      status: 'completed',
      originalFile: pdf1,
      outputFile: pdf1
    };

    await component.downloadSingle(item);
    expect(mockStorageService.saveFile).toHaveBeenCalledWith(pdf1, 'recipe_output', undefined, { preserveName: true });
    expect(mockToastService.success).toHaveBeenCalledWith('Saved "single.pdf".');
  });

  it('toggles execution log visibility', () => {
    expect(component.showExecutionLog).toBe(false);
    component.toggleExecutionLog();
    expect(component.showExecutionLog).toBe(true);
    component.toggleExecutionLog();
    expect(component.showExecutionLog).toBe(false);
  });

  it('caps file additions at MAX_BATCH_FILES (50) and issues warning toast', async () => {
    await component.ngOnInit();
    const testPdf = await createTestPdf('doc.pdf');
    const fiftyTwoFiles: File[] = [];
    for (let i = 0; i < 52; i++) {
      fiftyTwoFiles.push(testPdf);
    }

    await component.onFilesAdded(fiftyTwoFiles);
    expect(component.files.length).toBe(50);
    expect(mockToastService.warning).toHaveBeenCalledWith(
      'Batch capped at 50 files. Added 50 file(s), skipped 2.'
    );

    // Attempting to add more when full triggers error toast
    await component.onFilesAdded([testPdf]);
    expect(mockToastService.error).toHaveBeenCalledWith(
      'Maximum batch queue limit of 50 files reached.'
    );
  });

  it('returns proper badge variants for each status', () => {
    expect(component.getStatusBadgeVariant('queued')).toBe('neutral');
    expect(component.getStatusBadgeVariant('processing')).toBe('primary');
    expect(component.getStatusBadgeVariant('completed')).toBe('success');
    expect(component.getStatusBadgeVariant('failed')).toBe('danger');
    expect(component.getStatusBadgeVariant('skipped_quota')).toBe('warning');
  });
});
