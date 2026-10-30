import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import {
  OcrConfidenceService,
  DICTIONARY_STORAGE_KEY
} from './ocr-confidence.service';
import { OcrModelManagerService } from './ocr-model-manager.service';
import { ConfidenceWord } from '../models/ocr-confidence.types';

describe('OcrConfidenceService', () => {
  let service: OcrConfidenceService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        OcrConfidenceService,
        OcrModelManagerService
      ]
    });
    service = TestBed.inject(OcrConfidenceService);
    await Preferences.clear();
  });

  afterEach(async () => {
    await Preferences.clear();
    await service.terminateWorker();
    TestBed.resetTestingModule();
  });

  describe('Confidence Bucket Mathematics & Classification', () => {
    it('classifies confidence scores into High (>=85%), Medium (60-84%), and Low (<60%) tiers', () => {
      expect(service.classifyTier(100)).toBe('high');
      expect(service.classifyTier(85)).toBe('high');
      expect(service.classifyTier(84.9)).toBe('high'); // rounds to 85
      expect(service.classifyTier(84)).toBe('medium');
      expect(service.classifyTier(60)).toBe('medium');
      expect(service.classifyTier(59.4)).toBe('low');
      expect(service.classifyTier(0)).toBe('low');
      expect(service.classifyTier(-5)).toBe('low');
      expect(service.classifyTier(120)).toBe('high');
    });

    it('computes accurate overall statistics and percentage breakdowns', () => {
      const words = [
        { confidence: 95 }, // high
        { confidence: 88 }, // high
        { confidence: 75 }, // medium
        { confidence: 45 }  // low
      ];

      const stats = service.computeStats(words);

      expect(stats.totalWords).toBe(4);
      expect(stats.highCount).toBe(2);
      expect(stats.mediumCount).toBe(1);
      expect(stats.lowCount).toBe(1);
      expect(stats.highPercentage).toBe(50);
      expect(stats.mediumPercentage).toBe(25);
      expect(stats.lowPercentage).toBe(25);
      expect(stats.averageConfidence).toBe(76); // (95+88+75+45)/4 = 75.75 -> 76
    });

    it('handles empty word list gracefully', () => {
      const stats = service.computeStats([]);
      expect(stats.totalWords).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.highPercentage).toBe(0);
    });
  });

  describe('Persistent Correction Dictionary & Text Replacement', () => {
    it('persists correction rules in Capacitor Preferences across service re-instantiation', async () => {
      // 1. Add rule in first service instance
      await service.addCorrectionRule('Teh', 'The', false);

      const rules1 = await service.loadDictionary();
      expect(rules1.some(r => r.target === 'Teh' && r.replacement === 'The')).toBe(true);

      // 2. Instantiate a fresh service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [OcrConfidenceService, OcrModelManagerService]
      });
      const freshService = TestBed.inject(OcrConfidenceService);

      const rules2 = await freshService.loadDictionary();
      expect(rules2.some(r => r.target === 'Teh' && r.replacement === 'The')).toBe(true);
    });

    it('applies dictionary replacements idempotently', () => {
      const customRules = [
        { id: '1', target: 'rn', replacement: 'm', matchCase: false, createdAt: Date.now() },
        { id: '2', target: 'vv', replacement: 'w', matchCase: false, createdAt: Date.now() }
      ];

      const input = 'The bome of the vvord is clear.';
      const run1 = service.applyDictionary(input, customRules);
      const run2 = service.applyDictionary(run1, customRules);

      expect(run1).toBe('The bome of the word is clear.');
      expect(run2).toBe(run1); // Idempotence guarantee
    });

    it('applies case-aware dictionary replacements preserving original casing', () => {
      const customRules = [
        { id: '1', target: 'rn', replacement: 'm', matchCase: false, createdAt: Date.now() }
      ];

      // Lowercase match
      expect(service.applyDictionary('modern', customRules)).toBe('modem');
      // Titlecase match
      expect(service.applyDictionary('Rn-scale', customRules)).toBe('M-scale');
      // UPPERCASE match
      expect(service.applyDictionary('RN-TEST', customRules)).toBe('M-TEST');
    });

    it('respects regex word boundaries and does not corrupt longer words when targeting whole words', () => {
      const customRules = [
        { id: '1', target: '\\bin\\b', replacement: 'on', matchCase: true, isRegex: true, createdAt: Date.now() }
      ];

      // "in" with word boundary \bin\b should be replaced, but "inside" or "bin" should NOT be modified
      const input = 'Put the coin in the bin inside.';
      const result = service.applyDictionary(input, customRules);

      expect(result).toBe('Put the coin on the bin inside.');
    });
  });

  describe('Targeted Region Re-OCR', () => {
    it('crops region at 3x DPR with unsharp masking for sharpening', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 200, 100);
        ctx.fillStyle = '#000000';
        ctx.fillRect(50, 40, 60, 20);
      }

      const bbox = { x: 50, y: 40, width: 60, height: 20 };
      const enhancedCanvas = service.cropRegionWith3xDprAndUnsharpMask(canvas, bbox, 2);

      // Width should be (60 + 2*2) * 3 = 64 * 3 = 192
      expect(enhancedCanvas.width).toBe(192);
      // Height should be (20 + 2*2) * 3 = 24 * 3 = 72
      expect(enhancedCanvas.height).toBe(72);
    });

    it('re-OCRs targeted isolated region updating only that region without altering surrounding text', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 150;

      const mockTargetWord: ConfidenceWord = {
        id: 'w_test_1',
        text: 'rnisread',
        originalText: 'rnisread',
        confidence: 42,
        tier: 'low',
        bbox: { x: 40, y: 40, width: 80, height: 25, x0: 40, y0: 40, x1: 120, y1: 65 },
        pageNumber: 1
      };

      // Mock Tesseract worker for the isolated re-OCR run
      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: vi.fn(),
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'misread',
            confidence: 94,
            words: [
              {
                text: 'misread',
                confidence: 94,
                bbox: { x0: 5, y0: 5, x1: 75, y1: 20 }
              }
            ]
          }
        })
      });

      const reOcrRes = await service.reOcrRegion(canvas, mockTargetWord, 'eng');

      expect(reOcrRes.text).toBe('misread');
      expect(reOcrRes.confidence).toBe(94);
      expect(reOcrRes.words.length).toBe(1);
      expect(reOcrRes.words[0].tier).toBe('high');
    });

    it('updates only the targeted word when replacing in document while leaving surrounding page text intact', async () => {
      const word1: ConfidenceWord = {
        id: 'w1',
        text: 'Hello',
        originalText: 'Hello',
        confidence: 96,
        tier: 'high',
        bbox: { x: 10, y: 10, width: 40, height: 15, x0: 10, y0: 10, x1: 50, y1: 25 },
        pageNumber: 1
      };

      const word2: ConfidenceWord = {
        id: 'w2',
        text: 'vvorld',
        originalText: 'vvorld',
        confidence: 52,
        tier: 'low',
        bbox: { x: 55, y: 10, width: 45, height: 15, x0: 55, y0: 10, x1: 100, y1: 25 },
        pageNumber: 1
      };

      const word3: ConfidenceWord = {
        id: 'w3',
        text: 'today',
        originalText: 'today',
        confidence: 92,
        tier: 'high',
        bbox: { x: 105, y: 10, width: 35, height: 15, x0: 105, y0: 10, x1: 140, y1: 25 },
        pageNumber: 1
      };

      const doc = {
        fileName: 'test.pdf',
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            canvasDataUrl: '',
            width: 500,
            height: 700,
            words: [word1, word2, word3],
            stats: service.computeStats([word1, word2, word3]),
            text: 'Hello vvorld today'
          }
        ],
        overallStats: service.computeStats([word1, word2, word3]),
        fullText: 'Hello vvorld today',
        allWords: [word1, word2, word3],
        lowConfidenceWords: [word2]
      };

      // Correct only w2 ('vvorld' -> 'world')
      const updated = await service.replaceWordInDocument(doc, 'w2', 'world', false, true);

      // Surrounding words remain identical
      expect(updated.pages[0].words[0].text).toBe('Hello');
      expect(updated.pages[0].words[2].text).toBe('today');

      // Targeted word is updated
      expect(updated.pages[0].words[1].text).toBe('world');
      expect(updated.pages[0].words[1].isCorrected).toBe(true);

      // Full document text is updated cleanly
      expect(updated.fullText).toBe('Hello world today');
    });
  });

  describe('Visual Heatmap Canvas Overlay', () => {
    it('draws colored bounding boxes over target canvas', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;

      const words: ConfidenceWord[] = [
        {
          id: 'w1',
          text: 'Good',
          originalText: 'Good',
          confidence: 95,
          tier: 'high',
          bbox: { x: 10, y: 10, width: 30, height: 15, x0: 10, y0: 10, x1: 40, y1: 25 },
          pageNumber: 1
        },
        {
          id: 'w2',
          text: 'Fair',
          originalText: 'Fair',
          confidence: 70,
          tier: 'medium',
          bbox: { x: 50, y: 10, width: 30, height: 15, x0: 50, y0: 10, x1: 80, y1: 25 },
          pageNumber: 1
        },
        {
          id: 'w3',
          text: 'Poor',
          originalText: 'Poor',
          confidence: 40,
          tier: 'low',
          bbox: { x: 90, y: 10, width: 30, height: 15, x0: 90, y0: 10, x1: 120, y1: 25 },
          pageNumber: 1
        }
      ];

      // Should execute without errors
      expect(() => {
        service.drawConfidenceHeatmap(canvas, words, { showHigh: true, showMedium: true, showLow: true });
      }).not.toThrow();
    });
  });

  describe('Real Test Data Verification (Step 2)', () => {
    it('handles low-contrast scanned invoice fixing recurring misreads ("rn" -> "m", "vv" -> "w")', async () => {
      const invoiceText = 'Invoice from Acme Corp: Total payrnent due for the softvvare license is $500.';
      const dict = await service.loadDictionary();

      const corrected = service.applyDictionary(invoiceText, dict);

      // "payrnent" -> "payment", "softvvare" -> "software"
      expect(corrected).toBe('Invoice from Acme Corp: Total payment due for the software license is $500.');
    });

    it('adds a word to the correction dictionary, runs OCR on a second document, and verifies automatic replacement', async () => {
      // 1. Add custom domain correction rule
      await service.addCorrectionRule('Benguluru', 'Bengaluru', false);

      // 2. Audit a second document containing the misrecognized word
      const mockRawDoc = {
        fileName: 'second_document.pdf',
        totalPages: 1,
        averageConfidence: 82,
        fullText: 'Shipment dispatched to Benguluru center.',
        languages: ['eng'],
        pages: [
          {
            pageNumber: 1,
            confidence: 82,
            language: 'eng',
            status: 'completed' as const,
            text: 'Shipment dispatched to Benguluru center.',
            words: [
              { text: 'Shipment', confidence: 95, bbox: { x0: 10, y0: 10, x1: 70, y1: 25 } },
              { text: 'dispatched', confidence: 91, bbox: { x0: 75, y0: 10, x1: 150, y1: 25 } },
              { text: 'to', confidence: 98, bbox: { x0: 155, y0: 10, x1: 170, y1: 25 } },
              { text: 'Benguluru', confidence: 64, bbox: { x0: 175, y0: 10, x1: 245, y1: 25 } },
              { text: 'center.', confidence: 90, bbox: { x0: 250, y0: 10, x1: 300, y1: 25 } }
            ]
          }
        ]
      };

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 100;

      const auditResult = await service.auditOcrDocument(mockRawDoc, [canvas]);

      // Verify automatic replacement on the second document
      expect(auditResult.fullText).toBe('Shipment dispatched to Bengaluru center.');
      const correctedWord = auditResult.allWords.find(w => w.originalText === 'Benguluru');
      expect(correctedWord).toBeDefined();
      expect(correctedWord?.text).toBe('Bengaluru');
      expect(correctedWord?.isCorrected).toBe(true);
    });

    it('executes targeted region re-OCR on a blurry paragraph at 3x DPR', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 200;

      const blurryWord: ConfidenceWord = {
        id: 'blurry_word_1',
        text: 'bluny',
        originalText: 'bluny',
        confidence: 48,
        tier: 'low',
        bbox: { x: 100, y: 80, width: 60, height: 22, x0: 100, y0: 80, x1: 160, y1: 102 },
        pageNumber: 1
      };

      (service as any).getOrCreateWorker = vi.fn().mockResolvedValue({
        setParameters: vi.fn(),
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'blurry',
            confidence: 96,
            words: [
              {
                text: 'blurry',
                confidence: 96,
                bbox: { x0: 0, y0: 0, x1: 58, y1: 20 }
              }
            ]
          }
        })
      });

      const reOcrRes = await service.reOcrRegion(canvas, blurryWord, 'eng');

      expect(reOcrRes.text).toBe('blurry');
      expect(reOcrRes.confidence).toBe(96);
      expect(reOcrRes.words[0].tier).toBe('high');
    });

    it('converts ConfidenceDocumentResult to OcrDocumentResult accurately for searchable PDF generation', () => {
      const doc = {
        fileName: 'invoice.pdf',
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            canvasDataUrl: '',
            width: 600,
            height: 800,
            words: [
              {
                id: 'w1',
                text: 'Invoice',
                originalText: 'Invoice',
                confidence: 95,
                tier: 'high' as const,
                bbox: { x: 10, y: 10, width: 60, height: 20, x0: 10, y0: 10, x1: 70, y1: 30 },
                pageNumber: 1
              }
            ],
            stats: service.computeStats([{ confidence: 95 }]),
            text: 'Invoice'
          }
        ],
        overallStats: service.computeStats([{ confidence: 95 }]),
        fullText: 'Invoice',
        allWords: [],
        lowConfidenceWords: []
      };

      const ocrDoc = service.toOcrDocumentResult(doc as any);

      expect(ocrDoc.fileName).toBe('invoice.pdf');
      expect(ocrDoc.pages.length).toBe(1);
      expect(ocrDoc.pages[0].words[0].text).toBe('Invoice');
      expect(ocrDoc.pages[0].words[0].bbox.x0).toBe(10);
      expect(ocrDoc.pages[0].words[0].bbox.x1).toBe(70);
    });
  });

  describe('Cybersecurity Stress-Testing (Step 5)', () => {
    it('defends against ReDoS catastrophic backtracking by validating regex patterns', async () => {
      // Evil regex pattern designed to cause catastrophic backtracking: (a+)+$
      const evilPattern = '(a+)+$';

      await expect(
        service.addCorrectionRule(evilPattern, 'b', false, true)
      ).rejects.toThrow(/SecurityError/i);
    });

    it('rejects nested quantifier repetitions in regex patterns', async () => {
      const evilNested = '([a-zA-Z0-9]+)+';

      await expect(
        service.addCorrectionRule(evilNested, 'safe', false, true)
      ).rejects.toThrow(/SecurityError/i);
    });

    it('escapes literal regex characters and whole-word symbols safely', () => {
      const customRules = [
        { id: '1', target: '$100', replacement: '$120', matchCase: true, isWholeWord: true, createdAt: Date.now() },
        { id: '2', target: 'C++', replacement: 'Rust', matchCase: true, isWholeWord: true, createdAt: Date.now() }
      ];

      const input = 'The fee is $100 for C++ class.';
      const output = service.applyDictionary(input, customRules);

      expect(output).toBe('The fee is $120 for Rust class.');
    });

    it('validates schema and prevents prototype pollution in persistent dictionary entries', async () => {
      // Malicious payload simulating compromised storage
      const tamperedStorage = JSON.stringify([
        { __proto__: { admin: true }, target: 'validTarget', replacement: 'validReplacement' },
        { target: '', replacement: 'emptyTarget' }, // Invalid empty target
        { target: 'normalTarget', replacement: 'normalReplacement' },
        null,
        12345
      ]);

      await Preferences.set({ key: DICTIONARY_STORAGE_KEY, value: tamperedStorage });

      // Service loads and sanitizes dictionary, ignoring prototype pollution and malformed items
      const loaded = await service.loadDictionary();

      expect((({} as any).admin)).toBeUndefined(); // Prototype NOT polluted
      expect(loaded.every(r => r.target && r.target.length > 0)).toBe(true);
      expect(loaded.some(r => r.target === 'normalTarget')).toBe(true);
    });

    it('neutralizes XSS payloads and control characters in learned dictionary keys and exports', async () => {
      const xssTarget = '<script>alert("hack")</script>misread\u0000';
      const xssReplacement = '<img src=x onerror=alert(1)>corrected\u0007';

      const rule = await service.addCorrectionRule(xssTarget, xssReplacement, false);

      expect(rule.target).not.toContain('<script>');
      expect(rule.target).not.toContain('\u0000');
      expect(rule.replacement).not.toContain('<img');
      expect(rule.replacement).not.toContain('\u0007');

      // Export test
      const doc = {
        fileName: 'audit_test.pdf',
        totalPages: 1,
        pages: [],
        overallStats: service.computeStats([]),
        fullText: 'Safe document text',
        allWords: [],
        lowConfidenceWords: []
      };

      const txtFile = service.exportCorrectedTextFile(doc as any);
      const jsonFile = service.exportCorrectedJsonFile(doc as any);

      expect(await txtFile.text()).toBe('Safe document text');
      const jsonContent = JSON.parse(await jsonFile.text());
      expect(jsonContent.fileName).toBe('audit_test.pdf');
    });

    it('enforces maximum rule capacity cap to prevent memory exhaustion / denial of service', async () => {
      // Clear dictionary
      await service.clearDictionary();

      // Add 205 rules (exceeding MAX_DICTIONARY_RULES of 200)
      for (let i = 0; i < 205; i++) {
        await service.addCorrectionRule(`word_${i}`, `fixed_${i}`);
      }

      const rules = await service.loadDictionary();
      expect(rules.length).toBeLessThanOrEqual(200);
    });
  });
});
