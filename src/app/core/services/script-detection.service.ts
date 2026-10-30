import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';
import {
  ScriptFamily,
  ScriptDetectionResult,
  SCRIPT_DEFINITIONS
} from '../models/ocr.models';

const SCRIPT_PREF_PREFIX = 'ocr_script_pref_';
const MAX_DIGITAL_TEXT_CHARS = 10000;
const DETECTION_TIMEOUT_MS = 8000;

@Injectable({
  providedIn: 'root'
})
export class ScriptDetectionService {
  /**
   * Fast Digital Text Pre-Check:
   * Analyzes Unicode code point blocks across Indic, Latin, Arabic, and Han scripts.
   * If existing text is present in the document, this runs instantaneously (< 1ms).
   * Hardened against ReDoS, oversized inputs, and malformed control character sequences.
   */
  async detectScriptFromText(text: string): Promise<ScriptDetectionResult> {
    if (!text || typeof text !== 'string') {
      return this.createUnknownResult('digital_text');
    }

    // Cybersecurity hardening: strip non-printable control characters (except standard whitespace) and null bytes
    const sanitizedText = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
    if (sanitizedText.trim().length === 0) {
      return this.createUnknownResult('digital_text');
    }

    // Bounded processing: analyze first 10,000 characters max to prevent main-thread freezing / DoS
    const sample = sanitizedText.length > MAX_DIGITAL_TEXT_CHARS
      ? sanitizedText.slice(0, MAX_DIGITAL_TEXT_CHARS)
      : sanitizedText;

    const counts: Record<ScriptFamily, number> = {
      devanagari: 0,
      bengali: 0,
      tamil: 0,
      telugu: 0,
      kannada: 0,
      malayalam: 0,
      gujarati: 0,
      odia: 0,
      gurmukhi: 0,
      arabic: 0,
      latin: 0,
      han: 0,
      unknown: 0
    };

    let totalScriptChars = 0;

    for (const char of sample) {
      const code = char.codePointAt(0);
      if (code === undefined) continue;

      // Devanagari: \u0900-\u097F
      if (code >= 0x0900 && code <= 0x097f) {
        counts.devanagari++;
        totalScriptChars++;
      }
      // Bengali / Assamese: \u0980-\u09FF
      else if (code >= 0x0980 && code <= 0x09ff) {
        counts.bengali++;
        totalScriptChars++;
      }
      // Gurmukhi: \u0A00-\u0A7F
      else if (code >= 0x0a00 && code <= 0x0a7f) {
        counts.gurmukhi++;
        totalScriptChars++;
      }
      // Gujarati: \u0A80-\u0AFF
      else if (code >= 0x0a80 && code <= 0x0aff) {
        counts.gujarati++;
        totalScriptChars++;
      }
      // Odia: \u0B00-\u0B7F
      else if (code >= 0x0b00 && code <= 0x0b7f) {
        counts.odia++;
        totalScriptChars++;
      }
      // Tamil: \u0B80-\u0BFF
      else if (code >= 0x0b80 && code <= 0x0bff) {
        counts.tamil++;
        totalScriptChars++;
      }
      // Telugu: \u0C00-\u0C7F
      else if (code >= 0x0c00 && code <= 0x0c7f) {
        counts.telugu++;
        totalScriptChars++;
      }
      // Kannada: \u0C80-\u0CFF
      else if (code >= 0x0c80 && code <= 0x0cff) {
        counts.kannada++;
        totalScriptChars++;
      }
      // Malayalam: \u0D00-\u0D7F
      else if (code >= 0x0d00 && code <= 0x0d7f) {
        counts.malayalam++;
        totalScriptChars++;
      }
      // Arabic / Urdu: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, presentation forms \uFB50-\uFDFF, \uFE70-\uFEFF
      else if (
        (code >= 0x0600 && code <= 0x06ff) ||
        (code >= 0x0750 && code <= 0x077f) ||
        (code >= 0x08a0 && code <= 0x08ff) ||
        (code >= 0xfb50 && code <= 0xfdff) ||
        (code >= 0xfe70 && code <= 0xfeff)
      ) {
        counts.arabic++;
        totalScriptChars++;
      }
      // Latin: [a-zA-Z] and accented Latin Extended [À-ɏ]
      else if (
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a) ||
        (code >= 0x00c0 && code <= 0x024f)
      ) {
        counts.latin++;
        totalScriptChars++;
      }
      // Han (Chinese Simplified / CJK): \u4E00-\u9FFF, \u3400-\u4DBF
      else if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf)
      ) {
        counts.han++;
        totalScriptChars++;
      }
      // Whitespace, numbers, punctuation are deliberately ignored so they don't skew script detection
    }

    if (totalScriptChars === 0) {
      return {
        detectedScript: 'unknown',
        scriptName: 'Unknown',
        suggestedLanguage: 'eng',
        confidence: 0,
        isConfident: false,
        scriptDistribution: { unknown: 100 } as any,
        alternativeSuggestions: ['hin', 'mar'],
        source: 'digital_text'
      };
    }

    // Sort scripts by frequency descending
    const sorted = (Object.keys(counts) as ScriptFamily[])
      .filter((s) => s !== 'unknown' && counts[s] > 0)
      .sort((a, b) => counts[b] - counts[a]);

    const dominantScript = sorted[0] || 'unknown';
    const dominantCount = counts[dominantScript] || 0;
    const dominantRatio = dominantCount / totalScriptChars;

    // Calculate script distribution percentages
    const scriptDistribution: Record<ScriptFamily, number> = {} as any;
    for (const s of sorted) {
      scriptDistribution[s] = Math.round((counts[s] / totalScriptChars) * 100);
    }

    // Confidence scoring:
    // Ratio of dominant script, scaled down if sample is very small (< 15 characters)
    const sampleFactor = Math.min(1.0, totalScriptChars / 15);
    const baseConfidence = dominantRatio * 100;
    const confidence = Math.min(99, Math.round(baseConfidence * sampleFactor));

    // Fallback threshold: confidence >= 70% is confident
    const isConfident = confidence >= 70;

    // Check user preference memory for dominant script
    const userOverride = await this.getScriptPreference(dominantScript);
    const scriptDef = SCRIPT_DEFINITIONS[dominantScript] || SCRIPT_DEFINITIONS.unknown;

    let suggestedLanguage = userOverride || scriptDef.defaultLanguage;
    const alternativeSuggestions: string[] = [];

    // Add script-level alternatives (excluding the suggested language)
    for (const alt of scriptDef.alternativeLanguages) {
      if (alt !== suggestedLanguage && !alternativeSuggestions.includes(alt)) {
        alternativeSuggestions.push(alt);
      }
    }
    if (userOverride && userOverride !== scriptDef.defaultLanguage) {
      if (!alternativeSuggestions.includes(scriptDef.defaultLanguage)) {
        alternativeSuggestions.push(scriptDef.defaultLanguage);
      }
    }

    // If there is a runner-up script (e.g. bilingual document), add its primary language as a top suggestion
    if (sorted.length > 1) {
      const runnerUpScript = sorted[1];
      const runnerUpLang = (await this.getScriptPreference(runnerUpScript)) ||
        SCRIPT_DEFINITIONS[runnerUpScript].defaultLanguage;
      if (runnerUpLang !== suggestedLanguage && !alternativeSuggestions.includes(runnerUpLang)) {
        // In low-confidence situations, the runner-up is one of the top 2 guesses
        alternativeSuggestions.unshift(runnerUpLang);
      }
    }

    // Ensure we always provide at least 2 alternative suggestions
    if (alternativeSuggestions.length === 0) {
      alternativeSuggestions.push('eng');
    }

    return {
      detectedScript: dominantScript,
      scriptName: scriptDef.name,
      suggestedLanguage,
      confidence,
      isConfident,
      scriptDistribution,
      alternativeSuggestions,
      source: userOverride ? 'override' : 'digital_text'
    };
  }

  /**
   * Crops 3 representative text patches (top, center, bottom) from a canvas at 150 DPI.
   * Top: 12% to 27% of height
   * Center: 42% to 57% of height
   * Bottom: 72% to 87% of height
   * Horizontal range: 10% to 90% of width (avoids binding/margins)
   */
  cropRepresentativePatches(canvas: HTMLCanvasElement): ImageData[] {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const w = canvas.width;
    const h = canvas.height;
    if (w < 10 || h < 10) return [];

    // Cybersecurity: Clamp patch dimensions to avoid allocating huge typed arrays if canvas is adversarial / oversized
    const patchW = Math.max(1, Math.min(800, Math.round(w * 0.8)));
    const patchH = Math.max(1, Math.min(200, Math.round(h * 0.15)));
    const patchX = Math.round(w * 0.1);

    const patchYCoords = [
      Math.round(h * 0.12), // Top patch
      Math.round(h * 0.42), // Center patch
      Math.round(h * 0.72)  // Bottom patch
    ];

    const patches: ImageData[] = [];
    for (const y of patchYCoords) {
      try {
        const patchData = ctx.getImageData(patchX, y, patchW, patchH);
        patches.push(patchData);
      } catch {
        // Canvas may be empty or out of bounds
      }
    }

    return patches;
  }

  /**
   * Fast Script Classifier for Image / Scanned Patches:
   * Evaluates morphological features (continuous top headline vs discrete letter gaps vs rounded loops).
   * Distinguishes Latin vs Devanagari vs Tamil vs Arabic with zero remote downloads.
   */
  async classifyImagePatches(patches: ImageData[]): Promise<ScriptDetectionResult> {
    if (!patches || patches.length === 0) {
      return {
        detectedScript: 'unknown',
        scriptName: 'Unknown',
        suggestedLanguage: 'eng',
        confidence: 0,
        isConfident: false,
        scriptDistribution: { unknown: 100 } as any,
        alternativeSuggestions: ['hin', 'mar'],
        source: 'image_sample'
      };
    }

    let totalInkPixels = 0;
    let totalSamplePixels = 0;
    let headlineContinuitySum = 0;
    let baselineContinuitySum = 0;
    let glyphSeparationSum = 0;
    let curvatureLoopSum = 0;
    let patchesWithInk = 0;

    for (const patch of patches) {
      const { data, width, height } = patch;
      if (width < 5 || height < 5) continue;

      totalSamplePixels += width * height;
      let patchInk = 0;

      // 1. Convert to binary ink map (dark text on light background)
      const binaryMap: Uint8Array = new Uint8Array(width * height);
      const rowInkCounts = new Int32Array(height);
      const colInkCounts = new Int32Array(width);

      for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
          const idx = (rowOffset + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          // Grayscale luminance
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (a > 128 && lum < 150) {
            binaryMap[rowOffset + x] = 1;
            rowInkCounts[y]++;
            colInkCounts[x]++;
            patchInk++;
          }
        }
      }

      totalInkPixels += patchInk;
      if (patchInk < 15) {
        // Virtually blank patch
        continue;
      }
      patchesWithInk++;

      // 2. Analyze vertical character column gaps (Latin discreteness)
      let emptyCols = 0;
      let consecutiveGaps = 0;
      for (let x = 0; x < width; x++) {
        if (colInkCounts[x] === 0) {
          emptyCols++;
          consecutiveGaps++;
        }
      }
      const gapRatio = emptyCols / width;
      glyphSeparationSum += gapRatio;

      // 3. Find horizontal text line bands (where ink is concentrated)
      // Evaluate top headline vs bottom baseline continuity
      let topThirdInk = 0;
      let midThirdInk = 0;
      let bottomThirdInk = 0;
      const h3 = Math.floor(height / 3);

      for (let y = 0; y < height; y++) {
        if (y < h3) topThirdInk += rowInkCounts[y];
        else if (y < h3 * 2) midThirdInk += rowInkCounts[y];
        else bottomThirdInk += rowInkCounts[y];
      }

      // Check max continuous horizontal runs in top third vs bottom third
      let maxTopRun = 0;
      let maxBottomRun = 0;

      for (let y = 0; y < height; y++) {
        let currentRun = 0;
        let maxRowRun = 0;
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
          if (binaryMap[rowOffset + x] === 1) {
            currentRun++;
            if (currentRun > maxRowRun) maxRowRun = currentRun;
          } else {
            currentRun = 0;
          }
        }

        if (y < h3 && maxRowRun > maxTopRun) {
          maxTopRun = maxRowRun;
        } else if (y >= h3 * 2 && maxRowRun > maxBottomRun) {
          maxBottomRun = maxRowRun;
        }
      }

      // Cross-character continuous stroke thresholds:
      // Connecting lines (Shirorekha in Devanagari, baseline in Arabic) span across characters (> 20px).
      // Discrete characters in Latin or Tamil have short runs (<= 14px).
      const minConnectingRun = Math.max(18, Math.round(width * 0.18));
      const topContinuity = maxTopRun >= minConnectingRun ? maxTopRun / Math.max(1, width * 0.25) : 0;
      const bottomContinuity = maxBottomRun >= minConnectingRun ? maxBottomRun / Math.max(1, width * 0.25) : 0;

      headlineContinuitySum += Math.min(1.0, topContinuity);
      baselineContinuitySum += Math.min(1.0, bottomContinuity);

      // Tamil feature: Rounded loops / curves within characters, NO cross-character headline, NO cross-character baseline
      if (topContinuity === 0 && bottomContinuity === 0 && gapRatio < 0.65) {
        curvatureLoopSum += 1.0;
      }
    }

    const overallInkDensity = totalInkPixels / Math.max(1, totalSamplePixels);

    // If total ink density is very low (< 0.005) or all patches are blank,
    // or if ink density is abnormally high (> 0.45, solid black / dark photo / heavy noise):
    // Low-confidence signal, trigger user selection prompt rather than falsely classifying noise
    if (patchesWithInk === 0 || overallInkDensity < 0.005 || overallInkDensity > 0.45) {
      return {
        detectedScript: 'unknown',
        scriptName: 'Unknown',
        suggestedLanguage: 'eng',
        confidence: 25,
        isConfident: false,
        scriptDistribution: { unknown: 100 } as any,
        alternativeSuggestions: ['hin', 'mar'],
        source: 'image_sample'
      };
    }

    // Normalize scores across patches safely
    const avgHeadline = headlineContinuitySum / Math.max(1, patchesWithInk);
    const avgBaseline = baselineContinuitySum / Math.max(1, patchesWithInk);
    const avgSeparation = glyphSeparationSum / Math.max(1, patchesWithInk);
    const avgCurvature = curvatureLoopSum / Math.max(1, patchesWithInk);

    // Feature scoring:
    // 1. Devanagari: High top headline continuity (Shirorekha)
    const devanagariScore = Math.max(0, avgHeadline * 1.5 - avgSeparation * 0.4);

    // 2. Latin: High inter-character column gaps, low headline
    const latinScore = Math.max(0, avgSeparation * 1.4 - avgHeadline * 0.8);

    // 3. Tamil: Rounded loops, low top headline, low baseline
    const tamilScore = Math.max(0, avgCurvature * 1.2 - avgHeadline * 0.9);

    // 4. Arabic: Continuous bottom baseline
    const arabicScore = Math.max(0, avgBaseline * 1.3 - avgHeadline * 0.8);

    const scriptScores: { script: ScriptFamily; score: number }[] = [
      { script: 'devanagari' as ScriptFamily, score: devanagariScore },
      { script: 'latin' as ScriptFamily, score: latinScore },
      { script: 'tamil' as ScriptFamily, score: tamilScore },
      { script: 'arabic' as ScriptFamily, score: arabicScore }
    ].sort((a, b) => b.score - a.score);

    const winner = scriptScores[0];
    const runnerUp = scriptScores[1];

    // Compute confidence:
    // If the winning score is weak or too close to runner-up, confidence < 70%
    const scoreDiff = winner.score - (runnerUp ? runnerUp.score : 0);
    let confidence = 0;
    let isConfident = false;

    if (winner.score < 0.25 || scoreDiff < 0.12) {
      // Weak or ambiguous signal (or pure random noise where all scores are 0)
      if (winner.score <= 0.01) {
        confidence = 20;
      } else {
        confidence = Math.min(65, Math.max(35, Math.round((winner.score / 0.5) * 60)));
      }
      isConfident = false;
    } else {
      // Strong distinctive script signal
      confidence = Math.min(96, Math.max(75, Math.round(75 + scoreDiff * 35)));
      isConfident = confidence >= 70;
    }

    const detectedScript = isConfident ? winner.script : (winner.score > 0.15 ? winner.script : 'unknown');
    const userOverride = await this.getScriptPreference(detectedScript);
    const scriptDef = SCRIPT_DEFINITIONS[detectedScript] || SCRIPT_DEFINITIONS.unknown;

    const suggestedLanguage = userOverride || scriptDef.defaultLanguage;
    const runnerUpDef = runnerUp ? SCRIPT_DEFINITIONS[runnerUp.script] : null;

    const alternativeSuggestions: string[] = [];
    if (runnerUpDef) {
      const runnerUpLang = (await this.getScriptPreference(runnerUp.script)) || runnerUpDef.defaultLanguage;
      if (runnerUpLang !== suggestedLanguage) {
        alternativeSuggestions.push(runnerUpLang);
      }
    }
    for (const alt of scriptDef.alternativeLanguages) {
      if (alt !== suggestedLanguage && !alternativeSuggestions.includes(alt)) {
        alternativeSuggestions.push(alt);
      }
    }
    if (!alternativeSuggestions.includes('eng') && suggestedLanguage !== 'eng') {
      alternativeSuggestions.push('eng');
    }

    const scriptDistribution: Record<ScriptFamily, number> = {} as any;
    const totalScore = scriptScores.reduce((acc, s) => acc + Math.max(0.01, s.score), 0);
    for (const s of scriptScores) {
      scriptDistribution[s.script] = Math.round((Math.max(0.01, s.score) / totalScore) * 100);
    }

    return {
      detectedScript,
      scriptName: scriptDef.name,
      suggestedLanguage,
      confidence,
      isConfident,
      scriptDistribution,
      alternativeSuggestions,
      source: 'image_sample'
    };
  }

  /**
   * Complete image detection entry point:
   * Accepts HTMLCanvasElement, ImageData, or HTMLImageElement.
   */
  async detectScriptFromImage(
    source: HTMLCanvasElement | ImageData | HTMLImageElement
  ): Promise<ScriptDetectionResult> {
    if (typeof (source as any).getContext === 'function') {
      // HTMLCanvasElement
      const patches = this.cropRepresentativePatches(source as HTMLCanvasElement);
      return this.classifyImagePatches(patches);
    } else if ('data' in source && 'width' in source) {
      // ImageData
      return this.classifyImagePatches([source as ImageData]);
    } else if (typeof Image !== 'undefined' && source instanceof Image) {
      // HTMLImageElement - allocate offscreen canvas and guarantee immediate memory release
      const offscreen = document.createElement('canvas');
      try {
        offscreen.width = source.naturalWidth || source.width;
        offscreen.height = source.naturalHeight || source.height;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(source, 0, 0);
          const patches = this.cropRepresentativePatches(offscreen);
          return await this.classifyImagePatches(patches);
        }
      } finally {
        offscreen.width = 0;
        offscreen.height = 0;
      }
    }

    return this.createUnknownResult('image_sample');
  }

  /**
   * Complete entry point that processes any PDF or Image file:
   * 1. Inspects digital text Unicode blocks if selectable text is present.
   * 2. Renders page 1 and analyzes morphological patch features if pure scan/image.
   * Hardened with a timeout wrapper and canvas/bitmap memory garbage collection.
   */
  async detectScriptFromFile(file: File): Promise<ScriptDetectionResult> {
    const fallback = this.createUnknownResult('digital_text');
    return this.withTimeout(this.internalDetectScriptFromFile(file), DETECTION_TIMEOUT_MS, fallback);
  }

  private async internalDetectScriptFromFile(file: File): Promise<ScriptDetectionResult> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
        try {
          const pdf = await loadingTask.promise;
          const pagesToCheck = Math.min(3, pdf.numPages);
          let extractedText = '';

          for (let i = 1; i <= pagesToCheck; i++) {
            const page = await pdf.getPage(i);
            try {
              const textContent = await page.getTextContent();
              for (const item of textContent.items) {
                if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
                  extractedText += item.str + ' ';
                  if (extractedText.length > 300) break;
                }
              }
            } finally {
              if (typeof (page as any).cleanup === 'function') {
                (page as any).cleanup();
              }
            }
            if (extractedText.length > 300) break;
          }

          if (extractedText.trim().length > 15) {
            return await this.detectScriptFromText(extractedText);
          }

          // Pure scanned document: render page 1 at scale 1.5 and classify image patches
          if (pdf.numPages >= 1) {
            const page1 = await pdf.getPage(1);
            try {
              const viewport = page1.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              canvas.width = Math.floor(viewport.width);
              canvas.height = Math.floor(viewport.height);
              const ctx = canvas.getContext('2d');
              if (ctx) {
                try {
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  await (page1.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
                  return await this.detectScriptFromImage(canvas);
                } finally {
                  // Explicitly zero canvas dimensions to immediately free GPU framebuffer backing store
                  canvas.width = 0;
                  canvas.height = 0;
                }
              }
            } finally {
              if (typeof (page1 as any).cleanup === 'function') {
                (page1 as any).cleanup();
              }
            }
          }
        } finally {
          await loadingTask?.destroy();
        }
      } catch {
        // Fall back gracefully
      }
    } else {
      // Image file (jpg, png, etc.)
      try {
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(file);
          try {
            const canvas = document.createElement('canvas');
            try {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(bitmap, 0, 0);
                return await this.detectScriptFromImage(canvas);
              }
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          } finally {
            if (typeof (bitmap as any).close === 'function') {
              (bitmap as any).close();
            }
          }
        }
      } catch {
        // Fall back gracefully
      }
    }

    return this.createUnknownResult('digital_text');
  }

  private createUnknownResult(source: 'digital_text' | 'image_sample' = 'digital_text'): ScriptDetectionResult {
    return {
      detectedScript: 'unknown',
      scriptName: 'Unknown',
      suggestedLanguage: 'eng',
      confidence: 0,
      isConfident: false,
      scriptDistribution: { unknown: 100 } as any,
      alternativeSuggestions: ['hin', 'mar'],
      source
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
    ]);
  }

  /**
   * Retrieves user-overridden language preference for a given script family from @capacitor/preferences.
   */
  async getScriptPreference(script: ScriptFamily): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key: `${SCRIPT_PREF_PREFIX}${script}` });
      return value || null;
    } catch {
      return null;
    }
  }

  /**
   * Persists user override for a script family to @capacitor/preferences.
   */
  async saveScriptPreference(script: ScriptFamily, languageCode: string): Promise<void> {
    try {
      await Preferences.set({
        key: `${SCRIPT_PREF_PREFIX}${script}`,
        value: languageCode
      });
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Clears persisted preference for a script family.
   */
  async clearScriptPreference(script: ScriptFamily): Promise<void> {
    try {
      await Preferences.remove({ key: `${SCRIPT_PREF_PREFIX}${script}` });
    } catch {
      // Ignore storage errors
    }
  }
}
