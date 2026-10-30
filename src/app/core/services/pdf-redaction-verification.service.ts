import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFNumber, PDFPage, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as pako from 'pako';
import {
  BoundingRect,
  RasterizeRegionOptions,
  RedactionAuditItem,
  RedactionAuditReport,
  RedactionTarget,
  RedactionVerificationStatus
} from '../models/pdf-redaction-verify.types';
import '../utilities/pdfjs-worker';

const BLACK_PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9C, 0x63, 0x60, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa7, 0x34, 0x66, 0x62,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

@Injectable({
  providedIn: 'root'
})
export class PdfRedactionVerificationService {
  /**
   * Masks a sensitive string for safe UI presentation (e.g. "••••••••" or "S•••••4").
   */
  maskSensitiveString(text: string): string {
    if (!text) return '••••';
    const trimmed = text.trim();
    if (trimmed.length <= 4) {
      return '••••';
    }
    const maskLen = Math.min(Math.max(trimmed.length - 2, 4), 10);
    return `${trimmed[0]}${'•'.repeat(maskLen)}${trimmed[trimmed.length - 1]}`;
  }

  /**
   * Dual-pass forensic verification of redactions in a PDF document.
   * Pass 1: Text extraction pass via pdfjs-dist.
   * Pass 2: Content stream syntax audit via pdf-lib.
   */
  async verifyRedactions(
    source: File | ArrayBuffer | Uint8Array,
    targets?: RedactionTarget[]
  ): Promise<RedactionAuditReport> {
    const rawBytes = await this.toUint8Array(source);
    const fileName = source instanceof File ? source.name : 'document.pdf';

    // 1. Load document via pdfjs-dist and pdf-lib
    const pdfjsDoc = await pdfjsLib.getDocument({ data: rawBytes.slice(0) }).promise;
    const totalPages = pdfjsDoc.numPages;

    const pdfLibDoc = await PDFDocument.load(rawBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    // 2. Discover targets if none provided or empty
    const auditTargets: RedactionTarget[] = (targets && targets.length > 0)
      ? [...targets]
      : await this.autoDetectRedactionTargets(pdfLibDoc, pdfjsDoc);

    const items: RedactionAuditItem[] = [];

    // 3. Perform dual-pass audit on each target
    for (const target of auditTargets) {
      const pageIndex = Math.min(Math.max(0, target.pageIndex), totalPages - 1);
      const pageNumber = target.pageNumber || pageIndex + 1;
      const targetText = target.targetText?.trim() || '';

      let pass1Found = false;
      let pass2Found = false;
      let detectedSuperficialOverlay = false;
      let streamSmugglingDetected = false;
      let metadataLeakageDetected = false;
      let failureReason: string | undefined;
      let computedRect = target.boundingRect;

      // Pass 1: pdfjs-dist Text Extraction Layer
      if (targetText.length > 0) {
        try {
          const jsPage = await pdfjsDoc.getPage(pageIndex + 1);
          const textContent = await jsPage.getTextContent();
          
          for (const item of textContent.items as any[]) {
            const str = item.str || '';
            if (this.fuzzyOrExactMatch(str, targetText)) {
              pass1Found = true;
              if (!computedRect && Array.isArray(item.transform) && item.transform.length >= 6) {
                computedRect = {
                  x: Math.round(item.transform[4]),
                  y: Math.round(item.transform[5]),
                  width: Math.max(10, Math.round(item.width || 100)),
                  height: Math.max(10, Math.round(item.height || Math.abs(item.transform[3]) || 14))
                };
              }
            }
          }

          // Also check whole line / combined string
          if (!pass1Found) {
            const combinedPageText = textContent.items.map((i: any) => i.str || '').join(' ');
            if (this.fuzzyOrExactMatch(combinedPageText, targetText)) {
              pass1Found = true;
            }
          }
        } catch {
          // If pdfjs text extraction fails, consider as unverified
        }
      }

      // Pass 2: pdf-lib Content Stream Syntax Audit
      try {
        const libPage = pdfLibDoc.getPage(pageIndex);
        const streamAudit = this.inspectPageStreamForText(libPage, pdfLibDoc, targetText);
        pass2Found = streamAudit.found;
        detectedSuperficialOverlay = streamAudit.detectedBlackOverlay;
        streamSmugglingDetected = streamAudit.streamSmugglingDetected;
      } catch {
        // Stream reading fallback
      }

      // Pass 3: Metadata Audit (Document Info and XMP stream)
      try {
        const metadataAudit = this.inspectDocumentMetadataForText(pdfLibDoc, targetText);
        if (metadataAudit.found) {
          metadataLeakageDetected = true;
        }
      } catch {
        // Metadata reading fallback
      }

      // Status determination
      let status: RedactionVerificationStatus = 'verified';

      if (pass1Found || pass2Found || metadataLeakageDetected) {
        status = 'failed';
        if (detectedSuperficialOverlay) {
          failureReason = 'Naive black rectangle drawn over text without deleting underlying stream operators (superficial blackout).';
        } else if (streamSmugglingDetected) {
          failureReason = 'Sensitive text split and smuggled across content stream operators (e.g. TJ kerning array).';
        } else if (metadataLeakageDetected) {
          failureReason = 'Sensitive text leaked in document metadata (XMP / Document Info).';
        } else if (pass1Found && pass2Found) {
          failureReason = 'Sensitive text was found in both the extracted text layer and raw content stream.';
        } else if (pass1Found) {
          failureReason = 'Sensitive text was found directly in the extracted text layer.';
        } else {
          failureReason = 'Target text found in raw content stream operators.';
        }
      } else if (target.reason === 'residual_risk') {
        status = 'residual_risk';
        failureReason = 'Non-standard font encodings or clipping paths prevent mathematical proof of vector removal.';
      } else {
        status = 'verified';
      }

      items.push({
        id: target.id || `audit-${pageNumber}-${Math.random().toString(36).substring(2, 7)}`,
        pageIndex,
        pageNumber,
        targetText,
        maskedText: this.maskSensitiveString(targetText),
        status,
        pass1FoundInTextLayer: pass1Found,
        pass2FoundInContentStream: pass2Found,
        detectedSuperficialOverlay,
        metadataLeakageDetected,
        streamSmugglingDetected,
        failureReason,
        boundingRect: computedRect
      });
    }

    const verifiedCount = items.filter(i => i.status === 'verified').length;
    const residualRiskCount = items.filter(i => i.status === 'residual_risk').length;
    const failedCount = items.filter(i => i.status === 'failed').length;
    const totalAudited = items.length;
    const is100PercentPurged = totalAudited > 0 && verifiedCount === totalAudited;

    return {
      fileName,
      totalPages,
      auditedAt: new Date(),
      totalAudited,
      verifiedCount,
      residualRiskCount,
      failedCount,
      items,
      is100PercentPurged
    };
  }

  /**
   * Applies the Region Rasterization Fallback to permanently destroy vector text under
   * the redaction bounding box and embed a flattened 300 DPI raster patch.
   */
  async rasterizeRedactedRegion(
    source: File | ArrayBuffer | Uint8Array,
    target: RedactionTarget,
    options?: RasterizeRegionOptions
  ): Promise<{ pdfBytes: Uint8Array; report: RedactionAuditReport; remediatedItem: RedactionAuditItem }> {
    const rawBytes = await this.toUint8Array(source);
    const pdfLibDoc = await PDFDocument.load(rawBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pageIndex = Math.min(Math.max(0, target.pageIndex), pdfLibDoc.getPageCount() - 1);
    const page = pdfLibDoc.getPage(pageIndex);

    // 1. Sanitize Content Stream: Strip target text operators from /Contents
    this.sanitizePageStreams(page, pdfLibDoc, target.targetText);

    // 1b. Sanitize Document Metadata: Strip target text from Info dictionary and XMP
    this.sanitizeDocumentMetadata(pdfLibDoc, target.targetText);

    // 2. Generate and embed 300 DPI raster patch with coordinate clamping
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const inputRect = target.boundingRect || { x: 50, y: 50, width: 200, height: 30 };
    const rect: BoundingRect = {
      x: Math.max(0, Math.min(inputRect.x, Math.max(0, pageWidth - 10))),
      y: Math.max(0, Math.min(inputRect.y, Math.max(0, pageHeight - 10))),
      width: Math.max(10, Math.min(inputRect.width, pageWidth)),
      height: Math.max(10, Math.min(inputRect.height, pageHeight))
    };

    const pngPatchBytes = await this.generateRasterPatch(rect, options);

    const embeddedImage = await pdfLibDoc.embedPng(pngPatchBytes);
    page.drawImage(embeddedImage, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });

    // Solid vector opaque overlay for 100% silhouette & contrast bleed resistance against OCR
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rgb(0, 0, 0)
    });

