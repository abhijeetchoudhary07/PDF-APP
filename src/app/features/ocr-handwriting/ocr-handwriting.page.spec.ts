import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { of } from 'rxjs';

import { resolveAngularResources } from '../../../test-setup';
import { OcrHandwritingPage } from './ocr-handwriting.page';
import { OcrHandwritingService } from '../../core/services/ocr-handwriting.service';
import { OcrService } from '../../core/services/ocr.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { TranslationService } from '../../core/services/translation.service';
import { HandwritingOcrResult } from '../../core/models/ocr.models';

describe('OcrHandwritingPage — O3 Handwriting Mode', () => {
  let fixture: ComponentFixture<OcrHandwritingPage>;
  let component: OcrHandwritingPage;
  let handwritingService: OcrHandwritingService;
  let ocrService: OcrService;
  let router: Router;
  let fileService: FileService;
  let shareService: ShareService;
  let toastService: ToastService;

  const mockOcrResult: HandwritingOcrResult = {
    fullText: 'First handwritten line\nSecond handwritten line',
    averageConfidence: 86,
    lines: [
      {
        id: 'hw_line_1',
        text: 'First handwritten line',
        confidence: 88,
        bbox: { x0: 20, y0: 30, x1: 220, y1: 70 },
        cropDataUrl: 'data:image/jpeg;base64,mockCrop1',
        wordCount: 3
      },
      {
        id: 'hw_line_2',
        text: 'Second handwritten line',
        confidence: 84,
        bbox: { x0: 20, y0: 80, x1: 240, y1: 120 },
        cropDataUrl: 'data:image/jpeg;base64,mockCrop2',
        wordCount: 3
      }
    ],
    originalImageUrl: 'data:image/jpeg;base64,mockOriginalImage',
    processedImageUrl: 'data:image/jpeg;base64,mockSauvolaImage',
    sourceFileName: 'notes.png',
    pageCount: 1,
    lineCount: 2,
    wordCount: 6,
    acknowledgedExpectations: true,
    isHandwritingPipeline: true
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [OcrHandwritingPage],
      providers: [
        provideRouter([]),
        OcrHandwritingService,
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

    fixture = TestBed.createComponent(OcrHandwritingPage);
    component = fixture.componentInstance;
    handwritingService = TestBed.inject(OcrHandwritingService);
    ocrService = TestBed.inject(OcrService);
    router = TestBed.inject(Router);
    fileService = TestBed.inject(FileService);
    shareService = TestBed.inject(ShareService);
    toastService = TestBed.inject(ToastService);

    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await component.ngOnInit();
  });

  afterEach(async () => {
    await Preferences.clear();
    if (handwritingService) {
      await handwritingService.terminateWorker();
    }
    TestBed.resetTestingModule();
  });

  describe('Mode Switcher UI', () => {
    it('navigates to printed OCR route when Printed Document mode pill is clicked', () => {
      component.navigateToPrinted();
      expect(router.navigate).toHaveBeenCalledWith(['/features/pdf-ocr']);
    });
  });

  describe('Upfront Expectation Management', () => {
    it('requires expectation notice acknowledgement before starting recognition', async () => {
      component.hasAcknowledgedExpectations = false;
      component.selectedFile = new File(['mock'], 'handwritten_note.png', { type: 'image/png' });

      await component.startHandwritingOcr();

      // Expectation modal opens and recognition does not run
      expect(component.showExpectationModal).toBe(true);
      expect(component.currentStep).toBe('select');
    });

    it('acknowledges expectation notice, saves preference, and starts OCR if file is selected', async () => {
      const recognizeSpy = vi.spyOn(handwritingService, 'recognizeHandwriting').mockResolvedValue(mockOcrResult);

      component.selectedFile = new File(['mock'], 'handwritten_note.png', { type: 'image/png' });
      component.showExpectationModal = true;

      await component.acknowledgeAndContinue();

      expect(component.hasAcknowledgedExpectations).toBe(true);
      expect(component.showExpectationModal).toBe(false);
      expect(recognizeSpy).toHaveBeenCalledWith(
        component.selectedFile,
        expect.objectContaining({ acknowledgedExpectations: true })
      );
    });
  });

  describe('Dedicated Handwriting Pipeline & Coordinate Links', () => {
    it('executes handwriting recognition and populates split-view verification data', async () => {
      vi.spyOn(handwritingService, 'recognizeHandwriting').mockResolvedValue(mockOcrResult);

      component.hasAcknowledgedExpectations = true;
      component.selectedFile = new File(['mock'], 'handwritten_note.png', { type: 'image/png' });

      await component.startHandwritingOcr();

      expect(component.currentStep).toBe('result');
      expect(component.ocrResult).toEqual(mockOcrResult);
      expect(component.editableFullText).toBe(mockOcrResult.fullText);
      expect(component.activeLineId).toBe('hw_line_1');
      expect(component.ocrResult?.lines[0].cropDataUrl).toBe('data:image/jpeg;base64,mockCrop1');
      expect(component.ocrResult?.lines[0].bbox).toEqual({ x0: 20, y0: 30, x1: 220, y1: 70 });
    });

    it('sets active line and scrolls image viewer when tapping a line', () => {
      component.ocrResult = mockOcrResult;
      const scrollSpy = vi.fn();
      component.imageScrollContainer = {
        nativeElement: {
          scrollTo: scrollSpy,
          clientHeight: 400
        } as any
      };

      const line2 = mockOcrResult.lines[1];
      component.setActiveLine(line2);

      expect(component.activeLineId).toBe('hw_line_2');
      expect(scrollSpy).toHaveBeenCalled();
    });

    it('updates full text and word count when user edits recognized text', () => {
      component.ocrResult = { ...mockOcrResult };
      component.editableFullText = 'Corrected handwriting line';
      component.onFullTextEdited();

      expect(component.getWordCount()).toBe(3);
      expect(component.ocrResult.fullText).toBe('Corrected handwriting line');
    });

    it('computes responsive percentage bounding box style when image dimensions are available', () => {
      component.ocrResult = {
        ...mockOcrResult,
        imageWidth: 1000,
        imageHeight: 500
      };

      const line = mockOcrResult.lines[0]; // bbox: { x0: 20, y0: 30, x1: 220, y1: 70 }
      const style = component.getBboxStyle(line);

      // (20 / 1000) * 100 = 2%
      expect(style.left).toBe('2.00%');
      // (30 / 500) * 100 = 6%
      expect(style.top).toBe('6.00%');
      // ((220 - 20) / 1000) * 100 = 20%
      expect(style.width).toBe('20.00%');
      // ((70 - 30) / 500) * 100 = 8%
      expect(style.height).toBe('8.00%');
    });

    it('updates individual line text and synchronizes full text on line edit', () => {
      component.ocrResult = {
        ...mockOcrResult,
        lines: [
          { ...mockOcrResult.lines[0] },
          { ...mockOcrResult.lines[1] }
        ]
      };

      const event = { target: { value: 'Edited first line' } } as any;
      component.onLineTextEdited(component.ocrResult.lines[0], event);

      expect(component.ocrResult.lines[0].text).toBe('Edited first line');
      expect(component.ocrResult.lines[0].wordCount).toBe(3);
      expect(component.editableFullText).toBe('Edited first line\nSecond handwritten line');
    });

    it('resets scan state and zoom to initial select step on resetScan', () => {
      component.currentStep = 'result';
      component.ocrResult = mockOcrResult;
      component.imageZoom = 1.75;
      component.activeLineId = 'hw_line_1';

      component.resetScan();

      expect(component.currentStep).toBe('select');
      expect(component.ocrResult).toBeNull();
      expect(component.imageZoom).toBe(1.0);
      expect(component.activeLineId).toBeNull();
      expect(component.selectedFile).toBeUndefined();
    });
  });

  describe('Image Viewer Controls', () => {
    it('zooms in, zooms out, and resets zoom scale', () => {
      expect(component.imageZoom).toBe(1.0);

      component.zoomIn();
      expect(component.imageZoom).toBe(1.25);

      component.zoomOut();
      expect(component.imageZoom).toBe(1.0);

      component.zoomIn();
      component.zoomIn();
      expect(component.imageZoom).toBe(1.5);

      component.resetZoom();
      expect(component.imageZoom).toBe(1.0);
    });

    it('toggles filter mode between original scan and Sauvola binarization', () => {
      expect(component.imageFilterMode).toBe('original');

      component.toggleImageFilter();
      expect(component.imageFilterMode).toBe('sauvola');

      component.toggleImageFilter();
      expect(component.imageFilterMode).toBe('original');
    });
  });

  describe('Sticky Bottom Actions: Export, Share, Copy', () => {
    beforeEach(() => {
      component.ocrResult = mockOcrResult;
      component.editableFullText = mockOcrResult.fullText;
    });

    it('copies text to system clipboard and shows success toast', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock
        }
      });

      await component.copyText();

      expect(writeTextMock).toHaveBeenCalledWith(mockOcrResult.fullText);
      expect(toastService.success).toHaveBeenCalled();
    });

    it('shares recognized text via ShareService', async () => {
      await component.shareRecognizedText();

      expect(shareService.share).toHaveBeenCalledWith({
        title: expect.stringContaining('notes.png'),
        text: mockOcrResult.fullText
      });
    });

    it('exports text and scan files using FileService', () => {
      component.exportTextAndScans();

      expect(fileService.downloadFile).toHaveBeenCalledTimes(2);
      expect(toastService.success).toHaveBeenCalled();
    });
  });

  describe('Zero Regression on Standard Print OCR', () => {
    it('does not alter OcrService print-mode behavior or parameters', () => {
      expect(ocrService.supportedLanguages.length).toBe(5);
      expect(ocrService.expandedLanguages.length).toBe(18);
      expect((ocrService as any).applySauvolaBinarization).toBeUndefined();
    });
  });
});
