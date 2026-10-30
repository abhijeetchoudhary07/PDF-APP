import { Injectable } from '@angular/core';
import {
  ComplexityBand,
  DocumentStatistics,
  EstimatedTimes,
  FormulaExplanation,
  ReadabilityReport,
  ReadabilityScores,
  SectionReadability
} from '../models/readability.types';

@Injectable({
  providedIn: 'root'
})
export class ReadabilityAnalysisService {
  readonly READING_WPM = 200; // Standard silent reading pace
  readonly SPEAKING_WPM = 130; // Speaking / presentation pace

  /**
   * Primary entry point: Computes document statistics, readability scores,
   * reading times, and complexity bands for the overall text and each section.
   */
  analyze(
    fullText: string,
    providedSections?: { id?: string; title?: string; text: string; pageNumber?: number }[],
    fileName?: string
  ): ReadabilityReport {
    const cleanText = fullText || '';

    // 1. Overall Document Metrics
    const overallStatistics = this.computeStatistics(cleanText);
    const overallTimes = this.computeEstimatedTimes(overallStatistics.wordCount);
    const overallScores = this.computeScores(overallStatistics);

    const safeFileName = this.sanitizeText(fileName);

    // 2. Section Breakdown
    const rawSections = providedSections && providedSections.length > 0
      ? providedSections
      : this.splitIntoSections(cleanText);

    const sections: SectionReadability[] = rawSections.map((sec, idx) => {
      const stats = this.computeStatistics(sec.text);
      const times = this.computeEstimatedTimes(stats.wordCount);
      const scores = this.computeScores(stats);
      const title = this.sanitizeText(sec.title || (sec.pageNumber ? `Page ${sec.pageNumber}` : `Section ${idx + 1}`));

      return {
        sectionId: sec.id || `section-${idx + 1}`,
        title,
        pageNumber: sec.pageNumber || idx + 1,
        statistics: stats,
        estimatedTimes: times,
        scores,
        textExcerpt: sec.text.trim().slice(0, 150) + (sec.text.length > 150 ? '...' : '')
      };
    });

    return {
      fileName: safeFileName,
      analyzedAt: new Date().toISOString(),
      overallStatistics,
      overallTimes,
      overallScores,
      sections,
      formulaExplanations: this.getFormulaExplanations()
    };
  }

  /**
   * Computes word, character, sentence, syllable, and complex word statistics.
   */
  computeStatistics(text: string): DocumentStatistics {
    const clean = text.trim();
    if (!clean) {
      return {
        wordCount: 0,
        characterCount: 0,
        characterCountNoSpaces: 0,
        sentenceCount: 0,
        syllableCount: 0,
        complexWordCount: 0,
        averageWordsPerSentence: 0,
        averageSyllablesPerWord: 0
      };
    }

    const words = this.extractWords(clean);
    const sentences = this.extractSentences(clean);

    if (words.length === 0) {
      return {
        wordCount: 0,
        characterCount: clean.length,
        characterCountNoSpaces: clean.replace(/\s+/g, '').length,
        sentenceCount: 0,
        syllableCount: 0,
        complexWordCount: 0,
        averageWordsPerSentence: 0,
        averageSyllablesPerWord: 0
      };
    }

    let syllableCount = 0;
    let complexWordCount = 0;

    for (const w of words) {
      const syl = this.countSyllablesInWord(w);
      syllableCount += syl;
      if (syl >= 3) {
        complexWordCount++;
      }
    }

    const wordCount = words.length;
    const sentenceCount = Math.max(1, sentences.length);
    const characterCount = clean.length;
    const characterCountNoSpaces = clean.replace(/\s+/g, '').length;

    const averageWordsPerSentence = wordCount > 0 ? wordCount / sentenceCount : 0;
    const averageSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

    return {
      wordCount,
      characterCount,
      characterCountNoSpaces,
      sentenceCount,
      syllableCount,
      complexWordCount,
      averageWordsPerSentence: Math.round(averageWordsPerSentence * 10) / 10,
      averageSyllablesPerWord: Math.round(averageSyllablesPerWord * 100) / 100
    };
  }

