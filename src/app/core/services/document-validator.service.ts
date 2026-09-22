import { Injectable } from '@angular/core';
import exifr from 'exifr';
import { PresetService, Preset, PresetRequirement } from './preset.service';
import { ImageService } from './image.service';
import { CompressionService } from './compression.service';
import { PdfService } from './pdf.service';
import { SignatureProcessingService } from './signature-processing.service';
import {
  DocumentSlotType,
  ValidationRule,
  DocumentValidationResult,
  ValidationReport
} from '../models/document-validator.models';

@Injectable({
  providedIn: 'root'
})
export class DocumentValidatorService {
  constructor(
    private presetService: PresetService,
    private imageService: ImageService,
    private compressionService: CompressionService,
    private pdfService: PdfService,
    private signatureProcessingService: SignatureProcessingService
  ) {}

  /**
   * Validates a single document against a preset requirement slot.
   */
  async validateDocument(
    file: File,
    slotType: DocumentSlotType,
    requirement: PresetRequirement
  ): Promise<DocumentValidationResult> {
    const rules: ValidationRule[] = [];
    const sizeKb = Math.round(file.size / 1024);

    if (slotType === 'photo') {
      return await this.validatePhoto(file, requirement, sizeKb);
    } else if (slotType === 'signature') {
      return await this.validateSignature(file, requirement, sizeKb);
    } else {
      return await this.validatePdf(file, requirement, sizeKb);
    }
  }

  private async validatePhoto(
    file: File,
    req: PresetRequirement,
    sizeKb: number
  ): Promise<DocumentValidationResult> {
    const rules: ValidationRule[] = [];
    let dims = { width: 0, height: 0 };

    try {
      dims = await this.imageService.getImageDimensions(file);
    } catch {
      // Invalid image
      rules.push({
        id: 'photo_corrupt',
        name: 'File Integrity',
        description: 'Image file could not be decoded',
        severity: 'error',
        actualValue: 'Corrupted / Invalid',
        expectedValue: 'Valid image',
        passed: false
      });

      return {
        slotType: 'photo',
        file,
        rules,
        passed: false,
        errorsCount: 1,
        warningsCount: 0,
        metadata: { fileSizeKb: sizeKb, format: file.type }
      };
    }

    // 1. Format Rule
    const expectedFormat = (req.format || 'JPEG').toUpperCase();
    const actualFormat: string = file.type.includes('png')
      ? 'PNG'
      : file.type.includes('webp')
      ? 'WEBP'
      : 'JPEG';

    const formatPassed = actualFormat === expectedFormat || (expectedFormat === 'JPEG' && (actualFormat === 'JPEG' || actualFormat === 'JPG'));
    rules.push({
      id: 'photo_format',
      name: 'Image Format',
      description: `Format must be ${expectedFormat}`,
      severity: 'error',
      actualValue: actualFormat,
      expectedValue: expectedFormat,
      passed: formatPassed,
      suggestedFix: formatPassed ? undefined : `Convert format to ${expectedFormat}`,
      fixAction: formatPassed ? undefined : 'convert',
      fixParams: { format: expectedFormat === 'PNG' ? 'image/png' : 'image/jpeg' }
    });

    // 2. File Size Rules (Min & Max KB)
    const minKb = req.minKb || 1;
    const maxKb = req.maxKb || 500;
    const sizePassed = sizeKb >= minKb && sizeKb <= maxKb;

    rules.push({
      id: 'photo_size',
      name: 'File Size',
      description: `File size must be between ${minKb} KB and ${maxKb} KB`,
      severity: 'error',
      actualValue: `${sizeKb} KB`,
      expectedValue: `${minKb} – ${maxKb} KB`,
      passed: sizePassed,
      suggestedFix: sizeKb > maxKb ? `Compress file to ${maxKb} KB` : sizeKb < minKb ? `Increase image quality or resolution to meet ${minKb} KB minimum` : undefined,
      fixAction: sizeKb > maxKb ? 'compress' : undefined,
      fixParams: { targetKB: maxKb }
    });

    // 3. Dimension Rules (Width & Height)
    if (req.width && req.height) {
      const dimsPassed = dims.width === req.width && dims.height === req.height;
      rules.push({
        id: 'photo_dimensions',
        name: 'Pixel Dimensions',
        description: `Dimensions must be exactly ${req.width} × ${req.height} px`,
        severity: 'error',
        actualValue: `${dims.width} × ${dims.height} px`,
        expectedValue: `${req.width} × ${req.height} px`,
        passed: dimsPassed,
        suggestedFix: dimsPassed ? undefined : `Resize to ${req.width} × ${req.height} px`,
        fixAction: dimsPassed ? undefined : 'resize',
        fixParams: { width: req.width, height: req.height }
      });
    }

    // 4. Aspect Ratio Rule
    let actualRatioStr = `${dims.width}:${dims.height}`;
    if (req.aspectRatio) {
      const [ew, eh] = req.aspectRatio.split(':').map(Number);
      if (ew && eh) {
        const expectedRatio = ew / eh;
        const actualRatio = dims.width / dims.height;
        const ratioPassed = Math.abs(expectedRatio - actualRatio) < 0.08;

        rules.push({
          id: 'photo_aspect_ratio',
          name: 'Aspect Ratio',
          description: `Aspect ratio should match ${req.aspectRatio}`,
          severity: 'warning',
          actualValue: `${(actualRatio).toFixed(2)}:1`,
          expectedValue: req.aspectRatio,
          passed: ratioPassed,
          suggestedFix: ratioPassed ? undefined : `Crop to ${req.aspectRatio} aspect ratio`,
          fixAction: ratioPassed ? undefined : 'crop',
          fixParams: { aspectRatio: req.aspectRatio, width: req.width, height: req.height }
        });
      }
    }

    // 5. DPI Resolution Rule (via exifr)
    let dpi: number | undefined;
    try {
      const exif = await exifr.parse(file, ['XResolution', 'YResolution', 'ResolutionUnit']);
      if (exif && exif.XResolution) {
        dpi = Math.round(exif.XResolution);
      }
    } catch {
      // DPI not present in metadata
    }

    if (req.backgroundGuidance?.toLowerCase().includes('dpi')) {
      const expectedDpi = 200; // standard portal DPI
      const dpiPassed = dpi ? dpi >= expectedDpi : true; // lenient if stripped
      rules.push({
        id: 'photo_dpi',
        name: 'DPI Resolution',
        description: 'Resolution recommended 200 DPI or higher',
        severity: 'info',
        actualValue: dpi ? `${dpi} DPI` : '72 DPI (Standard screen)',
        expectedValue: `${expectedDpi} DPI`,
        passed: dpiPassed
      });
    }

    // 6. Background Guidance Rule
    if (req.backgroundGuidance) {
      const bgCheck = await this.checkImageBackgroundLightness(file);
      rules.push({
        id: 'photo_background',
        name: 'Background Guidance',
        description: req.backgroundGuidance,
        severity: 'warning',
        actualValue: bgCheck.isLight ? 'Light / White' : 'Non-white / Dark border detected',
        expectedValue: 'Plain light or white background',
        passed: bgCheck.isLight,
        suggestedFix: bgCheck.isLight ? undefined : 'Ensure photo has a clean white or light background without borders.'
      });
    }

    const errorsCount = rules.filter(r => !r.passed && r.severity === 'error').length;
    const warningsCount = rules.filter(r => !r.passed && r.severity === 'warning').length;

    return {
      slotType: 'photo',
      file,
      rules,
      passed: errorsCount === 0,
      errorsCount,
      warningsCount,
      metadata: {
        fileSizeKb: sizeKb,
        dimensions: dims,
        aspectRatio: actualRatioStr,
        format: actualFormat,
        dpi
      }
    };
  }

