import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ProfileTransferService } from './profile-transfer.service';
import { PresetService } from './preset.service';
import { Preset, CUSTOM_PRESETS_KEY } from '../models/preset.types';

// In-memory store for Capacitor Preferences
const preferencesStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferencesStore.get(key) ?? null
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
    clear: vi.fn(async () => {
      preferencesStore.clear();
    })
  }
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ value: true })
  }
}));

describe('ProfileTransferService — Specification Profile Import & Export', () => {
  let service: ProfileTransferService;
  let presetService: PresetService;

  const samplePhotoPreset: Preset = {
    id: 'spec-photo-35x45',
    name: 'Photo 35x45mm 50KB',
    category: 'My Custom Presets',
    isCustom: true,
    targetType: 'photo',
    unit: 'mm',
    dpi: 300,
    createdAt: 1700000000000,
    photo: {
      minKb: 20,
      maxKb: 50,
      width: 35,
      height: 45,
      unit: 'mm',
      aspectRatio: '3.5:4.5',
      format: 'JPEG',
      dpi: 300
    }
  };

  beforeEach(() => {
    preferencesStore.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ProfileTransferService, PresetService]
    });

    service = TestBed.inject(ProfileTransferService);
    presetService = TestBed.inject(PresetService);
  });

  describe('Export to Versioned JSON & Round-trip Equality', () => {
    it('serializes a profile into a valid versioned JSON schema format', () => {
      const json = service.exportProfileToJson(samplePhotoPreset);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.id).toBe(samplePhotoPreset.id);
      expect(parsed.name).toBe(samplePhotoPreset.name);
      expect(parsed.photo?.maxKb).toBe(50);
      expect(parsed.photo?.width).toBe(35);
      expect(parsed.photo?.height).toBe(45);
      expect(parsed.dpi).toBe(300);
    });

    it('round-trips through export and import with exact value equality', async () => {
      const exportedJson = service.exportProfileToJson(samplePhotoPreset);

      const importResult = await service.importProfile(exportedJson);

      expect(importResult.success).toBe(true);
      expect(importResult.preset).toBeDefined();

      const imported = importResult.preset!;
      expect(imported.id).toBe(samplePhotoPreset.id);
      expect(imported.name).toBe(samplePhotoPreset.name);
      expect(imported.category).toBe(samplePhotoPreset.category);
      expect(imported.dpi).toBe(samplePhotoPreset.dpi);
      expect(imported.unit).toBe(samplePhotoPreset.unit);
      expect(imported.photo).toEqual(samplePhotoPreset.photo);

      // Verify stored in custom presets
      const savedInStorage = await presetService.getCustomPresets();
      expect(savedInStorage.length).toBe(1);
      expect(savedInStorage[0].id).toBe(samplePhotoPreset.id);
      expect(savedInStorage[0].name).toBe(samplePhotoPreset.name);
    });
  });

  describe('Strict Schema Validation & Human-Friendly Error Messages', () => {
    it('rejects malformed JSON with missing closing bracket', () => {
      const malformedJson = '{"version": "1.0", "id": "p-1", "name": "Photo 50KB", "photo": {"maxKb": 50}';
      const result = service.validateProfileJson(malformedJson);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Malformed JSON');
    });

    it('flags missing maxKb on specification section', () => {
      const missingMaxKb = JSON.stringify({
        version: '1.0',
        id: 'p-1',
        name: 'Photo Missing MaxKb',
        category: 'Custom',
        photo: { minKb: 20 }
      });

      const result = service.validateProfileJson(missingMaxKb);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Field 'photo.maxKb' is required and must be a positive number.");
    });

    it('flags missing version field cleanly', () => {
      const noVersion = JSON.stringify({
        id: 'spec-1',
        name: 'Photo 50KB',
        category: 'Custom',
        photo: { maxKb: 50 }
      });

      const result = service.validateProfileJson(noVersion);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing required field 'version'");
    });

    it('flags version mismatch cleanly for unsupported schema versions (v2.0)', () => {
      const futureVersion = JSON.stringify({
        version: '2.0',
        id: 'spec-1',
        name: 'Photo 50KB',
        category: 'Custom',
        photo: { maxKb: 50 }
      });

      const result = service.validateProfileJson(futureVersion);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unsupported profile version '2.0'. Only version '1.0' is supported.");
    });

    it('flags missing required field id', () => {
      const noId = JSON.stringify({
        version: '1.0',
        name: 'Photo 50KB',
        category: 'Custom',
        photo: { maxKb: 50 }
      });

      const result = service.validateProfileJson(noId);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing required field 'id'");
    });

    it('flags missing required field name', () => {
      const noName = JSON.stringify({
        version: '1.0',
        id: 'p-1',
        category: 'Custom',
        photo: { maxKb: 50 }
      });

      const result = service.validateProfileJson(noName);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing required field 'name'");
    });

    it('flags missing specification section when photo, signature, and pdf are all absent', () => {
      const emptySpec = JSON.stringify({
        version: '1.0',
        id: 'p-1',
        name: 'Empty Profile',
        category: 'Custom'
      });

      const result = service.validateProfileJson(emptySpec);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Profile must contain at least one specification section");
    });

    it('flags invalid numeric bounds e.g. minKb > maxKb or negative dimensions', () => {
      const invalidBounds = JSON.stringify({
        version: '1.0',
        id: 'p-1',
        name: 'Invalid Bounds',
        category: 'Custom',
        photo: {
          minKb: 100,
          maxKb: 50
        }
      });

      const result = service.validateProfileJson(invalidBounds);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Field 'photo.minKb' cannot exceed 'photo.maxKb'.");
    });
  });

  describe('Duplicate Detection & User Approval Merging', () => {
    it('prevents overwriting existing profiles without explicit user approval', async () => {
      // Pre-save the sample profile
      await presetService.saveCustomPreset(samplePhotoPreset);

      const jsonStr = service.exportProfileToJson(samplePhotoPreset);

      // Attempt import without overwrite approval
      const result = await service.importProfile(jsonStr, false);

      expect(result.success).toBe(false);
      expect(result.isExistingDuplicate).toBe(true);
      expect(result.error).toContain("already exists");
    });

    it('allows overwriting an existing profile when overwriteExisting is true', async () => {
      await presetService.saveCustomPreset(samplePhotoPreset);

      // Updated profile with different maxKb
      const updatedPreset: Preset = {
        ...samplePhotoPreset,
        photo: {
          ...samplePhotoPreset.photo,
          maxKb: 75
        }
      };

      const jsonStr = service.exportProfileToJson(updatedPreset);

      // Import with overwrite approval
      const result = await service.importProfile(jsonStr, true);

      expect(result.success).toBe(true);
      expect(result.preset?.photo?.maxKb).toBe(75);

      const saved = await presetService.getCustomPresets();
      expect(saved.length).toBe(1);
      expect(saved[0].photo?.maxKb).toBe(75);
    });

    it('imports profile as a safe new copy via importProfileAsCopy without overwriting original', async () => {
      await presetService.saveCustomPreset(samplePhotoPreset);

      const jsonStr = service.exportProfileToJson(samplePhotoPreset);

      const copyResult = await service.importProfileAsCopy(jsonStr);

      expect(copyResult.success).toBe(true);
      expect(copyResult.preset?.id).not.toBe(samplePhotoPreset.id);
      expect(copyResult.preset?.name).toBe('Photo 35x45mm 50KB (Copy)');

      // Both presets should now coexist
      const customPresets = await presetService.getCustomPresets();
      expect(customPresets.length).toBe(2);
      expect(customPresets.some(p => p.id === samplePhotoPreset.id)).toBe(true);
      expect(customPresets.some(p => p.name === 'Photo 35x45mm 50KB (Copy)')).toBe(true);
    });
  });

  describe('File Ingestion & Native Sharing', () => {
    it('imports profile from a File object', async () => {
      const json = service.exportProfileToJson(samplePhotoPreset);
      const file = new File([json], 'profile.json', { type: 'application/json' });

      const result = await service.importProfile(file);

      expect(result.success).toBe(true);
      expect(result.preset?.id).toBe(samplePhotoPreset.id);
    });

    it('triggers native share via @capacitor/share', async () => {
      const result = await service.shareProfile(samplePhotoPreset);
      expect(result.shared).toBe(true);
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    describe('Prototype Pollution Defense', () => {
      it('rejects JSON containing __proto__ without polluting Object.prototype', () => {
        const pollutedPayload = '{"version": "1.0", "id": "exploit-1", "name": "Exploit Profile", "category": "Exploit", "__proto__": {"polluted": true}, "photo": {"maxKb": 50}}';

        const result = service.validateProfileJson(pollutedPayload);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Prototype pollution');
        expect((Object.prototype as any).polluted).toBeUndefined();
      });

      it('rejects JSON containing constructor.prototype without polluting Object.prototype', () => {
        const constructorPayload = JSON.stringify({
          version: '1.0',
          id: 'exploit-2',
          name: 'Exploit Profile 2',
          category: 'Exploit',
          constructor: { prototype: { isAdmin: true } },
          photo: { maxKb: 50 }
        });

        const result = service.validateProfileJson(constructorPayload);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Prototype pollution');
        expect((Object.prototype as any).isAdmin).toBeUndefined();
      });
    });

    describe('JSON Bomb & Deep Recursion Defense', () => {
      it('rejects payloads exceeding 100 KB payload size limit', () => {
        const largeString = 'a'.repeat(105000);
        const hugePayload = JSON.stringify({
          version: '1.0',
          id: 'huge-1',
          name: largeString,
          photo: { maxKb: 50 }
        });

        const result = service.validateProfileJson(hugePayload);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Payload too large');
      });

      it('rejects deeply nested JSON objects exceeding structure depth limit (max 5 levels)', () => {
        // Deeply nested object: 7 levels deep
        const deepObj: any = { version: '1.0', id: 'deep-1', name: 'Deep Profile', photo: { maxKb: 50 } };
        let current = deepObj;
        for (let i = 0; i < 7; i++) {
          current.nested = {};
          current = current.nested;
        }

        const result = service.validateProfileJson(JSON.stringify(deepObj));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Structure depth exceeds allowed limit');
      });
    });

    describe('Script Injection (XSS) Sanitization', () => {
      it('sanitizes script tags from profile name, category, and backgroundGuidance', async () => {
        const xssPayload = JSON.stringify({
          version: '1.0',
          id: 'xss-spec',
          name: '<script>alert("pwned")</script>Secure Photo 50KB',
          category: '<img src=x onerror=alert(1)>My Presets',
          photo: {
            maxKb: 50,
            backgroundGuidance: '<script>evil()</script>White background'
          }
        });

        const result = await service.importProfile(xssPayload);
        expect(result.success).toBe(true);

        const imported = result.preset!;
        expect(imported.name).toBe('Secure Photo 50KB');
        expect(imported.name).not.toContain('<script>');
        expect(imported.category).toBe('My Presets');
        expect(imported.category).not.toContain('<img');
        expect(imported.photo?.backgroundGuidance).toBe('White background');
        expect(imported.photo?.backgroundGuidance).not.toContain('<script>');
      });
    });
  });
});
