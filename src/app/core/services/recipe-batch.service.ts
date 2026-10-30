import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';

import {
  Recipe,
  StarterRecipe,
  BatchFileQueueItem,
  BatchFileStatus,
  BatchPipelineProgress,
  BatchPipelineResult,
  PipelineExecutionOptions,
  MAX_BATCH_FILES
} from '../models/recipe.types';
import { RecipeService } from './recipe.service';
import { StorageService } from './storage.service';

/**
 * 3 Built-in Starter Recipes with descriptive functional names:
 * 1. "Compress to 2 MB, then number pages" (Compression -> Bates/Page Numbering)
 * 2. "Scan cleanup: deskew, grayscale, OCR" (Deskew -> Grayscale Filter -> OCR Searchable PDF)
 * 3. "Submission prep: sanitize, flatten, preflight" (Privacy Sanitize -> AcroForm Flatten -> PDF Preflight Check)
 */
export const BUILTIN_STARTER_RECIPES: StarterRecipe[] = [
  {
    id: 'starter-compress-number',
    starterId: 'starter-compress-number',
    name: 'Compress to 2 MB, then number pages',
    description: 'Compress PDF size under 2 MB and stamp sequential page numbering at the bottom of all pages.',
    badge: 'Submission Ready',
    icon: 'speedometer-outline',
    summary: 'Compress to 2 MB → Bates/Page Numbering',
    isCustom: false,
    steps: [
      {
        stepId: 'step-compress-2mb',
        toolId: 'compress',
        label: 'Compress to 2 MB',
        parameters: { targetKB: 2048 }
      },
      {
        stepId: 'step-number-pages',
        toolId: 'page-numbers',
        label: 'Add Page Numbers',
        parameters: { format: 'page-of-total', position: 'bottom-center', fontSize: 10 }
      }
    ]
  },
  {
    id: 'starter-scan-cleanup',
    starterId: 'starter-scan-cleanup',
    name: 'Scan cleanup: deskew, grayscale, OCR',
    description: 'Deskew crooked scans, apply clean grayscale filter, and create searchable OCR text layer.',
    badge: 'Scan Enhancement',
    icon: 'scan-outline',
    summary: 'Deskew → Grayscale Filter → OCR Searchable PDF',
    isCustom: false,
    steps: [
      {
        stepId: 'step-deskew',
        toolId: 'deskew',
        label: 'Deskew & Straighten',
        parameters: { mode: 'auto' }
      },
      {
        stepId: 'step-grayscale',
        toolId: 'grayscale',
        label: 'Grayscale Tone Pass',
        parameters: { dpi: 150, quality: 0.85 }
      },
      {
        stepId: 'step-ocr',
        toolId: 'ocr',
        label: 'OCR Searchable PDF',
        parameters: { language: 'eng' }
      }
    ]
  },
  {
    id: 'starter-submission-prep',
    starterId: 'starter-submission-prep',
    name: 'Submission prep: sanitize, flatten, preflight',
    description: 'Strip identifying metadata and tracking scripts, bake interactive AcroForm fields into vectors, and perform preflight checks.',
    badge: 'Portal Prep',
    icon: 'shield-checkmark-outline',
    summary: 'Privacy Sanitize → AcroForm Flatten → PDF Preflight Check',
    isCustom: false,
    steps: [
      {
        stepId: 'step-sanitize',
        toolId: 'sanitize',
        label: 'Privacy Sanitize',
        parameters: { removeMetadata: true, removeScripts: true, removeForms: false }
      },
      {
        stepId: 'step-flatten',
        toolId: 'flatten-form',
        label: 'AcroForm Flatten',
        parameters: { target: 'everything' }
      },
      {
        stepId: 'step-preflight',
        toolId: 'preflight',
        label: 'PDF Preflight Check',
        parameters: { profile: 'default' }
      }
    ]
  }
];

export interface BatchRunOptions {
  onProgress?: (progress: BatchPipelineProgress) => void;
  cancelSignal?: { isCancelled: boolean };
  batchId?: string;
}

export interface QuotaPreCheckResult {
  canProceed: boolean;
  requiredOps: number;
  remainingOps: number | null;
  isUnlimited: boolean;
  quotaExhaustedAtFileIndex?: number;
  message: string;
}

/**
 * Sanitizes a filename for inclusion as an entry in a ZIP archive,
 * strictly defending against Zip Slip / Directory Traversal attacks.
 */
