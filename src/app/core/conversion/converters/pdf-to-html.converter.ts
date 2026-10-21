import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfExtractorService } from '../../services/pdf-extractor.service';
import { PdfToHtmlOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToHtmlConverter implements IConverter {
  readonly id = 'pdf-to-html';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-html',
    name: 'PDF to HTML Converter',
    shortTitle: 'PDF to HTML',
    description: 'Convert PDF documents into self-contained, offline-ready HTML files with reflowable and layout modes.',
    sourceFormats: ['.pdf'],
    targetFormat: 'html',
    category: 'pdf-to-format',
    icon: 'code',
    badge: 'Self-Contained',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Outputs a single, 100% self-contained .html file with embedded CSS and images.',
      'Contains zero external network requests — guaranteed to open completely offline.'
    ]
  };

  private extractor = inject(PdfExtractorService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (file.type && file.type !== 'application/pdf' && !name.endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PdfToHtmlOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const mode = options.mode ?? 'reflowable'; // Reflowable is default for phone reading
      const embedImages = options.embedImages ?? true;

      onProgress?.({
        percent: 15,
        stage: 'Inspecting document layout...',
        message: 'Loading PDF and extracting structure...'
      });

      const arrayBuffer = await file.arrayBuffer();

      // Extract tables and images
      const extractedContent = await this.extractor.extractContent(
        arrayBuffer,
        {
          extractText: true,
          extractTables: true,
          extractImages: embedImages,
          extractAttachments: false
        },
        (pct, msg) => {
          onProgress?.({
            percent: Math.round(15 + (pct / 100) * 45),
            stage: msg
          });
        }
      );

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      onProgress?.({
        percent: 65,
        stage: `Generating ${mode} HTML...`,
        message: 'Rendering semantic structure and inline styles...'
      });

      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      let htmlBody = '';

      if (mode === 'layout-preserving') {
        htmlBody = await this.renderLayoutPreserving(pdf, extractedContent, embedImages);
      } else {
        htmlBody = await this.renderReflowable(pdf, extractedContent, embedImages);
      }

      onProgress?.({
        percent: 90,
        stage: 'Assembling self-contained HTML...',
        message: 'Finalizing inline styles and offline assets...'
      });

      const fullHtml = this.wrapInHtmlDocument(baseName, htmlBody, mode);
      const htmlBlob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const htmlFile = new File([htmlBlob], `${baseName}.html`, { type: 'text/html' });
      const previewUrl = URL.createObjectURL(htmlFile);

      return {
        success: true,
        file: htmlFile,
        previewUrl,
        downloadName: htmlFile.name,
        previewData: {
          mode,
          pageCount: numPages,
          characterCount: fullHtml.length,
          tableCount: extractedContent.tables.length,
          imageCount: extractedContent.images.length
        },
        metadata: {
          name: htmlFile.name,
          type: 'text/html',
          sizeBytes: htmlFile.size,
          lastModified: Date.now(),
          extension: 'html'
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to HTML: ${e?.message || e.toString()}`
      };
    }
  }

  private async renderReflowable(
    pdf: any,
    extracted: any,
    embedImages: boolean
  ): Promise<string> {
    const numPages = pdf.numPages;
    const pageHtmls: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = (textContent.items as any[]).filter(
        it => typeof it.str === 'string' && it.str.trim().length > 0 && it.transform
      );

      // Sort items top to bottom (descending y), then left to right (ascending x)
      const sorted = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      // Group into lines
      const lines: Array<{ text: string; fontSize: number; isBold: boolean; y: number }> = [];
      let currentText = '';
      let currentY = sorted[0]?.transform[5] ?? 0;
      let currentFontSize = Math.abs(sorted[0]?.transform[0]) || 12;
      let isBold = (sorted[0]?.fontName || '').toLowerCase().includes('bold');

      for (const it of sorted) {
        const y = it.transform[5];
        const size = Math.abs(it.transform[0]) || 12;
        const bold = (it.fontName || '').toLowerCase().includes('bold');

        if (Math.abs(y - currentY) <= 4) {
          currentText += (currentText ? ' ' : '') + it.str;
        } else {
          if (currentText.trim()) {
            lines.push({ text: currentText.trim(), fontSize: currentFontSize, isBold, y: currentY });
          }
          currentText = it.str;
          currentY = y;
          currentFontSize = size;
          isBold = bold;
        }
      }

      if (currentText.trim()) {
        lines.push({ text: currentText.trim(), fontSize: currentFontSize, isBold, y: currentY });
      }

      // Compute base font size
      const fontSizes = lines.map(l => l.fontSize);
      const baseFontSize = this.computeBaseFontSize(fontSizes);

      const pageParts: string[] = [];
      pageParts.push(`<section class="pdf-page-section" data-page="${pageNum}">`);
      if (pageNum > 1) {
        pageParts.push(`<hr class="page-divider" aria-label="Page ${pageNum}" />`);
      }

      let currentPara: string[] = [];
      let prevY = 0;

      for (const line of lines) {
        const yGap = prevY ? Math.abs(prevY - line.y) : 0;
        const isH1 = line.fontSize >= baseFontSize * 1.6;
        const isH2 = !isH1 && line.fontSize >= baseFontSize * 1.35;
        const isH3 = !isH1 && !isH2 && (line.fontSize >= baseFontSize * 1.18 || (line.isBold && line.text.length < 70));

        const cleanText = this.escapeHtml(line.text);

        if (isH1 || isH2 || isH3) {
          if (currentPara.length > 0) {
            pageParts.push(`<p>${currentPara.join(' ')}</p>`);
            currentPara = [];
          }
          const tag = isH1 ? 'h1' : isH2 ? 'h2' : 'h3';
          pageParts.push(`<${tag}>${cleanText}</${tag}>`);
          prevY = line.y;
          continue;
        }

        // Paragraph break
        if (yGap > line.fontSize * 1.6 && currentPara.length > 0) {
          pageParts.push(`<p>${currentPara.join(' ')}</p>`);
          currentPara = [];
        }

        currentPara.push(cleanText);
        prevY = line.y;
      }

      if (currentPara.length > 0) {
        pageParts.push(`<p>${currentPara.join(' ')}</p>`);
      }

      // Append tables
      const pageTables = extracted.tables.filter((t: any) => t.pageNumber === pageNum);
      for (const tbl of pageTables) {
        pageParts.push(this.renderHtmlTable(tbl.headers, tbl.rows));
      }

      // Append images
      if (embedImages) {
        const pageImages = extracted.images.filter((img: any) => img.pageNumber === pageNum);
        for (const img of pageImages) {
          if (img.dataUrl) {
            pageParts.push(
              `<figure class="img-figure"><img src="${img.dataUrl}" alt="Document Image" loading="lazy" /><figcaption>Page ${pageNum}</figcaption></figure>`
            );
          }
        }
      }

      pageParts.push(`</section>`);
      pageHtmls.push(pageParts.join('\n'));
    }

    return pageHtmls.join('\n');
  }

  private async renderLayoutPreserving(
    pdf: any,
    extracted: any,
    embedImages: boolean
  ): Promise<string> {
    const numPages = pdf.numPages;
    const pageHtmls: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      const items = (textContent.items as any[]).filter(
        it => typeof it.str === 'string' && it.str.trim().length > 0 && it.transform
      );

      // Sort items top-to-bottom so DOM reading order matches visual order
      items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      const pageParts: string[] = [];
      pageParts.push(
        `<div class="pdf-page-fixed" style="width: ${Math.round(viewport.width)}px; height: ${Math.round(viewport.height)}px;">`
      );

      for (const it of items) {
        const x = Math.round(it.transform[4]);
        // PDF coordinates have origin at bottom-left; convert to top-left
        const y = Math.round(viewport.height - it.transform[5] - (it.height || 12));
        const fontSize = Math.round(Math.abs(it.transform[0])) || 12;
        const isBold = (it.fontName || '').toLowerCase().includes('bold');

        pageParts.push(
          `<span class="pdf-text-item" style="left: ${x}px; top: ${y}px; font-size: ${fontSize}px; ${isBold ? 'font-weight: bold;' : ''}">${this.escapeHtml(it.str)}</span>`
        );
      }

      // Add page images
      if (embedImages) {
        const pageImages = extracted.images.filter((img: any) => img.pageNumber === pageNum);
        for (const img of pageImages) {
          if (img.dataUrl) {
            pageParts.push(
              `<img src="${img.dataUrl}" alt="Embedded Image" class="pdf-fixed-img" />`
            );
          }
        }
      }

      pageParts.push(`</div>`);
      pageHtmls.push(pageParts.join('\n'));
    }

    return pageHtmls.join('\n');
  }

  private renderHtmlTable(headers: string[], rows: string[][]): string {
    let out = '<div class="table-container"><table class="pdf-table">';
    if (headers.length > 0) {
      out += '<thead><tr>';
      for (const h of headers) {
        out += `<th>${this.escapeHtml(h)}</th>`;
      }
      out += '</tr></thead>';
    }
    out += '<tbody>';
    for (const row of rows) {
      out += '<tr>';
      for (const cell of row) {
        out += `<td>${this.escapeHtml(cell)}</td>`;
      }
      out += '</tr>';
    }
    out += '</tbody></table></div>';
    return out;
  }

  private computeBaseFontSize(sizes: number[]): number {
    if (!sizes.length) return 12;
    const sorted = [...sizes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 12;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private wrapInHtmlDocument(title: string, bodyContent: string, mode: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    /* Reset & Clean Mobile-first Typography - 100% Offline with zero external requests */
    :root {
      --bg-color: #ffffff;
      --text-color: #1f2937;
      --card-bg: #f9fafb;
      --border-color: #e5e7eb;
      --primary-color: #2563eb;
      --table-header-bg: #f3f4f6;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #111827;
        --text-color: #f3f4f6;
        --card-bg: #1f2937;
        --border-color: #374151;
        --primary-color: #60a5fa;
        --table-header-bg: #1e293b;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--bg-color);
      padding: 16px;
      margin: 0 auto;
      max-width: 800px;
      word-wrap: break-word;
    }
    h1, h2, h3, h4 {
      color: var(--text-color);
      font-weight: 700;
      margin: 1.2em 0 0.5em 0;
      line-height: 1.25;
    }
    h1 { font-size: 1.75rem; border-bottom: 2px solid var(--border-color); padding-bottom: 6px; }
    h2 { font-size: 1.4rem; }
    h3 { font-size: 1.15rem; }
    p {
      margin-bottom: 1em;
    }
    .page-divider {
      border: 0;
      height: 1px;
      background: var(--border-color);
      margin: 28px 0;
    }
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 1.2em 0;
      -webkit-overflow-scrolling: touch;
    }
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    .pdf-table th, .pdf-table td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }
    .pdf-table th {
      background-color: var(--table-header-bg);
      font-weight: 600;
    }
    .img-figure {
      margin: 1.5em 0;
      text-align: center;
    }
    .img-figure img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }
    .img-figure figcaption {
      font-size: 0.85rem;
      opacity: 0.75;
      margin-top: 4px;
    }
    /* Fixed Layout Styles */
    .pdf-page-fixed {
      position: relative;
      background: white;
      color: black;
      margin: 16px auto;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      page-break-after: always;
    }
    .pdf-text-item {
      position: absolute;
      white-space: pre;
      line-height: 1;
      transform-origin: top left;
    }
    .pdf-fixed-img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
  }
}