  /**
   * Computes silent reading time (200 wpm) and presentation/speaking time (130 wpm).
   */
  computeEstimatedTimes(wordCount: number): EstimatedTimes {
    if (wordCount <= 0) {
      return {
        readingTimeMinutes: 0,
        readingTimeSeconds: 0,
        readingTimeFormatted: '0 min read',
        speakingTimeMinutes: 0,
        speakingTimeSeconds: 0,
        speakingTimeFormatted: '0 min talk'
      };
    }

    // Reading time (200 wpm)
    const readingTimeMinutes = +(wordCount / this.READING_WPM).toFixed(2);
    const readingTimeSeconds = Math.round((wordCount / this.READING_WPM) * 60);
    const readingMinCeil = Math.ceil(wordCount / this.READING_WPM);
    const readingTimeFormatted = readingTimeMinutes < 1 ? '< 1 min read' : `${readingMinCeil} min read`;

    // Speaking time (130 wpm)
    const speakingTimeMinutes = +(wordCount / this.SPEAKING_WPM).toFixed(2);
    const speakingTimeSeconds = Math.round((wordCount / this.SPEAKING_WPM) * 60);
    const speakingMinCeil = Math.ceil(wordCount / this.SPEAKING_WPM);
    const speakingTimeFormatted = speakingTimeMinutes < 1 ? '< 1 min talk' : `${speakingMinCeil} min talk`;

    return {
      readingTimeMinutes,
      readingTimeSeconds,
      readingTimeFormatted,
      speakingTimeMinutes,
      speakingTimeSeconds,
      speakingTimeFormatted
    };
  }

  /**
   * Computes Flesch Reading Ease, Flesch-Kincaid Grade Level, Gunning Fog Index,
   * and maps to plain-language complexity bands.
   */
  computeScores(stats: DocumentStatistics): ReadabilityScores {
    if (stats.wordCount === 0) {
      return {
        fleschReadingEase: 100,
        fleschKincaidGradeLevel: 0,
        gunningFogIndex: 0,
        complexityBand: 'easy',
        complexityBandLabel: 'Easy / Conversational'
      };
    }

    const words = stats.wordCount;
    const sentences = Math.max(1, stats.sentenceCount);
    const syllables = stats.syllableCount;
    const complexWords = stats.complexWordCount;

    // Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
    const rawFlesch = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    const fleschReadingEase = isNaN(rawFlesch) ? 100 : Math.round(rawFlesch * 10) / 10;

    // Flesch-Kincaid Grade Level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    const rawGrade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
    const fleschKincaidGradeLevel = isNaN(rawGrade) ? 0 : Math.max(0, Math.round(rawGrade * 10) / 10);

    // Gunning Fog Index: 0.4 * ((words/sentences) + 100 * (complexWords/words))
    const rawFog = 0.4 * ((words / sentences) + 100 * (complexWords / words));
    const gunningFogIndex = isNaN(rawFog) ? 0 : Math.max(0, Math.round(rawFog * 10) / 10);

    const { band, label } = this.getComplexityBand(fleschReadingEase, fleschKincaidGradeLevel);

    return {
      fleschReadingEase,
      fleschKincaidGradeLevel,
      gunningFogIndex,
      complexityBand: band,
      complexityBandLabel: label
    };
  }

  /**
   * Plain-Language Complexity Bands:
   * - Easy / Conversational (Reading Ease >= 80, Grade <= 6)
   * - Moderate / Standard (Reading Ease 60-79, Grade 7-10)
   * - Dense / Academic / Technical (Reading Ease < 60, Grade 11+)
   */
  getComplexityBand(readingEase: number, gradeLevel: number): { band: ComplexityBand; label: string } {
    if (readingEase >= 80) {
      return {
        band: 'easy',
        label: 'Easy / Conversational'
      };
    }

    if (readingEase >= 60 || (gradeLevel >= 7 && gradeLevel <= 10)) {
      return {
        band: 'moderate',
        label: 'Moderate / Standard'
      };
    }

    return {
      band: 'dense',
      label: 'Dense / Academic / Technical'
    };
  }

  /**
   * Syllable counting with vowel group heuristics and irregular English word overrides.
   */
  countSyllablesInWord(word: string): number {
    const rawClean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!rawClean) return 0;
    // Token length cap: prevent DoS from massive single words (e.g. 50,000 chars)
    const clean = rawClean.length > 60 ? rawClean.slice(0, 60) : rawClean;
    if (clean.length <= 3) return 1;

