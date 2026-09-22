import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Typically you'd point to a local worker file in assets, but we use CDN for simplicity in MVP
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

@Injectable({
  providedIn: 'root'
})
export class PdfProcessingService {
  constructor() {}

  async imagesToPdf(images: string[]): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    
    for (const imgUrl of images) {
      const response = await fetch(imgUrl);
      const imgBytes = await response.arrayBuffer();
      
      let img;
      if (imgUrl.toLowerCase().endsWith('.png')) {
         img = await pdfDoc.embedPng(imgBytes);
      } else {
         img = await pdfDoc.embedJpg(imgBytes);
      }
      
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      });
    }
    
    return await pdfDoc.save();
  }

  async splitPdf(file: File, pages: number[]): Promise<Uint8Array> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const newPdf = await PDFDocument.create();
    
    const copiedPages = await newPdf.copyPages(pdfDoc, pages.map(p => p - 1)); // 0-indexed
    copiedPages.forEach(p => newPdf.addPage(p));
    
    return await newPdf.save();
  }

  async mergePdfs(files: File[]): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();
    
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }
    
    return await mergedPdf.save();
  }

  // Exact PDF compression is hard client-side without rasterizing or stripping.
  // We'll provide a placeholder or structural rebuild for basic reduction.
  async compressPdf(file: File): Promise<Uint8Array> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    
    // PDF-lib's save() naturally strips some unreferenced objects, providing a mild compression.
    // For heavy compression, one would rasterize pages to low-quality JPGs, then rebuild the PDF.
    return await pdfDoc.save({ useObjectStreams: false });
  }

  async pdfToImages(file: File): Promise<string[]> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const images: string[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;
      
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      images.push(imgData);
    }
    
    return images;
  }
}
