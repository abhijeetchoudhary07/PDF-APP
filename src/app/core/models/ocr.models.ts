export type OcrSupportedLanguage = 'eng' | 'hin' | 'mar' | 'ben' | 'pan';

export type OcrLanguageCategory = 'indic' | 'international';

export type OcrExpandedLanguage =
  // 13 Indic Scripts
  | 'hin' // Hindi (Devanagari)
  | 'mar' // Marathi (Devanagari)
  | 'ben' // Bengali (Bengali)
  | 'tam' // Tamil (Tamil)
  | 'tel' // Telugu (Telugu)
  | 'kan' // Kannada (Kannada)
  | 'mal' // Malayalam (Malayalam)
  | 'guj' // Gujarati (Gujarati)
  | 'ori' // Odia (Odia)
  | 'asm' // Assamese (Bengali/Assamese)
  | 'urd' // Urdu (Perso-Arabic, RTL)
  | 'san' // Sanskrit (Devanagari)
  | 'nep' // Nepali (Devanagari)
  // 5 International Languages
  | 'eng' // English (Latin)
  | 'spa' // Spanish (Latin)
  | 'fra' // French (Latin)
  | 'ara' // Arabic (Arabic, RTL)
  | 'chi_sim' // Chinese Simplified (Simplified Han)
  // Baseline backward compatibility
  | 'pan'; // Punjabi (Gurmukhi)

export type OcrModelStatus = 'offline_ready' | 'downloaded' | 'available' | 'downloading';

export interface OcrLanguageOption {
  code: string;
  name: string;
  nativeName: string;
  scriptName?: string;
  category?: OcrLanguageCategory;
  isRtl?: boolean;
  fileSizeMB?: number;
  fileName?: string;
  isBundled?: boolean;
  status?: OcrModelStatus;
  sha256?: string;
}

export interface OcrModelMetadata {
  code: string;
  name: string;
  nativeName: string;
  scriptName: string;
  category: OcrLanguageCategory;
  fileSizeMB: number;
  fileName: string;
  isBundled: boolean;
  isRtl?: boolean;
  status: OcrModelStatus;
  downloadProgress?: number;
  sha256?: string;
}

export interface TextLayerCoordinate {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isRtl: boolean;
  text: string;
  cleanText: string;
}

export type ScriptFamily =
  | 'devanagari'
  | 'bengali'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'gujarati'
  | 'odia'
  | 'gurmukhi'
  | 'arabic'
  | 'latin'
  | 'han'
  | 'unknown';

export interface ScriptDefinition {
  family: ScriptFamily;
  name: string;
  defaultLanguage: string;
  alternativeLanguages: string[];
}

export interface ScriptDetectionResult {
  detectedScript: ScriptFamily;
  scriptName: string;
  suggestedLanguage: string;
  confidence: number; // 0 - 100
  isConfident: boolean; // confidence >= 70
  scriptDistribution: Record<ScriptFamily, number>;
  alternativeSuggestions: string[];
  source?: 'digital_text' | 'image_sample' | 'override';
}

export const SCRIPT_DEFINITIONS: Record<ScriptFamily, ScriptDefinition> = {
  devanagari: {
    family: 'devanagari',
    name: 'Devanagari',
    defaultLanguage: 'hin',
    alternativeLanguages: ['mar', 'san', 'nep']
  },
  bengali: {
    family: 'bengali',
    name: 'Bengali',
    defaultLanguage: 'ben',
    alternativeLanguages: ['asm']
  },
  tamil: {
    family: 'tamil',
    name: 'Tamil',
    defaultLanguage: 'tam',
    alternativeLanguages: []
  },
  telugu: {
    family: 'telugu',
    name: 'Telugu',
    defaultLanguage: 'tel',
    alternativeLanguages: []
  },
  kannada: {
    family: 'kannada',
    name: 'Kannada',
    defaultLanguage: 'kan',
    alternativeLanguages: []
  },
  malayalam: {
    family: 'malayalam',
    name: 'Malayalam',
    defaultLanguage: 'mal',
    alternativeLanguages: []
  },
  gujarati: {
    family: 'gujarati',
    name: 'Gujarati',
    defaultLanguage: 'guj',
    alternativeLanguages: []
  },
  odia: {
    family: 'odia',
    name: 'Odia',
    defaultLanguage: 'ori',
    alternativeLanguages: []
  },
  gurmukhi: {
    family: 'gurmukhi',
    name: 'Gurmukhi',
    defaultLanguage: 'pan',
    alternativeLanguages: []
  },
  arabic: {
    family: 'arabic',
    name: 'Arabic / Urdu',
    defaultLanguage: 'urd',
    alternativeLanguages: ['ara']
  },
  latin: {
    family: 'latin',
    name: 'Latin',
    defaultLanguage: 'eng',
    alternativeLanguages: ['spa', 'fra']
  },
  han: {
    family: 'han',
    name: 'Simplified Han',
    defaultLanguage: 'chi_sim',
    alternativeLanguages: []
  },
  unknown: {
    family: 'unknown',
    name: 'Unknown',
    defaultLanguage: 'eng',
    alternativeLanguages: ['hin', 'mar']
  }
};

