import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

import { resolveAngularResources } from '../../../test-setup';
import { OcrCorrectPage } from './ocr-correct.page';
import { OcrConfidenceService } from '../../core/services/ocr-confidence.service';
import { OcrService } from '../../core/services/ocr.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import {
  ConfidenceDocumentResult,
  ConfidenceWord
} from '../../core/models/ocr-confidence.types';
import { OcrDocumentResult } from '../../core/models/ocr.models';

describe('OcrCorrectPage — O4 OCR Confidence Tools & Correction Dictionary', () => {
  let fixture: ComponentFixture<OcrCorrectPage>;
  let component: OcrCorrectPage;
  let confidenceService: OcrConfidenceService;
  let ocrService: OcrService;
  let fileService: FileService;
  let toastService: ToastService;

  const mockWordLow: ConfidenceWord = {
    id: 'w_low_1',
    text: 'vvord',
    originalText: 'vvord',
    confidence: 48,
    tier: 'low',
    bbox: { x: 20, y: 30, width: 60, height: 20, x0: 20, y0: 30, x1: 80, y1: 50 },
    pageNumber: 1,
    cropDataUrl: 'data:image/jpeg;base64,mockCrop',
    isCorrected: false,
    isReviewed: false,
    suggestedReplacements: ['word', 'void']
  };

  const mockWordHigh: ConfidenceWord = {
    id: 'w_high_1',
    text: 'Hello',
    originalText: 'Hello',
    confidence: 96,
    tier: 'high',
    bbox: { x: 90, y: 30, width: 50, height: 20, x0: 90, y0: 30, x1: 140, y1: 50 },
    pageNumber: 1,
    cropDataUrl: 'data:image/jpeg;base64,mockCrop2',
    isCorrected: false,
    isReviewed: false
  };

  const mockAuditDoc: ConfidenceDocumentResult = {
    fileName: 'scanned_note.pdf',
    totalPages: 1,
    pages: [
      {
        pageNumber: 1,
        canvasDataUrl: 'data:image/jpeg;base64,mockCanvas',
        width: 600,
        height: 800,
        words: [mockWordLow, mockWordHigh],
        stats: {
          totalWords: 2,
          highCount: 1,
          mediumCount: 0,
          lowCount: 1,
          highPercentage: 50,
          mediumPercentage: 0,
          lowPercentage: 50,
          averageConfidence: 72
        },
        text: 'vvord Hello'
      }
    ],
    overallStats: {
      totalWords: 2,
      highCount: 1,
      mediumCount: 0,
      lowCount: 1,
      highPercentage: 50,
      mediumPercentage: 0,
      lowPercentage: 50,
      averageConfidence: 72
    },
    fullText: 'vvord Hello',
    allWords: [mockWordLow, mockWordHigh],
    lowConfidenceWords: [mockWordLow]
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [OcrCorrectPage],
      providers: [
        provideRouter([]),
        OcrConfidenceService,
        OcrService,
        TranslationService,
        {
          provide: FileService,
          useValue: {
            downloadFile: vi.fn(),
            downloadBlob: vi.fn()
          }
        },
        {
          provide: ShareService,
          useValue: {
            share: vi.fn().mockResolvedValue(true)
          }
        },
        {
          provide: ToastService,
          useValue: {
            show: vi.fn(),
            success: vi.fn(),
            error: vi.fn()
          }
        },
        {
          provide: HistoryService,
          useValue: {
            addHistoryItem: vi.fn().mockResolvedValue(true)
          }
        },
        {
          provide: DocumentBridgeService,
          useValue: {
            getOcrTarget: vi.fn().mockReturnValue(null),
            setIntelligenceTarget: vi.fn()
          }
        }
      ]
    });

    fixture = TestBed.createComponent(OcrCorrectPage);
    component = fixture.componentInstance;
    confidenceService = TestBed.inject(OcrConfidenceService);
    ocrService = TestBed.inject(OcrService);
    fileService = TestBed.inject(FileService);
    toastService = TestBed.inject(ToastService);

    await component.ngOnInit();
  });

  afterEach(async () => {
    await Preferences.clear();
    await confidenceService.terminateWorker();
    TestBed.resetTestingModule();
  });

  describe('Component Initialization & Audit Pipeline', () => {
    it('loads existing dictionary rules on initialization', () => {
      expect(component.dictionaryRules.length).toBeGreaterThan(0);
      expect(component.currentStep).toBe('select');
    });

    it('processes document file and enters quality audit view', async () => {
      const mockRawOcr: OcrDocumentResult = {
        fileName: 'sample.png',
        totalPages: 1,
        pages: [{
          pageNumber: 1,
          text: 'vvord Hello',
          confidence: 72,
          words: [
            { text: 'vvord', confidence: 48, bbox: { x0: 20, y0: 30, x1: 80, y1: 50 } },
            { text: 'Hello', confidence: 96, bbox: { x0: 90, y0: 30, x1: 140, y1: 50 } }
          ],
          language: 'eng',
          status: 'completed'
        }],
        fullText: 'vvord Hello',
        averageConfidence: 72,
        languages: ['eng']
      };

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      vi.spyOn(component as any, 'renderFileToCanvases').mockResolvedValue([mockCanvas]);
      vi.spyOn(ocrService, 'performOcr').mockResolvedValue(mockRawOcr);
      vi.spyOn(confidenceService, 'auditOcrDocument').mockResolvedValue(mockAuditDoc);

      const testFile = new File(['dummy'], 'sample.png', { type: 'image/png' });
      component.selectedFile = testFile;
      await component.startQualityAudit();

      expect(component.currentStep).toBe('audit');
      expect(component.confidenceDoc).toBeDefined();
      expect(component.confidenceDoc?.overallStats.averageConfidence).toBe(72);
      expect(component.lowConfidenceWords.length).toBe(1);
    });
  });

  describe('Interactive Heatmap & Tier Filters', () => {
    beforeEach(() => {
      component.confidenceDoc = { ...mockAuditDoc };
      component.currentStep = 'audit';
    });

    it('computes responsive percentage bounding box coordinates for heatmap word boxes', () => {
      const style = component.getWordBoxStyle(mockWordLow);
      // bbox: { x: 20, y: 30, width: 60, height: 20 }, page: 600x800
      // x: (20/600)*100 = 3.33%
      // y: (30/800)*100 = 3.75%
      // width: (60/600)*100 = 10.00%
      // height: (20/800)*100 = 2.50%
      expect(style.left).toBe('3.33%');
      expect(style.top).toBe('3.75%');
      expect(style.width).toBe('10.00%');
      expect(style.height).toBe('2.50%');
    });

    it('toggles confidence heatmap switch', () => {
      expect(component.showHeatmap).toBe(true);
      component.showHeatmap = false;
      expect(component.showHeatmap).toBe(false);
    });

    it('filters words by tier (all, high, medium, low)', () => {
      component.tierFilter = 'all';
      expect(component.filteredWords.length).toBe(2);

      component.tierFilter = 'high';
      expect(component.filteredWords.length).toBe(1);
      expect(component.filteredWords[0].tier).toBe('high');

      component.tierFilter = 'low';
      expect(component.filteredWords.length).toBe(1);
      expect(component.filteredWords[0].tier).toBe('low');

      component.tierFilter = 'medium';
      expect(component.filteredWords.length).toBe(0);
    });

    it('updates zoom scale within limits', () => {
      expect(component.zoomLevel).toBe(1.0);
      component.zoomIn();
      expect(component.zoomLevel).toBe(1.2);
      component.zoomOut();
      expect(component.zoomLevel).toBe(1.0);
      component.resetZoom();
      expect(component.zoomLevel).toBe(1.0);
    });
  });

  describe('Quick Correction Drawer & Dictionary Actions', () => {
    beforeEach(() => {
      component.confidenceDoc = JSON.parse(JSON.stringify(mockAuditDoc));
      component.currentStep = 'audit';
    });

    it('opens Quick Correction drawer on word selection', () => {
      component.openCorrectionDrawer(mockWordLow);

      expect(component.isCorrectionDrawerOpen).toBe(true);
      expect(component.selectedWord).toEqual(mockWordLow);
      expect(component.correctionInput).toBe('vvord');
    });

    it('applies suggestion chip to correction input', () => {
      component.openCorrectionDrawer(mockWordLow);
      component.chooseSuggestion('word');

      expect(component.correctionInput).toBe('word');
    });

    it('replaces single word and updates document text layer and confidence stats', async () => {
      component.openCorrectionDrawer(mockWordLow);
      component.correctionInput = 'word';
      component.addToDictionaryToggle = true;

      await component.applyCorrection(false);

      expect(component.confidenceDoc?.pages[0].words[0].text).toBe('word');
      expect(component.confidenceDoc?.pages[0].words[0].isCorrected).toBe(true);
      expect(component.confidenceDoc?.fullText).toContain('word Hello');
      expect(component.isCorrectionDrawerOpen).toBe(false);
      expect(toastService.success).toHaveBeenCalled();
    });

    it('re-OCRs targeted region at 3x DPR updating only that word', async () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      component.renderedCanvases = [mockCanvas];
      component.currentPageIndex = 0;

      vi.spyOn(confidenceService, 'reOcrRegion').mockResolvedValue({
        text: 'word',
        confidence: 95,
        words: []
      });

      component.selectedWord = { ...mockWordLow };
      await component.enhanceAndReOcr();

      expect(component.selectedWord.text).toBe('word');
      expect(component.selectedWord.confidence).toBe(95);
      expect(component.selectedWord.tier).toBe('high');
      expect(component.selectedWord.isCorrected).toBe(true);
      expect(toastService.success).toHaveBeenCalled();
    });
  });

  describe('Carousel of Low-Confidence Words', () => {
    beforeEach(() => {
      component.confidenceDoc = JSON.parse(JSON.stringify(mockAuditDoc));
      component.updateLowConfidenceQueue();
      component.currentStep = 'audit';
    });

    it('accepts low-confidence word, marking it reviewed and updating queue', () => {
      const wordToAccept = component.lowConfidenceWords[0];
      expect(wordToAccept).toBeDefined();

      component.acceptCarouselWord(wordToAccept);

      expect(wordToAccept.isReviewed).toBe(true);
      expect(component.lowConfidenceWords.length).toBe(0);
      expect(toastService.success).toHaveBeenCalledWith('Accepted "vvord"');
    });
  });

  describe('Persistent Dictionary Management Modal', () => {
    it('opens and closes dictionary modal', () => {
      component.openDictionaryModal();
      expect(component.isDictionaryModalOpen).toBe(true);

      component.closeDictionaryModal();
      expect(component.isDictionaryModalOpen).toBe(false);
    });

    it('adds new custom dictionary rule and refreshes active rules list', async () => {
      component.openDictionaryModal();
      component.newRuleTarget = 'rnodem';
      component.newRuleReplacement = 'modem';
      component.newRuleWholeWord = true;

      await component.addRuleFromModal();

      expect(component.dictionaryRules.some(r => r.target === 'rnodem' && r.replacement === 'modem')).toBe(true);
      expect(toastService.success).toHaveBeenCalled();
    });

    it('deletes dictionary rule', async () => {
      const rule = await confidenceService.addCorrectionRule('temp', 'temporary');
      component.dictionaryRules = await confidenceService.loadDictionary();

      await component.deleteRuleFromModal(rule.id);

      expect(component.dictionaryRules.some(r => r.id === rule.id)).toBe(false);
      expect(toastService.success).toHaveBeenCalled();
    });
  });

  describe('Sticky Bottom Actions: Save & Export', () => {
    beforeEach(() => {
      component.confidenceDoc = { ...mockAuditDoc };
      component.currentStep = 'audit';
    });

    it('downloads corrected text file and quality audit JSON via FileService', async () => {
      await component.saveCorrectedDocument();

      expect(fileService.downloadFile).toHaveBeenCalledTimes(2);
      expect(toastService.success).toHaveBeenCalled();
    });

    it('generates and downloads corrected searchable PDF when original file is present', async () => {
      component.selectedFile = new File(['%PDF-1.4 mock'], 'scanned_note.pdf', { type: 'application/pdf' });
      const mockPdfFile = new File(['mockPdfContent'], 'scanned_note_searchable.pdf', { type: 'application/pdf' });
      vi.spyOn(ocrService, 'generateSearchablePdf').mockResolvedValue(mockPdfFile);

      await component.saveCorrectedDocument();

      expect(ocrService.generateSearchablePdf).toHaveBeenCalled();
      // Text file + JSON audit file + Corrected Searchable PDF = 3 downloads
      expect(fileService.downloadFile).toHaveBeenCalledTimes(3);
      expect(toastService.success).toHaveBeenCalled();
    });
  });
});
