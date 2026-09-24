import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { ProcessingResult } from '../models/processing-result.model';
import { CompressionConfig } from '../models/compression-config.model';
import '../utilities/pdfjs-worker';

export interface PdfCreationConfig {
  format: 'A4' | 'Letter';
  orientation: 'Portrait' | 'Landscape';
  fitMode: 'fit' | 'fill';
}

@Injectable({
  providedIn: 'root'
})
export class PdfService {
  constructor() {}

  async getPdfPageCount(file: File): Promise<number> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    const pdfRender = await loadingTask.promise;
    return pdfRender.numPages;
  }

  async extractPagesToImages(file: File, selectedPages: number[]): Promise<File[]> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    const pdfRender = await loadingTask.promise;
    const numPages = pdfRender.numPages;

    const outputFiles: File[] = [];
    for (const pageNum of selectedPages) {
       if (pageNum < 1 || pageNum > numPages) continue;
       const page = await pdfRender.getPage(pageNum);
       const viewport = page.getViewport({ scale: 2.0 }); // High quality for extraction
       const canvas = document.createElement('canvas');
       canvas.width = viewport.width;
       canvas.height = viewport.height;
       const ctx = canvas.getContext('2d');
       if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
          
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 1.0));
          if (blob) {
             const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
             const newFile = new File([blob], `${baseName}_page_${pageNum}.jpg`, { type: 'image/jpeg' });
             outputFiles.push(newFile);
          }
       }
    }
    return outputFiles;
  }

  async imagesToPdf(files: File[], config: PdfCreationConfig): Promise<ProcessingResult> {
    try {
      const pdfDoc = await PDFDocument.create();
      
      // Dimensions
      // A4: 595.28 x 841.89
      // Letter: 612 x 792
      let pageWidth = config.format === 'A4' ? 595.28 : 612;
      let pageHeight = config.format === 'A4' ? 841.89 : 792;
      
      if (config.orientation === 'Landscape') {
         const temp = pageWidth;
         pageWidth = pageHeight;
         pageHeight = temp;
      }

      for (const file of files) {
         const imageBytes = await file.arrayBuffer();
         let image;
         if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
         } else {
            image = await pdfDoc.embedJpg(imageBytes);
         }
         
         const page = pdfDoc.addPage([pageWidth, pageHeight]);
         
         const imgDims = image.scale(1);
         let drawWidth = imgDims.width;
         let drawHeight = imgDims.height;
         
         const ratioX = pageWidth / imgDims.width;
         const ratioY = pageHeight / imgDims.height;
         
         let scale = 1;
         if (config.fitMode === 'fit') {
            scale = Math.min(ratioX, ratioY);
         } else {
            scale = Math.max(ratioX, ratioY); // fill
         }
         
         drawWidth = imgDims.width * scale;
         drawHeight = imgDims.height * scale;
         
         // Center on page
         const x = (pageWidth - drawWidth) / 2;
         const y = (pageHeight - drawHeight) / 2;
         
         page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
      }

      const pdfBytes = await pdfDoc.save();
      const finalFile = new File([pdfBytes as any], `document_${Date.now()}.pdf`, { type: 'application/pdf' });
      
      return {
        success: true,
        file: finalFile,
        metadata: {
           name: finalFile.name, type: 'application/pdf', sizeBytes: finalFile.size, lastModified: Date.now(), extension: 'pdf'
        }
      };
    } catch (e: any) {
      return { success: false, error: e.toString() };
    }
  }

  async compressPdfToExactKB(file: File, config: CompressionConfig): Promise<ProcessingResult & { targetMissed?: boolean }> {
    const targetBytes = (config.targetKB || 500) * 1024;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Step 1: Try a naive save with pdf-lib to strip metadata
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      let optimizedBytes = await pdfDoc.save({ useObjectStreams: false });
      
      if (optimizedBytes.length <= targetBytes) {
         const newFile = new File([optimizedBytes as any], file.name, { type: 'application/pdf' });
         return {
           success: true,
           file: newFile,
           iterations: 1,
           metadata: {
             name: newFile.name, type: 'application/pdf', sizeBytes: newFile.size, lastModified: Date.now(), extension: 'pdf'
           }
         };
      }

      // Step 2: Rasterize to images if naive save isn't enough
      // We will binary search the JPEG quality of the rasterized pages
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdfRender = await loadingTask.promise;
      const numPages = pdfRender.numPages;

      const pageCanvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfRender.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Scale 1.5 is a good baseline
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
           await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
           pageCanvases.push(canvas);
        }
      }

      let minQ = 0.0;
      let maxQ = 1.0;
      let quality = 0.5;
      let bestPdfBytes: Uint8Array | null = null;
      let iterations = 0;
      const maxIterations = 8; // PDF rebuilds are slow, keep iterations low
      let targetMissed = false;

      while (iterations < maxIterations) {
        iterations++;
        
        const newPdf = await PDFDocument.create();
        for (const canvas of pageCanvases) {
           const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
           if (blob) {
             const imageBytes = await blob.arrayBuffer();
             const jpgImage = await newPdf.embedJpg(imageBytes);
             const page = newPdf.addPage([jpgImage.width, jpgImage.height]);
             page.drawImage(jpgImage, { x: 0, y: 0, width: jpgImage.width, height: jpgImage.height });
           }
        }
        
        const currentPdfBytes = await newPdf.save({ useObjectStreams: false });
        
        if (currentPdfBytes.length <= targetBytes) {
           bestPdfBytes = currentPdfBytes;
           minQ = quality;
        } else {
           maxQ = quality;
        }

        const newQuality = (minQ + maxQ) / 2;
        if (Math.abs(quality - newQuality) < 0.05) break;
        quality = newQuality;
      }

      // If we never found a blob <= target, the target is impossible.
      if (!bestPdfBytes) {
        targetMissed = true;
        const newPdf = await PDFDocument.create();
        for (const canvas of pageCanvases) {
           const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.1)); // Rock bottom quality
           if (blob) {
             const imageBytes = await blob.arrayBuffer();
             const jpgImage = await newPdf.embedJpg(imageBytes);
             const page = newPdf.addPage([jpgImage.width, jpgImage.height]);
             page.drawImage(jpgImage, { x: 0, y: 0, width: jpgImage.width, height: jpgImage.height });
           }
        }
        bestPdfBytes = await newPdf.save({ useObjectStreams: false });
      }

      const finalFile = new File([bestPdfBytes as any], file.name, { type: 'application/pdf' });
      return {
        success: true,
        file: finalFile,
        iterations,
        targetMissed,
        metadata: {
           name: finalFile.name, type: 'application/pdf', sizeBytes: finalFile.size, lastModified: Date.now(), extension: 'pdf'
        }
      };

    } catch (e: any) {
      // If pdf.worker.min.mjs fails to load due to 404, we catch it here.
      return { success: false, error: e.toString() };
    }
  }
}
