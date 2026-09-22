import { Injectable } from '@angular/core';
import { IntelligenceProvider } from './intelligence-provider.interface';
import { SupportedLanguage } from '../i18n/i18n.types';
import {
  DocumentAnalysis,
  DocumentSummary,
  DocumentQaAnswer,
  DocumentQaCitation,
  DocumentKeyword,
  SectionSummaryItem
} from '../models/pdf-intelligence.types';

// Stop words list for scoring and token extraction
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'shall', 'may', 'might', 'must', 'page'
]);

// Offline domain lexicon for Indian official documents & forms
const INDIAN_LANGUAGE_LEXICON: Record<SupportedLanguage, Record<string, string>> = {
  en: {},
  hi: {
    'summary': 'सारांश',
    'document': 'दस्तावेज़',
    'overview': 'अवलोकन',
    'key points': 'मुख्य बिंदु',
    'conclusion': 'निष्कर्ष',
    'page': 'पृष्ठ',
    'section': 'अनुभाग',
    'application': 'आवेदन',
    'candidate': 'उम्मीदवार',
    'date': 'तारीख',
    'name': 'नाम',
    'eligibility': 'पात्रता',
    'criteria': 'मानदंड',
    'rules': 'नियम',
    'details': 'विवरण',
    'certificate': 'प्रमाणपत्र',
    'verification': 'सत्यापन',
    'official': 'आधिकारिक',
    'government': 'सरकार',
    'requirements': 'आवश्यकताएं',
    'important': 'महत्वपूर्ण',
    'instructions': 'निर्देश'
  },
  mr: {
    'summary': 'सारांश',
    'document': 'दस्तऐवज',
    'overview': 'आढावा',
    'key points': 'महत्त्वाचे मुद्दे',
    'conclusion': 'निष्कर्ष',
    'page': 'पान',
    'section': 'विभाग',
    'application': 'अर्ज',
    'candidate': 'उमेदवार',
    'date': 'दिनांक',
    'name': 'नाव',
    'eligibility': 'पात्रता',
    'criteria': 'निकष',
    'rules': 'नियम',
    'details': 'तपशील',
    'certificate': 'प्रमाणपत्र',
    'verification': 'पडताळणी',
    'official': 'अधिकृत',
    'government': 'शासन',
    'requirements': 'आवश्यकता',
    'important': 'महत्त्वाचे',
    'instructions': 'सूचना'
  },
  bn: {
    'summary': 'সারসংক্ষেপ',
    'document': 'নথি',
    'overview': 'সংক্ষিপ্ত বিবরণ',
    'key points': 'মূল বিষয়সমূহ',
    'conclusion': 'উপসংহার',
    'page': 'পৃষ্ঠা',
    'section': 'অনুচ্ছেদ',
    'application': 'আবেদন',
    'candidate': 'প্রার্থী',
    'date': 'তারিখ',
    'name': 'নাম',
    'eligibility': 'যোগ্যতা',
    'criteria': 'মানদণ্ড',
    'rules': 'নিয়মাবলী',
    'details': 'বিবরণ',
    'certificate': 'শংসাপত্র',
    'verification': 'যাচাইকরণ',
    'official': 'সরকারী',
    'government': 'সরকার',
    'requirements': 'প্রয়োজনীয়তা',
    'important': 'গুরুত্বপূর্ণ',
    'instructions': 'নির্দেশনা'
  },
  pa: {
    'summary': 'ਸੰਖੇਪ',
    'document': 'ਦਸਤਾਵੇਜ਼',
    'overview': 'ਸੰਖੇਪ ਜਾਣਕਾਰੀ',
    'key points': 'ਮੁੱਖ ਨੁਕਤੇ',
    'conclusion': 'ਸਿੱਟਾ',
    'page': 'ਪੰਨਾ',
    'section': 'ਭਾਗ',
    'application': 'ਅਰਜ਼ੀ',
    'candidate': 'ਉਮੀਦਵਾਰ',
    'date': 'ਮਿਤੀ',
    'name': 'ਨਾਮ',
    'eligibility': 'ਯੋਗਤਾ',
    'criteria': 'ਮਾਪਦੰਡ',
    'rules': 'ਨਿਯਮ',
    'details': 'ਵੇਰਵੇ',
    'certificate': 'ਸਰਟੀਫਿਕੇਟ',
    'verification': 'ਪੜਤਾਲ',
    'official': 'ਅਧਿਕਾਰਤ',
    'government': 'ਸਰਕਾਰ',
    'requirements': 'ਲੋੜਾਂ',
    'important': 'ਮਹੱਤਵਪੂਰਨ',
    'instructions': 'ਹਦਾਇਤਾਂ'
  }
};

@Injectable({
  providedIn: 'root'
})
export class LocalIntelligenceProvider implements IntelligenceProvider {
  readonly name = 'Local On-Device Engine';

  async isAvailable(): Promise<boolean> {
    return true; // Always available 100% offline
  }

