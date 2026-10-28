import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfToSvgOptions, ConversionReport } from '../../models/conversion-features.types';
import { Matrix, IDENTITY, applyMatrix, multiply } from '../../utilities/svg-geometry.util';
import { encodeRgbaPng } from '../../utilities/png-encode.util';

/** pdf.js's compact path encoding (DrawOPS in pdf.mjs). */
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUADRATIC_CURVE_TO = 3;
const DRAW_CLOSE_PATH = 4;

interface GraphicsState {
  ctm: Matrix;
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
  fillAlpha: number;
  strokeAlpha: number;
  dash: number[];
}

interface TextPaint {
  x: number;
  y: number;
  color: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfToSvgConverter implements IConverter {
  readonly id = 'pdf-to-svg';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-svg',
    name: 'PDF to SVG Converter',
    shortTitle: 'PDF to SVG',
    description: 'Convert PDF pages into standalone Scalable Vector Graphics (.svg) files or an archived package.',
    sourceFormats: ['.pdf'],
    targetFormat: 'svg',
    category: 'pdf-to-format',
    icon: 'shapes',
    badge: 'Vector SVG',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Extracts the page\'s vector artwork — filled and stroked paths, rules and shapes — along with positioned, selectable text.',
      'Text keeps its position, size, colour and generic typeface; the font file itself is not copied into the SVG, so the viewer substitutes a local serif, sans or monospace face.',
      'A scanned page has no vectors to extract, so it is embedded as an image and the fidelity report says so.'
    ],
    disclaimer: '100% offline vector decomposition. Your document never leaves your device.'
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PdfToSvgOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const report: ConversionReport = {
      approximations: [],
      droppedElements: [],
      substitutedFonts: [],
      tablesDetected: 0,
      pagesRasterized: 0,
      indicOrRtlWarnings: []
    };
    const warnings: string[] = [];
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;

    try {
      onProgress?.({ percent: 10, stage: 'Loading PDF document...' });

      const arrayBuffer = await file.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file has no pages.', report };
      }

      const requested = (options.selectedPages || [])
        .filter(n => Number.isInteger(n) && n >= 1 && n <= numPages)
        .sort((a, b) => a - b);
      const pageNumbers = requested.length > 0
        ? requested
        : Array.from({ length: numPages }, (_, i) => i + 1);

      const svgStrings: { pageNum: number; content: string }[] = [];

      for (let index = 0; index < pageNumbers.length; index++) {
        const pageNum = pageNumbers[index];
        onProgress?.({
          percent: 15 + Math.floor((index / pageNumbers.length) * 70),
          stage: `Converting page ${pageNum} of ${numPages} to SVG...`,
          currentItem: index + 1,
          totalItems: pageNumbers.length
        });

        const page = await pdf.getPage(pageNum);
        const content = await this.renderPageToSvg(page, report, warnings);
        svgStrings.push({ pageNum, content });
      }

      onProgress?.({ percent: 90, stage: 'Finalizing SVG output...' });

      const baseName = file.name.replace(/\.[^/.]+$/, '');

      if (svgStrings.length === 1) {
        const outName = `${baseName}.svg`;
        const outFile = new File([svgStrings[0].content], outName, { type: 'image/svg+xml' });
        onProgress?.({ percent: 100, stage: 'SVG created successfully' });
        return {
          success: true,
          file: outFile,
          downloadName: outName,
          warnings: warnings.length ? warnings : undefined,
          report
        };
      }

      const zip = new JSZip();
      for (const item of svgStrings) {
        zip.file(`page-${item.pageNum}.svg`, item.content);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const outName = `${baseName}-svg.zip`;
      const outFile = new File([zipBlob], outName, { type: 'application/zip' });

      onProgress?.({ percent: 100, stage: 'Multi-page SVG ZIP created successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        warnings: warnings.length ? warnings : undefined,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `PDF to SVG conversion failed: ${err.message || err}`,
        report
      };
    } finally {
      try {
        await loadingTask?.destroy();
      } catch {
        /* nothing to release */
      }
    }
  }

  private async renderPageToSvg(
    page: any,
    report: ConversionReport,
    warnings: string[]
  ): Promise<string> {
    const viewport = page.getViewport({ scale: 1.0 });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);

    // pdf.js gives the matrix that maps PDF user space (y up) onto the
    // viewport (y down), rotation included, which is exactly SVG's space.
    const baseMatrix: Matrix = Array.isArray(viewport.transform)
      ? (viewport.transform.slice(0, 6) as Matrix)
      : [1, 0, 0, -1, 0, height];

    const operatorList = await page.getOperatorList().catch(() => null);
    const textContent = await page.getTextContent().catch(() => ({ items: [], styles: {} }));

