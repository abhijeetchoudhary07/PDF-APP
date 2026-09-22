import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular/lazy';
import { ActivatedRoute } from '@angular/router';
import { FileService } from '../../core/services/file.service';
import { PdfSecurityService } from '../../core/services/pdf-security.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { SingleFileWorkflowState, ProcessingStage, PROCESSING_STAGE_LABELS } from '../../core/models/file-workflow-state.model';
import {
  PdfSecurityPermissions,
  PdfProtectionConfig,
  PdfSecurityStatus,
  DEFAULT_PERMISSIONS
} from '../../core/models/pdf-security.types';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppProgressComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  ResultPreviewComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-security',
  templateUrl: './pdf-security.page.html',
  styleUrls: ['./pdf-security.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppProgressComponent,
    FileDropzoneComponent,
    FilePreviewComponent,
    ResultPreviewComponent
  ],
  providers: [DecimalPipe]
})
export class PdfSecurityPage implements OnInit {
  mode: 'unlock' | 'protect' = 'protect';

  securityTabs = [
    { id: 'unlock', label: 'Unlock PDF' },
    { id: 'protect', label: 'Protect PDF' }
  ];

  unlockWorkflowState: SingleFileWorkflowState = 'EMPTY';
  protectWorkflowState: SingleFileWorkflowState = 'EMPTY';
  currentStage: ProcessingStage = 'idle';
  stageLabels = PROCESSING_STAGE_LABELS;
  errorMessage = '';

  // UNLOCK STATE
  unlockFile?: File;
  unlockArrayBuffer?: ArrayBuffer;
  unlockPassword = '';
  unlockStatus?: PdfSecurityStatus;
  unlockResultFile?: File;
  unlockSavedUri?: string;
  isUnlocking = false;

  // PROTECT STATE
  protectFile?: File;
  protectArrayBuffer?: ArrayBuffer;
  userPassword = '';
  confirmUserPassword = '';
  ownerPassword = '';
  confirmOwnerPassword = '';
  showAdvancedPasswords = false;
  protectResultFile?: File;
  protectSavedUri?: string;

  permissions: PdfSecurityPermissions = { ...DEFAULT_PERMISSIONS };
  isProtecting = false;

  constructor(
    private route: ActivatedRoute,
    private fileService: FileService,
    private pdfSecurity: PdfSecurityService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const requestedMode = this.route.snapshot.data['mode'] || this.route.snapshot.queryParams['mode'];
    if (requestedMode === 'unlock' || requestedMode === 'protect') {
      this.mode = requestedMode;
    }
  }

  // --- UNLOCK WORKFLOW ---
  async selectPdfToUnlock(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;
    await this.onUnlockFileSelected(file);
  }

  async onUnlockFileSelected(file: File): Promise<void> {
    this.unlockFile = file;
    this.unlockPassword = '';
    this.unlockStatus = undefined;
    this.unlockResultFile = undefined;
    this.unlockWorkflowState = 'FILE_SELECTED';
    this.errorMessage = '';

    try {
      this.currentStage = 'analyzing';
      this.unlockArrayBuffer = await file.arrayBuffer();
      this.unlockStatus = await this.pdfSecurity.detectSecurity(this.unlockArrayBuffer);
      this.unlockWorkflowState = 'CONFIGURING';
      this.currentStage = 'idle';

      if (!this.unlockStatus.isEncrypted && !this.unlockStatus.requiresUserPassword) {
        const toast = await this.toastCtrl.create({
          message: 'This PDF document is already unencrypted and has no restrictions.',
          duration: 3500,
          color: 'medium'
        });
        await toast.present();
      }
    } catch (e: any) {
      this.unlockWorkflowState = 'ERROR';
      this.errorMessage = 'Could not analyze PDF: ' + (e.message || String(e));
    }
    this.cdr.markForCheck();
  }

  removeUnlockFile(): void {
    this.unlockFile = undefined;
    this.unlockArrayBuffer = undefined;
    this.unlockStatus = undefined;
    this.unlockResultFile = undefined;
    this.unlockWorkflowState = 'EMPTY';
    this.errorMessage = '';
    this.currentStage = 'idle';
    this.cdr.markForCheck();
  }

  resetUnlock(): void {
    this.unlockResultFile = undefined;
    this.unlockWorkflowState = this.unlockFile ? 'CONFIGURING' : 'EMPTY';
    this.cdr.markForCheck();
  }

