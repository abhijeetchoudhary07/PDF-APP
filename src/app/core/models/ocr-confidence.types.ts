export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface ConfidenceBbox {
  x: number;
  y: number;
  width: number;
  height: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ConfidenceWord {
  id: string;
  text: string;
  originalText: string;
  confidence: number; // 0 - 100
  tier: ConfidenceTier;
  bbox: ConfidenceBbox;
  pageNumber: number;
  cropDataUrl?: string;
  isCorrected?: boolean;
  isReviewed?: boolean;
  suggestedReplacements?: string[];
}

export interface ConfidenceStats {
  totalWords: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  highPercentage: number;
  mediumPercentage: number;
  lowPercentage: number;
  averageConfidence: number;
}

export interface DictionaryEntry {
  id: string;
  target: string;
  replacement: string;
  matchCase?: boolean;
  isWholeWord?: boolean;
  isRegex?: boolean;
  createdAt: number;
  hitCount?: number;
}

export interface ConfidencePageResult {
  pageNumber: number;
  canvasDataUrl: string;
  width: number;
  height: number;
  words: ConfidenceWord[];
  stats: ConfidenceStats;
  text: string;
}

export interface ConfidenceDocumentResult {
  fileName: string;
  totalPages: number;
  pages: ConfidencePageResult[];
  overallStats: ConfidenceStats;
  fullText: string;
  allWords: ConfidenceWord[];
  lowConfidenceWords: ConfidenceWord[];
}
