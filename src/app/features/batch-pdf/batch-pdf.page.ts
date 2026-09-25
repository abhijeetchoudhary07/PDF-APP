import { Component, ChangeDetectionStrategy } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../core/services/file.service';
import { PdfService } from '../../core/services/pdf.service';
import { StorageService } from '../../core/services/storage.service';
import { HistoryService } from '../../core/services/history.service';
import { ProcessingResult } from '../../core/models/processing-result.model';
import { ToastService } from '../../core/services/toast.service';

const uuidv4 = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

export interface BatchPdfItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: ProcessingResult & { targetMissed?: boolean };
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
  selector: 'app-batch-pdf',
  templateUrl: './batch-pdf.page.html',
  styleUrls: ['./batch-pdf.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
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
export class BatchPdfPage {
  items: BatchPdfItem[] = [];
  targetKB: number = 200;
  isProcessing: boolean = false;
  
  readonly MAX_BATCH_SIZE = 10; // PDFs are heavy, limit to 10
  readonly CONCURRENCY_LIMIT = 1; // Strict concurrency for PDFs to save memory

  constructor(
    private fileService: FileService,
    private pdfService: PdfService,
    private storageService: StorageService,
    private historyService: HistoryService,
    private toast: ToastService
  ) {}

  async selectPdfs() {
    if (this.isProcessing) return;
    const files = await this.fileService.pickMultiplePdfs();
    if (files && files.length > 0) {
       const availableSlots = this.MAX_BATCH_SIZE - this.items.length;
       const toAdd = files.slice(0, availableSlots);
       
       if (files.length > availableSlots) {
         this.toast.warning(`Only ${availableSlots} added -- a batch holds at most ${this.MAX_BATCH_SIZE} PDFs.`);
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
    
    if (!this.targetKB || this.targetKB < 50) {
      this.toast.warning('Enter a target size in KB, for example 200.');
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
             const result = await this.pdfService.compressPdfToExactKB(item.file, { targetKB: this.targetKB });
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
    
    // One batch is one operation against the free tier's daily allowance.
    const operationId = `batch_pdf_${Date.now()}`;

    let savedCount = 0;
    for (const item of successItems) {
      const uri = await this.storageService.saveFile(
        item.result!.file!,
        'batch_document',
        operationId,
      );
      if (uri) {
        savedCount++;
        await this.historyService.addHistoryItem({
          operation: 'batch_pdf',
          originalFileName: item.file.name,
          outputFileName: item.result!.file!.name,
          originalSizeBytes: item.file.size,
          outputSizeBytes: item.result!.file!.size,
          outputPath: uri
        });
      }
      await new Promise(res => setTimeout(res, 300));
    }
    
    if (savedCount > 0) {
      this.toast.success(`Saved ${savedCount} PDFs to your Documents folder.`);
    }
  }
}
