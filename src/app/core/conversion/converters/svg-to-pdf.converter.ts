import { Injectable } from '@angular/core';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { SvgToPdfOptions, ConversionReport } from '../../models/conversion-features.types';
import { PdfLayoutHelper } from '../utils/pdf-layout.helper';
import {
  Matrix,
  IDENTITY,
  applyMatrix,
  ellipseToPath,
  hasSkew,
  matrixRotation,
  matrixScale,
  multiply,
  parsePathData,
  parseTransform,
  pointsToPath,
  rectToPath,
  transformPathData,
  PathSegment
} from '../../utilities/svg-geometry.util';
import {
  Rgba,
  isPaintReference,
  paintReferenceId,
  parseCssColor,
  parseCssLength
} from '../../utilities/css-color.util';

/** CSS px to PDF points: SVG user units are 1/96in, PDF points are 1/72in. */
const PX_TO_PT = 72 / 96;

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792]
};

/** Properties that inherit down the tree, with their initial values. */
interface SvgStyle {
  fill: string;
  stroke: string;
  strokeWidth: string;
  opacity: number;
  fillOpacity: string;
  strokeOpacity: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textAnchor: string;
  color: string;
  display: string;
  visibility: string;
}

const INITIAL_STYLE: SvgStyle = {
  fill: '#000000',
  stroke: 'none',
  strokeWidth: '1',
  opacity: 1,
  fillOpacity: '1',
  strokeOpacity: '1',
  fontFamily: 'Helvetica',
  fontSize: '16',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start',
  color: '#000000',
  display: 'inline',
  visibility: 'visible'
};

/** Elements whose content is a definition, never drawn where it sits. */
const NON_RENDERED = new Set([
  'defs', 'symbol', 'clippath', 'mask', 'filter', 'lineargradient',
  'radialgradient', 'pattern', 'marker', 'metadata', 'title', 'desc', 'style', 'script'
]);

@Injectable({
  providedIn: 'root'
})
export class SvgToPdfConverter implements IConverter {
  readonly id = 'svg-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'svg-to-pdf',
    name: 'SVG to PDF Converter',
    shortTitle: 'SVG to PDF',
    description: 'Convert Scalable Vector Graphics (SVG) into sharp vector-preserved PDF documents with fallback rasterization.',
    sourceFormats: ['.svg'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'shapes',
    badge: 'Vector PDF',
    acceptMimeTypes: 'image/svg+xml',
    supportsTextInput: true,
    limitations: [
      'Keeps paths, rectangles, circles, ellipses, lines, polygons and text as vectors, honouring group transforms, nesting and draw order.',
      'Gradients, patterns, filters, masks and clipping cannot be expressed as PDF vectors, so a drawing using them is rasterized and the fidelity report names what forced it.'
    ],
    disclaimer: 'Pure on-device vector translation. SVG artwork is processed 100% locally.'
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      return { valid: false, error: 'Selected file is not an SVG image.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: SvgToPdfOptions = {},
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

    try {
      onProgress?.({ percent: 15, stage: 'Reading SVG content...' });
      const svgText = await file.text();

      if (!svgText.trim().startsWith('<') || !svgText.includes('<svg')) {
        return { success: false, error: 'Invalid SVG file structure.', report };
      }

      onProgress?.({ percent: 30, stage: 'Analyzing SVG vector elements...' });

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        return { success: false, error: `Malformed SVG: ${parseError.textContent}`, report };
      }

      const svgEl = doc.querySelector('svg');
      if (!svgEl) {
        return { success: false, error: 'No <svg> root element found.', report };
      }

      const geometry = this.resolveDocumentSize(svgEl, options);
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([geometry.pageWidth, geometry.pageHeight]);

      // Anything referencing a gradient, pattern, filter, mask or clip path
      // cannot be reproduced with PDF vector operators, so the page is
      // rasterized instead of being drawn wrong. The report says which.
      const effects = this.detectUnsupportedEffects(doc);

      if (effects.length > 0) {
        onProgress?.({ percent: 55, stage: 'Rasterizing SVG gradients & effects...' });
        const rasterized = await this.tryRasterize(
          page,
          pdfDoc,
          svgText,
          geometry
        );
        if (rasterized) {
          effects.forEach(effect =>
            report.droppedElements.push(`${effect} rasterized to a page image`)
          );
          report.pagesRasterized = 1;
          warnings.push(
            `This drawing uses ${effects.join(', ').toLowerCase()}, which PDF cannot store as vectors; the page was rendered as an image.`
          );
          return await this.finish(pdfDoc, file, report, warnings, onProgress);
        }

        // No canvas available: draw vectors and be explicit that the
        // unsupported paint was approximated rather than reproduced.
        effects.forEach(effect =>
          report.approximations.push(`${effect} approximated with a flat colour`)
        );
        warnings.push(
          'Gradients and effects were approximated with flat colours because rasterization is unavailable here.'
        );
      }

      onProgress?.({ percent: 60, stage: 'Rendering vector shapes into PDF...' });

      const fonts = await this.loadFonts(pdfDoc);
      const context: RenderContext = {
        page,
        pdfDoc,
        fonts,
        report,
        gradientColors: this.collectGradientColors(doc),
        droppedTextCharacters: 0,
        elementsDrawn: 0
      };

      await this.renderNode(svgEl, geometry.contentMatrix, INITIAL_STYLE, context, geometry);

      if (context.droppedTextCharacters > 0) {
        report.indicOrRtlWarnings.push(
          `${context.droppedTextCharacters} character(s) were outside the built-in PDF fonts and were omitted from the text`
        );
        warnings.push(
          `${context.droppedTextCharacters} character(s) could not be drawn with the built-in PDF fonts.`
        );
      }

      if (context.elementsDrawn === 0) {
        report.approximations.push('No drawable geometry was found in the SVG');
        warnings.push('No shapes or text were found to draw; the PDF page is blank.');
      }

      return await this.finish(pdfDoc, file, report, warnings, onProgress);
    } catch (err: any) {
      return {
        success: false,
        error: `SVG to PDF conversion failed: ${err.message || err}`,
        report
      };
    }
  }