export const RTL_LANGUAGE_CODES = new Set<string>(['urd', 'ara']);

/**
 * Approved SHA-256 hashes for OCR models to prevent Man-in-the-Middle (MitM) and tampering.
 */
export const APPROVED_OCR_MODEL_HASHES: Record<string, string[]> = {
  eng: ['18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b']
};

/**
 * Approved CDN host origins for downloading extended OCR models.
 * Requests to unapproved CDNs or non-HTTPS schemes are strictly blocked.
 */
export const APPROVED_OCR_CDN_ORIGINS: readonly string[] = [
  'https://cdn.jsdelivr.net',
  'https://tessdata.projectnaptha.com',
  'https://raw.githubusercontent.com'
];

/**
 * Baseline 5 languages preserved for legacy tests and default quick selection.
 */
export const OCR_SUPPORTED_LANGUAGES: OcrLanguageOption[] = [
  {
    code: 'eng',
    name: 'English',
    nativeName: 'English',
    scriptName: 'Latin',
    category: 'international',
    isRtl: false,
    fileSizeMB: 4.1,
    fileName: 'eng.traineddata.gz',
    isBundled: true,
    status: 'offline_ready',
    sha256: '18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b'
  },
  {
    code: 'hin',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    scriptName: 'Devanagari',
    category: 'indic',
    isRtl: false,
    fileSizeMB: 11.8,
    fileName: 'hin.traineddata.gz',
    isBundled: false,
    status: 'available'
  },
  {
    code: 'mar',
    name: 'Marathi',
    nativeName: 'मराठी',
    scriptName: 'Devanagari',
    category: 'indic',
    isRtl: false,
    fileSizeMB: 11.8,
    fileName: 'mar.traineddata.gz',
    isBundled: false,
    status: 'available'
  },
  {
    code: 'ben',
    name: 'Bengali',
    nativeName: 'বাংলা',
    scriptName: 'Bengali',
    category: 'indic',
    isRtl: false,
    fileSizeMB: 11.2,
    fileName: 'ben.traineddata.gz',
    isBundled: false,
    status: 'available'
  },
  {
    code: 'pan',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    scriptName: 'Gurmukhi',
    category: 'indic',
    isRtl: false,
    fileSizeMB: 7.8,
    fileName: 'pan.traineddata.gz',
    isBundled: false,
    status: 'available'
  }
];

/**
 * 13 Indic Scripts
 */
