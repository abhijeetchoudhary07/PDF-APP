import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';
import { MarkupToPdfOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class MarkdownToPdfConverter implements IConverter {
  readonly id = 'markdown-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'markdown-to-pdf',
    name: 'Markdown to PDF Converter',
    shortTitle: 'Markdown to PDF',
    description: 'Convert Markdown documents (.md) or typed notes into formatted PDF documents with headings, lists, tables, and code blocks.',
    sourceFormats: ['.md', '.markdown'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'logo-markdown',
    badge: 'Markdown',
    acceptMimeTypes: 'text/markdown,text/plain,.md,.markdown',
    supportsTextInput: true,
    limitations: [
      'Renders headings (#, ##, ###), lists, tables, code blocks, bold/italic, and links into clean PDF pages.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.md') && !name.endsWith('.markdown') && !name.endsWith('.txt') && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      return { valid: false, error: 'Selected file is not a Markdown document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: MarkupToPdfOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Reading Markdown document...',
        message: 'Parsing markdown blocks and syntax...'
      });

      let mdText = options.rawText;
      if (!mdText) {
        mdText = await file.text();
      }

      if (!mdText || !mdText.trim()) {
        return { success: false, error: 'No Markdown content found to convert.' };
      }

      onProgress?.({
        percent: 50,
        stage: 'Formatting document pages...',
        message: 'Laying out headings, tables, code blocks, and lists...'
      });

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(
        options.fontFamily === 'Courier'
          ? StandardFonts.Courier
          : options.fontFamily === 'TimesRoman'
          ? StandardFonts.TimesRoman
          : StandardFonts.Helvetica
      );
      const boldFont = await pdfDoc.embedFont(
        options.fontFamily === 'Courier'
          ? StandardFonts.CourierBold
          : options.fontFamily === 'TimesRoman'
          ? StandardFonts.TimesRomanBold
          : StandardFonts.HelveticaBold
      );
      const codeFont = await pdfDoc.embedFont(StandardFonts.Courier);

      const { width, height } = PdfLayoutHelper.getPageDimensions(options.format, options.orientation);
      const margin = options.margin ?? 40;
      const baseFontSize = options.fontSize ?? 11;
      const printableWidth = width - margin * 2;
      const printableHeight = height - margin * 2;

      let currentPage = pdfDoc.addPage([width, height]);
      let currentY = height - margin;

      const checkNewPage = (neededHeight: number) => {
        if (currentY - neededHeight < margin) {
          currentPage = pdfDoc.addPage([width, height]);
          currentY = height - margin;
        }
      };

      const rawLines = mdText.split(/\r?\n/);
      let inCodeBlock = false;
      let codeLines: string[] = [];

      for (let i = 0; i < rawLines.length; i++) {
        const rawLine = rawLines[i];
        const trimmed = rawLine.trim();

        // 1. Code Blocks
        if (trimmed.startsWith('```')) {
          if (inCodeBlock) {
            // Render collected code lines
            for (const cLine of codeLines) {
              const codeLineHeight = (baseFontSize - 1) * 1.35;
              checkNewPage(codeLineHeight + 4);

              // Background highlight box
              currentPage.drawRectangle({
                x: margin - 2,
                y: currentY - 2,
                width: printableWidth + 4,
                height: codeLineHeight + 2,
                color: rgb(0.96, 0.97, 0.98)
              });

              currentPage.drawText(cLine.slice(0, 85), {
                x: margin + 4,
                y: currentY,
                size: baseFontSize - 1,
                font: codeFont,
                color: rgb(0.15, 0.2, 0.25)
              });
              currentY -= codeLineHeight;
            }
            currentY -= 6;
            inCodeBlock = false;
            codeLines = [];
          } else {
            inCodeBlock = true;
            codeLines = [];
            currentY -= 4;
          }
          continue;
        }

        if (inCodeBlock) {
          codeLines.push(rawLine);
          continue;
        }

        // Blank lines
        if (!trimmed) {
          currentY -= baseFontSize * 0.7;
          continue;
        }

        // 2. Headings (# H1, ## H2, ### H3)
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const hText = headingMatch[2].trim();
          const hSize = level === 1 ? baseFontSize * 1.6 : level === 2 ? baseFontSize * 1.35 : baseFontSize * 1.15;
          const hLineHeight = hSize * 1.4;

          checkNewPage(hLineHeight + 12);
          currentY -= 8;

          currentPage.drawText(hText, {
            x: margin,
            y: currentY,
            size: hSize,
            font: boldFont,
            color: rgb(0.1, 0.15, 0.25)
          });

          // H1 underline
          if (level === 1) {
            currentPage.drawLine({
              start: { x: margin, y: currentY - 4 },
              end: { x: width - margin, y: currentY - 4 },
              thickness: 1,
              color: rgb(0.85, 0.88, 0.92)
            });
            currentY -= 6;
          }

          currentY -= hLineHeight;
          continue;
        }

        // 3. Pipe Tables (| col1 | col2 |)
        if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
          const cells = trimmed
            .split('|')
            .slice(1, -1)
            .map(c => c.trim());

          // Skip separator row (| --- | --- |)
          if (cells.every(c => /^[-:]+$/.test(c))) {
            continue;
          }

          const colCount = Math.max(1, cells.length);
          const colWidth = printableWidth / colCount;
          const rowHeight = baseFontSize * 1.6;

          checkNewPage(rowHeight + 4);

          // Draw row cells
          for (let c = 0; c < colCount; c++) {
            const cellText = cells[c] || '';
            const cellX = margin + c * colWidth;

            // Draw border
            currentPage.drawRectangle({
              x: cellX,
              y: currentY - 4,
              width: colWidth,
              height: rowHeight,
              borderColor: rgb(0.8, 0.85, 0.9),
              borderWidth: 0.5,
              color: rgb(0.98, 0.99, 1.0)
            });

            const maxChars = Math.max(1, Math.floor(colWidth / (baseFontSize * 0.55)));
            currentPage.drawText(cellText.slice(0, maxChars), {
              x: cellX + 4,
              y: currentY + 2,
              size: baseFontSize - 1,
              font,
              color: rgb(0.15, 0.15, 0.15)
            });
          }

          currentY -= rowHeight;
          continue;
        }

        // 4. Bullet & Numbered Lists
        const bulletMatch = trimmed.match(/^[•*–—▪▫○►✔✓\-]\s+(.+)$/);
        const numberMatch = trimmed.match(/^(\d+[\.\)])\s+(.+)$/);

        if (bulletMatch || numberMatch) {
          const itemText = bulletMatch ? bulletMatch[1] : numberMatch![2];
          const marker = bulletMatch ? '•' : numberMatch![1];
          const lineHeight = baseFontSize * 1.4;

          const wrapped = PdfLayoutHelper.wrapText(itemText, font, baseFontSize, printableWidth - 20);

          for (let lineIdx = 0; lineIdx < wrapped.length; lineIdx++) {
            checkNewPage(lineHeight);
            if (lineIdx === 0) {
              currentPage.drawText(marker, {
                x: margin + 4,
                y: currentY,
                size: baseFontSize,
                font: boldFont,
                color: rgb(0.2, 0.4, 0.8)
              });
            }
            currentPage.drawText(wrapped[lineIdx], {
              x: margin + 20,
              y: currentY,
              size: baseFontSize,
              font,
              color: rgb(0.15, 0.15, 0.15)
            });
            currentY -= lineHeight;
          }
          continue;
        }

        // 5. Standard Paragraph Text with Bold / Link support
        const cleanLine = trimmed
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        const wrapped = PdfLayoutHelper.wrapText(cleanLine, font, baseFontSize, printableWidth);
        const pLineHeight = baseFontSize * 1.4;

        for (const wLine of wrapped) {
          checkNewPage(pLineHeight);
          currentPage.drawText(wLine, {
            x: margin,
            y: currentY,
            size: baseFontSize,
            font,
            color: rgb(0.12, 0.12, 0.12)
          });
          currentY -= pLineHeight;
        }
      }

      onProgress?.({
        percent: 92,
        stage: 'Saving PDF document...',
        message: 'Writing PDF output...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          pageCount: pdfDoc.getPageCount(),
          characterCount: mdText.length
        },
        metadata: {
          name: finalPdf.name,
          type: 'application/pdf',
          sizeBytes: finalPdf.size,
          lastModified: Date.now(),
          extension: 'pdf'
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert Markdown to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
