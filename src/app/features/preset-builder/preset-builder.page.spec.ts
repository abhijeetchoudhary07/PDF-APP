import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { PresetBuilderPage } from './preset-builder.page';
import { PresetBuilderService } from '../../core/services/preset-builder.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { PresetExtractionResult, Preset } from '../../core/models/preset.types';

describe('PresetBuilderPage — Split Mobile Review & Human Verification', () => {
  let component: PresetBuilderPage;
  let mockPresetBuilderService: Partial<PresetBuilderService>;
  let mockToastService: Partial<ToastService>;
  let mockRouter: Partial<Router>;
  let mockDocumentBridge: Partial<DocumentBridgeService>;
  let mockCdr: Partial<ChangeDetectorRef>;

  const sampleExtractionResult: PresetExtractionResult = {
    success: true,
    rawText: 'Photograph between 20 KB and 50 KB, 200 x 230 px, JPEG format, 200 DPI.',
    spec: {
      minKb: 20,
      maxKb: 50,
      width: 200,
      height: 230,
      unit: 'px',
      aspectRatio: '20:23',
      dpi: 200,
      format: 'JPEG',
      allowedFormats: ['JPEG'],
      targetType: 'photo',
      proposedName: 'Photo 200x230px 20-50KB',
      confidence: 0.95
    },
    highlightedSegments: [
      { text: 'Photograph between ', isHighlighted: false, type: 'plain' },
      { text: '20 KB and 50 KB', isHighlighted: true, type: 'size' },
      { text: ', ', isHighlighted: false, type: 'plain' },
      { text: '200 x 230 px', isHighlighted: true, type: 'dimension' },
      { text: ', JPEG format, ', isHighlighted: false, type: 'plain' },
      { text: '200 DPI', isHighlighted: true, type: 'dpi' },
      { text: '.', isHighlighted: false, type: 'plain' }
    ]
  };

  const sampleSavedPreset: Preset = {
    id: 'custom-spec-12345',
    name: 'Photo 200x230px 20-50KB',
    category: 'My Custom Presets',
    isCustom: true,
    photo: {
      minKb: 20,
      maxKb: 50,
      width: 200,
      height: 230,
      unit: 'px',
      format: 'JPEG',
      dpi: 200
    }
  };

  beforeEach(() => {
    mockPresetBuilderService = {
      parseInstructionSheet: vi.fn().mockResolvedValue(sampleExtractionResult),
      parseInstructionText: vi.fn().mockReturnValue(sampleExtractionResult),
      saveSpecificationProfile: vi.fn().mockResolvedValue(sampleSavedPreset),
      generateNeutralProfileName: vi.fn().mockReturnValue('Photo 200x230px 20-50KB'),
      sanitizeProfileName: vi.fn((name: string) => name),
      hasForbiddenInstitutionWords: vi.fn().mockReturnValue(false),
      convertToPixels: vi.fn((val: number) => val)
    };

    mockToastService = {
      show: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockDocumentBridge = {
      consumeDocument: vi.fn().mockReturnValue(null)
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PresetBuilderService, useValue: mockPresetBuilderService },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter },
        { provide: DocumentBridgeService, useValue: mockDocumentBridge },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    component = TestBed.runInInjectionContext(() => new PresetBuilderPage());
    component.ngOnInit();
  });

  it('initializes in idle state without results', () => {
    expect(component.extractionResult).toBeNull();
    expect(component.isProcessing).toBe(false);
    expect(component.saveSuccessNotice).toBe(false);
  });

  it('processes text guidelines and populates the split card form', () => {
    component.manualTextInput = 'Photograph between 20 KB and 50 KB, 200 x 230 px, JPEG format, 200 DPI.';
    component.handleExtractFromText();

    expect(mockPresetBuilderService.parseInstructionText).toHaveBeenCalledWith(component.manualTextInput);
    expect(component.extractionResult).toEqual(sampleExtractionResult);
    expect(component.form.maxKb).toBe(50);
    expect(component.form.minKb).toBe(20);
    expect(component.form.width).toBe(200);
    expect(component.form.height).toBe(230);
    expect(component.form.unit).toBe('px');
    expect(component.form.format).toBe('JPEG');
    expect(component.form.dpi).toBe(200);
    expect(component.form.profileName).toBe('Photo 200x230px 20-50KB');
  });

  it('processes uploaded instruction file through parseInstructionSheet', async () => {
    const fakeFile = new File(['upload guidelines'], 'instructions.pdf', { type: 'application/pdf' });

    await component.handleFileSelected(fakeFile);

    expect(mockPresetBuilderService.parseInstructionSheet).toHaveBeenCalledWith(fakeFile);
    expect(component.fileName).toBe('instructions.pdf');
    expect(component.form.width).toBe(200);
    expect(component.form.maxKb).toBe(50);
  });

  it('allows human verification and editing of extracted values prior to saving', () => {
    component.manualTextInput = 'Photograph 20-50 KB';
    component.handleExtractFromText();

    // Human edits values in the mobile form
    component.form.maxKb = 60;
    component.form.width = 300;
    component.form.height = 300;
    component.form.unit = 'px';

    expect(component.form.maxKb).toBe(60);
    expect(component.form.width).toBe(300);
  });

  it('switches target type and updates format accordingly', () => {
    component.manualTextInput = 'Guidelines';
    component.handleExtractFromText();

    component.setTargetType('pdf');
    expect(component.form.targetType).toBe('pdf');
    expect(component.form.format).toBe('PDF');

    component.setTargetType('signature');
    expect(component.form.targetType).toBe('signature');
    expect(component.form.format).toBe('JPEG');
  });

  it('saves specification profile to custom presets upon explicit user action', async () => {
    component.manualTextInput = 'Photograph between 20 KB and 50 KB';
    component.handleExtractFromText();

    await component.saveSpecificationProfile();

    expect(mockPresetBuilderService.saveSpecificationProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Photo 200x230px 20-50KB',
        targetType: 'photo',
        maxKb: 50,
        minKb: 20
      })
    );
    expect(component.saveSuccessNotice).toBe(true);
    expect(component.savedPresetId).toBe('custom-spec-12345');
  });

  it('handles unparseable sheet cleanly by displaying error toast', () => {
    (mockPresetBuilderService.parseInstructionText as any).mockReturnValue({
      success: false,
      rawText: 'General notice',
      spec: undefined,
      highlightedSegments: [],
      error: 'Could not detect upload specifications. No file size or dimension bounds found.'
    });

    component.manualTextInput = 'General notice';
    component.handleExtractFromText();

    expect(component.errorMessage).toContain('Could not detect upload specifications');
    expect(mockToastService.show).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Could not detect upload specifications')
    );
  });

  it('navigates to presets page when goToPresets is triggered', () => {
    component.goToPresets();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/features/presets']);
  });

  describe('Cybersecurity Stress-Testing & Bounds Protection in UI', () => {
    beforeEach(() => {
      component.manualTextInput = 'Photograph between 20 KB and 50 KB, 200 x 230 px';
      component.handleExtractFromText();
    });

    it('rejects saving when Max KB is 0 or negative', async () => {
      component.form.maxKb = 0;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('greater than 0 KB'));
      expect(mockPresetBuilderService.saveSpecificationProfile).not.toHaveBeenCalled();

      component.form.maxKb = -10;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('greater than 0 KB'));
    });

    it('rejects saving when Min KB is negative or exceeds Max KB', async () => {
      component.form.minKb = -5;
      component.form.maxKb = 50;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('cannot be negative'));

      component.form.minKb = 60;
      component.form.maxKb = 50;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('cannot exceed maximum'));
    });

    it('rejects saving when dimensions are negative or zero', async () => {
      component.form.width = 0;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('Width must be greater than 0'));

      component.form.width = 200;
      component.form.height = -50;
      await component.saveSpecificationProfile();
      expect(mockToastService.show).toHaveBeenCalledWith('warning', expect.stringContaining('Height must be greater than 0'));
    });

    it('detects and sanitizes forbidden government or trademarked scheme names', async () => {
      (mockPresetBuilderService.hasForbiddenInstitutionWords as any).mockReturnValue(true);
      (mockPresetBuilderService.sanitizeProfileName as any).mockReturnValue('Civil Services 50KB');

      component.form.profileName = 'UPSC Civil Services 50KB';
      await component.saveSpecificationProfile();

      expect(mockToastService.show).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('Government and institution names were removed')
      );
      expect(component.form.profileName).toBe('Civil Services 50KB');
      expect(mockPresetBuilderService.saveSpecificationProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Civil Services 50KB' })
      );
    });

    it('computes converted pixel dimensions when physical units (mm, cm, in) are selected', () => {
      component.form.width = 35;
      component.form.height = 45;
      component.form.unit = 'mm';
      component.form.dpi = 300;

      (mockPresetBuilderService.convertToPixels as any).mockImplementation((val: number, unit: string, dpi: number) => {
        return Math.round((val * dpi) / 25.4);
      });

      expect(component.convertedWidthPx).toBe(413);
      expect(component.convertedHeightPx).toBe(531);
    });
  });
});
