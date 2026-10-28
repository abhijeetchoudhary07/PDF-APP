/**
 * J6 to J10: what the converters actually produce.
 *
 * The companion suite checks that each converter returns a file of the right
 * shape. This one checks the parts a user can see go wrong: that an option
 * changes the output, that a TIFF's own resolution decides the PDF page size,
 * that a grouped and transformed SVG lands where it was drawn, and that the
 * fidelity report describes what really happened rather than the happy path.
 */
import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

import { ImagesToWordConverter } from './converters/images-to-word.converter';
import { ImagesToExcelConverter } from './converters/images-to-excel.converter';
import { PdfToTiffConverter } from './converters/pdf-to-tiff.converter';
import { TiffToPdfConverter } from './converters/tiff-to-pdf.converter';
import { SvgToPdfConverter } from './converters/svg-to-pdf.converter';
import { PdfToSvgConverter } from './converters/pdf-to-svg.converter';
import { PdfToJsonConverter } from './converters/pdf-to-json.converter';
import { ImageFormatService } from '../services/image-format.service';
import { OcrService } from '../services/ocr.service';
import { OcrDocumentResult, OcrWord } from '../models/ocr.models';
import { ensureSafeContext } from '../utilities/canvas-headless.util';
import { encodeRgbaPng } from '../utilities/png-encode.util';

/** A painted path from a generated PDF, read back with pdfjs. */
interface PaintedPath {
  fill: string;
  stroke: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

async function readPaintedPaths(bytes: Uint8Array): Promise<PaintedPath[]> {
  const task = pdfjsLib.getDocument({ data: bytes } as any);
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS as Record<string, number>;

  const paths: PaintedPath[] = [];
  let fill = '#000000';
  let stroke = '#000000';
  const matrixStack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const fills = [OPS['fill'], OPS['eoFill'], OPS['fillStroke'], OPS['eoFillStroke']];
  const strokes = [OPS['stroke'], OPS['closeStroke'], OPS['fillStroke'], OPS['eoFillStroke']];

  const apply = (m: number[], x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5]
  ];
  const mul = (a: number[], b: number[]): number[] => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS['save']) matrixStack.push([...ctm]);
    else if (fn === OPS['restore']) ctm = matrixStack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS['transform'] && args?.length >= 6) ctm = mul(ctm, args.slice(0, 6));
    else if (fn === OPS['setFillRGBColor']) fill = String(args?.[0] ?? fill);
    else if (fn === OPS['setStrokeRGBColor']) stroke = String(args?.[0] ?? stroke);
    else if (fn === OPS['constructPath']) {
      const paintOp = args?.[0];
      const streams = Array.isArray(args?.[1]) ? args[1] : [args?.[1]];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const stream of streams) {
        const values = stream as ArrayLike<number>;
        if (!values) continue;
        let p = 0;
        while (p < values.length) {
          const op = values[p++];
          const coords = op === 0 || op === 1 ? 2 : op === 2 ? 6 : op === 3 ? 4 : 0;
          for (let c = 0; c < coords; c += 2) {
            const [x, y] = apply(ctm, values[p + c], values[p + c + 1]);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          p += coords;
        }
      }
      if (minX !== Infinity) {
        paths.push({
          fill: fills.includes(paintOp) ? fill : 'none',
          stroke: strokes.includes(paintOp) ? stroke : 'none',
          minX, minY, maxX, maxY
        });
      }
    }
  }

  await task.destroy();
  return paths;
}

async function pageSizes(bytes: Uint8Array): Promise<{ width: number; height: number }[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(p => ({ width: p.getWidth(), height: p.getHeight() }));
}

function ocrResult(fullText: string, words: OcrWord[], confidence = 92): OcrDocumentResult {
  return {
    fileName: 'scan.png',
    totalPages: 1,
    pages: [
      {
        pageNumber: 1,
        text: fullText,
        confidence,
        words,
        language: 'eng',
        status: 'completed'
      }
    ],
    fullText,
    averageConfidence: confidence,
    languages: ['eng']
  };
}

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, confidence: 95, bbox: { x0, y0, x1, y1 } };
}

