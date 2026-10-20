import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { PDFDocument, PDFName, PDFStream, PDFArray, PDFRawStream, rgb, StandardFonts } from 'pdf-lib';
import {
  DocumentFingerprint,
  DriftComparisonResult,
  PageHashInfo
} from '../models/pdf-integrity.types';
import { StorageService } from './storage.service';

const SAVED_RECEIPTS_KEY = 'IFH_INTEGRITY_RECEIPTS';

@Injectable({
  providedIn: 'root'
})
export class PdfFingerprintService {
  private readonly storage = inject(StorageService);

  /**
   * Computes SHA-256 hash of an ArrayBuffer or Uint8Array.
   */
  async computeSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
    const buffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generates a cryptographic fingerprint of a PDF document,
   * including file SHA-256 and per-page content hashes.
   */
  async generateFingerprint(
    source: File | ArrayBuffer | Uint8Array,
    fileNameOverride?: string
  ): Promise<DocumentFingerprint> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const fileName = fileNameOverride || (source instanceof File ? source.name : 'document.pdf');

    // 1. Whole-file cryptographic hash
    const fileSha256 = await this.computeSha256(bytes);

    // 2. Parse PDF to extract page-level contents and geometry
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    const title = pdfDoc.getTitle();
    const author = pdfDoc.getAuthor();
    const creator = pdfDoc.getCreator();
    const producer = pdfDoc.getProducer();
    const creationDate = pdfDoc.getCreationDate()?.toISOString();
    const modificationDate = pdfDoc.getModificationDate()?.toISOString();

    const pageHashes: PageHashInfo[] = [];

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      const mediaBox = page.getMediaBox();
      const cropBox = page.getCropBox();
      const rotation = page.getRotation().angle;

      // Extract raw stream bytes of the page contents
      const contentChunks: Uint8Array[] = [];
      const contents = page.node.get(PDFName.of('Contents'));

      if (contents) {
        this.extractStreamBytes(contents, pdfDoc, contentChunks);
      }

      // Encode geometry metadata to combine with content streams
      const geomHeader = `M:${mediaBox.x},${mediaBox.y},${mediaBox.width},${mediaBox.height}|C:${cropBox.x},${cropBox.y},${cropBox.width},${cropBox.height}|R:${rotation};`;
      const geomBytes = new TextEncoder().encode(geomHeader);

      const totalStreamLen = contentChunks.reduce((acc, c) => acc + c.length, 0);
      const combined = new Uint8Array(geomBytes.length + totalStreamLen);
      combined.set(geomBytes, 0);

      let offset = geomBytes.length;
      for (const chunk of contentChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const pageHash = await this.computeSha256(combined);
      pageHashes.push({
        pageIndex: i,
        pageNumber: i + 1,
        contentHash: pageHash,
        byteLength: totalStreamLen
      });
    }

    const fingerprintId = `fp_${Date.now()}_${fileSha256.slice(0, 8)}`;

