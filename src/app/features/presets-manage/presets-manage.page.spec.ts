import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { PresetsManagePage } from './presets-manage.page';
import { ProfileTransferService } from '../../core/services/profile-transfer.service';
import { ToastService } from '../../core/services/toast.service';
import { Preset, ExportedProfileV1 } from '../../core/models/preset.types';

describe('PresetsManagePage — Profile Management & Transfer UI', () => {
  let component: PresetsManagePage;
  let mockTransferService: Partial<ProfileTransferService>;
  let mockToastService: Partial<ToastService>;
  let mockRouter: Partial<Router>;
  let mockCdr: Partial<ChangeDetectorRef>;

  const samplePreset: Preset = {
    id: 'custom-spec-1',
    name: 'Photo 35x45mm 50KB',
    category: 'My Custom Presets',
    isCustom: true,
    photo: {
      minKb: 20,
      maxKb: 50,
      width: 35,
      height: 45,
      unit: 'mm',
      format: 'JPEG',
      dpi: 300
    }
  };

  const sampleExportedProfile: ExportedProfileV1 = {
    version: '1.0',
    id: 'custom-spec-2',
    name: 'Doc PDF 200KB',
    category: 'My Custom Presets',
    isCustom: true,
    pdf: {
      minKb: 50,
      maxKb: 200,
      format: 'PDF'
    }
  };

  beforeEach(() => {
    mockTransferService = {
      getCustomProfiles: vi.fn().mockResolvedValue([samplePreset]),
      deleteProfile: vi.fn().mockResolvedValue(undefined),
      shareProfile: vi.fn().mockResolvedValue({ shared: true, method: 'share' }),
      validateProfileJson: vi.fn().mockReturnValue({
        valid: true,
        profile: sampleExportedProfile
      }),
      importProfile: vi.fn().mockResolvedValue({
        success: true,
        preset: {
          id: sampleExportedProfile.id,
          name: sampleExportedProfile.name,
          category: sampleExportedProfile.category,
          pdf: sampleExportedProfile.pdf
        }
      })
    };

    mockToastService = {
      show: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProfileTransferService, useValue: mockTransferService },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    component = TestBed.runInInjectionContext(() => new PresetsManagePage());
  });

  it('initializes and loads saved custom profiles', async () => {
    await component.ngOnInit();

    expect(mockTransferService.getCustomProfiles).toHaveBeenCalled();
    expect(component.profiles.length).toBe(1);
    expect(component.profiles[0].name).toBe('Photo 35x45mm 50KB');
    expect(component.isLoading).toBe(false);
  });

  it('triggers profile share and displays success feedback', async () => {
    await component.shareProfile(samplePreset);

    expect(mockTransferService.shareProfile).toHaveBeenCalledWith(samplePreset);
    expect(mockToastService.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('Photo 35x45mm 50KB')
    );
  });

  it('prompts delete modal and deletes profile upon user confirmation', async () => {
    await component.ngOnInit();

    component.promptDelete(samplePreset);
    expect(component.showDeleteModal).toBe(true);
    expect(component.profileToDelete).toBe(samplePreset);

    await component.confirmDelete();
    expect(mockTransferService.deleteProfile).toHaveBeenCalledWith(samplePreset.id);
    expect(component.showDeleteModal).toBe(false);
    expect(mockToastService.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('deleted')
    );
  });

  it('validates pasted JSON and opens the preview modal', () => {
    component.pastedJsonText = JSON.stringify(sampleExportedProfile);
    component.handlePasteValidate();

    expect(mockTransferService.validateProfileJson).toHaveBeenCalledWith(component.pastedJsonText);
    expect(component.showPreviewModal).toBe(true);
    expect(component.pendingProfile).toEqual(sampleExportedProfile);
    expect(component.isDuplicate).toBe(false);
  });

  it('flags duplicate profile warning when imported profile name already exists', async () => {
    await component.ngOnInit();

    // Validate a profile with identical name to existing profile
    (mockTransferService.validateProfileJson as any).mockReturnValue({
      valid: true,
      profile: {
        ...sampleExportedProfile,
        name: 'Photo 35x45mm 50KB' // Duplicate name
      }
    });

    component.pastedJsonText = '{"version":"1.0"}';
    component.handlePasteValidate();

    expect(component.showPreviewModal).toBe(true);
    expect(component.isDuplicate).toBe(true);
  });

  it('confirms import and merges profile into local custom presets', async () => {
    const jsonStr = JSON.stringify(sampleExportedProfile);
    component.pastedJsonText = jsonStr;
    component.handlePasteValidate();

    await component.confirmImport(false);

    expect(mockTransferService.importProfile).toHaveBeenCalledWith(
      jsonStr,
      false
    );
    expect(component.showPreviewModal).toBe(false);
    expect(mockToastService.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('imported successfully')
    );
  });

  it('navigates to preset builder when requested', () => {
    component.goToPresetBuilder();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/features/presets/builder']);
  });
});
