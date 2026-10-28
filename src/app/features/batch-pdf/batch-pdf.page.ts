import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { FileService } from '../../core/services/file.service';
import { PdfService } from '../../core/services/pdf.service';
import { StorageService } from '../../core/services/storage.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { UsageQuotaService } from '../../core/services/usage-quota.service';
import { OcrService } from '../../core/services/ocr.service';
import { OCR_SUPPORTED_LANGUAGES, OcrSupportedLanguage } from '../../core/models/ocr.models';
import { PdfToWordConverter } from '../../core/conversion/converters/pdf-to-word.converter';
import { PdfSecurityService } from '../../core/services/pdf-security.service';
import { PdfPrivacyService } from '../../core/services/pdf-privacy.service';
import {
  BatchPdfOperation,
  BatchPdfQueueItem,
  BatchPdfExecutionSummary
} from '../../core/models/conversion-features.types';
import '../../core/utilities/pdfjs-worker';

const uuidv4 = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).substring(2) + Date.now().toString(36);

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppProgressComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

export interface BatchOperationMeta {
  id: BatchPdfOperation;
  label: string;
  icon: string;
  description: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-batch-pdf',
  templateUrl: './batch-pdf.page.html',
  styleUrls: ['./batch-pdf.page.scss'],
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
export class BatchPdfPage implements OnInit {
  private fileService = inject(FileService);
  private pdfService = inject(PdfService);
  private storageService = inject(StorageService);
  private historyService = inject(HistoryService);
  private toast = inject(ToastService);
  readonly quota = inject(UsageQuotaService);
  private ocrService = inject(OcrService);
  private pdfToWordConverter = inject(PdfToWordConverter);
  private pdfSecurityService = inject(PdfSecurityService);
  private pdfPrivacyService = inject(PdfPrivacyService);

  readonly MAX_BATCH_SIZE = 10;

  /**
   * The five languages the app ships everywhere else. The batch screen used to
   * offer Spanish, French, German, Italian and Portuguese — languages no other
   * screen offers, whose models are not on the device — while leaving out
   * Marathi, Bengali and Punjabi, which are.
   */
  readonly ocrLanguages = OCR_SUPPORTED_LANGUAGES;

  readonly operations: BatchOperationMeta[] = [
    { id: 'compress', label: 'Compress', icon: 'arrow-down', description: 'Compress files down to target KB ceiling.' },
    { id: 'ocr', label: 'OCR Searchable PDF', icon: 'scan', description: 'Add searchable text layer on scanned PDFs or images.' },
    { id: 'convert-to-word', label: 'PDF to Word', icon: 'document-text', description: 'Convert PDFs to editable Microsoft Word DOCX.' },
    { id: 'protect', label: 'Protect (Encrypt)', icon: 'lock-closed', description: 'Encrypt documents with a master password.' },
    { id: 'unprotect', label: 'Unprotect (Unlock)', icon: 'lock-open', description: 'Remove password and copy/print restrictions.' },
    { id: 'metadata-strip', label: 'Strip Metadata', icon: 'shield-checkmark', description: 'Sanitize hidden author, creation dates & XMP tags.' },
    { id: 'rename-from-content', label: 'Rename from Content', icon: 'text', description: 'Auto-detect titles from first page content to rename files.' }
  ];

  operation: BatchPdfOperation = 'compress';
  items: BatchPdfQueueItem[] = [];
  targetKB: number = 200;
  ocrLanguage: OcrSupportedLanguage = 'eng';
  password: string = '';
  showPassword = false;
  autoSave: boolean = true;
  isProcessing: boolean = false;
  quotaBlocked: boolean = false;
  remainingQuota: number | null = null;
  executionSummary?: BatchPdfExecutionSummary;

  async ngOnInit(): Promise<void> {
    await this.refreshQuota();
  }

  async refreshQuota(): Promise<void> {
    this.remainingQuota = await this.quota.remaining();
  }

  get isUnlimited(): boolean {
    return this.quota.isUnlimited;
  }

  get quotaCost(): number {
    return this.isUnlimited ? 0 : this.items.length;
  }

  get willExceedQuota(): boolean {
    return !this.isUnlimited && this.remainingQuota !== null && this.items.length > this.remainingQuota;
  }

  get completedCount(): number {
    return this.items.filter(i => i.status === 'done').length;
  }