    return {
      id: fingerprintId,
      fileName,
      fileSize: bytes.length,
      pageCount,
      fileSha256,
      pageHashes,
      createdAt: new Date().toISOString(),
      metadataSummary: {
        title,
        author,
        creator,
        producer,
        creationDate,
        modificationDate
      }
    };
  }

  /**
   * Helper to safely extract raw or decoded bytes from a PDF /Contents object or array.
   */
  private extractStreamBytes(obj: any, doc: PDFDocument, out: Uint8Array[]): void {
    if (!obj) return;

    if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
      try {
        const data = obj.getContents();
        if (data && data.length > 0) out.push(data);
      } catch {
        // Fallback if decoding fails
      }
      return;
    }

    if (obj instanceof PDFArray) {
      const size = obj.size();
      for (let i = 0; i < size; i++) {
        const item = obj.get(i);
        const resolved = doc.context.lookup(item);
        this.extractStreamBytes(resolved, doc, out);
      }
      return;
    }

    // Indirect reference
    try {
      const resolved = doc.context.lookup(obj);
      if (resolved && resolved !== obj) {
        this.extractStreamBytes(resolved, doc, out);
      }
    } catch {
      // Ignored
    }
  }

  /**
   * Compares a document against a previously saved receipt and reports page-level drift.
   */
  async compareWithReceipt(
    receipt: DocumentFingerprint,
    target: File | ArrayBuffer | Uint8Array,
    targetFileName?: string
  ): Promise<DriftComparisonResult> {
    const targetFingerprint = await this.generateFingerprint(target, targetFileName);
    const resolvedTargetName = targetFileName || targetFingerprint.fileName;

    // Case 1: Identical file bytes
    if (targetFingerprint.fileSha256 === receipt.fileSha256) {
      return {
        status: 'identical',
        isByteIdentical: true,
        isPageCountMatch: true,
        hasMetadataDriftOnly: false,
        targetFileName: resolvedTargetName,
        receiptFileName: receipt.fileName,
        receiptTimestamp: receipt.createdAt,
        changedPages: [],
        addedPages: [],
        removedPages: [],
        identicalPages: receipt.pageHashes.map(p => p.pageNumber),
        message: 'Identical document: file cryptographic checksum matches receipt exactly.'
      };
    }

    // Case 2: Byte mismatch. Test if page-level contents match exactly.
    const identicalPages: number[] = [];
    const changedPages: number[] = [];
    const addedPages: number[] = [];
    const removedPages: number[] = [];

    const minPages = Math.min(receipt.pageCount, targetFingerprint.pageCount);

    for (let i = 0; i < minPages; i++) {
      const receiptPage = receipt.pageHashes[i];
      const targetPage = targetFingerprint.pageHashes[i];
      if (receiptPage && targetPage && receiptPage.contentHash === targetPage.contentHash) {
        identicalPages.push(i + 1);
      } else {
        changedPages.push(i + 1);
      }
    }

    if (targetFingerprint.pageCount > receipt.pageCount) {
      for (let p = receipt.pageCount + 1; p <= targetFingerprint.pageCount; p++) {
        addedPages.push(p);
      }
    } else if (targetFingerprint.pageCount < receipt.pageCount) {
      for (let p = targetFingerprint.pageCount + 1; p <= receipt.pageCount; p++) {
        removedPages.push(p);
      }
    }

    const isPageCountMatch = targetFingerprint.pageCount === receipt.pageCount;
    const hasMetadataDriftOnly = isPageCountMatch && changedPages.length === 0 && addedPages.length === 0 && removedPages.length === 0;

    if (hasMetadataDriftOnly) {
      return {
        status: 'metadata_only',
        isByteIdentical: false,
        isPageCountMatch: true,
        hasMetadataDriftOnly: true,
        targetFileName: resolvedTargetName,
        receiptFileName: receipt.fileName,
        receiptTimestamp: receipt.createdAt,
        changedPages: [],
        addedPages: [],
        removedPages: [],
        identicalPages,
        message: 'Document page contents are identical. Only document metadata or structural headers changed.'
      };
    }

    return {
      status: 'content_drift',
      isByteIdentical: false,
      isPageCountMatch,
      hasMetadataDriftOnly: false,
      targetFileName: resolvedTargetName,
      receiptFileName: receipt.fileName,
      receiptTimestamp: receipt.createdAt,
      changedPages,
      addedPages,
      removedPages,
      identicalPages,
      message: `Content drift detected: ${changedPages.length} changed page(s), ${addedPages.length} added, ${removedPages.length} removed.`
    };
  }

  // --- Local receipt storage ---

  async saveReceipt(receipt: DocumentFingerprint): Promise<void> {
    const list = await this.getSavedReceipts();
    const filtered = list.filter(r => r.id !== receipt.id && r.fileSha256 !== receipt.fileSha256);
    filtered.unshift(receipt);
    await Preferences.set({
      key: SAVED_RECEIPTS_KEY,
      value: JSON.stringify(filtered.slice(0, 50))
    });
  }

  async getSavedReceipts(): Promise<DocumentFingerprint[]> {
    try {
      const res = await Preferences.get({ key: SAVED_RECEIPTS_KEY });
      if (!res.value) return [];
      return JSON.parse(res.value) as DocumentFingerprint[];
    } catch {
      return [];
    }
  }

  async deleteReceipt(receiptId: string): Promise<void> {
    const list = await this.getSavedReceipts();
    const updated = list.filter(r => r.id !== receiptId);
    await Preferences.set({
      key: SAVED_RECEIPTS_KEY,
      value: JSON.stringify(updated)
    });
  }

  // --- Receipt Export ---

  exportReceiptAsText(receipt: DocumentFingerprint): string {
    const lines: string[] = [
      '================================================================',
      '           DOCUMENT INTEGRITY & FINGERPRINT RECEIPT             ',
      '================================================================',
      `File Name:       ${receipt.fileName}`,
      `File Size:       ${receipt.fileSize} bytes (${(receipt.fileSize / 1024).toFixed(1)} KB)`,
      `Total Pages:     ${receipt.pageCount}`,
      `Generated At:    ${receipt.createdAt}`,
      `Receipt ID:      ${receipt.id}`,
      '----------------------------------------------------------------',
      'FILE SHA-256 CHECKSUM:',
      receipt.fileSha256,
      '----------------------------------------------------------------',
      'PAGE-BY-PAGE CONTENT CHECKSUMS (SHA-256):'
    ];

    for (const page of receipt.pageHashes) {
      lines.push(`Page ${String(page.pageNumber).padStart(3, ' ')}:  ${page.contentHash}`);
    }

    lines.push('================================================================');
    lines.push('VERIFICATION INSTRUCTIONS:');
    lines.push('Verify this document at any time by loading this receipt in the');
    lines.push('Indian Form Helper Integrity Verifier tool to inspect page drift.');
    lines.push('================================================================');

    return lines.join('\n');
  }

  async exportReceiptAsPdf(receipt: DocumentFingerprint): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await doc.embedFont(StandardFonts.Courier);

    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Top banner
    page.drawRectangle({
      x: 36,
      y: height - 100,
      width: width - 72,
      height: 64,
      color: rgb(0.31, 0.27, 0.9)
    });

    page.drawText('DOCUMENT INTEGRITY RECEIPT', {
      x: 52,
      y: height - 64,
      size: 16,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText('Cryptographic Fingerprint & Verification Certificate', {
      x: 52,
      y: height - 84,
      size: 10,
      font,
      color: rgb(0.9, 0.9, 0.95)
    });

    // Metadata section
    let y = height - 125;
    const drawMetaRow = (label: string, value: string) => {
      page.drawText(label, { x: 40, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.3) });
      page.drawText(value, { x: 140, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    };

    drawMetaRow('Document Name:', receipt.fileName);
    drawMetaRow('File Size:', `${receipt.fileSize} bytes (${(receipt.fileSize / 1024).toFixed(1)} KB)`);
    drawMetaRow('Total Pages:', `${receipt.pageCount}`);
    drawMetaRow('Created At:', receipt.createdAt);
    drawMetaRow('Receipt ID:', receipt.id);

    y -= 10;
    // Whole file SHA-256 Box
    page.drawRectangle({
      x: 36,
      y: y - 36,
      width: width - 72,
      height: 44,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.85, 0.88, 0.93),
      borderWidth: 1
    });

    page.drawText('FILE SHA-256 CHECKSUM:', {
      x: 46,
      y: y - 4,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.45)
    });

    page.drawText(receipt.fileSha256, {
      x: 46,
      y: y - 22,
      size: 8.5,
      font: fontMono,
      color: rgb(0.1, 0.15, 0.25)
    });

    y -= 60;

    // Per-page table header
    page.drawText('PAGE-BY-PAGE CONTENT HASHES', {
      x: 40,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.2)
    });

    y -= 16;
    page.drawLine({
      start: { x: 36, y: y + 8 },
      end: { x: width - 36, y: y + 8 },
      thickness: 1,
      color: rgb(0.8, 0.85, 0.9)
    });

    const maxItemsOnFirstPage = 22;
    const items = receipt.pageHashes.slice(0, maxItemsOnFirstPage);

    for (const p of items) {
      page.drawText(`Page ${p.pageNumber}:`, {
        x: 40,
        y,
        size: 8.5,
        font: fontBold,
        color: rgb(0.25, 0.3, 0.4)
      });

      page.drawText(p.contentHash, {
        x: 95,
        y,
        size: 8,
        font: fontMono,
        color: rgb(0.15, 0.2, 0.3)
      });

      y -= 15;
    }

    if (receipt.pageHashes.length > maxItemsOnFirstPage) {
      page.drawText(`(+ ${receipt.pageHashes.length - maxItemsOnFirstPage} more pages recorded in receipt data)`, {
        x: 40,
        y,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.6)
      });
      y -= 16;
    }

    // Security footer stamp
    page.drawRectangle({
      x: 36,
      y: 40,
      width: width - 72,
      height: 48,
      color: rgb(0.97, 0.98, 1.0),
      borderColor: rgb(0.8, 0.85, 0.95),
      borderWidth: 1
    });

    page.drawText('VERIFICATION NOTICE', {
      x: 48,
      y: 72,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.4, 0.7)
    });

    page.drawText('This receipt contains an immutable cryptographic fingerprint generated on-device.', {
      x: 48,
      y: 58,
      size: 7.5,
      font,
      color: rgb(0.35, 0.4, 0.5)
    });

    page.drawText('No files were transmitted over the network.', {
      x: 48,
      y: 48,
      size: 7.5,
      font,
      color: rgb(0.35, 0.4, 0.5)
    });

    return await doc.save();
  }

  async saveReceiptPdfFile(receipt: DocumentFingerprint): Promise<string | undefined> {
    const pdfBytes = await this.exportReceiptAsPdf(receipt);
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const safeName = `receipt_${receipt.fileName.replace(/\.pdf$/i, '')}.pdf`;
    const file = new File([blob], safeName, { type: 'application/pdf' });
    return await this.storage.saveFile(file, 'integrity_receipt');
  }
}
