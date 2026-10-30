export type AccessibilityTagType =
  | 'Document'
  | 'Part'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'P'
  | 'L'
  | 'LI'
  | 'LBody'
  | 'Table'
  | 'TR'
  | 'TD'
  | 'TH'
  | 'Figure'
  | 'Artifact';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadingBlock {
  id: string;
  pageNumber: number;
  orderIndex: number;
  tag: AccessibilityTagType;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  isArtifact?: boolean;
  artifactType?: 'Header' | 'Footer' | 'Decorative' | 'Pagination';
  column?: number;
  fontSize?: number;
  isBold?: boolean;
  altText?: string;
  tableData?: {
    rows: number;
    cols: number;
    cells: string[][];
  };
}

export interface AccessibleImageItem {
  id: string;
  pageNumber: number;
  indexOnPage: number;
  name: string;
  bbox: BoundingBox;
  altText: string;
  ocrSuggestion?: string;
  hasUserAltText: boolean;
  thumbnailDataUrl?: string;
  isDecorative?: boolean;
}

export interface StructureInferenceNotice {
  severity: 'info' | 'warning';
  pageNumber: number;
  message: string;
  blockId?: string;
}

export interface PageAccessibilityData {
  pageNumber: number;
  width: number;
  height: number;
  blocks: ReadingBlock[];
  images: AccessibleImageItem[];
  notices: StructureInferenceNotice[];
  hasMultiColumn: boolean;
}

export interface AccessibilityAuditReport {
  fileName: string;
  pageCount: number;
  totalBlocks: number;
  totalImages: number;
  imagesWithAltText: number;
  inferredHeadingsCount: number;
  inferredParagraphsCount: number;
  inferredListsCount: number;
  inferredTablesCount: number;
  artifactsCount: number;
  unconfidentInferences: StructureInferenceNotice[];
  honestyStatement: string;
  isTagged: boolean;
  hasRoleMap: boolean;
  hasParentTree: boolean;
}

export interface TaggedPdfGenerationOptions {
  fileName: string;
  documentTitle?: string;
  language?: string; // e.g. 'en-US' or 'hi-IN'
  pages: PageAccessibilityData[];
  markArtifacts?: boolean;
}
