export type ComplexityBand = 'easy' | 'moderate' | 'dense';

export interface DocumentStatistics {
  wordCount: number;
  characterCount: number;
  characterCountNoSpaces: number;
  sentenceCount: number;
  syllableCount: number;
  complexWordCount: number; // Words with 3 or more syllables
  averageWordsPerSentence: number;
  averageSyllablesPerWord: number;
}

export interface EstimatedTimes {
  readingTimeMinutes: number; // Based on 200 wpm
  readingTimeSeconds: number;
  readingTimeFormatted: string; // e.g. "4 min read"
  speakingTimeMinutes: number; // Based on 130 wpm
  speakingTimeSeconds: number;
  speakingTimeFormatted: string; // e.g. "6 min talk"
}

export interface ReadabilityScores {
  fleschReadingEase: number; // 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  fleschKincaidGradeLevel: number; // 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  gunningFogIndex: number; // 0.4 * ((words/sentences) + 100 * (complexWords/words))
  complexityBand: ComplexityBand;
  complexityBandLabel: string;
}

export interface SectionReadability {
  sectionId: string;
  title: string;
  pageNumber?: number;
  statistics: DocumentStatistics;
  estimatedTimes: EstimatedTimes;
  scores: ReadabilityScores;
  textExcerpt?: string;
}

export interface FormulaExplanation {
  formula: string;
  name: string;
  description: string;
  interpretation: string;
  range: string;
}

export interface ReadabilityReport {
  fileName?: string;
  analyzedAt: string;
  overallStatistics: DocumentStatistics;
  overallTimes: EstimatedTimes;
  overallScores: ReadabilityScores;
  sections: SectionReadability[];
  formulaExplanations: FormulaExplanation[];
}
