import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MonetizationService } from '../../core/services/monetization.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { ProfileService, UserProfile } from '../../core/services/profile.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppModalComponent,
  PrivacySupportNavComponent,
  AppLanguageSelectorComponent,
  AppGovDisclaimerComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    PrivacySupportNavComponent,
    AppButtonComponent,
    AppModalComponent,
    AppLanguageSelectorComponent,
    AppGovDisclaimerComponent,
    TranslatePipe
  ]
})
export class SettingsPage implements OnInit {
  monetization = inject(MonetizationService);
  themeService = inject(ThemeService);
  profileService = inject(ProfileService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);

  profile: UserProfile | null = null;
  historyCount = 0;
  estimatedStorage = '0 KB';

  isClearHistoryModalOpen = false;
  isPrivacyPolicyModalOpen = false;
  isTermsModalOpen = false;

  async ngOnInit() {
    this.profileService.profile$.subscribe(p => {
      this.profile = p;
    });
    await this.refreshStorageStats();
  }

  async refreshStorageStats() {
    const history = await this.historyService.getHistory();
    this.historyCount = history.length;
    let totalBytes = 0;
    for (const item of history) {
      totalBytes += item.outputSizeBytes || 0;
    }
    const kb = totalBytes / 1024;
    this.estimatedStorage = kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  async setAppTheme(theme: ThemeMode) {
    await this.themeService.setTheme(theme);
    this.toastService.info(`Theme set to ${theme}.`);
  }

  async updatePrefix(prefix: string) {
    await this.profileService.updateProfile({ defaultFilePrefix: prefix.trim() || 'doc' });
    this.toastService.success('Default prefix updated.');
  }

  async updateFormat(format: string) {
    await this.profileService.updateProfile({ defaultOutputFormat: format });
    this.toastService.success(`Default format set to ${format.toUpperCase()}.`);
  }

  async toggleAutoSave(autoSave: boolean) {
    await this.profileService.updateProfile({ autoSaveHistory: autoSave });
  }

  async restorePurchases() {
    const success = await this.monetization.restorePurchases();
    if (success) {
      this.toastService.success('Purchases restored successfully!');
    } else {
      this.toastService.info('No active subscriptions found for this account.');
    }
  }

  async confirmClearHistory() {
    await this.historyService.clearHistory();
    await this.refreshStorageStats();
    this.isClearHistoryModalOpen = false;
    this.toastService.success('Processing history cleared successfully.');
  }
}
