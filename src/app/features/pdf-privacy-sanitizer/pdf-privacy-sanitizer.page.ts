import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfPrivacyService } from '../../core/services/pdf-privacy.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  PrivacyScanReport,
  PrivacyScanItem,
  SanitizationOptions,
  SanitizationResult
} from '../../core/models/pdf-analysis.types';
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
import { PdfPreviewComponent } from '../../shared/components/pdf-preview/pdf-preview.component';

export type PrivacyStep = 'select' | 'scanning' | 'scan_result' | 'sanitizing' | 'sanitized';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-privacy-sanitizer',
  templateUrl: './pdf-privacy-sanitizer.page.html',
  styleUrls: ['./pdf-privacy-sanitizer.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    PdfPreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfPrivacySanitizerPage implements OnInit, OnDestroy {
  currentStep: PrivacyStep = 'select';
  selectedFile?: File;

  // Scan state
  scanReport?: PrivacyScanReport;
  isScanning = false;

  // Sanitization options
  options: SanitizationOptions = {
    removeMetadata: true,
    removeComments: true,
    removeAttachments: true,
    removeForms: true,
    removeScripts: true,
    removeHiddenContent: true
  };

  // Result state
  sanitizationResult?: SanitizationResult;
  isSanitizing = false;
  sanitizedArrayBuffer?: ArrayBuffer;

  constructor(
    private privacyService: PdfPrivacyService,
    private fileService: FileService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file.');
      return;
    }

    this.selectedFile = file;
    this.currentStep = 'scanning';
    this.isScanning = true;
    this.cdr.detectChanges();

    try {
      this.scanReport = await this.privacyService.scanPdf(file);
      this.currentStep = 'scan_result';
    } catch (err: any) {
      this.toastService.error('Failed to scan PDF: ' + (err?.message || err));
      this.currentStep = 'select';
    } finally {
      this.isScanning = false;
      this.cdr.detectChanges();
    }
  }

  async startSanitization(): Promise<void> {
    if (!this.selectedFile) return;

    this.currentStep = 'sanitizing';
    this.isSanitizing = true;
    this.cdr.detectChanges();

    try {
      const outputName = this.selectedFile.name.replace(/\.pdf$/i, '') + '_sanitized.pdf';
      this.sanitizationResult = await this.privacyService.sanitizePdf(
        this.selectedFile,
        this.options,
        outputName
      );

      this.sanitizedArrayBuffer = await this.sanitizationResult.sanitizedBlob.arrayBuffer();
      this.currentStep = 'sanitized';

      // Add to history
      await this.historyService.addHistoryItem({
        operation: 'Sanitized PDF',
        originalFileName: this.selectedFile.name,
        outputFileName: outputName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: this.sanitizationResult.sizeBytes
      });

      this.toastService.success('Document successfully sanitized!');
    } catch (err: any) {
      this.toastService.error('Sanitization failed: ' + (err?.message || err));
      this.currentStep = 'scan_result';
    } finally {
      this.isSanitizing = false;
      this.cdr.detectChanges();
    }
  }

  downloadSanitized(): void {
    if (this.sanitizationResult?.sanitizedFile) {
      this.fileService.downloadFile(this.sanitizationResult.sanitizedFile);
      this.toastService.success('Sanitized file downloaded.');
    }
  }

  shareSanitized(): void {
    if (this.sanitizationResult?.sanitizedFile) {
      this.shareService.shareFile(this.sanitizationResult.sanitizedFile);
    }
  }

  reset(): void {
    this.currentStep = 'select';
    this.selectedFile = undefined;
    this.scanReport = undefined;
    this.sanitizationResult = undefined;
    this.sanitizedArrayBuffer = undefined;
  }
}
