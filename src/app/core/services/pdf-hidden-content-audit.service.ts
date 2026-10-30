import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFString,
  PDFHexString,
  rgb,
  StandardFonts
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as pako from 'pako';
import {
  HiddenContentAuditReport,
  HiddenContentCategory,
  HiddenContentCategorySummary,
  HiddenContentFinding,
  RiskLevel
} from '../models/pdf-hidden-content.types';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class PdfHiddenContentAuditService {
  /**
   * Scans a PDF document for hidden, concealed, off-page, or invisible elements.
   */
  async auditDocument(source: File | ArrayBuffer | Uint8Array): Promise<HiddenContentAuditReport> {
    const rawBytes = await this.toUint8Array(source);
    const fileName = source instanceof File ? source.name : 'document.pdf';
    const fileSizeBytes = rawBytes.byteLength;

    const pdfLibDoc = await PDFDocument.load(rawBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pageCount = pdfLibDoc.getPageCount();
    const allFindings: HiddenContentFinding[] = [];

    // 1. Detect Hidden Layers (OCG)
    const ocgFindings = this.detectOcgLayers(pdfLibDoc);
    allFindings.push(...ocgFindings);

    // 2. Detect Embedded Scripts & Attachments
    const scriptAttachmentFindings = this.detectScriptsAndAttachments(pdfLibDoc);
    allFindings.push(...scriptAttachmentFindings);

    // 3. Page-by-page detections: Off-Page Content, Invisible Text, Off-Page Annotations
    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const page = pdfLibDoc.getPage(pageIdx);
      const pageNumber = pageIdx + 1;

      // Extract visible page boundaries (/CropBox or /MediaBox)
      const pageBox = this.getPageBoundingBox(page);

      // (a) Detect Off-Page Annotations
      const annotFindings = this.detectOffPageAnnotations(page, pageIdx, pageNumber, pageBox, pdfLibDoc);
      allFindings.push(...annotFindings);

      // (b) Detect Off-Page Objects and Invisible Text in Content Streams
      const streamFindings = this.inspectPageContentStream(page, pageIdx, pageNumber, pageBox, pdfLibDoc);
      allFindings.push(...streamFindings);
    }

    // Tally metrics
    let highSeverityCount = 0;
    let warningSeverityCount = 0;
    let infoSeverityCount = 0;

    for (const f of allFindings) {
      if (f.severity === 'high') highSeverityCount++;
      else if (f.severity === 'warning') warningSeverityCount++;
      else infoSeverityCount++;
    }

    const totalFindings = allFindings.length;

    // Calculate Risk Level and Score
    let riskLevel: RiskLevel = 'low';
    let riskScore = 0;

    if (highSeverityCount > 0 || totalFindings >= 3) {
      riskLevel = 'high';
      riskScore = Math.min(100, 65 + totalFindings * 8);
    } else if (totalFindings > 0) {
      riskLevel = 'moderate';
      riskScore = Math.min(60, 25 + totalFindings * 15);
    }

    // Group findings by category
    const categories: Record<HiddenContentCategory, HiddenContentCategorySummary> = {
      ocg_layers: {
        category: 'ocg_layers',
        titleKey: 'hiddenAudit.categoryOcg',
        descKey: 'hiddenAudit.categoryOcgDesc',
        icon: 'layers',
        count: allFindings.filter(f => f.category === 'ocg_layers').length,
        findings: allFindings.filter(f => f.category === 'ocg_layers')
      },
      off_page_objects: {
        category: 'off_page_objects',
        titleKey: 'hiddenAudit.categoryOffPage',
        descKey: 'hiddenAudit.categoryOffPageDesc',
        icon: 'expand',
        count: allFindings.filter(f => f.category === 'off_page_objects').length,
        findings: allFindings.filter(f => f.category === 'off_page_objects')
      },
      invisible_text: {
        category: 'invisible_text',
        titleKey: 'hiddenAudit.categoryInvisibleText',
        descKey: 'hiddenAudit.categoryInvisibleTextDesc',
        icon: 'eye-off',
        count: allFindings.filter(f => f.category === 'invisible_text').length,
        findings: allFindings.filter(f => f.category === 'invisible_text')
      },
      off_page_annots: {
        category: 'off_page_annots',
        titleKey: 'hiddenAudit.categoryOffPageAnnots',
        descKey: 'hiddenAudit.categoryOffPageAnnotsDesc',
        icon: 'chatbubble',
        count: allFindings.filter(f => f.category === 'off_page_annots').length,
        findings: allFindings.filter(f => f.category === 'off_page_annots')
      },
      scripts_attachments: {
        category: 'scripts_attachments',
        titleKey: 'hiddenAudit.categoryScriptsAttachments',
        descKey: 'hiddenAudit.categoryScriptsAttachmentsDesc',
        icon: 'attach',
        count: allFindings.filter(f => f.category === 'scripts_attachments').length,
        findings: allFindings.filter(f => f.category === 'scripts_attachments')
      }
    };

    return {
      fileName,
      fileSizeBytes,
      pageCount,
      auditedAt: new Date(),
      totalFindings,
      highSeverityCount,
      warningSeverityCount,
      infoSeverityCount,
      riskLevel,
      riskScore,
      categories,
      allFindings
    };
  }

  /**
   * 1. Detect Hidden Layers (Optional Content Groups - OCG).
   */
  private detectOcgLayers(doc: PDFDocument): HiddenContentFinding[] {
    const findings: HiddenContentFinding[] = [];
    const catalog = doc.catalog;

    if (!catalog.has(PDFName.of('OCProperties'))) {
      return findings;
    }

    const ocPropsRef = catalog.get(PDFName.of('OCProperties'));
    const ocProps = doc.context.lookup(ocPropsRef);
    if (!(ocProps instanceof PDFDict)) return findings;

    // Check OCGs list
    const ocgs = ocProps.lookup(PDFName.of('OCGs'));
    const dDict = ocProps.lookup(PDFName.of('D'));

    let defaultOffRefs: any[] = [];
    let baseStateIsOff = false;

    if (dDict instanceof PDFDict) {
      const baseState = dDict.lookup(PDFName.of('BaseState'));
      if (baseState instanceof PDFName && baseState.asString() === '/OFF') {
        baseStateIsOff = true;
      }

      const offArray = dDict.lookup(PDFName.of('OFF'));
      if (offArray instanceof PDFArray) {
        for (let i = 0; i < offArray.size(); i++) {
          defaultOffRefs.push(offArray.get(i));
        }
      }
    }

    if (ocgs instanceof PDFArray) {
      for (let i = 0; i < ocgs.size(); i++) {
        const ocgRef = ocgs.get(i);
        const ocgDict = doc.context.lookup(ocgRef);

        if (ocgDict instanceof PDFDict) {
          const nameObj = ocgDict.lookup(PDFName.of('Name'));
          const layerName = nameObj instanceof PDFString ? nameObj.asString()
            : (nameObj instanceof PDFHexString ? nameObj.decodeText() : `Layer-${i + 1}`);

          const isExplicitlyOff = defaultOffRefs.includes(ocgRef);
          const isHiddenByDefault = baseStateIsOff || isExplicitlyOff;

          if (isHiddenByDefault) {
            findings.push({
              id: `ocg-hidden-${i + 1}`,
              category: 'ocg_layers',
              pageIndex: 0,
              pageNumber: 1,
              title: `Hidden OCG Layer: "${layerName}"`,
              description: `Optional Content Group layer "${layerName}" is configured with default visibility disabled (/OFF). Content under this layer is hidden from viewers but remains intact in the document stream.`,
              severity: 'warning',
              technicalDetails: { layerName, isExplicitlyOff, baseStateIsOff },
              recommendedTool: {
                id: 'pdf-privacy-sanitizer',
                route: '/features/pdf/privacy-sanitizer',
                labelKey: 'hiddenAudit.cleanWithSanitizer'
              }
            });
          }
        }
      }
    }

    return findings;
  }

  /**
   * 2. Detect Embedded Scripts & Attachments.
   */
  private detectScriptsAndAttachments(doc: PDFDocument): HiddenContentFinding[] {
    const findings: HiddenContentFinding[] = [];
    const catalog = doc.catalog;

    // Check OpenAction
    if (catalog.has(PDFName.of('OpenAction'))) {
      findings.push({
        id: 'script-openaction',
        category: 'scripts_attachments',
        pageIndex: 0,
        pageNumber: 1,
        title: 'Document OpenAction Script/Trigger',
        description: 'Document contains an OpenAction trigger that executes automatically upon opening the PDF in a viewer.',
        severity: 'high',
        recommendedTool: {
          id: 'pdf-privacy-sanitizer',
          route: '/features/pdf/privacy-sanitizer',
          labelKey: 'hiddenAudit.cleanWithSanitizer'
        }
      });
    }

    // Check Additional Actions (/AA)
    if (catalog.has(PDFName.of('AA'))) {
      findings.push({
        id: 'script-aa',
        category: 'scripts_attachments',
        pageIndex: 0,
        pageNumber: 1,
        title: 'Additional Document Actions (/AA)',
        description: 'Automatic JavaScript or system actions are bound to document lifecycle triggers.',
        severity: 'high',
        recommendedTool: {
          id: 'pdf-privacy-sanitizer',
          route: '/features/pdf/privacy-sanitizer',
          labelKey: 'hiddenAudit.cleanWithSanitizer'
        }
      });
    }

    // Check Names tree (/Names -> /EmbeddedFiles & /JavaScript)
    if (catalog.has(PDFName.of('Names'))) {
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        if (names.has(PDFName.of('EmbeddedFiles'))) {
          findings.push({
            id: 'attach-embedded-files',
            category: 'scripts_attachments',
            pageIndex: 0,
            pageNumber: 1,
            title: 'Embedded File Attachments (/EmbeddedFiles)',
            description: 'The document Names tree contains embedded files or binary attachments not directly rendered on document pages.',
            severity: 'warning',
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }
        if (names.has(PDFName.of('JavaScript'))) {
          findings.push({
            id: 'script-names-js',
            category: 'scripts_attachments',
            pageIndex: 0,
            pageNumber: 1,
            title: 'Embedded JavaScript in Names Tree',
            description: 'Custom JavaScript functions or scripts are embedded in the PDF dictionary.',
            severity: 'high',
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }
      }
    }

    // Check Associated Files (/AF)
    if (catalog.has(PDFName.of('AF'))) {
      findings.push({
        id: 'attach-af-files',
        category: 'scripts_attachments',
        pageIndex: 0,
        pageNumber: 1,
        title: 'PDF/A Associated Files (/AF)',
        description: 'Document references external or embedded associated files.',
        severity: 'warning',
        recommendedTool: {
          id: 'pdf-privacy-sanitizer',
          route: '/features/pdf/privacy-sanitizer',
          labelKey: 'hiddenAudit.cleanWithSanitizer'
        }
      });
    }

    // Check Page-level /Annots for FileAttachment annotations
    const pageCount = doc.getPageCount();
    for (let pIdx = 0; pIdx < pageCount; pIdx++) {
      const page = doc.getPage(pIdx);
      if (page.node.has(PDFName.of('Annots'))) {
        const annotsRef = page.node.get(PDFName.of('Annots'));
        const annots = doc.context.lookup(annotsRef);
        if (annots instanceof PDFArray) {
          for (let i = 0; i < annots.size(); i++) {
            const aRef = annots.get(i);
            const aDict = doc.context.lookup(aRef);
            if (aDict instanceof PDFDict && aDict.has(PDFName.of('Subtype'))) {
              const sub = aDict.lookup(PDFName.of('Subtype'));
              if (sub instanceof PDFName && sub.asString() === '/FileAttachment') {
                const fs = aDict.lookup(PDFName.of('FS'));
                let attachedName = 'Embedded File';
                if (fs instanceof PDFDict && fs.has(PDFName.of('F'))) {
                  const fName = fs.lookup(PDFName.of('F'));
                  if (fName instanceof PDFString) {
                    attachedName = fName.asString();
                  } else if (fName instanceof PDFHexString) {
                    attachedName = fName.decodeText();
                  }
                }
                findings.push({
                  id: `attach-annot-p${pIdx + 1}-${i + 1}`,
                  category: 'scripts_attachments',
                  pageIndex: pIdx,
                  pageNumber: pIdx + 1,
                  title: `Embedded File Attachment: "${attachedName}"`,
                  description: `Document page ${pIdx + 1} contains an embedded file attachment annotation ("${attachedName}") concealing a binary payload.`,
                  severity: 'high',
                  technicalDetails: { attachedName, pageNumber: pIdx + 1 },
                  recommendedTool: {
                    id: 'pdf-privacy-sanitizer',
                    route: '/features/pdf/privacy-sanitizer',
                    labelKey: 'hiddenAudit.cleanWithSanitizer'
                  }
                });
              }
            }
          }
        }
      }
    }

    return findings;
  }

  /**
   * 3. Detect Off-Page Annotations.
   */
  private detectOffPageAnnotations(
    page: any,
    pageIdx: number,
    pageNumber: number,
    pageBox: { xMin: number; yMin: number; xMax: number; yMax: number },
    doc: PDFDocument
  ): HiddenContentFinding[] {
    const findings: HiddenContentFinding[] = [];

    if (!page.node.has(PDFName.of('Annots'))) return findings;

    const annotsRef = page.node.get(PDFName.of('Annots'));
    const annots = doc.context.lookup(annotsRef);

    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i++) {
        const annotRef = annots.get(i);
        const annotDict = doc.context.lookup(annotRef);

        if (annotDict instanceof PDFDict && annotDict.has(PDFName.of('Rect'))) {
          const rectObj = annotDict.lookup(PDFName.of('Rect'));
          if (rectObj instanceof PDFArray && rectObj.size() >= 4) {
            const x1 = (rectObj.get(0) as PDFNumber)?.asNumber() || 0;
            const y1 = (rectObj.get(1) as PDFNumber)?.asNumber() || 0;
            const x2 = (rectObj.get(2) as PDFNumber)?.asNumber() || 0;
            const y2 = (rectObj.get(3) as PDFNumber)?.asNumber() || 0;

            const aXMin = Math.min(x1, x2);
            const aXMax = Math.max(x1, x2);
            const aYMin = Math.min(y1, y2);
            const aYMax = Math.max(y1, y2);

            // Check if annotation rect is completely or substantially outside visible page bounds
            const isOffPage =
              aXMax < pageBox.xMin - 2 ||
              aXMin > pageBox.xMax + 2 ||
              aYMax < pageBox.yMin - 2 ||
              aYMin > pageBox.yMax + 2;

            if (isOffPage) {
              const subtype = annotDict.lookup(PDFName.of('Subtype'));
              const typeStr = subtype instanceof PDFName ? subtype.asString().replace('/', '') : 'Annotation';

              findings.push({
                id: `annot-offpage-p${pageNumber}-${i + 1}`,
                category: 'off_page_annots',
                pageIndex: pageIdx,
                pageNumber,
                title: `Off-Page ${typeStr} Annotation`,
                description: `An annotation of type ${typeStr} is positioned at [${Math.round(aXMin)}, ${Math.round(aYMin)}] outside the visible page boundary [${Math.round(pageBox.xMin)}, ${Math.round(pageBox.yMin)}, ${Math.round(pageBox.xMax)}, ${Math.round(pageBox.yMax)}].`,
                severity: 'warning',
                coordinates: {
                  x: Math.round(aXMin),
                  y: Math.round(aYMin),
                  width: Math.round(aXMax - aXMin),
                  height: Math.round(aYMax - aYMin)
                },
                technicalDetails: { type: typeStr, rect: [x1, y1, x2, y2] },
                recommendedTool: {
                  id: 'pdf-privacy-sanitizer',
                  route: '/features/pdf/privacy-sanitizer',
                  labelKey: 'hiddenAudit.cleanWithSanitizer'
                }
              });
            }
          }
        }
      }
    }

    return findings;
  }

  /**
   * 4 & 5. Inspect Content Stream for Off-Page Content & Invisible/Low-Contrast Text.
   */
  private inspectPageContentStream(
    page: any,
    pageIdx: number,
    pageNumber: number,
    pageBox: { xMin: number; yMin: number; xMax: number; yMax: number },
    doc: PDFDocument
  ): HiddenContentFinding[] {
    const findings: HiddenContentFinding[] = [];

    // Gather zero-opacity ExtGState resource names (/ca 0 or /CA 0)
    const zeroOpacityGsNames = new Set<string>();
    if (page.node.has(PDFName.of('Resources'))) {
      const res = doc.context.lookup(page.node.get(PDFName.of('Resources')));
      if (res instanceof PDFDict && res.has(PDFName.of('ExtGState'))) {
        const extGState = doc.context.lookup(res.get(PDFName.of('ExtGState')));
        if (extGState instanceof PDFDict) {
          const entries = extGState.entries();
          for (const [gsName, gsRef] of entries) {
            const gsDict = doc.context.lookup(gsRef);
            if (gsDict instanceof PDFDict) {
              const ca = gsDict.lookup(PDFName.of('ca'));
              const CA = gsDict.lookup(PDFName.of('CA'));
              if (
                (ca instanceof PDFNumber && ca.asNumber() === 0) ||
                (CA instanceof PDFNumber && CA.asNumber() === 0)
              ) {
                zeroOpacityGsNames.add(gsName.asString().replace('/', ''));
              }
            }
          }
        }
      }
    }

    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) return findings;

    const contentsObj = doc.context.lookup(contentsRef);
    const streams: any[] = [];

    if (contentsObj && typeof (contentsObj as any).size === 'function') {
      const size = (contentsObj as any).size();
      for (let i = 0; i < size; i++) {
        streams.push(doc.context.lookup((contentsObj as any).get(i)));
      }
    } else if (contentsObj) {
      streams.push(contentsObj);
    }

    for (let streamIdx = 0; streamIdx < streams.length; streamIdx++) {
      const stm = streams[streamIdx];
      if (!stm || typeof stm.getContents !== 'function') continue;

      let streamBytes: Uint8Array;
      try {
        streamBytes = stm.getContents();
      } catch {
        continue;
      }

      let decompressed: Uint8Array;
      try {
        const inflate = pako.inflate || (pako as any).default?.inflate;
        decompressed = inflate(streamBytes);
      } catch {
        decompressed = streamBytes;
      }

      const streamText = new TextDecoder('latin1').decode(decompressed);

      // Parse BT ... ET blocks for text state and positioning
      const btBlocks = streamText.match(/\bBT\b[\s\S]*?\bET\b/g) || [];

      for (const block of btBlocks) {
        let currentTx = 0;
        let currentTy = 0;
        let currentFontSize = 12;
        let isPureWhite = false;
        let isInvisibleMode = false;
        let isZeroOpacity = false;

        // Check for pure white color in RGB (1 1 1 rg) or Grayscale (1 g) or CMYK (0 0 0 0 k)
        // Ensure not ordinary grey: e.g. 0.85 rg or 0.8 g
        if (
          /(?:^|\s)1(?:\.0+)?\s+1(?:\.0+)?\s+1(?:\.0+)?\s+rg(?:\s|$)/i.test(block) ||
          /(?:^|\s)1(?:\.0+)?\s+g(?:\s|$)/i.test(block) ||
          /(?:^|\s)0(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?\s+k(?:\s|$)/i.test(block)
        ) {
          isPureWhite = true;
        }

        // Check text rendering mode 3 Tr (neither fill nor stroke)
        if (/(?:^|\s)3\s+Tr(?:\s|$)/.test(block)) {
          isInvisibleMode = true;
        }

        // Check zero opacity: inline 0 ca or 0 CA, or referenced ExtGState (inside block or surrounding stream)
        if (
          /(?:^|\s)(?:0(?:\.0+)?\s+ca|0(?:\.0+)?\s+CA|\/ca\s+0(?:\.0+)?|\/CA\s+0(?:\.0+)?)(?:\s|$)/i.test(block) ||
          /(?:^|\s)(?:0(?:\.0+)?\s+ca|0(?:\.0+)?\s+CA|\/ca\s+0(?:\.0+)?|\/CA\s+0(?:\.0+)?)(?:\s|$)/i.test(streamText)
        ) {
          isZeroOpacity = true;
        } else {
          for (const gsName of zeroOpacityGsNames) {
            if (
              new RegExp(`(?:^|\\s)\\/${gsName}\\s+gs(?:\\s|$)`).test(block) ||
              new RegExp(`(?:^|\\s)\\/${gsName}\\s+gs(?:\\s|$)`).test(streamText)
            ) {
              isZeroOpacity = true;
              break;
            }
          }
        }

        // Check font size: /FontName size Tf
        const fontMatch = block.match(/\/([^\s]+)\s+([0-9.]+)\s+Tf/);
        if (fontMatch) {
          currentFontSize = parseFloat(fontMatch[2]);
        }

        // Check text matrix: a b c d tx ty Tm
        const tmMatch = block.match(/([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+Tm/);
        if (tmMatch) {
          currentTx = parseFloat(tmMatch[5]);
          currentTy = parseFloat(tmMatch[6]);
        } else {
          // Check Td or TD: tx ty Td / TD
          const tdMatch = block.match(/([0-9.\-]+)\s+([0-9.\-]+)\s+T[dD]/);
          if (tdMatch) {
            currentTx = parseFloat(tdMatch[1]);
            currentTy = parseFloat(tdMatch[2]);
          }
        }

        // Extract text tokens: (literal) or <hex>
        let extractedSnippet = '';

        const textMatches = Array.from(block.matchAll(/(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)\s*(Tj|'|")/gi));
        for (const tm of textMatches) {
          if (tm[1] !== undefined) {
            extractedSnippet += tm[1];
          } else if (tm[2] !== undefined) {
            extractedSnippet += this.decodeHexString(tm[2]);
          }
        }

        // Check [ ... ] TJ arrays
        const tjArrayMatches = Array.from(block.matchAll(/\[([\s\S]*?)\]\s*TJ/gi));
        for (const tj of tjArrayMatches) {
          const inner = tj[1];
          const items = Array.from(inner.matchAll(/(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)/gi));
          for (const item of items) {
            if (item[1] !== undefined) extractedSnippet += item[1];
            else if (item[2] !== undefined) extractedSnippet += this.decodeHexString(item[2]);
          }
        }

        if (!extractedSnippet.trim()) continue;

        const isEvasiveUrl = /https?:\/\/[^\s]+/i.test(extractedSnippet);

        // 1. Off-Page Check
        const isOffPage =
          currentTx < pageBox.xMin - 10 ||
          currentTx > pageBox.xMax + 10 ||
          currentTy < pageBox.yMin - 10 ||
          currentTy > pageBox.yMax + 10;

        if (isOffPage && !findings.some(f => f.category === 'off_page_objects' && f.snippetText === extractedSnippet)) {
          findings.push({
            id: `offpage-text-p${pageNumber}-${findings.length + 1}`,
            category: 'off_page_objects',
            pageIndex: pageIdx,
            pageNumber,
            title: isEvasiveUrl ? 'Concealed Off-Page Malicious URL' : 'Off-Page Text Element Outside CropBox',
            description: `Text element "${extractedSnippet}" positioned at coordinate (${Math.round(currentTx)}, ${Math.round(currentTy)}) is rendered beyond visible boundaries of Page ${pageNumber}.${isEvasiveUrl ? ' Detected hidden URL payload.' : ''}`,
            severity: 'high',
            coordinates: { x: Math.round(currentTx), y: Math.round(currentTy) },
            snippetText: extractedSnippet,
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }

        // 2. White-on-White Check (Only if pure white, NOT grey)
        if (isPureWhite && !findings.some(f => f.category === 'invisible_text' && f.snippetText === extractedSnippet)) {
          findings.push({
            id: `invis-white-p${pageNumber}-${findings.length + 1}`,
            category: 'invisible_text',
            pageIndex: pageIdx,
            pageNumber,
            title: isEvasiveUrl ? 'Evasive Invisible Malicious URL (White-on-White)' : 'Invisible White-on-White Text',
            description: `Text string "${extractedSnippet}" is rendered in pure white fill color matching default white document background.${isEvasiveUrl ? ' Detected hidden URL payload.' : ''}`,
            severity: 'high',
            snippetText: extractedSnippet,
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }

        // 3. Zero-Opacity Transparency Check (/ca 0)
        if (isZeroOpacity && !findings.some(f => f.category === 'invisible_text' && f.snippetText === extractedSnippet)) {
          findings.push({
            id: `invis-opacity-p${pageNumber}-${findings.length + 1}`,
            category: 'invisible_text',
            pageIndex: pageIdx,
            pageNumber,
            title: isEvasiveUrl ? 'Zero-Opacity Concealed Malicious URL (/ca 0)' : 'Zero-Opacity Invisible Text (/ca 0)',
            description: `Text string "${extractedSnippet}" is rendered with zero opacity (transparent alpha = 0.0), making it completely invisible on screen while searchable and indexable.${isEvasiveUrl ? ' Detected hidden URL payload.' : ''}`,
            severity: 'high',
            snippetText: extractedSnippet,
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }

        // 4. Micro-Font Check (< 0.5pt)
        if (currentFontSize > 0 && currentFontSize < 0.5 && !findings.some(f => f.category === 'invisible_text' && f.snippetText === extractedSnippet)) {
          findings.push({
            id: `invis-micro-p${pageNumber}-${findings.length + 1}`,
            category: 'invisible_text',
            pageIndex: pageIdx,
            pageNumber,
            title: isEvasiveUrl ? `Micro-Font Concealed URL (${currentFontSize}pt)` : `Micro-Font Invisible Text (${currentFontSize}pt)`,
            description: `Text string "${extractedSnippet}" is rendered with font size ${currentFontSize}pt (< 0.5pt), rendering it visually invisible to human readers while extractable by search engines.${isEvasiveUrl ? ' Detected hidden URL payload.' : ''}`,
            severity: 'high',
            snippetText: extractedSnippet,
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }

        // 5. Invisible Rendering Mode Check (3 Tr)
        if (isInvisibleMode && !findings.some(f => f.category === 'invisible_text' && f.snippetText === extractedSnippet)) {
          findings.push({
            id: `invis-mode-p${pageNumber}-${findings.length + 1}`,
            category: 'invisible_text',
            pageIndex: pageIdx,
            pageNumber,
            title: isEvasiveUrl ? 'Invisible Rendering Mode URL (3 Tr)' : 'Invisible Text Rendering Mode (3 Tr)',
            description: `Text string "${extractedSnippet}" is rendered using PDF text rendering mode 3 (Neither Fill Nor Stroke), making it visually transparent.${isEvasiveUrl ? ' Detected hidden URL payload.' : ''}`,
            severity: 'high',
            snippetText: extractedSnippet,
            recommendedTool: {
              id: 'pdf-privacy-sanitizer',
              route: '/features/pdf/privacy-sanitizer',
              labelKey: 'hiddenAudit.cleanWithSanitizer'
            }
          });
        }
      }
    }

    return findings;
  }

  /**
   * Helper to extract visible page bounding box (/CropBox fallback to /MediaBox).
   */
  private getPageBoundingBox(page: any): { xMin: number; yMin: number; xMax: number; yMax: number } {
    let cropBox = page.getCropBox();
    if (!cropBox || (cropBox.width === 0 && cropBox.height === 0)) {
      cropBox = page.getMediaBox();
    }

    return {
      xMin: cropBox.x,
      yMin: cropBox.y,
      xMax: cropBox.x + cropBox.width,
      yMax: cropBox.y + cropBox.height
    };
  }

  /**
   * Generates a forensic PDF Audit Report for export.
   */
  async exportAuditReportPdf(report: HiddenContentAuditReport): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    let y = height - 50;

    // Header banner
    page.drawRectangle({
      x: 40,
      y: y - 45,
      width: width - 80,
      height: 55,
      color: report.riskLevel === 'high' ? rgb(0.9, 0.15, 0.15)
        : (report.riskLevel === 'moderate' ? rgb(0.9, 0.55, 0.1) : rgb(0.1, 0.6, 0.3))
    });

    page.drawText('FORENSIC HIDDEN-CONTENT AUDIT REPORT', {
      x: 55,
      y: y - 20,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText(`Document: ${report.fileName} · Risk Status: ${report.riskLevel.toUpperCase()}`, {
      x: 55,
      y: y - 38,
      size: 10,
      font: fontRegular,
      color: rgb(1, 1, 1)
    });

    y -= 75;

    // Metadata & metrics summary
    page.drawText(`Audited Date: ${report.auditedAt.toLocaleDateString()} ${report.auditedAt.toLocaleTimeString()}`, {
      x: 40,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2)
    });
    y -= 16;

    page.drawText(`Total Findings: ${report.totalFindings} (High: ${report.highSeverityCount}, Warning: ${report.warningSeverityCount}, Info: ${report.infoSeverityCount})`, {
      x: 40,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });
    y -= 25;

    // Categories breakdown
    page.drawText('Category Breakdown:', { x: 40, y, size: 11, font: fontBold });
    y -= 16;

    for (const catKey of Object.keys(report.categories) as HiddenContentCategory[]) {
      const cat = report.categories[catKey];
      page.drawText(`• ${catKey}: ${cat.count} finding(s)`, {
        x: 50,
        y,
        size: 9,
        font: fontRegular,
        color: cat.count > 0 ? rgb(0.8, 0.2, 0.2) : rgb(0.3, 0.5, 0.3)
      });
      y -= 14;
    }

    y -= 15;
    page.drawText('Detailed Findings:', { x: 40, y, size: 11, font: fontBold });
    y -= 16;

    if (report.allFindings.length === 0) {
      page.drawText('Clean document. Zero hidden or concealed content detected.', {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: rgb(0.1, 0.6, 0.2)
      });
    } else {
      for (const finding of report.allFindings.slice(0, 15)) {
        if (y < 60) break;
        page.drawText(`[${finding.severity.toUpperCase()}] P.${finding.pageNumber} — ${finding.title}`, {
          x: 45,
          y,
          size: 9,
          font: fontBold,
          color: finding.severity === 'high' ? rgb(0.85, 0.1, 0.1) : rgb(0.7, 0.4, 0.1)
        });
        y -= 12;

        const cleanDesc = finding.description.length > 90
          ? finding.description.substring(0, 87) + '...'
          : finding.description;

        page.drawText(cleanDesc, {
          x: 55,
          y,
          size: 8,
          font: fontRegular,
          color: rgb(0.3, 0.3, 0.3)
        });
        y -= 16;
      }
    }

    return await doc.save();
  }

  private decodeHexString(hex: string): string {
    const clean = hex.replace(/\s+/g, '');
    let str = '';
    for (let i = 0; i < clean.length; i += 2) {
      str += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
    }
    return str;
  }

  private async toUint8Array(source: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    const buffer = await source.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
