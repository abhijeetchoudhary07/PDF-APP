import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import {
  HeaderFooterConfig,
  HeaderFooterZone
} from '../models/pdf-analysis.types';
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
