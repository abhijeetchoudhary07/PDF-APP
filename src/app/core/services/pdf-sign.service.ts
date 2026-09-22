import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, degrees } from 'pdf-lib';
import { ImageService } from './image.service';
import { SignatureProcessingService } from './signature-processing.service';

export interface PlacedSignature {
  id: string;
  pageNumber: number; // 1-indexed
  x: number; // PDF points
  y: number; // PDF points
  width: number;
  height: number;
  rotation: number; // degrees 0..360
  opacity: number; // 0..1
  dataUrl: string;
  label?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfSignService {
  private recentSignatures: string[] = [];

  constructor(
    private imageService: ImageService,
    private signatureProcessing: SignatureProcessingService
  ) {}

  /**
   * Processes an uploaded signature image using the existing engine:
   * 1. Auto-crops extraneous margins.
   * 2. Turns off-white/light backgrounds transparent for natural document placement.
   */
  async prepareSignatureFromUpload(
    file: File,
    options: { autoCrop?: boolean; transparentBg?: boolean } = { autoCrop: true, transparentBg: true }
  ): Promise<string> {
    let processedFile = file;

    if (options.autoCrop) {
      try {
        processedFile = await this.imageService.autoCropSignature(file, 10, 240);
      } catch {
        // Fallback to original
      }
    }

    if (options.transparentBg) {
      return await this.makeBackgroundTransparent(processedFile);
    } else {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(processedFile);
      });
    }
  }

  /**
   * Converts light background pixels to transparent to ensure natural overlay on PDFs.
   */
  async makeBackgroundTransparent(file: File, brightnessThreshold = 230): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Failed to create canvas context');

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

          if (brightness > brightnessThreshold) {
            data[i + 3] = 0; // Transparent
          } else {
            // Keep ink dark and crisp
            data[i + 3] = Math.min(255, Math.floor(255 * (1 - brightness / 255) * 1.5));
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Caches a signature for instant reuse across sessions.
   */
  cacheSignature(dataUrl: string): void {
    if (!this.recentSignatures.includes(dataUrl)) {
      this.recentSignatures.unshift(dataUrl);
      if (this.recentSignatures.length > 10) {
        this.recentSignatures.pop();
      }
    }
  }

  getRecentSignatures(): string[] {
    return [...this.recentSignatures];
  }

  /**
   * Embeds all placed signatures onto their corresponding pages and returns the signed PDF.
   */
  async embedSignatures(
    sourceBuffer: ArrayBuffer,
    signatures: PlacedSignature[],
    outputFileName = 'signed_document.pdf'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number }> {
    if (!signatures || signatures.length === 0) {
      const blob = new Blob([sourceBuffer], { type: 'application/pdf' });
      const file = new File([blob], outputFileName, { type: 'application/pdf' });
      return { file, blob, sizeBytes: file.size };
    }

    const pdfDoc = await PDFDocument.load(sourceBuffer.slice(0), { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    for (const sig of signatures) {
      const pageIdx = sig.pageNumber - 1;
      if (pageIdx < 0 || pageIdx >= pages.length) continue;

      const page = pages[pageIdx];
      const pageHeight = page.getHeight();

      try {
        const res = await fetch(sig.dataUrl);
        const imageBytes = await res.arrayBuffer();
        const isPng = sig.dataUrl.includes('image/png');
        const embeddedImg = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

        // PDF coordinates have (0,0) at bottom-left
        const pdfY = pageHeight - sig.y - sig.height;

        page.drawImage(embeddedImg, {
          x: sig.x,
          y: pdfY,
          width: sig.width,
          height: sig.height,
          rotate: degrees(sig.rotation || 0),
          opacity: sig.opacity != null ? sig.opacity : 1.0
        });

        this.cacheSignature(sig.dataUrl);
      } catch {
        // Continue if single signature fails to embed
      }
    }

    const finalBytes = await pdfDoc.save({ useObjectStreams: false });
    const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    return {
      file,
      blob,
      sizeBytes: file.size
    };
  }
}