  private async finish(
    pdfDoc: PDFDocument,
    file: File,
    report: ConversionReport,
    warnings: string[],
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    onProgress?.({ percent: 90, stage: 'Saving PDF file...' });
    const pdfBytes = await pdfDoc.save();
    const outName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
    const outFile = new File([pdfBytes as any], outName, { type: 'application/pdf' });
    onProgress?.({ percent: 100, stage: 'SVG converted to PDF successfully' });
    return {
      success: true,
      file: outFile,
      downloadName: outName,
      warnings: warnings.length ? warnings : undefined,
      report
    };
  }

  /**
   * Page size and the matrix that maps SVG user units onto it.
   *
   * width/height carry units and may disagree with the viewBox; the viewBox's
   * origin is often not 0 0. Both were ignored before, which offset or
   * mis-scaled every drawing that used them.
   */
  private resolveDocumentSize(svgEl: Element, options: SvgToPdfOptions): PageGeometry {
    const viewBox = (svgEl.getAttribute('viewBox') || '')
      .split(/[\s,]+/)
      .map(Number)
      .filter(n => !Number.isNaN(n));
    const hasViewBox = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0;

    const widthAttr = parseCssLength(svgEl.getAttribute('width'), hasViewBox ? viewBox[2] : 0);
    const heightAttr = parseCssLength(svgEl.getAttribute('height'), hasViewBox ? viewBox[3] : 0);

    // Intrinsic size in CSS px, then in points.
    const intrinsicWidth = widthAttr ?? (hasViewBox ? viewBox[2] : 612 / PX_TO_PT);
    const intrinsicHeight = heightAttr ?? (hasViewBox ? viewBox[3] : 792 / PX_TO_PT);

    const userWidth = hasViewBox ? viewBox[2] : intrinsicWidth;
    const userHeight = hasViewBox ? viewBox[3] : intrinsicHeight;
    const userOriginX = hasViewBox ? viewBox[0] : 0;
    const userOriginY = hasViewBox ? viewBox[1] : 0;

    const requested = options.format && options.format !== 'Original' ? options.format : null;
    let pageWidth = Math.max(1, intrinsicWidth * PX_TO_PT);
    let pageHeight = Math.max(1, intrinsicHeight * PX_TO_PT);

    if (requested) {
      const base = PAGE_SIZES[requested] || PAGE_SIZES['A4'];
      const landscape = userWidth > userHeight;
      pageWidth = landscape ? base[1] : base[0];
      pageHeight = landscape ? base[0] : base[1];
    }

    // Fit the user-space box into the page, centred, preserving aspect ratio.
    const scale = Math.min(pageWidth / userWidth, pageHeight / userHeight);
    const offsetX = (pageWidth - userWidth * scale) / 2;
    const offsetY = (pageHeight - userHeight * scale) / 2;

    // Result is still y-down "page user space"; drawSvgPath does the flip.
    const contentMatrix: Matrix = multiply(
      [scale, 0, 0, scale, offsetX, offsetY],
      [1, 0, 0, 1, -userOriginX, -userOriginY]
    );

    return { pageWidth, pageHeight, contentMatrix, userWidth, userHeight };
  }

