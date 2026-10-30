import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PDFDocument } from 'pdf-lib';

import { PdfCryptoSignService } from '../../core/services/pdf-crypto-sign.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  UnlockedP12Data,
  CryptoSignResult,
  CryptoSignVerificationReport
} from '../../core/models/crypto-sign.types';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-sign-certificate',
  templateUrl: './sign-certificate.page.html',
  styleUrls: ['./sign-certificate.page.scss'],
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
export class SignCertificatePage implements OnInit {
  private cryptoSignService = inject(PdfCryptoSignService);
  private documentBridge = inject(DocumentBridgeService);
  private shareService = inject(ShareService);
  private storageService = inject(StorageService, { optional: true });
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // PDF Document State
  pdfBytes: Uint8Array | null = null;
  fileName = 'document.pdf';
  pageCount = 1;
  isLoadingDoc = false;

  // PKCS#12 Certificate State
  p12Bytes: Uint8Array | null = null;
  p12FileName = '';
  p12Password = '';
  showPassword = false;
  isUnlockingCert = false;
  unlockedData: UnlockedP12Data | null = null;
  certError: string | null = null;

  // Signature Configuration
  reason = 'I approve this document';
  location = 'Mumbai, India';
  includeVisualStamp = true;
  stampPage = 1;

  // Execution & Progress State
  isSigning = false;
  signResult: CryptoSignResult | null = null;
  verificationReport: CryptoSignVerificationReport | null = null;

  async ngOnInit(): Promise<void> {
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      await this.loadPdfFile(bridged.file);
    } else {
      await this.initSampleDocument();
    }
  }

  // ==========================================
  // Document Loading
  // ==========================================

  triggerPdfInput(inputEl: HTMLInputElement): void {
    inputEl.click();
  }

  async onPdfSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.loadPdfFile(input.files[0]);
    }
    input.value = '';
  }

  async loadPdfFile(file: File): Promise<void> {
    this.isLoadingDoc = true;
    this.fileName = file.name;
    this.signResult = null;
    this.verificationReport = null;
    this.cdr.markForCheck();

    try {
      const buffer = await file.arrayBuffer();
      this.pdfBytes = new Uint8Array(buffer);
      const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      this.pageCount = doc.getPageCount();
      this.stampPage = 1;
    } catch (err) {
      console.error('Error loading PDF file:', err);
      await this.showToast('Could not load the selected PDF document', 'danger');
    } finally {
      this.isLoadingDoc = false;
      this.cdr.markForCheck();
    }
  }

  async initSampleDocument(): Promise<void> {
    try {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]); // A4
      page.drawText('Official Clearance Document', { x: 50, y: 760, size: 18 });
      page.drawText('This document requires a cryptographic digital signature.', {
        x: 50,
        y: 720,
        size: 11
      });
      page.drawText('Signed locally on device with X.509 PKCS#12 certificate.', {
        x: 50,
        y: 690,
        size: 10
      });
      this.pdfBytes = await doc.save();
      this.fileName = 'Sample_Document.pdf';
      this.pageCount = 1;
      this.stampPage = 1;
    } catch (e) {
      console.warn('Could not initialize sample doc:', e);
    }
  }

  // ==========================================
  // Certificate Ingestion & Unlocking
  // ==========================================

  triggerCertInput(inputEl: HTMLInputElement): void {
    inputEl.click();
  }

  async onCertSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.loadCertFile(input.files[0]);
    }
    input.value = '';
  }

  async loadCertFile(file: File): Promise<void> {
    this.p12FileName = file.name;
    this.certError = null;
    this.unlockedData = null;
    this.signResult = null;
    this.cdr.markForCheck();

    try {
      const buffer = await file.arrayBuffer();
      this.p12Bytes = new Uint8Array(buffer);
    } catch {
      this.certError = 'Failed to read certificate file';
      this.cdr.markForCheck();
    }
  }

  async generateTestCertificate(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      const testPass = 'CertTest123!';
      this.p12Password = testPass;
      this.p12FileName = 'Test_Signer.p12';

      const res = await this.cryptoSignService.createSelfSignedP12(
        'Verified User',
        testPass,
        'Digital Signature Studio'
      );
      this.p12Bytes = res.p12Bytes;
      this.unlockCertificate();
      await this.showToast('Generated and unlocked test certificate!', 'success');
    } catch (err: any) {
      this.certError = err?.message || 'Failed to create test certificate';
      this.cdr.markForCheck();
    }
  }

  unlockCertificate(): void {
    if (!this.p12Bytes) {
      this.certError = 'Please select a .p12 or .pfx certificate file first';
      return;
    }

    this.isUnlockingCert = true;
    this.certError = null;
    this.cdr.markForCheck();

    try {
      this.unlockedData = this.cryptoSignService.unlockP12(this.p12Bytes, this.p12Password);
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.showToast(
        `Unlocked certificate for ${this.unlockedData.certInfo.commonName}`,
        'success'
      );
    } catch (err: any) {
      this.unlockedData = null;
      this.certError = err?.message || 'Incorrect password or unreadable certificate';
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    } finally {
      this.isUnlockingCert = false;
      this.cdr.markForCheck();
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  clearCertificate(): void {
    this.p12Bytes = null;
    this.p12FileName = '';
    this.p12Password = '';
    this.unlockedData = null;
    this.certError = null;
    this.signResult = null;
    this.verificationReport = null;
    this.cdr.markForCheck();
  }

  // ==========================================
  // Cryptographic Signing Execution
  // ==========================================

  async executeCertificateSign(): Promise<void> {
    if (!this.pdfBytes || !this.unlockedData) return;

    this.isSigning = true;
    this.cdr.markForCheck();

    try {
      await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});

      const result = await this.cryptoSignService.signPdf(this.pdfBytes, this.unlockedData, {
        reason: this.reason.trim(),
        location: this.location.trim(),
        includeVisualStamp: this.includeVisualStamp,
        stampPage: this.stampPage
      });

      this.signResult = result;
      this.verificationReport = await this.cryptoSignService.verifyPdfSignature(
        result.signedPdfBytes
      );

      // Update active PDF bytes with signed document
      this.pdfBytes = result.signedPdfBytes;

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.showToast(
        `Document successfully signed with certificate for ${result.signerCommonName}`,
        'success'
      );
    } catch (err: any) {
      console.error('Error signing PDF:', err);
      await this.showToast(err?.message || 'Failed to sign document with certificate', 'danger');
    } finally {
      this.isSigning = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Distribution & Sharing
  // ==========================================

  async shareSignedDocument(): Promise<void> {
    if (!this.pdfBytes) return;

    const file = new File([this.pdfBytes as any], this.fileName, {
      type: 'application/pdf'
    });

    try {
      await this.shareService.shareFile(file, `Signed Document: ${this.fileName}`);
    } catch (e) {
      console.warn('Share dismissed or unavailable:', e);
    }
  }

  async downloadSignedDocument(): Promise<void> {
    if (!this.pdfBytes) return;

    try {
      const blob = new Blob([this.pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const downloadName = this.fileName.endsWith('.pdf')
        ? this.fileName.replace('.pdf', '_signed.pdf')
        : `${this.fileName}_signed.pdf`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await this.showToast('Downloaded signed document', 'success');
    } catch {
      await this.showToast('Download failed', 'danger');
    }
  }

  navigateBack(): void {
    this.router.navigate(['/features/pdf']);
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
