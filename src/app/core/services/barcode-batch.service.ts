import { Injectable, inject } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import QRCode from 'qrcode';

import { QrBarcodeService } from './qr-barcode.service';
import { StorageService } from './storage.service';
import {
  Barcode1DOptions,
  BarcodeBatchItem,
  BarcodeFormat,
  BarcodeType1D,
  BatchDeduplicationOptions,
  BulkBarcodeGenerationOptions,
  BulkGenerationResult
} from '../models/qr-barcode.types';

@Injectable({
  providedIn: 'root'
})
export class BarcodeBatchService extends QrBarcodeService {
  private storageService = inject(StorageService);

  private sessionItems: BarcodeBatchItem[] = [];
  private lastScannedMap: Map<string, number> = new Map();

  // --- Code 128 Character Set & Pattern Table (Subset B) ---
  private static readonly CODE128_PATTERNS: string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (104=Start B, 106=Stop)
  ];

  // --- Code 39 Character Patterns ---
  // 9 elements: b s b s b s b s b (1 = wide, 0 = narrow)
  private static readonly CODE39_PATTERNS: Record<string, string> = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001',
    '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
    'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001', 'E': '100011000',
    'F': '001011000', 'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011', 'O': '100010010',
    'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
    'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001', 'Y': '110010000',
    'Z': '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
  };

  // --- EAN-13 Digit Patterns (L, G, R) ---
  private static readonly EAN_L: string[] = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'
  ];
  private static readonly EAN_G: string[] = [
    '0100111', '0110011', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111'
  ];
  private static readonly EAN_R: string[] = [
    '1110010', '1100110', '1101100', '1000010', '1011100',
    '1001110', '1010000', '1000100', '1001000', '1110100'
  ];
  // First digit parities: 0=LLLLLL, 1=LLGLGG, 2=LLGGLG, etc.
  private static readonly EAN_PARITY: string[] = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
  ];

  /**
   * Continuous Batch Scan Deduplication Handler:
   * Processes a newly scanned barcode payload according to configured deduplication rules.
   * If unique, triggers sound/haptic feedback and records to session list.
   */
  async processScannedCode(
    rawContent: string,
    format: BarcodeFormat,
    options: BatchDeduplicationOptions = { mode: 'cooldown', cooldownMs: 3000 }
  ): Promise<BarcodeBatchItem | null> {
    const trimmed = rawContent.trim();
    if (!trimmed) return null;

    const now = Date.now();
    const cooldown = options.cooldownMs ?? 3000;

    if (options.mode === 'session') {
      const alreadyInSession = this.sessionItems.some(item => item.payload === trimmed);
      if (alreadyInSession) return null;
    } else if (options.mode === 'cooldown') {
      const lastTime = this.lastScannedMap.get(trimmed);
      if (lastTime && now - lastTime < cooldown) {
        return null;
      }
    }

    // New unique barcode captured: Record timestamp and update map
    this.lastScannedMap.set(trimmed, now);

    const newItem: BarcodeBatchItem = {
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      format,
      payload: trimmed,
      timestamp: now,
      displayTimestamp: new Date(now).toLocaleTimeString()
    };

    this.sessionItems.push(newItem);

    // Sound & Haptic Feedback
    await this.triggerFeedback();

    return newItem;
  }

  getSessionItems(): BarcodeBatchItem[] {
    return [...this.sessionItems];
  }

  clearSession(): void {
    this.sessionItems = [];
    this.lastScannedMap.clear();
  }

  removeItem(id: string): void {
    this.sessionItems = this.sessionItems.filter(item => item.id !== id);
  }

  /**
   * Synchronous / immediate capture handler for continuous batch scanner loops and unit tests.
   */
  handleCapturedBarcode(
    payload: string,
    format: BarcodeFormat,
    mode: 'cooldown' | 'session' | 'none' = 'cooldown',
    cooldownMs: number = 3000
  ): BarcodeBatchItem | null {
    const trimmed = payload.trim();
    if (!trimmed) return null;

    const now = Date.now();
    if (mode === 'session') {
      const alreadyInSession = this.sessionItems.some(item => item.payload === trimmed);
      if (alreadyInSession) return null;
    } else if (mode === 'cooldown') {
      const lastTime = this.lastScannedMap.get(trimmed);
      if (lastTime && now - lastTime < cooldownMs) {
        return null;
      }
    }

    this.lastScannedMap.set(trimmed, now);
    const newItem: BarcodeBatchItem = {
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      format,
      payload: trimmed,
      timestamp: now,
      displayTimestamp: new Date(now).toLocaleTimeString()
    };
    this.sessionItems.push(newItem);
    this.triggerFeedback().catch(() => {});
    return newItem;
  }

  /**
   * Trigger sound and haptic feedback.
   */
  playCaptureFeedback(): Promise<void> {
    return this.triggerFeedback();
  }

  /**
   * Vector SVG barcode generator.
   */
  generate1DBarcodeSvg(options: Barcode1DOptions): Promise<string> {
    return this.generateBarcodeSvg(options);
  }

  /**
   * Bulk generate ZIP archive.
   */
  generateBulkZipArchive(
    options: BulkBarcodeGenerationOptions,
    filename: string = 'barcodes.zip'
  ): Promise<{ file: File; savedUri?: string }> {
    return this.generateBulkZip(options.payloads, options.format, filename);
  }

  /**
   * Haptic and Audio Feedback on unique barcode capture.
   */
  async triggerFeedback(): Promise<void> {
    // 1. Haptic Feedback
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {}

    // 2. Synthesized Sound Beep (Web Audio API, 100% offline)
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz High-Pitch Scan Beep
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.08);
        }
      }
    } catch {}
  }

  /**
   * Sanitizes a CSV cell to prevent CSV Formula Injection attacks (=, +, -, @, \t, \r).
   */
  sanitizeCsvCell(value: string): string {
    let str = value || '';
    if (/^[=\+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Escapes XML/SVG special characters to prevent stored XSS injection in SVG templates.
   */
  escapeXml(unsafe: string): string {
    return (unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Exports batch session to CSV file via StorageService.saveFile.
   * Hardened against CSV / Formula Injection attacks.
   */
  async exportBatchCsv(
    items: BarcodeBatchItem[] = this.sessionItems,
    filename: string = 'batch-scans.csv'
  ): Promise<{ file: File; savedUri?: string }> {
    const headers = ['ID', 'Format', 'Payload', 'Timestamp'];
    const rows: string[][] = [headers];

    for (const item of items) {
      rows.push([
        item.id,
        item.format,
        item.payload,
        new Date(item.timestamp).toISOString()
      ]);
    }

    const csvContent = rows
      .map(row => row.map(cell => this.sanitizeCsvCell(cell)).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const targetName = filename.endsWith('.csv') ? filename : `${filename}.csv`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/csv' })
      : ({ name: targetName, size: blob.size, type: 'text/csv' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'barcode-batch', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Exports batch session to TXT file via StorageService.saveFile.
   */
  async exportBatchTxt(
    items: BarcodeBatchItem[] = this.sessionItems,
    filename: string = 'batch-scans.txt'
  ): Promise<{ file: File; savedUri?: string }> {
    const lines: string[] = [
      '========================================',
      'CONTINUOUS BARCODE BATCH SCAN REPORT',
      `Exported: ${new Date().toLocaleString()}`,
      `Total Barcodes: ${items.length}`,
      '========================================\n'
    ];

    items.forEach((item, idx) => {
      lines.push(`[${idx + 1}] ${item.format} | ${item.payload} | ${new Date(item.timestamp).toISOString()}`);
    });

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const targetName = filename.endsWith('.txt') ? filename : `${filename}.txt`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/plain' })
      : ({ name: targetName, size: blob.size, type: 'text/plain' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'barcode-batch', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  // --- 1D Barcode Generation: Code 128, EAN-13, Code 39 ---

  /**
   * EAN-13 Check Digit Calculation & Validation:
   * Sum of odd-index digits (1st, 3rd, 5th, etc.) + 3 * sum of even-index digits (2nd, 4th, 6th, etc.).
   * Check digit C = (10 - (sum % 10)) % 10.
   * If invalid 13th digit is provided, rejects with clear explanation.
   */
  validateAndComputeEan13(payload: string): { valid: boolean; fullPayload: string; error?: string } {
    const clean = payload.replace(/[^0-9]/g, '');
    if (clean.length !== 12 && clean.length !== 13) {
      return {
        valid: false,
        fullPayload: clean,
        error: `EAN-13 requires exactly 12 or 13 numeric digits (received ${clean.length})`
      };
    }

    let oddSum = 0;
    let evenSum = 0;

    for (let i = 0; i < 12; i++) {
      const digit = parseInt(clean[i], 10);
      if (i % 2 === 0) {
        // 1-based odd position (1st, 3rd, 5th...)
        oddSum += digit;
      } else {
        // 1-based even position (2nd, 4th, 6th...)
        evenSum += digit;
      }
    }

    const totalSum = oddSum + 3 * evenSum;
    const computedCheckDigit = (10 - (totalSum % 10)) % 10;

    if (clean.length === 13) {
      const providedCheckDigit = parseInt(clean[12], 10);
      if (providedCheckDigit !== computedCheckDigit) {
        return {
          valid: false,
          fullPayload: clean,
          error: `Invalid EAN-13 check digit: Expected ${computedCheckDigit}, got ${providedCheckDigit}`
        };
      }
      return { valid: true, fullPayload: clean };
    }

    // 12 digits: append computed check digit
    return { valid: true, fullPayload: `${clean}${computedCheckDigit}` };
  }

  /**
   * Generates a vector SVG string for 1D or QR barcodes.
   */
  async generateBarcodeSvg(options: Barcode1DOptions): Promise<string> {
    if (options.format === 'QR_CODE') {
      return await QRCode.toString(options.payload, {
        type: 'svg',
        color: {
          dark: options.lineColor || '#000000',
          light: options.backgroundColor || '#ffffff'
        },
        margin: 1
      });
    }

    let bitPattern = '';
    let displayPayload = options.payload;

    if (options.format === 'EAN_13') {
      const eanValidation = this.validateAndComputeEan13(options.payload);
      if (!eanValidation.valid) {
        throw new Error(eanValidation.error || 'Invalid EAN-13 payload');
      }
      displayPayload = eanValidation.fullPayload;
      bitPattern = this.encodeEan13Bits(displayPayload);
    } else if (options.format === 'CODE_39') {
      bitPattern = this.encodeCode39Bits(options.payload.toUpperCase());
    } else {
      // Default CODE_128
      bitPattern = this.encodeCode128Bits(options.payload);
    }

    return this.renderBitPatternToSvg(bitPattern, displayPayload, options);
  }

  /**
   * Renders 1D or QR barcode directly onto a Canvas and returns PNG Blob.
   */
  async generateBarcodePngBlob(options: Barcode1DOptions): Promise<Blob> {
    if (options.format === 'QR_CODE') {
      const dataUrl = await QRCode.toDataURL(options.payload, {
        margin: 2,
        color: {
          dark: options.lineColor || '#000000',
          light: options.backgroundColor || '#ffffff'
        }
      });
      return await (await fetch(dataUrl)).blob();
    }

    let bitPattern = '';
    let displayPayload = options.payload;

    if (options.format === 'EAN_13') {
      const eanValidation = this.validateAndComputeEan13(options.payload);
      if (!eanValidation.valid) {
        throw new Error(eanValidation.error || 'Invalid EAN-13 payload');
      }
      displayPayload = eanValidation.fullPayload;
      bitPattern = this.encodeEan13Bits(displayPayload);
    } else if (options.format === 'CODE_39') {
      bitPattern = this.encodeCode39Bits(options.payload.toUpperCase());
    } else {
      bitPattern = this.encodeCode128Bits(options.payload);
    }

    const canvas = document.createElement('canvas');
    const width = options.width || 360;
    const height = options.height || 120;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    // Fill background
    ctx.fillStyle = options.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw bars
    ctx.fillStyle = options.lineColor || '#000000';
    const margin = 20;
    const availableWidth = width - margin * 2;
    const barWidth = availableWidth / bitPattern.length;
    const barHeight = options.includeText !== false ? height - 36 : height - 16;

    for (let i = 0; i < bitPattern.length; i++) {
      if (bitPattern[i] === '1') {
        ctx.fillRect(margin + i * barWidth, 10, barWidth + 0.3, barHeight);
      }
    }

    // Draw text
    if (options.includeText !== false) {
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(displayPayload, width / 2, height - 10);
    }

    if (typeof canvas.toBlob === 'function') {
      try {
        const b = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(blob => resolve(blob), 'image/png');
        });
        if (b) return b;
      } catch {}
    }

    try {
      const dataUrl = canvas.toDataURL('image/png');
      return this.dataUrlToBlob(dataUrl);
    } catch {
      return this.dataUrlToBlob('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    }
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // --- Bulk Barcode Generation (Label Sheets & ZIP) ---

  /**
   * Ingests CSV payloads and generates a multi-page printable PDF label sheet
   * on standard A4 paper (24-up or 12-up grid).
   */
  async generateLabelSheetPdf(
    options: BulkBarcodeGenerationOptions,
    filename: string = 'barcode-labels.pdf'
  ): Promise<{ file: File; savedUri?: string }> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // A4 dimensions in points: 595.28 x 841.89
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const is24Up = options.gridType === '24-up';
    const cols = is24Up ? 3 : 2;
    const rows = is24Up ? 8 : 6;
    const labelsPerPage = cols * rows;

    const marginX = 20;
    const marginY = 25;
    const cellWidth = (pageWidth - marginX * 2) / cols;
    const cellHeight = (pageHeight - marginY * 2) / rows;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);

    // Anti-DoS limit: cap at 1,000 barcodes per PDF generation
    const MAX_LABEL_LIMIT = 1000;
    const payloads = (options.payloads || []).slice(0, MAX_LABEL_LIMIT);

    for (let i = 0; i < payloads.length; i++) {
      if (i > 0 && i % 24 === 0) {
        // Cooperative yield to avoid freezing the browser thread
        await new Promise(r => setTimeout(r, 0));
      }

      const payload = payloads[i];
      const pageIndex = Math.floor(i / labelsPerPage);
      const indexOnPage = i % labelsPerPage;

      if (indexOnPage === 0 && pageIndex > 0) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      }

      const col = indexOnPage % cols;
      const row = Math.floor(indexOnPage / cols);

      const cellX = marginX + col * cellWidth;
      // PDF coordinates start bottom-left, so top-to-bottom row ordering:
      const cellY = pageHeight - marginY - (row + 1) * cellHeight;

      // Draw subtle label border
      currentPage.drawRectangle({
        x: cellX + 3,
        y: cellY + 3,
        width: cellWidth - 6,
        height: cellHeight - 6,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5
      });

      if (options.format === 'QR_CODE') {
        try {
          const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1 });
          const qrBytes = await this.dataUrlToBlob(qrDataUrl).arrayBuffer();
          const embeddedPng = await pdfDoc.embedPng(qrBytes);
          const qrSize = Math.min(cellWidth - 16, cellHeight - 24);
          currentPage.drawImage(embeddedPng, {
            x: cellX + (cellWidth - qrSize) / 2,
            y: cellY + 16,
            width: qrSize,
            height: qrSize
          });
        } catch {}
      } else {
        // Pristine vector 1D barcode lines
        try {
          let bitPattern = '';
          let displayPayload = payload;

          if (options.format === 'EAN_13') {
            const eanRes = this.validateAndComputeEan13(payload);
            displayPayload = eanRes.valid ? eanRes.fullPayload : payload;
            bitPattern = this.encodeEan13Bits(displayPayload);
          } else if (options.format === 'CODE_39') {
            bitPattern = this.encodeCode39Bits(payload.toUpperCase());
          } else {
            bitPattern = this.encodeCode128Bits(payload);
          }

          const marginL = 10;
          const barcodeW = cellWidth - marginL * 2;
          const barW = barcodeW / bitPattern.length;
          const barH = options.includeText !== false ? cellHeight - 28 : cellHeight - 16;
          const startY = cellY + (options.includeText !== false ? 18 : 8);

          for (let b = 0; b < bitPattern.length; b++) {
            if (bitPattern[b] === '1') {
              currentPage.drawRectangle({
                x: cellX + marginL + b * barW,
                y: startY,
                width: barW,
                height: barH,
                color: rgb(0, 0, 0)
              });
            }
          }
        } catch {}
      }

      if (options.includeText !== false) {
        const safeText = payload.replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
        const textWidth = font.widthOfTextAtSize(safeText, 8);
        const textX = cellX + Math.max(4, (cellWidth - textWidth) / 2);
        currentPage.drawText(safeText, {
          x: textX,
          y: cellY + 6,
          size: 8,
          font,
          color: rgb(0.15, 0.15, 0.15)
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const targetName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'application/pdf' })
      : ({ name: targetName, size: blob.size, type: 'application/pdf' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'barcode-sheet', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Bulk generates individual PNG barcode files and packages them into a ZIP archive.
   */
  async generateBulkZip(
    payloads: string[],
    format: BarcodeType1D,
    filename: string = 'barcodes.zip'
  ): Promise<{ file: File; savedUri?: string }> {
    const zip = new JSZip();

    // Anti-DoS limit: cap at 500 items per ZIP generation
    const MAX_ZIP_LIMIT = 500;
    const safePayloads = (payloads || []).slice(0, MAX_ZIP_LIMIT);

    for (let i = 0; i < safePayloads.length; i++) {
      if (i > 0 && i % 20 === 0) {
        // Cooperative yield to avoid freezing the browser thread
        await new Promise(r => setTimeout(r, 0));
      }

      const payload = safePayloads[i];
      try {
        const pngBlob = await this.generateBarcodePngBlob({
          format,
          payload,
          width: 360,
          height: 120,
          includeText: true
        });

        const safePayload = payload.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const entryName = `barcode_${i + 1}_${safePayload}.png`;
        zip.file(entryName, pngBlob);
      } catch {}
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const targetName = filename.endsWith('.zip') ? filename : `${filename}.zip`;

    const file = typeof File !== 'undefined'
      ? new File([zipBlob], targetName, { type: 'application/zip' })
      : ({ name: targetName, size: zipBlob.size, type: 'application/zip' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'barcode-zip', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  // --- Internal Bit Encoders ---

  private encodeCode128Bits(text: string): string {
    const startB = 104;
    let checksum = startB;
    const indices: number[] = [startB];

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 32;
      const validCode = Math.max(0, Math.min(105, code));
      indices.push(validCode);
      checksum += (i + 1) * validCode;
    }

    const checkDigit = checksum % 103;
    indices.push(checkDigit);
    indices.push(106); // Stop

    let bitStr = '';
    for (const idx of indices) {
      const pattern = BarcodeBatchService.CODE128_PATTERNS[idx];
      let isBar = true;
      for (const w of pattern) {
        bitStr += (isBar ? '1' : '0').repeat(parseInt(w, 10));
        isBar = !isBar;
      }
    }
    return bitStr;
  }

  private encodeEan13Bits(payload: string): string {
    const firstDigit = parseInt(payload[0], 10);
    const parities = BarcodeBatchService.EAN_PARITY[firstDigit];

    let bits = '101'; // Start guard

    // Left 6 digits
    for (let i = 1; i <= 6; i++) {
      const d = parseInt(payload[i], 10);
      const isL = parities[i - 1] === 'L';
      bits += isL ? BarcodeBatchService.EAN_L[d] : BarcodeBatchService.EAN_G[d];
    }

    bits += '01010'; // Center guard

    // Right 6 digits (R parity)
    for (let i = 7; i <= 12; i++) {
      const d = parseInt(payload[i], 10);
      bits += BarcodeBatchService.EAN_R[d];
    }

    bits += '101'; // Stop guard
    return bits;
  }

  private encodeCode39Bits(text: string): string {
    const fullText = `*${text}*`;
    let bits = '';

    for (let i = 0; i < fullText.length; i++) {
      const char = fullText[i];
      const pattern = BarcodeBatchService.CODE39_PATTERNS[char] || BarcodeBatchService.CODE39_PATTERNS['-'];

      // 9 elements: 5 bars, 4 spaces
      for (let j = 0; j < 9; j++) {
        const isBar = j % 2 === 0;
        const isWide = pattern[j] === '1';
        const width = isWide ? 3 : 1;
        bits += (isBar ? '1' : '0').repeat(width);
      }
      bits += '0'; // Inter-character gap
    }

    return bits;
  }

  private renderBitPatternToSvg(
    bitPattern: string,
    displayPayload: string,
    options: Barcode1DOptions
  ): string {
    const width = options.width || 360;
    const height = options.height || 120;
    const margin = 20;
    const availableWidth = width - margin * 2;
    const barWidth = (availableWidth / bitPattern.length).toFixed(3);
    const barHeight = options.includeText !== false ? height - 36 : height - 16;
    const lineColor = options.lineColor || '#000000';
    const bgColor = options.backgroundColor || '#ffffff';

    let rects = '';
    for (let i = 0; i < bitPattern.length; i++) {
      if (bitPattern[i] === '1') {
        const x = (margin + i * parseFloat(barWidth)).toFixed(2);
        rects += `<rect x="${x}" y="10" width="${barWidth}" height="${barHeight}" fill="${lineColor}"/>`;
      }
    }

    const textSvg = options.includeText !== false
      ? `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-family="monospace" font-size="14" fill="${lineColor}">${this.escapeXml(displayPayload)}</text>`
      : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="${bgColor}"/>
        ${rects}
        ${textSvg}
      </svg>
    `.trim();
  }
}
