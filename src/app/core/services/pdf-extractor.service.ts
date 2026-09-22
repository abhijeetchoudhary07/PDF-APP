import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  ExtractedDocumentContent,
  ExtractedImageItem,
  ExtractedTableData,
  ExtractedAttachmentItem
} from '../models/pdf-analysis.types';
import { PdfPageManagerService } from './pdf-page-manager.service';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface ExtractionOptions {
  extractText: boolean;
  extractImages: boolean;
  extractTables: boolean;
  extractAttachments: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PdfExtractorService {
  public pageManager: PdfPageManagerService;

  constructor(pageManager?: PdfPageManagerService) {
    this.pageManager = pageManager ?? new PdfPageManagerService();
  }

  /**
   * Extracts selected content types from a PDF in one unified pass.
   */
  async extractContent(
    source: File | ArrayBuffer,
    options: ExtractionOptions,
    onProgress?: (percent: number, message: string) => void
  ): Promise<ExtractedDocumentContent> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    onProgress?.(10, 'Initializing PDF parser...');

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0))
    } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const pageTexts: { pageNumber: number; text: string; paragraphs: string[] }[] = [];
    const images: ExtractedImageItem[] = [];
    const tables: ExtractedTableData[] = [];
    const attachments: ExtractedAttachmentItem[] = [];

    // 1. Text & Table & Image Extraction per page
    for (let p = 1; p <= totalPages; p++) {
      const stepPct = 10 + Math.floor((p / totalPages) * 70);
      onProgress?.(stepPct, `Processing page ${p} of ${totalPages}...`);

      const page = await pdf.getPage(p);

      // (a) Text extraction
      if (options.extractText || options.extractTables) {
        const textContent = await page.getTextContent();
        const extractedPage = this.parseStructuredText(textContent.items, p);

        if (options.extractText) {
          pageTexts.push(extractedPage);
        }

        // (b) Table extraction
        if (options.extractTables) {
          const detectedTables = this.detectTablesFromTextItems(textContent.items, p);
          tables.push(...detectedTables);
        }
      }

      // (c) Image extraction
      if (options.extractImages) {
        try {
          const pageImages = await this.extractImagesFromPage(page, p);
          images.push(...pageImages);
        } catch {
          // Graceful fallback if image stream has non-standard format
        }
      }
    }

    // 2. Attachment extraction via pdf-lib Catalog inspection
    if (options.extractAttachments) {
      onProgress?.(85, 'Extracting embedded file attachments...');
      try {
        const extractedAtts = await this.extractAttachmentsFromCatalog(arrayBuffer);
        attachments.push(...extractedAtts);
      } catch {
        // Continue if attachments parse fails
      }
    }

    onProgress?.(100, 'Content extraction complete.');

    // Build unified full text
    const fullText = pageTexts
      .map(pt => `--- Page ${pt.pageNumber} ---\n\n${pt.text}`)
      .join('\n\n');

    return {
      totalPages,
      fullText,
      pageTexts,
      images,
      tables,
      attachments
    };
  }

  /**
   * Parses text items while preserving reading order and detecting paragraph breaks.
   */
  private parseStructuredText(
    items: any[],
    pageNumber: number
  ): { pageNumber: number; text: string; paragraphs: string[] } {
    if (!items || items.length === 0) {
      return { pageNumber, text: '', paragraphs: [] };
    }

    // Filter valid text items with transform coordinates
    const validItems = items
      .filter(item => typeof item.str === 'string' && item.transform && item.transform.length >= 6)
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: item.height || 12,
        width: item.width || 0
      }));

    // Sort by Y descending (top to bottom), then X ascending (left to right)
    validItems.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 3) {
        return yDiff;
      }
      return a.x - b.x;
    });

    const lines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;
    let lastHeight = 12;

    const paragraphs: string[] = [];
    let currentParagraphLines: string[] = [];

    for (const item of validItems) {
      if (lastY === null) {
        currentLine = item.str;
        lastY = item.y;
        lastHeight = item.height;
      } else {
        const yGap = Math.abs(lastY - item.y);

        if (yGap > 3) {
          // New line
          lines.push(currentLine.trim());

          // Check if paragraph break (gap > 1.4 * font height)
          if (yGap > lastHeight * 1.4) {
            if (currentParagraphLines.length > 0) {
              paragraphs.push(currentParagraphLines.join(' '));
              currentParagraphLines = [];
            }
          }

          currentParagraphLines.push(currentLine.trim());
          currentLine = item.str;
          lastY = item.y;
          lastHeight = item.height;
        } else {
          // Same line: append with space if needed
          if (currentLine.length > 0 && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
            currentLine += ' ' + item.str;
          } else {
            currentLine += item.str;
          }
        }
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
      currentParagraphLines.push(currentLine.trim());
    }

    if (currentParagraphLines.length > 0) {
      paragraphs.push(currentParagraphLines.join(' '));
    }

    return {
      pageNumber,
      text: lines.join('\n'),
      paragraphs: paragraphs.filter(p => p.trim().length > 0)
    };
  }

  /**
   * Heuristic table detection based on coordinate grid alignments.
   */
  private detectTablesFromTextItems(items: any[], pageNumber: number): ExtractedTableData[] {
    const validItems = items
      .filter(item => typeof item.str === 'string' && item.str.trim().length > 0 && item.transform)
      .map(item => ({
        str: item.str.trim(),
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        width: item.width || 0,
        height: item.height || 12
      }));

    if (validItems.length < 4) return [];

    // Group items into rows by Y coordinate with threshold
    const rowMap = new Map<number, typeof validItems>();
    for (const item of validItems) {
      // Find existing bucket within 4px
      let matchedY: number | null = null;
      for (const y of rowMap.keys()) {
        if (Math.abs(y - item.y) <= 4) {
          matchedY = y;
          break;
        }
      }

      if (matchedY !== null) {
        rowMap.get(matchedY)!.push(item);
      } else {
        rowMap.set(item.y, [item]);
      }
    }

    // Sort rows top-to-bottom
    const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);

    // Filter rows that have at least 2 columns
    const potentialTableRows: string[][] = [];

    for (const y of sortedY) {
      const rowItems = rowMap.get(y)!;
      if (rowItems.length >= 2) {
        rowItems.sort((a, b) => a.x - b.x);
        potentialTableRows.push(rowItems.map(i => i.str));
      }
    }

    if (potentialTableRows.length >= 2) {
      // Normalize column counts
      const maxCols = Math.max(...potentialTableRows.map(r => r.length));
      if (maxCols >= 2) {
        const normalizedRows = potentialTableRows.map(row => {
          const padded = [...row];
          while (padded.length < maxCols) padded.push('');
          return padded;
        });

        const headers = normalizedRows[0] || [];
        const dataRows = normalizedRows.slice(1);

        return [
          {
            id: `table_p${pageNumber}_1`,
            pageNumber,
            headers,
            rows: dataRows,
            confidence: 0.8
          }
        ];
      }
    }

    return [];
  }

  /**
   * Extracts embedded images from a page using pdfjs operator list and canvas rendering.
   */
  private async extractImagesFromPage(page: any, pageNumber: number): Promise<ExtractedImageItem[]> {
    const images: ExtractedImageItem[] = [];
    const ops = await page.getOperatorList();
    const commonObjs = page.commonObjs;
    const objs = page.objs;

    const imgNameSet = new Set<string>();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      // OPS.paintImageXObject (85) or OPS.paintInlineImageXObject (86)
      if (fn === pdfjsLib.OPS.paintImageXObject || fn === 85) {
        const imgName = args[0];
        if (imgName && !imgNameSet.has(imgName)) {
          imgNameSet.add(imgName);

          const imgObj = await new Promise<any>(resolve => {
            if (objs.has(imgName)) {
              resolve(objs.get(imgName));
            } else if (commonObjs.has(imgName)) {
              resolve(commonObjs.get(imgName));
            } else {
              objs.get(imgName, (obj: any) => resolve(obj));
            }
          });

          if (imgObj && (imgObj.data || imgObj.bitmap || imgObj instanceof ImageBitmap)) {
            const extracted = await this.convertImageObjToItem(imgObj, pageNumber, images.length + 1);
            if (extracted) {
              images.push(extracted);
            }
          }
        }
      }
    }

    return images;
  }

  private async convertImageObjToItem(
    imgObj: any,
    pageNumber: number,
    imgIdx: number
  ): Promise<ExtractedImageItem | null> {
    try {
      const width = imgObj.width || (imgObj.bitmap ? imgObj.bitmap.width : 300);
      const height = imgObj.height || (imgObj.bitmap ? imgObj.bitmap.height : 300);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      if (imgObj.bitmap) {
        ctx.drawImage(imgObj.bitmap, 0, 0);
      } else if (imgObj instanceof ImageBitmap) {
        ctx.drawImage(imgObj, 0, 0);
      } else if (imgObj.data) {
        const imgData = ctx.createImageData(width, height);
        const srcData = imgObj.data;

        // If RGB (3 bytes per pixel) vs RGBA (4 bytes per pixel)
        if (srcData.length === width * height * 3) {
          let s = 0;
          let d = 0;
          while (s < srcData.length) {
            imgData.data[d] = srcData[s];
            imgData.data[d + 1] = srcData[s + 1];
            imgData.data[d + 2] = srcData[s + 2];
            imgData.data[d + 3] = 255;
            s += 3;
            d += 4;
          }
        } else if (srcData.length === width * height * 4) {
          imgData.data.set(srcData);
        } else {
          // Gray or other format fallback
          let d = 0;
          for (let i = 0; i < srcData.length && d < imgData.data.length; i++) {
            const val = srcData[i];
            imgData.data[d] = val;
            imgData.data[d + 1] = val;
            imgData.data[d + 2] = val;
            imgData.data[d + 3] = 255;
            d += 4;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise<Blob>(res =>
        canvas.toBlob(b => res(b || new Blob()), 'image/png')
      );

      return {
        id: `img_p${pageNumber}_${imgIdx}`,
        pageNumber,
        format: 'png',
        width,
        height,
        sizeBytes: blob.size,
        dataUrl,
        blob,
        name: `page_${pageNumber}_img_${imgIdx}.png`,
        selected: true
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts embedded attachments from PDF Catalog /Names /EmbeddedFiles.
   */
  private async extractAttachmentsFromCatalog(
    arrayBuffer: ArrayBuffer
  ): Promise<ExtractedAttachmentItem[]> {
    const attachments: ExtractedAttachmentItem[] = [];
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const catalog = pdfDoc.catalog;

    if (!catalog.has(PDFName.of('Names'))) return [];

    const names = catalog.lookup(PDFName.of('Names'));
    if (!(names instanceof PDFDict) || !names.has(PDFName.of('EmbeddedFiles'))) return [];

    const embeddedFiles = names.lookup(PDFName.of('EmbeddedFiles'));
    if (!(embeddedFiles instanceof PDFDict)) return [];

    if (embeddedFiles.has(PDFName.of('Names'))) {
      const namesArray = embeddedFiles.lookup(PDFName.of('Names'));
      if (namesArray instanceof PDFArray) {
        for (let i = 0; i < namesArray.size(); i += 2) {
          const nameObj = namesArray.get(i);
          const fileSpec = namesArray.lookup(i + 1);

          const fileName = typeof nameObj?.toString === 'function' ? nameObj.toString().replace(/[\\()]/g, '') : `attachment_${i / 2 + 1}`;

          if (fileSpec instanceof PDFDict && fileSpec.has(PDFName.of('EF'))) {
            const efDict = fileSpec.lookup(PDFName.of('EF'));
            if (efDict instanceof PDFDict && efDict.has(PDFName.of('F'))) {
              const stream = efDict.lookup(PDFName.of('F'));
              if (stream instanceof PDFStream) {
                const streamBytes = stream.getContents();
                const blob = new Blob([streamBytes as any], { type: 'application/octet-stream' });
                attachments.push({
                  id: `attach_${attachments.length + 1}`,
                  name: fileName,
                  mimeType: 'application/octet-stream',
                  sizeBytes: blob.size,
                  blob
                });
              }
            }
          }
        }
      }
    }

    return attachments;
  }

  /**
   * Exports extracted images as a ZIP archive.
   */
  async exportImagesAsZip(
    images: ExtractedImageItem[],
    zipName = 'extracted_images.zip'
  ): Promise<File> {
    const zip = new JSZip();
    for (const img of images) {
      zip.file(img.name, img.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return new File([zipBlob], zipName, { type: 'application/zip' });
  }

  /**
   * Exports extracted table data as CSV.
   */
  exportTableAsCsv(table: ExtractedTableData, filename = 'table.csv'): File {
    const allRows = [table.headers, ...table.rows];
    const csvContent = allRows
      .map(row =>
        row
          .map(cell => {
            const escaped = String(cell || '').replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    return new File([blob], filename, { type: 'text/csv' });
  }

  /**
   * Exports extracted table data as Excel spreadsheet (.xlsx).
   */
  exportTableAsExcel(table: ExtractedTableData, filename = 'table.xlsx'): File {
    const allRows = [table.headers, ...table.rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    XLSX.utils.book_append_sheet(wb, ws, `Page ${table.pageNumber}`);

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    return new File([blob], filename, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }
}
