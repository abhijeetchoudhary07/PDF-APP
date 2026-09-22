import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';
import { FileReaderHelper } from '../utils/file-reader.helper';

@Injectable({
  providedIn: 'root'
})
export class HtmlToPdfConverter implements IConverter {
  readonly id = 'html-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'html-to-pdf',
    name: 'HTML to PDF Converter',
    shortTitle: 'HTML to PDF',
    description: 'Convert web pages, HTML files (.html, .htm), or markup into clean, secure PDF documents.',
    sourceFormats: ['.html', '.htm'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'code-working',
    badge: 'Safe HTML',
    acceptMimeTypes: 'text/html,.html,.htm',
    supportsTextInput: true,
    limitations: [
      'Scripts and dangerous elements are stripped to ensure strict client-side security.',
      'Renders headings, paragraphs, tables, lists, and semantic text formatting.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.html') && !name.endsWith('.htm') && file.type !== 'text/html') {
      return { valid: false, error: 'Selected file is not an HTML document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions & {
      rawHtml?: string;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Loading HTML source...',
        message: 'Reading markup content...'
      });

      let rawHtml = options.rawHtml;
      if (!rawHtml) {
        rawHtml = await FileReaderHelper.readAsText(file);
      }

      if (!rawHtml || !rawHtml.trim()) {
        return { success: false, error: 'No HTML content found to convert.' };
      }

      onProgress?.({
        percent: 45,
        stage: 'Sanitizing HTML markup...',
        message: 'Stripping unsafe scripts and sanitizing tags...'
      });

      // Extract safe semantic text blocks
      const structuredText = HtmlSanitizerHelper.extractStructuredText(rawHtml);

      if (!structuredText || !structuredText.trim()) {
        return { success: false, error: 'No readable text content found in this HTML document.' };
      }

      onProgress?.({
        percent: 75,
        stage: 'Laying out PDF pages...',
        message: 'Formatting headings, margins, and typography...'
      });

      const pdfDoc = await PDFDocument.create();
      await PdfLayoutHelper.renderTextDocument(
        pdfDoc,
        structuredText,
        {
          format: options.format || 'A4',
          orientation: options.orientation || 'Portrait',
          margin: options.margin || 40,
          fontSize: options.fontSize || 11,
          lineHeightRatio: 1.45
        }
      );

      onProgress?.({
        percent: 95,
        stage: 'Saving PDF document...',
        message: 'Writing output...'
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
          charCount: structuredText.length
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
        error: `Failed to convert HTML to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
