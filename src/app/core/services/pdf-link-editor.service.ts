import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  LinkAuditReport,
  LinkEditPlan,
  LinkWriteResult,
  PdfHyperlink
} from '../models/editor-features.types';
import { PdfEditorDocument, Rect } from '../models/pdf-editor.types';
import { annotationSubtype, pageAnnotations, setAnnotations } from '../utilities/pdf-annotation.util';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

/**
 * K2 — Reading, writing and auditing the links in a document.
 *
 * Two coordinate spaces meet here and the service is the border between
 * them. `PdfHyperlink.rect` is always top-left origin, because that is what
 * the editor's canvas, its overlays and every other Part K feature use. A
 * PDF /Rect is bottom-left origin. Every conversion happens in this file, in
 * `toAnnotRect` and `fromAnnotRect`, and nowhere else — the version of this
 * service that passed `rect.y` straight through put every link it wrote at
 * the wrong end of the page.
 *
 * "Dangling" is the other job. Page operations elsewhere in the app delete,
 * reorder and extract pages, and a jump-to-page link whose target has gone
 * is a link that silently does nothing. They are flagged rather than fixed:
 * which page the author meant is not recoverable.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfLinkEditorService {
  // ════════════════════════════════════════════════════════════════════
  // Reading
  // ════════════════════════════════════════════════════════════════════

  /**
   * Every link already in the file, in editor coordinates.
   *
   * Read through pdf.js because it resolves the destination forms that a raw
   * dictionary read does not: a named destination, a /GoTo action wrapping a
   * destination, and a destination array whose first entry is a page
   * reference rather than an index.
   */
  async extractLinks(doc: PdfEditorDocument): Promise<LinkAuditReport> {
    if (!doc?.arrayBuffer) return this.emptyReport();

    const links: PdfHyperlink[] = [];
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(doc.arrayBuffer.slice(0))
    });

    try {
      const pdf = await loadingTask.promise;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const pageHeight = page.getViewport({ scale: 1 }).height;
        const annotations = await page.getAnnotations();

        let index = -1;
        for (const annotation of annotations as Record<string, unknown>[]) {
          index++;
          if (annotation['subtype'] !== 'Link') continue;

          const rawRect = annotation['rect'] as number[] | undefined;
          if (!rawRect || rawRect.length < 4) continue;

          const rect = this.fromAnnotRect(rawRect, pageHeight);
          const url = annotation['url'] as string | undefined;

          if (url) {
            links.push({
              id: generateId(),
              pageNumber,
              rect,
              type: 'url',
              url,
              label: url,
              origin: 'existing',
              annotIndex: index
            });
            continue;
          }

          const targetPage = await this.resolveDestinationPage(pdf, annotation);
          links.push({
            id: generateId(),
            pageNumber,
            rect,
            type: 'page',
            targetPage,
            isDangling: !targetPage || targetPage < 1 || targetPage > pdf.numPages,
            label: targetPage ? `Page ${targetPage}` : undefined,
            origin: 'existing',
            annotIndex: index
          });
        }
      }
    } catch (error) {
      console.warn('Reading links failed', error);
    } finally {
      try {
        await loadingTask.destroy();
      } catch {
        /* already gone */
      }
    }

    return this.auditLinks(links, doc.pageCount);
  }

  /**
   * Which page a link points at, across the forms a destination can take.
   *
   * `/Dest [ <page ref> /Fit ]`, `/Dest (named)`, and `/A << /S /GoTo /D … >>`
   * all mean the same thing to a reader and look nothing alike in the file.
   * pdf.js normalises the first entry to either a reference object or a page
   * index, and `getPageIndex` turns a reference into a number.
   */
  private async resolveDestinationPage(
    pdf: {
      getPageIndex: (dest: never) => Promise<number>;
      getDestination: (name: string) => Promise<unknown[] | null>;
    },
    annotation: Record<string, unknown>
  ): Promise<number | undefined> {
    let dest = annotation['dest'] as unknown;

    if (typeof dest === 'string') {
      try {
        dest = await pdf.getDestination(dest);
      } catch {
        return undefined;
      }
    }

    if (!Array.isArray(dest) || dest.length === 0) return undefined;

    const first = dest[0];

    if (typeof first === 'number') return first + 1;

    if (first && typeof first === 'object') {
      try {
        return (await pdf.getPageIndex(first as never)) + 1;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /** Re-checks every internal link against the current page count. */
  auditLinks(links: PdfHyperlink[], totalPages: number): LinkAuditReport {
    const audited = links.map(link =>
      link.type === 'page'
        ? {
            ...link,
            isDangling: !link.targetPage || link.targetPage < 1 || link.targetPage > totalPages
          }
        : { ...link, isDangling: false }
    );

    const dangling = audited.filter(link => link.isDangling);

    return {
      totalLinks: audited.length,
      urlLinksCount: audited.filter(link => link.type === 'url').length,
      pageLinksCount: audited.filter(link => link.type === 'page').length,
      danglingLinksCount: dangling.length,
      danglingLinks: dangling,
      links: audited
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Writes /Link annotations into an open document.
   *
   * Kept as its own method because the export pipeline calls it on the
   * document it is already assembling, rather than on bytes.
   */
  async applyLinksToPdf(pdfDoc: PDFDocument, links: PdfHyperlink[]): Promise<void> {
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;

    for (const link of links) {
      const pageIndex = link.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const [x1, y1, x2, y2] = this.toAnnotRect(link.rect, page.getHeight());

      const annot = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: context.obj([x1, y1, x2, y2]),
        /* No visible border. A link that draws a box around itself is not
         * what anyone placing one over existing text wants. */
        Border: context.obj([0, 0, 0]),
        F: PDFNumber.of(4)
      });

      if (link.type === 'url' && link.url) {
        annot.set(
          PDFName.of('A'),
          context.obj({
            Type: PDFName.of('Action'),
            S: PDFName.of('URI'),
            URI: PDFString.of(link.url)
          })
        );
      } else if (link.type === 'page' && link.targetPage) {
        const targetIndex = link.targetPage - 1;
        /*
         * A dangling target is written as a link with no destination rather
         * than pointed at some other page. Clicking it does nothing, which
         * is honest; silently retargeting it would not be.
         */
        if (targetIndex >= 0 && targetIndex < pages.length) {
          annot.set(
            PDFName.of('Dest'),
            context.obj([pages[targetIndex].ref, PDFName.of('Fit')])
          );
        }
      }

      const ref = context.register(annot);
      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) {
        annots.push(ref);
      } else {
        page.node.set(PDFName.of('Annots'), context.obj([ref]));
      }
    }
  }

  /**
   * Applies a plan — links to remove, links to add — to a file.
   *
   * Removals run first and are matched by the /Annots index the read
   * reported, so adding a link and deleting an existing one in the same pass
   * cannot make the deletion hit the wrong entry.
   */
  async applyLinkPlan(pdfBytes: Uint8Array, plan: LinkEditPlan): Promise<LinkWriteResult> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    const removalsByPage = new Map<number, Set<number>>();
    for (const link of plan.remove) {
      if (link.annotIndex === undefined) continue;
      const set = removalsByPage.get(link.pageNumber) || new Set<number>();
      set.add(link.annotIndex);
      removalsByPage.set(link.pageNumber, set);
    }

    let removed = 0;

    for (const [pageNumber, indices] of removalsByPage) {
      const pageIndex = pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const annots = pageAnnotations(pdfDoc, page);
      const kept: PDFRef[] = [];

      for (const entry of annots) {
        const isTarget =
          indices.has(entry.index) && annotationSubtype(entry.dict) === '/Link';
        if (isTarget) {
          removed++;
          continue;
        }
        kept.push(entry.ref);
      }

      setAnnotations(pdfDoc, page, kept);
    }

    await this.applyLinksToPdf(pdfDoc, plan.add);

    return {
      pdfBytes: await pdfDoc.save({ useObjectStreams: false }),
      added: plan.add.length,
      removed
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Coordinates
  // ════════════════════════════════════════════════════════════════════

  /** Editor rect (top-left origin) to a PDF /Rect (bottom-left origin). */
  private toAnnotRect(rect: Rect, pageHeight: number): [number, number, number, number] {
    const bottom = pageHeight - rect.y - rect.height;
    return [rect.x, bottom, rect.x + rect.width, bottom + rect.height];
  }

  /** PDF /Rect back to an editor rect, normalising the corner order. */
  private fromAnnotRect(raw: number[], pageHeight: number): Rect {
    const x1 = Math.min(raw[0], raw[2]);
    const x2 = Math.max(raw[0], raw[2]);
    const y1 = Math.min(raw[1], raw[3]);
    const y2 = Math.max(raw[1], raw[3]);

    return {
      x: x1,
      y: pageHeight - y2,
      width: x2 - x1,
      height: y2 - y1
    };
  }

  private emptyReport(): LinkAuditReport {
    return {
      totalLinks: 0,
      urlLinksCount: 0,
      pageLinksCount: 0,
      danglingLinksCount: 0,
      danglingLinks: [],
      links: []
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Validation
  // ════════════════════════════════════════════════════════════════════

  /**
   * Normalises what someone typed into a link target.
   *
   * `example.com` becomes `https://example.com`, because a /URI action with
   * no scheme is not a URL and most viewers refuse it. Anything carrying a
   * `javascript:` or `data:` scheme is refused outright: a PDF that runs
   * script on open is not something this app writes.
   */
  normalizeUrl(input: string): { url: string; error?: 'empty' | 'scheme' } {
    const trimmed = (input || '').trim();
    if (trimmed.length === 0) return { url: '', error: 'empty' };

    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();

    if (scheme) {
      const allowed = ['http', 'https', 'mailto', 'tel'];
      if (!allowed.includes(scheme)) return { url: trimmed, error: 'scheme' };
      return { url: trimmed };
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { url: `mailto:${trimmed}` };

    return { url: `https://${trimmed}` };
  }
}
