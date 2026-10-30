export type AutoLockTimeout = 'immediate' | '1min' | '5min';

export interface AppLockConfig {
  enabled: boolean;
  biometricEnabled: boolean;
  lockAppOnLaunch: boolean;
  lockVaultOnly: boolean;
  autoLockTimeout: AutoLockTimeout;
  autoClearCacheOnExit: boolean;
  pinHash?: string;
  pinSalt?: string;
  failedAttempts?: number;
  lockedUntilTimestamp?: number;
}

export interface PanicClearBreakdown {
  cachedFilesCount: number;
  cachedFilesSizeBytes: number;
  historyEntriesCount: number;
  savedSignaturesCount: number;
  preferencesKeysCount: number;
  indexedDbDatabasesCount: number;
  totalItemsCount: number;
  formattedSummary: string;
}

export interface PinVerificationResult {
  success: boolean;
  attemptsRemaining: number;
  lockedUntil?: Date;
  errorMessage?: string;
}

export interface LockStatus {
  isLocked: boolean;
  isVaultLocked: boolean;
  requiresPinSetup: boolean;
  hasBiometricSupport: boolean;
}
