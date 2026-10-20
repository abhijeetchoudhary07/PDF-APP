import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PreflightProfile,
  PreflightReport,
  PreflightRuleId,
  PreflightRuleResult
} from '../models/pdf-preflight.types';
import { PdfLayoutService } from './pdf-layout.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfService } from './pdf.service';
import { StorageService } from './storage.service';
import '../utilities/pdfjs-worker';

const PREFLIGHT_PROFILES_KEY = 'IFH_PREFLIGHT_PROFILES';

export const DEFAULT_PREFLIGHT_PROFILES: PreflightProfile[] = [
  {
    id: 'prof_200kb_a4',
    name: '200 KB · 1-2 Pages · Uniform A4',
    description: 'Strict limit for public submission portals requiring compact A4 documents.',
    maxSizeBytes: 200 * 1024,
    minPages: 1,
    maxPages: 2,
    requireUniformPageSize: true,
    requireUniformOrientation: true,
    minImageDpi: 150,
    requireFontsEmbedded: true,
    disallowEncryption: true,
    disallowJavaScript: true,
    disallowAttachments: true,
    requireSearchableText: true,
    disallowBlankPages: true,
    isDefault: true
  },
  {
    id: 'prof_1mb_standard',
    name: '1 MB · Uniform Orientation · No Scripts',
    description: 'Standard security-compliant profile for multi-page forms and applications.',
    maxSizeBytes: 1024 * 1024,
    minPages: 1,
    maxPages: 10,
    requireUniformPageSize: false,
    requireUniformOrientation: true,
    minImageDpi: 150,
    requireFontsEmbedded: false,
    disallowEncryption: true,
    disallowJavaScript: true,
    disallowAttachments: true,
    requireSearchableText: true,
    disallowBlankPages: true,
    isDefault: false
  },
  {
    id: 'prof_5mb_archive',
    name: '5 MB · High Resolution · Complete Submission',
    description: 'High-fidelity profile with generous ceiling, unencrypted, zero JavaScript.',
    maxSizeBytes: 5 * 1024 * 1024,
    minPages: 1,
    requireUniformPageSize: false,
    requireUniformOrientation: false,
    minImageDpi: 200,
    requireFontsEmbedded: true,
    disallowEncryption: true,
    disallowJavaScript: true,
    disallowAttachments: false,
    requireSearchableText: true,
    disallowBlankPages: true,
    isDefault: false
  }
];

@Injectable({
  providedIn: 'root'
})
export class PdfPreflightService {
  private readonly layoutService = inject(PdfLayoutService);
  private readonly privacyService = inject(PdfPrivacyService);
  private readonly pdfService = inject(PdfService);
  private readonly storage = inject(StorageService);

  /**
   * Runs complete preflight check against a specified profile.
   */
  async runPreflight(
    source: File | ArrayBuffer | Uint8Array,
    profile: PreflightProfile,
    fileNameOverride?: string
  ): Promise<PreflightReport> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const fileSizeBytes = bytes.length;
    const fileName = fileNameOverride || (source instanceof File ? source.name : 'submission.pdf');

    const rules: PreflightRuleResult[] = [];

    let pdfLibDoc: PDFDocument | null = null;
    let isEncrypted = false;
    let pageCount = 0;

    try {
      pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
      isEncrypted = pdfLibDoc.isEncrypted;
      pageCount = pdfLibDoc.getPageCount();
    } catch {
      // Unparseable or heavily corrupted
    }

