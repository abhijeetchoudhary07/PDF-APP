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
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PresetBuilderService } from '../../core/services/preset-builder.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Preset,
  PresetExtractionResult,
  PresetTargetType,
  PresetDimensionUnit
} from '../../core/models/preset.types';

import {
  AppHeaderComponent,
  AppIconComponent,
  AppBadgeComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

export interface EditableSpecForm {
  profileName: string;
  targetType: PresetTargetType;
  minKb: number | null;
  maxKb: number | null;
  width: number | null;
  height: number | null;
  unit: PresetDimensionUnit;
  aspectRatio: string;
  format: string;
  dpi: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-preset-builder',
  templateUrl: './preset-builder.page.html',
  styleUrls: ['./preset-builder.page.scss'],
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
export class PresetBuilderPage implements OnInit {
  private presetBuilderService = inject(PresetBuilderService);
  private documentBridge = inject(DocumentBridgeService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentFile: File | null = null;
  fileName = '';
  isProcessing = false;
  isSaving = false;
  errorMessage: string | null = null;
  saveSuccessNotice = false;
  savedPresetId: string | null = null;

  // Direct text paste option
  showTextPaste = false;
  manualTextInput = '';

  // Extracted Result
  extractionResult: PresetExtractionResult | null = null;

  // Split card bottom form model
  form: EditableSpecForm = {
    profileName: '',
    targetType: 'photo',
    minKb: null,
    maxKb: null,
    width: null,
    height: null,
    unit: 'px',
    aspectRatio: '',
    format: 'JPEG',
    dpi: null
  };

  ngOnInit(): void {
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      this.handleFileSelected(bridged.file);
    } else if (typeof history !== 'undefined' && history.state?.file instanceof File) {
      this.handleFileSelected(history.state.file);
    }
  }

  async handleFileSelected(file: File): Promise<void> {
    if (!file) return;

    this.currentFile = file;
    this.fileName = file.name;
    this.errorMessage = null;
    this.saveSuccessNotice = false;
    this.isProcessing = true;
    this.cdr.markForCheck();

    try {
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      const result = await this.presetBuilderService.parseInstructionSheet(file);
      this.applyExtractionResult(result);
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to analyze instructions';
      this.toastService.show('error', this.errorMessage || 'Analysis failed');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  handleExtractFromText(): void {
    if (!this.manualTextInput.trim()) {
      this.errorMessage = 'Please paste guideline text first';
      return;
    }

    this.fileName = 'Pasted Guidelines';
    this.errorMessage = null;
    this.saveSuccessNotice = false;
    this.isProcessing = true;
    this.cdr.markForCheck();

    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      const result = this.presetBuilderService.parseInstructionText(this.manualTextInput);
      this.applyExtractionResult(result);
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to parse instruction text';
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  private applyExtractionResult(result: PresetExtractionResult): void {
    if (!result.success || !result.spec) {
      this.extractionResult = null;
      this.errorMessage = result.error || 'Could not detect upload specifications from this sheet.';
      this.toastService.show('warning', this.errorMessage);
      return;
    }

    this.extractionResult = result;

    const spec = result.spec;
    this.form = {
      profileName: spec.proposedName,
      targetType: spec.targetType,
      minKb: spec.minKb ?? null,
      maxKb: spec.maxKb ?? null,
      width: spec.width ?? null,
      height: spec.height ?? null,
      unit: spec.unit || 'px',
      aspectRatio: spec.aspectRatio || '',
      format: spec.format || (spec.targetType === 'pdf' ? 'PDF' : 'JPEG'),
      dpi: spec.dpi ?? null
    };

    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    this.toastService.show('success', 'Upload specifications extracted successfully!');
  }

  get convertedWidthPx(): number | null {
    if (!this.form.width || this.form.width <= 0) return null;
    return this.presetBuilderService.convertToPixels(this.form.width, this.form.unit, this.form.dpi || 300);
  }

  get convertedHeightPx(): number | null {
    if (!this.form.height || this.form.height <= 0) return null;
    return this.presetBuilderService.convertToPixels(this.form.height, this.form.unit, this.form.dpi || 300);
  }

  async saveSpecificationProfile(): Promise<void> {
    if (!this.form.profileName?.trim()) {
      this.toastService.show('warning', 'Please provide a profile name');
      return;
    }

    // Cybersecurity: Trademark & Government institution neutral naming enforcement
    if (this.presetBuilderService.hasForbiddenInstitutionWords(this.form.profileName)) {
      const sanitized = this.presetBuilderService.sanitizeProfileName(this.form.profileName);
      this.form.profileName = sanitized;
      this.toastService.show('warning', 'Government and institution names were removed to keep presets neutral.');
    }

    // Cybersecurity: Input tampering bounds validation
    if (this.form.maxKb !== null && this.form.maxKb <= 0) {
      this.toastService.show('warning', 'Maximum file size must be greater than 0 KB');
      return;
    }
    if (this.form.minKb !== null && this.form.minKb < 0) {
      this.toastService.show('warning', 'Minimum file size cannot be negative');
      return;
    }
    if (this.form.minKb !== null && this.form.maxKb !== null && this.form.minKb > this.form.maxKb) {
      this.toastService.show('warning', 'Minimum file size cannot exceed maximum file size');
      return;
    }
    if (this.form.width !== null && this.form.width <= 0) {
      this.toastService.show('warning', 'Width must be greater than 0');
      return;
    }
    if (this.form.height !== null && this.form.height <= 0) {
      this.toastService.show('warning', 'Height must be greater than 0');
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      const preset: Preset = await this.presetBuilderService.saveSpecificationProfile({
        name: this.form.profileName,
        targetType: this.form.targetType,
        minKb: this.form.minKb ?? undefined,
        maxKb: this.form.maxKb ?? undefined,
        width: this.form.width ?? undefined,
        height: this.form.height ?? undefined,
        unit: this.form.unit,
        aspectRatio: this.form.aspectRatio?.trim() || undefined,
        format: this.form.format,
        dpi: this.form.dpi ?? undefined,
        rawSourceText: this.extractionResult?.rawText
      });

      this.savedPresetId = preset.id;
      this.saveSuccessNotice = true;
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.toastService.show('success', 'Profile saved to custom presets!');
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to save profile');
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  setTargetType(type: PresetTargetType): void {
    this.form.targetType = type;
    if (type === 'pdf') {
      this.form.format = 'PDF';
    } else if (this.form.format === 'PDF') {
      this.form.format = 'JPEG';
    }
    // Update auto-name proposal if user hasn't heavily customized it
    this.updateProposedName();
  }

  updateProposedName(): void {
    this.form.profileName = this.presetBuilderService.generateNeutralProfileName({
      targetType: this.form.targetType,
      width: this.form.width ?? undefined,
      height: this.form.height ?? undefined,
      unit: this.form.unit,
      minKb: this.form.minKb ?? undefined,
      maxKb: this.form.maxKb ?? undefined,
      format: this.form.format
    });
  }

  resetAnalysis(): void {
    this.currentFile = null;
    this.fileName = '';
    this.extractionResult = null;
    this.errorMessage = null;
    this.saveSuccessNotice = false;
    this.savedPresetId = null;
    this.manualTextInput = '';
  }

  goToPresets(): void {
    this.router.navigate(['/features/presets']);
  }
}
