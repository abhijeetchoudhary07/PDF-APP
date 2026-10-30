import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { EntityClauseExtractPage } from './entity-clause-extract.page';
import { EntityClauseExtractionService } from '../../core/services/entity-clause-extraction.service';
import { StorageService } from '../../core/services/storage.service';
import { TranslationService } from '../../core/services/translation.service';
import { LEGAL_DISCLAIMER } from '../../core/models/entity-clause.types';

describe('EntityClauseExtractPage — P6 Mobile Play Store UI / UX', () => {
  let component: EntityClauseExtractPage;
  let fixture: ComponentFixture<EntityClauseExtractPage>;
  let mockEntityService: any;
  let mockStorageService: any;
  let mockTranslationService: any;

  const mockExtractionResult = {
    entities: [
      {
        id: 'date-1',
        type: 'date',
        label: 'Effective Date',
        value: '15/10/2024',
        pageNumber: 1,
        boundingBox: { x: 100, y: 150, width: 80, height: 16, pageNumber: 1 },
        confidence: 94
      },
      {
        id: 'amount-1',
        type: 'amount',
        label: 'Total Amount',
        value: '$50,000 USD',
        pageNumber: 1,
        boundingBox: { x: 200, y: 250, width: 90, height: 16, pageNumber: 1 },
        confidence: 95
      },
      {
        id: 'party-1',
        type: 'party',
        label: 'First Party',
        value: 'Acme Innovations Ltd',
        pageNumber: 1,
        boundingBox: { x: 80, y: 80, width: 140, height: 16, pageNumber: 1 },
        confidence: 90
      },
      {
        id: 'deadline-1',
        type: 'deadline',
        label: 'Performance Window',
        value: 'within 30 days',
        pageNumber: 2,
        boundingBox: { x: 120, y: 300, width: 110, height: 16, pageNumber: 2 },
        confidence: 92
      }
    ],
    clauses: [
      {
        id: 'clause-1',
        category: 'obligation',
        categoryLabel: 'Obligations',
        text: 'The Contractor shall deliver the final deliverables within 30 days.',
        modalMarkers: ['shall', 'within 30 days'],
        pageNumber: 2,
        boundingBox: { x: 50, y: 300, width: 400, height: 20, pageNumber: 2 },
        confidence: 90
      },
      {
        id: 'clause-2',
        category: 'penalty',
        categoryLabel: 'Penalties',
        text: 'In the event of unexcused delay, a penalty of $500 per day shall apply.',
        modalMarkers: ['penalty', 'shall'],
        pageNumber: 1,
        boundingBox: { x: 50, y: 400, width: 420, height: 20, pageNumber: 1 },
        confidence: 95
      }
    ],
    pageCount: 2,
    rawText: 'Mock raw text',
    summary: {
      totalEntities: 4,
      totalClauses: 2,
      amountsCount: 1,
      datesDeadlinesCount: 2,
      partiesCount: 1,
      clausesCount: 2
    },
    metadata: {
      fileName: 'contract.pdf',
      extractedAt: new Date().toISOString(),
      executionTimeMs: 12,
      disclaimer: LEGAL_DISCLAIMER
    }
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///mock/path/file.csv')
    };

    mockTranslationService = {
      currentLang: 'en',
      translate: (key: string) => key
    };

    mockEntityService = {
      DISCLAIMER: LEGAL_DISCLAIMER,
      extract: vi.fn().mockReturnValue(mockExtractionResult),
      exportToCsv: vi.fn().mockResolvedValue({ file: { name: 'extracted.csv' } }),
      exportToJson: vi.fn().mockResolvedValue({ file: { name: 'extracted.json' } }),
      generatePrintableReport: vi.fn().mockReturnValue('<html><body>Report</body></html>')
    };

    await TestBed.configureTestingModule({
      imports: [EntityClauseExtractPage],
      providers: [
        { provide: EntityClauseExtractionService, useValue: mockEntityService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: TranslationService, useValue: mockTranslationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EntityClauseExtractPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('strictly displays the honesty gate disclaimer in the DOM', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const disclaimerBanner = compiled.querySelector('.honesty-disclaimer-banner');
    expect(disclaimerBanner).toBeTruthy();
    expect(disclaimerBanner?.textContent).toContain(
      'Information extraction only. This tool finds text patterns and does not provide legal advice.'
    );
  });

  it('populates and filters items when segmented tabs are switched', () => {
    component.selectedFile = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
    component.extractionResult = mockExtractionResult as any;
    fixture.detectChanges();

    // Default tab: 'amounts'
    expect(component.activeTab).toBe('amounts');
    expect(component.currentTabItems.length).toBe(1);
    expect((component.currentTabItems[0] as any).value).toBe('$50,000 USD');

    // Switch to 'datesDeadlines'
    component.setActiveTab('datesDeadlines');
    expect(component.activeTab).toBe('datesDeadlines');
    expect(component.currentTabItems.length).toBe(2);

    // Switch to 'parties'
    component.setActiveTab('parties');
    expect(component.activeTab).toBe('parties');
    expect(component.currentTabItems.length).toBe(1);
    expect((component.currentTabItems[0] as any).value).toBe('Acme Innovations Ltd');

    // Switch to 'clauses'
    component.setActiveTab('clauses');
    expect(component.activeTab).toBe('clauses');
    expect(component.currentTabItems.length).toBe(2);
  });

  it('jumps to item, changes page if necessary, and opens popover', async () => {
    component.selectedFile = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
    component.extractionResult = mockExtractionResult as any;
    component.totalPages = 2;
    component.currentPage = 1;

    const setPageSpy = vi.spyOn(component, 'setPage').mockResolvedValue();

    // Item on page 2
    const targetClause = mockExtractionResult.clauses[0]; // page 2
    await component.jumpToItem(targetClause as any);

    expect(setPageSpy).toHaveBeenCalledWith(2);
    expect(component.selectedItem).toBe(targetClause);
    expect(component.showPopover).toBe(true);
    expect(component.popoverCoords.x).toBeGreaterThan(0);
  });

  it('triggers CSV and JSON export methods properly', async () => {
    component.selectedFile = new File(['dummy'], 'contract.pdf', { type: 'application/pdf' });
    component.extractionResult = mockExtractionResult as any;

    await component.exportCsv();
    expect(mockEntityService.exportToCsv).toHaveBeenCalledWith(mockExtractionResult, 'contract-entities-clauses.csv');

    await component.exportJson();
    expect(mockEntityService.exportToJson).toHaveBeenCalledWith(mockExtractionResult, 'contract-entities-clauses.json');
  });

  it('triggers printable summary report', () => {
    component.selectedFile = new File(['dummy'], 'contract.pdf', { type: 'application/pdf' });
    component.extractionResult = mockExtractionResult as any;

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn()
      },
      focus: vi.fn(),
      print: vi.fn()
    } as any);

    component.printSummaryReport();
    expect(mockEntityService.generatePrintableReport).toHaveBeenCalledWith(mockExtractionResult);
    expect(openSpy).toHaveBeenCalled();
  });
});
