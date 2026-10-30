import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PresetBatchCheckPage } from './preset-batch-check.page';
import { PresetBatchValidatorService } from '../../core/services/preset-batch-validator.service';
import { PresetService } from '../../core/services/preset.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Preset,
  FileAuditScorecard,
  BatchAuditSummary
} from '../../core/models/preset.types';

describe('PresetBatchCheckPage — Batch Profile Compliance UI', () => {
  let component: PresetBatchCheckPage;
  let mockValidatorService: any;
  let mockPresetService: any;
  let mockStorageService: any;
  let mockToastService: any;
  let mockActivatedRoute: any;
  let mockCdr: any;

  const samplePreset: Preset = {
    id: 'spec-photo-50kb',
    name: 'Photo 35x45mm 50KB',
    category: 'custom',
    targetType: 'photo',
    photo: {
      minKb: 20,
      maxKb: 50,
      width: 350,
      height: 450,
      format: 'JPEG',
      dpi: 200
    }
  };

  const sampleCardCompliant: FileAuditScorecard = {
    fileId: 'card-1',
    fileName: 'valid.jpg',
    fileSizeBytes: 30 * 1024,
    fileType: 'image/jpeg',
    slotType: 'photo',
    passed: true,
    isFixable: false,
    rules: [
      {
        category: 'size',
        name: 'File Size',
        passed: true,
        measured: '30 KB',
        requiredLimit: 'Max 50 KB',
        fixable: true
      }
    ],
    originalFile: new File([new Uint8Array(30 * 1024)], 'valid.jpg', { type: 'image/jpeg' }),
    fixStatus: 'fixed'
  };

  const sampleCardNonCompliant: FileAuditScorecard = {
    fileId: 'card-2',
    fileName: 'large.jpg',
    fileSizeBytes: 80 * 1024,
    fileType: 'image/jpeg',
    slotType: 'photo',
    passed: false,
    isFixable: true,
    rules: [
      {
        category: 'size',
        name: 'File Size',
        passed: false,
        measured: '80 KB',
        requiredLimit: 'Max 50 KB',
        fixable: true,
        fixAction: 'compress'
      }
    ],
    originalFile: new File([new Uint8Array(80 * 1024)], 'large.jpg', { type: 'image/jpeg' }),
    fixStatus: 'pending'
  };

  const sampleSummary: BatchAuditSummary = {
    profileId: 'spec-photo-50kb',
    profileName: 'Photo 35x45mm 50KB',
    totalFiles: 2,
    compliantCount: 1,
    nonCompliantCount: 1,
    fixableCount: 1,
    unfixableCount: 0,
    scorecards: [sampleCardCompliant, sampleCardNonCompliant]
  };

  beforeEach(() => {
    mockValidatorService = {
      auditBatch: vi.fn().mockResolvedValue(sampleSummary),
      checkQuota: vi.fn().mockResolvedValue({ canProceed: true, requiredOps: 1, remainingOps: 5 }),
      autoFixBatch: vi.fn().mockResolvedValue({
        successfulCount: 1,
        failedCount: 0,
        fixedScorecards: [
          sampleCardCompliant,
          { ...sampleCardNonCompliant, passed: true, fixStatus: 'fixed' }
        ]
      })
    };

    mockPresetService = {
      getCustomPresets: vi.fn().mockResolvedValue([samplePreset]),
      getAllGroupedPresets: vi.fn().mockResolvedValue([])
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file://saved-path')
    };

    mockToastService = {
      show: vi.fn()
    };

    mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: vi.fn().mockReturnValue(null)
        }
      }
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PresetBatchValidatorService, useValue: mockValidatorService },
        { provide: PresetService, useValue: mockPresetService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    component = TestBed.runInInjectionContext(() => new PresetBatchCheckPage());
  });

  it('initializes presets and selects default preset', async () => {
    await component.ngOnInit();

    expect(mockPresetService.getCustomPresets).toHaveBeenCalled();
    expect(component.presets.length).toBe(1);
    expect(component.selectedPreset?.id).toBe('spec-photo-50kb');
    expect(component.isLoadingPresets).toBe(false);
  });

  it('selects preset based on route query parameter if provided', async () => {
    const secondPreset: Preset = {
      id: 'spec-pdf-200kb',
      name: 'Doc PDF 200KB',
      category: 'custom',
      targetType: 'pdf'
    };
    mockPresetService.getCustomPresets.mockResolvedValue([samplePreset, secondPreset]);
    mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('spec-pdf-200kb');

    await component.ngOnInit();

    expect(component.selectedPreset?.id).toBe('spec-pdf-200kb');
  });

  it('handles preset change dropdown and re-runs audit when files exist', async () => {
    const secondPreset: Preset = {
      id: 'spec-pdf-200kb',
      name: 'Doc PDF 200KB',
      category: 'custom',
      targetType: 'pdf'
    };
    component.presets = [samplePreset, secondPreset];
    component.selectedPreset = samplePreset;
    component.files = [sampleCardCompliant.originalFile];

    await component.onPresetChange({ target: { value: 'spec-pdf-200kb' } });

    expect(component.selectedPreset.id).toBe('spec-pdf-200kb');
    expect(mockValidatorService.auditBatch).toHaveBeenCalledWith(component.files, secondPreset);
  });

  it('adds files and triggers audit scorecard generation', async () => {
    component.selectedPreset = samplePreset;
    const file1 = sampleCardCompliant.originalFile;
    const file2 = sampleCardNonCompliant.originalFile;

    await component.onFilesAdded([file1, file2]);

    expect(component.files.length).toBe(2);
    expect(mockValidatorService.auditBatch).toHaveBeenCalledWith([file1, file2], samplePreset);
    expect(component.scorecards.length).toBe(2);
    expect(component.summary).toBeDefined();
    expect(component.fixableCount).toBe(1);
    expect(component.compliantCount).toBe(1);
  });

  it('toggles expand state for a scorecard item', () => {
    expect(component.isExpanded('card-1')).toBe(false);

    component.toggleExpand('card-1');
    expect(component.isExpanded('card-1')).toBe(true);

    component.toggleExpand('card-1');
    expect(component.isExpanded('card-1')).toBe(false);
  });

  it('removes a single file and clears all when list is empty', async () => {
    component.selectedPreset = samplePreset;
    component.files = [sampleCardCompliant.originalFile];
    component.scorecards = [sampleCardCompliant];

    component.removeFile(0);

    expect(component.files.length).toBe(0);
    expect(component.scorecards.length).toBe(0);
    expect(component.summary).toBeNull();
  });

  it('enforces quota stop in UI before starting batch auto-fix', async () => {
    component.selectedPreset = samplePreset;
    component.scorecards = [{ ...sampleCardNonCompliant }];

    mockValidatorService.checkQuota.mockResolvedValue({
      canProceed: false,
      requiredOps: 1,
      remainingOps: 0,
      error: 'Daily quota limit reached: need 1 operations, but only 0 available today.'
    });

    await component.autoFixAll();

    expect(component.quotaWarning).toContain('Daily quota limit reached');
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Daily quota limit reached'),
      'warning'
    );
    expect(mockValidatorService.autoFixBatch).not.toHaveBeenCalled();
    expect(component.isAutoFixing).toBe(false);
  });

  it('executes 1-click auto-fix when quota check passes', async () => {
    component.selectedPreset = samplePreset;
    const cardToFix = { ...sampleCardNonCompliant };
    component.scorecards = [cardToFix];

    mockValidatorService.checkQuota.mockResolvedValue({
      canProceed: true,
      requiredOps: 1,
      remainingOps: 4
    });

    mockValidatorService.autoFixBatch.mockImplementation(async (cards: any, p: any, onProgress: any) => {
      onProgress({
        currentFileIndex: 1,
        totalFiles: 1,
        currentFileName: 'large.jpg',
        progressPercent: 100,
        status: 'completed'
      });
      cards[0].passed = true;
      cards[0].fixStatus = 'fixed';
      return { successfulCount: 1, failedCount: 0, fixedScorecards: cards };
    });

    await component.autoFixAll();

    expect(mockValidatorService.autoFixBatch).toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Auto-fix complete: 1 files fixed!'),
      'success'
    );
    expect(component.isAutoFixing).toBe(false);
  });

  it('downloads single card file via storageService', async () => {
    await component.downloadCardFile(sampleCardCompliant);

    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      sampleCardCompliant.originalFile,
      'preset_fixed',
      undefined,
      { preserveName: true }
    );
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Saved valid.jpg'),
      'success'
    );
  });

  it('downloads all compliant files in a ZIP archive', async () => {
    component.scorecards = [sampleCardCompliant];

    await component.downloadAllZip();

    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      'compliant_batch',
      undefined,
      { preserveName: true }
    );
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Downloaded all compliant files in ZIP archive'),
      'success'
    );
  });
});
