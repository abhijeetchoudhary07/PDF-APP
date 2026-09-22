import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import {
  SupportedLanguage,
  LanguageOption,
  SUPPORTED_LANGUAGES,
  TranslationDictionary
} from '../i18n/i18n.types';
import { TRANSLATIONS } from '../i18n/translations';

const LANGUAGE_KEY = 'IFH_APP_LANGUAGE';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  readonly supportedLanguages: LanguageOption[] = SUPPORTED_LANGUAGES;
  private readonly defaultLanguage: SupportedLanguage = 'en';

  private explicitlySet = false;

  private currentLangSubject = new BehaviorSubject<SupportedLanguage>(this.defaultLanguage);
  public currentLang$: Observable<SupportedLanguage> = this.currentLangSubject.asObservable();

  constructor() {
    this.initLanguage();
  }

  get currentLang(): SupportedLanguage {
    return this.currentLangSubject.value;
  }

  private async initLanguage(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: LANGUAGE_KEY });
      if (this.explicitlySet) {
        return;
      }
      if (value && this.isValidLanguage(value)) {
        this.applyLanguage(value as SupportedLanguage);
        return;
      }
    } catch (e) {
      console.warn('Could not read saved language preference', e);
    }

    if (this.explicitlySet) {
      return;
    }

    // Try detecting from browser language
    const detected = this.detectBrowserLanguage();
    if (!this.explicitlySet) {
      this.applyLanguage(detected);
    }
  }

  private detectBrowserLanguage(): SupportedLanguage {
    try {
      const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
      for (const lang of browserLanguages) {
        const code = lang.toLowerCase().split('-')[0];
        if (this.isValidLanguage(code)) {
          return code as SupportedLanguage;
        }
      }
    } catch {
      // Fallback to default
    }
    return this.defaultLanguage;
  }

  private isValidLanguage(lang: string): boolean {
    return this.supportedLanguages.some(l => l.code === lang);
  }

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    if (!this.isValidLanguage(lang)) {
      return;
    }
    this.explicitlySet = true;
    this.applyLanguage(lang);
    try {
      await Preferences.set({ key: LANGUAGE_KEY, value: lang });
    } catch (e) {
      console.warn('Could not save language preference', e);
    }
  }

  private applyLanguage(lang: SupportedLanguage): void {
    if (this.currentLangSubject.value !== lang) {
      this.currentLangSubject.next(lang);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }

  /**
   * Translates a dot-separated key with optional param interpolation.
   * Falls back to English if key is missing in active language.
   * Example: translate('common.dimensions') or translate('photoPage.compressBtn', { size: 50 })
   */
  translate(key: string, params?: Record<string, any>): string {
    if (!key) return '';

    const currentDict = TRANSLATIONS[this.currentLang];
    const fallbackDict = TRANSLATIONS[this.defaultLanguage];

    let value = this.resolveKey(currentDict, key);
    if (value === undefined || value === null) {
      value = this.resolveKey(fallbackDict, key);
    }

    if (value === undefined || value === null) {
      return key;
    }

    if (typeof value !== 'string') {
      return String(value);
    }

    if (params) {
      return this.interpolate(value, params);
    }

    return value;
  }

  /**
   * Shortcut for translate
   */
  t(key: string, params?: Record<string, any>): string {
    return this.translate(key, params);
  }

  getLanguageOption(code?: SupportedLanguage): LanguageOption {
    const target = code || this.currentLang;
    return this.supportedLanguages.find(l => l.code === target) || this.supportedLanguages[0];
  }

  private resolveKey(obj: TranslationDictionary, path: string): any {
    if (!obj) return undefined;
    const parts = path.split('.');
    let current: any = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  private interpolate(text: string, params: Record<string, any>): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, varName) => {
      return params[varName] !== undefined ? String(params[varName]) : `{{${varName}}}`;
    });
  }
}