    const vectors = operatorList
      ? this.extractVectors(operatorList, baseMatrix)
      : { shapes: [], textPaints: [], imageCount: 0 };

    const textElements = this.extractText(
      textContent,
      baseMatrix,
      vectors.textPaints,
      report
    );

    // A page whose only content is an image has nothing to vectorize, so it is
    // embedded as a bitmap rather than returned blank.
    const isScanned = vectors.imageCount > 0 && vectors.shapes.length === 0 && textElements.length === 0;
    let imageElement = '';

    if (isScanned) {
      const raster = await this.rasterizePage(page, viewport);
      if (raster) {
        imageElement =
          `  <image x="0" y="0" width="${width}" height="${height}" ` +
          `href="data:image/png;base64,${raster}" />\n`;
        report.pagesRasterized++;
        if (!warnings.some(w => w.includes('scanned'))) {
          warnings.push('Scanned pages have no vector artwork, so they were embedded as images.');
        }
      } else {
        report.droppedElements.push('A scanned page could not be rasterized and is blank');
      }
    } else if (vectors.imageCount > 0) {
      report.droppedElements.push(
        `${vectors.imageCount} embedded image${vectors.imageCount > 1 ? 's' : ''} on a page with vector content could not be extracted`
      );
    }

    const body = `${imageElement}${vectors.shapes.join('\n')}${vectors.shapes.length ? '\n' : ''}${textElements.join('\n')}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
${body}
</svg>`;
  }

  /**
   * Walks the page's operator list, tracking the graphics state, and turns
   * every painted path into SVG. Without this the converter could only ever
   * emit text, so a chart, a table's rules or a logo came out as a blank page.
   */
  private extractVectors(
    operatorList: { fnArray: number[]; argsArray: any[] },
    baseMatrix: Matrix
  ): { shapes: string[]; textPaints: TextPaint[]; imageCount: number } {
    const OPS = pdfjsLib.OPS as Record<string, number>;
    const shapes: string[] = [];
    const textPaints: TextPaint[] = [];
    let imageCount = 0;

    let state: GraphicsState = {
      ctm: baseMatrix,
      fillColor: '#000000',
      strokeColor: '#000000',
      lineWidth: 1,
      fillAlpha: 1,
      strokeAlpha: 1,
      dash: []
    };
    const stack: GraphicsState[] = [];

    // Text position tracking, only accurate enough to attach a colour to a run.
    let textMatrix: Matrix = IDENTITY;
    let leading = 0;

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      switch (fn) {
        case OPS['save']:
          stack.push({ ...state, dash: [...state.dash] });
          break;
        case OPS['restore']: {
          const previous = stack.pop();
          if (previous) state = previous;
          break;
        }
        case OPS['transform']:
          if (args && args.length >= 6) {
            state.ctm = multiply(state.ctm, [args[0], args[1], args[2], args[3], args[4], args[5]]);
          }
          break;
        case OPS['setFillRGBColor']:
          state.fillColor = this.toCssColor(args?.[0]) ?? state.fillColor;
          break;
        case OPS['setStrokeRGBColor']:
          state.strokeColor = this.toCssColor(args?.[0]) ?? state.strokeColor;
          break;
        case OPS['setFillGray']:
          state.fillColor = this.grayToCss(args?.[0]);
          break;
        case OPS['setStrokeGray']:
          state.strokeColor = this.grayToCss(args?.[0]);
          break;
        case OPS['setFillCMYKColor']:
          state.fillColor = this.cmykToCss(args);
          break;
        case OPS['setStrokeCMYKColor']:
          state.strokeColor = this.cmykToCss(args);
          break;
        case OPS['setLineWidth']:
          state.lineWidth = typeof args?.[0] === 'number' ? args[0] : state.lineWidth;
          break;
        case OPS['setDash']:
          state.dash = Array.isArray(args?.[0]) ? args[0].filter((n: any) => typeof n === 'number') : [];
          break;
        case OPS['setFillAlpha']:
          state.fillAlpha = typeof args?.[0] === 'number' ? args[0] : 1;
          break;
        case OPS['setStrokeAlpha']:
          state.strokeAlpha = typeof args?.[0] === 'number' ? args[0] : 1;
          break;
        case OPS['constructPath']: {
          const shape = this.pathToSvg(args, state);
          if (shape) shapes.push(shape);
          break;
        }
        case OPS['paintImageXObject']:
        case OPS['paintInlineImageXObject']:
        case OPS['paintImageMaskXObject']:
          imageCount++;
          break;
        case OPS['beginText']:
          textMatrix = IDENTITY;
          break;
        case OPS['setTextMatrix']:
          if (args && args.length >= 6) {
            textMatrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
          }
          break;
        case OPS['setLeading']:
          leading = typeof args?.[0] === 'number' ? args[0] : leading;
          break;
        case OPS['moveText']:
          if (args && args.length >= 2) {
            textMatrix = multiply(textMatrix, [1, 0, 0, 1, args[0], args[1]]);
          }
          break;
        case OPS['nextLine']:
          textMatrix = multiply(textMatrix, [1, 0, 0, 1, 0, -leading]);
          break;
        case OPS['showText']:
        case OPS['showSpacedText']:
          textPaints.push({ x: textMatrix[4], y: textMatrix[5], color: state.fillColor });
          break;
        default:
          break;
      }
    }

    return { shapes, textPaints, imageCount };
  }

  /** One constructPath operator to one `<path>` element. */
  private pathToSvg(args: any, state: GraphicsState): string | null {
    if (!Array.isArray(args) || args.length < 2) return null;
    const paintOp = args[0];
    const pathData = args[1];
    if (!pathData) return null;

    const OPS = pdfjsLib.OPS as Record<string, number>;
    const streams: ArrayLike<number>[] = Array.isArray(pathData) ? pathData : [pathData];
    const parts: string[] = [];
    const round = (n: number) => (Math.abs(n) < 1e-4 ? 0 : Math.round(n * 100) / 100);
    const point = (x: number, y: number): string => {
      const [px, py] = applyMatrix(state.ctm, x, y);
      return `${round(px)} ${round(py)}`;
    };

    for (const stream of streams) {
      const values = stream as ArrayLike<number>;
      let i = 0;
      while (i < values.length) {
        const op = values[i++];
        switch (op) {
          case DRAW_MOVE_TO:
            parts.push(`M${point(values[i], values[i + 1])}`);
            i += 2;
            break;
          case DRAW_LINE_TO:
            parts.push(`L${point(values[i], values[i + 1])}`);
            i += 2;
            break;
          case DRAW_CURVE_TO:
            parts.push(
              `C${point(values[i], values[i + 1])} ${point(values[i + 2], values[i + 3])} ${point(values[i + 4], values[i + 5])}`
            );
            i += 6;
            break;
          case DRAW_QUADRATIC_CURVE_TO:
            parts.push(
              `Q${point(values[i], values[i + 1])} ${point(values[i + 2], values[i + 3])}`
            );
            i += 4;
            break;
          case DRAW_CLOSE_PATH:
            parts.push('Z');
            break;
          default:
            // An encoding we do not know: abandon this subpath rather than
            // emitting coordinates read at the wrong offset.
            i = values.length;
            break;
        }
      }
    }

    if (parts.length === 0) return null;

    const isFill = paintOp === OPS['fill'] || paintOp === OPS['eoFill'] || paintOp === OPS['fillStroke'] ||
      paintOp === OPS['eoFillStroke'] || paintOp === OPS['closeFillStroke'] || paintOp === OPS['closeEOFillStroke'];
    const isStroke = paintOp === OPS['stroke'] || paintOp === OPS['closeStroke'] ||
      paintOp === OPS['fillStroke'] || paintOp === OPS['eoFillStroke'] ||
      paintOp === OPS['closeFillStroke'] || paintOp === OPS['closeEOFillStroke'];
    const isEvenOdd = paintOp === OPS['eoFill'] || paintOp === OPS['eoFillStroke'] || paintOp === OPS['closeEOFillStroke'];

    if (!isFill && !isStroke) return null;

    // The CTM scales the pen too, so a hairline in a scaled group stays hairline.
    const scale = (Math.hypot(state.ctm[0], state.ctm[1]) + Math.hypot(state.ctm[2], state.ctm[3])) / 2;
    const strokeWidth = Math.max(0.1, (state.lineWidth || 1) * scale);

    const attributes = [
      `d="${parts.join(' ')}"`,
      isFill ? `fill="${state.fillColor}"` : 'fill="none"',
      isEvenOdd ? 'fill-rule="evenodd"' : '',
      state.fillAlpha < 1 && isFill ? `fill-opacity="${this.roundAlpha(state.fillAlpha)}"` : '',
      isStroke ? `stroke="${state.strokeColor}"` : '',
      isStroke ? `stroke-width="${Math.round(strokeWidth * 100) / 100}"` : '',
      isStroke && state.strokeAlpha < 1 ? `stroke-opacity="${this.roundAlpha(state.strokeAlpha)}"` : '',
      isStroke && state.dash.length ? `stroke-dasharray="${state.dash.map(n => Math.round(n * scale * 100) / 100).join(' ')}"` : ''
    ].filter(Boolean);

    return `  <path ${attributes.join(' ')} />`;
  }

  /** Positioned, selectable text with its real colour and generic typeface. */
  private extractText(
    textContent: any,
    baseMatrix: Matrix,
    textPaints: TextPaint[],
    report: ConversionReport
  ): string[] {
    const elements: string[] = [];
    const styles = textContent?.styles || {};
    const notedFamilies = new Set<string>();

    for (const item of textContent?.items || []) {
      if (!('str' in item) || typeof item.str !== 'string' || item.str.length === 0) continue;
      if (!item.str.trim()) continue;

      const tx = item.transform as number[];
      if (!tx || tx.length < 6) continue;

      // The text's own matrix maps its baseline origin; compose it with the
      // page matrix so rotated pages land correctly.
      const [x, y] = applyMatrix(baseMatrix, tx[4], tx[5]);
      const fontSize = Math.hypot(tx[0], tx[1]) || Math.abs(tx[3]) || 10;

      const style = styles[item.fontName] || {};
      const family = this.normalizeFontFamily(style.fontFamily);
      if (style.fontFamily && !notedFamilies.has(style.fontFamily)) {
        notedFamilies.add(style.fontFamily);
        report.substitutedFonts.push({
          original: String(style.fontFamily),
          substituted: family
        });
      }

      const color = this.colorForText(tx[4], tx[5], textPaints);
      const rotation = (Math.atan2(tx[1], tx[0]) * 180) / Math.PI;
      const transform = Math.abs(rotation) > 0.5
        ? ` transform="rotate(${Math.round(-rotation * 100) / 100} ${this.round(x)} ${this.round(y)})"`
        : '';
      const direction = item.dir === 'rtl' ? ' direction="rtl"' : '';

      elements.push(
        `  <text x="${this.round(x)}" y="${this.round(y)}" font-family="${family}" ` +
        `font-size="${Math.round(fontSize * 100) / 100}" fill="${color}"` +
        `${direction}${transform}>${this.escapeXml(item.str)}</text>`
      );
    }

    return elements;
  }

  /** Nearest recorded paint for a text run's origin, else black. */
  private colorForText(x: number, y: number, paints: TextPaint[]): string {
    let best = '#000000';
    let bestDistance = Infinity;
    for (const paint of paints) {
      const distance = Math.abs(paint.x - x) + Math.abs(paint.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = paint.color;
      }
    }
    // Beyond a couple of points the match is a guess, and black is the safer
    // guess than some other run's colour.
    return bestDistance <= 2 ? best : paints.length === 1 ? best : '#000000';
  }

  private normalizeFontFamily(fontFamily: string | undefined): string {
    const value = (fontFamily || '').toLowerCase();
    if (/mono|courier/.test(value)) return 'monospace';
    if (/serif/.test(value) && !/sans/.test(value)) return 'serif';
    if (/sans/.test(value)) return 'sans-serif';
    if (/times|georgia|garamond|book/.test(value)) return 'serif';
    return 'sans-serif';
  }

  /** Renders a page to a base64 PNG, for pages that are pure scans. */
  private async rasterizePage(page: any, viewport: any): Promise<string | null> {
    if (typeof document === 'undefined' || !document.createElement) return null;

    try {
      const scale = 2;
      const scaled = page.getViewport({ scale });
      const width = Math.max(1, Math.round(scaled.width));
      const height = Math.max(1, Math.round(scaled.height));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      await page.render({ canvasContext: ctx, viewport: scaled } as any).promise;
      const imageData = ctx.getImageData(0, 0, width, height);
      if (!imageData) return null;

      const png = encodeRgbaPng(imageData.data, width, height);
      return this.toBase64(png);
    } catch {
      return null;
    }
  }

  private toBase64(bytes: Uint8Array): string {
    if (typeof btoa === 'function') {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
      }
      return btoa(binary);
    }
    // Node (tests) has no btoa on older targets.
    return Buffer.from(bytes).toString('base64');
  }

  private toCssColor(value: unknown): string | null {
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) return value.toLowerCase();
    if (Array.isArray(value) && value.length >= 3) {
      const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n)));
      return `#${[value[0], value[1], value[2]]
        .map(c => channel(Number(c)).toString(16).padStart(2, '0'))
        .join('')}`;
    }
    return null;
  }

  private grayToCss(value: unknown): string {
    const gray = typeof value === 'number' ? value : 0;
    const level = Math.max(0, Math.min(255, Math.round(gray * 255)));
    const hex = level.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  private cmykToCss(args: unknown): string {
    const values = Array.isArray(args) ? args.map(Number) : [];
    if (values.length < 4 || values.some(n => Number.isNaN(n))) return '#000000';
    const [c, m, y, k] = values;
    const channel = (component: number) =>
      Math.max(0, Math.min(255, Math.round(255 * (1 - Math.min(1, component + k)))));
    return `#${[channel(c), channel(m), channel(y)]
      .map(n => n.toString(16).padStart(2, '0'))
      .join('')}`;
  }

  private roundAlpha(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
