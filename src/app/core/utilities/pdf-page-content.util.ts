import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream
} from 'pdf-lib';

/**
 * Reading and replacing a page's content stream.
 *
 * pdf-lib writes content streams and never reads one back, so this is the
 * missing half for any pass that has to change what is already drawn on a
 * page rather than add to it.
 *
 * A page's /Contents is either one stream or an array of them, and the array
 * form is a real case, not a curiosity: pdf-lib itself appends a second
 * stream the first time anything is drawn onto an imported page. Treating
 * only the first entry as "the content" silently edits a fragment.
 */

/** One page's content, with every /Contents part decoded and concatenated. */
export function readPageContent(doc: PDFDocument, page: PDFPage): Uint8Array {
  const contents = page.node.get(PDFName.of('Contents'));
  if (!contents) return new Uint8Array();

  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;

  if (resolved instanceof PDFArray) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < resolved.size(); i++) {
      const part = streamBytes(doc, resolved.get(i));
      if (part.length > 0) {
        parts.push(part);
        /*
         * The spec treats the parts as one stream with whitespace between,
         * and a part that ends mid-token would otherwise fuse with the next.
         */
        parts.push(new Uint8Array([0x0a]));
      }
    }
    return concat(parts);
  }

  return streamBytes(doc, contents);
}

/**
 * Replaces a page's content with `bytes`, as a single uncompressed stream.
 *
 * Collapsing an array of parts into one stream is deliberate: the offsets a
 * caller holds came from the concatenated form, so writing it back the same
 * way is what keeps them meaningful.
 */
export function writePageContent(doc: PDFDocument, page: PDFPage, bytes: Uint8Array): void {
  const stream = doc.context.flateStream(bytes);
  page.node.set(PDFName.of('Contents'), doc.context.register(stream));
}

function streamBytes(doc: PDFDocument, objectOrRef: PDFObject | PDFRef | undefined): Uint8Array {
  if (!objectOrRef) return new Uint8Array();

  try {
    const stream = objectOrRef instanceof PDFRef ? doc.context.lookup(objectOrRef) : objectOrRef;
    if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
    if (stream instanceof PDFStream) return stream.getContents();
  } catch {
    /* An undecodable filter — JPX on a content stream, a broken Flate —
     * reads as empty rather than throwing the whole pass away. */
  }
  return new Uint8Array();
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
