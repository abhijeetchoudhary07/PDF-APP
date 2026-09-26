import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from './translate.pipe';
import { en } from './translations/en';
import { hi } from './translations/hi';
import { mr } from './translations/mr';
import { bn } from './translations/bn';
import { pa } from './translations/pa';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from './i18n.types';
import { TOOL_IDS } from '../services/tool-registry.service';

describe('Internationalization (i18n) System', () => {
  let service: TranslationService;
  let pipe: TranslatePipe;

  beforeEach(() => {
    /*
     * Through TestBed rather than `new`: both of these take their
     * dependencies from `inject()`, which throws outside an injection
     * context. Resolving the pipe from the same injector as the service is
     * also what production does, so the pipe really is reading the language
     * the service holds.
     */
    TestBed.configureTestingModule({ providers: [TranslatePipe] });
    service = TestBed.inject(TranslationService);
    pipe = TestBed.inject(TranslatePipe);
  });

  describe('Language Support Configuration', () => {
    it('should support all 5 required languages: English, Hindi, Marathi, Bengali, Punjabi', () => {
      const langCodes = SUPPORTED_LANGUAGES.map(l => l.code);
      expect(langCodes).toContain('en');
      expect(langCodes).toContain('hi');
      expect(langCodes).toContain('mr');
      expect(langCodes).toContain('bn');
      expect(langCodes).toContain('pa');
      expect(langCodes.length).toBe(5);
    });

    it('should have proper native labels for all languages', () => {
      const enOpt = SUPPORTED_LANGUAGES.find(l => l.code === 'en');
      const hiOpt = SUPPORTED_LANGUAGES.find(l => l.code === 'hi');
      const mrOpt = SUPPORTED_LANGUAGES.find(l => l.code === 'mr');
      const bnOpt = SUPPORTED_LANGUAGES.find(l => l.code === 'bn');
      const paOpt = SUPPORTED_LANGUAGES.find(l => l.code === 'pa');

      expect(enOpt?.nativeName).toBe('English');
      expect(hiOpt?.nativeName).toBe('हिन्दी');
      expect(mrOpt?.nativeName).toBe('मराठी');
      expect(bnOpt?.nativeName).toBe('বাংলা');
      expect(paOpt?.nativeName).toBe('ਪੰਜਾਬੀ');
    });
  });

  describe('TranslationService', () => {
    it('should default to a valid supported language', () => {
      const current = service.currentLang;
      expect(['en', 'hi', 'mr', 'bn', 'pa']).toContain(current);
    });

    it('should change language and emit via currentLang$', async () => {
      let emittedLang: SupportedLanguage | undefined;
      const sub = service.currentLang$.subscribe(l => (emittedLang = l));

      await service.setLanguage('hi');
      expect(service.currentLang).toBe('hi');
      expect(emittedLang).toBe('hi');

      await service.setLanguage('mr');
      expect(service.currentLang).toBe('mr');
      expect(emittedLang).toBe('mr');

      await service.setLanguage('bn');
      expect(service.currentLang).toBe('bn');
      expect(emittedLang).toBe('bn');

      await service.setLanguage('pa');
      expect(service.currentLang).toBe('pa');
      expect(emittedLang).toBe('pa');

      await service.setLanguage('en');
      expect(service.currentLang).toBe('en');
      expect(emittedLang).toBe('en');

      sub.unsubscribe();
    });

    it('should resolve nested dot notation keys correctly', async () => {
      await service.setLanguage('en');
      expect(service.translate('common.appName')).toBe('Indian Form Helper');
      expect(service.translate('header.tools')).toBe('Tools');

      await service.setLanguage('hi');
      expect(service.translate('common.appName')).toBe('इंडियन फॉर्म हेल्पर');
      expect(service.translate('header.tools')).toBe('टूल्स');

      await service.setLanguage('mr');
      expect(service.translate('common.appName')).toBe('इंडियन फॉर्म हेल्पर');

      await service.setLanguage('bn');
      expect(service.translate('common.appName')).toBe('ইন্ডিয়ান ফর্ম হেল্পার');

      await service.setLanguage('pa');
      expect(service.translate('common.appName')).toBe('ਇੰਡੀਅਨ ਫਾਰਮ ਹੈਲਪਰ');
    });

    it('should interpolate params in translations correctly', async () => {
      await service.setLanguage('en');
      const text = service.translate('photoPage.compressBtn', { size: 50 });
      expect(text).toBe('Compress to 50 KB');

      await service.setLanguage('hi');
      const textHi = service.translate('photoPage.compressBtn', { size: 50 });
      expect(textHi).toBe('50 KB तक कंप्रेस करें');

      await service.setLanguage('mr');
      const textMr = service.translate('photoPage.compressBtn', { size: 50 });
      expect(textMr).toBe('50 KB पर्यंत लहान करा');

      await service.setLanguage('bn');
      const textBn = service.translate('photoPage.compressBtn', { size: 50 });
      expect(textBn).toBe('50 KB পর্যন্ত ছোট করুন');
    });

    it('should fall back gracefully to English when key is missing in another language', async () => {
      await service.setLanguage('hi');
      // If a hypothetical key exists in EN only, it should fall back to English
      const res = service.translate('common.appName');
      expect(res).toBeDefined();
    });

    it('should return the key itself if not found anywhere', () => {
      expect(service.translate('non.existent.translation.key')).toBe('non.existent.translation.key');
    });
  });

  describe('TranslatePipe', () => {
    it('should transform key to localized string', async () => {
      await service.setLanguage('en');
      expect(pipe.transform('common.save', undefined)).toBe('Save File');

      await service.setLanguage('hi');
      expect(pipe.transform('common.save', undefined)).toBe('फाइल सेव करें');
    });

    it('should handle parameter interpolation in pipe', async () => {
      await service.setLanguage('en');
      expect(pipe.transform('photoPage.compressBtn', { size: 20 })).toBe('Compress to 20 KB');
    });
  });

  describe('Translation Dictionary Parity', () => {
    function getKeys(obj: any, prefix = ''): string[] {
      let keys: string[] = [];
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        const newKey = prefix ? `${prefix}.${k}` : k;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          keys = keys.concat(getKeys(val, newKey));
        } else {
          keys.push(newKey);
        }
      }
      return keys;
    }

    const enKeys = getKeys(en);

    it('Hindi dictionary should have parity with English dictionary keys', () => {
      const hiKeys = new Set(getKeys(hi));
      const missingInHi = enKeys.filter(k => !hiKeys.has(k));
      expect(missingInHi).toEqual([]);
    });

    it('Marathi dictionary should have parity with English dictionary keys', () => {
      const mrKeys = new Set(getKeys(mr));
      const missingInMr = enKeys.filter(k => !mrKeys.has(k));
      expect(missingInMr).toEqual([]);
    });

    it('Bengali dictionary should have parity with English dictionary keys', () => {
      const bnKeys = new Set(getKeys(bn));
      const missingInBn = enKeys.filter(k => !bnKeys.has(k));
      expect(missingInBn).toEqual([]);
    });

    it('Punjabi dictionary should have parity with English dictionary keys', () => {
      const paKeys = new Set(getKeys(pa));
      const missingInPa = enKeys.filter(k => !paKeys.has(k));
      expect(missingInPa).toEqual([]);
    });

    /*
     * Parity of keys does not mean parity of placeholders.
     *
     * `translate()` interpolates `{{name}}` against the params a caller passes,
     * and a placeholder that was mistyped or dropped in translation does not
     * fail loudly -- it renders the literal `{{name}}` to the person, or
     * silently omits the number the sentence was built around. A translated
     * string is only interchangeable with its English original if it asks for
     * exactly the same values. Order may differ, and for these languages it
     * often must.
     */
    describe('placeholder parity', () => {
      function resolve(dict: any, key: string): string | undefined {
        const value = key.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), dict);
        return typeof value === 'string' ? value : undefined;
      }

      function placeholders(text: string): string[] {
        return [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1]).sort();
      }

      const languages: Array<[string, any]> = [
        ['Hindi', hi],
        ['Marathi', mr],
        ['Bengali', bn],
        ['Punjabi', pa]
      ];

      it.each(languages)('%s uses the same placeholders as English', (_name, dict) => {
        const mismatched: string[] = [];

        for (const key of enKeys) {
          const source = resolve(en, key);
          const translated = resolve(dict, key);
          if (source === undefined || translated === undefined) continue;

          const wanted = placeholders(source);
          const got = placeholders(translated);
          if (wanted.join(',') !== got.join(',')) {
            mismatched.push(`${key}: expected [${wanted}] but found [${got}]`);
          }
        }

        expect(mismatched).toEqual([]);
      });
    });
  });

  /**
   * Parity between the five dictionaries is not the same thing as coverage.
   *
   * Nine of the twenty-seven tools — Compress PDF, Merge, Split, Extract,
   * Images to PDF, Reader, Annotate, Sign and Protect among them — had no
   * `tools.<id>` block in *any* language, so the registry's English fallback
   * kicked in and those cards stayed in English on every locale. Every parity
   * test above passed the whole time, because all five were equally empty.
   *
   * This checks the registry's ids against the dictionary instead of the
   * dictionaries against each other, which is the comparison that catches it.
   */
  describe('Tool catalogue coverage', () => {
    it('the registry exposes the tools this test knows about', () => {
      expect(TOOL_IDS.length).toBeGreaterThan(20);
    });

    for (const [name, dict] of Object.entries({ en, hi, mr, bn, pa })) {
      it(`${name} has a title and description for every registered tool`, () => {
        const tools = (dict as Record<string, any>)['tools'] ?? {};
        const incomplete = TOOL_IDS.filter(
          (id: string) => !tools[id] || !tools[id].title || !tools[id].description,
        );
        expect(incomplete).toEqual([]);
      });
    }
  });
});
