import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HistoryItem } from './history.service';
import { HistoryService } from './history.service';
import { ProfileService, UserProfile } from './profile.service';

/*
 * The local account: a display name, a generated device id, and the numbers
 * the profile page shows.
 *
 * There is no server behind any of it, so the only correctness question is
 * whether the stats add up and whether "reset all data" throws away what it
 * says it does — and only that. A reset that also wiped the device id would
 * silently change who this install claims to be.
 */
const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      store.delete(key);
    }),
  },
}));

const KEY = 'IFH_LOCAL_PROFILE_V1';

function historyItem(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: `hist_${Math.random()}`,
    operation: 'pdf',
    originalFileName: 'in.pdf',
    outputFileName: 'out.pdf',
    originalSizeBytes: 1000,
    outputSizeBytes: 400,
    date: Date.now(),
    ...over,
  };
}

/** The constructor loads from storage; let that settle before asserting. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ProfileService', () => {
  let items: HistoryItem[];
  let clearHistory: ReturnType<typeof vi.fn>;

  function makeService(): ProfileService {
    items = items ?? [];
    clearHistory = vi.fn(async () => {
      items = [];
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProfileService,
        {
          provide: HistoryService,
          useValue: {
            getHistory: async () => items,
            clearHistory: () => clearHistory(),
          },
        },
      ],
    });
    return TestBed.inject(ProfileService);
  }

  beforeEach(() => {
    store.clear();
    items = [];
  });

  describe('first run', () => {
    it('generates and persists a device id', async () => {
      const profile = makeService();
      await settled();

      expect(profile.profile$.value.deviceId).toMatch(/^DEV_[A-Z0-9]{8}$/);
      expect(store.has(KEY)).toBe(true);
      expect(JSON.parse(store.get(KEY)!).deviceId).toBe(profile.profile$.value.deviceId);
    });

    it('gives two installs different ids', async () => {
      const first = makeService();
      await settled();
      const idA = first.profile$.value.deviceId;

      store.clear();
      const second = makeService();
      await settled();

      expect(second.profile$.value.deviceId).not.toBe(idA);
    });
  });

  describe('loading', () => {
    it('restores what a previous session saved', async () => {
      const saved: UserProfile = {
        displayName: 'Asha',
        email: 'asha@example.com',
        avatarUrl: 'data:image/png;base64,AA',
        deviceId: 'DEV_ABCD1234',
        createdAt: 1700000000000,
        defaultFilePrefix: 'ssc',
        defaultOutputFormat: 'pdf',
        autoSaveHistory: false,
      };
      store.set(KEY, JSON.stringify(saved));

      const profile = makeService();
      await settled();

      expect(profile.profile$.value).toEqual(saved);
    });

    it('survives an unreadable stored profile rather than failing to start', async () => {
      store.set(KEY, '{not json');

      const profile = makeService();
      await settled();

      // The default seed is still in place and nothing was thrown.
      expect(profile.profile$.value.displayName).toBe('Offline User');
    });
  });

  it('merges an update rather than replacing the profile', async () => {
    const profile = makeService();
    await settled();
    const deviceId = profile.profile$.value.deviceId;

    const updated = await profile.updateProfile({ displayName: 'Ravi' });

    expect(updated.displayName).toBe('Ravi');
    expect(updated.deviceId).toBe(deviceId);
    expect(profile.profile$.value.displayName).toBe('Ravi');
    expect(JSON.parse(store.get(KEY)!).displayName).toBe('Ravi');
  });

  describe('usage stats', () => {
    it('counts files and distinct tools', async () => {
      items = [
        historyItem({ operation: 'pdf' }),
        historyItem({ operation: 'pdf' }),
        historyItem({ operation: 'photo' }),
        historyItem({ operation: 'signature' }),
      ];
      const profile = makeService();

      const stats = await profile.getUsageStats();

      expect(stats.filesProcessed).toBe(4);
      expect(stats.toolsUsedCount).toBe(3);
    });

    it('only counts a size reduction as space saved', async () => {
      items = [
        historyItem({ originalSizeBytes: 1000, outputSizeBytes: 400 }), // saved 600
        historyItem({ originalSizeBytes: 500, outputSizeBytes: 900 }), // a conversion that grew
      ];
      const profile = makeService();

      const stats = await profile.getUsageStats();

      expect(stats.totalSpaceSavedBytes).toBe(600);
      // The one that grew still occupies space on the device, so it counts here.
      expect(stats.estimatedStorageBytes).toBe(1300);
    });

    it('shows the five most recent', async () => {
      items = Array.from({ length: 12 }, (_, i) => historyItem({ outputFileName: `out_${i}.pdf` }));
      const profile = makeService();

      const stats = await profile.getUsageStats();

      expect(stats.recentItems.map(i => i.outputFileName)).toEqual([
        'out_0.pdf',
        'out_1.pdf',
        'out_2.pdf',
        'out_3.pdf',
        'out_4.pdf',
      ]);
    });

    it('reads zeroes rather than NaN from an empty history', async () => {
      const profile = makeService();

      const stats = await profile.getUsageStats();

      expect(stats).toMatchObject({
        filesProcessed: 0,
        toolsUsedCount: 0,
        totalSpaceSavedBytes: 0,
        estimatedStorageBytes: 0,
        recentItems: [],
      });
    });
  });

  describe('resetAllData', () => {
    it('clears the history and the preferences, and keeps the identity', async () => {
      store.set(
        KEY,
        JSON.stringify({
          displayName: 'Asha',
          email: 'asha@example.com',
          avatarUrl: 'data:image/png;base64,AA',
          deviceId: 'DEV_ABCD1234',
          createdAt: 1700000000000,
          defaultFilePrefix: 'ssc',
          defaultOutputFormat: 'pdf',
          autoSaveHistory: false,
        }),
      );
      items = [historyItem()];
      const profile = makeService();
      await settled();

      await profile.resetAllData();

      expect(clearHistory).toHaveBeenCalledTimes(1);
      expect(profile.profile$.value).toMatchObject({
        avatarUrl: null,
        defaultFilePrefix: 'doc',
        defaultOutputFormat: 'original',
        autoSaveHistory: true,
        // Not reset: this install is still the same install.
        displayName: 'Asha',
        deviceId: 'DEV_ABCD1234',
        createdAt: 1700000000000,
      });
    });
  });

  describe('getInitials', () => {
    const service = () => makeService();

    it.each([
      ['Asha Devi', 'AD'],
      ['asha devi', 'AD'],
      ['Ravi', 'RA'],
      ['R', 'R'],
      ['Asha  Kumari   Devi', 'AD'],
      ['  Asha  ', 'AS'],
    ])('%s -> %s', (name, expected) => {
      expect(service().getInitials(name)).toBe(expected);
    });

    it.each(['', '   ', null, undefined])('falls back to U for %p', value => {
      expect(service().getInitials(value as unknown as string)).toBe('U');
    });
  });
});
