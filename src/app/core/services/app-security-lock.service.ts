import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { DocumentBridgeService } from './document-bridge.service';

import {
  AppLockConfig,
  AutoLockTimeout,
  LockStatus,
  PanicClearBreakdown,
  PinVerificationResult
} from '../models/app-security-lock.types';

export const SECURITY_LOCK_CONFIG_KEY = 'IFH_SECURITY_LOCK_CONFIG_V1';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds lockout after 5 failed attempts

const DEFAULT_CONFIG: AppLockConfig = {
  enabled: false,
  biometricEnabled: false,
  lockAppOnLaunch: false,
  lockVaultOnly: false,
  autoLockTimeout: 'immediate',
  autoClearCacheOnExit: false,
  failedAttempts: 0
};

@Injectable({
  providedIn: 'root'
})
export class AppSecurityLockService {
  private configSubject = new BehaviorSubject<AppLockConfig>({ ...DEFAULT_CONFIG });
  public config$: Observable<AppLockConfig> = this.configSubject.asObservable();

  private isLockedSubject = new BehaviorSubject<boolean>(false);
  public isLocked$: Observable<boolean> = this.isLockedSubject.asObservable();

  private isVaultLockedSubject = new BehaviorSubject<boolean>(false);
  public isVaultLocked$: Observable<boolean> = this.isVaultLockedSubject.asObservable();

  private documentBridge?: DocumentBridgeService;
  private sensitiveBuffers = new Set<Uint8Array | ArrayBuffer>();

