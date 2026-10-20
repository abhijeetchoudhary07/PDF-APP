export interface SignatureFieldReport {
  fieldName: string;
  signerName: string;
  claimedSigningTime?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  filter?: string;
  subFilter?: string;
  byteRange: number[]; // [offset1, length1, offset2, length2]
  isWholeFileCovered: boolean;
  hasAppendedBytes: boolean;
  appendedByteCount: number;
  totalFileLength: number;
  signedByteCoverageRatio: number;
}

export interface DocumentSignatureReport {
  fileName: string;
  fileSizeBytes: number;
  signaturesFound: number;
  hasSignatures: boolean;
  signatures: SignatureFieldReport[];
  overallCoverageSummary: string;
  hasAppendedRevisions: boolean;
  offlineNotice: string;
}
