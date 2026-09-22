import { SupportedLanguage, TranslationDictionary } from '../i18n.types';
import { en } from './en';
import { hi } from './hi';
import { mr } from './mr';
import { bn } from './bn';
import { pa } from './pa';

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en,
  hi,
  mr,
  bn,
  pa
};

export { en, hi, mr, bn, pa };
