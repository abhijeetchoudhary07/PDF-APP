import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PdfMailMergeService } from '../../core/services/pdf-mail-merge.service';
import { PdfFormDataService } from '../../core/services/pdf-form-data.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  CsvParsedData,
  MailMergeFieldMapping,
  MailMergeBatchResult,
  MailMergeProgress,
  FormFieldDataRecord
} from '../../core/models/pdf-forms.types';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type WizardStep = 1 | 2 | 3 | 4;

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-forms-mail-merge',
  templateUrl: './forms-mail-merge.page.html',
  styleUrls: ['./forms-mail-merge.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    TranslatePipe
  ]
})
export class FormsMailMergePage implements OnInit {
  private mailMergeService = inject(PdfMailMergeService);
  private formDataService = inject(PdfFormDataService);
  private documentBridge = inject(DocumentBridgeService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private storageService = inject(StorageService, { optional: true });
  private toastCtrl = inject(ToastController);
  private cdr = inject(ChangeDetectorRef);

  // Stepper State
  currentStep: WizardStep = 1;

  // Step 1: Template
  templatePdfBytes: ArrayBuffer | null = null;
  templateFileName = 'template.pdf';
  detectedFields: FormFieldDataRecord[] = [];
  isLoadingTemplate = false;

  // Step 2: Data (CSV)
  csvFileName = '';
  csvData: CsvParsedData = { headers: [], rows: [], totalRows: 0 };
  isLoadingCsv = false;
  sampleRows: Record<string, string>[] = [];

  // Step 3: Mapping
  mappings: MailMergeFieldMapping[] = [];

  // Step 4: Generation Settings
  namingPattern = 'Document_{index}.pdf';
  flattenPdf = true;
  bundleAsZip = true;

  // Quota Status
  quotaRemaining: number | null = null;
  quotaLimit = 5;
  isUnlimitedQuota = false;
  quotaExceeded = false;

  // Execution & Progress State
  isProcessing = false;
  progress: MailMergeProgress = { current: 0, total: 0, percent: 0, statusText: '' };
  batchResult: MailMergeBatchResult | null = null;
  showSummary = false;
  showLog = false;
  private abortController: AbortController | null = null;

  async ngOnInit(): Promise<void> {
    await this.refreshQuota();

    // Check for bridged document
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      await this.loadTemplateFile(bridged.file);
    }
  }

  async refreshQuota(): Promise<void> {
    if (this.storageService) {
      try {
        const status = await this.storageService.getQuotaStatus();
        this.quotaRemaining = status.remaining;
        this.isUnlimitedQuota = status.isUnlimited;
        this.quotaLimit = status.limit;
        this.checkQuotaExceeded();
      } catch {
        this.isUnlimitedQuota = true;
      }
    } else {
      this.isUnlimitedQuota = true;
    }
    this.cdr.markForCheck();
  }

  private checkQuotaExceeded(): void {
    if (this.isUnlimitedQuota || this.quotaRemaining === null) {
      this.quotaExceeded = false;
    } else {
      this.quotaExceeded = this.csvData.totalRows > this.quotaRemaining;
    }
  }

  // ==========================================
  // Step 1: Template Selection
  // ==========================================

  triggerTemplateInput(input: HTMLInputElement): void {
    input.click();
  }

