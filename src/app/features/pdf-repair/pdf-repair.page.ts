import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfRepairService } from '../../core/services/pdf-repair.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  PdfHealthReport,
  PdfRecoveryResult
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

export type RepairStep = 'select' | 'diagnosing' | 'diagnostic_report' | 'recovering' | 'recovery_report';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-repair',
  templateUrl: './pdf-repair.page.html',
  styleUrls: ['./pdf-repair.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    PdfPreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfRepairPage {
  currentStep: RepairStep = 'select';
  selectedFile?: File;

  // Diagnostic state
  isDiagnosing = false;
  healthReport?: PdfHealthReport;

  // Recovery state
  isRecovering = false;
  recoveryProgress = 0;
  recoveryMessage = '';
  recoveryResult?: PdfRecoveryResult;
  recoveredArrayBuffer?: ArrayBuffer;

  constructor(
    private repairService: PdfRepairService,
    private fileService: FileService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  async onFileSelected(file: File): Promise<void> {
    this.selectedFile = file;
    this.currentStep = 'diagnosing';
    this.isDiagnosing = true;
    this.cdr.detectChanges();

    try {
      this.healthReport = await this.repairService.diagnosePdf(file);
      this.currentStep = 'diagnostic_report';
    } catch (err: any) {
      this.toastService.error('Diagnostic scan failed: ' + (err?.message || err));
      this.currentStep = 'select';
    } finally {
      this.isDiagnosing = false;
      this.cdr.detectChanges();
    }
  }

  async startRecovery(): Promise<void> {
    if (!this.selectedFile) return;

    this.currentStep = 'recovering';
    this.isRecovering = true;
    this.recoveryProgress = 10;
    this.recoveryMessage = 'Initializing recovery pipeline...';
    this.cdr.detectChanges();

    try {
      const outputName = this.selectedFile.name.replace(/\.pdf$/i, '') + '_repaired.pdf';
      this.recoveryResult = await this.repairService.repairPdf(
        this.selectedFile,
        (pct, msg) => {
          this.recoveryProgress = pct;
          this.recoveryMessage = msg;
          this.cdr.detectChanges();
        },
        outputName
      );

      this.recoveredArrayBuffer = await this.recoveryResult.recoveredBlob.arrayBuffer();
      this.currentStep = 'recovery_report';

      // Add to history
      await this.historyService.addHistoryItem({
        operation: 'Repaired PDF',
        originalFileName: this.selectedFile.name,
        outputFileName: outputName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: this.recoveryResult.sizeBytes
      });

      this.toastService.success('Document successfully repaired!');
    } catch (err: any) {
      this.toastService.error('Recovery failed: ' + (err?.message || err));
      this.currentStep = 'diagnostic_report';
    } finally {
      this.isRecovering = false;
      this.cdr.detectChanges();
    }
  }

  downloadRecovered(): void {
    if (this.recoveryResult?.recoveredFile) {
      this.fileService.downloadFile(this.recoveryResult.recoveredFile);
      this.toastService.success('Repaired PDF downloaded.');
    }
  }

  shareRecovered(): void {
    if (this.recoveryResult?.recoveredFile) {
      this.shareService.shareFile(this.recoveryResult.recoveredFile);
    }
  }

  reset(): void {
    this.currentStep = 'select';
    this.selectedFile = undefined;
    this.healthReport = undefined;
    this.recoveryResult = undefined;
    this.recoveredArrayBuffer = undefined;
  }
}
