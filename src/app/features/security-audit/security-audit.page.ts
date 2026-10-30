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

import { PdfHiddenContentAuditService } from '../../core/services/pdf-hidden-content-audit.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  HiddenContentAuditReport,
  HiddenContentCategory,
  HiddenContentCategorySummary,
  HiddenContentFinding,
  RiskLevel
} from '../../core/models/pdf-hidden-content.types';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppIconComponent,
  AppBadgeComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-security-audit',
  templateUrl: './security-audit.page.html',
  styleUrls: ['./security-audit.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppIconComponent,
    AppBadgeComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class SecurityAuditPage implements OnInit {
  private auditService = inject(PdfHiddenContentAuditService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private fileService = inject(FileService);
  private documentBridge = inject(DocumentBridgeService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // File state
  currentFile: File | null = null;
  fileName: string = '';
  fileSize: number = 0;
  pageCount: number = 0;

  // Processing state
  isScanning = false;
  isExporting = false;

  // Audit results
  report: HiddenContentAuditReport | null = null;

  // Expandable category state
  expandedCategories: Record<HiddenContentCategory, boolean> = {
    ocg_layers: true,
    off_page_objects: true,
    invisible_text: true,
    off_page_annots: true,
    scripts_attachments: true
  };

  savedReportUrl: string | null = null;

  readonly categoryOrder: HiddenContentCategory[] = [
    'ocg_layers',
    'off_page_objects',
    'invisible_text',
    'off_page_annots',
    'scripts_attachments'
  ];

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
      await this.showToast('Please select a valid PDF document.', 'warning');
      return;
    }

    this.currentFile = file;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.savedReportUrl = null;
    this.isScanning = true;
    this.cdr.markForCheck();

    try {
      this.report = await this.auditService.auditDocument(file);
      this.pageCount = this.report.pageCount;

      // Automatically expand categories with findings, collapse empty ones
      for (const cat of this.categoryOrder) {
        this.expandedCategories[cat] = (this.report.categories[cat]?.count ?? 0) > 0;
      }

      await this.hapticNotification(
        this.report.riskLevel === 'high' ? NotificationType.Warning : NotificationType.Success
      );
    } catch {
      await this.hapticNotification(NotificationType.Error);
      await this.showToast('Failed to audit PDF document structures.', 'danger');
      this.report = null;
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  toggleCategory(cat: HiddenContentCategory): void {
    this.expandedCategories[cat] = !this.expandedCategories[cat];
    this.hapticTick();
    this.cdr.markForCheck();
  }

  isCategoryExpanded(cat: HiddenContentCategory): boolean {
    return !!this.expandedCategories[cat];
  }

  getCategorySummary(cat: HiddenContentCategory): HiddenContentCategorySummary | null {
    if (!this.report?.categories) return null;
    return this.report.categories[cat] || null;
  }

  getRiskMeterColor(level: RiskLevel): string {
    switch (level) {
      case 'high':
        return '#ef4444'; // Red
      case 'moderate':
        return '#f59e0b'; // Amber
      case 'low':
      default:
        return '#10b981'; // Green
    }
  }

  getRiskScoreOffset(): number {
    if (!this.report) return 251.2;
    // 2 * PI * 40 = ~251.3
    const circumference = 251.32;
    const score = Math.max(0, Math.min(100, this.report.riskScore));
    return circumference - (score / 100) * circumference;
  }

  async sanitizeDocumentNow(): Promise<void> {
    if (!this.currentFile) return;

    this.documentBridge.setDocument(this.currentFile, 'pdf', {
      source: 'audit',
      reportFindings: this.report?.totalFindings ?? 0
    });

    await this.hapticTick();
    await this.router.navigate(['/features/pdf/privacy-sanitizer'], {
      state: { file: this.currentFile }
    });
  }

  async remediateWithTool(route: string): Promise<void> {
    if (!this.currentFile) return;

    this.documentBridge.setDocument(this.currentFile, 'pdf', { source: 'audit' });
    await this.hapticTick();
    await this.router.navigate([route], {
      state: { file: this.currentFile }
    });
  }

  async exportAuditReportPdf(): Promise<void> {
    if (!this.report) return;

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const pdfBytes = await this.auditService.exportAuditReportPdf(this.report);
      const reportName = `${this.fileName.replace(/\.pdf$/i, '')}_forensic_audit_report.pdf`;
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const file = new File([blob], reportName, { type: 'application/pdf' });

      const uri = await this.storageService.saveFile(file, 'security_audit');
      this.savedReportUrl = uri || null;

      await this.hapticNotification(NotificationType.Success);
      await this.showToast('Forensic audit report saved successfully!', 'success');
    } catch {
      await this.hapticNotification(NotificationType.Error);
      await this.showToast('Failed to generate audit report PDF.', 'danger');
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  async shareReport(): Promise<void> {
    if (!this.savedReportUrl || !this.report) return;
    try {
      const reportName = `${this.fileName.replace(/\.pdf$/i, '')}_forensic_audit_report.pdf`;
      await this.shareService.shareFile(this.savedReportUrl, reportName);
    } catch {
      await this.showToast('Failed to share report.', 'danger');
    }
  }

  resetAudit(): void {
    this.currentFile = null;
    this.fileName = '';
    this.fileSize = 0;
    this.pageCount = 0;
    this.report = null;
    this.savedReportUrl = null;
    this.expandedCategories = {
      ocg_layers: true,
      off_page_objects: true,
      invisible_text: true,
      off_page_annots: true,
      scripts_attachments: true
    };
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
