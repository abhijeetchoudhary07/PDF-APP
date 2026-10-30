import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { PdfSignService } from './pdf-sign.service';
import {
  SignatureAppearanceOptions,
  SignatureAppearanceTemplate,
  StampLayoutGeometry,
  StampRenderResult,
  TypedSignatureFont,
  SignatureInkColor
} from '../models/signature-appearance.types';

const STORAGE_KEY = 'IFH_SIGNATURE_TEMPLATES_V1';

@Injectable({
  providedIn: 'root'
})
export class PdfSignatureAppearanceService extends PdfSignService {
  readonly supportedFonts: TypedSignatureFont[] = [
    'Caveat',
    'Dancing Script',
    'Alex Brush',
    'Great Vibes',
    'Sacramento'
  ];

  readonly supportedColors: SignatureInkColor[] = [
    '#000000', // Black
    '#1e3a8a', // Dark Blue
    '#0a2540', // Royal Navy
    '#881337', // Dark Red
    '#14532d'  // Dark Green
  ];

  // ==========================================
  // 1. Cybersecurity Sanitization & Escaping
  // ==========================================

  /**
   * Sanitizes all user-supplied text to prevent DOM XSS, Canvas text spoofing,
   * Unicode bidirectional overrides, and layout overflow.
   */
  sanitizeTextInput(input: unknown, maxLength = 100): string {
    if (input === null || input === undefined) return '';
    let text = String(input);

    // 1. Strip script tags with content
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 2. Strip remaining HTML/XML tags
    text = text.replace(/<[^>]+>/g, '');

    // 3. Strip residual angle brackets and leading quotes/brackets from tag breakouts
    text = text.replace(/[<>]/g, '');
    text = text.replace(/^[>"'\s]+/, '');

    // 4. Strip ASCII control characters (0x00-0x1F, 0x7F) except space
    text = text.replace(/[\x00-\x1F\x7F]/g, '');

    // 5. Strip Unicode bidirectional overrides and zero-width spoofing characters:
    // \u200B-\u200D (zero-width), \u202A-\u202E (LRE, RLE, PDF, LRO, RLO),
    // \u2066-\u2069 (directional isolates), \uFEFF (BOM)
    text = text.replace(/[\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

    // 6. Trim whitespace
    text = text.trim();

    // 7. Enforce character length limit
    if (text.length > maxLength) {
      text = text.slice(0, maxLength);
    }

    return text;
  }

  // ==========================================
  // 2. Timestamp & Timezone Engine (Anti-Tampering)
  // ==========================================

  /**
   * Formats a timestamp into a standardized verifiable date string.
   * Handles timezone parsing, ISO strings, custom timestamp strings,
   * defends against spoofed offsets, invalid dates, and script injections.
   */
  formatTimestamp(input?: string | Date | number, includeTimezone = true): string {
    if (input === undefined || input === null || input === '') {
      return this.formatDateObject(new Date(), includeTimezone);
    }

    if (input instanceof Date) {
      if (isNaN(input.getTime())) {
        return this.formatDateObject(new Date(), includeTimezone);
      }
      return this.formatDateObject(input, includeTimezone);
    }

    if (typeof input === 'number') {
      const d = new Date(input);
      if (isNaN(d.getTime())) {
        return this.formatDateObject(new Date(), includeTimezone);
      }
      return this.formatDateObject(d, includeTimezone);
    }

    // String input
    const sanitized = this.sanitizeTextInput(String(input), 100);
    if (!sanitized) {
      return this.formatDateObject(new Date(), includeTimezone);
    }

    // Check for spoofed timezone offsets, e.g. UTC+99:99 or non-standard offset
    const spoofedMatch = sanitized.match(/(?:UTC|GMT)\s*([+-]\d{2}):(\d{2})/i);
    if (spoofedMatch) {
      const hours = parseInt(spoofedMatch[1], 10);
      const mins = parseInt(spoofedMatch[2], 10);
      if (Math.abs(hours) > 14 || mins > 59) {
        // Timezone offset out of valid bounds [-12:00, +14:00] -> spoofed!
        return this.formatDateObject(new Date(), includeTimezone);
      }
    }

    // Attempt to parse standard date
    const parsedDate = new Date(sanitized);
    if (!isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      if (year >= 1970 && year <= 2100) {
        return this.normalizeDateString(sanitized, parsedDate, includeTimezone);
      }
    }

    // If string matches YYYY-MM-DD HH:mm:ss pattern with or without timezone
    const patternMatch = sanitized.match(/^(\d{4}[-/.]\d{2}[-/.]\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?)(.*)$/);
    if (patternMatch) {
      const datePart = patternMatch[1].replace('T', ' ');
      const rest = patternMatch[2].trim();
      if (!includeTimezone) {
        return datePart;
      }
      if (rest) {
        return `${datePart} ${rest}`;
      }
      return `${datePart} ${this.getLocalTimezoneOffsetString()}`;
    }

    // Fallback safe date
    return this.formatDateObject(new Date(), includeTimezone);
  }

  private formatDateObject(date: Date, includeTimezone: boolean): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const base = `${year}-${month}-${day} ${hours}:${mins}:${secs}`;

    if (!includeTimezone) {
      return base;
    }

    return `${base} ${this.getLocalTimezoneOffsetString(date)}`;
  }

  private normalizeDateString(original: string, parsed: Date, includeTimezone: boolean): string {
    // If the original already contains a named timezone or offset (like 'IST' or 'UTC+05:30')
    const tzMatch = original.match(/(?:UTC|GMT)?[+-]\d{2}:?\d{2}|[A-Z]{3,4}$/i);
    const hasTz = !!tzMatch;

    if (!includeTimezone) {
      if (hasTz) {
        return original.replace(/\s*(?:(?:UTC|GMT)?[+-]\d{2}:?\d{2}|[A-Z]{3,4})$/i, '').trim();
      }
      return this.formatDateObject(parsed, false);
    }

    if (hasTz) {
      return original;
    }

    return `${this.formatDateObject(parsed, false)} ${this.getLocalTimezoneOffsetString(parsed)}`;
  }

  private getLocalTimezoneOffsetString(date: Date = new Date()): string {
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const offHours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const offMins = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    return `UTC${sign}${offHours}:${offMins}`;
  }

  // ==========================================
  // 3. Image Security & MIME Inspection
  // ==========================================

  /**
   * Defensive security inspection for uploaded signature / logo images.
   * Validates:
   * 1. Rejects zero-byte files.
   * 2. Enforces strict file size limits (default 5MB for sig, 2MB for logo).
   * 3. Magic byte inspection: PNG (89 50 4E 47), JPEG (FF D8 FF), WebP (RIFF...WEBP).
   * 4. Polyglot script detection in SVGs (<script>, javascript:, onload, etc.).
   * 5. Decompression bomb prevention (dimension check max 4096 x 4096, max 16MP).
   */
  async validateImageFile(
    file: File,
    options: {
      maxSizeBytes?: number;
      maxWidth?: number;
      maxHeight?: number;
      allowedMimes?: string[];
      allowSvg?: boolean;
    } = {}
  ): Promise<File> {
    const maxSizeBytes = options.maxSizeBytes ?? (5 * 1024 * 1024);
    const maxWidth = options.maxWidth ?? 4096;
    const maxHeight = options.maxHeight ?? 4096;
    const allowSvg = options.allowSvg ?? false;

    // 1. Zero-byte check
    if (!file || file.size === 0) {
      throw new Error('Image validation failed: Zero-byte or empty file rejected.');
    }

    // 2. File size limit
    if (file.size > maxSizeBytes) {
      const mbLimit = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      throw new Error(`Image validation failed: File size (${(file.size / 1024).toFixed(0)} KB) exceeds limit of ${mbLimit} MB.`);
    }

    // 3. Inspect first bytes (Magic Bytes)
    const headerBuffer = await file.slice(0, 64).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuffer);

    const isPng =
      headerBytes.length >= 8 &&
      headerBytes[0] === 0x89 &&
      headerBytes[1] === 0x50 && // P
      headerBytes[2] === 0x4e && // N
      headerBytes[3] === 0x47 && // G
      headerBytes[4] === 0x0d &&
      headerBytes[5] === 0x0a &&
      headerBytes[6] === 0x1a &&
      headerBytes[7] === 0x0a;

    const isJpeg =
      headerBytes.length >= 3 &&
      headerBytes[0] === 0xff &&
      headerBytes[1] === 0xd8 &&
      headerBytes[2] === 0xff;

    const isWebP =
      headerBytes.length >= 12 &&
      headerBytes[0] === 0x52 &&
      headerBytes[1] === 0x49 &&
      headerBytes[2] === 0x46 &&
      headerBytes[3] === 0x46 && // RIFF
      headerBytes[8] === 0x57 &&
      headerBytes[9] === 0x45 &&
      headerBytes[10] === 0x42 &&
      headerBytes[11] === 0x50; // WEBP

    // Check for SVG if file type or name claims SVG
    const isSvgClaim =
      file.type === 'image/svg+xml' ||
      file.name.toLowerCase().endsWith('.svg');

    if (isSvgClaim) {
      if (!allowSvg) {
        throw new Error('Image validation failed: SVG images are not permitted due to vector script injection risk. Please upload PNG or JPEG.');
      }

      // If SVG is allowed, scan entire text for active scripts / polyglots
      const text = await file.text();
      const dangerousPatterns = [
        /<script\b/i,
        /javascript\s*:/i,
        /data\s*:\s*text\/html/i,
        /onload\s*=/i,
        /onerror\s*=/i,
        /onclick\s*=/i,
        /onmouseover\s*=/i,
        /onfocus\s*=/i,
        /<foreignObject\b/i,
        /<iframe\b/i,
        /<embed\b/i,
        /<object\b/i,
        /<!ENTITY\b/i,
        /SYSTEM\b/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
          throw new Error('Image validation failed: Malicious active script or XML entity detected in SVG payload.');
        }
      }

      return file;
    }

    if (!isPng && !isJpeg && !isWebP) {
      throw new Error('Image validation failed: Invalid magic bytes. File does not match valid PNG, JPEG, or WebP binary signature.');
    }

    // 4. Binary decompression bomb inspection for PNG
    if (isPng && headerBytes.length >= 24) {
      const dataView = new DataView(headerBuffer);
      const width = dataView.getUint32(16, false);
      const height = dataView.getUint32(20, false);
      if (width > maxWidth || height > maxHeight) {
        throw new Error(
          `Image validation failed: Dimensions (${width}x${height}) exceed safe maximum limit (${maxWidth}x${maxHeight}). Possible decompression bomb.`
        );
      }
      if (width * height > 16_000_000) {
        throw new Error(
          `Image validation failed: Total pixel count (${width * height}) exceeds 16 megapixels limit.`
        );
      }
    }

    return file;
  }

  private async inspectImageDimensions(
    file: File,
    maxWidth: number,
    maxHeight: number
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined') {
        // In Node.js / non-browser test environment
        resolve({ width: 200, height: 100 });
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      const timer = setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image validation failed: Image dimension check timed out.'));
      }, 5000);

