import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfFormService } from '../services/pdf-form.service';
import { PdfSignService, PlacedSignature } from '../services/pdf-sign.service';
import { PdfSecurityService } from '../services/pdf-security.service';
import { PdfFlattenService } from '../services/pdf-flatten.service';
import { SignatureRequestService } from '../services/signature-request.service';
import { AppErrorService } from '../services/app-error.service';
import { ImageService } from '../services/image.service';
import { SignatureProcessingService } from '../services/signature-processing.service';
import { DEFAULT_PERMISSIONS } from '../models/pdf-security.types';

// Helper to create sample PDF with AcroForm fields in memory
async function createSampleFormPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const form = doc.getForm();

  const textField = form.createTextField('applicant_name');
  textField.setText('');
  textField.addToPage(page, { x: 50, y: 300, width: 200, height: 25 });

  const checkBox = form.createCheckBox('agree_terms');
  checkBox.addToPage(page, { x: 50, y: 250, width: 20, height: 20 });

  const radioGroup = form.createRadioGroup('gender');
  radioGroup.addOptionToPage('male', page, { x: 50, y: 200, width: 15, height: 15 });
  radioGroup.addOptionToPage('female', page, { x: 100, y: 200, width: 15, height: 15 });

  const dropdown = form.createDropdown('qualification');
  dropdown.addOptions(['10th', '12th', 'Graduate', 'Post Graduate']);
  dropdown.addToPage(page, { x: 50, y: 150, width: 150, height: 25 });

  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}

// Helper to create a standard blank PDF
async function createBlankPdf(numPages = 2): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < numPages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 800, size: 18, font, color: rgb(0, 0, 0) });
  }

  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}