  async onTemplateSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      await this.loadTemplateFile(input.files[0]);
    }
    input.value = '';
  }

  async loadTemplateFile(file: File): Promise<void> {
    this.isLoadingTemplate = true;
    this.templateFileName = file.name;
    this.cdr.markForCheck();

    try {
      this.templatePdfBytes = await file.arrayBuffer();
      this.detectedFields = await this.formDataService.extractFieldRecords(this.templatePdfBytes);

      // Re-map if CSV already loaded
      if (this.csvData.headers.length > 0) {
        this.updateMappings();
      }
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch (err) {
      console.error('Error loading template PDF:', err);
      await this.showToast('Failed to load PDF template', 'danger');
    } finally {
      this.isLoadingTemplate = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Step 2: CSV Data Selection
  // ==========================================

  triggerCsvInput(input: HTMLInputElement): void {
    input.click();
  }

  async onCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      await this.loadCsvFile(input.files[0]);
    }
    input.value = '';
  }

  async loadCsvFile(file: File): Promise<void> {
    this.isLoadingCsv = true;
    this.csvFileName = file.name;
    this.cdr.markForCheck();

    try {
      const text = await file.text();
      this.csvData = this.mailMergeService.parseCsv(text);
      this.sampleRows = this.csvData.rows.slice(0, 3);
      this.checkQuotaExceeded();

      // Suggest default naming pattern using first column
      if (this.csvData.headers.length > 0) {
        const firstCol = this.csvData.headers[0];
        this.namingPattern = `Document_{index}_{${firstCol}}.pdf`;
      }

      this.updateMappings();
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch (err) {
      console.error('Error parsing CSV file:', err);
      await this.showToast('Failed to parse CSV file', 'danger');
    } finally {
      this.isLoadingCsv = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Step 3: Mapping Controls
  // ==========================================

  updateMappings(): void {
    if (this.detectedFields.length === 0 || this.csvData.headers.length === 0) {
      this.mappings = [];
      return;
    }

    const fieldInputs = this.detectedFields.map(f => ({
      name: f.name,
      type: f.type
    }));

    this.mappings = this.mailMergeService.autoMapFields(fieldInputs, this.csvData.headers);
    this.cdr.markForCheck();
  }

  onMappingChange(mapping: MailMergeFieldMapping, newCol: string | null): void {
    mapping.csvColumn = newCol === 'null' || !newCol ? null : newCol;
    mapping.isAutoMatched = false;
    this.cdr.markForCheck();
  }

  hasAtLeastOneMapping(): boolean {
    return this.mappings.some(m => m.csvColumn !== null);
  }

  // ==========================================
  // Step 4: Settings & Execution
  // ==========================================

  appendTokenToPattern(token: string): void {
    // If pattern already has .pdf at end, insert token before .pdf
    if (this.namingPattern.toLowerCase().endsWith('.pdf')) {
      const base = this.namingPattern.slice(0, -4);
      this.namingPattern = `${base}_{${token}}.pdf`;
    } else {
      this.namingPattern = `${this.namingPattern}_{${token}}.pdf`;
    }
    this.cdr.markForCheck();
  }

  async startBatchMerge(): Promise<void> {
    if (!this.templatePdfBytes || this.csvData.rows.length === 0) return;

    this.isProcessing = true;
    this.showSummary = false;
    this.showLog = false;
    this.abortController = new AbortController();
    this.progress = {
      current: 0,
      total: this.csvData.totalRows,
      percent: 0,
      statusText: 'Starting batch generation...'
    };
    this.cdr.markForCheck();

    try {
      this.batchResult = await this.mailMergeService.executeMailMerge(
        this.templatePdfBytes,
        this.csvData.rows,
        this.mappings,
        {
          namingPattern: this.namingPattern,
          flatten: this.flattenPdf,
          bundleAsZip: this.bundleAsZip,
          abortSignal: this.abortController.signal,
          onProgress: (p) => {
            this.progress = p;
            this.cdr.markForCheck();
          }
        }
      );

      this.showSummary = true;
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.refreshQuota();
    } catch (err: any) {
      console.error('Mail merge batch failed:', err);
      await this.showToast(err?.message || 'Mail merge batch failed', 'danger');
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.cdr.markForCheck();
    }
  }

  cancelBatch(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.showToast('Cancelling batch...', 'warning');
    }
  }

  async downloadZip(): Promise<void> {
    if (!this.batchResult?.zipBlob || !this.batchResult.zipFileName) return;

    const file = new File([this.batchResult.zipBlob], this.batchResult.zipFileName, {
      type: 'application/zip'
    });

    if (this.storageService) {
      await this.storageService.saveFile(file, 'mail-merge', 'form-mail-merge');
    }
    this.fileService.downloadFile(file);
    await this.showToast('Downloaded ZIP bundle', 'success');
  }

  async shareZip(): Promise<void> {
    if (!this.batchResult?.zipBlob || !this.batchResult.zipFileName) return;

    const file = new File([this.batchResult.zipBlob], this.batchResult.zipFileName, {
      type: 'application/zip'
    });
    await this.shareService.shareFile(file, this.batchResult.zipFileName);
  }

  resetBatch(): void {
    this.batchResult = null;
    this.showSummary = false;
    this.showLog = false;
    this.currentStep = 1;
    this.cdr.markForCheck();
  }

  // ==========================================
  // Stepper Navigation
  // ==========================================

  goToStep(step: WizardStep): void {
    if (step === 2 && !this.templatePdfBytes) return;
    if (step === 3 && (this.csvData.totalRows === 0 || !this.templatePdfBytes)) return;
    if (step === 4 && (!this.hasAtLeastOneMapping() || this.csvData.totalRows === 0)) return;

    this.currentStep = step;
    this.cdr.markForCheck();
  }

  nextStep(): void {
    if (this.currentStep < 4) {
      this.goToStep((this.currentStep + 1) as WizardStep);
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.goToStep((this.currentStep - 1) as WizardStep);
    }
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: 2500,
        position: 'bottom',
        color
      });
      await toast.present();
    } catch {
      // Mock / fallback
    }
  }
}
