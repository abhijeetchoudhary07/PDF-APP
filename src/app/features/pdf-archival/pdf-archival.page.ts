import { Component, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PdfArchivalService } from '../../core/services/pdf-archival.service';
import {
  ArchivalReadinessReport,
  ArchivalConversionResult
} from '../../core/models/pdf-archival.types';
import { ToastService } from '../../core/services/toast.service';
import { StorageService } from '../../core/services/storage.service';
import { FileService } from '../../core/services/file.service';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-archival',
  templateUrl: './pdf-archival.page.html',
  styleUrls: ['./pdf-archival.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ]
})
export class PdfArchivalPage {
  private archivalService = inject(PdfArchivalService);
  private toastService = inject(ToastService);
  private storageService = inject(StorageService);
  private fileService = inject(FileService);
  private cdr = inject(ChangeDetectorRef);

  selectedFile: File | null = null;
  report: ArchivalReadinessReport | null = null;
  conversionResult: ArchivalConversionResult | null = null;

  isAuditing = false;
  isConverting = false;

  async onFileSelected(file: File): Promise<void> {
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file');
      return;
    }

    this.selectedFile = file;
    this.conversionResult = null;
    this.cdr.detectChanges();
    await this.runReadinessAudit();
  }

  async runReadinessAudit(): Promise<void> {
    if (!this.selectedFile) return;

    this.isAuditing = true;
    this.cdr.detectChanges();
    try {
      this.report = await this.archivalService.auditArchivalReadiness(this.selectedFile);
    } catch {
      this.toastService.error('Failed to audit document structure');
    } finally {
      this.isAuditing = false;
      this.cdr.detectChanges();
    }
  }

  async convertToArchival(): Promise<void> {
    if (!this.selectedFile) return;

    this.isConverting = true;
    this.cdr.detectChanges();
    try {
      this.conversionResult = await this.archivalService.convertToArchival(this.selectedFile);
      this.toastService.success('Document prepared for archiving');
    } catch (e: any) {
      this.toastService.error(`Archival preparation failed: ${e?.message || e}`);
    } finally {
      this.isConverting = false;
      this.cdr.detectChanges();
    }
  }

  async saveArchivalFile(): Promise<void> {
    if (!this.conversionResult) return;

    try {
      await this.storageService.saveFile(
        this.conversionResult.archivalFile,
        this.conversionResult.archivalFile.name
      );
      this.toastService.success('Archival PDF saved to device');
    } catch {
      // Fallback browser download
      this.fileService.downloadFile(this.conversionResult.archivalFile);
      this.toastService.success('Archival PDF downloaded');
    }
  }

  reset(): void {
    this.selectedFile = null;
    this.report = null;
    this.conversionResult = null;
  }
}
