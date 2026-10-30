import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { resolveAngularResources } from '../../../test-setup';
import { PdfOcrPage } from './pdf-ocr.page';
import { OcrModelManagerService } from '../../core/services/ocr-model-manager.service';
import { OcrService } from '../../core/services/ocr.service';
import { ScriptDetectionService } from '../../core/services/script-detection.service';
import { ToastService } from '../../core/services/toast.service';
import { Preferences } from '@capacitor/preferences';

describe('PdfOcrPage — Offline Language Delivery & Modal UI', () => {
  let component: PdfOcrPage;
  let modelManager: OcrModelManagerService;
  let scriptDetectionService: ScriptDetectionService;

  beforeEach(async () => {
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [PdfOcrPage],
      providers: [
        provideRouter([]),
        OcrModelManagerService,
        OcrService,
        ScriptDetectionService,
        {
          provide: ToastService,
          useValue: {
            show: vi.fn(),
            success: vi.fn(),
            error: vi.fn()
          }
        }
      ]
    });

    const fixture = TestBed.createComponent(PdfOcrPage);
    component = fixture.componentInstance;
    modelManager = TestBed.inject(OcrModelManagerService);
    scriptDetectionService = TestBed.inject(ScriptDetectionService);
    await component.ngOnInit();
  });

  afterEach(async () => {
    await Preferences.clear();
  });

  it('defaults to English with zero download confirmation modal', () => {
    expect(component.selectedLanguage).toBe('eng');
    expect(component.showDownloadConfirmModal).toBe(false);
  });

  it('selects English directly without opening download confirmation modal', async () => {
    await component.onLanguagePillClicked('eng');
    expect(component.selectedLanguage).toBe('eng');
    expect(component.showDownloadConfirmModal).toBe(false);
  });

  it('shows download confirmation modal when user triggers download for a non-cached language', async () => {
    vi.spyOn(modelManager, 'isModelCached').mockResolvedValue(false);

    const mockEvent = new MouseEvent('click');
    vi.spyOn(mockEvent, 'stopPropagation');
    component.promptModelDownload(mockEvent, 'hin');

    expect(component.showDownloadConfirmModal).toBe(true);
    expect(component.pendingDownloadModel).toBeDefined();
    expect(component.pendingDownloadModel?.code).toBe('hin');
    expect(component.pendingDownloadModel?.fileSizeMB).toBe(11.8);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  it('opens and closes OCR language manager bottom sheet', () => {
    expect(component.isLanguageManagerOpen).toBe(false);

    component.openLanguageManager();
    expect(component.isLanguageManagerOpen).toBe(true);

    component.closeLanguageManager();
    expect(component.isLanguageManagerOpen).toBe(false);
  });

  it('updates cached languages on model downloaded callback', () => {
    component.pendingDownloadModel = modelManager.getModel('hin');
    component.onModelDownloaded('hin');

    expect(component.cachedLanguageCodes.has('hin')).toBe(true);
    expect(component.selectedLanguage).toBe('hin');
  });

  it('opens and closes O1 language selector bottom sheet and confirms bilingual combination', async () => {
    expect(component.isLanguageSelectorOpen).toBe(false);

    component.openLanguageSelector();
    expect(component.isLanguageSelectorOpen).toBe(true);

    vi.spyOn(modelManager, 'isModelCached').mockResolvedValue(true);
    await component.onLanguagesConfirmed(['tam', 'eng']);

    expect(component.selectedLanguage).toBe('tam');
    expect(component.selectedSecondaryLang).toBe('eng');
    expect(component.getSelectedLanguagesList()).toEqual(['tam', 'eng']);

    component.closeLanguageSelector();
    expect(component.isLanguageSelectorOpen).toBe(false);
  });

  describe('O2 — Automatic Script & Language Detection UI Flow', () => {
    it('auto-selects language and shows smart detection banner when confidence >= 70%', async () => {
      const devanagariText = 'नमस्ते भारत, यह एक नमूना दस्तावेज़ है जिसे स्वचालित रूप से पहचाना गया है।';
      const mockFile = new File([devanagariText], 'document.pdf', { type: 'application/pdf' });

      // Simulate detection pre-pass
      await component.runScriptDetection(mockFile, true, devanagariText);

      expect(component.scriptDetectionResult).toBeDefined();
      expect(component.scriptDetectionResult?.detectedScript).toBe('devanagari');
      expect(component.scriptDetectionResult?.confidence).toBeGreaterThanOrEqual(70);
      expect(component.scriptDetectionResult?.isConfident).toBe(true);

      // Auto-selected suggested language
      expect(component.selectedLanguage).toBe('hin');
      expect(component.showSmartDetectionBanner).toBe(true);
      expect(component.showLowConfidenceSheet).toBe(false);

      // Change button opens language selector
      component.onChangeDetectedScript();
      expect(component.isLanguageSelectorOpen).toBe(true);
    });

    it('triggers low-confidence selection sheet on mixed text (< 70%) rather than silently guessing', async () => {
      const mixedText = 'Invoice Number 492042 नमस्ते धन्यवाद';
      const mockFile = new File([mixedText], 'bilingual.pdf', { type: 'application/pdf' });

      await component.runScriptDetection(mockFile, true, mixedText);

      expect(component.scriptDetectionResult).toBeDefined();
      expect(component.scriptDetectionResult?.confidence).toBeLessThan(70);
      expect(component.scriptDetectionResult?.isConfident).toBe(false);

      // Never silently locks into guess when uncertain
      expect(component.showSmartDetectionBanner).toBe(false);
      expect(component.showLowConfidenceSheet).toBe(true);

      // Offers top 2 guesses as quick pills
      const topSuggestions = component.getTopSuggestions();
      expect(topSuggestions.length).toBeGreaterThanOrEqual(2);
      expect(topSuggestions).toContain('hin');
      expect(topSuggestions).toContain('eng');
    });

    it('selects quick pill from low-confidence sheet and persists user preference in @capacitor/preferences', async () => {
      const mixedText = 'Invoice Number 101 नमस्ते धन्यवाद';
      const mockFile = new File([mixedText], 'order.pdf', { type: 'application/pdf' });

      await component.runScriptDetection(mockFile, true, mixedText);
      expect(component.showLowConfidenceSheet).toBe(true);

      // User taps Hindi suggestion pill
      await component.onSelectSuggestion('hin');

      expect(component.selectedLanguage).toBe('hin');
      expect(component.showLowConfidenceSheet).toBe(false);
      expect(component.showSmartDetectionBanner).toBe(true);

      // Preference is saved
      const savedPref = await scriptDetectionService.getScriptPreference('devanagari');
      expect(savedPref).toBe('hin');
    });

    it('preserves user preference override across subsequent document detections', async () => {
      // User previously overrode Devanagari to Marathi (mar)
      await scriptDetectionService.saveScriptPreference('devanagari', 'mar');

      const devanagariText = 'नमस्ते भारत, यह एक नमूना दस्तावेज़ है।';
      const mockFile = new File([devanagariText], 'doc.pdf', { type: 'application/pdf' });

      await component.runScriptDetection(mockFile, true, devanagariText);

      // Suggested language should now be the saved override (mar)
      expect(component.selectedLanguage).toBe('mar');
      expect(component.scriptDetectionResult?.suggestedLanguage).toBe('mar');
      expect(component.showSmartDetectionBanner).toBe(true);
    });
  });
});
