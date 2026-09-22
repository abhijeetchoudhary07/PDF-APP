import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { FileReaderHelper } from '../utils/file-reader.helper';

@Injectable({
  providedIn: 'root'
})
export class PagesToPdfConverter implements IConverter {
  readonly id = 'pages-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'pages-to-pdf',
    name: 'Apple Pages to PDF Converter',
    shortTitle: 'Pages to PDF',
    description: 'Convert Apple Pages (.pages) documents into PDF format using embedded high-resolution preview vectors.',
    sourceFormats: ['.pages'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'logo-apple',
    badge: 'Apple Pages',
    acceptMimeTypes: '.pages,application/x-iwork-pages-sffpages,application/zip',
    limitations: [
      'Extracts the native high-resolution QuickLook PDF preview embedded in Apple Pages documents.',
      'If the document was saved without QuickLook preview, clear instructions are provided on how to export to PDF in Pages.'
    ],
    disclaimer: 'Apple Pages uses a proprietary binary format. When "Include Preview" is enabled in Pages (the default on macOS/iOS), this converter extracts the exact 100% native vector PDF.'
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pages')) {
      return { valid: false, error: 'Selected file is not an Apple Pages (.pages) document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: any = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 25,
        stage: 'Opening Apple Pages package...',
        message: 'Unzipping container archive...'
      });

      const zip = new JSZip();
      let zipContent: JSZip;

      try {
        const buffer = await FileReaderHelper.readAsArrayBuffer(file);
        zipContent = await zip.loadAsync(buffer);
      } catch (zipErr) {
        return {
          success: false,
          error: 'Could not open this Pages file as a package. In Apple Pages on Mac, go to File > Advanced > Change File Type > Package, or choose File > Export To > PDF.'
        };
      }

      onProgress?.({
        percent: 50,
        stage: 'Locating QuickLook vector preview...',
        message: 'Searching for embedded PDF stream...'
      });

      // Look for embedded preview PDF
      // Possible locations in Pages archives:
      // 'QuickLook/Preview.pdf', 'preview.pdf', 'QuickLook/preview.pdf'
      const pdfEntry = zipContent.files['QuickLook/Preview.pdf'] ||
                       zipContent.files['QuickLook/preview.pdf'] ||
                       zipContent.files['preview.pdf'] ||
                       Object.values(zipContent.files).find(f => f.name.toLowerCase().endsWith('preview.pdf'));

      if (pdfEntry) {
        onProgress?.({
          percent: 80,
          stage: 'Extracting native vector PDF...',
          message: 'Extracting high-resolution document pages...'
        });

        const pdfBytes = await pdfEntry.async('uint8array');
        const baseName = file.name.replace(/\.[^/.]+$/, '') || 'pages_document';
        const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
        const previewUrl = URL.createObjectURL(finalPdf);

        return {
          success: true,
          file: finalPdf,
          previewUrl,
          downloadName: finalPdf.name,
          previewData: {
            source: 'Embedded Native QuickLook PDF',
            fidelity: '100% Vector Original'
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

      // If no PDF preview, check for QuickLook thumbnail images
      const thumbEntry = zipContent.files['QuickLook/Thumbnail.jpg'] ||
                         zipContent.files['preview.jpg'] ||
                         Object.values(zipContent.files).find(f => /thumbnail\.jpe?g$/i.test(f.name));

      if (thumbEntry) {
        onProgress?.({
          percent: 80,
          stage: 'Constructing PDF from QuickLook thumbnail preview...',
          message: 'Embedding preview page...'
        });

        const thumbBytes = await thumbEntry.async('arraybuffer');
        const pdfDoc = await PDFDocument.create();
        const img = await pdfDoc.embedJpg(thumbBytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

        const pdfBytes = await pdfDoc.save();
        const baseName = file.name.replace(/\.[^/.]+$/, '') || 'pages_document';
        const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
        const previewUrl = URL.createObjectURL(finalPdf);

        return {
          success: true,
          file: finalPdf,
          previewUrl,
          downloadName: finalPdf.name,
          warnings: [
            'This Pages document only included a thumbnail preview. To get full multi-page fidelity, enable "Include Preview" in Pages or export directly to PDF.'
          ],
          previewData: {
            source: 'QuickLook Thumbnail Image'
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

      // No preview found in package
      return {
        success: false,
        error: 'This Apple Pages document does not contain an embedded QuickLook preview. In Apple Pages (Mac/iPad/iPhone), please choose File > Export To > PDF, or in File > Advanced ensure "Include Preview" is enabled.'
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert Apple Pages document: ${e?.message || e.toString()}`
      };
    }
  }
}