  private async validateSignature(
    file: File,
    req: PresetRequirement,
    sizeKb: number
  ): Promise<DocumentValidationResult> {
    const rules: ValidationRule[] = [];
    let dims = { width: 0, height: 0 };

    try {
      dims = await this.imageService.getImageDimensions(file);
    } catch {
      rules.push({
        id: 'sig_corrupt',
        name: 'File Integrity',
        description: 'Signature image could not be decoded',
        severity: 'error',
        actualValue: 'Corrupted / Invalid',
        expectedValue: 'Valid image',
        passed: false
      });

      return {
        slotType: 'signature',
        file,
        rules,
        passed: false,
        errorsCount: 1,
        warningsCount: 0,
        metadata: { fileSizeKb: sizeKb, format: file.type }
      };
    }

    // 1. Format Rule
    const expectedFormat = (req.format || 'JPEG').toUpperCase();
    const actualFormat = file.type.includes('png') ? 'PNG' : 'JPEG';
    const formatPassed = actualFormat === expectedFormat;

    rules.push({
      id: 'sig_format',
      name: 'Format',
      description: `Format must be ${expectedFormat}`,
      severity: 'error',
      actualValue: actualFormat,
      expectedValue: expectedFormat,
      passed: formatPassed,
      suggestedFix: formatPassed ? undefined : `Convert to ${expectedFormat}`,
      fixAction: formatPassed ? undefined : 'convert',
      fixParams: { format: expectedFormat === 'PNG' ? 'image/png' : 'image/jpeg' }
    });

    // 2. File Size Rules
    const minKb = req.minKb || 5;
    const maxKb = req.maxKb || 50;
    const sizePassed = sizeKb >= minKb && sizeKb <= maxKb;

    rules.push({
      id: 'sig_size',
      name: 'File Size',
      description: `Signature file size must be ${minKb} – ${maxKb} KB`,
      severity: 'error',
      actualValue: `${sizeKb} KB`,
      expectedValue: `${minKb} – ${maxKb} KB`,
      passed: sizePassed,
      suggestedFix: sizeKb > maxKb ? `Compress signature to ${maxKb} KB` : undefined,
      fixAction: sizeKb > maxKb ? 'compress' : undefined,
      fixParams: { targetKB: maxKb }
    });

    // 3. Dimension Rules
    if (req.width && req.height) {
      const dimsPassed = dims.width === req.width && dims.height === req.height;
      rules.push({
        id: 'sig_dimensions',
        name: 'Pixel Dimensions',
        description: `Dimensions must be ${req.width} × ${req.height} px`,
        severity: 'error',
        actualValue: `${dims.width} × ${dims.height} px`,
        expectedValue: `${req.width} × ${req.height} px`,
        passed: dimsPassed,
        suggestedFix: dimsPassed ? undefined : `Resize to ${req.width} × ${req.height} px`,
        fixAction: dimsPassed ? undefined : 'resize',
        fixParams: { width: req.width, height: req.height }
      });
    }

    // 4. Background Cleanliness Rule
    const bgCheck = await this.checkImageBackgroundLightness(file);
    rules.push({
      id: 'sig_background',
      name: 'Background Cleanliness',
      description: 'Signature should be on clean white paper with high contrast',
      severity: 'warning',
      actualValue: bgCheck.isLight ? 'Clean / White paper' : 'Gray / Dark shadow detected',
      expectedValue: 'Clean white background',
      passed: bgCheck.isLight,
      suggestedFix: bgCheck.isLight ? undefined : 'Clean background and boost ink contrast',
      fixAction: bgCheck.isLight ? undefined : 'clean_signature'
    });

    const errorsCount = rules.filter(r => !r.passed && r.severity === 'error').length;
    const warningsCount = rules.filter(r => !r.passed && r.severity === 'warning').length;

    return {
      slotType: 'signature',
      file,
      rules,
      passed: errorsCount === 0,
      errorsCount,
      warningsCount,
      metadata: {
        fileSizeKb: sizeKb,
        dimensions: dims,
        format: actualFormat
      }
    };
  }

