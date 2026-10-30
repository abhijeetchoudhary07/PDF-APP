import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { FormsDataPage } from './forms-data.page';
import { PdfFormDataService } from '../../core/services/pdf-form-data.service';
import { FileService } from '../../core/services/file.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  FormDataExportResult,
  FormDataImportReport,
  FormFieldDataRecord
} from '../../core/models/pdf-forms.types';

describe('FormsDataPage', () => {
  let page: FormsDataPage;
  let mockDataService: any;
  let mockFileService: any;
  let mockBridgeService: any;
  let mockShareService: any;
  let mockStorageService: any;
  let mockToastCtrl: any;

  const sampleRecords: FormFieldDataRecord[] = [
    { name: 'firstName', type: 'text', value: 'John' },
    { name: 'lastName', type: 'text', value: '' },
    { name: 'newsletter', type: 'checkbox', isChecked: true },
    { name: 'terms', type: 'checkbox', isChecked: false }
  ];

  const sampleExportResult: FormDataExportResult = {
    format: 'json',
    content: '{"firstName":"John"}',
    fileName: 'test.json',
    sizeBytes: 20,
    mimeType: 'application/json',
    fieldCount: 1
  };

  const sampleImportReport: FormDataImportReport = {
    format: 'json',
    totalIncomingFields: 2,
    matchedCount: 2,
    unmatchedCount: 1,
    matchedFields: [
      { name: 'firstName', originalValue: 'John', newValue: 'Jane', type: 'text', matched: true, included: true },
      { name: 'lastName', originalValue: '', newValue: 'Doe', type: 'text', matched: true, included: true }
    ],
    unmatchedFields: [
      { name: 'unknownField', value: 'xyz' }
    ]
  };

  beforeEach(() => {
    mockDataService = {
      extractFieldRecords: vi.fn().mockResolvedValue(sampleRecords),
      exportFormData: vi.fn().mockResolvedValue(sampleExportResult),
      saveExportFile: vi.fn().mockResolvedValue({
        file: new File(['{}'], 'test.json', { type: 'application/json' }),
        blob: new Blob(['{}']),
        filename: 'test.json'
      }),
      detectFormat: vi.fn().mockReturnValue('json'),
      previewImport: vi.fn().mockResolvedValue(sampleImportReport),
      applyImport: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
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
      saveFile: vi.fn().mockResolvedValue('file:///path/doc.pdf')
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfFormDataService, useValue: mockDataService },
        { provide: FileService, useValue: mockFileService },
        { provide: DocumentBridgeService, useValue: mockBridgeService },
        { provide: ShareService, useValue: mockShareService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new FormsDataPage());
  });

  it('initializes with default state', () => {
    expect(page.activeTab).toBe('export');
    expect(page.pdfBytes).toBeNull();
    expect(page.totalFieldsCount).toBe(0);
    expect(page.filledFieldsCount).toBe(0);
    expect(page.blankFieldsCount).toBe(0);
    expect(page.showPreviewSheet).toBe(false);
  });

  it('switches tabs between export and import', () => {
    page.setTab('import');
    expect(page.activeTab).toBe('import');

    page.setTab('export');
    expect(page.activeTab).toBe('export');
  });

  it('loads a PDF file, extracts fields, and calculates statistics', async () => {
    const dummyPdf = new File([new Uint8Array([1, 2, 3])], 'sample.pdf', { type: 'application/pdf' });
    await page.loadPdfFile(dummyPdf);

    expect(page.fileName).toBe('sample.pdf');
    expect(page.pdfBytes).toBeDefined();
    expect(mockDataService.extractFieldRecords).toHaveBeenCalled();
    expect(page.totalFieldsCount).toBe(4);
    expect(page.filledFieldsCount).toBe(2); // 'firstName' has text, 'newsletter' isChecked: true
    expect(page.blankFieldsCount).toBe(2);
    expect(mockDataService.exportFormData).toHaveBeenCalledTimes(4); // json, csv, xfdf, fdf
  });

  it('copies export content to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock }
    });

    page.exportResults.json = sampleExportResult;
    await page.copyExportToClipboard('json');

    expect(writeTextMock).toHaveBeenCalledWith('{"firstName":"John"}');
    expect(mockToastCtrl.create).toHaveBeenCalled();
  });

  it('shares or saves export file via ShareService and StorageService', async () => {
    page.exportResults.json = sampleExportResult;
    await page.shareOrSaveExport('json');

    expect(mockDataService.saveExportFile).toHaveBeenCalledWith(sampleExportResult);
    expect(mockShareService.shareFile).toHaveBeenCalled();
  });

  it('loads an import data file, triggers preview, and shows bottom sheet', async () => {
    page.pdfBytes = new ArrayBuffer(8);
    const dataFile = new File(['{"firstName":"Jane"}'], 'data.json', { type: 'application/json' });

    await page.loadImportFile(dataFile);

    expect(page.importedFileName).toBe('data.json');
    expect(mockDataService.previewImport).toHaveBeenCalled();
    expect(page.previewReport).toEqual(sampleImportReport);
    expect(page.showPreviewSheet).toBe(true);
    expect(page.getIncludedCount()).toBe(2);
  });

  it('toggles field inclusion in the import preview', async () => {
    page.pdfBytes = new ArrayBuffer(8);
    const dataFile = new File(['{"firstName":"Jane"}'], 'data.json', { type: 'application/json' });
    await page.loadImportFile(dataFile);

    const firstMatch = page.previewReport!.matchedFields[0];
    expect(firstMatch.included).toBe(true);
    expect(page.getIncludedCount()).toBe(2);

    page.toggleFieldInclusion(firstMatch);
    expect(firstMatch.included).toBe(false);
    expect(page.getIncludedCount()).toBe(1);

    page.closePreviewSheet();
    expect(page.showPreviewSheet).toBe(false);
  });

  it('applies import data to the PDF, saves file, and updates document', async () => {
    page.pdfBytes = new ArrayBuffer(8);
    page.fileName = 'application.pdf';
    page.previewReport = sampleImportReport;
    page.showPreviewSheet = true;

    await page.applyImportData();

    expect(mockDataService.applyImport).toHaveBeenCalled();
    expect(mockStorageService.saveFile).toHaveBeenCalled();
    expect(mockFileService.downloadFile).toHaveBeenCalled();
    expect(page.fileName).toBe('application_filled.pdf');
    expect(page.showPreviewSheet).toBe(false);
  });
});
