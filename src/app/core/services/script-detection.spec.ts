import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptDetectionService } from './script-detection.service';
import { Preferences } from '@capacitor/preferences';

describe('ScriptDetectionService', () => {
  let service: ScriptDetectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ScriptDetectionService]
    });
    service = TestBed.inject(ScriptDetectionService);
  });

  afterEach(async () => {
    await Preferences.clear();
  });

  describe('Dual-Mode: Digital Text Pre-Check (Unicode Blocks)', () => {
    it('correctly identifies Devanagari script and suggests Hindi by default with high confidence', async () => {
      const devanagariText = 'नमस्ते भारत, यह एक परीक्षण दस्तावेज़ है जो देवनागरी लिपि में लिखा गया है।';
      const result = await service.detectScriptFromText(devanagariText);

      expect(result.detectedScript).toBe('devanagari');
      expect(result.scriptName).toBe('Devanagari');
      expect(result.suggestedLanguage).toBe('hin');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
      expect(result.scriptDistribution.devanagari).toBeGreaterThan(90);
      expect(result.alternativeSuggestions).toContain('mar');
    });

    it('correctly identifies Bengali script and suggests Bengali', async () => {
      const bengaliText = 'নমস্কার বাংলাদেশ ও ভারত, এটি একটি বাংলা ভাষার নমুনা নথি।';
      const result = await service.detectScriptFromText(bengaliText);

      expect(result.detectedScript).toBe('bengali');
      expect(result.scriptName).toBe('Bengali');
      expect(result.suggestedLanguage).toBe('ben');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
      expect(result.alternativeSuggestions).toContain('asm');
    });

    it('correctly identifies Tamil script and suggests Tamil', async () => {
      const tamilText = 'வணக்கம், இது தமிழ் மொழியில் எழுதப்பட்ட மாதிரி ஆவணம் ஆகும்.';
      const result = await service.detectScriptFromText(tamilText);

      expect(result.detectedScript).toBe('tamil');
      expect(result.suggestedLanguage).toBe('tam');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Telugu script and suggests Telugu', async () => {
      const teluguText = 'నమస్కారం, ఇది తెలుగు భాషలో ఉన్న ముఖ్యమైన పత్రము.';
      const result = await service.detectScriptFromText(teluguText);

      expect(result.detectedScript).toBe('telugu');
      expect(result.suggestedLanguage).toBe('tel');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Kannada script and suggests Kannada', async () => {
      const kannadaText = 'ನಮಸ್ಕಾರ, ಇದು ಕನ್ನಡ ಭಾಷೆಯ ಮಾದರಿ ದಾಖಲೆಯಾಗಿದೆ.';
      const result = await service.detectScriptFromText(kannadaText);

      expect(result.detectedScript).toBe('kannada');
      expect(result.suggestedLanguage).toBe('kan');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Malayalam script and suggests Malayalam', async () => {
      const malayalamText = 'നമസ്കാരം, ഇത് മലയാള ഭാഷയിലുള്ള ഒരു രേഖയാണ്.';
      const result = await service.detectScriptFromText(malayalamText);

      expect(result.detectedScript).toBe('malayalam');
      expect(result.suggestedLanguage).toBe('mal');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Gujarati script and suggests Gujarati', async () => {
      const gujaratiText = 'નમસ્તે, આ ગુજરાતી ભાષામાં લખાયેલ દસ્તાવેજ છે.';
      const result = await service.detectScriptFromText(gujaratiText);

      expect(result.detectedScript).toBe('gujarati');
      expect(result.suggestedLanguage).toBe('guj');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Odia script and suggests Odia', async () => {
      const odiaText = 'ନମସ୍କାର, ଏହା ଓଡ଼ିଆ ଭାଷାରେ ଲିଖିତ ଏକ ନମୁନା ଦଲିଲ।';
      const result = await service.detectScriptFromText(odiaText);

      expect(result.detectedScript).toBe('odia');
      expect(result.suggestedLanguage).toBe('ori');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Gurmukhi script and suggests Punjabi', async () => {
      const gurmukhiText = 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਪੰਜਾਬੀ ਭਾਸ਼ਾ ਵਿੱਚ ਲਿਖਿਆ ਗਿਆ ਦਸਤਾਵੇਜ਼ ਹੈ।';
      const result = await service.detectScriptFromText(gurmukhiText);

      expect(result.detectedScript).toBe('gurmukhi');
      expect(result.suggestedLanguage).toBe('pan');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Arabic / Urdu script and suggests Urdu', async () => {
      const urduText = 'یہ ایک نمونہ دستاویز ہے جو اردو زبان میں تحریر کی گئی ہے۔';
      const result = await service.detectScriptFromText(urduText);

      expect(result.detectedScript).toBe('arabic');
      expect(result.suggestedLanguage).toBe('urd');
      expect(result.alternativeSuggestions).toContain('ara');
      expect(result.isConfident).toBe(true);
    });

    it('correctly identifies Latin script and suggests English', async () => {
      const latinText = 'This is an official document written entirely in the English language with standard Latin characters.';
      const result = await service.detectScriptFromText(latinText);

      expect(result.detectedScript).toBe('latin');
      expect(result.suggestedLanguage).toBe('eng');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
      expect(result.alternativeSuggestions).toContain('spa');
    });

    it('correctly identifies Chinese Simplified Han script', async () => {
      const hanText = '这是一个用于文字识别测试的中文简体示例文档。';
      const result = await service.detectScriptFromText(hanText);

      expect(result.detectedScript).toBe('han');
      expect(result.suggestedLanguage).toBe('chi_sim');
      expect(result.isConfident).toBe(true);
    });

    it('flags low-confidence on mixed or balanced bilingual text without silently guessing', async () => {
      // 50% English and 50% Hindi text
      const mixedText = 'Invoice Order Number 1042567 नमस्ते आपका बहुत धन्यवाद';
      const result = await service.detectScriptFromText(mixedText);

      // In a mixed 50-50 document, confidence should not meet the 70% threshold
      expect(result.confidence).toBeLessThan(70);
      expect(result.isConfident).toBe(false);
      // Top 2 guesses should be present
      expect([result.suggestedLanguage, ...result.alternativeSuggestions]).toContain('hin');
      expect([result.suggestedLanguage, ...result.alternativeSuggestions]).toContain('eng');
    });

    it('handles empty or non-script string gracefully', async () => {
      const emptyResult = await service.detectScriptFromText('   1234567890 !@#$%^&*()   ');
      expect(emptyResult.detectedScript).toBe('unknown');
      expect(emptyResult.confidence).toBe(0);
      expect(emptyResult.isConfident).toBe(false);
    });
  });

  describe('User Preference Memory via @capacitor/preferences', () => {
    it('preserves user override for a script family (e.g. Marathi for Devanagari)', async () => {
      // Baseline before override: Devanagari defaults to Hindi (hin)
      const devanagariText = 'नमस्ते भारत, यह एक परीक्षण दस्तावेज़ है जो देवनागरी लिपि में लिखा गया है।';
      let result = await service.detectScriptFromText(devanagariText);
      expect(result.suggestedLanguage).toBe('hin');

      // User overrides preference to Marathi (mar)
      await service.saveScriptPreference('devanagari', 'mar');

      // Read preference back
      const saved = await service.getScriptPreference('devanagari');
      expect(saved).toBe('mar');

      // Re-detecting same text now respects the saved user preference!
      result = await service.detectScriptFromText(devanagariText);
      expect(result.suggestedLanguage).toBe('mar');
      expect(result.source).toBe('override');
      expect(result.alternativeSuggestions).toContain('hin');
    });
  });

  describe('Scanned Image Sample Pass & Morphological Classifier', () => {
    function createMockPatch(
      width: number,
      height: number,
      type: 'latin' | 'devanagari' | 'tamil' | 'blank' | 'solid_black' | 'random_noise' | 'checkerboard'
    ): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      // Initialize with white background
      data.fill(255);

      if (type === 'solid_black') {
        // Pure solid black pixels (100% ink density)
        data.fill(0);
        for (let i = 3; i < data.length; i += 4) {
          data[i] = 255;
        }
      } else if (type === 'random_noise') {
        // High-frequency random pixel noise (salt & pepper)
        let seed = 12345;
        for (let i = 0; i < data.length; i += 4) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const val = (seed % 2 === 0) ? 20 : 240;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
          data[i + 3] = 255;
        }
      } else if (type === 'checkerboard') {
        // Alternating 1x1 black and white squares
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const isBlack = (x + y) % 2 === 0;
            const idx = (y * width + x) * 4;
            const val = isBlack ? 20 : 240;
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
          }
        }
      } else if (type === 'devanagari') {
        // Continuous top headline (Shirorekha) across character cells
        const headlineY = Math.floor(height * 0.2);
        for (let x = 10; x < width - 10; x++) {
          const idx = (headlineY * width + x) * 4;
          data[idx] = 20;
          data[idx + 1] = 20;
          data[idx + 2] = 20;
        }
        // Descenders
        for (let x = 15; x < width - 15; x += 12) {
          for (let y = headlineY; y < height * 0.75; y++) {
            const idx = (y * width + x) * 4;
            data[idx] = 20;
            data[idx + 1] = 20;
            data[idx + 2] = 20;
          }
        }
      } else if (type === 'latin') {
        // Discrete separated letters with clear white-space column gaps
        for (let charStart = 10; charStart < width - 20; charStart += 18) {
          // 8px wide character, followed by 10px white gap
          for (let x = charStart; x < charStart + 8; x++) {
            for (let y = Math.floor(height * 0.35); y < Math.floor(height * 0.75); y++) {
              const idx = (y * width + x) * 4;
              data[idx] = 20;
              data[idx + 1] = 20;
              data[idx + 2] = 20;
            }
          }
        }
      } else if (type === 'tamil') {
        // Rounded loops without top headline
        for (let charStart = 10; charStart < width - 20; charStart += 16) {
          // Curved outline (top curve, bottom curve, vertical side)
          for (let x = charStart; x < charStart + 12; x++) {
            const y1 = Math.floor(height * 0.35);
            const y2 = Math.floor(height * 0.65);
            const idx1 = (y1 * width + x) * 4;
            const idx2 = (y2 * width + x) * 4;
            data[idx1] = 20;
            data[idx1 + 1] = 20;
            data[idx1 + 2] = 20;
            data[idx2] = 20;
            data[idx2 + 1] = 20;
            data[idx2 + 2] = 20;
          }
          for (let y = Math.floor(height * 0.35); y <= Math.floor(height * 0.65); y++) {
            const idxLeft = (y * width + charStart) * 4;
            data[idxLeft] = 20;
            data[idxLeft + 1] = 20;
            data[idxLeft + 2] = 20;
          }
        }
      }

      return {
        data,
        width,
        height,
        colorSpace: 'srgb'
      } as ImageData;
    }

    it('classifies Latin image patches correctly with discrete glyph separation', async () => {
      const patches = [
        createMockPatch(120, 40, 'latin'),
        createMockPatch(120, 40, 'latin'),
        createMockPatch(120, 40, 'latin')
      ];

      const result = await service.classifyImagePatches(patches);
      expect(result.detectedScript).toBe('latin');
      expect(result.suggestedLanguage).toBe('eng');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('classifies Devanagari image patches correctly based on top headline (Shirorekha)', async () => {
      const patches = [
        createMockPatch(120, 40, 'devanagari'),
        createMockPatch(120, 40, 'devanagari'),
        createMockPatch(120, 40, 'devanagari')
      ];

      const result = await service.classifyImagePatches(patches);
      expect(result.detectedScript).toBe('devanagari');
      expect(result.suggestedLanguage).toBe('hin');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('classifies Tamil image patches correctly based on rounded loop morphology', async () => {
      const patches = [
        createMockPatch(120, 40, 'tamil'),
        createMockPatch(120, 40, 'tamil'),
        createMockPatch(120, 40, 'tamil')
      ];

      const result = await service.classifyImagePatches(patches);
      expect(result.detectedScript).toBe('tamil');
      expect(result.suggestedLanguage).toBe('tam');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('triggers low-confidence prompt on blank or ambiguous image patches rather than incorrect guess', async () => {
      const blankPatches = [
        createMockPatch(120, 40, 'blank'),
        createMockPatch(120, 40, 'blank'),
        createMockPatch(120, 40, 'blank')
      ];

      const result = await service.classifyImagePatches(blankPatches);
      expect(result.confidence).toBeLessThan(70);
      expect(result.isConfident).toBe(false);
      // Presents top 2 guesses for the user
      expect(result.alternativeSuggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects pure black image patches without misclassifying them as text', async () => {
      const solidBlackPatches = [
        createMockPatch(120, 40, 'solid_black'),
        createMockPatch(120, 40, 'solid_black'),
        createMockPatch(120, 40, 'solid_black')
      ];

      const result = await service.classifyImagePatches(solidBlackPatches);
      expect(result.detectedScript).toBe('unknown');
      expect(result.confidence).toBeLessThan(70);
      expect(result.isConfident).toBe(false);
    });

    it('handles high-frequency random pixel noise safely without false confidence', async () => {
      const noisyPatches = [
        createMockPatch(120, 40, 'random_noise'),
        createMockPatch(120, 40, 'random_noise'),
        createMockPatch(120, 40, 'random_noise')
      ];

      const result = await service.classifyImagePatches(noisyPatches);
      expect(result.confidence).toBeLessThan(70);
      expect(result.isConfident).toBe(false);
    });

    it('handles checkerboard noise patterns safely without crashing', async () => {
      const checkerboardPatches = [
        createMockPatch(120, 40, 'checkerboard'),
        createMockPatch(120, 40, 'checkerboard'),
        createMockPatch(120, 40, 'checkerboard')
      ];

      const result = await service.classifyImagePatches(checkerboardPatches);
      expect(result.detectedScript).toBe('unknown');
      expect(result.isConfident).toBe(false);
    });
  });

  describe('Cybersecurity Stress-Testing & Input Sanitization', () => {
    it('safely handles text with embedded null bytes and non-printable control characters', async () => {
      const malformedText = '\u0000\u0001\u0002\u0003नमस्ते भारत, यह एक परीक्षण दस्तावेज़ है।\u0007\u0008\u001B\u007F\u0080';
      const result = await service.detectScriptFromText(malformedText);

      expect(result.detectedScript).toBe('devanagari');
      expect(result.suggestedLanguage).toBe('hin');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('safely handles text consisting solely of control characters and null bytes', async () => {
      const pureControlText = '\u0000\u0001\u0002\u0003\u0004\u0005\u0007\u0008\u001F\u007F';
      const result = await service.detectScriptFromText(pureControlText);

      expect(result.detectedScript).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.isConfident).toBe(false);
    });

    it('safely handles unpaired surrogates without throwing', async () => {
      const surrogateText = '\uD800\uDFFF\uD83D Standard English Document with valid Latin sentences \uD83C\uDF89';
      const result = await service.detectScriptFromText(surrogateText);

      expect(result.detectedScript).toBe('latin');
      expect(result.suggestedLanguage).toBe('eng');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.isConfident).toBe(true);
    });

    it('prevents ReDoS and main-thread DoS on massive text streams (100,000+ characters)', async () => {
      const hugeDevanagariStream = 'नमस्ते भारत यह एक बड़ा दस्तावेज़ है '.repeat(3500);
      expect(hugeDevanagariStream.length).toBeGreaterThan(100000);

      const startTime = performance.now();
      const result = await service.detectScriptFromText(hugeDevanagariStream);
      const durationMs = performance.now() - startTime;

      // Must complete in under 50ms due to bounded 10,000 char window
      expect(durationMs).toBeLessThan(50);
      expect(result.detectedScript).toBe('devanagari');
      expect(result.suggestedLanguage).toBe('hin');
      expect(result.isConfident).toBe(true);
    });

    it('cropRepresentativePatches clamps oversized canvas dimensions to prevent buffer exhaustion', () => {
      // Mock canvas with extreme dimensions
      const mockCanvas = {
        width: 10000,
        height: 10000,
        getContext: () => ({
          getImageData: (x: number, y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
            colorSpace: 'srgb'
          })
        })
      } as unknown as HTMLCanvasElement;

      const patches = service.cropRepresentativePatches(mockCanvas);
      expect(patches.length).toBe(3);
      for (const patch of patches) {
        // Clamped to max 800 width and max 200 height
        expect(patch.width).toBeLessThanOrEqual(800);
        expect(patch.height).toBeLessThanOrEqual(200);
      }
    });

    it('cropRepresentativePatches safely returns empty array on invalid or tiny canvas', () => {
      const tinyCanvas = {
        width: 4,
        height: 4,
        getContext: () => null
      } as unknown as HTMLCanvasElement;

      const patches = service.cropRepresentativePatches(tinyCanvas);
      expect(patches).toEqual([]);
    });
  });
});
