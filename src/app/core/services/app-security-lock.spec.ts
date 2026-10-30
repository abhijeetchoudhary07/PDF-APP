import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const preferencesStore = new Map<string, string>();
let isNative = true;

const readdirMock = vi.fn().mockResolvedValue({
  files: [
    { name: 'temp_canvas_1.png', size: 1048576, mtime: Date.now(), uri: 'cache://1', type: 'file' },
    { name: 'staging_export.pdf', size: 2097152, mtime: Date.now(), uri: 'cache://2', type: 'file' }
  ]
});

const deleteFileMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: preferencesStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
    clear: vi.fn(async () => {
      preferencesStore.clear();
    }),
    keys: vi.fn(async () => ({
      keys: Array.from(preferencesStore.keys())
    }))
  }
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readdir: (...args: any[]) => readdirMock(...args),
    deleteFile: (...args: any[]) => deleteFileMock(...args)
  },
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' }
}));

vi.mock('@capacitor/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  Capacitor: {
    isNativePlatform: () => isNative
  }
}));

import {
  AppSecurityLockService,
  SECURITY_LOCK_CONFIG_KEY
} from './app-security-lock.service';
import { Preferences } from '@capacitor/preferences';

describe('AppSecurityLockService — App Lock & Panic Clear', () => {
  let service: AppSecurityLockService;

  beforeEach(async () => {
    preferencesStore.clear();
    readdirMock.mockClear();
    deleteFileMock.mockClear();

    service = new AppSecurityLockService();
    await service.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Default State (Untouched Launch Flow)', () => {
    it('initializes with app lock OFF by default so launch flow is untouched', () => {
      const config = service.currentConfig;
      expect(config.enabled).toBe(false);
      expect(config.lockAppOnLaunch).toBe(false);
      expect(config.lockVaultOnly).toBe(false);
      expect(config.autoClearCacheOnExit).toBe(false);
      expect(service.isCurrentlyLocked).toBe(false);
      expect(service.isVaultCurrentlyLocked).toBe(false);
    });
  });

  describe('PIN Setup & Validation', () => {
    it('sets a 4-digit PIN with salt and stores hashed value in Preferences', async () => {
      await service.setPin('1234');

      const config = service.currentConfig;
      expect(config.enabled).toBe(true);
      expect(config.pinSalt).toBeDefined();
      expect(config.pinHash).toBeDefined();
      expect(config.pinHash).not.toBe('1234'); // Never plain text

      // Check Preferences persistence
      expect(preferencesStore.get(SECURITY_LOCK_CONFIG_KEY)).toBeDefined();
      const stored = JSON.parse(preferencesStore.get(SECURITY_LOCK_CONFIG_KEY)!);
      expect(stored.pinHash).toBe(config.pinHash);
    });

    it('rejects invalid PIN formats that are not 4 numeric digits', async () => {
      await expect(service.setPin('123')).rejects.toThrow();
      await expect(service.setPin('12345')).rejects.toThrow();
      await expect(service.setPin('abcd')).rejects.toThrow();
    });

    it('verifies correct PIN and unlocks the application', async () => {
      await service.setPin('7890');
      service.lock();
      expect(service.isCurrentlyLocked).toBe(true);

      const result = await service.verifyPin('7890');
      expect(result.success).toBe(true);
      expect(service.isCurrentlyLocked).toBe(false);
    });

    it('rejects incorrect PIN cleanly and decrements attemptsRemaining', async () => {
      await service.setPin('4321');

      const result = await service.verifyPin('0000');
      expect(result.success).toBe(false);
      expect(result.attemptsRemaining).toBe(4);
      expect(result.errorMessage).toContain('4 attempts remaining');
    });

    it('locks out temporarily after 5 consecutive failed attempts', async () => {
      await service.setPin('9999');

      for (let i = 0; i < 4; i++) {
        const res = await service.verifyPin('0000');
        expect(res.success).toBe(false);
      }

      // 5th attempt triggers lockout
      const finalRes = await service.verifyPin('0000');
      expect(finalRes.success).toBe(false);
      expect(finalRes.attemptsRemaining).toBe(0);
      expect(finalRes.lockedUntil).toBeDefined();

      // Subsequent attempt while locked out
      const lockedRes = await service.verifyPin('9999');
      expect(lockedRes.success).toBe(false);
      expect(lockedRes.errorMessage).toContain('Too many failed attempts');
    });

    it('changes PIN when current PIN is provided correctly', async () => {
      await service.setPin('1111');

      // Failed old PIN rejects change
      const badChange = await service.changePin('0000', '2222');
      expect(badChange.success).toBe(false);

      // Correct old PIN updates to new PIN
      const goodChange = await service.changePin('1111', '2222');
      expect(goodChange.success).toBe(true);

      const verifyNew = await service.verifyPin('2222');
      expect(verifyNew.success).toBe(true);
    });
  });

  describe('Auto-Lock Timers & Backgrounding', () => {
    it('locks immediately on backgrounding when autoLockTimeout is "immediate"', async () => {
      await service.setPin('1234');
      await service.setAutoLockTimeout('immediate');
      service.unlockAll();
      expect(service.isCurrentlyLocked).toBe(false);

      service.handleAppStateChange(false); // App sent to background
      expect(service.isCurrentlyLocked).toBe(true);
    });

    it('honors 1-minute timeout on foregrounding', async () => {
      await service.setPin('1234');
      await service.setAutoLockTimeout('1min');
      service.unlockAll();

      // Send to background
      service.handleAppStateChange(false);
      expect(service.isCurrentlyLocked).toBe(false); // Not immediate

      // Return immediately (< 60s)
      service.handleAppStateChange(true);
      expect(service.isCurrentlyLocked).toBe(false);

      // Simulate 61 seconds passing in background
      (service as any).lastBackgroundTimestamp = Date.now() - 65000;
      service.handleAppStateChange(true);
      expect(service.isCurrentlyLocked).toBe(true);
    });

    it('clears temporary cache on exit when autoClearCacheOnExit is enabled', async () => {
      await service.setAutoClearCacheOnExit(true);
      const clearSpy = vi.spyOn(service, 'clearTempCache');

      service.handleAppStateChange(false);
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('Panic Clear (Emergency Data Wipe)', () => {
    it('calculates storage breakdown before panic clear', async () => {
      preferencesStore.set('IFH_HISTORY_V2', JSON.stringify([{ id: 'h1' }, { id: 'h2' }]));
      preferencesStore.set('IFH_SIGNATURE_TEMPLATES_V1', JSON.stringify([{ id: 's1' }]));
      preferencesStore.set('SETTING_A', 'val');

      const breakdown = await service.getPanicClearBreakdown();

      expect(breakdown.historyEntriesCount).toBe(2);
      expect(breakdown.savedSignaturesCount).toBe(1);
      expect(breakdown.preferencesKeysCount).toBe(3);
      expect(breakdown.cachedFilesCount).toBe(2);
      expect(breakdown.totalItemsCount).toBeGreaterThan(0);
      expect(breakdown.formattedSummary).toContain('2 history entries');
      expect(breakdown.formattedSummary).toContain('1 saved signatures');
    });

    it('purges all preferences, cache files, and resets to default unlocked state', async () => {
      await service.setPin('1234');
      preferencesStore.set('IFH_HISTORY_V2', JSON.stringify([{ id: 'h1' }]));

      // Perform panic clear
      await service.panicClear();

      // 1. Preferences purged
      expect(Preferences.clear).toHaveBeenCalled();
      expect(preferencesStore.size).toBe(0);

      // 2. Filesystem Cache purged
      expect(deleteFileMock).toHaveBeenCalledWith({
        path: 'temp_canvas_1.png',
        directory: 'CACHE'
      });

      // 3. Service state reset to default unlocked state
      expect(service.currentConfig.enabled).toBe(false);
      expect(service.currentConfig.pinHash).toBeUndefined();
      expect(service.isCurrentlyLocked).toBe(false);
      expect(service.isVaultCurrentlyLocked).toBe(false);
    });

    it('securely zeroes out registered sensitive decrypted byte buffers during panic clear', async () => {
      const sensitiveData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
      const arrayBuffer = new ArrayBuffer(4);
      new Uint8Array(arrayBuffer).fill(0xaa);

      service.registerSensitiveBuffer(sensitiveData);
      service.registerSensitiveBuffer(arrayBuffer);

      // Verify buffers contain non-zero data
      expect(sensitiveData[0]).toBe(0x25);
      expect(new Uint8Array(arrayBuffer)[0]).toBe(0xaa);

      await service.panicClear();

      // Verify 100% zeroed out
      expect(Array.from(sensitiveData)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(Array.from(new Uint8Array(arrayBuffer))).toEqual([0, 0, 0, 0]);
    });

    it('unregisters sensitive buffers cleanly when released', () => {
      const buffer = new Uint8Array([1, 2, 3, 4]);
      service.registerSensitiveBuffer(buffer);
      service.unregisterSensitiveBuffer(buffer);

      const count = service.zeroOutSensitiveMemory();
      expect(count).toBe(0);
      expect(buffer[0]).toBe(1); // Untouched because unregistered
    });
  });

  describe('Cryptographic Hardening & PBKDF2', () => {
    it('stretches PIN with salt yielding a 64-character hex hash that is never plaintext', async () => {
      const salt = 'testsalt12345678';
      const hash1 = await service.hashPin('1234', salt);
      const hash2 = await service.hashPin('1234', salt);

      expect(hash1).toBe(hash2); // Deterministic with same salt
      expect(hash1.length).toBe(64); // 256 bits
      expect(hash1).not.toContain('1234');
      expect(hash1).not.toContain(salt);

      // Different PIN with same salt produces distinct hash
      const hashDiffPin = await service.hashPin('5678', salt);
      expect(hashDiffPin).not.toBe(hash1);

      // Same PIN with different salt produces distinct hash
      const hashDiffSalt = await service.hashPin('1234', 'othersalt999999');
      expect(hashDiffSalt).not.toBe(hash1);
    });
  });
});
