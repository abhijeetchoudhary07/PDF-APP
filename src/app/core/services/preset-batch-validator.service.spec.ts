import { TestBed } from '@angular/core/testing';
import { PresetBatchValidatorService } from './preset-batch-validator.service';
import { ImageService } from './image.service';
import { CompressionService } from './compression.service';
import { PdfService } from './pdf.service';
import { UsageQuotaService } from './usage-quota.service';
import { Preset, PresetRequirement } from '../models/preset.types';

describe('PresetBatchValidatorService', () => {
  let service: PresetBatchValidatorService;
  let mockImageService: any;
  let mockCompressionService: any;
  let mockPdfService: any;
  let mockUsageQuotaService: any;

  const testPreset: Preset = {
    id: 'test-preset-1',
    name: 'Photo 35x45mm 50KB',
    category: 'custom',
    targetType: 'photo',
    photo: {
      maxKb: 50,
      minKb: 20,
      width: 350,
      height: 450,
      aspectRatio: '7:9',
      format: 'JPEG',
      dpi: 200
    },
    pdf: {
      maxKb: 200,
      minKb: 10,
      format: 'PDF'
    }
  };

  beforeEach(() => {
    mockImageService = {
      getImageDimensions: vi.fn().mockResolvedValue({ width: 350, height: 450 }),
      resizeToCanvasBlob: vi.fn().mockImplementation((file, w, h, format) => {
        return Promise.resolve(new Blob([new Uint8Array(25 * 1024)], { type: format }));
      })
    };

    mockCompressionService = {
      compressToExactKB: vi.fn().mockImplementation((file, config) => {
        const compressedFile = new File([new Uint8Array(config.targetKB * 1024)], file.name, {
          type: config.outputFormat || file.type
        });
        return Promise.resolve({ success: true, file: compressedFile });
      })
    };

    mockPdfService = {
      compressPdfToExactKB: vi.fn().mockImplementation((file, config) => {
        const compressedFile = new File([new Uint8Array(config.targetKB * 1024)], file.name, {
          type: 'application/pdf'
        });
        return Promise.resolve({ success: true, file: compressedFile });
      })
    };

    mockUsageQuotaService = {
      isUnlimited: false,
      remaining: vi.fn().mockResolvedValue(5),
      consume: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        PresetBatchValidatorService,
        { provide: ImageService, useValue: mockImageService },
        { provide: CompressionService, useValue: mockCompressionService },
        { provide: PdfService, useValue: mockPdfService },
        { provide: UsageQuotaService, useValue: mockUsageQuotaService }
      ]
    });

    service = TestBed.inject(PresetBatchValidatorService);
  });

  describe('auditFile', () => {
    it('audits a compliant image file and passes all rules', async () => {
      // 30 KB JPEG with 350x450
      const file = new File([new Uint8Array(30 * 1024)], 'photo.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(true);
      expect(scorecard.isFixable).toBe(false);
      expect(scorecard.fixStatus).toBe('fixed');
      expect(scorecard.rules.every(r => r.passed)).toBe(true);
    });

    it('detects file size exceeding max limit and marks as fixable', async () => {
      // 80 KB JPEG (limit 50 KB)
      const file = new File([new Uint8Array(80 * 1024)], 'large_photo.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(false);
      expect(scorecard.isFixable).toBe(true);
      const sizeRule = scorecard.rules.find(r => r.category === 'size');
      expect(sizeRule?.passed).toBe(false);
      expect(sizeRule?.fixable).toBe(true);
      expect(sizeRule?.fixAction).toBe('compress');
      expect(sizeRule?.measured).toBe('80 KB');
    });

    it('detects file size below min limit and marks as unfixable', async () => {
      // 10 KB JPEG (min 20 KB)
      const file = new File([new Uint8Array(10 * 1024)], 'tiny_photo.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(false);
      expect(scorecard.isFixable).toBe(false);
      const sizeRule = scorecard.rules.find(r => r.category === 'size');
      expect(sizeRule?.passed).toBe(false);
      expect(sizeRule?.fixable).toBe(false);
    });

    it('detects dimension mismatch and marks as fixable via resize', async () => {
      // 30 KB JPEG with 600x800 px (required 350x450)
      const file = new File([new Uint8Array(30 * 1024)], 'wrong_dim.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 600, height: 800 });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(false);
      expect(scorecard.isFixable).toBe(true);
      const dimRule = scorecard.rules.find(r => r.category === 'dimensions');
      expect(dimRule?.passed).toBe(false);
      expect(dimRule?.fixAction).toBe('resize');
      expect(dimRule?.measured).toBe('600 × 800 px');
    });

    it('detects format mismatch and marks as fixable via convert', async () => {
      // PNG format when JPEG is required
      const file = new File([new Uint8Array(30 * 1024)], 'photo.png', { type: 'image/png' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(false);
      expect(scorecard.isFixable).toBe(true);
      const formatRule = scorecard.rules.find(r => r.category === 'format');
      expect(formatRule?.passed).toBe(false);
      expect(formatRule?.fixAction).toBe('convert');
      expect(formatRule?.measured).toBe('PNG');
    });

    it('marks corrupted / undecodable image as unfixable', async () => {
      const file = new File([new Uint8Array(30 * 1024)], 'corrupted.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockRejectedValue(new Error('Corrupted image'));

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.passed).toBe(false);
      expect(scorecard.isFixable).toBe(false);
      const dimRule = scorecard.rules.find(r => r.category === 'dimensions');
      expect(dimRule?.passed).toBe(false);
      expect(dimRule?.fixable).toBe(false);
      expect(dimRule?.errorMessage).toContain('corrupted');
    });

    it('audits a PDF file against PDF preset slot', async () => {
      // 100 KB PDF (limit 200 KB)
      const file = new File([new Uint8Array(100 * 1024)], 'document.pdf', { type: 'application/pdf' });

      const scorecard = await service.auditFile(file, testPreset);

      expect(scorecard.slotType).toBe('pdf');
      expect(scorecard.passed).toBe(true);
      const formatRule = scorecard.rules.find(r => r.category === 'format');
      expect(formatRule?.measured).toBe('PDF');
      expect(formatRule?.passed).toBe(true);
    });
  });

  describe('auditBatch', () => {
    it('produces an accurate summary and matrix for mixed batch of files', async () => {
      // File 1: Compliant (30 KB, 350x450 JPEG)
      const file1 = new File([new Uint8Array(30 * 1024)], 'compliant.jpg', { type: 'image/jpeg' });
      // File 2: Fixable (80 KB, 350x450 JPEG)
      const file2 = new File([new Uint8Array(80 * 1024)], 'too_large.jpg', { type: 'image/jpeg' });
      // File 3: Unfixable (10 KB < 20 KB min)
      const file3 = new File([new Uint8Array(10 * 1024)], 'too_small.jpg', { type: 'image/jpeg' });

      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const summary = await service.auditBatch([file1, file2, file3], testPreset);

      expect(summary.totalFiles).toBe(3);
      expect(summary.compliantCount).toBe(1);
      expect(summary.nonCompliantCount).toBe(2);
      expect(summary.fixableCount).toBe(1);
      expect(summary.unfixableCount).toBe(1);
      expect(summary.scorecards.length).toBe(3);
    });
  });

  describe('checkQuota', () => {
    it('allows unlimited quota users to proceed without limits', async () => {
      mockUsageQuotaService.isUnlimited = true;

      const result = await service.checkQuota(10);

      expect(result.canProceed).toBe(true);
      expect(result.remainingOps).toBeNull();
    });

    it('allows proceeding if remaining quota is sufficient', async () => {
      mockUsageQuotaService.isUnlimited = false;
      mockUsageQuotaService.remaining.mockResolvedValue(5);

      const result = await service.checkQuota(3);

      expect(result.canProceed).toBe(true);
      expect(result.requiredOps).toBe(3);
      expect(result.remainingOps).toBe(5);
    });

    it('blocks proceeding if remaining quota is insufficient', async () => {
      mockUsageQuotaService.isUnlimited = false;
      mockUsageQuotaService.remaining.mockResolvedValue(2);

      const result = await service.checkQuota(4);

      expect(result.canProceed).toBe(false);
      expect(result.requiredOps).toBe(4);
      expect(result.remainingOps).toBe(2);
      expect(result.error).toContain('Daily quota limit reached');
    });
  });

  describe('autoFixBatch', () => {
    it('enforces quota stop before starting if quota is exceeded', async () => {
      mockUsageQuotaService.isUnlimited = false;
      mockUsageQuotaService.remaining.mockResolvedValue(1);

      const file1 = new File([new Uint8Array(80 * 1024)], 'f1.jpg', { type: 'image/jpeg' });
      const file2 = new File([new Uint8Array(90 * 1024)], 'f2.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });

      const summary = await service.auditBatch([file1, file2], testPreset);
      expect(summary.fixableCount).toBe(2);

      const onProgress = vi.fn();
      await expect(service.autoFixBatch(summary.scorecards, testPreset, onProgress)).rejects.toThrow(
        /Daily quota limit reached/
      );

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'quota_exceeded'
        })
      );
      expect(mockUsageQuotaService.consume).not.toHaveBeenCalled();
    });

    it('converts, resizes, and compresses failing files into compliant outputs', async () => {
      mockUsageQuotaService.isUnlimited = false;
      mockUsageQuotaService.remaining.mockResolvedValue(5);

      // File: 80 KB PNG with 600x800 px (needs convert -> resize -> compress)
      const file = new File([new Uint8Array(80 * 1024)], 'sample.png', { type: 'image/png' });
      mockImageService.getImageDimensions
        .mockResolvedValueOnce({ width: 600, height: 800 }) // initial audit
        .mockResolvedValueOnce({ width: 600, height: 800 }) // during autoFixFile convert
        .mockResolvedValue({ width: 350, height: 450 }); // re-audit after fix

      mockCompressionService.compressToExactKB.mockImplementation((f: File, config: any) => {
        // Return 30 KB compliant JPEG file
        const fixed = new File([new Uint8Array(30 * 1024)], 'sample.jpg', { type: 'image/jpeg' });
        return Promise.resolve({ success: true, file: fixed });
      });

      const summary = await service.auditBatch([file], testPreset);
      expect(summary.fixableCount).toBe(1);

      const progressUpdates: any[] = [];
      const result = await service.autoFixBatch(summary.scorecards, testPreset, (p) => {
        progressUpdates.push({ ...p });
      });

      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockUsageQuotaService.consume).toHaveBeenCalledTimes(1);

      const fixedCard = result.fixedScorecards[0];
      expect(fixedCard.passed).toBe(true);
      expect(fixedCard.fixStatus).toBe('fixed');
      expect(fixedCard.fixedFile).toBeDefined();

      expect(progressUpdates.some(p => p.status === 'running')).toBe(true);
      expect(progressUpdates.some(p => p.status === 'completed')).toBe(true);
    });

    it('marks scorecard as failed if autoFix operation throws an error', async () => {
      mockUsageQuotaService.isUnlimited = true;

      const file = new File([new Uint8Array(80 * 1024)], 'fail.jpg', { type: 'image/jpeg' });
      mockImageService.getImageDimensions.mockResolvedValue({ width: 350, height: 450 });
      mockCompressionService.compressToExactKB.mockRejectedValue(new Error('Compression engine fault'));

      const summary = await service.auditBatch([file], testPreset);

      const result = await service.autoFixBatch(summary.scorecards, testPreset);

      expect(result.failedCount).toBe(1);
      expect(result.successfulCount).toBe(0);
      expect(result.fixedScorecards[0].fixStatus).toBe('failed');
      expect(result.fixedScorecards[0].fixError).toContain('Compression engine fault');
    });
  });
});
