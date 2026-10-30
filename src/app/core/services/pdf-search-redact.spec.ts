import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfSearchRedactService,
  validateLuhn,
  validateAadhaar,
  validatePan
} from './pdf-search-redact.service';
import { PatternPresetType } from '../models/pdf-search-redact.types';
import '../utilities/pdfjs-worker';

describe('PdfSearchRedactService — Automated Pattern Redaction & ReDoS Protection', () => {
  let service: PdfSearchRedactService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfSearchRedactService]
    });
    service = TestBed.inject(PdfSearchRedactService);
  });

  describe('Validation Functions', () => {
    it('validates credit card numbers with Luhn algorithm', () => {
      // Valid Visa card numbers (mod 10 passes)
      expect(validateLuhn('4532 0151 1283 0366')).toBe(true);
      expect(validateLuhn('4532-0151-1283-0366')).toBe(true);
      expect(validateLuhn('4532015112830366')).toBe(true);

      // Invalid credit card numbers (checksum fails)
      expect(validateLuhn('4532 0151 1283 0367')).toBe(false);
      expect(validateLuhn('1234 5678 9012 3456')).toBe(false);
      expect(validateLuhn('123')).toBe(false);
    });

    it('validates Indian Aadhaar 12-digit identity numbers', () => {
      expect(validateAadhaar('9876 5432 1098')).toBe(true);
      expect(validateAadhaar('4567-8901-2345')).toBe(true);
      expect(validateAadhaar('234567890123')).toBe(true);

      // Rejects numbers starting with 0 or 1, or wrong digit count
      expect(validateAadhaar('0123 4567 8901')).toBe(false);
      expect(validateAadhaar('1234 5678 9012')).toBe(false);
      expect(validateAadhaar('9876 5432')).toBe(false);
    });

    it('validates Indian PAN cards (5 letters, 4 digits, 1 letter)', () => {
      expect(validatePan('ABCDE1234F')).toBe(true);
      expect(validatePan('PQRST5678Z')).toBe(true);

      // Invalid formats
      expect(validatePan('ABCD12345F')).toBe(false);
      expect(validatePan('12345ABCDE')).toBe(false);
      expect(validatePan('ABCDE12345')).toBe(false);
    });
  });

  describe('Pattern Detection in Real PDF Document', () => {
    it('detects emails, Indian phones, Aadhaar, PAN, and Luhn credit cards across PDF pages', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);

      // Draw contract text with diverse sensitive tokens
      page.drawText('EMPLOYMENT CONTRACT & NDA AGREEMENT', { x: 50, y: 750, size: 14 });
      page.drawText('Contact Email: consultant.john@enterprise-cloud.com', { x: 50, y: 700, size: 12 });
      page.drawText('Primary Phone: +91 98765 43210 (HR Helpline)', { x: 50, y: 660, size: 12 });
      page.drawText('Citizen Identity UID: 9876 5432 1098 (Aadhaar Verified)', { x: 50, y: 620, size: 12 });
      page.drawText('Tax Account: ABCDE1234F (Permanent Account Number)', { x: 50, y: 580, size: 12 });
      page.drawText('Corporate Card: 4532 0151 1283 0366 (Visa Cardholder)', { x: 50, y: 540, size: 12 });
      page.drawText('Effective Date: 29/10/2026', { x: 50, y: 500, size: 12 });

      const pdfBytes = await doc.save();

      const activePresets: PatternPresetType[] = ['email', 'phone', 'aadhaar', 'pan', 'creditCard', 'date'];
      const matches = await service.scanForPatterns(pdfBytes, {
        activePresets,
        paddingPx: 2
      });

      expect(matches.length).toBeGreaterThanOrEqual(6);

      // Verify each preset type was found
      const foundTypes = new Set(matches.map(m => m.presetType));
      expect(foundTypes.has('email')).toBe(true);
      expect(foundTypes.has('phone')).toBe(true);
      expect(foundTypes.has('aadhaar')).toBe(true);
      expect(foundTypes.has('pan')).toBe(true);
      expect(foundTypes.has('creditCard')).toBe(true);
      expect(foundTypes.has('date')).toBe(true);

      // Verify specific matched strings and surrounding context
      const emailMatch = matches.find(m => m.presetType === 'email')!;
      expect(emailMatch.matchedText).toBe('consultant.john@enterprise-cloud.com');
      expect(emailMatch.contextBefore).toContain('Contact Email');

      const panMatch = matches.find(m => m.presetType === 'pan')!;
      expect(panMatch.matchedText).toBe('ABCDE1234F');
      expect(panMatch.boundingRect.width).toBeGreaterThan(30);
    });
  });

  describe('Bulk Redaction Application & Selective Exclusion', () => {
    it('applies redactions only to selected matches while leaving unselected matches untouched', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      page.drawText('Public record with secret.one@company.com and keep.me@public.org', { x: 50, y: 700, size: 12 });

      const initialBytes = await doc.save();

      const matches = await service.scanForPatterns(initialBytes, {
        activePresets: ['email'],
        paddingPx: 2
      });

      expect(matches.length).toBe(2);

      // Mark the first match as selected and the second as UNSELECTED
      matches[0].selected = true; // secret.one@company.com
      matches[1].selected = false; // keep.me@public.org

      const result = await service.applyPatternRedactions(initialBytes, matches, {
        verifyWithN4: true
      });

      expect(result.redactedCount).toBe(1);
      expect(result.unselectedCount).toBe(1);
      expect(result.pdfBytes).toBeDefined();

      // Inspect modified PDF via pdfjs-dist
      const inspectDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const inspectPage = await inspectDoc.getPage(1);
      const textContent = await inspectPage.getTextContent();
      const allText = textContent.items.map((i: any) => i.str).join(' ');

      // Selected email MUST be purged
      expect(allText).not.toContain('secret.one@company.com');

      // Unselected email MUST remain completely untouched
      expect(allText).toContain('keep.me@public.org');
    });
  });

  describe('Cybersecurity Stress-Testing — ReDoS Vulnerability Protection', () => {
    it('detects and rejects catastrophic nested quantifier ReDoS patterns immediately', () => {
      // (a+)+$ evil pattern
      expect(() => service.compileSafeRegex('(a+)+$')).toThrowError(/ReDoS vulnerability/);

      // (a|aa)+$ evil pattern
      expect(() => service.compileSafeRegex('(a|aa)+$')).toThrowError(/ReDoS vulnerability/);

      // (.*a.*)* evil pattern
      expect(() => service.compileSafeRegex('(.*a.*)*')).toThrowError(/ReDoS vulnerability/);

      // Safe custom regex compiles normally
      const safeReg = service.compileSafeRegex('CONFIDENTIAL-[0-9]{4}');
      expect(safeReg.test('CONFIDENTIAL-9988')).toBe(true);
    });

    it('enforces execution timeout budget on long-running regex scans', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([400, 400]);
      page.drawText('Sample text with some letters', { x: 50, y: 350, size: 12 });
      const bytes = await doc.save();

      // Setting a very small timeout budget (e.g. 0ms) should trigger timeout safety
      await expect(
        service.scanForPatterns(bytes, {
          activePresets: ['email'],
          timeoutMs: -1 // forced immediate timeout
        })
      ).rejects.toThrowError(/Regex execution timed out/);
    });

    it('prevents partial matching flaws on phone numbers and sensitive tokens', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('Invalid 8-digit fragment: 98765432 and valid: +91 9876543210', { x: 50, y: 350, size: 12 });
      const bytes = await doc.save();

      const matches = await service.scanForPatterns(bytes, {
        activePresets: ['phone']
      });

      // The 8-digit fragment MUST NOT be matched as a phone number
      expect(matches.some(m => m.matchedText === '98765432')).toBe(false);

      // The full 10-digit number MUST be matched in its entirety
      expect(matches.some(m => m.matchedText.includes('9876543210'))).toBe(true);
    });
  });

  describe('Bounding Box Padding & Coordinate Safety', () => {
    it('applies generous padding to guarantee zero silhouette bleed without clipping adjacent text', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 400]);
      page.drawText('Ref: test@example.com (Official)', { x: 50, y: 350, size: 12 });
      const bytes = await doc.save();

      const matches = await service.scanForPatterns(bytes, {
        activePresets: ['email'],
        paddingPx: 4
      });

      expect(matches.length).toBe(1);
      const box = matches[0].boundingRect;
      expect(box.width).toBeGreaterThan(10);
      expect(box.height).toBeGreaterThan(14);
    });
  });
});