  async executeUnlock(): Promise<void> {
    if (!this.unlockFile || !this.unlockArrayBuffer) return;

    this.isUnlocking = true;
    this.unlockWorkflowState = 'PROCESSING';
    this.currentStage = 'processing';
    this.errorMessage = '';

    try {
      const result = await this.pdfSecurity.unlockPdf(
        this.unlockArrayBuffer,
        this.unlockPassword,
        `${this.unlockFile.name.replace(/\.pdf$/i, '')}_unlocked.pdf`
      );

      this.currentStage = 'optimizing';
      const uri = await this.storageService.saveFile(result.file, 'pdf');
      this.unlockSavedUri = uri;

      await this.historyService.addHistoryItem({
        operation: 'pdf_unlock',
        originalFileName: this.unlockFile.name,
        outputFileName: result.file.name,
        originalSizeBytes: this.unlockFile.size,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri
      });

      // Clear password from memory immediately
      this.unlockPassword = '';
      this.unlockResultFile = result.file;
      this.currentStage = 'complete';
      this.unlockWorkflowState = 'SUCCESS';
    } catch (e: any) {
      this.unlockWorkflowState = 'ERROR';
      this.errorMessage = e.message || 'Incorrect password or unsupported encryption.';
      const alert = await this.alertCtrl.create({
        header: 'Unlock Failed',
        message: this.errorMessage,
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isUnlocking = false;
      this.cdr.markForCheck();
    }
  }

  // --- PROTECT WORKFLOW ---
  async selectPdfToProtect(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;
    await this.onProtectFileSelected(file);
  }

  async onProtectFileSelected(file: File): Promise<void> {
    this.protectFile = file;
    this.protectResultFile = undefined;
    this.protectWorkflowState = 'FILE_SELECTED';
    this.userPassword = '';
    this.confirmUserPassword = '';
    this.ownerPassword = '';
    this.confirmOwnerPassword = '';
    this.errorMessage = '';

    try {
      this.currentStage = 'analyzing';
      this.protectArrayBuffer = await file.arrayBuffer();
      this.protectWorkflowState = 'CONFIGURING';
      this.currentStage = 'idle';
    } catch (e: any) {
      this.protectWorkflowState = 'ERROR';
      this.errorMessage = 'Could not load PDF: ' + (e.message || String(e));
    }
    this.cdr.markForCheck();
  }

  removeProtectFile(): void {
    this.protectFile = undefined;
    this.protectArrayBuffer = undefined;
    this.protectResultFile = undefined;
    this.protectWorkflowState = 'EMPTY';
    this.errorMessage = '';
    this.currentStage = 'idle';
    this.cdr.markForCheck();
  }

  resetProtect(): void {
    this.protectResultFile = undefined;
    this.protectWorkflowState = this.protectFile ? 'CONFIGURING' : 'EMPTY';
    this.cdr.markForCheck();
  }

  async executeProtect(): Promise<void> {
    if (!this.protectFile || !this.protectArrayBuffer) return;

    // Validate passwords
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
        message: 'Open Password and Confirm Password do not match. Please re-enter.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    if (this.ownerPassword && this.ownerPassword !== this.confirmOwnerPassword) {
      const alert = await this.alertCtrl.create({
        header: 'Password Mismatch',
        message: 'Permissions Password and Confirm Password do not match. Please re-enter.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    this.isProtecting = true;
    this.protectWorkflowState = 'PROCESSING';
    this.currentStage = 'processing';
    this.errorMessage = '';

    try {
      const config: PdfProtectionConfig = {
        userPassword: this.userPassword || undefined,
        ownerPassword: this.ownerPassword || this.userPassword,
        permissions: this.permissions,
        encryptionLevel: '128-bit-standard'
      };

      const result = await this.pdfSecurity.protectPdf(
        this.protectArrayBuffer,
        config,
        `${this.protectFile.name.replace(/\.pdf$/i, '')}_protected.pdf`
      );

      this.currentStage = 'optimizing';
      const uri = await this.storageService.saveFile(result.file, 'pdf');
      this.protectSavedUri = uri;

      await this.historyService.addHistoryItem({
        operation: 'pdf_protect',
        originalFileName: this.protectFile.name,
        outputFileName: result.file.name,
        originalSizeBytes: this.protectFile.size,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri
      });

      // Clear passwords from memory immediately
      this.userPassword = '';
      this.confirmUserPassword = '';
      this.ownerPassword = '';
      this.confirmOwnerPassword = '';
      this.protectResultFile = result.file;
      this.currentStage = 'complete';
      this.protectWorkflowState = 'SUCCESS';
    } catch (e: any) {
      this.protectWorkflowState = 'ERROR';
      this.errorMessage = e.message || 'Protection failed. Please try again.';
      const alert = await this.alertCtrl.create({
        header: 'Protection Failed',
        message: this.errorMessage,
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isProtecting = false;
      this.cdr.markForCheck();
    }
  }

  shareUnlockResult(): void {
    if (this.unlockSavedUri && this.unlockSavedUri !== 'web-download') {
      this.shareService.shareFile(this.unlockSavedUri, 'Unlocked Document');
    }
  }

  shareProtectResult(): void {
    if (this.protectSavedUri && this.protectSavedUri !== 'web-download') {
      this.shareService.shareFile(this.protectSavedUri, 'Protected Document');
    }
  }
}