    // Irregular words dictionary
    const irregularOverrides: Record<string, number> = {
      queue: 1,
      rhythm: 2,
      rhythms: 2,
      subtle: 2,
      simile: 3,
      recipe: 3,
      create: 2,
      created: 2,
      creates: 2,
      creative: 3,
      creation: 3,
      area: 3,
      areas: 3,
      idea: 3,
      ideas: 3,
      poem: 2,
      poems: 2,
      poetry: 3,
      lion: 2,
      lions: 2,
      science: 2,
      society: 4,
      quiet: 2,
      quietly: 3,
      video: 3,
      videos: 3,
      radio: 3,
      media: 3,
      naive: 2,
      oasis: 3,
      syllable: 3,
      syllables: 3,
      business: 2,
      people: 2,
      separate: 3,
      interesting: 4,
      comfortable: 4,
      temperature: 4
    };

    if (irregularOverrides[clean] !== undefined) {
      return irregularOverrides[clean];
    }

    // Suffix adjustments: "tion", "sion", "cial", "tial", "cious", "tious" have 1 vowel sound
    const working = clean.replace(/(?:tion|sion|cial|tial|cious|tious)/g, 'xun');

    // Step 1: Count vowel clusters
    let count = 0;
    const vowelGroups = working.match(/[aeiouy]+/g);
    if (vowelGroups) {
      count = vowelGroups.length;
    }

    // Step 2: Subtract silent trailing 'e' (unless 'le' preceded by consonant)
    if (clean.endsWith('e') && !clean.endsWith('ee') && !clean.endsWith('oe')) {
      if (clean.endsWith('le') && clean.length > 3 && !/[aeiouy]le$/.test(clean)) {
        // e.g. table, simple, apple
      } else {
        count--;
      }
    }

    // Step 3: Subtract '-ed' unless preceded by 't' or 'd'
    if (clean.endsWith('ed') && clean.length > 3) {
      const charBeforeEd = clean[clean.length - 3];
      if (charBeforeEd !== 't' && charBeforeEd !== 'd') {
        count--;
      }
    }

    // Step 4: Subtract '-es' unless preceded by s, z, x, ch, sh
    if (clean.endsWith('es') && clean.length > 3) {
      const charBeforeEs = clean[clean.length - 3];
      if (!['s', 'z', 'x', 'c'].includes(charBeforeEs) && !clean.endsWith('ches') && !clean.endsWith('shes')) {
        count--;
      }
    }

