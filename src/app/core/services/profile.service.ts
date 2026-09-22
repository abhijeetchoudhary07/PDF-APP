import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { HistoryService, HistoryItem } from './history.service';

export interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  deviceId: string;
  createdAt: number;
  defaultFilePrefix: string;
  defaultOutputFormat: string;
  autoSaveHistory: boolean;
}

export interface UsageStats {
  filesProcessed: number;
  toolsUsedCount: number;
  totalSpaceSavedBytes: number;
  recentItems: HistoryItem[];
  estimatedStorageBytes: number;
}

const PROFILE_STORAGE_KEY = 'IFH_LOCAL_PROFILE_V1';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  public profile$ = new BehaviorSubject<UserProfile>({
    displayName: 'Offline User',
    email: '',
    avatarUrl: null,
    deviceId: '',
    createdAt: Date.now(),
    defaultFilePrefix: 'doc',
    defaultOutputFormat: 'original',
    autoSaveHistory: true
  });

  constructor(private historyService: HistoryService) {
    this.loadProfile();
  }

  private async loadProfile() {
    try {
      const { value } = await Preferences.get({ key: PROFILE_STORAGE_KEY });
      if (value) {
        this.profile$.next(JSON.parse(value));
      } else {
        // Generate new local device profile
        const newProfile: UserProfile = {
          displayName: 'Offline User',
          email: '',
          avatarUrl: null,
          deviceId: `DEV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          createdAt: Date.now(),
          defaultFilePrefix: 'doc',
          defaultOutputFormat: 'original',
          autoSaveHistory: true
        };
        await this.saveProfile(newProfile);
      }
    } catch (e) {
      console.warn('Failed to load profile from preferences', e);
    }
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const current = this.profile$.value;
    const updated = { ...current, ...updates };
    await this.saveProfile(updated);
    return updated;
  }

  private async saveProfile(profile: UserProfile): Promise<void> {
    this.profile$.next(profile);
    await Preferences.set({
      key: PROFILE_STORAGE_KEY,
      value: JSON.stringify(profile)
    });
  }

  async getUsageStats(): Promise<UsageStats> {
    const history = await this.historyService.getHistory();
    const filesProcessed = history.length;

    const distinctTools = new Set(history.map(item => item.operation));
    const toolsUsedCount = distinctTools.size;

    let totalSpaceSavedBytes = 0;
    let estimatedStorageBytes = 0;

    for (const item of history) {
      if (item.originalSizeBytes && item.outputSizeBytes) {
        const saved = item.originalSizeBytes - item.outputSizeBytes;
        if (saved > 0) {
          totalSpaceSavedBytes += saved;
        }
        estimatedStorageBytes += item.outputSizeBytes;
      }
    }

    return {
      filesProcessed,
      toolsUsedCount,
      totalSpaceSavedBytes,
      recentItems: history.slice(0, 5),
      estimatedStorageBytes
    };
  }

  async resetAllData(): Promise<void> {
    await this.historyService.clearHistory();
    const current = this.profile$.value;
    const resetProfile: UserProfile = {
      ...current,
      avatarUrl: null,
      defaultFilePrefix: 'doc',
      defaultOutputFormat: 'original',
      autoSaveHistory: true
    };
    await this.saveProfile(resetProfile);
  }

  getInitials(name: string): string {
    if (!name || !name.trim()) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
