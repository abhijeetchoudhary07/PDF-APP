import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';

@Injectable({
  providedIn: 'root'
})
export class TextToPdfConverter implements IConverter {
  readonly id = 'text-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'text-to-pdf',
    name: 'Text to PDF Converter',
    shortTitle: 'Text to PDF',
    description: 'Convert plain text files (.txt) or typed notes into formatted, multi-page PDF documents.',
    sourceFormats: ['.txt'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'text',
    badge: 'Text to PDF',
    acceptMimeTypes: 'text/plain,.txt',
    supportsTextInput: true,
    limitations: [
      'Converts plain text with customizable fonts, margins, line wrapping, and page numbers.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions & {
      rawText?: string;
      fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier';
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Reading text content...',
        message: 'Loading character stream...'
      });

      let textContent = options.rawText;
      if (!textContent) {
        textContent = await file.text();
      }

      if (!textContent || !textContent.trim()) {
        return { success: false, error: 'No text content found to convert.' };
      }

      onProgress?.({
        percent: 60,
        stage: 'Formatting document pages...',
        message: 'Calculating line breaks and pagination...'
      });

      const pdfDoc = await PDFDocument.create();

      let fontType = StandardFonts.Helvetica;
      if (options.fontFamily === 'TimesRoman') fontType = StandardFonts.TimesRoman;
      if (options.fontFamily === 'Courier') fontType = StandardFonts.Courier;

      await PdfLayoutHelper.renderTextDocument(
        pdfDoc,
        textContent,
        {
          format: options.format || 'A4',
          orientation: options.orientation || 'Portrait',
          margin: options.margin || 40,
          fontSize: options.fontSize || 11,
          lineHeightRatio: 1.4
        },
        fontType
      );

      onProgress?.({
        percent: 95,
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
          characterCount: textContent.length,
          wordCount: textContent.split(/\s+/).filter(w => w.length > 0).length
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
        error: `Failed to convert text to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