export function sanitizeZipEntryName(fileName: string, fallbackIndex = 1): string {
  if (!fileName || typeof fileName !== 'string') {
    return `batch_file_${fallbackIndex}.pdf`;
  }

  // 1. Strip path traversal sequences, backslashes, forward slashes
  let sanitized = fileName.replace(/[/\\]+/g, '_');
  sanitized = sanitized.replace(/\.\.+/g, '_');

  // 2. Remove control characters, null bytes, non-printable characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // 3. Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // 4. Remove leading/trailing dots, underscores, and whitespace
  sanitized = sanitized.trim().replace(/^[_.\s]+|[_.\s]+$/g, '');

  // 5. Default fallback if empty
  if (!sanitized) {
    sanitized = `batch_file_${fallbackIndex}.pdf`;
  }

  // 6. Ensure valid extension if original ended with .pdf
  if (!sanitized.toLowerCase().endsWith('.pdf') && fileName.toLowerCase().endsWith('.pdf')) {
    sanitized += '.pdf';
  }

  return sanitized;
}

@Injectable({
  providedIn: 'root'
})
export class RecipeBatchService {
  private recipeService = inject(RecipeService);
  private storageService = inject(StorageService);

  /**
   * Retrieves the 3 built-in starter recipes.
   */
  getStarterRecipes(): StarterRecipe[] {
    return BUILTIN_STARTER_RECIPES.map(recipe => ({
      ...recipe,
      steps: recipe.steps.map(s => ({ ...s, parameters: { ...s.parameters } }))
    }));
  }

  /**
   * Finds a starter recipe by id or starterId.
   */
  getStarterRecipeById(id: string): StarterRecipe | undefined {
    return this.getStarterRecipes().find(r => r.id === id || r.starterId === id);
  }

  /**
   * Checks remaining daily free quota against the queue length upfront.
   */
  async checkQuotaForBatch(fileCount: number): Promise<QuotaPreCheckResult> {
    const requiredOps = fileCount;
    let remainingOps: number | null = null;
    let isUnlimited = false;
    let canStart = true;

    try {
      const quotaStatus = await this.storageService.getQuotaStatus();
      remainingOps = quotaStatus.remaining;
      isUnlimited = quotaStatus.isUnlimited;
      canStart = quotaStatus.canStart;
    } catch {
      return {
        canProceed: true,
        requiredOps,
        remainingOps: null,
        isUnlimited: true,
        message: `${fileCount} files queued for batch recipe execution.`
      };
    }

    if (isUnlimited) {
      return {
        canProceed: true,
        requiredOps,
        remainingOps: null,
        isUnlimited: true,
        message: `${fileCount} files queued. Unlimited operations available.`
      };
    }

    const available = remainingOps ?? 0;
    if (!canStart || available <= 0) {
      return {
        canProceed: false,
        requiredOps,
        remainingOps: 0,
        isUnlimited: false,
        quotaExhaustedAtFileIndex: 0,
        message: `Daily free quota exhausted (0 remaining today). Required: ${requiredOps} operations.`
      };
    }

    if (available < requiredOps) {
      return {
        canProceed: true,
        requiredOps,
        remainingOps: available,
        isUnlimited: false,
        quotaExhaustedAtFileIndex: available,
        message: `${fileCount} files x 1 save = ${requiredOps} operations. Remaining today: ${available}. Batch will process ${available} files then stop.`
      };
    }

    return {
      canProceed: true,
      requiredOps,
      remainingOps: available,
      isUnlimited: false,
      message: `${fileCount} files x 1 save = ${requiredOps} operations. Remaining today: ${available}.`
    };
  }

