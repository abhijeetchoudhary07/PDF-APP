import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDict, PDFDocument, PDFHexString, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { PdfMergePreflightService } from './pdf-merge-preflight.service';
import { PdfCombineService } from './pdf-combine.service';
import {
  CombineSource,
  defaultMergeOptions,
  defaultMergeResolution
} from '../models/pdf-combine.types';
import { LAYOUT_PAPER_SIZES_PT } from '../models/pdf-layout.types';

const A4 = LAYOUT_PAPER_SIZES_PT.A4;

async function toSource(
  id: string,
  name: string,
  doc: PDFDocument
): Promise<CombineSource> {
  const bytes = await doc.save({ useObjectStreams: false });
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  return {
    id,
    name,
    pageCount: doc.getPageCount(),
    sizeBytes: buffer.byteLength,
    lastModified: 0,
    buffer
  };
}

/** A one-page form with the given text fields, each holding a value. */
async function formDoc(
  fields: Array<{ name: string; value: string }>
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([A4.width, A4.height]);
  page.drawText('Form', { x: 40, y: A4.height - 60, size: 14, font, color: rgb(0, 0, 0) });

  const form = doc.getForm();
  fields.forEach((field, index) => {
    const text = form.createTextField(field.name);
    text.setText(field.value);
    text.addToPage(page, {
      x: 40,
      y: A4.height - 120 - index * 40,
      width: 220,
      height: 24,
      font
    });
  });

  return doc;
}

/** A plain one-page document with no interactive layer at all. */
async function plainDoc(label = 'Plain'): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([A4.width, A4.height]);
  page.drawText(label, { x: 40, y: A4.height - 60, size: 14, font, color: rgb(0, 0, 0) });
  return doc;
}

/**
 * A document carrying a signature field.
 *
 * pdf-lib has no signature API, so the field is written by hand: a /Sig field
 * with a value, registered in /AcroForm, plus the /Perms entry a signed
 * document carries. That is what a reader looks at, and so what the preflight
 * has to find.
 */
async function signedDoc(fieldName = 'Signature1'): Promise<PDFDocument> {
  const doc = await plainDoc('Signed');
  const page = doc.getPage(0);
  const context = doc.context;

  const sigValueRef = context.register(
    context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached' })
  );

  /*
   * /T has to go in as a string object. `context.obj('x')` builds a PDFName,
   * so passing the name through the plain-object helper would write `/Sig1`
   * where a reader expects `(Sig1)` — which is also how a real producer
   * writes it, and so what the walk has to find.
   */
  const widgetRef = context.nextRef();
  const fieldRef = context.register(
    context.obj({
      FT: 'Sig',
      T: PDFHexString.fromText(fieldName),
      Kids: [widgetRef],
      V: sigValueRef
    })
  );
  context.assign(
    widgetRef,
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      Rect: [40, 80, 240, 140],
      F: 4,
      Parent: fieldRef
    })
  );

  const annots = page.node.Annots();
  if (annots) {
    annots.push(widgetRef);
  } else {
    page.node.set(PDFName.of('Annots'), context.obj([widgetRef]));
  }

  const acroFormRef = context.register(
    context.obj({ Fields: [fieldRef], SigFlags: 3 })
  );
  doc.catalog.set(PDFName.of('AcroForm'), acroFormRef);
  doc.catalog.set(
    PDFName.of('Perms'),
    context.obj({ DocMDP: sigValueRef })
  );

  return doc;
}

