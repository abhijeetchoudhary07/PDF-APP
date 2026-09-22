import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';

@Injectable({
  providedIn: 'root'
})
export class WordToPdfConverter implements IConverter {
  readonly id = 'word-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'word-to-pdf',
    name: 'Word to PDF Converter',
    shortTitle: 'Word to PDF',
    description: 'Convert Microsoft Word (.docx) documents into clean, paginated PDF files.',
    sourceFormats: ['.docx', '.doc'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'document',
    badge: 'DOCX to PDF',
    acceptMimeTypes: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,application/msword',
    limitations: [
      'Modern Word (.docx) documents are fully supported client-side.',
      'Legacy binary Word 97-2004 (.doc) files require saving as .docx first.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.doc') && !name.endsWith('.docx')) {
      return {
        valid: false,
        error: 'Legacy binary Word (.doc) cannot be rendered client-side. Please open the file in Word and save as modern Word Document (.docx).'
      };
    }
    if (!name.endsWith('.docx')) {
      return { valid: false, error: 'Please select a valid Word (.docx) file.' };
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
        percent: 20,
        stage: 'Reading Word (.docx) document structure...',
        message: 'Parsing OpenXML components...'
      });

      const arrayBuffer = await file.arrayBuffer();

      onProgress?.({
        percent: 50,
        stage: 'Extracting document text and styles...',
        message: 'Converting paragraphs and headings...'
      });

      const result = await mammoth.convertToHtml({ arrayBuffer });
      const rawHtml = result.value;
      const warnings = result.messages.map(m => m.message);

      if (!rawHtml || !rawHtml.trim()) {
        return { success: false, error: 'No readable text could be extracted from this Word document.' };
      }

      onProgress?.({
        percent: 75,
        stage: 'Generating PDF pages...',
        message: 'Formatting page layout, fonts, and margins...'
      });

      const structuredText = HtmlSanitizerHelper.extractStructuredText(rawHtml);

      const pdfDoc = await PDFDocument.create();
      await PdfLayoutHelper.renderTextDocument(pdfDoc, structuredText, {
        format: options.format || 'A4',
        orientation: options.orientation || 'Portrait',
        margin: options.margin || 40,
        fontSize: options.fontSize || 11
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
        warnings: warnings.length > 0 ? warnings.slice(0, 3) : undefined,
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
        error: `Failed to convert Word to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
