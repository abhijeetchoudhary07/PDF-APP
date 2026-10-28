import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFRef } from 'pdf-lib';
import {
  AnnotationFlattenResult,
  FlattenAnnotationOptions,
  OverlayExportResult
} from '../models/editor-features.types';
import { PdfEditorDocument } from '../models/pdf-editor.types';
import {
  annotationSubtype,
  copyAnnotation,
  pageAnnotations,
  paintAnnotationAppearance,
  setAnnotations
} from '../utilities/pdf-annotation.util';

/**
 * K7 — Flattening annotations, and exporting them as an overlay.
 *
 * "Flatten" is the word that has to be taken literally here. An earlier
 * version of this service deleted each annotation's entry from the page's
 * /Annots array and called the job done, which is not flattening — it is
 * erasing. Every highlight, stamp and sticky note disappeared from the
 * output, and the function reported success.
 *
 * Flattening is: take the appearance stream the viewer draws the annotation
 * from, paint it into the page's own content at the annotation's rectangle,
 * and only then drop the annotation object. The mark stays on the page; what
 * goes is its interactivity.
 *
 * Two things are deliberately left alone:
 *
 *   • **Widget annotations** — the /Widget subtype, which is what a form
 *     field is. That is the whole point of this pass next to G7's full
 *     flatten: the comments stop being editable, the form stays fillable.
 *   • **Annotations with no appearance stream.** There is nothing to paint,
 *     so removing them would lose them. They are counted and left
 *     interactive, and the UI says how many.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfAnnotationFlattenService {
  /**
   * Paints non-widget annotations into the page content and removes them.
   *
   * Returns the counts as well as the bytes, because "flattened 4, left 1
   * alone" is the only honest summary when a document mixes annotations that
   * carry an appearance with ones that do not.
   */
  async flattenAnnotations(
    pdfBytes: Uint8Array,
    options: FlattenAnnotationOptions = { keepFormFieldsInteractive: true }
  ): Promise<AnnotationFlattenResult> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    let flattened = 0;
    let widgetsKept = 0;
    let skippedWithoutAppearance = 0;
    let linksRemoved = 0;

    for (const page of pages) {
      const annots = pageAnnotations(pdfDoc, page);
      if (annots.length === 0) continue;

      const kept: PDFRef[] = [];

      for (const entry of annots) {
        const subtype = annotationSubtype(entry.dict);

        if (subtype === '/Widget' && options.keepFormFieldsInteractive) {
          widgetsKept++;
          kept.push(entry.ref);
          continue;
        }

        /*
         * A /Popup has no mark of its own — it is the balloon that opens when
         * its parent note is clicked. Flattening its parent takes the note
         * with it, so the popup goes too rather than being left pointing at
         * an annotation that is no longer there.
         */
        if (subtype === '/Popup') continue;

        /*
         * A /Link draws nothing either: it is a hotspot over content that is
         * already on the page. There is no appearance to paint, and keeping
         * it would leave the document still clickable after a pass whose
         * whole job is to make the annotation layer inert. So it goes, and
         * it is counted separately — losing a working link is worth saying.
         */
        if (subtype === '/Link') {
          linksRemoved++;
          continue;
        }

        if (paintAnnotationAppearance(pdfDoc, entry.dict, pdfDoc, page)) {
          flattened++;
          continue;
        }

        skippedWithoutAppearance++;
        kept.push(entry.ref);
      }

      setAnnotations(pdfDoc, page, kept);
    }

    return {
      pdfBytes: await pdfDoc.save({ useObjectStreams: false }),
      flattened,
      widgetsKept,
      skippedWithoutAppearance,
      linksRemoved
    };
  }

  /** `flattenAnnotations` for callers that only want the bytes. */
  async flattenAnnotationsOnly(
    pdfBytes: Uint8Array,
    options: FlattenAnnotationOptions = { keepFormFieldsInteractive: true }
  ): Promise<Uint8Array> {
    return (await this.flattenAnnotations(pdfBytes, options)).pdfBytes;
  }

  /**
   * The annotation layer on its own, as a transparent PDF.
   *
   * Same page count and same page geometry as the source, so it drops
   * straight onto the original through C6's overlay tool. Each annotation is
   * carried across twice over: painted into the page content, so the file
   * looks right in any viewer and prints, and copied as a live annotation
   * where it can be, so a reviewer can still open and read the notes.
   *
   * The copy goes through `PDFObjectCopier`, not `PDFDict.clone`. Cloning a
   * dictionary leaves every reference inside it pointing at objects in the
   * source document, which do not exist in the new one — the earlier version
   * of this method produced overlays whose annotations resolved to nothing.
   */
  async exportAnnotationOverlay(
    sourcePdfBytes: Uint8Array,
    editorDoc?: PdfEditorDocument
  ): Promise<OverlayExportResult> {
    const sourcePdf = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const overlayDoc = await PDFDocument.create();
    const sourcePages = sourcePdf.getPages();

    let annotationsDrawn = 0;
    let annotationsCopied = 0;

    for (let i = 0; i < sourcePages.length; i++) {
      const sourcePage = sourcePages[i];
      const { width, height } = sourcePage.getSize();

      /*
       * A blank page with no background box: the overlay has to be
       * transparent, so nothing is painted behind the annotations. The page
       * also inherits the source's rotation, or the overlay lands sideways
       * on a rotated page.
       */
      const overlayPage = overlayDoc.addPage([width, height]);
      overlayPage.setRotation(sourcePage.getRotation());

      const copied: PDFRef[] = [];

      for (const entry of pageAnnotations(sourcePdf, sourcePage)) {
        const subtype = annotationSubtype(entry.dict);
        /* Form fields belong to the document, not to its comment layer; a
         * link has no mark to carry across. */
        if (subtype === '/Widget' || subtype === '/Link') continue;

        if (paintAnnotationAppearance(sourcePdf, entry.dict, overlayDoc, overlayPage)) {
          annotationsDrawn++;
        }

        /*
         * /Popup entries are carried only when their parent came across;
         * pdf-lib's copier pulls the parent in with them, so copying one on
         * its own would reintroduce the note it belongs to.
         */
        if (subtype === '/Popup') continue;

        const ref = copyAnnotation(sourcePdf, overlayDoc, entry.ref);
        if (ref) {
          copied.push(ref);
          annotationsCopied++;
        }
      }

      if (copied.length > 0) setAnnotations(overlayDoc, overlayPage, copied);
    }

    const pdfBytes = await overlayDoc.save({ useObjectStreams: false });

    return {
      pdfBytes,
      blob: new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
      pageCount: sourcePages.length,
      hasAnnotationsOnly: true,
      annotationsDrawn,
      annotationsCopied
    };
  }
}
