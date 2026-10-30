export type SigningWorkflowMode = 'sequential' | 'parallel';

export type SignerStatus = 'pending' | 'signed' | 'declined';

export interface PacketSigner {
  id: string;
  name: string;
  emailOrPhone: string;
  role: string;
  orderIndex: number;
  assignedFieldIds: string[];
  status: SignerStatus;
  signedAt?: string;
  signatureDataUrl?: string;
}

export interface SigningAuditTrailEntry {
  timestamp: string;
  signerId: string;
  signerName: string;
  action: 'packet_created' | 'signed' | 'declined' | 'packet_completed';
  details?: string;
}

export interface SigningPacketManifest {
  manifestVersion: string;
  packetId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workflowMode: SigningWorkflowMode;
  baseDocumentHash: string;
  expectedIntegrityToken: string;
  signers: PacketSigner[];
  auditTrail: SigningAuditTrailEntry[];
}

export interface SigningPacketStatusReport {
  isPacket: boolean;
  isTampered: boolean;
  manifest: SigningPacketManifest | null;
  totalSigners: number;
  completedSigners: number;
  pendingSigners: number;
  currentSigner: PacketSigner | null;
  isCompleted: boolean;
  outstandingFieldIds: string[];
  tamperReason?: string;
}

export interface SignFieldExecutionData {
  fieldId: string;
  value?: string;
  signatureDataUrl?: string;
}