  summarize(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentSummary {
    const fullText = pageTexts.map(p => p.text).join('\n');
    const sentences = this.extractSentences(fullText);

    if (!analysis.isExtractionReliable || sentences.length === 0) {
      return {
        quickSummary: 'Document text is limited or scanned. Full summarization requires OCR text recognition.',
        detailedSummary: ['No digital text layer detected.'],
        keyPoints: ['Text extraction yielded minimal content.'],
        sectionSummaries: [],
        extractionQualityNotice: analysis.extractionNotice,
        modeUsed: 'local'
      };
    }

    const scoredSentences = this.scoreSentences(sentences, analysis.keywords);

    // Quick Summary (Top 2-3 sentences)
    const topSentences = scoredSentences.slice(0, Math.min(3, scoredSentences.length))
      .map(s => s.sentence);
    const quickSummary = topSentences.join(' ');

    // Detailed Summary (Top 6 sentences sorted in reading order)
    const detailedCount = Math.min(6, scoredSentences.length);
    const detailedSummary = scoredSentences.slice(0, detailedCount)
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map(s => s.sentence);

    // Key points
    const keyPoints = scoredSentences.slice(0, Math.min(5, scoredSentences.length))
      .map(s => s.sentence);

    // Section Summaries
    const sectionSummaries: SectionSummaryItem[] = analysis.sections.map(sec => {
      const secSentences = this.extractSentences(sec.content);
      const secScored = this.scoreSentences(secSentences, analysis.keywords);
      const summaryText = secScored.length > 0
        ? secScored[0].sentence
        : sec.content.substring(0, 150) + '...';

      return {
        sectionTitle: sec.title,
        pageNumber: sec.pageNumber,
        summary: summaryText
      };
    });

    return {
      quickSummary,
      detailedSummary,
      keyPoints,
      sectionSummaries,
      extractionQualityNotice: analysis.extractionNotice,
      modeUsed: 'local'
    };
  }

  extractKeyPoints(
    analysis: DocumentAnalysis,
    pageTexts: { pageNumber: number; text: string }[]
  ): string[] {
    const fullText = pageTexts.map(p => p.text).join('\n');
    const sentences = this.extractSentences(fullText);
    const scored = this.scoreSentences(sentences, analysis.keywords);
    return scored.slice(0, 5).map(s => s.sentence);
  }

  translate(text: string, targetLanguage: SupportedLanguage): string {
    if (targetLanguage === 'en' || !text) {
      return text;
    }

    const dict = INDIAN_LANGUAGE_LEXICON[targetLanguage] || {};
    let translated = text;

    Object.entries(dict).forEach(([engWord, targetWord]) => {
      const regex = new RegExp(`\\b${engWord}\\b`, 'gi');
      translated = translated.replace(regex, targetWord);
    });

    return translated;
  }

  answer(
    question: string,
    pageTexts: { pageNumber: number; text: string }[]
  ): DocumentQaAnswer {
    if (!question || question.trim().length === 0) {
      return {
        question,
        answer: 'Please enter a question to ask about this document.',
        citations: [],
        groundedInDocument: false,
        modeUsed: 'local'
      };
    }

    // Chunk into passages with page metadata
    const passages: { pageNumber: number; text: string }[] = [];
    pageTexts.forEach(page => {
      const sentences = this.extractSentences(page.text || '');
      for (let i = 0; i < sentences.length; i += 2) {
        const chunk = sentences.slice(i, i + 3).join(' ');
        if (chunk.trim().length > 20) {
          passages.push({ pageNumber: page.pageNumber, text: chunk });
        }
      }
    });

    if (passages.length === 0) {
      return {
        question,
        answer: 'This document contains no readable text to answer your question.',
        citations: [],
        groundedInDocument: false,
        modeUsed: 'local'
      };
    }

    // Tokenize question
    const qTokens = question.toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/g, ''))
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));

    const scoredPassages = passages.map(p => {
      let matchCount = 0;
      const lower = p.text.toLowerCase();
      qTokens.forEach(token => {
        if (lower.includes(token)) {
          matchCount++;
        }
      });
      const score = qTokens.length > 0 ? matchCount / qTokens.length : 0;
      return { ...p, score };
    }).sort((a, b) => b.score - a.score);

    const topPassage = scoredPassages[0];
    if (!topPassage || topPassage.score === 0) {
      return {
        question,
        answer: 'The document does not appear to contain information directly answering this question.',
        citations: [],
        groundedInDocument: false,
        modeUsed: 'local'
      };
    }

    const citations: DocumentQaCitation[] = scoredPassages
      .filter(p => p.score > 0.2)
      .slice(0, 3)
      .map(p => ({
        pageNumber: p.pageNumber,
        passageSnippet: p.text.length > 180 ? p.text.substring(0, 177) + '...' : p.text,
        confidence: Math.min(98, Math.round(p.score * 100))
      }));

    return {
      question,
      answer: `Based on Page ${topPassage.pageNumber}: "${topPassage.text}"`,
      citations,
      groundedInDocument: true,
      modeUsed: 'local'
    };
  }

  // --- Helper Methods ---
  public extractSentences(text: string): string[] {
    if (!text) return [];
    return text
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .split(/(?<=[.?!])\s+(?=[A-Z0-9\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F])/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && s.split(/\s+/).length >= 5);
  }

  public scoreSentences(
    sentences: string[],
    keywords: DocumentKeyword[]
  ): { sentence: string; score: number; originalIndex: number }[] {
    const keywordMap = new Map(keywords.map(k => [k.word, k.count]));

    return sentences.map((sentence, idx) => {
      let score = 0;
      const words = sentence.toLowerCase().split(/\s+/);

      words.forEach(w => {
        const clean = w.replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/g, '');
        if (keywordMap.has(clean)) {
          score += keywordMap.get(clean)!;
        }
      });

      const normalizedScore = score / Math.max(1, words.length);
      const positionBoost = idx === 0 ? 1.4 : idx < 3 ? 1.2 : 1.0;

      return {
        sentence,
        score: normalizedScore * positionBoost,
        originalIndex: idx
      };
    }).sort((a, b) => b.score - a.score);
  }
}
