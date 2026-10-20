import { Component, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PdfSignatureStatusService } from '../../core/services/pdf-signature-status.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentSignatureReport } from '../../core/models/pdf-signature-status.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-signature-status',
  templateUrl: './pdf-signature-status.page.html',
  styleUrls: ['./pdf-signature-status.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfSignatureStatusPage {
  private readonly sigService = inject(PdfSignatureStatusService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  currentFile?: File;
  report?: DocumentSignatureReport;
  isAnalyzing = false;

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toast.error('Please select a PDF document.');
      return;
    }
    this.currentFile = file;
    await this.analyze(file);
  }

  async analyze(file: File): Promise<void> {
    this.isAnalyzing = true;
    this.report = undefined;
    this.cdr.markForCheck();

    try {
      this.report = await this.sigService.analyzeSignatures(file);
      if (this.report.hasSignatures) {
        this.toast.info(`${this.report.signaturesFound} signature field(s) analyzed.`);
      } else {
        this.toast.info('Analysis complete: no digital signature fields located.');
      }
    } catch (err: any) {
      this.toast.error('Failed to parse signature structures: ' + (err?.message || err));
    } finally {
      this.isAnalyzing = false;
      this.cdr.markForCheck();
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }

  reset(): void {
    this.currentFile = undefined;
    this.report = undefined;
    this.cdr.markForCheck();
  }
}
