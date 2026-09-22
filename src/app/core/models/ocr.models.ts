export type OcrSupportedLanguage = 'eng' | 'hin' | 'mar' | 'ben' | 'pan';

export interface OcrLanguageOption {
  code: OcrSupportedLanguage;
  name: string;
  nativeName: string;
}

export const OCR_SUPPORTED_LANGUAGES: OcrLanguageOption[] = [
  { code: 'eng', name: 'English', nativeName: 'English' },
  { code: 'hin', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'mar', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ben', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'pan', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' }
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
