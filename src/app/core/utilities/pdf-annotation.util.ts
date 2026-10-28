import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFPage,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState
} from 'pdf-lib';
import type { ContentMatrix } from './content-stream-scanner.util';
import { multiplyMatrix } from './content-stream-scanner.util';

/**
 * Painting annotation appearances into page content, and copying annotations
 * between documents.
 *
 * This is what "flatten" means. Deleting an entry from a page's /Annots array
 * is not flattening — it removes the highlight, the stamp and the sticky note
 * from the page entirely. Flattening means taking the annotation's *appearance
 * stream*, the form XObject under /AP /N that every viewer draws it from, and
 * writing a `Do` for it into the page's own content, so the mark stays
 * visible once the annotation object is gone.
 *
 * The placement rule is PDF 32000-1 §12.5.5, and it is not a plain
 * translate: the appearance has its own /BBox and optional /Matrix, and the
 * result has to be fitted to the annotation's /Rect. Skipping that step puts
 * a highlight in the corner of the page at the wrong size.
 */

/** The annotation's /Subtype, with the leading slash, e.g. `/Widget`. */
export function annotationSubtype(dict: PDFDict): string | undefined {
  return dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
}

/** Reads a 4- or 6-number array, falling back when entries are missing. */
function numbersFrom(array: PDFArray | undefined, count: number, fallback: number[]): number[] {
  if (!array || array.size() < count) return fallback;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(array.lookupMaybe(i, PDFNumber)?.asNumber() ?? fallback[i]);
  }
  return out;
}

/** The annotation's rectangle, normalised so x1 < x2 and y1 < y2. */
export function annotationRect(dict: PDFDict): { x1: number; y1: number; x2: number; y2: number } | null {
  const rect = dict.lookupMaybe(PDFName.of('Rect'), PDFArray);
  if (!rect || rect.size() < 4) return null;
  const [a, b, c, d] = numbersFrom(rect, 4, [0, 0, 0, 0]);
  return {
    x1: Math.min(a, c),
    y1: Math.min(b, d),
    x2: Math.max(a, c),
    y2: Math.max(b, d)
  };
}

/**
 * The stream a viewer draws this annotation from.
 *
 * /AP /N is usually the stream itself, but for anything with states — a
 * checkbox, a stamp with an /Off appearance — it is a dictionary of streams
 * keyed by state name, and /AS says which one is current. With no /AS and a
 * single entry, that entry is the appearance.
 */
export function normalAppearanceRef(doc: PDFDocument, dict: PDFDict): PDFRef | null {
  const apDict = dict.lookupMaybe(PDFName.of('AP'), PDFDict);
  if (!apDict) return null;

  const normal = apDict.get(PDFName.of('N'));
  if (!normal) return null;

  const resolved = doc.context.lookup(normal);
  if (resolved instanceof PDFStream) {
    return normal instanceof PDFRef ? normal : null;
  }

  if (resolved instanceof PDFDict) {
    const stateName = dict.lookupMaybe(PDFName.of('AS'), PDFName);
    if (stateName) {
      const chosen = resolved.get(PDFName.of(stateName.asString().replace(/^\//, '')));
      if (chosen instanceof PDFRef) return chosen;
    }

    const entries = resolved.entries();
    if (entries.length === 1 && entries[0][1] instanceof PDFRef) {
      return entries[0][1] as PDFRef;
    }
  }

  return null;
}

/**
 * The matrix that fits an appearance stream into an annotation's rectangle.
 *
 * Per §12.5.5: transform the /BBox corners by /Matrix, take the bounding box
 * of the result, then scale and translate that box onto /Rect. The returned
 * matrix already has /Matrix folded in, so it is the only `cm` needed before
 * the `Do`.
 */
export function appearanceMatrix(
  bbox: number[],
  matrix: number[],
  rect: { x1: number; y1: number; x2: number; y2: number }
): ContentMatrix {
  const [m0, m1, m2, m3, m4, m5] = matrix;
  const [bx1, by1, bx2, by2] = bbox;

  const corners = [
    [bx1, by1],
    [bx2, by1],
    [bx2, by2],
    [bx1, by2]
  ].map(([x, y]) => [m0 * x + m2 * y + m4, m1 * x + m3 * y + m5]);

  const xs = corners.map(point => point[0]);
  const ys = corners.map(point => point[1]);
  const tx1 = Math.min(...xs);
  const tx2 = Math.max(...xs);
  const ty1 = Math.min(...ys);
  const ty2 = Math.max(...ys);

  const transformedWidth = tx2 - tx1;
  const transformedHeight = ty2 - ty1;

  /*
   * A degenerate transformed box has no scale to compute. The spec's own
   * answer is to leave the scale at 1, which draws the appearance at its
   * natural size at the rectangle's corner rather than collapsing it.
   */
  const sx = transformedWidth > 1e-6 ? (rect.x2 - rect.x1) / transformedWidth : 1;
  const sy = transformedHeight > 1e-6 ? (rect.y2 - rect.y1) / transformedHeight : 1;

  const fit: ContentMatrix = [sx, 0, 0, sy, rect.x1 - tx1 * sx, rect.y1 - ty1 * sy];
  return multiplyMatrix([m0, m1, m2, m3, m4, m5] as ContentMatrix, fit);
}

/**
 * Paints one annotation's appearance into a page's content stream.
 *
 * `sourceDoc` holds the annotation; `page` belongs to `destDoc`. They may be
 * the same document (flatten in place) or different ones (overlay export), so
 * the stream is copied across contexts whenever they differ.
 *
 * Returns false when there is nothing to paint — no appearance stream, or no
 * rectangle to fit it into — so the caller can report the annotation as
 * skipped rather than pretend it was flattened.
 */
export function paintAnnotationAppearance(
  sourceDoc: PDFDocument,
  annotDict: PDFDict,
  destDoc: PDFDocument,
  page: PDFPage
): boolean {
  const rect = annotationRect(annotDict);
  if (!rect) return false;

  const streamRef = normalAppearanceRef(sourceDoc, annotDict);
  if (!streamRef) return false;

  const stream = sourceDoc.context.lookup(streamRef);
  if (!(stream instanceof PDFStream)) return false;

  const bbox = numbersFrom(
    stream.dict.lookupMaybe(PDFName.of('BBox'), PDFArray),
    4,
    [rect.x1, rect.y1, rect.x2, rect.y2]
  );
  const matrix = numbersFrom(
    stream.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray),
    6,
    [1, 0, 0, 1, 0, 0]
  );

  /*
   * An appearance with a zero-area /BBox draws nothing however it is placed.
   * Reporting it as skipped is the truthful answer; painting it would add an
   * empty `Do` and claim a flatten that is not visible.
   */
  if (Math.abs(bbox[2] - bbox[0]) < 1e-6 || Math.abs(bbox[3] - bbox[1]) < 1e-6) {
    return false;
  }

  const destRef =
    destDoc === sourceDoc
      ? streamRef
      : PDFObjectCopier.for(sourceDoc.context, destDoc.context).copy(streamRef);

  const name = page.node.newXObject('FlatAnnot', destRef as PDFRef);
  const placement = appearanceMatrix(bbox, matrix, rect);

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      placement[0],
      placement[1],
      placement[2],
      placement[3],
      placement[4],
      placement[5]
    ),
    drawObject(name),
    popGraphicsState()
  );

  return true;
}

