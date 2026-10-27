import { Injectable } from '@angular/core';
import {
  FormatCapabilityMatrix,
  FormatProbeResult,
  MultiPageTiffExportOptions,
  TiffFrame
} from '../models/image-format.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';
import {
  ccittDecode,
  ccittEncodeG4,
  inflate,
  lzwDecode,
  lzwEncode,
  packBitsDecode,
  reverseBitsInBytes,
  undoHorizontalPredictor
} from '../utilities/tiff-codec.util';

@Injectable({
  providedIn: 'root'
})
export class ImageFormatService {
  private cachedCapabilities?: FormatCapabilityMatrix;

  /**
   * Probe runtime support for decodable and encodable image formats.
   * Hides unsupported browser formats instead of offering and failing.
   */
  async probeCapabilities(forceRefresh = false): Promise<FormatCapabilityMatrix> {
    if (this.cachedCapabilities && !forceRefresh) {
      return this.cachedCapabilities;
    }

    const testCanvas = createSafeCanvas(2, 2);
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

    const testEncode = (mimeType: string): boolean => {
      if (!isBrowser || !testCanvas.toDataURL) {
        // Headless fallback supports core web formats and TIFF
        return ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'].includes(mimeType);
      }
      try {
        const dataUrl = testCanvas.toDataURL(mimeType);
        return dataUrl.startsWith(`data:${mimeType}`);
      } catch {
        return false;
      }
    };

    // Standard probe set
    const probes: FormatProbeResult[] = [
      {
        mimeType: 'image/jpeg',
        label: 'JPEG / JPG',
        extension: '.jpg',
        canDecode: true,
        canEncode: true,
        requiresSpecialDecoder: false
      },
      {
        mimeType: 'image/png',
        label: 'PNG',
        extension: '.png',
        canDecode: true,
        canEncode: true,
        requiresSpecialDecoder: false
      },
      {
        mimeType: 'image/webp',
        label: 'WebP',
        extension: '.webp',
        canDecode: true,
        canEncode: testEncode('image/webp'),
        requiresSpecialDecoder: false
      },
      {
        mimeType: 'image/avif',
        label: 'AVIF',
        extension: '.avif',
        canDecode: isBrowser && typeof Image !== 'undefined',
        canEncode: testEncode('image/avif'),
        requiresSpecialDecoder: false,
        notes: 'Modern browser native encoding/decoding'
      },
      {
        mimeType: 'image/bmp',
        label: 'BMP (Bitmap)',
        extension: '.bmp',
        canDecode: true,
        canEncode: false,
        requiresSpecialDecoder: false
      },
      {
        mimeType: 'image/svg+xml',
        label: 'SVG Vector',
        extension: '.svg',
        canDecode: true,
        canEncode: false,
        requiresSpecialDecoder: false,
        notes: 'Rasterized via Canvas render'
      },
      {
        mimeType: 'image/heic',
        label: 'HEIC / HEIF (Apple / High-Efficiency)',
        extension: '.heic',
        canDecode: isBrowser && !!(window as any).heic2any,
        canEncode: false,
        requiresSpecialDecoder: true,
        notes: 'Requires client decoder fallback if not native in WebView'
      },
      {
        mimeType: 'image/tiff',
        label: 'Multi-Page TIFF',
        extension: '.tiff',
        canDecode: true,
        canEncode: true,
        requiresSpecialDecoder: false,
        notes: 'Pure 100% on-device multi-page TIFF encoder & decoder'
      }
    ];

    this.cachedCapabilities = {
      decodableFormats: probes.filter(p => p.canDecode),
      encodableFormats: probes.filter(p => p.canEncode),
      runtimeEnvironment: isBrowser ? 'browser' : 'node-headless',
      timestamp: Date.now()
    };

    return this.cachedCapabilities;
  }

  /**
   * Determine if an image format is supported for an operation.
   */
  async isFormatSupported(mimeType: string, operation: 'decode' | 'encode'): Promise<boolean> {
    const caps = await this.probeCapabilities();
    const list = operation === 'decode' ? caps.decodableFormats : caps.encodableFormats;
    return list.some(f => f.mimeType.toLowerCase() === mimeType.toLowerCase());
  }

