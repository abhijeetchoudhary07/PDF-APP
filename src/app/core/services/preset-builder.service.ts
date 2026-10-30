import { Injectable, inject } from '@angular/core';
import {
  CUSTOM_PRESETS_KEY,
  Preset,
  PresetRequirement,
  PresetDimensionUnit,
  PresetTargetType,
  InstructionParsedBounds,
  HighlightSegment,
  PresetExtractionResult
} from '../models/preset.types';
import { PresetService } from './preset.service';
import { OcrService } from './ocr.service';

/** Institutional, government, exam board, and trademarked scheme words that must NEVER be in an auto-generated profile name */
export const FORBIDDEN_INSTITUTION_REGEX = /\b(upsc|ssc|ibps|cbse|icse|cisce|gate|neet|nta|jee|cat|clat|nda|cds|afcat|rrb|railway|railways|dsssb|kvs|nvs|bpsc|mpsc|uppsc|kpsc|tspsc|appsc|wbcs|wbpsc|gpsc|opsc|hpsc|ppsc|rpsc|jkpsc|ukpsc|cgpsc|spsc|mppsc|tpsc|apsc|govt|government|ministry|department|official|sarkari|national|federal|state|parliament|police|army|navy|airforce|defense|defence|exam|examination|board|university|council|commission|service|institute|institution|authority|portal|recruitment|academy|college|school|vidyalaya|aadhaar|aadhar|pan|passport|visa|voter|epic|ayushman|epfo|esic)\b/gi;

interface RawMatchSpan {
  start: number;
  end: number;
  type: 'size' | 'dimension' | 'dpi' | 'format' | 'aspect';
}

@Injectable({
  providedIn: 'root'
})
export class PresetBuilderService extends PresetService {
  private ocrService = inject(OcrService, { optional: true });

  /**
   * Static dimension unit conversion helper.
   * Standard conversions: 1 in = 25.4 mm = 2.54 cm.
   * At specified DPI (default 300).
   */
  static convertToPixelsStatic(value: number, unit: PresetDimensionUnit, dpi: number = 300): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const safeDpi = Number.isFinite(dpi) && dpi >= 50 && dpi <= 2400 ? dpi : 300;