  /**
   * Executes a recipe over a queue of multiple files with per-file and overall progress reporting,
   * fault tolerance (file failure doesn't abort the rest), and clean quota exhaustion handling.
   */
  async runBatch(
    files: File[],
    recipe: Recipe,
    options?: BatchRunOptions
  ): Promise<BatchPipelineResult> {
    const startTime = Date.now();
    const totalFiles = files.length;
    const executionLog: string[] = [];

    if (totalFiles > MAX_BATCH_FILES) {
      throw new Error(
        `Batch queue exceeds maximum limit of ${MAX_BATCH_FILES} files. Received ${totalFiles}. Please process in smaller batches.`
      );
    }

    // Initialize items
    const items: BatchFileQueueItem[] = files.map((file, idx) => ({
      fileId: `batch_file_${idx + 1}_${Date.now()}`,
      fileName: file.name,
      fileSize: file.size,
      status: 'queued',
      originalFile: file
    }));

    if (totalFiles === 0) {
      return {
        success: true,
        totalFiles: 0,
        completedCount: 0,
        failedCount: 0,
        skippedQuotaCount: 0,
        items: [],
        executionLog: ['No files provided to batch runner.'],
        totalExecutionTimeMs: 0
      };
    }

    executionLog.push(
      `[Batch Start] Recipe "${recipe.name}" (${recipe.steps.length} steps) queued on ${totalFiles} file(s).`
    );

    // Initial Quota Assessment
    let remainingQuota = Infinity;
    try {
      const quotaStatus = await this.storageService.getQuotaStatus();
      if (!quotaStatus.isUnlimited) {
        remainingQuota = quotaStatus.remaining ?? 0;
      }
    } catch {
      remainingQuota = Infinity;
    }

    let completedCount = 0;
    let failedCount = 0;
    let skippedQuotaCount = 0;
    let wasCancelled = false;

    for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
      const item = items[fileIndex];

      // Check cancellation signal
      if (options?.cancelSignal?.isCancelled) {
        wasCancelled = true;
        executionLog.push(
          `[Batch Cancelled] User cancelled batch execution at file ${fileIndex + 1} of ${totalFiles}.`
        );
        for (let j = fileIndex; j < totalFiles; j++) {
          if (items[j].status === 'queued') {
            items[j].error = 'Cancelled by user';
          }
        }
        break;
      }

      // Check quota exhaustion
      if (remainingQuota <= 0) {
        skippedQuotaCount++;
        item.status = 'skipped_quota';
        item.error = 'Daily free quota exhausted';
        executionLog.push(
          `[Quota Limit] Skipping file ${fileIndex + 1}/${totalFiles} ("${item.fileName}"): Daily free quota limit reached.`
        );
        continue;
      }

      // Mark active file processing
      item.status = 'processing';
      const fileStartTime = Date.now();

      // Initial progress emit for this file
      this.emitProgress(options, {
        totalFiles,
        currentFileIndex: fileIndex,
        activeFileName: item.fileName,
        activeFileStepIndex: 0,
        activeFileTotalSteps: recipe.steps.length,
        activeFileStepLabel: recipe.steps[0]?.label || 'Starting step...',
        overallProgressPercent: Math.round((fileIndex / totalFiles) * 100),
        fileProgressPercent: 0,
        completedCount,
        failedCount,
        skippedQuotaCount
      });

      try {
        // Step progress bridge
        const pipelineOptions: PipelineExecutionOptions = {
          cancelSignal: options?.cancelSignal,
          retainIntermediateFiles: false,
          onProgress: stepProg => {
            item.currentStepIndex = stepProg.stepIndex;
            item.totalSteps = stepProg.totalSteps;
            item.currentStepLabel = stepProg.label;

            const stepWeight = 100 / (stepProg.totalSteps || 1);
            const fileProgress = Math.min(
              100,
              Math.round(stepProg.stepIndex * stepWeight + (stepProg.stepProgress / 100) * stepWeight)
            );
            const overallProgress = Math.min(
              100,
              Math.round((fileIndex / totalFiles) * 100 + (fileProgress / 100) * (100 / totalFiles))
            );

            this.emitProgress(options, {
              totalFiles,
              currentFileIndex: fileIndex,
              activeFileName: item.fileName,
              activeFileStepIndex: stepProg.stepIndex,
              activeFileTotalSteps: stepProg.totalSteps,
              activeFileStepLabel: stepProg.label,
              overallProgressPercent: overallProgress,
              fileProgressPercent: fileProgress,
              completedCount,
              failedCount,
              skippedQuotaCount
            });
          }
        };

        const result = await this.recipeService.executePipeline(
          item.originalFile,
          recipe,
          pipelineOptions
        );

        // Immediately release intermediate buffers for this file
        this.recipeService.cleanupPipelineBuffers(result);

        item.executionTimeMs = Date.now() - fileStartTime;

        if (result.success && result.outputFile) {
          item.status = 'completed';
          item.outputFile = result.outputFile;
          completedCount++;
          remainingQuota--;

          executionLog.push(
            `[File ${fileIndex + 1}/${totalFiles}: OK] "${item.fileName}" completed in ${item.executionTimeMs}ms -> "${result.outputFile.name}".`
          );
        } else if (result.cancelled) {
          item.status = 'queued';
          item.error = 'Cancelled by user';
          wasCancelled = true;
          executionLog.push(
            `[File ${fileIndex + 1}/${totalFiles}: Cancelled] "${item.fileName}" cancelled during execution.`
          );
          break;
        } else {
          // Fault tolerance: record failure and proceed
          item.status = 'failed';
          item.error = result.error || 'Step failed in pipeline';
          failedCount++;

          executionLog.push(
            `[File ${fileIndex + 1}/${totalFiles}: FAIL] "${item.fileName}" failed at step ${
              (result.failingStepIndex ?? 0) + 1
            }: ${item.error}`
          );
        }
      } catch (err: any) {
        // Fault tolerance: catch any unexpected exception and continue to next file
        item.status = 'failed';
        item.executionTimeMs = Date.now() - fileStartTime;
        item.error = err?.message || 'Unexpected error processing file';
        failedCount++;

        executionLog.push(
          `[File ${fileIndex + 1}/${totalFiles}: ERROR] "${item.fileName}" encountered exception: ${item.error}`
        );
      }

      // Update progress after file completes/fails
      this.emitProgress(options, {
        totalFiles,
        currentFileIndex: fileIndex + 1,
        activeFileName: item.fileName,
        activeFileStepIndex: recipe.steps.length,
        activeFileTotalSteps: recipe.steps.length,
        activeFileStepLabel: item.status === 'completed' ? 'Completed' : 'Failed',
        overallProgressPercent: Math.round(((fileIndex + 1) / totalFiles) * 100),
        fileProgressPercent: 100,
        completedCount,
        failedCount,
        skippedQuotaCount
      });
    }

