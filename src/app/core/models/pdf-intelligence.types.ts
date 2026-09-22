import { SupportedLanguage } from '../i18n/i18n.types';

export type IntelligenceMode = 'local' | 'ai-assisted';

export interface DocumentHeading {
  text: string;
  level: number;
  pageNumber: number;
}

export interface DocumentSection {
  title: string;
  pageNumber: number;
  content: string;
  wordCount: number;
}

export interface DocumentKeyword {
  word: string;
  count: number;
  score: number;
}

export interface DocumentAnalysis {
  wordCount: number;
  charCount: number;
  pageCount: number;
  detectedLanguage: string;
  readingTimeMinutes: number;
  headings: DocumentHeading[];
  paragraphs: string[];
  keywords: DocumentKeyword[];
  sections: DocumentSection[];
  isExtractionReliable: boolean;
  extractionNotice?: string;
}

export interface SectionSummaryItem {
  sectionTitle: string;
  summary: string;
  pageNumber: number;
}

export interface DocumentSummary {
  quickSummary: string;
  detailedSummary: string[];
  keyPoints: string[];
  sectionSummaries: SectionSummaryItem[];
  extractionQualityNotice?: string;
  modeUsed: IntelligenceMode;
}

export interface DocumentQaCitation {
  pageNumber: number;
  passageSnippet: string;
  confidence: number;
}

export interface DocumentQaAnswer {
  question: string;
  answer: string;
  citations: DocumentQaCitation[];
  groundedInDocument: boolean;
  modeUsed: IntelligenceMode;
}

export interface DocumentTranslationResult {
  sourceLanguage: string;
  targetLanguage: SupportedLanguage;
  translatedText: string;
  translatedPages?: { pageNumber: number; text: string }[];
  translatedSummary?: string;
  modeUsed: IntelligenceMode;
}

export interface AiProviderConfig {
  providerName: 'local' | 'openai' | 'gemini' | 'custom';
  apiKey?: string;
  endpoint?: string;
  model?: string;
  userAcceptedDisclosure: boolean;
}
