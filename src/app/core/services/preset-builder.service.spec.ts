import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PresetBuilderService } from './preset-builder.service';
import { OcrService } from './ocr.service';
import { CUSTOM_PRESETS_KEY } from '../models/preset.types';

// In-memory store for Capacitor Preferences
const preferencesStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferencesStore.get(key) ?? null
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
    clear: vi.fn(async () => {
      preferencesStore.clear();
    })
  }
}));

describe('PresetBuilderService — Extraction & Specification Profiles', () => {
  let service: PresetBuilderService;
  let mockOcrService: Partial<OcrService>;

  beforeEach(() => {
    preferencesStore.clear();

    mockOcrService = {
      detectSelectableText: vi.fn().mockResolvedValue({ hasText: false }),
      extractExistingText: vi.fn().mockResolvedValue({ fullText: '' }),
      performOcr: vi.fn().mockResolvedValue({
        fullText: 'The photograph must be between 20 KB and 50 KB, dimensions 200 x 230 pixels, JPEG format, 200 DPI.'
      })
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PresetBuilderService,
        { provide: OcrService, useValue: mockOcrService }
      ]
    });

    service = TestBed.inject(PresetBuilderService);
  });

  describe('Extraction from Fixture Instruction Sheets', () => {
    it('accurately pulls size limits, dimensions, unit, format, and DPI from photo guidelines', () => {
      const fixtureText = `
        IMPORTANT GUIDELINES FOR PHOTOGRAPH UPLOAD:
        1. The applicant should upload a recent color passport photograph.
        2. Dimensions of the image must be 200 x 230 pixels.
        3. File size should be between 20 KB and 50 KB.
        4. Image format must be JPEG / JPG only.
        5. Resolution must be 200 DPI.
      `;

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec).toBeDefined();
      expect(result.spec?.minKb).toBe(20);
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.width).toBe(200);
      expect(result.spec?.height).toBe(230);
      expect(result.spec?.unit).toBe('px');
      expect(result.spec?.dpi).toBe(200);
      expect(result.spec?.format).toBe('JPEG');
      expect(result.spec?.targetType).toBe('photo');
    });

    it('accurately parses physical millimeter dimensions and aspect ratio', () => {
      const fixtureText = `
        Upload specification:
        Photograph dimensions: 35 mm x 45 mm.
        File size not exceeding 50 KB.
        Aspect ratio: 3.5:4.5.
        Resolution: 300 DPI.
        Allowed format: JPEG.
      `;

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec).toBeDefined();
      expect(result.spec?.width).toBe(35);
      expect(result.spec?.height).toBe(45);
      expect(result.spec?.unit).toBe('mm');
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.aspectRatio).toBe('3.5:4.5');
      expect(result.spec?.dpi).toBe(300);
      expect(result.spec?.format).toBe('JPEG');
      expect(result.spec?.proposedName).toContain('35x45mm');
      expect(result.spec?.proposedName).toContain('50KB');
    });

    it('accurately parses centimeter dimensions', () => {
      const fixtureText = 'Photo size 3.5 cm x 4.5 cm, max 50 KB, JPEG, 300 DPI';

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec?.width).toBe(3.5);
      expect(result.spec?.height).toBe(4.5);
      expect(result.spec?.unit).toBe('cm');
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.dpi).toBe(300);
    });

    it('accurately parses inch dimensions and aspect ratio 1:1', () => {
      const fixtureText = 'Passport photo: 2 x 2 inches, 240 KB max, 300 DPI, format JPEG, aspect ratio 1:1';

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec?.width).toBe(2);
      expect(result.spec?.height).toBe(2);
      expect(result.spec?.unit).toBe('in');
      expect(result.spec?.maxKb).toBe(240);
      expect(result.spec?.aspectRatio).toBe('1:1');
    });

    it('accurately parses signature specification with separated width and height', () => {
      const fixtureText = `
        Signature guidelines:
        Candidate must upload clear signature on white paper.
        File size must be between 10 KB to 20 KB.
        Dimensions: 140 pixels width by 60 pixels height.
        Format: JPG.
      `;

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec?.targetType).toBe('signature');
      expect(result.spec?.minKb).toBe(10);
      expect(result.spec?.maxKb).toBe(20);
      expect(result.spec?.width).toBe(140);
      expect(result.spec?.height).toBe(60);
      expect(result.spec?.unit).toBe('px');
      expect(result.spec?.format).toBe('JPG');
      expect(result.spec?.proposedName).toBe('Signature 140x60px 10-20KB');
    });

    it('accurately parses PDF document upload specifications with MB to KB conversion', () => {
      const fixtureText = `
        Document Upload Instruction:
        Upload 10th Certificate / Marksheet in PDF format only.
        File size must be between 100 KB and 1 MB.
      `;

      const result = service.parseInstructionText(fixtureText);

      expect(result.success).toBe(true);
      expect(result.spec?.targetType).toBe('pdf');
      expect(result.spec?.minKb).toBe(100);
      expect(result.spec?.maxKb).toBe(1024);
      expect(result.spec?.format).toBe('PDF');
      expect(result.spec?.proposedName).toBe('Doc PDF 100-1024KB');
    });
  });

  describe('Neutral Profile Naming (No Hallucinated or Institutional Names)', () => {
    it('proposes neutral profile names based exclusively on numbers and types', () => {
      const name = service.generateNeutralProfileName({
        targetType: 'photo',
        width: 35,
        height: 45,
        unit: 'mm',
        maxKb: 50
      });

      expect(name).toBe('Photo 35x45mm 50KB');
    });

    it('proposes neutral document names based on numbers', () => {
      const name = service.generateNeutralProfileName({
        targetType: 'pdf',
        maxKb: 200
      });

      expect(name).toBe('Doc PDF 200KB');
    });

    it('strictly sanitizes and strips governmental and exam board keywords from profile names', () => {
      const rawUserNames = [
        'UPSC Civil Services Photo 50KB',
        'SSC CGL Signature Spec',
        'CBSE Board Marksheet PDF 200KB',
        'State Government Recruitment Photo'
      ];

      for (const raw of rawUserNames) {
        const sanitized = service.sanitizeProfileName(raw);
        expect(sanitized).not.toMatch(/upsc|ssc|cbse|govt|government|exam|board/i);
      }
    });
  });

  describe('Unparseable Sheet Error Handling (No Hallucination)', () => {
    it('reports error on unparseable sheet without hallucinating values', () => {
      const unparseableText = `
        Welcome to the Application Registration Portal.
        Please read all instructions and eligibility criteria carefully before proceeding.
        For technical assistance, please email support@portal.example.org or call toll-free numbers.
      `;

      const result = service.parseInstructionText(unparseableText);

      expect(result.success).toBe(false);
      expect(result.spec).toBeUndefined();
      expect(result.error).toContain('Could not detect upload specifications');
    });

    it('reports error on empty text input', () => {
      const result = service.parseInstructionText('   ');

      expect(result.success).toBe(false);
      expect(result.spec).toBeUndefined();
      expect(result.error).toContain('no readable text');
    });
  });

  describe('Highlighted Text Segments for Mobile UI', () => {
    it('generates highlighted token segments for detected numbers and specs', () => {
      const text = 'Photograph between 20 KB and 50 KB, 200 x 230 px, 200 DPI.';
      const result = service.parseInstructionText(text);

      expect(result.success).toBe(true);
      expect(result.highlightedSegments.length).toBeGreaterThan(1);

      const highlighted = result.highlightedSegments.filter(s => s.isHighlighted);
      expect(highlighted.length).toBeGreaterThanOrEqual(2);

      const sizes = highlighted.filter(h => h.type === 'size');
      const dimensions = highlighted.filter(h => h.type === 'dimension');
      expect(sizes.length).toBeGreaterThan(0);
      expect(dimensions.length).toBeGreaterThan(0);
    });
  });

  describe('Save to Custom Presets & Retrieval', () => {
    it('saves a verified specification profile to @capacitor/preferences under CUSTOM_PRESETS_KEY and retrieves it', async () => {
      const spec = {
        minKb: 20,
        maxKb: 50,
        width: 350,
        height: 450,
        unit: 'px' as const,
        format: 'JPEG',
        dpi: 300,
        targetType: 'photo' as const,
        proposedName: 'Photo 350x450px 20-50KB'
      };

      const saved = await service.saveSpecificationProfile(spec);

      expect(saved.id).toBeDefined();
      expect(saved.category).toBe('My Custom Presets');
      expect(saved.isCustom).toBe(true);
      expect(saved.photo).toBeDefined();
      expect(saved.photo?.minKb).toBe(20);
      expect(saved.photo?.maxKb).toBe(50);
      expect(saved.photo?.width).toBe(350);
      expect(saved.photo?.height).toBe(450);

      // Verify it is stored in Preferences under CUSTOM_PRESETS_KEY
      const rawStored = preferencesStore.get(CUSTOM_PRESETS_KEY);
      expect(rawStored).toBeDefined();
      const storedArray = JSON.parse(rawStored!);
      expect(storedArray.length).toBe(1);
      expect(storedArray[0].id).toBe(saved.id);

      // Verify retrievable via getCustomPresets()
      const customPresets = await service.getCustomPresets();
      expect(customPresets.length).toBe(1);
      expect(customPresets[0].name).toBe('Photo 350x450px 20-50KB');
      expect(customPresets[0].photo?.maxKb).toBe(50);
    });
  });

  describe('File Ingestion & OCR integration', () => {
    it('calls OcrService.performOcr when ingesting an instruction image', async () => {
      const fakeImageFile = new File(['fake-image-bytes'], 'guideline.jpg', { type: 'image/jpeg' });

      const result = await service.parseInstructionSheet(fakeImageFile);

      expect(mockOcrService.performOcr).toHaveBeenCalledWith(fakeImageFile, 'eng', [1]);
      expect(result.success).toBe(true);
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.width).toBe(200);
      expect(result.spec?.height).toBe(230);
    });

    it('returns error when file is null or undefined', async () => {
      const result = await service.parseInstructionSheet(null as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No file provided');
    });
  });

  describe('Dimension Unit Conversion Math (mm, cm, in to px)', () => {
    it('accurately converts millimeter dimensions to pixels at specified DPI', () => {
      // 35mm x 45mm at 300 DPI: (35 * 300) / 25.4 = 413.38 -> 413; (45 * 300) / 25.4 = 531.49 -> 531
      const wPx300 = service.convertToPixels(35, 'mm', 300);
      const hPx300 = service.convertToPixels(45, 'mm', 300);
      expect(wPx300).toBe(413);
      expect(hPx300).toBe(531);

      // 35mm x 45mm at 200 DPI: (35 * 200) / 25.4 = 275.59 -> 276; (45 * 200) / 25.4 = 354.33 -> 354
      const wPx200 = service.convertToPixels(35, 'mm', 200);
      const hPx200 = service.convertToPixels(45, 'mm', 200);
      expect(wPx200).toBe(276);
      expect(hPx200).toBe(354);
    });

    it('accurately converts centimeter dimensions to pixels at specified DPI', () => {
      // 3.5cm x 4.5cm at 300 DPI
      const wPx = service.convertToPixels(3.5, 'cm', 300);
      const hPx = service.convertToPixels(4.5, 'cm', 300);
      expect(wPx).toBe(413);
      expect(hPx).toBe(531);
    });

    it('accurately converts inches to pixels at specified DPI', () => {
      // 2 x 2 inches at 300 DPI = 600 x 600 px
      const wPx300 = service.convertToPixels(2, 'in', 300);
      expect(wPx300).toBe(600);

      // 2 x 2 inches at 200 DPI = 400 x 400 px
      const wPx200 = service.convertToPixels(2, 'in', 200);
      expect(wPx200).toBe(400);
    });

    it('handles pixel unit without alteration', () => {
      expect(service.convertToPixels(200, 'px', 300)).toBe(200);
      expect(service.convertToPixels(230.4, 'px', 300)).toBe(230);
    });

    it('handles non-positive or invalid values safely without crashing or throwing', () => {
      expect(service.convertToPixels(0, 'mm', 300)).toBe(0);
      expect(service.convertToPixels(-10, 'mm', 300)).toBe(0);
      expect(service.convertToPixels(NaN, 'mm', 300)).toBe(0);
      expect(service.convertToPixels(Infinity, 'mm', 300)).toBe(0);
    });

    it('converts dimensions object and inverse pixel conversions accurately', () => {
      const converted = service.convertDimensionsToPx(35, 45, 'mm', 300);
      expect(converted.widthPx).toBe(413);
      expect(converted.heightPx).toBe(531);

      // Inverse 600 px to inches at 300 DPI = 2.00 in
      expect(service.convertPixelsToUnit(600, 'in', 300)).toBe(2);
      // Inverse 413 px to mm at 300 DPI = 35.0 mm
      expect(service.convertPixelsToUnit(413, 'mm', 300)).toBe(35);
    });
  });

  describe('Real Test Data Verification: Recruitment, Passport, and Blurred Scans', () => {
    it('Test 1: Recruitment upload guidelines photo OCR ("File size 20KB-50KB, 200x230 pixels, JPEG format")', () => {
      const text = 'File size 20KB-50KB, 200x230 pixels, JPEG format';
      const result = service.parseInstructionText(text);

      expect(result.success).toBe(true);
      expect(result.spec?.minKb).toBe(20);
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.width).toBe(200);
      expect(result.spec?.height).toBe(230);
      expect(result.spec?.unit).toBe('px');
      expect(result.spec?.format).toBe('JPEG');
      expect(result.spec?.proposedName).toBe('Photo 200x230px 20-50KB');
      expect(result.spec?.aspectRatio).toBe('20:23');
    });

    it('Test 2: Passport size instruction snippet ("35 mm x 45 mm, max 50 KB, 3.5:4.5 aspect ratio, 300 DPI, JPEG")', () => {
      const text = 'Photograph dimensions: 35 mm x 45 mm. File size not exceeding 50 KB. Aspect ratio: 3.5:4.5. Resolution: 300 DPI. Allowed format: JPEG.';
      const result = service.parseInstructionText(text);

      expect(result.success).toBe(true);
      expect(result.spec?.width).toBe(35);
      expect(result.spec?.height).toBe(45);
      expect(result.spec?.unit).toBe('mm');
      expect(result.spec?.maxKb).toBe(50);
      expect(result.spec?.aspectRatio).toBe('3.5:4.5');
      expect(result.spec?.dpi).toBe(300);
      expect(result.spec?.widthPx).toBe(413);
      expect(result.spec?.heightPx).toBe(531);
      expect(result.spec?.proposedName).toBe('Photo 35x45mm 50KB');
    });

    it('Test 3: Blurred instruction photo resulting in OCR noise or empty text', async () => {
      // Blurred OCR text outputting noise or gibberish
      const blurredNoise = '~~~ ::: ... ??? !! - - - - - * * # @ &';
      const result = service.parseInstructionText(blurredNoise);

      expect(result.success).toBe(false);
      expect(result.spec).toBeUndefined();
      expect(result.error).toContain('Could not detect upload specifications');

      // OCR service returning blank text on heavily blurred photo
      const blankFile = new File(['blurred-bytes'], 'blurred.jpg', { type: 'image/jpeg' });
      (mockOcrService.performOcr as any).mockResolvedValueOnce({ fullText: '   ' });

      const ocrResult = await service.parseInstructionSheet(blankFile);
      expect(ocrResult.success).toBe(false);
      expect(ocrResult.spec).toBeUndefined();
      expect(ocrResult.error).toContain('no readable text');
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    describe('ReDoS Resilience on Regex Patterns', () => {
      it('executes within milliseconds against catastrophic backtracking evil strings', () => {
        // Evil strings with repeated spaces, repeated colons, and incomplete pattern tails
        const evilString1 = 'size' + ' '.repeat(5000) + ':'.repeat(5000) + 'xyz';
        const evilString2 = 'min' + ' '.repeat(5000) + 'max' + ' '.repeat(5000);
        const evilString3 = 'width' + ' '.repeat(5000) + 'height' + ' '.repeat(5000);
        const evilString4 = 'between ' + '9'.repeat(5000) + ' KB and ' + '9'.repeat(5000) + ' KB';

        const startTime = Date.now();
        service.parseInstructionText(evilString1);
        service.parseInstructionText(evilString2);
        service.parseInstructionText(evilString3);
        service.parseInstructionText(evilString4);
        const elapsedMs = Date.now() - startTime;

        expect(elapsedMs).toBeLessThan(500); // Should parse all in under 500ms
      });
    });

    describe('Input Tampering & Bounds-Clamping', () => {
      it('clamps negative dimensions, 0 KB limits, and inverted bounds', () => {
        const tamperedSpec = {
          minKb: -20,
          maxKb: 0,
          width: -200,
          height: -230,
          unit: 'px' as const,
          dpi: -100
        };

        const clamped = service.clampBounds(tamperedSpec);

        expect(clamped.minKb).toBe(0);
        expect(clamped.maxKb).toBe(1); // Clamped to min 1 KB
        expect(clamped.width).toBeUndefined(); // Negative dimensions rejected
        expect(clamped.height).toBeUndefined();
        expect(clamped.dpi).toBe(50); // Clamped to min 50 DPI
      });

      it('clamps inverted bounds where minKb > maxKb', () => {
        const inverted = service.clampBounds({
          minKb: 100,
          maxKb: 50
        });

        expect(inverted.minKb).toBe(50);
        expect(inverted.maxKb).toBe(50);
      });

      it('safely clamps and saves tampered specifications in saveSpecificationProfile', async () => {
        const saved = await service.saveSpecificationProfile({
          name: 'Tampered Profile',
          minKb: -10,
          maxKb: -50,
          width: -500,
          height: 0,
          unit: 'px',
          targetType: 'photo'
        });

        expect(saved.photo?.maxKb).toBe(1);
        expect(saved.photo?.minKb).toBe(0);
        expect(saved.photo?.width).toBeUndefined();
        expect(saved.photo?.height).toBeUndefined();
      });
    });

    describe('Institution Trademark & Government Name Infringement', () => {
      it('detects and strips governmental, exam board, and trademark keywords', () => {
        const maliciousNames = [
          'UPSC IAS Photo 50KB',
          'SSC CHSL Signature Profile',
          'IBPS PO Document PDF 200KB',
          'CBSE Board Marksheet PDF',
          'Aadhaar Card Photo Spec',
          'PAN Card Signature 20KB',
          'Government Sarkari Exam Photo',
          'State Police Recruitment 100KB'
        ];

        for (const name of maliciousNames) {
          expect(service.hasForbiddenInstitutionWords(name)).toBe(true);
          const sanitized = service.sanitizeProfileName(name);
          expect(service.hasForbiddenInstitutionWords(sanitized)).toBe(false);
          expect(sanitized).not.toMatch(/upsc|ssc|ibps|cbse|aadhaar|pan|govt|sarkari|police|recruitment|exam|board/i);
        }
      });

      it('strips HTML and script injection tags from profile names', () => {
        const xssName = '<script>alert("pwned")</script>Photo 200x230 50KB';
        const sanitized = service.sanitizeProfileName(xssName);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).toBe('Photo 200x230 50KB');
      });

      it('falls back to default neutral name when entire input consists of forbidden words', () => {
        const entirelyForbidden = 'UPSC SSC CBSE Government Exam';
        const sanitized = service.sanitizeProfileName(entirelyForbidden);
        expect(sanitized).toBe('Custom Specification Profile');
      });
    });
  });
});