    const totalExecutionTimeMs = Date.now() - startTime;
    executionLog.push(
      `[Batch Summary] Finished in ${totalExecutionTimeMs}ms. Success: ${completedCount}, Failed: ${failedCount}, Quota Skipped: ${skippedQuotaCount}.`
    );

    return {
      success: completedCount > 0,
      cancelled: wasCancelled,
      totalFiles,
      completedCount,
      failedCount,
      skippedQuotaCount,
      items,
      executionLog,
      totalExecutionTimeMs
    };
  }

  /**
   * Bundles all successfully processed files into a single downloadable ZIP package,
   * enforcing strict Zip Slip / Directory Traversal sanitization and name deduplication.
   */
  async createZipPackage(
    items: BatchFileQueueItem[],
    zipName = 'recipe_batch_outputs.zip'
  ): Promise<{ blob: Blob; fileName: string; fileCount: number }> {
    const rawZipBase = sanitizeZipEntryName(zipName, 1).replace(/\.pdf$/i, '');
    const finalZipName = rawZipBase.toLowerCase().endsWith('.zip') ? rawZipBase : `${rawZipBase}.zip`;

    const zip = new JSZip();
    let fileCount = 0;
    const usedNames = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'completed' && item.outputFile) {
        const buffer = await item.outputFile.arrayBuffer();
        let entryName = sanitizeZipEntryName(item.outputFile.name, i + 1);

        // Deduplicate entry name in ZIP
        if (usedNames.has(entryName.toLowerCase())) {
          const dotIdx = entryName.lastIndexOf('.');
          const base = dotIdx !== -1 ? entryName.substring(0, dotIdx) : entryName;
          const ext = dotIdx !== -1 ? entryName.substring(dotIdx) : '';
          let counter = 1;
          while (usedNames.has(`${base}_${counter}${ext}`.toLowerCase())) {
            counter++;
          }
          entryName = `${base}_${counter}${ext}`;
        }

        usedNames.add(entryName.toLowerCase());
        zip.file(entryName, buffer);
        fileCount++;
      }
    }

    if (fileCount === 0) {
      throw new Error('No completed files found in batch to package into ZIP.');
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return {
      blob,
      fileName: finalZipName,
      fileCount
    };
  }

  private emitProgress(
    options: BatchRunOptions | undefined,
    progress: BatchPipelineProgress
  ): void {
    if (options?.onProgress) {
      options.onProgress(progress);
    }
  }
}