    let pdfJsDoc: any = null;
    try {
      const task = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) } as any);
      pdfJsDoc = await task.promise;
      if (pageCount === 0) pageCount = pdfJsDoc.numPages;
    } catch {
      // Ignored
    }

    // 1. RULE: Max file size
    if (profile.maxSizeBytes && profile.maxSizeBytes > 0) {
      const pass = fileSizeBytes <= profile.maxSizeBytes;
      const actualKb = Math.round(fileSizeBytes / 1024);
      const targetKb = Math.round(profile.maxSizeBytes / 1024);
      rules.push({
        id: 'max_file_size',
        nameKey: 'pdfPreflight.ruleMaxFileSize',
        descriptionKey: 'pdfPreflight.descMaxFileSize',
        status: pass ? 'pass' : 'fail',
        actualValue: `${actualKb} KB`,
        thresholdValue: `≤ ${targetKb} KB`,
        fixable: !pass,
        fixAction: 'compress',
        fixLabelKey: 'pdfPreflight.fixCompress'
      });
    }

    // 2. RULE: Page count range
    if (profile.minPages !== undefined || profile.maxPages !== undefined) {
      const min = profile.minPages ?? 1;
      const max = profile.maxPages ?? 9999;
      const pass = pageCount >= min && pageCount <= max;
      let threshold = '';
      if (profile.minPages && profile.maxPages) threshold = `${min} – ${max} pages`;
      else if (profile.minPages) threshold = `≥ ${min} pages`;
      else threshold = `≤ ${max} pages`;

      rules.push({
        id: 'page_count_range',
        nameKey: 'pdfPreflight.rulePageCount',
        descriptionKey: 'pdfPreflight.descPageCount',
        status: pass ? 'pass' : 'fail',
        actualValue: `${pageCount} page(s)`,
        thresholdValue: threshold,
        fixable: false
      });
    }

    // 3. RULE: Page size uniformity
    if (profile.requireUniformPageSize) {
      let isUniform = true;
      let sampleDims = 'Unknown';
      if (pdfLibDoc && pageCount > 0) {
        const pages = pdfLibDoc.getPages();
        const dimSet = new Set<string>();
        for (const p of pages) {
          const { width, height } = p.getSize();
          dimSet.add(`${Math.round(width)}×${Math.round(height)} pt`);
        }
        isUniform = dimSet.size <= 1;
        sampleDims = Array.from(dimSet).join(', ');
      }

      rules.push({
        id: 'page_size_uniformity',
        nameKey: 'pdfPreflight.rulePageSizeUniformity',
        descriptionKey: 'pdfPreflight.descPageSizeUniformity',
        status: isUniform ? 'pass' : 'fail',
        actualValue: isUniform ? `Uniform (${sampleDims})` : `Mixed (${sampleDims})`,
        thresholdValue: '100% Uniform page size',
        fixable: !isUniform,
        fixAction: 'normalize_size',
        fixLabelKey: 'pdfPreflight.fixNormalizeSize'
      });
    }

    // 4. RULE: Orientation uniformity
    if (profile.requireUniformOrientation) {
      let isUniform = true;
      let portraitCount = 0;
      let landscapeCount = 0;

      if (pdfLibDoc && pageCount > 0) {
        const pages = pdfLibDoc.getPages();
        for (const p of pages) {
          const { width, height } = p.getSize();
          if (width > height) landscapeCount++;
          else portraitCount++;
        }
        isUniform = portraitCount === 0 || landscapeCount === 0;
      }

      rules.push({
        id: 'orientation_uniformity',
        nameKey: 'pdfPreflight.ruleOrientationUniformity',
        descriptionKey: 'pdfPreflight.descOrientationUniformity',
        status: isUniform ? 'pass' : 'fail',
        actualValue: isUniform ? (landscapeCount > 0 ? 'All Landscape' : 'All Portrait') : `${portraitCount} Portrait, ${landscapeCount} Landscape`,
        thresholdValue: 'Consistent Orientation',
        fixable: !isUniform,
        fixAction: 'normalize_orientation',
        fixLabelKey: 'pdfPreflight.fixOrientation'
      });
    }

    // 5. RULE: Minimum Image DPI
    if (profile.minImageDpi && profile.minImageDpi > 0) {
      let lowestDpi = 300;
      let foundImages = false;

      if (pdfLibDoc) {
        try {
          const indirects = pdfLibDoc.context.enumerateIndirectObjects();
          for (const [_ref, obj] of indirects) {
            if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
              if (obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
                foundImages = true;
                const width = (obj.dict.get(PDFName.of('Width')) as any)?.numberValue || 0;
                // Standard A4 width is ~8.27 inches (~595 pt)
                const approxInches = 595 / 72;
                const approxDpi = approxInches > 0 && width > 0 ? Math.round(width / approxInches) : 150;
                if (approxDpi < lowestDpi) lowestDpi = approxDpi;
              }
            }
          }
        } catch {
          // Fallback
        }
      }

      const pass = !foundImages || lowestDpi >= profile.minImageDpi;
      rules.push({
        id: 'min_image_dpi',
        nameKey: 'pdfPreflight.ruleMinImageDpi',
        descriptionKey: 'pdfPreflight.descMinImageDpi',
        status: pass ? 'pass' : 'warn',
        actualValue: foundImages ? `~${lowestDpi} DPI` : 'No embedded images',
        thresholdValue: `≥ ${profile.minImageDpi} DPI`,
        fixable: false
      });
    }

    // 6. RULE: Fonts embedded
    if (profile.requireFontsEmbedded) {
      let allEmbedded = true;
      let totalFonts = 0;
      let unEmbeddedCount = 0;

      if (pdfLibDoc) {
        try {
          const indirects = pdfLibDoc.context.enumerateIndirectObjects();
          for (const [_ref, obj] of indirects) {
            if (obj instanceof PDFDict && obj.get(PDFName.of('Type'))?.toString() === '/Font') {
              totalFonts++;
              const descRef = obj.get(PDFName.of('FontDescriptor'));
              if (descRef) {
                const desc = pdfLibDoc.context.lookup(descRef);
                if (desc instanceof PDFDict) {
                  const hasFile =
                    desc.has(PDFName.of('FontFile')) ||
                    desc.has(PDFName.of('FontFile2')) ||
                    desc.has(PDFName.of('FontFile3'));
                  if (!hasFile) unEmbeddedCount++;
                } else {
                  unEmbeddedCount++;
                }
              }
            }
          }
          if (unEmbeddedCount > 0) allEmbedded = false;
        } catch {
          // Fallback
        }
      }

      rules.push({
        id: 'fonts_embedded',
        nameKey: 'pdfPreflight.ruleFontsEmbedded',
        descriptionKey: 'pdfPreflight.descFontsEmbedded',
        status: allEmbedded ? 'pass' : 'warn',
        actualValue: totalFonts === 0 ? 'No vector fonts' : allEmbedded ? '100% Embedded' : `${unEmbeddedCount} font(s) referenced without file`,
        thresholdValue: 'All fonts embedded',
        fixable: false
      });
    }

    // 7. RULE: No encryption
    if (profile.disallowEncryption) {
      const pass = !isEncrypted;
      rules.push({
        id: 'no_encryption',
        nameKey: 'pdfPreflight.ruleNoEncryption',
        descriptionKey: 'pdfPreflight.descNoEncryption',
        status: pass ? 'pass' : 'fail',
        actualValue: isEncrypted ? 'Encrypted / Password Protected' : 'Clear / Unencrypted',
        thresholdValue: 'Must not be encrypted',
        fixable: false
      });
    }

    // 8. RULE: No JavaScript
    if (profile.disallowJavaScript) {
      let hasJs = false;

      if (pdfLibDoc) {
        try {
          if (pdfLibDoc.catalog.has(PDFName.of('Names'))) {
            const names = pdfLibDoc.context.lookup(pdfLibDoc.catalog.get(PDFName.of('Names')));
            if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
              hasJs = true;
            }
          }
          if (pdfLibDoc.catalog.has(PDFName.of('OpenAction'))) {
            const openAction = pdfLibDoc.context.lookup(pdfLibDoc.catalog.get(PDFName.of('OpenAction')));
            if (openAction instanceof PDFDict) {
              const s = openAction.get(PDFName.of('S'))?.toString();
              if (s === '/JavaScript') hasJs = true;
            }
          }
          if (pdfLibDoc.catalog.has(PDFName.of('AA'))) {
            hasJs = true;
          }
        } catch {
          // Fallback
        }
      }

      rules.push({
        id: 'no_javascript',
        nameKey: 'pdfPreflight.ruleNoJavaScript',
        descriptionKey: 'pdfPreflight.descNoJavaScript',
        status: hasJs ? 'fail' : 'pass',
        actualValue: hasJs ? 'Interactive JavaScript found' : 'Zero scripts detected',
        thresholdValue: 'No executable JavaScript',
        fixable: hasJs,
        fixAction: 'sanitize',
        fixLabelKey: 'pdfPreflight.fixSanitize'
      });
    }

    // 9. RULE: No Attachments
    if (profile.disallowAttachments) {
      let hasAttachments = false;
      if (pdfLibDoc) {
        try {
          const names = pdfLibDoc.catalog.get(PDFName.of('Names'));
          if (names) {
            const namesDict = pdfLibDoc.context.lookup(names);
            if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('EmbeddedFiles'))) {
              hasAttachments = true;
            }
          }
        } catch {
          // Fallback
        }
      }

      rules.push({
        id: 'no_attachments',
        nameKey: 'pdfPreflight.ruleNoAttachments',
        descriptionKey: 'pdfPreflight.descNoAttachments',
        status: hasAttachments ? 'fail' : 'pass',
        actualValue: hasAttachments ? 'Embedded attachments found' : 'No attachments',
        thresholdValue: 'Zero embedded files',
        fixable: hasAttachments,
        fixAction: 'sanitize',
        fixLabelKey: 'pdfPreflight.fixSanitize'
      });
    }

    // 10. RULE: Searchable text present
    if (profile.requireSearchableText) {
      let totalTextChars = 0;
      if (pdfJsDoc && pageCount > 0) {
        for (let p = 1; p <= pageCount; p++) {
          try {
            const page = await pdfJsDoc.getPage(p);
            const text = await page.getTextContent();
            totalTextChars += (text.items || []).reduce((acc: number, it: any) => acc + (it.str ? it.str.trim().length : 0), 0);
          } catch {
            // Ignore
          }
        }
      }

      const pass = totalTextChars >= 50;
      rules.push({
        id: 'searchable_text_present',
        nameKey: 'pdfPreflight.ruleSearchableText',
        descriptionKey: 'pdfPreflight.descSearchableText',
        status: pass ? 'pass' : 'warn',
        actualValue: pass ? `${totalTextChars} searchable characters` : 'Scanned / Low text layer',
        thresholdValue: 'Searchable digital text layer',
        fixable: false
      });
    }

    // 11. RULE: No blank pages
    if (profile.disallowBlankPages) {
      let blankCount = 0;
      if (pdfLibDoc && pageCount > 0) {
        const pages = pdfLibDoc.getPages();
        for (const p of pages) {
          const contents = p.node.get(PDFName.of('Contents'));
          if (!contents) {
            blankCount++;
          }
        }
      }

      const pass = blankCount === 0;
      rules.push({
        id: 'no_blank_pages',
        nameKey: 'pdfPreflight.ruleNoBlankPages',
        descriptionKey: 'pdfPreflight.descNoBlankPages',
        status: pass ? 'pass' : 'warn',
        actualValue: pass ? 'No blank pages detected' : `${blankCount} blank page(s) detected`,
        thresholdValue: 'Zero blank pages',
        fixable: !pass,
        fixAction: 'remove_blanks',
        fixLabelKey: 'pdfPreflight.fixRemoveBlanks'
      });
    }

    const passCount = rules.filter(r => r.status === 'pass').length;
    const failCount = rules.filter(r => r.status === 'fail').length;
    const warnCount = rules.filter(r => r.status === 'warn').length;

    return {
      fileName,
      fileSizeBytes,
      pageCount,
      profileUsed: profile,
      rules,
      passed: failCount === 0,
      passCount,
      failCount,
      warnCount,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * One-tap auto fix for a failed rule.
   * Executes the corresponding tool engine and returns the fixed file and updated report.
   */
  async applyFix(
    source: File | ArrayBuffer | Uint8Array,
    ruleId: PreflightRuleId,
    profile: PreflightProfile,
    fileNameOverride?: string
  ): Promise<{ fixedFile: File; updatedReport: PreflightReport }> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const fileName = fileNameOverride || (source instanceof File ? source.name : 'submission.pdf');
    let fixedBytes: Uint8Array = new Uint8Array(arrayBuffer);

    if (ruleId === 'max_file_size') {
      const targetKb = Math.floor((profile.maxSizeBytes || 200 * 1024) / 1024);
      const tempFile = new File([arrayBuffer as any], fileName, { type: 'application/pdf' });
      const compressResult = await this.pdfService.compressPdfToExactKB(tempFile, {
        targetKB: targetKb
      });
      if (compressResult && compressResult.file) {
        fixedBytes = new Uint8Array(await compressResult.file.arrayBuffer());
      }
    } else if (ruleId === 'page_size_uniformity') {
      const normResult = await this.layoutService.exportNormalized(
        arrayBuffer as any,
        { target: 'A4', orientation: 'portrait', scale: 1, centre: true, shrinkOnly: false },
        fileName
      );
      if (normResult && normResult.blob) {
        fixedBytes = new Uint8Array(await normResult.blob.arrayBuffer());
      }
    } else if (ruleId === 'orientation_uniformity') {
      const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pages = doc.getPages();
      for (const p of pages) {
        const { width, height } = p.getSize();
        if (width > height) {
          p.setRotation(degrees(90));
        }
      }
      fixedBytes = await doc.save();
    } else if (ruleId === 'no_javascript' || ruleId === 'no_attachments') {
      const sanitizeResult = await this.privacyService.sanitizePdf(arrayBuffer, {
        removeMetadata: false,
        removeComments: false,
        removeAttachments: true,
        removeForms: false,
        removeScripts: true,
        removeHiddenContent: false
      });
      if (sanitizeResult && sanitizeResult.sanitizedBlob) {
        fixedBytes = new Uint8Array(await sanitizeResult.sanitizedBlob.arrayBuffer());
      }
    } else if (ruleId === 'no_blank_pages') {
      const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pages = doc.getPages();
      const indicesToKeep: number[] = [];
      for (let i = 0; i < pages.length; i++) {
        const contents = pages[i].node.get(PDFName.of('Contents'));
        if (contents) {
          indicesToKeep.push(i);
        }
      }
      if (indicesToKeep.length > 0 && indicesToKeep.length < pages.length) {
        const newDoc = await PDFDocument.create();
        const copied = await newDoc.copyPages(doc, indicesToKeep);
        for (const cp of copied) newDoc.addPage(cp);
        fixedBytes = await newDoc.save();
      }
    }

    const fixedFile = new File([fixedBytes as any], fileName, { type: 'application/pdf' });
    const updatedReport = await this.runPreflight(fixedFile, profile, fileName);

    return { fixedFile, updatedReport };
  }

  // --- Profile Storage & JSON Export / Import ---

  getDefaultProfiles(): PreflightProfile[] {
    return DEFAULT_PREFLIGHT_PROFILES;
  }

  async getSavedProfiles(): Promise<PreflightProfile[]> {
    try {
      const res = await Preferences.get({ key: PREFLIGHT_PROFILES_KEY });
      if (!res.value) return this.getDefaultProfiles();
      const custom: PreflightProfile[] = JSON.parse(res.value);
      // Merge defaults with saved custom profiles
      const ids = new Set(custom.map(c => c.id));
      const defaults = this.getDefaultProfiles().filter(d => !ids.has(d.id));
      return [...defaults, ...custom];
    } catch {
      return this.getDefaultProfiles();
    }
  }

  async saveProfile(profile: PreflightProfile): Promise<void> {
    const list = await this.getSavedProfiles();
    const filtered = list.filter(p => p.id !== profile.id);
    filtered.push(profile);
    await Preferences.set({
      key: PREFLIGHT_PROFILES_KEY,
      value: JSON.stringify(filtered)
    });
  }

  exportProfileAsJson(profile: PreflightProfile): string {
    return JSON.stringify(profile, null, 2);
  }

  importProfileFromJson(jsonStr: string): PreflightProfile {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
    if (!parsed.name) throw new Error('Profile must have a name');
    return {
      ...parsed,
      id: parsed.id || `prof_custom_${Date.now()}`
    };
  }

  async saveFixedPdf(file: File): Promise<string | undefined> {
    return await this.storage.saveFile(file, 'preflight_fixed');
  }
}