// Helper to create a 1x1 PNG data URL
function createSampleSignatureDataUrl(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

describe('Phase 4 & 5 Regression Suite: Forms, Signing, Security, Flattening & Error Handling', () => {
  let formService: PdfFormService;
  let signService: PdfSignService;
  let securityService: PdfSecurityService;
  let flattenService: PdfFlattenService;
  let sigReqService: SignatureRequestService;
  let errorService: AppErrorService;

  beforeEach(() => {
    formService = new PdfFormService();
    signService = new PdfSignService(new ImageService(), new SignatureProcessingService());
    securityService = new PdfSecurityService();
    flattenService = new PdfFlattenService();
    sigReqService = new SignatureRequestService();
    errorService = new AppErrorService({ create: () => Promise.resolve({ present: () => Promise.resolve() }) } as any, {} as any);
  });

  // ==========================================
  // 1. PDF FORM FILLER
  // ==========================================
  describe('PdfFormService', () => {
    it('should detect AcroForm fields correctly', async () => {
      const formBuffer = await createSampleFormPdf();
      const doc = await formService.inspectPdfForForms(formBuffer, 'test_form.pdf');

      expect(doc.hasNativeForms).toBe(true);
      expect(doc.fields.length).toBe(4);

      const textF = doc.fields.find(f => f.name === 'applicant_name');
      expect(textF).toBeDefined();
      expect(textF?.type).toBe('text');

      const checkF = doc.fields.find(f => f.name === 'agree_terms');
      expect(checkF).toBeDefined();
      expect(checkF?.type).toBe('checkbox');

      const radioF = doc.fields.find(f => f.name === 'gender');
      expect(radioF).toBeDefined();
      expect(radioF?.type).toBe('radio');
      expect(radioF?.options).toContain('male');

      const dropF = doc.fields.find(f => f.name === 'qualification');
      expect(dropF).toBeDefined();
      expect(dropF?.type).toBe('dropdown');
    });

    it('should fill native AcroForm fields and export', async () => {
      const formBuffer = await createSampleFormPdf();
      const doc = await formService.inspectPdfForForms(formBuffer, 'test_form.pdf');

      // Fill values
      const textF = doc.fields.find(f => f.name === 'applicant_name')!;
      textF.value = 'Rohan Sharma';

      const checkF = doc.fields.find(f => f.name === 'agree_terms')!;
      checkF.value = true;

      const radioF = doc.fields.find(f => f.name === 'gender')!;
      radioF.value = 'male';

      const dropF = doc.fields.find(f => f.name === 'qualification')!;
      dropF.value = 'Graduate';

      const filledBytes = await formService.fillNativeForm(formBuffer, doc.fields, false);
      expect(filledBytes.length).toBeGreaterThan(0);

      // Verify values by reloading
      const reloadedDoc = await formService.inspectPdfForForms(filledBytes.buffer as ArrayBuffer);
      expect(reloadedDoc.fields.find(f => f.name === 'applicant_name')?.value).toBe('Rohan Sharma');
      expect(reloadedDoc.fields.find(f => f.name === 'agree_terms')?.value).toBe(true);
    });

    it('should render manual fields on PDFs without native forms', async () => {
      const blankBuffer = await createBlankPdf(1);
      const manualFields = [
        {
          id: 'm1',
          name: 'manual_name',
          type: 'text' as const,
          value: 'Candidate Name',
          isNative: false,
          coordinates: { pageNumber: 1, x: 50, y: 100, width: 150, height: 25 }
        },
        {
          id: 'm2',
          name: 'manual_agree',
          type: 'checkbox' as const,
          value: true,
          isNative: false,
          coordinates: { pageNumber: 1, x: 50, y: 150, width: 20, height: 20 }
        }
      ];

      const renderedBytes = await formService.renderManualFields(blankBuffer, manualFields);
      expect(renderedBytes.length).toBeGreaterThan(blankBuffer.byteLength);
    });
  });

  // ==========================================
  // 2. SIGN PDF
  // ==========================================
  describe('PdfSignService', () => {
    it('should embed signatures onto PDF pages at specific coordinates', async () => {
      const blankBuffer = await createBlankPdf(2);
      const signatureDataUrl = createSampleSignatureDataUrl();

      const signatures: PlacedSignature[] = [
        {
          id: 'sig1',
          pageNumber: 1,
          x: 100,
          y: 200,
          width: 120,
          height: 50,
          rotation: 0,
          opacity: 1.0,
          dataUrl: signatureDataUrl
        },
        {
          id: 'sig2',
          pageNumber: 2,
          x: 150,
          y: 300,
          width: 140,
          height: 60,
          rotation: 90,
          opacity: 0.9,
          dataUrl: signatureDataUrl
        }
      ];

      const result = await signService.embedSignatures(blankBuffer, signatures, 'signed_test.pdf');
      expect(result.file).toBeDefined();
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.file.name).toBe('signed_test.pdf');

      // Verify signatures are cached for instant reuse
      expect(signService.getRecentSignatures()).toContain(signatureDataUrl);
    });
  });

  // ==========================================
  // 3. PDF SECURITY & UNLOCK
  // ==========================================
  describe('PdfSecurityService', () => {
    it('should compute permission bitmasks accurately', () => {
      const fullPerms = securityService.computePermissionsInteger(DEFAULT_PERMISSIONS);
      // Bit 3 and 12 must be set for full printing
      expect((fullPerms & (1 << 2)) !== 0).toBe(true);
      expect((fullPerms & (1 << 11)) !== 0).toBe(true);

      const restrictedPerms = securityService.computePermissionsInteger({
        ...DEFAULT_PERMISSIONS,
        allowPrinting: 'none',
        allowCopying: false,
        allowModifying: false
      });

      // Printing bit 3 and 12 must be cleared
      expect((restrictedPerms & (1 << 2)) !== 0).toBe(false);
      expect((restrictedPerms & (1 << 11)) !== 0).toBe(false);
      // Copying bit 5 must be cleared
      expect((restrictedPerms & (1 << 4)) !== 0).toBe(false);
      // Modifying bit 4 must be cleared
      expect((restrictedPerms & (1 << 3)) !== 0).toBe(false);
    });

    it('should protect a PDF with password and encryption dictionary', async () => {
      const blankBuffer = await createBlankPdf(1);
      const result = await securityService.protectPdf(blankBuffer, {
        userPassword: 'SecretPassword123',
        ownerPassword: 'AdminPassword123',
        permissions: DEFAULT_PERMISSIONS
      });

      expect(result.file).toBeDefined();
      expect(result.sizeBytes).toBeGreaterThan(0);

      // Verify that the generated bytes contain the standard /Encrypt dictionary
      const textDecoder = new TextDecoder('latin1');
      const text = textDecoder.decode(await result.file.arrayBuffer());
      expect(text).toContain('/Encrypt');
      expect(text).toContain('/Filter /Standard');
      expect(text).toContain('/V 2');
      expect(text).toContain('/R 3');
      expect(text).toContain('/Length 128');
    });

    it('should detect unencrypted status for clean PDFs', async () => {
      const blankBuffer = await createBlankPdf(1);
      const status = await securityService.detectSecurity(blankBuffer);
      expect(status.isEncrypted).toBe(false);
      expect(status.requiresUserPassword).toBe(false);
    });
  });

  // ==========================================
  // 4. FLATTEN PDF
  // ==========================================
  describe('PdfFlattenService', () => {
    it('should inspect interactive form fields before flattening', async () => {
      const formBuffer = await createSampleFormPdf();
      const inspection = await flattenService.inspectElementsToFlatten(formBuffer);

      expect(inspection.hasInteractiveElements).toBe(true);
      expect(inspection.formFieldCount).toBe(4);
      expect(inspection.fieldsSummary.length).toBe(4);
    });

    it('should flatten form fields so that no interactive fields remain', async () => {
      const formBuffer = await createSampleFormPdf();
      const result = await flattenService.flattenPdf(formBuffer, 'vector');

      expect(result.beforeInteractiveCount).toBeGreaterThanOrEqual(4);
      expect(result.afterInteractiveCount).toBe(0);

      // Verify the flattened PDF has no remaining form fields
      const flattenedBuffer = await result.flattenedBlob.arrayBuffer();
      const postInspection = await flattenService.inspectElementsToFlatten(flattenedBuffer);
      expect(postInspection.formFieldCount).toBe(0);
    });
  });

  // ==========================================
  // 5. SIGNATURE REQUEST DOMAIN MODEL
  // ==========================================
  describe('SignatureRequestService', () => {
    it('should create a request draft with recipients, fields, and audit events', () => {
      const req = sigReqService.createDraft('Employment Contract', 'contract.pdf', 102400, 3);
      expect(req.status).toBe('draft');
      expect(req.recipients.length).toBe(0);

      const r1 = sigReqService.addRecipient(req, {
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'signer',
        signingOrder: 1
      });

      expect(req.recipients.length).toBe(1);
      expect(r1.color).toBeDefined();

      const field = sigReqService.addField(req, {
        recipientId: r1.id,
        type: 'signature',
        pageNumber: 2,
        x: 100,
        y: 200,
        width: 150,
        height: 40,
        required: true
      });

      expect(req.fields.length).toBe(1);
      expect(field.id).toBeDefined();
      expect(req.auditTrail.length).toBeGreaterThanOrEqual(3);

      // Test manifest export
      const manifest = sigReqService.exportRequestManifest(req);
      expect(manifest.fileName).toContain('manifest.json');
      expect(manifest.content).toContain('OFFLINE_FIRST_SPECIFICATION');
      expect(manifest.content).toContain('Jane Doe');
    });
  });

  // ==========================================
  // 6. ERROR HANDLING SERVICE
  // ==========================================
  describe('AppErrorService', () => {
    it('should classify password errors appropriately', () => {
      const wrongPassErr = errorService.classifyError(new Error('Incorrect password given'));
      expect(wrongPassErr.code).toBe('INCORRECT_PASSWORD');
      expect(wrongPassErr.title).toBe('Incorrect Password');

      const needPassErr = errorService.classifyError({ name: 'PasswordException', code: 1, message: 'No password given' });
      expect(needPassErr.code).toBe('PASSWORD_REQUIRED');
    });

    it('should classify corrupted file errors with actionable recovery advice', () => {
      const corruptErr = errorService.classifyError(new Error('Invalid PDF: unexpected header'));
      expect(corruptErr.code).toBe('CORRUPTED_FILE');
      expect(corruptErr.recoverySuggestion).toBeDefined();
    });

    it('should classify memory limit errors with compression suggestion', () => {
      const memErr = errorService.classifyError(new Error('out of memory during canvas render'));
      expect(memErr.code).toBe('MEMORY_LIMIT_EXCEEDED');
      expect(memErr.recoverySuggestion).toContain('compressing');
    });
  });
});
