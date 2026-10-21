import { Injectable } from '@angular/core';
import { PDFDocument, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { CodeLayoutHelper, HighlightedLine, CodeToken } from '../utils/code-layout.helper';
import { MarkupToPdfOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class JsonToPdfConverter implements IConverter {
  readonly id = 'json-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'json-to-pdf',
    name: 'JSON to PDF Converter',
    shortTitle: 'JSON to PDF',
    description: 'Convert JSON data into pretty-printed, syntax-colored PDF documents with indentation guides and line numbers.',
    sourceFormats: ['.json'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'code',
    badge: 'Pretty Print',
    acceptMimeTypes: 'application/json,text/plain,.json',
    supportsTextInput: true,
    limitations: [
      'Validates JSON syntax strictly before conversion; reports parse errors if input is malformed.',
      'Formats large structures across multiple pages with visual indent guides.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.json') && file.type !== 'application/json' && file.type !== 'text/plain') {
      return { valid: false, error: 'Selected file is not a JSON document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: MarkupToPdfOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Validating JSON syntax...',
        message: 'Parsing data structures...'
      });

      let jsonText = options.rawText;
      if (!jsonText) {
        jsonText = await file.text();
      }

      if (!jsonText || !jsonText.trim()) {
        return { success: false, error: 'No JSON content provided to convert.' };
      }

      // Strict validation: must be valid JSON
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(jsonText);
      } catch (parseErr: any) {
        return {
          success: false,
          error: `JSON Parse Error: ${parseErr?.message || 'Invalid JSON syntax'}`
        };
      }

      onProgress?.({
        percent: 50,
        stage: 'Formatting code lines...',
        message: 'Calculating indentation guides and syntax highlights...'
      });

      // Pretty print with 2-space indentation
      const prettyText = JSON.stringify(parsedJson, null, 2);
      const lines = this.tokenizeJson(prettyText);

      onProgress?.({
        percent: 75,
        stage: 'Rendering document pages...',
        message: 'Paginating monospace data...'
      });

      const pdfDoc = await PDFDocument.create();
      await CodeLayoutHelper.renderHighlightedDocument(pdfDoc, lines, {
        format: options.format || 'A4',
        orientation: options.orientation || 'Portrait',
        margin: options.margin || 40,
        fontSize: options.fontSize || 9,
        fontFamily: options.fontFamily || 'Courier',
        indentGuides: options.indentGuides ?? true
      });

      onProgress?.({
        percent: 95,
        stage: 'Saving PDF document...',
        message: 'Writing PDF output...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'document';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          pageCount: pdfDoc.getPageCount(),
          lineCount: lines.length,
          characterCount: prettyText.length
        },
        metadata: {
          name: finalPdf.name,
          type: 'application/pdf',
          sizeBytes: finalPdf.size,
          lastModified: Date.now(),
          extension: 'pdf'
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert JSON to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private tokenizeJson(jsonStr: string): HighlightedLine[] {
    const rawLines = jsonStr.split(/\r?\n/);
    const result: HighlightedLine[] = [];

    const keyColor = rgb(0.08, 0.4, 0.75); // Blue
    const stringColor = rgb(0.13, 0.55, 0.2); // Green
    const numberColor = rgb(0.65, 0.15, 0.6); // Purple
    const boolColor = rgb(0.75, 0.35, 0.1); // Orange
    const punctColor = rgb(0.3, 0.35, 0.4); // Dark Gray

    for (const rawLine of rawLines) {
      const leadingSpaces = rawLine.match(/^\s*/)?.[0].length || 0;
      const indent = Math.floor(leadingSpaces / 2);
      const trimmed = rawLine.trim();

      const tokens: CodeToken[] = [];
      if (leadingSpaces > 0) {
        tokens.push({ text: ' '.repeat(leadingSpaces) });
      }

      // Check key-value match: "key": value
      const kvMatch = trimmed.match(/^("(\\"|[^"])*")\s*(:)\s*(.*)$/);
      if (kvMatch) {
        tokens.push({ text: kvMatch[1], color: keyColor, isBold: true });
        tokens.push({ text: ': ', color: punctColor });

        const valPart = kvMatch[4];
        this.tokenizeValuePart(valPart, tokens, stringColor, numberColor, boolColor, punctColor);
      } else {
        this.tokenizeValuePart(trimmed, tokens, stringColor, numberColor, boolColor, punctColor);
      }

      result.push({
        indent,
        tokens,
        rawText: rawLine
      });
    }

    return result;
  }

  private tokenizeValuePart(
    part: string,
    tokens: CodeToken[],
    stringColor: any,
    numberColor: any,
    boolColor: any,
    punctColor: any
  ): void {
    if (!part) return;

    if (part.startsWith('"')) {
      tokens.push({ text: part, color: stringColor });
    } else if (/^-?\d+(\.\d+)?(e[+-]?\d+)?/i.test(part)) {
      tokens.push({ text: part, color: numberColor });
    } else if (part === 'true' || part === 'false' || part === 'null') {
      tokens.push({ text: part, color: boolColor, isBold: true });
    } else {
      tokens.push({ text: part, color: punctColor });
    }
  }
}
