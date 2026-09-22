import { describe, it, expect, beforeEach } from 'vitest';
import { OcrService } from './ocr.service';
import { OCR_SUPPORTED_LANGUAGES, OcrDocumentResult } from '../models/ocr.models';

describe('OcrService', () => {
  let service: OcrService;

  beforeEach(() => {
    service = new OcrService();
  });

  describe('Language Configuration', () => {
    it('should support all 5 required languages (eng, hin, mar, ben, pan)', () => {
      const codes = OCR_SUPPORTED_LANGUAGES.map(l => l.code);
      expect(codes).toContain('eng');
      expect(codes).toContain('hin');
      expect(codes).toContain('mar');
      expect(codes).toContain('ben');
      expect(codes).toContain('pan');
      expect(codes.length).toBe(5);
    });

    it('should have proper native names for languages', () => {
      const hin = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'hin');
      const mar = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'mar');
      const ben = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'ben');
      const pan = OCR_SUPPORTED_LANGUAGES.find(l => l.code === 'pan');

      expect(hin?.nativeName).toBe('हिन्दी');
      expect(mar?.nativeName).toBe('मराठी');
      expect(ben?.nativeName).toBe('বাংলা');
      expect(pan?.nativeName).toBe('ਪੰਜਾਬੀ');
    });
  });

  describe('Export Generators', () => {
    const mockResult: OcrDocumentResult = {
      fileName: 'test_doc.pdf',
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'GOVERNMENT OF INDIA\nSTAFF SELECTION COMMISSION',
          confidence: 94,
          words: [
            { text: 'GOVERNMENT', confidence: 95, bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } },
            { text: 'OF', confidence: 98, bbox: { x0: 105, y0: 10, x1: 120, y1: 30 } },
            { text: 'INDIA', confidence: 96, bbox: { x0: 125, y0: 10, x1: 160, y1: 30 } }
          ],
          language: 'eng',
          status: 'completed'
        }
      ],
      fullText: 'GOVERNMENT OF INDIA\nSTAFF SELECTION COMMISSION',
      averageConfidence: 94,
      languages: ['eng']
    };

    it('should generate plain text file with correct content', async () => {
      const txtFile = service.generateTextFile(mockResult, 'test_doc.pdf');
      expect(txtFile).toBeDefined();
      expect(txtFile.name).toBe('test_doc_ocr.txt');
      expect(txtFile.type).toBe('text/plain');

      const content = await txtFile.text();
      expect(content).toContain('GOVERNMENT OF INDIA');
    });

    it('should generate structured JSON file with words and bounding boxes', async () => {
      const jsonFile = service.generateJsonFile(mockResult, 'test_doc.pdf');
      expect(jsonFile).toBeDefined();
      expect(jsonFile.name).toBe('test_doc_ocr_structured.json');
      expect(jsonFile.type).toBe('application/json');

      const content = JSON.parse(await jsonFile.text());
      expect(content.averageConfidence).toBe(94);
      expect(content.pages[0].words.length).toBe(3);
    });

    it('should cancel active job properly', () => {
      expect(() => service.cancelJob()).not.toThrow();
    });
  });
});
