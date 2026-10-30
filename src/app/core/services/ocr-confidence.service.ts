import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';

import {
  ConfidenceTier,
  ConfidenceBbox,
  ConfidenceWord,
  ConfidenceStats,
  DictionaryEntry,
  ConfidencePageResult,
  ConfidenceDocumentResult
} from '../models/ocr-confidence.types';
import { OcrDocumentResult, OcrPageResult, OcrWord } from '../models/ocr.models';
import { OcrModelManagerService } from './ocr-model-manager.service';

export const DICTIONARY_STORAGE_KEY = 'OCR_CORRECTION_DICTIONARY_V1';

export const MAX_DICTIONARY_RULES = 200;

export const DEFAULT_DICTIONARY_SEEDS: Omit<DictionaryEntry, 'id' | 'createdAt'>[] = [
  { target: 'rn', replacement: 'm', matchCase: false },
  { target: 'vv', replacement: 'w', matchCase: false },
  { target: 'cl', replacement: 'd', matchCase: false },
  { target: '1l', replacement: 'll', matchCase: false },
  { target: 'l0', replacement: '10', matchCase: false }
];

/**
 * Strips non-printable control characters, null bytes, and malicious scripts from dictionary text.
 */
export function sanitizeDictionaryText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|style|svg|img|link|meta)\b[^>]*>/gi, '')
    .trim();
}

/**
 * Validates a regex pattern to block Catastrophic Backtracking (ReDoS).
 * Disallows dangerous nested repetitions like (a+)+, (.*)*, (x|y+)+, etc.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') return false;
  if (pattern.length > 100) return false;

  const dangerousPatterns = [
    /\([^)]*([*+])[^)]*\)[*+]/,
    /\([^)]*(\{[0-9]+,[0-9]*\})[^)]*\)[*+]/,
    /\([^)]*([*+])[^)]*\{[0-9]+,[0-9]*\}/,
    /(\+)+/,
    /(\*)+/
  ];

  for (const dp of dangerousPatterns) {
    if (dp.test(pattern)) return false;
  }

  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates dictionary entry schema and prevents prototype pollution.
 */