  private async validatePdf(
    file: File,
    req: PresetRequirement,
    sizeKb: number
  ): Promise<DocumentValidationResult> {
    const rules: ValidationRule[] = [];
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    // 1. Format Rule
    rules.push({
      id: 'pdf_format',
      name: 'PDF Format',
      description: 'File must be a valid PDF document',
      severity: 'error',
      actualValue: isPdf ? 'PDF' : file.type || 'Unknown',
      expectedValue: 'PDF',
      passed: isPdf
    });

    // 2. File Size Rules
    const minKb = req.minKb || 10;
    const maxKb = req.maxKb || 2048;
    const sizePassed = sizeKb >= minKb && sizeKb <= maxKb;

    rules.push({
      id: 'pdf_size',
      name: 'PDF File Size',
      description: `PDF size must be ${minKb} – ${maxKb} KB`,
      severity: 'error',
      actualValue: `${sizeKb} KB`,
      expectedValue: `${minKb} – ${maxKb} KB`,
      passed: sizePassed,
      suggestedFix: sizeKb > maxKb ? `Compress PDF to ${maxKb} KB` : undefined,
      fixAction: sizeKb > maxKb ? 'compress' : undefined,
      fixParams: { targetKB: maxKb }
    });

    // 3. Page Count Rule
    let pageCount = 0;
    if (isPdf) {
      try {
        pageCount = await this.pdfService.getPdfPageCount(file);
        rules.push({
          id: 'pdf_pages',
          name: 'Page Count',
          description: 'Document pages verification',
          severity: 'info',
          actualValue: `${pageCount} page${pageCount > 1 ? 's' : ''}`,
          expectedValue: 'Valid document pages',
          passed: pageCount > 0
        });
      } catch {
        rules.push({
          id: 'pdf_corrupt',
          name: 'PDF Integrity',
          description: 'PDF structure verification',
          severity: 'error',
          actualValue: 'Cannot read PDF structure',
          expectedValue: 'Readable PDF document',
          passed: false
        });
      }
    }

    const errorsCount = rules.filter(r => !r.passed && r.severity === 'error').length;
    const warningsCount = rules.filter(r => !r.passed && r.severity === 'warning').length;

    return {
      slotType: 'pdf',
      file,
      rules,
      passed: errorsCount === 0,
      errorsCount,
      warningsCount,
      metadata: {
        fileSizeKb: sizeKb,
        format: 'PDF',
        pageCount
      }
    };
  }

