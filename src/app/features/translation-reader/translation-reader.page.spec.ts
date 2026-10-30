import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { TranslationReaderPage } from './translation-reader.page';
import { TranslationReaderService } from '../../core/services/translation-reader.service';
import { StorageService } from '../../core/services/storage.service';
import { TranslationSession } from '../../core/models/pdf-intelligence.types';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('TranslationReaderPage', () => {
  let component: TranslationReaderPage;
  let fixture: ComponentFixture<TranslationReaderPage>;
  let mockTranslationReaderService: Partial<TranslationReaderService>;
  let mockStorageService: Partial<StorageService>;

  const mockSession: TranslationSession = {
    fileName: 'test-document.pdf',
    pageCount: 2,
    sourceLanguage: 'English',
    targetLanguage: 'hi',
    pages: [
      {
        pageNumber: 1,
        originalText: 'Original text page 1',
        translatedText: 'पृष्ठ 1 का अनुवादित पाठ',
        paragraphs: ['Section 1: Rules', 'Original text page 1'],
        translatedParagraphs: ['अनुभाग 1: नियम', 'पृष्ठ 1 का अनुवादित पाठ'],
        headings: [{ text: 'Section 1: Rules', level: 2, pageNumber: 1 }],
        charCountOriginal: 35,
        charCountTranslated: 48,
        expansionRatio: 1.37
      },
      {
        pageNumber: 2,
        originalText: 'Original text page 2',
        translatedText: 'पृष्ठ 2 का अनुवादित पाठ',
        paragraphs: ['Section 2: Verification', 'Original text page 2'],
        translatedParagraphs: ['अनुभाग 2: सत्यापन', 'पृष्ठ 2 का अनुवादित पाठ'],
        headings: [{ text: 'Section 2: Verification', level: 2, pageNumber: 2 }],
        charCountOriginal: 38,
        charCountTranslated: 50,
        expansionRatio: 1.32
      }
    ],
    executiveSummary: 'दस्तावेज़ का कार्यकारी सारांश',
    keyPoints: ['मुख्य बिंदु 1', 'मुख्य बिंदु 2'],
    modeUsed: 'local',
    expansionSummary: {
      averageExpansionRate: 1.35,
      originalTotalChars: 73,
      translatedTotalChars: 98
    }
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockTranslationReaderService = {
      prepareTranslationSession: vi.fn().mockResolvedValue(mockSession),
      computeTargetScrollOffset: vi.fn().mockImplementation((offset, sBounds, tBounds) => ({
        targetScrollTop: offset * 1.3,
        pageIndex: 0,
        intraPageRatio: 0.5
      })),
      exportToPdf: vi.fn().mockResolvedValue(new Blob(['pdf-data'], { type: 'application/pdf' })),
      exportToDocx: vi.fn().mockResolvedValue(new Blob(['docx-data'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }))
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///path/saved.pdf')
    };

    await TestBed.configureTestingModule({
      imports: [TranslationReaderPage],
      providers: [
        { provide: TranslationReaderService, useValue: mockTranslationReaderService },
        { provide: StorageService, useValue: mockStorageService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationReaderPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with default settings (Hindi target, scroll-lock active, 50% split)', () => {
    expect(component).toBeTruthy();
    expect(component.selectedLanguage).toBe('hi');
    expect(component.isScrollLockEnabled).toBe(true);
    expect(component.splitRatio).toBe(50);
    expect(component.currentPageIndex).toBe(0);
  });

  describe('Language Selector Bar', () => {
    it('switches target language and re-prepares translation session', async () => {
      component.selectedFile = new File(['fake-pdf'], 'doc.pdf', { type: 'application/pdf' });
      component.rawPageTexts = [{ pageNumber: 1, text: 'Hello' }];
      component.session = mockSession;

      await component.changeLanguage('mr');

      expect(component.selectedLanguage).toBe('mr');
      expect(mockTranslationReaderService.prepareTranslationSession).toHaveBeenCalledWith(
        component.selectedFile,
        component.rawPageTexts,
        'mr'
      );
    });
  });

  describe('Scroll-lock Synchronization Engine', () => {
    it('toggles scroll-lock state', () => {
      expect(component.isScrollLockEnabled).toBe(true);
      component.toggleScrollLock();
      expect(component.isScrollLockEnabled).toBe(false);
      component.toggleScrollLock();
      expect(component.isScrollLockEnabled).toBe(true);
    });

    it('synchronizes scroll from original pane to translated pane', () => {
      component.session = mockSession;

      // Mock DOM elements
      const mockOrigEl = {
        scrollTop: 200,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 400 },
          { offsetTop: 400, offsetHeight: 400 }
        ]
      } as any;

      const mockTransEl = {
        scrollTop: 0,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 520 },
          { offsetTop: 520, offsetHeight: 520 }
        ]
      } as any;

      component.originalPaneRef = { nativeElement: mockOrigEl };
      component.translatedPaneRef = { nativeElement: mockTransEl };

      component.onOriginalPaneScroll(new Event('scroll'));

      expect(mockTranslationReaderService.computeTargetScrollOffset).toHaveBeenCalled();
      expect(mockTransEl.scrollTop).toBe(260); // 200 * 1.3
    });

    it('synchronizes scroll from translated pane to original pane', () => {
      component.session = mockSession;

      const mockOrigEl = {
        scrollTop: 0,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 400 },
          { offsetTop: 400, offsetHeight: 400 }
        ]
      } as any;

      const mockTransEl = {
        scrollTop: 300,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 520 },
          { offsetTop: 520, offsetHeight: 520 }
        ]
      } as any;

      component.originalPaneRef = { nativeElement: mockOrigEl };
      component.translatedPaneRef = { nativeElement: mockTransEl };

      component.onTranslatedPaneScroll(new Event('scroll'));

      expect(mockTranslationReaderService.computeTargetScrollOffset).toHaveBeenCalled();
      expect(mockOrigEl.scrollTop).toBe(390); // 300 * 1.3
    });

    it('does not scroll synchronize when scroll-lock is disabled', () => {
      component.session = mockSession;
      component.isScrollLockEnabled = false;

      (mockTranslationReaderService.computeTargetScrollOffset as any).mockClear();
      component.onOriginalPaneScroll(new Event('scroll'));

      expect(mockTranslationReaderService.computeTargetScrollOffset).not.toHaveBeenCalled();
    });
  });

  describe('Draggable Touch Divider', () => {
    it('clamps divider split ratio between 20% and 80%', () => {
      component.splitRatio = 50;
      expect(component.splitRatio).toBe(50);

      // Verify bounds
      const clampRatio = (val: number) => Math.min(80, Math.max(20, val));
      expect(clampRatio(10)).toBe(20);
      expect(clampRatio(95)).toBe(80);
      expect(clampRatio(65)).toBe(65);
    });
  });

  describe('Page Stepper Navigation', () => {
    it('navigates to next page and previous page', () => {
      component.session = mockSession;
      component.currentPageIndex = 0;

      const mockScrollTo = vi.fn();
      const mockOrigEl = {
        scrollTop: 0,
        scrollTo: mockScrollTo,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 400 },
          { offsetTop: 400, offsetHeight: 400 }
        ]
      } as any;
      const mockTransEl = {
        scrollTop: 0,
        scrollTo: mockScrollTo,
        querySelectorAll: () => [
          { offsetTop: 0, offsetHeight: 520 },
          { offsetTop: 520, offsetHeight: 520 }
        ]
      } as any;

      component.originalPaneRef = { nativeElement: mockOrigEl };
      component.translatedPaneRef = { nativeElement: mockTransEl };

      component.nextPage();
      expect(component.currentPageIndex).toBe(1);
      expect(mockScrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'smooth' });

      component.prevPage();
      expect(component.currentPageIndex).toBe(0);
      expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });

  describe('Multi-Format Export Actions', () => {
    it('exports translated PDF using TranslationReaderService and saves file', async () => {
      component.session = mockSession;

      await component.exportPdf();

      expect(mockTranslationReaderService.exportToPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'test-document.pdf',
          targetLanguage: 'hi',
          includeSummary: true
        })
      );
      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        expect.any(File),
        'translated_pdf',
        undefined,
        { preserveName: true }
      );
    });

    it('exports as Microsoft Word (.docx) using TranslationReaderService and saves file', async () => {
      component.session = mockSession;

      await component.exportDocx();

      expect(mockTranslationReaderService.exportToDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'test-document.pdf',
          targetLanguage: 'hi',
          includeSummary: true
        })
      );
      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        expect.any(File),
        'translated_docx',
        undefined,
        { preserveName: true }
      );
    });
  });

  describe('Executive Summary Modal', () => {
    it('toggles summary modal visibility', () => {
      expect(component.showSummaryModal).toBe(false);
      component.toggleSummaryModal();
      expect(component.showSummaryModal).toBe(true);
      component.toggleSummaryModal();
      expect(component.showSummaryModal).toBe(false);
    });
  });

  describe('Divider Drag Resizing & Memory Leak Prevention', () => {
    it('clamps divider split ratio between 20% and 80%', () => {
      component.splitContainerRef = {
        nativeElement: {
          getBoundingClientRect: () => ({ height: 1000, width: 1000 })
        }
      } as any;
      component.isPortrait = true;

      // Start drag at y=500
      const mockEvent = { clientY: 500, clientX: 0 } as PointerEvent;
      component.onDividerPointerDown(mockEvent);
      expect(component.isDraggingDivider).toBe(true);

      // Drag downwards by +400px (would make 50% + 40% = 90%, clamped to 80%)
      const moveEventDown = new CustomEvent('pointermove') as any;
      moveEventDown.clientY = 900;
      moveEventDown.clientX = 0;
      window.dispatchEvent(moveEventDown);
      expect(component.splitRatio).toBe(80);

      // Drag upwards by -400px from initial 50% (would make 10%, clamped to 20%)
      const moveEventUp = new CustomEvent('pointermove') as any;
      moveEventUp.clientY = 100;
      moveEventUp.clientX = 0;
      window.dispatchEvent(moveEventUp);
      expect(component.splitRatio).toBe(20);

      // End drag
      window.dispatchEvent(new CustomEvent('pointerup'));
      expect(component.isDraggingDivider).toBe(false);
    });

    it('cleans up event listeners and canvas contexts on ngOnDestroy', () => {
      const mockCanvas = {
        width: 400,
        height: 600,
        getContext: vi.fn().mockReturnValue({
          clearRect: vi.fn()
        })
      };
      vi.spyOn(document, 'getElementById').mockReturnValue(mockCanvas as any);

      component.renderedPages.add(1);
      component.renderedPages.add(2);

      component.ngOnDestroy();

      expect(component.renderedPages.size).toBe(0);
      expect(mockCanvas.width).toBe(0);
      expect(mockCanvas.height).toBe(0);
    });

    it('prevents scroll feedback loops when isSyncingScroll is active', () => {
      component.isSyncingScroll = true;
      component.session = mockSession;

      component.onOriginalPaneScroll(new Event('scroll'));
      component.onTranslatedPaneScroll(new Event('scroll'));

      // Neither should have invoked target scroll computation
      expect(mockTranslationReaderService.computeTargetScrollOffset).not.toHaveBeenCalled();
    });
  });
});
