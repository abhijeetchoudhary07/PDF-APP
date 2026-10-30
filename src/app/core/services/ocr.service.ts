import { Injectable, inject } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  OcrSupportedLanguage,
  OcrLanguageOption,
  OCR_SUPPORTED_LANGUAGES,
  OCR_EXPANDED_LANGUAGES,
  TextLayerCoordinate,
  RTL_LANGUAGE_CODES,
  OcrPageResult,
  OcrProgressEvent,
  OcrDocumentResult,
  OcrWord
} from '../models/ocr.models';
import { OcrModelManagerService } from './ocr-model-manager.service';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class OcrService {
  readonly supportedLanguages: OcrLanguageOption[] = OCR_SUPPORTED_LANGUAGES;
  readonly expandedLanguages = OCR_EXPANDED_LANGUAGES;

  private modelManager?: OcrModelManagerService;
  private activeWorker: Worker | null = null;
  private isCancelled = false;

  constructor() {
    try {
      this.modelManager = inject(OcrModelManagerService, { optional: true }) ?? undefined;
    } catch {
      // Outside Angular injection context (e.g. manual new OcrService() in unit tests)
      this.modelManager = undefined;
    }
  }

  setModelManager(manager: OcrModelManagerService): void {
    this.modelManager = manager;
  }

  getModelManager(): OcrModelManagerService | undefined {
    return this.modelManager;
  }

  /**
   * Checks whether a PDF already contains selectable digital text.
   */
  async detectSelectableText(file: File): Promise<{
    hasText: boolean;
    pageCount: number;
    textSample: string;
    pagesWithText: number[];
    scannedPages: number[];
  }> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    try {
      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;

      const pagesWithText: number[] = [];
      const scannedPages: number[] = [];
      let textSample = '';

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText = '';

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
            pageText += item.str + ' ';
          }
        }

        if (pageText.trim().length > 25) {
          pagesWithText.push(i);
          if (!textSample && pageText.trim().length > 0) {
            textSample = pageText.trim().substring(0, 300);
          }
        } else {
          scannedPages.push(i);
        }
      }

      return {
        hasText: pagesWithText.length > 0,
        pageCount,
        textSample,
        pagesWithText,
        scannedPages
      };
    } finally {
      await loadingTask?.destroy();
    }
  }

  /**
   * Extracts existing digital text from a PDF without running OCR.
   */
  async extractExistingText(file: File, selectedPages?: number[]): Promise<OcrDocumentResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    try {
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const targetPages = selectedPages && selectedPages.length > 0
        ? selectedPages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      const pages: OcrPageResult[] = [];
      let fullText = '';

      for (const pageNum of targetPages) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let pageText = '';

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string') {
            pageText += item.str + ' ';
          }
        }

        const cleanText = OcrService.sanitizeOcrText(pageText);
        fullText += `--- Page ${pageNum} ---\n${cleanText}\n\n`;

        pages.push({
          pageNumber: pageNum,
          text: cleanText,
          confidence: 100,
          words: [],
          language: 'digital',
          status: 'completed'
        });
      }

      return {
        fileName: file.name,
        totalPages: targetPages.length,
        pages,
        fullText: fullText.trim(),
        averageConfidence: 100,
        languages: ['digital']
      };
    } finally {
      await loadingTask?.destroy();
    }
  }

  /**
   * Performs OCR on a file (PDF or Image) page-by-page using Tesseract.js in a Web Worker.
   */
  async performOcr(
    file: File,
    languages: (OcrSupportedLanguage | string)[] | string,
    selectedPages?: number[],
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    this.isCancelled = false;

    const langList = Array.isArray(languages) ? languages : languages.split('+');
    const langStr = Array.isArray(languages) ? languages.join('+') : languages;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    // Ensure non-bundled language models are downloaded & verified
    if (this.modelManager) {
      for (const lang of langList) {
        if (lang !== 'eng') {
          const cached = await this.modelManager.isModelCached(lang);
          if (!cached) {
            const modelMeta = this.modelManager.getModel(lang);
            const modelName = modelMeta?.name || lang;
            const modelSize = modelMeta?.fileSizeMB || 11.8;
            onProgress?.({
              stage: 'downloading',
              progress: 0.1,
              message: `Downloading ${modelName} OCR model (${modelSize} MB) for permanent offline use...`
            });
            await this.modelManager.downloadModel(lang, pct => {
              if (this.isCancelled) return;
              onProgress?.({
                stage: 'downloading',
                progress: Math.min(0.9, (pct / 100) * 0.9),
                message: `Downloading ${modelName} OCR model (${modelSize} MB) for permanent offline use...`
              });
            });
          }
        }
      }
    }

    // Initialize Tesseract Worker with precise contextual text
    if (onProgress) {
      onProgress({
        stage: 'initializing',
        progress: 0.1,
        message: 'Loading offline OCR engine...'
      });
    }

    const baseWorkerOptions = this.modelManager
      ? await this.modelManager.getWorkerOptions(langList)
      : {
          langPath: this.getFallbackLangPath(),
          cachePath: '.',
          gzip: true
        };

    const workerOptions: any = {
      ...baseWorkerOptions,
      logger: (m: any) => {
        if (this.isCancelled) return;
        if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
          onProgress?.({
            stage: 'initializing',
            progress: m.progress || 0.3,
            message: 'Loading offline OCR engine...'
          });
        } else if (m.status === 'recognizing text') {
          // Handled per page
        }
      }
    };

    const worker = await createWorker(langStr, 1, workerOptions);

    this.activeWorker = worker;

    try {
      if (!isPdf) {
        // Single Image OCR
        const result = await this.ocrImageFile(worker, file, langStr, onProgress);
        return result;
      } else {
        // Multi-page PDF OCR
        const result = await this.ocrPdfFile(worker, file, langStr, selectedPages, onProgress);
        return result;
      }
    } finally {
      if (this.activeWorker) {
        await this.activeWorker.terminate();
        this.activeWorker = null;
      }
    }
  }

  /**
   * Resolves fallback local asset directory for Tesseract offline models.
   */
  private getFallbackLangPath(): string {
    if (this.modelManager) return this.modelManager.getBundledAssetPath();
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.origin &&
      !navigator.userAgent?.includes('jsdom')
    ) {
      return '/assets/tesseract';
    }
    try {
      const path = require('node:path');
      return path.resolve(process.cwd(), 'src/assets/tesseract');
    } catch {
      return '/assets/tesseract';
    }
  }

  /**
   * Sanitizes OCR text, stripping ASCII and Unicode control characters
   * to prevent malformed text stream injection or memory corruptions.
   */
  static sanitizeOcrText(rawText: string): string {
    if (!rawText) return '';
    return rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
  }

  /**
   * Encodes HTML entities to prevent Cross-Site Scripting (XSS)
   * when OCR output is rendered in HTML contexts or UI previews.
   */
  static encodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async recognizeWithTimeout(worker: Worker, image: any, timeoutMs = 90000): Promise<any> {
    let timer: any;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`OCR recognition timed out after ${timeoutMs / 1000}s.`)), timeoutMs);
    });
    try {
      return await Promise.race([worker.recognize(image), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async getOptimizedImageInput(fileOrBlob: Blob): Promise<{ input: any; cleanup: () => void }> {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const arrayBuffer = await fileOrBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mime = fileOrBlob.type || 'image/png';
      return {
        input: `data:${mime};base64,${base64}`,
        cleanup: () => {}
      };
    }
    const url = URL.createObjectURL(fileOrBlob);
    return {
      input: url,
      cleanup: () => URL.revokeObjectURL(url)
    };
  }

  private async ocrImageFile(
    worker: Worker,
    file: File,
    languages: string,
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    if (onProgress) {
      onProgress({
        stage: 'recognizing',
        progress: 0.5,
        pageNumber: 1,
        totalPages: 1,
        message: 'Recognizing text on image...'
      });
    }

    const { input: imgUrl, cleanup } = await this.getOptimizedImageInput(file);
    try {
      const ocrRes = await this.recognizeWithTimeout(worker, imgUrl);
      if (this.isCancelled) throw new Error('OCR job was cancelled.');

      const words: OcrWord[] = ((ocrRes.data as any).words || []).map((w: any) => ({
        text: OcrService.sanitizeOcrText(w.text),
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1
        }
      }));

      const pageResult: OcrPageResult = {
        pageNumber: 1,
        text: OcrService.sanitizeOcrText(ocrRes.data.text),
        confidence: Math.round(ocrRes.data.confidence),
        words,
        language: languages,
        status: 'completed'
      };

      onProgress?.({
        stage: 'completed',
        progress: 1.0,
        pageNumber: 1,
        totalPages: 1,
        message: 'OCR completed successfully!'
      });

      return {
        fileName: file.name,
        totalPages: 1,
        pages: [pageResult],
        fullText: pageResult.text,
        averageConfidence: pageResult.confidence,
        languages: languages.split('+')
      };
    } finally {
      cleanup();
    }
  }

  private async ocrPdfFile(
    worker: Worker,
    file: File,
    languages: string,
    selectedPages?: number[],
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    try {
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const targetPages = selectedPages && selectedPages.length > 0
        ? selectedPages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      const pages: OcrPageResult[] = [];
      let fullText = '';
      let totalConfidence = 0;

      for (let idx = 0; idx < targetPages.length; idx++) {
        if (this.isCancelled) throw new Error('OCR job was cancelled.');

        const pageNum = targetPages[idx];
        const overallProgress = idx / targetPages.length;

        onProgress?.({
          stage: 'recognizing',
          progress: overallProgress,
          pageNumber: pageNum,
          totalPages: targetPages.length,
          message: `Recognizing text on page ${pageNum} of ${totalPages}...`
        });

        // Render page to canvas with adaptive scale capping to prevent memory exhaustion on ultra-high-res scans
        const page = await pdf.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const maxDimension = Math.max(unscaledViewport.width, unscaledViewport.height);
        // Optimal long dimension for OCR is ~2400px (standard 300 DPI A4 is ~2480px).
        // Cap scale to prevent allocating massive canvases (e.g. 100MP+) that crash mobile memory.
        const targetScale = maxDimension > 0 ? Math.min(2.0, 2400 / maxDimension) : 2.0;
        const scale = Math.max(1.0, targetScale);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          try { page.cleanup(); } catch {}
          pages.push({
            pageNumber: pageNum,
            text: '',
            confidence: 0,
            words: [],
            language: languages,
            status: 'error',
            errorMessage: 'Could not create canvas context.'
          });
          continue;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;

        try {
          // Recognize via worker with timeout guard
          const ocrRes = await this.recognizeWithTimeout(worker, canvas);
          if (this.isCancelled) throw new Error('OCR job was cancelled.');

          const words: OcrWord[] = ((ocrRes.data as any).words || []).map((w: any) => ({
            text: OcrService.sanitizeOcrText(w.text),
            confidence: w.confidence,
            bbox: {
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1
            }
          }));

          const pageText = OcrService.sanitizeOcrText(ocrRes.data.text);
          const pageConfidence = Math.round(ocrRes.data.confidence);

          fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
          totalConfidence += pageConfidence;

          pages.push({
            pageNumber: pageNum,
            text: pageText,
            confidence: pageConfidence,
            words,
            language: languages,
            status: 'completed'
          });
        } finally {
          // Clean up canvas buffer and pdfjs page glyph caches to prevent memory leaks during multi-page scans
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          canvas.width = 0;
          canvas.height = 0;
          try {
            page.cleanup();
          } catch {}
        }
      }

      onProgress?.({
        stage: 'completed',
        progress: 1.0,
        message: 'OCR completed successfully!'
      });

      return {
        fileName: file.name,
        totalPages: targetPages.length,
        pages,
        fullText: fullText.trim(),
        averageConfidence: targetPages.length > 0 ? Math.round(totalConfidence / targetPages.length) : 0,
        languages: languages.split('+')
      };
    } finally {
      await loadingTask?.destroy();
    }
  }

  /**
   * Reverses grapheme clusters for RTL scripts (Urdu, Arabic) to preserve
   * diacritics and composite glyphs during visual LTR PDF layer rendering.
   */
  static reverseRtlGraphemes(text: string): string {
    if (!text) return '';
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      try {
        const segmenter = new (Intl as any).Segmenter(['ur', 'ar'], { granularity: 'grapheme' });
        const graphemes = Array.from(segmenter.segment(text), (s: any) => s.segment);
        return graphemes.reverse().join('');
      } catch {
        // Fallback below
      }
    }
    return Array.from(text).reverse().join('');
  }

  /**
   * Provides phonetic Latin transliteration for Indic and Arabic characters
   * when rendering into standard PDF fonts (which lack native Unicode glyph tables).
   */
  static transliterateToAscii(text: string): string {
    if (!text) return '';

    // Devanagari (Hindi, Marathi, Sanskrit, Nepali)
    const devanagariMap: Record<string, string> = {
      '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee', '\u0909': 'u', '\u090A': 'oo',
      '\u090B': 'ri', '\u090F': 'e', '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au',
      '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
      '\u091A': 'ch', '\u091B': 'chh', '\u091C': 'j', '\u091D': 'jh', '\u091E': 'ny',
      '\u091F': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
      '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
      '\u092A': 'p', '\u092B': 'ph', '\u092C': 'b', '\u092D': 'bh', '\u092E': 'm',
      '\u092F': 'y', '\u0930': 'r', '\u0932': 'l', '\u0935': 'v', '\u0936': 'sh',
      '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
      '\u093E': 'aa', '\u093F': 'i', '\u0940': 'ee', '\u0941': 'u', '\u0942': 'oo',
      '\u0943': 'ri', '\u0947': 'e', '\u0948': 'ai', '\u094B': 'o', '\u094C': 'au',
      '\u0902': 'n', '\u0903': 'h', '\u094D': ''
    };

    // Arabic / Urdu
    const arabicMap: Record<string, string> = {
      '\u0627': 'a', '\u0628': 'b', '\u067E': 'p', '\u062A': 't', '\u0679': 't',
      '\u062B': 's', '\u062C': 'j', '\u0686': 'ch', '\u062D': 'h', '\u062E': 'kh',
      '\u062F': 'd', '\u0688': 'd', '\u0630': 'z', '\u0631': 'r', '\u0691': 'r',
      '\u0632': 'z', '\u0698': 'zh', '\u0633': 's', '\u0634': 'sh', '\u0635': 's',
      '\u0636': 'z', '\u0637': 't', '\u0638': 'z', '\u0639': 'a', '\u063A': 'gh',
      '\u0641': 'f', '\u0642': 'q', '\u06A9': 'k', '\u06AF': 'g', '\u0644': 'l',
      '\u0645': 'm', '\u0646': 'n', '\u0648': 'w', '\u06C1': 'h', '\u0647': 'h',
      '\u06CC': 'y', '\u06D2': 'y', '\u0649': 'a', '\u0621': '', '\u0626': 'y'
    };

    // Tamil
    const tamilMap: Record<string, string> = {
      '\u0B85': 'a', '\u0B86': 'aa', '\u0B87': 'i', '\u0B88': 'ee', '\u0B89': 'u', '\u0B8A': 'oo',
      '\u0B8E': 'e', '\u0B8F': 'ee', '\u0B90': 'ai', '\u0B92': 'o', '\u0B93': 'oo', '\u0B94': 'au',
      '\u0B95': 'k', '\u0B99': 'ng', '\u0B9A': 'ch', '\u0B9C': 'j', '\u0B9E': 'ny',
      '\u0B9F': 't', '\u0BA3': 'n', '\u0BA4': 't', '\u0BA8': 'n', '\u0BA9': 'n',
      '\u0BAA': 'p', '\u0BAE': 'm', '\u0BAF': 'y', '\u0BB0': 'r', '\u0BB1': 'r',
      '\u0BB2': 'l', '\u0BB3': 'l', '\u0BB4': 'zh', '\u0BB5': 'v', '\u0BB8': 's', '\u0BB9': 'h',
      '\u0BBE': 'aa', '\u0BBF': 'i', '\u0BC0': 'ee', '\u0BC1': 'u', '\u0BC2': 'oo',
      '\u0BC6': 'e', '\u0BC7': 'ee', '\u0BC8': 'ai', '\u0BCA': 'o', '\u0BCB': 'oo', '\u0BCC': 'au',
      '\u0BCD': ''
    };

    // Telugu
    const teluguMap: Record<string, string> = {
      '\u0C05': 'a', '\u0C06': 'aa', '\u0C07': 'i', '\u0C08': 'ee', '\u0C09': 'u', '\u0C0A': 'oo',
      '\u0C0E': 'e', '\u0C0F': 'ee', '\u0C10': 'ai', '\u0C12': 'o', '\u0C13': 'oo', '\u0C14': 'au',
      '\u0C15': 'k', '\u0C16': 'kh', '\u0C17': 'g', '\u0C18': 'gh', '\u0C1A': 'ch', '\u0C1B': 'chh',
      '\u0C1C': 'j', '\u0C1D': 'jh', '\u0C1F': 't', '\u0C20': 'th', '\u0C21': 'd', '\u0C22': 'dh',
      '\u0C23': 'n', '\u0C24': 't', '\u0C25': 'th', '\u0C26': 'd', '\u0C27': 'dh', '\u0C28': 'n',
      '\u0C2A': 'p', '\u0C2B': 'ph', '\u0C2C': 'b', '\u0C2D': 'bh', '\u0C2E': 'm', '\u0C2F': 'y',
      '\u0C30': 'r', '\u0C32': 'l', '\u0C35': 'v', '\u0C36': 'sh', '\u0C37': 'sh', '\u0C38': 's', '\u0C39': 'h',
      '\u0C3E': 'aa', '\u0C3F': 'i', '\u0C40': 'ee', '\u0C41': 'u', '\u0C42': 'oo',
      '\u0C46': 'e', '\u0C47': 'ee', '\u0C48': 'ai', '\u0C4A': 'o', '\u0C4B': 'oo', '\u0C4C': 'au',
      '\u0C4D': ''
    };

    let result = '';
    for (const char of text) {
      if (devanagariMap[char] !== undefined) {
        result += devanagariMap[char];
      } else if (arabicMap[char] !== undefined) {
        result += arabicMap[char];
      } else if (tamilMap[char] !== undefined) {
        result += tamilMap[char];
      } else if (teluguMap[char] !== undefined) {
        result += teluguMap[char];
      } else {
        result += char;
      }
    }
    return result;
  }

  /**
   * Calculates precise PDF text layer coordinates for a word bounding box,
   * handling top-left to bottom-left coordinate transformation, scaling,
   * and Right-to-Left (RTL) script formatting for Urdu and Arabic.
   */
  calculateTextLayerCoordinate(
    word: OcrWord,
    pdfHeight: number,
    scaleX: number = 1,
    scaleY: number = 1,
    language?: string
  ): TextLayerCoordinate {
    const langTokens = language ? language.toLowerCase().split('+') : [];
    const hasRtlLanguage = langTokens.some(l => RTL_LANGUAGE_CODES.has(l)) || (language ? RTL_LANGUAGE_CODES.has(language.toLowerCase()) : false);

    const cleanText = word.text ? word.text.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() : '';
    const hasRtlGlyphs = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(cleanText);
    const isRtl = hasRtlGlyphs || (hasRtlLanguage && !/^[A-Za-z0-9\s.,!?:;'"()\[\]{}+=_-]+$/.test(cleanText));

    const wordX = word.bbox.x0 * scaleX;
    const wordW = Math.max(1, (word.bbox.x1 - word.bbox.x0) * scaleX);
    const wordH = Math.max(1, (word.bbox.y1 - word.bbox.y0) * scaleY);
    const wordY = Math.max(0, pdfHeight - (word.bbox.y1 * scaleY));
    const fontSize = Math.max(6, Math.min(36, wordH * 0.9));

    let text = cleanText;

    if (isRtl && text) {
      // For RTL scripts (Urdu, Arabic), reverse grapheme clusters for logical-to-visual RTL order in standard LTR PDF canvas
      text = OcrService.reverseRtlGraphemes(cleanText);
    }

    return {
      x: wordX,
      y: wordY,
      width: wordW,
      height: wordH,
      fontSize,
      isRtl,
      text,
      cleanText
    };
  }

  /**
   * Provides ASCII-safe fallback characters for non-Latin glyphs if standard font fails.
   */
  toSearchableAsciiFallback(text: string): string {
    if (!text) return '';
    const nfkd = text.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim();
    if (nfkd.length > 0) {
      return nfkd;
    }
    const transliterated = OcrService.transliterateToAscii(text);
    return transliterated.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim();
  }

  /**
   * Generates a Searchable PDF:
   * Preserves 100% of original visual appearance, dimensions, and order,
   * while adding an invisible text layer (opacity: 0) on top for selection and search.
   */
  async generateSearchablePdf(
    originalFile: File,
    ocrResult: OcrDocumentResult
  ): Promise<File> {
    const isPdf = originalFile.type === 'application/pdf' || originalFile.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      // PDF input: Load existing PDF, overlay invisible text layer on OCR pages
      const originalBytes = await originalFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(originalBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const ocrPageMap = new Map<number, OcrPageResult>();
      for (const p of ocrResult.pages) {
        ocrPageMap.set(p.pageNumber, p);
      }

      const totalPdfPages = pdfDoc.getPageCount();

      for (let i = 0; i < totalPdfPages; i++) {
        const pageNum = i + 1;
        const pageOcr = ocrPageMap.get(pageNum);
        if (!pageOcr || !pageOcr.words || pageOcr.words.length === 0) continue;

        const page = pdfDoc.getPage(i);
        const { width: pdfW, height: pdfH } = page.getSize();

        // Calculate bounding box scale factors
        // Tesseract ran on rasterized viewport: Find max coordinates from words to compute accurate scale
        let maxX = 1;
        let maxY = 1;
        for (const w of pageOcr.words) {
          if (w.bbox.x1 > maxX) maxX = w.bbox.x1;
          if (w.bbox.y1 > maxY) maxY = w.bbox.y1;
        }

        const scaleX = pdfW / maxX;
        const scaleY = pdfH / maxY;

        for (const word of pageOcr.words) {
          const coord = this.calculateTextLayerCoordinate(word, pdfH, scaleX, scaleY, pageOcr.language);
          if (!coord.text) continue;

          try {
            page.drawText(coord.text, {
              x: coord.x,
              y: coord.y,
              size: coord.fontSize,
              font,
              color: rgb(0, 0, 0),
              opacity: 0 // Completely invisible text layer for search & copy
            });
          } catch {
            // If WinAnsi cannot encode non-Latin glyphs, transliterate or provide ASCII fallback
            try {
              const asciiFallback = this.toSearchableAsciiFallback(coord.text);
              if (asciiFallback) {
                page.drawText(asciiFallback, {
                  x: coord.x,
                  y: coord.y,
                  size: coord.fontSize,
                  font,
                  color: rgb(0, 0, 0),
                  opacity: 0
                });
              }
            } catch {
              // Ignore glyph embedding errors
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
      return new File([pdfBytes as any], `${baseName}_searchable.pdf`, {
        type: 'application/pdf'
      });

    } else {
      // Image input: Create new PDF with embedded image and invisible text layer
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const imageBytes = await originalFile.arrayBuffer();
      const isPng = originalFile.type === 'image/png';
      const embeddedImage = isPng
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

      const imgDims = embeddedImage.scale(1);
      const page = pdfDoc.addPage([imgDims.width, imgDims.height]);

      // Draw original image
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imgDims.width,
        height: imgDims.height
      });

      // Draw invisible text layer
      const pageOcr = ocrResult.pages[0];
      if (pageOcr && pageOcr.words) {
        for (const word of pageOcr.words) {
          const coord = this.calculateTextLayerCoordinate(word, imgDims.height, 1, 1, pageOcr.language);
          if (!coord.text) continue;

          try {
            page.drawText(coord.text, {
              x: coord.x,
              y: coord.y,
              size: coord.fontSize,
              font,
              color: rgb(0, 0, 0),
              opacity: 0
            });
          } catch {
            try {
              const asciiFallback = this.toSearchableAsciiFallback(coord.text);
              if (asciiFallback) {
                page.drawText(asciiFallback, {
                  x: coord.x,
                  y: coord.y,
                  size: coord.fontSize,
                  font,
                  color: rgb(0, 0, 0),
                  opacity: 0
                });
              }
            } catch {
              // Ignore glyph embedding errors
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
      return new File([pdfBytes as any], `${baseName}_searchable.pdf`, {
        type: 'application/pdf'
      });
    }
  }

  /**
   * Generates a plain text file from OCR results.
   */
  generateTextFile(ocrResult: OcrDocumentResult, fileName: string): File {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const blob = new Blob([ocrResult.fullText], { type: 'text/plain;charset=utf-8' });
    return new File([blob], `${baseName}_ocr.txt`, { type: 'text/plain' });
  }

  /**
   * Generates structured JSON export from OCR results.
   */
  generateJsonFile(ocrResult: OcrDocumentResult, fileName: string): File {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const jsonStr = JSON.stringify(ocrResult, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], `${baseName}_ocr_structured.json`, { type: 'application/json' });
  }

  /**
   * Recognises a small image region and returns its words with bounding boxes.
   *
   * Used by the scanner's H8 auto-naming to read the heading strip off page 1.
   * It runs on its own worker and deliberately does not touch `activeWorker` or
   * `isCancelled`: those belong to a full document job, and a title read must
   * not be able to cancel one or be cancelled by one.
   */
  async recognizeRegionWords(
    blob: Blob,
    language: string = 'eng'
  ): Promise<{ text: string; words: OcrWord[] }> {
    const workerOpts: any = {
      langPath: this.modelManager ? this.modelManager.getBundledAssetPath() : '/assets/tesseract',
      cachePath: '.',
      gzip: true
    };
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const path = require('node:path');
        workerOpts['workerPath'] = path.resolve(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js');
      } catch {}
    }
    const worker = await createWorker(language, 1, workerOpts);
    const { input: url, cleanup } = await this.getOptimizedImageInput(blob);
    try {
      const res = await worker.recognize(url);
      const words: OcrWord[] = ((res.data as any).words || []).map((w: any) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1
        }
      }));
      return { text: (res.data.text || '').trim(), words };
    } finally {
      cleanup();
      await worker.terminate();
    }
  }

  /**
   * Cancels any active OCR job.
   */
  cancelJob(): void {
    this.isCancelled = true;
    if (this.activeWorker) {
      this.activeWorker.terminate();
      this.activeWorker = null;
    }
  }
}
