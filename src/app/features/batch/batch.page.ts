import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../core/services/file.service';
import { CompressionService } from '../../core/services/compression.service';
import { StorageService } from '../../core/services/storage.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { ToastService } from '../../core/services/toast.service';

const uuidv4 = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: ProcessingResult;
}

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppProgressComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-batch',
  templateUrl: './batch.page.html',
  styleUrls: ['./batch.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppProgressComponent
  ],
  providers: [DecimalPipe]
})
export class BatchPage {
  private fileService = inject(FileService);
  private compressionService = inject(CompressionService);
  private storageService = inject(StorageService);
  private historyService = inject(HistoryService);
  private toast = inject(ToastService);

  items: BatchItem[] = [];
  targetKB: number = 50;
  targetFormat: string = 'image/jpeg';
  isProcessing: boolean = false;
  
  readonly MAX_BATCH_SIZE = 20;
  readonly CONCURRENCY_LIMIT = 3;

  async selectFiles() {
    if (this.isProcessing) return;
    const files = await this.fileService.pickMultipleImages();
    if (files && files.length > 0) {
       const availableSlots = this.MAX_BATCH_SIZE - this.items.length;
       const toAdd = files.slice(0, availableSlots);
       
       if (files.length > availableSlots) {
         this.toast.warning(`Only ${availableSlots} added -- a batch holds at most ${this.MAX_BATCH_SIZE} files.`);
       }

       // Phase 17: Sync target format if all selected files have the same type
       if (this.items.length === 0 && toAdd.length > 0) {
          const firstType = toAdd[0].type;
          const allSame = toAdd.every(f => f.type === firstType);
          if (allSame) {
             this.targetFormat = firstType;
          }
       }

       for (const f of toAdd) {
         this.items.push({
           id: uuidv4(),
           file: f,
           status: 'pending'
         });
       }
    }
  }

  removeFile(id: string) {
    if (this.isProcessing) return;
    this.items = this.items.filter(i => i.id !== id);
  }

  clearAll() {
    if (this.isProcessing) return;
    this.items = [];
  }

  get completedCount() { return this.items.filter(i => i.status === 'done').length; }
  get errorCount() { return this.items.filter(i => i.status === 'error').length; }
  get progressPercent() { 
    if (this.items.length === 0) return 0;
    return (this.items.filter(i => i.status === 'done' || i.status === 'error').length / this.items.length) * 100;
  }

  async processBatch(retryOnly = false) {
    if (this.isProcessing || this.items.length === 0) return;
    
    // Validate
    if (!this.targetKB || this.targetKB < 5) {
      this.toast.warning('Enter a target size in KB, for example 50.');
      return;
    }

    this.isProcessing = true;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < this.items.length) {
         const itemIndex = currentIndex++;
         const item = this.items[itemIndex];
         
         if (retryOnly && item.status !== 'error') continue;
         if (!retryOnly && item.status === 'done') continue;

         item.status = 'processing';
         item.result = undefined;
         
         try {
            const result = await this.compressionService.compressToExactKB(item.file, {
               targetKB: this.targetKB,
               outputFormat: this.targetFormat
            });
            item.result = result;
            item.status = result.success ? 'done' : 'error';
         } catch (e: any) {
            item.result = { success: false, error: e.toString() };
            item.status = 'error';
         }
      }
    };

    const workers = [];
    for(let i = 0; i < this.CONCURRENCY_LIMIT; i++) {
       workers.push(worker());
    }
    
    await Promise.all(workers);
    this.isProcessing = false;
  }

  async saveAll() {
    const successItems = this.items.filter(i => i.status === 'done' && i.result?.file);
    if (successItems.length === 0) return;
    
    // One batch is one operation against the free tier's daily allowance, no
    // matter how many files it produced — so every save in this loop carries
    // the same id and only the first is counted.
    const operationId = `batch_photo_${Date.now()}`;

    let savedCount = 0;
    for (const item of successItems) {
      const uri = await this.storageService.saveFile(
        item.result!.file!,
        'batch_photo',
        operationId,
      );
      if (uri) {
        savedCount++;
        await this.historyService.addHistoryItem({
          operation: 'batch_photo',
          originalFileName: item.file.name,
          outputFileName: item.result!.file!.name,
          originalSizeBytes: item.file.size,
          outputSizeBytes: item.result!.file!.size,
          outputDimensions: item.result!.dimensions ? `${item.result!.dimensions.width}x${item.result!.dimensions.height}` : undefined,
          outputPath: uri
        });
      }
      await new Promise(res => setTimeout(res, 300)); // stagger saves slightly
    }
    
    if (savedCount > 0) {
      this.toast.success(`Saved ${savedCount} files to your Documents folder.`);
    }
  }
}
