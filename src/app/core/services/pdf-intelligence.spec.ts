import { describe, it, expect, beforeEach } from 'vitest';
import { PdfIntelligenceService } from './pdf-intelligence.service';

describe('PdfIntelligenceService', () => {
  let service: PdfIntelligenceService;

  const mockPages = [
    {
      pageNumber: 1,
      text: `1. Introduction and Purpose
This official document outlines the requirements and guidelines for civil service examinations.
Candidates must satisfy all educational eligibility criteria before submitting their applications.
The minimum qualification required is a bachelor degree in any discipline from a recognized university.
The candidate age must be between 21 and 32 years on the date of application submission.`
    },
    {
      pageNumber: 2,
      text: `2. Examination Rules and Deadlines
All candidates must submit their application before the deadline of 15th October 2026.
Late submissions will not be entertained under any circumstances.
Applicants must upload a clear passport photo and signature as specified in the form instructions.
Failure to provide valid identity verification documents will result in immediate disqualification.`
    }
  ];

  beforeEach(() => {
    service = new PdfIntelligenceService();
  });

  describe('Document Analysis', () => {
    it('should compute word count, char count, and estimated reading time', () => {
      const analysis = service.analyzeDocument(mockPages);
      expect(analysis.wordCount).toBeGreaterThan(60);
      expect(analysis.charCount).toBeGreaterThan(300);
      expect(analysis.pageCount).toBe(2);
      expect(analysis.readingTimeMinutes).toBeGreaterThanOrEqual(1);
      expect(analysis.isExtractionReliable).toBe(true);
    });

    it('should detect headings and sections based on structural patterns', () => {
      const analysis = service.analyzeDocument(mockPages);
      expect(analysis.headings.length).toBeGreaterThanOrEqual(2);
      expect(analysis.headings[0].text).toContain('1. Introduction and Purpose');
      expect(analysis.headings[1].text).toContain('2. Examination Rules and Deadlines');

      expect(analysis.sections.length).toBeGreaterThanOrEqual(2);
      expect(analysis.sections[0].title).toContain('1. Introduction and Purpose');
    });

    it('should extract top keywords and exclude common stop words', () => {
      const analysis = service.analyzeDocument(mockPages);
      expect(analysis.keywords.length).toBeGreaterThan(0);
      const keywordList = analysis.keywords.map(k => k.word);
      expect(keywordList).toContain('candidates');
      expect(keywordList).not.toContain('the');
      expect(keywordList).not.toContain('and');
    });

    it('should detect Latin / English script language', () => {
      const analysis = service.analyzeDocument(mockPages);
      expect(analysis.detectedLanguage).toBe('English (Latin)');
    });

    it('should detect Devanagari script language for Hindi / Marathi text', () => {
      const hindiPages = [{ pageNumber: 1, text: 'यह भारत सरकार का आधिकारिक दस्तावेज़ है जिसमें पात्रता के नियम दिए गए हैं।' }];
      const analysis = service.analyzeDocument(hindiPages);
      expect(analysis.detectedLanguage).toBe('Hindi / Marathi (Devanagari)');
    });
  });

  describe('Summarization', () => {
    it('should generate quick summary, detailed summary, and key points', () => {
      const analysis = service.analyzeDocument(mockPages);
      const summary = service.summarize(analysis, mockPages);

      expect(summary.quickSummary).toBeDefined();
      expect(summary.quickSummary.length).toBeGreaterThan(30);
      expect(summary.detailedSummary.length).toBeGreaterThan(0);
      expect(summary.keyPoints.length).toBeGreaterThan(0);
      expect(summary.sectionSummaries.length).toBeGreaterThan(0);
    });

    it('should include notice when extraction is unreliable or empty', () => {
      const emptyPages = [{ pageNumber: 1, text: 'tiny' }];
      const analysis = service.analyzeDocument(emptyPages);
      const summary = service.summarize(analysis, emptyPages);

      expect(summary.extractionQualityNotice).toBeDefined();
      expect(summary.quickSummary).toContain('limited or scanned');
    });
  });

  describe('Document Search', () => {
    it('should find keyword occurrences across pages and return snippets', () => {
      const matches = service.searchDocument('deadline', mockPages);
      expect(matches.length).toBe(2);
      expect(matches[0].pageNumber).toBe(2);
      expect(matches[0].snippet.toLowerCase()).toContain('deadline');
    });

    it('should return empty list when keyword is not in document', () => {
      const matches = service.searchDocument('astronaut', mockPages);
      expect(matches.length).toBe(0);
    });
  });

  describe('Grounded Question Answering (Q&A)', () => {
    it('should answer eligibility question citing Page 1', () => {
      const qa = service.answerQuestion('What are the eligibility criteria and degree requirements?', mockPages);
      expect(qa.groundedInDocument).toBe(true);
      expect(qa.answer).toContain('bachelor degree');
      expect(qa.citations.length).toBeGreaterThan(0);
      expect(qa.citations[0].pageNumber).toBe(1);
    });

    it('should answer deadline question citing Page 2', () => {
      const qa = service.answerQuestion('What is the deadline for submission?', mockPages);
      expect(qa.groundedInDocument).toBe(true);
      expect(qa.answer).toContain('15th October 2026');
      expect(qa.citations[0].pageNumber).toBe(2);
    });

    it('should decline to answer questions unrelated to document content', () => {
      const qa = service.answerQuestion('What is the distance between Earth and Mars?', mockPages);
      expect(qa.groundedInDocument).toBe(false);
      expect(qa.answer).toContain('does not appear to contain information');
      expect(qa.citations.length).toBe(0);
    });
  });

  describe('Translation', () => {
    it('should substitute key terms in Hindi translation', async () => {
      const translated = await service.translateContent('Important candidate instructions and rules for eligibility criteria.', 'hi');
      expect(translated).toContain('उम्मीदवार');
      expect(translated).toContain('निर्देश');
      expect(translated).toContain('नियम');
      expect(translated).toContain('पात्रता');
    });

    it('should translate document summary and key points', async () => {
      const analysis = service.analyzeDocument(mockPages);
      const summary = service.summarize(analysis, mockPages);
      const res = await service.translateDocumentSummary(summary, 'mr');

      expect(res.targetLanguage).toBe('mr');
      expect(res.translatedText).toBeDefined();
      expect(res.translatedText).toContain('[MR]');
    });
  });

  describe('Report Exports', () => {
    it('should export summary as TXT blob', async () => {
      const analysis = service.analyzeDocument(mockPages);
      const summary = service.summarize(analysis, mockPages);
      const blob = service.exportSummaryTxt(summary, 'TestDoc.pdf');

      expect(blob.type).toBe('text/plain');
      const text = await blob.text();
      expect(text).toContain('DOCUMENT INTELLIGENCE SUMMARY REPORT');
      expect(text).toContain('TestDoc.pdf');
    });

    it('should export summary as PDF blob', async () => {
      const analysis = service.analyzeDocument(mockPages);
      const summary = service.summarize(analysis, mockPages);
      const blob = await service.exportSummaryPdf('TestDoc.pdf', summary);

      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(500);
    });

    it('should export structured JSON', async () => {
      const analysis = service.analyzeDocument(mockPages);
      const summary = service.summarize(analysis, mockPages);
      const blob = service.exportStructuredJson(analysis, summary);

      expect(blob.type).toBe('application/json');
      const json = JSON.parse(await blob.text());
      expect(json.analysis.wordCount).toBe(analysis.wordCount);
      expect(json.summary.quickSummary).toBe(summary.quickSummary);
    });
  });

  describe('AI Privacy Controls', () => {
    it('should default to local mode', () => {
      expect(service.mode).toBe('local');
    });

    it('should update mode and AI config', () => {
      service.setMode('ai-assisted');
      expect(service.mode).toBe('ai-assisted');
      service.updateAiConfig({ userAcceptedDisclosure: true, providerName: 'gemini' });
      expect(service.config.userAcceptedDisclosure).toBe(true);
      expect(service.config.providerName).toBe('gemini');
    });
  });

  describe('AI Provider Abstraction & Full Translation', () => {
    it('should provide LocalIntelligenceProvider and RemoteAIProvider instances', () => {
      expect(service.localProvider).toBeDefined();
      expect(service.localProvider.name).toContain('Local');
      expect(service.remoteProvider).toBeDefined();
      expect(service.remoteProvider.name).toContain('Remote');
    });

    it('should switch activeProvider based on active mode', () => {
      service.setMode('local');
      expect(service.activeProvider).toBe(service.localProvider);

      service.setMode('ai-assisted');
      expect(service.activeProvider).toBe(service.remoteProvider);
    });

    it('should reject remote AI calls when disclosure is not accepted', async () => {
      service.setMode('ai-assisted');
      service.updateAiConfig({ userAcceptedDisclosure: false });

      await expect(service.remoteProvider.summarize({} as any, mockPages)).rejects.toThrow(
        'AI Privacy Disclosure must be accepted'
      );
    });

    it('should reject remote AI calls when no endpoint or key is configured', async () => {
      service.setMode('ai-assisted');
      service.updateAiConfig({ userAcceptedDisclosure: true, apiKey: undefined, endpoint: undefined });

      await expect(service.remoteProvider.summarize({} as any, mockPages)).rejects.toThrow(
        'Remote AI provider is not configured'
      );
    });

    it('should translate full document pages preserving page structure', async () => {
      const result = await service.translateDocument(mockPages, 'hi');
      expect(result.targetLanguage).toBe('hi');
      expect(result.translatedPages).toBeDefined();
      expect(result.translatedPages!.length).toBe(2);
      expect(result.translatedText).toContain('[Page 1]');
      expect(result.translatedText).toContain('[Page 2]');
    });

    it('should translate specific selected pages when requested', async () => {
      const result = await service.translateDocument(mockPages, 'mr', { scope: 'pages', pageNumbers: [2] });
      expect(result.targetLanguage).toBe('mr');
      expect(result.translatedPages!.length).toBe(1);
      expect(result.translatedPages![0].pageNumber).toBe(2);
    });
  });
});

