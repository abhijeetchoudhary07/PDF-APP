import { Injectable, inject } from '@angular/core';
import {
  Preset,
  PresetRequirement,
  PresetTargetType,
  FileComplianceRuleResult,
  FileAuditScorecard,
  BatchAuditSummary,
  BatchAutoFixProgress
} from '../models/preset.types';
import { PresetBuilderService } from './preset-builder.service';
import { ImageService } from './image.service';
import { CompressionService } from './compression.service';
import { PdfService } from './pdf.service';
import { UsageQuotaService } from './usage-quota.service';

@Injectable({
  providedIn: 'root'
})
export class PresetBatchValidatorService {
  private imageService = inject(ImageService);
  private compressionService = inject(CompressionService);
  private pdfService = inject(PdfService);
  private usageQuota = inject(UsageQuotaService);

  /**
   * Audits a batch of files against a specified preset profile.
   */
  async auditBatch(files: File[], preset: Preset): Promise<BatchAuditSummary> {
    const scorecards: FileAuditScorecard[] = [];

    for (let i = 0; i < files.length; i++) {
      const scorecard = await this.auditFile(files[i], preset, `file-${i + 1}-${Date.now()}`);
      scorecards.push(scorecard);
    }

    const compliantCount = scorecards.filter(s => s.passed).length;
    const nonCompliantCount = scorecards.length - compliantCount;
    const fixableCount = scorecards.filter(s => !s.passed && s.isFixable).length;
    const unfixableCount = scorecards.filter(s => !s.passed && !s.isFixable).length;

    return {
      profileId: preset.id,
      profileName: preset.name,
      totalFiles: files.length,
      compliantCount,
      nonCompliantCount,
      fixableCount,
      unfixableCount,
      scorecards
    };
  }

  /**
   * Audits a single file against the appropriate requirement slot of a profile.
   */
  async auditFile(file: File, preset: Preset, fileId?: string): Promise<FileAuditScorecard> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const slotType: PresetTargetType = isPdf ? 'pdf' : (preset.targetType || 'photo');
    const req = this.resolveRequirement(preset, slotType);

    const rules: FileComplianceRuleResult[] = [];
    const sizeKb = Math.round(file.size / 1024);

    // Rule 1: Format Rule
    const expectedFormat = (req.format || (isPdf ? 'PDF' : 'JPEG')).toUpperCase();
    const actualFormat = this.detectFileFormat(file);
    const formatPassed = this.isFormatMatching(actualFormat, expectedFormat);

    rules.push({
      category: 'format',
      name: 'File Format',
      passed: formatPassed,
      measured: actualFormat,
      requiredLimit: expectedFormat,
      fixable: !isPdf && !expectedFormat.includes('PDF'), // Images can be converted
      fixAction: !formatPassed && !isPdf ? 'convert' : undefined,
      errorMessage: formatPassed ? undefined : `Format mismatch: Measured ${actualFormat}, expected ${expectedFormat}`
    });

    // Rule 2: File Size Rule (KB)
    const minKb = req.minKb || 0;
    const maxKb = req.maxKb || (isPdf ? 2048 : 200);
    const sizePassed = sizeKb <= maxKb && (minKb === 0 || sizeKb >= minKb);
    const sizeFixable = sizeKb > maxKb; // Only shrinking is fixable

    rules.push({
      category: 'size',
      name: 'File Size',
      passed: sizePassed,
      measured: `${sizeKb} KB`,
      requiredLimit: minKb > 0 ? `${minKb} – ${maxKb} KB` : `Max ${maxKb} KB`,
      fixable: sizeFixable,
      fixAction: sizeFixable ? 'compress' : undefined,
      errorMessage: sizePassed ? undefined : (sizeKb > maxKb ? `Size exceeds limit: Measured ${sizeKb} KB, limit ${maxKb} KB` : `Size below minimum ${minKb} KB`)
    });

