import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { PresetService, Preset } from '../../core/services/preset.service';
import { DocumentValidatorService } from '../../core/services/document-validator.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import {
  DocumentSlotType,
  ValidationRule,
  DocumentValidationResult,
  ValidationReport
} from '../../core/models/document-validator.models';
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

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-document-validator',
  templateUrl: './document-validator.page.html',
  styleUrls: ['./document-validator.page.scss'],
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
export class DocumentValidatorPage implements OnInit {
  private presetService = inject(PresetService);
  private validatorService = inject(DocumentValidatorService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private translationService = inject(TranslationService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  groupedPresets: { category: string; presets: Preset[] }[] = [];
  selectedPreset?: Preset;
  presetSearchQuery = '';

  // Slot Files
  photoFile?: File;
  photoPreviewUrl?: string;

  signatureFile?: File;
  signaturePreviewUrl?: string;

  pdfFile?: File;
  pdfPreviewUrl?: string;

  // Validation State
  isValidating = false;
  isFixing = false;
  fixingRuleId?: string;
  fixingSlot?: DocumentSlotType;

  validationResults = new Map<DocumentSlotType, DocumentValidationResult>();
  allPassed = false;
  hasValidated = false;
  totalErrors = 0;
  totalWarnings = 0;

  async ngOnInit(): Promise<void> {
    await this.loadPresets();

    // Check query params for pre-selected preset
    this.route.queryParams.subscribe(params => {
      if (params['preset']) {
        const found = this.findPresetById(params['preset']);
        if (found) {
          this.selectPreset(found);
        }
      }
    });
  }

  async loadPresets(): Promise<void> {
    try {
      this.groupedPresets = await this.presetService.getAllGroupedPresets();
      if (!this.selectedPreset && this.groupedPresets.length > 0 && this.groupedPresets[0].presets.length > 0) {
        // Default to first preset (e.g. SSC)
        this.selectPreset(this.groupedPresets[0].presets[0]);
      }
    } catch {
      this.toastService.show('error', 'Failed to load portal presets.');
    }
  }

  private findPresetById(id: string): Preset | undefined {
    for (const group of this.groupedPresets) {
      const match = group.presets.find(p => p.id === id);
      if (match) return match;
    }
    return undefined;
  }

  get filteredPresetGroups(): { category: string; presets: Preset[] }[] {
    if (!this.presetSearchQuery.trim()) {
      return this.groupedPresets;
    }
    const q = this.presetSearchQuery.toLowerCase().trim();
    return this.groupedPresets
      .map(g => ({
        category: g.category,
        presets: g.presets.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      }))
      .filter(g => g.presets.length > 0);
  }

  selectPreset(preset: Preset): void {
    this.selectedPreset = preset;
    this.validationResults.clear();
    this.hasValidated = false;
    this.allPassed = false;
    this.totalErrors = 0;
    this.totalWarnings = 0;

    // If files are already loaded, validate immediately against the new preset
    if (this.photoFile || this.signatureFile || this.pdfFile) {
      this.validateAll();
    }
    this.cdr.detectChanges();
  }

  // --- FILE HANDLING FOR SLOTS ---

  onSlotFileSelected(slot: DocumentSlotType, file: File): void {
    if (slot === 'photo') {
      if (this.photoPreviewUrl) this.fileService.revokeObjectUrl(this.photoPreviewUrl);
      this.photoFile = file;
      this.photoPreviewUrl = this.fileService.createObjectUrl(file);
    } else if (slot === 'signature') {
      if (this.signaturePreviewUrl) this.fileService.revokeObjectUrl(this.signaturePreviewUrl);
      this.signatureFile = file;
      this.signaturePreviewUrl = this.fileService.createObjectUrl(file);
    } else if (slot === 'pdf') {
      if (this.pdfPreviewUrl) this.fileService.revokeObjectUrl(this.pdfPreviewUrl);
      this.pdfFile = file;
      this.pdfPreviewUrl = this.fileService.createObjectUrl(file);
    }

    // Auto-run validation immediately on file selection (reactive UI without page refresh)
    this.validateSlot(slot);
  }

  removeSlotFile(slot: DocumentSlotType): void {
    if (slot === 'photo') {
      if (this.photoPreviewUrl) this.fileService.revokeObjectUrl(this.photoPreviewUrl);
      this.photoFile = undefined;
      this.photoPreviewUrl = undefined;
    } else if (slot === 'signature') {
      if (this.signaturePreviewUrl) this.fileService.revokeObjectUrl(this.signaturePreviewUrl);
      this.signatureFile = undefined;
      this.signaturePreviewUrl = undefined;
    } else if (slot === 'pdf') {
      if (this.pdfPreviewUrl) this.fileService.revokeObjectUrl(this.pdfPreviewUrl);
      this.pdfFile = undefined;
      this.pdfPreviewUrl = undefined;
    }

    this.validationResults.delete(slot);
    this.recalcOverallStatus();
    this.cdr.detectChanges();
  }

  // --- VALIDATION ENGINE ---

  async validateSlot(slot: DocumentSlotType): Promise<void> {
    if (!this.selectedPreset) return;

    let file: File | undefined;
    let req = this.selectedPreset[slot];

    if (slot === 'photo') file = this.photoFile;
    else if (slot === 'signature') file = this.signatureFile;
    else if (slot === 'pdf') file = this.pdfFile;

    if (!file || !req) return;

    this.isValidating = true;
    this.cdr.detectChanges();

    try {
      const result = await this.validatorService.validateDocument(file, slot, req);
      this.validationResults.set(slot, result);
      this.hasValidated = true;
      this.recalcOverallStatus();
    } catch (err: any) {
      this.toastService.show('error', `Validation error: ${err?.message || err}`);
    } finally {
      this.isValidating = false;
      this.cdr.detectChanges();
    }
  }

  async validateAll(): Promise<void> {
    if (!this.selectedPreset) return;

    this.isValidating = true;
    this.cdr.detectChanges();

    if (this.selectedPreset.photo && this.photoFile) {
      await this.validateSlot('photo');
    }
    if (this.selectedPreset.signature && this.signatureFile) {
      await this.validateSlot('signature');
    }
    if (this.selectedPreset.pdf && this.pdfFile) {
      await this.validateSlot('pdf');
    }

    this.isValidating = false;
    this.recalcOverallStatus();
    this.recordValidationHistory();
    this.cdr.detectChanges();
  }

  private recalcOverallStatus(): void {
    let errs = 0;
    let warns = 0;

    for (const res of this.validationResults.values()) {
      errs += res.errorsCount;
      warns += res.warningsCount;
    }

    this.totalErrors = errs;
    this.totalWarnings = warns;
    this.allPassed = this.validationResults.size > 0 && errs === 0;
  }

  // --- AUTO-FIX ENGINE ---

  async autoFixRule(slot: DocumentSlotType, rule: ValidationRule): Promise<void> {
    if (!this.selectedPreset) return;

    let file = slot === 'photo' ? this.photoFile : slot === 'signature' ? this.signatureFile : this.pdfFile;
    if (!file) return;

    this.isFixing = true;
    this.fixingRuleId = rule.id;
    this.fixingSlot = slot;
    this.cdr.detectChanges();

    try {
      const fixedFile = await this.validatorService.autoFixRule(file, rule, slot, this.selectedPreset);

      // Replace file in state and re-validate immediately
      this.updateSlotFile(slot, fixedFile);
      await this.validateSlot(slot);

      this.toastService.show('success', `Auto-fixed: ${rule.name}`);
      this.recordValidationHistory(true);
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to auto-fix rule.');
    } finally {
      this.isFixing = false;
      this.fixingRuleId = undefined;
      this.fixingSlot = undefined;
      this.cdr.detectChanges();
    }
  }

  async autoFixAllSlotIssues(slot: DocumentSlotType): Promise<void> {
    if (!this.selectedPreset) return;

    const result = this.validationResults.get(slot);
    let file = slot === 'photo' ? this.photoFile : slot === 'signature' ? this.signatureFile : this.pdfFile;
    if (!result || !file) return;

    this.isFixing = true;
    this.fixingSlot = slot;
    this.cdr.detectChanges();

    try {
      const fixedFile = await this.validatorService.autoFixAllIssues(file, result, this.selectedPreset);
      this.updateSlotFile(slot, fixedFile);
      await this.validateSlot(slot);

      this.toastService.show('success', `All issues fixed for ${slot}!`);
      this.recordValidationHistory(true);
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Auto-fix encountered an error.');
    } finally {
      this.isFixing = false;
      this.fixingSlot = undefined;
      this.cdr.detectChanges();
    }
  }

  private updateSlotFile(slot: DocumentSlotType, newFile: File): void {
    if (slot === 'photo') {
      if (this.photoPreviewUrl) this.fileService.revokeObjectUrl(this.photoPreviewUrl);
      this.photoFile = newFile;
      this.photoPreviewUrl = this.fileService.createObjectUrl(newFile);
    } else if (slot === 'signature') {
      if (this.signaturePreviewUrl) this.fileService.revokeObjectUrl(this.signaturePreviewUrl);
      this.signatureFile = newFile;
      this.signaturePreviewUrl = this.fileService.createObjectUrl(newFile);
    } else if (slot === 'pdf') {
      if (this.pdfPreviewUrl) this.fileService.revokeObjectUrl(this.pdfPreviewUrl);
      this.pdfFile = newFile;
      this.pdfPreviewUrl = this.fileService.createObjectUrl(newFile);
    }
  }

  // --- DOWNLOAD & SHARE ---

  async downloadSlotFile(slot: DocumentSlotType): Promise<void> {
    const file = slot === 'photo' ? this.photoFile : slot === 'signature' ? this.signatureFile : this.pdfFile;
    if (!file) return;
    await this.storageService.saveFile(file);
    this.toastService.show('success', `${slot} saved to device!`);
  }

  async shareSlotFile(slot: DocumentSlotType): Promise<void> {
    const file = slot === 'photo' ? this.photoFile : slot === 'signature' ? this.signatureFile : this.pdfFile;
    if (!file) return;
    await this.shareService.shareFile(file);
  }

  private async recordValidationHistory(isFixed = false): Promise<void> {
    if (!this.selectedPreset) return;
    try {
      const statusStr = this.allPassed ? 'READY' : isFixed ? 'AUTO-FIXED' : 'VALIDATED';
      const fileCount = (this.photoFile ? 1 : 0) + (this.signatureFile ? 1 : 0) + (this.pdfFile ? 1 : 0);

      await this.historyService.addHistoryItem({
        operation: 'validation',
        originalFileName: `${this.selectedPreset.name} (${fileCount} files)`,
        outputFileName: `${this.selectedPreset.name} [${statusStr}]`,
        originalSizeBytes: 0,
        outputSizeBytes: 0,
        outputDimensions: `${this.totalErrors} errors, ${this.totalWarnings} warnings`
      });
    } catch {
      // ignore
    }
  }
}
