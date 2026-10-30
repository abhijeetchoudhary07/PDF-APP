import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, PDFName, PDFDict, PDFString, StandardFonts } from 'pdf-lib';
import { PdfAccessibilityService } from './pdf-accessibility.service';
import { PageAccessibilityData, ReadingBlock } from '../models/pdf-accessibility.types';

describe('PdfAccessibilityService', () => {
  let service: PdfAccessibilityService;

  beforeEach(() => {
    service = TestBed.inject(PdfAccessibilityService);
  });

  // Helper to create a clean PDF with sample pages
  async function createTestPdf(pageCount: number = 2): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    for (let i = 1; i <= pageCount; i++) {
      const page = doc.addPage([595.28, 841.89]);
      page.drawText(`Page ${i} Document Title`, { x: 50, y: 800, size: 18, font: boldFont });
      page.drawText(`Section 1: Guidelines for Page ${i}`, { x: 50, y: 760, size: 14, font: boldFont });
      page.drawText(`This is paragraph content on page ${i} explaining requirements.`, {
        x: 50,
        y: 730,
        size: 11,
        font
      });
      page.drawText(`• First listed item for examination`, { x: 50, y: 700, size: 11, font });
      page.drawText(`• Second listed item for verification`, { x: 50, y: 680, size: 11, font });
      page.drawText(`Page ${i} of ${pageCount}`, { x: 50, y: 30, size: 9, font });
    }

    return await doc.save();
  }

  describe('Structure Inference & Tag Classification', () => {
    it('infers Headings, Paragraphs, Lists, and Header/Footer Artifacts from layout', () => {
      const rawItems = [
        // Header artifact
        { str: 'Official Government Document Header', x: 50, y: 820, width: 250, height: 10, fontSize: 9 },
        // H1 Title
        { str: 'Annual Recruitment Policy 2026', x: 50, y: 780, width: 350, height: 22, fontSize: 20 },
        // H2 Section
        { str: 'Section 1: Eligibility Criteria', x: 50, y: 730, width: 240, height: 16, fontSize: 15 },
        // Paragraph
        { str: 'All candidates must satisfy the educational requirements stated below.', x: 50, y: 690, width: 400, height: 12, fontSize: 11 },
        // List item
        { str: '• Bachelor degree from a recognized university', x: 50, y: 660, width: 300, height: 12, fontSize: 11 },
        // Footer artifact
        { str: 'Page 1 of 5', x: 50, y: 30, width: 60, height: 10, fontSize: 9 }
      ];

      const pageData = service.inferPageStructure(1, 595.28, 841.89, rawItems, []);

      expect(pageData.pageNumber).toBe(1);
      expect(pageData.blocks.length).toBeGreaterThanOrEqual(4);

      const h1Block = pageData.blocks.find(b => b.tag === 'H1');
      expect(h1Block).toBeDefined();
      expect(h1Block!.text).toContain('Annual Recruitment Policy');

      const h2Block = pageData.blocks.find(b => b.tag === 'H2');
      expect(h2Block).toBeDefined();
      expect(h2Block!.text).toContain('Section 1');

      const listBlock = pageData.blocks.find(b => b.tag === 'L');
      expect(listBlock).toBeDefined();

      const artifacts = pageData.blocks.filter(b => b.tag === 'Artifact' || b.isArtifact);
      expect(artifacts.length).toBeGreaterThanOrEqual(1);
    });

    it('detects multi-column newspaper layouts and orders column 0 before column 1', () => {
      const multiColItems = [
        // Full-width title at top
        { str: 'Daily Official Gazette Announcement', x: 50, y: 800, width: 500, height: 20, fontSize: 18 },
        // Left Column (Col 0) items
        { str: 'Left column headline', x: 50, y: 750, width: 200, height: 14, fontSize: 14 },
        { str: 'Left column paragraph 1', x: 50, y: 720, width: 200, height: 12, fontSize: 10 },
        { str: 'Left column paragraph 2', x: 50, y: 690, width: 200, height: 12, fontSize: 10 },
        // Right Column (Col 1) items
        { str: 'Right column headline', x: 320, y: 750, width: 200, height: 14, fontSize: 14 },
        { str: 'Right column paragraph 1', x: 320, y: 720, width: 200, height: 12, fontSize: 10 },
        { str: 'Right column paragraph 2', x: 320, y: 690, width: 200, height: 12, fontSize: 10 }
      ];

      const pageData = service.inferPageStructure(1, 595.28, 841.89, multiColItems, []);
      expect(pageData.hasMultiColumn).toBe(true);

      // Verify that left column text appears before right column text in reading order
      const leftColIdx = pageData.blocks.findIndex(b => b.text.includes('Left column paragraph 1'));
      const rightColIdx = pageData.blocks.findIndex(b => b.text.includes('Right column paragraph 1'));

      expect(leftColIdx).toBeGreaterThanOrEqual(0);
      expect(rightColIdx).toBeGreaterThanOrEqual(0);
      expect(leftColIdx).toBeLessThan(rightColIdx);
    });
  });

  describe('Tagged PDF Structure Tree (/StructTreeRoot) and /ParentTree Validation', () => {
    it('writes valid /StructTreeRoot and /ParentTree object graphs that validate in pdf-lib', async () => {
      const pdfBytes = await createTestPdf(2);

      const page1Blocks: ReadingBlock[] = [
        {
          id: 'p1-b1',
          pageNumber: 1,
          orderIndex: 1,
          tag: 'H1',
          text: 'Document Main Title',
          bbox: { x: 50, y: 800, width: 300, height: 20 },
          confidence: 0.95
        },
        {
          id: 'p1-b2',
          pageNumber: 1,
          orderIndex: 2,
          tag: 'P',
          text: 'First body paragraph content.',
          bbox: { x: 50, y: 750, width: 400, height: 15 },
          confidence: 0.9
        }
      ];

      const page2Blocks: ReadingBlock[] = [
        {
          id: 'p2-b1',
          pageNumber: 2,
          orderIndex: 1,
          tag: 'H2',
          text: 'Section Title on Page 2',
          bbox: { x: 50, y: 800, width: 250, height: 18 },
          confidence: 0.92
        },
        {
          id: 'p2-b2',
          pageNumber: 2,
          orderIndex: 2,
          tag: 'Table',
          text: 'Cell 1 | Cell 2 | Cell 3',
          bbox: { x: 50, y: 720, width: 400, height: 30 },
          confidence: 0.85
        }
      ];

      const pages: PageAccessibilityData[] = [
        { pageNumber: 1, width: 595.28, height: 841.89, blocks: page1Blocks, images: [], notices: [], hasMultiColumn: false },
        { pageNumber: 2, width: 595.28, height: 841.89, blocks: page2Blocks, images: [], notices: [], hasMultiColumn: false }
      ];

      const taggedPdfBlob = await service.createTaggedPdf(pdfBytes, {
        fileName: 'accessible-doc.pdf',
        documentTitle: 'Accessible Document Title',
        language: 'en-US',
        pages
      });

      expect(taggedPdfBlob.type).toBe('application/pdf');
      expect(taggedPdfBlob.size).toBeGreaterThan(1000);

      // Validate reloaded object graph using pdf-lib
      const reloadedDoc = await PDFDocument.load(await taggedPdfBlob.arrayBuffer());

      // 1. Catalog MarkInfo
      const markInfo = reloadedDoc.catalog.lookup(PDFName.of('MarkInfo')) as PDFDict;
      expect(markInfo).toBeDefined();
      expect(markInfo.lookup(PDFName.of('Marked')).toString()).toBe('true');

      // 2. StructTreeRoot
      const structTreeRoot = reloadedDoc.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict;
      expect(structTreeRoot).toBeDefined();
      expect(structTreeRoot.lookup(PDFName.of('Type'))?.toString()).toBe('/StructTreeRoot');

      // 3. RoleMap
      const roleMap = structTreeRoot.lookup(PDFName.of('RoleMap')) as PDFDict;
      expect(roleMap).toBeDefined();
      expect(roleMap.lookup(PDFName.of('H1'))?.toString()).toBe('/H1');
      expect(roleMap.lookup(PDFName.of('Table'))?.toString()).toBe('/Table');

      // 4. ParentTree
      const parentTree = structTreeRoot.lookup(PDFName.of('ParentTree')) as PDFDict;
      expect(parentTree).toBeDefined();
      expect(parentTree.lookup(PDFName.of('Nums'))).toBeDefined();

      // 5. Page StructParents
      const page0 = reloadedDoc.getPage(0);
      const page1 = reloadedDoc.getPage(1);
      expect(page0.node.lookup(PDFName.of('StructParents'))?.toString()).toBe('0');
      expect(page1.node.lookup(PDFName.of('StructParents'))?.toString()).toBe('1');
    });

    it('embeds /Alt text attribute correctly into figure structure elements', async () => {
      const pdfBytes = await createTestPdf(1);

      const pageBlocks: ReadingBlock[] = [
        {
          id: 'p1-fig-1',
          pageNumber: 1,
          orderIndex: 1,
          tag: 'Figure',
          text: 'Official departmental logo',
          altText: 'Emblem of the Ministry of Education with state motto',
          bbox: { x: 50, y: 700, width: 120, height: 120 },
          confidence: 0.95
        }
      ];

      const pages: PageAccessibilityData[] = [
        { pageNumber: 1, width: 595.28, height: 841.89, blocks: pageBlocks, images: [], notices: [], hasMultiColumn: false }
      ];

      const taggedPdfBlob = await service.createTaggedPdf(pdfBytes, {
        fileName: 'image-alt.pdf',
        pages
      });

      const reloadedDoc = await PDFDocument.load(await taggedPdfBlob.arrayBuffer());
      const structTreeRoot = reloadedDoc.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict;
      const docElem = (structTreeRoot.lookup(PDFName.of('K')) as any).lookup(0) as PDFDict;
      const kidsArray = docElem.lookup(PDFName.of('K')) as any;
      const figureElem = kidsArray.lookup(0) as PDFDict;

      expect(figureElem.lookup(PDFName.of('S'))?.toString()).toBe('/Figure');
      const altValue = figureElem.lookup(PDFName.of('Alt')) as PDFString;
      expect(altValue).toBeDefined();
      expect(altValue.asString()).toBe('Emblem of the Ministry of Education with state motto');
    });

    it('reflects interactive reading order changes in structure tree sequence', async () => {
      const pdfBytes = await createTestPdf(1);

      // Original order: Block 1 = H1, Block 2 = Paragraph
      const originalBlocks: ReadingBlock[] = [
        { id: 'b1', pageNumber: 1, orderIndex: 1, tag: 'H1', text: 'First Heading', bbox: { x: 50, y: 800, width: 200, height: 20 }, confidence: 0.9 },
        { id: 'b2', pageNumber: 1, orderIndex: 2, tag: 'P', text: 'Second Paragraph', bbox: { x: 50, y: 750, width: 300, height: 15 }, confidence: 0.9 }
      ];

      // Reordered: Block 2 moved before Block 1 (Visual Reading Order Editor action)
      const reorderedBlocks: ReadingBlock[] = [
        { id: 'b1', pageNumber: 1, orderIndex: 2, tag: 'H1', text: 'First Heading', bbox: { x: 50, y: 800, width: 200, height: 20 }, confidence: 0.9 },
        { id: 'b2', pageNumber: 1, orderIndex: 1, tag: 'P', text: 'Second Paragraph', bbox: { x: 50, y: 750, width: 300, height: 15 }, confidence: 0.9 }
      ];

      const pages: PageAccessibilityData[] = [
        { pageNumber: 1, width: 595.28, height: 841.89, blocks: reorderedBlocks, images: [], notices: [], hasMultiColumn: false }
      ];

      const taggedPdfBlob = await service.createTaggedPdf(pdfBytes, {
        fileName: 'reordered.pdf',
        pages
      });

      const reloadedDoc = await PDFDocument.load(await taggedPdfBlob.arrayBuffer());
      const structTreeRoot = reloadedDoc.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict;
      const docElem = (structTreeRoot.lookup(PDFName.of('K')) as any).lookup(0) as PDFDict;
      const kidsArray = docElem.lookup(PDFName.of('K')) as any;

      // First kid in reading order must now be the Paragraph (/P), not the Heading (/H1)
      const firstKid = kidsArray.lookup(0) as PDFDict;
      const secondKid = kidsArray.lookup(1) as PDFDict;

      expect(firstKid.lookup(PDFName.of('S'))?.toString()).toBe('/P');
      expect(secondKid.lookup(PDFName.of('S'))?.toString()).toBe('/H1');
    });

    it('skips Artifacts (headers, footers, decorative images) from logical structure tree', async () => {
      const pdfBytes = await createTestPdf(1);

      const blocks: ReadingBlock[] = [
        { id: 'art-1', pageNumber: 1, orderIndex: 1, tag: 'Artifact', isArtifact: true, artifactType: 'Header', text: 'Running Header', bbox: { x: 50, y: 820, width: 200, height: 10 }, confidence: 0.95 },
        { id: 'content-1', pageNumber: 1, orderIndex: 2, tag: 'H1', text: 'Document Title', bbox: { x: 50, y: 780, width: 300, height: 20 }, confidence: 0.9 }
      ];

      const pages: PageAccessibilityData[] = [
        { pageNumber: 1, width: 595.28, height: 841.89, blocks, images: [], notices: [], hasMultiColumn: false }
      ];

      const taggedPdfBlob = await service.createTaggedPdf(pdfBytes, {
        fileName: 'artifacts.pdf',
        pages
      });

      const reloadedDoc = await PDFDocument.load(await taggedPdfBlob.arrayBuffer());
      const structTreeRoot = reloadedDoc.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict;
      const docElem = (structTreeRoot.lookup(PDFName.of('K')) as any).lookup(0) as PDFDict;
      const kidsArray = docElem.lookup(PDFName.of('K')) as any;

      // Only 1 structure element should exist (/H1), Artifact is skipped
      expect(kidsArray.size()).toBe(1);
      expect((kidsArray.lookup(0) as PDFDict).lookup(PDFName.of('S'))?.toString()).toBe('/H1');
    });
  });

  describe('Image Alt-Text Suggestion Engine', () => {
    it('generates context-aware starter alt-text suggestions', () => {
      const logoImage = {
        id: 'img-1',
        pageNumber: 1,
        indexOnPage: 0,
        name: 'logo.png',
        bbox: { x: 50, y: 700, width: 80, height: 80 },
        altText: '',
        hasUserAltText: false
      };

      const suggestion = service.suggestAltText(logoImage, 'Government of India Official Notice');
      expect(suggestion).toContain('emblem');

      const ocrImage = {
        id: 'img-2',
        pageNumber: 1,
        indexOnPage: 1,
        name: 'chart.png',
        bbox: { x: 50, y: 500, width: 300, height: 200 },
        altText: '',
        ocrSuggestion: 'Quarterly candidate attendance trend 2026',
        hasUserAltText: false
      };

      const ocrSuggestion = service.suggestAltText(ocrImage);
      expect(ocrSuggestion).toContain('Quarterly candidate attendance trend');
    });
  });

  describe('Strict Honesty Gate & Certification Prohibition', () => {
    it('generates an honest audit report without false compliance claims', () => {
      const pages: PageAccessibilityData[] = [
        {
          pageNumber: 1,
          width: 595.28,
          height: 841.89,
          blocks: [
            { id: 'b1', pageNumber: 1, orderIndex: 1, tag: 'H1', text: 'Title', bbox: { x: 50, y: 800, width: 200, height: 20 }, confidence: 0.95 },
            { id: 'b2', pageNumber: 1, orderIndex: 2, tag: 'P', text: 'Para', bbox: { x: 50, y: 750, width: 200, height: 20 }, confidence: 0.6 }
          ],
          images: [{ id: 'img-1', pageNumber: 1, indexOnPage: 0, name: 'fig.png', bbox: { x: 50, y: 600, width: 100, height: 100 }, altText: '', hasUserAltText: false }],
          notices: [{ severity: 'warning', pageNumber: 1, message: 'Review block 2' }],
          hasMultiColumn: false
        }
      ];

      const report = service.generateAuditReport('test.pdf', pages);

      expect(report.honestyStatement).toContain('Enhanced with structure tags and image descriptions');
      expect(report.unconfidentInferences.length).toBe(1);

      // Verify that no false compliance claims exist in the report
      const reportJson = JSON.stringify(report);
      expect(reportJson).not.toContain('WCAG Compliant');
      expect(reportJson).not.toContain('Section 508 Certified');
    });

    it('verifies that no false accessibility claims exist in service definition', () => {
      const statement = service.HONESTY_STATEMENT;
      expect(statement).not.toContain('WCAG Compliant');
      expect(statement).not.toContain('Section 508 Certified');
      expect(statement).toContain('heuristic');
    });

    it('sanitizes strings and neutralizes false certification claims', () => {
      const rawTitle = 'Official Document <script>alert(1)</script> - WCAG 2.1 AAA Certified';
      const sanitized = service.sanitizeAccessibleString(rawTitle);
      expect(sanitized).toBe('Official Document - Accessibility Enhanced');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('WCAG 2.1 AAA Certified');
    });
  });

  describe('Cybersecurity & Acyclic Structure Validation', () => {
    it('detects and rejects circular references in the PDF structure tree', async () => {
      const doc = await PDFDocument.create();
      const context = doc.context;

      // Create a circular structure: Node A -> Node B -> Node A
      const nodeA = context.obj({ Type: 'StructElem', S: 'Document' }) as PDFDict;
      const nodeARef = context.register(nodeA);

      const nodeB = context.obj({ Type: 'StructElem', S: 'Part', K: context.obj([nodeARef]) }) as PDFDict;
      const nodeBRef = context.register(nodeB);

      nodeA.set(PDFName.of('K'), context.obj([nodeBRef]));

      // Validation must detect the cycle and throw an Error
      expect(() => {
        service.validateAcyclicStructure(nodeARef, context);
      }).toThrow(/Circular reference detected/);
    });

    it('strips non-printable XML/PDF control characters from /Alt and /Title', () => {
      const toxicAlt = 'Diagram\x00with\x08bell\x0Bvertical\x1Ftab';
      const cleanAlt = service.sanitizeAccessibleString(toxicAlt);
      expect(cleanAlt).toBe('Diagramwithbellverticaltab');
      expect(cleanAlt).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    });
  });
});
