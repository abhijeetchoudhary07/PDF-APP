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
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PdfPrivacyReportCardService } from '../../core/services/pdf-privacy-report-card.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { PrivacyGrade, PrivacyReportCard } from '../../core/models/pdf-privacy-card.types';

import {
  AppHeaderComponent,
  AppIconComponent,
  AppBadgeComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-privacy-card',
  templateUrl: './privacy-card.page.html',
  styleUrls: ['./privacy-card.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppIconComponent,
    AppBadgeComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PrivacyCardPage implements OnInit {
  private reportCardService = inject(PdfPrivacyReportCardService);
  private documentBridge = inject(DocumentBridgeService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentFile: File | null = null;
  fileName = '';
  fileSize = 0;
  isEvaluating = false;
  isExporting = false;
  reportCard: PrivacyReportCard | null = null;
  savedReportUrl: string | null = null;

  ngOnInit(): void {
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      this.handleFileSelected(bridged.file);
    } else if (typeof history !== 'undefined' && history.state?.file instanceof File) {
      this.handleFileSelected(history.state.file);
    }
  }

  async handleFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      await this.showToast('Please select a valid PDF file.', 'warning');
      return;
    }

    this.currentFile = file;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.savedReportUrl = null;
    this.isEvaluating = true;
    this.cdr.markForCheck();

    try {
      this.reportCard = await this.reportCardService.generateReportCard(file);
      await this.hapticNotification(
        this.reportCard.score < 60 ? NotificationType.Warning : NotificationType.Success
      );
    } catch {
      await this.hapticNotification(NotificationType.Error);
      await this.showToast('Failed to generate privacy report card.', 'danger');
      this.reportCard = null;
    } finally {
      this.isEvaluating = false;
      this.cdr.markForCheck();
    }
  }

  getGradeColor(grade: PrivacyGrade): string {
    switch (grade) {
      case 'A+':
      case 'A':
        return '#10b981'; // Green
      case 'B':
        return '#2563eb'; // Blue
      case 'C':
        return '#f59e0b'; // Amber
      case 'D':
      case 'F':
      default:
        return '#ef4444'; // Red
    }
  }

  async sanitizeDocumentNow(): Promise<void> {
    if (!this.currentFile) return;

    this.documentBridge.setDocument(this.currentFile, 'pdf', {
      source: 'privacy-card',
      reportScore: this.reportCard?.score ?? 0,
      reportGrade: this.reportCard?.grade ?? 'F'
    });

    await this.hapticTick();
    await this.router.navigate(['/features/pdf/privacy-sanitizer'], {
      state: { file: this.currentFile }
    });
  }

  async exportReportCardPdf(): Promise<void> {
    if (!this.reportCard) return;

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const pdfBytes = await this.reportCardService.exportReportCardPdf(this.reportCard);
      const outName = `${this.fileName.replace(/\.pdf$/i, '')}_privacy_report_card.pdf`;
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const file = new File([blob], outName, { type: 'application/pdf' });

      const uri = await this.storageService.saveFile(file, 'privacy_report_card');
      this.savedReportUrl = uri || null;

      await this.hapticNotification(NotificationType.Success);
      await this.showToast('Privacy report card saved successfully!', 'success');
    } catch {
      await this.hapticNotification(NotificationType.Error);
      await this.showToast('Failed to export privacy report card.', 'danger');
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  async shareReport(): Promise<void> {
    if (!this.savedReportUrl || !this.reportCard) return;
    try {
      const outName = `${this.fileName.replace(/\.pdf$/i, '')}_privacy_report_card.pdf`;
      await this.shareService.shareFile(this.savedReportUrl, outName);
    } catch {
      await this.showToast('Failed to share report.', 'danger');
    }
  }

  resetReport(): void {
    this.currentFile = null;
    this.fileName = '';
    this.fileSize = 0;
    this.reportCard = null;
    this.savedReportUrl = null;
    this.cdr.markForCheck();
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
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
}
