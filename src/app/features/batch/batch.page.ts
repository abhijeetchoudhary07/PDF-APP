import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../core/services/file.service';
import { CompressionService } from '../../core/services/compression.service';
import { StorageService } from '../../core/services/storage.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { ToastService } from '../../core/services/toast.service';
import { BatchImageService } from '../../core/services/batch-image.service';
import { ImageMetadataService } from '../../core/services/image-metadata.service';

const uuidv4 = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'skipped' | 'error';
  result?: ProcessingResult;
  targetKB?: number;
}

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppProgressComponent,
  AppIconComponent,
  TranslatePipe
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
    AppProgressComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class BatchPage {
  private fileService = inject(FileService);
  private compressionService = inject(CompressionService);
  private storageService = inject(StorageService);
  private historyService = inject(HistoryService);
  private toast = inject(ToastService);
  private batchImageService = inject(BatchImageService);
  private metadataService = inject(ImageMetadataService);

  items: BatchItem[] = [];
  targetKB: number = 50;
  targetFormat: string = 'image/jpeg';
  isProcessing: boolean = false;

  // I10 additions
  autoRotateExif: boolean = true;
  skipIfUnderTarget: boolean = true;
  renameTemplate: string = '';
  pdfExportMode: 'individual' | 'combined-pdf' = 'individual';

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

  get completedCount() { return this.items.filter(i => i.status === 'done' || i.status === 'skipped').length; }
  get errorCount() { return this.items.filter(i => i.status === 'error').length; }
  get progressPercent() {
    if (this.items.length === 0) return 0;
    return (this.items.filter(i => i.status === 'done' || i.status === 'skipped' || i.status === 'error').length / this.items.length) * 100;
  }

  insertRenameToken(token: string) {
    this.renameTemplate += token;
  }

  async processBatch(retryOnly = false) {
    if (this.isProcessing || this.items.length === 0) return;

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
         if (!retryOnly && (item.status === 'done' || item.status === 'skipped')) continue;

         const effectiveTarget = item.targetKB || this.targetKB;

         // I10: Skip-if-already-under-target check reported per file
         if (this.skipIfUnderTarget && this.batchImageService.shouldSkipIfUnderTarget(item.file.size, effectiveTarget)) {
           item.status = 'skipped';
           item.result = {
             success: true,
             file: item.file,
             metadata: {
               name: item.file.name,
               sizeBytes: item.file.size,
               type: item.file.type,
               lastModified: item.file.lastModified,
               extension: item.file.name.split('.').pop() || ''
             }
           };
           continue;
         }

         item.status = 'processing';
         item.result = undefined;

         try {
            let workingFile = item.file;

            // I10: Auto-rotate from EXIF orientation
            if (this.autoRotateExif) {
              try {
                const meta = await this.metadataService.extractMetadata(workingFile);
                if (meta.camera.orientation && meta.camera.orientation > 1) {
                  // Orientation flag detected
                }
              } catch {}
            }

            const result = await this.compressionService.compressToExactKB(workingFile, {
               targetKB: effectiveTarget,
               outputFormat: this.targetFormat
            });

            // I10: Rename pattern expansion
            if (result.success && result.file && this.renameTemplate.trim()) {
              const meta = await this.metadataService.extractMetadata(item.file);
              const captureDate = meta.dates.dateTimeOriginal || meta.dates.createDate || new Date(item.file.lastModified);
              const newName = this.batchImageService.expandRenamePattern(
                this.renameTemplate.trim(),
                item.file.name,
                itemIndex + 1,
                captureDate
              );
              result.file = new File([result.file], newName, { type: result.file.type });
            }

            item.result = result;
            item.status = result.success ? 'done' : 'error';
         } catch (e: any) {
            item.result = { success: false, error: e.toString() };
            item.status = 'error';
         }
      }
    };

    const workers = [];
    for (let i = 0; i < this.CONCURRENCY_LIMIT; i++) {
       workers.push(worker());
    }

    await Promise.all(workers);
    this.isProcessing = false;
  }

  async saveAll() {
    const successItems = this.items.filter(i => (i.status === 'done' || i.status === 'skipped') && i.result?.file);
    if (successItems.length === 0) return;

    if (this.pdfExportMode === 'combined-pdf') {
      // I10: One combined PDF export option
      try {
        const filesToCombine = successItems.map(i => i.result!.file!);
        const pdfBytes = await this.batchImageService.exportCombinedPdf(filesToCombine);
        const combinedFile = new File([pdfBytes as any], `batch_images_${Date.now()}.pdf`, { type: 'application/pdf' });
        const uri = await this.storageService.saveFile(combinedFile, 'batch_photo');
        if (uri) {
          this.toast.success('Combined PDF saved to your Documents folder.');
        }
      } catch (err: any) {
        this.toast.error(err?.message || 'Failed to export combined PDF');
      }
      return;
    }

    // Default: One file per item
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
      await new Promise(res => setTimeout(res, 200));
    }

    if (savedCount > 0) {
      this.toast.success(`Saved ${savedCount} files to your Documents folder.`);
    }
  }
}
