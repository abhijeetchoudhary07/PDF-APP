import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb, PDFTextField } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

import { PdfFindReplaceService } from '../services/pdf-find-replace.service';
import { PdfLinkEditorService } from '../services/pdf-link-editor.service';
import { PdfCommentReviewService } from '../services/pdf-comment-review.service';
import { PdfImageToolsService, WHITEOUT_DISCLAIMER_TEXT } from '../services/pdf-image-tools.service';
import { PdfShapeMeasurementService } from '../services/pdf-shape-measurement.service';
import { PdfTextEditorService } from '../services/pdf-text-editor.service';
import { PdfAnnotationFlattenService } from '../services/pdf-annotation-flatten.service';
import { PdfEditorStateService } from '../services/pdf-editor-state.service';
import {
  FindReplaceOptions,
  PdfHyperlink,
  CommentThread,
  MeasurementScale,
  TextEditCommand
} from '../models/editor-features.types';
import { PdfEditorDocument, PdfEditorPage } from '../models/pdf-editor.types';

// Helper: creates a multi-page PDF with vector text, form fields, and known dimensions
async function createEditorFixturePdf(): Promise<{ bytes: Uint8Array; arrayBuffer: ArrayBuffer }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Page 1: Standard text
  const page1 = pdfDoc.addPage([600, 800]);
  page1.drawText('Invoice Report 2026', { x: 50, y: 720, size: 20, font, color: rgb(0, 0, 0) });
  page1.drawText('Customer: Acme Corporation', { x: 50, y: 680, size: 14, font, color: rgb(0, 0, 0) });
  page1.drawText('Amount due: $500 USD', { x: 50, y: 650, size: 14, font, color: rgb(0, 0, 0) });

  // Page 2: Text + interactive AcroForm field
  const page2 = pdfDoc.addPage([600, 800]);
  page2.drawText('Form Section Page 2', { x: 50, y: 720, size: 18, font, color: rgb(0, 0, 0) });
  const form = pdfDoc.getForm();
  const textField = form.createTextField('clientEmail');
  textField.setText('billing@acme.com');
  textField.addToPage(page2, { x: 50, y: 600, width: 250, height: 28 });

  const bytes = await pdfDoc.save();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { bytes, arrayBuffer };
}

function createEditorDocModel(arrayBuffer: ArrayBuffer): PdfEditorDocument {
  const pages: PdfEditorPage[] = [
    {
      pageNumber: 1,
      originalWidth: 600,
      originalHeight: 800,
      currentWidth: 600,
      currentHeight: 800,
      rotation: 0,
      elements: [
        {
          id: 'el_1',
          type: 'text',
          pageNumber: 1,
          x: 50,
          y: 100,
          width: 150,
          height: 24,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          text: 'Acme Corporation Note',
          fontSize: 14,
          fontFamily: 'Helvetica',
          color: '#000000'
        }
      ],
      redactions: []
    },
    {
      pageNumber: 2,
      originalWidth: 600,
      originalHeight: 800,
      currentWidth: 600,
      currentHeight: 800,
      rotation: 0,
      elements: [],
      redactions: []
    }
  ];

  return {
    id: 'test_doc',
    name: 'test_doc.pdf',
    sizeBytes: arrayBuffer.byteLength,
    pageCount: 2,
    arrayBuffer,
    pages
  };
}

