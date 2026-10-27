import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { PdfEditorDocument, PdfEditorPage } from '../models/pdf-editor.types';

/**
 * Fixtures for the Part K editor specs.
 *
 * Built with pdf-lib rather than checked in as binaries, for the reason the
 * conversion fixtures are generated too: a committed PDF says nothing about
 * what is inside it, and the first question every one of these tests asks is
 * "where exactly is that word on the page".
 */

export interface TextFixtureSpec {
  text: string;
  x: number;
  /** Baseline, measured up from the bottom of the page, as PDF does. */
  y: number;
  size?: number;
  font?: 'Helvetica' | 'TimesRoman' | 'Courier';
}

export interface PageFixtureSpec {
  width?: number;
  height?: number;
  texts?: TextFixtureSpec[];
}

/** A plain text document with glyphs at known positions. */
export async function makeTextPdf(pages: PageFixtureSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = {
    Helvetica: await doc.embedFont(StandardFonts.Helvetica),
    TimesRoman: await doc.embedFont(StandardFonts.TimesRoman),
    Courier: await doc.embedFont(StandardFonts.Courier)
  };

  for (const spec of pages) {
    const page = doc.addPage([spec.width ?? 420, spec.height ?? 600]);
    for (const text of spec.texts ?? []) {
      page.drawText(text.text, {
        x: text.x,
        y: text.y,
        size: text.size ?? 14,
        font: fonts[text.font ?? 'Helvetica'],
        color: rgb(0, 0, 0)
      });
    }
  }

  return doc.save({ useObjectStreams: false });
}

/** A one-page form with two text fields, each with a starting value. */
export async function makeFormPdf(
  fields: { name: string; value: string }[],
  pageCount = 1
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pages = Array.from({ length: pageCount }, () => doc.addPage([420, 600]));

  fields.forEach((field, index) => {
    const textField = form.createTextField(field.name);
    textField.setText(field.value);
    /* Deliberately on the LAST page, so a spec can tell a real widget-page
     * lookup from a hardcoded 1. */
    textField.addToPage(pages[pages.length - 1], {
      x: 40,
      y: 480 - index * 60,
      width: 300,
      height: 28,
      font
    });
  });

  return doc.save({ useObjectStreams: false });
}

/**
 * A document carrying annotations with real appearance streams, so a flatten
 * has something to paint and an overlay has something to carry.
 */
export async function makeAnnotatedPdf(options?: {
  pageCount?: number;
  withFormField?: boolean;
  /** An annotation with no /AP at all, which cannot be flattened. */
  withAppearancelessNote?: boolean;
}): Promise<Uint8Array> {
  const pageCount = options?.pageCount ?? 2;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = Array.from({ length: pageCount }, () => doc.addPage([400, 500]));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    page.drawText(`Body text on page ${i + 1}`, { x: 40, y: 440, size: 12, font });

    /* A square annotation with its own appearance stream: a yellow box. */
    const appearance = doc.context.stream(
      '1 0.9 0 rg\n0 0 60 24 re\nf\n',
      {
        Type: PDFName.of('XObject'),
        Subtype: PDFName.of('Form'),
        BBox: doc.context.obj([0, 0, 60, 24]),
        Resources: doc.context.obj({})
      }
    );
    const appearanceRef = doc.context.register(appearance);

    const annot = doc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Square'),
      Rect: doc.context.obj([60, 300, 180, 348]),
      F: 4,
      Contents: PDFString.of(`Square on page ${i + 1}`),
      AP: doc.context.obj({ N: appearanceRef })
    });

    const refs = [doc.context.register(annot)];

    if (options?.withAppearancelessNote) {
      const bare = doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect: doc.context.obj([200, 300, 224, 324]),
        Contents: PDFString.of('No appearance stream here'),
        Name: PDFName.of('Comment')
      });
      refs.push(doc.context.register(bare));
    }

    page.node.set(PDFName.of('Annots'), doc.context.obj(refs));
  }

  if (options?.withFormField) {
    const field = doc.getForm().createTextField('reviewer.name');
    field.setText('Original value');
    field.addToPage(pages[0], { x: 40, y: 100, width: 200, height: 24, font });
  }

  return doc.save({ useObjectStreams: false });
}

/** An image placed at a known spot, for the K4 page-image specs. */
export async function makeImagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 500]);

  page.drawText('Caption below the picture', { x: 40, y: 80, size: 11, font });

  /* A 2x2 PNG, built by hand so the fixture needs no binary on disk. */
  const png = await doc.embedPng(TINY_PNG_BYTES);
  page.drawImage(png, { x: 100, y: 250, width: 120, height: 90 });

  return doc.save({ useObjectStreams: false });
}

/** Wraps bytes in the editor's document model, with page sizes read back. */
export async function asEditorDocument(
  bytes: Uint8Array,
  name = 'fixture.pdf'
): Promise<PdfEditorDocument> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
  const pages: PdfEditorPage[] = doc.getPages().map((page, index) => {
    const size = page.getSize();
    return {
      pageNumber: index + 1,
      originalWidth: size.width,
      originalHeight: size.height,
      currentWidth: size.width,
      currentHeight: size.height,
      rotation: 0,
      elements: [],
      redactions: []
    };
  });

  return {
    id: 'fixture',
    name,
    sizeBytes: bytes.byteLength,
    pageCount: pages.length,
    arrayBuffer: buffer,
    pages
  };
}

/* A 2x2 opaque PNG: red, green / blue, white. */
export const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0xfd, 0xd4, 0x9a,
  0x73, 0x00, 0x00, 0x00, 0x1c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xc0,
  0xc0, 0xf0, 0x9f, 0x81, 0x81, 0x01, 0x13, 0x03, 0x23, 0x03, 0x03, 0x43, 0x80, 0x19, 0x00, 0x8d,
  0x54, 0x04, 0xfa, 0x53, 0xb4, 0x37, 0x4e, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

/*
 * A 3x3 red JPEG, base64 rather than a byte list because a valid baseline
 * JPEG needs its quantisation and Huffman tables and pdf-lib parses them —
 * a hand-trimmed one is rejected as invalid. Generated with:
 *
 *   python3 -c "from PIL import Image; import io,base64; \
 *     b=io.BytesIO(); Image.new('RGB',(3,3),(200,40,40)).save(b,'JPEG',quality=25,optimize=True); \
 *     print(base64.b64encode(b.getvalue()).decode())"
 */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiuim5woNqi' +
  'rr7EztDOfJri8uDI8LjKzsb/2wBDASIkJDAqMF40NF7GhHCExsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbG' +
  'xsbGxsbGxsbGxsbGxsb/wAARCAADAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAA' +
  'AAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCUAKm//9k=';

/** The fixture JPEG's bytes. */
export function tinyJpegBytes(): Uint8Array {
  const binary = atob(TINY_JPEG_BASE64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
