import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFNumber
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfHyperlink,
  LinkAuditReport
} from '../models/editor-features.types';
import { PdfEditorDocument, Rect } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfLinkEditorService {
  constructor() {}

  /**
   * Scans a PDF document using PDF.js and returns all existing links,
   * flagging any dangling internal links whose target page no longer exists.
   */
  async extractLinks(doc: PdfEditorDocument): Promise<LinkAuditReport> {
    if (!doc || !doc.arrayBuffer) {
      return {
        totalLinks: 0,
        urlLinksCount: 0,
        pageLinksCount: 0,
        danglingLinksCount: 0,
        danglingLinks: [],
        links: []
      };
    }

    const links: PdfHyperlink[] = [];
    const totalPages = doc.pageCount;

    try {
      const pdfjsDoc = await pdfjsLib.getDocument({
        data: new Uint8Array(doc.arrayBuffer.slice(0))
      } as any).promise;

      for (let pNum = 1; pNum <= totalPages; pNum++) {
        const page = await pdfjsDoc.getPage(pNum);
        const annotations = await page.getAnnotations();

        for (const annot of annotations) {
          if (annot.subtype === 'Link') {
            const rect: Rect = {
              x: annot.rect[0],
              y: annot.rect[1],
              width: annot.rect[2] - annot.rect[0],
              height: annot.rect[3] - annot.rect[1]
            };

            if (annot.url) {
              links.push({
                id: generateId(),
                pageNumber: pNum,
                rect,
                type: 'url',
                url: annot.url,
                label: annot.url
              });
            } else if (annot.dest) {
              // Internal link destination
              let targetPage: number | undefined;
              if (Array.isArray(annot.dest) && typeof annot.dest[0] === 'object' && annot.dest[0]?.num !== undefined) {
                targetPage = annot.dest[0].num;
              } else if (typeof annot.dest === 'number') {
                targetPage = annot.dest;
              } else if (typeof annot.dest === 'string') {
                // Named destination
                try {
                  const destIndex = await pdfjsDoc.getPageIndex(annot.dest);
                  targetPage = destIndex + 1;
                } catch (e) {
                  targetPage = undefined;
                }
              }

              const isDangling = targetPage === undefined || targetPage < 1 || targetPage > totalPages;
              links.push({
                id: generateId(),
                pageNumber: pNum,
                rect,
                type: 'page',
                targetPage,
                isDangling,
                label: targetPage ? `Page ${targetPage}` : 'Unresolved Page'
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error extracting links with PDF.js', err);
    }

    const urlCount = links.filter(l => l.type === 'url').length;
    const pageCount = links.filter(l => l.type === 'page').length;
    const dangling = links.filter(l => l.isDangling);

    return {
      totalLinks: links.length,
      urlLinksCount: urlCount,
      pageLinksCount: pageCount,
      danglingLinksCount: dangling.length,
      danglingLinks: dangling,
      links
    };
  }

  /**
   * Validates internal links against current document total pages
   */
  auditLinks(links: PdfHyperlink[], totalPages: number): LinkAuditReport {
    const audited = links.map(link => {
      if (link.type === 'page') {
        const isDangling = !link.targetPage || link.targetPage < 1 || link.targetPage > totalPages;
        return { ...link, isDangling };
      }
      return link;
    });

    const dangling = audited.filter(l => l.isDangling);
    return {
      totalLinks: audited.length,
      urlLinksCount: audited.filter(l => l.type === 'url').length,
      pageLinksCount: audited.filter(l => l.type === 'page').length,
      danglingLinksCount: dangling.length,
      danglingLinks: dangling,
      links: audited
    };
  }

  /**
   * Adds or updates a hyperlink in the PDF document via pdf-lib
   * Creates standard PDF /Link annotation with /Rect and /A or /Dest
   */
  async applyLinksToPdf(
    pdfDoc: PDFDocument,
    links: PdfHyperlink[]
  ): Promise<void> {
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;

    for (const link of links) {
      const pageIndex = link.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const pageHeight = page.getHeight();

      // Convert from canvas coordinates (top-left) to PDF points (bottom-left) if needed
      const pdfY = link.rect.y;

      // Build Link Annotation dictionary
      const linkAnnot = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [
          link.rect.x,
          pdfY,
          link.rect.x + link.rect.width,
          pdfY + link.rect.height
        ],
        Border: [0, 0, 0] // Invisible border by default
      });

      if (link.type === 'url' && link.url) {
        // External URI action: << /S /URI /URI (url) >>
        const actionDict = context.obj({
          Type: PDFName.of('Action'),
          S: PDFName.of('URI'),
          URI: PDFString.of(link.url)
        });
        linkAnnot.set(PDFName.of('A'), actionDict);
      } else if (link.type === 'page' && link.targetPage) {
        const targetIdx = link.targetPage - 1;
        if (targetIdx >= 0 && targetIdx < pages.length) {
          const targetPage = pages[targetIdx];
          // /Dest [ targetPageRef /Fit ]
          const destArray = context.obj([targetPage.ref, PDFName.of('Fit')]);
          linkAnnot.set(PDFName.of('Dest'), destArray);
        }
      }

      // Add annotation to page's /Annots array
      const linkAnnotRef = context.register(linkAnnot);
      let annots = page.node.lookup(PDFName.of('Annots'));
      if (!annots) {
        const newAnnots = context.obj([linkAnnotRef]);
        page.node.set(PDFName.of('Annots'), newAnnots);
      } else if (annots instanceof PDFArray) {
        annots.push(linkAnnotRef);
      }
    }
  }
}
