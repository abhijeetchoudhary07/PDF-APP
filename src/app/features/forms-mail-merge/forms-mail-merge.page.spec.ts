import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { FormsMailMergePage } from './forms-mail-merge.page';
import { PdfMailMergeService } from '../../core/services/pdf-mail-merge.service';
import { PdfFormDataService } from '../../core/services/pdf-form-data.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  CsvParsedData,
  MailMergeFieldMapping,
  MailMergeBatchResult
} from '../../core/models/pdf-forms.types';

describe('FormsMailMergePage', () => {
  let page: FormsMailMergePage;
  let mockMergeService: any;
  let mockFormDataService: any;
  let mockFileService: any;
  let mockBridgeService: any;
  let mockShareService: any;
  let mockStorageService: any;
  let mockToastCtrl: any;

  const sampleCsvData: CsvParsedData = {
    headers: ['fullName', 'email'],
    rows: [
      { fullName: 'Alice', email: 'alice@test.com' },
      { fullName: 'Bob', email: 'bob@test.com' }
    ],
    totalRows: 2
  };

  const sampleMappings: MailMergeFieldMapping[] = [
    { fieldName: 'fullName', fieldType: 'text', csvColumn: 'fullName', isAutoMatched: true, confidence: 1 },
    { fieldName: 'email', fieldType: 'text', csvColumn: 'email', isAutoMatched: true, confidence: 1 }
  ];

  const sampleBatchResult: MailMergeBatchResult = {
    totalRows: 2,
    successCount: 2,
    failedCount: 0,
    skippedCount: 0,
    rowResults: [
      { rowIndex: 1, fileName: 'Document_1_Alice.pdf', status: 'success' },
      { rowIndex: 2, fileName: 'Document_2_Bob.pdf', status: 'success' }
    ],
    zipBlob: new Blob(['mockzip']),
    zipFileName: 'mail_merge_bundle.zip',
    durationMs: 120
  };

  beforeEach(() => {
    mockMergeService = {
      parseCsv: vi.fn().mockReturnValue(sampleCsvData),
      autoMapFields: vi.fn().mockReturnValue(sampleMappings),
      generateTokenizedFileName: vi.fn().mockReturnValue('Doc_1.pdf'),
      executeMailMerge: vi.fn().mockResolvedValue(sampleBatchResult)
    };

    mockFormDataService = {
      extractFieldRecords: vi.fn().mockResolvedValue([
        { name: 'fullName', type: 'text', value: '' },
        { name: 'email', type: 'text', value: '' }
      ])
    };

    mockFileService = {
      downloadFile: vi.fn()
    };

    mockBridgeService = {
      consumeDocument: vi.fn().mockReturnValue(null)
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockStorageService = {
      getQuotaStatus: vi.fn().mockResolvedValue({
        remaining: 5,
        isUnlimited: false,
        limit: 5,
        canStart: true
      }),
      saveFile: vi.fn().mockResolvedValue('file:///path/output.zip')
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfMailMergeService, useValue: mockMergeService },
        { provide: PdfFormDataService, useValue: mockFormDataService },
        { provide: FileService, useValue: mockFileService },
        { provide: DocumentBridgeService, useValue: mockBridgeService },
        { provide: ShareService, useValue: mockShareService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new FormsMailMergePage());
  });

  it('initializes on Step 1 with default settings', () => {
    expect(page.currentStep).toBe(1);
    expect(page.templatePdfBytes).toBeNull();
    expect(page.csvData.totalRows).toBe(0);
    expect(page.flattenPdf).toBe(true);
    expect(page.bundleAsZip).toBe(true);
    expect(page.isProcessing).toBe(false);
    expect(page.showSummary).toBe(false);
  });

  it('guards stepper navigation until prerequisites are loaded', () => {
    page.goToStep(2);
    expect(page.currentStep).toBe(1); // blocked because templatePdfBytes is null

    page.templatePdfBytes = new ArrayBuffer(8);
    page.goToStep(2);
    expect(page.currentStep).toBe(2);

    page.goToStep(3);
    expect(page.currentStep).toBe(2); // blocked because csvData.totalRows is 0
  });

  it('loads template PDF and extracts form fields', async () => {
    const dummyFile = new File([new Uint8Array([1, 2])], 'form.pdf', { type: 'application/pdf' });
    await page.loadTemplateFile(dummyFile);

    expect(page.templateFileName).toBe('form.pdf');
    expect(page.templatePdfBytes).toBeDefined();
    expect(mockFormDataService.extractFieldRecords).toHaveBeenCalled();
    expect(page.detectedFields.length).toBe(2);
  });

  it('loads CSV file, extracts headers, and triggers auto-mapping', async () => {
    page.templatePdfBytes = new ArrayBuffer(8);
    page.detectedFields = [
      { name: 'fullName', type: 'text', value: '' },
      { name: 'email', type: 'text', value: '' }
    ];

    const dummyCsv = new File(['fullName,email\nAlice,a@a.com'], 'data.csv', { type: 'text/csv' });
    await page.loadCsvFile(dummyCsv);

    expect(page.csvFileName).toBe('data.csv');
    expect(mockMergeService.parseCsv).toHaveBeenCalled();
    expect(page.csvData.totalRows).toBe(2);
    expect(page.sampleRows.length).toBe(2);
    expect(mockMergeService.autoMapFields).toHaveBeenCalled();
    expect(page.mappings.length).toBe(2);
    expect(page.hasAtLeastOneMapping()).toBe(true);
  });

  it('allows manual mapping override', () => {
    page.mappings = [
      { fieldName: 'fullName', fieldType: 'text', csvColumn: 'fullName', isAutoMatched: true, confidence: 1 }
    ];

    page.onMappingChange(page.mappings[0], 'custom_col');
    expect(page.mappings[0].csvColumn).toBe('custom_col');
    expect(page.mappings[0].isAutoMatched).toBe(false);

    page.onMappingChange(page.mappings[0], 'null');
    expect(page.mappings[0].csvColumn).toBeNull();
  });

  it('appends token to file naming pattern', () => {
    page.namingPattern = 'Cert_{index}.pdf';
    page.appendTokenToPattern('fullName');
    expect(page.namingPattern).toBe('Cert_{index}_{fullName}.pdf');
  });

  it('executes batch mail-merge and presents summary', async () => {
    page.templatePdfBytes = new ArrayBuffer(8);
    page.csvData = sampleCsvData;
    page.mappings = sampleMappings;

    await page.startBatchMerge();

    expect(mockMergeService.executeMailMerge).toHaveBeenCalled();
    expect(page.batchResult).toEqual(sampleBatchResult);
    expect(page.showSummary).toBe(true);
    expect(page.isProcessing).toBe(false);
  });

  it('downloads or shares generated ZIP archive', async () => {
    page.batchResult = sampleBatchResult;

    await page.downloadZip();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockFileService.downloadFile).toHaveBeenCalled();

    await page.shareZip();
    expect(mockShareService.shareFile).toHaveBeenCalled();
  });
});
