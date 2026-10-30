import { Injectable, inject } from '@angular/core';
import { Share } from '@capacitor/share';
import {
  Preset,
  PresetRequirement,
  ExportedProfileV1,
  ProfileValidationResult,
  ProfileImportResult
} from '../models/preset.types';
import { PresetService } from './preset.service';

/** Dangerous prototype keys prohibited to prevent prototype pollution attacks */
const PROHIBITED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Maximum allowable JSON file size (100 KB) to prevent JSON bomb / memory exhaustion */
const MAX_PROFILE_JSON_BYTES = 102400;

/** Maximum allowable JSON structure depth */
const MAX_JSON_DEPTH = 5;

@Injectable({
  providedIn: 'root'
})
export class ProfileTransferService {
  private presetService = inject(PresetService);

  /**
   * Sanitizes string fields to prevent script injection (XSS) and HTML tag injection.
   */
  sanitizeString(val?: string): string {
    if (!val || typeof val !== 'string') return '';
    return val
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  /**
   * Cleans and sanitizes a PresetRequirement block.
   */
  private sanitizeRequirement(req: PresetRequirement): PresetRequirement {
    return {
      minKb: req.minKb,
      maxKb: req.maxKb,
      width: req.width,
      height: req.height,
      unit: req.unit,
      widthPx: req.widthPx,
      heightPx: req.heightPx,
      aspectRatio: req.aspectRatio ? this.sanitizeString(req.aspectRatio) : undefined,
      dpi: req.dpi,
      format: req.format ? this.sanitizeString(req.format) : undefined,
      backgroundGuidance: req.backgroundGuidance ? this.sanitizeString(req.backgroundGuidance) : undefined,
      verifiedSource: req.verifiedSource ? this.sanitizeString(req.verifiedSource) : undefined
    };
  }

  /**
   * Serializes a Preset specification profile into a formatted versioned JSON string.
   */
  exportProfileToJson(preset: Preset): string {
    const exported: ExportedProfileV1 = {
      version: '1.0',
      id: preset.id,
      name: this.sanitizeString(preset.name),
      category: this.sanitizeString(preset.category || 'My Custom Presets'),
      isCustom: true,
      createdAt: preset.createdAt || Date.now()
    };

    if (preset.photo) exported.photo = this.sanitizeRequirement(preset.photo);
    if (preset.signature) exported.signature = this.sanitizeRequirement(preset.signature);
    if (preset.pdf) exported.pdf = this.sanitizeRequirement(preset.pdf);
    if (preset.dpi !== undefined) exported.dpi = preset.dpi;
    if (preset.unit !== undefined) exported.unit = preset.unit;
    if (preset.targetType !== undefined) exported.targetType = preset.targetType;

    return JSON.stringify(exported, null, 2);
  }

  /**
   * Creates a downloadable JSON file for a given profile.
   */
  createProfileFileBlob(preset: Preset): { blob: Blob; fileName: string } {
    const jsonStr = this.exportProfileToJson(preset);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const safeName = preset.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const fileName = `ifh-profile-${safeName || 'custom'}.json`;
    return { blob, fileName };
  }

  /**
   * Shares a profile via native share sheet or downloads as a file fallback.
   */
  async shareProfile(preset: Preset): Promise<{ shared: boolean; method: 'share' | 'download' }> {
    const jsonStr = this.exportProfileToJson(preset);

    try {
      if (typeof navigator !== 'undefined' && (Share as any)?.share) {
        await Share.share({
          title: `Specification Profile: ${preset.name}`,
          text: jsonStr,
          dialogTitle: `Share ${preset.name} Profile (JSON)`
        });
        return { shared: true, method: 'share' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('canceled')) {
        return { shared: false, method: 'share' };
      }
    }

    // Fallback: browser download
    this.downloadProfileJson(preset);
    return { shared: true, method: 'download' };
  }

  /**
   * Initiates browser download of the profile JSON.
   */
  downloadProfileJson(preset: Preset): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const { blob, fileName } = this.createProfileFileBlob(preset);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Validates a JSON string against schema ifh.profile.v1.json.
   * Enforces cybersecurity safeguards (ReDoS, Prototype Pollution, JSON Bomb, Deep Recursion).
   */
  validateProfileJson(jsonStr: string): ProfileValidationResult {
    const raw = (jsonStr || '').trim();
    if (!raw) {
      return {
        valid: false,
        error: 'Empty input: Please provide valid profile JSON text.'
      };
    }

    // Cybersecurity Guard 1: Payload size limit (JSON Bomb protection)
    if (raw.length > MAX_PROFILE_JSON_BYTES) {
      return {
        valid: false,
        error: `Payload too large: Profile JSON cannot exceed ${MAX_PROFILE_JSON_BYTES / 1024} KB.`
      };
    }

    // Cybersecurity Guard 2: Prototype Pollution raw string inspection
    if (/"(?:__proto__|constructor|prototype)"\s*:/i.test(raw)) {
      return {
        valid: false,
        error: 'Security violation: Prototype pollution attempt detected.'
      };
    }

    let parsed: any;
    try {
      // Safe reviver to drop any dangerous prototype keys
      parsed = JSON.parse(raw, (key, value) => {
        if (PROHIBITED_KEYS.has(key)) {
          return undefined;
        }
        return value;
      });
    } catch (e: any) {
      return {
        valid: false,
        error: `Malformed JSON: The provided text is not valid JSON syntax (${e.message || 'SyntaxError'}).`
      };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        valid: false,
        error: 'Malformed JSON: Expected a JSON object definition.'
      };
    }

    // Cybersecurity Guard 3: JSON Depth / Recursion Limit
    const depth = this.calculateObjectDepth(parsed);
    if (depth > MAX_JSON_DEPTH) {
      return {
        valid: false,
        error: `Malformed JSON: Structure depth exceeds allowed limit (maximum ${MAX_JSON_DEPTH} levels).`
      };
    }

    // 1. Version check
    if (!('version' in parsed)) {
      return {
        valid: false,
        error: "Missing required field 'version'"
      };
    }

    if (parsed.version !== '1.0') {
      return {
        valid: false,
        error: `Unsupported profile version '${parsed.version}'. Only version '1.0' is supported.`
      };
    }

    // 2. ID check
    if (!('id' in parsed) || typeof parsed.id !== 'string' || !parsed.id.trim()) {
      return {
        valid: false,
        error: "Missing required field 'id'"
      };
    }

    // 3. Name check
    if (!('name' in parsed) || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      return {
        valid: false,
        error: "Missing required field 'name'"
      };
    }

    // 4. Must contain at least one requirement block
    const hasPhoto = parsed.photo && typeof parsed.photo === 'object';
    const hasSig = parsed.signature && typeof parsed.signature === 'object';
    const hasPdf = parsed.pdf && typeof parsed.pdf === 'object';

    if (!hasPhoto && !hasSig && !hasPdf) {
      return {
        valid: false,
        error: "Profile must contain at least one specification section: 'photo', 'signature', or 'pdf'."
      };
    }

    // 5. Detailed requirement checks
    const checkRequirement = (
      req: any,
      label: 'photo' | 'signature' | 'pdf'
    ): string | null => {
      if (req.maxKb === undefined) {
        return `Field '${label}.maxKb' is required and must be a positive number.`;
      }
      if (typeof req.maxKb !== 'number' || isNaN(req.maxKb) || req.maxKb <= 0) {
        return `Field '${label}.maxKb' must be a positive number.`;
      }
      if (req.minKb !== undefined) {
        if (typeof req.minKb !== 'number' || isNaN(req.minKb) || req.minKb < 0) {
          return `Field '${label}.minKb' must be a non-negative number.`;
        }
      }
      if (req.minKb !== undefined && req.maxKb !== undefined) {
        if (req.minKb > req.maxKb) {
          return `Field '${label}.minKb' cannot exceed '${label}.maxKb'.`;
        }
      }
      if (req.width !== undefined) {
        if (typeof req.width !== 'number' || isNaN(req.width) || req.width <= 0) {
          return `Field '${label}.width' must be a positive number.`;
        }
      }
      if (req.height !== undefined) {
        if (typeof req.height !== 'number' || isNaN(req.height) || req.height <= 0) {
          return `Field '${label}.height' must be a positive number.`;
        }
      }
      if (req.unit !== undefined) {
        if (!['px', 'mm', 'cm', 'in'].includes(req.unit)) {
          return `Field '${label}.unit' must be one of 'px', 'mm', 'cm', or 'in'.`;
        }
      }
      if (req.dpi !== undefined) {
        if (typeof req.dpi !== 'number' || isNaN(req.dpi) || req.dpi <= 0) {
          return `Field '${label}.dpi' must be a positive number.`;
        }
      }
      return null;
    };

    if (hasPhoto) {
      const err = checkRequirement(parsed.photo, 'photo');
      if (err) return { valid: false, error: err };
    }

    if (hasSig) {
      const err = checkRequirement(parsed.signature, 'signature');
      if (err) return { valid: false, error: err };
    }

    if (hasPdf) {
      const err = checkRequirement(parsed.pdf, 'pdf');
      if (err) return { valid: false, error: err };
    }

    // Build whitelisted and sanitized profile
    const sanitizedProfile: ExportedProfileV1 = {
      version: '1.0',
      id: this.sanitizeString(parsed.id),
      name: this.sanitizeString(parsed.name),
      category: this.sanitizeString(parsed.category || 'My Custom Presets'),
      isCustom: true,
      dpi: typeof parsed.dpi === 'number' && parsed.dpi > 0 ? parsed.dpi : undefined,
      unit: ['px', 'mm', 'cm', 'in'].includes(parsed.unit) ? parsed.unit : undefined,
      targetType: ['photo', 'signature', 'pdf'].includes(parsed.targetType) ? parsed.targetType : undefined,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      photo: hasPhoto ? this.sanitizeRequirement(parsed.photo) : undefined,
      signature: hasSig ? this.sanitizeRequirement(parsed.signature) : undefined,
      pdf: hasPdf ? this.sanitizeRequirement(parsed.pdf) : undefined
    };

    return {
      valid: true,
      profile: sanitizedProfile
    };
  }

  /**
   * Imports a profile from a JSON string or File, with duplicate checking.
   * Does NOT overwrite an existing profile unless overwrite is true.
   */
  async importProfile(
    input: string | File,
    overwriteExisting = false
  ): Promise<ProfileImportResult> {
    let jsonStr = '';
    try {
      if (typeof input === 'string') {
        jsonStr = input;
      } else if (input instanceof File) {
        jsonStr = await input.text();
      } else {
        return { success: false, error: 'Invalid input format' };
      }
    } catch (err: any) {
      return { success: false, error: `Failed to read input: ${err?.message || 'Read error'}` };
    }

    const validation = this.validateProfileJson(jsonStr);
    if (!validation.valid || !validation.profile) {
      return {
        success: false,
        error: validation.error || 'Invalid profile specification JSON'
      };
    }

    const exported = validation.profile;
    const existingList = await this.presetService.getCustomPresets();
    const existing = existingList.find(
      p => p.id === exported.id || p.name.trim().toLowerCase() === exported.name.trim().toLowerCase()
    );

    // Resolve duplicate ID collisions: if overwriting existing with same name but different ID, match existing ID
    const targetId = existing && overwriteExisting ? existing.id : exported.id;

    const presetToSave: Preset = {
      id: targetId,
      name: exported.name,
      category: exported.category || 'My Custom Presets',
      isCustom: true,
      photo: exported.photo,
      signature: exported.signature,
      pdf: exported.pdf,
      dpi: exported.dpi,
      unit: exported.unit,
      targetType: exported.targetType,
      createdAt: exported.createdAt || Date.now()
    };

    if (existing && !overwriteExisting) {
      return {
        success: false,
        isExistingDuplicate: true,
        preset: presetToSave,
        error: `A custom profile named '${presetToSave.name}' already exists.`
      };
    }

    await this.presetService.saveCustomPreset(presetToSave);
    return {
      success: true,
      preset: presetToSave
    };
  }

  /**
   * Imports a profile as a safe new copy with an auto-generated unique ID and non-colliding name.
   */
  async importProfileAsCopy(input: string | File): Promise<ProfileImportResult> {
    let jsonStr = '';
    try {
      if (typeof input === 'string') {
        jsonStr = input;
      } else if (input instanceof File) {
        jsonStr = await input.text();
      } else {
        return { success: false, error: 'Invalid input format' };
      }
    } catch (err: any) {
      return { success: false, error: `Failed to read input: ${err?.message || 'Read error'}` };
    }

    const validation = this.validateProfileJson(jsonStr);
    if (!validation.valid || !validation.profile) {
      return {
        success: false,
        error: validation.error || 'Invalid profile specification JSON'
      };
    }

    const exported = validation.profile;
    const existingList = await this.presetService.getCustomPresets();

    let newName = `${exported.name} (Copy)`;
    let counter = 2;
    while (existingList.some(p => p.name.trim().toLowerCase() === newName.trim().toLowerCase())) {
      newName = `${exported.name} (Copy ${counter++})`;
    }

    const newId = `custom-spec-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const presetToSave: Preset = {
      id: newId,
      name: newName,
      category: exported.category || 'My Custom Presets',
      isCustom: true,
      photo: exported.photo,
      signature: exported.signature,
      pdf: exported.pdf,
      dpi: exported.dpi,
      unit: exported.unit,
      targetType: exported.targetType,
      createdAt: Date.now()
    };

    await this.presetService.saveCustomPreset(presetToSave);
    return {
      success: true,
      preset: presetToSave
    };
  }

  /**
   * Retrieves all saved custom presets.
   */
  async getCustomProfiles(): Promise<Preset[]> {
    return this.presetService.getCustomPresets();
  }

  /**
   * Deletes a custom preset by ID.
   */
  async deleteProfile(id: string): Promise<void> {
    return this.presetService.deleteCustomPreset(id);
  }

  /**
   * Calculates maximum object nesting depth for recursion defense.
   */
  private calculateObjectDepth(obj: any, currentDepth = 1): number {
    if (typeof obj !== 'object' || obj === null) return currentDepth;
    let max = currentDepth;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const d = this.calculateObjectDepth(obj[key], currentDepth + 1);
        if (d > max) max = d;
      }
    }
    return max;
  }
}
