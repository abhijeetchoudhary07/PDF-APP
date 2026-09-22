import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentValidatorService } from './document-validator.service';
import { PresetService, PresetRequirement, Preset } from './preset.service';
import { ImageService } from './image.service';
import { CompressionService } from './compression.service';
import { PdfService } from './pdf.service';
import { SignatureProcessingService } from './signature-processing.service';

describe('DocumentValidatorService', () => {
  let service: DocumentValidatorService;
  let mockPresetService: PresetService;
  let mockImageService: ImageService;
  let mockCompressionService: CompressionService;
  let mockPdfService: PdfService;
  let mockSignatureService: SignatureProcessingService;

  beforeEach(() => {
    mockPresetService = {} as any;
    mockImageService = {
      getImageDimensions: vi.fn().mockResolvedValue({ width: 350, height: 450 }),
      resizeToCanvasBlob: vi.fn().mockResolvedValue(new Blob(['fake-img'], { type: 'image/jpeg' }))
    } as any;

    mockCompressionService = {
      compressToExactKB: vi.fn().mockResolvedValue({
        success: true,
        file: new File([new Uint8Array(30 * 1024)], 'photo.jpg', { type: 'image/jpeg' })
      })
    } as any;

    mockPdfService = {
      getPdfPageCount: vi.fn().mockResolvedValue(1),
      compressPdfToExactKB: vi.fn().mockResolvedValue({
        success: true,
        file: new File([new Uint8Array(200 * 1024)], 'doc.pdf', { type: 'application/pdf' })
      })
    } as any;

    mockSignatureService = {
      processSignature: vi.fn().mockResolvedValue(
        new File([new Uint8Array(15 * 1024)], 'sig.jpg', { type: 'image/jpeg' })
      )
    } as any;

    service = new DocumentValidatorService(
      mockPresetService,
      mockImageService,
      mockCompressionService,
      mockPdfService,
      mockSignatureService
    );
  });

  describe('Photo Validation', () => {
    const sscPhotoReq: PresetRequirement = {
      minKb: 20,
      maxKb: 50,
      width: 350,
      height: 450,
      aspectRatio: '3.5:4.5',
      format: 'JPEG',
      backgroundGuidance: 'Light background',
      verifiedSource: 'ssc.nic.in'
    };

    it('should PASS a photo meeting all SSC requirements', async () => {
      // 35 KB, 350x450, JPEG
      const buffer = new Uint8Array(35 * 1024);
      const file = new File([buffer], 'ssc_photo.jpg', { type: 'image/jpeg' });

      const result = await service.validateDocument(file, 'photo', sscPhotoReq);
      expect(result.passed).toBe(true);
      expect(result.errorsCount).toBe(0);

      const sizeRule = result.rules.find(r => r.id === 'photo_size');
      expect(sizeRule?.passed).toBe(true);

      const dimsRule = result.rules.find(r => r.id === 'photo_dimensions');
      expect(dimsRule?.passed).toBe(true);

      const formatRule = result.rules.find(r => r.id === 'photo_format');
      expect(formatRule?.passed).toBe(true);
    });

    it('should FAIL a photo exceeding maxKb with suggested fix', async () => {
      // 73 KB, 350x450
      const buffer = new Uint8Array(73 * 1024);
      const file = new File([buffer], 'large_photo.jpg', { type: 'image/jpeg' });

      const result = await service.validateDocument(file, 'photo', sscPhotoReq);
      expect(result.passed).toBe(false);
      expect(result.errorsCount).toBeGreaterThan(0);

      const sizeRule = result.rules.find(r => r.id === 'photo_size');
      expect(sizeRule?.passed).toBe(false);
      expect(sizeRule?.suggestedFix).toContain('Compress');
      expect(sizeRule?.fixAction).toBe('compress');
    });

    it('should FAIL a photo with wrong dimensions with suggested fix', async () => {
      vi.spyOn(mockImageService, 'getImageDimensions').mockResolvedValueOnce({ width: 500, height: 500 });

      const buffer = new Uint8Array(35 * 1024);
      const file = new File([buffer], 'wrong_dims.jpg', { type: 'image/jpeg' });

      const result = await service.validateDocument(file, 'photo', sscPhotoReq);
      expect(result.passed).toBe(false);

      const dimsRule = result.rules.find(r => r.id === 'photo_dimensions');
      expect(dimsRule?.passed).toBe(false);
      expect(dimsRule?.suggestedFix).toContain('Resize');
      expect(dimsRule?.fixAction).toBe('resize');
    });
  });

  describe('Signature Validation', () => {
    const sscSigReq: PresetRequirement = {
      minKb: 10,
      maxKb: 20,
      width: 400,
      height: 200,
      format: 'JPEG'
    };

    it('should PASS signature meeting requirements', async () => {
      vi.spyOn(mockImageService, 'getImageDimensions').mockResolvedValueOnce({ width: 400, height: 200 });
      const buffer = new Uint8Array(15 * 1024);
      const file = new File([buffer], 'sig.jpg', { type: 'image/jpeg' });

      const result = await service.validateDocument(file, 'signature', sscSigReq);
      expect(result.passed).toBe(true);
      expect(result.errorsCount).toBe(0);
    });

    it('should FAIL signature exceeding 20 KB', async () => {
      vi.spyOn(mockImageService, 'getImageDimensions').mockResolvedValueOnce({ width: 400, height: 200 });
      const buffer = new Uint8Array(45 * 1024);
      const file = new File([buffer], 'large_sig.jpg', { type: 'image/jpeg' });

      const result = await service.validateDocument(file, 'signature', sscSigReq);
      expect(result.passed).toBe(false);

      const sizeRule = result.rules.find(r => r.id === 'sig_size');
      expect(sizeRule?.passed).toBe(false);
      expect(sizeRule?.fixAction).toBe('compress');
    });
  });

  describe('PDF Validation', () => {
    const upscPdfReq: PresetRequirement = {
      minKb: 10,
      maxKb: 2048,
      format: 'PDF'
    };

    it('should PASS valid PDF file', async () => {
      const buffer = new Uint8Array(300 * 1024);
      const file = new File([buffer], 'certificate.pdf', { type: 'application/pdf' });

      const result = await service.validateDocument(file, 'pdf', upscPdfReq);
      expect(result.passed).toBe(true);
      expect(result.metadata.format).toBe('PDF');
      expect(result.metadata.pageCount).toBe(1);
    });

    it('should FAIL non-PDF file uploaded to PDF slot', async () => {
      const buffer = new Uint8Array(100 * 1024);
      const file = new File([buffer], 'certificate.png', { type: 'image/png' });

      const result = await service.validateDocument(file, 'pdf', upscPdfReq);
      expect(result.passed).toBe(false);

      const formatRule = result.rules.find(r => r.id === 'pdf_format');
      expect(formatRule?.passed).toBe(false);
    });
  });

  describe('Auto-Fix Dispatcher', () => {
    const mockPreset: Preset = {
      id: 'ssc',
      name: 'SSC',
      category: 'Government Exams',
      photo: { minKb: 20, maxKb: 50, width: 350, height: 450, format: 'JPEG' }
    };

    it('should dispatch compression auto-fix when rule fails on size', async () => {
      const buffer = new Uint8Array(80 * 1024);
      const file = new File([buffer], 'photo.jpg', { type: 'image/jpeg' });

      const rule = {
        id: 'photo_size',
        name: 'File Size',
        description: 'File size must be <= 50 KB',
        severity: 'error' as const,
        actualValue: '80 KB',
        expectedValue: '50 KB',
        passed: false,
        fixAction: 'compress' as const,
        fixParams: { targetKB: 50 }
      };

      const fixed = await service.autoFixRule(file, rule, 'photo', mockPreset);
      expect(fixed).toBeDefined();
      expect(mockCompressionService.compressToExactKB).toHaveBeenCalled();
    });

    it('should dispatch resize auto-fix when rule fails on dimensions', async () => {
      const buffer = new Uint8Array(35 * 1024);
      const file = new File([buffer], 'photo.jpg', { type: 'image/jpeg' });

      const rule = {
        id: 'photo_dimensions',
        name: 'Pixel Dimensions',
        description: 'Dimensions must be 350x450',
        severity: 'error' as const,
        actualValue: '500x500',
        expectedValue: '350x450',
        passed: false,
        fixAction: 'resize' as const,
        fixParams: { width: 350, height: 450 }
      };

      const fixed = await service.autoFixRule(file, rule, 'photo', mockPreset);
      expect(fixed).toBeDefined();
      expect(mockImageService.resizeToCanvasBlob).toHaveBeenCalledWith(
        file,
        350,
        450,
        'image/jpeg',
        0.95
      );
    });
  });
});
