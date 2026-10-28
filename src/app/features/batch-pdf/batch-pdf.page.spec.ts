/**
 * J11: the parts of a batch run a person can see go wrong.
 *
 * The queue mechanics — a middle file failing, the quota stopping the run —
 * are covered in converters-j6-j11.spec.ts. This covers what happens to the
 * files afterwards: the name they are saved under, the log that records the
 * run, and the title the rename operation picks out of the document.
 */
import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BatchPdfPage } from './batch-pdf.page';
import { StorageService } from '../../core/services/storage.service';
import { UsageQuotaService } from '../../core/services/usage-quota.service';
import { OCR_SUPPORTED_LANGUAGES } from '../../core/models/ocr.models';

async function makePdf(build: (page: any, fonts: { regular: any; bold: any }) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  build(page, { regular, bold });
  return doc.save();
}

describe('BatchPdfPage (J11)', () => {
  let page: BatchPdfPage;
  let storage: StorageService;
  let quota: UsageQuotaService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    storage = TestBed.inject(StorageService);
    quota = TestBed.inject(UsageQuotaService);
    vi.spyOn(quota, 'isUnlimited', 'get').mockReturnValue(true);
    page = TestBed.runInInjectionContext(() => new BatchPdfPage());
  });

  describe('saving the results', () => {
    it('keeps the name each operation produced', async () => {
      const saveFile = vi
        .spyOn(storage, 'saveFile')
        .mockResolvedValue('file:///Documents/out.pdf');

      const bytes = await makePdf((p, f) => p.drawText('Hello', { x: 20, y: 250, size: 12, font: f.regular }));
      const file = new File([bytes], 'scan.pdf', { type: 'application/pdf' });

      page.operation = 'rename-from-content';
      page.autoSave = true;
      page.items = [
        { id: 'a', file, status: 'queued', originalSizeBytes: file.size, quotaCharged: false }
      ];

      await page.processBatch();

      expect(page.items[0].status).toBe('done');
      expect(saveFile).toHaveBeenCalledTimes(1);
      // The fourth argument is what stops the generated name replacing the
      // one the rename operation just worked out.
      expect(saveFile.mock.calls[0][3]).toEqual({ preserveName: true });
      expect(saveFile.mock.calls[0][0].name).toBe(page.items[0].outputFile!.name);
    });

    it('saves the leftovers under their own names too', async () => {
      const saveFile = vi.spyOn(storage, 'saveFile').mockResolvedValue('file:///Documents/out.pdf');
      const bytes = await makePdf((p, f) => p.drawText('Report', { x: 20, y: 250, size: 12, font: f.regular }));
      const outputFile = new File([bytes], 'Annual_Report.pdf', { type: 'application/pdf' });

      page.operation = 'rename-from-content';
      page.items = [
        {
          id: 'a',
          file: new File([bytes], 'scan.pdf', { type: 'application/pdf' }),
          status: 'done',
          originalSizeBytes: bytes.byteLength,
          outputFile,
          quotaCharged: false
        }
      ];

      await page.saveAll();

      expect(saveFile).toHaveBeenCalledTimes(1);
      expect(saveFile.mock.calls[0][3]).toEqual({ preserveName: true });
    });
  });

  describe('the CSV result log', () => {
    it('goes through storage, not an anchor the Android WebView ignores', async () => {
      const saveReport = vi
        .spyOn(storage, 'saveReportFile')
        .mockResolvedValue('file:///Documents/batch_results.csv');

      page.operation = 'compress';
      page.items = [
        {
          id: 'a',
          file: new File([new Uint8Array(10)], 'one.pdf', { type: 'application/pdf' }),
          status: 'failed',
          failureReason: 'Compression failed',
          originalSizeBytes: 10,
          quotaCharged: false
        }
      ];

      await page.downloadCsvLog();

      expect(saveReport).toHaveBeenCalledTimes(1);
      const written = saveReport.mock.calls[0][0];
      expect(written.name).toMatch(/^batch_compress_results_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(written.type).toBe('text/csv');
      expect(await written.text()).toContain('Compression failed');
    });

    it('records every file and its outcome', () => {
      page.items = [
        {
          id: 'a',
          file: new File([new Uint8Array(2048)], 'done.pdf', { type: 'application/pdf' }),
          status: 'done',
          originalSizeBytes: 2048,
          processedSizeBytes: 1024,
          outputFile: new File([new Uint8Array(1024)], 'done_compressed.pdf', { type: 'application/pdf' }),
          quotaCharged: true
        },
        {
          id: 'b',
          file: new File([new Uint8Array(4096)], 'broken, with comma.pdf', { type: 'application/pdf' }),
          status: 'failed',
          failureReason: 'Password is "required"',
          originalSizeBytes: 4096,
          quotaCharged: false
        }
      ];

      const csv = page.generateCsvLog();
      const lines = csv.split('\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('File Name');
      expect(lines[1]).toContain('done_compressed.pdf');
      // A comma in a name must not become a new column, and a quote in a
      // reason must be escaped rather than ending the field.
      expect(lines[2]).toContain('"broken, with comma.pdf"');
      expect(lines[2]).toContain('""required""');
    });
  });

  describe('renaming from content', () => {
    it('uses the largest text on the page, not the first string in the file', async () => {
      // A letterhead and a page number draw before the title, which is what
      // taking the first text item used to pick.
      const bytes = await makePdf((p, fonts) => {
        p.drawText('Ministry of Corporate Affairs', { x: 20, y: 280, size: 8, font: fonts.regular });
        p.drawText('Page 1', { x: 350, y: 280, size: 8, font: fonts.regular });
        p.drawText('Annual Return Form', {
          x: 20,
          y: 220,
          size: 24,
          font: fonts.bold,
          color: rgb(0, 0, 0)
        });
      });

      const name = await page.extractTitleAndGenerateFilename(
        new File([bytes], 'scan001.pdf', { type: 'application/pdf' })
      );

      expect(name).toBe('Annual_Return_Form.pdf');
    });

    it('prefers the document title when the PDF declares one', async () => {
      const doc = await PDFDocument.create();
      doc.setTitle('Property Tax Receipt');
      const p = doc.addPage([300, 200]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      p.drawText('something else entirely', { x: 10, y: 150, size: 20, font });
      const bytes = await doc.save();

      const name = await page.extractTitleAndGenerateFilename(
        new File([bytes], 'scan002.pdf', { type: 'application/pdf' })
      );

      expect(name).toBe('Property_Tax_Receipt.pdf');
    });

    it('says it found no title rather than inventing one', async () => {
      const name = await page.extractTitleAndGenerateFilename(
        new File([new Uint8Array([1, 2, 3, 4])], 'unreadable.pdf', { type: 'application/pdf' })
      );

      expect(name).toBeNull();
    });

    it('fails the item with a reason that points at the fix', async () => {
      vi.spyOn(storage, 'saveFile').mockResolvedValue('file:///x.pdf');
      const unreadable = new File([new Uint8Array([1, 2, 3, 4])], 'photo-scan.pdf', {
        type: 'application/pdf'
      });

      page.operation = 'rename-from-content';
      page.items = [
        { id: 'a', file: unreadable, status: 'queued', originalSizeBytes: 4, quotaCharged: false }
      ];

      await page.processBatch();

      expect(page.items[0].status).toBe('failed');
      expect(page.items[0].failureReason).toMatch(/OCR/i);
      expect(page.executionSummary!.failedCount).toBe(1);
    });
  });

  describe('the operation list', () => {
    it('offers the six additions the batch screen promises, plus compress', () => {
      expect(page.operations.map(o => o.id)).toEqual([
        'compress',
        'ocr',
        'convert-to-word',
        'protect',
        'unprotect',
        'metadata-strip',
        'rename-from-content'
      ]);
    });

    it('offers the OCR languages the app actually ships', () => {
      // The screen used to offer Spanish, French, German, Italian and
      // Portuguese — none of which the rest of the app supports — while
      // leaving out Marathi, Bengali and Punjabi, which it does.
      expect(page.ocrLanguages).toEqual(OCR_SUPPORTED_LANGUAGES);
      expect(page.ocrLanguages.map(l => l.code)).toEqual(['eng', 'hin', 'mar', 'ben', 'pan']);
    });

    it('refuses to start protect or unprotect without a password', async () => {
      const saveFile = vi.spyOn(storage, 'saveFile').mockResolvedValue('file:///x.pdf');
      const bytes = await makePdf((p, f) => p.drawText('x', { x: 10, y: 10, size: 10, font: f.regular }));

      page.operation = 'protect';
      page.password = '';
      page.items = [
        {
          id: 'a',
          file: new File([bytes], 'doc.pdf', { type: 'application/pdf' }),
          status: 'queued',
          originalSizeBytes: bytes.byteLength,
          quotaCharged: false
        }
      ];

      await page.processBatch();

      expect(page.items[0].status).toBe('queued');
      expect(saveFile).not.toHaveBeenCalled();
    });
  });

  describe('the run summary', () => {
    it('reports what was processed and what was not', async () => {
      vi.spyOn(storage, 'saveFile').mockResolvedValue('file:///Documents/out.pdf');
      const good = await makePdf((p, f) => p.drawText('Title Here', { x: 20, y: 250, size: 18, font: f.bold }));

      page.operation = 'rename-from-content';
      page.items = [
        {
          id: 'a',
          file: new File([good], 'a.pdf', { type: 'application/pdf' }),
          status: 'queued',
          originalSizeBytes: good.byteLength,
          quotaCharged: false
        },
        {
          id: 'b',
          file: new File([new Uint8Array([9, 9, 9])], 'b.pdf', { type: 'application/pdf' }),
          status: 'queued',
          originalSizeBytes: 3,
          quotaCharged: false
        }
      ];

      await page.processBatch();

      expect(page.executionSummary).toBeDefined();
      expect(page.items[1].status).toBe('failed');
      expect(page.executionSummary!.totalFiles).toBe(2);
      expect(
        page.executionSummary!.processedCount + page.executionSummary!.failedCount
      ).toBe(2);
      expect(page.executionSummary!.quotaBlocked).toBe(false);
    });
  });
});
