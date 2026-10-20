import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { PdfInspectorService } from './pdf-inspector.service';
import { StorageService } from './storage.service';

describe('PdfInspectorService (G4: Embedded Object Inspector)', () => {
  let service: PdfInspectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PdfInspectorService,
        {
          provide: StorageService,
          useValue: { saveFile: async () => 'mock://saved' }
        }
      ]
    });
    service = TestBed.inject(PdfInspectorService);
  });

  it('reports a clean document as clean with zero attachments and zero JavaScript scripts', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);
    const cleanBytes = await doc.save();

    const report = await service.inspectDocument(cleanBytes.buffer, 'clean.pdf');

    expect(report.fileName).toBe('clean.pdf');
    expect(report.pageCount).toBe(1);
    expect(report.attachments.length).toBe(0);
    expect(report.javaScriptActions.length).toBe(0);
    expect(report.linkActions.length).toBe(0);
    expect(report.hasSuspiciousActions).toBe(false);
  });

  it('detects embedded JavaScript in /OpenAction and shows exact code content', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);

    const scriptText = 'app.alert("Security Verification Notice");';
    const actionDict = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of(scriptText)
    });
    const actionRef = doc.context.register(actionDict);
    doc.catalog.set(PDFName.of('OpenAction'), actionRef);

    const bytes = await doc.save();
    const report = await service.inspectDocument(bytes.buffer, 'openaction.pdf');

    expect(report.javaScriptActions.length).toBe(1);
    expect(report.javaScriptActions[0].source).toBe('/OpenAction');
    expect(report.javaScriptActions[0].code).toContain('app.alert');
    expect(report.hasSuspiciousActions).toBe(true);
  });

  it('performs attachment round-trip: embeds attachment, inspects, extracts, and matches bytes', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);

    const payloadText = 'Payload content for integrity verification test';
    const base64Payload = btoa(payloadText);
    await doc.attach(base64Payload, 'payload.txt', {
      mimeType: 'text/plain',
      description: 'Test payload file'
    });

    const bytes = await doc.save();
    const report = await service.inspectDocument(bytes.buffer, 'attached.pdf');

    expect(report.attachments.length).toBe(1);
    const att = report.attachments[0];
    expect(att.name).toBe('payload.txt');
    expect(att.sizeBytes).toBe(payloadText.length);

    // Verify extracted byte payload matches original
    const extractedText = new TextDecoder().decode(att.data);
    expect(extractedText).toBe(payloadText);
  });

  it('deletes JavaScript actions safely from the document', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);

    const actionDict = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of('console.log("Delete Me");')
    });
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(actionDict));

    const bytes = await doc.save();
    const before = await service.inspectDocument(bytes.buffer, 'with_js.pdf');
    expect(before.javaScriptActions.length).toBe(1);

    const cleanedBytes = await service.deleteJavaScriptAction(bytes.buffer, 'js_openaction');
    const after = await service.inspectDocument(cleanedBytes.buffer, 'cleaned.pdf');
    expect(after.javaScriptActions.length).toBe(0);
  });
});
