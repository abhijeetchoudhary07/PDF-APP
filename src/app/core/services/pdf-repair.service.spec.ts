import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFDict } from 'pdf-lib';
import { PdfRepairService } from './pdf-repair.service';

describe('PdfRepairService (G2: Studio Health Strip & Byte Audit)', () => {
  let service: PdfRepairService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfRepairService]
    });
    service = TestBed.inject(PdfRepairService);
  });

  async function createCleanDoc(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('This is a clean digital document with ample searchable text for diagnosis.', {
      x: 50,
      y: 700,
      size: 12,
      font
    });
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Second page containing additional valid digital text layer for testing.', {
      x: 50,
      y: 700,
      size: 12,
      font
    });
    return await doc.save();
  }

  it('evaluates clean document: uniform page size, no encryption, no JS, high searchable text', async () => {
    const cleanBytes = await createCleanDoc();
    const report = await service.diagnosePdf(cleanBytes.buffer);

    expect(report.headerValid).toBe(true);
    expect(report.pageCount).toBe(2);
    expect(report.hasMixedPageSizes).toBe(false);
    expect(report.hasJavaScript).toBe(false);
    expect(report.hasAttachments).toBe(false);
    expect(report.isScannedVerdict).toBe(false);
    expect(report.searchableTextPercentage).toBeGreaterThanOrEqual(50);
  });

  it('detects mixed page sizes when pages have different dimensions', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]); // A4
    doc.addPage([612, 792]); // Letter
    const mixedBytes = await doc.save();

    const report = await service.diagnosePdf(mixedBytes.buffer);
    expect(report.hasMixedPageSizes).toBe(true);
    expect(report.pageSizeVarieties?.length).toBeGreaterThan(1);
  });

  it('detects JavaScript when interactive scripts are present in the catalog', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);

    // Add JavaScript action in OpenAction
    const jsDict = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of('app.alert("Hello");')
    });
    const jsRef = doc.context.register(jsDict);
    doc.catalog.set(PDFName.of('OpenAction'), jsRef);

    const jsBytes = await doc.save();
    const report = await service.diagnosePdf(jsBytes.buffer);
    expect(report.hasJavaScript).toBe(true);
  });

  it('detects embedded file attachments', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);

    // Attach sample file via pdf-lib attach
    await doc.attach(new Uint8Array([1, 2, 3, 4]), 'test.txt', {
      mimeType: 'text/plain',
      description: 'Test attachment'
    });

    const attachedBytes = await doc.save();
    const report = await service.diagnosePdf(attachedBytes.buffer);
    expect(report.hasAttachments).toBe(true);
  });

  it('flags scanned verdict when document has zero or negligible text', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]); // Blank page with no text layer
    const scanBytes = await doc.save();

    const report = await service.diagnosePdf(scanBytes.buffer);
    expect(report.isScannedVerdict).toBe(true);
    expect(report.searchableTextPercentage).toBe(0);
  });

  it('performs byte audit and sorts pages descending by size', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // Page 1: small content
    const p1 = doc.addPage([400, 600]);
    p1.drawText('Tiny', { x: 50, y: 500, size: 10, font });

    // Page 2: heavy content with repetitive text
    const p2 = doc.addPage([400, 600]);
    for (let i = 0; i < 50; i++) {
      p2.drawText(`Heavy content line ${i} with lots of bytes written here to make page 2 heavier`, {
        x: 10,
        y: 10 + i * 10,
        size: 9,
        font
      });
    }

    const bytes = await doc.save();
    const audit = await service.auditPdfBytes(bytes.buffer);

    expect(audit.totalSizeBytes).toBeGreaterThan(0);
    expect(audit.pages.length).toBe(2);
    // Verified that list is sorted descending
    expect(audit.pages[0].estimatedSizeBytes).toBeGreaterThanOrEqual(audit.pages[1].estimatedSizeBytes);
  });
});
