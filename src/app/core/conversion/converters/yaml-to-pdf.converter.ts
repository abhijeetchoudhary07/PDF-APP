import { Injectable } from '@angular/core';
import { PDFDocument, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { CodeLayoutHelper, HighlightedLine, CodeToken } from '../utils/code-layout.helper';
import { MarkupToPdfOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class YamlToPdfConverter implements IConverter {
  readonly id = 'yaml-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'yaml-to-pdf',
    name: 'YAML to PDF Converter',
    shortTitle: 'YAML to PDF',
    description: 'Convert YAML configuration files (.yaml, .yml) into clean, syntax-colored PDF documents with indentation guides.',
    sourceFormats: ['.yaml', '.yml'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'code',
    badge: 'Pretty Print',
    acceptMimeTypes: 'text/yaml,text/x-yaml,application/x-yaml,text/plain,.yaml,.yml',
    supportsTextInput: true,
    limitations: [
      'Validates YAML indentation and syntax strictly before conversion; reports parse errors if input is malformed.',
      'Formats key-value mappings, lists, and comments across multiple pages with visual indent guides.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.yaml') && !name.endsWith('.yml') && file.type !== 'text/yaml' && file.type !== 'text/plain') {
      return { valid: false, error: 'Selected file is not a YAML document.' };
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
        stage: 'Validating YAML syntax...',
        message: 'Parsing indentation and structure...'
      });

      let yamlText = options.rawText;
      if (!yamlText) {
        yamlText = await file.text();
      }

      if (!yamlText || !yamlText.trim()) {
        return { success: false, error: 'No YAML content provided to convert.' };
      }

      // Strict validation of YAML syntax
      const validationError = this.validateYaml(yamlText);
      if (validationError) {
        return {
          success: false,
          error: `YAML Parse Error: ${validationError}`
        };
      }

      onProgress?.({
        percent: 50,
        stage: 'Formatting YAML lines...',
        message: 'Calculating indentation guides and syntax highlights...'
      });

      const lines = this.tokenizeYaml(yamlText);

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
          characterCount: yamlText.length
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
        error: `Failed to convert YAML to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private validateYaml(text: string): string | null {
    const rawLines = text.split(/\r?\n/);
    let prevIndent = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      // YAML prohibits tab characters for indentation
      if (/^\t+/.test(line)) {
        return `Line ${i + 1}: Tab characters are forbidden for YAML indentation; use spaces instead.`;
      }

      const indent = line.match(/^ */)?.[0].length || 0;

      // Indentation jump check (e.g. going from indent 0 directly to 6)
      if (indent > prevIndent + 4) {
        return `Line ${i + 1}: Unexpected indentation jump (${indent} spaces after ${prevIndent} spaces).`;
      }

      // Check unbalanced quotes
      let singleQuotes = 0;
      let doubleQuotes = 0;
      for (const char of trimmed) {
        if (char === "'") singleQuotes++;
        if (char === '"') doubleQuotes++;
      }
      if (singleQuotes % 2 !== 0) {
        return `Line ${i + 1}: Unclosed single quote in YAML value.`;
      }
      if (doubleQuotes % 2 !== 0) {
        return `Line ${i + 1}: Unclosed double quote in YAML value.`;
      }

      prevIndent = indent;
    }

    return null;
  }

  private tokenizeYaml(yamlStr: string): HighlightedLine[] {
    const rawLines = yamlStr.split(/\r?\n/);
    const result: HighlightedLine[] = [];

    const keyColor = rgb(0.08, 0.4, 0.75); // Blue
    const stringColor = rgb(0.13, 0.55, 0.2); // Green
    const numberColor = rgb(0.65, 0.15, 0.6); // Purple
    const boolColor = rgb(0.75, 0.35, 0.1); // Orange
    const listDashColor = rgb(0.85, 0.4, 0.1); // Amber
    const commentColor = rgb(0.5, 0.5, 0.5); // Gray
    const colonColor = rgb(0.3, 0.35, 0.4);

    for (const rawLine of rawLines) {
      const leadingSpaces = rawLine.match(/^\s*/)?.[0].length || 0;
      const indent = Math.floor(leadingSpaces / 2);
      const trimmed = rawLine.trim();

      const tokens: CodeToken[] = [];
      if (leadingSpaces > 0) {
        tokens.push({ text: ' '.repeat(leadingSpaces) });
      }

      if (trimmed.startsWith('#')) {
        tokens.push({ text: trimmed, color: commentColor });
      } else {
        let rest = trimmed;

        // List item dash: -
        if (rest.startsWith('- ')) {
          tokens.push({ text: '- ', color: listDashColor, isBold: true });
          rest = rest.slice(2);
        }

        // Key-value pair: key: value
        const kvMatch = rest.match(/^([^:\s]+):\s*(.*)$/);
        if (kvMatch) {
          tokens.push({ text: kvMatch[1], color: keyColor, isBold: true });
          tokens.push({ text: ': ', color: colonColor });

          const val = kvMatch[2];
          if (val.startsWith('#')) {
            tokens.push({ text: val, color: commentColor });
          } else if (val.startsWith('"') || val.startsWith("'")) {
            tokens.push({ text: val, color: stringColor });
          } else if (/^-?\d+(\.\d+)?$/i.test(val)) {
            tokens.push({ text: val, color: numberColor });
          } else if (['true', 'false', 'yes', 'no', 'null'].includes(val.toLowerCase())) {
            tokens.push({ text: val, color: boolColor, isBold: true });
          } else {
            tokens.push({ text: val, color: stringColor });
          }
        } else {
          tokens.push({ text: rest, color: stringColor });
        }
      }

      result.push({
        indent,
        tokens,
        rawText: rawLine
      });
    }

    return result;
  }
}
