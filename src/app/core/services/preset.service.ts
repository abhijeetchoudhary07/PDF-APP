import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

const CUSTOM_PRESETS_KEY = 'IFH_CUSTOM_PRESETS';

export interface PresetRequirement {
  minKb?: number;
  maxKb?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  format?: string;
  backgroundGuidance?: string;
  verifiedSource?: string;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  isCustom?: boolean;
  photo?: PresetRequirement;
  signature?: PresetRequirement;
  pdf?: PresetRequirement;
}

@Injectable({
  providedIn: 'root'
})
export class PresetService {
  private http = inject(HttpClient);


  async getPhotoPresets(): Promise<Preset[]> {
    return firstValueFrom(this.http.get<Preset[]>('assets/presets/photo-presets.json'));
  }

  async getSignaturePresets(): Promise<Preset[]> {
    return firstValueFrom(this.http.get<Preset[]>('assets/presets/signature-presets.json'));
  }

  async getPdfPresets(): Promise<Preset[]> {
    return firstValueFrom(this.http.get<Preset[]>('assets/presets/pdf-presets.json'));
  }

  async getCustomPresets(): Promise<Preset[]> {
    const { value } = await Preferences.get({ key: CUSTOM_PRESETS_KEY });
    if (value) return JSON.parse(value);
    return [];
  }

  async saveCustomPreset(preset: Preset): Promise<void> {
    const presets = await this.getCustomPresets();
    const index = presets.findIndex(p => p.id === preset.id);
    if (index !== -1) {
      presets[index] = preset;
    } else {
      presets.push(preset);
    }
    await Preferences.set({ key: CUSTOM_PRESETS_KEY, value: JSON.stringify(presets) });
  }

  async deleteCustomPreset(id: string): Promise<void> {
    let presets = await this.getCustomPresets();
    presets = presets.filter(p => p.id !== id);
    await Preferences.set({ key: CUSTOM_PRESETS_KEY, value: JSON.stringify(presets) });
  }

  async getAllGroupedPresets(): Promise<{ category: string, presets: Preset[] }[]> {
    const [photos, sigs, pdfs, custom] = await Promise.all([
      this.getPhotoPresets().catch(() => []),
      this.getSignaturePresets().catch(() => []),
      this.getPdfPresets().catch(() => []),
      this.getCustomPresets()
    ]);

    const combinedMap = new Map<string, Preset>();

    const merge = (list: Preset[]) => {
      for (const p of list) {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, { ...p });
        } else {
          const existing = combinedMap.get(p.id)!;
          if (p.photo) existing.photo = p.photo;
          if (p.signature) existing.signature = p.signature;
          if (p.pdf) existing.pdf = p.pdf;
        }
      }
    };

    merge(photos);
    merge(sigs);
    merge(pdfs);

    const categoriesMap = new Map<string, Preset[]>();
    
    // Process static ones
    for (const preset of combinedMap.values()) {
       if (!categoriesMap.has(preset.category)) {
          categoriesMap.set(preset.category, []);
       }
       categoriesMap.get(preset.category)!.push(preset);
    }

    // Process custom ones manually to ensure they are grouped together
    if (custom.length > 0) {
      categoriesMap.set('My Custom Presets', custom);
    }

    const result = [];
    for (const [category, presets] of categoriesMap.entries()) {
       result.push({ category, presets });
    }

    // Sort so Custom is at the top
    result.sort((a, b) => a.category === 'My Custom Presets' ? -1 : 1);

    return result;
  }
}
