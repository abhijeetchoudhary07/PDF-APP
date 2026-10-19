import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import {
  HeaderFooterConfig,
  HeaderFooterZone
} from '../models/pdf-analysis.types';
import {
  BatesBatchPlan,
  BatesFilePlan,
  BatesOptions,
  BatesOutput,
  BatesPosition,
  NavigationProgress
} from '../models/pdf-navigation.types';
import { PdfRangeParserUtil } from '../utilities/pdf-range-parser.util';

@Injectable({
  providedIn: 'root'
})
export class PdfHeaderFooterService {
  /**
   * Applies headers and footers to a PDF document based on configuration.
   */
  async applyHeaderFooter(
    source: File | ArrayBuffer,
    config: HeaderFooterConfig,
    fileName = 'document.pdf',
    outputFileName = 'document_with_header_footer.pdf'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number; pagesModified: number }> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), {
      ignoreEncryption: true
    });

    const totalPages = pdfDoc.getPageCount();
    const docTitle = pdfDoc.getTitle() || fileName.replace(/\.pdf$/i, '');

    // Map font family
    let fontToEmbed = StandardFonts.Helvetica;
    if (config.fontFamily === 'Helvetica-Bold') fontToEmbed = StandardFonts.HelveticaBold;
    else if (config.fontFamily === 'Times-Roman') fontToEmbed = StandardFonts.TimesRoman;
    else if (config.fontFamily === 'Courier') fontToEmbed = StandardFonts.Courier;

    const embeddedFont = await pdfDoc.embedFont(fontToEmbed);
    const fontColorRgb = this.hexToRgb(config.fontColor || '#333333');

    // Parse targeted pages
    const targetPages = this.resolveTargetPages(config, totalPages);
    let pagesModified = 0;

    const todayStr = new Date().toLocaleDateString();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (!targetPages.has(pageNum)) continue;

      const page = pdfDoc.getPage(pageNum - 1);
      const { width, height } = page.getSize();

      // Determine which header/footer zone to use (first page vs regular)
      const isFirstPage = pageNum === 1;
      let headerZone: HeaderFooterZone = config.header;
      let footerZone: HeaderFooterZone = config.footer;

      if (isFirstPage) {
        if (config.firstPageMode === 'skip') {
          continue; // Skip entirely
        } else if (config.firstPageMode === 'different') {
          headerZone = config.firstPageHeader || config.header;
          footerZone = config.firstPageFooter || config.footer;
        }
      }

      // Calculate dynamic page number
      // If startPageNumber is provided, offset page number
      const displayPageNum = pageNum - 1 + (config.startPageNumber || 1);

      // Render Header Zone
      this.renderZone(
        page,
        headerZone,
        embeddedFont,
        config.fontSize,
        fontColorRgb,
        width,
        height - config.topMargin,
        config.leftMargin,
        config.rightMargin,
        displayPageNum,
        totalPages,
        todayStr,
        fileName,
        docTitle
      );

      // Render Footer Zone
      this.renderZone(
        page,
        footerZone,
        embeddedFont,
        config.fontSize,
        fontColorRgb,
        width,
        config.bottomMargin,
        config.leftMargin,
        config.rightMargin,
        displayPageNum,
        totalPages,
        todayStr,
        fileName,
        docTitle
      );

      pagesModified++;
    }

    const modifiedBytes = await pdfDoc.save({ useObjectStreams: false });
    const blob = new Blob([modifiedBytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    return { file, blob, sizeBytes: file.size, pagesModified };
  }

  /**
   * Resolves template placeholders in text:
   * {page}, {totalPages}, {date}, {filename}, {title}
   */
  resolveTemplate(
    template: string,
    pageNum: number,
    totalPages: number,
    dateStr: string,
    fileName: string,
    title: string
  ): string {
    if (!template) return '';
    return template
      .replace(/\{page\}/gi, String(pageNum))
      .replace(/\{totalPages\}/gi, String(totalPages))
      .replace(/\{total\}/gi, String(totalPages))
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{filename\}/gi, fileName)
      .replace(/\{title\}/gi, title);
  }

  // ════════════════════════════════════════════════════════════════════
  // E3 — Bates numbering
  //
  // Added alongside the header and footer path above, which is unchanged:
  // `applyHeaderFooter` and `resolveTemplate` behave exactly as they always
  // have, and nothing below is reachable from them.
  // ════════════════════════════════════════════════════════════════════

  /** Most pages one Bates run will stamp, so a huge batch cannot hang a phone. */
  readonly MAX_BATES_PAGES = 10000;

  /**
   * One stamp: prefix, the number zero-padded to a fixed width, then suffix.
   *
   * The width is a minimum, never a truncation. A counter that outgrows its
   * width keeps all its digits and the plan reports it, because a Bates series
   * that silently wraps from 999 to 000 is worse than one that prints four
   * digits where three were asked for — these numbers are how a document is
   * referred to afterwards, and they have to stay unique.
   */
  formatBatesNumber(value: number, options: Pick<BatesOptions, 'prefix' | 'suffix' | 'width'>): string {
    const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const width = Math.min(12, Math.max(1, Math.floor(options.width) || 1));
    return `${options.prefix ?? ''}${String(safe).padStart(width, '0')}${options.suffix ?? ''}`;
  }

  /**
   * How a batch of files shares one counter.
   *
   * The counter does **not** restart per document. A three-file batch of 4, 3
   * and 5 pages starting at 1 runs 1-4, 5-7 and 8-12, so the last stamp at
   * width 3 is `012`. A stamp that restarts per file is not a Bates number,
   * and the mistake is invisible until the files have been filed somewhere.
   */
  planBatesBatch(
    files: Array<{ name: string; pageCount: number }>,
    options: BatesOptions
  ): BatesBatchPlan {
    const step = Math.max(1, Math.floor(options.step) || 1);
    const start = Math.max(0, Math.floor(options.startNumber) || 0);

    const plans: BatesFilePlan[] = [];
    let counter = start;
    let totalPages = 0;

    files.forEach((file, index) => {
      const pageCount = Math.max(0, Math.floor(file.pageCount) || 0);
      if (pageCount === 0) {
        plans.push({
          index,
          name: file.name,
          pageCount: 0,
          firstNumber: counter,
          lastNumber: counter,
          firstStamp: '',
          lastStamp: ''
        });
        return;
      }

      const firstNumber = counter;
      const lastNumber = counter + (pageCount - 1) * step;

      plans.push({
        index,
        name: file.name,
        pageCount,
        firstNumber,
        lastNumber,
        firstStamp: this.formatBatesNumber(firstNumber, options),
        lastStamp: this.formatBatesNumber(lastNumber, options)
      });

      counter = lastNumber + step;
      totalPages += pageCount;
    });

    const stamped = plans.filter(plan => plan.pageCount > 0);
    const firstNumber = stamped.length > 0 ? stamped[0].firstNumber : start;
    const lastNumber = stamped.length > 0 ? stamped[stamped.length - 1].lastNumber : start;
    const width = Math.min(12, Math.max(1, Math.floor(options.width) || 1));

    return {
      files: plans,
      totalPages,
      firstNumber,
      lastNumber,
      firstStamp: this.formatBatesNumber(firstNumber, options),
      lastStamp: this.formatBatesNumber(lastNumber, options),
      overflowsWidth: String(lastNumber).length > width
    };
  }

  /** Where a stamp sits on the page, in PDF user space. */
  batesAnchor(
    position: BatesPosition,
    pageWidth: number,
    pageHeight: number,
    textWidth: number,
    options: Pick<BatesOptions, 'marginX' | 'marginY' | 'fontSize'>
  ): { x: number; y: number } {
    const marginX = Math.max(0, options.marginX);
    const marginY = Math.max(0, options.marginY);
    const top = position.startsWith('top');
    const y = top ? pageHeight - marginY - options.fontSize : marginY;

    if (position.endsWith('left')) return { x: marginX, y };
    if (position.endsWith('centre')) return { x: (pageWidth - textWidth) / 2, y };
    return { x: pageWidth - marginX - textWidth, y };
  }

  /**
   * Stamps one document, starting the counter at `startNumber`.
   *
   * The caller passes the number rather than reading it from `options`, which
   * is what lets a batch run this once per file while the counter keeps
   * climbing. `planBatesBatch` works out what each file's start should be.
   */
  async applyBatesNumbering(
    source: File | ArrayBuffer,
    options: BatesOptions,
    startNumber: number,
    outputFileName = 'document_bates.pdf',
    onProgress?: (p: NavigationProgress) => void,
    signal?: AbortSignal
  ): Promise<BatesOutput> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    const total = Math.min(pages.length, this.MAX_BATES_PAGES);
    if (total === 0) throw new Error('This document has no pages.');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const colour = this.hexToRgb(options.fontColor || '#333333');
    const step = Math.max(1, Math.floor(options.step) || 1);

    let firstStamp = '';
    let lastStamp = '';

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Bates numbering cancelled by user.');

      const page = pages[i];
      const { width, height } = page.getSize();
      const stamp = this.formatBatesNumber(startNumber + i * step, options);

      /*
       * The stamp is drawn in the page's own space, so a page carrying a
       * /Rotate shows it turned with the rest of the content rather than
       * floating sideways in a corner. That is the same thing the header and
       * footer path does, and is what keeps a mixed-rotation scan consistent.
       */
      const textWidth = font.widthOfTextAtSize(stamp, options.fontSize);
      const anchor = this.batesAnchor(options.position, width, height, textWidth, options);

      page.drawText(stamp, {
        x: anchor.x,
        y: anchor.y,
        size: options.fontSize,
        font,
        color: rgb(colour.r, colour.g, colour.b)
      });

      if (i === 0) firstStamp = stamp;
      lastStamp = stamp;

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
    }

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    return {
      name: outputFileName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: pages.length,
      firstStamp,
      lastStamp,
      pagesStamped: total
    };
  }

  private renderZone(
    page: PDFPage,
    zone: HeaderFooterZone,
    font: PDFFont,
    fontSize: number,
    color: { r: number; g: number; b: number },
    pageWidth: number,
    baselineY: number,
    leftMargin: number,
    rightMargin: number,
    pageNum: number,
    totalPages: number,
    dateStr: string,
    fileName: string,
    title: string
  ): void {
    // 1. Left
    if (zone.leftText && zone.leftText.trim() !== '') {
      const resolved = this.resolveTemplate(zone.leftText, pageNum, totalPages, dateStr, fileName, title);
      if (resolved) {
        page.drawText(resolved, {
          x: leftMargin,
          y: baselineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b)
        });
      }
    }

    // 2. Center
    if (zone.centerText && zone.centerText.trim() !== '') {
      const resolved = this.resolveTemplate(zone.centerText, pageNum, totalPages, dateStr, fileName, title);
      if (resolved) {
        const textWidth = font.widthOfTextAtSize(resolved, fontSize);
        const x = (pageWidth - textWidth) / 2;
        page.drawText(resolved, {
          x,
          y: baselineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b)
        });
      }
    }

    // 3. Right
    if (zone.rightText && zone.rightText.trim() !== '') {
      const resolved = this.resolveTemplate(zone.rightText, pageNum, totalPages, dateStr, fileName, title);
      if (resolved) {
        const textWidth = font.widthOfTextAtSize(resolved, fontSize);
        const x = pageWidth - rightMargin - textWidth;
        page.drawText(resolved, {
          x,
          y: baselineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b)
        });
      }
    }
  }

  private resolveTargetPages(config: HeaderFooterConfig, totalPages: number): Set<number> {
    const pages = new Set<number>();

    if (config.pageTargetMode === 'all') {
      for (let i = 1; i <= totalPages; i++) pages.add(i);
    } else if (config.pageTargetMode === 'odd') {
      for (let i = 1; i <= totalPages; i += 2) pages.add(i);
    } else if (config.pageTargetMode === 'even') {
      for (let i = 2; i <= totalPages; i += 2) pages.add(i);
    } else if (config.pageTargetMode === 'custom' && config.customPageRange) {
      try {
        const parsed = PdfRangeParserUtil.parse(config.customPageRange, totalPages);
        if (parsed && parsed.length > 0) {
          parsed.forEach(p => pages.add(p));
        } else {
          for (let i = 1; i <= totalPages; i++) pages.add(i);
        }
      } catch {
        for (let i = 1; i <= totalPages; i++) pages.add(i);
      }
    } else {
      for (let i = 1; i <= totalPages; i++) pages.add(i);
    }

    return pages;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const intVal = parseInt(clean, 16);
    if (isNaN(intVal)) return { r: 0.2, g: 0.2, b: 0.2 };
    return {
      r: ((intVal >> 16) & 255) / 255,
      g: ((intVal >> 8) & 255) / 255,
      b: (intVal & 255) / 255
    };
  }
}
