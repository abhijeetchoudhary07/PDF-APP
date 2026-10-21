import { describe, it, expect, beforeEach } from 'vitest';
import { PdfFlattenService } from './pdf-flatten.service';
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib';

describe('PdfFlattenService (G7)', () => {
  let service: PdfFlattenService;

  beforeEach(() => {
    service = new PdfFlattenService();
  });

  async function createFixtureWithFormAndAnnotation() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);

    // Create a form field
    const form = doc.getForm();
    const tf = form.createTextField('test_field');
    tf.setText('Interactive Text');
    tf.addToPage(page, { x: 50, y: 700, width: 200, height: 30 });

    // Create a standalone annotation (Text comment)
    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [50, 600, 100, 650],
      Contents: PDFString.of('Sticky note comment'),
      T: PDFString.of('UserComment')
    });
    const annotRef = doc.context.register(annotDict);
    page.node.Annots().push(annotRef);

    const bytes = await doc.save();
    return bytes.buffer as ArrayBuffer;
  }

  it('default behaviour flattens everything (backward compatibility)', async () => {
    const buffer = await createFixtureWithFormAndAnnotation();
    const result = await service.flattenPdf(buffer, 'vector', 'flat.pdf');

    expect(result.report).toBeDefined();
    expect(result.report?.target).toBe('everything');
    expect(result.report?.bakedCount).toBeGreaterThanOrEqual(2);

    const outputDoc = await PDFDocument.load(await result.flattenedFile.arrayBuffer());
    expect(outputDoc.getForm().getFields().length).toBe(0);
    // Non-widget annotations are purged/baked
    const pageAnnots = outputDoc.getPage(0).node.Annots();
    expect(pageAnnots ? pageAnnots.size() : 0).toBe(0);
  });

  it('forms-only target bakes form fields but leaves annotations interactive', async () => {
    const buffer = await createFixtureWithFormAndAnnotation();
    const result = await service.flattenPdf(buffer, 'vector', 'forms_flat.pdf', undefined, 'forms');

    expect(result.report?.target).toBe('forms');
    const formItem = result.report?.items.find(i => i.type === 'form_field');
    expect(formItem?.status).toBe('baked');

    const annotItem = result.report?.items.find(i => i.type === 'annotation');
    expect(annotItem?.status).toBe('skipped');
    expect(annotItem?.reason).toContain('left interactive');

    const outputDoc = await PDFDocument.load(await result.flattenedFile.arrayBuffer());
    expect(outputDoc.getForm().getFields().length).toBe(0);
    // Annotation remains interactive in output doc
    const pageAnnots = outputDoc.getPage(0).node.Annots();
    expect(pageAnnots).toBeDefined();
    expect(pageAnnots!.size()).toBe(1);
  });

  it('annotations-only target bakes annotations but leaves form fields interactive', async () => {
    const buffer = await createFixtureWithFormAndAnnotation();
    const result = await service.flattenPdf(buffer, 'vector', 'annots_flat.pdf', undefined, 'annotations');

    expect(result.report?.target).toBe('annotations');
    const formItem = result.report?.items.find(i => i.type === 'form_field');
    expect(formItem?.status).toBe('skipped');

    const annotItem = result.report?.items.find(i => i.type === 'annotation');
    expect(annotItem?.status).toBe('baked');

    const outputDoc = await PDFDocument.load(await result.flattenedFile.arrayBuffer());
    expect(outputDoc.getForm().getFields().length).toBe(1);
  });

  it('lists an un-flattenable or unsupported item in the report when encountered', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);

    // Create an unflattenable corrupted annotation
    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'CustomCorrupt',
      Unflattenable: PDFString.of('true'),
      T: PDFString.of('CorruptElement')
    });
    const annotRef = doc.context.register(annotDict);
    page.node.set(PDFName.of('Annots'), doc.context.obj([annotRef]));

    const bytes = await doc.save();
    const result = await service.flattenPdf(bytes.buffer as ArrayBuffer, 'vector', 'test.pdf', undefined, 'everything');

    expect(result.report?.unsupportedCount).toBe(1);
    const item = result.report?.items.find(i => i.status === 'unsupported');
    expect(item).toBeDefined();
    expect(item?.reason).toContain('missing or invalid');

    // An unsupported annotation is pushed back into /Annots, so it is still
    // live in the output and has to be counted as such -- the comparison card
    // reads this number and must not claim a fully static document.
    expect(result.afterInteractiveCount).toBe(1);
  });

  it('reports elements left interactive by a selective target, so the UI cannot claim 100% static', async () => {
    const buffer = await createFixtureWithFormAndAnnotation();

    const formsOnly = await service.flattenPdf(buffer, 'vector', 'forms.pdf', undefined, 'forms');
    expect(formsOnly.report?.skippedCount).toBeGreaterThan(0);
    expect(formsOnly.afterInteractiveCount).toBe(formsOnly.report!.skippedCount);
    expect(formsOnly.afterInteractiveCount).toBeGreaterThan(0);

    const annotsOnly = await service.flattenPdf(buffer, 'vector', 'annots.pdf', undefined, 'annotations');
    expect(annotsOnly.afterInteractiveCount).toBeGreaterThan(0);

    // The all-in default is the only one allowed to report a fully static result.
    const everything = await service.flattenPdf(buffer, 'vector', 'all.pdf', undefined, 'everything');
    expect(everything.afterInteractiveCount).toBe(0);
  });
});
