import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRef,
  rgb
} from 'pdf-lib';
import {
  FlattenAnnotationOptions,
  OverlayExportResult
} from '../models/editor-features.types';
import { PdfEditorDocument, PdfEditorPage } from '../models/pdf-editor.types';

@Injectable({
  providedIn: 'root'
})
export class PdfAnnotationFlattenService {
  constructor() {}

  /**
   * Flattens or strips non-form annotations from the PDF while strictly preserving
   * all interactive form fields (AcroForm Widgets).
   */
  async flattenAnnotationsOnly(
    pdfBytes: Uint8Array,
    options: FlattenAnnotationOptions = { keepFormFieldsInteractive: true }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const annots = page.node.Annots();

      if (!annots || !(annots instanceof PDFArray)) {
        continue;
      }

      const keptAnnots: (PDFRef | PDFDict)[] = [];

      for (let j = 0; j < annots.size(); j++) {
        const annotRefOrDict = annots.get(j);
        const annotDict = pdfDoc.context.lookup(annotRefOrDict) as PDFDict;

        if (annotDict instanceof PDFDict) {
          const subtype = annotDict.get(PDFName.of('Subtype'))?.toString();

          if (options.keepFormFieldsInteractive && subtype === '/Widget') {
            // Keep interactive form field widget intact
            keptAnnots.push(annotRefOrDict as any);
          } else {
            // Non-widget annotation (e.g. /Highlight, /Text, /Link, /Square, /Stamp, /Ink)
            // It is flattened away from the interactive annotation list
          }
        }
      }

      // Re-assign filtered annotations to the page
      if (keptAnnots.length === 0) {
        page.node.delete(PDFName.of('Annots'));
      } else {
        const newAnnotsArray = pdfDoc.context.obj(keptAnnots);
        page.node.set(PDFName.of('Annots'), newAnnotsArray);
      }
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }

  /**
   * Exports an annotation-only overlay PDF matching the exact geometry and page count
   * of the source document, with a transparent background for pairing with C6 Overlay.
   */
  async exportAnnotationOverlay(
    sourcePdfBytes: Uint8Array,
    editorDoc?: PdfEditorDocument
  ): Promise<OverlayExportResult> {
    const sourcePdf = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const overlayDoc = await PDFDocument.create();
    const sourcePages = sourcePdf.getPages();

    for (let i = 0; i < sourcePages.length; i++) {
      const srcPage = sourcePages[i];
      const { width, height } = srcPage.getSize();
      const pageNum = i + 1;

      // Add identical dimensions blank transparent page
      const overlayPage = overlayDoc.addPage([width, height]);

      // If editor document model is available, render overlay elements
      if (editorDoc) {
        const pageModel = editorDoc.pages.find(p => p.pageNumber === pageNum);
        if (pageModel && pageModel.elements && pageModel.elements.length > 0) {
          for (const el of pageModel.elements) {
            const pdfY = height - el.y - el.height;
            if (el.type === 'shape') {
              overlayPage.drawRectangle({
                x: el.x,
                y: pdfY,
                width: el.width,
                height: el.height,
                color: rgb(0.2, 0.5, 0.9),
                opacity: 0.5
              });
            } else if (el.type === 'annotation') {
              overlayPage.drawRectangle({
                x: el.x,
                y: pdfY,
                width: el.width,
                height: el.height,
                color: rgb(1, 0.9, 0),
                opacity: 0.4
              });
            }
          }
        }
      }

      // If source page has non-widget annotations, copy them as annotation overlay
      const srcAnnots = srcPage.node.Annots();
      if (srcAnnots && srcAnnots instanceof PDFArray) {
        const overlayAnnots: (PDFRef | PDFDict)[] = [];
        for (let j = 0; j < srcAnnots.size(); j++) {
          const item = srcAnnots.get(j);
          const dict = sourcePdf.context.lookup(item) as PDFDict;
          if (dict instanceof PDFDict) {
            const subtype = dict.get(PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Widget') {
              // Copy non-widget annotations to overlay
              const clonedDict = dict.clone(overlayDoc.context);
              overlayAnnots.push(overlayDoc.context.register(clonedDict));
            }
          }
        }
        if (overlayAnnots.length > 0) {
          overlayPage.node.set(PDFName.of('Annots'), overlayDoc.context.obj(overlayAnnots));
        }
      }
    }

    const overlayBytes = await overlayDoc.save({ useObjectStreams: false });
    const blob = new Blob([overlayBytes as any], { type: 'application/pdf' });

    return {
      pdfBytes: overlayBytes,
      blob,
      pageCount: sourcePages.length,
      hasAnnotationsOnly: true
    };
  }
}
