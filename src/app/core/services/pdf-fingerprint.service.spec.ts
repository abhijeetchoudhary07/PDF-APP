import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfFingerprintService } from './pdf-fingerprint.service';
import { StorageService } from './storage.service';

describe('PdfFingerprintService (G1: Document Fingerprint & Integrity Receipt)', () => {
  let service: PdfFingerprintService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PdfFingerprintService,
        {
          provide: StorageService,
          useValue: {
            saveFile: async () => 'mock://file-saved'
          }
        }
      ]
    });
    service = TestBed.inject(PdfFingerprintService);
  });

  async function createTestPdf(pageTexts: string[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (const text of pageTexts) {
      const page = doc.addPage([400, 600]);
      page.drawText(text, { x: 50, y: 500, size: 14, font, color: rgb(0, 0, 0) });
    }

    return await doc.save();
  }

  it('generates reproducible hashes: identical bytes produce identical whole-file and page hashes', async () => {
    const pdfBytes = await createTestPdf(['Page 1 text', 'Page 2 text']);

    const fp1 = await service.generateFingerprint(pdfBytes.buffer, 'sample.pdf');
    const fp2 = await service.generateFingerprint(pdfBytes.buffer, 'sample.pdf');

    expect(fp1.fileSha256).toBe(fp2.fileSha256);
    expect(fp1.pageCount).toBe(2);
    expect(fp1.pageHashes.length).toBe(2);
    expect(fp1.pageHashes[0].contentHash).toBe(fp2.pageHashes[0].contentHash);
    expect(fp1.pageHashes[1].contentHash).toBe(fp2.pageHashes[1].contentHash);
  });

  it('detects a single page edit and accurately localizes it to that specific page', async () => {
    const originalBytes = await createTestPdf(['Page 1 original', 'Page 2 original', 'Page 3 original']);
    const receipt = await service.generateFingerprint(originalBytes.buffer, 'doc.pdf');

    // Create modified doc where only Page 2 changed
    const modifiedBytes = await createTestPdf(['Page 1 original', 'Page 2 EDITED CONTENT', 'Page 3 original']);

    const comparison = await service.compareWithReceipt(receipt, modifiedBytes.buffer, 'doc_edited.pdf');

    expect(comparison.status).toBe('content_drift');
    expect(comparison.isByteIdentical).toBe(false);
    expect(comparison.isPageCountMatch).toBe(true);
    expect(comparison.hasMetadataDriftOnly).toBe(false);

    // Page 2 changed, Pages 1 and 3 remain identical
    expect(comparison.changedPages).toEqual([2]);
    expect(comparison.identicalPages).toEqual([1, 3]);
    expect(comparison.addedPages).toEqual([]);
    expect(comparison.removedPages).toEqual([]);
  });

  it('reports a re-save that changes only metadata as metadata-only drift', async () => {
    const originalBytes = await createTestPdf(['Consistent Page 1', 'Consistent Page 2']);
    const receipt = await service.generateFingerprint(originalBytes.buffer, 'doc.pdf');

    // Open the document, modify only metadata, and re-save
    const doc = await PDFDocument.load(originalBytes);
    doc.setTitle('New Updated Document Title');
    doc.setAuthor('New Author Name');
    doc.setProducer('Custom Integrity Test Suite');
    const metaChangedBytes = await doc.save();

    const comparison = await service.compareWithReceipt(receipt, metaChangedBytes.buffer, 'doc_renamed.pdf');

    expect(comparison.status).toBe('metadata_only');
    expect(comparison.isByteIdentical).toBe(false); // file hash changed because of header/info dict
    expect(comparison.hasMetadataDriftOnly).toBe(true);
    expect(comparison.isPageCountMatch).toBe(true);
    expect(comparison.changedPages).toEqual([]); // All page contents match!
    expect(comparison.identicalPages).toEqual([1, 2]);
  });

  it('detects added and removed pages', async () => {
    const baseBytes = await createTestPdf(['Page 1', 'Page 2']);
    const receipt = await service.generateFingerprint(baseBytes.buffer, 'base.pdf');

    // Add a 3rd page
    const expandedBytes = await createTestPdf(['Page 1', 'Page 2', 'Page 3 newly added']);
    const expansion = await service.compareWithReceipt(receipt, expandedBytes.buffer, 'expanded.pdf');

    expect(expansion.status).toBe('content_drift');
    expect(expansion.isPageCountMatch).toBe(false);
    expect(expansion.addedPages).toEqual([3]);
    expect(expansion.identicalPages).toEqual([1, 2]);

    // Truncate to 1 page
    const shrunkBytes = await createTestPdf(['Page 1']);
    const shrinkage = await service.compareWithReceipt(receipt, shrunkBytes.buffer, 'shrunk.pdf');

    expect(shrinkage.status).toBe('content_drift');
    expect(shrinkage.removedPages).toEqual([2]);
    expect(shrinkage.identicalPages).toEqual([1]);
  });

  it('exports receipt as readable text and stamped PDF receipt', async () => {
    const pdfBytes = await createTestPdf(['Hello World Receipt']);
    const receipt = await service.generateFingerprint(pdfBytes.buffer, 'test.pdf');

    const textOutput = service.exportReceiptAsText(receipt);
    expect(textOutput).toContain('DOCUMENT INTEGRITY & FINGERPRINT RECEIPT');
    expect(textOutput).toContain('FILE SHA-256 CHECKSUM:');
    expect(textOutput).toContain(receipt.fileSha256);
    expect(textOutput).toContain('Page   1:');

    const pdfReceipt = await service.exportReceiptAsPdf(receipt);
    expect(pdfReceipt).toBeInstanceOf(Uint8Array);
    expect(pdfReceipt.length).toBeGreaterThan(1000);

    // Verify generated receipt can be loaded by pdf-lib
    const parsedReceipt = await PDFDocument.load(pdfReceipt);
    expect(parsedReceipt.getPageCount()).toBe(1);
  });
});
