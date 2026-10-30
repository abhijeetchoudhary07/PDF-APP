import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { StructuredExtractPage } from './structured-extract.page';
import { StructuredExtractionService } from '../../core/services/structured-extraction.service';
import { TranslationService } from '../../core/services/translation.service';
import { ExtractedField, StructuredExtractionResult } from '../../core/models/structured-extraction.types';

describe('StructuredExtractPage — Mobile Play Store UI / UX', () => {
  let component: StructuredExtractPage;
  let fixture: ComponentFixture<StructuredExtractPage>;
  let mockStructuredService: {
    extract: any;
    exportToCsv: any;
    exportToJson: any;
  };

  const sampleResult: StructuredExtractionResult = {
    documentCategory: 'RECEIPT',
    categoryLabel: 'Receipt',
    categoryConfidence: 90,
    pageCount: 1,
    summary: {
      totalDetectedFields: 3,
      highConfidenceCount: 2,
      lowConfidenceCount: 1,
      absentCount: 1
    },
    fields: [
      {
        key: 'date',
        label: 'Document Date',
        value: '2026-10-28',
        confidence: 95,
        pageNumber: 1,
        boundingBox: { x: 50, y: 100, width: 120, height: 24 },
        isAbsent: false,
        isLowConfidence: false
      },
      {
        key: 'grandTotal',
        label: 'Grand Total',
        value: '₹850.00',
        confidence: 90,
        pageNumber: 1,
        boundingBox: { x: 50, y: 350, width: 140, height: 28 },
        isAbsent: false,
        isLowConfidence: false
      },
      {
        key: 'taxAmount',
        label: 'Tax / GST / VAT',
        value: '₹42.50',
        confidence: 75, // low confidence (<80%)
        pageNumber: 1,
        boundingBox: { x: 50, y: 300, width: 100, height: 20 },
        isAbsent: false,
        isLowConfidence: true
      },
      {
        key: 'customerName',
        label: 'Customer / Billed-To Name',
        value: null,
        confidence: 0,
        pageNumber: 1,
        boundingBox: null,
        isAbsent: true,
        isLowConfidence: true
      }
    ]
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockStructuredService = {
      extract: vi.fn().mockReturnValue(sampleResult),
      sanitizeString: vi.fn().mockImplementation((s: string) => s),
      exportToCsv: vi.fn().mockResolvedValue({
        file: new File(['mock-csv'], 'receipt-fields.csv', { type: 'text/csv' }),
        savedUri: 'file:///saved/receipt.csv'
      }),
      exportToJson: vi.fn().mockResolvedValue({
        file: new File(['{}'], 'receipt-fields.json', { type: 'application/json' }),
        savedUri: 'file:///saved/receipt.json'
      })
    };

    await TestBed.configureTestingModule({
      imports: [StructuredExtractPage],
      providers: [
        { provide: StructuredExtractionService, useValue: mockStructuredService },
        {
          provide: TranslationService,
          useValue: {
            currentLang: 'en',
            translate: (key: string) => key
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StructuredExtractPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
    expect(component.zoomScale).toBe(1.0);
    expect(component.bottomSheetBreakpoint).toBe(0.45);
  });

  it('should switch bottom sheet breakpoints correctly [0, 0.45, 0.85]', () => {
    component.setBreakpoint(0.85);
    expect(component.bottomSheetBreakpoint).toBe(0.85);

    component.setBreakpoint(0.45);
    expect(component.bottomSheetBreakpoint).toBe(0.45);

    component.toggleBottomSheet(); // from 0.45 toggles to 0.85
    expect(component.bottomSheetBreakpoint).toBe(0.85);

    component.toggleBottomSheet(); // from 0.85 toggles back to 0.45
    expect(component.bottomSheetBreakpoint).toBe(0.45);
  });

  it('should zoom and smooth-center viewport on focused field', () => {
    component.extractionResult = sampleResult;
    const totalField = sampleResult.fields[1]; // Grand Total

    component.focusField(totalField);
    expect(component.selectedField).toBe(totalField);
    expect(component.zoomScale).toBeGreaterThan(1.0);
  });

  it('should reset zoom to 1.0 on resetZoom()', () => {
    component.zoomScale = 2.5;
    component.panX = 120;
    component.panY = -80;

    component.resetZoom();
    expect(component.zoomScale).toBe(1.0);
    expect(component.panX).toBe(0);
    expect(component.panY).toBe(0);
  });

  it('should update field value inline and upgrade user-verified confidence', () => {
    component.extractionResult = sampleResult;
    const taxField = sampleResult.fields[2]; // confidence 75%
    expect(taxField.confidence).toBe(75);

    component.onFieldValueChange(taxField, '₹50.00');
    expect(taxField.value).toBe('₹50.00');
    expect(taxField.userEdited).toBe(true);
    expect(taxField.confidence).toBe(90);
    expect(taxField.isLowConfidence).toBe(false);
  });

  it('should export to CSV and JSON using StructuredExtractionService', async () => {
    component.extractionResult = sampleResult;
    component.selectedFile = new File(['test'], 'bill.pdf', { type: 'application/pdf' });

    await component.exportCsv();
    expect(mockStructuredService.exportToCsv).toHaveBeenCalled();

    await component.exportJson();
    expect(mockStructuredService.exportToJson).toHaveBeenCalled();
  });
});
