export interface PdfSecurityPermissions {
  allowPrinting: 'none' | 'low-resolution' | 'high-resolution';
  allowModifying: boolean; // edit document contents
  allowCopying: boolean; // copy or extract text and graphics
  allowAnnotating: boolean; // add/modify comments and form fields
  allowFillingForms: boolean; // fill existing form fields
  allowContentAccessibility: boolean; // screen readers
  allowDocumentAssembly: boolean; // insert, rotate, delete pages
}

export type EncryptionStandard = 'aes-256' | 'aes-128' | 'rc4-128';

export interface PdfProtectionConfig {
  userPassword?: string; // Required to open the PDF
  ownerPassword?: string; // Required to change permissions or decrypt
  permissions: PdfSecurityPermissions;
  encryptionLevel?: '128-bit-standard' | '256-bit-aes' | '128-bit-aes' | 'aes-256' | 'aes-128' | 'rc4-128';
  docId?: Uint8Array; // Optional deterministic 16-byte document ID for test vectors
  fileKey?: Uint8Array; // Optional deterministic FEK for test vectors
  sourcePassword?: string; // Existing password if source PDF is pre-encrypted
}

export interface PdfSecurityStatus {
  isEncrypted: boolean;
  requiresUserPassword: boolean;
  hasPermissionsRestricted: boolean;
  permissions?: Partial<PdfSecurityPermissions>;
  encryptionFilter?: string;
  encryptionStandard?: EncryptionStandard | 'unknown';
  error?: string;
}

export const DEFAULT_PERMISSIONS: PdfSecurityPermissions = {
  allowPrinting: 'high-resolution',
  allowModifying: true,
  allowCopying: true,
  allowAnnotating: true,
  allowFillingForms: true,
  allowContentAccessibility: true,
  allowDocumentAssembly: true
};

export type BatchSecurityMode = 'protect' | 'unlock';

export type BatchItemStatus = 'ready' | 'processing' | 'success' | 'failed' | 'skipped';

export interface BatchSecurityQueueItem {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  pageCount?: number;
  status: BatchItemStatus;
  statusMessage?: string;
  isEncrypted?: boolean;
  password?: string; // Optional per-file password override
  resultFile?: File;
  resultSizeBytes?: number;
  error?: string;
}

export interface BatchProtectOptions {
  standard: EncryptionStandard;
  userPassword: string;
  ownerPassword?: string;
  permissions?: PdfSecurityPermissions;
}

export interface BatchUnlockOptions {
  masterPassword?: string;
  perFilePasswords?: Record<string, string>; // item id -> password
}

export interface BatchSecurityProgress {
  total: number;
  completed: number;
  currentIndex: number;
  currentFileName: string;
  successCount: number;
  failureCount: number;
}

export interface BatchSecuritySummary {
  mode: BatchSecurityMode;
  total: number;
  successCount: number;
  failureCount: number;
  items: BatchSecurityQueueItem[];
  zipBlob?: Blob;
  zipFileName?: string;
}