export function validateDictionaryEntry(raw: any): DictionaryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  // Block prototype pollution
  if (
    Object.prototype.hasOwnProperty.call(raw, '__proto__') ||
    Object.prototype.hasOwnProperty.call(raw, 'constructor') ||
    Object.prototype.hasOwnProperty.call(raw, 'prototype')
  ) {
    return null;
  }

  const target = sanitizeDictionaryText(String(raw.target || ''));
  const replacement = sanitizeDictionaryText(String(raw.replacement || ''));

  if (!target || target.length > 100 || replacement.length > 100) {
    return null;
  }

  const isRegex = raw.isRegex === true && isSafeRegexPattern(target);
  const matchCase = raw.matchCase === true;
  const isWholeWord = raw.isWholeWord === true;

  const id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(raw.id)
    ? raw.id
    : `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) && raw.createdAt > 0
    ? raw.createdAt
    : Date.now();

  const hitCount = typeof raw.hitCount === 'number' && Number.isFinite(raw.hitCount)
    ? Math.max(0, Math.floor(raw.hitCount))
    : 0;

  return {
    id,
    target,
    replacement,
    matchCase,
    isWholeWord,
    isRegex,
    createdAt,
    hitCount
  };
}

@Injectable({
  providedIn: 'root'
})
export class OcrConfidenceService {
  private modelManager = inject(OcrModelManagerService);
  private activeWorker: Worker | null = null;
  private cachedDictionary: DictionaryEntry[] | null = null;

  /**
   * Categorizes a numeric confidence score (0 to 100) into High, Medium, or Low tier.
   * High: >= 85%
   * Medium: 60% - 84%
   * Low: < 60%
   */
  classifyTier(confidence: number): ConfidenceTier {
    const score = Math.max(0, Math.min(100, Math.round(confidence)));
    if (score >= 85) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  /**
   * Computes aggregate confidence metrics and distribution percentages.
   */
  computeStats(words: { confidence: number }[]): ConfidenceStats {
    const totalWords = words.length;
    if (totalWords === 0) {
      return {
        totalWords: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        highPercentage: 0,
        mediumPercentage: 0,
        lowPercentage: 0,
        averageConfidence: 0
      };
    }

    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let totalScore = 0;

    for (const w of words) {
      const tier = this.classifyTier(w.confidence);
      if (tier === 'high') highCount++;
      else if (tier === 'medium') mediumCount++;
      else lowCount++;
      totalScore += w.confidence;
    }

    const averageConfidence = Math.round(totalScore / totalWords);
    const highPercentage = Math.round((highCount / totalWords) * 100);
    const mediumPercentage = Math.round((mediumCount / totalWords) * 100);
    const lowPercentage = Math.round((lowCount / totalWords) * 100);

    return {
      totalWords,
      highCount,
      mediumCount,
      lowCount,
      highPercentage,
      mediumPercentage,
      lowPercentage,
      averageConfidence
    };
  }

  /**
   * Extracts and standardizes word confidence items from OCR output.
   */
  extractConfidenceWords(
    rawWords: (OcrWord | any)[],
    pageNumber: number = 1
  ): ConfidenceWord[] {
    const result: ConfidenceWord[] = [];

    for (let i = 0; i < rawWords.length; i++) {
      const w = rawWords[i];
      const rawText = (w.text || '').trim();
      if (!rawText) continue;

      const conf = Math.max(0, Math.min(100, Math.round(w.confidence || 0)));
      const tier = this.classifyTier(conf);

      const bboxRaw = w.bbox || {};
      const x0 = bboxRaw.x0 ?? bboxRaw.x ?? 0;
      const y0 = bboxRaw.y0 ?? bboxRaw.y ?? 0;
      const x1 = bboxRaw.x1 ?? (x0 + (bboxRaw.width || 0));
      const y1 = bboxRaw.y1 ?? (y0 + (bboxRaw.height || 0));

      const width = Math.max(1, Math.round(x1 - x0));
      const height = Math.max(1, Math.round(y1 - y0));

      const bbox: ConfidenceBbox = {
        x: Math.round(x0),
        y: Math.round(y0),
        width,
        height,
        x0: Math.round(x0),
        y0: Math.round(y0),
        x1: Math.round(x1),
        y1: Math.round(y1)
      };

      const wordId = `word_p${pageNumber}_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const suggestedReplacements = this.generateWordSuggestions(rawText);

      result.push({
        id: wordId,
        text: rawText,
        originalText: rawText,
        confidence: conf,
        tier,
        bbox,
        pageNumber,
        isCorrected: false,
        isReviewed: false,
        suggestedReplacements
      });
    }

    return result;
  }

  /**
   * Generates candidate word replacements for low-confidence or misrecognized words.
   */
  generateWordSuggestions(text: string): string[] {
    const suggestions = new Set<string>();

    // Common OCR misread pairings
    const swapRules: [RegExp, string][] = [
      [/rn/g, 'm'],
      [/vv/g, 'w'],
      [/cl/g, 'd'],
      [/1l/g, 'll'],
      [/l0/g, '10'],
      [/0(?=[A-Za-z])/g, 'O'],
      [/(?<=[A-Za-z])0/g, 'o'],
      [/1(?=[A-Za-z])/g, 'l'],
      [/5(?=[A-Za-z])/g, 'S'],
      [/8(?=[A-Za-z])/g, 'B']
    ];

    for (const [pattern, replacement] of swapRules) {
      if (pattern.test(text)) {
        const candidate = text.replace(pattern, replacement);
        if (candidate !== text) suggestions.add(candidate);
      }
    }

    // Capitalized / lowercase variant
    if (text.length > 0) {
      const title = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      if (title !== text) suggestions.add(title);
    }

    return Array.from(suggestions).slice(0, 5);
  }

  /**
   * Persistent Correction Dictionary Management
   */
  async loadDictionary(): Promise<DictionaryEntry[]> {
    if (this.cachedDictionary) {
      return [...this.cachedDictionary];
    }

    try {
      const res = await Preferences.get({ key: DICTIONARY_STORAGE_KEY });
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) {
          const validEntries: DictionaryEntry[] = [];
          for (const item of parsed) {
            const entry = validateDictionaryEntry(item);
            if (entry && validEntries.length < MAX_DICTIONARY_RULES) {
              validEntries.push(entry);
            }
          }
          this.cachedDictionary = validEntries;
          return [...validEntries];
        }
      }
    } catch {}

    // Initialize with default seeds if empty
    const initialList: DictionaryEntry[] = DEFAULT_DICTIONARY_SEEDS.map((seed, idx) => ({
      ...seed,
      id: `seed_rule_${idx + 1}`,
      createdAt: Date.now() - (idx * 1000)
    }));

    await this.saveDictionary(initialList);
    this.cachedDictionary = initialList;
    return [...initialList];
  }

  async saveDictionary(entries: DictionaryEntry[]): Promise<void> {
    const validList: DictionaryEntry[] = [];
    for (const item of entries) {
      const valid = validateDictionaryEntry(item);
      if (valid && validList.length < MAX_DICTIONARY_RULES) {
        validList.push(valid);
      }
    }
    this.cachedDictionary = [...validList];
    try {
      await Preferences.set({
        key: DICTIONARY_STORAGE_KEY,
        value: JSON.stringify(validList)
      });
    } catch {}
  }

  async addCorrectionRule(
    target: string,
    replacement: string,
    matchCase: boolean = false,
    isRegex: boolean = false,
    isWholeWord?: boolean
  ): Promise<DictionaryEntry> {
    const cleanTarget = sanitizeDictionaryText(target);
    const cleanReplacement = sanitizeDictionaryText(replacement);

    if (!cleanTarget) {
      throw new Error('Target text cannot be empty');
    }

    if (isRegex && !isSafeRegexPattern(cleanTarget)) {
      throw new Error('SecurityError: Invalid or potentially vulnerable regex pattern detected.');
    }

    const list = await this.loadDictionary();

    // Check if an existing rule already handles this target
    const existingIdx = list.findIndex(e =>
      matchCase ? e.target === cleanTarget : e.target.toLowerCase() === cleanTarget.toLowerCase()
    );

    let entry: DictionaryEntry;
    if (existingIdx >= 0) {
      list[existingIdx].replacement = cleanReplacement;
      list[existingIdx].matchCase = matchCase;
      list[existingIdx].isRegex = isRegex;
      list[existingIdx].isWholeWord = isWholeWord;
      entry = list[existingIdx];
    } else {
      entry = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        target: cleanTarget,
        replacement: cleanReplacement,
        matchCase,
        isWholeWord,
        isRegex,
        createdAt: Date.now(),
        hitCount: 0
      };
      if (list.length >= MAX_DICTIONARY_RULES) {
        list.shift(); // Evict oldest rule to prevent memory exhaustion
      }
      list.push(entry);
    }

    await this.saveDictionary(list);
    return entry;
  }

  async deleteCorrectionRule(id: string): Promise<void> {
    const list = await this.loadDictionary();
    const filtered = list.filter(e => e.id !== id);
    await this.saveDictionary(filtered);
  }

  async clearDictionary(): Promise<void> {
    await this.saveDictionary([]);
  }

  /**
   * Applies the persistent dictionary to a given text.
   * Guarantees:
   * 1. Idempotence: applying multiple times yields the exact same text.
   * 2. Case awareness: handles lowercase, Titlecase, and UPPERCASE properly.
   * 3. Word boundaries: supports regex word boundaries (e.g. \b...\b) or whole-word rules.
   * 4. ReDoS & Injection Protection: escapes literal targets and enforces safe patterns.
   */
  applyDictionary(text: string, customDictionary?: DictionaryEntry[]): string {
    if (!text) return '';
    const dict = customDictionary || this.cachedDictionary || [];
    if (dict.length === 0) return text;

    let output = text;

    for (const rule of dict) {
      const validated = validateDictionaryEntry(rule);
      if (!validated) continue;

      const { target, replacement, matchCase, isRegex, isWholeWord } = validated;
      if (!target || target === replacement) continue;

      let regex: RegExp;
      const flags = matchCase ? 'g' : 'gi';

      if (isRegex) {
        if (!isSafeRegexPattern(target)) continue;
        try {
          regex = new RegExp(target, flags);
        } catch {
          continue;
        }
      } else {
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let patternStr = escaped;
        if (isWholeWord) {
          const startsWithWordChar = /^\w/.test(target);
          const endsWithWordChar = /\w$/.test(target);
          const leftBound = startsWithWordChar ? '\\b' : '(?:^|(?<=[^\\w]))';
          const rightBound = endsWithWordChar ? '\\b' : '(?=[^\\w]|$)';
          patternStr = `${leftBound}${escaped}${rightBound}`;
        }
        regex = new RegExp(patternStr, flags);
      }

      if (matchCase) {
        output = output.replace(regex, replacement);
      } else {
        output = output.replace(regex, (match) => {
          // Preserve letter case from the matched substring
          if (match === match.toUpperCase() && match !== match.toLowerCase()) {
            return replacement.toUpperCase();
          }
          if (match[0] === match[0].toUpperCase() && match.slice(1) === match.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
          }
          return replacement.toLowerCase();
        });
      }
    }

    return output;
  }

  /**
   * Visual Confidence Heatmap Overlay:
   * Renders semi-transparent colored bounding boxes directly over a canvas.
   * Green = High (>=85%)
   * Amber = Medium (60-84%)
   * Red = Low (<60%)
   */
  drawConfidenceHeatmap(
    targetCanvas: HTMLCanvasElement,
    words: ConfidenceWord[],
    options: {
      showHigh?: boolean;
      showMedium?: boolean;
      showLow?: boolean;
      activeWordId?: string;
      scale?: number;
    } = {}
  ): void {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    const showHigh = options.showHigh !== false;
    const showMedium = options.showMedium !== false;
    const showLow = options.showLow !== false;
    const scale = options.scale || 1.0;

    ctx.save();

    for (const w of words) {
      if (w.tier === 'high' && !showHigh) continue;
      if (w.tier === 'medium' && !showMedium) continue;
      if (w.tier === 'low' && !showLow) continue;

      const x = w.bbox.x * scale;
      const y = w.bbox.y * scale;
      const width = w.bbox.width * scale;
      const height = w.bbox.height * scale;

      const isActive = w.id === options.activeWordId;

      let fillColor = 'rgba(34, 197, 94, 0.22)';
      let strokeColor = 'rgba(34, 197, 94, 0.75)';

      if (w.tier === 'medium') {
        fillColor = 'rgba(245, 158, 11, 0.28)';
        strokeColor = 'rgba(217, 119, 6, 0.85)';
      } else if (w.tier === 'low') {
        fillColor = 'rgba(239, 68, 68, 0.35)';
        strokeColor = 'rgba(220, 38, 38, 0.95)';
      }

      if (isActive) {
        fillColor = 'rgba(99, 102, 241, 0.45)';
        strokeColor = '#4f46e5';
        ctx.lineWidth = 2.5;
      } else {
        ctx.lineWidth = 1.2;
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);

      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(x, y, width, height);
    }

    ctx.restore();
  }

  /**
   * Crops a magnified snippet of a word from the original document canvas with immediate memory cleanup.
   */
  cropMagnifiedWord(
    canvas: HTMLCanvasElement,
    bbox: ConfidenceBbox,
    padding: number = 6
  ): string {
    const cropCanvas = document.createElement('canvas');
    try {
      const x0 = Math.max(0, bbox.x0 - padding);
      const y0 = Math.max(0, bbox.y0 - padding);
      const x1 = Math.min(canvas.width, bbox.x1 + padding);
      const y1 = Math.min(canvas.height, bbox.y1 + padding);

      const w = Math.max(1, Math.round(x1 - x0));
      const h = Math.max(1, Math.round(y1 - y0));

      cropCanvas.width = w;
      cropCanvas.height = h;

      const ctx = cropCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
        return cropCanvas.toDataURL('image/jpeg', 0.92);
      }
      return '';
    } finally {
      cropCanvas.width = 0;
      cropCanvas.height = 0;
    }
  }

  /**
   * Applies 3x DPR scaling with bicubic interpolation and unsharp masking on a crop region.
   * This prepares the isolated region for razor-sharp re-OCR.
   */
  cropRegionWith3xDprAndUnsharpMask(
    canvas: HTMLCanvasElement,
    bbox: { x: number; y: number; width: number; height: number },
    padding: number = 4
  ): HTMLCanvasElement {
    const pad = Math.max(0, padding);
    const srcX = Math.max(0, bbox.x - pad);
    const srcY = Math.max(0, bbox.y - pad);
    const srcW = Math.min(canvas.width - srcX, bbox.width + pad * 2);
    const srcH = Math.min(canvas.height - srcY, bbox.height + pad * 2);

    const scale = 3.0; // 3x DPR
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetW;
    scaledCanvas.height = targetH;

    const ctx = scaledCanvas.getContext('2d');
    if (!ctx) return scaledCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

    // Apply Unsharp Masking filter to boost edge contrast:
    // Kernel:
    // [  0, -1,  0 ]
    // [ -1,  5, -1 ]
    // [  0, -1,  0 ]
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;
    const outputData = new Uint8ClampedArray(data);

    const stride = targetW * 4;
    for (let y = 1; y < targetH - 1; y++) {
      const rowOffset = y * stride;
      for (let x = 1; x < targetW - 1; x++) {
        const idx = rowOffset + x * 4;

        for (let c = 0; c < 3; c++) {
          const center = data[idx + c];
          const top = data[idx - stride + c];
          const bottom = data[idx + stride + c];
          const left = data[idx - 4 + c];
          const right = data[idx + 4 + c];

          const sharpened = center * 5 - (top + bottom + left + right);
          outputData[idx + c] = Math.min(255, Math.max(0, sharpened));
        }
        outputData[idx + 3] = data[idx + 3];
      }
    }

    imgData.data.set(outputData);
    ctx.putImageData(imgData, 0, 0);
    return scaledCanvas;
  }

  /**
   * Targeted Region Re-OCR:
   * Re-recognizes only the target word or region at 3x DPR + unsharp masking.
   * Updates only that word's entry while leaving all surrounding page text completely intact.
   */
  async reOcrRegion(
    canvas: HTMLCanvasElement,
    word: ConfidenceWord,
    language: string = 'eng'
  ): Promise<{ text: string; confidence: number; words: ConfidenceWord[] }> {
    const croppedCanvas = this.cropRegionWith3xDprAndUnsharpMask(canvas, word.bbox);
    try {
      const worker = await this.getOrCreateWorker(language);

      await worker.setParameters({
        tessedit_pageseg_mode: '7' as any // PSM 7: Treat the image as a single text line
      });

      const res = await worker.recognize(croppedCanvas);
      const rawText = sanitizeDictionaryText((res.data.text || '').trim());
      const newConfidence = Math.round(res.data.confidence || 75);

      const rawWords = (res.data as any).words || [];
      const newWords = this.extractConfidenceWords(rawWords, word.pageNumber);

      return {
        text: rawText || word.text,
        confidence: newConfidence,
        words: newWords
      };
    } finally {
      croppedCanvas.width = 0;
      croppedCanvas.height = 0;
    }
  }

  /**
   * Transforms an existing OcrDocumentResult and preview canvases into a full ConfidenceDocumentResult.
   */
  async auditOcrDocument(
    ocrDoc: OcrDocumentResult,
    canvases: HTMLCanvasElement[]
  ): Promise<ConfidenceDocumentResult> {
    const pages: ConfidencePageResult[] = [];
    const allWords: ConfidenceWord[] = [];
    const dict = await this.loadDictionary();

    for (let pIdx = 0; pIdx < ocrDoc.pages.length; pIdx++) {
      const page = ocrDoc.pages[pIdx];
      const pageNum = page.pageNumber || (pIdx + 1);
      const canvas = canvases[pIdx] || document.createElement('canvas');

      const rawWords = page.words || [];
      const extractedWords = this.extractConfidenceWords(rawWords, pageNum);

      // Crop word image thumbnails for quick drawer
      for (const w of extractedWords) {
        if (canvas.width > 0 && canvas.height > 0) {
          w.cropDataUrl = this.cropMagnifiedWord(canvas, w.bbox);
        }
      }

      // Automatically apply learned dictionary replacements to recognized words
      for (const w of extractedWords) {
        const corrected = this.applyDictionary(w.text, dict);
        if (corrected !== w.text) {
          w.text = corrected;
          w.isCorrected = true;
        }
      }

      const pageStats = this.computeStats(extractedWords);
      const pageText = extractedWords.map(w => w.text).join(' ');

      const canvasDataUrl = canvas.width > 0 && canvas.height > 0
        ? canvas.toDataURL('image/jpeg', 0.9)
        : '';

      pages.push({
        pageNumber: pageNum,
        canvasDataUrl,
        width: canvas.width || 600,
        height: canvas.height || 800,
        words: extractedWords,
        stats: pageStats,
        text: pageText
      });

      allWords.push(...extractedWords);
    }

    const overallStats = this.computeStats(allWords);
    const fullText = pages.map(p => p.text).join('\n\n');
    const lowConfidenceWords = allWords.filter(w => w.tier === 'low' || w.tier === 'medium');

    return {
      fileName: ocrDoc.fileName,
      totalPages: pages.length,
      pages,
      overallStats,
      fullText,
      allWords,
      lowConfidenceWords
    };
  }

  /**
   * Replaces a specific word in the document, optionally replacing all occurrences
   * and optionally saving the rule to the persistent correction dictionary.
   */
  async replaceWordInDocument(
    doc: ConfidenceDocumentResult,
    wordId: string,
    newText: string,
    replaceEverywhere: boolean = false,
    addToDict: boolean = false
  ): Promise<ConfidenceDocumentResult> {
    const cleanReplacement = newText.trim();
    if (!cleanReplacement) return doc;

    let targetText = '';
    for (const w of doc.allWords) {
      if (w.id === wordId) {
        targetText = w.text;
        break;
      }
    }

    if (!targetText) return doc;

    // Save to dictionary if requested
    if (addToDict && targetText !== cleanReplacement) {
      await this.addCorrectionRule(targetText, cleanReplacement, false);
    }

    // Update words
    for (const page of doc.pages) {
      for (const w of page.words) {
        if (w.id === wordId || (replaceEverywhere && w.text.toLowerCase() === targetText.toLowerCase())) {
          w.text = cleanReplacement;
          w.isCorrected = true;
          w.isReviewed = true;
        }
      }
      page.text = page.words.map(w => w.text).join(' ');
      page.stats = this.computeStats(page.words);
    }

    doc.overallStats = this.computeStats(doc.allWords);
    doc.fullText = doc.pages.map(p => p.text).join('\n\n');
    doc.lowConfidenceWords = doc.allWords.filter(w => (w.tier === 'low' || w.tier === 'medium') && !w.isReviewed);

    return { ...doc };
  }

  /**
   * Generates a plain text export file.
   */
  exportCorrectedTextFile(doc: ConfidenceDocumentResult): File {
    const baseName = (doc.fileName || 'document.pdf').replace(/\.[^/.]+$/, '');
    const blob = new Blob([doc.fullText || ''], { type: 'text/plain;charset=utf-8' });
    return new File([blob], `${baseName}_corrected.txt`, { type: 'text/plain' });
  }

  /**
   * Generates a structured JSON quality audit export file.
   */
  exportCorrectedJsonFile(doc: ConfidenceDocumentResult): File {
    const baseName = (doc.fileName || 'document.pdf').replace(/\.[^/.]+$/, '');
    const jsonStr = JSON.stringify(
      {
        fileName: doc.fileName || 'document.pdf',
        overallStats: doc.overallStats,
        totalPages: doc.totalPages,
        fullText: doc.fullText,
        pages: doc.pages.map(p => ({
          pageNumber: p.pageNumber,
          stats: p.stats,
          text: p.text,
          words: p.words.map(w => ({
            id: w.id,
            text: w.text,
            originalText: w.originalText,
            confidence: w.confidence,
            tier: w.tier,
            bbox: w.bbox,
            isCorrected: w.isCorrected
          }))
        }))
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], `${baseName}_ocr_audit.json`, { type: 'application/json' });
  }

  /**
   * Converts a ConfidenceDocumentResult into an OcrDocumentResult for generating searchable PDFs.
   */
  toOcrDocumentResult(doc: ConfidenceDocumentResult): OcrDocumentResult {
    return {
      fileName: doc.fileName,
      totalPages: doc.totalPages,
      fullText: doc.fullText,
      averageConfidence: doc.overallStats.averageConfidence,
      languages: ['eng'],
      pages: doc.pages.map(p => ({
        pageNumber: p.pageNumber,
        text: p.text,
        confidence: p.stats.averageConfidence,
        language: 'eng',
        status: 'completed',
        words: p.words.map(w => ({
          text: w.text,
          confidence: w.confidence,
          bbox: {
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1
          }
        }))
      }))
    };
  }

  async terminateWorker(): Promise<void> {
    if (this.activeWorker) {
      try {
        await this.activeWorker.terminate();
      } catch {}
      this.activeWorker = null;
    }
  }

  private async getOrCreateWorker(language: string): Promise<Worker> {
    if (this.activeWorker) {
      return this.activeWorker;
    }

    const workerOpts: any = this.modelManager
      ? await this.modelManager.getWorkerOptions(language)
      : {
          langPath: '/assets/tesseract',
          cachePath: '.',
          gzip: true
        };

    if (typeof process !== 'undefined' && process.versions && (process.versions as any).node) {
      try {
        const path = require('node:path');
        workerOpts['workerPath'] = path.resolve(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js');
      } catch {}
    }

    const worker = await createWorker(language, 1, workerOpts);
    this.activeWorker = worker;
    return worker;
  }
}