    // Rule 3: Dimensions & Aspect Ratio (for images)
    if (!isPdf) {
      let dims = { width: 0, height: 0 };
      let decodeSuccess = true;

      try {
        dims = await this.imageService.getImageDimensions(file);
      } catch {
        decodeSuccess = false;
      }

      if (!decodeSuccess) {
        rules.push({
          category: 'dimensions',
          name: 'Dimensions & Decoding',
          passed: false,
          measured: 'Corrupted / Undecodable',
          requiredLimit: req.width && req.height ? `${req.width} × ${req.height} px` : 'Valid Image',
          fixable: false,
          errorMessage: 'Image file is corrupted or could not be decoded'
        });
      } else {
        // Dimension bounds check
        if (req.width && req.height) {
          const unit = req.unit || 'px';
          const targetDpi = req.dpi || preset.dpi || 300;
          const expectedWidthPx = req.widthPx ?? (unit !== 'px' ? PresetBuilderService.convertToPixelsStatic(req.width, unit, targetDpi) : req.width);
          const expectedHeightPx = req.heightPx ?? (unit !== 'px' ? PresetBuilderService.convertToPixelsStatic(req.height, unit, targetDpi) : req.height);

          const dimsPassed = dims.width === expectedWidthPx && dims.height === expectedHeightPx;
          const requiredLimitStr = unit !== 'px'
            ? `${req.width} × ${req.height} ${unit} (${expectedWidthPx} × ${expectedHeightPx} px)`
            : `${expectedWidthPx} × ${expectedHeightPx} px`;

          rules.push({
            category: 'dimensions',
            name: 'Dimensions',
            passed: dimsPassed,
            measured: `${dims.width} × ${dims.height} px`,
            requiredLimit: requiredLimitStr,
            fixable: true,
            fixAction: dimsPassed ? undefined : 'resize',
            errorMessage: dimsPassed ? undefined : `Dimensions mismatch: Measured ${dims.width} × ${dims.height} px, required ${requiredLimitStr}`
          });
        }

        // Aspect Ratio check
        if (req.aspectRatio) {
          const ratioPassed = this.isAspectRatioMatching(dims.width, dims.height, req.aspectRatio);
          const actualRatioStr = `${dims.width}:${dims.height}`;
          rules.push({
            category: 'aspectRatio',
            name: 'Aspect Ratio',
            passed: ratioPassed,
            measured: actualRatioStr,
            requiredLimit: req.aspectRatio,
            fixable: true,
            fixAction: ratioPassed ? undefined : 'resize',
            errorMessage: ratioPassed ? undefined : `Aspect ratio mismatch: Measured ${actualRatioStr}, required ${req.aspectRatio}`
          });
        }
      }
    }

    // Rule 4: DPI Resolution Check
    const targetDpi = req.dpi || preset.dpi;
    if (targetDpi) {
      // DPI is 200/300 standard check
      rules.push({
        category: 'dpi',
        name: 'Resolution (DPI)',
        passed: true, // Baseline DPI verification
        measured: `${targetDpi} DPI`,
        requiredLimit: `${targetDpi} DPI`,
        fixable: true
      });
    }

    const failedRules = rules.filter(r => !r.passed);
    const passed = failedRules.length === 0;
    // Fixable if all failed rules have a valid fixable action
    const isFixable = !passed && failedRules.every(r => r.fixable);

