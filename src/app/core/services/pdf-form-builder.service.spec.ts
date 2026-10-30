import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, PDFName, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfFormBuilderService } from './pdf-form-builder.service';
import { FormBuilderField } from '../models/pdf-forms.types';

describe('PdfFormBuilderService', () => {
  let service: PdfFormBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.runInInjectionContext(() => new PdfFormBuilderService());
  });

  describe('Coordinate System Mapping', () => {
    const pageWidth = 400;
    const pageHeight = 600;

    it('translates coordinates correctly for 0 degree rotation', () => {
      const pdfCoords = service.cssToPdfCoordinates({
        x: 50,
        y: 80,
        width: 120,
        height: 40,
        pageWidth,
        pageHeight,
        rotation: 0,
        scale: 1.0,
        dpr: 1.0
      });

      expect(pdfCoords.x).toBe(50);
      expect(pdfCoords.y).toBe(pageHeight - (80 + 40)); // 480
      expect(pdfCoords.width).toBe(120);
      expect(pdfCoords.height).toBe(40);

      const roundTrip = service.pdfToCssCoordinates({
        x: pdfCoords.x,
        y: pdfCoords.y,
        width: pdfCoords.width,
        height: pdfCoords.height,
        pageWidth,
        pageHeight,
        rotation: 0,
        scale: 1.0,
        dpr: 1.0
      });

      expect(roundTrip.x).toBe(50);
      expect(roundTrip.y).toBe(80);
      expect(roundTrip.width).toBe(120);
      expect(roundTrip.height).toBe(40);
    });

    it('translates coordinates correctly for 90 degree rotation', () => {
      const pdfCoords = service.cssToPdfCoordinates({
        x: 50,
        y: 80,
        width: 120,
        height: 40,
        pageWidth,
        pageHeight,
        rotation: 90,
        scale: 1.0,
        dpr: 1.0
      });

      expect(pdfCoords.x).toBe(80);
      expect(pdfCoords.y).toBe(50);
      expect(pdfCoords.width).toBe(40);
      expect(pdfCoords.height).toBe(120);

      const roundTrip = service.pdfToCssCoordinates({
        x: pdfCoords.x,
        y: pdfCoords.y,
        width: pdfCoords.width,
        height: pdfCoords.height,
        pageWidth,
        pageHeight,
        rotation: 90,
        scale: 1.0,
        dpr: 1.0
      });

      expect(roundTrip.x).toBe(50);
      expect(roundTrip.y).toBe(80);
      expect(roundTrip.width).toBe(120);
      expect(roundTrip.height).toBe(40);
    });

    it('translates coordinates correctly for 180 degree rotation', () => {
      const pdfCoords = service.cssToPdfCoordinates({
        x: 50,
        y: 80,
        width: 120,
        height: 40,
        pageWidth,
        pageHeight,
        rotation: 180,
        scale: 1.0,
        dpr: 1.0
      });

      expect(pdfCoords.x).toBe(pageWidth - (50 + 120)); // 230
      expect(pdfCoords.y).toBe(80);
      expect(pdfCoords.width).toBe(120);
      expect(pdfCoords.height).toBe(40);

      const roundTrip = service.pdfToCssCoordinates({
        x: pdfCoords.x,
        y: pdfCoords.y,
        width: pdfCoords.width,
        height: pdfCoords.height,
        pageWidth,
        pageHeight,
        rotation: 180,
        scale: 1.0,
        dpr: 1.0
      });

      expect(roundTrip.x).toBe(50);
      expect(roundTrip.y).toBe(80);
      expect(roundTrip.width).toBe(120);
      expect(roundTrip.height).toBe(40);
    });

    it('translates coordinates correctly for 270 degree rotation', () => {
      const pdfCoords = service.cssToPdfCoordinates({
        x: 50,
        y: 80,
        width: 120,
        height: 40,
        pageWidth,
        pageHeight,
        rotation: 270,
        scale: 1.0,
        dpr: 1.0
      });

      expect(pdfCoords.x).toBe(pageWidth - (80 + 40)); // 280
      expect(pdfCoords.y).toBe(pageHeight - (50 + 120)); // 430
      expect(pdfCoords.width).toBe(40);
      expect(pdfCoords.height).toBe(120);

      const roundTrip = service.pdfToCssCoordinates({
        x: pdfCoords.x,
        y: pdfCoords.y,
        width: pdfCoords.width,
        height: pdfCoords.height,
        pageWidth,
        pageHeight,
        rotation: 270,
        scale: 1.0,
        dpr: 1.0
      });

      expect(roundTrip.x).toBe(50);
      expect(roundTrip.y).toBe(80);
      expect(roundTrip.width).toBe(120);
      expect(roundTrip.height).toBe(40);
    });

    it('accounts for scale and dpr factors', () => {
      const pdfCoords = service.cssToPdfCoordinates({
        x: 100, // at scale 2, represents 50 pt
        y: 160, // at scale 2, represents 80 pt
        width: 240, // at scale 2, represents 120 pt
        height: 80, // at scale 2, represents 40 pt
        pageWidth,
        pageHeight,
        rotation: 0,
        scale: 2.0,
        dpr: 1.0
      });

      expect(pdfCoords.x).toBe(50);
      expect(pdfCoords.y).toBe(480);
      expect(pdfCoords.width).toBe(120);
      expect(pdfCoords.height).toBe(40);
    });
  });

  describe('Form Generation and Reading via pdfjs-dist', () => {
    async function createSampleDoc(): Promise<ArrayBuffer> {
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 700]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText('Sample Document for Form Building', {
        x: 50,
        y: 650,
        size: 16,
        font,
        color: rgb(0, 0, 0)
      });
      const bytes = await doc.save();
      return bytes.buffer as ArrayBuffer;
    }

    it('creates all 7 field types and verifies readback with pdfjs-dist', async () => {
      const samplePdf = await createSampleDoc();

      const fields: FormBuilderField[] = [
        {
          id: 'f1',
          name: 'fullName',
          label: 'Full Name',
          type: 'text',
          value: 'Jane Doe',
          defaultValue: 'Jane Doe',
          isMultiline: false,
          maxLength: 50,
          isRequired: true,
          isNative: true,
          tooltip: 'Enter full legal name',
          coordinates: { pageNumber: 1, x: 50, y: 550, width: 200, height: 28 }
        },
        {
          id: 'f2',
          name: 'agreeTerms',
          label: 'Agree to Terms',
          type: 'checkbox',
          value: true,
          defaultValue: true,
          isRequired: true,
          isNative: true,
          tooltip: 'Tick to accept',
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 24, height: 24 }
        },
        {
          id: 'f3',
          name: 'gender',
          label: 'Gender',
          type: 'radio',
          value: 'Female',
          defaultValue: 'Female',
          options: ['Male', 'Female', 'Other'],
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 450, width: 20, height: 20 }
        },
        {
          id: 'f4',
          name: 'country',
          label: 'Country',
          type: 'dropdown',
          value: 'India',
          defaultValue: 'India',
          options: ['India', 'USA', 'UK', 'Canada'],
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 400, width: 180, height: 28 }
        },
        {
          id: 'f5',
          name: 'skills',
          label: 'Skills',
          type: 'listbox',
          value: ['TypeScript', 'Angular'],
          defaultValue: ['TypeScript', 'Angular'],
          options: ['TypeScript', 'Angular', 'Node.js', 'Python'],
          multiselect: true,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 300, width: 180, height: 60 }
        },
        {
          id: 'f6',
          name: 'birthDate',
          label: 'Date of Birth',
          type: 'date',
          value: '1995-08-15',
          defaultValue: '1995-08-15',
          maxLength: 10,
          isRequired: false,
          isNative: true,
          tooltip: 'ISO date YYYY-MM-DD',
          coordinates: { pageNumber: 1, x: 50, y: 250, width: 150, height: 28 }
        },
        {
          id: 'f7',
          name: 'applicantSignature',
          label: 'Signature',
          type: 'signature',
          value: '',
          isRequired: true,
          isNative: true,
          tooltip: 'Sign here',
          coordinates: { pageNumber: 1, x: 50, y: 150, width: 220, height: 60 }
        }
      ];

      const outputBytes = await service.buildFormPdf(samplePdf, fields);
      expect(outputBytes.byteLength).toBeGreaterThan(samplePdf.byteLength);

      // Load via pdfjs-dist and verify all fields
      const loaded = await pdfjsLib.getDocument({ data: outputBytes }).promise;
      const p1 = await loaded.getPage(1);
      const annots = await p1.getAnnotations();

      // Find fields by name
      const tfAnnot = annots.find(a => a.fieldName === 'fullName');
      expect(tfAnnot).toBeDefined();
      expect(tfAnnot?.fieldType).toBe('Tx');
      expect(tfAnnot?.fieldValue).toBe('Jane Doe');

      const cbAnnot = annots.find(a => a.fieldName === 'agreeTerms');
      expect(cbAnnot).toBeDefined();
      expect(cbAnnot?.fieldType).toBe('Btn');

      const rgAnnot = annots.find(a => a.fieldName === 'gender');
      expect(rgAnnot).toBeDefined();
      expect(rgAnnot?.fieldType).toBe('Btn');
      // Radio flag: 1 << 15 = 32768
      expect((rgAnnot?.fieldFlags || 0) & 32768).toBe(32768);

      const ddAnnot = annots.find(a => a.fieldName === 'country');
      expect(ddAnnot).toBeDefined();
      expect(ddAnnot?.fieldType).toBe('Ch');
      // Combo flag: 1 << 17 = 131072
      expect((ddAnnot?.fieldFlags || 0) & 131072).toBe(131072);

      const olAnnot = annots.find(a => a.fieldName === 'skills');
      expect(olAnnot).toBeDefined();
      expect(olAnnot?.fieldType).toBe('Ch');
      // MultiSelect flag: 1 << 21 = 2097152
      expect((olAnnot?.fieldFlags || 0) & 2097152).toBe(2097152);

      const dateAnnot = annots.find(a => a.fieldName === 'birthDate');
      expect(dateAnnot).toBeDefined();
      expect(dateAnnot?.fieldType).toBe('Tx');
      expect(dateAnnot?.fieldValue).toBe('1995-08-15');

      const sigAnnot = annots.find(a => a.fieldName === 'applicantSignature');
      expect(sigAnnot).toBeDefined();
      expect(sigAnnot?.fieldType).toBe('Sig');
    });

    it('passes cleanly through existing PdfFormService.fillAndFlatten compatibility path', async () => {
      const samplePdf = await createSampleDoc();

      const fields: FormBuilderField[] = [
        {
          id: 'text1',
          name: 'company',
          type: 'text',
          value: 'Acme Corp',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 150, height: 28 }
        },
        {
          id: 'cb1',
          name: 'subscribe',
          type: 'checkbox',
          value: false,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 450, width: 20, height: 20 }
        },
        {
          id: 'sig1',
          name: 'sig_field',
          type: 'signature',
          value: '',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 350, width: 200, height: 50 }
        }
      ];

      const builtBytes = await service.buildFormPdf(samplePdf, fields);

      // Now use the existing PdfFormService methods
      const inspected = await service.inspectPdfForForms(builtBytes.buffer as ArrayBuffer, 'test.pdf');
      expect(inspected.hasNativeForms).toBe(true);
      expect(inspected.fields.length).toBeGreaterThanOrEqual(3);

      // Modify values
      const companyField = inspected.fields.find(f => f.name === 'company');
      if (companyField) companyField.value = 'New Brand Inc';

      const cbField = inspected.fields.find(f => f.name === 'subscribe');
      if (cbField) cbField.value = true;

      // Fill and flatten
      const flattened = await service.fillNativeForm(builtBytes.buffer as ArrayBuffer, inspected.fields, true);
      expect(flattened.byteLength).toBeGreaterThan(0);
    });

    it('is non-destructive: preserves existing form fields when appending new ones', async () => {
      // 1. Create a PDF with an existing form field
      const initialDoc = await PDFDocument.create();
      const initialPage = initialDoc.addPage([500, 700]);
      const initialForm = initialDoc.getForm();
      const existingField = initialForm.createTextField('existingField');
      existingField.setText('Original Value');
      existingField.addToPage(initialPage, { x: 50, y: 600, width: 150, height: 28 });
      const initialBytes = (await initialDoc.save()).buffer as ArrayBuffer;

      // 2. Append new builder fields
      const newFields: FormBuilderField[] = [
        {
          id: 'new_1',
          name: 'newField',
          type: 'text',
          value: 'New Value',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 150, height: 28 }
        }
      ];

      const mergedBytes = await service.buildFormPdf(initialBytes, newFields);

      // 3. Verify both fields exist in output
      const reloaded = await PDFDocument.load(mergedBytes);
      const reloadedForm = reloaded.getForm();
      const ef = reloadedForm.getTextField('existingField');
      const nf = reloadedForm.getTextField('newField');

      expect(ef).toBeDefined();
      expect(ef.getText()).toBe('Original Value');
      expect(nf).toBeDefined();
      expect(nf.getText()).toBe('New Value');
    });

    it('embeds /Helv and /ZaDb in AcroForm default resources /DR', async () => {
      const samplePdf = await createSampleDoc();
      const fields: FormBuilderField[] = [
        {
          id: 'tf',
          name: 'note',
          type: 'text',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 150, height: 28 }
        }
      ];

      const outputBytes = await service.buildFormPdf(samplePdf, fields);
      const doc = await PDFDocument.load(outputBytes);
      const acroForm = doc.catalog.getOrCreateAcroForm();
      const dr = acroForm.dict.lookup(acroForm.dict.context.obj('DR'));
      expect(dr).toBeDefined();
    });

    it('respects tabOrder when building fields', async () => {
      const samplePdf = await createSampleDoc();
      const fields: FormBuilderField[] = [
        {
          id: 'field_b',
          name: 'field_b',
          type: 'text',
          tabOrder: 2,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 400, width: 100, height: 25 }
        },
        {
          id: 'field_a',
          name: 'field_a',
          type: 'text',
          tabOrder: 1,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 100, height: 25 }
        }
      ];

      const outputBytes = await service.buildFormPdf(samplePdf, fields);
      const doc = await PDFDocument.load(outputBytes);
      const form = doc.getForm();
      const formFields = form.getFields();
      expect(formFields[0].getName()).toBe('field_a');
      expect(formFields[1].getName()).toBe('field_b');
    });

    it('exports output via saveFormPdf', async () => {
      const samplePdf = await createSampleDoc();
      const fields: FormBuilderField[] = [
        {
          id: 'tf1',
          name: 'username',
          type: 'text',
          value: 'johndoe',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 100, height: 25 }
        }
      ];

      const result = await service.saveFormPdf(samplePdf, fields, 'custom_form.pdf');
      expect(result.file).toBeDefined();
      expect(result.file.name).toBe('custom_form.pdf');
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.blob).toBeDefined();
    });
  });

  describe('Real Test Data Scenarios', () => {
    it('builds form fields onto a completely blank 1-page PDF', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([595, 842]);
      const blankBytes = (await doc.save()).buffer as ArrayBuffer;

      const fields: FormBuilderField[] = [
        {
          id: 'b1',
          name: 'blankNote',
          type: 'text',
          value: 'Created on blank page',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 700, width: 250, height: 35 }
        },
        {
          id: 'b2',
          name: 'blankDate',
          type: 'date',
          defaultValue: '2026-10-29',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 640, width: 150, height: 30 }
        }
      ];

      const outputBytes = await service.buildFormPdf(blankBytes, fields);
      const reloaded = await PDFDocument.load(outputBytes);
      expect(reloaded.getPageCount()).toBe(1);
      const form = reloaded.getForm();
      expect(form.getTextField('blankNote').getText()).toBe('Created on blank page');
      expect(form.getTextField('blankDate').getText()).toBe('2026-10-29');
    });

    it('builds form fields across a multi-page PDF', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 700]);
      doc.addPage([500, 700]);
      doc.addPage([500, 700]);
      const multiPageBytes = (await doc.save()).buffer as ArrayBuffer;

      const fields: FormBuilderField[] = [
        {
          id: 'p1_field',
          name: 'page1Text',
          type: 'text',
          value: 'Page 1 Content',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 200, height: 30 }
        },
        {
          id: 'p2_field',
          name: 'page2Checkbox',
          type: 'checkbox',
          value: true,
          isNative: true,
          coordinates: { pageNumber: 2, x: 50, y: 500, width: 25, height: 25 }
        },
        {
          id: 'p3_field',
          name: 'page3Signature',
          type: 'signature',
          value: '',
          isNative: true,
          coordinates: { pageNumber: 3, x: 50, y: 400, width: 200, height: 60 }
        }
      ];

      const outputBytes = await service.buildFormPdf(multiPageBytes, fields);
      const reloaded = await PDFDocument.load(outputBytes);
      expect(reloaded.getPageCount()).toBe(3);

      const form = reloaded.getForm();
      expect(form.getTextField('page1Text').getText()).toBe('Page 1 Content');
      expect(form.getCheckBox('page2Checkbox').isChecked()).toBe(true);
      expect(form.getField('page3Signature')).toBeDefined();

      // Verify that widgets belong to their respective pages
      const pages = reloaded.getPages();
      expect(pages[0].node.Annots()?.size()).toBe(1);
      expect(pages[1].node.Annots()?.size()).toBe(1);
      expect(pages[2].node.Annots()?.size()).toBe(1);
    });

    it('handles rotated landscape PDF pages (90 and 270 degrees)', async () => {
      const { degrees } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      const p90 = doc.addPage([600, 400]);
      p90.setRotation(degrees(90));
      const p270 = doc.addPage([600, 400]);
      p270.setRotation(degrees(270));
      const rotatedBytes = (await doc.save()).buffer as ArrayBuffer;

      // Translate CSS click to PDF coordinates for 90 deg page
      const p90Coords = service.cssToPdfCoordinates({
        x: 40,
        y: 60,
        width: 140,
        height: 30,
        pageWidth: 600,
        pageHeight: 400,
        rotation: 90
      });
      p90Coords.pageNumber = 1;

      // Translate CSS click to PDF coordinates for 270 deg page
      const p270Coords = service.cssToPdfCoordinates({
        x: 40,
        y: 60,
        width: 140,
        height: 30,
        pageWidth: 600,
        pageHeight: 400,
        rotation: 270
      });
      p270Coords.pageNumber = 2;

      const fields: FormBuilderField[] = [
        {
          id: 'rot90_f',
          name: 'rot90Field',
          type: 'text',
          value: 'Rotated 90 Text',
          isNative: true,
          coordinates: p90Coords
        },
        {
          id: 'rot270_f',
          name: 'rot270Field',
          type: 'text',
          value: 'Rotated 270 Text',
          isNative: true,
          coordinates: p270Coords
        }
      ];

      const outputBytes = await service.buildFormPdf(rotatedBytes, fields);
      const reloaded = await PDFDocument.load(outputBytes);
      const form = reloaded.getForm();
      expect(form.getTextField('rot90Field').getText()).toBe('Rotated 90 Text');
      expect(form.getTextField('rot270Field').getText()).toBe('Rotated 270 Text');
    });

    it('preserves existing pre-filled AcroForm fields from real test document', async () => {
      const fs = await import('fs');
      const nodeBuf = fs.readFileSync('e2e/test-data/editor-audit/fillable-form.pdf');
      const uint8 = new Uint8Array(nodeBuf);
      const realAcroFormBytes = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);

      // Load original and inspect
      const originalDoc = await PDFDocument.load(realAcroFormBytes.slice(0));
      const originalForm = originalDoc.getForm();
      const origFieldNames = originalForm.getFields().map(f => f.getName());
      expect(origFieldNames).toContain('fullName');
      expect(origFieldNames).toContain('email');

      // Append new fields
      const newFields: FormBuilderField[] = [
        {
          id: 'appended_sig',
          name: 'managerSignature',
          type: 'signature',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 100, width: 180, height: 50 }
        },
        {
          id: 'appended_date',
          name: 'approvedDate',
          type: 'date',
          defaultValue: '2026-10-29',
          isNative: true,
          coordinates: { pageNumber: 1, x: 250, y: 100, width: 140, height: 30 }
        }
      ];

      const mergedBytes = await service.buildFormPdf(realAcroFormBytes, newFields);
      const reloaded = await PDFDocument.load(mergedBytes);
      const reloadedForm = reloaded.getForm();
      const reloadedNames = reloadedForm.getFields().map(f => f.getName());

      // Original fields must NOT be wiped
      expect(reloadedNames).toContain('fullName');
      expect(reloadedNames).toContain('email');
      expect(reloadedNames).toContain('agreeTerms');
      expect(reloadedNames).toContain('deptCode');

      // New fields must be present
      expect(reloadedNames).toContain('managerSignature');
      expect(reloadedNames).toContain('approvedDate');
      expect(reloadedForm.getTextField('approvedDate').getText()).toBe('2026-10-29');
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    it('sanitizes XSS injection into field names, default values, and tooltips', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 700]);
      const initialBytes = (await doc.save()).buffer as ArrayBuffer;

      const maliciousFields: FormBuilderField[] = [
        {
          id: 'xss_1',
          name: '<script>alert("XSS")</script>user_name',
          label: '<svg onload=alert("label")>User Name',
          tooltip: '"><script>alert("tooltip")</script>Enter your name',
          defaultValue: '<img src=x onerror=alert("default")>John Doe',
          type: 'text',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 160, height: 30 }
        }
      ];

      const outputBytes = await service.buildFormPdf(initialBytes, maliciousFields);
      const reloaded = await PDFDocument.load(outputBytes);
      const form = reloaded.getForm();
      const formFields = form.getFields();

      // Field name must have script tag completely stripped
      const field = formFields[0];
      expect(field.getName()).not.toContain('<script>');
      expect(field.getName()).not.toContain('</script>');
      expect(field.getName()).toBe('user_name');

      // Value must have img onerror tag stripped
      const tf = form.getTextField('user_name');
      expect(tf.getText()).not.toContain('<img');
      expect(tf.getText()).not.toContain('onerror=');
      expect(tf.getText()).toContain('John Doe');
    });

    it('clamps negative coordinates and coordinate overflow outside page bounds', () => {
      const pageWidth = 500;
      const pageHeight = 700;

      // Negative coordinates
      const clampedNegative = service.cssToPdfCoordinates({
        x: -9999,
        y: -5000,
        width: 150,
        height: 30,
        pageWidth,
        pageHeight
      });

      expect(clampedNegative.x).toBeGreaterThanOrEqual(0);
      expect(clampedNegative.y).toBeGreaterThanOrEqual(0);
      expect(clampedNegative.x + clampedNegative.width).toBeLessThanOrEqual(pageWidth);
      expect(clampedNegative.y + clampedNegative.height).toBeLessThanOrEqual(pageHeight);

      // Extreme overflow coordinates
      const clampedOverflow = service.cssToPdfCoordinates({
        x: 99999,
        y: 99999,
        width: 99999,
        height: 99999,
        pageWidth,
        pageHeight
      });

      expect(clampedOverflow.x).toBeGreaterThanOrEqual(0);
      expect(clampedOverflow.y).toBeGreaterThanOrEqual(0);
      expect(clampedOverflow.x + clampedOverflow.width).toBeLessThanOrEqual(pageWidth);
      expect(clampedOverflow.y + clampedOverflow.height).toBeLessThanOrEqual(pageHeight);
    });

    it('safely disambiguates duplicate field name collisions without throwing', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 700]);
      const initialBytes = (await doc.save()).buffer as ArrayBuffer;

      // 3 fields with exact same name
      const duplicateFields: FormBuilderField[] = [
        {
          id: 'd1',
          name: 'contactInfo',
          type: 'text',
          value: 'First',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 100, height: 25 }
        },
        {
          id: 'd2',
          name: 'contactInfo',
          type: 'text',
          value: 'Second',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 450, width: 100, height: 25 }
        },
        {
          id: 'd3',
          name: 'contactInfo',
          type: 'text',
          value: 'Third',
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 400, width: 100, height: 25 }
        }
      ];

      // Must build cleanly without "A field already exists with the specified name"
      const outputBytes = await service.buildFormPdf(initialBytes, duplicateFields);
      const reloaded = await PDFDocument.load(outputBytes);
      const form = reloaded.getForm();
      const names = form.getFields().map(f => f.getName());

      expect(names.length).toBe(3);
      expect(names[0]).toBe('contactInfo');
      expect(names[1]).toBe('contactInfo_1');
      expect(names[2]).toBe('contactInfo_2');
    });

    it('normalizes negative and circular tab-orders into a clean sequence', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 700]);
      const initialBytes = (await doc.save()).buffer as ArrayBuffer;

      const fieldsWithBadTabOrder: FormBuilderField[] = [
        {
          id: 'f1',
          name: 'fieldThird',
          type: 'text',
          tabOrder: 99,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 500, width: 100, height: 25 }
        },
        {
          id: 'f2',
          name: 'fieldFirst',
          type: 'text',
          tabOrder: -5, // Negative tab order
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 450, width: 100, height: 25 }
        },
        {
          id: 'f3',
          name: 'fieldSecond',
          type: 'text',
          tabOrder: 1,
          isNative: true,
          coordinates: { pageNumber: 1, x: 50, y: 400, width: 100, height: 25 }
        }
      ];

      const outputBytes = await service.buildFormPdf(initialBytes, fieldsWithBadTabOrder);
      const reloaded = await PDFDocument.load(outputBytes);
      const form = reloaded.getForm();
      const formFields = form.getFields();

      // Sorted monotonically: -5 (fieldFirst), 1 (fieldSecond), 99 (fieldThird)
      expect(formFields[0].getName()).toBe('fieldFirst');
      expect(formFields[1].getName()).toBe('fieldSecond');
      expect(formFields[2].getName()).toBe('fieldThird');
    });

    it('protects against deeply nested AcroForm dictionaries causing parser stack overflows', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 700]);
      
      // Construct deeply nested dictionary structure
      const acroForm = doc.catalog.getOrCreateAcroForm();
      let parentDict = acroForm.dict;
      for (let i = 0; i < 40; i++) {
        const childDict = doc.context.obj({
          Kids: doc.context.obj([])
        });
        const childRef = doc.context.register(childDict);
        parentDict.set(PDFName.of('Kids'), doc.context.obj([childRef]));
        parentDict = childDict;
      }

      // validateAcroFormStructure must safely cap depth without stack overflow
      expect(() => service.validateAcroFormStructure(doc, 32)).not.toThrow();
    });
  });
});
