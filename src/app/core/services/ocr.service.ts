import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  OcrSupportedLanguage,
  OcrLanguageOption,
  OCR_SUPPORTED_LANGUAGES,
  OcrPageResult,
  OcrProgressEvent,
  OcrDocumentResult,
  OcrWord
} from '../models/ocr.models';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

@Injectable({
  providedIn: 'root'
})
export class OcrService {
  readonly supportedLanguages: OcrLanguageOption[] = OCR_SUPPORTED_LANGUAGES;

  private activeWorker: Worker | null = null;
  private isCancelled = false;

  constructor() {}

  /**
   * Checks whether a PDF already contains selectable digital text.
   */
  async detectSelectableText(file: File): Promise<{
    hasText: boolean;
    pageCount: number;
    textSample: string;
    pagesWithText: number[];
    scannedPages: number[];
  }> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    const pagesWithText: number[] = [];
    const scannedPages: number[] = [];
    let textSample = '';

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      let pageText = '';

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
          pageText += item.str + ' ';
        }
      }

      if (pageText.trim().length > 25) {
        pagesWithText.push(i);
        if (!textSample && pageText.trim().length > 0) {
          textSample = pageText.trim().substring(0, 300);
        }
      } else {
        scannedPages.push(i);
      }
    }

    return {
      hasText: pagesWithText.length > 0,
      pageCount,
      textSample,
      pagesWithText,
      scannedPages
    };
  }

  /**
   * Extracts existing digital text from a PDF without running OCR.
   */
  async extractExistingText(file: File, selectedPages?: number[]): Promise<OcrDocumentResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const targetPages = selectedPages && selectedPages.length > 0
      ? selectedPages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages: OcrPageResult[] = [];
    let fullText = '';

    for (const pageNum of targetPages) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      let pageText = '';

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          pageText += item.str + ' ';
        }
      }

      const cleanText = pageText.trim();
      fullText += `--- Page ${pageNum} ---\n${cleanText}\n\n`;

      pages.push({
        pageNumber: pageNum,
        text: cleanText,
        confidence: 100,
        words: [],
        language: 'digital',
        status: 'completed'
      });
    }

    return {
      fileName: file.name,
      totalPages: targetPages.length,
      pages,
      fullText: fullText.trim(),
      averageConfidence: 100,
      languages: ['digital']
    };
  }

  /**
   * Performs OCR on a file (PDF or Image) page-by-page using Tesseract.js in a Web Worker.
   */
  async performOcr(
    file: File,
    languages: OcrSupportedLanguage[] | string,
    selectedPages?: number[],
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    this.isCancelled = false;

    const langStr = Array.isArray(languages) ? languages.join('+') : languages;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    // Initialize Tesseract Worker
    if (onProgress) {
      onProgress({
        stage: 'downloading',
        progress: 0.1,
        message: 'Loading OCR language models (cached locally for offline use)...'
      });
    }

    const worker = await createWorker(langStr, 1, {
      logger: m => {
        if (this.isCancelled) return;
        if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
          onProgress?.({
            stage: 'initializing',
            progress: m.progress || 0.3,
            message: 'Initializing OCR engine...'
          });
        } else if (m.status === 'recognizing text') {
          // Handled per page
        }
      }
    });

    this.activeWorker = worker;

    try {
      if (!isPdf) {
        // Single Image OCR
        const result = await this.ocrImageFile(worker, file, langStr, onProgress);
        return result;
      } else {
        // Multi-page PDF OCR
        const result = await this.ocrPdfFile(worker, file, langStr, selectedPages, onProgress);
        return result;
      }
    } finally {
      if (this.activeWorker) {
        await this.activeWorker.terminate();
        this.activeWorker = null;
      }
    }
  }

  private async ocrImageFile(
    worker: Worker,
    file: File,
    languages: string,
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    if (onProgress) {
      onProgress({
        stage: 'recognizing',
        progress: 0.5,
        pageNumber: 1,
        totalPages: 1,
        message: 'Recognizing text on image...'
      });
    }

    const imgUrl = URL.createObjectURL(file);
    try {
      const ocrRes = await worker.recognize(imgUrl);
      if (this.isCancelled) throw new Error('OCR job was cancelled.');

      const words: OcrWord[] = ((ocrRes.data as any).words || []).map((w: any) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1
        }
      }));

      const pageResult: OcrPageResult = {
        pageNumber: 1,
        text: ocrRes.data.text.trim(),
        confidence: Math.round(ocrRes.data.confidence),
        words,
        language: languages,
        status: 'completed'
      };

      onProgress?.({
        stage: 'completed',
        progress: 1.0,
        pageNumber: 1,
        totalPages: 1,
        message: 'OCR completed successfully!'
      });

      return {
        fileName: file.name,
        totalPages: 1,
        pages: [pageResult],
        fullText: pageResult.text,
        averageConfidence: pageResult.confidence,
        languages: languages.split('+')
      };
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }

  private async ocrPdfFile(
    worker: Worker,
    file: File,
    languages: string,
    selectedPages?: number[],
    onProgress?: (event: OcrProgressEvent) => void
  ): Promise<OcrDocumentResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const targetPages = selectedPages && selectedPages.length > 0
      ? selectedPages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages: OcrPageResult[] = [];
    let fullText = '';
    let totalConfidence = 0;

    for (let idx = 0; idx < targetPages.length; idx++) {
      if (this.isCancelled) throw new Error('OCR job was cancelled.');

      const pageNum = targetPages[idx];
      const overallProgress = idx / targetPages.length;

      onProgress?.({
        stage: 'recognizing',
        progress: overallProgress,
        pageNumber: pageNum,
        totalPages: targetPages.length,
        message: `Recognizing text on page ${pageNum} of ${totalPages}...`
      });

      // Render page to canvas at 2x scale for crisp OCR recognition
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        pages.push({
          pageNumber: pageNum,
          text: '',
          confidence: 0,
          words: [],
          language: languages,
          status: 'error',
          errorMessage: 'Could not create canvas context.'
        });
        continue;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;

      // Recognize via worker
      const ocrRes = await worker.recognize(canvas);
      if (this.isCancelled) throw new Error('OCR job was cancelled.');

      const words: OcrWord[] = ((ocrRes.data as any).words || []).map((w: any) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1
        }
      }));

      const pageText = ocrRes.data.text.trim();
      const pageConfidence = Math.round(ocrRes.data.confidence);

      fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
      totalConfidence += pageConfidence;

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        confidence: pageConfidence,
        words,
        language: languages,
        status: 'completed'
      });
    }

    onProgress?.({
      stage: 'completed',
      progress: 1.0,
      message: 'OCR completed successfully!'
    });

    return {
      fileName: file.name,
      totalPages: targetPages.length,
      pages,
      fullText: fullText.trim(),
      averageConfidence: targetPages.length > 0 ? Math.round(totalConfidence / targetPages.length) : 0,
      languages: languages.split('+')
    };
  }

  /**
   * Generates a Searchable PDF:
   * Preserves 100% of original visual appearance, dimensions, and order,
   * while adding an invisible text layer (opacity: 0) on top for selection and search.
   */
  async generateSearchablePdf(
    originalFile: File,
    ocrResult: OcrDocumentResult
  ): Promise<File> {
    const isPdf = originalFile.type === 'application/pdf' || originalFile.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      // PDF input: Load existing PDF, overlay invisible text layer on OCR pages
      const originalBytes = await originalFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(originalBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const ocrPageMap = new Map<number, OcrPageResult>();
      for (const p of ocrResult.pages) {
        ocrPageMap.set(p.pageNumber, p);
      }

      const totalPdfPages = pdfDoc.getPageCount();

      for (let i = 0; i < totalPdfPages; i++) {
        const pageNum = i + 1;
        const pageOcr = ocrPageMap.get(pageNum);
        if (!pageOcr || !pageOcr.words || pageOcr.words.length === 0) continue;

        const page = pdfDoc.getPage(i);
        const { width: pdfW, height: pdfH } = page.getSize();

        // Calculate bounding box scale factors
        // Tesseract ran on 2x rasterized viewport: viewport.width = pdfW * 2, viewport.height = pdfH * 2
        // Find max coordinates from words to compute accurate scale
        let maxX = 1;
        let maxY = 1;
        for (const w of pageOcr.words) {
          if (w.bbox.x1 > maxX) maxX = w.bbox.x1;
          if (w.bbox.y1 > maxY) maxY = w.bbox.y1;
        }

        const scaleX = pdfW / maxX;
        const scaleY = pdfH / maxY;

        for (const word of pageOcr.words) {
          const cleanWord = word.text.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
          if (!cleanWord) continue;

          const wordX = word.bbox.x0 * scaleX;
          const wordH = (word.bbox.y1 - word.bbox.y0) * scaleY;
          // PDF coordinate system has (0,0) at bottom-left
          const wordY = pdfH - (word.bbox.y1 * scaleY);
          const fontSize = Math.max(6, Math.min(36, wordH * 0.9));

          try {
            page.drawText(cleanWord, {
              x: wordX,
              y: Math.max(0, wordY),
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
              opacity: 0 // Completely invisible text layer for search & copy
            });
          } catch {
            // Ignore glyph embedding errors for non-standard characters
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
      return new File([pdfBytes as any], `${baseName}_searchable.pdf`, {
        type: 'application/pdf'
      });

    } else {
      // Image input: Create new PDF with embedded image and invisible text layer
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const imageBytes = await originalFile.arrayBuffer();
      const isPng = originalFile.type === 'image/png';
      const embeddedImage = isPng
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

      const imgDims = embeddedImage.scale(1);
      const page = pdfDoc.addPage([imgDims.width, imgDims.height]);

      // Draw original image
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imgDims.width,
        height: imgDims.height
      });

      // Draw invisible text layer
      const pageOcr = ocrResult.pages[0];
      if (pageOcr && pageOcr.words) {
        for (const word of pageOcr.words) {
          const cleanWord = word.text.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
          if (!cleanWord) continue;

          const wordX = word.bbox.x0;
          const wordH = word.bbox.y1 - word.bbox.y0;
          const wordY = imgDims.height - word.bbox.y1;
          const fontSize = Math.max(6, Math.min(36, wordH * 0.9));

          try {
            page.drawText(cleanWord, {
              x: wordX,
              y: Math.max(0, wordY),
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
              opacity: 0
            });
          } catch {
            // Ignore glyph embedding errors
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
      return new File([pdfBytes as any], `${baseName}_searchable.pdf`, {
        type: 'application/pdf'
      });
    }
  }

  /**
   * Generates a plain text file from OCR results.
   */
  generateTextFile(ocrResult: OcrDocumentResult, fileName: string): File {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const blob = new Blob([ocrResult.fullText], { type: 'text/plain;charset=utf-8' });
    return new File([blob], `${baseName}_ocr.txt`, { type: 'text/plain' });
  }

  /**
   * Generates structured JSON export from OCR results.
   */
  generateJsonFile(ocrResult: OcrDocumentResult, fileName: string): File {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const jsonStr = JSON.stringify(ocrResult, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], `${baseName}_ocr_structured.json`, { type: 'application/json' });
  }

  /**
   * Cancels any active OCR job.
   */
  cancelJob(): void {
    this.isCancelled = true;
    if (this.activeWorker) {
      this.activeWorker.terminate();
      this.activeWorker = null;
    }
  }
}
