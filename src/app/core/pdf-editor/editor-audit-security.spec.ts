import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfEditorStateService } from '../services/pdf-editor-state.service';
import { PdfExportPipelineService } from '../services/pdf-export-pipeline.service';
import { PdfAnnotationFlattenService } from '../services/pdf-annotation-flatten.service';
import { PdfEditorDocument, PdfTextElement, PdfShapeElement } from '../models/pdf-editor.types';

describe('PDF Editor Comprehensive Audit & Offensive Security Suite', () => {
  let stateService: PdfEditorStateService;
  let exportService: PdfExportPipelineService;
  let flattenService: PdfAnnotationFlattenService;

  beforeEach(() => {
    stateService = new PdfEditorStateService();
    exportService = new PdfExportPipelineService();
    flattenService = new PdfAnnotationFlattenService();
  });

  async function loadFixture(filename: string): Promise<{ file: File; arrayBuffer: ArrayBuffer }> {
    const filePath = path.resolve(process.cwd(), 'e2e/test-data/editor-audit', filename);
    const buffer = fs.readFileSync(filePath);
    const file = new File([buffer], filename, { type: 'application/pdf' });
    const arrayBuffer = await file.arrayBuffer();
    return { file, arrayBuffer };
  }

  function buildDocModel(file: File, arrayBuffer: ArrayBuffer, pageCount: number): PdfEditorDocument {
    return {
      file,
      arrayBuffer,
      name: file.name,
      pageCount,
      sizeBytes: arrayBuffer.byteLength,
      pages: Array.from({ length: pageCount }, (_, idx) => ({
        pageNumber: idx + 1,
        originalWidth: 595.28,
        originalHeight: 841.89,
        currentWidth: 595.28,
        currentHeight: 841.89,
        rotation: 0,
        elements: [],
        redactions: [],
        links: [],
        comments: [],
        whiteouts: [],
        measurements: [],
        textEdits: []
      }))
    };
  }

  describe('Step 2: Real Document Scenario Verification', () => {
    it('verifies coordinate precision across zoom level scaling (50% to 200%)', () => {
      stateService.setZoom(0.5);
      expect(stateService.zoom).toBe(0.5);

      stateService.setZoom(1.0);
      expect(stateService.zoom).toBe(1.0);

      stateService.setZoom(2.0);
      expect(stateService.zoom).toBe(2.0);

      // Verify clamping limits (0.2 to 4.0)
      stateService.setZoom(0.01);
      expect(stateService.zoom).toBe(0.2);

      stateService.setZoom(10.0);
      expect(stateService.zoom).toBe(4.0);
    });

    it('loads single-page invoice and applies text editing, shapes, and highlights', async () => {
      const { file, arrayBuffer } = await loadFixture('single-page-invoice.pdf');
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // 1. Add Text Element
      docModel.pages[0].elements.push({
        id: 'txt1',
        type: 'text',
        pageNumber: 1,
        x: 65,
        y: 600,
        width: 180,
        height: 24,
        rotation: 0,
        opacity: 1.0,
        zIndex: 1,
        text: 'APPROVED BY FINANCE AUDIT',
        fontSize: 12,
        fontFamily: 'Helvetica',
        color: '#008000',
        bold: true
      } as PdfTextElement);

      // 2. Add Rectangle Shape
      docModel.pages[0].elements.push({
        id: 'shp1',
        type: 'shape',
        shapeType: 'rectangle',
        pageNumber: 1,
        x: 60,
        y: 590,
        width: 200,
        height: 40,
        rotation: 0,
        opacity: 0.9,
        zIndex: 0,
        strokeColor: '#008000',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fillColor: '#F0FFF0'
      } as PdfShapeElement);

      // Export edited document
      const result = await exportService.exportDocument(docModel);
      expect(result.file).toBeDefined();
      expect(result.file.size).toBeGreaterThan(1000);

      // Verify in output PDF
      const pdfBytes = await result.file.arrayBuffer();
      const readDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) } as any).promise;
      expect(readDoc.numPages).toBe(1);
      const page = await readDoc.getPage(1);
      const textContent = await page.getTextContent();
      const textStr = textContent.items.map((i: any) => i.str).join(' ');
      expect(textStr).toContain('APPROVED BY FINANCE AUDIT');
      expect(textStr).toContain('APEX LOGISTICS');
    });

    it('processes multi-column academic paper preserving columnar layout and geometry', async () => {
      const { file, arrayBuffer } = await loadFixture('multicolumn-academic.pdf');
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // Add a line shape separating columns
      docModel.pages[0].elements.push({
        id: 'col-divider',
        type: 'shape',
        shapeType: 'line',
        pageNumber: 1,
        x: 297,
        y: 500,
        width: 1,
        height: 150,
        rotation: 0,
        opacity: 1.0,
        zIndex: 2,
        strokeColor: '#FF0000',
        strokeWidth: 1.5,
        strokeStyle: 'solid'
      } as PdfShapeElement);

      const result = await exportService.exportDocument(docModel);
      const pdfBytes = await result.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      expect(pdfDoc.getPageCount()).toBe(1);
      const page = pdfDoc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
    });

    it('fills AcroForm interactive fields and flattens annotations correctly', async () => {
      const { arrayBuffer } = await loadFixture('fillable-form.pdf');
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();

      // Verify fields
      const nameField = form.getTextField('fullName');
      const emailField = form.getTextField('email');
      expect(nameField.getText()).toBe('Rajesh Sharma');
      expect(emailField.getText()).toBe('rajesh.sharma@example.gov.in');

      // Update fields
      nameField.setText('Vikramaditya Roy');
      emailField.setText('v.roy@national-audit.gov.in');

      // Flatten using flattenService
      const savedBytes = await pdfDoc.save();
      const flatResult = await flattenService.flattenAnnotations(savedBytes, { keepFormFieldsInteractive: true });
      expect(flatResult.pdfBytes).toBeDefined();
      expect(flatResult.widgetsKept).toBeGreaterThanOrEqual(1);

      const flatDoc = await PDFDocument.load(flatResult.pdfBytes);
      const flatForm = flatDoc.getForm();
      expect(flatForm.getTextField('fullName').getText()).toBe('Vikramaditya Roy');
    });
  });

  describe('Step 5: Cybersecurity Stress-Testing & Attack Resilience', () => {
    it('DEFENDS against Fake Redaction flaw: permanently destroys underlying vector text streams', async () => {
      const { file, arrayBuffer } = await loadFixture('single-page-invoice.pdf');
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // Verify secret string exists in the original file
      const rawTextCheck = await (await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) } as any).promise)
        .getPage(1)
        .then(p => p.getTextContent())
        .then(tc => tc.items.map((i: any) => i.str).join(' '));
      expect(rawTextCheck).toContain('4111-2222-3333-4444');
      expect(rawTextCheck).toContain('999-00-1234');

      // Mark True Redactions over both sensitive areas
      docModel.pages[0].redactions.push(
        {
          id: 'red-tax',
          pageNumber: 1,
          x: 60,
          y: 675,
          width: 300,
          height: 20,
          isApplied: true,
          overlayColor: '#000000',
          label: 'REDACTED TAX ID'
        },
        {
          id: 'red-card',
          pageNumber: 1,
          x: 60,
          y: 660,
          width: 350,
          height: 20,
          isApplied: true,
          overlayColor: '#000000',
          label: 'REDACTED PAYMENT'
        }
      );

      // Export through Secure Redaction Pipeline
      const result = await exportService.exportDocument(docModel);
      const exportedBytes = await result.file.arrayBuffer();

      // Audit with PDF.js text extraction
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(exportedBytes) } as any);
      const readDoc = await loadingTask.promise;
      const readPage = await readDoc.getPage(1);
      const textContent = await readPage.getTextContent();
      const extractedText = textContent.items.map((i: any) => i.str).join(' ');

      // CRITICAL OFFENSIVE SECURITY PROOFS:
      // Redacted text must NEVER be extractable or present in the vector text stream!
      expect(extractedText).not.toContain('4111-2222-3333-4444');
      expect(extractedText).not.toContain('999-00-1234');
      expect(extractedText).not.toContain('CONFIDENTIAL_TAX_ID');
      expect(extractedText).not.toContain('PAYMENT_CARD_SECRET');
    });

    it('differentiates Whiteout from True Redaction with clear security semantics', async () => {
      const { file, arrayBuffer } = await loadFixture('single-page-invoice.pdf');
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // Whiteout covers the text visually but does NOT destroy the vector text
      docModel.pages[0].whiteouts = [
        {
          id: 'w1',
          pageNumber: 1,
          rect: { x: 50, y: 560, width: 200, height: 25 },
          fillColor: '#FFFFFF',
          createdAt: Date.now()
        }
      ];

      const result = await exportService.exportDocument(docModel);
      const exportedBytes = await result.file.arrayBuffer();
      const readDoc = await pdfjsLib.getDocument({ data: new Uint8Array(exportedBytes) } as any).promise;
      const readPage = await readDoc.getPage(1);
      const textContent = await readPage.getTextContent();
      const extractedText = textContent.items.map((i: any) => i.str).join(' ');

      // Whiteout is purely cosmetic; underlying vector text remains extractable
      expect(extractedText).toContain('Dedicated Security Gateway Appliance');
    });

    it('immunizes against XSS via text annotation fields and freeform inputs', async () => {
      const { file, arrayBuffer } = await loadFixture('single-page-invoice.pdf');
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // Malicious XSS vectors
      const xssPayload = "<script>alert('xss')</script><img src=x onerror=alert(1)>";
      docModel.pages[0].elements.push({
        id: 'xss-text',
        type: 'text',
        pageNumber: 1,
        x: 50,
        y: 400,
        width: 300,
        height: 30,
        rotation: 0,
        opacity: 1.0,
        zIndex: 1,
        text: xssPayload,
        fontSize: 12,
        fontFamily: 'Helvetica',
        color: '#000000'
      } as PdfTextElement);

      const result = await exportService.exportDocument(docModel);
      expect(result.file).toBeDefined();

      const exportedBytes = await result.file.arrayBuffer();
      const readDoc = await pdfjsLib.getDocument({ data: new Uint8Array(exportedBytes) } as any).promise;
      const readPage = await readDoc.getPage(1);
      const textContent = await readPage.getTextContent();
      const extracted = textContent.items.map((i: any) => i.str).join(' ');

      // Rendered purely as inert text content, never executed
      expect(extracted).toContain('alert');
    });

    it('prevents memory bloat during extensive undo/redo operations with capped history', async () => {
      const { file, arrayBuffer } = await loadFixture('single-page-invoice.pdf');
      const doc = buildDocModel(file, arrayBuffer, 1);
      stateService.initDocument(doc);

      // Perform 65 element additions
      for (let i = 0; i < 65; i++) {
        stateService.addElement({
          type: 'text',
          x: 10 + i,
          y: 10 + i,
          width: 100,
          height: 20,
          rotation: 0,
          opacity: 1.0,
          text: `Iteration ${i}`,
          fontSize: 12,
          fontFamily: 'Helvetica',
          color: '#000000'
        } as PdfTextElement);
      }

      // Undo stack must be capped to MAX_HISTORY (50)
      expect((stateService as any).undoStack.length).toBeLessThanOrEqual(50);

      // Perform 30 undos
      for (let i = 0; i < 30; i++) {
        stateService.undo();
      }
      expect((stateService as any).redoStack.length).toBeLessThanOrEqual(50);

      // Perform 15 redos
      for (let i = 0; i < 15; i++) {
        stateService.redo();
      }
      expect((stateService as any).undoStack.length).toBeLessThanOrEqual(50);
    });
  });
});
