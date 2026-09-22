import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import JSZip from 'jszip';

@Injectable({
  providedIn: 'root'
})
export class PdfToPngConverter implements IConverter {
  readonly id = 'pdf-to-png';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-png',
    name: 'PDF to PNG Converter',
    shortTitle: 'PDF to PNG',
    description: 'Convert PDF pages into high-resolution lossless PNG images with customizable DPI.',
    sourceFormats: ['.pdf'],
    targetFormat: 'png',
    category: 'pdf-to-format',
    icon: 'images',
    badge: 'Lossless',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Very large documents (>100 pages) may take several moments to render at 300 DPI.',
      'Protected/encrypted PDFs must be unlocked before conversion.'
    ]
  };

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
    options: {
      dpi?: number;
      selectedPages?: number[];
      singleZipOutput?: boolean;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file contains no pages.' };
      }

      const dpi = options.dpi || 150;
      // Baseline 72 DPI is scale 1.0; 150 DPI is scale 2.08; 300 DPI is scale 4.16
      const scale = dpi / 72;

      // Determine pages to extract (1-indexed)
      const pagesToProcess: number[] = (options.selectedPages && options.selectedPages.length > 0)
        ? options.selectedPages.filter(p => p >= 1 && p <= numPages)
        : Array.from({ length: numPages }, (_, i) => i + 1);

      const generatedFiles: File[] = [];
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      const totalToProcess = pagesToProcess.length;

      for (let idx = 0; idx < totalToProcess; idx++) {
        const pageNum = pagesToProcess[idx];
        const percent = Math.round(((idx + 1) / totalToProcess) * 100);

        onProgress?.({
          percent,
          stage: `Rendering page ${pageNum} (${idx + 1}/${totalToProcess})`,
          currentItem: idx + 1,
          totalItems: totalToProcess,
          message: `Rendering at ${dpi} DPI...`
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { alpha: true });

        if (ctx) {
          // Transparent / white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;

          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
          if (blob) {
            const pngName = `${baseName}_page_${pageNum}.png`;
            const pngFile = new File([blob], pngName, { type: 'image/png' });
            generatedFiles.push(pngFile);
          }
        }

        // Memory cleanup: zero out canvas dimensions to help GC
        canvas.width = 0;
        canvas.height = 0;
      }

      if (generatedFiles.length === 0) {
        return { success: false, error: 'No PNG images were generated from this PDF.' };
      }

      // If multiple pages and single zip output requested or default bundle
      let finalFile: File;
      let previewUrl: string | undefined;

      if (generatedFiles.length === 1) {
        finalFile = generatedFiles[0];
        previewUrl = URL.createObjectURL(finalFile);
      } else {
        // Create a ZIP bundle of all generated PNGs
        onProgress?.({
          percent: 98,
          stage: 'Packaging images into ZIP archive...',
          message: 'Finalizing download package...'
        });

        const zip = new JSZip();
        for (const img of generatedFiles) {
          zip.file(img.name, img);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        finalFile = new File([zipBlob], `${baseName}_png_images.zip`, { type: 'application/zip' });
        previewUrl = URL.createObjectURL(generatedFiles[0]); // Preview first page
      }

      return {
        success: true,
        file: finalFile,
        files: generatedFiles,
        previewUrl,
        downloadName: finalFile.name,
        metadata: {
          name: finalFile.name,
          type: finalFile.type,
          sizeBytes: finalFile.size,
          lastModified: Date.now(),
          extension: generatedFiles.length === 1 ? 'png' : 'zip'
        }
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to render PDF to PNG: ${e?.message || e.toString()}`
      };
    }
  }
}
