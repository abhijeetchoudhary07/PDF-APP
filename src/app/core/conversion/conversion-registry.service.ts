import { Injectable, inject } from '@angular/core';
import { IConverter } from './converter.interface';
import { ConverterCategory } from './conversion.types';

// Import all 15 converters
import { PdfToPngConverter } from './converters/pdf-to-png.converter';
import { PdfToWordConverter } from './converters/pdf-to-word.converter';
import { PdfToExcelConverter } from './converters/pdf-to-excel.converter';
import { PdfToPptConverter } from './converters/pdf-to-ppt.converter';
import { WordToPdfConverter } from './converters/word-to-pdf.converter';
import { ExcelToPdfConverter } from './converters/excel-to-pdf.converter';
import { PptToPdfConverter } from './converters/ppt-to-pdf.converter';
import { TextToPdfConverter } from './converters/text-to-pdf.converter';
import { RtfToPdfConverter } from './converters/rtf-to-pdf.converter';
import { HtmlToPdfConverter } from './converters/html-to-pdf.converter';
import { CsvToPdfConverter } from './converters/csv-to-pdf.converter';
import { EpubToPdfConverter } from './converters/epub-to-pdf.converter';
import { ZipToPdfConverter } from './converters/zip-to-pdf.converter';
import { OpenDocumentToPdfConverter } from './converters/opendocument-to-pdf.converter';
import { PagesToPdfConverter } from './converters/pages-to-pdf.converter';

@Injectable({
  providedIn: 'root'
})
export class ConversionRegistryService {
  private converters = new Map<string, IConverter>();

  constructor() {
    const pdfToPng = inject(PdfToPngConverter);
    const pdfToWord = inject(PdfToWordConverter);
    const pdfToExcel = inject(PdfToExcelConverter);
    const pdfToPpt = inject(PdfToPptConverter);
    const wordToPdf = inject(WordToPdfConverter);
    const excelToPdf = inject(ExcelToPdfConverter);
    const pptToPdf = inject(PptToPdfConverter);
    const textToPdf = inject(TextToPdfConverter);
    const rtfToPdf = inject(RtfToPdfConverter);
    const htmlToPdf = inject(HtmlToPdfConverter);
    const csvToPdf = inject(CsvToPdfConverter);
    const epubToPdf = inject(EpubToPdfConverter);
    const zipToPdf = inject(ZipToPdfConverter);
    const openDocumentToPdf = inject(OpenDocumentToPdfConverter);
    const pagesToPdf = inject(PagesToPdfConverter);

    const list: IConverter[] = [
      pdfToPng,
      pdfToWord,
      pdfToExcel,
      pdfToPpt,
      wordToPdf,
      excelToPdf,
      pptToPdf,
      textToPdf,
      rtfToPdf,
      htmlToPdf,
      csvToPdf,
      epubToPdf,
      zipToPdf,
      openDocumentToPdf,
      pagesToPdf
    ];

    list.forEach(c => this.converters.set(c.id, c));
  }

  getConverter(id: string): IConverter | undefined {
    return this.converters.get(id);
  }

  getAllConverters(): IConverter[] {
    return Array.from(this.converters.values());
  }

  getConvertersByCategory(category: ConverterCategory): IConverter[] {
    return this.getAllConverters().filter(c => c.metadata.category === category);
  }

  getConvertersBySourceFormat(ext: string): IConverter[] {
    const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return this.getAllConverters().filter(c => c.metadata.sourceFormats.includes(normalized));
  }

  getConvertersByTargetFormat(ext: string): IConverter[] {
    const normalized = ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
    return this.getAllConverters().filter(c => c.metadata.targetFormat.toLowerCase() === normalized);
  }
}
