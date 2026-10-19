import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfHeaderFooterPage } from './pdf-header-footer.page';
import { PdfHeaderFooterService } from '../../core/services/pdf-header-footer.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { BatesOptions, defaultBatesOptions } from '../../core/models/pdf-navigation.types';

async function makeTestPdf(pageCount = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.addPage([300, 400]);
    p.drawText(`Page ${i + 1}`);
  }
  return await doc.save();
}

describe('PdfHeaderFooterPage — Bates Studio (E3)', () => {
  let page: PdfHeaderFooterPage;
  let headerFooterService: Partial<PdfHeaderFooterService>;
  let fileService: Partial<FileService>;
  let storageService: Partial<StorageService>;
  let shareService: Partial<ShareService>;
  let historyService: Partial<HistoryService>;
  let toastService: Partial<ToastService>;
  let routeSnapshotData: Record<string, any>;

  beforeEach(() => {
    routeSnapshotData = {};

    headerFooterService = {
      formatBatesNumber: vi.fn((num, opts) => `${opts.prefix}${String(num).padStart(opts.width, '0')}${opts.suffix}`),
      planBatesBatch: vi.fn((files, opts) => {
        let current = opts.startNumber;
        const plannedFiles = files.map(f => {
          const first = current;
          const last = current + f.pageCount - 1;
          current = last + 1;
          return {
            fileName: f.name,
            pageCount: f.pageCount,
            firstNumber: first,
            lastNumber: last,
            firstStamp: `TEST-${String(first).padStart(6, '0')}`,
            lastStamp: `TEST-${String(last).padStart(6, '0')}`
          };
        });
        return {
          totalFiles: files.length,
          totalPages: files.reduce((acc, f) => acc + f.pageCount, 0),
          firstNumber: opts.startNumber,
          lastNumber: current - 1,
          files: plannedFiles
        };
      }),
      applyBatesNumbering: vi.fn(async (_buffer, opts, startNum, outName) => {
        const file = new File([new Uint8Array([1, 2, 3])], outName, { type: 'application/pdf' });
        return {
          blob: file,
          file,
          pagesModified: 2,
          sizeBytes: 1234,
          firstStamp: `${opts.prefix}${startNum}`,
          lastStamp: `${opts.prefix}${startNum + 1}`
        };
      }),
      applyHeaderFooter: vi.fn(async (_buffer, _config, _name, outName) => {
        const file = new File([new Uint8Array([1, 2, 3])], outName, { type: 'application/pdf' });
        return {
          blob: file,
          file,
          pagesModified: 1,
          sizeBytes: 500
        };
      })
    };

    fileService = {
      downloadFile: vi.fn()
    };

    storageService = {
      saveFile: vi.fn(async (file) => ({
        file,
        quotaExceeded: false,
        requiresUpgrade: false
      }))
    };

    shareService = {
      shareFile: vi.fn(async () => true)
    };

    historyService = {
      addHistoryItem: vi.fn(async () => {})
    };

    toastService = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PdfHeaderFooterService, useValue: headerFooterService },
        { provide: FileService, useValue: fileService },
        { provide: StorageService, useValue: storageService },
        { provide: ShareService, useValue: shareService },
        { provide: HistoryService, useValue: historyService },
        { provide: ToastService, useValue: toastService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: routeSnapshotData,
              queryParams: {},
              url: []
            }
          }
        },
        {
          provide: ChangeDetectorRef,
          useValue: {
            detectChanges: vi.fn(),
            markForCheck: vi.fn()
          }
        }
      ]
    });
  });

  function createPage(mode?: string): PdfHeaderFooterPage {
    if (mode) {
      routeSnapshotData['mode'] = mode;
    }
    const instance = TestBed.runInInjectionContext(() => new PdfHeaderFooterPage());
    instance.ngOnInit();
    return instance;
  }

  describe('Studio Mode and Initialization', () => {
    it('defaults to standard headerFooter studio mode', () => {
      page = createPage();
      expect(page.studioMode).toBe('headerFooter');
    });

    it('switches to bates mode when route data has mode: bates', () => {
      page = createPage('bates');
      expect(page.studioMode).toBe('bates');
    });

    it('switches studioMode dynamically via switchStudioMode()', () => {
      page = createPage();
      page.switchStudioMode('bates');
      expect(page.studioMode).toBe('bates');
      page.switchStudioMode('headerFooter');
      expect(page.studioMode).toBe('headerFooter');
    });
  });

  describe('Bates Numbering Multi-File Batch (E3)', () => {
    let fileA: File;
    let fileB: File;

    beforeEach(async () => {
      page = createPage('bates');
      const bytesA = await makeTestPdf(2);
      const bytesB = await makeTestPdf(3);
      fileA = new File([bytesA], 'exhibit_a.pdf', { type: 'application/pdf' });
      fileB = new File([bytesB], 'exhibit_b.pdf', { type: 'application/pdf' });
    });

    it('loads multiple files into continuous batch and advances to configure step', async () => {
      await page.onBatesFilesSelected([fileA, fileB]);

      expect(page.batesFiles.length).toBe(2);
      expect(page.batesFiles[0].pageCount).toBe(2);
      expect(page.batesFiles[1].pageCount).toBe(3);
      expect(page.batesBatchPlan).toBeDefined();
      expect(page.batesBatchPlan?.totalPages).toBe(5);
      expect(page.currentStep).toBe('configure');
    });

    it('allows adding more files to the batch', async () => {
      await page.onBatesFilesSelected([fileA]);
      expect(page.batesFiles.length).toBe(1);

      await page.addMoreBatesFiles([fileB]);
      expect(page.batesFiles.length).toBe(2);
      expect(toastService.success).toHaveBeenCalledWith('Added 1 file(s) to Bates batch.');
    });

    it('removes a file from the batch and updates plan', async () => {
      await page.onBatesFilesSelected([fileA, fileB]);
      expect(page.batesFiles.length).toBe(2);

      page.removeBatesFile(0);
      expect(page.batesFiles.length).toBe(1);
      expect(page.batesFiles[0].file.name).toBe('exhibit_b.pdf');
    });

    it('updates position and preview overlay', () => {
      page.setBatesPosition('bottom-right');
      expect(page.batesOptions.position).toBe('bottom-right');
      expect(page.previewOverlay.footerRight).toBeDefined();
    });

    it('updates width and re-plans batch', () => {
      page.batesFiles = [{ file: fileA, buffer: new ArrayBuffer(0), pageCount: 2 }];
      page.setBatesWidth(8);
      expect(page.batesOptions.width).toBe(8);
      expect(headerFooterService.planBatesBatch).toHaveBeenCalled();
    });

    it('executes continuous bates stamping, saves to storage, and sets result step', async () => {
      await page.onBatesFilesSelected([fileA, fileB]);
      await page.applyBatesAndGenerate();

      expect(headerFooterService.applyBatesNumbering).toHaveBeenCalledTimes(2);
      expect(storageService.saveFile).toHaveBeenCalledTimes(2);
      expect(page.batesOutputs.length).toBe(2);
      expect(page.currentStep).toBe('result');
      expect(historyService.addHistoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'Applied Bates numbering to 2 file(s)'
        })
      );
    });

    it('downloads all bates outputs', async () => {
      await page.onBatesFilesSelected([fileA, fileB]);
      await page.applyBatesAndGenerate();

      await page.downloadAllBates();
      expect(fileService.downloadFile).toHaveBeenCalledTimes(2);
    });
  });
});
