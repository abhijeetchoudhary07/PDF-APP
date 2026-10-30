import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PDFDocument } from 'pdf-lib';

import { FileService } from '../../core/services/file.service';
import { PdfSecurityService } from '../../core/services/pdf-security.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ValidationService } from '../../core/services/validation.service';
import { SingleFileWorkflowState } from '../../core/models/file-workflow-state.model';
import {
  PdfSecurityPermissions,
  PdfProtectionConfig,
  PdfSecurityStatus,
  DEFAULT_PERMISSIONS,
  EncryptionStandard
} from '../../core/models/pdf-security.types';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppProgressComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  ResultPreviewComponent,
  PasswordStrengthMeterComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-security-protect',
  templateUrl: './security-protect.page.html',
  styleUrls: ['./security-protect.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppIconComponent,
    AppProgressComponent,
    FileDropzoneComponent,
    ResultPreviewComponent,
    PasswordStrengthMeterComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class SecurityProtectPage implements OnInit {
  private fileService = inject(FileService);
  private pdfSecurity = inject(PdfSecurityService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private validationService = inject(ValidationService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Document workflow
  workflowState: SingleFileWorkflowState = 'EMPTY';
  loadedFile?: File;
  arrayBuffer?: ArrayBuffer;
  pageCount = 1;
  securityStatus?: PdfSecurityStatus;
  isAnalyzing = false;
  isEncrypting = false;
  errorMessage = '';

  // Source Password for pre-encrypted PDFs
  sourcePassword = '';
  showSourcePassword = false;

  // Cryptographic Standard
  encryptionStandard: EncryptionStandard = 'aes-256';

  // Passwords
  userPassword = '';
  confirmUserPassword = '';
  showUserPassword = false;

  ownerPassword = '';
  confirmOwnerPassword = '';
  showOwnerPassword = false;
  showAdvancedOwner = false;

  // Granular Permissions
  permissions: PdfSecurityPermissions = { ...DEFAULT_PERMISSIONS };

  // Result state
  resultFile?: File;
  savedUri?: string;

  ngOnInit(): void {}

  async selectPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;
    await this.onFileSelected(file);
  }

  async onFileSelected(file: File): Promise<void> {
    const val = this.validationService.validatePdf(file);
    if (!val.valid) {
      this.workflowState = 'ERROR';
      this.errorMessage = val.error || 'Invalid PDF file.';
      this.cdr.markForCheck();
      return;
    }

    this.loadedFile = file;
    this.resultFile = undefined;
    this.savedUri = undefined;
    this.workflowState = 'FILE_SELECTED';
    this.errorMessage = '';
    this.isAnalyzing = true;
    this.cdr.markForCheck();

    try {
      this.arrayBuffer = await file.arrayBuffer();
      const bufVal = this.validationService.validatePdfBuffer(this.arrayBuffer);
      if (!bufVal.valid) {
        throw new Error(bufVal.error);
      }

      // Count pages
      try {
        const doc = await PDFDocument.load(this.arrayBuffer.slice(0), { ignoreEncryption: true });
        this.pageCount = doc.getPageCount();
      } catch {
        this.pageCount = 1;
      }

      // Detect current protection status
      this.securityStatus = await this.pdfSecurity.detectSecurity(this.arrayBuffer);

      this.workflowState = 'CONFIGURING';
      await this.triggerHaptic(ImpactStyle.Light);
    } catch (e: any) {
      this.workflowState = 'ERROR';
      this.errorMessage = 'Could not load PDF: ' + (e.message || String(e));
    } finally {
      this.isAnalyzing = false;
      this.cdr.markForCheck();
    }
  }

  removeFile(): void {
    this.loadedFile = undefined;
    this.arrayBuffer = undefined;
    this.securityStatus = undefined;
    this.resultFile = undefined;
    this.workflowState = 'EMPTY';
    this.errorMessage = '';
    this.userPassword = '';
    this.confirmUserPassword = '';
    this.ownerPassword = '';
    this.confirmOwnerPassword = '';
    this.sourcePassword = '';
    this.cdr.markForCheck();
  }

  resetConfig(): void {
    this.resultFile = undefined;
    this.savedUri = undefined;
    this.userPassword = '';
    this.confirmUserPassword = '';
    this.ownerPassword = '';
    this.confirmOwnerPassword = '';
    this.sourcePassword = '';
    this.workflowState = this.loadedFile ? 'CONFIGURING' : 'EMPTY';
    this.cdr.markForCheck();
  }

  onPassphraseGenerated(passphrase: string): void {
    this.userPassword = passphrase;
    this.confirmUserPassword = passphrase;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  setStandard(std: EncryptionStandard): void {
    this.encryptionStandard = std;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  togglePrinting(mode: 'high-resolution' | 'low-resolution' | 'none'): void {
    this.permissions.allowPrinting = mode;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  toggleCopying(): void {
    this.permissions.allowCopying = !this.permissions.allowCopying;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  toggleModifying(): void {
    this.permissions.allowModifying = !this.permissions.allowModifying;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  toggleForms(): void {
    this.permissions.allowFillingForms = !this.permissions.allowFillingForms;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  toggleAnnotations(): void {
    this.permissions.allowAnnotating = !this.permissions.allowAnnotating;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  toggleAssembly(): void {
    this.permissions.allowDocumentAssembly = !this.permissions.allowDocumentAssembly;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  get canExecute(): boolean {
    if (!this.loadedFile || !this.arrayBuffer) return false;
    if (this.securityStatus?.isEncrypted && this.securityStatus?.requiresUserPassword && !this.sourcePassword) {
      return false;
    }
    if (!this.userPassword && !this.ownerPassword) return false;
    if (this.userPassword && this.userPassword !== this.confirmUserPassword) return false;
    if (this.ownerPassword && this.ownerPassword !== this.confirmOwnerPassword) return false;
    return !this.isEncrypting;
  }

  async executeProtect(): Promise<void> {
    if (!this.loadedFile || !this.arrayBuffer) return;

    if (!this.userPassword && !this.ownerPassword) {
      const alert = await this.alertCtrl.create({
        header: 'Password Required',
        message: 'Please enter a password to protect this document.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    if (this.userPassword && this.userPassword !== this.confirmUserPassword) {
      const alert = await this.alertCtrl.create({
        header: 'Password Mismatch',
        message: 'User password and confirmation do not match.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    if (this.ownerPassword && this.ownerPassword !== this.confirmOwnerPassword) {
      const alert = await this.alertCtrl.create({
        header: 'Password Mismatch',
        message: 'Owner password and confirmation do not match.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    this.isEncrypting = true;
    this.workflowState = 'PROCESSING';
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      const config: PdfProtectionConfig = {
        userPassword: this.userPassword || undefined,
        ownerPassword: this.ownerPassword || this.userPassword,
        permissions: this.permissions,
        encryptionLevel: this.encryptionStandard,
        sourcePassword: this.sourcePassword || undefined
      };

      const outName = `${this.loadedFile.name.replace(/\.pdf$/i, '')}_protected.pdf`;
      const result = await this.pdfSecurity.protectPdf(this.arrayBuffer, config, outName);

      const uri = await this.storageService.saveFile(result.file, 'protected_pdf');
      this.savedUri = uri;

      await this.historyService.addHistoryItem({
        operation: 'pdf_protect',
        originalFileName: this.loadedFile.name,
        outputFileName: result.file.name,
        originalSizeBytes: this.loadedFile.size,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri
      });

      // Clear passwords from memory
      this.userPassword = '';
      this.confirmUserPassword = '';
      this.ownerPassword = '';
      this.confirmOwnerPassword = '';
      this.sourcePassword = '';

      this.resultFile = result.file;
      this.workflowState = 'SUCCESS';
      await this.triggerNotification(NotificationType.Success);
    } catch (e: any) {
      this.workflowState = 'ERROR';
      this.errorMessage = e.message || 'Encryption failed. Please try again.';
      await this.triggerNotification(NotificationType.Error);
      const alert = await this.alertCtrl.create({
        header: 'Encryption Failed',
        message: this.errorMessage,
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isEncrypting = false;
      this.cdr.markForCheck();
    }
  }

  shareResult(): void {
    if (this.savedUri && this.savedUri !== 'web-download') {
      this.shareService.shareFile(this.savedUri, 'Protected Document');
    }
  }

  private async triggerHaptic(style: ImpactStyle): Promise<void> {
    try {
      await Haptics.impact({ style });
    } catch {
      // ignore
    }
  }

  private async triggerNotification(type: NotificationType): Promise<void> {
    try {
      await Haptics.notification({ type });
    } catch {
      // ignore
    }
  }
}
