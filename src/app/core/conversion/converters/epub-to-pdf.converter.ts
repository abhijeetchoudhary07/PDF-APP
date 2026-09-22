import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';
import { PdfLayoutHelper, PageLayoutOptions } from '../utils/pdf-layout.helper';

@Injectable({
  providedIn: 'root'
})
export class EpubToPdfConverter implements IConverter {
  readonly id = 'epub-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'epub-to-pdf',
    name: 'EPUB to PDF Converter',
    shortTitle: 'EPUB to PDF',
    description: 'Convert EPUB e-books (.epub) into paginated PDF documents while preserving chapter hierarchy.',
    sourceFormats: ['.epub'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'book',
    badge: 'E-Book',
    acceptMimeTypes: '.epub,application/epub+zip',
    limitations: [
      'Standard DRM-free EPUB 2 and EPUB 3 books are supported.',
      'DRM-encrypted commercial e-books cannot be decrypted locally.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.epub') && file.type !== 'application/epub+zip') {
      return { valid: false, error: 'Selected file is not an EPUB e-book.' };
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
        percent: 15,
        stage: 'Inspecting EPUB container...',
        message: 'Unzipping package archive...'
      });

      const zip = new JSZip();
      const zipContent = await zip.loadAsync(await file.arrayBuffer());

      // Check for DRM encryption (META-INF/encryption.xml)
      if (zipContent.files['META-INF/encryption.xml']) {
        return {
          success: false,
          error: 'This EPUB file contains DRM encryption and cannot be decrypted without publisher authorization.'
        };
      }

      // Step 1: Find container.xml to locate the .opf rootfile
      const containerFile = zipContent.files['META-INF/container.xml'];
      if (!containerFile) {
        return { success: false, error: 'Invalid EPUB format: missing META-INF/container.xml.' };
      }

      const containerXml = await containerFile.async('string');
      const opfPath = this.extractOpfPath(containerXml);
      if (!opfPath || !zipContent.files[opfPath]) {
        return { success: false, error: 'Could not locate EPUB package metadata (.opf).' };
      }

      onProgress?.({
        percent: 30,
        stage: 'Reading book spine and chapters...',
        message: 'Parsing manifest and reading order...'
      });

      const opfXml = await zipContent.files[opfPath].async('string');
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

      const { spineFiles, bookTitle } = this.parseOpf(opfXml, opfDir);

      if (spineFiles.length === 0) {
        return { success: false, error: 'No readable chapters found in this EPUB.' };
      }

      onProgress?.({
        percent: 45,
        stage: 'Extracting chapter texts...',
        message: 'Processing chapter hierarchy...'
      });

      const fullBookSections: Array<{ title?: string; text: string }> = [];

      for (let i = 0; i < spineFiles.length; i++) {
        const filePath = spineFiles[i];
        const chapterFile = zipContent.files[filePath];
        if (chapterFile) {
          const htmlContent = await chapterFile.async('string');
          const structuredText = HtmlSanitizerHelper.extractStructuredText(htmlContent);
          if (structuredText.trim()) {
            fullBookSections.push({
              title: `Section ${i + 1}`,
              text: structuredText
            });
          }
        }
      }

      if (fullBookSections.length === 0) {
        return { success: false, error: 'Could not extract text from any chapters in this EPUB.' };
      }

      onProgress?.({
        percent: 70,
        stage: 'Generating PDF document...',
        message: 'Formatting pages, margins, and running headers...'
      });

      const pdfDoc = await PDFDocument.create();
      const combinedText = fullBookSections.map(s => s.text).join('\n\n');

      await PdfLayoutHelper.renderTextDocument(
        pdfDoc,
        combinedText,
        {
          format: options.format || 'A4',
          orientation: options.orientation || 'Portrait',
          margin: options.margin || 45,
          fontSize: options.fontSize || 11,
          lineHeightRatio: 1.45
        }
      );

      onProgress?.({
        percent: 95,
        stage: 'Finalizing PDF output...',
        message: 'Saving e-book...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = (bookTitle || file.name.replace(/\.[^/.]+$/, '')).replace(/[^a-zA-Z0-9_-]/g, '_');
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          bookTitle: bookTitle || file.name,
          chaptersCount: fullBookSections.length,
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

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert EPUB to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private extractOpfPath(containerXml: string): string | null {
    const match = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
    return match ? match[1] : null;
  }

  private parseOpf(opfXml: string, opfDir: string): { spineFiles: string[]; bookTitle?: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    // Title
    const titleNode = doc.getElementsByTagName('dc:title')[0] || doc.getElementsByTagName('title')[0];
    const bookTitle = titleNode?.textContent?.trim();

    // Manifest: id -> href
    const manifestMap = new Map<string, string>();
    const itemNodes = doc.getElementsByTagName('item');
    for (let i = 0; i < itemNodes.length; i++) {
      const id = itemNodes[i].getAttribute('id');
      const href = itemNodes[i].getAttribute('href');
      if (id && href) {
        manifestMap.set(id, opfDir + href);
      }
    }

    // Spine: order of idrefs
    const spineFiles: string[] = [];
    const itemrefNodes = doc.getElementsByTagName('itemref');
    for (let i = 0; i < itemrefNodes.length; i++) {
      const idref = itemrefNodes[i].getAttribute('idref');
      if (idref && manifestMap.has(idref)) {
        spineFiles.push(manifestMap.get(idref)!);
      }
    }

    return { spineFiles, bookTitle };
  }
}
