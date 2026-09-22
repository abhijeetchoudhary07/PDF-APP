import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper } from '../utils/pdf-layout.helper';
import { CsvParserHelper } from '../utils/csv-parser.helper';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';
import { FileReaderHelper } from '../utils/file-reader.helper';

export interface ZipFileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  supported: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ZipToPdfConverter implements IConverter {
  readonly id = 'zip-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'zip-to-pdf',
    name: 'ZIP to PDF Converter',
    shortTitle: 'ZIP to PDF',
    description: 'Inspect ZIP archives, select supported documents and images, and compile them into a unified PDF document.',
    sourceFormats: ['.zip'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'archive',
    badge: 'Archive Compiler',
    acceptMimeTypes: '.zip,application/zip,application/x-zip-compressed',
    limitations: [
      'Extracts and compiles supported files (.jpg, .jpeg, .png, .pdf, .txt, .csv, .html).',
      'Non-document or unsupported binary formats inside the ZIP are safely skipped.'
    ]
  };

  private static readonly SUPPORTED_EXTS = new Set([
    'jpg', 'jpeg', 'png', 'pdf', 'txt', 'csv', 'tsv', 'html', 'htm'
  ]);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.zip') && file.type !== 'application/zip' && file.type !== 'application/x-zip-compressed') {
      return { valid: false, error: 'Selected file is not a ZIP archive.' };
    }
    return { valid: true };
  }

  /**
   * Inspects a ZIP archive and returns metadata for all entries.
   */
  async inspectZip(file: File): Promise<ZipFileInfo[]> {
    const zip = new JSZip();
    const buffer = await FileReaderHelper.readAsArrayBuffer(file);
    const zipContent = await zip.loadAsync(buffer);

    const items: ZipFileInfo[] = [];
    zipContent.forEach((relativePath, entry) => {
      if (!entry.dir && !relativePath.startsWith('__MACOSX') && !relativePath.endsWith('.DS_Store')) {
        const ext = relativePath.split('.').pop()?.toLowerCase() || '';
        const name = relativePath.split('/').pop() || relativePath;
        items.push({
          path: relativePath,
          name,
          extension: ext,
          size: (entry as any)._data?.uncompressedSize || 0,
          supported: ZipToPdfConverter.SUPPORTED_EXTS.has(ext)
        });
      }
    });

    return items;
  }

  async convert(
    file: File,
    options: {
      selectedFilePaths?: string[]; // user-selected paths in order
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 15,
        stage: 'Inspecting ZIP archive...',
        message: 'Analyzing entries...'
      });

      const zip = new JSZip();
      const buffer = await FileReaderHelper.readAsArrayBuffer(file);
      const zipContent = await zip.loadAsync(buffer);

      // Get list of supported files
      const allEntries = await this.inspectZip(file);
      const supportedEntries = allEntries.filter(e => e.supported);

      if (supportedEntries.length === 0) {
        return {
          success: false,
          error: 'No supported documents or images found inside this ZIP archive. Supported formats: .pdf, .jpg, .png, .txt, .csv, .html.'
        };
      }

      // Determine which files to compile and in what order
      let pathsToCompile: string[] = [];
      if (options.selectedFilePaths && options.selectedFilePaths.length > 0) {
        pathsToCompile = options.selectedFilePaths.filter(p => zipContent.files[p]);
      } else {
        pathsToCompile = supportedEntries.map(e => e.path);
      }

      const mergedPdf = await PDFDocument.create();
      let totalPagesAdded = 0;

      for (let i = 0; i < pathsToCompile.length; i++) {
        const path = pathsToCompile[i];
        const entry = zipContent.files[path];
        if (!entry) continue;

        const percent = Math.round(20 + ((i + 1) / pathsToCompile.length) * 70);
        const fileName = path.split('/').pop() || path;
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        onProgress?.({
          percent,
          stage: `Processing ${fileName} (${i + 1}/${pathsToCompile.length})...`,
          currentItem: i + 1,
          totalItems: pathsToCompile.length,
          message: 'Converting and embedding...'
        });

        const entryBuffer = await entry.async('arraybuffer');

        if (ext === 'pdf') {
          // Copy pages from embedded PDF
          const sourcePdf = await PDFDocument.load(entryBuffer, { ignoreEncryption: true });
          const copied = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
          copied.forEach(p => mergedPdf.addPage(p));
          totalPagesAdded += copied.length;
        } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
          // Embed image as page
          const image = ext === 'png'
            ? await mergedPdf.embedPng(entryBuffer)
            : await mergedPdf.embedJpg(entryBuffer);

          const page = mergedPdf.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
          totalPagesAdded++;
        } else if (ext === 'txt') {
          const text = await entry.async('string');
          await PdfLayoutHelper.renderTextDocument(mergedPdf, text, { format: 'A4' });
          totalPagesAdded++;
        } else if (ext === 'csv' || ext === 'tsv') {
          const csvText = await entry.async('string');
          const parsed = CsvParserHelper.parse(csvText);
          await PdfLayoutHelper.renderTableDocument(mergedPdf, parsed.headers, parsed.rows, { format: 'A4' }, fileName);
          totalPagesAdded++;
        } else if (ext === 'html' || ext === 'htm') {
          const htmlText = await entry.async('string');
          const structured = HtmlSanitizerHelper.extractStructuredText(htmlText);
          await PdfLayoutHelper.renderTextDocument(mergedPdf, structured, { format: 'A4' });
          totalPagesAdded++;
        }
      }

      if (totalPagesAdded === 0) {
        return { success: false, error: 'Could not generate any PDF pages from the selected files.' };
      }

      onProgress?.({
        percent: 95,
        stage: 'Finalizing merged PDF document...',
        message: 'Saving compiled archive...'
      });

      const pdfBytes = await mergedPdf.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'archive';
      const finalPdf = new File([pdfBytes as any], `${baseName}_compiled.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          compiledFilesCount: pathsToCompile.length,
          pageCount: mergedPdf.getPageCount()
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
        error: `Failed to compile ZIP to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
