import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfFingerprintService } from '../../core/services/pdf-fingerprint.service';
import { ToastService } from '../../core/services/toast.service';
import {
  DocumentFingerprint,
  DriftComparisonResult
} from '../../core/models/pdf-integrity.types';
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

export type FingerprintViewMode = 'generate' | 'verify' | 'saved';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-fingerprint',
  templateUrl: './pdf-fingerprint.page.html',
  styleUrls: ['./pdf-fingerprint.page.scss'],
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
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfFingerprintPage implements OnInit {
  private readonly fingerprintService = inject(PdfFingerprintService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  viewMode: FingerprintViewMode = 'generate';
  isProcessing = false;

  // Generate Mode State
  selectedFile?: File;
  currentFingerprint?: DocumentFingerprint;
  copiedHash = false;

  // Verify Mode State
  verifyFile?: File;
  selectedReceiptForVerification?: DocumentFingerprint;
  driftResult?: DriftComparisonResult;

  // Saved Receipts
  savedReceipts: DocumentFingerprint[] = [];

  async ngOnInit(): Promise<void> {
    await this.loadSavedReceipts();
  }

  async loadSavedReceipts(): Promise<void> {
    this.savedReceipts = await this.fingerprintService.getSavedReceipts();
    this.cdr.markForCheck();
  }

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toast.error('Please select a PDF document.');
      return;
    }

    this.selectedFile = file;
    this.isProcessing = true;
    this.currentFingerprint = undefined;
    this.driftResult = undefined;
    this.cdr.markForCheck();

    try {
      this.currentFingerprint = await this.fingerprintService.generateFingerprint(file);
      this.toast.success('Cryptographic fingerprint generated.');
    } catch (err: any) {
      this.toast.error('Failed to generate fingerprint: ' + (err?.message || err));
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  async onVerifyFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toast.error('Please select a PDF document to verify.');
      return;
    }

    if (!this.selectedReceiptForVerification) {
      this.toast.error('Please select a saved receipt first.');
      return;
    }

    this.verifyFile = file;
    this.isProcessing = true;
    this.driftResult = undefined;
    this.cdr.markForCheck();

    try {
      this.driftResult = await this.fingerprintService.compareWithReceipt(
        this.selectedReceiptForVerification,
        file
      );
      this.toast.info('Verification analysis completed.');
    } catch (err: any) {
      this.toast.error('Verification failed: ' + (err?.message || err));
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  selectReceiptToVerify(receipt: DocumentFingerprint): void {
    this.selectedReceiptForVerification = receipt;
    this.viewMode = 'verify';
    this.driftResult = undefined;
    this.verifyFile = undefined;
    this.cdr.markForCheck();
  }

  async saveCurrentReceipt(): Promise<void> {
    if (!this.currentFingerprint) return;

    try {
      await this.fingerprintService.saveReceipt(this.currentFingerprint);
      await this.loadSavedReceipts();
      this.toast.success('Integrity receipt saved locally.');
    } catch (err: any) {
      this.toast.error('Failed to save receipt: ' + (err?.message || err));
    }
  }

  async deleteSavedReceipt(id: string): Promise<void> {
    try {
      await this.fingerprintService.deleteReceipt(id);
      await this.loadSavedReceipts();
      if (this.selectedReceiptForVerification?.id === id) {
        this.selectedReceiptForVerification = undefined;
        this.driftResult = undefined;
      }
      this.toast.info('Receipt removed.');
    } catch (err: any) {
      this.toast.error('Failed to delete receipt: ' + (err?.message || err));
    }
  }

  async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedHash = true;
      this.toast.info('Checksum copied to clipboard.');
      setTimeout(() => {
        this.copiedHash = false;
        this.cdr.markForCheck();
      }, 2000);
      this.cdr.markForCheck();
    } catch {
      this.toast.error('Could not copy to clipboard.');
    }
  }

  exportTextReceipt(): void {
    if (!this.currentFingerprint) return;

    const text = this.fingerprintService.exportReceiptAsText(this.currentFingerprint);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${this.currentFingerprint.fileName.replace(/\.pdf$/i, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Receipt exported as text.');
  }

  async exportPdfReceipt(): Promise<void> {
    if (!this.currentFingerprint) return;

    this.isProcessing = true;
    this.cdr.markForCheck();

    try {
      const savedPath = await this.fingerprintService.saveReceiptPdfFile(this.currentFingerprint);
      if (savedPath) {
        this.toast.success('Stamped PDF receipt generated and saved.');
      }
    } catch (err: any) {
      this.toast.error('Failed to export PDF receipt: ' + (err?.message || err));
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  resetCurrent(): void {
    this.selectedFile = undefined;
    this.currentFingerprint = undefined;
    this.driftResult = undefined;
    this.cdr.markForCheck();
  }
}