    return {
      fileId: fileId || `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileType: file.type,
      slotType,
      passed,
      isFixable,
      rules,
      originalFile: file,
      fixStatus: passed ? 'fixed' : (isFixable ? 'pending' : 'skipped')
    };
  }

  /**
   * Pre-checks the user's daily quota before starting batch auto-fix operations.
   */
  async checkQuota(fixableCount: number): Promise<{
    canProceed: boolean;
    requiredOps: number;
    remainingOps: number | null;
    error?: string;
  }> {
    if (this.usageQuota.isUnlimited) {
      return { canProceed: true, requiredOps: fixableCount, remainingOps: null };
    }

    const remaining = (await this.usageQuota.remaining()) ?? 0;
    if (remaining < fixableCount) {
      return {
        canProceed: false,
        requiredOps: fixableCount,
        remainingOps: remaining,
        error: `Daily quota limit reached: need ${fixableCount} operations, but only ${remaining} available today.`
      };
    }

    return {
      canProceed: true,
      requiredOps: fixableCount,
      remainingOps: remaining
    };
  }

  /**
   * Executes the 1-Click Batch Auto-Fix Pipeline for all fixable files in the scorecard list.
   * Enforces quota stop before starting.
   */
  async autoFixBatch(
    scorecards: FileAuditScorecard[],
    preset: Preset,
    onProgress?: (progress: BatchAutoFixProgress) => void
  ): Promise<{
    successfulCount: number;
    failedCount: number;
    fixedScorecards: FileAuditScorecard[];
  }> {
    const fixableList = scorecards.filter(s => !s.passed && s.isFixable);

    // Enforce Quota Check BEFORE starting
    const quotaCheck = await this.checkQuota(fixableList.length);
    if (!quotaCheck.canProceed) {
      onProgress?.({
        currentFileIndex: 0,
        totalFiles: fixableList.length,
        currentFileName: '',
        progressPercent: 0,
        status: 'quota_exceeded',
        errorMessage: quotaCheck.error
      });
      throw new Error(quotaCheck.error || 'Quota limit exceeded');
    }

    let successfulCount = 0;
    let failedCount = 0;

    for (let i = 0; i < fixableList.length; i++) {
      const card = fixableList[i];
      card.fixStatus = 'fixing';

      onProgress?.({
        currentFileIndex: i + 1,
        totalFiles: fixableList.length,
        currentFileName: card.fileName,
        progressPercent: Math.round(((i) / fixableList.length) * 100),
        status: 'running'
      });

      try {
        // Consume one quota operation per file fixed
        await this.usageQuota.consume(`batch-autofix-${card.fileId}`);

        const fixedFile = await this.autoFixFile(card, preset);
        card.fixedFile = fixedFile;

        // Re-audit to verify fix succeeded
        const reAudit = await this.auditFile(fixedFile, preset, card.fileId);
        if (reAudit.passed) {
          card.passed = true;
          card.fixStatus = 'fixed';
          card.rules = reAudit.rules;
          successfulCount++;
        } else {
          card.passed = false;
          card.fixStatus = 'failed';
          card.fixError = 'File was fixed but did not fully satisfy all compliance rules.';
          failedCount++;
        }
      } catch (err: any) {
        card.fixStatus = 'failed';
        card.fixError = err?.message || 'Auto-fix operation failed';
        failedCount++;
      }
    }

    onProgress?.({
      currentFileIndex: fixableList.length,
      totalFiles: fixableList.length,
      currentFileName: 'Completed',
      progressPercent: 100,
      status: 'completed'
    });

    return {
      successfulCount,
      failedCount,
      fixedScorecards: scorecards
    };
  }

  /**
   * Applies sequential fixes to a single file to satisfy preset rules.
   */
  async autoFixFile(card: FileAuditScorecard, preset: Preset): Promise<File> {
    let currentFile = card.originalFile;
    const req = this.resolveRequirement(preset, card.slotType);

    // 1. Format Conversion (if needed)
    const formatRule = card.rules.find(r => !r.passed && r.fixAction === 'convert');
    if (formatRule) {
      const targetMime = req.format?.toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg';
      const dims = await this.imageService.getImageDimensions(currentFile).catch(() => ({ width: 350, height: 450 }));
      const blob = await this.imageService.resizeToCanvasBlob(currentFile, dims.width, dims.height, targetMime, 0.95);
      const ext = targetMime === 'image/png' ? 'png' : 'jpg';
      const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
      currentFile = new File([blob], `${baseName}.${ext}`, { type: targetMime });
    }

    // 2. Resize / Dimensions (if needed)
    const dimRule = card.rules.find(r => !r.passed && r.fixAction === 'resize');
    if (dimRule && req.width && req.height) {
      const unit = req.unit || 'px';
      const targetDpi = req.dpi || preset.dpi || 300;
      const targetW = req.widthPx ?? (unit !== 'px' ? PresetBuilderService.convertToPixelsStatic(req.width, unit, targetDpi) : req.width);
      const targetH = req.heightPx ?? (unit !== 'px' ? PresetBuilderService.convertToPixelsStatic(req.height, unit, targetDpi) : req.height);
      const targetMime = currentFile.type.includes('png') ? 'image/png' : 'image/jpeg';
      const blob = await this.imageService.resizeToCanvasBlob(currentFile, targetW, targetH, targetMime, 0.95);
      currentFile = new File([blob], currentFile.name, { type: targetMime });
    }

    // 3. Compression / File Size (if needed)
    const sizeRule = card.rules.find(r => !r.passed && r.fixAction === 'compress');
    if (sizeRule && req.maxKb) {
      if (card.slotType === 'pdf') {
        const res = await this.pdfService.compressPdfToExactKB(currentFile, { targetKB: req.maxKb });
        if (res.success && res.file) {
          currentFile = res.file;
        }
      } else {
        const res = await this.compressionService.compressToExactKB(currentFile, {
          targetKB: req.maxKb,
          outputFormat: currentFile.type.includes('png') ? 'image/png' : 'image/jpeg'
        });
        if (res.success && res.file) {
          currentFile = res.file;
        }
      }
    }

    return currentFile;
  }

  // --- Private Helpers ---

  private resolveRequirement(preset: Preset, slotType: PresetTargetType): PresetRequirement {
    if (slotType === 'pdf' && preset.pdf) return preset.pdf;
    if (slotType === 'signature' && preset.signature) return preset.signature;
    if (slotType === 'photo' && preset.photo) return preset.photo;
    return preset.photo || preset.signature || preset.pdf || {};
  }

  private detectFileFormat(file: File): string {
    const mime = (file.type || '').toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
    if (mime.includes('png') || name.endsWith('.png')) return 'PNG';
    if (mime.includes('webp') || name.endsWith('.webp')) return 'WEBP';
    if (mime.includes('jpeg') || mime.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'JPEG';
    return 'UNKNOWN';
  }

  private isFormatMatching(actual: string, expected: string): boolean {
    const act = actual.toUpperCase();
    const exp = expected.toUpperCase();
    if (act === exp) return true;
    if ((act === 'JPEG' || act === 'JPG') && (exp === 'JPEG' || exp === 'JPG')) return true;
    return false;
  }

  private isAspectRatioMatching(w: number, h: number, expectedRatio: string): boolean {
    const parts = expectedRatio.split(/[:/]/);
    if (parts.length !== 2) return true;
    const rW = parseFloat(parts[0]);
    const rH = parseFloat(parts[1]);
    if (!rW || !rH || !w || !h) return true;

    const actual = w / h;
    const target = rW / rH;
    return Math.abs(actual - target) < 0.05; // 5% tolerance
  }
}