describe('PdfMergePreflightService (C5 — form fields and signatures)', () => {
  let service: PdfMergePreflightService;
  let combine: PdfCombineService;

  beforeEach(() => {
    service = new PdfMergePreflightService();
    combine = new PdfCombineService();
  });

  // ──────────────────────────────────────────────────────────────────
  describe('a clean document goes straight through', () => {
    it('reports clean for documents with no fields and no signatures', async () => {
      const report = await service.inspect([
        await toSource('a', 'a.pdf', await plainDoc('A')),
        await toSource('b', 'b.pdf', await plainDoc('B'))
      ]);

      expect(report.clean).toBe(true);
      expect(report.collisions).toEqual([]);
      expect(report.signatures).toEqual([]);
      expect(report.totalFieldCount).toBe(0);
    });

    it('reports clean when the field names do not overlap', async () => {
      const report = await service.inspect([
        await toSource('a', 'a.pdf', await formDoc([{ name: 'applicant.name', value: 'A' }])),
        await toSource('b', 'b.pdf', await formDoc([{ name: 'guardian.name', value: 'B' }]))
      ]);

      expect(report.clean).toBe(true);
      expect(report.totalFieldCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('colliding field names', () => {
    it('detects a name that two sources both declare', async () => {
      const report = await service.inspect([
        await toSource('a', 'bank_form.pdf', await formDoc([
          { name: 'applicant.name', value: 'Asha' },
          { name: 'applicant.dob', value: '1999-01-01' }
        ])),
        await toSource('b', 'school_form.pdf', await formDoc([
          { name: 'applicant.name', value: 'Asha' },
          { name: 'school.code', value: '41' }
        ]))
      ]);

      expect(report.clean).toBe(false);
      expect(report.collisions).toHaveLength(1);
      expect(report.collisions[0].fieldName).toBe('applicant.name');
      expect(report.collisions[0].sourceIndexes).toEqual([0, 1]);
      expect(report.collisions[0].sourceNames).toEqual(['bank_form.pdf', 'school_form.pdf']);
    });

    it('does not report a name repeated inside one document', () => {
      const collisions = service.findCollisions([
        { sourceIndex: 0, sourceName: 'a.pdf', fieldNames: ['name', 'name', 'dob'] }
      ]);
      expect(collisions).toEqual([]);
    });

    it('reports every source a colliding name appears in', () => {
      const collisions = service.findCollisions([
        { sourceIndex: 0, sourceName: 'a.pdf', fieldNames: ['name'] },
        { sourceIndex: 1, sourceName: 'b.pdf', fieldNames: ['name'] },
        { sourceIndex: 2, sourceName: 'c.pdf', fieldNames: ['name'] }
      ]);
      expect(collisions[0].sourceIndexes).toEqual([0, 1, 2]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('renaming', () => {
    it('builds a suffix from the file name, and falls back when it cannot', async () => {
      const named = await toSource('a', 'Bank Form (2026).pdf', await plainDoc());
      expect(service.suffixFor(named, 0)).toBe('Bank_Form_2026');

      const nonLatin = await toSource('b', 'दस्तावेज़.pdf', await plainDoc());
      expect(service.suffixFor(nonLatin, 3)).toBe('file4');
    });

    it('produces unique names with the values preserved', async () => {
      const a = await toSource('a', 'bank.pdf', await formDoc([
        { name: 'applicant.name', value: 'Asha' },
        { name: 'applicant.dob', value: '1999-01-01' }
      ]));
      const b = await toSource('b', 'school.pdf', await formDoc([
        { name: 'applicant.name', value: 'Ravi' }
      ]));

      const report = await service.inspect([a, b]);
      const resolvedA = await service.applyResolution(
        a,
        0,
        { ...defaultMergeResolution(), fields: 'rename' },
        report.collisions,
        report.signatures
      );
      const resolvedB = await service.applyResolution(
        b,
        1,
        { ...defaultMergeResolution(), fields: 'rename' },
        report.collisions,
        report.signatures
      );

      expect(resolvedA.notices.some(n => n.kind === 'fields-renamed')).toBe(true);

      const docA = await PDFDocument.load(resolvedA.buffer);
      const docB = await PDFDocument.load(resolvedB.buffer);
      const namesA = docA.getForm().getFields().map(f => f.getName());
      const namesB = docB.getForm().getFields().map(f => f.getName());

      // The colliding name is suffixed per file; the others are untouched.
      expect(namesA).toContain('applicant.name_bank');
      expect(namesA).toContain('applicant.dob');
      expect(namesB).toContain('applicant.name_school');

      // No name appears in both documents any more.
      expect(namesA.filter(n => namesB.includes(n))).toEqual([]);

      // And the values somebody typed are still there.
      expect(docA.getForm().getTextField('applicant.name_bank').getText()).toBe('Asha');
      expect(docB.getForm().getTextField('applicant.name_school').getText()).toBe('Ravi');
    });

    it('leaves a source with no collisions byte-identical', async () => {
      const a = await toSource('a', 'a.pdf', await formDoc([{ name: 'only.here', value: 'x' }]));
      const b = await toSource('b', 'b.pdf', await plainDoc());

      const report = await service.inspect([a, b]);
      const resolved = await service.applyResolution(
        a,
        0,
        defaultMergeResolution(),
        report.collisions,
        report.signatures
      );

      // Same buffer object: nothing was rewritten, so nothing can have changed.
      expect(resolved.buffer).toBe(a.buffer);
      expect(resolved.notices).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('flattening', () => {
    it('removes the fields and reports that it did', async () => {
      const a = await toSource('a', 'bank.pdf', await formDoc([
        { name: 'applicant.name', value: 'Asha' }
      ]));
      const b = await toSource('b', 'school.pdf', await formDoc([
        { name: 'applicant.name', value: 'Ravi' }
      ]));

      const report = await service.inspect([a, b]);
      const resolved = await service.applyResolution(
        a,
        0,
        { ...defaultMergeResolution(), fields: 'flatten' },
        report.collisions,
        report.signatures
      );

      expect(resolved.notices.some(n => n.kind === 'fields-flattened')).toBe(true);
      const doc = await PDFDocument.load(resolved.buffer);
      expect(doc.getForm().getFields()).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('signatures', () => {
    it('finds a signature field and the document permissions entry', async () => {
      const report = await service.inspect([
        await toSource('a', 'signed.pdf', await signedDoc()),
        await toSource('b', 'plain.pdf', await plainDoc())
      ]);

      expect(report.clean).toBe(false);
      expect(report.signatures).toHaveLength(1);
      expect(report.signatures[0].sourceName).toBe('signed.pdf');
      expect(report.signatures[0].fieldNames).toEqual(['Signature1']);
      expect(report.signatures[0].hasSignedValue).toBe(true);
      expect(report.signatures[0].hasDocumentPermissions).toBe(true);
    });

    it('does not count a signature field among the form fields that can collide', async () => {
      const report = await service.inspect([
        await toSource('a', 'signed.pdf', await signedDoc()),
        await toSource('b', 'signed2.pdf', await signedDoc())
      ]);

      // Both declare "Signature1", and that is not a collision worth renaming:
      // the signatures are going either way.
      expect(report.collisions).toEqual([]);
      expect(report.totalFieldCount).toBe(0);
      expect(report.signatures).toHaveLength(2);
    });

    it('strips the signature, its widget and the permissions entry', async () => {
      const a = await toSource('a', 'signed.pdf', await signedDoc());
      const report = await service.inspect([a]);

      const resolved = await service.applyResolution(
        a,
        0,
        { ...defaultMergeResolution(), signatures: 'strip' },
        report.collisions,
        report.signatures
      );

      expect(resolved.notices.some(n => n.kind === 'signatures-stripped')).toBe(true);

      const doc = await PDFDocument.load(resolved.buffer);
      expect(doc.catalog.get(PDFName.of('Perms'))).toBeUndefined();

      const acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
      expect(acroForm?.get(PDFName.of('SigFlags'))).toBeUndefined();

      // The appearance goes with the value: nothing is left looking signed.
      const annots = doc.getPage(0).node.Annots();
      expect(annots?.size() ?? 0).toBe(0);

      const after = await service.inspect([{ ...a, buffer: resolved.buffer }]);
      expect(after.signatures).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  describe('the merged form still works', () => {
    it('registers the copied widgets, which copyPages does not', async () => {
      const a = await toSource('a', 'bank.pdf', await formDoc([{ name: 'bank.ifsc', value: 'X' }]));
      const b = await toSource('b', 'school.pdf', await formDoc([{ name: 'school.code', value: 'Y' }]));

      const output = await combine.exportMerged([a, b], defaultMergeOptions(), 'merged.pdf');
      const merged = await PDFDocument.load(await output.blob.arrayBuffer());

      /*
       * Without the rebuild this is zero: the widgets render and no reader can
       * find the fields they belong to, so nothing can be typed into them.
       */
      const names = merged.getForm().getFields().map(f => f.getName());
      expect(names).toContain('bank.ifsc');
      expect(names).toContain('school.code');
    });

    it('asks the reader to regenerate appearances for a merged form', async () => {
      const a = await toSource('a', 'a.pdf', await formDoc([{ name: 'one', value: '1' }]));
      const output = await combine.exportMerged([a], defaultMergeOptions(), 'merged.pdf');
      const merged = await PDFDocument.load(await output.blob.arrayBuffer());

      const acroForm = merged.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
      expect(acroForm?.get(PDFName.of('NeedAppearances'))).toBeDefined();
    });

    it('leaves a merge of plain documents without a form', async () => {
      const a = await toSource('a', 'a.pdf', await plainDoc('A'));
      const b = await toSource('b', 'b.pdf', await plainDoc('B'));

      const output = await combine.exportMerged([a, b], defaultMergeOptions(), 'merged.pdf');
      const merged = await PDFDocument.load(await output.blob.arrayBuffer());

      expect(merged.catalog.get(PDFName.of('AcroForm'))).toBeUndefined();
    });

    it('counts the fields it registered', async () => {
      const doc = await formDoc([
        { name: 'a', value: '1' },
        { name: 'b', value: '2' }
      ]);
      expect(service.rebuildAcroForm(doc)).toBe(2);
    });
  });
});
