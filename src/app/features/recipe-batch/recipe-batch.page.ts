import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';

import { RecipeBatchService } from '../../core/services/recipe-batch.service';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Recipe,
  StarterRecipe,
  BatchFileQueueItem,
  BatchPipelineProgress,
  BatchPipelineResult,
  BatchFileStatus,
  MAX_BATCH_FILES
} from '../../core/models/recipe.types';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppProgressComponent,
  AppSkeletonComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-recipe-batch',
  templateUrl: './recipe-batch.page.html',
  styleUrls: ['./recipe-batch.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    AppProgressComponent,
    AppSkeletonComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class RecipeBatchPage implements OnInit, OnDestroy {
  private recipeBatchService = inject(RecipeBatchService);
  private recipeService = inject(RecipeService);
  private storageService = inject(StorageService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  starterRecipes: StarterRecipe[] = [];
  customRecipes: Recipe[] = [];
  selectedRecipe: Recipe | null = null;

  files: File[] = [];
  queueItems: BatchFileQueueItem[] = [];

  isRunning = false;
  isCompleted = false;
  isCancelled = false;
  cancelSignal = { isCancelled: false };

  progress: BatchPipelineProgress | null = null;
  batchResult: BatchPipelineResult | null = null;
  quotaNotice: string | null = null;
  canProceedQuota = true;

  isPackagingZip = false;
  showExecutionLog = false;

  async ngOnInit(): Promise<void> {
    this.starterRecipes = this.recipeBatchService.getStarterRecipes();

    try {
      this.customRecipes = await this.recipeService.getRecipes();
    } catch {
      this.customRecipes = [];
    }

    // Default to the first starter recipe if none selected
    const queryStarter = this.route.snapshot.queryParamMap.get('starter');
    const queryRecipe = this.route.snapshot.queryParamMap.get('recipe');

    if (queryStarter) {
      const match = this.starterRecipes.find(
        s => s.id === queryStarter || s.starterId === queryStarter
      );
      if (match) this.selectedRecipe = match;
    } else if (queryRecipe) {
      const match = this.customRecipes.find(r => r.id === queryRecipe);
      if (match) this.selectedRecipe = match;
    }

    if (!this.selectedRecipe && this.starterRecipes.length > 0) {
      this.selectedRecipe = this.starterRecipes[0];
    }

    await this.updateQuotaCheck();
  }

  ngOnDestroy(): void {
    if (this.isRunning) {
      this.cancelSignal.isCancelled = true;
    }
  }

  async selectStarter(starter: StarterRecipe): Promise<void> {
    if (this.isRunning) return;
    this.selectedRecipe = starter;
    this.triggerHaptic();
    await this.updateQuotaCheck();
    this.cdr.markForCheck();
  }

  async onRecipeDropdownChange(recipeId: string): Promise<void> {
    if (this.isRunning) return;
    const starter = this.starterRecipes.find(s => s.id === recipeId);
    if (starter) {
      this.selectedRecipe = starter;
    } else {
      const custom = this.customRecipes.find(r => r.id === recipeId);
      if (custom) this.selectedRecipe = custom;
    }
    this.triggerHaptic();
    await this.updateQuotaCheck();
    this.cdr.markForCheck();
  }

  async onFilesAdded(selectedFiles: File[]): Promise<void> {
    if (this.isRunning) return;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const pdfs = selectedFiles.filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfs.length === 0) {
      this.toast.error('Please upload PDF document files.');
      return;
    }

    const remainingSlots = MAX_BATCH_FILES - this.files.length;
    if (remainingSlots <= 0) {
      this.toast.error(`Maximum batch queue limit of ${MAX_BATCH_FILES} files reached.`);
      return;
    }

    let filesToAdd = pdfs;
    if (pdfs.length > remainingSlots) {
      filesToAdd = pdfs.slice(0, remainingSlots);
      this.toast.warning(
        `Batch capped at ${MAX_BATCH_FILES} files. Added ${remainingSlots} file(s), skipped ${pdfs.length - remainingSlots}.`
      );
    }

    this.files = [...this.files, ...filesToAdd];
    this.buildQueueItems();
    this.isCompleted = false;
    this.batchResult = null;
    this.progress = null;

    this.triggerHaptic();
    await this.updateQuotaCheck();
    this.cdr.markForCheck();
  }

  onSingleFileAdded(file: File): void {
    this.onFilesAdded([file]);
  }

  async removeFile(index: number): Promise<void> {
    if (this.isRunning) return;
    this.files.splice(index, 1);
    this.buildQueueItems();
    await this.updateQuotaCheck();
    this.cdr.markForCheck();
  }

  async clearQueue(): Promise<void> {
    if (this.isRunning) return;
    this.files = [];
    this.queueItems = [];
    this.isCompleted = false;
    this.batchResult = null;
    this.progress = null;
    await this.updateQuotaCheck();
    this.cdr.markForCheck();
  }

  private buildQueueItems(): void {
    this.queueItems = this.files.map((file, idx) => ({
      fileId: `queue_${idx}_${Date.now()}`,
      fileName: file.name,
      fileSize: file.size,
      status: 'queued',
      originalFile: file
    }));
  }

  async updateQuotaCheck(): Promise<void> {
    if (this.files.length === 0) {
      this.quotaNotice = null;
      this.canProceedQuota = true;
      return;
    }

    try {
      const check = await this.recipeBatchService.checkQuotaForBatch(this.files.length);
      this.quotaNotice = check.message;
      this.canProceedQuota = check.canProceed;
    } catch {
      this.quotaNotice = null;
      this.canProceedQuota = true;
    }
  }

  async startBatch(): Promise<void> {
    if (this.isRunning || !this.selectedRecipe || this.files.length === 0) return;

    this.isRunning = true;
    this.isCompleted = false;
    this.isCancelled = false;
    this.cancelSignal = { isCancelled: false };
    this.batchResult = null;

    this.triggerHaptic();

    try {
      const result = await this.recipeBatchService.runBatch(this.files, this.selectedRecipe, {
        cancelSignal: this.cancelSignal,
        onProgress: p => {
          this.progress = p;
          // Synchronize queue item statuses
          const currentItem = this.queueItems[p.currentFileIndex];
          if (currentItem && currentItem.status === 'queued') {
            currentItem.status = 'processing';
          }
          this.cdr.markForCheck();
        }
      });

      this.batchResult = result;
      this.queueItems = result.items;
      this.isCompleted = true;
      this.isCancelled = !!result.cancelled;

      if (result.completedCount > 0) {
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch {}
        this.toast.success(
          `Batch completed: ${result.completedCount} file(s) processed successfully.`
        );
      } else if (result.cancelled) {
        this.toast.info('Batch processing was cancelled.');
      } else {
        this.toast.error('All files in batch failed to process.');
      }
    } catch (err: any) {
      this.toast.error(err?.message || 'Error executing batch recipe.');
    } finally {
      this.isRunning = false;
      await this.updateQuotaCheck();
      this.cdr.markForCheck();
    }
  }

  cancelBatch(): void {
    if (!this.isRunning) return;
    this.cancelSignal.isCancelled = true;
    this.isCancelled = true;
    this.toast.info('Cancelling batch execution after current step...');
    this.triggerHaptic();
    this.cdr.markForCheck();
  }

  async downloadAllZip(): Promise<void> {
    if (!this.queueItems || this.queueItems.length === 0) return;

    const completed = this.queueItems.filter(i => i.status === 'completed' && i.outputFile);
    if (completed.length === 0) {
      this.toast.error('No successfully processed files available to export.');
      return;
    }

    this.isPackagingZip = true;
    this.cdr.markForCheck();

    try {
      const zipName = `${this.selectedRecipe?.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'batch'}_outputs.zip`;
      const pkg = await this.recipeBatchService.createZipPackage(this.queueItems, zipName);

      const zipFile = new File([pkg.blob], pkg.fileName, { type: 'application/zip' });
      // Save / download ZIP via StorageService or browser download
      await this.storageService.saveFile(zipFile, 'recipe_batch', undefined, { preserveName: true });
      this.toast.success(`ZIP downloaded: ${pkg.fileCount} files bundled.`);
      this.triggerHaptic();
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to generate ZIP package.');
    } finally {
      this.isPackagingZip = false;
      this.cdr.markForCheck();
    }
  }

  async downloadSingle(item: BatchFileQueueItem): Promise<void> {
    if (!item.outputFile) return;
    try {
      await this.storageService.saveFile(item.outputFile, 'recipe_output', undefined, {
        preserveName: true
      });
      this.toast.success(`Saved "${item.outputFile.name}".`);
      this.triggerHaptic();
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to save file.');
    }
  }

  toggleExecutionLog(): void {
    this.showExecutionLog = !this.showExecutionLog;
    this.triggerHaptic();
    this.cdr.markForCheck();
  }

  getStatusBadgeVariant(
    status: BatchFileStatus
  ): 'neutral' | 'primary' | 'success' | 'danger' | 'warning' {
    switch (status) {
      case 'queued':
        return 'neutral';
      case 'processing':
        return 'primary';
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'skipped_quota':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  private triggerHaptic(): void {
    try {
      Haptics.impact();
    } catch {}
  }
}
