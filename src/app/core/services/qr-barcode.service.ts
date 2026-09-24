import { Injectable } from '@angular/core';
import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat as ZXingBarcodeFormat
} from '@zxing/library';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  BarcodeFormat,
  BarcodeScanResult,
  QrGeneratorOptions,
  BarcodeReportFormat,
  QrContentType
} from '../models/qr-barcode.types';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class QrBarcodeService {
  private zxingReader: MultiFormatReader;

  constructor() {
    this.zxingReader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      ZXingBarcodeFormat.QR_CODE,
      ZXingBarcodeFormat.CODE_128,
      ZXingBarcodeFormat.CODE_39,
      ZXingBarcodeFormat.CODE_93,
      ZXingBarcodeFormat.EAN_13,
      ZXingBarcodeFormat.EAN_8,
      ZXingBarcodeFormat.UPC_A,
      ZXingBarcodeFormat.UPC_E,
      ZXingBarcodeFormat.PDF_417,
      ZXingBarcodeFormat.DATA_MATRIX,
      ZXingBarcodeFormat.AZTEC,
      ZXingBarcodeFormat.ITF,
      ZXingBarcodeFormat.CODABAR
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    this.zxingReader.setHints(hints);
  }

  /**
   * Decode barcodes from an Image file, Blob, HTMLImageElement, or Canvas.
   */
  async decodeFromImage(source: File | Blob | HTMLImageElement | HTMLCanvasElement): Promise<BarcodeScanResult[]> {
    let canvas: HTMLCanvasElement;

    if (source instanceof HTMLCanvasElement) {
      canvas = source;
    } else if (source instanceof HTMLImageElement) {
      canvas = document.createElement('canvas');
      canvas.width = source.naturalWidth || source.width;
      canvas.height = source.naturalHeight || source.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0);
      }
    } else {
      // File or Blob
      canvas = await this.imageBlobToCanvas(source);
    }

    return this.scanCanvasForBarcodes(canvas);
  }

  /**
   * Render a specific PDF page and scan it for barcodes.
   */
  async decodeFromPdfPage(pdfSource: File | ArrayBuffer, pageNumber: number): Promise<BarcodeScanResult[]> {
    const arrayBuffer = pdfSource instanceof File ? await pdfSource.arrayBuffer() : pdfSource;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) } as any);
    const pdf = await loadingTask.promise;

    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Page ${pageNumber} is out of bounds (1 - ${pdf.numPages})`);
    }

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp barcode resolution
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    await page.render({ canvasContext: ctx, viewport } as any).promise;

    const results = await this.scanCanvasForBarcodes(canvas);
    // Assign page number
    return results.map(r => ({ ...r, pageNumber }));
  }

  /**
   * Scans all pages or specified pages of a PDF document.
   */
  async decodeFromPdfAllPages(
    pdfSource: File | ArrayBuffer,
    pages?: number[],
    onProgress?: (pct: number, msg: string) => void
  ): Promise<BarcodeScanResult[]> {
    const arrayBuffer = pdfSource instanceof File ? await pdfSource.arrayBuffer() : pdfSource;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const targetPages = pages && pages.length > 0
      ? pages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const allResults: BarcodeScanResult[] = [];

    for (let i = 0; i < targetPages.length; i++) {
      const pageNum = targetPages[i];
      const pct = Math.floor(((i + 1) / targetPages.length) * 100);
      onProgress?.(pct, `Scanning page ${pageNum} of ${totalPages}...`);

      try {
        const pageResults = await this.decodeFromPdfPage(arrayBuffer, pageNum);
        allResults.push(...pageResults);
      } catch (err) {
        console.warn(`Error scanning PDF page ${pageNum}:`, err);
      }
    }

    return allResults;
  }

  /**
   * Internal barcode scanner on canvas using native BarcodeDetector if available,
   * falling back to ZXing library.
   */
  public async scanCanvasForBarcodes(canvas: HTMLCanvasElement): Promise<BarcodeScanResult[]> {
    const results: BarcodeScanResult[] = [];
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      return results;
    }

    // 1. Try Native BarcodeDetector if supported
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector();
        const nativeResults = await detector.detect(canvas);
        if (nativeResults && nativeResults.length > 0) {
          for (const item of nativeResults) {
            const format = this.normalizeNativeFormat(item.format);
            const rawContent = item.rawValue || '';
            const isUrl = this.checkIsUrl(rawContent);
            const domain = isUrl ? this.extractDomain(rawContent) : undefined;

            results.push({
              id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              rawContent,
              format,
              timestamp: Date.now(),
              isUrl,
              urlDomain: domain,
              boundingBox: item.boundingBox ? {
                x: item.boundingBox.x,
                y: item.boundingBox.y,
                width: item.boundingBox.width,
                height: item.boundingBox.height
              } : undefined
            });
          }
          return results;
        }
      } catch (e) {
        // Fallback to ZXing
      }
    }

    // 2. ZXing MultiFormatReader
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const luminanceSource = new RGBLuminanceSource(
        imgData.data,
        canvas.width,
        canvas.height
      );
      const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      const zxingResult = this.zxingReader.decode(binaryBitmap);

      if (zxingResult) {
        const rawContent = zxingResult.getText();
        const format = this.normalizeZXingFormat(zxingResult.getBarcodeFormat());
        const isUrl = this.checkIsUrl(rawContent);
        const domain = isUrl ? this.extractDomain(rawContent) : undefined;

        results.push({
          id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          rawContent,
          format,
          timestamp: Date.now(),
          isUrl,
          urlDomain: domain
        });
      }
    } catch {
      // ZXing throws NotFoundException when no code is found
    }

    return results;
  }

  /**
   * Generate QR Code as Data URL (PNG).
   */
  async generateQrDataUrl(options: QrGeneratorOptions): Promise<string> {
    const formattedContent = this.formatPayload(options);
    return await QRCode.toDataURL(formattedContent, {
      width: options.size || 300,
      margin: options.margin !== undefined ? options.margin : 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.foregroundColor || '#000000',
        light: options.backgroundColor || '#FFFFFF'
      }
    });
  }

  /**
   * Generate QR Code as SVG string.
   */
  async generateQrSvg(options: QrGeneratorOptions): Promise<string> {
    const formattedContent = this.formatPayload(options);
    return await QRCode.toString(formattedContent, {
      type: 'svg',
      width: options.size || 300,
      margin: options.margin !== undefined ? options.margin : 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.foregroundColor || '#000000',
        light: options.backgroundColor || '#FFFFFF'
      }
    });
  }

  /**
   * Generate PDF containing the QR Code with title and details.
   */
  async generateQrPdf(options: QrGeneratorOptions, title?: string): Promise<Blob> {
    const dataUrl = await this.generateQrDataUrl(options);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header Title
    const displayTitle = title || 'QR Code Document';
    page.drawText(displayTitle, {
      x: 50,
      y: height - 60,
      size: 20,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1)
    });

    // Content Type & Date
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    page.drawText(`Type: ${options.contentType.toUpperCase()}  •  Generated: ${dateStr}`, {
      x: 50,
      y: height - 85,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4)
    });

    // Embed QR image
    const imageBytes = await (await fetch(dataUrl)).arrayBuffer();
    const qrImage = await pdfDoc.embedPng(imageBytes);
    const qrDim = Math.min(300, options.size || 300);
    const qrX = (width - qrDim) / 2;
    const qrY = height - 120 - qrDim;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrDim,
      height: qrDim
    });

    // Decoded Content Box
    const formattedContent = this.formatPayload(options);
    const boxY = qrY - 80;
    page.drawRectangle({
      x: 50,
      y: boxY,
      width: width - 100,
      height: 60,
      color: rgb(0.96, 0.97, 0.98),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1
    });

    const truncatedContent = formattedContent.length > 120
      ? formattedContent.substring(0, 117) + '...'
      : formattedContent;

    page.drawText('Encoded Content:', {
      x: 65,
      y: boxY + 40,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText(truncatedContent, {
      x: 65,
      y: boxY + 20,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });

    // Footer
    page.drawText('Generated with Indian Form Helper • 100% On-Device & Safe', {
      x: 50,
      y: 40,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }

  /**
   * Formats structured payloads into standard QR URI schemas.
   */
  public formatPayload(options: QrGeneratorOptions): string {
    switch (options.contentType) {
      case 'url':
        return options.urlPayload || options.content;

      case 'email':
        if (options.emailPayload) {
          const { address, subject, body } = options.emailPayload;
          const params = new URLSearchParams();
          if (subject) params.append('subject', subject);
          if (body) params.append('body', body);
          const queryString = params.toString();
          return `mailto:${address}${queryString ? '?' + queryString : ''}`;
        }
        return options.content;

      case 'phone':
        return options.phonePayload ? `tel:${options.phonePayload}` : options.content;

      case 'wifi':
        if (options.wifiPayload) {
          const { ssid, password, encryption, hidden } = options.wifiPayload;
          return `WIFI:S:${ssid};T:${encryption || 'WPA'};P:${password || ''};H:${hidden ? 'true' : 'false'};;`;
        }
        return options.content;

      case 'vcard':
        if (options.vcardPayload) {
          const { name, phone, email, org, title } = options.vcardPayload;
          return [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${name}`,
            phone ? `TEL:${phone}` : '',
            email ? `EMAIL:${email}` : '',
            org ? `ORG:${org}` : '',
            title ? `TITLE:${title}` : '',
            'END:VCARD'
          ].filter(Boolean).join('\n');
        }
        return options.content;

      case 'text':
      default:
        return options.content;
    }
  }

  /**
   * Export scan results as TXT, CSV, or JSON blob.
   */
  exportReport(results: BarcodeScanResult[], format: BarcodeReportFormat): Blob {
    if (format === 'json') {
      const jsonStr = JSON.stringify(results, null, 2);
      return new Blob([jsonStr], { type: 'application/json' });
    }

    if (format === 'csv') {
      const headers = ['ID', 'Format', 'Content', 'Page', 'Is URL', 'Domain', 'Timestamp'];
      const rows = results.map(r => [
        `"${r.id}"`,
        `"${r.format}"`,
        `"${r.rawContent.replace(/"/g, '""')}"`,
        r.pageNumber !== undefined ? r.pageNumber : 'N/A',
        r.isUrl ? 'Yes' : 'No',
        `"${r.urlDomain || ''}"`,
        `"${new Date(r.timestamp).toISOString()}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      return new Blob([csvContent], { type: 'text/csv' });
    }

    // Default TXT
    const lines = [
      '==================================================',
      'QR CODE & BARCODE SCAN REPORT',
      `Generated: ${new Date().toLocaleString()}`,
      `Total Codes Detected: ${results.length}`,
      '==================================================\n'
    ];

    results.forEach((r, idx) => {
      lines.push(`Code #${idx + 1}:`);
      lines.push(`  Format:    ${r.format}`);
      if (r.pageNumber !== undefined) {
        lines.push(`  Page:      ${r.pageNumber}`);
      }
      lines.push(`  Content:   ${r.rawContent}`);
      lines.push(`  Is URL:    ${r.isUrl ? 'Yes' : 'No'}`);
      if (r.urlDomain) {
        lines.push(`  Domain:    ${r.urlDomain}`);
      }
      lines.push(`  Timestamp: ${new Date(r.timestamp).toISOString()}`);
      lines.push('--------------------------------------------------');
    });

    return new Blob([lines.join('\n')], { type: 'text/plain' });
  }

  private async imageBlobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for barcode decoding'));
      };
      img.src = url;
    });
  }

  public checkIsUrl(str: string): boolean {
    if (!str) return false;
    const trimmed = str.trim();
    return /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed);
  }

  public extractDomain(urlStr: string): string {
    try {
      const url = new URL(urlStr.trim());
      return url.hostname;
    } catch {
      return '';
    }
  }

  private normalizeNativeFormat(fmt: string): BarcodeFormat {
    const f = (fmt || '').toLowerCase().replace(/[-_]/g, '');
    if (f === 'qr' || f === 'qrcode') return 'QR_CODE';
    if (f === 'code128') return 'CODE_128';
    if (f === 'code39') return 'CODE_39';
    if (f === 'code93') return 'CODE_93';
    if (f === 'ean13') return 'EAN_13';
    if (f === 'ean8') return 'EAN_8';
    if (f === 'upca') return 'UPC_A';
    if (f === 'upce') return 'UPC_E';
    if (f === 'pdf417') return 'PDF_417';
    if (f === 'datamatrix') return 'DATA_MATRIX';
    if (f === 'aztec') return 'AZTEC';
    if (f === 'itf') return 'ITF';
    if (f === 'codabar') return 'CODABAR';
    return 'UNKNOWN';
  }

  private normalizeZXingFormat(format: ZXingBarcodeFormat): BarcodeFormat {
    switch (format) {
      case ZXingBarcodeFormat.QR_CODE: return 'QR_CODE';
      case ZXingBarcodeFormat.CODE_128: return 'CODE_128';
      case ZXingBarcodeFormat.CODE_39: return 'CODE_39';
      case ZXingBarcodeFormat.CODE_93: return 'CODE_93';
      case ZXingBarcodeFormat.EAN_13: return 'EAN_13';
      case ZXingBarcodeFormat.EAN_8: return 'EAN_8';
      case ZXingBarcodeFormat.UPC_A: return 'UPC_A';
      case ZXingBarcodeFormat.UPC_E: return 'UPC_E';
      case ZXingBarcodeFormat.PDF_417: return 'PDF_417';
      case ZXingBarcodeFormat.DATA_MATRIX: return 'DATA_MATRIX';
      case ZXingBarcodeFormat.AZTEC: return 'AZTEC';
      case ZXingBarcodeFormat.ITF: return 'ITF';
      case ZXingBarcodeFormat.CODABAR: return 'CODABAR';
      default: return 'UNKNOWN';
    }
  }
}