  get errorCount(): number {
    return this.items.filter(i => i.status === 'failed').length;
  }

  get progressPercent(): number {
    if (this.items.length === 0) return 0;
    return (this.items.filter(i => i.status === 'done' || i.status === 'failed').length / this.items.length) * 100;
  }

  setOperation(op: BatchPdfOperation): void {
    if (this.isProcessing) return;
    this.operation = op;
  }

  toggleShowPassword(): void {
    this.showPassword = !this.showPassword;
  }

  async selectPdfs(): Promise<void> {
    if (this.isProcessing) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.operation === 'ocr' ? 'application/pdf,image/*' : 'application/pdf';
    input.multiple = true;
    input.onchange = (e: any) => {
      const files = Array.from(e.target?.files || []) as File[];
      if (files && files.length > 0) {
        const availableSlots = this.MAX_BATCH_SIZE - this.items.length;
        const toAdd = files.slice(0, availableSlots);

        if (files.length > availableSlots) {
          this.toast.warning(`Only ${availableSlots} added -- a batch holds at most ${this.MAX_BATCH_SIZE} files.`);
        }

        for (const f of toAdd) {
          this.items.push({
            id: uuidv4(),
            file: f,
            status: 'queued',
            originalSizeBytes: f.size,
            quotaCharged: false
          });
        }
        void this.refreshQuota();
      }
    };
    input.click();
  }

  removeFile(id: string): void {
    if (this.isProcessing) return;
    this.items = this.items.filter(i => i.id !== id);
    void this.refreshQuota();
  }

  clearAll(): void {
    if (this.isProcessing) return;
    this.items = [];
    this.executionSummary = undefined;
    this.quotaBlocked = false;
  }

  async executeOperation(item: BatchPdfQueueItem): Promise<File> {
    const baseName = item.file.name.replace(/\.[^/.]+$/, '');

    switch (this.operation) {
      case 'compress': {
        const result = await this.pdfService.compressPdfToExactKB(item.file, { targetKB: this.targetKB });
        if (!result.success || !result.file) {
          throw new Error(result.error || 'Compression failed');
        }
        return result.file;
      }

      case 'ocr': {
        const ocrRes = await this.ocrService.performOcr(item.file, this.ocrLanguage || 'eng');
        const searchablePdf = await this.ocrService.generateSearchablePdf(item.file, ocrRes);
        return searchablePdf;
      }

      case 'convert-to-word': {
        const convRes = await this.pdfToWordConverter.convert(item.file, { preserveHeadings: true });
        if (!convRes.success || !convRes.file) {
          throw new Error(convRes.error || 'Conversion to Word failed');
        }
        return convRes.file;
      }

      case 'protect': {
        if (!this.password) {
          throw new Error('A password is required to protect documents.');
        }
        const res = await this.pdfSecurityService.protectPdf(
          item.file,
          {
            userPassword: this.password,
            ownerPassword: this.password,
            permissions: {
              allowPrinting: 'high-resolution',
              allowModifying: false,
              allowCopying: false,
              allowAnnotating: true,
              allowFillingForms: true,
              allowContentAccessibility: true,
              allowDocumentAssembly: false
            }
          },
          `${baseName}_protected.pdf`
        );
        return res.file;
      }

      case 'unprotect': {
        if (!this.password) {
          throw new Error('Password is required to unlock documents.');
        }
        const res = await this.pdfSecurityService.unlockPdf(
          item.file,
          this.password,
          `${baseName}_unlocked.pdf`
        );
        return res.file;
      }

      case 'metadata-strip': {
        const res = await this.pdfPrivacyService.sanitizePdf(
          item.file,
          {
            removeMetadata: true,
            removeComments: false,
            removeForms: false,
            removeAttachments: false,
            removeHiddenContent: false,
            removeScripts: false
          },
          `${baseName}_sanitized.pdf`
        );
        if (!res.sanitizedFile) {
          throw new Error('Metadata sanitization failed');
        }
        return res.sanitizedFile;
      }

      case 'rename-from-content': {
        const newName = await this.extractTitleAndGenerateFilename(item.file);
        if (!newName) {
          /*
           * Reporting "done" for a file whose content could not be read, and
           * handing back `name_renamed.pdf`, tells the person the operation
           * worked on a file it never understood. An image-only scan has no
           * text to take a title from, and saying so points at the fix: run
           * OCR over it first.
           */
          throw new Error('No readable text to take a title from. Run OCR on this file first.');
        }
        const arrayBuffer = await item.file.arrayBuffer();
        return new File([arrayBuffer], newName, { type: 'application/pdf' });
      }

      default:
        throw new Error(`Unsupported batch operation: ${this.operation}`);
    }
  }

