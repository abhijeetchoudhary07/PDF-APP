import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';

@Injectable({
  providedIn: 'root'
})
export class OpenDocumentToPdfConverter implements IConverter {
  readonly id = 'opendocument-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'opendocument-to-pdf',
    name: 'OpenDocument to PDF Converter',
    shortTitle: 'OpenDocument to PDF',
    description: 'Convert LibreOffice / OpenOffice documents (.odt, .ods, .odp) into clean, standard PDF files.',
    sourceFormats: ['.odt', '.ods', '.odp'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'documents',
    badge: 'ODT / ODS / ODP',
    acceptMimeTypes: '.odt,.ods,.odp,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation',
    limitations: [
      'ODT (Text): Extracts headings, paragraphs, and text styling.',
      'ODS (Spreadsheet): Converts sheets and table data into formatted PDF grids.',
      'ODP (Presentation): Converts slide text and presentation structure into PDF slides.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.odt') && !name.endsWith('.ods') && !name.endsWith('.odp')) {
      return { valid: false, error: 'Selected file is not an OpenDocument file (.odt, .ods, .odp).' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PageLayoutOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'ods') {
        return await this.convertOds(file, options, onProgress);
      } else if (ext === 'odp') {
        return await this.convertOdp(file, options, onProgress);
      } else {
        // Default ODT
        return await this.convertOdt(file, options, onProgress);
      }
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert OpenDocument file: ${e?.message || e.toString()}`
      };
    }
  }

  /**
   * Converts ODT (OpenDocument Text) to PDF.
   */
  private async convertOdt(
    file: File,
    options: PageLayoutOptions,
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    onProgress?.({
      percent: 25,
      stage: 'Reading OpenDocument Text (.odt)...',
      message: 'Unzipping content.xml...'
    });

    const zip = new JSZip();
    const zipContent = await zip.loadAsync(await file.arrayBuffer());
    const contentXmlFile = zipContent.files['content.xml'];

    if (!contentXmlFile) {
      return { success: false, error: 'Invalid ODT archive: missing content.xml.' };
    }

    const xmlText = await contentXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // Extract text from <text:p> and <text:h>
    const paragraphs: string[] = [];
    const elements = xmlDoc.getElementsByTagName('*');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const tag = el.localName || el.tagName;
      if (tag === 'p' || tag === 'h') {
        const text = el.textContent?.trim();
        if (text) paragraphs.push(text);
      }
    }

    if (paragraphs.length === 0) {
      return { success: false, error: 'No readable text found in this ODT document.' };
    }

    onProgress?.({
      percent: 65,
      stage: 'Formatting PDF pages...',
      message: 'Applying typography...'
    });

    const pdfDoc = await PDFDocument.create();
    await PdfLayoutHelper.renderTextDocument(pdfDoc, paragraphs.join('\n\n'), {
      format: options.format || 'A4',
      orientation: options.orientation || 'Portrait',
      margin: options.margin || 40,
      fontSize: options.fontSize || 11
    });

    return this.createPdfResult(pdfDoc, file);
  }

  /**
   * Converts ODS (OpenDocument Spreadsheet) to PDF using SheetJS.
   */
  private async convertOds(
    file: File,
    options: PageLayoutOptions,
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    onProgress?.({
      percent: 25,
      stage: 'Reading OpenDocument Spreadsheet (.ods)...',
      message: 'Parsing sheet data...'
    });

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return { success: false, error: 'No worksheets found in this ODS spreadsheet.' };
    }

    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < wb.SheetNames.length; i++) {
      const sheetName = wb.SheetNames[i];
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (data.length === 0) continue;

      const headers = (data[0] || []).map((h: any) => String(h || ''));
      const rows = data.slice(1).map(row => row.map((c: any) => String(c ?? '')));

      await PdfLayoutHelper.renderTableDocument(
        pdfDoc,
        headers,
        rows,
        {
          format: options.format || 'A4',
          orientation: options.orientation || 'Landscape',
          margin: 30,
          fontSize: 8
        },
        sheetName
      );
    }

    return this.createPdfResult(pdfDoc, file);
  }

  /**
   * Converts ODP (OpenDocument Presentation) to PDF.
   */
  private async convertOdp(
    file: File,
    options: PageLayoutOptions,
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    onProgress?.({
      percent: 25,
      stage: 'Reading OpenDocument Presentation (.odp)...',
      message: 'Parsing slides...'
    });

    const zip = new JSZip();
    const zipContent = await zip.loadAsync(await file.arrayBuffer());
    const contentXmlFile = zipContent.files['content.xml'];

    if (!contentXmlFile) {
      return { success: false, error: 'Invalid ODP archive: missing content.xml.' };
    }

    const xmlText = await contentXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // Extract pages <draw:page>
    const pages = xmlDoc.getElementsByTagNameNS('*', 'page');
    if (pages.length === 0) {
      return { success: false, error: 'No slides found in this ODP presentation.' };
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const slideWidth = 841.89;
    const slideHeight = 473.56;

    for (let i = 0; i < pages.length; i++) {
      const slide = pages[i];
      const page = pdfDoc.addPage([slideWidth, slideHeight]);

      // Draw background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: slideWidth,
        height: slideHeight,
        color: rgb(0.98, 0.98, 1.0),
      });

      // Slide header banner
      page.drawRectangle({
        x: 0,
        y: slideHeight - 8,
        width: slideWidth,
        height: 8,
        color: rgb(0.18, 0.54, 0.34), // OpenOffice green
      });

      // Extract slide texts
      const textEls = slide.getElementsByTagNameNS('*', 'p');
      let currentY = slideHeight - 50;

      for (let t = 0; t < textEls.length; t++) {
        const text = textEls[t].textContent?.trim();
        if (!text || currentY < 40) continue;

        if (t === 0) {
          page.drawText(text, {
            x: 50,
            y: currentY,
            size: 22,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          currentY -= 40;
        } else {
          page.drawText(`•  ${text}`, {
            x: 60,
            y: currentY,
            size: 14,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
          currentY -= 24;
        }
      }

      // Slide footer
      page.drawText(`Slide ${i + 1} of ${pages.length}`, {
        x: slideWidth - 110,
        y: 20,
        size: 10,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    return this.createPdfResult(pdfDoc, file);
  }

  private async createPdfResult(pdfDoc: PDFDocument, originalFile: File): Promise<ConversionResult> {
    const pdfBytes = await pdfDoc.save();
    const baseName = originalFile.name.replace(/\.[^/.]+$/, '') || 'document';
    const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
    const previewUrl = URL.createObjectURL(finalPdf);

    return {
      success: true,
      file: finalPdf,
      previewUrl,
      downloadName: finalPdf.name,
      previewData: {
        pageCount: pdfDoc.getPageCount()
      },
      metadata: {
        name: finalPdf.name,
        type: 'application/pdf',
        sizeBytes: finalPdf.size,
        lastModified: Date.now(),
        extension: 'pdf'
      }
    };
  }
}
