import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/api/auth.service';
import { ProfileService, UserProfile, UsageStats } from '../../core/services/profile.service';
import { MonetizationService } from '../../core/services/monetization.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppModalComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppModalComponent
  ]
})
export class ProfilePage implements OnInit {
  profile: UserProfile | null = null;
  usageStats: UsageStats | null = null;

  // Edit Profile Modal
  isEditModalOpen = false;
  editDisplayName = '';
  editEmail = '';

  // Reset Confirmation Modal
  isResetModalOpen = false;

  constructor(
    public profileService: ProfileService,
    public monetization: MonetizationService,
    public auth: AuthService,
    public themeService: ThemeService,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    this.profileService.profile$.subscribe(p => {
      this.profile = p;
    });
    await this.refreshUsageStats();
  }

  async refreshUsageStats() {
    this.usageStats = await this.profileService.getUsageStats();
  }

  openEditModal() {
    if (this.profile) {
      this.editDisplayName = this.profile.displayName;
      this.editEmail = this.profile.email;
      this.isEditModalOpen = true;
    }
  }

  async saveEditModal() {
    if (!this.editDisplayName.trim()) {
      this.toastService.warning('Please enter a display name.');
      return;
    }

    await this.profileService.updateProfile({
      displayName: this.editDisplayName.trim(),
      email: this.editEmail.trim()
    });

    this.isEditModalOpen = false;
    this.toastService.success('Profile updated successfully.');
  }

  onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.toastService.error('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      await this.profileService.updateProfile({ avatarUrl: dataUrl });
      this.toastService.success('Profile photo updated.');
    };
    reader.readAsDataURL(file);
  }

  async removeAvatar() {
    await this.profileService.updateProfile({ avatarUrl: null });
    this.toastService.info('Avatar reset to initials.');
  }

  async setAppTheme(theme: ThemeMode) {
    await this.themeService.setTheme(theme);
    this.toastService.info(`Theme changed to ${theme}.`);
  }

  async restorePurchases() {
    const success = await this.monetization.restorePurchases();
    if (success) {
      this.toastService.success('Purchases restored successfully!');
    } else {
      this.toastService.info('No active subscriptions found for this store account.');
    }
  }

  async confirmResetAllData() {
    await this.profileService.resetAllData();
    await this.refreshUsageStats();
    this.isResetModalOpen = false;
    this.toastService.success('All local history and cache have been cleared.');
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }
}
