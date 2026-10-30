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

import { PdfFormDataService } from '../../core/services/pdf-form-data.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  FormDataTransferFormat,
  FormDataExportResult,
  FormDataImportReport,
  FormDataImportFieldMatch,
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

export interface FormatCardConfig {
  format: FormDataTransferFormat;
  badgeKey: string;
  badgeVariant: 'primary' | 'secondary' | 'success' | 'warning';
  descKey: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-forms-data',
  templateUrl: './forms-data.page.html',
  styleUrls: ['./forms-data.page.scss'],
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
export class FormsDataPage implements OnInit {
  private pdfFormDataService = inject(PdfFormDataService);
  private documentBridge = inject(DocumentBridgeService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private storageService = inject(StorageService, { optional: true });
  private toastCtrl = inject(ToastController);
  private cdr = inject(ChangeDetectorRef);

  // Document State
  pdfBytes: ArrayBuffer | null = null;
  fileName = 'document.pdf';
  isLoadingDoc = false;
  totalFieldsCount = 0;
  filledFieldsCount = 0;
  blankFieldsCount = 0;
  fieldRecords: FormFieldDataRecord[] = [];

  // Tab State: 'export' | 'import'
  activeTab: 'export' | 'import' = 'export';

  // Export State
  exportResults: Record<FormDataTransferFormat, FormDataExportResult | null> = {
    json: null,
    csv: null,
    xfdf: null,
    fdf: null
  };
  isExporting = false;

  readonly formatCards: FormatCardConfig[] = [
    { format: 'json', badgeKey: 'formsData.formatJsonBadge', badgeVariant: 'primary', descKey: 'formsData.formatJsonDesc' },
    { format: 'csv', badgeKey: 'formsData.formatCsvBadge', badgeVariant: 'secondary', descKey: 'formsData.formatCsvDesc' },
    { format: 'xfdf', badgeKey: 'formsData.formatXfdfBadge', badgeVariant: 'success', descKey: 'formsData.formatXfdfDesc' },
    { format: 'fdf', badgeKey: 'formsData.formatFdfBadge', badgeVariant: 'warning', descKey: 'formsData.formatFdfDesc' }
  ];

  // Import State
  importedFileName: string | null = null;
  importedContent: string | null = null;
  detectedFormat: FormDataTransferFormat | null = null;
  previewReport: FormDataImportReport | null = null;
  isAnalyzingImport = false;
  isApplyingImport = false;
  showPreviewSheet = false;

  async ngOnInit(): Promise<void> {
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      await this.loadPdfFile(bridged.file);
    }
  }

  // ==========================================
  // PDF Document Loading & Analysis
  // ==========================================

  triggerPdfInput(inputEl: HTMLInputElement): void {
    inputEl.click();
  }

