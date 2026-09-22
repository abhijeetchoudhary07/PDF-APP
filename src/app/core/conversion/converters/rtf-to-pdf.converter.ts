import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { RtfParserHelper } from '../utils/rtf-parser.helper';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';
import { FileReaderHelper } from '../utils/file-reader.helper';

@Injectable({
  providedIn: 'root'
})
export class RtfToPdfConverter implements IConverter {
  readonly id = 'rtf-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'rtf-to-pdf',
    name: 'RTF to PDF Converter',
    shortTitle: 'RTF to PDF',
    description: 'Convert Rich Text Format (.rtf) documents into formatted PDF files with styles, bold, italic, and alignment.',
    sourceFormats: ['.rtf'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'reader',
    badge: 'Rich Text',
    acceptMimeTypes: 'application/rtf,text/rtf,.rtf',
    limitations: [
      'Preserves text, bold, italic, underline, font sizing, paragraphs, and alignment.',
      'Complex embedded OLE objects or specialized equation fonts are rendered as text.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.rtf') && file.type !== 'application/rtf' && file.type !== 'text/rtf') {
      return { valid: false, error: 'Selected file is not an RTF document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 25,
        stage: 'Reading RTF document stream...',
        message: 'Parsing control words and tokens...'
      });

      const rtfText = await FileReaderHelper.readAsText(file);
      const paragraphs = RtfParserHelper.parse(rtfText);

      if (paragraphs.length === 0) {
        return { success: false, error: 'No readable content could be extracted from this RTF document.' };
      }

      onProgress?.({
        percent: 60,
        stage: 'Laying out formatted paragraphs...',
        message: 'Applying fonts, styles, and alignments...'
      });

      const pdfDoc = await PDFDocument.create();
      const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

      const { width, height } = PdfLayoutHelper.getPageDimensions(options.format, options.orientation);
      const margin = options.margin || 40;
      const printableWidth = width - margin * 2;
      const baseFontSize = options.fontSize || 11;
      const lineHeight = baseFontSize * 1.4;

      let currentPage = pdfDoc.addPage([width, height]);
      let currentY = height - margin - baseFontSize;

      for (const para of paragraphs) {
        const fullParaText = para.spans.map(s => s.text).join('');
        if (!fullParaText.trim()) {
          currentY -= lineHeight * 0.7; // Blank line spacing
          continue;
        }

        // Wrap full paragraph into lines
        const wrappedLines = PdfLayoutHelper.wrapText(fullParaText, normalFont, baseFontSize, printableWidth);

        for (const lineText of wrappedLines) {
          if (currentY < margin + 20) {
            currentPage = pdfDoc.addPage([width, height]);
            currentY = height - margin - baseFontSize;
          }

          // Choose font style based on dominant span or first span
          const firstSpan = para.spans[0] || {};
          let activeFont = normalFont;
          if (firstSpan.bold && firstSpan.italic) activeFont = boldItalicFont;
          else if (firstSpan.bold) activeFont = boldFont;
          else if (firstSpan.italic) activeFont = italicFont;

          const lineWidth = activeFont.widthOfTextAtSize(lineText, baseFontSize);
          let startX = margin;

          if (para.align === 'center') {
            startX = margin + (printableWidth - lineWidth) / 2;
          } else if (para.align === 'right') {
            startX = margin + (printableWidth - lineWidth);
          }

          currentPage.drawText(lineText, {
            x: startX,
            y: currentY,
            size: baseFontSize,
            font: activeFont,
            color: rgb(0.15, 0.15, 0.15),
          });

          currentY -= lineHeight;
        }

        currentY -= lineHeight * 0.3; // Paragraph spacing
      }

      onProgress?.({
        percent: 95,
        stage: 'Saving PDF document...',
        message: 'Writing document...'
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
          paragraphCount: paragraphs.length
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
        error: `Failed to convert RTF to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
