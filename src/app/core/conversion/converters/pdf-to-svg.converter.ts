import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfToSvgOptions, ConversionReport } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToSvgConverter implements IConverter {
  readonly id = 'pdf-to-svg';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-svg',
    name: 'PDF to SVG Converter',
    shortTitle: 'PDF to SVG',
    description: 'Convert PDF pages into standalone Scalable Vector Graphics (.svg) files or an archived package.',
    sourceFormats: ['.pdf'],
    targetFormat: 'svg',
    category: 'pdf-to-format',
    icon: 'shapes',
    badge: 'Vector SVG',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Extracts positioned text elements and typography into scalable SVG markup.',
      'Single-page PDFs export directly as .svg; multi-page PDFs are packaged into a structured ZIP archive.'
    ],
    disclaimer: '100% offline vector decomposition. Your document never leaves your device.'
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    _options: PdfToSvgOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const report: ConversionReport = {
      approximations: [],
      droppedElements: [],
      substitutedFonts: [],
      tablesDetected: 0,
      pagesRasterized: 0,
      indicOrRtlWarnings: []
    };

    try {
      onProgress?.({ percent: 10, stage: 'Loading PDF document...' });

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file has no pages.' };
      }

      const svgStrings: { pageNum: number; content: string }[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        onProgress?.({
          percent: 15 + Math.floor(((pageNum - 1) / numPages) * 70),
          stage: `Converting page ${pageNum} of ${numPages} to SVG...`
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);

        const textContent = await page.getTextContent();
        let textSvgElements = '';

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string' && item.str.length > 0) {
            const tx = item.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
            const x = Math.round(tx[4]);
            // PDF coordinates: Y is inverted
            const y = Math.round(height - tx[5]);
            const fontSize = Math.max(8, Math.round(Math.hypot(tx[0], tx[1])));
            const escaped = this.escapeXml(item.str);

            textSvgElements += `  <text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}px" fill="#111827">${escaped}</text>\n`;
          }
        }

        const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff" />
${textSvgElements}</svg>`;

        svgStrings.push({ pageNum, content: svgMarkup });
      }

      onProgress?.({ percent: 90, stage: 'Finalizing SVG output...' });

      const baseName = file.name.replace(/\.[^/.]+$/, '');

      if (numPages === 1) {
        const outName = `${baseName}.svg`;
        const outFile = new File([svgStrings[0].content], outName, { type: 'image/svg+xml' });
        onProgress?.({ percent: 100, stage: 'SVG created successfully' });
        return {
          success: true,
          file: outFile,
          downloadName: outName,
          report
        };
      }

      // Multi-page: zip package
      const zip = new JSZip();
      for (const item of svgStrings) {
        zip.file(`page-${item.pageNum}.svg`, item.content);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const outName = `${baseName}-svg.zip`;
      const outFile = new File([zipBlob], outName, { type: 'application/zip' });

      onProgress?.({ percent: 100, stage: 'Multi-page SVG ZIP created successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `PDF to SVG conversion failed: ${err.message || err}`,
        report
      };
    }
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
