import { Injectable, inject } from '@angular/core';
import { IConverter } from './converter.interface';
import { ConverterCategory } from './conversion.types';

// Import all 15 base converters
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

// Import J1 - J5 converters
import { PdfToMarkdownConverter } from './converters/pdf-to-markdown.converter';
import { PdfToHtmlConverter } from './converters/pdf-to-html.converter';
import { PdfToEpubConverter } from './converters/pdf-to-epub.converter';
import { MarkdownToPdfConverter } from './converters/markdown-to-pdf.converter';
import { JsonToPdfConverter } from './converters/json-to-pdf.converter';
import { XmlToPdfConverter } from './converters/xml-to-pdf.converter';
import { YamlToPdfConverter } from './converters/yaml-to-pdf.converter';
import { EmlToPdfConverter } from './converters/eml-to-pdf.converter';
import { MsgToPdfConverter } from './converters/msg-to-pdf.converter';

// Import J6 - J9 converters
import { ImagesToWordConverter } from './converters/images-to-word.converter';
import { ImagesToExcelConverter } from './converters/images-to-excel.converter';
import { PdfToTiffConverter } from './converters/pdf-to-tiff.converter';
import { TiffToPdfConverter } from './converters/tiff-to-pdf.converter';
import { SvgToPdfConverter } from './converters/svg-to-pdf.converter';
import { PdfToSvgConverter } from './converters/pdf-to-svg.converter';
import { PdfToJsonConverter } from './converters/pdf-to-json.converter';

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

    // J1 to J5
    const pdfToMarkdown = inject(PdfToMarkdownConverter);
    const pdfToHtml = inject(PdfToHtmlConverter);
    const pdfToEpub = inject(PdfToEpubConverter);
    const markdownToPdf = inject(MarkdownToPdfConverter);
    const jsonToPdf = inject(JsonToPdfConverter);
    const xmlToPdf = inject(XmlToPdfConverter);
    const yamlToPdf = inject(YamlToPdfConverter);
    const emlToPdf = inject(EmlToPdfConverter);
    const msgToPdf = inject(MsgToPdfConverter);

    // J6 to J9
    const imagesToWord = inject(ImagesToWordConverter);
    const imagesToExcel = inject(ImagesToExcelConverter);
    const pdfToTiff = inject(PdfToTiffConverter);
    const tiffToPdf = inject(TiffToPdfConverter);
    const svgToPdf = inject(SvgToPdfConverter);
    const pdfToSvg = inject(PdfToSvgConverter);
    const pdfToJson = inject(PdfToJsonConverter);

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
      pagesToPdf,
      // J1 to J5
      pdfToMarkdown,
      pdfToHtml,
      pdfToEpub,
      markdownToPdf,
      jsonToPdf,
      xmlToPdf,
      yamlToPdf,
      emlToPdf,
      msgToPdf,
      // J6 to J9
      imagesToWord,
      imagesToExcel,
      pdfToTiff,
      tiffToPdf,
      svgToPdf,
      pdfToSvg,
      pdfToJson
    ];

    list.forEach(c => this.converters.set(c.id, c));
  }

  register(converter: IConverter): void {
    this.converters.set(converter.id, converter);
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