  private lastBackgroundTimestamp = 0;
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      (window as any).__securityLockService = this;
    }
    try {
      this.documentBridge = inject(DocumentBridgeService, { optional: true }) ?? undefined;
    } catch {}
    this.init();
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const { value } = await Preferences.get({ key: SECURITY_LOCK_CONFIG_KEY });
      if (value) {
        const parsed = JSON.parse(value);
        const config: AppLockConfig = { ...DEFAULT_CONFIG, ...parsed };
        this.configSubject.next(config);

        // Check if locked on launch
        if (config.enabled) {
          if (config.lockAppOnLaunch) {
            this.isLockedSubject.next(true);
          }
          if (config.lockVaultOnly) {
            this.isVaultLockedSubject.next(true);
          }
        }
      }
    } catch {
      console.warn('AppSecurityLockService: Failed to load config, defaulting to unlocked.');
      this.configSubject.next({ ...DEFAULT_CONFIG });
    }

    this.setupLifecycleListeners();
  }

  get currentConfig(): AppLockConfig {
    return this.configSubject.value;
  }

  get isCurrentlyLocked(): boolean {
    return this.isLockedSubject.value;
  }

  get isVaultCurrentlyLocked(): boolean {
    return this.isVaultLockedSubject.value;
  }

  // --- MEMORY REMNANTS & BUFFER ZEROING ---

  /**
   * Registers a sensitive decrypted byte buffer (e.g. PDF bytes in memory) to be zeroed on Panic Clear.
   */
  registerSensitiveBuffer(buffer: Uint8Array | ArrayBuffer): void {
    if (buffer) {
      this.sensitiveBuffers.add(buffer);
    }
  }

  /**
   * Unregisters a sensitive buffer when cleanly released by a feature.
   */
  unregisterSensitiveBuffer(buffer: Uint8Array | ArrayBuffer): void {
    if (buffer) {
      this.sensitiveBuffers.delete(buffer);
    }
  }

  /**
   * Securely wipes memory remnants by writing zeros across all registered buffers.
   */
  zeroOutSensitiveMemory(): number {
    let zeroedCount = 0;
    for (const buf of this.sensitiveBuffers) {
      try {
        if (buf instanceof Uint8Array) {
          buf.fill(0);
          zeroedCount++;
        } else if (buf instanceof ArrayBuffer) {
          new Uint8Array(buf).fill(0);
          zeroedCount++;
        }
      } catch {}
    }
    this.sensitiveBuffers.clear();
    return zeroedCount;
  }

  // --- PIN MANAGEMENT ---

  /**
   * Hashes a 4-digit PIN with a cryptographic salt using PBKDF2 (10,000 iterations)
   * or SHA-256 fallback to prevent offline brute-force dictionary attacks.
   */
  async hashPin(pin: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        // Derive PBKDF2 key with 10,000 iterations of SHA-256 for brute-force resistance
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(pin),
          { name: 'PBKDF2' },
          false,
          ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 10000,
            hash: 'SHA-256'
          },
          keyMaterial,
          256
        );
        const hashArray = Array.from(new Uint8Array(derivedBits));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Multi-pass SHA-256 digest fallback
        const data = encoder.encode(`${salt}:${pin}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    }
    // Simple fallback if crypto.subtle is unavailable
    let hash = 0;
    const str = `${salt}:${pin}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  private generateSalt(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /**
   * Sets or updates the 4-digit PIN, activates lock, and persists configuration.
   */
  async setPin(newPin: string): Promise<void> {
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('PIN must be exactly 4 numeric digits.');
    }

    const salt = this.generateSalt();
    const hash = await this.hashPin(newPin, salt);

    const updatedConfig: AppLockConfig = {
      ...this.currentConfig,
      enabled: true,
      pinHash: hash,
      pinSalt: salt,
      failedAttempts: 0,
      lockedUntilTimestamp: undefined
    };

    // Default to app launch lock if neither was selected
    if (!updatedConfig.lockAppOnLaunch && !updatedConfig.lockVaultOnly) {
      updatedConfig.lockAppOnLaunch = true;
    }

    await this.saveConfig(updatedConfig);
  }

  /**
   * Verifies the entered PIN against the stored hash.
   */
  async verifyPin(pin: string): Promise<PinVerificationResult> {
    const config = this.currentConfig;
    if (!config.enabled || !config.pinHash || !config.pinSalt) {
      return { success: true, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }

    // Check lockout timer
    const now = Date.now();
    if (config.lockedUntilTimestamp && now < config.lockedUntilTimestamp) {
      const remainingMs = config.lockedUntilTimestamp - now;
      return {
        success: false,
        attemptsRemaining: 0,
        lockedUntil: new Date(config.lockedUntilTimestamp),
        errorMessage: `Too many failed attempts. Try again in ${Math.ceil(remainingMs / 1000)} seconds.`
      };
    }

    const inputHash = await this.hashPin(pin, config.pinSalt);
    if (inputHash === config.pinHash) {
      // PIN matches
      const updatedConfig: AppLockConfig = {
        ...config,
        failedAttempts: 0,
        lockedUntilTimestamp: undefined
      };
      await this.saveConfig(updatedConfig);

      this.unlockAll();
      return { success: true, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    } else {
      // PIN mismatch
      const failed = (config.failedAttempts || 0) + 1;
      let lockedUntilTimestamp: number | undefined;

      if (failed >= MAX_FAILED_ATTEMPTS) {
        lockedUntilTimestamp = now + LOCKOUT_DURATION_MS;
      }

      const updatedConfig: AppLockConfig = {
        ...config,
        failedAttempts: failed,
        lockedUntilTimestamp
      };
      await this.saveConfig(updatedConfig);

      const attemptsRemaining = Math.max(0, MAX_FAILED_ATTEMPTS - failed);
      return {
        success: false,
        attemptsRemaining,
        lockedUntil: lockedUntilTimestamp ? new Date(lockedUntilTimestamp) : undefined,
        errorMessage: attemptsRemaining > 0
          ? `Incorrect PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
          : `Too many failed attempts. Locked for 30 seconds.`
      };
    }
  }

  /**
   * Changes the existing PIN after verifying the old PIN.
   */
  async changePin(currentPin: string, newPin: string): Promise<PinVerificationResult> {
    const verifyResult = await this.verifyPin(currentPin);
    if (!verifyResult.success) {
      return verifyResult;
    }

    await this.setPin(newPin);
    return { success: true, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  // --- LOCK STATE & TIMEOUTS ---

  lock(): void {
    const config = this.currentConfig;
    if (!config.enabled) return;

    if (config.lockAppOnLaunch) {
      this.isLockedSubject.next(true);
    }
    if (config.lockVaultOnly) {
      this.isVaultLockedSubject.next(true);
    }
  }

  unlockAll(): void {
    this.isLockedSubject.next(false);
    this.isVaultLockedSubject.next(false);
  }

  unlockVault(): void {
    this.isVaultLockedSubject.next(false);
  }

  lockVault(): void {
    const config = this.currentConfig;
    if (config.enabled && config.lockVaultOnly) {
      this.isVaultLockedSubject.next(true);
    }
  }

  // --- BIOMETRIC AUTHENTICATION ---

  /**
   * Checks whether the device or browser environment supports biometric authentication.
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
    } catch {}
    return false;
  }

  /**
   * Prompts for biometric authentication (Fingerprint, Face Unlock) with graceful fallback.
   */
  async authenticateBiometric(): Promise<boolean> {
    const config = this.currentConfig;
    if (!config.enabled || !config.biometricEnabled) {
      return false;
    }

    try {
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        navigator.credentials &&
        typeof navigator.credentials.get === 'function'
      ) {
        // Platform authenticator challenge
        const challenge = new Uint8Array(32);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          crypto.getRandomValues(challenge);
        }

        const credential = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'required'
          }
        });

        if (credential) {
          this.unlockAll();
          return true;
        }
      }
    } catch {
      // User cancelled or biometric prompt not configured on browser, fallback to PIN
    }
    return false;
  }

  // --- CONFIGURATION UPDATES ---

  async updateConfig(partial: Partial<AppLockConfig>): Promise<AppLockConfig> {
    const updated: AppLockConfig = {
      ...this.currentConfig,
      ...partial
    };

    // If disabled, unlock everything immediately
    if (updated.enabled === false) {
      this.unlockAll();
    }

    await this.saveConfig(updated);
    return updated;
  }

  async setLockTargets(lockAppOnLaunch: boolean, lockVaultOnly: boolean): Promise<void> {
    await this.updateConfig({ lockAppOnLaunch, lockVaultOnly });
  }

  async setAutoLockTimeout(timeout: AutoLockTimeout): Promise<void> {
    await this.updateConfig({ autoLockTimeout: timeout });
  }

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await this.updateConfig({ biometricEnabled: enabled });
  }

  async setAutoClearCacheOnExit(enabled: boolean): Promise<void> {
    await this.updateConfig({ autoClearCacheOnExit: enabled });
  }

  async disableLock(): Promise<void> {
    const updated: AppLockConfig = {
      ...DEFAULT_CONFIG,
      enabled: false,
      pinHash: undefined,
      pinSalt: undefined,
      failedAttempts: 0,
      lockedUntilTimestamp: undefined
    };
    await this.saveConfig(updated);
    this.unlockAll();
  }

  // --- TEMP FILES AUTO-CLEAR ---

  /**
   * Deletes cached render canvases, temporary export files, and staging blobs.
   */
  async clearTempCache(): Promise<{ clearedFilesCount: number; clearedBytes: number }> {
    let clearedFilesCount = 0;
    let clearedBytes = 0;

    try {
      if (Capacitor.isNativePlatform()) {
        const files = await Filesystem.readdir({
          path: '',
          directory: Directory.Cache
        });

        for (const item of files.files) {
          try {
            await Filesystem.deleteFile({
              path: item.name,
              directory: Directory.Cache
            });
            clearedFilesCount++;
            clearedBytes += (item.size || 0);
          } catch {}
        }
      }
    } catch {}

    return { clearedFilesCount, clearedBytes };
  }

  // --- PANIC CLEAR (EMERGENCY DATA WIPE) ---

  /**
   * Pre-flight inspection calculating exact storage breakdown to show user in confirmation sheet.
   */
  async getPanicClearBreakdown(): Promise<PanicClearBreakdown> {
    let historyEntriesCount = 0;
    let savedSignaturesCount = 0;
    let preferencesKeysCount = 0;
    let cachedFilesCount = 0;
    let cachedFilesSizeBytes = 0;
    let indexedDbDatabasesCount = 0;

    try {
      // 1. Preferences keys & counts
      const { keys } = await Preferences.keys();
      preferencesKeysCount = keys.length;

      const { value: histVal } = await Preferences.get({ key: 'IFH_HISTORY_V2' });
      if (histVal) {
        try {
          const parsed = JSON.parse(histVal);
          if (Array.isArray(parsed)) historyEntriesCount = parsed.length;
        } catch {}
      }

      const { value: sigVal } = await Preferences.get({ key: 'IFH_SIGNATURE_TEMPLATES_V1' });
      if (sigVal) {
        try {
          const parsed = JSON.parse(sigVal);
          if (Array.isArray(parsed)) savedSignaturesCount = parsed.length;
        } catch {}
      }
    } catch {}

    // 2. Filesystem Cache
    try {
      if (Capacitor.isNativePlatform()) {
        const files = await Filesystem.readdir({
          path: '',
          directory: Directory.Cache
        });
        cachedFilesCount = files.files.length;
        for (const f of files.files) {
          cachedFilesSizeBytes += (f.size || 0);
        }
      }
    } catch {}

    // 3. IndexedDB
    try {
      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        indexedDbDatabasesCount = dbs.length;
      }
    } catch {}

    const totalItemsCount =
      historyEntriesCount +
      savedSignaturesCount +
      preferencesKeysCount +
      cachedFilesCount +
      indexedDbDatabasesCount;

    const sizeMb = (cachedFilesSizeBytes / (1024 * 1024)).toFixed(1);
    const formattedSummary = `${cachedFilesCount} cached files (${sizeMb} MB), ${historyEntriesCount} history entries, ${savedSignaturesCount} saved signatures, ${preferencesKeysCount} settings entries.`;

    return {
      cachedFilesCount,
      cachedFilesSizeBytes,
      historyEntriesCount,
      savedSignaturesCount,
      preferencesKeysCount,
      indexedDbDatabasesCount,
      totalItemsCount,
      formattedSummary
    };
  }

  /**
   * One-tap immediate purge of all local storage:
   * - IndexedDB databases (PDF cache, document storage).
   * - Capacitor Preferences / LocalStorage (recent files, signatures, settings).
   * - Temporary files in Capacitor Filesystem cache directory.
   * Completely resets app security lock to default unlocked state.
   */
  async panicClear(): Promise<void> {
    // 1. Purge Capacitor Preferences
    try {
      await Preferences.clear();
    } catch (e) {
      console.warn('PanicClear: Preferences.clear failed:', e);
    }

    // 2. Purge LocalStorage & SessionStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch (e) {
      console.warn('PanicClear: LocalStorage clear failed:', e);
    }

    // 3. Purge IndexedDB databases
    try {
      if (typeof indexedDB !== 'undefined') {
        if (typeof indexedDB.databases === 'function') {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              indexedDB.deleteDatabase(db.name);
            }
          }
        }

        // Known named databases in the app
        const knownDbs = ['keyval-store', 'IFH_CACHE', 'pdf_cache', 'pdf_storage', 'tesseract'];
        for (const name of knownDbs) {
          indexedDB.deleteDatabase(name);
        }
      }
    } catch (e) {
      console.warn('PanicClear: IndexedDB clear failed:', e);
    }

    // 4. Purge Filesystem Cache
    try {
      await this.clearTempCache();
    } catch (e) {
      console.warn('PanicClear: Filesystem cache clear failed:', e);
    }

    // 5. Securely wipe in-memory sensitive buffers and clear bridged documents
    try {
      this.zeroOutSensitiveMemory();
      this.documentBridge?.clearAll();
    } catch (e) {
      console.warn('PanicClear: Memory wipe failed:', e);
    }

    // 6. Reset security service state to defaults
    this.configSubject.next({ ...DEFAULT_CONFIG });
    this.unlockAll();
  }

  // --- PRIVATE HELPERS & LIFECYCLE ---

  private async saveConfig(config: AppLockConfig): Promise<void> {
    this.configSubject.next(config);
    try {
      await Preferences.set({
        key: SECURITY_LOCK_CONFIG_KEY,
        value: JSON.stringify(config)
      });
    } catch (e) {
      console.error('AppSecurityLockService: Failed to persist lock config:', e);
    }
  }

  private setupLifecycleListeners(): void {
    // Listen to Capacitor App state changes
    try {
      App.addListener('appStateChange', ({ isActive }) => {
        this.handleAppStateChange(isActive);
      });
    } catch {}

    // Listen to Web visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.handleAppStateChange(document.visibilityState === 'visible');
      });
    }
  }

  handleAppStateChange(isActive: boolean): void {
    const config = this.currentConfig;
    if (!config.enabled && !config.autoClearCacheOnExit) return;

    if (!isActive) {
      // Backgrounded
      this.lastBackgroundTimestamp = Date.now();

      if (config.autoClearCacheOnExit) {
        this.clearTempCache().catch(() => {});
      }

      if (config.enabled && config.autoLockTimeout === 'immediate') {
        this.lock();
      }
    } else if (config.enabled) {
      // Foregrounded
      const elapsed = Date.now() - this.lastBackgroundTimestamp;

      if (config.autoLockTimeout === '1min' && elapsed >= 60000) {
        this.lock();
      } else if (config.autoLockTimeout === '5min' && elapsed >= 300000) {
        this.lock();
      }
    }
  }
}
