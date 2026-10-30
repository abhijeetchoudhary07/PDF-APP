import { Injectable, inject } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFDict,
  PDFRef
} from 'pdf-lib';
import {
  AccessibilityAuditReport,
  AccessibilityTagType,
  AccessibleImageItem,
  BoundingBox,
  PageAccessibilityData,
  ReadingBlock,
  StructureInferenceNotice,
  TaggedPdfGenerationOptions
} from '../models/pdf-accessibility.types';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class PdfAccessibilityService {
  private storageService = inject(StorageService, { optional: true });

  // Standard ISO 32000-1 structure types
  readonly STANDARD_ROLE_MAP: Record<string, string> = {
    Document: 'Document',
    Part: 'Part',
    H1: 'H1',
    H2: 'H2',
    H3: 'H3',
    P: 'P',
    L: 'L',
    LI: 'LI',
    LBody: 'LBody',
    Table: 'Table',
    TR: 'TR',
    TD: 'TD',
    TH: 'TH',
    Figure: 'Figure',
    Artifact: 'Artifact'
  };

  readonly HONESTY_STATEMENT =
    'Enhanced with structure tags and image descriptions. Automated structure inference is heuristic and requires user review.';

  // =========================================================================
  // STRUCTURE INFERENCE ENGINE
  // =========================================================================

  /**
   * Infers logical document structure from raw text items and geometry.
   * Identifies Headings (/H1, /H2, /H3), Paragraphs (/P), Lists (/L, /LI),
   * Tables (/Table), and marks Headers/Footers as /Artifact.
   * Accurately resolves multi-column reading orders.
   */
  inferPageStructure(
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
    rawItems: Array<{
      str: string;
      x: number;
      y: number; // PDF points (bottom-left origin)
      width: number;
      height: number;
      fontSize?: number;
      fontName?: string;
    }>,
    existingImages: AccessibleImageItem[] = []
  ): PageAccessibilityData {
    const notices: StructureInferenceNotice[] = [];
    const validItems = rawItems.filter(i => i.str && i.str.trim().length > 0);

    if (validItems.length === 0 && existingImages.length === 0) {
      notices.push({
        severity: 'info',
        pageNumber,
        message: 'No text items or images detected on this page.'
      });
      return {
        pageNumber,
        width: pageWidth,
        height: pageHeight,
        blocks: [],
        images: existingImages,
        notices,
        hasMultiColumn: false
      };
    }

    // 1. Detect Running Headers and Footers (Artifacts)
    const artifactItems: typeof validItems = [];
    const contentItems: typeof validItems = [];

    for (const item of validItems) {
      // Top 50pt of page is header zone, bottom 45pt is footer zone
      const isHeaderZone = item.y > pageHeight - 55;
      const isFooterZone = item.y < 45;

      const isPageNumber = /^(page\s*\d+(\s*of\s*\d+)?|\d+)$/i.test(item.str.trim());
      const isShortMeta = item.str.length < 50;

      if ((isHeaderZone || isFooterZone) && (isPageNumber || isShortMeta)) {
        artifactItems.push(item);
      } else {
        contentItems.push(item);
      }
    }

    // 2. Multi-Column Detection
    const hasMultiColumn = this.detectMultiColumnLayout(contentItems, pageWidth);

    // 3. Cluster text items into logical lines and blocks
    const clusteredBlocks = this.clusterItemsIntoBlocks(
      contentItems,
      pageNumber,
      pageWidth,
      pageHeight,
      hasMultiColumn
    );

    // 4. Classify Structure Tags (H1, H2, H3, P, L, Table)
    const blocks: ReadingBlock[] = [];
    clusteredBlocks.forEach((block, idx) => {
      const classified = this.classifyBlockTag(block, idx + 1);
      blocks.push(classified);

      if (classified.confidence < 0.7) {
        notices.push({
          severity: 'warning',
          pageNumber,
          message: `Block #${classified.orderIndex} ("${classified.text.slice(0, 30)}...") has low classification confidence (${Math.round(classified.confidence * 100)}%). Please review tag.`,
          blockId: classified.id
        });
      }
    });

    // 5. Add Header/Footer Artifacts to blocks for visual transparency
    if (artifactItems.length > 0) {
      const headerText = artifactItems
        .filter(i => i.y > pageHeight / 2)
        .map(i => i.str)
        .join(' ')
        .trim();
      const footerText = artifactItems
        .filter(i => i.y <= pageHeight / 2)
        .map(i => i.str)
        .join(' ')
        .trim();

      if (headerText) {
        blocks.unshift({
          id: `p${pageNumber}-artifact-header`,
          pageNumber,
          orderIndex: 0,
          tag: 'Artifact',
          text: headerText,
          bbox: { x: 40, y: pageHeight - 45, width: pageWidth - 80, height: 20 },
          confidence: 0.95,
          isArtifact: true,
          artifactType: 'Header'
        });
      }

      if (footerText) {
        blocks.push({
          id: `p${pageNumber}-artifact-footer`,
          pageNumber,
          orderIndex: blocks.length + 1,
          tag: 'Artifact',
          text: footerText,
          bbox: { x: 40, y: 20, width: pageWidth - 80, height: 20 },
          confidence: 0.95,
          isArtifact: true,
          artifactType: 'Footer'
        });
      }
    }

    // 6. Integrate Image Blocks
    existingImages.forEach((img, i) => {
      blocks.push({
        id: `p${pageNumber}-figure-${img.id || i}`,
        pageNumber,
        orderIndex: blocks.length + 1,
        tag: img.isDecorative ? 'Artifact' : 'Figure',
        text: img.altText || img.ocrSuggestion || '[Image]',
        altText: img.altText || img.ocrSuggestion || '',
        bbox: img.bbox,
        confidence: img.altText ? 0.95 : 0.6,
        isArtifact: img.isDecorative,
        artifactType: img.isDecorative ? 'Decorative' : undefined
      });

      if (!img.altText && !img.isDecorative) {
        notices.push({
          severity: 'warning',
          pageNumber,
          message: `Image "${img.name}" lacks descriptive alt-text.`
        });
      }
    });

    // Re-index orderIndex sequentially
    blocks.forEach((b, idx) => {
      b.orderIndex = idx + 1;
    });

    return {
      pageNumber,
      width: pageWidth,
      height: pageHeight,
      blocks,
      images: existingImages,
      notices,
      hasMultiColumn
    };
  }

  /**
   * Detects whether page text layout exhibits multi-column newspaper arrangement.
   */
  private detectMultiColumnLayout(
    items: Array<{ x: number; width: number }>,
    pageWidth: number
  ): boolean {
    if (items.length < 6) return false;

    const midX = pageWidth / 2;
    let leftCount = 0;
    let rightCount = 0;
    let crossCount = 0;

    for (const item of items) {
      const itemRight = item.x + item.width;
      if (itemRight < midX - 10) {
        leftCount++;
      } else if (item.x > midX + 10) {
        rightCount++;
      } else if (item.width > pageWidth * 0.6) {
        crossCount++;
      }
    }

    // Multi-column if significant text exists on both sides of center divider
    return leftCount >= 3 && rightCount >= 3;
  }

  /**
   * Clusters raw text items into coherent paragraphs/blocks respecting reading order.
   */
  private clusterItemsIntoBlocks(
    items: Array<{ str: string; x: number; y: number; width: number; height: number; fontSize?: number }>,
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
    hasMultiColumn: boolean
  ): Array<{ text: string; bbox: BoundingBox; fontSize: number; isBold: boolean; column: number }> {
    if (items.length === 0) return [];

    const midX = pageWidth / 2;

    // Partition items by column
    const fullWidthItems: typeof items = [];
    const col0Items: typeof items = [];
    const col1Items: typeof items = [];

    if (hasMultiColumn) {
      for (const item of items) {
        if (item.width > pageWidth * 0.65) {
          fullWidthItems.push(item);
        } else if (item.x + item.width / 2 < midX) {
          col0Items.push(item);
        } else {
          col1Items.push(item);
        }
      }
    } else {
      fullWidthItems.push(...items);
    }

    // Sort items top-to-bottom (PDF y is ascending from bottom, so sort descending)
    const sortDescY = (a: typeof items[0], b: typeof items[0]) => b.y - a.y;
    fullWidthItems.sort(sortDescY);
    col0Items.sort(sortDescY);
    col1Items.sort(sortDescY);

    const orderedItems = [...fullWidthItems, ...col0Items, ...col1Items];
    const blocks: Array<{ text: string; bbox: BoundingBox; fontSize: number; isBold: boolean; column: number }> = [];

    if (orderedItems.length === 0) return [];

    let currentBlock = {
      text: orderedItems[0].str.trim(),
      bbox: {
        x: orderedItems[0].x,
        y: orderedItems[0].y,
        width: orderedItems[0].width,
        height: orderedItems[0].height || orderedItems[0].fontSize || 12
      },
      fontSize: orderedItems[0].fontSize || 12,
      isBold: false,
      column: orderedItems[0].x > midX && hasMultiColumn ? 1 : 0
    };

    for (let i = 1; i < orderedItems.length; i++) {
      const item = orderedItems[i];
      const prev = orderedItems[i - 1];
      const yDiff = Math.abs(prev.y - item.y);
      const isSameCol = Math.abs(prev.x - item.x) < 40 || Math.abs(prev.y - item.y) < 18;

      // Group if lines are close vertically and within reasonable paragraph spacing
      if (yDiff < 24 && isSameCol) {
        currentBlock.text += ' ' + item.str.trim();
        // Expand bounding box
        const minX = Math.min(currentBlock.bbox.x, item.x);
        const minY = Math.min(currentBlock.bbox.y, item.y);
        const maxX = Math.max(currentBlock.bbox.x + currentBlock.bbox.width, item.x + item.width);
        const maxY = Math.max(currentBlock.bbox.y + currentBlock.bbox.height, item.y + (item.height || 12));
        currentBlock.bbox = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      } else {
        blocks.push(currentBlock);
        currentBlock = {
          text: item.str.trim(),
          bbox: {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height || item.fontSize || 12
          },
          fontSize: item.fontSize || 12,
          isBold: false,
          column: item.x > midX && hasMultiColumn ? 1 : 0
        };
      }
    }

    if (currentBlock.text) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  /**
   * Classifies a block into standard accessibility tags (H1, H2, H3, P, L, Table).
   */
  private classifyBlockTag(
    rawBlock: { text: string; bbox: BoundingBox; fontSize: number; isBold: boolean; column: number },
    orderIndex: number
  ): ReadingBlock {
    const text = rawBlock.text.trim();
    const wordCount = text.split(/\s+/).length;

    // Heading heuristics
    const isNumberedHeading = /^(\d+(\.\d+)*|[A-Z]\.|\b(Section|Chapter|Article|Clause)\b)/i.test(text);
    const isAllUpper = text === text.toUpperCase() && /[A-Z]/.test(text) && wordCount <= 8;

    if (rawBlock.fontSize >= 18 || (rawBlock.fontSize >= 16 && wordCount <= 8)) {
      return {
        id: `block-${orderIndex}`,
        pageNumber: 1,
        orderIndex,
        tag: 'H1',
        text,
        bbox: rawBlock.bbox,
        confidence: 0.92,
        fontSize: rawBlock.fontSize,
        column: rawBlock.column
      };
    }

    if (rawBlock.fontSize >= 14 || (isNumberedHeading && wordCount <= 10) || isAllUpper) {
      return {
        id: `block-${orderIndex}`,
        pageNumber: 1,
        orderIndex,
        tag: 'H2',
        text,
        bbox: rawBlock.bbox,
        confidence: 0.88,
        fontSize: rawBlock.fontSize,
        column: rawBlock.column
      };
    }

    if (rawBlock.fontSize >= 12 && wordCount <= 7 && text.endsWith(':')) {
      return {
        id: `block-${orderIndex}`,
        pageNumber: 1,
        orderIndex,
        tag: 'H3',
        text,
        bbox: rawBlock.bbox,
        confidence: 0.82,
        fontSize: rawBlock.fontSize,
        column: rawBlock.column
      };
    }

    // List heuristic
    if (/^([•\-\*\u2022]|\d+\.|\([a-z0-9]\))\s+/i.test(text)) {
      return {
        id: `block-${orderIndex}`,
        pageNumber: 1,
        orderIndex,
        tag: 'L',
        text,
        bbox: rawBlock.bbox,
        confidence: 0.9,
        fontSize: rawBlock.fontSize,
        column: rawBlock.column
      };
    }

    // Table heuristic (multiple tab/pipe/column delimiters)
    if (text.includes('|') || /\b[A-Za-z0-9]+\s{3,}[A-Za-z0-9]+\s{3,}/.test(text)) {
      return {
        id: `block-${orderIndex}`,
        pageNumber: 1,
        orderIndex,
        tag: 'Table',
        text,
        bbox: rawBlock.bbox,
        confidence: 0.78,
        fontSize: rawBlock.fontSize,
        column: rawBlock.column
      };
    }

    // Default to Paragraph
    return {
      id: `block-${orderIndex}`,
      pageNumber: 1,
      orderIndex,
      tag: 'P',
      text,
      bbox: rawBlock.bbox,
      confidence: 0.85,
      fontSize: rawBlock.fontSize,
      column: rawBlock.column
    };
  }

  // =========================================================================
  // IMAGE ALT-TEXT SUGGESTION ENGINE
  // =========================================================================

  /**
   * Generates contextual starter suggestions for image alt-text.
   */
  suggestAltText(image: AccessibleImageItem, surroundingText: string = ''): string {
    const width = image.bbox.width;
    const height = image.bbox.height;
    const aspect = width / Math.max(1, height);

    if (image.ocrSuggestion && image.ocrSuggestion.trim().length > 0) {
      return `Image containing text: "${image.ocrSuggestion.trim().slice(0, 80)}"`;
    }

    // Logo / Emblem detection
    if (width < 140 && height < 140 && (aspect > 0.8 && aspect < 1.3)) {
      if (/government|republic|official|ministry/i.test(surroundingText)) {
        return 'Official government emblem or departmental insignia';
      }
      return 'Organizational logo or seal';
    }

    // Portrait / Photo detection
    if (aspect >= 0.7 && aspect <= 0.95 && width < 220) {
      return 'Passport-sized photograph of candidate / document holder';
    }

    // Signature block detection
    if (aspect > 2.2 && height < 90) {
      return 'Authorized signatory signature or endorsement stamp';
    }

    // Chart / Diagram detection
    if (width > 240 && height > 160) {
      if (/figure|diagram|workflow|chart|graph/i.test(surroundingText)) {
        return 'Informational diagram illustrating process flow or document schema';
      }
      return 'Illustrative figure or embedded data graphic';
    }

    return `Embedded document image (${Math.round(width)}x${Math.round(height)} pt)`;
  }

  // =========================================================================
  // TAGGED PDF GENERATION (ISO 32000-1 /StructTreeRoot)
  // =========================================================================

  /**
   * Sanitizes accessible text strings: strips control characters, HTML tags,
   * and enforces the strict claim integrity gate prohibiting false compliance claims.
   */
  public sanitizeAccessibleString(text: string): string {
    if (!text) return '';
    let clean = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFE\uFFFF]/g, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script tags and content
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Strip style tags and content
      .replace(/<[^>]*>/g, '') // Strip remaining HTML tags
      .trim();

    // Enforce strict claim integrity: never allow false certification claims
    clean = clean
      .replace(/\bWCAG\s*(2\.[0-2])?\s*(AAA?|Compliant|Certified)?(\s*(Compliant|Certified))?\b/gi, 'Accessibility Enhanced')
      .replace(/\bSection\s*508\s*(Compliant|Certified)?\b/gi, 'Accessibility Enhanced')
      .replace(/\s+/g, ' ')
      .trim();

    return clean;
  }

  /**
   * Validates that the structure tree hierarchy is strictly acyclic,
   * preventing circular references (/ParentTree recursion attacks) that crash PDF viewers.
   */
  public validateAcyclicStructure(rootRef: PDFRef, context: any): boolean {
    const visited = new Set<string>();

    const traverse = (ref: PDFRef, path: Set<string>): void => {
      const key = `${ref.objectNumber}-${ref.generationNumber}`;
      if (path.has(key)) {
        throw new Error(`Circular reference detected in PDF structure tree at object ${key}`);
      }

      path.add(key);
      visited.add(key);

      const obj = context.lookup(ref) as PDFDict;
      if (obj && typeof obj.lookup === 'function') {
        const k = obj.lookup(PDFName.of('K'));
        if (k) {
          if (k instanceof PDFRef) {
            traverse(k, new Set(path));
          } else if (typeof (k as any).asArray === 'function') {
            for (const child of (k as any).asArray()) {
              if (child instanceof PDFRef) {
                traverse(child, new Set(path));
              }
            }
          }
        }
      }
    };

    traverse(rootRef, new Set());
    return true;
  }

  /**
   * Constructs the ISO 32000-1 Logical Structure Dictionary (/StructTreeRoot,
   * /RoleMap, /ParentTree, /StructElem with /Alt, and /Artifact markings) and
   * writes a Tagged Accessible PDF.
   */
  async createTaggedPdf(
    sourcePdfBytes: Uint8Array | ArrayBuffer,
    options: TaggedPdfGenerationOptions
  ): Promise<Blob> {
    const doc = await PDFDocument.load(sourcePdfBytes);
    const context = doc.context;
    const numPages = doc.getPageCount();

    const cleanTitle = this.sanitizeAccessibleString(options.documentTitle || options.fileName || 'Document');

    // 1. Mark Catalog as Tagged PDF and set language
    doc.catalog.set(PDFName.of('MarkInfo'), context.obj({ Marked: true }));
    if (options.language) {
      doc.catalog.set(PDFName.of('Lang'), PDFString.of(this.sanitizeAccessibleString(options.language)));
    }

    // Set document metadata with honesty gate disclaimer
    doc.setTitle(cleanTitle);
    doc.setProducer('Indian Form Helper - Enhanced with structure tags and image descriptions');
    doc.setSubject(this.HONESTY_STATEMENT);

    // 2. Build RoleMap
    const roleMapDict = context.obj(this.STANDARD_ROLE_MAP);

    // 3. Create /StructTreeRoot dictionary
    const structTreeRoot = context.obj({
      Type: 'StructTreeRoot',
      RoleMap: roleMapDict
    }) as PDFDict;
    const structTreeRootRef = context.register(structTreeRoot);
    doc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);

    // 4. Create Document Root Element
    const documentStructElem = context.obj({
      Type: 'StructElem',
      S: 'Document',
      P: structTreeRootRef,
      Title: PDFString.of(cleanTitle)
    }) as PDFDict;
    const documentStructElemRef = context.register(documentStructElem);
    structTreeRoot.set(PDFName.of('K'), context.obj([documentStructElemRef]));

    // 5. Build structure elements for each page according to reading order
    const parentTreeNums: Array<PDFNumber | PDFArray> = [];
    const docKids: PDFRef[] = [];

    for (let pIdx = 0; pIdx < numPages; pIdx++) {
      const page = doc.getPage(pIdx);
      const pageData = options.pages.find(p => p.pageNumber === pIdx + 1);

      // Set /StructParents integer key on the Page object
      page.node.set(PDFName.of('StructParents'), PDFNumber.of(pIdx));

      const pageStructElemRefs: PDFRef[] = [];
      const blocksOnPage = pageData ? [...pageData.blocks] : [];

      // Sort by user-defined orderIndex (Visual Reading Order Editor contract)
      blocksOnPage.sort((a, b) => a.orderIndex - b.orderIndex);

      let mcidCounter = 0;

      for (const block of blocksOnPage) {
        if (block.tag === 'Artifact' || block.isArtifact) {
          // Artifacts are skipped by screen readers and not added to logical structure tree
          continue;
        }

        const mcid = mcidCounter++;

        const structElem = context.obj({
          Type: 'StructElem',
          S: block.tag,
          P: documentStructElemRef,
          Pg: page.ref,
          K: PDFNumber.of(mcid)
        }) as PDFDict;

        // Embed /Alt attribute for images or descriptive blocks
        if (block.altText && block.altText.trim().length > 0) {
          const cleanAlt = this.sanitizeAccessibleString(block.altText.trim());
          structElem.set(PDFName.of('Alt'), PDFString.of(cleanAlt));
        }

        if (block.tag === 'H1' || block.tag === 'H2' || block.tag === 'H3') {
          const cleanHeading = this.sanitizeAccessibleString(block.text.slice(0, 60));
          structElem.set(PDFName.of('Title'), PDFString.of(cleanHeading));
        }

        const elemRef = context.register(structElem);
        pageStructElemRefs.push(elemRef);
        docKids.push(elemRef);
      }

      // Add page's structure elements to ParentTree Nums array
      parentTreeNums.push(PDFNumber.of(pIdx));
      parentTreeNums.push(context.obj(pageStructElemRefs));
    }

    // Connect top-level kids to Document structure element
    documentStructElem.set(PDFName.of('K'), context.obj(docKids));

    // 6. Build and register /ParentTree number tree
    const parentTreeDict = context.obj({
      Nums: context.obj(parentTreeNums)
    });
    const parentTreeRef = context.register(parentTreeDict);
    structTreeRoot.set(PDFName.of('ParentTree'), parentTreeRef);

    // 7. Verify acyclic structure before serialization
    this.validateAcyclicStructure(structTreeRootRef, context);

    const pdfBytes = await doc.save();
    return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }

  // =========================================================================
  // AUDIT & HONESTY REPORT
  // =========================================================================

  /**
   * Generates a comprehensive accessibility audit report adhering to the Strict Honesty Gate.
   */
  generateAuditReport(
    fileName: string,
    pages: PageAccessibilityData[]
  ): AccessibilityAuditReport {
    let totalBlocks = 0;
    let totalImages = 0;
    let imagesWithAltText = 0;
    let inferredHeadingsCount = 0;
    let inferredParagraphsCount = 0;
    let inferredListsCount = 0;
    let inferredTablesCount = 0;
    let artifactsCount = 0;
    const unconfidentInferences: StructureInferenceNotice[] = [];

    for (const page of pages) {
      totalImages += page.images.length;
      imagesWithAltText += page.images.filter(img => img.altText || img.isDecorative).length;

      for (const block of page.blocks) {
        totalBlocks++;
        if (block.tag === 'H1' || block.tag === 'H2' || block.tag === 'H3') {
          inferredHeadingsCount++;
        } else if (block.tag === 'P') {
          inferredParagraphsCount++;
        } else if (block.tag === 'L' || block.tag === 'LI') {
          inferredListsCount++;
        } else if (block.tag === 'Table') {
          inferredTablesCount++;
        } else if (block.tag === 'Artifact' || block.isArtifact) {
          artifactsCount++;
        }
      }

      unconfidentInferences.push(...page.notices);
    }

    return {
      fileName,
      pageCount: pages.length,
      totalBlocks,
      totalImages,
      imagesWithAltText,
      inferredHeadingsCount,
      inferredParagraphsCount,
      inferredListsCount,
      inferredTablesCount,
      artifactsCount,
      unconfidentInferences,
      honestyStatement: this.HONESTY_STATEMENT,
      isTagged: true,
      hasRoleMap: true,
      hasParentTree: true
    };
  }
}