/** A grey TIFF frame of a known size, for the sizing tests. */
function solidFrame(width: number, height: number, level = 200) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = level;
    data[i * 4 + 1] = level;
    data[i * 4 + 2] = level;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('Part J: J6 to J10 output fidelity', () => {
  let imagesToWord: ImagesToWordConverter;
  let imagesToExcel: ImagesToExcelConverter;
  let pdfToTiff: PdfToTiffConverter;
  let tiffToPdf: TiffToPdfConverter;
  let svgToPdf: SvgToPdfConverter;
  let pdfToSvg: PdfToSvgConverter;
  let pdfToJson: PdfToJsonConverter;
  let imageFormat: ImageFormatService;
  let ocr: OcrService;

  let vectorPdf: File;

  beforeAll(async () => {
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        return ensureSafeContext(this);
      } as any;
    }

    imagesToWord = TestBed.inject(ImagesToWordConverter);
    imagesToExcel = TestBed.inject(ImagesToExcelConverter);
    pdfToTiff = TestBed.inject(PdfToTiffConverter);
    tiffToPdf = TestBed.inject(TiffToPdfConverter);
    svgToPdf = TestBed.inject(SvgToPdfConverter);
    pdfToSvg = TestBed.inject(PdfToSvgConverter);
    pdfToJson = TestBed.inject(PdfToJsonConverter);
    imageFormat = TestBed.inject(ImageFormatService);
    ocr = TestBed.inject(OcrService);

    // A PDF with real vector artwork and coloured text, so PDF to SVG has
    // something other than text to find.
    const doc = await PDFDocument.create();
    doc.setTitle('Vector Sample');
    doc.setAuthor('Fidelity Suite');
    const page = doc.addPage([400, 300]);
    page.drawRectangle({ x: 40, y: 200, width: 120, height: 60, color: rgb(0.2, 0.4, 0.8) });
    page.drawLine({ start: { x: 20, y: 150 }, end: { x: 380, y: 150 }, thickness: 2, color: rgb(0.8, 0.1, 0.1) });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Chart Title', { x: 40, y: 100, size: 14, font, color: rgb(0, 0.4, 0) });
    const page2 = doc.addPage([400, 300]);
    page2.drawText('Second page', { x: 30, y: 250, size: 12, font });
    vectorPdf = new File([await doc.save()], 'vector-sample.pdf', { type: 'application/pdf' });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('J6: images to Word and Excel', () => {
    it('passes the chosen OCR language through to the engine', async () => {
      const spy = vi.spyOn(ocr, 'performOcr').mockResolvedValue(ocrResult('नमस्ते', []));
      const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'hindi.jpg', { type: 'image/jpeg' });

      await imagesToWord.convert(image, { ocrLanguage: 'hin' });

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][1]).toBe('hin');
    });

    it('keeps Devanagari text in the .docx rather than dropping it', async () => {
      vi.spyOn(ocr, 'performOcr').mockResolvedValue(ocrResult('नमस्ते दुनिया', []));
      const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'hindi.jpg', { type: 'image/jpeg' });

      const result = await imagesToWord.convert(image, { ocrLanguage: 'hin' });

      expect(result.success).toBe(true);
      const zip = await JSZip.loadAsync(await result.file!.arrayBuffer());
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toContain('नमस्ते');
    });

    it('warns when OCR confidence is low instead of presenting the text as read', async () => {
      vi.spyOn(ocr, 'performOcr').mockResolvedValue(ocrResult('blurry text', [], 41));
      const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'blurry.jpg', { type: 'image/jpeg' });

      const result = await imagesToWord.convert(image, {});

      expect(result.success).toBe(true);
      expect(result.warnings?.join(' ')).toMatch(/confidence/i);
      expect(result.report?.approximations.join(' ')).toMatch(/41%/);
    });

    it('builds columns from where the words sit, with no delimiters present', async () => {
      // Three columns at x≈10, x≈200 and x≈400, three rows. Nothing in the
      // text has a comma or a tab, so the old delimiter split produced one
      // column per line.
      const words: OcrWord[] = [
        word('Item', 10, 10, 60, 28), word('Qty', 200, 10, 240, 28), word('Price', 400, 10, 450, 28),
        word('Apples', 10, 50, 80, 68), word('10', 200, 50, 225, 68), word('5.00', 400, 50, 445, 68),
        word('Ripe oranges', 10, 90, 150, 108), word('25', 200, 90, 228, 108), word('12.50', 400, 90, 455, 108)
      ];
      vi.spyOn(ocr, 'performOcr').mockResolvedValue(
        ocrResult('Item Qty Price\nApples 10 5.00\nRipe oranges 25 12.50', words)
      );
      const image = new File([new Uint8Array(20)], 'table.png', { type: 'image/png' });

      const result = await imagesToExcel.convert(image, { autoDetectColumns: true });

      expect(result.success).toBe(true);
      const workbook = XLSX.read(new Uint8Array(await result.file!.arrayBuffer()), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<string[]>(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, blankrows: false }
      );

      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual(['Item', 'Qty', 'Price']);
      // Cells stay as the text that was recognized; the sheet does not guess
      // that "5.00" was meant to be a number.
      expect(rows[1]).toEqual(['Apples', '10', '5.00']);
      expect(rows[2]).toEqual(['Ripe oranges', '25', '12.50']);
      expect(result.report?.tablesDetected).toBe(1);
      expect(result.report?.approximations.join(' ')).toContain('word positions');
    });

    it('falls back to delimiters when layout detection is switched off', async () => {
      const words: OcrWord[] = [
        word('A', 10, 10, 30, 28), word('B', 200, 10, 220, 28)
      ];
      vi.spyOn(ocr, 'performOcr').mockResolvedValue(ocrResult('A\tB\nC\tD', words));
      const image = new File([new Uint8Array(20)], 'table.png', { type: 'image/png' });

      const result = await imagesToExcel.convert(image, { autoDetectColumns: false });

      expect(result.report?.approximations.join(' ')).toContain('delimiters');
      const workbook = XLSX.read(new Uint8Array(await result.file!.arrayBuffer()), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<string[]>(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, blankrows: false }
      );
      expect(rows).toEqual([['A', 'B'], ['C', 'D']]);
    });
  });

  describe('J7: PDF and TIFF', () => {
    it('writes a TIFF whose compression tag matches its bytes', async () => {
      for (const compression of ['none', 'lzw', 'g4'] as const) {
        const result = await pdfToTiff.convert(vectorPdf, { dpi: 72, compression });
        expect(result.success, compression).toBe(true);

        const pages = imageFormat.decodeTiffPages(await result.file!.arrayBuffer());
        expect(pages.length, compression).toBe(2);
        expect(pages[0].compression, compression).toBe(
          compression === 'g4' ? 4 : compression === 'lzw' ? 5 : 1
        );
        expect(pages[0].unsupported, compression).toBeUndefined();
      }
    });

    it('writes the requested DPI and sizes the raster to match', async () => {
      const low = await pdfToTiff.convert(vectorPdf, { dpi: 72, compression: 'none' });
      const high = await pdfToTiff.convert(vectorPdf, { dpi: 150, compression: 'lzw' });

      const lowPages = imageFormat.decodeTiffPages(await low.file!.arrayBuffer());
      const highPages = imageFormat.decodeTiffPages(await high.file!.arrayBuffer());

      expect(lowPages[0].dpi).toBe(72);
      expect(highPages[0].dpi).toBe(150);
      // 400pt at 150 DPI is 833px, not 400px.
      expect(lowPages[0].width).toBe(400);
      expect(highPages[0].width).toBe(Math.round(400 * (150 / 72)));
    });

    it('says in the report that G4 thresholded the page', async () => {
      const result = await pdfToTiff.convert(vectorPdf, { dpi: 72, compression: 'g4' });
      expect(result.report?.approximations.join(' ')).toMatch(/1-bit|thresholded/i);
    });

    it('sizes PDF pages from the TIFF\'s own resolution', async () => {
      // 600x900px at 300 DPI is a 2x3 inch page: 144x216pt, not 600x900pt.
      const tiff = imageFormat.encodeMultiPageTiff([solidFrame(600, 900)], { dpi: 300 });
      const file = new File([tiff], 'scan.tiff', { type: 'image/tiff' });

      const result = await tiffToPdf.convert(file, { format: 'Original' });

      expect(result.success).toBe(true);
      const sizes = await pageSizes(new Uint8Array(await result.file!.arrayBuffer()));
      expect(Math.round(sizes[0].width)).toBe(144);
      expect(Math.round(sizes[0].height)).toBe(216);
    });

    it('fits the scan onto A4 when a sheet size is chosen', async () => {
      const tiff = imageFormat.encodeMultiPageTiff([solidFrame(600, 900)], { dpi: 300 });
      const file = new File([tiff], 'scan.tiff', { type: 'image/tiff' });

      const result = await tiffToPdf.convert(file, { format: 'A4', orientation: 'Portrait' });

      const sizes = await pageSizes(new Uint8Array(await result.file!.arrayBuffer()));
      expect(Math.round(sizes[0].width)).toBe(595);
      expect(Math.round(sizes[0].height)).toBe(842);
    });

    it('turns a landscape scan sideways under Auto orientation', async () => {
      const tiff = imageFormat.encodeMultiPageTiff([solidFrame(900, 600)], { dpi: 300 });
      const file = new File([tiff], 'wide.tiff', { type: 'image/tiff' });

      const result = await tiffToPdf.convert(file, { format: 'Letter', orientation: 'Auto' });

      const sizes = await pageSizes(new Uint8Array(await result.file!.arrayBuffer()));
      expect(Math.round(sizes[0].width)).toBe(792);
      expect(Math.round(sizes[0].height)).toBe(612);
    });

    it('keeps every page of a multi-page TIFF', async () => {
      const tiff = imageFormat.encodeMultiPageTiff(
        [solidFrame(100, 150), solidFrame(120, 90), solidFrame(80, 80)],
        { dpi: 72, compression: 'lzw' }
      );
      const file = new File([tiff], 'three.tiff', { type: 'image/tiff' });

      const result = await tiffToPdf.convert(file, { format: 'Original' });
      const sizes = await pageSizes(new Uint8Array(await result.file!.arrayBuffer()));

      expect(sizes.length).toBe(3);
      expect(Math.round(sizes[0].height)).toBe(150);
      expect(Math.round(sizes[1].width)).toBe(120);
      expect(result.report?.pagesRasterized).toBe(3);
    });

    it('reports a page it could not decode instead of a silent blank', async () => {
      // Rewrite the Compression tag to a scheme nothing supports (JPEG, 7).
      const tiff = await imageFormat
        .encodeMultiPageTiff([solidFrame(40, 30)], { dpi: 72 })
        .arrayBuffer();
      const bytes = new Uint8Array(tiff);
      const view = new DataView(bytes.buffer);
      const ifd = view.getUint32(4, true);
      const count = view.getUint16(ifd, true);
      for (let e = 0; e < count; e++) {
        const at = ifd + 2 + e * 12;
        if (view.getUint16(at, true) === 259) view.setUint32(at + 8, 7, true);
      }
      const file = new File([bytes], 'jpeg-in-tiff.tiff', { type: 'image/tiff' });

      const result = await tiffToPdf.convert(file, {});

      expect(result.success).toBe(true);
      expect(result.report?.droppedElements.join(' ')).toMatch(/could not be decoded/i);
      expect(result.warnings?.join(' ')).toMatch(/blank/i);
    });
  });

  describe('J8: SVG and PDF', () => {
    it('honours group transforms instead of stacking shapes at the origin', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <g transform="translate(100 50)">
          <rect x="0" y="0" width="40" height="20" fill="#ff0000" />
        </g>
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'grouped.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));
      expect(paths.length).toBe(1);

      // 200 user units over a 150pt page is 0.75pt per unit. The rect's left
      // edge sits at user x=100, so 75pt; its top at user y=50 is 150-37.5pt.
      expect(paths[0].minX).toBeCloseTo(75, 0);
      expect(paths[0].maxX).toBeCloseTo(105, 0);
      expect(paths[0].maxY).toBeCloseTo(112.5, 0);
      expect(paths[0].fill).toBe('#ff0000');
    });

    it('applies a viewBox origin offset', async () => {
      const shifted = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="50 50 100 100">
        <rect x="50" y="50" width="20" height="20" fill="#0000ff" />
      </svg>`;
      const result = await svgToPdf.convert(new File([shifted], 'shifted.svg', { type: 'image/svg+xml' }));
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));

      // The rect is at the viewBox's own origin, so it must land top-left.
      expect(paths[0].minX).toBeCloseTo(0, 1);
      expect(paths[0].maxY).toBeCloseTo(75, 1);
    });

    it('parses rgb(), hsl() and named colours rather than painting them black', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
        <rect x="0" y="0" width="50" height="50" fill="rgb(255, 0, 0)" />
        <rect x="60" y="0" width="50" height="50" fill="tomato" />
        <rect x="120" y="0" width="50" height="50" fill="hsl(120, 100%, 50%)" />
        <rect x="180" y="0" width="50" height="50" style="fill: #00f" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'colours.svg', { type: 'image/svg+xml' }));
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));

      expect(paths.map(p => p.fill)).toEqual(['#ff0000', '#ff6347', '#00ff00', '#0000ff']);
    });

    it('draws shapes in document order', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <circle cx="50" cy="50" r="40" fill="#111111" />
        <rect x="0" y="0" width="10" height="10" fill="#222222" />
        <polygon points="80,80 95,80 95,95" fill="#333333" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'order.svg', { type: 'image/svg+xml' }));
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));

      expect(paths.map(p => p.fill)).toEqual(['#111111', '#222222', '#333333']);
    });

    it('draws ellipses, lines and polylines that were previously ignored', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <ellipse cx="50" cy="50" rx="40" ry="20" fill="#aa0000" />
        <line x1="10" y1="100" x2="190" y2="100" stroke="#00aa00" stroke-width="3" />
        <polyline points="10,150 50,120 90,160" fill="none" stroke="#0000aa" stroke-width="2" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'shapes.svg', { type: 'image/svg+xml' }));
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));

      expect(paths.length).toBe(3);
      expect(paths[0].fill).toBe('#aa0000');
      expect(paths[1].stroke).toBe('#00aa00');
      expect(paths[2].stroke).toBe('#0000aa');
      expect(paths[2].fill).toBe('none');
    });

    it('records the font it substituted for the one the SVG asked for', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
        <text x="10" y="40" font-family="Georgia, serif" font-size="18">Serif heading</text>
        <text x="10" y="80" font-family="Menlo" font-size="12">mono line</text>
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'fonts.svg', { type: 'image/svg+xml' }));

      const substitutions = result.report?.substitutedFonts || [];
      expect(substitutions.some(s => s.original === 'Georgia' && /Times/.test(s.substituted))).toBe(true);
      expect(substitutions.some(s => s.original === 'Menlo' && /Courier/.test(s.substituted))).toBe(true);
    });

    it('reports the characters the built-in fonts cannot draw', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
        <text x="10" y="40" font-size="18">नमस्ते</text>
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'indic.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      expect(result.report?.indicOrRtlWarnings.join(' ')).toMatch(/outside the built-in PDF fonts/i);
    });

    it('approximates a gradient and says so when it cannot rasterize', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <defs>
          <linearGradient id="g"><stop offset="0" stop-color="#000000" /><stop offset="1" stop-color="#ffffff" /></linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#g)" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'gradient.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      expect(result.report?.pagesRasterized).toBe(0);
      expect(result.report?.approximations.join(' ')).toMatch(/gradient/i);
      const paths = await readPaintedPaths(new Uint8Array(await result.file!.arrayBuffer()));
      // The average of black and white, not black.
      expect(paths[0].fill).toBe('#808080');
    });

    it('rasterizes and reports it when a canvas is available', async () => {
      const png = encodeRgbaPng(new Uint8ClampedArray(4 * 4 * 4).fill(240), 4, 4);
      vi.spyOn(svgToPdf as any, 'rasterizeSvgToPng').mockResolvedValue(png);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
        <filter id="b"><feGaussianBlur stdDeviation="4" /></filter>
        <rect width="100" height="60" filter="url(#b)" fill="red" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'filtered.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      expect(result.report?.pagesRasterized).toBe(1);
      expect(result.report?.droppedElements.some(e => e.includes('rasterized'))).toBe(true);
      expect(result.warnings?.join(' ')).toMatch(/image/i);
    });

    it('keeps the SVG\'s own size by default and switches to A4 on request', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="10" height="10" /></svg>`;
      const file = new File([svg], 'sized.svg', { type: 'image/svg+xml' });

      const original = await svgToPdf.convert(file, { format: 'Original' });
      const a4 = await svgToPdf.convert(file, { format: 'A4' });

      const originalSize = (await pageSizes(new Uint8Array(await original.file!.arrayBuffer())))[0];
      const a4Size = (await pageSizes(new Uint8Array(await a4.file!.arrayBuffer())))[0];

      expect(Math.round(originalSize.width)).toBe(225); // 300px at 0.75pt/px
      expect(Math.round(originalSize.height)).toBe(113);
      // A landscape drawing on A4 comes out landscape.
      expect(Math.round(a4Size.width)).toBe(842);
      expect(Math.round(a4Size.height)).toBe(595);
    });

    it('skips an <image> that points at the network', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <image href="https://example.com/logo.png" x="0" y="0" width="50" height="50" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'remote.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      expect(result.report?.droppedElements.join(' ')).toMatch(/external file/i);
    });

    it('embeds an inline <image>', async () => {
      const png = encodeRgbaPng(new Uint8ClampedArray(2 * 2 * 4).fill(10), 2, 2);
      const base64 = Buffer.from(png).toString('base64');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <image href="data:image/png;base64,${base64}" x="10" y="20" width="40" height="30" />
      </svg>`;
      const result = await svgToPdf.convert(new File([svg], 'inline.svg', { type: 'image/svg+xml' }));

      expect(result.success).toBe(true);
      expect(result.report?.droppedElements.length).toBe(0);
      const doc = await PDFDocument.load(new Uint8Array(await result.file!.arrayBuffer()));
      // An embedded bitmap shows up as an XObject in the page resources.
      expect(JSON.stringify(doc.context.enumerateIndirectObjects().length)).not.toBe('0');
    });
  });

  describe('J8: PDF to SVG', () => {
    it('emits the page\'s vector paths, not only its text', async () => {
      const result = await pdfToSvg.convert(vectorPdf, { selectedPages: [1] });

      expect(result.success).toBe(true);
      const svg = await result.file!.text();
      const paths = svg.match(/<path /g) || [];
      expect(paths.length).toBeGreaterThanOrEqual(2);
      // The blue rectangle and the red rule, with their own colours.
      expect(svg).toMatch(/fill="#3366cc"|fill="#3466cc"|fill="#33 ?66cc"/i);
      expect(svg).toMatch(/stroke="#cc1a1a"/i);
    });

    it('keeps text selectable with its real colour', async () => {
      const result = await pdfToSvg.convert(vectorPdf, { selectedPages: [1] });
      const svg = await result.file!.text();

      expect(svg).toContain('Chart Title');
      // Green text, not the hardcoded slate the converter used to emit.
      expect(svg).toMatch(/<text[^>]*fill="#00(66|67)00"/i);
      expect(svg).not.toContain('#111827');
    });

    it('converts only the pages that were selected', async () => {
      const onlySecond = await pdfToSvg.convert(vectorPdf, { selectedPages: [2] });
      expect(onlySecond.file!.name).toMatch(/\.svg$/);
      expect(await onlySecond.file!.text()).toContain('Second page');

      const both = await pdfToSvg.convert(vectorPdf, {});
      expect(both.file!.name).toMatch(/\.zip$/);
      const zip = await JSZip.loadAsync(await both.file!.arrayBuffer());
      expect(Object.keys(zip.files).sort()).toEqual(['page-1.svg', 'page-2.svg']);
    });

    it('produces SVG a parser accepts', async () => {
      const result = await pdfToSvg.convert(vectorPdf, { selectedPages: [1] });
      const parsed = new DOMParser().parseFromString(await result.file!.text(), 'image/svg+xml');

      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(parsed.documentElement.getAttribute('viewBox')).toBe('0 0 400 300');
    });
  });

  describe('J9: PDF to structured JSON', () => {
    const parse = async (file: File) => JSON.parse(await file.text());

    it('states its schema version and coordinate space', async () => {
      const result = await pdfToJson.convert(vectorPdf, {});
      const json = await parse(result.file!);

      expect(json.schemaVersion).toBe('1.1.0');
      expect(json.coordinateSpace).toBe('pdf-points-top-left');
      expect(json.mode).toBe('reflowable');
      expect(json.pages.length).toBe(2);
      expect(json.pages[0].width).toBe(400);
    });

    it('gives positions that match the pdfjs text items', async () => {
      const result = await pdfToJson.convert(vectorPdf, { mode: 'layout-preserving' });
      const json = await parse(result.file!);

      const item = json.pages[0].textItems.find((i: any) => i.text.includes('Chart Title'));
      expect(item).toBeDefined();
      expect(item.x).toBe(40);
      // Drawn at y=100 from the bottom of a 300pt page: 200 from the top.
      expect(item.y).toBe(200);
      expect(item.fontSize).toBe(14);
    });

    it('joins a styled sentence in reflowable mode and leaves the runs apart otherwise', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 200]);
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const times = await doc.embedFont(StandardFonts.TimesRoman);
      /*
       * One baseline, four runs: a change of font or size starts a new item in
       * pdfjs, so this is how an ordinary styled sentence arrives. "Far" sits
       * a long way right, which is a column rather than a continuation.
       */
      page.drawText('Total', { x: 20, y: 150, size: 12, font: helvetica });
      page.drawText('amount', { x: 52, y: 150, size: 12, font: times });
      page.drawText('due', { x: 100, y: 150, size: 18, font: helvetica });
      page.drawText('Far', { x: 220, y: 150, size: 12, font: helvetica });
      const file = new File([await doc.save()], 'runs.pdf', { type: 'application/pdf' });

      const layout = await parse((await pdfToJson.convert(file, { mode: 'layout-preserving' })).file!);
      const reflow = await parse((await pdfToJson.convert(file, { mode: 'reflowable' })).file!);

      expect(layout.pages[0].textItems.map((i: any) => i.text)).toEqual([
        'Total', 'amount', 'due', 'Far'
      ]);
      expect(reflow.pages[0].textItems.map((i: any) => i.text.replace(/\s+/g, ' '))).toEqual([
        'Total amount due', 'Far'
      ]);
    });

    it('drops the metadata block when metadata is switched off', async () => {
      const withMeta = await parse((await pdfToJson.convert(vectorPdf, { includeMetadata: true })).file!);
      const without = await parse((await pdfToJson.convert(vectorPdf, { includeMetadata: false })).file!);

      expect(withMeta.metadata.author).toBe('Fidelity Suite');
      expect(without.metadata.author).toBeUndefined();
      expect(without.metadata.pageCount).toBe(2);
    });

    it('omits detected tables when table detection is switched off', async () => {
      const on = await parse((await pdfToJson.convert(vectorPdf, { includeTables: true })).file!);
      const off = await parse((await pdfToJson.convert(vectorPdf, { includeTables: false })).file!);

      expect(off.pages.every((p: any) => p.tables.length === 0)).toBe(true);
      expect(on.pages[0].tables.length).toBeGreaterThanOrEqual(0);
    });

    it('writes compact output on request', async () => {
      const pretty = await pdfToJson.convert(vectorPdf, { compact: false });
      const compact = await pdfToJson.convert(vectorPdf, { compact: true });

      expect((await compact.file!.text()).includes('\n')).toBe(false);
      expect(compact.file!.size).toBeLessThan(pretty.file!.size);
    });
  });

  describe('J10: the report every converter returns', () => {
    it('describes each conversion rather than returning an empty shell', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="10" height="10" fill="red"/></svg>`;
      const results = [
        await svgToPdf.convert(new File([svg], 'a.svg', { type: 'image/svg+xml' })),
        await pdfToJson.convert(vectorPdf, {}),
        await pdfToSvg.convert(vectorPdf, { selectedPages: [1] }),
        await pdfToTiff.convert(vectorPdf, { dpi: 72, compression: 'none' })
      ];

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.report).toBeDefined();
        expect(Array.isArray(result.report!.approximations)).toBe(true);
        expect(Array.isArray(result.report!.droppedElements)).toBe(true);
        expect(Array.isArray(result.report!.substitutedFonts)).toBe(true);
        expect(typeof result.report!.tablesDetected).toBe('number');
        expect(typeof result.report!.pagesRasterized).toBe('number');
      }
    });
  });
});