  /**
   * Samples border pixels to check if background is clean and white/light.
   */
  private async checkImageBackgroundLightness(file: File): Promise<{ isLight: boolean; avgLum: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      let timer: any;
      let resolved = false;

      const finish = (result: { isLight: boolean; avgLum: number }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { URL.revokeObjectURL(url); } catch {}
        resolve(result);
      };

      timer = setTimeout(() => {
        finish({ isLight: true, avgLum: 255 });
      }, 200);

      let url = '';
      try {
        url = URL.createObjectURL(file);
      } catch {
        return finish({ isLight: true, avgLum: 255 });
      }

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(200, img.width || 100);
          canvas.height = Math.min(200, img.height || 100);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return finish({ isLight: true, avgLum: 255 });
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          let totalLum = 0;
          let count = 0;
          const w = canvas.width;
          const h = canvas.height;

          for (let x = 0; x < w; x += 5) {
            let idx = x * 4;
            totalLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            idx = ((h - 1) * w + x) * 4;
            totalLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            count += 2;
          }

          const avgLum = count > 0 ? totalLum / count : 255;
          finish({ isLight: avgLum >= 170, avgLum });
        } catch {
          finish({ isLight: true, avgLum: 255 });
        }
      };

      img.onerror = () => {
        finish({ isLight: true, avgLum: 255 });
      };

      img.src = url;
    });
  }

  /**
   * Automatically fixes a failed rule using the appropriate existing service.
   */
  async autoFixRule(
    file: File,
    rule: ValidationRule,
    slotType: DocumentSlotType,
    preset: Preset
  ): Promise<File> {
    const action = rule.fixAction;
    const params = rule.fixParams || {};

    if (action === 'compress') {
      if (slotType === 'pdf') {
        const targetKB = (params['targetKB'] as number) || preset.pdf?.maxKb || 500;
        const res = await this.pdfService.compressPdfToExactKB(file, { targetKB });
        if (res.success && res.file) return res.file;
      } else {
        const targetKB = (params['targetKB'] as number) || (slotType === 'photo' ? preset.photo?.maxKb : preset.signature?.maxKb) || 50;
        const res = await this.compressionService.compressToExactKB(file, {
          targetKB,
          outputFormat: file.type.includes('png') ? 'image/png' : 'image/jpeg'
        });
        if (res.success && res.file) return res.file;
      }
    } else if (action === 'resize') {
      const targetW = (params['width'] as number) || (slotType === 'photo' ? preset.photo?.width : preset.signature?.width) || 350;
      const targetH = (params['height'] as number) || (slotType === 'photo' ? preset.photo?.height : preset.signature?.height) || 450;
      const outputFormat = file.type.includes('png') ? 'image/png' : 'image/jpeg';
      const blob = await this.imageService.resizeToCanvasBlob(file, targetW, targetH, outputFormat, 0.95);
      return new File([blob], file.name, { type: outputFormat });
    } else if (action === 'convert') {
      const targetFormat = (params['format'] as string) || 'image/jpeg';
      const dims = await this.imageService.getImageDimensions(file);
      const blob = await this.imageService.resizeToCanvasBlob(file, dims.width, dims.height, targetFormat, 0.95);
      const ext = targetFormat === 'image/png' ? 'png' : 'jpg';
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return new File([blob], `${baseName}.${ext}`, { type: targetFormat });
    } else if (action === 'clean_signature') {
      return await this.signatureProcessingService.processSignature(file, {
        grayscale: true,
        contrast: 50,
        threshold: 200
      });
    }

    return file;
  }

  /**
   * Fixes all actionable failures for a document slot in sequence, returning the updated file.
   */
  async autoFixAllIssues(
    file: File,
    result: DocumentValidationResult,
    preset: Preset
  ): Promise<File> {
    let currentFile = file;

    // Order of operations: convert -> resize -> clean_signature -> compress
    const order: Array<NonNullable<ValidationRule['fixAction']>> = ['convert', 'resize', 'clean_signature', 'compress'];

    for (const act of order) {
      const matchingRule = result.rules.find(r => !r.passed && r.fixAction === act);
      if (matchingRule) {
        currentFile = await this.autoFixRule(currentFile, matchingRule, result.slotType, preset);
      }
    }

    return currentFile;
  }
}
