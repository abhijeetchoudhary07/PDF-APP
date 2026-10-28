import { Injectable, inject } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { ImageFormatService } from '../../services/image-format.service';
import { TiffToPdfOptions, ConversionReport } from '../../models/conversion-features.types';
import { encodeRgbaPng } from '../../utilities/png-encode.util';

/** Page sizes in PDF points. */
const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792]
};

@Injectable({
  providedIn: 'root'
})
export class TiffToPdfConverter implements IConverter {
  readonly id = 'tiff-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'tiff-to-pdf',
    name: 'TIFF to PDF Converter',
    shortTitle: 'TIFF to PDF',
    description: 'Convert single or multi-page TIFF images into a high-fidelity PDF document preserving page dimensions.',
    sourceFormats: ['.tiff', '.tif'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'images',
    badge: 'Multi-Page to PDF',
    acceptMimeTypes: 'image/tiff',
    limitations: [
      'Each TIFF page becomes one PDF page. "Original" sizing uses the resolution stored in the file, so a 300 DPI scan becomes a correctly sized page rather than an oversized one.',
      'Reads uncompressed, LZW, PackBits, Deflate and CCITT G3/G4 pages, with or without multiple strips.'
    ],
    disclaimer: '100% on-device decoding. Multi-page TIFFs are parsed and merged into PDF locally.'
  };

  private imageFormatService = inject(ImageFormatService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.tiff') && !name.endsWith('.tif') && file.type !== 'image/tiff') {
      return { valid: false, error: 'Selected file is not a TIFF image.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: TiffToPdfOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const report: ConversionReport = {
      approximations: [],
      droppedElements: [],
      substitutedFonts: [],
      tablesDetected: 0,
      pagesRasterized: 0,
      indicOrRtlWarnings: []
    };
    const warnings: string[] = [];

    try {
      onProgress?.({ percent: 10, stage: 'Parsing multi-page TIFF headers...' });

      const buffer = await file.arrayBuffer();
      const frames = this.imageFormatService.decodeTiffPages(buffer);

      if (!frames || frames.length === 0) {
        return { success: false, error: 'No readable image frames found in TIFF file.', report };
      }

      onProgress?.({ percent: 30, stage: `Found ${frames.length} page(s). Initializing PDF...` });

      const pdfDoc = await PDFDocument.create();
      const sizeMode = options.format || 'Original';
      const orientationMode = options.orientation || 'Auto';

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        onProgress?.({
          percent: 30 + Math.floor(((i + 1) / frames.length) * 60),
          stage: `Converting TIFF page ${i + 1} of ${frames.length} to PDF...`
        });

        if (frame.unsupported) {
          report.droppedElements.push(
            `Page ${i + 1} uses TIFF compression ${frame.compression ?? 'unknown'}, which could not be decoded; the page is blank`
          );
          warnings.push(`Page ${i + 1} could not be decoded and was added blank.`);
        }

        const pngBytes = encodeRgbaPng(frame.data.data, frame.width, frame.height);
        const embeddedImage = await pdfDoc.embedPng(pngBytes);

        // "Original" means the size the scan claims to be: pixels divided by
        // the file's own resolution. Without a resolution tag a pixel is a
        // point, which is what the old behaviour did for every file.
        const dpi = frame.dpi && frame.dpi > 0 ? frame.dpi : 72;
        const naturalWidth = (frame.width / dpi) * 72;
        const naturalHeight = (frame.height / dpi) * 72;

        if (sizeMode === 'Original') {
          const landscape = this.wantsLandscape(orientationMode, naturalWidth, naturalHeight);
          const [pageWidth, pageHeight] = landscape && naturalHeight > naturalWidth
            ? [naturalHeight, naturalWidth]
            : [naturalWidth, naturalHeight];
          const page = pdfDoc.addPage([pageWidth, pageHeight]);
          const scale = Math.min(pageWidth / naturalWidth, pageHeight / naturalHeight);
          const drawWidth = naturalWidth * scale;
          const drawHeight = naturalHeight * scale;
          page.drawImage(embeddedImage, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
          });
        } else {
          const base = PAGE_SIZES[sizeMode] || PAGE_SIZES['A4'];
          const landscape = this.wantsLandscape(orientationMode, naturalWidth, naturalHeight);
          const pageWidth = landscape ? base[1] : base[0];
          const pageHeight = landscape ? base[0] : base[1];
          const page = pdfDoc.addPage([pageWidth, pageHeight]);

          // Fit inside the sheet, centred, without distorting the scan.
          const scale = Math.min(pageWidth / naturalWidth, pageHeight / naturalHeight);
          const drawWidth = naturalWidth * scale;
          const drawHeight = naturalHeight * scale;
          page.drawImage(embeddedImage, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
          });
          if (scale < 0.999) {
            report.approximations.push(
              `Page ${i + 1} scaled to ${Math.round(scale * 100)}% to fit ${sizeMode}`
            );
          }
        }

        report.pagesRasterized++;
      }

      onProgress?.({ percent: 95, stage: 'Finalizing PDF bytes...' });
      const pdfBytes = await pdfDoc.save();
      const outName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
      const outFile = new File([pdfBytes as any], outName, { type: 'application/pdf' });

      onProgress?.({ percent: 100, stage: 'TIFF converted to PDF successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        warnings: warnings.length ? warnings : undefined,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `TIFF to PDF conversion failed: ${err.message || err}`,
        report
      };
    }
  }

  private wantsLandscape(mode: string, width: number, height: number): boolean {
    if (mode === 'Landscape') return true;
    if (mode === 'Portrait') return false;
    return width > height;
  }
}