  private detectUnsupportedEffects(doc: Document): string[] {
    const effects: string[] = [];
    const used = (selector: string) => doc.querySelector(selector) !== null;

    // A definition only matters if something actually paints with it.
    const painted = Array.from(doc.querySelectorAll('*')).some(el => {
      const style = `${el.getAttribute('fill') || ''} ${el.getAttribute('stroke') || ''} ${el.getAttribute('style') || ''}`;
      return style.includes('url(');
    });

    if (painted && (used('linearGradient') || used('radialGradient'))) effects.push('Gradient fills');
    if (painted && used('pattern')) effects.push('Pattern fills');
    if (used('filter')) effects.push('Filter effects');
    if (used('mask')) effects.push('Masks');
    if (used('clipPath') && doc.querySelector('[clip-path]')) effects.push('Clipping paths');
    return effects;
  }

  /** Mid-stop colour per gradient id, used when rasterization is unavailable. */
  private collectGradientColors(doc: Document): Map<string, Rgba> {
    const colors = new Map<string, Rgba>();
    const gradients = doc.querySelectorAll('linearGradient, radialGradient');
    gradients.forEach(gradient => {
      const id = gradient.getAttribute('id');
      if (!id) return;
      const stops = Array.from(gradient.querySelectorAll('stop'));
      const parsed = stops
        .map(stop =>
          parseCssColor(
            stop.getAttribute('stop-color') ||
            this.inlineStyleValue(stop.getAttribute('style'), 'stop-color')
          )
        )
        .filter((c): c is Rgba => c !== null);
      if (parsed.length === 0) return;
      // Average of the stops reads closer to the gradient than its first stop.
      const average = parsed.reduce(
        (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b, a: acc.a + c.a }),
        { r: 0, g: 0, b: 0, a: 0 }
      );
      colors.set(id, {
        r: average.r / parsed.length,
        g: average.g / parsed.length,
        b: average.b / parsed.length,
        a: average.a / parsed.length
      });
    });
    return colors;
  }

  private inlineStyleValue(style: string | null, property: string): string | null {
    if (!style) return null;
    const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
    return match ? match[1].trim() : null;
  }

  private async loadFonts(pdfDoc: PDFDocument): Promise<FontSet> {
    return {
      sans: await pdfDoc.embedFont(StandardFonts.Helvetica),
      sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      sansItalic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      serif: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      serifItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      mono: await pdfDoc.embedFont(StandardFonts.Courier),
      monoBold: await pdfDoc.embedFont(StandardFonts.CourierBold)
    };
  }

  /** Resolves presentation attributes plus inline style over the inherited set. */
  private resolveStyle(el: Element, inherited: SvgStyle): SvgStyle {
    const style = { ...inherited };
    const inline = el.getAttribute('style');

    const read = (property: keyof SvgStyle, attribute: string): string | null =>
      this.inlineStyleValue(inline, attribute) ?? el.getAttribute(attribute);

    const assign = (property: keyof SvgStyle, attribute: string) => {
      const value = read(property, attribute);
      if (value !== null && value !== '' && value !== 'inherit') {
        (style as any)[property] = value;
      }
    };

    assign('fill', 'fill');
    assign('stroke', 'stroke');
    assign('strokeWidth', 'stroke-width');
    assign('fillOpacity', 'fill-opacity');
    assign('strokeOpacity', 'stroke-opacity');
    assign('fontFamily', 'font-family');
    assign('fontSize', 'font-size');
    assign('fontWeight', 'font-weight');
    assign('fontStyle', 'font-style');
    assign('textAnchor', 'text-anchor');
    assign('color', 'color');
    assign('display', 'display');
    assign('visibility', 'visibility');

    const opacityRaw = read('opacity', 'opacity');
    if (opacityRaw !== null && opacityRaw !== '') {
      const parsed = parseFloat(opacityRaw);
      // Group opacity multiplies down the tree.
      if (!Number.isNaN(parsed)) style.opacity = inherited.opacity * Math.max(0, Math.min(1, parsed));
    }

    return style;
  }

  /**
   * Walks the tree in document order so z-order survives the conversion.
   *
   * Async because an inline <image> has to be embedded before the next
   * sibling draws over it; firing those off unawaited let the document save
   * before the image landed.
   */
  private async renderNode(
    el: Element,
    parentMatrix: Matrix,
    parentStyle: SvgStyle,
    context: RenderContext,
    geometry: PageGeometry
  ): Promise<void> {
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
    if (NON_RENDERED.has(tag)) return;

    const style = this.resolveStyle(el, parentStyle);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const matrix = multiply(parentMatrix, parseTransform(el.getAttribute('transform')));

    switch (tag) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch': {
        for (const child of Array.from(el.children)) {
          await this.renderNode(child, matrix, style, context, geometry);
        }
        return;
      }
      case 'use': {
        // A <use> needs the referenced subtree drawn at the use's position.
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        const id = href.startsWith('#') ? href.slice(1) : '';
        const target = id ? el.ownerDocument?.getElementById(id) : null;
        if (!target) {
          context.report.droppedElements.push('A <use> element referenced a missing definition');
          return;
        }
        const x = parseFloat(el.getAttribute('x') || '0') || 0;
        const y = parseFloat(el.getAttribute('y') || '0') || 0;
        const useMatrix = multiply(matrix, [1, 0, 0, 1, x, y]);
        await this.renderNode(target, useMatrix, style, context, geometry);
        return;
      }
      case 'text': {
        this.drawText(el, matrix, style, context);
        return;
      }
      case 'image': {
        await this.drawImage(el, matrix, style, context);
        return;
      }
      default: {
        const segments = this.shapeToSegments(el, tag);
        if (!segments || segments.length === 0) return;
        this.drawShape(segments, matrix, style, context, geometry);
      }
    }
  }

  private shapeToSegments(el: Element, tag: string): PathSegment[] | null {
    const num = (name: string, fallback = 0): number => {
      const parsed = parseFloat(el.getAttribute(name) || '');
      return Number.isNaN(parsed) ? fallback : parsed;
    };

    switch (tag) {
      case 'path': {
        const d = el.getAttribute('d');
        return d ? parsePathData(d) : null;
      }
      case 'rect': {
        const width = num('width');
        const height = num('height');
        if (width <= 0 || height <= 0) return null;
        return rectToPath(num('x'), num('y'), width, height, num('rx'), num('ry'));
      }
      case 'circle': {
        const r = num('r');
        if (r <= 0) return null;
        return ellipseToPath(num('cx'), num('cy'), r, r);
      }
      case 'ellipse': {
        const rx = num('rx');
        const ry = num('ry');
        if (rx <= 0 || ry <= 0) return null;
        return ellipseToPath(num('cx'), num('cy'), rx, ry);
      }
      case 'line': {
        return [
          { type: 'M', points: [num('x1'), num('y1')] },
          { type: 'L', points: [num('x2'), num('y2')] }
        ];
      }
      case 'polyline':
        return pointsToPath(el.getAttribute('points') || '', false);
      case 'polygon':
        return pointsToPath(el.getAttribute('points') || '', true);
      default:
        return null;
    }
  }

  private resolvePaint(
    value: string,
    style: SvgStyle,
    context: RenderContext
  ): Rgba | null {
    if (value === 'currentColor') {
      return parseCssColor(style.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    }
    if (isPaintReference(value)) {
      const id = paintReferenceId(value);
      const gradient = id ? context.gradientColors.get(id) : undefined;
      if (gradient) return gradient;
      // A pattern or missing reference: mid grey beats silent black.
      return { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    }
    return parseCssColor(value);
  }

  private drawShape(
    segments: PathSegment[],
    matrix: Matrix,
    style: SvgStyle,
    context: RenderContext,
    geometry: PageGeometry
  ): void {
    const pathData = transformPathData(segments, matrix);
    if (!pathData) return;

    const fill = this.resolvePaint(style.fill, style, context);
    const stroke = this.resolvePaint(style.stroke, style, context);
    if (!fill && !stroke) return;

    const fillOpacity = this.opacityOf(style.fillOpacity) * style.opacity * (fill?.a ?? 1);
    const strokeOpacity = this.opacityOf(style.strokeOpacity) * style.opacity * (stroke?.a ?? 1);
    const strokeWidth = (parseCssLength(style.strokeWidth, geometry.userWidth) ?? 1) * matrixScale(matrix);

    const drawOptions: Record<string, unknown> = {
      x: 0,
      y: geometry.pageHeight
    };

    if (fill) {
      drawOptions['color'] = rgb(fill.r, fill.g, fill.b);
      drawOptions['opacity'] = fillOpacity;
    }
    if (stroke) {
      drawOptions['borderColor'] = rgb(stroke.r, stroke.g, stroke.b);
      drawOptions['borderWidth'] = Math.max(0.1, strokeWidth);
      drawOptions['borderOpacity'] = strokeOpacity;
    }

    try {
      context.page.drawSvgPath(pathData, drawOptions as any);
      context.elementsDrawn++;
    } catch {
      context.report.droppedElements.push('A path could not be expressed as PDF vectors');
    }
  }

  private opacityOf(value: string): number {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(0, Math.min(1, parsed));
  }

  private drawText(el: Element, matrix: Matrix, style: SvgStyle, context: RenderContext): void {
    const content = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!content) return;

    const safe = PdfLayoutHelper.toDrawableText(content);
    context.droppedTextCharacters += safe.dropped;
    if (!safe.text.trim()) return;

    const x = parseFloat(el.getAttribute('x') || '0') || 0;
    const y = parseFloat(el.getAttribute('y') || '0') || 0;
    const [px, py] = applyMatrix(matrix, x, y);

    const fontSizeUser = parseCssLength(style.fontSize, 16) ?? 16;
    const size = Math.max(1, fontSizeUser * matrixScale(matrix));
    const font = this.pickFont(style, context);

    const fill = this.resolvePaint(style.fill, style, context) ?? { r: 0, g: 0, b: 0, a: 1 };
    const opacity = this.opacityOf(style.fillOpacity) * style.opacity * fill.a;

    // text-anchor shifts the run; PDF always draws from the left edge.
    let anchorShift = 0;
    if (style.textAnchor === 'middle' || style.textAnchor === 'end') {
      const width = font.widthOfTextAtSize(safe.text, size);
      anchorShift = style.textAnchor === 'middle' ? -width / 2 : -width;
    }

    const rotation = matrixRotation(matrix);
    if (hasSkew(matrix)) {
      context.report.approximations.push('Skewed text drawn without the skew');
    }

    try {
      context.page.drawText(safe.text, {
        x: px + anchorShift,
        // The page's own height, not the viewBox: y here is in PDF space.
        y: context.page.getHeight() - py,
        size,
        font,
        color: rgb(fill.r, fill.g, fill.b),
        opacity,
        rotate: degrees(-rotation)
      });
      context.elementsDrawn++;
    } catch {
      context.report.droppedElements.push(`Text "${content.slice(0, 24)}" could not be drawn`);
    }
  }

  private pickFont(style: SvgStyle, context: RenderContext): PDFFont {
    const family = style.fontFamily.toLowerCase();
    const weight = style.fontWeight.toLowerCase();
    const bold = weight === 'bold' || weight === 'bolder' || parseInt(weight, 10) >= 600;
    const italic = style.fontStyle.toLowerCase() === 'italic' || style.fontStyle.toLowerCase() === 'oblique';

    const isMono = /mono|courier|consolas|menlo/.test(family);
    const isSerif = /serif|times|georgia|garamond|book/.test(family) && !/sans/.test(family);

    if (isMono) {
      this.noteSubstitution(style.fontFamily, bold ? 'Courier-Bold' : 'Courier', context);
      return bold ? context.fonts.monoBold : context.fonts.mono;
    }
    if (isSerif) {
      const name = bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
      this.noteSubstitution(style.fontFamily, name, context);
      return bold ? context.fonts.serifBold : italic ? context.fonts.serifItalic : context.fonts.serif;
    }
    const name = bold ? 'Helvetica-Bold' : italic ? 'Helvetica-Oblique' : 'Helvetica';
    this.noteSubstitution(style.fontFamily, name, context);
    return bold ? context.fonts.sansBold : italic ? context.fonts.sansItalic : context.fonts.sans;
  }

  private noteSubstitution(requested: string, used: string, context: RenderContext): void {
    const first = requested.split(',')[0].replace(/['"]/g, '').trim();
    if (!first || first.toLowerCase() === used.toLowerCase()) return;
    const already = context.report.substitutedFonts.some(
      entry => entry.original === first && entry.substituted === used
    );
    if (!already) context.report.substitutedFonts.push({ original: first, substituted: used });
  }

  /** Renders the whole drawing to a bitmap. Returns false without a canvas. */
  private async tryRasterize(
    page: PDFPage,
    pdfDoc: PDFDocument,
    svgText: string,
    geometry: PageGeometry
  ): Promise<boolean> {
    const pngBytes = await this.rasterizeSvgToPng(
      svgText,
      geometry.pageWidth,
      geometry.pageHeight
    );
    if (!pngBytes) return false;

    const embedded = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: geometry.pageWidth,
      height: geometry.pageHeight
    });
    return true;
  }

  /**
   * SVG markup to PNG bytes, or null where that is impossible.
   *
   * Separate from the caller so the rasterizing branch can be exercised in a
   * test: jsdom has no SVG rasterizer, so without a seam here the fallback
   * path would be the only one ever covered.
   */
  protected async rasterizeSvgToPng(
    svgText: string,
    width: number,
    height: number
  ): Promise<Uint8Array | null> {
    const isNodeOrJsdom = typeof process !== 'undefined' && process.versions?.node != null;
    if (isNodeOrJsdom || typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }

    return await new Promise<Uint8Array | null>(resolve => {
      const canvas = document.createElement('canvas');
      // 2x for a crisp raster on a phone screen and in print.
      const scale = 2;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const img = new Image();
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.split(',')[1];
          if (!base64) {
            resolve(null);
            return;
          }
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve(bytes);
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /** Draws an <image> whose data is inline; reports one that is not. */
  private async drawImage(
    el: Element,
    matrix: Matrix,
    style: SvgStyle,
    context: RenderContext
  ): Promise<void> {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
    const width = parseFloat(el.getAttribute('width') || '0') || 0;
    const height = parseFloat(el.getAttribute('height') || '0') || 0;
    if (width <= 0 || height <= 0) return;

    if (!href.startsWith('data:')) {
      // Fetching it would mean a network request from a converter that
      // promises to stay on the device.
      context.report.droppedElements.push(
        'An <image> referencing an external file was skipped; no network requests are made'
      );
      return;
    }

    const match = href.match(/^data:image\/(png|jpe?g);base64,(.*)$/i);
    if (!match) {
      context.report.droppedElements.push('An <image> used an unsupported inline format');
      return;
    }

    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const embedded = /png/i.test(match[1])
        ? await context.pdfDoc.embedPng(bytes)
        : await context.pdfDoc.embedJpg(bytes);

      const x = parseFloat(el.getAttribute('x') || '0') || 0;
      const y = parseFloat(el.getAttribute('y') || '0') || 0;
      const [px, py] = applyMatrix(matrix, x, y);
      const scale = matrixScale(matrix);
      const drawWidth = width * scale;
      const drawHeight = height * scale;

      context.page.drawImage(embedded, {
        x: px,
        // drawImage places the bottom edge; SVG gives the top edge.
        y: context.page.getHeight() - py - drawHeight,
        width: drawWidth,
        height: drawHeight,
        opacity: style.opacity
      });
      context.elementsDrawn++;
    } catch {
      context.report.droppedElements.push('An inline <image> could not be decoded');
    }
  }
}

interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  contentMatrix: Matrix;
  userWidth: number;
  userHeight: number;
}

interface FontSet {
  sans: PDFFont;
  sansBold: PDFFont;
  sansItalic: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

interface RenderContext {
  page: PDFPage;
  pdfDoc: PDFDocument;
  fonts: FontSet;
  report: ConversionReport;
  gradientColors: Map<string, Rgba>;
  droppedTextCharacters: number;
  elementsDrawn: number;
}