export const OCR_INDIC_LANGUAGES: OcrModelMetadata[] = [
  {
    code: 'hin',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    scriptName: 'Devanagari',
    category: 'indic',
    fileSizeMB: 11.8,
    fileName: 'hin.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'mar',
    name: 'Marathi',
    nativeName: 'मराठी',
    scriptName: 'Devanagari',
    category: 'indic',
    fileSizeMB: 11.8,
    fileName: 'mar.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'ben',
    name: 'Bengali',
    nativeName: 'বাংলা',
    scriptName: 'Bengali',
    category: 'indic',
    fileSizeMB: 11.2,
    fileName: 'ben.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'tam',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    scriptName: 'Tamil',
    category: 'indic',
    fileSizeMB: 9.5,
    fileName: 'tam.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'tel',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    scriptName: 'Telugu',
    category: 'indic',
    fileSizeMB: 9.8,
    fileName: 'tel.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'kan',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    scriptName: 'Kannada',
    category: 'indic',
    fileSizeMB: 8.6,
    fileName: 'kan.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'mal',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    scriptName: 'Malayalam',
    category: 'indic',
    fileSizeMB: 9.2,
    fileName: 'mal.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'guj',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    scriptName: 'Gujarati',
    category: 'indic',
    fileSizeMB: 9.1,
    fileName: 'guj.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'ori',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    scriptName: 'Odia',
    category: 'indic',
    fileSizeMB: 8.9,
    fileName: 'ori.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'asm',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    scriptName: 'Bengali',
    category: 'indic',
    fileSizeMB: 10.5,
    fileName: 'asm.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'urd',
    name: 'Urdu',
    nativeName: 'اردو',
    scriptName: 'Perso-Arabic',
    category: 'indic',
    fileSizeMB: 8.4,
    fileName: 'urd.traineddata.gz',
    isBundled: false,
    isRtl: true,
    status: 'available'
  },
  {
    code: 'san',
    name: 'Sanskrit',
    nativeName: 'संस्कृतम्',
    scriptName: 'Devanagari',
    category: 'indic',
    fileSizeMB: 12.1,
    fileName: 'san.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'nep',
    name: 'Nepali',
    nativeName: 'नेपाली',
    scriptName: 'Devanagari',
    category: 'indic',
    fileSizeMB: 10.2,
    fileName: 'nep.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  }
];

/**
 * 5 International Languages
 */
export const OCR_INTERNATIONAL_LANGUAGES: OcrModelMetadata[] = [
  {
    code: 'eng',
    name: 'English',
    nativeName: 'English',
    scriptName: 'Latin',
    category: 'international',
    fileSizeMB: 4.1,
    fileName: 'eng.traineddata.gz',
    isBundled: true,
    isRtl: false,
    status: 'offline_ready',
    sha256: '18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b'
  },
  {
    code: 'spa',
    name: 'Spanish',
    nativeName: 'Español',
    scriptName: 'Latin',
    category: 'international',
    fileSizeMB: 6.2,
    fileName: 'spa.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'fra',
    name: 'French',
    nativeName: 'Français',
    scriptName: 'Latin',
    category: 'international',
    fileSizeMB: 6.4,
    fileName: 'fra.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  },
  {
    code: 'ara',
    name: 'Arabic',
    nativeName: 'العربية',
    scriptName: 'Arabic',
    category: 'international',
    fileSizeMB: 7.9,
    fileName: 'ara.traineddata.gz',
    isBundled: false,
    isRtl: true,
    status: 'available'
  },
  {
    code: 'chi_sim',
    name: 'Chinese Simplified',
    nativeName: '简体中文',
    scriptName: 'Simplified Han',
    category: 'international',
    fileSizeMB: 15.6,
    fileName: 'chi_sim.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  }
];

/**
 * Total 18 Languages Catalog (13 Indic + 5 International)
 */
export const OCR_EXPANDED_LANGUAGES: OcrModelMetadata[] = [
  ...OCR_INDIC_LANGUAGES,
  ...OCR_INTERNATIONAL_LANGUAGES
];

/**
 * Comprehensive Model Catalog covering all 18 languages + legacy panjabi
 */
export const OCR_MODEL_CATALOG: OcrModelMetadata[] = [
  ...OCR_EXPANDED_LANGUAGES,
  {
    code: 'pan',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    scriptName: 'Gurmukhi',
    category: 'indic',
    fileSizeMB: 7.8,
    fileName: 'pan.traineddata.gz',
    isBundled: false,
    isRtl: false,
    status: 'available'
  }
];

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  words: OcrWord[];
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  thumbnailUrl?: string;
}

export interface OcrProgressEvent {
  stage: 'downloading' | 'initializing' | 'recognizing' | 'completed' | 'error';
  progress: number; // 0 to 1
  pageNumber?: number;
  totalPages?: number;
  message?: string;
}

export interface OcrDocumentResult {
  fileName: string;
  totalPages: number;
  pages: OcrPageResult[];
  fullText: string;
  averageConfidence: number;
  languages: string[];
}

export interface HandwritingBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HandwritingLine {
  id: string;
  text: string;
  confidence: number;
  bbox: HandwritingBbox;
  cropDataUrl?: string;
  wordCount: number;
}

export interface HandwritingOcrOptions {
  language?: string;
  psmMode?: 6 | 11;
  applySauvola?: boolean;
  applyDilation?: boolean;
  applyDeskew?: boolean;
  sauvolaK?: number;
  sauvolaWindow?: number;
  acknowledgedExpectations?: boolean;
  charWhitelist?: string;
}

export interface HandwritingOcrResult {
  fullText: string;
  averageConfidence: number;
  lines: HandwritingLine[];
  originalImageUrl: string;
  processedImageUrl: string;
  sourceFileName: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  acknowledgedExpectations: boolean;
  isHandwritingPipeline: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

export * from './ocr-confidence.types';
export * from './scanned-table.types';
