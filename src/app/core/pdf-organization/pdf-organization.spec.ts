import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';
import { PdfPageManagerService } from '../services/pdf-page-manager.service';
import { PdfSplitConfig } from '../models/pdf-organization.types';

// Helper to generate a minimal valid PDF File in memory
async function createTestPdfFile(
  numPages: number,
  name = 'test.pdf',
  options?: {
    rotations?: number[];
    dimensions?: { width: number; height: number }[];
  }
): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < numPages; i++) {
    const dims = options?.dimensions?.[i] || { width: 595, height: 842 };
    const page = doc.addPage([dims.width, dims.height]);
    if (options?.rotations?.[i]) {
      page.setRotation(degrees(options.rotations[i]));
    }
  }
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('PDF Organization — Phase 2 Architecture', () => {

  describe('PdfRangeParserUtil', () => {
    it('should parse valid range expressions correctly', () => {
      const res = PdfRangeParserUtil.parseRange('1-3, 5, 8-10', 10);
      expect(res.valid).toBe(true);
      expect(res.pages).toEqual([1, 2, 3, 5, 8, 9, 10]);
    });

    it('should handle single page and whitespace gracefully', () => {
      const res = PdfRangeParserUtil.parseRange('  4  ,  7-9 ', 10);
      expect(res.valid).toBe(true);
      expect(res.pages).toEqual([4, 7, 8, 9]);
    });

    it('should reject reversed ranges (e.g. 5-2)', () => {
      const res = PdfRangeParserUtil.parseRange('5-2', 10);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot be greater than end page');
    });

    it('should reject out-of-bounds page numbers', () => {
      const res = PdfRangeParserUtil.parseRange('1-5, 12', 10);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds total pages');
    });

    it('should reject zero or negative page numbers', () => {
      const res = PdfRangeParserUtil.parseRange('0-3', 10);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('must be 1 or greater');
    });

    it('should reject non-numeric characters', () => {
      const res = PdfRangeParserUtil.parseRange('1-3, abc', 10);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('not a valid page number');
    });

    it('should format array of page numbers back to compact range string', () => {
      const formatted = PdfRangeParserUtil.formatRange([1, 2, 3, 5, 8, 9, 10]);
      expect(formatted).toBe('1-3, 5, 8-10');
    });

    it('should calculate split chunks for "every-n" mode', () => {
      const config: PdfSplitConfig = { mode: 'every-n', everyN: 3 };
      const chunks = PdfRangeParserUtil.calculateSplitChunks(10, config);
      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10]
      ]);
    });

    it('should calculate split chunks for "after-selected" mode', () => {
      const config: PdfSplitConfig = { mode: 'after-selected', afterPages: [2, 6] };
      const chunks = PdfRangeParserUtil.calculateSplitChunks(10, config);
      expect(chunks).toEqual([
        [1, 2],
        [3, 4, 5, 6],
        [7, 8, 9, 10]
      ]);
    });

    it('should calculate split chunks for "individual" mode', () => {
      const config: PdfSplitConfig = { mode: 'individual' };
      const chunks = PdfRangeParserUtil.calculateSplitChunks(4, config);
      expect(chunks).toEqual([[1], [2], [3], [4]]);
    });

    it('should calculate split chunks for "extract" mode', () => {
      const config: PdfSplitConfig = { mode: 'extract', selectedPageNumbers: [2, 4, 6] };
      const chunks = PdfRangeParserUtil.calculateSplitChunks(10, config);
      expect(chunks).toEqual([[2, 4, 6]]);
    });
  });

  describe('PdfPageManagerService', () => {
    let service: PdfPageManagerService;

    beforeEach(() => {
      service = new PdfPageManagerService();
    });

    it('should load a 1-page PDF document correctly', async () => {
      const file = await createTestPdfFile(1, 'single.pdf');
      const res = await service.loadDocument(file);

      expect(res.success).toBe(true);
      expect(res.doc?.pageCount).toBe(1);
      expect(service.pages.length).toBe(1);
      expect(service.pages[0].displayNumber).toBe(1);
    });

    it('should load a 10-page PDF document correctly', async () => {
      const file = await createTestPdfFile(10, 'ten_pages.pdf');
      const res = await service.loadDocument(file);

      expect(res.success).toBe(true);
      expect(res.doc?.pageCount).toBe(10);
      expect(service.pages.length).toBe(10);
      expect(service.pages[9].displayNumber).toBe(10);
    });

    it('should load multiple PDF documents for merging', async () => {
      const file1 = await createTestPdfFile(3, 'doc1.pdf');
      const file2 = await createTestPdfFile(4, 'doc2.pdf');
      const res = await service.loadMultipleDocuments([file1, file2]);

      expect(res.success).toBe(true);
      expect(res.docs.length).toBe(2);
      expect(service.pages.length).toBe(7);
      expect(service.pages[2].sourceDocId).toBe(res.docs[0].id);
      expect(service.pages[3].sourceDocId).toBe(res.docs[1].id);
      expect(service.pages[6].displayNumber).toBe(7);
    });

    it('should reorder pages correctly', async () => {
      const file = await createTestPdfFile(5, 'reorder.pdf');
      await service.loadDocument(file);

      const page0Id = service.pages[0].id;
      const page3Id = service.pages[3].id;

      // Move page at index 3 (Page 4) to index 0 (Page 1)
      const success = service.reorderPage(3, 0);
      expect(success).toBe(true);
      expect(service.pages[0].id).toBe(page3Id);
      expect(service.pages[0].displayNumber).toBe(1);
      expect(service.pages[1].id).toBe(page0Id);
      expect(service.pages[1].displayNumber).toBe(2);
    });

    it('should move page to target display position', async () => {
      const file = await createTestPdfFile(5, 'move_pos.pdf');
      await service.loadDocument(file);

      const targetPageId = service.pages[4].id; // Page 5
      const success = service.movePageToPosition(targetPageId, 2); // Move to position 2
      expect(success).toBe(true);
      expect(service.pages[1].id).toBe(targetPageId);
      expect(service.pages[1].displayNumber).toBe(2);
    });

    it('should rotate pages and normalize rotation angles', async () => {
      const file = await createTestPdfFile(3, 'rotate.pdf');
      await service.loadDocument(file);

      const p0 = service.pages[0];
      service.rotatePages([p0.id], 90);
      expect(p0.rotation).toBe(90);

      service.rotatePages([p0.id], 180);
      expect(p0.rotation).toBe(270);

      service.rotatePages([p0.id], 90);
      expect(p0.rotation).toBe(0); // 360 % 360 = 0

      // Rotate all
      service.rotateAll(180);
      expect(service.pages[0].rotation).toBe(180);
      expect(service.pages[1].rotation).toBe(180);
      expect(service.pages[2].rotation).toBe(180);
    });

    it('should delete pages and update display numbers', async () => {
      const file = await createTestPdfFile(5, 'delete.pdf');
      await service.loadDocument(file);

      const page1Id = service.pages[1].id;
      const page3Id = service.pages[3].id;

      service.deletePages([page1Id, page3Id]);
      expect(service.pages.length).toBe(3);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3]);
      expect(service.pages.some(p => p.id === page1Id)).toBe(false);
      expect(service.pages.some(p => p.id === page3Id)).toBe(false);
    });

    it('should duplicate pages and insert adjacent clone', async () => {
      const file = await createTestPdfFile(3, 'duplicate.pdf');
      await service.loadDocument(file);

      const p0Id = service.pages[0].id;
      service.duplicatePages([p0Id]);

      expect(service.pages.length).toBe(4);
      expect(service.pages[0].sourcePageIndex).toBe(0);
      expect(service.pages[1].sourcePageIndex).toBe(0); // Duplicate
      expect(service.pages[1].id).not.toBe(p0Id);
      expect(service.pages[1].displayNumber).toBe(2);
    });

    it('should support undo and redo for reordering', async () => {
      const file = await createTestPdfFile(3, 'undo_reorder.pdf');
      await service.loadDocument(file);

      const initialOrder = service.pages.map(p => p.id);
      service.reorderPage(0, 2);

      expect(service.pages.map(p => p.id)).not.toEqual(initialOrder);
      expect(service.canUndo).toBe(true);

      // Undo
      service.undo();
      expect(service.pages.map(p => p.id)).toEqual(initialOrder);
      expect(service.canRedo).toBe(true);

      // Redo
      service.redo();
      expect(service.pages.map(p => p.id)).not.toEqual(initialOrder);
    });

    it('should support undo and redo for rotation', async () => {
      const file = await createTestPdfFile(2, 'undo_rotate.pdf');
      await service.loadDocument(file);

      const p0 = service.pages[0];
      service.rotatePages([p0.id], 90);
      expect(p0.rotation).toBe(90);

      service.undo();
      expect(p0.rotation).toBe(0);

      service.redo();
      expect(p0.rotation).toBe(90);
    });

    it('should support undo and redo for page deletion', async () => {
      const file = await createTestPdfFile(4, 'undo_delete.pdf');
      await service.loadDocument(file);

      const deleteId = service.pages[1].id;
      service.deletePages([deleteId]);
      expect(service.pages.length).toBe(3);

      service.undo();
      expect(service.pages.length).toBe(4);
      expect(service.pages[1].id).toBe(deleteId);

      service.redo();
      expect(service.pages.length).toBe(3);
    });

    it('should manage page selection properly', async () => {
      const file = await createTestPdfFile(6, 'select.pdf');
      await service.loadDocument(file);

      // Select individual
      service.selectPage(service.pages[0].id);
      expect(service.selectedCount).toBe(1);

      // Deselect
      service.deselectPage(service.pages[0].id);
      expect(service.selectedCount).toBe(0);

      // Select All
      service.selectAll();
      expect(service.selectedCount).toBe(6);

      // Deselect All
      service.deselectAll();
      expect(service.selectedCount).toBe(0);

      // Select Even
      service.selectEvenPages();
      expect(service.selectedCount).toBe(3);
      expect(service.getSelectedPages().every(p => p.displayNumber % 2 === 0)).toBe(true);

      // Select Odd
      service.selectOddPages();
      expect(service.selectedCount).toBe(3);
      expect(service.getSelectedPages().every(p => p.displayNumber % 2 !== 0)).toBe(true);

      // Invert
      service.invertSelection();
      expect(service.selectedCount).toBe(3);
      expect(service.getSelectedPages().every(p => p.displayNumber % 2 === 0)).toBe(true);

      // Range
      service.selectRange(2, 4);
      expect(service.selectedCount).toBe(3);
      expect(service.getSelectedPages().map(p => p.displayNumber)).toEqual([2, 3, 4]);
    });

    it('should export a single reordered and rotated PDF accurately', async () => {
      const file = await createTestPdfFile(4, 'export_test.pdf');
      await service.loadDocument(file);

      // Reorder: Move page 3 (index 2) to position 0
      service.reorderPage(2, 0);
      // Rotate: Rotate new page 0 by 90 deg
      service.rotatePages([service.pages[0].id], 90);

      const exportResult = await service.exportSinglePdf();
      expect(exportResult.pageCount).toBe(4);
      expect(exportResult.sizeBytes).toBeGreaterThan(0);
      expect(exportResult.file).toBeDefined();

      // Verify the generated PDF using pdf-lib
      const arrayBuffer = await exportResult.file.arrayBuffer();
      const loadedDoc = await PDFDocument.load(arrayBuffer);
      expect(loadedDoc.getPageCount()).toBe(4);

      const firstPage = loadedDoc.getPage(0);
      expect(firstPage.getRotation().angle).toBe(90);
    });

    it('should export split PDFs based on chunks', async () => {
      const file = await createTestPdfFile(6, 'split_test.pdf');
      await service.loadDocument(file);

      const chunks = [[1, 2], [3, 4], [5, 6]];
      const splitResults = await service.exportSplitPdfs(chunks, 'split_doc.pdf');

      expect(splitResults.length).toBe(3);
      expect(splitResults[0].pageCount).toBe(2);
      expect(splitResults[1].pageCount).toBe(2);
      expect(splitResults[2].pageCount).toBe(2);

      for (const res of splitResults) {
        const ab = await res.file.arrayBuffer();
        const loaded = await PDFDocument.load(ab);
        expect(loaded.getPageCount()).toBe(2);
      }
    });

    it('should handle corrupted PDF files gracefully without crashing', async () => {
      const corruptedBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const corruptedBlob = new Blob([corruptedBytes], { type: 'application/pdf' });
      const corruptedFile = new File([corruptedBlob], 'corrupted.pdf', { type: 'application/pdf' });

      const res = await service.loadDocument(corruptedFile);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('should handle mixed page sizes and orientations', async () => {
      const file = await createTestPdfFile(3, 'mixed.pdf', {
        dimensions: [
          { width: 595, height: 842 }, // Portrait A4
          { width: 842, height: 595 }, // Landscape A4
          { width: 612, height: 792 }  // Letter
        ]
      });

      const res = await service.loadDocument(file);
      expect(res.success).toBe(true);
      expect(service.pages.length).toBe(3);

      const exportResult = await service.exportSinglePdf();
      const ab = await exportResult.file.arrayBuffer();
      const loaded = await PDFDocument.load(ab);

      expect(loaded.getPageCount()).toBe(3);
      const p0 = loaded.getPage(0);
      const p1 = loaded.getPage(1);
      const p2 = loaded.getPage(2);

      expect(p0.getWidth()).toBeCloseTo(595, 0);
      expect(p0.getHeight()).toBeCloseTo(842, 0);
      expect(p1.getWidth()).toBeCloseTo(842, 0);
      expect(p1.getHeight()).toBeCloseTo(595, 0);
      expect(p2.getWidth()).toBeCloseTo(612, 0);
      expect(p2.getHeight()).toBeCloseTo(792, 0);
    });
  });

});
