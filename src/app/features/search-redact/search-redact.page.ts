import '../../core/utilities/pdf-iterator-polyfill';
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

import { PdfSearchRedactService } from '../../core/services/pdf-search-redact.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import {
  PatternMatchItem,
  PatternPresetType,
  SearchRedactResult
} from '../../core/models/pdf-search-redact.types';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppIconComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-search-redact',
  templateUrl: './search-redact.page.html',
  styleUrls: ['./search-redact.page.scss'],
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
export class SearchRedactPage implements OnInit {
  private searchRedactService = inject(PdfSearchRedactService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private fileService = inject(FileService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // File state
  currentFile: File | null = null;
  currentPdfBytes: Uint8Array | null = null;
  fileName: string = '';
  fileSize: number = 0;
  totalPages: number = 0;

  // Pattern Preset Toggles
  readonly availablePresets: { id: PatternPresetType; labelKey: string; icon: string }[] = [
    { id: 'email', labelKey: 'searchRedact.emailPreset', icon: 'mail' },
    { id: 'phone', labelKey: 'searchRedact.phonePreset', icon: 'call' },
    { id: 'creditCard', labelKey: 'searchRedact.creditCardPreset', icon: 'card' },
    { id: 'aadhaar', labelKey: 'searchRedact.aadhaarPreset', icon: 'finger-print' },
    { id: 'pan', labelKey: 'searchRedact.panPreset', icon: 'document-text' },
    { id: 'date', labelKey: 'searchRedact.datePreset', icon: 'calendar' },
    { id: 'custom', labelKey: 'searchRedact.customPreset', icon: 'code-working' }
  ];

  activePresets = new Set<PatternPresetType>(['email', 'phone', 'creditCard', 'aadhaar', 'pan']);
  customRegex: string = '';
  customRegexError: string | null = null;

  // Scan & Match State
  isScanning: boolean = false;
  isRedacting: boolean = false;
  scanCompleted: boolean = false;
  matches: PatternMatchItem[] = [];
  redactionResult: SearchRedactResult | null = null;
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
    this.redactionResult = null;
    this.savedFileUrl = null;
    this.matches = [];
    this.scanCompleted = false;

    try {
      const buffer = await file.arrayBuffer();
      this.currentPdfBytes = new Uint8Array(buffer.slice(0));
      await this.runPatternScan();
    } catch {
      this.showToast('Failed to load selected PDF document', 'danger');
    }
    this.cdr.markForCheck();
  }

  async togglePreset(preset: PatternPresetType) {
    await this.hapticTick();
    if (this.activePresets.has(preset)) {
      this.activePresets.delete(preset);
    } else {
      this.activePresets.add(preset);
    }
    if (this.currentPdfBytes) {
      await this.runPatternScan();
    }
    this.cdr.markForCheck();
  }

  isPresetActive(preset: PatternPresetType): boolean {
    return this.activePresets.has(preset);
  }

  async applyCustomRegex() {
    const pattern = this.customRegex.trim();
    if (!pattern) {
      this.customRegexError = null;
      return;
    }

    try {
      this.searchRedactService.compileSafeRegex(pattern);
      this.customRegexError = null;
      this.activePresets.add('custom');
      await this.runPatternScan();
    } catch (err: any) {
      this.customRegexError = err?.message || 'Invalid regular expression.';
      await this.hapticNotification(NotificationType.Warning);
    }
    this.cdr.markForCheck();
  }

  async runPatternScan() {
    if (!this.currentPdfBytes) return;

    this.isScanning = true;
    this.scanCompleted = false;
    this.cdr.markForCheck();

    try {
      const presetsArray = Array.from(this.activePresets);
      this.matches = await this.searchRedactService.scanForPatterns(this.currentPdfBytes, {
        activePresets: presetsArray,
        customRegex: this.activePresets.has('custom') ? this.customRegex.trim() : undefined,
        paddingPx: 2,
        timeoutMs: 1500
      });

      this.scanCompleted = true;
      await this.hapticNotification(NotificationType.Success);
    } catch (err: any) {
      await this.hapticNotification(NotificationType.Error);
      this.showToast(err?.message || 'Failed to scan document for patterns', 'danger');
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  toggleSelectAll() {
    const allSelected = this.isAllSelected();
    const newTargetState = !allSelected;
    for (const match of this.matches) {
      match.selected = newTargetState;
    }
    this.hapticTick();
    this.cdr.markForCheck();
  }

  isAllSelected(): boolean {
    return this.matches.length > 0 && this.matches.every(m => m.selected);
  }

  getSelectedCount(): number {
    return this.matches.filter(m => m.selected).length;
  }

  toggleMatch(item: PatternMatchItem) {
    item.selected = !item.selected;
    this.hapticTick();
    this.cdr.markForCheck();
  }

  async executeRedactions() {
    if (!this.currentPdfBytes || this.getSelectedCount() === 0) return;

    this.isRedacting = true;
    this.cdr.markForCheck();
    await this.hapticTick();

    try {
      this.redactionResult = await this.searchRedactService.applyPatternRedactions(
        this.currentPdfBytes,
        this.matches,
        {
          paddingPx: 2,
          verifyWithN4: true
        }
      );

      this.currentPdfBytes = this.redactionResult.pdfBytes;

      // Automatically persist to storage
      const blob = new Blob([this.currentPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const outName = this.fileName.replace(/\.pdf$/i, '_pattern_redacted.pdf');
      const outFile = new File([blob], outName, { type: 'application/pdf' });

      const uri = await this.storageService.saveFile(outFile, 'pattern_redacted_pdf');
      this.savedFileUrl = uri || null;

      await this.hapticNotification(NotificationType.Success);
      this.showToast('Selected patterns permanently redacted and verified!', 'success');
    } catch (err: any) {
      await this.hapticNotification(NotificationType.Error);
      this.showToast('Failed to apply redactions to document', 'danger');
    } finally {
      this.isRedacting = false;
      this.cdr.markForCheck();
    }
  }

  openInVerificationAudit() {
    if (!this.currentPdfBytes) return;
    const blob = new Blob([this.currentPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const outName = this.fileName.replace(/\.pdf$/i, '_pattern_redacted.pdf');
    const outFile = new File([blob], outName, { type: 'application/pdf' });

    this.router.navigate(['/features/pdf/security/redact-verify'], {
      state: { file: outFile }
    });
  }

  async shareFile() {
    if (!this.savedFileUrl) return;
    try {
      await this.shareService.shareFile(this.savedFileUrl, this.fileName);
    } catch {
      this.showToast('Failed to share redacted file', 'danger');
    }
  }

  resetWorkflow() {
    this.currentFile = null;
    this.currentPdfBytes = null;
    this.fileName = '';
    this.fileSize = 0;
    this.matches = [];
    this.scanCompleted = false;
    this.redactionResult = null;
    this.savedFileUrl = null;
    this.customRegex = '';
    this.customRegexError = null;
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
