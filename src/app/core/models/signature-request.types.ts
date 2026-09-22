export type RecipientRole = 'signer' | 'approver' | 'cc';

export type RecipientStatus = 'waiting' | 'sent' | 'viewed' | 'signed' | 'declined';

export type SignatureRequestStatus =
  | 'draft'
  | 'pending_backend'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'expired';

export interface SignatureRecipient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: RecipientRole;
  signingOrder: number;
  status: RecipientStatus;
  color: string; // color tag for field visual assignment
  signedAt?: number;
}

export interface SignatureRequestField {
  id: string;
  recipientId: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  pageNumber: number; // 1-indexed
  x: number; // PDF points
  y: number; // PDF points
  width: number;
  height: number;
  required: boolean;
  label?: string;
  value?: string;
}

export interface AuditTrailEvent {
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  ipAddress?: string;
  details?: string;
}

export interface SignatureRequest {
  id: string;
  title: string;
  documentName: string;
  documentSizeBytes: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  status: SignatureRequestStatus;
  recipients: SignatureRecipient[];
  fields: SignatureRequestField[];
  message?: string;
  expiresAt?: number;
  auditTrail: AuditTrailEvent[];
  backendConfig?: {
    isBackendConnected: boolean;
    providerName?: string;
    endpoint?: string;
    webhookUrl?: string;
  };
}
