import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from 'pptxgenjs';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToPptConverter implements IConverter {
  readonly id = 'pdf-to-ppt';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-ppt',
    name: 'PDF to PowerPoint Converter',
    shortTitle: 'PDF to PowerPoint',
    description: 'Convert PDF pages into high-fidelity PowerPoint (.pptx) presentation slides.',
    sourceFormats: ['.pdf'],
    targetFormat: 'pptx',
    category: 'pdf-to-format',
    icon: 'easel',
    badge: 'Presentation',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Uses high-fidelity page-as-slide rendering to accurately preserve the exact layout, colors, equations, and fonts of the original PDF.',
      'Individual vector shapes are preserved as visual slide elements rather than re-flowed text boxes.'
    ],
    disclaimer: 'This converter uses the reliable page-as-slide architecture to ensure slides faithfully represent the original PDF presentation without broken formatting or misplaced fonts.'
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
      aspectRatio?: '16x9' | '4x3';
      dpi?: number;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF has no pages.' };
      }

      const pptx = new pptxgen();
      
      // Configure presentation layout
      const layout = options.aspectRatio === '4x3' ? 'LAYOUT_4x3' : 'LAYOUT_16x9';
      pptx.layout = layout;

      const scale = (options.dpi || 150) / 72; // High quality slide rendering

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const percent = Math.round((pageNum / numPages) * 90);
        onProgress?.({
          percent,
          stage: `Rendering slide ${pageNum} of ${numPages}...`,
          currentItem: pageNum,
          totalItems: numPages,
          message: 'Generating high-fidelity slide image...'
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

          // Add slide to PPTX
          const slide = pptx.addSlide();
          slide.background = { color: 'FFFFFF' };

          // Place image covering the slide
          slide.addImage({
            data: dataUrl,
            x: 0,
            y: 0,
            w: '100%',
            h: '100%',
            sizing: { type: 'contain', w: '100%', h: '100%' }
          });
        }

        // Clean up canvas
        canvas.width = 0;
        canvas.height = 0;
      }

      onProgress?.({
        percent: 95,
        stage: 'Compiling PowerPoint (.pptx) file...',
        message: 'Packaging presentation slides...'
      });

      const pptxBlob = (await pptx.write({ outputType: 'blob' })) as Blob;
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'presentation';
      const pptxFile = new File([pptxBlob], `${baseName}.pptx`, {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });

      return {
        success: true,
        file: pptxFile,
        downloadName: pptxFile.name,
        previewData: {
          slideCount: numPages,
          layout: options.aspectRatio || '16:9'
        },
        metadata: {
          name: pptxFile.name,
          type: pptxFile.type,
          sizeBytes: pptxFile.size,
          lastModified: Date.now(),
          extension: 'pptx'
        }
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to PowerPoint: ${e?.message || e.toString()}`
      };
    }
  }
}
