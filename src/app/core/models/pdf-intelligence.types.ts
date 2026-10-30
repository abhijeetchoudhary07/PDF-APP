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

// ============================================================================
// MULTI-DOCUMENT Q&A & BM25 SEARCH ENGINE MODELS
// ============================================================================

export interface MultiDocIndexedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  enabled: boolean;
  pages: { pageNumber: number; text: string }[];
}

export interface MultiDocParagraphChunk {
  id: string;
  documentId: string;
  fileName: string;
  pageNumber: number;
  paragraphIndex: number;
  text: string;
  wordCount: number;
  tokens: string[];
  termFrequencies: Map<string, number>;
}

export interface MultiDocCitation {
  documentId: string;
  fileName: string;
  pageNumber: number;
  paragraphIndex: number;
  snippet: string;
  confidence: number;
  formattedCitation: string; // e.g. "[Policy_2026.pdf, Page 4]"
}

export interface MultiDocSearchScopeItem {
  documentId: string;
  fileName: string;
  isRelevant: boolean;
  hitCount: number;
}

export interface MultiDocQaSearchScope {
  searchedDocumentCount: number;
  totalLoadedDocumentCount: number;
  searchedDocuments: MultiDocSearchScopeItem[];
  relevantDocuments: string[]; // file names with >0 relevance hits
  irrelevantDocuments: string[]; // file names with 0 relevance hits
}

export interface MultiDocQaAnswer {
  question: string;
  answer: string;
  isAnswerable: boolean;
  citations: MultiDocCitation[];
  searchScope: MultiDocQaSearchScope;
  topPassageText?: string;
  timestamp: number;
  modeUsed?: IntelligenceMode;
}

export interface MultiDocChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  answerData?: MultiDocQaAnswer;
}

// ============================================================================
// TRANSLATION READER & DUAL-PANE SYNCHRONIZATION MODELS
// ============================================================================

export interface TranslationPageItem {
  pageNumber: number;
  originalText: string;
  translatedText: string;
  paragraphs: string[];
  translatedParagraphs: string[];
  headings: DocumentHeading[];
  charCountOriginal: number;
  charCountTranslated: number;
  expansionRatio: number; // e.g. 1.35 (+35% expansion)
}

export interface TranslationSession {
  fileName: string;
  pageCount: number;
  sourceLanguage: string;
  targetLanguage: SupportedLanguage;
  pages: TranslationPageItem[];
  executiveSummary: string;
  keyPoints: string[];
  modeUsed: IntelligenceMode;
  expansionSummary: {
    averageExpansionRate: number;
    originalTotalChars: number;
    translatedTotalChars: number;
  };
}

export interface ScrollLockPageBound {
  pageIndex: number;
  offsetTop: number;
  height: number;
}

export interface ScrollLockResult {
  targetScrollTop: number;
  pageIndex: number;
  intraPageRatio: number;
}

export interface TranslationExportDocxOptions {
  fileName: string;
  title?: string;
  targetLanguage: SupportedLanguage;
  sourceLanguage?: string;
  executiveSummary?: string;
  pages: TranslationPageItem[];
  includeSummary?: boolean;
}

export interface TranslationExportPdfOptions {
  fileName: string;
  title?: string;
  targetLanguage: SupportedLanguage;
  sourceLanguage?: string;
  executiveSummary?: string;
  pages: TranslationPageItem[];
  includeSummary?: boolean;
}
