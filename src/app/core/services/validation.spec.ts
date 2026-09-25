import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { SUPPORTED_IMAGE_TYPES, ValidationService } from './validation.service';

/*
 * The first thing a chosen file meets.
 *
 * Two properties matter here. It has to accept files that are fine — a phone
 * gallery hands over plenty of images with an empty or odd MIME type, and
 * rejecting those would make the app look broken on exactly the devices it is
 * for. And when it refuses, the reason has to be a sentence in the person's
 * language, not a translation key.
 */
describe('ValidationService', () => {
  let validation: ValidationService;
  let translation: TranslationService;

  function image(name: string, type: string, bytes: number): File {
    return new File([new Uint8Array(bytes)], name, { type });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    validation = TestBed.inject(ValidationService);
    translation = TestBed.inject(TranslationService);
  });

  describe('images', () => {
    it.each(SUPPORTED_IMAGE_TYPES)('accepts %s', type => {
      expect(validation.validateImage(image('photo.jpg', type, 1024)).valid).toBe(true);
    });

    it('accepts a file whose type the picker did not set, when the name says image', () => {
      // Android's document picker hands back an empty MIME type often enough
      // that rejecting on type alone would break the main flow.
      expect(validation.validateImage(image('scan.PNG', '', 1024)).valid).toBe(true);
      expect(validation.validateImage(image('scan.jpeg', 'application/octet-stream', 1024)).valid).toBe(true);
    });

    it('rejects an empty file', () => {
      const result = validation.validateImage(image('photo.jpg', 'image/jpeg', 0));
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects a missing file rather than throwing', () => {
      expect(validation.validateImage(undefined as unknown as File).valid).toBe(false);
    });

    it('rejects a format it cannot process', () => {
      expect(validation.validateImage(image('drawing.svg', 'image/svg+xml', 1024)).valid).toBe(false);
      expect(validation.validateImage(image('animation.gif', 'image/gif', 1024)).valid).toBe(false);
    });

    it('caps images at 50 MB', () => {
      expect(validation.validateImage(image('big.jpg', 'image/jpeg', 50 * 1024 * 1024)).valid).toBe(true);
      expect(validation.validateImage(image('big.jpg', 'image/jpeg', 50 * 1024 * 1024 + 1)).valid).toBe(false);
    });
  });

  describe('PDFs', () => {
    function pdf(name: string, type: string, bytes: number): File {
      return new File([new Uint8Array(bytes)], name, { type });
    }

    it('accepts by type or by name', () => {
      expect(validation.validatePdf(pdf('form.pdf', 'application/pdf', 1024)).valid).toBe(true);
      expect(validation.validatePdf(pdf('FORM.PDF', '', 1024)).valid).toBe(true);
    });

    it('rejects an empty or missing file', () => {
      expect(validation.validatePdf(pdf('form.pdf', 'application/pdf', 0)).valid).toBe(false);
      expect(validation.validatePdf(undefined as unknown as File).valid).toBe(false);
    });

    it('rejects something that is not a PDF', () => {
      expect(validation.validatePdf(pdf('photo.jpg', 'image/jpeg', 1024)).valid).toBe(false);
    });

    it('caps PDFs at 100 MB', () => {
      expect(validation.validatePdf(pdf('big.pdf', 'application/pdf', 100 * 1024 * 1024)).valid).toBe(true);
      expect(validation.validatePdf(pdf('big.pdf', 'application/pdf', 100 * 1024 * 1024 + 1)).valid).toBe(false);
    });
  });

  describe('the messages people actually read', () => {
    const cases: Array<[string, () => string | undefined]> = [
      ['empty image', () => validation.validateImage(image('a.jpg', 'image/jpeg', 0)).error],
      ['unsupported image', () => validation.validateImage(image('a.gif', 'image/gif', 10)).error],
      ['oversized image', () => validation.validateImage(image('a.jpg', 'image/jpeg', 51 * 1024 * 1024)).error],
      ['empty pdf', () => validation.validatePdf(new File([], 'a.pdf', { type: 'application/pdf' })).error],
      ['invalid pdf', () => validation.validatePdf(image('a.jpg', 'image/jpeg', 10)).error],
      ['oversized pdf', () => validation.validatePdf(image('a.pdf', 'application/pdf', 101 * 1024 * 1024)).error],
    ];

    it.each(cases)('%s resolves to a sentence, not a key', (_label, produce) => {
      const message = produce();
      expect(message).toBeTruthy();
      // TranslationService returns the key itself when it has no entry, so a
      // message that still looks like `validation.something` is a missing string.
      expect(message).not.toMatch(/^validation\./);
    });

    it('follows the selected language', () => {
      const english = validation.validateImage(image('a.gif', 'image/gif', 10)).error;
      translation.setLanguage('hi');
      const hindi = validation.validateImage(image('a.gif', 'image/gif', 10)).error;

      expect(hindi).toBeTruthy();
      expect(hindi).not.toBe(english);
    });
  });
});
