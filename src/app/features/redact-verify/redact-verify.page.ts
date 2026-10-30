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

import { PdfRedactionVerificationService } from '../../core/services/pdf-redaction-verification.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import {
  BoundingRect,
  RasterizeRegionOptions,
  RedactionAuditItem,
  RedactionAuditReport,
  RedactionTarget
} from '../../core/models/pdf-redaction-verify.types';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppIconComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-redact-verify',
  templateUrl: './redact-verify.page.html',
  styleUrls: ['./redact-verify.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppIconComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class RedactVerifyPage implements OnInit {
  private redactionService = inject(PdfRedactionVerificationService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private fileService = inject(FileService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Loaded File State
  currentFile: File | null = null;
  currentPdfBytes: Uint8Array | null = null;
  originalPdfBytes: Uint8Array | null = null;
  fileName: string = '';
  fileSize: number = 0;
  totalPages: number = 0;

  // Audit State
  isAuditing = false;
  isRemediating = false;
  remediatingTargetId: string | null = null;
  auditReport: RedactionAuditReport | null = null;
  targets: RedactionTarget[] = [];
  newSnippetText: string = '';

  // Comparison & Zoom State
  comparisonView: 'redacted' | 'original' | 'split' = 'redacted';
  zoomLevel: number = 1.0;
  isZoomModalOpen = false;

  // Saving State
  isSaving = false;
  savedFileUrl: string | null = null;

  ngOnInit() {
    if (typeof history !== 'undefined' && history.state?.file instanceof File) {
      this.handleFileSelected(history.state.file);
    }
  }

  async handleFileSelected(file: File) {
    this.currentFile = file;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.savedFileUrl = null;

    try {
      const buffer = await file.arrayBuffer();
      this.originalPdfBytes = new Uint8Array(buffer.slice(0));
      this.currentPdfBytes = new Uint8Array(buffer.slice(0));
      await this.runAudit();
    } catch {
      this.showToast('Failed to load selected PDF document', 'danger');
    }
    this.cdr.markForCheck();
  }

  async addTargetSnippet() {
    const text = this.newSnippetText.trim();
    if (!text) return;

    await this.hapticTick();
    const newTarget: RedactionTarget = {
      id: `target-${Date.now()}`,
      pageIndex: 0,
      targetText: text
    };

    this.targets.push(newTarget);
    this.newSnippetText = '';
    await this.runAudit();
    this.cdr.markForCheck();
  }

  async removeTarget(id: string) {
    this.targets = this.targets.filter(t => t.id !== id);
    await this.runAudit();
    this.cdr.markForCheck();
  }

  async runAudit() {
    if (!this.currentPdfBytes) return;
    this.isAuditing = true;
    this.cdr.markForCheck();

    try {
      this.auditReport = await this.redactionService.verifyRedactions(
        this.currentPdfBytes,
        this.targets.length > 0 ? this.targets : undefined
      );

      this.totalPages = this.auditReport.totalPages;

      // Synchronize targets if auto-detected
      if (this.targets.length === 0 && this.auditReport.items.length > 0) {
        this.targets = this.auditReport.items.map(item => ({
          id: item.id,
          pageIndex: item.pageIndex,
          pageNumber: item.pageNumber,
          targetText: item.targetText,
          boundingRect: item.boundingRect
        }));
      }
    } catch {
      this.showToast('Forensic audit failed to inspect PDF', 'danger');
    } finally {
      this.isAuditing = false;
      this.cdr.markForCheck();
    }
  }

  async remediateWithRasterization(item: RedactionAuditItem) {
    if (!this.currentPdfBytes) return;

    this.isRemediating = true;
    this.remediatingTargetId = item.id;
    this.cdr.markForCheck();

    await this.hapticTick();

    try {
      const target: RedactionTarget = {
        id: item.id,
        pageIndex: item.pageIndex,
        pageNumber: item.pageNumber,
        targetText: item.targetText,
        boundingRect: item.boundingRect
      };

      const result = await this.redactionService.rasterizeRedactedRegion(
        this.currentPdfBytes,
        target,
        { dpi: 300, fillColor: '#000000' }
      );

      this.currentPdfBytes = result.pdfBytes;
      await this.runAudit();

      await this.hapticNotification(NotificationType.Success);
      this.showToast('Region rasterized! Selectable vector text purged.', 'success');
    } catch {
      await this.hapticNotification(NotificationType.Error);
      this.showToast('Failed to rasterize region fallback', 'danger');
    } finally {
      this.isRemediating = false;
      this.remediatingTargetId = null;
      this.cdr.markForCheck();
    }
  }

  async approveAndSavePdf() {
    if (!this.currentPdfBytes || !this.auditReport) return;

    if (!this.auditReport.is100PercentPurged) {
      const alert = await this.alertCtrl.create({
        header: 'Residual Risk Detected',
        message: 'This document contains unpurged or unverified redactions. Do you want to proceed saving without 100% verification guarantee?',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Save Anyway', role: 'destructive', handler: () => this.executeSave() }
        ]
      });
      await alert.present();
      return;
    }

    await this.executeSave();
  }

  private async executeSave() {
    if (!this.currentPdfBytes) return;
    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      const verifiedBlob = new Blob([this.currentPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const verifiedFileName = this.fileName.replace(/\.pdf$/i, '_verified_redacted.pdf');
      const verifiedFile = new File([verifiedBlob], verifiedFileName, { type: 'application/pdf' });

      const uri = await this.storageService.saveFile(verifiedFile, 'verified_redacted_pdf');
      this.savedFileUrl = uri || null;

      await this.hapticNotification(NotificationType.Success);
      this.showToast('Verified PDF saved successfully!', 'success');
    } catch {
      await this.hapticNotification(NotificationType.Error);
      this.showToast('Failed to save verified PDF', 'danger');
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  async shareSavedFile() {
    if (!this.savedFileUrl) return;
    try {
      await this.shareService.shareFile(this.savedFileUrl, this.fileName);
    } catch {
      this.showToast('Failed to share file', 'danger');
    }
  }

  resetWorkflow() {
    this.currentFile = null;
    this.currentPdfBytes = null;
    this.originalPdfBytes = null;
    this.fileName = '';
    this.auditReport = null;
    this.targets = [];
    this.savedFileUrl = null;
    this.newSnippetText = '';
    this.cdr.markForCheck();
  }

  toggleComparisonView(view: 'redacted' | 'original' | 'split') {
    this.comparisonView = view;
    this.cdr.markForCheck();
  }

  toggleTapZoom() {
    this.zoomLevel = this.zoomLevel > 1.05 ? 1.0 : 1.5;
    this.hapticTick();
    this.cdr.markForCheck();
  }

  setZoom(delta: number) {
    this.zoomLevel = Math.min(3.0, Math.max(0.75, this.zoomLevel + delta));
    this.cdr.markForCheck();
  }

  private async hapticTick() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  private async hapticNotification(type: NotificationType) {
    try {
      await Haptics.notification({ type });
    } catch {}
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: 2500,
        position: 'bottom',
        color
      });
      await toast.present();
    } catch {}
  }
}
