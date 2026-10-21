import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfExtractorService } from '../../services/pdf-extractor.service';
import { PdfToMarkdownOptions } from '../../models/conversion-features.types';

interface TextLine {
  text: string;
  fontSize: number;
  isBold: boolean;
  y: number;
  x: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfToMarkdownConverter implements IConverter {
  readonly id = 'pdf-to-markdown';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-markdown',
    name: 'PDF to Markdown Converter',
    shortTitle: 'PDF to Markdown',
    description: 'Convert PDF documents into structured Markdown (.md) with headings, tables, lists, links, and images.',
    sourceFormats: ['.pdf'],
    targetFormat: 'md',
    category: 'pdf-to-format',
    icon: 'logo-markdown',
    badge: 'Markdown',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Extracts structured text, headings, bullet/numbered lists, and pipe tables into GitHub-flavored Markdown.',
      'Complex graphical layouts are converted into sequential document flow.'
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
    options: PdfToMarkdownOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const imageMode = options.imageMode ?? 'inline';
      onProgress?.({
        percent: 15,
        stage: 'Inspecting PDF document...',
        message: 'Parsing document structure and tables...'
      });

      const arrayBuffer = await file.arrayBuffer();

      // Step 1: Use PdfExtractorService for unified table and image detection
      const extractedContent = await this.extractor.extractContent(
        arrayBuffer,
        {
          extractText: true,
          extractTables: true,
          extractImages: imageMode !== 'none',
          extractAttachments: false
        },
        (pct, msg) => {
          onProgress?.({
            percent: Math.round(15 + (pct / 100) * 45),
            stage: msg
          });
        }
      );

      onProgress?.({
        percent: 65,
        stage: 'Analyzing typography hierarchy...',
        message: 'Detecting headings, lists, links, and pipe tables...'
      });

      // Step 2: Open with pdfjsLib to inspect text positioning, fonts, and annotations
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      const pageMarkdownSections: string[] = [];
      const sidecarImages: Array<{ name: string; blob: Blob }> = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const annotations = await page.getAnnotations();

        // Extract link annotations
        const linkMap = new Map<string, string>(); // text or coordinate key -> url
        for (const annot of annotations) {
          if (annot.subtype === 'Link' && (annot.url || annot.unsafeUrl)) {
            const url = annot.url || annot.unsafeUrl;
            if (annot.rect) {
              const key = `${Math.round(annot.rect[0])}_${Math.round(annot.rect[1])}`;
              linkMap.set(key, url);
            }
          }
        }

        // Group text items into lines with font sizing
        const items = (textContent.items as any[]).filter(
          it => typeof it.str === 'string' && it.str.trim().length > 0 && it.transform
        );

        const lines = this.groupItemsIntoLines(items);

        // Find baseline font size
        const fontSizes = lines.map(l => l.fontSize);
        const baseFontSize = this.computeBaseFontSize(fontSizes);

        // Check if page has tables from extractor
        const pageTables = extractedContent.tables.filter(t => t.pageNumber === pageNum);

        // Check if page has images
        const pageImages = extractedContent.images.filter(img => img.pageNumber === pageNum);

        // Build markdown content for this page
        const mdParts: string[] = [];

        // If page > 1, add page comment or divider
        if (pageNum > 1) {
          mdParts.push(`\n---\n`);
        }

        // Process lines into headings, lists, and paragraphs
        let currentPara: string[] = [];
        let prevY = 0;
        let prevLine: TextLine | null = null;

        for (const line of lines) {
          const yGap = prevY ? Math.abs(prevY - line.y) : 0;
          const isHeading1 = line.fontSize >= baseFontSize * 1.6;
          const isHeading2 = !isHeading1 && line.fontSize >= baseFontSize * 1.35;
          const isHeading3 = !isHeading1 && !isHeading2 && (line.fontSize >= baseFontSize * 1.18 || (line.isBold && line.text.length < 70));

          // Format links inside line text
          let formattedText = this.formatLinks(line.text);

          if (isHeading1 || isHeading2 || isHeading3) {
            // Flush existing paragraph
            if (currentPara.length > 0) {
              mdParts.push(this.formatParagraphOrList(currentPara.join(' ')));
              currentPara = [];
            }

            const prefix = isHeading1 ? '# ' : isHeading2 ? '## ' : '### ';
            // Strip any leading hash symbols in raw text
            const cleanHeading = formattedText.replace(/^#+\s*/, '').trim();
            mdParts.push(`\n${prefix}${cleanHeading}\n`);
            prevY = line.y;
            prevLine = line;
            continue;
          }

          // Check if paragraph break (vertical gap significantly larger than font size)
          if (yGap > line.fontSize * 1.6 && currentPara.length > 0) {
            mdParts.push(this.formatParagraphOrList(currentPara.join(' ')));
            currentPara = [];
          }

          currentPara.push(formattedText);
          prevY = line.y;
          prevLine = line;
        }

        if (currentPara.length > 0) {
          mdParts.push(this.formatParagraphOrList(currentPara.join(' ')));
        }

        // Append tables as pipe tables
        for (const tbl of pageTables) {
          const tableMd = this.formatMarkdownTable(tbl.headers, tbl.rows);
          if (tableMd) {
            mdParts.push(`\n${tableMd}\n`);
          }
        }

        // Append images if requested
        if (imageMode !== 'none') {
          for (let imgIdx = 0; imgIdx < pageImages.length; imgIdx++) {
            const img = pageImages[imgIdx];
            if (imageMode === 'inline' && img.dataUrl) {
              mdParts.push(`\n![Image ${imgIdx + 1}](${img.dataUrl})\n`);
            } else if (imageMode === 'sidecar') {
              const imgFileName = `images/page_${pageNum}_img_${imgIdx + 1}.png`;
              mdParts.push(`\n![Image ${imgIdx + 1}](${imgFileName})\n`);
              sidecarImages.push({ name: imgFileName, blob: img.blob });
            }
          }
        }

        pageMarkdownSections.push(mdParts.join('\n'));
      }

      onProgress?.({
        percent: 90,
        stage: 'Assembling Markdown document...',
        message: 'Writing output...'
      });

      const fullMarkdown = pageMarkdownSections.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';

      // If sidecar mode, package as ZIP with images
      if (imageMode === 'sidecar' && sidecarImages.length > 0) {
        const zip = new JSZip();
        zip.file(`${baseName}.md`, fullMarkdown);
        for (const sImg of sidecarImages) {
          zip.file(sImg.name, sImg.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFile = new File([zipBlob], `${baseName}_markdown.zip`, { type: 'application/zip' });
        const previewUrl = URL.createObjectURL(zipFile);

        return {
          success: true,
          file: zipFile,
          previewUrl,
          downloadName: zipFile.name,
          previewData: {
            textPreview: fullMarkdown.slice(0, 500) + (fullMarkdown.length > 500 ? '...' : ''),
            characterCount: fullMarkdown.length,
            tableCount: extractedContent.tables.length,
            imageCount: sidecarImages.length
          },
          metadata: {
            name: zipFile.name,
            type: 'application/zip',
            sizeBytes: zipFile.size,
            lastModified: Date.now(),
            extension: 'zip'
          }
        };
      }

      // Default single .md file
      const mdBlob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8' });
      const mdFile = new File([mdBlob], `${baseName}.md`, { type: 'text/markdown' });
      const previewUrl = URL.createObjectURL(mdFile);

      return {
        success: true,
        file: mdFile,
        previewUrl,
        downloadName: mdFile.name,
        previewData: {
          textPreview: fullMarkdown.slice(0, 500) + (fullMarkdown.length > 500 ? '...' : ''),
          characterCount: fullMarkdown.length,
          wordCount: fullMarkdown.split(/\s+/).filter(w => w.length > 0).length,
          tableCount: extractedContent.tables.length,
          imageCount: extractedContent.images.length
        },
        metadata: {
          name: mdFile.name,
          type: 'text/markdown',
          sizeBytes: mdFile.size,
          lastModified: Date.now(),
          extension: 'md'
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to Markdown: ${e?.message || e.toString()}`
      };
    }
  }

  private groupItemsIntoLines(items: any[]): TextLine[] {
    if (!items.length) return [];

    // Sort items top-to-bottom, left-to-right
    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 4) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    const lines: TextLine[] = [];
    let currentLineText = '';
    let currentY = sorted[0].transform[5];
    let currentX = sorted[0].transform[4];
    let currentFontSize = Math.abs(sorted[0].transform[0]) || 12;
    let isBold = (sorted[0].fontName || '').toLowerCase().includes('bold');

    for (const it of sorted) {
      const y = it.transform[5];
      const x = it.transform[4];
      const size = Math.abs(it.transform[0]) || 12;
      const bold = (it.fontName || '').toLowerCase().includes('bold');

      if (Math.abs(y - currentY) <= 4) {
        // Same line
        currentLineText += (currentLineText ? ' ' : '') + it.str;
      } else {
        if (currentLineText.trim()) {
          lines.push({
            text: currentLineText.trim(),
            y: currentY,
            x: currentX,
            fontSize: currentFontSize,
            isBold
          });
        }
        currentLineText = it.str;
        currentY = y;
        currentX = x;
        currentFontSize = size;
        isBold = bold;
      }
    }

    if (currentLineText.trim()) {
      lines.push({
        text: currentLineText.trim(),
        y: currentY,
        x: currentX,
        fontSize: currentFontSize,
        isBold
      });
    }

    return lines;
  }

  private computeBaseFontSize(sizes: number[]): number {
    if (!sizes.length) return 12;
    const sorted = [...sizes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 12;
  }

  private formatParagraphOrList(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '';

    // Bullet list markers: •, *, -, ▪, ▫, ○, ►, ✔, ✓
    const bulletMatch = trimmed.match(/^[•*–—▪▫○►✔✓\-]\s*(.+)$/);
    if (bulletMatch) {
      return `- ${bulletMatch[1]}`;
    }

    // Numbered list: 1. or 1) or (1)
    const numMatch = trimmed.match(/^(\(?\d+[\.\)])\s*(.+)$/);
    if (numMatch) {
      return `1. ${numMatch[2]}`;
    }

    return `${trimmed}\n`;
  }

  private formatLinks(text: string): string {
    // Preserve URLs as markdown links if not already markdown
    return text.replace(
      /(?<!\[.*\]\()((https?:\/\/|www\.)[^\s<>"')]+)/g,
      (match, url) => {
        const href = url.startsWith('www.') ? `https://${url}` : url;
        return `[${url}](${href})`;
      }
    );
  }

  private formatMarkdownTable(headers: string[], rows: string[][]): string {
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    if (colCount < 2) return '';

    const padRow = (r: string[]) => {
      const copy = [...r];
      while (copy.length < colCount) copy.push('');
      return copy.map(cell => (cell || '').replace(/\|/g, '\\|').trim());
    };

    const cleanHeaders = headers.length > 0 ? padRow(headers) : Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`);
    const headerLine = `| ${cleanHeaders.join(' | ')} |`;
    const separatorLine = `| ${Array(colCount).fill('---').join(' | ')} |`;

    const rowLines = rows.map(r => `| ${padRow(r).join(' | ')} |`);

    return [headerLine, separatorLine, ...rowLines].join('\n');
  }
}
