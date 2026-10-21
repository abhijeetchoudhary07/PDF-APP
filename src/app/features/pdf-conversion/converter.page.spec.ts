import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ConverterPage } from './converter.page';
import { ConversionRegistryService } from '../../core/conversion/conversion-registry.service';

describe('ConverterPage with J1-J5 Converters', () => {
  let page: ConverterPage;
  let registry: ConversionRegistryService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({
              get: (key: string) => (key === 'converterId' ? 'pdf-to-markdown' : null)
            })
          }
        }
      ]
    });

    registry = TestBed.inject(ConversionRegistryService);
    page = TestBed.runInInjectionContext(() => new ConverterPage());
    page.ngOnInit();
  });

  it('should initialize with pdf-to-markdown converter', () => {
    expect(page.converterId).toBe('pdf-to-markdown');
    expect(page.converter).toBeDefined();
    expect(page.converter?.id).toBe('pdf-to-markdown');
    expect(page.options.imageMode).toBe('inline');
  });

  it('should resolve all J1 to J5 converter metadata', () => {
    const ids = [
      'pdf-to-markdown',
      'pdf-to-html',
      'pdf-to-epub',
      'markdown-to-pdf',
      'json-to-pdf',
      'xml-to-pdf',
      'yaml-to-pdf',
      'eml-to-pdf',
      'msg-to-pdf'
    ];

    for (const id of ids) {
      const conv = registry.getConverter(id);
      expect(conv, `Converter ${id} should be registered`).toBeDefined();
      expect(conv?.metadata.name).toBeTruthy();
      expect(conv?.metadata.sourceFormats.length).toBeGreaterThan(0);
      expect(conv?.metadata.targetFormat).toBeTruthy();
    }
  });

  it('should reset state cleanly', () => {
    page.selectedFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    page.textInput = '# Heading';
    page.clearAll();

    expect(page.selectedFile).toBeUndefined();
    expect(page.textInput).toBe('');
    expect(page.isProcessing).toBe(false);
    expect(page.result).toBeUndefined();
  });
});
