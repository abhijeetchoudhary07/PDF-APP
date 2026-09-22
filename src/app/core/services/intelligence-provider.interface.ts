import { SupportedLanguage } from '../i18n/i18n.types';
import {
  DocumentAnalysis,
  DocumentSummary,
  DocumentQaAnswer
} from '../models/pdf-intelligence.types';

/**
 * Universal interface for document intelligence providers (Local or Remote AI).
 * Ensures the UI and application layer do not depend directly on any single AI vendor.
 */
export interface IntelligenceProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;

  summarize(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentSummary | Promise<DocumentSummary>;

  translate(
    text: string,
    targetLanguage: SupportedLanguage
  ): string | Promise<string>;

  answer(
    question: string,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentQaAnswer | Promise<DocumentQaAnswer>;

  extractKeyPoints(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): string[] | Promise<string[]>;
}

export interface IntelligenceTranslationScope {
  scope: 'summary' | 'full' | 'pages' | 'custom';
  pageNumbers?: number[];
  customText?: string;
}