      img.onload = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);

        if (img.width > maxWidth || img.height > maxHeight) {
          reject(
            new Error(
              `Image validation failed: Dimensions (${img.width}x${img.height}) exceed safe maximum limit (${maxWidth}x${maxHeight}). Possible decompression bomb.`
            )
          );
          return;
        }

        if (img.width * img.height > 16_000_000) {
          reject(
            new Error(
              `Image validation failed: Total pixel count (${img.width * img.height}) exceeds 16 megapixels limit.`
            )
          );
          return;
        }

        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image validation failed: Corrupt or unparseable image file.'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Validates and processes an uploaded logo file, downsizing it to a safe
   * badge size (max 256x256) transparent PNG data URL.
   */
  async validateAndProcessLogo(file: File): Promise<string> {
    const validated = await this.validateImageFile(file, {
      maxSizeBytes: 2 * 1024 * 1024,
      maxWidth: 2048,
      maxHeight: 2048,
      allowedMimes: ['image/png', 'image/jpeg', 'image/jpg'],
      allowSvg: false
    });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl);
      };
      reader.onerror = () => reject(new Error('Failed to read logo file.'));
      reader.readAsDataURL(validated);
    });
  }

  // ==========================================
  // 4. Initials Derivation Algorithm
  // ==========================================

  /**
   * Derives uppercase initials from a full name, intelligently ignoring formal
   * titles (Dr., Mr., Mrs., Prof., Sir, Adv., Er., CA, etc.) and handling hyphenated names.
   * "Dr. Jane Doe-Smith" -> "JDS"
   */
  deriveInitials(fullName: string): string {
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return '';
    }

    let cleaned = this.sanitizeTextInput(fullName, 120);
    let prev = '';

    // Strip trailing formal suffixes (e.g. ", Ph.D.", ", M.D.", ", Esq.", ", Jr.", ", Sr.")
    cleaned = cleaned.replace(/,\s*(ph\.?d|m\.?d|esq|jr|sr|ii|iii|iv)\.?$/i, '').trim();

    // Repeatedly strip leading titles/honorifics
    const titleRegex = /^(dr|mr|mrs|ms|miss|mx|prof|sir|madam|adv|er|ca|cs|cfa|rev|hon|capt|col|lt|judge|justice|lord|lady|dame)\.?\s+/i;
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(titleRegex, '').trim();
    }

    if (!cleaned) return '';

    // Split on spaces and hyphens
    const segments = cleaned.split(/[\s\-]+/).filter(Boolean);
    if (segments.length === 0) return '';

    const initials = segments
      .map(seg => {
        // Find first alphabetic character
        const match = seg.match(/[a-zA-Z]/);
        return match ? match[0].toUpperCase() : '';
      })
      .filter(Boolean)
      .join('');

    return initials.slice(0, 4);
  }

  // ==========================================
  // 5. Font Pre-loading Engine (Anti-Flicker)
  // ==========================================

  /**
   * Pre-loads all 5 cursive calligraphy fonts to prevent font loading flicker
   * on canvas rendering.
   */
  async ensureFontsLoaded(): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
      return;
    }
    const fontPromises = this.supportedFonts.map(font =>
      document.fonts.load(`italic 48px "${font}"`).catch(() => {})
    );
    await Promise.all(fontPromises);
    try {
      await document.fonts.ready;
    } catch {
      // Fallback
    }
  }

  // ==========================================
  // 6. Typed Signature Canvas Engine
  // ==========================================

  /**
   * Renders a typed user name in cursive calligraphy on a high-DPI canvas
   * and returns a transparent PNG data URL.
   */
  renderTypedSignature(
    name: string,
    font: TypedSignatureFont = 'Caveat',
    color: SignatureInkColor = '#000000',
    dpr = 2
  ): string {
    const sanitizedName = this.sanitizeTextInput(name, 80);
    const text = (sanitizedName || '').trim();
    if (!text) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }

    if (typeof document === 'undefined') {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }

    const canvas = document.createElement('canvas');
    const width = Math.max(300, Math.min(800, text.length * 32 + 80));
    const height = 140;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    let fontSize = 48;
    if (font === 'Sacramento' || font === 'Great Vibes') {
      fontSize = 56;
    } else if (font === 'Caveat') {
      fontSize = 52;
    } else if (font === 'Alex Brush') {
      fontSize = 50;
    }

    // Calligraphy font fallback stack prevents flicker/fallback to plain sans-serif
    ctx.font = `italic ${fontSize}px "${font}", "Brush Script MT", "Segoe Script", cursive, sans-serif`;
    ctx.fillText(text, width / 2, height / 2);

    return canvas.toDataURL('image/png');
  }

  // ==========================================
  // 7. Appearance Layout Computation
  // ==========================================

  /**
   * Computes exact relative coordinates for each visual element of the signature
   * stamp depending on the selected layout preset.
   */
  computeStampLayout(options: SignatureAppearanceOptions): StampLayoutGeometry {
    const preset = options.layoutPreset || 'standard-horizontal';

    const sanitizedFullName = this.sanitizeTextInput(options.signer?.fullName, 80);
    const sanitizedRole = this.sanitizeTextInput(options.signer?.titleOrRole, 80);
    const sanitizedOrg = this.sanitizeTextInput(options.signer?.organization, 80);
    const sanitizedReason = this.sanitizeTextInput(options.metadata?.reason, 100);
    const sanitizedLocation = this.sanitizeTextInput(options.metadata?.location, 80);
    const formattedTimestamp = this.formatTimestamp(
      options.metadata?.timestamp,
      options.metadata?.includeTimezone !== false
    );

    const initials = options.includeInitialsBadge
      ? this.deriveInitials(sanitizedFullName)
      : '';

    const textLines: Array<{
      text: string;
      x: number;
      y: number;
      font: string;
      color: string;
      isBold?: boolean;
    }> = [];

    const inkColor = options.inkColor || '#000000';
    const textColor = '#1e293b';
    const metaColor = '#475569';

    if (preset === 'standard-horizontal') {
      const totalWidth = 440;
      const totalHeight = 130;
      const signatureBox = { x: 12, y: 15, width: 160, height: 100 };

      let rightStartX = 186;
      let initialsBadgeBox: { cx: number; cy: number; radius: number; initials: string } | undefined;

      if (options.includeInitialsBadge && initials) {
        initialsBadgeBox = { cx: 204, cy: 65, radius: 20, initials };
        rightStartX = 236;
      }

      let logoBox: { x: number; y: number; width: number; height: number } | undefined;
      let textStartX = rightStartX;

      if (options.includeLogo && options.logoDataUrl) {
        logoBox = { x: rightStartX, y: 15, width: 28, height: 28 };
        textStartX = rightStartX + 36;
      } else if (options.includeLogo) {
        // Fallback placeholder box
        logoBox = { x: rightStartX, y: 15, width: 28, height: 28 };
      }

      const signerDetailsBox = { x: rightStartX, y: 15, width: totalWidth - rightStartX - 12, height: 45 };
      const metadataBox = { x: rightStartX, y: 62, width: totalWidth - rightStartX - 12, height: 55 };

      // Details lines
      let curY = 28;
      if (sanitizedFullName) {
        textLines.push({
          text: sanitizedFullName,
          x: textStartX,
          y: curY,
          font: 'bold 15px sans-serif',
          color: textColor,
          isBold: true
        });
        curY += 18;
      }

      const roleOrg = [sanitizedRole, sanitizedOrg].filter(Boolean).join(' • ');
      if (roleOrg) {
        textLines.push({
          text: roleOrg,
          x: textStartX,
          y: curY,
          font: '12px sans-serif',
          color: metaColor
        });
        curY += 16;
      }

      // Metadata lines
      if (options.metadata.includeReason && sanitizedReason) {
        textLines.push({
          text: `Reason: ${sanitizedReason}`,
          x: rightStartX,
          y: curY,
          font: '11px sans-serif',
          color: metaColor
        });
        curY += 15;
      }

      if (options.metadata.includeLocation && sanitizedLocation) {
        textLines.push({
          text: `Location: ${sanitizedLocation}`,
          x: rightStartX,
          y: curY,
          font: '11px sans-serif',
          color: metaColor
        });
        curY += 15;
      }

      if (options.metadata.includeTimestamp) {
        textLines.push({
          text: `Date: ${formattedTimestamp}`,
          x: rightStartX,
          y: curY,
          font: '11px sans-serif',
          color: metaColor
        });
      }

      return {
        totalWidth,
        totalHeight,
        signatureBox,
        initialsBadgeBox,
        logoBox,
        signerDetailsBox,
        metadataBox,
        textLines
      };
    } else if (preset === 'compact-stacked') {
      const totalWidth = 260;
      const totalHeight = 160;
      const signatureBox = { x: 15, y: 10, width: 230, height: 65 };

      let initialsBadgeBox: { cx: number; cy: number; radius: number; initials: string } | undefined;
      if (options.includeInitialsBadge && initials) {
        initialsBadgeBox = { cx: 234, cy: 22, radius: 14, initials };
      }

      let logoBox: { x: number; y: number; width: number; height: number } | undefined;
      if (options.includeLogo && options.logoDataUrl) {
        logoBox = { x: 16, y: 10, width: 24, height: 24 };
      }

      const signerDetailsBox = { x: 15, y: 80, width: 230, height: 35 };
      const metadataBox = { x: 15, y: 115, width: 230, height: 40 };

      let curY = 92;
      if (sanitizedFullName) {
        textLines.push({
          text: sanitizedFullName,
          x: 130,
          y: curY,
          font: 'bold 13px sans-serif',
          color: textColor,
          isBold: true
        });
        curY += 16;
      }

      const roleOrg = [sanitizedRole, sanitizedOrg].filter(Boolean).join(' • ');
      if (roleOrg) {
        textLines.push({
          text: roleOrg,
          x: 130,
          y: curY,
          font: '11px sans-serif',
          color: metaColor
        });
        curY += 15;
      }

      if (options.metadata.includeTimestamp) {
        textLines.push({
          text: formattedTimestamp,
          x: 130,
          y: curY,
          font: '10px sans-serif',
          color: metaColor
        });
      }

      return {
        totalWidth,
        totalHeight,
        signatureBox,
        initialsBadgeBox,
        logoBox,
        signerDetailsBox,
        metadataBox,
        textLines
      };
    } else {
      // formal-seal
      const totalWidth = 460;
      const totalHeight = 160;
      const sealBorder = { x: 8, y: 8, width: 444, height: 144, borderWidth: 2 };

      let initialsBadgeBox: { cx: number; cy: number; radius: number; initials: string } | undefined;
      if (options.includeInitialsBadge && initials) {
        initialsBadgeBox = { cx: 48, cy: 50, radius: 24, initials };
      }

      const sigX = initialsBadgeBox ? 86 : 20;
      const signatureBox = { x: sigX, y: 16, width: 160, height: 70 };

      const signerRightX = 256;
      let logoBox: { x: number; y: number; width: number; height: number } | undefined;
      let signerTextX = signerRightX;

      if (options.includeLogo && options.logoDataUrl) {
        logoBox = { x: signerRightX, y: 16, width: 32, height: 32 };
        signerTextX = signerRightX + 40;
      }

      const signerDetailsBox = { x: signerTextX, y: 16, width: totalWidth - signerTextX - 16, height: 70 };
      const metadataBox = { x: 20, y: 92, width: 420, height: 50 };

      let curY = 32;
      if (sanitizedFullName) {
        textLines.push({
          text: sanitizedFullName,
          x: signerTextX,
          y: curY,
          font: 'bold 14px sans-serif',
          color: textColor,
          isBold: true
        });
        curY += 18;
      }

      if (sanitizedRole) {
        textLines.push({
          text: sanitizedRole,
          x: signerTextX,
          y: curY,
          font: '12px sans-serif',
          color: metaColor
        });
        curY += 16;
      }

      if (sanitizedOrg) {
        textLines.push({
          text: sanitizedOrg,
          x: signerTextX,
          y: curY,
          font: '12px sans-serif',
          color: metaColor
        });
      }

      // Metadata at bottom
      let metaY = 106;
      const metaParts: string[] = [];
      if (options.metadata.includeReason && sanitizedReason) {
        metaParts.push(`Reason: ${sanitizedReason}`);
      }
      if (options.metadata.includeLocation && sanitizedLocation) {
        metaParts.push(`Location: ${sanitizedLocation}`);
      }
      if (metaParts.length > 0) {
        textLines.push({
          text: metaParts.join('  |  '),
          x: 20,
          y: metaY,
          font: '11px sans-serif',
          color: metaColor
        });
        metaY += 16;
      }

      if (options.metadata.includeTimestamp) {
        textLines.push({
          text: `Digitally Verified On: ${formattedTimestamp}`,
          x: 20,
          y: metaY,
          font: '11px sans-serif',
          color: inkColor
        });
      }

      return {
        totalWidth,
        totalHeight,
        signatureBox,
        initialsBadgeBox,
        logoBox,
        signerDetailsBox,
        metadataBox,
        sealBorder,
        textLines
      };
    }
  }

  // ==========================================
  // 8. Composite Appearance Rendering
  // ==========================================

  /**
   * Renders the complete composite signature stamp onto a high-DPI canvas
   * and returns the resulting PNG data URL along with layout geometry.
   */
  async renderCompositeStamp(
    options: SignatureAppearanceOptions,
    dpr = 2
  ): Promise<StampRenderResult> {
    const layout = this.computeStampLayout(options);

    if (typeof document === 'undefined') {
      return {
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        width: layout.totalWidth,
        height: layout.totalHeight,
        layout
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.totalWidth * dpr);
    canvas.height = Math.round(layout.totalHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        width: layout.totalWidth,
        height: layout.totalHeight,
        layout
      };
    }

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, layout.totalWidth, layout.totalHeight);

    // 1. Draw Seal Border if configured
    if (layout.sealBorder) {
      ctx.save();
      ctx.strokeStyle = options.borderColor || options.inkColor || '#1e3a8a';
      ctx.lineWidth = layout.sealBorder.borderWidth;
      // Snapped to crisp pixel grid to prevent anti-aliasing blur
      ctx.strokeRect(
        layout.sealBorder.x + 0.5,
        layout.sealBorder.y + 0.5,
        layout.sealBorder.width - 1,
        layout.sealBorder.height - 1
      );

      // Inner decorative border for formal legal certificates
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(30, 58, 138, 0.35)';
      ctx.strokeRect(
        layout.sealBorder.x + 4.5,
        layout.sealBorder.y + 4.5,
        layout.sealBorder.width - 9,
        layout.sealBorder.height - 9
      );
      ctx.restore();
    }

    // 2. Draw Initials Badge if configured
    if (layout.initialsBadgeBox) {
      const { cx, cy, radius, initials } = layout.initialsBadgeBox;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fill();
      ctx.strokeStyle = options.inkColor || '#1e3a8a';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = options.inkColor || '#1e3a8a';

      // Adaptive badge font sizing to prevent initials clipping
      let fontScale = 0.95;
      if (initials.length >= 4) fontScale = 0.58;
      else if (initials.length === 3) fontScale = 0.72;
      else if (initials.length === 1) fontScale = 1.1;

      ctx.font = `bold ${Math.round(radius * fontScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, cx, cy);
      ctx.restore();
    }

    // 3. Draw Signature Image (Hand-drawn, typed, or uploaded)
    let sigDataUrl = options.signatureImage;
    if (options.signatureSource === 'type' || !sigDataUrl) {
      sigDataUrl = this.renderTypedSignature(
        options.signer.fullName || 'Signer',
        options.typedFont || 'Caveat',
        options.inkColor || '#000000',
        dpr
      );
    }

    if (sigDataUrl && sigDataUrl.startsWith('data:image')) {
      await this.drawImageToCanvas(
        ctx,
        sigDataUrl,
        layout.signatureBox.x,
        layout.signatureBox.y,
        layout.signatureBox.width,
        layout.signatureBox.height
      );
    }

    // 4. Draw Logo if configured
    if (layout.logoBox && options.logoDataUrl) {
      await this.drawImageToCanvas(
        ctx,
        options.logoDataUrl,
        layout.logoBox.x,
        layout.logoBox.y,
        layout.logoBox.width,
        layout.logoBox.height
      );
    }

    // 5. Draw Text Lines
    for (const line of layout.textLines) {
      ctx.save();
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.textAlign = options.layoutPreset === 'compact-stacked' ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(line.text, line.x, line.y);
      ctx.restore();
    }

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: layout.totalWidth,
      height: layout.totalHeight,
      layout
    };
  }

  // ==========================================
  // 9. Template Persistence (with Stored XSS defense)
  // ==========================================

  async saveTemplate(template: SignatureAppearanceTemplate): Promise<void> {
    const sanitizedTemplate: SignatureAppearanceTemplate = {
      ...template,
      id: this.sanitizeTextInput(template.id, 50) || `tmpl-${Date.now()}`,
      name: this.sanitizeTextInput(template.name, 60) || 'Signature Template',
      signer: {
        fullName: this.sanitizeTextInput(template.signer?.fullName, 80),
        titleOrRole: this.sanitizeTextInput(template.signer?.titleOrRole, 80),
        organization: this.sanitizeTextInput(template.signer?.organization, 80)
      },
      metadata: {
        ...template.metadata,
        reason: this.sanitizeTextInput(template.metadata?.reason, 100),
        location: this.sanitizeTextInput(template.metadata?.location, 80),
        timestamp: template.metadata?.timestamp
          ? this.formatTimestamp(template.metadata.timestamp, template.metadata.includeTimezone !== false)
          : undefined
      },
      createdAt: template.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    const templates = await this.getTemplates();
    const existingIndex = templates.findIndex(t => t.id === sanitizedTemplate.id);

    if (existingIndex >= 0) {
      templates[existingIndex] = sanitizedTemplate;
    } else {
      templates.push(sanitizedTemplate);
    }

    await Preferences.set({
      key: STORAGE_KEY,
      value: JSON.stringify(templates)
    });
  }

  async getTemplates(): Promise<SignatureAppearanceTemplate[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    // Default template if none stored
    const defaultTemplate = this.getDefaultTemplate();
    return [defaultTemplate];
  }

  async deleteTemplate(id: string): Promise<void> {
    const templates = await this.getTemplates();
    const filtered = templates.filter(t => t.id !== id);
    await Preferences.set({
      key: STORAGE_KEY,
      value: JSON.stringify(filtered)
    });
  }

  getDefaultTemplate(): SignatureAppearanceTemplate {
    return {
      id: 'default-standard',
      name: 'Standard Approval Stamp',
      signatureSource: 'type',
      typedFont: 'Caveat',
      inkColor: '#1e3a8a',
      layoutPreset: 'standard-horizontal',
      includeInitialsBadge: true,
      includeLogo: false,
      signer: {
        fullName: 'Authorized Signer',
        titleOrRole: 'Manager',
        organization: 'Verified Signature'
      },
      metadata: {
        reason: 'Approved and Verified',
        location: 'Mumbai, India',
        includeReason: true,
        includeLocation: true,
        includeTimestamp: true,
        includeTimezone: true
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // ==========================================
  // Private Utilities
  // ==========================================

  private drawImageToCanvas(
    ctx: CanvasRenderingContext2D,
    dataUrl: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    return new Promise(resolve => {
      if (typeof Image === 'undefined') {
        resolve();
        return;
      }

      const img = new Image();
      const timer = setTimeout(resolve, 30);

      img.onload = () => {
        clearTimeout(timer);
        try {
          ctx.drawImage(img, x, y, width, height);
        } catch {
          // ignore draw image error
        }
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
      img.src = dataUrl;
      if (img.complete) {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}