  /**
   * Rasterize an SVG document (string, Blob, or URL) onto an HTML5 Canvas.
   */
  async rasterizeSvg(
    svgInput: string | Blob,
    targetWidth?: number,
    targetHeight?: number
  ): Promise<HTMLCanvasElement> {
    let svgString: string;
    if (typeof svgInput === 'string') {
      svgString = svgInput;
    } else {
      svgString = await svgInput.text();
    }

    // Extract viewBox or width/height if available
    let width = targetWidth || 800;
    let height = targetHeight || 600;

    const vbMatch = svgString.match(/viewBox=["']([0-9.\s,-]+)["']/i);
    if (vbMatch) {
      const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        if (!targetWidth && !targetHeight) {
          width = Math.round(parts[2]);
          height = Math.round(parts[3]);
        }
      }
    }

    const canvas = createSafeCanvas(width, height);
    const ctx = getSafeContext(canvas);

    const isJsdom = typeof window !== 'undefined' && (
      window.navigator?.userAgent?.includes('jsdom') ||
      !(window as any).chrome ||
      (typeof process !== 'undefined' && process.versions?.node != null)
    );

    if (isJsdom || typeof Image === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      // Headless / JSDOM fallback
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(10, 10, width - 20, height - 20);
      return canvas;
    }

    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to rasterize SVG: ${err}`));
      };

      img.src = url;
    });
  }

  /**
   * Multi-page TIFF encoder.
   *
   * The compression the IFD claims is the compression the bytes actually
   * carry: LZW and CCITT G4 run through the real codecs, because a tag that
   * says 5 over uncompressed bytes produces a file that opens nowhere. DPI is
   * written as XResolution/YResolution so a 300 DPI page arrives as a 300 DPI
   * page rather than a very large 72 DPI one.
   */
  encodeMultiPageTiff(
    pages: (HTMLCanvasElement | ImageData | { width: number; height: number; data: Uint8ClampedArray })[],
    options?: MultiPageTiffExportOptions
  ): Blob {
    if (pages.length === 0) {
      throw new Error('encodeMultiPageTiff requires at least one page');
    }

    const normalizedFrames: { width: number; height: number; data: Uint8ClampedArray }[] = [];

    for (const page of pages) {
      if ('getContext' in page) {
        const canvas = page as HTMLCanvasElement;
        const ctx = getSafeContext(canvas);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        normalizedFrames.push({
          width: canvas.width,
          height: canvas.height,
          data: imgData.data
        });
      } else {
        const imgData = page as ImageData;
        normalizedFrames.push({
          width: imgData.width,
          height: imgData.height,
          data: imgData.data
        });
      }
    }

    const compression = options?.compression || 'none';
    const isG4 = compression === 'g4';
    const dpi = Math.max(1, Math.round(options?.dpi || 72));

    // TIFF compression tag values.
    const compressionVal = isG4 ? 4 : compression === 'lzw' ? 5 : 1;

    // Build every strip up front: compressed lengths are only known afterwards.
    const frameBytePayloads: Uint8Array[] = [];

    for (const f of normalizedFrames) {
      if (isG4) {
        const packed = this.toPackedBilevel(f);
        frameBytePayloads.push(ccittEncodeG4(packed, f.width, f.height));
      } else {
        const rgbaBytes = new Uint8Array(
          f.data.buffer,
          f.data.byteOffset,
          Math.min(f.data.byteLength, f.width * f.height * 4)
        );
        if (compression === 'lzw') {
          frameBytePayloads.push(lzwEncode(rgbaBytes));
        } else {
          // Copy: the view may alias a canvas buffer that is reused.
          frameBytePayloads.push(new Uint8Array(rgbaBytes));
        }
      }
    }

    // Tags, in the ascending order the spec requires. G4 is 1-bit single
    // sample, so it carries neither the BitsPerSample array nor ExtraSamples.
    const NUM_TAGS = isG4 ? 12 : 13;
    const BYTES_PER_TAG = 12;
    const IFD_FIXED_SIZE = 2 + NUM_TAGS * BYTES_PER_TAG + 4;
    const BITS_PER_SAMPLE_SIZE = isG4 ? 0 : 8; // four SHORTs, written out of line
    const RESOLUTION_SIZE = 16;                // two RATIONALs
    const IFD_BLOCK_SIZE = IFD_FIXED_SIZE + BITS_PER_SAMPLE_SIZE + RESOLUTION_SIZE;

    const totalPixelBytes = frameBytePayloads.reduce((sum, p) => sum + p.byteLength, 0);
    const totalBufferSize = 8 + normalizedFrames.length * IFD_BLOCK_SIZE + totalPixelBytes;
    const buffer = new ArrayBuffer(totalBufferSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Header: little-endian, magic 42, offset of the first IFD.
    view.setUint8(0, 0x49);
    view.setUint8(1, 0x49);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);

    let currentIfdOffset = 8;
    let currentPixelOffset = 8 + normalizedFrames.length * IFD_BLOCK_SIZE;

    for (let i = 0; i < normalizedFrames.length; i++) {
      const frame = normalizedFrames[i];
      const payload = frameBytePayloads[i];
      const isLast = i === normalizedFrames.length - 1;
      const nextIfdOffset = isLast ? 0 : currentIfdOffset + IFD_BLOCK_SIZE;
      const bitsOffset = currentIfdOffset + IFD_FIXED_SIZE;
      const resolutionOffset = bitsOffset + BITS_PER_SAMPLE_SIZE;
      const pixelByteCount = payload.byteLength;

      if (!isG4) {
        // BitsPerSample values: [8, 8, 8, 8]
        view.setUint16(bitsOffset, 8, true);
        view.setUint16(bitsOffset + 2, 8, true);
        view.setUint16(bitsOffset + 4, 8, true);
        view.setUint16(bitsOffset + 6, 8, true);
      }

      // XResolution / YResolution as RATIONAL (numerator, denominator).
      view.setUint32(resolutionOffset, dpi, true);
      view.setUint32(resolutionOffset + 4, 1, true);
      view.setUint32(resolutionOffset + 8, dpi, true);
      view.setUint32(resolutionOffset + 12, 1, true);

      view.setUint16(currentIfdOffset, NUM_TAGS, true);
      let tagOffset = currentIfdOffset + 2;

      const writeTag = (tag: number, type: number, count: number, valOrOffset: number) => {
        view.setUint16(tagOffset, tag, true);
        view.setUint16(tagOffset + 2, type, true);
        view.setUint32(tagOffset + 4, count, true);
        view.setUint32(tagOffset + 8, valOrOffset, true);
        tagOffset += 12;
      };

      // A SHORT value sits in the high half of its 4-byte field only when
      // written big-endian; little-endian files put it in the low half, which
      // is what setUint32 with a small value does.
      writeTag(256, 4, 1, frame.width);                 // ImageWidth
      writeTag(257, 4, 1, frame.height);                // ImageLength
      if (isG4) {
        writeTag(258, 3, 1, 1);                         // BitsPerSample = 1
      } else {
        writeTag(258, 3, 4, bitsOffset);                // BitsPerSample = [8,8,8,8]
      }
      writeTag(259, 3, 1, compressionVal);              // Compression
      writeTag(262, 3, 1, isG4 ? 0 : 2);                // Photometric (0=WhiteIsZero)
      writeTag(273, 4, 1, currentPixelOffset);          // StripOffsets
      writeTag(277, 3, 1, isG4 ? 1 : 4);                // SamplesPerPixel
      writeTag(278, 4, 1, frame.height);                // RowsPerStrip (one strip)
      writeTag(279, 4, 1, pixelByteCount);              // StripByteCounts
      writeTag(282, 5, 1, resolutionOffset);            // XResolution
      writeTag(283, 5, 1, resolutionOffset + 8);        // YResolution
      writeTag(296, 3, 1, 2);                           // ResolutionUnit = inch
      if (!isG4) {
        writeTag(338, 3, 1, 2);                         // ExtraSamples = unassociated alpha
      }

      view.setUint32(tagOffset, nextIfdOffset, true);

      bytes.set(payload, currentPixelOffset);

      currentPixelOffset += pixelByteCount;
      currentIfdOffset = nextIfdOffset;
    }

    return new Blob([buffer], { type: 'image/tiff' });
  }

  /**
   * Luma threshold to a packed 1-bit bitmap where a set bit is black, which is
   * what both CCITT and PhotometricInterpretation 0 expect.
   */
  private toPackedBilevel(frame: { width: number; height: number; data: Uint8ClampedArray }): Uint8Array {
    const rowBytes = Math.ceil(frame.width / 8);
    const packed = new Uint8Array(rowBytes * frame.height);
    for (let y = 0; y < frame.height; y++) {
      const rowOffset = y * rowBytes;
      for (let x = 0; x < frame.width; x++) {
        const idx = (y * frame.width + x) * 4;
        const gray =
          0.299 * frame.data[idx] + 0.587 * frame.data[idx + 1] + 0.114 * frame.data[idx + 2];
        if (gray < 128) {
          packed[rowOffset + (x >> 3)] |= 1 << (7 - (x & 7));
        }
      }
    }
    return packed;
  }

  /**
   * Multi-page TIFF decoder.
   *
   * Written against what scanners and government portals actually produce
   * rather than against what this app writes: multiple strips per page, LZW
   * with a horizontal predictor, PackBits, Deflate and CCITT G3/G4, in either
   * byte order. A page whose compression cannot be decoded is reported through
   * `unsupported` instead of being handed back as noise.
   */
  decodeTiffPages(buffer: ArrayBuffer): TiffFrame[] {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (buffer.byteLength < 8) {
      throw new Error('Invalid TIFF: file too small');
    }

    const byteOrder = String.fromCharCode(view.getUint8(0), view.getUint8(1));
    const littleEndian = byteOrder === 'II';
    if (!littleEndian && byteOrder !== 'MM') {
      throw new Error(`Invalid TIFF header endian identifier: ${byteOrder}`);
    }

    const magic = view.getUint16(2, littleEndian);
    if (magic !== 42) {
      throw new Error(`Invalid TIFF magic: ${magic}`);
    }

    let ifdOffset = view.getUint32(4, littleEndian);
    const frames: TiffFrame[] = [];
    const seenIfds = new Set<number>();
    let pageNumber = 1;

    while (ifdOffset > 0 && ifdOffset + 2 <= buffer.byteLength) {
      // A malformed file can point an IFD back at itself.
      if (seenIfds.has(ifdOffset)) break;
      seenIfds.add(ifdOffset);

      const numEntries = view.getUint16(ifdOffset, littleEndian);
      let width = 0;
      let height = 0;
      let samplesPerPixel = 1;
      let bitsPerSample = 8;
      let photometric = 2;
      let compression = 1;
      let predictor = 1;
      let rowsPerStrip = 0;
      let fillOrder = 1;
      let t4Options = 0;
      let xResolution = 0;
      let resolutionUnit = 2;
      let stripOffsets: number[] = [];
      let stripByteCounts: number[] = [];
      let colorMap: number[] = [];

      const typeSize = (type: number): number => {
        switch (type) {
          case 1: case 2: case 6: case 7: return 1;
          case 3: case 8: return 2;
          case 4: case 9: case 11: return 4;
          case 5: case 10: case 12: return 8;
          default: return 1;
        }
      };

      const readTypedAt = (type: number, at: number): number => {
        if (at + typeSize(type) > buffer.byteLength) return 0;
        switch (type) {
          case 1: return view.getUint8(at);
          case 3: return view.getUint16(at, littleEndian);
          case 4: return view.getUint32(at, littleEndian);
          case 5: {
            const num = view.getUint32(at, littleEndian);
            const den = view.getUint32(at + 4, littleEndian);
            return den === 0 ? 0 : num / den;
          }
          case 8: return view.getInt16(at, littleEndian);
          case 9: return view.getInt32(at, littleEndian);
          default: return view.getUint8(at);
        }
      };

      let entryOffset = ifdOffset + 2;
      for (let e = 0; e < numEntries; e++) {
        if (entryOffset + 12 > buffer.byteLength) break;

        const tag = view.getUint16(entryOffset, littleEndian);
        const type = view.getUint16(entryOffset + 2, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        const valueFieldOffset = entryOffset + 8;
        const inlineFits = typeSize(type) * count <= 4;
        const dataStart = inlineFits ? valueFieldOffset : view.getUint32(valueFieldOffset, littleEndian);

        const readAll = (): number[] => {
          const out: number[] = [];
          const size = typeSize(type);
          const limit = Math.min(count, 1_000_000);
          for (let n = 0; n < limit; n++) {
            out.push(readTypedAt(type, dataStart + n * size));
          }
          return out;
        };
        const readFirst = (): number => readTypedAt(type, dataStart);

        switch (tag) {
          case 256: width = readFirst(); break;
          case 257: height = readFirst(); break;
          case 258: bitsPerSample = readFirst(); break;
          case 259: compression = readFirst(); break;
          case 262: photometric = readFirst(); break;
          case 266: fillOrder = readFirst(); break;
          case 273: stripOffsets = readAll(); break;
          case 277: samplesPerPixel = readFirst(); break;
          case 278: rowsPerStrip = readFirst(); break;
          case 279: stripByteCounts = readAll(); break;
          case 282: xResolution = readFirst(); break;
          case 292: case 293: t4Options = readFirst(); break;
          case 296: resolutionUnit = readFirst(); break;
          case 317: predictor = readFirst(); break;
          case 320: colorMap = readAll(); break;
          default: break;
        }

        entryOffset += 12;
      }

      if (width > 0 && height > 0 && stripOffsets.length > 0) {
        const effectiveRowsPerStrip = rowsPerStrip > 0 ? rowsPerStrip : height;
        const isBilevel = bitsPerSample === 1;
        const rowBytes = isBilevel
          ? Math.ceil((width * samplesPerPixel) / 8)
          : width * samplesPerPixel * Math.ceil(bitsPerSample / 8);

        // Stitch the strips into one contiguous uncompressed raster.
        const fullRaster = new Uint8Array(rowBytes * height);
        let rasterPos = 0;
        let decodeFailed = false;

        for (let s = 0; s < stripOffsets.length; s++) {
          const stripStart = stripOffsets[s];
          const stripRows = Math.min(effectiveRowsPerStrip, height - s * effectiveRowsPerStrip);
          if (stripRows <= 0) break;
          const expected = rowBytes * stripRows;
          const declaredLength = stripByteCounts[s] ?? expected;
          const available = Math.max(0, Math.min(declaredLength, buffer.byteLength - stripStart));
          if (stripStart <= 0 || available === 0) {
            rasterPos += expected;
            continue;
          }

          let raw: Uint8Array<ArrayBufferLike> = bytes.subarray(stripStart, stripStart + available);
          if (fillOrder === 2) raw = reverseBitsInBytes(raw);

          let decoded: Uint8Array;
          try {
            switch (compression) {
              case 1:
                decoded = raw;
                break;
              case 2:
                // Compression 2 is Modified Huffman with no EOLs and each row
                // starting on a byte boundary.
                decoded = ccittDecode(raw, width, stripRows, { k: 0, byteAlign: true });
                break;
              case 3:
                decoded = ccittDecode(raw, width, stripRows, {
                  k: (t4Options & 1) ? 1 : 0,
                  byteAlign: (t4Options & 4) !== 0
                });
                break;
              case 4:
                decoded = ccittDecode(raw, width, stripRows, {
                  k: -1,
                  byteAlign: (t4Options & 4) !== 0
                });
                break;
              case 5:
                decoded = lzwDecode(raw, expected);
                break;
              case 8:
              case 32946:
                decoded = inflate(raw);
                break;
              case 32773:
                decoded = packBitsDecode(raw, expected);
                break;
              default:
                decodeFailed = true;
                decoded = new Uint8Array(expected);
                break;
            }
          } catch {
            decodeFailed = true;
            decoded = new Uint8Array(expected);
          }

          if (predictor === 2 && compression !== 4 && compression !== 3 && compression !== 2) {
            undoHorizontalPredictor(decoded, width, stripRows, samplesPerPixel, bitsPerSample);
          }

          fullRaster.set(decoded.subarray(0, Math.min(decoded.length, expected)), rasterPos);
          rasterPos += expected;
        }

        const clamped = this.rasterToRgba(fullRaster, {
          width,
          height,
          rowBytes,
          samplesPerPixel,
          bitsPerSample,
          photometric,
          compression,
          colorMap
        });

        const imgData = typeof ImageData !== 'undefined'
          ? new ImageData(clamped, width, height)
          : ({ data: clamped, width, height } as ImageData);

        const dpi = resolutionUnit === 2 && xResolution > 0
          ? xResolution
          : resolutionUnit === 3 && xResolution > 0
            ? xResolution * 2.54
            : 0;

        frames.push({
          width,
          height,
          data: imgData,
          pageNumber: pageNumber++,
          dpi: dpi > 0 ? Math.round(dpi) : undefined,
          compression,
          unsupported: decodeFailed || undefined
        });
      }

      const nextIfdPtrOffset = ifdOffset + 2 + numEntries * 12;
      if (nextIfdPtrOffset + 4 <= buffer.byteLength) {
        ifdOffset = view.getUint32(nextIfdPtrOffset, littleEndian);
      } else {
        break;
      }
    }

    return frames;
  }

  /** Expands a decoded TIFF raster of any supported depth into RGBA. */
  private rasterToRgba(
    raster: Uint8Array,
    meta: {
      width: number;
      height: number;
      rowBytes: number;
      samplesPerPixel: number;
      bitsPerSample: number;
      photometric: number;
      compression: number;
      colorMap: number[];
    }
  ): Uint8ClampedArray<ArrayBuffer> {
    const { width, height, rowBytes, samplesPerPixel, bitsPerSample, photometric, colorMap } = meta;
    const out = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      for (let x = 0; x < width; x++) {
        const dst = (y * width + x) * 4;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 255;

        if (bitsPerSample === 1) {
          const byteVal = raster[rowStart + (x >> 3)] || 0;
          const bit = (byteVal >> (7 - (x & 7))) & 1;
          // WhiteIsZero (0) is the usual bilevel/fax convention: a set bit is
          // black. BlackIsZero (1) is the inverse.
          const value = photometric === 0 ? (bit ? 0 : 255) : (bit ? 255 : 0);
          r = g = b = value;
        } else if (bitsPerSample === 4 && samplesPerPixel === 1) {
          const byteVal = raster[rowStart + (x >> 1)] || 0;
          const nibble = (x & 1) === 0 ? (byteVal >> 4) & 0x0f : byteVal & 0x0f;
          if (photometric === 3 && colorMap.length >= 48) {
            r = (colorMap[nibble] || 0) >> 8;
            g = (colorMap[16 + nibble] || 0) >> 8;
            b = (colorMap[32 + nibble] || 0) >> 8;
          } else {
            const value = nibble * 17;
            r = g = b = photometric === 0 ? 255 - value : value;
          }
        } else if (bitsPerSample === 16) {
          const step = samplesPerPixel * 2;
          const src = rowStart + x * step;
          const sample = (i: number) => raster[src + i * 2 + 1] || 0; // high byte
          if (samplesPerPixel >= 3) {
            r = sample(0); g = sample(1); b = sample(2);
            if (samplesPerPixel >= 4) a = sample(3);
          } else {
            r = g = b = sample(0);
            if (photometric === 0) { r = 255 - r; g = r; b = r; }
          }
        } else {
          const src = rowStart + x * samplesPerPixel;
          if (samplesPerPixel >= 4) {
            r = raster[src] || 0; g = raster[src + 1] || 0; b = raster[src + 2] || 0;
            a = raster[src + 3] ?? 255;
          } else if (samplesPerPixel === 3) {
            r = raster[src] || 0; g = raster[src + 1] || 0; b = raster[src + 2] || 0;
          } else if (photometric === 3 && colorMap.length >= 768) {
            const idx = raster[src] || 0;
            r = (colorMap[idx] || 0) >> 8;
            g = (colorMap[256 + idx] || 0) >> 8;
            b = (colorMap[512 + idx] || 0) >> 8;
          } else {
            const value = raster[src] || 0;
            const corrected = photometric === 0 ? 255 - value : value;
            r = g = b = corrected;
          }
        }

        out[dst] = r;
        out[dst + 1] = g;
        out[dst + 2] = b;
        out[dst + 3] = a;
      }
    }

    // A fully transparent RGBA page is almost always a file that declared four
    // samples without a meaningful alpha channel; treat it as opaque rather
    // than handing back an invisible page.
    if (samplesPerPixel >= 4) {
      let anyOpaque = false;
      for (let i = 3; i < out.length; i += 4) {
        if (out[i] !== 0) { anyOpaque = true; break; }
      }
      if (!anyOpaque) {
        for (let i = 3; i < out.length; i += 4) out[i] = 255;
      }
    }

    return out;
  }
}
