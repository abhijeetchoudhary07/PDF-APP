import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PdfBatchSecurityService } from '../../core/services/pdf-batch-security.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import {
  DEFAULT_PERMISSIONS,
  EncryptionStandard,
  PdfSecurityPermissions,
  BatchSecurityMode,
  BatchSecurityQueueItem,
  BatchProtectOptions,
  BatchUnlockOptions,
  BatchSecurityProgress,
  BatchSecuritySummary
} from '../../core/models/pdf-security.types';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppIconComponent,
  FileDropzoneComponent,
  PasswordStrengthMeterComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-security-batch',
  templateUrl: './security-batch.page.html',
  styleUrls: ['./security-batch.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppIconComponent,
    FileDropzoneComponent,
    PasswordStrengthMeterComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class SecurityBatchPage implements OnInit, OnDestroy {
  private pdfBatchSecurity = inject(PdfBatchSecurityService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Batch Mode
  mode: BatchSecurityMode = 'protect';

  // Queue state
  queue: BatchSecurityQueueItem[] = [];
  isInspecting = false;
  isProcessing = false;
  isSummaryOpen = false;

  // Processing state
  progress: BatchSecurityProgress = {
    total: 0,
    completed: 0,
    currentIndex: 0,
    currentFileName: '',
    successCount: 0,
    failureCount: 0
  };
  summary: BatchSecuritySummary | null = null;
  private abortController: AbortController | null = null;

  // Protect options
  encryptionStandard: EncryptionStandard = 'aes-256';
  userPassword = '';
  confirmUserPassword = '';
  showUserPassword = false;
  ownerPassword = '';
  confirmOwnerPassword = '';
  showOwnerPassword = false;
  showAdvancedOwner = false;
  permissions: PdfSecurityPermissions = { ...DEFAULT_PERMISSIONS };

  // Unlock options
  masterPassword = '';
  showMasterPassword = false;

  // Quota Status
  quotaRemaining: number | null = null;

  async ngOnInit(): Promise<void> {
    await this.refreshQuota();
  }

  ngOnDestroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Wipe sensitive credentials from component memory
    this.userPassword = '';
    this.confirmUserPassword = '';
    this.ownerPassword = '';
    this.confirmOwnerPassword = '';
    this.masterPassword = '';
    for (const item of this.queue) {
      item.password = undefined;
    }
  }

  async refreshQuota(): Promise<void> {
    try {
      const quota = await this.storageService.getQuotaStatus();
      this.quotaRemaining = quota.isUnlimited ? 999999 : quota.remaining;
      this.cdr.markForCheck();
    } catch {
      this.quotaRemaining = null;
    }
  }

  setMode(newMode: BatchSecurityMode): void {
    if (this.isProcessing) return;
    this.mode = newMode;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  setStandard(std: EncryptionStandard): void {
    this.encryptionStandard = std;
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  togglePrinting(val: 'none' | 'low-resolution' | 'high-resolution'): void {
    this.permissions.allowPrinting = val;
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

  onPassphraseGenerated(passphrase: string): void {
    this.userPassword = passphrase;
    this.confirmUserPassword = passphrase;
    this.cdr.markForCheck();
  }

  async onFilesSelected(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;
    this.isInspecting = true;
    this.cdr.markForCheck();

    try {
      const newItems = await this.pdfBatchSecurity.inspectBatchFiles(files);
      // Filter duplicates by name + size
      const existingKeys = new Set(this.queue.map(item => `${item.name}-${item.sizeBytes}`));
      const unique = newItems.filter(item => !existingKeys.has(`${item.name}-${item.sizeBytes}`));

      this.queue = [...this.queue, ...unique];
      await this.triggerHaptic(ImpactStyle.Medium);
    } catch (e: any) {
      const alert = await this.alertCtrl.create({
        header: 'File Error',
        message: e?.message || 'Failed to inspect selected PDF files.',
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isInspecting = false;
      this.cdr.markForCheck();
    }
  }

  removeQueueItem(id: string): void {
    if (this.isProcessing) return;
    this.queue = this.queue.filter(item => item.id !== id);
    this.triggerHaptic(ImpactStyle.Light);
    this.cdr.markForCheck();
  }

  clearQueue(): void {
    if (this.isProcessing) return;
    this.queue = [];
    this.summary = null;
    this.isSummaryOpen = false;
    this.triggerHaptic(ImpactStyle.Medium);
    this.cdr.markForCheck();
  }

  setFilePassword(id: string, pwd: string): void {
    const item = this.queue.find(i => i.id === id);
    if (item) {
      item.password = pwd;
    }
  }

  get canStartBatch(): boolean {
    if (this.queue.length === 0 || this.isProcessing) return false;

    if (this.mode === 'protect') {
      if (!this.userPassword) return false;
      if (this.confirmUserPassword !== this.userPassword) return false;
      if (this.ownerPassword && this.confirmOwnerPassword !== this.ownerPassword) return false;
      return true;
    }

    if (this.mode === 'unlock') {
      // Must have either a master password or all items have a password
      const hasMaster = this.masterPassword.trim().length > 0;
      const somePerFile = this.queue.some(i => (i.password || '').trim().length > 0);
      return hasMaster || somePerFile;
    }

    return false;
  }

  async startBatch(): Promise<void> {
    if (!this.canStartBatch) return;

    this.isProcessing = true;
    this.isSummaryOpen = false;
    this.summary = null;
    this.abortController = new AbortController();

    // Check quota warning
    try {
      const quota = await this.storageService.getQuotaStatus();
      if (!quota.canStart) {
        this.isProcessing = false;
        const alert = await this.alertCtrl.create({
          header: 'Quota Exceeded',
          message: 'Daily free processing quota has been reached. Please try again tomorrow.',
          buttons: ['OK']
        });
        await alert.present();
        return;
      }
    } catch {
      // Continue if quota check unavailable
    }

    this.progress = {
      total: this.queue.length,
      completed: 0,
      currentIndex: 1,
      currentFileName: this.queue[0]?.name || '',
      successCount: 0,
      failureCount: 0
    };
    this.cdr.markForCheck();

    try {
      if (this.mode === 'protect') {
        const protectOptions: BatchProtectOptions = {
          standard: this.encryptionStandard,
          userPassword: this.userPassword,
          ownerPassword: this.ownerPassword || this.userPassword,
          permissions: this.permissions
        };

        this.summary = await this.pdfBatchSecurity.processBatchProtect(
          this.queue,
          protectOptions,
          p => {
            this.progress = { ...p };
            this.cdr.markForCheck();
          },
          this.abortController.signal
        );
      } else {
        const perFilePasswords: Record<string, string> = {};
        for (const item of this.queue) {
          if (item.password) {
            perFilePasswords[item.id] = item.password;
          }
        }

        const unlockOptions: BatchUnlockOptions = {
          masterPassword: this.masterPassword.trim(),
          perFilePasswords
        };

        this.summary = await this.pdfBatchSecurity.processBatchUnlock(
          this.queue,
          unlockOptions,
          p => {
            this.progress = { ...p };
            this.cdr.markForCheck();
          },
          this.abortController.signal
        );
      }

      await this.triggerNotification(
        this.summary.failureCount === 0 ? NotificationType.Success : NotificationType.Warning
      );
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'Batch Error',
        message: err?.message || 'An error occurred during batch processing.',
        buttons: ['OK']
      });
      await alert.present();
      await this.triggerNotification(NotificationType.Error);
    } finally {
      this.isProcessing = false;
      this.isSummaryOpen = true;
      await this.refreshQuota();
      this.cdr.markForCheck();
    }
  }

  cancelBatch(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.triggerHaptic(ImpactStyle.Heavy);
    }
  }

  async downloadZip(): Promise<void> {
    if (!this.summary || this.summary.successCount === 0) return;

    try {
      const zipName = `secured_pdfs_${Date.now()}.zip`;
      const zipPackage = await this.pdfBatchSecurity.createZipPackage(this.queue, zipName);

      // Trigger download
      const file = new File([zipPackage.blob], zipName, { type: 'application/zip' });
      await this.shareService.shareFile(file, 'Secured PDFs Archive');

      const toast = await this.toastCtrl.create({
        message: 'ZIP archive downloaded successfully!',
        duration: 3000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'ZIP Creation Failed',
        message: err?.message || 'Could not package files into ZIP.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  async saveAllIndividually(): Promise<void> {
    if (!this.summary || this.summary.successCount === 0) return;

    try {
      const prefix = this.mode === 'protect' ? 'batch_protect' : 'batch_unlock';
      const result = await this.pdfBatchSecurity.saveAllIndividually(this.queue, prefix);

      const toast = await this.toastCtrl.create({
        message: `${result.savedCount} files saved successfully to device storage.`,
        duration: 3000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
      await this.triggerNotification(NotificationType.Success);
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'Save Failed',
        message: err?.message || 'Could not save files individually.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  resetBatch(): void {
    this.queue = [];
    this.summary = null;
    this.isSummaryOpen = false;
    this.userPassword = '';
    this.confirmUserPassword = '';
    this.ownerPassword = '';
    this.confirmOwnerPassword = '';
    this.masterPassword = '';
    this.triggerHaptic(ImpactStyle.Medium);
    this.cdr.markForCheck();
  }

  getProgressPercentage(): number {
    if (this.progress.total === 0) return 0;
    return Math.round((this.progress.completed / this.progress.total) * 100);
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
