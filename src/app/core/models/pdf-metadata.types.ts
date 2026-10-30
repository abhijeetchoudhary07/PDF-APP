export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfMetadataComparisonItem {
  fieldKey: keyof PdfMetadata;
  labelKey: string;
  originalValue: string;
  updatedValue: string;
  isModified: boolean;
}

export interface PdfMetadataInspectionResult {
  metadata: PdfMetadata;
  rawCreationDate?: string;
  rawModificationDate?: string;
  hasXmpStream: boolean;
  hasInfoDict: boolean;
  rawXmpXml?: string;
  pageCount: number;
  fileName: string;
  fileSizeBytes: number;
}

export interface ApplyMetadataOptions {
  preserveExistingIfEmpty?: boolean;
  updateModificationDate?: boolean;
}
