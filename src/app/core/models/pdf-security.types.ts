export interface PdfSecurityPermissions {
  allowPrinting: 'none' | 'low-resolution' | 'high-resolution';
  allowModifying: boolean; // edit document contents
  allowCopying: boolean; // copy or extract text and graphics
  allowAnnotating: boolean; // add/modify comments and form fields
  allowFillingForms: boolean; // fill existing form fields
  allowContentAccessibility: boolean; // screen readers
  allowDocumentAssembly: boolean; // insert, rotate, delete pages
}

export interface PdfProtectionConfig {
  userPassword?: string; // Required to open the PDF
  ownerPassword?: string; // Required to change permissions or decrypt
  permissions: PdfSecurityPermissions;
  encryptionLevel?: '128-bit-standard' | '256-bit-aes';
}

export interface PdfSecurityStatus {
  isEncrypted: boolean;
  requiresUserPassword: boolean;
  hasPermissionsRestricted: boolean;
  permissions?: Partial<PdfSecurityPermissions>;
  encryptionFilter?: string;
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