describe('Features K1–K7: PDF Editor Advanced Capabilities', () => {
  // ==========================================
  // K1: Find & Replace
  // ==========================================
  describe('K1: Find & Replace (PdfFindReplaceService)', () => {
    let service: PdfFindReplaceService;

    beforeEach(() => {
      /*
       * Through TestBed rather than `new`: page-text replacement goes
       * through K6's writer, which this service now takes from `inject()`.
       * That throws outside an injection context.
       */
      TestBed.configureTestingModule({});
      service = TestBed.inject(PdfFindReplaceService);
    });

    it('should find matches across document text, editor elements, and form fields', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      const editorDoc = createEditorDocModel(arrayBuffer);

      const matches = await service.findAcrossDocument(
        arrayBuffer,
        'Acme',
        { caseSensitive: true, wholeWord: false, includeFormFields: true },
        editorDoc
      );

      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(matches.some(m => m.source === 'editor-element')).toBe(true);
      expect(matches.some(m => m.source === 'form-field' || m.source === 'page-text')).toBe(true);
    });

    it('should support case-sensitive and whole-word matching', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      const editorDoc = createEditorDocModel(arrayBuffer);

      const caseMatches = await service.findAcrossDocument(
        arrayBuffer,
        'acme',
        { caseSensitive: true, wholeWord: false, includeFormFields: true },
        editorDoc
      );
      // 'billing@acme.com' matches lowercase 'acme'
      expect(caseMatches.length).toBeGreaterThan(0);

      const wholeWordMatches = await service.findAcrossDocument(
        arrayBuffer,
        'Invoice',
        { caseSensitive: true, wholeWord: true },
        editorDoc
      );
      expect(wholeWordMatches.length).toBeGreaterThanOrEqual(1);
      expect(wholeWordMatches[0].pageNumber).toBe(1);
    });

    it('should replace matches and leave no occurrences in form fields or editor elements', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      const editorDoc = createEditorDocModel(arrayBuffer);

      const result = await service.replaceAll(
        editorDoc,
        'billing@acme.com',
        'support@globex.org',
        { caseSensitive: false, wholeWord: false, includeFormFields: true }
      );

      expect(result.matchesFound).toBeGreaterThanOrEqual(1);
      expect(result.matchesReplaced).toBeGreaterThanOrEqual(1);

      /*
       * The rewritten bytes have to go back into the document before the
       * recheck. A form field value lives in the file, not in the overlay
       * model, so re-reading the original buffer would find the old value
       * and say nothing had happened.
       */
      editorDoc.arrayBuffer = result.updatedPdfBytes!.buffer.slice(
        result.updatedPdfBytes!.byteOffset,
        result.updatedPdfBytes!.byteOffset + result.updatedPdfBytes!.byteLength
      ) as ArrayBuffer;

      const recheck = await service.findMatches(editorDoc, 'billing@acme.com', {
        includeFormFields: true
      });
      expect(recheck.length).toBe(0);
    });
  });

  // ==========================================
  // K2: Link Editor
  // ==========================================
  describe('K2: Link Editor (PdfLinkEditorService)', () => {
    let service: PdfLinkEditorService;

    beforeEach(() => {
      service = new PdfLinkEditorService();
    });

    it('should create external URL and jump-to-page links and write standard /Annots', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([500, 500]);
      pdfDoc.addPage([500, 500]);

      const links: PdfHyperlink[] = [
        {
          id: 'link_url',
          pageNumber: 1,
          rect: { x: 50, y: 100, width: 120, height: 20 },
          type: 'url',
          url: 'https://example.com'
        },
        {
          id: 'link_page',
          pageNumber: 1,
          rect: { x: 50, y: 150, width: 100, height: 20 },
          type: 'page',
          targetPage: 2
        }
      ];

      await service.applyLinksToPdf(pdfDoc, links);
      const savedBytes = await pdfDoc.save();

      // Verify round-trip through PDF.js
      const pdfjsDoc = await pdfjsLib.getDocument({ data: savedBytes } as any).promise;
      expect(pdfjsDoc.numPages).toBe(2);
      const page1 = await pdfjsDoc.getPage(1);
      const annots = await page1.getAnnotations();
      const linkAnnots = annots.filter((a: any) => a.subtype === 'Link');

      expect(linkAnnots.length).toBe(2);
      const urlAnnot = linkAnnots.find(
        (a: any) => a.url === 'https://example.com' || a.unsafeUrl === 'https://example.com'
      );
      expect(urlAnnot).toBeDefined();
    });

    it('should audit links and flag dangling internal links', () => {
      const links: PdfHyperlink[] = [
        {
          id: 'valid_url',
          pageNumber: 1,
          rect: { x: 10, y: 10, width: 50, height: 20 },
          type: 'url',
          url: 'https://acme.org'
        },
        {
          id: 'valid_page',
          pageNumber: 1,
          rect: { x: 10, y: 40, width: 50, height: 20 },
          type: 'page',
          targetPage: 2
        },
        {
          id: 'dangling_page',
          pageNumber: 1,
          rect: { x: 10, y: 70, width: 50, height: 20 },
          type: 'page',
          targetPage: 99 // Page 99 does not exist when total is 3
        }
      ];

      const audit = service.auditLinks(links, 3);
      expect(audit.totalLinks).toBe(3);
      expect(audit.urlLinksCount).toBe(1);
      expect(audit.pageLinksCount).toBe(2);
      expect(audit.danglingLinksCount).toBe(1);
      expect(audit.danglingLinks[0].id).toBe('dangling_page');
      expect(audit.danglingLinks[0].isDangling).toBe(true);
    });
  });

  // ==========================================
  // K3: Comment & Review Threads
  // ==========================================
  describe('K3: Comment & Review Threads (PdfCommentReviewService)', () => {
    let service: PdfCommentReviewService;

    beforeEach(() => {
      service = new PdfCommentReviewService();
    });

    it('should write standard /Text annotations with /IRT reply chains that round-trip through PDF.js', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([500, 500]);

      const threads: CommentThread[] = [
        {
          id: 'thread_1',
          pageNumber: 1,
          x: 100,
          y: 200,
          author: 'Alice QA',
          initials: 'AQA',
          createdAt: Date.now(),
          text: 'Please review section 2.',
          resolved: false,
          replies: [
            {
              id: 'rep_1',
              author: 'Bob Dev',
              initials: 'BDE',
              createdAt: Date.now() + 1000,
              text: 'Fixed in latest revision.'
            }
          ]
        }
      ];

      await service.applyCommentsToPdf(pdfDoc, threads);
      const savedBytes = await pdfDoc.save();

      const pdfjsDoc = await pdfjsLib.getDocument({ data: savedBytes } as any).promise;
      const page = await pdfjsDoc.getPage(1);
      const annots = await page.getAnnotations();
      const textAnnots = annots.filter((a: any) => a.subtype === 'Text');

      expect(textAnnots.length).toBe(2);
      expect(textAnnots.some((a: any) => (a.contents || a.contentsObj?.str || '').includes('Please review'))).toBe(true);
      expect(textAnnots.some((a: any) => (a.contents || a.contentsObj?.str || '').includes('Fixed in late'))).toBe(true);
    });

    it('should export comment summary CSV with matching thread and reply count', () => {
      const threads: CommentThread[] = [
        {
          id: 't1',
          pageNumber: 1,
          x: 50,
          y: 50,
          author: 'Charlie',
          initials: 'CH',
          createdAt: Date.now(),
          text: 'Needs clarification',
          resolved: true,
          replies: []
        },
        {
          id: 't2',
          pageNumber: 2,
          x: 80,
          y: 90,
          author: 'Dave',
          initials: 'DA',
          createdAt: Date.now(),
          text: 'Approved clause',
          resolved: false,
          replies: [
            { id: 'r1', author: 'Eve', initials: 'EV', createdAt: Date.now(), text: 'Agreed' }
          ]
        }
      ];

      const csv = service.exportCommentsCsv(threads);
      expect(csv).toContain('Page,Author,Initials,Date,Status,Comment,RepliesCount');
      expect(csv).toContain('Charlie');
      expect(csv).toContain('Resolved');
      expect(csv).toContain('Approved clause');

      const lines = csv.trim().split('\r\n');
      expect(lines.length).toBe(3); // 1 header + 2 threads

      /* Every data field is quoted, so a comment carrying a comma or a line
       * break cannot split its own row. */
      expect(service.generateCsvSummary([threads[0]])).toContain('"Needs clarification"');
    });

    it('should generate a standalone PDF comment summary document', async () => {
      const threads: CommentThread[] = [
        {
          id: 't1',
          pageNumber: 1,
          x: 50,
          y: 50,
          author: 'Auditor',
          initials: 'AUD',
          createdAt: Date.now(),
          text: 'Audit comment summary item',
          resolved: false,
          replies: []
        }
      ];

      const pdfBytes = await service.generateCommentSummaryPdf(threads, 'sample.pdf');
      expect(pdfBytes.byteLength).toBeGreaterThan(500);

      const parsed = await PDFDocument.load(pdfBytes);
      expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // K4: Editor Image Tools & Whiteout
  // ==========================================
  describe('K4: Editor Image Tools & Whiteout (PdfImageToolsService)', () => {
    let service: PdfImageToolsService;

    beforeEach(() => {
      service = new PdfImageToolsService();
    });

    it('should verify whiteout disclaimer states visual coverage rather than permanent removal', () => {
      /*
       * The wording changed; what it has to say did not. The notice must
       * tell the reader that content is painted over rather than removed,
       * that what is underneath stays in the file, and where to go for a
       * removal that cannot be undone.
       */
      expect(WHITEOUT_DISCLAIMER_TEXT.toLowerCase()).toContain('paints over');
      expect(WHITEOUT_DISCLAIMER_TEXT.toLowerCase()).toContain('stay in the file');
      expect(WHITEOUT_DISCLAIMER_TEXT.toLowerCase()).toContain('redact');
    });

    it('should apply whiteout visual overlay while underlying text remains intact', async () => {
      const { bytes } = await createEditorFixturePdf();

      const whiteoutResult = await service.applyWhiteout(bytes, {
        id: 'w1',
        pageNumber: 1,
        rect: { x: 50, y: 710, width: 250, height: 30 },
        fillColor: '#FFFFFF',
        disclaimerAcknowledged: true
      });

      expect(whiteoutResult.disclaimerAcknowledged).toBe(true);

      // Verify that underlying text still exists in the stream (proving whiteout is visual coverage, not permanent deletion)
      const pdfjsDoc = await pdfjsLib.getDocument({ data: whiteoutResult.pdfBytes } as any).promise;
      const page1 = await pdfjsDoc.getPage(1);
      const textContent = await page1.getTextContent();
      const textStrings = textContent.items.map((i: any) => i.str).join(' ');
      expect(textStrings).toContain('Invoice Report 2026');
    });

    it('should crop an existing image region safely', async () => {
      // 100x100 1-bit base64 png
      const transparentPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const cropped = await service.cropImage(
        transparentPng,
        { x: 0, y: 0, width: 1, height: 1 }
      );
      expect(cropped).toBeDefined();
    });
  });

  // ==========================================
  // K5: Shape Recognition & Measurement
  // ==========================================
  describe('K5: Shape Recognition & Measurement (PdfShapeMeasurementService)', () => {
    let service: PdfShapeMeasurementService;

    beforeEach(() => {
      service = new PdfShapeMeasurementService();
    });

    it('should snap near-straight line strokes to clean lines', () => {
      const stroke = [
        { x: 10, y: 10 },
        { x: 50, y: 11 },
        { x: 100, y: 10 }
      ];

      const snap = service.recognizeStroke(stroke);
      expect(snap.detected).toBe(true);
      expect(snap.type).toBe('line');
      expect(snap.confidence).toBeGreaterThan(0.7);
    });

    it('should snap closed 4-corner strokes to clean rectangles', () => {
      const stroke = [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 60 },
        { x: 10, y: 60 },
        { x: 10, y: 10 }
      ];

      const snap = service.recognizeStroke(stroke);
      expect(snap.detected).toBe(true);
      expect(snap.type).toBe('rectangle');
      expect(snap.bounds.width).toBeCloseTo(100, 0);
      expect(snap.bounds.height).toBeCloseTo(50, 0);
    });

    it('should keep deliberately ambiguous / squiggly strokes as raw freehand', () => {
      // Non-geometric organic squiggle:
      const squiggle = [
        { x: 10, y: 10 },
        { x: 25, y: 80 },
        { x: 50, y: 20 },
        { x: 75, y: 95 },
        { x: 30, y: 40 },
        { x: 90, y: 15 }
      ];

      const snap = service.recognizeStroke(squiggle);
      expect(snap.type).toBe('raw');
      expect(snap.detected).toBe(false);
    });

    it('should accurately calculate distance against user calibration scale', () => {
      // Scale: 72 points = 1 inch
      const scale: MeasurementScale = {
        screenPoints: 72,
        worldValue: 1,
        worldUnit: 'in'
      };

      const points = [
        { x: 0, y: 0 },
        { x: 144, y: 0 }
      ];

      const res = service.calculateDistance(points, scale, 1);
      expect(res.value).toBeCloseTo(2.0, 2);
      expect(res.unit).toBe('in');
      expect(res.formattedString).toContain('2');
      expect(res.formattedString).toContain('in');
    });

    it('should accurately calculate area against user calibration scale', () => {
      // Scale: 100 pt = 1 m
      const scale: MeasurementScale = {
        screenPoints: 100,
        worldValue: 1,
        worldUnit: 'm'
      };

      // 100 pt x 200 pt rectangle = 1m x 2m = 2 m²
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 0, y: 200 }
      ];

      const res = service.calculateArea(points, scale, 1);
      expect(res.value).toBeCloseTo(2.0, 2);
      expect(res.unit).toBe('m');
      expect(res.formattedString).toContain('2');
      expect(res.formattedString).toContain('m');
    });
  });

  // ==========================================
  // K6: Edit Existing Text
  // ==========================================
  describe('K6: Edit Existing Text (PdfTextEditorService)', () => {
    let service: PdfTextEditorService;

    beforeEach(() => {
      service = new PdfTextEditorService();
    });

    it('should extract text runs from a page with bounding boxes, font, and size', async () => {
      const { bytes } = await createEditorFixturePdf();
      const runs = await service.extractTextRuns(bytes, 1);

      expect(runs.length).toBeGreaterThan(0);
      expect(runs.some(r => r.text.includes('Invoice Report 2026'))).toBe(true);
      const invoiceRun = runs.find(r => r.text.includes('Invoice Report 2026'))!;
      expect(invoiceRun.pageNumber).toBe(1);
      expect(invoiceRun.fontSize).toBeCloseTo(20, 0);
      expect(invoiceRun.fontFamily).toBe('Helvetica');
    });

    it('should apply single-line text edit preserving position, font, and size, and produce searchable output', async () => {
      const { bytes } = await createEditorFixturePdf();
      const runs = await service.extractTextRuns(bytes, 1);
      const invoiceRun = runs.find(r => r.text.includes('Invoice Report 2026'))!;

      const command: TextEditCommand = {
        runId: invoiceRun.id,
        pageNumber: 1,
        originalText: invoiceRun.text,
        newText: 'Receipt Summary 2027',
        bounds: {
          x: invoiceRun.x,
          y: invoiceRun.y,
          width: invoiceRun.width,
          height: invoiceRun.height
        },
        fontSize: invoiceRun.fontSize,
        fontFamily: invoiceRun.fontFamily,
        fallbackWhiteoutApplied: false
      };

      const result = await service.applyTextEdit(bytes, command);
      expect(result.success).toBe(true);
      expect(result.outputSelectable).toBe(true);
      expect(result.updatedPdfBytes).toBeDefined();

      // Verify that the replacement text is present and searchable in PDF.js
      const updatedPdfjsDoc = await pdfjsLib.getDocument({ data: result.updatedPdfBytes! } as any).promise;
      const page = await updatedPdfjsDoc.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map((i: any) => i.str).join(' ');
      expect(text).toContain('Receipt Summary 2027');
    });

    it('should detect subset fonts or missing glyphs and trigger documented fallback with notice', async () => {
      // Character outside Latin-1 (e.g. Devanagari or emoji or subset font prefix 'BAAAAA+Font')
      const subsetFontName = 'ABCDEF+Calibri';
      const canEmbed = service.canEmbedDirectly(subsetFontName, 'Hello');
      expect(canEmbed).toBe(false);

      const nonLatinText = 'नमस्ते';
      const canEmbedUnicode = service.canEmbedDirectly('Helvetica', nonLatinText);
      expect(canEmbedUnicode).toBe(false);

      const { bytes } = await createEditorFixturePdf();
      const command: TextEditCommand = {
        runId: 'run_subset',
        pageNumber: 1,
        originalText: 'Customer: Acme Corporation',
        newText: 'Customer: नमस्ते Acme',
        bounds: { x: 50, y: 120, width: 180, height: 20 },
        fontSize: 14,
        fontFamily: 'Helvetica',
        fallbackWhiteoutApplied: false
      };

      const result = await service.applyTextEdit(bytes, command);
      expect(result.usedFallbackWhiteout).toBe(true);
      expect(result.outputSelectable).toBe(true);

      /*
       * The notice names what actually happened rather than asserting a
       * single cause. For this input the standard fonts cannot encode
       * Devanagari at all, so the honest report is the dropped characters —
       * the old message blamed a subset font that is not involved here.
       */
      expect(result.command.fallbackNotice).toBeTruthy();
      expect(result.droppedCharacters).toBeGreaterThan(0);
      expect(result.message).toMatch(/covered and redrawn/i);
      expect(result.message).toMatch(/Devanagari/i);
    });
  });

  // ==========================================
  // K7: Annotation Flatten & Overlay Export
  // ==========================================
  describe('K7: Annotation Flatten & Overlay Export (PdfAnnotationFlattenService)', () => {
    let service: PdfAnnotationFlattenService;

    beforeEach(() => {
      service = new PdfAnnotationFlattenService();
    });

    it('should flatten non-form annotations while leaving AcroForm fields interactive', async () => {
      // Create PDF with an AcroForm field + a Link annotation
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([500, 500]);
      const form = pdfDoc.getForm();
      const tf = form.createTextField('userFullName');
      tf.setText('Jane Doe');
      tf.addToPage(page, { x: 50, y: 300, width: 200, height: 30 });

      // Add a link annotation
      const linkService = new PdfLinkEditorService();
      await linkService.applyLinksToPdf(pdfDoc, [
        {
          id: 'lnk1',
          pageNumber: 1,
          rect: { x: 50, y: 200, width: 100, height: 20 },
          type: 'url',
          url: 'https://example.com'
        }
      ]);

      const sourceBytes = await pdfDoc.save();

      // Run flatten annotations only
      const flattenedBytes = await service.flattenAnnotationsOnly(sourceBytes, {
        keepFormFieldsInteractive: true
      });

      // Verify that interactive form fields are preserved
      const reloadedDoc = await PDFDocument.load(flattenedBytes);
      const reloadedForm = reloadedDoc.getForm();
      const fields = reloadedForm.getFields();
      expect(fields.length).toBe(1);
      expect(fields[0].getName()).toBe('userFullName');

      // Verify that Link annotation was stripped from interactive /Annots
      const reloadedPage = reloadedDoc.getPages()[0];
      const pdfjsDoc = await pdfjsLib.getDocument({ data: flattenedBytes } as any).promise;
      const pdfjsPage = await pdfjsDoc.getPage(1);
      const annots = await pdfjsPage.getAnnotations();
      const links = annots.filter((a: any) => a.subtype === 'Link');
      expect(links.length).toBe(0);
    });

    it('should export annotation layer alone as a transparent overlay PDF with identical geometry and page count', async () => {
      const { bytes, arrayBuffer } = await createEditorFixturePdf();
      const editorDoc = createEditorDocModel(arrayBuffer);

      const overlayResult = await service.exportAnnotationOverlay(bytes, editorDoc);

      expect(overlayResult.hasAnnotationsOnly).toBe(true);
      expect(overlayResult.pageCount).toBe(2);
      expect(overlayResult.pdfBytes.byteLength).toBeGreaterThan(0);

      // Verify overlay PDF properties
      const overlayPdfDoc = await PDFDocument.load(overlayResult.pdfBytes);
      expect(overlayPdfDoc.getPageCount()).toBe(2);

      const p1 = overlayPdfDoc.getPage(0);
      expect(p1.getWidth()).toBe(600);
      expect(p1.getHeight()).toBe(800);
    });
  });

  // ==========================================
  // Editor State Service Integration
  // ==========================================
  describe('PdfEditorStateService: K1–K7 Commands & Undo/Redo', () => {
    let state: PdfEditorStateService;

    beforeEach(() => {
      state = new PdfEditorStateService();
    });

    it('should add, undo, and redo hyperlinks', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      state.initDocument(createEditorDocModel(arrayBuffer));

      const link = state.addLink({
        pageNumber: 1,
        rect: { x: 50, y: 50, width: 100, height: 20 },
        type: 'url',
        url: 'https://github.com'
      });

      expect(state.currentPage?.links?.length).toBe(1);

      state.undo();
      expect(state.currentPage?.links?.length).toBe(0);

      state.redo();
      expect(state.currentPage?.links?.length).toBe(1);
    });

    it('should add, reply, resolve, undo, and redo comment threads', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      state.initDocument(createEditorDocModel(arrayBuffer));

      const thread = state.addCommentThread({
        pageNumber: 1,
        x: 100,
        y: 100,
        author: 'Sarah',
        initials: 'SAR',
        text: 'Initial review note'
      });

      expect(state.currentPage?.comments?.length).toBe(1);

      state.addCommentReply(thread.id, {
        author: 'Tom',
        initials: 'TOM',
        text: 'Looks good to me'
      });
      expect(thread.replies.length).toBe(1);

      state.resolveCommentThread(thread.id, true);
      expect(thread.resolved).toBe(true);

      state.undo();
      expect(thread.resolved).toBe(false);
    });

    it('should manage whiteouts and measurements with undo/redo', async () => {
      const { arrayBuffer } = await createEditorFixturePdf();
      state.initDocument(createEditorDocModel(arrayBuffer));

      const whiteout = state.addWhiteout({
        pageNumber: 1,
        rect: { x: 20, y: 20, width: 80, height: 20 },
        fillColor: '#FFFFFF',
        disclaimerAcknowledged: true
      });
      expect(state.currentPage?.whiteouts?.length).toBe(1);

      const measurement = state.addMeasurement({
        type: 'distance',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        value: 10,
        unit: 'cm',
        formattedString: '10.00 cm',
        pageNumber: 1
      });
      expect(state.currentPage?.measurements?.length).toBe(1);

      state.undo(); // undo measurement
      expect(state.currentPage?.measurements?.length).toBe(0);
      expect(state.currentPage?.whiteouts?.length).toBe(1);

      state.undo(); // undo whiteout
      expect(state.currentPage?.whiteouts?.length).toBe(0);
    });
  });
});
