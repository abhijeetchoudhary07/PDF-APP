import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

import { PdfEditorStateService } from '../services/pdf-editor-state.service';
import { PdfExportPipelineService } from '../services/pdf-export-pipeline.service';
import { ShareService } from '../services/share.service';
import {
  PdfEditorDocument,
  PdfEditorPage,
  PdfTextElement,
  PdfShapeElement,
  PdfCropBox,
  PdfWatermark,
  PdfPageNumberingConfig
} from '../models/pdf-editor.types';

// Helper to create a test PDF in memory
async function createSamplePdf(numPages = 2, text = 'Hello World'): Promise<{ file: File; arrayBuffer: ArrayBuffer }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < numPages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${text} on Page ${i + 1}`, {
      x: 50,
      y: 750,
      size: 24,
      font,
      color: rgb(0, 0, 0)
    });
  }

  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const file = new File([blob], 'test_doc.pdf', { type: 'application/pdf' });
  const arrayBuffer = await file.arrayBuffer();
  return { file, arrayBuffer };
}

function buildDocModel(file: File, arrayBuffer: ArrayBuffer, numPages = 2): PdfEditorDocument {
  const pages: PdfEditorPage[] = [];
  for (let i = 0; i < numPages; i++) {
    pages.push({
      pageNumber: i + 1,
      originalWidth: 595,
      originalHeight: 842,
      currentWidth: 595,
      currentHeight: 842,
      rotation: 0,
      elements: [],
      redactions: []
    });
  }
  return {
    id: 'test_doc_id',
    name: file.name,
    sizeBytes: file.size,
    pageCount: numPages,
    file,
    arrayBuffer,
    pages
  };
}

describe('Phase 3: PDF Editor Architecture & Capabilities', () => {
  let stateService: PdfEditorStateService;
  let exportService: PdfExportPipelineService;

  beforeEach(() => {
    stateService = new PdfEditorStateService();
    exportService = new PdfExportPipelineService();
  });

  describe('PdfEditorStateService — State & Navigation', () => {
    it('should initialize document state correctly', async () => {
      const { file, arrayBuffer } = await createSamplePdf(3);
      const doc = buildDocModel(file, arrayBuffer, 3);

      stateService.initDocument(doc);

      expect(stateService.document).toBeDefined();
      expect(stateService.document?.pageCount).toBe(3);
      expect(stateService.currentPageNumber).toBe(1);
      expect(stateService.zoom).toBe(1.0);
      expect(stateService.activeTool).toBe('select');
      expect(stateService.selectedElementId).toBeNull();
    });

    it('should navigate pages and clamp bounds', async () => {
      const { file, arrayBuffer } = await createSamplePdf(3);
      stateService.initDocument(buildDocModel(file, arrayBuffer, 3));

      expect(stateService.nextPage()).toBe(true);
      expect(stateService.currentPageNumber).toBe(2);

      expect(stateService.nextPage()).toBe(true);
      expect(stateService.currentPageNumber).toBe(3);

      // Clamped at max pages
      expect(stateService.nextPage()).toBe(false);
      expect(stateService.currentPageNumber).toBe(3);

      expect(stateService.prevPage()).toBe(true);
      expect(stateService.currentPageNumber).toBe(2);

      stateService.setCurrentPage(100);
      expect(stateService.currentPageNumber).toBe(3);

      stateService.setCurrentPage(-5);
      expect(stateService.currentPageNumber).toBe(1);
    });

    it('should adjust zoom within clamped bounds', () => {
      stateService.setZoom(1.5);
      expect(stateService.zoom).toBe(1.5);

      stateService.zoomIn();
      expect(stateService.zoom).toBe(1.7);

      stateService.zoomOut();
      expect(stateService.zoom).toBe(1.5);

      stateService.setZoom(10.0);
      expect(stateService.zoom).toBe(4.0); // max clamp

      stateService.setZoom(0.01);
      expect(stateService.zoom).toBe(0.2); // min clamp
    });
  });

  describe('PdfEditorStateService — Elements & Undo/Redo', () => {
    beforeEach(async () => {
      const { file, arrayBuffer } = await createSamplePdf(2);
      stateService.initDocument(buildDocModel(file, arrayBuffer, 2));
    });

    it('should add, update, and delete text elements with undo/redo', () => {
      // 1. Add Text Element
      const el = stateService.addElement({
        type: 'text',
        x: 100,
        y: 200,
        width: 150,
        height: 40,
        rotation: 0,
        opacity: 1.0,
        text: 'Hello Annotation',
        fontSize: 18,
        fontFamily: 'Helvetica',
        color: '#FF0000'
      } as PdfTextElement);

      expect(stateService.currentPage?.elements.length).toBe(1);
      expect(stateService.selectedElementId).toBe(el.id);

      // 2. Update Text Element
      stateService.updateElement(el.id, { text: 'Updated Text', x: 120 });
      expect(stateService.selectedElement?.x).toBe(120);
      expect((stateService.selectedElement as PdfTextElement).text).toBe('Updated Text');

      // 3. Undo Update
      stateService.undo();
      expect((stateService.selectedElement as PdfTextElement).text).toBe('Hello Annotation');
      expect(stateService.selectedElement?.x).toBe(100);

      // 4. Redo Update
      stateService.redo();
      expect((stateService.selectedElement as PdfTextElement).text).toBe('Updated Text');

      // 5. Delete Element
      stateService.deleteElement(el.id);
      expect(stateService.currentPage?.elements.length).toBe(0);

      // 6. Undo Delete
      stateService.undo();
      expect(stateService.currentPage?.elements.length).toBe(1);
      expect((stateService.currentPage?.elements[0] as PdfTextElement).text).toBe('Updated Text');
    });

    it('should add shape elements and persist properties', () => {
      const shape = stateService.addElement({
        type: 'shape',
        shapeType: 'rectangle',
        x: 50,
        y: 50,
        width: 200,
        height: 100,
        rotation: 0,
        opacity: 0.8,
        strokeColor: '#00FF00',
        strokeWidth: 3,
        fillColor: '#EEEEEE',
        strokeStyle: 'solid'
      } as PdfShapeElement);

      expect(shape.type).toBe('shape');
      expect((shape as PdfShapeElement).shapeType).toBe('rectangle');
      expect(stateService.currentPage?.elements.length).toBe(1);
    });
  });

  describe('PdfEditorStateService — Cropping, Watermark & Page Numbers', () => {
    beforeEach(async () => {
      const { file, arrayBuffer } = await createSamplePdf(3);
      stateService.initDocument(buildDocModel(file, arrayBuffer, 3));
    });

    it('should set and reset page crop with undo/redo', () => {
      const cropBox: PdfCropBox = { x: 20, y: 30, width: 500, height: 700 };
      stateService.setPageCrop(1, cropBox);

      expect(stateService.document?.pages[0].cropBox).toEqual(cropBox);
      expect(stateService.document?.pages[1].cropBox).toBeUndefined();

      stateService.undo();
      expect(stateService.document?.pages[0].cropBox).toBeUndefined();

      stateService.redo();
      expect(stateService.document?.pages[0].cropBox).toEqual(cropBox);

      // Set crop all pages
      stateService.setCropAllPages(cropBox);
      expect(stateService.document?.pages[1].cropBox).toEqual(cropBox);
      expect(stateService.document?.pages[2].cropBox).toEqual(cropBox);
    });

    it('should configure watermarks', () => {
      const watermark: PdfWatermark = {
        type: 'text',
        text: 'CONFIDENTIAL',
        fontSize: 48,
        color: '#FF0000',
        opacity: 0.25,
        rotation: 45,
        position: 'diagonal',
        targetPages: 'all'
      };

      stateService.setWatermark(watermark);
      expect(stateService.document?.watermark?.text).toBe('CONFIDENTIAL');

      stateService.undo();
      expect(stateService.document?.watermark).toBeUndefined();

      stateService.redo();
      expect(stateService.document?.watermark?.text).toBe('CONFIDENTIAL');
    });

    it('should configure page numbering', () => {
      const numbering: PdfPageNumberingConfig = {
        position: 'bottom-center',
        startingNumber: 1,
        fontSize: 10,
        fontFamily: 'Helvetica',
        color: '#333333',
        prefix: 'Page ',
        suffix: ' of {total}',
        targetPages: 'all'
      };

      stateService.setPageNumbering(numbering);
      expect(stateService.document?.pageNumbering?.prefix).toBe('Page ');

      stateService.undo();
      expect(stateService.document?.pageNumbering).toBeUndefined();

      stateService.redo();
      expect(stateService.document?.pageNumbering?.prefix).toBe('Page ');
    });
  });

  describe('PdfEditorStateService — Redaction Workflow', () => {
    beforeEach(async () => {
      const { file, arrayBuffer } = await createSamplePdf(2);
      stateService.initDocument(buildDocModel(file, arrayBuffer, 2));
    });

    it('should manage redactions workflow: mark -> pending -> apply', () => {
      // 1. Mark for redaction
      const red = stateService.addRedaction({
        x: 50,
        y: 100,
        width: 200,
        height: 30,
        overlayColor: '#000000',
        label: 'TOP_SECRET'
      });

      expect(red.isApplied).toBe(false);
      expect(stateService.currentPage?.redactions.length).toBe(1);

      // 2. Apply all redactions
      stateService.applyAllRedactions();
      expect(stateService.currentPage?.redactions[0].isApplied).toBe(true);

      // 3. Undo apply
      stateService.undo();
      expect(stateService.currentPage?.redactions[0].isApplied).toBe(false);

      // 4. Redo apply
      stateService.redo();
      expect(stateService.currentPage?.redactions[0].isApplied).toBe(true);
    });
  });

  describe('PdfExportPipelineService — Export & True Redaction Security', () => {
    it('should export PDF with text overlay, shapes, watermarks, and numbering', async () => {
      const { file, arrayBuffer } = await createSamplePdf(2, 'Original Content');
      const docModel = buildDocModel(file, arrayBuffer, 2);

      // Add text overlay
      docModel.pages[0].elements.push({
        id: 'el1',
        type: 'text',
        pageNumber: 1,
        x: 50,
        y: 600,
        width: 200,
        height: 30,
        rotation: 0,
        opacity: 1.0,
        zIndex: 1,
        text: 'Confidential Overlay',
        fontSize: 16,
        fontFamily: 'Helvetica',
        color: '#0000FF'
      } as PdfTextElement);

      // Add shape
      docModel.pages[0].elements.push({
        id: 'el2',
        type: 'shape',
        pageNumber: 1,
        shapeType: 'rectangle',
        x: 40,
        y: 590,
        width: 220,
        height: 50,
        rotation: 0,
        opacity: 1.0,
        zIndex: 0,
        strokeColor: '#0000FF',
        strokeWidth: 2,
        strokeStyle: 'solid'
      } as PdfShapeElement);

      // Add watermark & numbering
      docModel.watermark = {
        type: 'text',
        text: 'TEST WATERMARK',
        fontSize: 36,
        opacity: 0.2,
        rotation: 30,
        position: 'center',
        targetPages: 'all'
      };

      docModel.pageNumbering = {
        position: 'bottom-right',
        startingNumber: 1,
        fontSize: 10,
        fontFamily: 'Helvetica',
        color: '#000000',
        prefix: 'P. ',
        suffix: '',
        targetPages: 'all'
      };

      const result = await exportService.exportDocument(docModel);

      expect(result.file).toBeDefined();
      expect(result.sizeBytes).toBeGreaterThan(500);
      expect(result.pageCount).toBe(2);

      // Load exported PDF and verify structure
      const exportedArrayBuffer = await result.file.arrayBuffer();
      const exportedDoc = await PDFDocument.load(exportedArrayBuffer);
      expect(exportedDoc.getPageCount()).toBe(2);
    });

    it('should provide TRUE REDACTION security by permanently destroying underlying vector text', async () => {
      // Create PDF with secret text
      const secretString = 'SUPER_SECRET_SSN_999-00-1234';
      const { file, arrayBuffer } = await createSamplePdf(1, secretString);
      const docModel = buildDocModel(file, arrayBuffer, 1);

      // Mark and apply true redaction over the area
      docModel.pages[0].redactions.push({
        id: 'red1',
        pageNumber: 1,
        x: 40,
        y: 80,
        width: 400,
        height: 50,
        isApplied: true,
        overlayColor: '#000000',
        label: 'REDACTED'
      });

      // Export using true redaction pipeline
      const result = await exportService.exportDocument(docModel);
      const exportedBuffer = await result.file.arrayBuffer();

      // Read exported PDF with pdfjs-dist text extraction
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(exportedBuffer) } as any);
      const readDoc = await loadingTask.promise;
      const readPage = await readDoc.getPage(1);
      const textContent = await readPage.getTextContent();

      const extractedStrings = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');

      // CRITICAL ASSERTION: The secret string MUST NOT be extractable!
      expect(extractedStrings).not.toContain(secretString);
      expect(extractedStrings).not.toContain('SUPER_SECRET');
    }, 15000);
  });

  describe('ShareService — Browser Fallback', () => {
    it('should gracefully handle sharing via download when native share is unavailable', async () => {
      const shareService = new ShareService();
      const testFile = new File(['pdf-content'], 'sample.pdf', { type: 'application/pdf' });

      // In jsdom environment, navigator.canShare is undefined
      const success = await shareService.shareFile(testFile, 'Test Share');
      expect(success).toBe(true);
    });
  });
});