/**
 * Deep-copies an annotation from one document into another.
 *
 * `PDFDict.clone` is not enough on its own: it copies the dictionary's own
 * entries but leaves every indirect reference inside pointing at objects in
 * the source document's context, which do not exist in the destination. The
 * result is an annotation the viewer cannot resolve — an appearance stream
 * that is not there, a /Popup that points at nothing. `PDFObjectCopier` is
 * pdf-lib's own answer, and it is what `copyPages` uses internally.
 */
export function copyAnnotation(
  sourceDoc: PDFDocument,
  destDoc: PDFDocument,
  annotRefOrDict: unknown
): PDFRef | null {
  try {
    const copier = PDFObjectCopier.for(sourceDoc.context, destDoc.context);

    /* Copying a reference yields a reference; copying a dictionary yields a
     * dictionary, which still has to be registered to become one. */
    if (annotRefOrDict instanceof PDFRef) {
      return copier.copy(annotRefOrDict);
    }

    if (annotRefOrDict instanceof PDFDict) {
      return destDoc.context.register(copier.copy(annotRefOrDict));
    }
  } catch {
    /* A malformed annotation is dropped from the copy and counted, not thrown. */
  }

  return null;
}

/** Appends an annotation reference to a page's /Annots array, creating it if needed. */
export function appendAnnotation(doc: PDFDocument, page: PDFPage, ref: PDFRef): void {
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing instanceof PDFArray) {
    existing.push(ref);
    return;
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

/** Replaces a page's /Annots with `refs`, removing the key when empty. */
export function setAnnotations(doc: PDFDocument, page: PDFPage, refs: PDFRef[]): void {
  if (refs.length === 0) {
    page.node.delete(PDFName.of('Annots'));
    return;
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj(refs));
}

/**
 * A page's annotations as resolved dictionaries, paired with their reference.
 *
 * Entries that are inline dictionaries rather than references are registered
 * so that every caller can work with a reference, and entries that resolve to
 * nothing are dropped.
 */
export function pageAnnotations(
  doc: PDFDocument,
  page: PDFPage
): { ref: PDFRef; dict: PDFDict; index: number }[] {
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return [];

  const out: { ref: PDFRef; dict: PDFDict; index: number }[] = [];

  for (let i = 0; i < annots.size(); i++) {
    const entry = annots.get(i);
    const resolved = doc.context.lookup(entry);
    if (!(resolved instanceof PDFDict)) continue;

    const ref = entry instanceof PDFRef ? entry : doc.context.register(resolved);
    out.push({ ref, dict: resolved, index: i });
  }

  return out;
}
