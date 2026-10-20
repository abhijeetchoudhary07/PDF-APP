import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfPreflightService } from '../../core/services/pdf-preflight.service';
import { ToastService } from '../../core/services/toast.service';
import {
  PreflightProfile,
  PreflightReport,
  PreflightRuleId,
  PreflightRuleResult
} from '../../core/models/pdf-preflight.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  AutoScrollDirective,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-preflight',
  templateUrl: './pdf-preflight.page.html',
  styleUrls: ['./pdf-preflight.page.scss'],
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
    AutoScrollDirective,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfPreflightPage implements OnInit {
  private readonly preflightService = inject(PdfPreflightService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  profiles: PreflightProfile[] = [];
  selectedProfile?: PreflightProfile;

  currentFile?: File;
  preflightReport?: PreflightReport;
  isChecking = false;
  isFixing = false;
  activeFixRuleId?: PreflightRuleId;

  // JSON Profile Import/Export state
  showProfileModal = false;
  jsonProfileText = '';

  async ngOnInit(): Promise<void> {
    this.profiles = await this.preflightService.getSavedProfiles();
    this.selectedProfile = this.profiles.find(p => p.isDefault) || this.profiles[0];
    this.cdr.markForCheck();
  }

  selectProfile(profile: PreflightProfile): void {
    this.selectedProfile = profile;
    if (this.currentFile) {
      void this.runCheck(this.currentFile);
    }
  }

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toast.error('Please select a valid PDF file.');
      return;
    }
    this.currentFile = file;
    await this.runCheck(file);
  }

  async runCheck(file: File): Promise<void> {
    if (!this.selectedProfile) return;

    this.isChecking = true;
    this.preflightReport = undefined;
    this.cdr.markForCheck();

    try {
      this.preflightReport = await this.preflightService.runPreflight(file, this.selectedProfile);
      if (this.preflightReport.passed) {
        this.toast.success('Document passed all preflight checks.');
      } else {
        this.toast.warning(`${this.preflightReport.failCount} rule(s) failed check.`);
      }
    } catch (err: any) {
      this.toast.error('Preflight check failed: ' + (err?.message || err));
    } finally {
      this.isChecking = false;
      this.cdr.markForCheck();
    }
  }

  async applyRuleFix(rule: PreflightRuleResult): Promise<void> {
    if (!this.currentFile || !this.selectedProfile || !rule.fixable) return;

    this.isFixing = true;
    this.activeFixRuleId = rule.id;
    this.cdr.markForCheck();

    try {
      const { fixedFile, updatedReport } = await this.preflightService.applyFix(
        this.currentFile,
        rule.id,
        this.selectedProfile
      );
      this.currentFile = fixedFile;
      this.preflightReport = updatedReport;
      this.toast.success('Fix applied successfully. Document re-verified.');
    } catch (err: any) {
      this.toast.error('Failed to apply fix: ' + (err?.message || err));
    } finally {
      this.isFixing = false;
      this.activeFixRuleId = undefined;
      this.cdr.markForCheck();
    }
  }

  async fixAllFailedRules(): Promise<void> {
    if (!this.currentFile || !this.selectedProfile || !this.preflightReport) return;

    const fixableRules = this.preflightReport.rules.filter(r => r.status === 'fail' && r.fixable);
    if (fixableRules.length === 0) return;

    this.isFixing = true;
    this.cdr.markForCheck();

    try {
      let fileToFix: File = this.currentFile;
      for (const rule of fixableRules) {
        const { fixedFile } = await this.preflightService.applyFix(
          fileToFix,
          rule.id,
          this.selectedProfile
        );
        fileToFix = fixedFile;
      }
      this.currentFile = fileToFix;
      this.preflightReport = await this.preflightService.runPreflight(fileToFix, this.selectedProfile);
      this.toast.success('All fixable rules resolved.');
    } catch (err: any) {
      this.toast.error('Fix-all encountered an error: ' + (err?.message || err));
    } finally {
      this.isFixing = false;
      this.cdr.markForCheck();
    }
  }

  async downloadFixedFile(): Promise<void> {
    if (!this.currentFile) return;

    try {
      const res = await this.preflightService.saveFixedPdf(this.currentFile);
      if (res) {
        this.toast.success('Verified PDF saved to device.');
      }
    } catch (err: any) {
      this.toast.error('Failed to save file: ' + (err?.message || err));
    }
  }

  resetCurrent(): void {
    this.currentFile = undefined;
    this.preflightReport = undefined;
    this.cdr.markForCheck();
  }

  // --- Profile Export / Import Modal ---

  openProfileModal(): void {
    if (this.selectedProfile) {
      this.jsonProfileText = this.preflightService.exportProfileAsJson(this.selectedProfile);
    }
    this.showProfileModal = true;
    this.cdr.markForCheck();
  }

  closeProfileModal(): void {
    this.showProfileModal = false;
    this.cdr.markForCheck();
  }

  async importProfile(): Promise<void> {
    try {
      const imported = this.preflightService.importProfileFromJson(this.jsonProfileText);
      await this.preflightService.saveProfile(imported);
      this.profiles = await this.preflightService.getSavedProfiles();
      this.selectedProfile = imported;
      this.showProfileModal = false;
      this.toast.success('Profile imported successfully.');
      if (this.currentFile) {
        await this.runCheck(this.currentFile);
      }
    } catch (err: any) {
      this.toast.error('Invalid profile JSON: ' + (err?.message || err));
    }
  }
}
