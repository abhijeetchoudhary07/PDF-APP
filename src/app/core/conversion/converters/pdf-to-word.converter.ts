import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, PageBreak } from 'docx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';

@Injectable({
  providedIn: 'root'
})
export class PdfToWordConverter implements IConverter {
  readonly id = 'pdf-to-word';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-word',
    name: 'PDF to Word Converter',
    shortTitle: 'PDF to Word',
    description: 'Extract document text, paragraphs, and headings from PDF into an editable Microsoft Word (.docx) document.',
    sourceFormats: ['.pdf'],
    targetFormat: 'docx',
    category: 'pdf-to-format',
    icon: 'document-text',
    badge: 'Editable DOCX',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Extracts text and paragraph structure into standard Word flow.',
      'Complex multi-column layouts, floating graphic elements, and scanned image-only PDFs (without OCR) may not preserve original layout.'
    ],
    disclaimer: 'This client-side conversion preserves textual content, headings, and paragraph flow. Exact pixel-for-pixel visual reproduction of complex magazine or flyer layouts is not supported.'
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
    options: {
      preserveHeadings?: boolean;
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        return { success: false, error: 'The PDF file has no pages.' };
      }

      const docxParagraphs: Paragraph[] = [];
      let totalExtractedWords = 0;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const percent = Math.round((pageNum / numPages) * 85);
        onProgress?.({
          percent,
          stage: `Analyzing page ${pageNum} of ${numPages}...`,
          currentItem: pageNum,
          totalItems: numPages,
          message: 'Extracting text and paragraph hierarchy...'
        });

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{
          str: string;
          transform: number[]; // [scaleX, skewY, skewX, scaleY, x, y]
          width: number;
          height: number;
          fontName?: string;
        }>;

        if (items.length === 0) {
          continue;
        }

        // Group items by vertical position y (inverted in PDF coordinate system)
        // Sort items: top to bottom (descending y), then left to right (ascending x)
        const sortedItems = [...items].filter(it => it.str && it.str.trim().length > 0);
        sortedItems.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 4) { // line tolerance 4 points
            return yDiff;
          }
          return a.transform[4] - b.transform[4];
        });

        // Group into lines
        const lines: Array<{ text: string; y: number; fontSize: number; isBold: boolean }> = [];
        let currentLineText = '';
        let currentLineY = sortedItems[0]?.transform[5] ?? 0;
        let currentLineFontSize = Math.abs(sortedItems[0]?.transform[0]) || 12;
        let isLineBold = false;

        for (const item of sortedItems) {
          const itemY = item.transform[5];
          const fontSize = Math.abs(item.transform[0]) || 12;
          const isBold = (item.fontName || '').toLowerCase().includes('bold');

          if (Math.abs(itemY - currentLineY) <= 4) {
            // Same line
            currentLineText += (currentLineText ? ' ' : '') + item.str;
          } else {
            // New line
            if (currentLineText.trim()) {
              lines.push({
                text: currentLineText.trim(),
                y: currentLineY,
                fontSize: currentLineFontSize,
                isBold: isLineBold
              });
            }
            currentLineText = item.str;
            currentLineY = itemY;
            currentLineFontSize = fontSize;
            isLineBold = isBold;
          }
        }

        if (currentLineText.trim()) {
          lines.push({
            text: currentLineText.trim(),
            y: currentLineY,
            fontSize: currentLineFontSize,
            isBold: isLineBold
          });
        }

        // Calculate average/median font size to detect headings
        const fontSizes = lines.map(l => l.fontSize);
        const avgFontSize = fontSizes.length ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length : 12;

        // Group lines into paragraphs based on vertical line gaps
        let currentParaLines: string[] = [];
        let prevY = 0;
        let prevFontSize = avgFontSize;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const yGap = prevY ? Math.abs(prevY - line.y) : 0;
          const isHeading = line.fontSize > avgFontSize * 1.25 || (line.isBold && line.text.length < 60);

          if (isHeading) {
            // Flush current paragraph
            if (currentParaLines.length > 0) {
              docxParagraphs.push(new Paragraph({
                children: [new TextRun({ text: currentParaLines.join(' '), size: 22 })], // 11pt
                spacing: { after: 120 }
              }));
              currentParaLines = [];
            }

            // Add heading
            docxParagraphs.push(new Paragraph({
              heading: line.fontSize > avgFontSize * 1.5 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
              children: [new TextRun({ text: line.text, bold: true, size: Math.round(line.fontSize * 2) })],
              spacing: { before: 200, after: 100 }
            }));
            totalExtractedWords += line.text.split(/\s+/).length;
            prevY = line.y;
            prevFontSize = line.fontSize;
            continue;
          }

          // If gap between lines is significantly larger than font size, consider it a new paragraph
          if (yGap > line.fontSize * 1.8 && currentParaLines.length > 0) {
            docxParagraphs.push(new Paragraph({
              children: [new TextRun({ text: currentParaLines.join(' '), size: 22 })],
              spacing: { after: 120 }
            }));
            currentParaLines = [];
          }

          currentParaLines.push(line.text);
          totalExtractedWords += line.text.split(/\s+/).length;
          prevY = line.y;
          prevFontSize = line.fontSize;
        }

        if (currentParaLines.length > 0) {
          docxParagraphs.push(new Paragraph({
            children: [new TextRun({ text: currentParaLines.join(' '), size: 22 })],
            spacing: { after: 120 }
          }));
        }

        // Add page break if not the last page
        if (pageNum < numPages) {
          docxParagraphs.push(new Paragraph({
            children: [new PageBreak()]
          }));
        }
      }

      if (docxParagraphs.length === 0 || totalExtractedWords === 0) {
        return {
          success: false,
          error: 'No selectable text found in this PDF. It may consist entirely of scanned images without text layer.'
        };
      }

      onProgress?.({
        percent: 92,
        stage: 'Building Word document (.docx)...',
        message: 'Packaging document structure...'
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: docxParagraphs
        }]
      });

      const docxBlob = await Packer.toBlob(doc);
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      const docxFile = new File([docxBlob], `${baseName}.docx`, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      return {
        success: true,
        file: docxFile,
        downloadName: docxFile.name,
        previewData: {
          wordCount: totalExtractedWords,
          paragraphCount: docxParagraphs.length,
          pages: numPages
        },
        warnings: [
          'Conversion completed. Review the generated Word document to adjust formatting or fonts if required.'
        ],
        metadata: {
          name: docxFile.name,
          type: docxFile.type,
          sizeBytes: docxFile.size,
          lastModified: Date.now(),
          extension: 'docx'
        }
      };

    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to Word: ${e?.message || e.toString()}`
      };
    }
  }
}