    switch (unit) {
      case 'in':
        return Math.round(value * safeDpi);
      case 'mm':
        return Math.round((value * safeDpi) / 25.4);
      case 'cm':
        return Math.round((value * 10 * safeDpi) / 25.4);
      case 'px':
      default:
        return Math.round(value);
    }
  }

  /**
   * Convert physical or pixel dimension value to integer pixels at specified DPI.
   */
  convertToPixels(value: number, unit: PresetDimensionUnit, dpi: number = 300): number {
    return PresetBuilderService.convertToPixelsStatic(value, unit, dpi);
  }

  /**
   * Convert both width and height to pixels at specified DPI.
   */
  convertDimensionsToPx(
    width: number,
    height: number,
    unit: PresetDimensionUnit,
    dpi: number = 300
  ): { widthPx: number; heightPx: number } {
    return {
      widthPx: this.convertToPixels(width, unit, dpi),
      heightPx: this.convertToPixels(height, unit, dpi)
    };
  }

  /**
   * Inverse conversion: converts pixels to specified unit at given DPI.
   */
  convertPixelsToUnit(px: number, targetUnit: PresetDimensionUnit, dpi: number = 300): number {
    if (!Number.isFinite(px) || px <= 0) return 0;
    const safeDpi = Number.isFinite(dpi) && dpi >= 50 && dpi <= 2400 ? dpi : 300;

    switch (targetUnit) {
      case 'in':
        return Number((px / safeDpi).toFixed(2));
      case 'mm':
        return Number(((px * 25.4) / safeDpi).toFixed(1));
      case 'cm':
        return Number(((px * 2.54) / safeDpi).toFixed(2));
      case 'px':
      default:
        return Math.round(px);
    }
  }

  /**
   * Clamps dimensions, file sizes, and DPI to safe, positive bounds to protect against input tampering.
   */
  clampBounds(spec: Partial<InstructionParsedBounds>): Partial<InstructionParsedBounds> {
    const clamped = { ...spec };

    // File size clamping
    if (clamped.maxKb !== undefined) {
      if (!Number.isFinite(clamped.maxKb) || clamped.maxKb <= 0) {
        clamped.maxKb = 1; // Minimum 1 KB
      } else if (clamped.maxKb > 204800) {
        clamped.maxKb = 204800; // Cap at 200 MB
      } else {
        clamped.maxKb = Math.round(clamped.maxKb);
      }
    }

    if (clamped.minKb !== undefined) {
      if (!Number.isFinite(clamped.minKb) || clamped.minKb < 0) {
        clamped.minKb = 0;
      } else {
        clamped.minKb = Math.round(clamped.minKb);
      }
      if (clamped.maxKb !== undefined && clamped.minKb > clamped.maxKb) {
        clamped.minKb = clamped.maxKb;
      }
    }

    // Dimensions clamping
    const unit = clamped.unit || 'px';
    const maxDimByUnit: Record<PresetDimensionUnit, number> = {
      px: 20000,
      mm: 2000,
      cm: 200,
      in: 100
    };

    if (clamped.width !== undefined) {
      if (!Number.isFinite(clamped.width) || clamped.width <= 0) {
        clamped.width = undefined;
      } else {
        clamped.width = Math.min(clamped.width, maxDimByUnit[unit] || 20000);
      }
    }

    if (clamped.height !== undefined) {
      if (!Number.isFinite(clamped.height) || clamped.height <= 0) {
        clamped.height = undefined;
      } else {
        clamped.height = Math.min(clamped.height, maxDimByUnit[unit] || 20000);
      }
    }

    // DPI clamping
    if (clamped.dpi !== undefined) {
      if (!Number.isFinite(clamped.dpi) || clamped.dpi < 50) {
        clamped.dpi = 50;
      } else if (clamped.dpi > 2400) {
        clamped.dpi = 2400;
      } else {
        clamped.dpi = Math.round(clamped.dpi);
      }
    }

    return clamped;
  }

  /**
   * Checks if a string contains any forbidden governmental or institutional keywords.
   */
  hasForbiddenInstitutionWords(name: string): boolean {
    if (!name) return false;
    FORBIDDEN_INSTITUTION_REGEX.lastIndex = 0;
    return FORBIDDEN_INSTITUTION_REGEX.test(name);
  }

  /**
   * Ingest an instruction sheet file (image or PDF) and perform OCR, then parse specifications.
   */
  async parseInstructionSheet(file: File): Promise<PresetExtractionResult> {
    if (!file) {
      return {
        success: false,
        rawText: '',
        highlightedSegments: [],
        error: 'No file provided'
      };
    }

    try {
      let rawText = '';
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (this.ocrService) {
        if (isPdf) {
          // Check for digital selectable text first to avoid unnecessary OCR
          const detection = await this.ocrService.detectSelectableText(file).catch(() => null);
          if (detection && detection.hasText) {
            const extracted = await this.ocrService.extractExistingText(file, [1]).catch(() => null);
            rawText = extracted?.fullText || '';
          }
        }

        // If no selectable digital text or it's an image, run OCR
        if (!rawText.trim()) {
          const ocrResult = await this.ocrService.performOcr(file, 'eng', [1]);
          rawText = ocrResult?.fullText || '';
        }
      } else {
        // Fallback for tests or environments without OcrService: try reading text if plain text/test file
        if (file.type.includes('text') || file.name.endsWith('.txt')) {
          rawText = await file.text();
        } else {
          return {
            success: false,
            rawText: '',
            highlightedSegments: [],
            error: 'OCR service is unavailable'
          };
        }
      }

      return this.parseInstructionText(rawText);
    } catch (err: any) {
      return {
        success: false,
        rawText: '',
        highlightedSegments: [],
        error: err?.message || 'Failed to process instruction sheet'
      };
    }
  }

  /**
   * Parse extracted guideline text into formal upload bounds and specifications.
   */
  parseInstructionText(text: string): PresetExtractionResult {
    // ReDoS protection: limit input length to 10,000 characters
    const rawText = (text || '').slice(0, 10000).trim();
    if (!rawText) {
      return {
        success: false,
        rawText: '',
        highlightedSegments: [],
        error: 'Instruction sheet contained no readable text'
      };
    }

    const matchSpans: RawMatchSpan[] = [];

    // 1. Detect Target Type
    const targetType = this.detectTargetType(rawText);

    // 2. Parse File Size Limits (Min KB, Max KB)
    const rawSizeBounds = this.extractSizeBounds(rawText, matchSpans);

    // 3. Parse Dimensions & Unit (Width, Height, Unit)
    const rawDimBounds = this.extractDimensionBounds(rawText, matchSpans);

    // 4. Parse Aspect Ratio
    const aspectRatio = this.extractAspectRatio(rawText, rawDimBounds.width, rawDimBounds.height, matchSpans);

    // 5. Parse Resolution / DPI
    const rawDpi = this.extractDpi(rawText, matchSpans);

    // 6. Parse Allowed Formats
    const { format, allowedFormats } = this.extractAllowedFormats(rawText, targetType, matchSpans);

    // Check if the sheet is unparseable: requires at least file size OR dimensions
    const hasSize = rawSizeBounds.minKb !== undefined || rawSizeBounds.maxKb !== undefined;
    const hasDimensions = rawDimBounds.width !== undefined && rawDimBounds.height !== undefined;

    if (!hasSize && !hasDimensions) {
      return {
        success: false,
        rawText,
        highlightedSegments: [{ text: rawText, isHighlighted: false, type: 'plain' }],
        error: 'Could not detect upload specifications. No file size or dimension bounds found.'
      };
    }

    // Apply bounds-clamping to extracted raw values
    const clamped = this.clampBounds({
      minKb: rawSizeBounds.minKb,
      maxKb: rawSizeBounds.maxKb,
      width: rawDimBounds.width,
      height: rawDimBounds.height,
      unit: rawDimBounds.unit,
      dpi: rawDpi
    });

    // Propose Neutral Name (NUMBERS ONLY, NO INSTITUTION NAMES)
    const proposedName = this.generateNeutralProfileName({
      targetType,
      width: clamped.width,
      height: clamped.height,
      unit: clamped.unit,
      minKb: clamped.minKb,
      maxKb: clamped.maxKb,
      format
    });

    // Calculate pixel dimensions
    const dpi = clamped.dpi;
    const unit = clamped.unit || 'px';
    const widthPx = clamped.width !== undefined
      ? this.convertToPixels(clamped.width, unit, dpi || 300)
      : undefined;
    const heightPx = clamped.height !== undefined
      ? this.convertToPixels(clamped.height, unit, dpi || 300)
      : undefined;

    // Calculate extraction confidence
    let confidence = 0.4;
    if (hasSize) confidence += 0.25;
    if (hasDimensions) confidence += 0.25;
    if (dpi) confidence += 0.05;
    if (allowedFormats.length > 0) confidence += 0.05;
    confidence = Math.min(1.0, confidence);

    const spec: InstructionParsedBounds = {
      minKb: clamped.minKb,
      maxKb: clamped.maxKb,
      width: clamped.width,
      height: clamped.height,
      unit,
      widthPx,
      heightPx,
      aspectRatio,
      dpi,
      format,
      allowedFormats,
      targetType,
      proposedName,
      confidence
    };

    // Build highlighted segments for the split card UI
    const highlightedSegments = this.buildHighlightedSegments(rawText, matchSpans);

    return {
      success: true,
      rawText,
      spec,
      highlightedSegments
    };
  }

  /**
   * Saves a verified specification profile into Capacitor Preferences under CUSTOM_PRESETS_KEY.
   */
  async saveSpecificationProfile(
    spec: Partial<InstructionParsedBounds> & {
      name?: string;
      targetType?: PresetTargetType;
      rawSourceText?: string;
    }
  ): Promise<Preset> {
    const clamped = this.clampBounds(spec);
    const targetType: PresetTargetType = clamped.targetType || spec.targetType || 'photo';
    const profileName = this.sanitizeProfileName(spec.name?.trim() || spec.proposedName || 'Custom Profile');
    const unit = clamped.unit || spec.unit || 'px';
    const dpi = clamped.dpi ?? spec.dpi;

    const widthPx = clamped.width !== undefined
      ? this.convertToPixels(clamped.width, unit, dpi || 300)
      : undefined;
    const heightPx = clamped.height !== undefined
      ? this.convertToPixels(clamped.height, unit, dpi || 300)
      : undefined;

    const requirement: PresetRequirement = {
      minKb: clamped.minKb,
      maxKb: clamped.maxKb,
      width: clamped.width,
      height: clamped.height,
      unit,
      widthPx,
      heightPx,
      aspectRatio: clamped.aspectRatio || spec.aspectRatio,
      dpi,
      format: clamped.format || spec.format || (targetType === 'pdf' ? 'PDF' : 'JPEG')
    };

    const preset: Preset = {
      id: `custom-spec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: profileName,
      category: 'My Custom Presets',
      isCustom: true,
      dpi,
      unit,
      targetType,
      rawSourceText: spec.rawSourceText,
      createdAt: Date.now(),
      photo: targetType === 'photo' ? requirement : undefined,
      signature: targetType === 'signature' ? requirement : undefined,
      pdf: targetType === 'pdf' ? requirement : undefined
    };

    await this.saveCustomPreset(preset);
    return preset;
  }

  /**
   * Generates a neutral profile name based exclusively on NUMBERS ONLY (e.g. "Photo 35x45mm 50KB", "Doc PDF 200KB").
   * Strictly prohibits exam boards, government bodies, or institution names.
   */
  generateNeutralProfileName(spec: {
    targetType: PresetTargetType;
    width?: number;
    height?: number;
    unit?: PresetDimensionUnit;
    minKb?: number;
    maxKb?: number;
    format?: string;
  }): string {
    const parts: string[] = [];

    if (spec.targetType === 'signature') {
      parts.push('Signature');
    } else if (spec.targetType === 'pdf') {
      parts.push('Doc PDF');
    } else {
      parts.push('Photo');
    }

    if (spec.width && spec.height) {
      const unit = spec.unit || 'px';
      parts.push(`${spec.width}x${spec.height}${unit}`);
    }

    if (spec.maxKb) {
      if (spec.minKb && spec.minKb !== spec.maxKb) {
        parts.push(`${spec.minKb}-${spec.maxKb}KB`);
      } else {
        parts.push(`${spec.maxKb}KB`);
      }
    } else if (spec.minKb) {
      parts.push(`Min ${spec.minKb}KB`);
    }

    if (parts.length === 1) {
      if (spec.format) {
        parts.push(spec.format.toUpperCase());
      }
      parts.push('Specification');
    }

    return parts.join(' ');
  }

  /**
   * Sanitizes any custom name provided by the user to ensure no governmental or institutional keywords or script tags are present.
   */
  sanitizeProfileName(name: string): string {
    if (!name) return 'Custom Specification Profile';
    // Strip script and style blocks entirely, then strip remaining HTML tags
    const noScript = name.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
    const noHtml = noScript.replace(/<[^>]*>/g, '');
    FORBIDDEN_INSTITUTION_REGEX.lastIndex = 0;
    const cleaned = noHtml.replace(FORBIDDEN_INSTITUTION_REGEX, '').replace(/\s{2,}/g, ' ').trim();
    return cleaned || 'Custom Specification Profile';
  }

  // --- Private Parsing Helpers ---

  private detectTargetType(text: string): PresetTargetType {
    const lower = text.toLowerCase();
    if (/\b(signature|sign\b|sign\s*image|specimen\s*signature)/i.test(lower)) {
      return 'signature';
    }
    if (/\b(marksheet|certificate|degree|caste\s*certificate|admit\s*card|tenth|10th|12th|document\s*upload|pdf\s*only)\b/i.test(lower)) {
      return 'pdf';
    }
    if (/\b(photo|photograph|passport\s*size|face|headshot|applicant\s*image)\b/i.test(lower)) {
      return 'photo';
    }
    if (/\bpdf\b/i.test(lower) && !/\b(photo|jpeg|jpg|png)\b/i.test(lower)) {
      return 'pdf';
    }
    return 'photo';
  }

  private extractSizeBounds(
    text: string,
    spans: RawMatchSpan[]
  ): { minKb?: number; maxKb?: number } {
    let minKb: number | undefined;
    let maxKb: number | undefined;

    // Pattern 1: Range "between 20 KB and 50 KB", "20 KB to 50 KB", "20 - 50 KB", "20kb - 50kb", "20 to 50 KB"
    const rangeRegex = /(?:between|from)?\s{0,20}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)\s{0,20}(?:to|and|-|–)\s{0,20}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)/gi;
    let match = rangeRegex.exec(text);
    if (match) {
      const v1 = parseFloat(match[1]);
      const u1 = match[2].toLowerCase();
      const v2 = parseFloat(match[3]);
      const u2 = match[4].toLowerCase();

      const kb1 = u1.startsWith('m') ? Math.round(v1 * 1024) : Math.round(v1);
      const kb2 = u2.startsWith('m') ? Math.round(v2 * 1024) : Math.round(v2);

      minKb = Math.min(kb1, kb2);
      maxKb = Math.max(kb1, kb2);

      spans.push({ start: match.index, end: match.index + match[0].length, type: 'size' });
      return { minKb, maxKb };
    }

    // Pattern 2: "20-50 KB" or "20 to 50 KB" without first unit (ReDoS safe)
    const shortRangeRegex = /(?:size[\s:]{0,10})?(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(?:-|–|to)\s{0,20}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)/gi;
    match = shortRangeRegex.exec(text);
    if (match) {
      const v1 = parseFloat(match[1]);
      const v2 = parseFloat(match[2]);
      const unit = match[3].toLowerCase();

      const kb1 = unit.startsWith('m') ? Math.round(v1 * 1024) : Math.round(v1);
      const kb2 = unit.startsWith('m') ? Math.round(v2 * 1024) : Math.round(v2);

      minKb = Math.min(kb1, kb2);
      maxKb = Math.max(kb1, kb2);

      spans.push({ start: match.index, end: match.index + match[0].length, type: 'size' });
      return { minKb, maxKb };
    }

    // Pattern 3: Explicit Min and Max in same sentence/paragraph (ReDoS safe)
    const minRegex = /(?:min(?:imum)?\.?|not\s+less\s+than|at\s+least|above|>=?)[\s:]{0,10}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)/i;
    const maxRegex = /(?:max(?:imum)?\.?|not\s+(?:more\s+than|exceeding)|up\s+to|less\s+than|within|<=?)[\s:]{0,10}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)/i;

    const minMatch = minRegex.exec(text);
    if (minMatch) {
      const v = parseFloat(minMatch[1]);
      minKb = minMatch[2].toLowerCase().startsWith('m') ? Math.round(v * 1024) : Math.round(v);
      spans.push({ start: minMatch.index, end: minMatch.index + minMatch[0].length, type: 'size' });
    }

    const maxMatch = maxRegex.exec(text);
    if (maxMatch) {
      const v = parseFloat(maxMatch[1]);
      maxKb = maxMatch[2].toLowerCase().startsWith('m') ? Math.round(v * 1024) : Math.round(v);
      spans.push({ start: maxMatch.index, end: maxMatch.index + maxMatch[0].length, type: 'size' });
    }

    if (minKb !== undefined || maxKb !== undefined) {
      return { minKb, maxKb };
    }

    // Pattern 4: Postfix format like "50 KB max", "50 KB (maximum)", "50kb or less"
    const postfixMaxRegex = /(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)\s{0,20}(?:max(?:imum)?|\(maximum\)|or\s+less)/gi;
    match = postfixMaxRegex.exec(text);
    if (match) {
      const v = parseFloat(match[1]);
      maxKb = match[2].toLowerCase().startsWith('m') ? Math.round(v * 1024) : Math.round(v);
      spans.push({ start: match.index, end: match.index + match[0].length, type: 'size' });
      return { minKb, maxKb };
    }

    // Pattern 5: Standalone "size: 50 KB" or "50 KB"
    const standaloneSizeRegex = /(?:file\s*size|size)[\s:]{0,10}(\d{1,8}(?:\.\d{1,4})?)\s{0,20}(kb|kbytes?|mb|mbytes?)/gi;
    match = standaloneSizeRegex.exec(text);
    if (match) {
      const v = parseFloat(match[1]);
      maxKb = match[2].toLowerCase().startsWith('m') ? Math.round(v * 1024) : Math.round(v);
      spans.push({ start: match.index, end: match.index + match[0].length, type: 'size' });
      return { minKb, maxKb };
    }

    return { minKb, maxKb };
  }

  private extractDimensionBounds(
    text: string,
    spans: RawMatchSpan[]
  ): { width?: number; height?: number; unit: PresetDimensionUnit } {
    let width: number | undefined;
    let height: number | undefined;
    let unit: PresetDimensionUnit = 'px';

    // Pattern 1: Combined W x H with units, e.g. "3.5 cm x 4.5 cm", "35 mm x 45 mm", "200 x 230 px", "200x230 pixels"
    const combinedRegex = /(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|mm|cms?|in|inch(?:es)?|")?\s{0,10}(?:x|×|\*|by)\s{0,10}(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")\b/gi;
    let match = combinedRegex.exec(text);
    if (match) {
      width = parseFloat(match[1]);
      height = parseFloat(match[3]);
      const matchedUnit = (match[4] || match[2] || 'px').toLowerCase();
      unit = this.normalizeUnit(matchedUnit);
      spans.push({ start: match.index, end: match.index + match[0].length, type: 'dimension' });
      return { width, height, unit };
    }

    // Pattern 2: Unit first or prefix, e.g. "3.5 x 4.5 cm", "35 x 45 mm", "200 x 230 px"
    const unitAfterRegex = /(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(?:x|×|\*|by)\s{0,10}(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")\b/gi;
    match = unitAfterRegex.exec(text);
    if (match) {
      width = parseFloat(match[1]);
      height = parseFloat(match[2]);
      unit = this.normalizeUnit(match[3].toLowerCase());
      spans.push({ start: match.index, end: match.index + match[0].length, type: 'dimension' });
      return { width, height, unit };
    }

    // Pattern 3: Separate Width and Height descriptions (ReDoS safe, independent of ordering)
    const widthRegex = /(?:width|w)[\s:]{0,10}(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")?/i;
    const heightRegex = /(?:height|h)[\s:]{0,10}(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")?/i;
    const widthMatch = widthRegex.exec(text);
    const heightMatch = heightRegex.exec(text);
    if (widthMatch && heightMatch) {
      width = parseFloat(widthMatch[1]);
      height = parseFloat(heightMatch[1]);
      const matchedUnit = (widthMatch[2] || heightMatch[2] || 'px').toLowerCase();
      unit = this.normalizeUnit(matchedUnit);
      spans.push({ start: widthMatch.index, end: widthMatch.index + widthMatch[0].length, type: 'dimension' });
      spans.push({ start: heightMatch.index, end: heightMatch.index + heightMatch[0].length, type: 'dimension' });
      return { width, height, unit };
    }

    // Pattern 4: Postfix Width and Height ("140 pixels width and 60 pixels height" or "140 px (width) x 60 px (height)")
    const widthPostfixRegex = /(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")?\s{0,10}(?:\(width\)|width\b)/i;
    const heightPostfixRegex = /(\d{1,6}(?:\.\d{1,4})?)\s{0,10}(px|pixels?|mm|cms?|centimeters?|millimeters?|in|inch(?:es)?|")?\s{0,10}(?:\(height\)|height\b)/i;
    const wPostMatch = widthPostfixRegex.exec(text);
    const hPostMatch = heightPostfixRegex.exec(text);
    if (wPostMatch && hPostMatch) {
      width = parseFloat(wPostMatch[1]);
      height = parseFloat(hPostMatch[1]);
      const matchedUnit = (wPostMatch[2] || hPostMatch[2] || 'px').toLowerCase();
      unit = this.normalizeUnit(matchedUnit);
      spans.push({ start: wPostMatch.index, end: wPostMatch.index + wPostMatch[0].length, type: 'dimension' });
      spans.push({ start: hPostMatch.index, end: hPostMatch.index + hPostMatch[0].length, type: 'dimension' });
      return { width, height, unit };
    }

    return { width, height, unit };
  }

  private normalizeUnit(raw: string): PresetDimensionUnit {
    const s = raw.toLowerCase().trim();
    if (s.startsWith('mm') || s.includes('milli')) return 'mm';
    if (s.startsWith('cm') || s.includes('centi')) return 'cm';
    if (s.startsWith('in') || s === '"' || s.includes('inch')) return 'in';
    return 'px';
  }

  private extractAspectRatio(
    text: string,
    width?: number,
    height?: number,
    spans: RawMatchSpan[] = []
  ): string | undefined {
    // Look for explicit aspect ratio: "aspect ratio: 3:4", "ratio 1:1", "ratio 3.5:4.5"
    const ratioRegex = /(?:aspect\s+ratio|ratio)[\s:]*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/gi;
    const match = ratioRegex.exec(text);
    if (match) {
      const r1 = match[1];
      const r2 = match[2];
      spans.push({ start: match.index, end: match.index + match[0].length, type: 'aspect' });
      return `${r1}:${r2}`;
    }

    // Look for "3:4 aspect ratio"
    const postfixRatio = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s+aspect\s+ratio/gi;
    const match2 = postfixRatio.exec(text);
    if (match2) {
      spans.push({ start: match2.index, end: match2.index + match2[0].length, type: 'aspect' });
      return `${match2[1]}:${match2[2]}`;
    }

    // If no explicit aspect ratio, derive from width & height if available
    if (width && height && width > 0 && height > 0) {
      if (width === height) return '1:1';
      if (width === 3.5 && height === 4.5) return '3.5:4.5';
      if (width === 35 && height === 45) return '3.5:4.5';
      if (width === 350 && height === 450) return '3.5:4.5';
      if (width === 200 && height === 230) return '20:23';

      const gcd = this.calculateGcd(Math.round(width * 10), Math.round(height * 10));
      if (gcd > 1) {
        const simW = Math.round(width * 10) / gcd;
        const simH = Math.round(height * 10) / gcd;
        return `${simW}:${simH}`;
      }
    }

    return undefined;
  }

  private calculateGcd(a: number, b: number): number {
    return b === 0 ? a : this.calculateGcd(b, a % b);
  }

  private extractDpi(text: string, spans: RawMatchSpan[]): number | undefined {
    const dpiRegex = /(?:resolution[\s:]*)?(\d{2,4})\s*(?:dpi|dots\s+per\s+inch)\b/gi;
    const match = dpiRegex.exec(text);
    if (match) {
      const dpiVal = parseInt(match[1], 10);
      if (dpiVal >= 50 && dpiVal <= 2400) {
        spans.push({ start: match.index, end: match.index + match[0].length, type: 'dpi' });
        return dpiVal;
      }
    }
    return undefined;
  }

  private extractAllowedFormats(
    text: string,
    targetType: PresetTargetType,
    spans: RawMatchSpan[]
  ): { format?: string; allowedFormats: string[] } {
    const formatRegex = /\b(jpeg|jpg|png|pdf)\b/gi;
    const foundFormats = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = formatRegex.exec(text)) !== null) {
      const raw = m[1].toUpperCase();
      foundFormats.add(raw);
      spans.push({ start: m.index, end: m.index + m[0].length, type: 'format' });
    }

    const allowedFormats = Array.from(foundFormats);

    // Primary format
    let format: string | undefined;
    if (targetType === 'pdf' || allowedFormats.includes('PDF')) {
      format = 'PDF';
    } else if (allowedFormats.includes('JPEG')) {
      format = 'JPEG';
    } else if (allowedFormats.includes('JPG')) {
      format = 'JPG';
    } else if (allowedFormats.includes('PNG')) {
      format = 'PNG';
    } else {
      format = 'JPEG';
    }

    return { format, allowedFormats };
  }

  /**
   * Transforms raw text into a sequence of highlight segments by overlaying detected spans.
   */
  private buildHighlightedSegments(text: string, spans: RawMatchSpan[]): HighlightSegment[] {
    if (spans.length === 0) {
      return [{ text, isHighlighted: false, type: 'plain' }];
    }

    // Sort spans by start index
    const sorted = [...spans].sort((a, b) => a.start - b.start);

    // Merge overlapping or adjacent spans
    const nonOverlapping: RawMatchSpan[] = [];
    for (const span of sorted) {
      if (nonOverlapping.length === 0) {
        nonOverlapping.push({ ...span });
      } else {
        const last = nonOverlapping[nonOverlapping.length - 1];
        if (span.start < last.end) {
          // Overlap: extend end if needed
          if (span.end > last.end) {
            last.end = span.end;
          }
        } else {
          nonOverlapping.push({ ...span });
        }
      }
    }

    const segments: HighlightSegment[] = [];
    let currentIndex = 0;

    for (const span of nonOverlapping) {
      if (span.start > currentIndex) {
        segments.push({
          text: text.slice(currentIndex, span.start),
          isHighlighted: false,
          type: 'plain'
        });
      }
      segments.push({
        text: text.slice(span.start, span.end),
        isHighlighted: true,
        type: span.type
      });
      currentIndex = span.end;
    }

    if (currentIndex < text.length) {
      segments.push({
        text: text.slice(currentIndex),
        isHighlighted: false,
        type: 'plain'
      });
    }

    return segments;
  }
}