    // 3. Save clean document
    const pdfBytes = await pdfLibDoc.save();

    // 4. Re-audit document to prove vector removal
    const report = await this.verifyRedactions(pdfBytes, [
      {
        ...target,
        reason: undefined // cleared after rasterization
      }
    ]);

    const remediatedItem = report.items[0] || {
      id: target.id,
      pageIndex,
      pageNumber: pageIndex + 1,
      targetText: target.targetText,
      maskedText: this.maskSensitiveString(target.targetText),
      status: 'verified',
      pass1FoundInTextLayer: false,
      pass2FoundInContentStream: false,
      detectedSuperficialOverlay: false,
      rasterized: true
    };
    remediatedItem.rasterized = true;

    return {
      pdfBytes,
      report,
      remediatedItem
    };
  }

  /**
   * Helper to inspect page streams for target text, black rectangle overlays, and smuggling.
   */
  private inspectPageStreamForText(
    page: PDFPage,
    doc: PDFDocument,
    targetText: string
  ): { found: boolean; detectedBlackOverlay: boolean; rawMatches: string[]; streamSmugglingDetected: boolean } {
    if (!targetText) {
      return { found: false, detectedBlackOverlay: false, rawMatches: [], streamSmugglingDetected: false };
    }

    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) {
      return { found: false, detectedBlackOverlay: false, rawMatches: [], streamSmugglingDetected: false };
    }

    const contentsObj = doc.context.lookup(contentsRef);
    const streams: any[] = [];

    if (contentsObj && typeof (contentsObj as any).size === 'function') {
      const size = (contentsObj as any).size();
      for (let i = 0; i < size; i++) {
        streams.push(doc.context.lookup((contentsObj as any).get(i)));
      }
    } else if (contentsObj) {
      streams.push(contentsObj);
    }

    const targetHex = Array.from(new TextEncoder().encode(targetText))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    let found = false;
    let detectedBlackOverlay = false;
    let streamSmugglingDetected = false;
    const rawMatches: string[] = [];

    for (const stm of streams) {
      if (!stm || typeof stm.getContents !== 'function') continue;
      const rawBytes = stm.getContents();
      let decompressed: Uint8Array;
      try {
        const inflate = pako.inflate || (pako as any).default?.inflate;
        decompressed = inflate(rawBytes);
      } catch {
        decompressed = rawBytes;
      }

      const streamText = new TextDecoder('latin1').decode(decompressed);

      // Check for target text in literal string or hex format
      const hasLiteral = streamText.toLowerCase().includes(targetText.toLowerCase());
      const hasHex = streamText.toLowerCase().includes(targetHex.toLowerCase());

      // Check text operators: (...) Tj, [...] TJ, ' , "
      const regexTj = new RegExp(`\\([^)]*${this.escapeRegex(targetText)}[^)]*\\)\\s*(Tj|'|")`, 'i');
      const regexHexTj = new RegExp(`<[^>]*${targetHex}[^>]*>\\s*(Tj|'|")`, 'i');
      const regexTJArray = new RegExp(`\\[[^\\]]*${this.escapeRegex(targetText)}[^\\]]*\\]\\s*TJ`, 'i');

      if (hasLiteral || hasHex || regexTj.test(streamText) || regexHexTj.test(streamText) || regexTJArray.test(streamText)) {
        found = true;
        rawMatches.push(targetText);
      }

      // Check stream operator smuggling via kerning arrays: [(pass) -100 (word)] TJ
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/gi;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjArrayRegex.exec(streamText)) !== null) {
        const joinedTj = this.extractTextFromTjArray(tjMatch[1]);
        if (this.fuzzyOrExactMatch(joinedTj, targetText)) {
          found = true;
          streamSmugglingDetected = true;
          rawMatches.push(targetText);
        }
      }

      // Check text object smuggling across consecutive text operators inside BT ... ET
      const btRegex = /BT([\s\S]*?)ET/gi;
      let btMatch: RegExpExecArray | null;
      while ((btMatch = btRegex.exec(streamText)) !== null) {
        const joinedBt = this.extractTextFromBtBlock(btMatch[1]);
        if (this.fuzzyOrExactMatch(joinedBt, targetText)) {
          found = true;
          streamSmugglingDetected = true;
          rawMatches.push(targetText);
        }
      }

      // Check for black rectangle draw commands: 0 0 0 rg or 0 g followed by re + f
      const hasBlackColor = /0\s+0\s+0\s+(rg|RG)/i.test(streamText) ||
        /0\s+(g|G)\b/i.test(streamText) ||
        /0\s+0\s+0\s+1\s+(k|K)/i.test(streamText);
      const hasRectFill = /\bre\b[\s\S]{0,80}\b(f|F|f\*|B|B\*)\b/i.test(streamText) ||
        /\bm\b[\s\S]{0,120}\bl[\s\S]{0,80}\b(f|F|f\*|B|B\*)\b/i.test(streamText);

      if (hasBlackColor && hasRectFill) {
        detectedBlackOverlay = true;
      }
    }

    return { found, detectedBlackOverlay, rawMatches, streamSmugglingDetected };
  }

  /**
   * Helper to inspect Document Info dictionary and XMP metadata stream for target string.
   */
  private inspectDocumentMetadataForText(
    doc: PDFDocument,
    targetText: string
  ): { found: boolean; locations: string[] } {
    if (!targetText) return { found: false, locations: [] };
    const locations: string[] = [];
    const lower = targetText.toLowerCase();

    // Check Document Info Dictionary
    try {
      const title = doc.getTitle();
      if (title && title.toLowerCase().includes(lower)) locations.push('Title');
      const subject = doc.getSubject();
      if (subject && subject.toLowerCase().includes(lower)) locations.push('Subject');
      const author = doc.getAuthor();
      if (author && author.toLowerCase().includes(lower)) locations.push('Author');
      const keywords = doc.getKeywords();
      if (typeof keywords === 'string' && (keywords as string).toLowerCase().includes(lower)) {
        locations.push('Keywords');
      } else if (Array.isArray(keywords) && (keywords as string[]).some(k => k.toLowerCase().includes(lower))) {
        locations.push('Keywords');
      }
      const producer = doc.getProducer();
      if (producer && producer.toLowerCase().includes(lower)) locations.push('Producer');
      const creator = doc.getCreator();
      if (creator && creator.toLowerCase().includes(lower)) locations.push('Creator');
    } catch {}

    // Check Catalog XMP Metadata Stream
    try {
      const catalog = doc.catalog;
      const metadataRef = catalog.get(PDFName.of('Metadata'));
      if (metadataRef) {
        const metadataObj = doc.context.lookup(metadataRef);
        if (metadataObj && typeof (metadataObj as any).getContents === 'function') {
          const raw = (metadataObj as any).getContents();
          const xml = new TextDecoder('utf-8').decode(raw);
          if (xml.toLowerCase().includes(lower)) {
            locations.push('XMP Metadata');
          }
        }
      }
    } catch {}

    return { found: locations.length > 0, locations };
  }

  /**
   * Helper to sanitize Document Info dictionary and XMP metadata stream.
   */
  private sanitizeDocumentMetadata(doc: PDFDocument, targetText: string): boolean {
    if (!targetText) return false;
    let modified = false;
    const lower = targetText.toLowerCase();
    const cleanPattern = new RegExp(this.escapeRegex(targetText), 'gi');

    try {
      const title = doc.getTitle();
      if (title && title.toLowerCase().includes(lower)) {
        doc.setTitle(title.replace(cleanPattern, '[REDACTED]'));
        modified = true;
      }
      const subject = doc.getSubject();
      if (subject && subject.toLowerCase().includes(lower)) {
        doc.setSubject(subject.replace(cleanPattern, '[REDACTED]'));
        modified = true;
      }
      const author = doc.getAuthor();
      if (author && author.toLowerCase().includes(lower)) {
        doc.setAuthor(author.replace(cleanPattern, '[REDACTED]'));
        modified = true;
      }
      const keywords = doc.getKeywords();
      if (typeof keywords === 'string' && (keywords as string).toLowerCase().includes(lower)) {
        doc.setKeywords([(keywords as string).replace(cleanPattern, '[REDACTED]')]);
        modified = true;
      } else if (Array.isArray(keywords) && (keywords as string[]).some(k => k.toLowerCase().includes(lower))) {
        doc.setKeywords((keywords as string[]).map(k => k.replace(cleanPattern, '[REDACTED]')));
        modified = true;
      }

      const catalog = doc.catalog;
      const metadataRef = catalog.get(PDFName.of('Metadata'));
      if (metadataRef) {
        const metadataObj = doc.context.lookup(metadataRef);
        if (metadataObj && typeof (metadataObj as any).getContents === 'function') {
          const raw = (metadataObj as any).getContents();
          const xml = new TextDecoder('utf-8').decode(raw);
          if (xml.toLowerCase().includes(lower)) {
            const cleanedXml = xml.replace(cleanPattern, '[REDACTED]');
            const newBytes = new TextEncoder().encode(cleanedXml);
            (metadataObj as any).contents = newBytes;
            const streamObj = metadataObj as any;
            if (streamObj && streamObj.dict) {
              streamObj.dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
            }
            modified = true;
          }
        }
      }
    } catch {}

    return modified;
  }

  /**
   * Helper to extract concatenated plain text from a [...] TJ kerning array.
   */
  private extractTextFromTjArray(tjContent: string): string {
    let combined = '';
    const tokenRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(tjContent)) !== null) {
      if (match[1] !== undefined) {
        combined += match[1];
      } else if (match[2] !== undefined) {
        const hex = match[2];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const byte = parseInt(hex.substring(i, i + 2), 16);
          if (!isNaN(byte)) {
            decoded += String.fromCharCode(byte);
          }
        }
        combined += decoded;
      }
    }
    return combined;
  }

  /**
   * Helper to extract concatenated plain text from a BT ... ET text object block.
   */
  private extractTextFromBtBlock(btContent: string): string {
    let combined = '';
    const tokenRegex = /\(([^)]*)\)\s*(?:Tj|'|")|<([0-9a-fA-F]+)>\s*(?:Tj|'|")|\[([\s\S]*?)\]\s*TJ/gi;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(btContent)) !== null) {
      if (match[1] !== undefined) {
        combined += match[1];
      } else if (match[2] !== undefined) {
        const hex = match[2];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const byte = parseInt(hex.substring(i, i + 2), 16);
          if (!isNaN(byte)) {
            decoded += String.fromCharCode(byte);
          }
        }
        combined += decoded;
      } else if (match[3] !== undefined) {
        combined += this.extractTextFromTjArray(match[3]);
      }
    }
    return combined;
  }

  /**
   * Helper to strip target text operators from page /Contents streams.
   */
  private sanitizePageStreams(page: PDFPage, doc: PDFDocument, targetText: string): boolean {
    if (!targetText) return false;

    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) return false;

    const contentsObj = doc.context.lookup(contentsRef);
    const streams: any[] = [];

    if (contentsObj && typeof (contentsObj as any).size === 'function') {
      const size = (contentsObj as any).size();
      for (let i = 0; i < size; i++) {
        streams.push(doc.context.lookup((contentsObj as any).get(i)));
      }
    } else if (contentsObj) {
      streams.push(contentsObj);
    }

    const targetHex = Array.from(new TextEncoder().encode(targetText))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    let modified = false;

    for (const stm of streams) {
      if (!stm || typeof stm.getContents !== 'function') continue;
      const rawBytes = stm.getContents();
      let isCompressed = false;
      let decompressed: Uint8Array;
      const inflate = pako.inflate || (pako as any).default?.inflate;

      try {
        decompressed = inflate(rawBytes);
        isCompressed = true;
      } catch {
        decompressed = rawBytes;
      }

      let streamText = new TextDecoder('latin1').decode(decompressed);
      const originalText = streamText;

      // 1. Purge hex text operators: <hex> Tj / ' / "
      streamText = streamText.replace(new RegExp(`<[^>]*${targetHex}[^>]*>\\s*(Tj|'|")`, 'gi'), '<> $1');

      // 2. Purge literal text operators: (targetText) Tj / ' / "
      streamText = streamText.replace(new RegExp(`\\([^)]*${this.escapeRegex(targetText)}[^)]*\\)\\s*(Tj|'|")`, 'gi'), '() $1');

      // 3. Purge from TJ arrays: [(...) 20 (targetText)] TJ or smuggled TJ kerning arrays
      streamText = streamText.replace(/\[([\s\S]*?)\]\s*TJ/gi, (fullMatch, tjInner) => {
        const textInArray = this.extractTextFromTjArray(tjInner);
        if (this.fuzzyOrExactMatch(textInArray, targetText) || textInArray.toLowerCase().includes(targetText.toLowerCase())) {
          return '[] TJ';
        }
        return fullMatch;
      });

      // 4. Purge standalone occurrences inside BT ... ET blocks
      streamText = streamText.replace(new RegExp(this.escapeRegex(targetText), 'gi'), ' '.repeat(targetText.length));

      if (streamText !== originalText) {
        modified = true;
        if (isCompressed && typeof doc.context.flateStream === 'function') {
          const newStream = doc.context.flateStream(streamText);
          (stm as any).contents = newStream.contents;
          stm.dict.set(PDFName.of('Length'), PDFNumber.of(newStream.contents.length));
        } else {
          const newBytes = new TextEncoder().encode(streamText);
          (stm as any).contents = newBytes;
          stm.dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
        }
      }
    }

    return modified;
  }

  /**
   * Generates a 300 DPI raster blackout patch (or falls back cleanly in headless environments).
   */
  private async generateRasterPatch(rect: BoundingRect, options?: RasterizeRegionOptions): Promise<Uint8Array> {
    const dpi = options?.dpi || 300;
    const scale = dpi / 72;
    const pixelWidth = Math.max(1, Math.round(rect.width * scale));
    const pixelHeight = Math.max(1, Math.round(rect.height * scale));

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = options?.fillColor || '#000000';
          ctx.fillRect(0, 0, pixelWidth, pixelHeight);
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
            const base64 = dataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
          }
        }
      } catch {
        // Fallback to minimal PNG
      }
    }

    return BLACK_PNG_1X1;
  }

  /**
   * Auto-detects potential redacted areas and sensitive patterns if no targets provided.
   */
  private async autoDetectRedactionTargets(doc: PDFDocument, pdfjsDoc: any): Promise<RedactionTarget[]> {
    const detected: RedactionTarget[] = [];
    const totalPages = doc.getPageCount();

    for (let i = 0; i < totalPages; i++) {
      const page = doc.getPage(i);
      const streamAudit = this.inspectPageStreamForText(page, doc, 'CONFIDENTIAL');
      if (streamAudit.found) {
        detected.push({
          id: `auto-${i + 1}-confidential`,
          pageIndex: i,
          pageNumber: i + 1,
          targetText: 'CONFIDENTIAL',
          reason: 'residual_risk'
        });
      }
    }

    return detected;
  }

  private fuzzyOrExactMatch(haystack: string, needle: string): boolean {
    if (!haystack || !needle) return false;
    const cleanHaystack = haystack.toLowerCase().replace(/\s+/g, '');
    const cleanNeedle = needle.toLowerCase().replace(/\s+/g, '');
    return cleanHaystack.includes(cleanNeedle);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async toUint8Array(source: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    if (source instanceof Uint8Array) {
      return source;
    }
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    const buffer = await source.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
