export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'bn' | 'pa';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeName: string;
  script: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari' },
  { code: 'mr', label: 'Marathi', nativeName: 'मराठी', script: 'Devanagari' },
  { code: 'bn', label: 'Bengali', nativeName: 'বাংলা', script: 'Bengali' },
  { code: 'pa', label: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'Gurmukhi' },
];

export type TranslationDictionary = Record<string, any>;
