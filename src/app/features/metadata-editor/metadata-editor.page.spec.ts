import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';

import { MetadataEditorPage } from './metadata-editor.page';
import { PdfMetadataEditorService } from '../../core/services/pdf-metadata-editor.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import { PdfMetadata, PdfMetadataInspectionResult } from '../../core/models/pdf-metadata.types';

describe('MetadataEditorPage — UI / UX and Editing Flow', () => {
  let page: MetadataEditorPage;
  let mockMetadataService: any;
  let mockStorageService: any;
  let mockShareService: any;
  let mockFileService: any;
  let mockToastCtrl: any;
  let mockAlertCtrl: any;
  let mockRouter: any;
  let mockCdr: any;

  const mockInspectionResult: PdfMetadataInspectionResult = {
    metadata: {
      title: 'Original Title',
      author: 'Original Author',
      subject: 'Original Subject',
      keywords: ['original', 'report'],
      creator: 'Test Creator',
      producer: 'Test Producer',
      creationDate: new Date(2026, 0, 1, 10, 0, 0),
      modificationDate: new Date(2026, 0, 1, 11, 0, 0)
    },
    hasXmpStream: true,
    hasInfoDict: true,
    pageCount: 3,
    fileName: 'sample.pdf',
    fileSizeBytes: 4096
  };

  beforeEach(() => {
    mockMetadataService = {
      readMetadata: vi.fn().mockResolvedValue(mockInspectionResult),
      applyMetadata: vi.fn().mockResolvedValue({
        pdfBytes: new Uint8Array([1, 2, 3, 4]),
        updatedFile: new File(['mock'], 'sample_updated_meta.pdf', { type: 'application/pdf' }),
        inspection: mockInspectionResult
      }),
      sanitizeString: vi.fn().mockImplementation((s: string) => s?.trim() || ''),
      parseKeywordsString: vi.fn().mockImplementation((s: string) => s ? s.split(',').map(x => x.trim()) : []),
      compareMetadata: vi.fn().mockImplementation((orig: PdfMetadata, upd: PdfMetadata) => [
        {
          fieldKey: 'title',
          labelKey: 'metadataEditor.fieldTitle',
          originalValue: orig.title || '',
          updatedValue: upd.title || '',
          isModified: orig.title !== upd.title
        }
      ])
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///saved/sample_updated_meta.pdf')
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockFileService = {
      pickPdfFile: vi.fn().mockResolvedValue(null)
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfMetadataEditorService, useValue: mockMetadataService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService },
        { provide: FileService, useValue: mockFileService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    page = TestBed.runInInjectionContext(() => new MetadataEditorPage());
  });

  it('initializes in empty dropzone state', () => {
    page.ngOnInit();
    expect(page.currentFile).toBeNull();
    expect(page.currentPdfBytes).toBeNull();
    expect(page.isComparisonDrawerOpen).toBe(false);
  });

  it('loads file, inspects existing metadata, and populates form fields', async () => {
    const file = new File(['%PDF mock content'], 'my_contract.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    expect(page.currentFile).toBe(file);
    expect(page.fileName).toBe('my_contract.pdf');
    expect(mockMetadataService.readMetadata).toHaveBeenCalled();

    expect(page.formData.title).toBe('Original Title');
    expect(page.formData.author).toBe('Original Author');
    expect(page.formData.subject).toBe('Original Subject');
    expect(page.formData.keywords).toEqual(['original', 'report']);
    expect(page.formData.creator).toBe('Test Creator');
    expect(page.formData.producer).toBe('Test Producer');
  });

  it('adds and removes keyword tag chips', async () => {
    const file = new File(['%PDF mock content'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.newKeywordInput = 'confidential, legal';
    page.addKeyword();

    expect(page.formData.keywords).toContain('confidential');
    expect(page.formData.keywords).toContain('legal');
    expect(page.newKeywordInput).toBe('');

    // Remove the first keyword
    const initialLen = page.formData.keywords.length;
    page.removeKeyword(0);
    expect(page.formData.keywords.length).toBe(initialLen - 1);
  });

  it('quick actions: copyFromOriginal restores initial values and clearAllFields clears them', async () => {
    const file = new File(['%PDF mock content'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    // Modify form
    page.formData.title = 'Changed Title';
    page.clearAllFields();

    expect(page.formData.title).toBe('');
    expect(page.formData.author).toBe('');
    expect(page.formData.keywords.length).toBe(0);

    // Restore from original
    page.copyFromOriginal();
    expect(page.formData.title).toBe('Original Title');
    expect(page.formData.author).toBe('Original Author');
    expect(page.formData.keywords).toEqual(['original', 'report']);
  });

  it('sets current time for creation and modification dates', async () => {
    page.setCurrentCreationDate();
    expect(page.formData.creationDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    page.setCurrentModificationDate();
    expect(page.formData.modificationDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('opens and closes side-by-side comparison drawer', async () => {
    const file = new File(['%PDF mock content'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.formData.title = 'Updated Title';
    page.openComparisonDrawer();

    expect(page.isComparisonDrawerOpen).toBe(true);
    expect(mockMetadataService.compareMetadata).toHaveBeenCalled();

    page.closeComparisonDrawer();
    expect(page.isComparisonDrawerOpen).toBe(false);
  });

  it('saves updated PDF with synchronized metadata via storage service', async () => {
    const file = new File(['%PDF mock content'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.formData.title = 'Brand New Title';
    await page.saveUpdatedDocument();

    expect(mockMetadataService.applyMetadata).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ title: 'Brand New Title' }),
      expect.objectContaining({ updateModificationDate: true })
    );

    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      'pdf_metadata_editor'
    );
    expect(page.savedFileUrl).toBe('file:///saved/sample_updated_meta.pdf');
  });

  it('resets workflow when resetWorkflow is called', async () => {
    const file = new File(['%PDF mock content'], 'sample.pdf', { type: 'application/pdf' });
    await page.handleFileSelected(file);

    page.resetWorkflow();
    expect(page.currentFile).toBeNull();
    expect(page.currentPdfBytes).toBeNull();
    expect(page.formData.title).toBe('');
  });
});