  async onPdfSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      await this.loadPdfFile(input.files[0]);
    }
    input.value = '';
  }

  async loadPdfFile(file: File): Promise<void> {
    this.isLoadingDoc = true;
    this.fileName = file.name;
    this.cdr.markForCheck();

    try {
      const buffer = await file.arrayBuffer();
      this.pdfBytes = buffer;
      await this.analyzeDocument();
    } catch (err) {
      console.error('Error loading PDF file:', err);
      await this.showToast('Failed to load PDF document', 'danger');
    } finally {
      this.isLoadingDoc = false;
      this.cdr.markForCheck();
    }
  }

  async analyzeDocument(): Promise<void> {
    if (!this.pdfBytes) return;

    try {
      this.fieldRecords = await this.pdfFormDataService.extractFieldRecords(this.pdfBytes);
      this.totalFieldsCount = this.fieldRecords.length;

      let filled = 0;
      for (const rec of this.fieldRecords) {
        if (rec.type === 'checkbox') {
          if (rec.isChecked) filled++;
        } else if (rec.type === 'radio') {
          if (rec.selectedOption) filled++;
        } else {
          if (rec.value !== undefined && rec.value !== null && String(rec.value).trim() !== '') {
            filled++;
          }
        }
      }
      this.filledFieldsCount = filled;
      this.blankFieldsCount = Math.max(0, this.totalFieldsCount - filled);

      // Pre-compute all export formats
      await this.generateAllExports();
    } catch (err) {
      console.error('Error analyzing form fields:', err);
      await this.showToast('Failed to analyze form fields', 'warning');
    }
  }

  private async generateAllExports(): Promise<void> {
    if (!this.pdfBytes) return;
    this.isExporting = true;
    const baseName = this.fileName.replace(/\.pdf$/i, '');

    try {
      const formats: FormDataTransferFormat[] = ['json', 'csv', 'xfdf', 'fdf'];
      for (const fmt of formats) {
        this.exportResults[fmt] = await this.pdfFormDataService.exportFormData(
          this.pdfBytes,
          fmt,
          baseName
        );
      }
    } catch (err) {
      console.error('Error generating exports:', err);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Export Actions
  // ==========================================

  async copyExportToClipboard(format: FormDataTransferFormat): Promise<void> {
    const res = this.exportResults[format];
    if (!res) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(res.content);
      }
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      await this.showToast(`Copied ${format.toUpperCase()} data to clipboard`, 'success');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      await this.showToast('Could not copy to clipboard', 'warning');
    }
  }

  async shareOrSaveExport(format: FormDataTransferFormat): Promise<void> {
    const res = this.exportResults[format];
    if (!res) return;

    try {
      const saved = await this.pdfFormDataService.saveExportFile(res);
      await this.shareService.shareFile(saved.file, res.fileName);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.showToast(`Saved ${res.fileName}`, 'success');
    } catch (err) {
      console.error('Share / Save failed:', err);
      await this.showToast('Failed to save or share data file', 'danger');
    }
  }

  // ==========================================
  // Import Actions
  // ==========================================

  triggerDataFileInput(inputEl: HTMLInputElement): void {
    inputEl.click();
  }

  async onDataFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      await this.loadImportFile(input.files[0]);
    }
    input.value = '';
  }

  async onDataFileDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      await this.loadImportFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  async loadImportFile(file: File): Promise<void> {
    if (!this.pdfBytes) {
      await this.showToast('Please select a PDF document first', 'warning');
      return;
    }

    this.isAnalyzingImport = true;
    this.importedFileName = file.name;
    this.cdr.markForCheck();

    try {
      const text = await file.text();
      this.importedContent = text;
      this.detectedFormat = this.pdfFormDataService.detectFormat(text);

      const report = await this.pdfFormDataService.previewImport(
        this.pdfBytes,
        text,
        this.detectedFormat
      );

      this.previewReport = report;
      this.showPreviewSheet = true;
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch (err: any) {
      console.error('Failed to parse import data:', err);
      await this.showToast(err?.message || 'Failed to parse import data file', 'danger');
    } finally {
      this.isAnalyzingImport = false;
      this.cdr.markForCheck();
    }
  }

  toggleFieldInclusion(field: FormDataImportFieldMatch): void {
    field.included = !field.included;
    this.cdr.markForCheck();
  }

  closePreviewSheet(): void {
    this.showPreviewSheet = false;
    this.cdr.markForCheck();
  }

  async applyImportData(): Promise<void> {
    if (!this.pdfBytes || !this.previewReport) return;

    this.isApplyingImport = true;
    this.cdr.markForCheck();

    try {
      const updatedBytes = await this.pdfFormDataService.applyImport(
        this.pdfBytes,
        this.previewReport.matchedFields
      );

      // Save updated PDF to StorageService and trigger download
      const baseName = this.fileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}_filled.pdf`;
      const outBlob = new Blob([updatedBytes as any], { type: 'application/pdf' });
      const outFile = new File([outBlob], outName, { type: 'application/pdf' });

      if (this.storageService) {
        await this.storageService.saveFile(outFile, 'form-data', 'form-data-transfer');
      }
      this.fileService.downloadFile(outFile);

      // Update current document state with newly updated PDF bytes
      this.pdfBytes = updatedBytes.buffer.slice(
        updatedBytes.byteOffset,
        updatedBytes.byteOffset + updatedBytes.byteLength
      ) as ArrayBuffer;
      this.fileName = outName;
      await this.analyzeDocument();

      this.showPreviewSheet = false;
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      const activeCount = this.previewReport.matchedFields.filter(f => f.included).length;
      await this.showToast(`Applied ${activeCount} field values successfully`, 'success');
    } catch (err: any) {
      console.error('Failed to apply import data:', err);
      await this.showToast('Failed to apply data to PDF', 'danger');
    } finally {
      this.isApplyingImport = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  setTab(tab: 'export' | 'import'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  getIncludedCount(): number {
    if (!this.previewReport) return 0;
    return this.previewReport.matchedFields.filter(f => f.included).length;
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
      // Fallback if toast controller is not available in mock/test
    }
  }
}
