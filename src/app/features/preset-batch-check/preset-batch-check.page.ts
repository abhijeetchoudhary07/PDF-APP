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
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import JSZip from 'jszip';

import { PresetBatchValidatorService } from '../../core/services/preset-batch-validator.service';
import { PresetService } from '../../core/services/preset.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Preset,
  FileAuditScorecard,
  BatchAuditSummary,
  BatchAutoFixProgress
} from '../../core/models/preset.types';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppProgressComponent,
  AppSkeletonComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-preset-batch-check',
  templateUrl: './preset-batch-check.page.html',
  styleUrls: ['./preset-batch-check.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    AppProgressComponent,
    AppSkeletonComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PresetBatchCheckPage implements OnInit, OnDestroy {
  private validatorService = inject(PresetBatchValidatorService);
  private presetService = inject(PresetService);
  private storageService = inject(StorageService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  presets: Preset[] = [];
  selectedPreset: Preset | null = null;
  isLoadingPresets = true;

  // File & Audit State
  files: File[] = [];
  scorecards: FileAuditScorecard[] = [];
  summary: BatchAuditSummary | null = null;
  isAuditing = false;

  // Auto-Fix Pipeline State
  isAutoFixing = false;
  autoFixProgress: BatchAutoFixProgress | null = null;
  quotaWarning: string | null = null;

  // Expanded Rule Detail Accordion
  expandedCardIds = new Set<string>();

  // Object URLs for image thumbnails
  private thumbnailUrls = new Map<string, string>();

  async ngOnInit(): Promise<void> {
    await this.loadPresets();
  }

  ngOnDestroy(): void {
    // Revoke object URLs to release memory
    for (const url of this.thumbnailUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.clear();
  }

  async loadPresets(): Promise<void> {
    this.isLoadingPresets = true;
    this.cdr.markForCheck();

    try {
      const [customPresets, grouped] = await Promise.all([
        this.presetService.getCustomPresets().catch(() => []),
        this.presetService.getAllGroupedPresets().catch(() => [])
      ]);

      const flat: Preset[] = [...customPresets];
      for (const grp of grouped) {
        for (const p of grp.presets) {
          if (!flat.some(existing => existing.id === p.id)) {
            flat.push(p);
          }
        }
      }
      this.presets = flat;

      // Check query parameter for preset selection
      const targetId = this.route.snapshot.queryParamMap.get('presetId');
      if (targetId) {
        const matched = this.presets.find(p => p.id === targetId);
        if (matched) {
          this.selectedPreset = matched;
        }
      }

      // Default to first preset if none selected
      if (!this.selectedPreset && this.presets.length > 0) {
        this.selectedPreset = this.presets[0];
      }
    } catch {
      this.toastService.show('Failed to load presets.', 'error');
    } finally {
      this.isLoadingPresets = false;
      this.cdr.markForCheck();
    }
  }

  async onPresetChange(event: any): Promise<void> {
    const selectedId = event?.target?.value;
    const found = this.presets.find(p => p.id === selectedId);
    if (found) {
      this.selectedPreset = found;
      if (this.files.length > 0) {
        await this.runAudit();
      }
      this.cdr.markForCheck();
    }
  }

  async onFilesAdded(newFiles: File[]): Promise<void> {
    if (!newFiles || newFiles.length === 0) return;
    this.files = [...this.files, ...newFiles];
    await this.runAudit();
  }

  async onSingleFileAdded(file: File): Promise<void> {
    if (!file) return;
    this.files = [...this.files, file];
    await this.runAudit();
  }

  removeFile(index: number): void {
    if (index >= 0 && index < this.files.length) {
      const removedFile = this.files[index];
      const card = this.scorecards[index];
      if (card && this.thumbnailUrls.has(card.fileId)) {
        URL.revokeObjectURL(this.thumbnailUrls.get(card.fileId)!);
        this.thumbnailUrls.delete(card.fileId);
      }
      this.files.splice(index, 1);
      if (this.files.length === 0) {
        this.clearAll();
      } else {
        void this.runAudit();
      }
    }
  }

  clearAll(): void {
    for (const url of this.thumbnailUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.clear();
    this.files = [];
    this.scorecards = [];
    this.summary = null;
    this.quotaWarning = null;
    this.expandedCardIds.clear();
    this.cdr.markForCheck();
  }

  async runAudit(): Promise<void> {
    if (!this.selectedPreset || this.files.length === 0) return;

    this.isAuditing = true;
    this.quotaWarning = null;
    this.cdr.markForCheck();

    try {
      this.summary = await this.validatorService.auditBatch(this.files, this.selectedPreset);
      this.scorecards = this.summary.scorecards;

      // Generate thumbnails for image cards
      for (const card of this.scorecards) {
        if (!card.thumbnailUrl && !this.thumbnailUrls.has(card.fileId)) {
          if (card.fileType?.startsWith('image/') || card.fileName.match(/\.(jpe?g|png|webp)$/i)) {
            const url = URL.createObjectURL(card.originalFile);
            this.thumbnailUrls.set(card.fileId, url);
            card.thumbnailUrl = url;
          }
        } else if (this.thumbnailUrls.has(card.fileId)) {
          card.thumbnailUrl = this.thumbnailUrls.get(card.fileId);
        }
      }
    } catch {
      this.toastService.show('Audit failed. Please re-check the files.', 'error');
    } finally {
      this.isAuditing = false;
      this.cdr.markForCheck();
    }
  }

  toggleExpand(fileId: string): void {
    if (this.expandedCardIds.has(fileId)) {
      this.expandedCardIds.delete(fileId);
    } else {
      this.expandedCardIds.add(fileId);
    }
    this.cdr.markForCheck();
  }

  isExpanded(fileId: string): boolean {
    return this.expandedCardIds.has(fileId);
  }

  get fixableCount(): number {
    return this.scorecards.filter(s => !s.passed && s.isFixable).length;
  }

  get compliantCount(): number {
    return this.scorecards.filter(s => s.passed).length;
  }

  async autoFixAll(): Promise<void> {
    if (!this.selectedPreset || this.fixableCount === 0 || this.isAutoFixing) return;

    // Quota pre-check alert
    const quotaCheck = await this.validatorService.checkQuota(this.fixableCount);
    if (!quotaCheck.canProceed) {
      this.quotaWarning = quotaCheck.error || 'Daily operation quota limit reached.';
      this.toastService.show(this.quotaWarning, 'warning');
      this.cdr.markForCheck();
      return;
    }

    this.isAutoFixing = true;
    this.quotaWarning = null;
    this.cdr.markForCheck();

    try {
      const result = await this.validatorService.autoFixBatch(
        this.scorecards,
        this.selectedPreset,
        (progress) => {
          this.autoFixProgress = progress;
          this.cdr.markForCheck();
        }
      );

      // Re-calculate summary
      if (this.selectedPreset) {
        const compliantCount = this.scorecards.filter(s => s.passed).length;
        this.summary = {
          profileId: this.selectedPreset.id,
          profileName: this.selectedPreset.name,
          totalFiles: this.scorecards.length,
          compliantCount,
          nonCompliantCount: this.scorecards.length - compliantCount,
          fixableCount: this.scorecards.filter(s => !s.passed && s.isFixable).length,
          unfixableCount: this.scorecards.filter(s => !s.passed && !s.isFixable).length,
          scorecards: this.scorecards
        };
      }

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.toastService.show(
        `Auto-fix complete: ${result.successfulCount} files fixed!`,
        'success'
      );
    } catch (err: any) {
      this.toastService.show(err?.message || 'Auto-fix encountered an error.', 'error');
    } finally {
      this.isAutoFixing = false;
      this.cdr.markForCheck();
    }
  }

  async downloadCardFile(card: FileAuditScorecard): Promise<void> {
    const fileToSave = card.fixedFile || card.originalFile;
    if (!fileToSave) return;

    try {
      await this.storageService.saveFile(fileToSave, 'preset_fixed', undefined, { preserveName: true });
      this.toastService.show(`Saved ${fileToSave.name}`, 'success');
    } catch {
      this.toastService.show('Failed to save file.', 'error');
    }
  }

  async downloadAllZip(): Promise<void> {
    const compliantCards = this.scorecards.filter(s => s.passed);
    if (compliantCards.length === 0) {
      this.toastService.show('No compliant files to download.', 'warning');
      return;
    }

    try {
      const zip = new JSZip();
      for (const card of compliantCards) {
        const f = card.fixedFile || card.originalFile;
        zip.file(f.name, f);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `compliant_files_${Date.now()}.zip`, { type: 'application/zip' });
      await this.storageService.saveFile(zipFile, 'compliant_batch', undefined, { preserveName: true });
      this.toastService.show('Downloaded all compliant files in ZIP archive.', 'success');
    } catch {
      this.toastService.show('Failed to create ZIP archive.', 'error');
    }
  }
}