  /** The title this document calls itself, or null when it does not say. */
  async extractTitleAndGenerateFilename(file: File): Promise<string | null> {
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;

    try {
      const arrayBuffer = await file.arrayBuffer();
      // 1. Check metadata title in pdf-lib
      try {
        const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
        const metaTitle = pdfDoc.getTitle()?.trim();
        if (metaTitle && metaTitle.length >= 3 && metaTitle.length <= 80) {
          const clean = this.sanitizeFilename(metaTitle);
          if (clean && clean.length >= 3) return `${clean}.pdf`;
        }
      } catch {
        // ignore
      }

      // 2. Try reading page 1 text items with pdfjs
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) } as any);
      const pdf = await loadingTask.promise;
      if (pdf.numPages > 0) {
        const page1 = await pdf.getPage(1);
        const textContent = await page1.getTextContent();

        /*
         * The title is the largest text on the page, not the first string in
         * the content stream: a letterhead, a page number or a date often
         * draws before it, and taking the first run named half the files
         * after the header above the title.
         */
        let best: { text: string; size: number } | null = null;
        for (const item of textContent.items) {
          if (!('str' in item) || typeof item.str !== 'string') continue;
          const str = item.str.trim();
          if (str.length < 4 || /^\d+$/.test(str) || str.startsWith('Page ')) continue;
          const tx = (item as any).transform as number[] | undefined;
          const size = tx ? Math.hypot(tx[0], tx[1]) : 0;
          if (!best || size > best.size) best = { text: str, size };
        }

        if (best) {
          const clean = this.sanitizeFilename(best.text);
          if (clean.length >= 3) return `${clean}.pdf`;
        }
      }
    } catch {
      // ignore
    } finally {
      try {
        await loadingTask?.destroy();
      } catch {
        /* never opened */
      }
    }

    return null;
  }

  private sanitizeFilename(text: string): string {
    return text
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 45);
  }

  async processBatch(retryOnly = false): Promise<void> {
    if (this.isProcessing || this.items.length === 0) return;

    if (this.operation === 'compress' && (!this.targetKB || this.targetKB < 50)) {
      this.toast.warning('Enter a target size in KB, for example 200.');
      return;
    }
    if ((this.operation === 'protect' || this.operation === 'unprotect') && !this.password) {
      this.toast.warning('Please enter a password for this operation.');
      return;
    }

    await this.refreshQuota();
    if (!this.quota.isUnlimited && this.remainingQuota !== null && this.remainingQuota <= 0) {
      this.toast.warning('Daily free-tier quota exhausted. Upgrade to Premium for unlimited operations.');
      return;
    }

    this.isProcessing = true;
    this.quotaBlocked = false;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (retryOnly && item.status !== 'failed') continue;
      if (!retryOnly && item.status === 'done') continue;

      // Quota boundary check: stop cleanly if exhausted
      if (!this.quota.isUnlimited) {
        const remaining = await this.quota.remaining();
        if (remaining !== null && remaining <= 0) {
          this.quotaBlocked = true;
          for (let k = i; k < this.items.length; k++) {
            if (this.items[k].status === 'queued' || this.items[k].status === 'running') {
              this.items[k].status = 'failed';
              this.items[k].failureReason = 'Daily free-tier quota limit reached';
            }
          }
          break;
        }
      }

      item.status = 'running';
      item.progress = 15;
      item.failureReason = undefined;

      try {
        const outputFile = await this.executeOperation(item);
        item.outputFile = outputFile;
        item.processedSizeBytes = outputFile.size;
        item.status = 'done';
        item.progress = 100;

        // Save output through StorageService.saveFile
        if (this.autoSave) {
          /*
           * Save under the name the operation produced. Renaming from content
           * is pointless otherwise, and a batch whose outputs are all
           * `batch_compress_<kb>kb_<second>.pdf` can collide with itself when
           * two files round to the same size inside the same second.
           */
          const uri = await this.storageService.saveFile(
            outputFile,
            `batch_${this.operation}`,
            item.id,
            { preserveName: true }
          );
          if (uri) {
            item.quotaCharged = true;
            await this.historyService.addHistoryItem({
              operation: 'batch_pdf',
              originalFileName: item.file.name,
              outputFileName: outputFile.name,
              originalSizeBytes: item.file.size,
              outputSizeBytes: outputFile.size,
              outputPath: uri
            });
          }
        }
      } catch (err: any) {
        item.status = 'failed';
        item.failureReason = err?.message || String(err) || 'Operation failed';
      }
    }

    await this.refreshQuota();
    this.isProcessing = false;

    const doneCount = this.items.filter(i => i.status === 'done').length;
    const failCount = this.items.filter(i => i.status === 'failed').length;

    this.executionSummary = {
      totalFiles: this.items.length,
      processedCount: doneCount,
      failedCount: failCount,
      quotaAllowed: this.remainingQuota ?? 5,
      quotaUsed: doneCount,
      quotaBlocked: this.quotaBlocked
    };

    if (this.quotaBlocked) {
      this.toast.warning(
        `Batch stopped cleanly at daily limit. Processed ${doneCount} of ${this.items.length} files (${failCount} not processed).`
      );
    } else if (failCount > 0) {
      this.toast.warning(
        `Batch completed with ${failCount} error(s). Processed ${doneCount} of ${this.items.length} files.`
      );
    } else {
      this.toast.success(`Successfully processed ${doneCount} files.`);
    }
  }

  async saveAll(): Promise<void> {
    const unsavedItems = this.items.filter(i => i.status === 'done' && i.outputFile && !i.quotaCharged);
    if (unsavedItems.length === 0) {
      const doneItems = this.items.filter(i => i.status === 'done' && i.outputFile);
      if (doneItems.length > 0) {
        this.toast.info(`All ${doneItems.length} completed files have already been saved to Documents.`);
      }
      return;
    }

    let savedCount = 0;
    for (const item of unsavedItems) {
      if (!this.quota.isUnlimited && !(await this.quota.canStart())) {
        this.toast.warning('Daily limit reached while saving remaining files.');
        break;
      }
      const uri = await this.storageService.saveFile(
        item.outputFile!,
        `batch_${this.operation}`,
        item.id,
        { preserveName: true }
      );
      if (uri) {
        item.quotaCharged = true;
        savedCount++;
        await this.historyService.addHistoryItem({
          operation: 'batch_pdf',
          originalFileName: item.file.name,
          outputFileName: item.outputFile!.name,
          originalSizeBytes: item.file.size,
          outputSizeBytes: item.outputFile!.size,
          outputPath: uri
        });
      }
    }
    await this.refreshQuota();
    if (savedCount > 0) {
      this.toast.success(`Saved ${savedCount} file(s) to Documents.`);
    }
  }

  generateCsvLog(): string {
    const headers = ['File Name', 'Original Size (Bytes)', 'Status', 'Processed Size (Bytes)', 'Output File Name', 'Failure Reason'];
    const rows = this.items.map(i => [
      `"${(i.file?.name || '').replace(/"/g, '""')}"`,
      i.file?.size ?? i.originalSizeBytes ?? 0,
      `"${i.status}"`,
      i.processedSizeBytes ?? '',
      i.outputFile ? `"${i.outputFile.name.replace(/"/g, '""')}"` : '',
      i.failureReason ? `"${i.failureReason.replace(/"/g, '""')}"` : ''
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Writes the result log through StorageService.
   *
   * An anchor with a blob URL downloads nothing inside the Android WebView, so
   * on the platform this app ships to, the CSV export button did nothing at
   * all.
   */
  async downloadCsvLog(): Promise<void> {
    const csv = this.generateCsvLog();
    const filename = `batch_${this.operation}_results_${new Date().toISOString().slice(0, 10)}.csv`;
    const file = new File([new Blob([csv], { type: 'text/csv;charset=utf-8;' })], filename, {
      type: 'text/csv'
    });

    const uri = await this.storageService.saveReportFile(file);
    if (uri === 'web-download') {
      this.toast.success('Batch result log downloaded (CSV).');
    } else if (uri) {
      this.toast.success('Batch result log saved to your Documents folder.');
    }
  }
}
