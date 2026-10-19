import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfNavigationPage } from './pdf-navigation.page';
import { PdfOutlineService } from '../../core/services/pdf-outline.service';
import { PdfPageLabelService } from '../../core/services/pdf-page-label.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { OutlineNode, PageLabelRange } from '../../core/models/pdf-navigation.types';

async function makeTestPdf(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.addPage([400, 600]);
    p.drawText(`Page ${i + 1} Content`);
  }
  return await doc.save();
}

describe('PdfNavigationPage', () => {
  let page: PdfNavigationPage;
  let outlineService: Partial<PdfOutlineService>;
  let pageLabelService: Partial<PdfPageLabelService>;
  let fileService: Partial<FileService>;
  let storageService: Partial<StorageService>;
  let shareService: Partial<ShareService>;
  let historyService: Partial<HistoryService>;
  let toastService: Partial<ToastService>;
  let routeSnapshotData: Record<string, any>;
  let routeSnapshotUrl: any[];

  beforeEach(() => {
    routeSnapshotData = {};
    routeSnapshotUrl = [];

    outlineService = {
      readOutline: vi.fn(async () => ({ nodes: [], notices: [] })),
      generateFromHeadings: vi.fn(async (_buffer, _opts, options) => {
        if (options?.onProgress) options.onProgress({ completed: 3, total: 3, percent: 100 });
        return {
          nodes: [{ id: 'h1', title: 'Chapter 1', pageIndex: 0, children: [] }],
          notices: []
        };
      }),
      totalCount: vi.fn((nodes: OutlineNode[]) => nodes.length),
      exportWithOutline: vi.fn(async (_buffer, nodes, filename) => {
        const file = new File([new Uint8Array([1, 2, 3])], filename, { type: 'application/pdf' });
        return {
          blob: file,
          file,
          bookmarkCount: nodes.length,
          sizeBytes: 1234
        };
      })
    };

    pageLabelService = {
      readPageLabels: vi.fn(() => []),
      preview: vi.fn((_ranges, pageCount) => {
        const out = [];
        for (let i = 1; i <= pageCount; i++) {
          out.push({ pageIndex: i - 1, pageNumber: i, label: `i-${i}` });
        }
        return out;
      }),
      findDuplicateLabels: vi.fn(() => []),
      exportWithLabels: vi.fn(async (_buffer, ranges, filename) => {
        const file = new File([new Uint8Array([1, 2, 3])], filename, { type: 'application/pdf' });
        return {
          blob: file,
          file,
          rangeCount: ranges.length,
          sizeBytes: 1234
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
        { provide: PdfOutlineService, useValue: outlineService },
        { provide: PdfPageLabelService, useValue: pageLabelService },
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
              url: routeSnapshotUrl
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

  function createPage(mode?: string): PdfNavigationPage {
    if (mode) {
      routeSnapshotData['mode'] = mode;
    }
    const instance = TestBed.runInInjectionContext(() => new PdfNavigationPage());
    instance.ngOnInit();
    return instance;
  }

  describe('Initialization and Mode Switching', () => {
    it('defaults to bookmarks mode when no route data given', () => {
      page = createPage();
      expect(page.activeMode).toBe('bookmarks');
      expect(page.currentStep).toBe('select');
    });

    it('initializes in labels mode when route data has mode: labels', () => {
      page = createPage('labels');
      expect(page.activeMode).toBe('labels');
    });

    it('switches mode via setMode()', () => {
      page = createPage();
      page.setMode('labels');
      expect(page.activeMode).toBe('labels');
      page.setMode('bookmarks');
      expect(page.activeMode).toBe('bookmarks');
    });
  });

  describe('File Selection & Parsing', () => {
    it('rejects non-PDF files with an error toast', async () => {
      page = createPage();
      const txtFile = new File(['hello'], 'test.txt', { type: 'text/plain' });
      await page.onFileSelected(txtFile);

      expect(toastService.error).toHaveBeenCalledWith('Please select a valid PDF file.');
      expect(page.selectedFile).toBeUndefined();
      expect(page.currentStep).toBe('select');
    });

    it('loads PDF, extracts outline and page labels, and advances to configure step', async () => {
      page = createPage();
      const pdfBytes = await makeTestPdf(3);
      const file = new File([pdfBytes], 'sample.pdf', { type: 'application/pdf' });

      await page.onFileSelected(file);

      expect(page.selectedFile).toBe(file);
      expect(page.pageCount).toBe(3);
      expect(page.currentStep).toBe('configure');
      expect(outlineService.readOutline).toHaveBeenCalled();
      expect(pageLabelService.readPageLabels).toHaveBeenCalled();
    });
  });

  describe('Bookmark Tree Operations (E1)', () => {
    beforeEach(async () => {
      page = createPage('bookmarks');
      const pdfBytes = await makeTestPdf(5);
      const file = new File([pdfBytes], 'sample.pdf', { type: 'application/pdf' });
      await page.onFileSelected(file);
    });

    it('adds a root bookmark via openAddBookmarkModal and saveBookmarkFromModal', () => {
      page.openAddBookmarkModal();
      expect(page.isModalOpen).toBe(true);
      expect(page.modalMode).toBe('add');
      expect(page.targetParentId).toBeUndefined();

      page.editTitle = 'Introduction';
      page.editPage = 1;
      page.saveBookmarkFromModal();

      expect(page.isModalOpen).toBe(false);
      expect(page.outlineNodes.length).toBe(1);
      expect(page.outlineNodes[0].title).toBe('Introduction');
      expect(page.outlineNodes[0].pageIndex).toBe(0);
    });

    it('adds a child bookmark to an existing parent node', () => {
      page.outlineNodes = [
        { id: 'n1', title: 'Chapter 1', pageIndex: 0, children: [] }
      ];
      page.openAddBookmarkModal('n1');

      expect(page.isModalOpen).toBe(true);
      expect(page.targetParentId).toBe('n1');

      page.editTitle = 'Section 1.1';
      page.editPage = 2;
      page.saveBookmarkFromModal();

      expect(page.outlineNodes[0].children.length).toBe(1);
      expect(page.outlineNodes[0].children[0].title).toBe('Section 1.1');
      expect(page.outlineNodes[0].children[0].pageIndex).toBe(1);
    });

    it('edits an existing bookmark via openEditBookmarkModal', () => {
      page.outlineNodes = [
        { id: 'n1', title: 'Old Title', pageIndex: 0, children: [] }
      ];
      page.openEditBookmarkModal(page.outlineNodes[0]);

      expect(page.modalMode).toBe('edit');
      expect(page.editTitle).toBe('Old Title');

      page.editTitle = 'New Renamed Title';
      page.editPage = 3;
      page.saveBookmarkFromModal();

      expect(page.outlineNodes[0].title).toBe('New Renamed Title');
      expect(page.outlineNodes[0].pageIndex).toBe(2);
    });

    it('deletes a bookmark with deleteNode', () => {
      page.outlineNodes = [
        { id: 'n1', title: 'Chapter 1', pageIndex: 0, children: [] },
        { id: 'n2', title: 'Chapter 2', pageIndex: 1, children: [] }
      ];
      page.deleteNode('n1');
      expect(page.outlineNodes.length).toBe(1);
      expect(page.outlineNodes[0].id).toBe('n2');
    });

    it('reorders bookmarks via moveNodeUp and moveNodeDown', () => {
      page.outlineNodes = [
        { id: 'n1', title: 'First', pageIndex: 0, children: [] },
        { id: 'n2', title: 'Second', pageIndex: 1, children: [] }
      ];
      page.moveNodeDown('n1');
      expect(page.outlineNodes[0].id).toBe('n2');
      expect(page.outlineNodes[1].id).toBe('n1');

      page.moveNodeUp('n1');
      expect(page.outlineNodes[0].id).toBe('n1');
      expect(page.outlineNodes[1].id).toBe('n2');
    });

    it('indents and outdents bookmarks', () => {
      page.outlineNodes = [
        { id: 'n1', title: 'Parent', pageIndex: 0, children: [] },
        { id: 'n2', title: 'To Indent', pageIndex: 1, children: [] }
      ];
      page.indentNode('n2');
      expect(page.outlineNodes.length).toBe(1);
      expect(page.outlineNodes[0].children.length).toBe(1);
      expect(page.outlineNodes[0].children[0].id).toBe('n2');

      page.outdentNode('n2');
      expect(page.outlineNodes.length).toBe(2);
      expect(page.outlineNodes[1].id).toBe('n2');
    });

    it('toggles collapse on nodes with children', () => {
      const node: OutlineNode = {
        id: 'n1',
        title: 'Parent',
        pageIndex: 0,
        collapsed: false,
        children: [{ id: 'c1', title: 'Child', pageIndex: 1, children: [] }]
      };
      page.outlineNodes = [node];
      page.toggleCollapse(node);
      expect(node.collapsed).toBe(true);
      page.toggleCollapse(node);
      expect(node.collapsed).toBe(false);
    });

    it('auto-generates outline from headings using outlineService', async () => {
      await page.autoGenerateFromHeadings();

      expect(outlineService.generateFromHeadings).toHaveBeenCalled();
      expect(page.outlineNodes.length).toBe(1);
      expect(page.outlineNodes[0].title).toBe('Chapter 1');
      expect(toastService.success).toHaveBeenCalledWith('Auto-generated outline with 1 heading(s).');
    });

    it('clears all bookmarks with clearOutline', () => {
      page.outlineNodes = [{ id: 'n1', title: 'Ch 1', pageIndex: 0, children: [] }];
      page.clearOutline();
      expect(page.outlineNodes.length).toBe(0);
      expect(toastService.success).toHaveBeenCalledWith('Document outline cleared.');
    });

    it('computes visibleOutlineRows correctly with indent/outdent flags', () => {
      page.outlineNodes = [
        {
          id: 'p1',
          title: 'Parent',
          pageIndex: 0,
          children: [
            { id: 'c1', title: 'Child 1', pageIndex: 1, children: [] }
          ]
        },
        { id: 'p2', title: 'Sibling', pageIndex: 2, children: [] }
      ];

      const rows = page.visibleOutlineRows;
      expect(rows.length).toBe(3);
      expect(rows[0].node.id).toBe('p1');
      expect(rows[0].depth).toBe(0);
      expect(rows[0].hasChildren).toBe(true);

      expect(rows[1].node.id).toBe('c1');
      expect(rows[1].depth).toBe(1);
      expect(rows[1].canOutdent).toBe(true);

      expect(rows[2].node.id).toBe('p2');
      expect(rows[2].canIndent).toBe(true);
    });
  });

  describe('Page Labels Operations (E2)', () => {
    beforeEach(async () => {
      page = createPage('labels');
      const pdfBytes = await makeTestPdf(5);
      const file = new File([pdfBytes], 'sample.pdf', { type: 'application/pdf' });
      await page.onFileSelected(file);
    });

    it('adds a new page label range', () => {
      const initialCount = page.labelRanges.length;
      page.addRange();
      expect(page.labelRanges.length).toBe(initialCount + 1);
    });

    it('removes a range when multiple exist, but prevents removing the last one', () => {
      page.labelRanges = [
        { id: 'r1', startPage: 1, style: 'roman-lower' },
        { id: 'r2', startPage: 3, style: 'decimal', startValue: 1 }
      ];
      page.removeRange('r2');
      expect(page.labelRanges.length).toBe(1);
      expect(page.labelRanges[0].id).toBe('r1');

      // Attempt to remove only remaining range
      page.removeRange('r1');
      expect(page.labelRanges.length).toBe(1);
    });

    it('computes live previews and updates duplicate labels warning', () => {
      page.refreshLabelPreview();
      expect(pageLabelService.preview).toHaveBeenCalled();
      expect(page.previewRows.length).toBe(5);
    });

    it('resets page labels to standard decimal numbering', () => {
      page.labelRanges = [
        { id: 'r1', startPage: 1, style: 'roman-upper' },
        { id: 'r2', startPage: 4, style: 'letters-lower' }
      ];
      page.resetLabels();
      expect(page.labelRanges.length).toBe(1);
      expect(page.labelRanges[0].style).toBe('decimal');
      expect(page.labelRanges[0].startPage).toBe(1);
      expect(toastService.success).toHaveBeenCalledWith('Reset to standard physical numbering.');
    });
  });

  describe('Saving and Processing', () => {
    let pdfBytes: Uint8Array;
    let file: File;

    beforeEach(async () => {
      pdfBytes = await makeTestPdf(3);
      file = new File([pdfBytes], 'doc.pdf', { type: 'application/pdf' });
    });

    it('saves bookmarks in bookmarks mode and tracks history', async () => {
      page = createPage('bookmarks');
      await page.onFileSelected(file);
      page.outlineNodes = [{ id: 'b1', title: 'Intro', pageIndex: 0, children: [] }];

      await page.exportBookmarks();

      expect(outlineService.exportWithOutline).toHaveBeenCalled();
      expect(storageService.saveFile).toHaveBeenCalled();
      expect(historyService.addHistoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFileName: 'doc.pdf',
          outputFileName: 'doc_bookmarks.pdf'
        })
      );
      expect(page.currentStep).toBe('result');
      expect(page.outputFile).toBeDefined();
    });

    it('saves page labels in labels mode and tracks history', async () => {
      page = createPage('labels');
      await page.onFileSelected(file);
      page.labelRanges = [{ id: 'r1', startPage: 1, style: 'roman-lower' }];

      await page.exportLabels();

      expect(pageLabelService.exportWithLabels).toHaveBeenCalled();
      expect(storageService.saveFile).toHaveBeenCalled();
      expect(historyService.addHistoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFileName: 'doc.pdf',
          outputFileName: 'doc_labels.pdf'
        })
      );
      expect(page.currentStep).toBe('result');
      expect(page.outputFile).toBeDefined();
    });

    it('resets all state when reset() is called', async () => {
      page = createPage();
      await page.onFileSelected(file);
      expect(page.currentStep).toBe('configure');

      page.reset();
      expect(page.currentStep).toBe('select');
      expect(page.selectedFile).toBeUndefined();
      expect(page.outlineNodes.length).toBe(0);
      expect(page.labelRanges.length).toBe(0);
    });

    it('triggers fileService.downloadFile on downloadResult()', async () => {
      page = createPage();
      await page.onFileSelected(file);
      await page.exportBookmarks();

      page.downloadResult();
      expect(fileService.downloadFile).toHaveBeenCalled();
    });

    it('triggers shareService.shareFile on shareResult()', async () => {
      page = createPage();
      await page.onFileSelected(file);
      await page.exportBookmarks();

      page.shareResult();
      expect(shareService.shareFile).toHaveBeenCalled();
    });
  });
});
