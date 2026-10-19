import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream
} from 'pdf-lib';
import {
  OptimizeProgress,
  PdfImageEntry,
  PdfImageInventory,
  PdfImagePlacement
} from '../models/pdf-optimize.types';
import {
  ContentMatrix,
  ContentStreamScanner,
  IDENTITY_MATRIX,
  multiplyMatrix
} from '../utilities/content-stream-scanner.util';

/**
 * What images a document holds, and how large each one is printed.
 *
 * This is the read every Part F pass starts from. The second half — *how
 * large each one is printed* — is the part that is easy to skip and impossible
 * to work without: an image's resolution is not a property of the image, it is
 * the pixel count divided by the inches it covers. The same 2000px photo is
 * 500 DPI on a thumbnail and 170 DPI across a full page, and a DPI ceiling
 * that cannot tell those apart either ruins the thumbnail or leaves the photo
 * untouched.
 *
 * So each page's content stream is scanned for the matrix in force at every
 * `Do`, which is what `ContentStreamScanner` exists for. Form XObjects are
 * followed one level down — stamps and letterheads routinely wrap their images
 * in one — with a depth cap so a self-referencing form cannot spin.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfImageInventoryService {
  /** How deep nested form XObjects are followed. */
  readonly MAX_FORM_DEPTH = 4;

  /** Filters whose contents this tool can decode and re-encode. */
  private readonly REENCODABLE_FILTERS = new Set([
    '/DCTDecode',
    '/FlateDecode',
    '/LZWDecode',
    '/RunLengthDecode'
  ]);

  // ════════════════════════════════════════════════════════════════════
  // Reading the objects
  // ════════════════════════════════════════════════════════════════════

  /** Every image XObject in the file, keyed by its indirect reference. */
  collectImages(doc: PDFDocument): Map<string, PdfImageEntry> {
    const images = new Map<string, PdfImageEntry>();

    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFStream)) continue;

      const dict = object.dict;
      const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
      if (subtype !== '/Image') continue;

      const width = dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0;
      const height = dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0;
      if (width <= 0 || height <= 0) continue;

      const filters = this.filtersOf(dict);
      const isMask =
        dict.lookupMaybe(PDFName.of('ImageMask'), PDFBool)?.asBoolean() === true ||
        dict.get(PDFName.of('Mask')) !== undefined;

      images.set(ref.toString(), {
        key: ref.toString(),
        pixelWidth: Math.round(width),
        pixelHeight: Math.round(height),
        filters,
        colorSpace: this.colorSpaceOf(dict),
        bitsPerComponent: dict
          .lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)
          ?.asNumber(),
        streamBytes: this.streamBytesOf(object),
        isMask,
        /*
         * A JPX or CCITT stream is left alone rather than guessed at. Decoding
         * either correctly is its own project, and a resample that silently
         * mangles a fax-encoded scan is worse than one that skips it.
         */
        reEncodable:
          !isMask &&
          filters.length > 0 &&
          filters.every(filter => this.REENCODABLE_FILTERS.has(filter))
      });
    }

    return images;
  }

  /** The filter names on a stream, outermost first. */
  private filtersOf(dict: PDFDict): string[] {
    const filter = dict.get(PDFName.of('Filter'));
    if (filter instanceof PDFName) return [filter.asString()];

    if (filter instanceof PDFArray) {
      const out: string[] = [];
      for (let i = 0; i < filter.size(); i++) {
        const entry = filter.lookupMaybe(i, PDFName);
        if (entry) out.push(entry.asString());
      }
      return out;
    }

    return [];
  }

  /** The colour space name, when it is a plain name rather than an array. */
  private colorSpaceOf(dict: PDFDict): string | undefined {
    const space = dict.get(PDFName.of('ColorSpace'));
    if (space instanceof PDFName) return space.asString();
    if (space instanceof PDFArray && space.size() > 0) {
      return space.lookupMaybe(0, PDFName)?.asString();
    }
    return undefined;
  }

  /** How many bytes a stream occupies, from /Length or its own contents. */
  private streamBytesOf(stream: PDFStream): number {
    try {
      const declared = stream.dict
        .lookupMaybe(PDFName.of('Length'), PDFNumber)
        ?.asNumber();
      if (declared && declared > 0) return Math.round(declared);
    } catch {
      // Fall through to the contents.
    }

    if (stream instanceof PDFRawStream) return stream.contents.length;

    try {
      return stream.sizeInBytes();
    } catch {
      return 0;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Measuring the placements
  // ════════════════════════════════════════════════════════════════════

  /** The /XObject resource dictionary of a page or a form, if it has one. */
  private xObjectsOf(resources: PDFDict | undefined): PDFDict | undefined {
    if (!resources) return undefined;
    try {
      return resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    } catch {
      return undefined;
    }
  }

  /** Every content stream of a page, concatenated as the reader sees them. */
  private pageContentBytes(doc: PDFDocument, page: PDFPage): Uint8Array {
    const contents = page.node.Contents();
    const chunks: Uint8Array[] = [];

    const addStream = (value: unknown): void => {
      let stream: PDFStream | undefined;
      if (value instanceof PDFRef) {
        const looked = doc.context.lookup(value);
        if (looked instanceof PDFStream) stream = looked;
      } else if (value instanceof PDFStream) {
        stream = value;
      }
      if (!stream) return;

      try {
        chunks.push(
          stream instanceof PDFRawStream
            ? decodePDFRawStream(stream).decode()
            : stream.getContents()
        );
      } catch {
        // A stream with a filter this build cannot decode contributes nothing;
        // its images simply go unmeasured and are reported as unplaced.
      }
    };

    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) addStream(contents.get(i));
    } else {
      addStream(contents);
    }

    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return chunks[0];

    /* Streams are joined with a newline, exactly as a reader concatenates them. */
    const total = chunks.reduce((sum, chunk) => sum + chunk.length + 1, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
      out[offset] = 0x0a;
      offset++;
    }
    return out;
  }

  /**
   * Walks one content stream, following form XObjects, and reports every image
   * draw with the matrix that was in force.
   */
  private scanInto(
    doc: PDFDocument,
    bytes: Uint8Array,
    resources: PDFDict | undefined,
    baseMatrix: ContentMatrix,
    pageNumber: number,
    images: Map<string, PdfImageEntry>,
    out: PdfImagePlacement[],
    counters: { inline: number; truncated: boolean },
    depth: number
  ): void {
    if (depth > this.MAX_FORM_DEPTH) return;

    const result = ContentStreamScanner.scan(bytes, baseMatrix);
    counters.inline += result.inlineImageCount;
    if (result.truncated) counters.truncated = true;

    const xObjects = this.xObjectsOf(resources);
    if (!xObjects) return;

    for (const draw of result.draws) {
      const ref = xObjects.get(PDFName.of(draw.name));
      if (!(ref instanceof PDFRef)) continue;

      const key = ref.toString();
      const image = images.get(key);

      if (image) {
        const widthInches = draw.widthPt / 72;
        const heightInches = draw.heightPt / 72;
        const dpiX = widthInches > 0 ? image.pixelWidth / widthInches : 0;
        const dpiY = heightInches > 0 ? image.pixelHeight / heightInches : 0;

        out.push({
          pageNumber,
          imageKey: key,
          resourceName: draw.name,
          drawnWidthPt: draw.widthPt,
          drawnHeightPt: draw.heightPt,
          dpiX,
          dpiY,
          effectiveDpi: Math.max(dpiX, dpiY)
        });
        continue;
      }

      /* Not an image — follow it if it is a form, so nested stamps count. */
      const form = doc.context.lookup(ref);
      if (!(form instanceof PDFStream)) continue;

      const subtype = form.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
      if (subtype !== '/Form') continue;

      let formBytes: Uint8Array;
      try {
        formBytes =
          form instanceof PDFRawStream
            ? decodePDFRawStream(form).decode()
            : form.getContents();
      } catch {
        continue;
      }

      /*
       * A form's own /Matrix applies before the CTM at its call site, which is
       * what puts a scaled-down letterhead's images at the right size.
       */
      let formMatrix: ContentMatrix = [...draw.matrix] as ContentMatrix;
      const declared = form.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray);
      if (declared && declared.size() >= 6) {
        const values: number[] = [];
        for (let i = 0; i < 6; i++) {
          values.push(declared.lookupMaybe(i, PDFNumber)?.asNumber() ?? (i === 0 || i === 3 ? 1 : 0));
        }
        formMatrix = multiplyMatrix(values as ContentMatrix, draw.matrix);
      }

      this.scanInto(
        doc,
        formBytes,
        form.dict.lookupMaybe(PDFName.of('Resources'), PDFDict),
        formMatrix,
        pageNumber,
        images,
        out,
        counters,
        depth + 1
      );
    }
  }

  /**
   * The full inventory: every image, every placement, and what that makes each
   * one's effective resolution.
   */
  async inventory(
    source: ArrayBuffer | PDFDocument,
    options?: { onProgress?: (p: OptimizeProgress) => void; signal?: AbortSignal }
  ): Promise<PdfImageInventory> {
    const doc =
      source instanceof PDFDocument
        ? source
        : await PDFDocument.load(source.slice(0), { ignoreEncryption: true });

    const images = this.collectImages(doc);
    const placements: PdfImagePlacement[] = [];
    const counters = { inline: 0, truncated: false };

    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      if (options?.signal?.aborted) throw new Error('Image scan cancelled by user.');

      const page = pages[i];
      const bytes = this.pageContentBytes(doc, page);
      if (bytes.length > 0) {
        /*
         * The page's own /Rotate is not folded in: it turns the finished page
         * rather than the content, so an image's drawn size in points is the
         * same either way.
         */
        this.scanInto(
          doc,
          bytes,
          page.node.Resources(),
          IDENTITY_MATRIX,
          i + 1,
          images,
          placements,
          counters,
          0
        );
      }

      options?.onProgress?.({
        phase: 'inventory',
        completed: i + 1,
        total: pages.length,
        percent: Math.round(((i + 1) / pages.length) * 100)
      });

      // Yield every few pages, so a long document does not freeze the UI.
      if ((i + 1) % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }

    const placedKeys = new Set(placements.map(placement => placement.imageKey));
    const entries = [...images.values()];

    return {
      images: entries,
      placements,
      unusedImageKeys: entries
        .filter(image => !placedKeys.has(image.key))
        .map(image => image.key),
      inlineImageCount: counters.inline,
      totalImageBytes: entries.reduce((sum, image) => sum + image.streamBytes, 0),
      pageCount: pages.length,
      truncated: counters.truncated
    };
  }

  /**
   * The highest resolution an image is drawn at anywhere in the document.
   *
   * A logo placed once small and once large has to be judged by the large
   * placement, or resampling it to suit the small one blurs the large one.
   */
  peakDpiFor(inventory: PdfImageInventory, imageKey: string): number {
    let peak = 0;
    for (const placement of inventory.placements) {
      if (placement.imageKey === imageKey && placement.effectiveDpi > peak) {
        peak = placement.effectiveDpi;
      }
    }
    return peak;
  }

  /** Pages an image appears on, in order. */
  pagesFor(inventory: PdfImageInventory, imageKey: string): number[] {
    const pages = new Set<number>();
    for (const placement of inventory.placements) {
      if (placement.imageKey === imageKey) pages.add(placement.pageNumber);
    }
    return [...pages].sort((a, b) => a - b);
  }

  /** Bytes of image data each page carries, for the proof view's per-page rows. */
  imageBytesByPage(inventory: PdfImageInventory): Map<number, number> {
    const byPage = new Map<number, number>();
    const byKey = new Map(inventory.images.map(image => [image.key, image]));
    const counted = new Set<string>();

    for (const placement of inventory.placements) {
      const token = `${placement.pageNumber}:${placement.imageKey}`;
      if (counted.has(token)) continue;
      counted.add(token);

      const image = byKey.get(placement.imageKey);
      if (!image) continue;
      byPage.set(
        placement.pageNumber,
        (byPage.get(placement.pageNumber) ?? 0) + image.streamBytes
      );
    }

    return byPage;
  }
}
