export const LEGAL_DISCLAIMER = 'Information extraction only. This tool finds text patterns and does not provide legal advice.';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
}

export type EntityType = 'date' | 'amount' | 'party' | 'deadline' | 'reference';

export interface ExtractedEntity {
  id: string;
  type: EntityType;
  label: string;
  value: string;
  normalizedValue?: string | number;
  pageNumber: number;
  boundingBox: BoundingBox;
  confidence: number; // 0 - 100
  contextSentence?: string;
}

export type ClauseCategory = 'obligation' | 'deadline' | 'penalty' | 'right';

export interface ExtractedClause {
  id: string;
  category: ClauseCategory;
  categoryLabel: string;
  text: string;
  modalMarkers: string[];
  pageNumber: number;
  boundingBox: BoundingBox;
  confidence: number; // 0 - 100
}

export interface ExtractedWordToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  confidence?: number;
}

export interface EntityClauseSummary {
  totalEntities: number;
  totalClauses: number;
  amountsCount: number;
  datesDeadlinesCount: number;
  partiesCount: number;
  clausesCount: number;
}

export interface EntityClauseExtractionResult {
  entities: ExtractedEntity[];
  clauses: ExtractedClause[];
  pageCount: number;
  rawText: string;
  summary: EntityClauseSummary;
  metadata: {
    fileName?: string;
    extractedAt: string;
    executionTimeMs: number;
    disclaimer: string;
  };
}

export type EntityClauseTab = 'amounts' | 'datesDeadlines' | 'parties' | 'clauses';

export interface EntityClauseExportJson {
  metadata: {
    fileName?: string;
    extractedAt: string;
    disclaimer: string;
    totalEntities: number;
    totalClauses: number;
  };
  summary: EntityClauseSummary;
  entities: ExtractedEntity[];
  clauses: ExtractedClause[];
}
