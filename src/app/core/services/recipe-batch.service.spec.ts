import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

import { RecipeBatchService, BUILTIN_STARTER_RECIPES, sanitizeZipEntryName } from './recipe-batch.service';
import { RecipeService } from './recipe.service';
import { StorageService } from './storage.service';
import { Recipe, RecipeStep, BatchPipelineProgress, MAX_BATCH_FILES } from '../models/recipe.types';

describe('RecipeBatchService — Batch Pipeline Runner & Starter Recipes', () => {
  let service: RecipeBatchService;
  let mockRecipeService: any;
  let mockStorageService: any;

  async function createTestPdf(name: string, content = 'Test Document'): Promise<File> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.drawText(content, { x: 50, y: 500 });
    const bytes = await doc.save();
    return new File([bytes as any], name, { type: 'application/pdf' });
  }

  beforeEach(() => {
    mockStorageService = {
      getQuotaStatus: vi.fn().mockResolvedValue({
        remaining: 20,
        isUnlimited: false,
        limit: 25,
        canStart: true
      })
    };

    mockRecipeService = {
      executePipeline: vi.fn().mockImplementation(async (file: File, recipe: Recipe, options: any) => {
        // Emit mock step progress
        for (let i = 0; i < recipe.steps.length; i++) {
          options?.onProgress?.({
            stepIndex: i,
            totalSteps: recipe.steps.length,
            stepId: recipe.steps[i].stepId,
            toolId: recipe.steps[i].toolId,
            label: recipe.steps[i].label,
            stepProgress: 100,
            status: 'completed'
          });
        }
        const output = await createTestPdf(`output_${file.name}`);
        return {
          success: true,
          totalSteps: recipe.steps.length,
          completedSteps: recipe.steps.length,
          outputFile: output
        };
      }),
      cleanupPipelineBuffers: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        RecipeBatchService,
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: StorageService, useValue: mockStorageService }
      ]
    });

    service = TestBed.inject(RecipeBatchService);
  });

  describe('Built-in Starter Recipes', () => {
    it('provides exactly 3 built-in starter recipes with descriptive functional names', () => {
      const starters = service.getStarterRecipes();
      expect(starters.length).toBe(3);

      const names = starters.map(s => s.name);
      expect(names).toContain('Compress to 2 MB, then number pages');
      expect(names).toContain('Scan cleanup: deskew, grayscale, OCR');
      expect(names).toContain('Submission prep: sanitize, flatten, preflight');
    });

    it('can find starter recipe by id or starterId', () => {
      const r1 = service.getStarterRecipeById('starter-compress-number');
      expect(r1).toBeDefined();
      expect(r1?.steps.length).toBe(2);

      const r2 = service.getStarterRecipeById('starter-scan-cleanup');
      expect(r2).toBeDefined();
      expect(r2?.steps.length).toBe(3);

      const r3 = service.getStarterRecipeById('starter-submission-prep');
      expect(r3).toBeDefined();
      expect(r3?.steps.length).toBe(3);

      const invalid = service.getStarterRecipeById('non-existent');
      expect(invalid).toBeUndefined();
    });
  });

  describe('Quota Pre-Check & Calculation', () => {
    it('checks quota impact accurately when free quota is sufficient', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 15,
        isUnlimited: false,
        limit: 25,
        canStart: true
      });

      const check = await service.checkQuotaForBatch(10);
      expect(check.canProceed).toBe(true);
      expect(check.requiredOps).toBe(10);
      expect(check.remainingOps).toBe(15);
      expect(check.message).toContain('10 files x 1 save = 10 operations');
    });

    it('warns when required files exceed remaining quota, calculating partial limit', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 3,
        isUnlimited: false,
        limit: 25,
        canStart: true
      });

      const check = await service.checkQuotaForBatch(5);
      expect(check.canProceed).toBe(true);
      expect(check.requiredOps).toBe(5);
      expect(check.remainingOps).toBe(3);
      expect(check.quotaExhaustedAtFileIndex).toBe(3);
      expect(check.message).toContain('Batch will process 3 files then stop');
    });

    it('blocks start if daily free quota is already 0', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 0,
        isUnlimited: false,
        limit: 25,
        canStart: false
      });

      const check = await service.checkQuotaForBatch(2);
      expect(check.canProceed).toBe(false);
      expect(check.quotaExhaustedAtFileIndex).toBe(0);
      expect(check.message).toContain('Daily free quota exhausted');
    });

    it('allows proceeding with unlimited status', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: null,
        isUnlimited: true,
        limit: 0,
        canStart: true
      });

      const check = await service.checkQuotaForBatch(50);
      expect(check.canProceed).toBe(true);
      expect(check.isUnlimited).toBe(true);
      expect(check.message).toContain('Unlimited operations available');
    });
  });

  describe('Batch Pipeline Runner Execution & Fault Tolerance', () => {
    it('executes a 3-step recipe over a 3-file batch producing 3 outputs with full execution log', async () => {
      const file1 = await createTestPdf('doc1.pdf');
      const file2 = await createTestPdf('doc2.pdf');
      const file3 = await createTestPdf('doc3.pdf');

      const testRecipe: Recipe = {
        id: 'test-recipe-3',
        name: '3-Step Pipeline',
        description: 'Testing 3 steps',
        isCustom: true,
        steps: [
          { stepId: 's1', toolId: 'compress', label: 'Step 1: Compress', parameters: { targetKB: 500 } },
          { stepId: 's2', toolId: 'page-numbers', label: 'Step 2: Number', parameters: { format: 'page-of-total' } },
          { stepId: 's3', toolId: 'flatten-form', label: 'Step 3: Flatten', parameters: { target: 'everything' } }
        ]
      };

      const progressSnapshots: BatchPipelineProgress[] = [];
      const result = await service.runBatch([file1, file2, file3], testRecipe, {
        onProgress: p => progressSnapshots.push({ ...p })
      });

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
      expect(result.completedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.skippedQuotaCount).toBe(0);
      expect(result.items.length).toBe(3);

      for (const item of result.items) {
        expect(item.status).toBe('completed');
        expect(item.outputFile).toBeDefined();
        expect(item.outputFile?.name).toBe(`output_${item.fileName}`);
      }

      expect(result.executionLog.length).toBeGreaterThanOrEqual(4);
      expect(result.executionLog[0]).toContain('[Batch Start]');
      expect(result.executionLog[result.executionLog.length - 1]).toContain('[Batch Summary]');
      expect(progressSnapshots.length).toBeGreaterThan(0);
    });

    it('ensures single file failure does NOT abort remaining batch (fault tolerance)', async () => {
      const file1 = await createTestPdf('file1.pdf');
      const file2 = await createTestPdf('file2_bad.pdf');
      const file3 = await createTestPdf('file3.pdf');

      // Make file2 fail in pipeline
      mockRecipeService.executePipeline.mockImplementation(async (file: File) => {
        if (file.name.includes('bad')) {
          return {
            success: false,
            failingStepIndex: 1,
            failingStepId: 'step-2',
            error: 'Corrupted image format inside PDF',
            totalSteps: 2,
            completedSteps: 1
          };
        }
        const output = await createTestPdf(`output_${file.name}`);
        return {
          success: true,
          totalSteps: 2,
          completedSteps: 2,
          outputFile: output
        };
      });

      const testRecipe: Recipe = {
        id: 'tolerant-recipe',
        name: 'Fault Tolerant Run',
        description: 'Tests failure resilience',
        isCustom: true,
        steps: [
          { stepId: 's1', toolId: 'compress', label: 'Compress', parameters: { targetKB: 1024 } },
          { stepId: 's2', toolId: 'page-numbers', label: 'Page Numbers', parameters: {} }
        ]
      };

      const result = await service.runBatch([file1, file2, file3], testRecipe);

      expect(result.totalFiles).toBe(3);
      expect(result.completedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.items[0].status).toBe('completed');
      expect(result.items[1].status).toBe('failed');
      expect(result.items[1].error).toContain('Corrupted image format inside PDF');
      // Verify File 3 was processed successfully despite File 2 failing!
      expect(result.items[2].status).toBe('completed');
      expect(result.items[2].outputFile).toBeDefined();

      const logText = result.executionLog.join('\n');
      expect(logText).toContain('[File 2/3: FAIL]');
      expect(logText).toContain('[File 3/3: OK]');
    });

    it('stops execution gracefully when quota limit is reached mid-batch', async () => {
      // Free quota only allows 2 operations
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 2,
        isUnlimited: false,
        limit: 10,
        canStart: true
      });

      const file1 = await createTestPdf('batch_a.pdf');
      const file2 = await createTestPdf('batch_b.pdf');
      const file3 = await createTestPdf('batch_c.pdf');
      const file4 = await createTestPdf('batch_d.pdf');

      const starterRecipe = service.getStarterRecipes()[0];
      const result = await service.runBatch([file1, file2, file3, file4], starterRecipe);

      expect(result.totalFiles).toBe(4);
      expect(result.completedCount).toBe(2);
      expect(result.skippedQuotaCount).toBe(2);
      expect(result.failedCount).toBe(0);

      expect(result.items[0].status).toBe('completed');
      expect(result.items[1].status).toBe('completed');
      expect(result.items[2].status).toBe('skipped_quota');
      expect(result.items[3].status).toBe('skipped_quota');

      const logText = result.executionLog.join('\n');
      expect(logText).toContain('[Quota Limit] Skipping file 3/4');
      expect(logText).toContain('[Quota Limit] Skipping file 4/4');
    });

    it('supports cancellation cleanly mid-batch', async () => {
      const file1 = await createTestPdf('cancel_1.pdf');
      const file2 = await createTestPdf('cancel_2.pdf');
      const cancelSignal = { isCancelled: false };

      mockRecipeService.executePipeline.mockImplementation(async (file: File) => {
        // Cancel signal triggers after file 1
        cancelSignal.isCancelled = true;
        const output = await createTestPdf(`output_${file.name}`);
        return { success: true, totalSteps: 1, completedSteps: 1, outputFile: output };
      });

      const recipe = service.getStarterRecipes()[0];
      const result = await service.runBatch([file1, file2], recipe, { cancelSignal });

      expect(result.cancelled).toBe(true);
      expect(result.completedCount).toBe(1);
      expect(result.items[0].status).toBe('completed');
      expect(result.items[1].status).toBe('queued');
      expect(result.executionLog.some(l => l.includes('[Batch Cancelled]'))).toBe(true);
    });
  });

  describe('Real Execution of Built-in Starter Recipes', () => {
    it('executes Starter Recipe 1 ("Compress to 2 MB, then number pages") with valid test input', async () => {
      // Use real RecipeService with TestBed injection
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          RecipeBatchService,
          RecipeService,
          {
            provide: StorageService,
            useValue: {
              getQuotaStatus: vi.fn().mockResolvedValue({
                remaining: 10,
                isUnlimited: false,
                limit: 20,
                canStart: true
              })
            }
          }
        ]
      });

      const realBatchService = TestBed.inject(RecipeBatchService);
      const starter1 = realBatchService.getStarterRecipes()[0];
      const testFile = await createTestPdf('starter1_doc.pdf');

      const result = await realBatchService.runBatch([testFile], starter1);
      expect(result.success).toBe(true);
      expect(result.completedCount).toBe(1);
      expect(result.items[0].outputFile).toBeDefined();
    });

    it('executes Starter Recipe 2 ("Scan cleanup: deskew, grayscale, OCR") with valid test input', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          RecipeBatchService,
          RecipeService,
          {
            provide: StorageService,
            useValue: {
              getQuotaStatus: vi.fn().mockResolvedValue({
                remaining: 10,
                isUnlimited: false,
                limit: 20,
                canStart: true
              })
            }
          }
        ]
      });

      const realBatchService = TestBed.inject(RecipeBatchService);
      const starter2 = realBatchService.getStarterRecipes()[1];
      const testFile = await createTestPdf('starter2_doc.pdf');

      const result = await realBatchService.runBatch([testFile], starter2);
      expect(result.success).toBe(true);
      expect(result.completedCount).toBe(1);
      expect(result.items[0].outputFile).toBeDefined();
    });

    it('executes Starter Recipe 3 ("Submission prep: sanitize, flatten, preflight") with valid test input', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          RecipeBatchService,
          RecipeService,
          {
            provide: StorageService,
            useValue: {
              getQuotaStatus: vi.fn().mockResolvedValue({
                remaining: 10,
                isUnlimited: false,
                limit: 20,
                canStart: true
              })
            }
          }
        ]
      });

      const realBatchService = TestBed.inject(RecipeBatchService);
      const starter3 = realBatchService.getStarterRecipes()[2];
      const testFile = await createTestPdf('starter3_doc.pdf');

      const result = await realBatchService.runBatch([testFile], starter3);
      expect(result.success).toBe(true);
      expect(result.completedCount).toBe(1);
      expect(result.items[0].outputFile).toBeDefined();
    });
  });

  describe('ZIP Packaging', () => {
    it('creates a valid ZIP package containing all completed files', async () => {
      const file1 = await createTestPdf('out1.pdf');
      const file2 = await createTestPdf('out2.pdf');

      const items: any[] = [
        { status: 'completed', outputFile: file1 },
        { status: 'failed', error: 'Skipped' },
        { status: 'completed', outputFile: file2 }
      ];

      const zipPkg = await service.createZipPackage(items, 'custom_outputs.zip');
      expect(zipPkg.fileName).toBe('custom_outputs.zip');
      expect(zipPkg.fileCount).toBe(2);
      expect(zipPkg.blob.size).toBeGreaterThan(0);

      // Verify ZIP archive contents using JSZip
      const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
      const filesInZip = Object.keys(zip.files);
      expect(filesInZip).toContain('out1.pdf');
      expect(filesInZip).toContain('out2.pdf');
    });

    it('throws error when no completed files are present in the batch', async () => {
      const items: any[] = [
        { status: 'failed', error: 'Error' },
        { status: 'skipped_quota' }
      ];

      await expect(service.createZipPackage(items)).rejects.toThrow(
        'No completed files found in batch to package into ZIP.'
      );
    });

    it('deduplicates identical file names inside the ZIP package', async () => {
      const file1 = await createTestPdf('report.pdf');
      const file2 = await createTestPdf('report.pdf');
      const file3 = await createTestPdf('report.pdf');

      const items: any[] = [
        { status: 'completed', outputFile: file1 },
        { status: 'completed', outputFile: file2 },
        { status: 'completed', outputFile: file3 }
      ];

      const zipPkg = await service.createZipPackage(items, 'dedup_test.zip');
      expect(zipPkg.fileCount).toBe(3);

      const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
      const entries = Object.keys(zip.files);
      expect(entries).toContain('report.pdf');
      expect(entries).toContain('report_1.pdf');
      expect(entries).toContain('report_2.pdf');
    });
  });

  describe('Cybersecurity Stress-Testing & Hardening', () => {
    it('defends against Zip Slip / Directory Traversal attacks in ZIP entries', async () => {
      // 1. Test filename sanitizer directly
      expect(sanitizeZipEntryName('../../../../etc/passwd')).toBe('etc_passwd');
      expect(sanitizeZipEntryName('..\\..\\Windows\\System32\\calc.exe')).toBe('Windows_System32_calc.exe');
      expect(sanitizeZipEntryName('/var/root/secret.pdf')).toBe('var_root_secret.pdf');
      expect(sanitizeZipEntryName('.../...//doc.pdf')).toBe('doc.pdf');
      expect(sanitizeZipEntryName('\x00evil\x1f.pdf')).toBe('evil.pdf');
      expect(sanitizeZipEntryName('   ')).toBe('batch_file_1.pdf');
      expect(sanitizeZipEntryName('____')).toBe('batch_file_1.pdf');

      // 2. Test createZipPackage with malicious traversal filenames
      const evilFile = await createTestPdf('test.pdf');
      // Create a File object whose name has directory traversal
      const maliciousFile = new File([await evilFile.arrayBuffer()], '../../../../etc/shadow', {
        type: 'application/pdf'
      });

      const items: any[] = [
        { status: 'completed', outputFile: maliciousFile }
      ];

      const zipPkg = await service.createZipPackage(items, '../../bad_archive.zip');
      // Verify archive name was sanitized
      expect(zipPkg.fileName).not.toContain('..');
      expect(zipPkg.fileName).not.toContain('/');

      // Verify entry name was sanitized
      const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
      const entries = Object.keys(zip.files);
      expect(entries.length).toBe(1);
      expect(entries[0]).not.toContain('..');
      expect(entries[0]).not.toContain('/');
      expect(entries[0]).not.toContain('\\');
    });

    it('enforces batch DoS limits (rejects batches exceeding MAX_BATCH_FILES)', async () => {
      const dummyFile = await createTestPdf('dummy.pdf');
      const files: File[] = [];
      for (let i = 0; i < MAX_BATCH_FILES + 5; i++) {
        files.push(dummyFile);
      }

      const recipe = service.getStarterRecipes()[0];
      await expect(service.runBatch(files, recipe)).rejects.toThrow(
        `Batch queue exceeds maximum limit of ${MAX_BATCH_FILES} files. Received 55. Please process in smaller batches.`
      );
    });

    it('guarantees context isolation and cleans up intermediate buffers after each file', async () => {
      const file1 = await createTestPdf('doc1.pdf');
      const file2 = await createTestPdf('doc2.pdf');

      let capturedPipelineOptions: any = null;
      mockRecipeService.executePipeline.mockImplementation(async (file: File, recipe: Recipe, options: any) => {
        capturedPipelineOptions = options;
        const out = await createTestPdf(`out_${file.name}`);
        return { success: true, totalSteps: 1, completedSteps: 1, outputFile: out };
      });

      const recipe = service.getStarterRecipes()[0];
      await service.runBatch([file1, file2], recipe);

      // Verify retainIntermediateFiles was set to false
      expect(capturedPipelineOptions?.retainIntermediateFiles).toBe(false);
      // Verify cleanupPipelineBuffers was called for each file
      expect(mockRecipeService.cleanupPipelineBuffers).toHaveBeenCalledTimes(2);
    });

    it('executes a 4-file batch on Starter Recipe 1 cleanly', async () => {
      const f1 = await createTestPdf('doc1.pdf');
      const f2 = await createTestPdf('doc2.pdf');
      const f3 = await createTestPdf('doc3.pdf');
      const f4 = await createTestPdf('doc4.pdf');

      const starter1 = service.getStarterRecipes()[0];
      const result = await service.runBatch([f1, f2, f3, f4], starter1);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(4);
      expect(result.completedCount).toBe(4);
      expect(result.failedCount).toBe(0);
      expect(result.skippedQuotaCount).toBe(0);
      for (let i = 0; i < 4; i++) {
        expect(result.items[i].status).toBe('completed');
        expect(result.items[i].outputFile).toBeDefined();
      }
    });

    it('preserves fault tolerance in 4-file batch when File 2 is corrupted (Files 1, 3, 4 succeed)', async () => {
      const f1 = await createTestPdf('file1.pdf');
      const f2 = await createTestPdf('file2_corrupted.pdf');
      const f3 = await createTestPdf('file3.pdf');
      const f4 = await createTestPdf('file4.pdf');

      mockRecipeService.executePipeline.mockImplementation(async (file: File) => {
        if (file.name.includes('corrupted')) {
          throw new Error('PDF stream header invalid: 0x00000000');
        }
        const out = await createTestPdf(`out_${file.name}`);
        return { success: true, totalSteps: 2, completedSteps: 2, outputFile: out };
      });

      const recipe = service.getStarterRecipes()[0];
      const result = await service.runBatch([f1, f2, f3, f4], recipe);

      expect(result.totalFiles).toBe(4);
      expect(result.completedCount).toBe(3);
      expect(result.failedCount).toBe(1);
      expect(result.items[0].status).toBe('completed');
      expect(result.items[1].status).toBe('failed');
      expect(result.items[1].error).toContain('PDF stream header invalid');
      expect(result.items[2].status).toBe('completed');
      expect(result.items[3].status).toBe('completed');
    });

    it('halts at limit with clear reporting when quota is 2 and 5 files are submitted', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 2,
        isUnlimited: false,
        limit: 10,
        canStart: true
      });

      const files = [
        await createTestPdf('q1.pdf'),
        await createTestPdf('q2.pdf'),
        await createTestPdf('q3.pdf'),
        await createTestPdf('q4.pdf'),
        await createTestPdf('q5.pdf')
      ];

      const recipe = service.getStarterRecipes()[0];
      const result = await service.runBatch(files, recipe);

      expect(result.totalFiles).toBe(5);
      expect(result.completedCount).toBe(2);
      expect(result.skippedQuotaCount).toBe(3);
      expect(result.items[0].status).toBe('completed');
      expect(result.items[1].status).toBe('completed');
      expect(result.items[2].status).toBe('skipped_quota');
      expect(result.items[3].status).toBe('skipped_quota');
      expect(result.items[4].status).toBe('skipped_quota');
      expect(result.executionLog.some(l => l.includes('Skipping file 3/5'))).toBe(true);
    });
  });
});
