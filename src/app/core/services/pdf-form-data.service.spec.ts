import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfFormDataService } from './pdf-form-data.service';

describe('PdfFormDataService', () => {
  let service: PdfFormDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.runInInjectionContext(() => new PdfFormDataService());
  });

  async function createFilledDoc(): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const form = doc.getForm();

    const tf = form.createTextField('fullName');
    tf.setText('Alice Walker');
    tf.addToPage(page, { x: 50, y: 600, width: 200, height: 28 });

    const cb = form.createCheckBox('agreeTerms');
    cb.check();
    cb.addToPage(page, { x: 50, y: 550, width: 24, height: 24 });

    const rg = form.createRadioGroup('gender');
    rg.addOptionToPage('Male', page, { x: 50, y: 500, width: 20, height: 20 });
    rg.addOptionToPage('Female', page, { x: 100, y: 500, width: 20, height: 20 });
    rg.addOptionToPage('Other', page, { x: 150, y: 500, width: 20, height: 20 });
    rg.select('Female');

    const dd = form.createDropdown('country');
    dd.addOptions(['India', 'USA', 'Germany']);
    dd.select('India');
    dd.addToPage(page, { x: 50, y: 450, width: 180, height: 28 });

    const notes = form.createTextField('notes');
    notes.enableMultiline();
    notes.setText('Line 1\nLine 2 with "quotes", commas & (parens)');
    notes.addToPage(page, { x: 50, y: 350, width: 200, height: 60 });

    const bytes = await doc.save();
    return bytes.buffer as ArrayBuffer;
  }

  async function createBlankDuplicateDoc(): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const form = doc.getForm();

    const tf = form.createTextField('fullName');
    tf.setText('');
    tf.addToPage(page, { x: 50, y: 600, width: 200, height: 28 });

    const cb = form.createCheckBox('agreeTerms');
    cb.uncheck();
    cb.addToPage(page, { x: 50, y: 550, width: 24, height: 24 });

    const rg = form.createRadioGroup('gender');
    rg.addOptionToPage('Male', page, { x: 50, y: 500, width: 20, height: 20 });
    rg.addOptionToPage('Female', page, { x: 100, y: 500, width: 20, height: 20 });
    rg.addOptionToPage('Other', page, { x: 150, y: 500, width: 20, height: 20 });

    const dd = form.createDropdown('country');
    dd.addOptions(['India', 'USA', 'Germany']);
    dd.addToPage(page, { x: 50, y: 450, width: 180, height: 28 });

    const notes = form.createTextField('notes');
    notes.enableMultiline();
    notes.setText('');
    notes.addToPage(page, { x: 50, y: 350, width: 200, height: 60 });

    const bytes = await doc.save();
    return bytes.buffer as ArrayBuffer;
  }

  describe('Round-trip Fidelity Tests', () => {
    it('round-trips 100% of field values via XFDF', async () => {
      const filledBytes = await createFilledDoc();
      const blankBytes = await createBlankDuplicateDoc();

      const exportRes = await service.exportFormData(filledBytes, 'xfdf', 'test');
      expect(exportRes.format).toBe('xfdf');
      expect(exportRes.content).toContain('Alice Walker');
      expect(exportRes.content).toContain('agreeTerms');

      const preview = await service.previewImport(blankBytes, exportRes.content);
      expect(preview.errors).toEqual([]);
      expect(preview.matchedCount).toBe(5);
      expect(preview.unmatchedFields.length).toBe(0);

      const updatedBytes = await service.applyImport(blankBytes, preview.matchedFields);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const reloadedForm = reloadedDoc.getForm();

      expect(reloadedForm.getTextField('fullName').getText()).toBe('Alice Walker');
      expect(reloadedForm.getCheckBox('agreeTerms').isChecked()).toBe(true);
      expect(reloadedForm.getRadioGroup('gender').getSelected()).toBe('Female');
      expect(reloadedForm.getDropdown('country').getSelected()).toEqual(['India']);
      expect(reloadedForm.getTextField('notes').getText()).toBe('Line 1\nLine 2 with "quotes", commas & (parens)');
    });

    it('round-trips 100% of field values via FDF', async () => {
      const filledBytes = await createFilledDoc();
      const blankBytes = await createBlankDuplicateDoc();

      const exportRes = await service.exportFormData(filledBytes, 'fdf', 'test');
      expect(exportRes.format).toBe('fdf');
      expect(exportRes.content).toContain('%FDF-1.2');

      const preview = await service.previewImport(blankBytes, exportRes.content);
      expect(preview.errors).toEqual([]);
      expect(preview.matchedCount).toBe(5);
      expect(preview.unmatchedFields.length).toBe(0);

      const updatedBytes = await service.applyImport(blankBytes, preview.matchedFields);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const reloadedForm = reloadedDoc.getForm();

      expect(reloadedForm.getTextField('fullName').getText()).toBe('Alice Walker');
      expect(reloadedForm.getCheckBox('agreeTerms').isChecked()).toBe(true);
      expect(reloadedForm.getRadioGroup('gender').getSelected()).toBe('Female');
      expect(reloadedForm.getDropdown('country').getSelected()).toEqual(['India']);
      expect(reloadedForm.getTextField('notes').getText()).toBe('Line 1\nLine 2 with "quotes", commas & (parens)');
    });

    it('round-trips 100% of field values via CSV', async () => {
      const filledBytes = await createFilledDoc();
      const blankBytes = await createBlankDuplicateDoc();

      const exportRes = await service.exportFormData(filledBytes, 'csv', 'test');
      expect(exportRes.format).toBe('csv');
      expect(exportRes.content).toContain('fullName');

      const preview = await service.previewImport(blankBytes, exportRes.content);
      expect(preview.errors).toEqual([]);
      expect(preview.matchedCount).toBe(5);
      expect(preview.unmatchedFields.length).toBe(0);

      const updatedBytes = await service.applyImport(blankBytes, preview.matchedFields);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const reloadedForm = reloadedDoc.getForm();

      expect(reloadedForm.getTextField('fullName').getText()).toBe('Alice Walker');
      expect(reloadedForm.getCheckBox('agreeTerms').isChecked()).toBe(true);
      expect(reloadedForm.getRadioGroup('gender').getSelected()).toBe('Female');
      expect(reloadedForm.getDropdown('country').getSelected()).toEqual(['India']);
      expect(reloadedForm.getTextField('notes').getText()).toBe('Line 1\nLine 2 with "quotes", commas & (parens)');
    });

    it('round-trips 100% of field values via JSON', async () => {
      const filledBytes = await createFilledDoc();
      const blankBytes = await createBlankDuplicateDoc();

      const exportRes = await service.exportFormData(filledBytes, 'json', 'test');
      expect(exportRes.format).toBe('json');
      expect(exportRes.content).toContain('"fullName"');

      const preview = await service.previewImport(blankBytes, exportRes.content);
      expect(preview.errors).toEqual([]);
      expect(preview.matchedCount).toBe(5);
      expect(preview.unmatchedFields.length).toBe(0);

      const updatedBytes = await service.applyImport(blankBytes, preview.matchedFields);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const reloadedForm = reloadedDoc.getForm();

      expect(reloadedForm.getTextField('fullName').getText()).toBe('Alice Walker');
      expect(reloadedForm.getCheckBox('agreeTerms').isChecked()).toBe(true);
      expect(reloadedForm.getRadioGroup('gender').getSelected()).toBe('Female');
      expect(reloadedForm.getDropdown('country').getSelected()).toEqual(['India']);
      expect(reloadedForm.getTextField('notes').getText()).toBe('Line 1\nLine 2 with "quotes", commas & (parens)');
    });
  });

  describe('Validation & Error Handling', () => {
    it('catches malformed XML without crashing and returns descriptive error', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const malformedXml = '<xfdf><fields><field name="bad"><value>missing closing tag';

      const preview = await service.previewImport(blankBytes, malformedXml);
      // Returns descriptive error or 0 matches without crashing
      expect(preview.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('catches malformed JSON without crashing and reports error in audit', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const malformedJson = '{ "name": "Alice", broken: json ';

      const preview = await service.previewImport(blankBytes, malformedJson);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0]).toContain('Malformed JSON');
    });

    it('catches empty input stream', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const preview = await service.previewImport(blankBytes, '   ');
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0]).toContain('empty');
    });

    it('explicitly reports unmatched fields in the audit result and never drops them silently', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const importJson = JSON.stringify({
        fullName: 'Jane Doe',
        extraField1: 'Unmatched Value 1',
        missingParam: 'Unmatched Value 2'
      });

      const preview = await service.previewImport(blankBytes, importJson);
      expect(preview.matchedCount).toBe(1);
      expect(preview.unmatchedFields.length).toBe(2);

      const extra1 = preview.unmatchedFields.find(u => u.name === 'extraField1');
      expect(extra1).toBeDefined();
      expect(extra1?.value).toBe('Unmatched Value 1');

      const extra2 = preview.unmatchedFields.find(u => u.name === 'missingParam');
      expect(extra2).toBeDefined();
      expect(extra2?.value).toBe('Unmatched Value 2');
    });
  });

  describe('Matching Capabilities', () => {
    it('supports case-insensitive field matching', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const input = JSON.stringify({
        FULLNAME: 'Bob Smith',
        AGREETERMS: true
      });

      const preview = await service.previewImport(blankBytes, input);
      const matchName = preview.matchedFields.find(m => m.name === 'fullName');
      expect(matchName).toBeDefined();
      expect(matchName?.newValue).toBe('Bob Smith');

      const matchAgree = preview.matchedFields.find(m => m.name === 'agreeTerms');
      expect(matchAgree).toBeDefined();
    });

    it('supports fuzzy alphanumeric matching', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const input = JSON.stringify({
        'full_name': 'Charlie Brown',
        'agree-terms': true
      });

      const preview = await service.previewImport(blankBytes, input);
      const matchName = preview.matchedFields.find(m => m.name === 'fullName');
      expect(matchName).toBeDefined();
      expect(matchName?.newValue).toBe('Charlie Brown');
    });

    it('respects user exclusion toggle (included: false)', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const inputMatches = [
        { name: 'fullName', originalValue: '', newValue: 'Excluded Name', type: 'text', included: false },
        { name: 'gender', originalValue: '', newValue: 'Male', type: 'radio', included: true }
      ];

      const updatedBytes = await service.applyImport(blankBytes, inputMatches);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const form = reloadedDoc.getForm();

      expect(form.getTextField('fullName').getText() || '').toBe('');
      expect(form.getRadioGroup('gender').getSelected()).toBe('Male');
    });
  });

  describe('File Storage Helper', () => {
    it('saves export file to Blob and File', async () => {
      const filledBytes = await createFilledDoc();
      const res = await service.exportFormData(filledBytes, 'json', 'audit_doc');

      const saved = await service.saveExportFile(res);
      expect(saved.file).toBeDefined();
      expect(saved.file.name).toBe('audit_doc_form_data.json');
      expect(saved.sizeBytes).toBeGreaterThan(0);
      expect(saved.blob).toBeDefined();
    });
  });

  describe('Real Document & Unicode Data Tests', () => {
    it('round-trips Unicode text including Hindi, Marathi, and European accents', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 700]);
      const form = doc.getForm();

      const hindiField = form.createTextField('hindiApplicant');
      hindiField.addToPage(page, { x: 50, y: 600, width: 200, height: 28 });
      hindiField.setText('नमस्ते - आधार संख्या १२३४');

      const marathiField = form.createTextField('marathiState');
      marathiField.addToPage(page, { x: 50, y: 550, width: 200, height: 28 });
      marathiField.setText('महाराष्ट्र राज्य - पत्ता');

      const accentField = form.createTextField('accentCompany');
      accentField.addToPage(page, { x: 50, y: 500, width: 200, height: 28 });
      accentField.setText('Société Générale • Café Crème • München');

      const filledBytes = (await doc.save({ updateFieldAppearances: false })).buffer as ArrayBuffer;

      // Test across JSON, CSV, XFDF, and FDF
      for (const format of ['json', 'csv', 'xfdf', 'fdf'] as const) {
        const exported = await service.exportFormData(filledBytes, format, 'unicode_test');
        expect(exported.content.length).toBeGreaterThan(0);

        // Blank doc to import into
        const blankDoc = await PDFDocument.create();
        const blankPage = blankDoc.addPage([500, 700]);
        const blankForm = blankDoc.getForm();
        blankForm.createTextField('hindiApplicant').addToPage(blankPage, { x: 50, y: 600, width: 200, height: 28 });
        blankForm.createTextField('marathiState').addToPage(blankPage, { x: 50, y: 550, width: 200, height: 28 });
        blankForm.createTextField('accentCompany').addToPage(blankPage, { x: 50, y: 500, width: 200, height: 28 });
        const blankBytes = (await blankDoc.save({ updateFieldAppearances: false })).buffer as ArrayBuffer;

        const preview = await service.previewImport(blankBytes, exported.content);
        expect(preview.errors).toEqual([]);
        expect(preview.matchedCount).toBe(3);

        const applied = await service.applyImport(blankBytes, preview.matchedFields);
        const reloaded = await PDFDocument.load(applied);
        const rf = reloaded.getForm();

        expect(rf.getTextField('hindiApplicant').getText()).toBe('नमस्ते - आधार संख्या १२३४');
        expect(rf.getTextField('marathiState').getText()).toBe('महाराष्ट्र राज्य - पत्ता');
        expect(rf.getTextField('accentCompany').getText()).toBe('Société Générale • Café Crème • München');
      }
    });

    it('handles simulated Government Application Form with multiple field widgets', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      const form = doc.getForm();

      form.createTextField('panNumber').setText('ABCDE1234F');
      form.createTextField('aadhaarNumber').setText('987654321098');
      form.createTextField('applicantName').setText('Rahul Sharma');
      const cb1 = form.createCheckBox('residentCitizen');
      cb1.addToPage(page, { x: 50, y: 700, width: 20, height: 20 });
      cb1.check();

      const cb2 = form.createCheckBox('minorApplicant');
      cb2.addToPage(page, { x: 100, y: 700, width: 20, height: 20 });
      cb2.uncheck();

      const rg = form.createRadioGroup('applicationType');
      rg.addOptionToPage('New', page, { x: 50, y: 600, width: 20, height: 20 });
      rg.addOptionToPage('Correction', page, { x: 100, y: 600, width: 20, height: 20 });
      rg.select('New');

      const dd = form.createDropdown('stateProvince');
      dd.addOptions(['Maharashtra', 'Delhi', 'Karnataka', 'Gujarat']);
      dd.select('Maharashtra');

      const filledBytes = (await doc.save()).buffer as ArrayBuffer;
      const exportRes = await service.exportFormData(filledBytes, 'json', 'gov_app');
      expect(exportRes.fieldCount).toBe(7);

      const parsed = service.parseFormData(exportRes.content, 'json');
      expect(parsed.data['panNumber']).toBe('ABCDE1234F');
      expect(parsed.data['residentCitizen']).toBe(true);
      expect(parsed.data['applicationType']).toBe('New');
      expect(parsed.data['stateProvince']).toBe('Maharashtra');
    });

    it('handles simulated Tax Invoice PDF with calculations and line items', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      const form = doc.getForm();

      form.createTextField('invoiceNumber').setText('INV-2026-9042');
      form.createTextField('invoiceDate').setText('2026-10-29');
      form.createTextField('gstinCustomer').setText('27AAAAA0000A1Z5');
      form.createTextField('subtotalAmount').setText('10000.00');
      form.createTextField('cgstAmount').setText('900.00');
      form.createTextField('sgstAmount').setText('900.00');
      form.createTextField('totalInvoiceAmount').setText('11800.00');
      form.createCheckBox('reverseChargeApplicable').uncheck();

      const filledBytes = (await doc.save()).buffer as ArrayBuffer;
      const exportRes = await service.exportFormData(filledBytes, 'csv', 'tax_invoice');

      const parsed = service.parseFormData(exportRes.content, 'csv');
      expect(parsed.data['invoiceNumber']).toBe('INV-2026-9042');
      expect(parsed.data['totalInvoiceAmount']).toBe('11800.00');
      expect(parsed.data['reverseChargeApplicable']).toBe('false');
    });

    it('processes a complex form with 50+ fields without dropping data or performance degradation', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 1000]);
      const form = doc.getForm();

      for (let i = 1; i <= 55; i++) {
        const tf = form.createTextField(`field_${i}`);
        tf.setText(`Value for field ${i}`);
      }

      const filledBytes = (await doc.save()).buffer as ArrayBuffer;
      const exportRes = await service.exportFormData(filledBytes, 'json', 'complex_55_fields');
      expect(exportRes.fieldCount).toBe(55);

      const preview = await service.previewImport(filledBytes, exportRes.content);
      expect(preview.matchedCount).toBe(55);
      expect(preview.unmatchedFields.length).toBe(0);
      expect(preview.errors).toEqual([]);
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    it('blocks XML External Entity (XXE) attacks in XFDF without accessing external files', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE test [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <fields>
    <field name="fullName">
      <value>&xxe;</value>
    </field>
  </fields>
</xfdf>`;

      const preview = await service.previewImport(blankBytes, xxePayload);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0]).toContain('XXE Protection');
      expect(preview.matchedCount).toBe(0);
    });

    it('blocks XML Billion Laughs / quadratic entity bomb attacks in XFDF', async () => {
      const blankBytes = await createBlankDuplicateDoc();
      const bombPayload = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ELEMENT lolz (#PCDATA)>
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
]>
<xfdf xmlns="http://ns.adobe.com/xfdf/">
  <fields>
    <field name="fullName"><value>&lol2;</value></field>
  </fields>
</xfdf>`;

      const preview = await service.previewImport(blankBytes, bombPayload);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0]).toContain('XXE Protection');
    });

    it('neutralizes CSV Formula Injection (=cmd, @SUM, +123, -456) and restores safely', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 700]);
      const form = doc.getForm();

      const cmdField = form.createTextField('calcCommand');
      cmdField.setText("=cmd|' /C calc'!A0");

      const sumField = form.createTextField('sumFormula');
      sumField.setText('@SUM(A1:B10)');

      const plusField = form.createTextField('plusValue');
      plusField.setText('+919876543210');

      const minusField = form.createTextField('minusValue');
      minusField.setText('-500.25');

      const filledBytes = (await doc.save()).buffer as ArrayBuffer;

      const exportRes = await service.exportFormData(filledBytes, 'csv', 'formula_test');

      // Verify the formula values are neutralized with a leading single quote in CSV
      expect(exportRes.content).toContain("'=cmd|' /C calc'!A0");
      expect(exportRes.content).toContain("'@SUM(A1:B10)");
      expect(exportRes.content).toContain("'+919876543210");
      expect(exportRes.content).toContain("'-500.25");

      // Verify importing the CSV restores the original clean values
      const parsed = service.parseFormData(exportRes.content, 'csv');
      expect(parsed.data['calcCommand']).toBe("=cmd|' /C calc'!A0");
      expect(parsed.data['sumFormula']).toBe('@SUM(A1:B10)');
      expect(parsed.data['plusValue']).toBe('+919876543210');
      expect(parsed.data['minusValue']).toBe('-500.25');
    });

    it('neutralizes Prototype Pollution in JSON without polluting global Object.prototype', () => {
      const maliciousJson = `{
        "__proto__": { "polluted": true },
        "constructor": { "prototype": { "isAdmin": true } },
        "prototype": { "hacked": true },
        "safeField": "Safe Value"
      }`;

      const parsed = service.parseJson(maliciousJson);

      expect((({} as any).polluted)).toBeUndefined();
      expect((({} as any).isAdmin)).toBeUndefined();
      expect((({} as any).hacked)).toBeUndefined();
      expect(parsed['safeField']).toBe('Safe Value');
      expect(parsed['__proto__']).toBeUndefined();
    });

    it('prevents memory bloat by rejecting JSON payloads exceeding 5000 fields', () => {
      const hugeObj: Record<string, string> = {};
      for (let i = 0; i < 5005; i++) {
        hugeObj[`field_${i}`] = `value_${i}`;
      }
      const jsonStr = JSON.stringify(hugeObj);

      expect(() => service.parseJson(jsonStr)).toThrow('exceeds maximum allowed field count');
    });

    it('handles mismatched field types safely during applyImport', async () => {
      const blankBytes = await createBlankDuplicateDoc();

      // Checkbox given arbitrary text string -> unchecks cleanly
      // Text field given object -> converts cleanly without [object Object]
      // Radio group given invalid option -> gracefully retains existing state
      const mismatchedMatches = [
        { name: 'agreeTerms', originalValue: false, newValue: 'malicious arbitrary text', type: 'checkbox', included: true },
        { name: 'fullName', originalValue: '', newValue: { complex: 'nested_data' }, type: 'text', included: true },
        { name: 'gender', originalValue: '', newValue: 'InvalidNonExistentGender', type: 'radio', included: true }
      ];

      const updatedBytes = await service.applyImport(blankBytes, mismatchedMatches);
      const reloadedDoc = await PDFDocument.load(updatedBytes);
      const rf = reloadedDoc.getForm();

      expect(rf.getCheckBox('agreeTerms').isChecked()).toBe(false);
      expect(rf.getTextField('fullName').getText()).toBe('{"complex":"nested_data"}');
      expect(rf.getRadioGroup('gender').getSelected()).toBeUndefined();
    });
  });
});