    return Math.max(1, count);
  }

  /**
   * Tokenizes text into word array with token length caps against DoS.
   */
  private extractWords(text: string): string[] {
    const matches = text.match(/\b[A-Za-z0-9'-]+\b/g);
    if (!matches) return [];
    // Token length cap: truncate excessive tokens to max 60 chars
    return matches
      .map(w => (w.length > 60 ? w.slice(0, 60) : w))
      .filter(w => /[A-Za-z0-9]/.test(w));
  }

  /**
   * Extracts sentences, guarding against common honorifics, acronyms, and run-on DoS blocks.
   */
  private extractSentences(text: string): string[] {
    const masked = text
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|Ltd|Inc|Corp|No|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi, '$1_DOT_')
      .replace(/\b([A-Z])\./g, '$1_DOT_');

    const parts = masked.split(/(?<=[.!?])\s+|\n+/);
    const sentences: string[] = [];

    for (const part of parts) {
      const unmasked = part.replace(/_DOT_/g, '.').trim();
      if (unmasked.length > 0 && /[A-Za-z0-9]/.test(unmasked)) {
        // Sentence-boundary safeguard for massive run-on blocks without punctuation
        if (unmasked.length > 1500) {
          for (let i = 0; i < unmasked.length; i += 1500) {
            const chunk = unmasked.slice(i, i + 1500).trim();
            if (chunk.length > 0) sentences.push(chunk);
          }
        } else {
          sentences.push(unmasked);
        }
      }
    }

    return sentences;
  }

  /**
   * Sanitizes text to prevent Cross-Site Scripting (XSS) and script injection
   */
  sanitizeText(input?: string): string {
    if (!input) return '';
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .trim();
  }

  /**
   * Automatic section boundary detection when explicit sections are not supplied.
   */
  private splitIntoSections(text: string): { id?: string; title: string; text: string; pageNumber: number }[] {
    // 1. Check for form feed page breaks
    if (text.includes('\f')) {
      return text.split('\f').filter(Boolean).map((t, i) => ({
        id: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        text: t.trim(),
        pageNumber: i + 1
      }));
    }

    // 2. Check for markdown headings (# Heading)
    const lines = text.split(/\r?\n/);
    const sections: { id?: string; title: string; text: string; pageNumber: number }[] = [];
    let currentTitle = 'Introduction';
    let currentLines: string[] = [];
    let pageCounter = 1;

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headingMatch) {
        if (currentLines.join('').trim().length > 0) {
          sections.push({
            id: `sec-${pageCounter}`,
            title: currentTitle,
            text: currentLines.join('\n').trim(),
            pageNumber: pageCounter++
          });
          currentLines = [];
        }
        currentTitle = headingMatch[1].trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.join('').trim().length > 0) {
      sections.push({
        id: `sec-${pageCounter}`,
        title: currentTitle,
        text: currentLines.join('\n').trim(),
        pageNumber: pageCounter
      });
    }

    if (sections.length > 1) {
      return sections;
    }

    // 3. Fallback: Single document section
    return [{
      id: 'doc-full',
      title: 'Full Document',
      text: text.trim(),
      pageNumber: 1
    }];
  }

  /**
   * Educational explanation definitions for each formula.
   */
  getFormulaExplanations(): FormulaExplanation[] {
    return [
      {
        formula: 'Flesch Reading Ease',
        name: 'Flesch Reading Ease (0–100)',
        description: '206.835 - 1.015 × (words/sentences) - 84.6 × (syllables/words)',
        interpretation: 'Higher scores indicate easier reading. Scores above 80 are conversational, 60–79 are standard, and below 60 represent dense or technical prose.',
        range: '0 – 100+'
      },
      {
        formula: 'Flesch-Kincaid Grade Level',
        name: 'Flesch-Kincaid Grade Level',
        description: '0.39 × (words/sentences) + 11.8 × (syllables/words) - 15.59',
        interpretation: 'Represents the estimated US academic school grade level required to comprehend the text. Grade 8 corresponds to an average 13–14 year old reader.',
        range: '1 – 18+'
      },
      {
        formula: 'Gunning Fog Index',
        name: 'Gunning Fog Index',
        description: '0.4 × ((words/sentences) + 100 × (complexWords/words))',
        interpretation: 'Estimates the years of formal education required to understand text on first reading. Fog index of 12 corresponds to high school senior level.',
        range: '6 – 20+'
      }
    ];
  }

  /**
   * Formats a complete plain-text readability summary suitable for sharing or saving.
   */
  formatReportText(report: ReadabilityReport): string {
    const stats = report.overallStatistics;
    const times = report.overallTimes;
    const scores = report.overallScores;

    return `READABILITY & READING TIME ANALYSIS
=====================================
Document: ${report.fileName || 'Untitled Document'}
Date: ${report.analyzedAt}

EXECUTIVE SUMMARY
-----------------
Estimated Silent Reading Time: ${times.readingTimeFormatted} (${times.readingTimeSeconds}s @ 200 wpm)
Estimated Presentation / Speaking Time: ${times.speakingTimeFormatted} (${times.speakingTimeSeconds}s @ 130 wpm)
Overall Complexity Band: ${scores.complexityBandLabel}

READABILITY SCORES
------------------
• Flesch Reading Ease: ${scores.fleschReadingEase} / 100
• Flesch-Kincaid Grade Level: Grade ${scores.fleschKincaidGradeLevel}
• Gunning Fog Index: ${scores.gunningFogIndex}

DOCUMENT METRICS
----------------
• Total Words: ${stats.wordCount.toLocaleString()}
• Total Characters: ${stats.characterCount.toLocaleString()}
• Total Sentences: ${stats.sentenceCount.toLocaleString()}
• Total Syllables: ${stats.syllableCount.toLocaleString()}
• Complex Words (3+ syllables): ${stats.complexWordCount.toLocaleString()} (${stats.wordCount > 0 ? ((stats.complexWordCount / stats.wordCount) * 100).toFixed(1) : 0}%)
• Avg Words per Sentence: ${stats.averageWordsPerSentence}
• Avg Syllables per Word: ${stats.averageSyllablesPerWord}

SECTIONS BREAKDOWN (${report.sections.length} sections)
----------------------------------------
${report.sections.map(s => `[${s.title}] Reading Time: ${s.estimatedTimes.readingTimeFormatted} | Reading Ease: ${s.scores.fleschReadingEase} (${s.scores.complexityBandLabel}) | Words: ${s.statistics.wordCount}`).join('\n')}
`;
  }
}
