import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';

import { RouterModule } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

import { HistoryService, HistoryItem } from '../../core/services/history.service';
import { ProfileService } from '../../core/services/profile.service';
import { ToastService } from '../../core/services/toast.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  PrivacySupportNavComponent,
  AppButtonComponent,
  AppModalComponent
} from '../../shared/components/ui';

export interface StorageRecord {
  key: string;
  name: string;
  type: string;
  purpose: string;
  sizeBytes: number;
  formattedSize: string;
  itemCount?: number;
}

@Component({
  selector: 'app-local-data-storage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './local-data-storage.page.html',
  styleUrls: ['./local-data-storage.page.scss'],
  imports: [
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    PrivacySupportNavComponent,
    AppButtonComponent,
    AppModalComponent
]
})
export class LocalDataStoragePage implements OnInit {
  private historyService = inject(HistoryService);
  private profileService = inject(ProfileService);
  private toastService = inject(ToastService);

  storageRecords: StorageRecord[] = [];
  totalStorageBytes = 0;
  totalStorageFormatted = '0 KB';
  historyItemsCount = 0;

  isClearHistoryModalOpen = false;
  isFactoryResetModalOpen = false;

  async ngOnInit(): Promise<void> {
    await this.refreshStorage();
  }

  async refreshStorage(): Promise<void> {
    const history = await this.historyService.getHistory();
    this.historyItemsCount = history.length;

    let historySizeBytes = 0;
    for (const h of history) {
      historySizeBytes += (h.outputSizeBytes || 0) + (h.originalSizeBytes || 0);
    }
    // Also estimate the JSON string size in Preferences
    const { value: historyJson } = await Preferences.get({ key: 'IFH_HISTORY_V2' });
    const historyJsonBytes = historyJson ? new Blob([historyJson]).size : 0;

    const { value: profileJson } = await Preferences.get({ key: 'IFH_USER_PROFILE' });
    const profileJsonBytes = profileJson ? new Blob([profileJson]).size : 0;

    const { value: themeVal } = await Preferences.get({ key: 'IFH_THEME' });
    const themeBytes = themeVal ? new Blob([themeVal]).size : 0;

    const { value: presetsVal } = await Preferences.get({ key: 'IFH_CUSTOM_PRESETS' });
    const presetsBytes = presetsVal ? new Blob([presetsVal]).size : 0;

    // Calculate total LocalStorage usage
    let localStorageTotalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const val = localStorage.getItem(k) || '';
          localStorageTotalBytes += new Blob([k + val]).size;
        }
      }
    } catch {
      localStorageTotalBytes = 0;
    }

    const records: StorageRecord[] = [
      {
        key: 'IFH_HISTORY_V2',
        name: 'Processing History Log',
        type: 'Capacitor Preferences',
        purpose: 'Stores file names, size changes, and dates of your processed documents.',
        sizeBytes: historyJsonBytes,
        formattedSize: this.formatBytes(historyJsonBytes),
        itemCount: history.length
      },
      {
        key: 'IFH_USER_PROFILE',
        name: 'User Profile & Preferences',
        type: 'Capacitor Preferences',
        purpose: 'Stores display name, default file prefix, and auto-save options.',
        sizeBytes: profileJsonBytes,
        formattedSize: this.formatBytes(profileJsonBytes)
      },
      {
        key: 'IFH_THEME',
        name: 'Appearance Theme Mode',
        type: 'Capacitor Preferences',
        purpose: 'Stores your preferred color scheme (Light, Dark, or System).',
        sizeBytes: themeBytes,
        formattedSize: this.formatBytes(themeBytes)
      },
      {
        key: 'IFH_CUSTOM_PRESETS',
        name: 'Custom Portal Presets',
        type: 'Capacitor Preferences',
        purpose: 'Custom examination and dimension configurations created by you.',
        sizeBytes: presetsBytes,
        formattedSize: this.formatBytes(presetsBytes)
      },
      {
        key: 'LOCAL_CACHE',
        name: 'Browser Session Cache',
        type: 'IndexedDB / HTML5 Cache',
        purpose: 'In-memory Canvas buffers and temporary WebAssembly binary artifacts.',
        sizeBytes: localStorageTotalBytes,
        formattedSize: this.formatBytes(localStorageTotalBytes)
      }
    ];

    this.storageRecords = records;
    this.totalStorageBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
    this.totalStorageFormatted = this.formatBytes(this.totalStorageBytes);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async exportBackup(): Promise<void> {
    try {
      const history = await this.historyService.getHistory();
      const { value: profile } = await Preferences.get({ key: 'IFH_USER_PROFILE' });
      const { value: theme } = await Preferences.get({ key: 'IFH_THEME' });
      const { value: presets } = await Preferences.get({ key: 'IFH_CUSTOM_PRESETS' });

      const backupData = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        engine: 'ClientSideWebAssembly',
        history,
        profile: profile ? JSON.parse(profile) : null,
        theme: theme || 'system',
        customPresets: presets ? JSON.parse(presets) : []
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indian_form_helper_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.toastService.success('Data backup exported successfully!');
    } catch {
      this.toastService.error('Failed to export backup data.');
    }
  }

  async clearCache(): Promise<void> {
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      this.toastService.success('Temporary browser cache cleared.');
      await this.refreshStorage();
    } catch {
      this.toastService.info('Cache cleared.');
    }
  }

  async confirmClearHistory(): Promise<void> {
    await this.historyService.clearHistory();
    this.isClearHistoryModalOpen = false;
    this.toastService.success('History logs cleared.');
    await this.refreshStorage();
  }

  async confirmFactoryReset(): Promise<void> {
    try {
      await Preferences.clear();
      localStorage.clear();
      sessionStorage.clear();
      this.isFactoryResetModalOpen = false;
      this.toastService.success('All local storage reset to factory settings. Reloading...');
      setTimeout(() => {
        window.location.href = '/home';
      }, 1200);
    } catch {
      this.toastService.error('Failed to perform reset.');
    }
  }
}
