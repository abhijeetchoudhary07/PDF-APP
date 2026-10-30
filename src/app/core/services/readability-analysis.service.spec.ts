import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ReadabilityAnalysisService } from './readability-analysis.service';

describe('ReadabilityAnalysisService — P7 Reading Time & Readability Scores', () => {
  let service: ReadabilityAnalysisService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReadabilityAnalysisService]
    });
    service = TestBed.inject(ReadabilityAnalysisService);
  });

  describe('1. Exact Reading Time and Speaking Time Arithmetic', () => {
    it('calculates exact silent reading time at 200 wpm', () => {
      // 200 words = exactly 1 minute / 60 seconds
      const times200 = service.computeEstimatedTimes(200);
      expect(times200.readingTimeMinutes).toBe(1.0);
      expect(times200.readingTimeSeconds).toBe(60);
      expect(times200.readingTimeFormatted).toBe('1 min read');

      // 400 words = exactly 2 minutes / 120 seconds
      const times400 = service.computeEstimatedTimes(400);
      expect(times400.readingTimeMinutes).toBe(2.0);
      expect(times400.readingTimeSeconds).toBe(120);
      expect(times400.readingTimeFormatted).toBe('2 min read');

      // 50 words = 0.25 minutes / 15 seconds, '< 1 min read'
      const times50 = service.computeEstimatedTimes(50);
      expect(times50.readingTimeMinutes).toBe(0.25);
      expect(times50.readingTimeSeconds).toBe(15);
      expect(times50.readingTimeFormatted).toBe('< 1 min read');
    });

    it('calculates exact presentation speaking time at 130 wpm', () => {
      // 130 words = exactly 1 minute / 60 seconds
      const times130 = service.computeEstimatedTimes(130);
      expect(times130.speakingTimeMinutes).toBe(1.0);
      expect(times130.speakingTimeSeconds).toBe(60);
      expect(times130.speakingTimeFormatted).toBe('1 min talk');

      // 260 words = exactly 2 minutes / 120 seconds
      const times260 = service.computeEstimatedTimes(260);
      expect(times260.speakingTimeMinutes).toBe(2.0);
      expect(times260.speakingTimeSeconds).toBe(120);
      expect(times260.speakingTimeFormatted).toBe('2 min talk');

      // 65 words = 0.5 minutes / 30 seconds
      const times65 = service.computeEstimatedTimes(65);
      expect(times65.speakingTimeMinutes).toBe(0.5);
      expect(times65.speakingTimeSeconds).toBe(30);
      expect(times65.speakingTimeFormatted).toBe('< 1 min talk');
    });
  });

  describe('2. Syllable Counting & Irregular Words', () => {
    it('correctly handles irregular English words', () => {
      expect(service.countSyllablesInWord('queue')).toBe(1);
      expect(service.countSyllablesInWord('rhythm')).toBe(2);
      expect(service.countSyllablesInWord('recipe')).toBe(3);
      expect(service.countSyllablesInWord('simile')).toBe(3);
      expect(service.countSyllablesInWord('create')).toBe(2);
      expect(service.countSyllablesInWord('creation')).toBe(3);
      expect(service.countSyllablesInWord('poetry')).toBe(3);
      expect(service.countSyllablesInWord('area')).toBe(3);
      expect(service.countSyllablesInWord('idea')).toBe(3);
      expect(service.countSyllablesInWord('lion')).toBe(2);
      expect(service.countSyllablesInWord('society')).toBe(4);
      expect(service.countSyllablesInWord('syllable')).toBe(3);
      expect(service.countSyllablesInWord('business')).toBe(2);
    });

    it('handles phonetic rules: silent trailing e, ed, and diphthongs', () => {
      expect(service.countSyllablesInWord('make')).toBe(1);
      expect(service.countSyllablesInWord('walked')).toBe(1);
      expect(service.countSyllablesInWord('waited')).toBe(2); // 'ed' preceded by 't'
      expect(service.countSyllablesInWord('oasis')).toBe(3);
      expect(service.countSyllablesInWord('radio')).toBe(3);
      expect(service.countSyllablesInWord('quietly')).toBe(3);
    });
  });

  describe('3. Readability Calculations on Standard Sample Texts', () => {
    it('matches published Flesch Reading Ease and Gunning Fog for simple text', () => {
      // 15 words, 3 sentences: 5 words/sentence, all 1-syllable words
      const simpleText = 'The cat sat on the mat. The dog chased the ball. The sun was hot.';
      const stats = service.computeStatistics(simpleText);

      expect(stats.wordCount).toBe(15);
      expect(stats.sentenceCount).toBe(3);
      expect(stats.averageWordsPerSentence).toBe(5.0);
      expect(stats.complexWordCount).toBe(0);

      const scores = service.computeScores(stats);

      // Flesch: 206.835 - (1.015 * 5) - (84.6 * 1.0) = 206.835 - 5.075 - 84.6 = 117.16 -> 117.2
      expect(scores.fleschReadingEase).toBe(117.2);

      // Gunning Fog: 0.4 * (5 + 100 * 0) = 2.0
      expect(scores.gunningFogIndex).toBe(2.0);

      // Plain language band
      expect(scores.complexityBand).toBe('easy');
      expect(scores.complexityBandLabel).toBe('Easy / Conversational');
    });

    it('computes expected scores for academic/dense text', () => {
      const denseText = `
        The epidemiological ramifications of pathogenic microorganisms within subterranean aquatic environments
        demonstrate unprecedented physiological adaptability and phenotypic diversity.
        Consequently, environmental bioremediation necessitates comprehensive phylogenetic investigations.
      `;

      const stats = service.computeStatistics(denseText);
      expect(stats.complexWordCount).toBeGreaterThanOrEqual(6);

      const scores = service.computeScores(stats);
      expect(scores.fleschReadingEase).toBeLessThan(60);
      expect(scores.fleschKincaidGradeLevel).toBeGreaterThanOrEqual(11);
      expect(scores.complexityBand).toBe('dense');
      expect(scores.complexityBandLabel).toBe('Dense / Academic / Technical');
    });

    it('computes expected scores for standard/moderate text', () => {
      const moderateText = 'The students finished their homework early and went outside to play soccer. Their teacher told them to return before dinner time.';

      const stats = service.computeStatistics(moderateText);
      const scores = service.computeScores(stats);

      expect(scores.fleschReadingEase).toBeGreaterThanOrEqual(60);
      expect(scores.fleschReadingEase).toBeLessThan(80);
      expect(scores.complexityBand).toBe('moderate');
      expect(scores.complexityBandLabel).toBe('Moderate / Standard');
    });
  });

  describe('4. Granularity: Section & Multi-Page Document Analysis', () => {
    it('analyzes multi-section documents and produces individual section metrics', () => {
      const sections = [
        {
          id: 'sec-1',
          title: 'Chapter 1: The Beginning',
          text: 'The sun was warm. The sky was blue. We walked along the river path.',
          pageNumber: 1
        },
        {
          id: 'sec-2',
          title: 'Chapter 2: Technical Specifications',
          text: 'Implementation considerations require simultaneous synchronization of cryptographic infrastructure and authentication mechanisms.',
          pageNumber: 2
        }
      ];

      const report = service.analyze('Full text combined', sections, 'document.pdf');

      expect(report.fileName).toBe('document.pdf');
      expect(report.sections.length).toBe(2);

      // Chapter 1 is easy
      expect(report.sections[0].title).toBe('Chapter 1: The Beginning');
      expect(report.sections[0].scores.complexityBand).toBe('easy');
      expect(report.sections[0].pageNumber).toBe(1);

      // Chapter 2 is dense
      expect(report.sections[1].title).toBe('Chapter 2: Technical Specifications');
      expect(report.sections[1].scores.complexityBand).toBe('dense');
      expect(report.sections[1].pageNumber).toBe(2);
    });

    it('automatically detects markdown headings as sections', () => {
      const markdown = `
# Executive Summary
This project delivers fast offline document processing.

# Methodological Architecture
Algorithmic implementations incorporate deterministic heuristics and linguistic segmentation methodologies.
      `;

      const report = service.analyze(markdown);
      expect(report.sections.length).toBe(2);
      expect(report.sections[0].title).toBe('Executive Summary');
      expect(report.sections[1].title).toBe('Methodological Architecture');
    });

    it('generates complete formatted text report suitable for sharing', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const report = service.analyze(text, undefined, 'sample.txt');
      const formatted = service.formatReportText(report);

      expect(formatted).toContain('READABILITY & READING TIME ANALYSIS');
      expect(formatted).toContain('sample.txt');
      expect(formatted).toContain('Flesch Reading Ease');
      expect(formatted).toContain('Gunning Fog Index');
    });
  });

  describe('5. Real Test Data — Children Story, Newspaper Article, Academic Paper', () => {
    it('analyzes Children Story (Grade 3–5, Easy / Conversational)', () => {
      const story = `
        Tim had a little dog named Spot.
        Spot liked to run and jump in the green park.
        One sunny day, they found a red rubber ball under the tall oak tree.
        Tim threw the ball, and Spot ran fast to catch it.
        They played until the sun went down.
        It was a happy day for both of them.
      `;

      const stats = service.computeStatistics(story);
      expect(stats.wordCount).toBeGreaterThan(40);
      expect(stats.averageWordsPerSentence).toBeLessThan(12);

      const scores = service.computeScores(stats);
      // Flesch Reading Ease should be high (>= 80)
      expect(scores.fleschReadingEase).toBeGreaterThanOrEqual(80);
      // Grade level should be low (Grade 3–5)
      expect(scores.fleschKincaidGradeLevel).toBeLessThanOrEqual(5.5);
      expect(scores.complexityBand).toBe('easy');
      expect(scores.complexityBandLabel).toBe('Easy / Conversational');
    });

    it('analyzes Newspaper Article (Grade 8–10, Moderate / Standard)', () => {
      const newspaper = `
        Local volunteers gathered at the community center on Saturday morning to help clean up the neighborhood park.
        Teams picked up litter along the walking trails and planted fresh flowers near the playground.
        The annual event attracted more than fifty families who worked together under bright sunshine.
        Organizers thanked everyone for their hard work and promised to host another cleanup project next spring.
      `;

      const stats = service.computeStatistics(newspaper);
      expect(stats.averageWordsPerSentence).toBeGreaterThanOrEqual(14);
      expect(stats.averageWordsPerSentence).toBeLessThanOrEqual(25);

      const scores = service.computeScores(stats);
      // Flesch Reading Ease should be in moderate range (50–75)
      expect(scores.fleschReadingEase).toBeGreaterThanOrEqual(50);
      expect(scores.fleschReadingEase).toBeLessThan(75);
      // Grade level in standard high school / junior high range (Grade 7–10)
      expect(scores.fleschKincaidGradeLevel).toBeGreaterThanOrEqual(7);
      expect(scores.fleschKincaidGradeLevel).toBeLessThanOrEqual(10.5);
      expect(scores.complexityBand).toBe('moderate');
      expect(scores.complexityBandLabel).toBe('Moderate / Standard');
    });

    it('analyzes Academic Research Paper (Grade 14+, Dense / Academic / Technical)', () => {
      const academic = `
        The thermodynamic characterization of high-entropy alloys demonstrates anomalous microstructural stability
        under cryogenic mechanical deformation and severe plastic processing.
        Transmission electron microscopy reveals planar dislocation glide and nanotwinning mechanisms
        which substantially enhance strain hardening capacity and fracture toughness.
        Consequently, multi-component metallurgical configurations represent an auspicious paradigm
        for specialized structural applications in aerospace engineering.
      `;

      const stats = service.computeStatistics(academic);
      expect(stats.complexWordCount).toBeGreaterThanOrEqual(10);

      const scores = service.computeScores(stats);
      // Flesch Reading Ease is very low (< 40)
      expect(scores.fleschReadingEase).toBeLessThan(40);
      // Grade level is graduate / college level (14+)
      expect(scores.fleschKincaidGradeLevel).toBeGreaterThanOrEqual(14);
      expect(scores.gunningFogIndex).toBeGreaterThanOrEqual(14);
      expect(scores.complexityBand).toBe('dense');
      expect(scores.complexityBandLabel).toBe('Dense / Academic / Technical');
    });
  });

  describe('6. Cybersecurity & Resilience Stress-Testing', () => {
    it('handles zero-sentence documents and symbol-only text without division-by-zero or NaN', () => {
      const symbols = '??? !!! --- *** ### @@@ $$$ %%% ^^^ &&&';
      const stats = service.computeStatistics(symbols);

      expect(stats.wordCount).toBe(0);
      expect(stats.sentenceCount).toBe(0);
      expect(stats.averageWordsPerSentence).toBe(0);
      expect(stats.averageSyllablesPerWord).toBe(0);

      const times = service.computeEstimatedTimes(stats.wordCount);
      expect(times.readingTimeMinutes).toBe(0);
      expect(times.readingTimeFormatted).toBe('0 min read');

      const scores = service.computeScores(stats);
      expect(scores.fleschReadingEase).toBe(100);
      expect(scores.fleschKincaidGradeLevel).toBe(0);
      expect(scores.gunningFogIndex).toBe(0);
      expect(isNaN(scores.fleschReadingEase)).toBe(false);
      expect(isNaN(scores.fleschKincaidGradeLevel)).toBe(false);
      expect(isNaN(scores.gunningFogIndex)).toBe(false);
    });

    it('resists 50,000-character single word DoS and processes safely in under 100ms', () => {
      const evilWord = 'supercalifragilisticexpialidocious'.repeat(1500); // 51,000 chars
      expect(evilWord.length).toBeGreaterThan(50000);

      const start = performance.now();
      const syllables = service.countSyllablesInWord(evilWord);
      const duration = performance.now() - start;

      expect(syllables).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });

    it('handles massive whitespace floods without hanging or memory exhaustion', () => {
      const whitespaceFlood = 'The ' + '   '.repeat(50000) + ' dog jumped.';
      const start = performance.now();
      const stats = service.computeStatistics(whitespaceFlood);
      const duration = performance.now() - start;

      expect(stats.wordCount).toBe(3);
      expect(duration).toBeLessThan(200);
    });

    it('neutralizes XSS payloads in filenames and section titles', () => {
      const xssFileName = '<script>alert("XSS")</script>malicious.pdf';
      const sections = [
        {
          title: '<img src=x onerror=alert(1)>Chapter 1',
          text: 'This is safe body text.'
        }
      ];

      const report = service.analyze('This is safe body text.', sections, xssFileName);

      expect(report.fileName).not.toContain('<script>');
      expect(report.fileName).not.toContain('</script>');
      expect(report.sections[0].title).not.toContain('<img');

      const formatted = service.formatReportText(report);
      expect(formatted).not.toContain('<script>');
      expect(formatted).not.toContain('<img');
    });
  });
});
