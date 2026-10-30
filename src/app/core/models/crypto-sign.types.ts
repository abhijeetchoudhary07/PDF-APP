export interface X509CertificateInfo {
  commonName: string;
  organization: string;
  issuer: string;
  validityNotBefore: string;
  validityNotAfter: string;
  serialNumber: string;
  isValid: boolean;
  isExpired: boolean;
  fingerprintSha256: string;
  keySize?: number;
}

export interface UnlockedP12Data {
  certInfo: X509CertificateInfo;
  certificate: any;
  privateKey: any;
  certChain: any[];
}

export interface VisualStampOptions {
  signerName: string;
  title?: string;
  organization?: string;
  reason?: string;
  location?: string;
  timestamp?: string;
  signatureDataUrl?: string;
}

export interface CryptoSignOptions {
  reason?: string;
  location?: string;
  contactInfo?: string;
  includeVisualStamp?: boolean;
  stampPage?: number; // 1-based page index
  stampRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visualStamp?: VisualStampOptions;
  allowExpiredCert?: boolean; // Honesty gate override for testing
}

export interface CreateCertOptions {
  keySize?: 2048 | 4096;
  daysValid?: number;
  isExpired?: boolean;
  issuerCommonName?: string;
  organization?: string;
}

export interface CryptoSignResult {
  signedPdfBytes: Uint8Array;
  byteRange: [number, number, number, number];
  documentDigestSha256: string;
  signatureHexLength: number;
  signerCommonName: string;
  signedAt: string;
  verificationPassed: boolean;
}

export interface CryptoSignVerificationReport {
  isValid: boolean;
  hasSignature: boolean;
  byteRange: [number, number, number, number] | null;
  expectedDigest: string;
  actualDigest: string;
  signerInfo?: {
    commonName: string;
    organization?: string;
    issuer?: string;
    signingTime?: string;
    isExpired?: boolean;
    validityNotBefore?: string;
    validityNotAfter?: string;
  };
  warnings?: string[];
  error?: string;
}
