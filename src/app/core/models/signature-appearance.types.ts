export type SignatureLayoutPreset = 'standard-horizontal' | 'compact-stacked' | 'formal-seal';

export type TypedSignatureFont =
  | 'Caveat'
  | 'Dancing Script'
  | 'Alex Brush'
  | 'Great Vibes'
  | 'Sacramento';

export type SignatureInkColor =
  | '#000000' // Black
  | '#1e3a8a' // Dark Blue
  | '#0a2540' // Royal Navy
  | '#881337' // Dark Red
  | '#14532d'; // Dark Green

export interface SignatureMetadataBlock {
  reason?: string;
  location?: string;
  timestamp?: string;
  includeTimestamp: boolean;
  includeReason: boolean;
  includeLocation: boolean;
  includeTimezone: boolean;
}

export interface SignatureSignerDetails {
  fullName: string;
  titleOrRole?: string;
  organization?: string;
}

export interface SignatureAppearanceOptions {
  id?: string;
  name?: string;
  signatureImage?: string; // dataUrl of drawn, typed, or uploaded signature
  signatureSource: 'draw' | 'type' | 'upload';
  typedFont?: TypedSignatureFont;
  inkColor?: SignatureInkColor;
  signer: SignatureSignerDetails;
  metadata: SignatureMetadataBlock;
  layoutPreset: SignatureLayoutPreset;
  includeInitialsBadge: boolean;
  includeLogo: boolean;
  logoDataUrl?: string;
  borderColor?: string;
}

export interface SignatureAppearanceTemplate extends SignatureAppearanceOptions {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface StampLayoutGeometry {
  totalWidth: number;
  totalHeight: number;
  signatureBox: { x: number; y: number; width: number; height: number };
  initialsBadgeBox?: { cx: number; cy: number; radius: number; initials: string };
  logoBox?: { x: number; y: number; width: number; height: number };
  signerDetailsBox: { x: number; y: number; width: number; height: number };
  metadataBox: { x: number; y: number; width: number; height: number };
  sealBorder?: { x: number; y: number; width: number; height: number; borderWidth: number };
  textLines: Array<{
    text: string;
    x: number;
    y: number;
    font: string;
    color: string;
    isBold?: boolean;
  }>;
}

export interface StampRenderResult {
  dataUrl: string;
  width: number;
  height: number;
  layout: StampLayoutGeometry;
}
