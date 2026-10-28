import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { ImageFormatService } from '../../services/image-format.service';
import { PdfToTiffOptions, ConversionReport } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToTiffConverter implements IConverter {
  readonly id = 'pdf-to-tiff';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-tiff',
    name: 'PDF to Multi-Page TIFF Converter',
    shortTitle: 'PDF to TIFF',
    description: 'Convert PDF pages into a single multi-page TIFF document with selectable DPI and G4/LZW compression.',
    sourceFormats: ['.pdf'],
    targetFormat: 'tiff',
    category: 'pdf-to-format',
    icon: 'images',
    badge: 'Multi-Page TIFF',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Compiles every rendered page into one multi-page TIFF, with the chosen DPI written into the file as its resolution.',
      'CCITT G4 compression converts pages to 1-bit monochrome, which is what legal and government upload portals ask for; LZW keeps full colour.'
    ],
    disclaimer: '100% on-device rasterization. All pages are rendered locally using hardware-accelerated canvas.'
  };

  private imageFormatService = inject(ImageFormatService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PdfToTiffOptions = {},
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

    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;

    try {
      const arrayBuffer = await file.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file contains no pages.', report };
      }

      // The select sends its value as a string, and `'300' / 72` is NaN-free
      // but `Number('300')` is what the scale actually needs.
      const dpi = Math.max(36, Math.min(600, Number(options.dpi) || 150));
      const scale = dpi / 72;
      const frames: { width: number; height: number; data: Uint8ClampedArray }[] = [];
      const blankPages: number[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        onProgress?.({
          percent: Math.floor(((pageNum - 1) / numPages) * 80),
          stage: `Rendering page ${pageNum} of ${numPages} (${dpi} DPI)...`
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));

        let pixelData: Uint8ClampedArray;

        if (typeof document !== 'undefined' && document.createElement) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          let ctx: any = null;
          try {
            ctx = canvas.getContext('2d');
          } catch {
            ctx = null;
          }
          if (ctx) {
            try {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              await (page.render({ canvasContext: ctx, viewport } as any).promise);
              const imgData = ctx.getImageData(0, 0, width, height);
              if (imgData) {
                pixelData = imgData.data;
              } else {
                pixelData = new Uint8ClampedArray(width * height * 4).fill(255);
                blankPages.push(pageNum);
              }
            } catch {
              pixelData = new Uint8ClampedArray(width * height * 4).fill(255);
              blankPages.push(pageNum);
            }
          } else {
            pixelData = new Uint8ClampedArray(width * height * 4).fill(255);
            blankPages.push(pageNum);
          }
        } else {
          // Headless fallback
          pixelData = new Uint8ClampedArray(width * height * 4).fill(255);
          blankPages.push(pageNum);
        }

        frames.push({ width, height, data: pixelData });
        report.pagesRasterized++;
      }

      onProgress?.({ percent: 85, stage: 'Encoding multi-page TIFF file...' });

      const compression = (options.compression || 'none') as 'none' | 'lzw' | 'g4';
      const tiffBlob = this.imageFormatService.encodeMultiPageTiff(frames, {
        compression,
        dpi
      });

      if (compression === 'g4') {
        report.approximations.push(
          'Pages reduced to 1-bit black and white for CCITT G4; greys and colours were thresholded'
        );
      }
      if (blankPages.length > 0) {
        const list = blankPages.slice(0, 5).join(', ');
        report.droppedElements.push(
          `Could not rasterize page${blankPages.length > 1 ? 's' : ''} ${list}${blankPages.length > 5 ? '…' : ''}; included blank`
        );
      }

      const outName = file.name.replace(/\.[^/.]+$/, '') + '.tiff';
      const outFile = new File([tiffBlob], outName, { type: 'image/tiff' });

      onProgress?.({ percent: 100, stage: 'TIFF document compiled successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        warnings: blankPages.length
          ? [`${blankPages.length} page(s) could not be rendered and are blank in the TIFF.`]
          : undefined,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `PDF to TIFF conversion failed: ${err.message || err}`,
        report
      };
    } finally {
      // destroy() lives on the loading task, not on the document proxy; a
      // converter that skips it leaks the worker's copy of every page.
      try {
        await loadingTask?.destroy();
      } catch {
        /* a document that never opened has nothing to release */
      }
    }
  }
}
