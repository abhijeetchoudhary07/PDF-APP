import { describe, it, expect, beforeEach } from 'vitest';
import { PdfArchivalService } from './pdf-archival.service';
import { PDFDocument, PDFName, PDFDict, PDFString } from 'pdf-lib';

describe('PdfArchivalService (G6)', () => {
  let service: PdfArchivalService;

  beforeEach(() => {
    service = new PdfArchivalService();
  });

  it('audits a clean document and reports archival readiness items', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();

    const report = await service.auditArchivalReadiness(bytes.buffer as ArrayBuffer);

    expect(report.disclaimer).toBe('Prepared for archiving — not independently validated');
    expect(report.items.length).toBeGreaterThan(0);
    expect(report.canProceed).toBe(true);
  });

  it('detects and purges JavaScript actions during archival preparation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);

    // Add JavaScript OpenAction
    const jsAction = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of('app.alert("Hello");')
    });
    doc.catalog.set(PDFName.of('OpenAction'), jsAction);
    const bytesWithJs = await doc.save();

    // 1. Audit detects active scripts
    const preAudit = await service.auditArchivalReadiness(bytesWithJs.buffer as ArrayBuffer);
    const jsItem = preAudit.items.find(i => i.id === 'javascript');
    expect(jsItem?.status).toBe('repaired');

    // 2. Convert to archival
    const result = await service.convertToArchival(bytesWithJs.buffer as ArrayBuffer, 'clean.pdf');
    expect(result.report.javascriptStripped).toBe(true);

    // 3. Inspect saved output
    const cleanDoc = await PDFDocument.load(await result.archivalFile.arrayBuffer());
    expect(cleanDoc.catalog.has(PDFName.of('OpenAction'))).toBe(false);
  });

  it('embeds sRGB output intent and conforming XMP metadata in archival output', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();

    const result = await service.convertToArchival(bytes.buffer as ArrayBuffer, 'archived.pdf');

    expect(result.archivalFile).toBeDefined();
    expect(result.report.outputIntentSet).toBe(true);
    expect(result.report.xmpConforming).toBe(true);

    const savedDoc = await PDFDocument.load(await result.archivalFile.arrayBuffer());
    expect(savedDoc.catalog.has(PDFName.of('OutputIntents'))).toBe(true);
    expect(savedDoc.catalog.has(PDFName.of('Metadata'))).toBe(true);
  });

  it('flags unparseable or critically damaged documents and reports why', async () => {
    const garbageBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const report = await service.auditArchivalReadiness(garbageBytes.buffer as ArrayBuffer);

    expect(report.overallStatus).toBe('attention_required');
    expect(report.canProceed).toBe(false);
    expect(report.items.some(i => i.status === 'not_ready')).toBe(true);
    expect(report.items[0].details).toContain('The document structure could not be parsed');
  });

  it('guarantees no strings assert full PDF/A compliance or certification', () => {
    expect(PdfArchivalService.DISCLAIMER.toLowerCase()).not.toContain('compliant');
    expect(PdfArchivalService.DISCLAIMER.toLowerCase()).not.toContain('certified');
    expect(PdfArchivalService.DISCLAIMER).toBe('Prepared for archiving — not independently validated');
  });
});
