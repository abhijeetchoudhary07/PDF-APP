import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfToJsonOptions, StructuredPdfJson, ConversionReport } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToJsonConverter implements IConverter {
  readonly id = 'pdf-to-json';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-json',
    name: 'PDF to Structured JSON Converter',
    shortTitle: 'PDF to JSON',
    description: 'Convert PDF documents into structured JSON with precise text coordinates, tables, links, annotations, and metadata.',
    sourceFormats: ['.pdf'],
    targetFormat: 'json',
    category: 'pdf-to-format',
    icon: 'code-slash',
    badge: 'LLM & Dev Schema',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Outputs standardized v1.0.0 JSON schema with per-page geometry, coordinates, and detected tables.',
      'Designed for offline LLM RAG ingestion, OCR post-processing, and document analysis pipelines.'
    ],
    disclaimer: '100% on-device data extraction. Extracted document structure is processed locally without external API calls.'
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
    options: PdfToJsonOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const report: ConversionReport = {
      mode: options.mode || 'reflowable',
      approximations: [],
      droppedElements: [],
      substitutedFonts: [],
      tablesDetected: 0,
      pagesRasterized: 0,
      indicOrRtlWarnings: []
    };

    try {
      onProgress?.({ percent: 10, stage: 'Reading PDF document structure...' });

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file has no pages.' };
      }

      onProgress?.({ percent: 20, stage: 'Reading document metadata...' });
      const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
      const info: any = (meta as any).info || {};

      const structuredOutput: StructuredPdfJson = {
        schemaVersion: '1.0.0',
        generator: 'Indian Form Helper PDF-to-JSON Engine',
        totalPages: numPages,
        metadata: {
          title: info.Title || file.name.replace(/\.[^/.]+$/, ''),
          author: info.Author || undefined,
          subject: info.Subject || undefined,
          creator: info.Creator || undefined,
          producer: info.Producer || undefined,
          creationDate: info.CreationDate ? String(info.CreationDate) : undefined,
          modificationDate: info.ModDate ? String(info.ModDate) : undefined,
          pageCount: numPages
        },
        pages: []
      };

      let totalDetectedTables = 0;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        onProgress?.({
          percent: 25 + Math.floor(((pageNum - 1) / numPages) * 65),
          stage: `Extracting page ${pageNum} of ${numPages} items & geometry...`
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        const annotations = await page.getAnnotations().catch(() => []);

        const pageTextItems: StructuredPdfJson['pages'][0]['textItems'] = [];
        const pageLinks: StructuredPdfJson['pages'][0]['links'] = [];
        const pageAnnotations: StructuredPdfJson['pages'][0]['annotations'] = [];

        // Parse annotations & links
        for (const ann of annotations) {
          const rect = ann.rect || [0, 0, 0, 0];
          if (ann.subtype === 'Link' && ann.url) {
            pageLinks.push({
              url: ann.url,
              x: Math.round(rect[0]),
              y: Math.round(viewport.height - rect[3]),
              width: Math.round(rect[2] - rect[0]),
              height: Math.round(rect[3] - rect[1])
            });
          } else {
            pageAnnotations.push({
              subtype: ann.subtype || 'Unknown',
              rect: rect.map((r: number) => Math.round(r)),
              contents: ann.contents || undefined
            });
          }
        }

        // Parse text items
        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
            const tx = item.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
            const x = Math.round(tx[4]);
            const y = Math.round(viewport.height - tx[5]);
            const fontSize = Math.max(1, Math.round(Math.hypot(tx[0], tx[1])));

            pageTextItems.push({
              text: item.str,
              x,
              y,
              width: Math.round(item.width || 0),
              height: Math.round(item.height || fontSize),
              fontSize,
              fontName: item.fontName || undefined,
              direction: item.dir || 'ltr'
            });
          }
        }

        // Table detection heuristic: group items into rows by Y coordinate
        const pageTables: StructuredPdfJson['pages'][0]['tables'] = [];
        if (options.includeTables !== false) {
          const rowsByY = new Map<number, { text: string; x: number }[]>();
          for (const item of pageTextItems) {
            // Cluster rows within 4px Y-tolerance
            let matchedY = Array.from(rowsByY.keys()).find(k => Math.abs(k - item.y) <= 4);
            if (matchedY === undefined) {
              matchedY = item.y;
              rowsByY.set(matchedY, []);
            }
            rowsByY.get(matchedY)!.push({ text: item.text, x: item.x });
          }

          const sortedY = Array.from(rowsByY.keys()).sort((a, b) => a - b);
          const multiColRows: string[][] = [];

          for (const y of sortedY) {
            const rowItems = rowsByY.get(y)!.sort((a, b) => a.x - b.x);
            let cols: string[] = [];
            if (rowItems.length >= 2) {
              cols = rowItems.map(c => c.text);
            } else if (rowItems.length === 1 && (rowItems[0].text.includes('|') || rowItems[0].text.includes('\t'))) {
              cols = rowItems[0].text.split(/[|\t]/).map(s => s.trim()).filter(s => s.length > 0);
            }
            if (cols.length >= 2) {
              multiColRows.push(cols);
            }
          }

          if (multiColRows.length >= 2) {
            // Potential table
            pageTables.push({
              headers: multiColRows[0],
              rows: multiColRows.slice(1)
            });
            totalDetectedTables++;
          }
        }

        structuredOutput.pages.push({
          pageNumber: pageNum,
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          rotation: page.rotate || 0,
          textItems: pageTextItems,
          tables: pageTables,
          links: pageLinks,
          annotations: pageAnnotations
        });
      }

      report.tablesDetected = totalDetectedTables;

      onProgress?.({ percent: 95, stage: 'Formatting structured JSON output...' });

      const jsonStr = options.compact
        ? JSON.stringify(structuredOutput)
        : JSON.stringify(structuredOutput, null, 2);

      const outName = file.name.replace(/\.[^/.]+$/, '') + '.json';
      const outFile = new File([jsonStr], outName, { type: 'application/json' });

      onProgress?.({ percent: 100, stage: 'Structured JSON generated successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `PDF to JSON extraction failed: ${err.message || err}`,
        report
      };
    }
  }
}
