import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { ReadabilityPage } from './readability.page';
import { ReadabilityAnalysisService } from '../../core/services/readability-analysis.service';
import { ShareService } from '../../core/services/share.service';
import { TranslationService } from '../../core/services/translation.service';
import { ReadabilityReport } from '../../core/models/readability.types';

describe('ReadabilityPage — P7 Mobile Play Store UI / UX', () => {
  let component: ReadabilityPage;
  let fixture: ComponentFixture<ReadabilityPage>;
  let mockReadabilityService: any;
  let mockShareService: any;
  let mockTranslationService: any;

  const mockReport: ReadabilityReport = {
    fileName: 'document.pdf',
    analyzedAt: new Date().toISOString(),
    overallStatistics: {
      wordCount: 800,
      characterCount: 4800,
      characterCountNoSpaces: 4000,
      sentenceCount: 50,
      syllableCount: 1200,
      complexWordCount: 120,
      averageWordsPerSentence: 16.0,
      averageSyllablesPerWord: 1.5
    },
    overallTimes: {
      readingTimeMinutes: 4.0,
      readingTimeSeconds: 240,
      readingTimeFormatted: '4 min read',
      speakingTimeMinutes: 6.15,
      speakingTimeSeconds: 369,
      speakingTimeFormatted: '7 min talk'
    },
    overallScores: {
      fleschReadingEase: 65.5,
      fleschKincaidGradeLevel: 8.2,
      gunningFogIndex: 10.4,
      complexityBand: 'moderate',
      complexityBandLabel: 'Moderate / Standard'
    },
    sections: [
      {
        sectionId: 'sec-1',
        title: 'Page 1',
        pageNumber: 1,
        statistics: {
          wordCount: 400,
          characterCount: 2400,
          characterCountNoSpaces: 2000,
          sentenceCount: 25,
          syllableCount: 600,
          complexWordCount: 60,
          averageWordsPerSentence: 16.0,
          averageSyllablesPerWord: 1.5
        },
        estimatedTimes: {
          readingTimeMinutes: 2.0,
          readingTimeSeconds: 120,
          readingTimeFormatted: '2 min read',
          speakingTimeMinutes: 3.1,
          speakingTimeSeconds: 185,
          speakingTimeFormatted: '4 min talk'
        },
        scores: {
          fleschReadingEase: 68.0,
          fleschKincaidGradeLevel: 7.9,
          gunningFogIndex: 9.8,
          complexityBand: 'moderate',
          complexityBandLabel: 'Moderate / Standard'
        },
        textExcerpt: 'Sample text excerpt from page 1...'
      },
      {
        sectionId: 'sec-2',
        title: 'Page 2',
        pageNumber: 2,
        statistics: {
          wordCount: 400,
          characterCount: 2400,
          characterCountNoSpaces: 2000,
          sentenceCount: 25,
          syllableCount: 600,
          complexWordCount: 60,
          averageWordsPerSentence: 16.0,
          averageSyllablesPerWord: 1.5
        },
        estimatedTimes: {
          readingTimeMinutes: 2.0,
          readingTimeSeconds: 120,
          readingTimeFormatted: '2 min read',
          speakingTimeMinutes: 3.1,
          speakingTimeSeconds: 185,
          speakingTimeFormatted: '4 min talk'
        },
        scores: {
          fleschReadingEase: 63.0,
          fleschKincaidGradeLevel: 8.5,
          gunningFogIndex: 11.0,
          complexityBand: 'moderate',
          complexityBandLabel: 'Moderate / Standard'
        },
        textExcerpt: 'Sample text excerpt from page 2...'
      }
    ],
    formulaExplanations: [
      {
        formula: 'Flesch Reading Ease',
        name: 'Flesch Reading Ease (0–100)',
        description: '206.835 - 1.015 × (words/sentences) - 84.6 × (syllables/words)',
        interpretation: 'Higher scores indicate easier reading.',
        range: '0 – 100+'
      }
    ]
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockShareService = {
      share: vi.fn().mockResolvedValue(true)
    };

    mockTranslationService = {
      currentLang: 'en',
      translate: (key: string) => key
    };

    mockReadabilityService = {
      analyze: vi.fn().mockReturnValue(mockReport),
      formatReportText: vi.fn().mockReturnValue('Mock Formatted Report Text')
    };

    await TestBed.configureTestingModule({
      imports: [ReadabilityPage],
      providers: [
        { provide: ReadabilityAnalysisService, useValue: mockReadabilityService },
        { provide: ShareService, useValue: mockShareService },
        { provide: TranslationService, useValue: mockTranslationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReadabilityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('renders executive summary with reading time badge and plain-language pill', () => {
    component.selectedFile = new File(['mock'], 'document.pdf', { type: 'application/pdf' });
    component.report = mockReport;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricNumber = compiled.querySelector('.big-metric-badge .metric-number');
    expect(metricNumber?.textContent).toContain('4 min read');

    const complexityPill = compiled.querySelector('.complexity-pill');
    expect(complexityPill?.textContent).toContain('Moderate / Standard');
  });

  it('renders readability gauges card with scores', () => {
    component.selectedFile = new File(['mock'], 'document.pdf', { type: 'application/pdf' });
    component.report = mockReport;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.score-ease')?.textContent).toContain('65.5');
    expect(compiled.querySelector('.score-grade')?.textContent).toContain('Grade 8.2');
    expect(compiled.querySelector('.score-fog')?.textContent).toContain('Fog 10.4');
  });

  it('toggles educational formula explanations accordion', () => {
    component.report = mockReport;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();

    expect(component.expandedFormulaIndex).toBeNull();
    component.toggleFormula(0);
    expect(component.expandedFormulaIndex).toBe(0);

    component.toggleFormula(0);
    expect(component.expandedFormulaIndex).toBeNull();
  });

  it('renders per-section breakdown table with reading time and difficulty ratings', () => {
    component.selectedFile = new File(['mock'], 'document.pdf', { type: 'application/pdf' });
    component.report = mockReport;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sectionCards = compiled.querySelectorAll('.section-item-card');
    expect(sectionCards.length).toBe(2);

    expect(sectionCards[0].textContent).toContain('Page 1');
    expect(sectionCards[0].textContent).toContain('2 min read');
    expect(sectionCards[0].textContent).toContain('Moderate / Standard');

    expect(sectionCards[1].textContent).toContain('Page 2');
    expect(sectionCards[1].textContent).toContain('2 min read');
  });

  it('shares readability report when Share button is tapped', async () => {
    component.selectedFile = new File(['mock'], 'document.pdf', { type: 'application/pdf' });
    component.report = mockReport;
    fixture.detectChanges();

    await component.shareReport();

    expect(mockReadabilityService.formatReportText).toHaveBeenCalledWith(mockReport);
    expect(mockShareService.share).toHaveBeenCalledWith({
      title: 'Readability Analysis — document.pdf',
      text: 'Mock Formatted Report Text'
    });
  });

  it('loads sample document when Try Sample Document is clicked', () => {
    component.loadSampleDocument();
    expect(component.selectedFile).toBeTruthy();
    expect(mockReadabilityService.analyze).toHaveBeenCalled();
  });
});
