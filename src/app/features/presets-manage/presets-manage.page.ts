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

import { ProfileTransferService } from '../../core/services/profile-transfer.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Preset,
  ExportedProfileV1,
  PresetRequirement
} from '../../core/models/preset.types';

import {
  AppHeaderComponent,
  AppIconComponent,
  AppBadgeComponent,
  AppModalComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-presets-manage',
  templateUrl: './presets-manage.page.html',
  styleUrls: ['./presets-manage.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppIconComponent,
    AppBadgeComponent,
    AppModalComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PresetsManagePage implements OnInit {
  private profileTransferService = inject(ProfileTransferService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  profiles: Preset[] = [];
  isLoading = true;
  isImporting = false;

  // Paste JSON section
  showPasteBox = false;
  pastedJsonText = '';
  validationError: string | null = null;

  // Validation Preview Modal
  showPreviewModal = false;
  pendingProfile: ExportedProfileV1 | null = null;
  rawPendingJson = '';
  isDuplicate = false;

  // Delete Confirmation Modal
  showDeleteModal = false;
  profileToDelete: Preset | null = null;

  async ngOnInit(): Promise<void> {
    await this.loadProfiles();
  }

  async loadProfiles(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      this.profiles = await this.profileTransferService.getCustomProfiles();
    } catch {
      this.profiles = [];
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async handleFileSelected(file: File): Promise<void> {
    if (!file) return;

    try {
      const text = await file.text();
      this.validateAndOpenPreview(text);
    } catch (err: any) {
      this.validationError = err?.message || 'Could not read JSON file.';
      this.toastService.show('error', this.validationError || 'Read error');
      this.cdr.markForCheck();
    }
  }

  handlePasteValidate(): void {
    if (!this.pastedJsonText.trim()) {
      this.validationError = 'Please paste JSON text first.';
      return;
    }
    this.validateAndOpenPreview(this.pastedJsonText);
  }

  private validateAndOpenPreview(jsonStr: string): void {
    this.validationError = null;
    const result = this.profileTransferService.validateProfileJson(jsonStr);

    if (!result.valid || !result.profile) {
      this.validationError = result.error || 'Invalid profile JSON schema';
      this.toastService.show('warning', this.validationError);
      this.cdr.markForCheck();
      return;
    }

    this.pendingProfile = result.profile;
    this.rawPendingJson = jsonStr;

    // Check if duplicate profile already exists
    this.isDuplicate = this.profiles.some(
      p =>
        p.id === result.profile!.id ||
        p.name.trim().toLowerCase() === result.profile!.name.trim().toLowerCase()
    );

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    this.showPreviewModal = true;
    this.cdr.markForCheck();
  }

  async confirmImport(overwrite = false): Promise<void> {
    if (!this.pendingProfile) return;

    this.isImporting = true;
    this.cdr.markForCheck();

    try {
      const result = await this.profileTransferService.importProfile(
        this.rawPendingJson,
        overwrite
      );

      if (!result.success) {
        this.toastService.show('warning', result.error || 'Import failed');
        return;
      }

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.toastService.show('success', `Profile "${result.preset?.name}" imported successfully!`);
      this.closePreviewModal();
      await this.loadProfiles();
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to import profile');
    } finally {
      this.isImporting = false;
      this.cdr.markForCheck();
    }
  }

  async confirmImportAsCopy(): Promise<void> {
    if (!this.pendingProfile) return;

    this.isImporting = true;
    this.cdr.markForCheck();

    try {
      const result = await this.profileTransferService.importProfileAsCopy(this.rawPendingJson);

      if (!result.success) {
        this.toastService.show('warning', result.error || 'Import failed');
        return;
      }

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.toastService.show('success', `Profile "${result.preset?.name}" saved as copy!`);
      this.closePreviewModal();
      await this.loadProfiles();
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to import profile as copy');
    } finally {
      this.isImporting = false;
      this.cdr.markForCheck();
    }
  }

  closePreviewModal(): void {
    this.showPreviewModal = false;
    this.pendingProfile = null;
    this.rawPendingJson = '';
    this.isDuplicate = false;
    this.pastedJsonText = '';
    this.cdr.markForCheck();
  }

  async shareProfile(preset: Preset): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      const result = await this.profileTransferService.shareProfile(preset);
      if (result.method === 'download') {
        this.toastService.show('success', `Downloaded "${preset.name}" profile JSON.`);
      } else {
        this.toastService.show('success', `Shared "${preset.name}" profile JSON.`);
      }
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to share profile');
    }
  }

  promptDelete(preset: Preset): void {
    this.profileToDelete = preset;
    this.showDeleteModal = true;
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    this.cdr.markForCheck();
  }

  async confirmDelete(): Promise<void> {
    if (!this.profileToDelete) return;

    try {
      await this.profileTransferService.deleteProfile(this.profileToDelete.id);
      this.toastService.show('success', `Profile "${this.profileToDelete.name}" deleted.`);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.closeDeleteModal();
      await this.loadProfiles();
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to delete profile');
    }
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.profileToDelete = null;
    this.cdr.markForCheck();
  }

  getRequirement(profile: Preset | ExportedProfileV1): PresetRequirement | undefined {
    return profile.photo || profile.signature || profile.pdf;
  }

  getTypeLabel(profile: Preset | ExportedProfileV1): string {
    if (profile.photo) return 'Photo';
    if (profile.signature) return 'Signature';
    if (profile.pdf) return 'PDF Document';
    return profile.targetType ? profile.targetType.toUpperCase() : 'Custom';
  }

  goToPresetBuilder(): void {
    this.router.navigate(['/features/presets/builder']);
  }

  scrollToImportSection(): void {
    const el = document.getElementById('import-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      this.showPasteBox = true;
    }
  }
}
