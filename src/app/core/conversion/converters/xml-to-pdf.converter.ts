import { Injectable } from '@angular/core';
import { PDFDocument, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfLayoutHelper } from '../utils/pdf-layout.helper';
import { CodeLayoutHelper, HighlightedLine, CodeToken } from '../utils/code-layout.helper';
import { MarkupToPdfOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class XmlToPdfConverter implements IConverter {
  readonly id = 'xml-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'xml-to-pdf',
    name: 'XML to PDF Converter',
    shortTitle: 'XML to PDF',
    description: 'Convert XML files into pretty-printed, syntax-colored PDF documents with indentation guides and line numbers.',
    sourceFormats: ['.xml'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'code',
    badge: 'Pretty Print',
    acceptMimeTypes: 'application/xml,text/xml,text/plain,.xml',
    supportsTextInput: true,
    limitations: [
      'Validates XML structure strictly before conversion; reports parse errors if input is malformed.',
      'Formats complex elements and attributes across multiple pages with visual indent guides.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xml') && file.type !== 'application/xml' && file.type !== 'text/xml' && file.type !== 'text/plain') {
      return { valid: false, error: 'Selected file is not an XML document.' };
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
        stage: 'Validating XML structure...',
        message: 'Parsing XML markup...'
      });

      let xmlText = options.rawText;
      if (!xmlText) {
        xmlText = await file.text();
      }

      if (!xmlText || !xmlText.trim()) {
        return { success: false, error: 'No XML content provided to convert.' };
      }

      // Strict validation using DOMParser
      const parseError = this.validateXml(xmlText);
      if (parseError) {
        return {
          success: false,
          error: `XML Parse Error: ${parseError}`
        };
      }

      onProgress?.({
        percent: 50,
        stage: 'Formatting XML nodes...',
        message: 'Calculating indentation guides and tags...'
      });

      const prettyXml = this.formatXml(xmlText);
      const lines = this.tokenizeXml(prettyXml);

      onProgress?.({
        percent: 75,
        stage: 'Rendering document pages...',
        message: 'Paginating monospace data...'
      });

      const pdfDoc = await PDFDocument.create();
      const renderResult = await CodeLayoutHelper.renderHighlightedDocument(pdfDoc, lines, {
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

      const encodingWarning = PdfLayoutHelper.describeDroppedText(
        renderResult.droppedCharacters,
        renderResult.droppedSample
      );

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        warnings: encodingWarning ? [encodingWarning] : undefined,
        report: {
          approximations: [],
          droppedElements: [],
          substitutedFonts: [],
          tablesDetected: 0,
          pagesRasterized: 0,
          indicOrRtlWarnings: encodingWarning ? [encodingWarning] : []
        },
        previewData: {
          pageCount: pdfDoc.getPageCount(),
          lineCount: lines.length,
          characterCount: prettyXml.length
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
        error: `Failed to convert XML to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private validateXml(text: string): string | null {
    // Defensive check against XML External Entity (XXE) and Entity Expansion Bombs
    if (/<!ENTITY/i.test(text) || /<!DOCTYPE[^>]*\[/i.test(text)) {
      if (/SYSTEM\s+["']/i.test(text) || /PUBLIC\s+["']/i.test(text)) {
        return 'External entity declarations (XXE) are disallowed for security.';
      }
      const entityMatches = text.match(/<!ENTITY\s+/gi);
      if (entityMatches && entityMatches.length > 5) {
        return 'Excessive or recursive entity declarations are disallowed for security.';
      }
    }

    let parser: any;
    if (typeof DOMParser !== 'undefined') {
      parser = new DOMParser();
    } else if (typeof (globalThis as any).DOMParser !== 'undefined') {
      parser = new (globalThis as any).DOMParser();
    } else {
      return null;
    }

    try {
      const doc = parser.parseFromString(text, 'application/xml');
      const err = doc.getElementsByTagName('parsererror');
      if (err && err.length > 0) {
        return err[0].textContent || 'Malformed XML tags';
      }
      return null;
    } catch (e: any) {
      return e?.message || 'Malformed XML';
    }
  }

  private formatXml(xml: string): string {
    const reg = /(>)(<)(\/*)/g;
    let formatted = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let indent = 0;
      if (line.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (line.match(/^<\/\w/)) {
        if (pad > 0) pad -= 1;
      } else if (line.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      }

      result.push('  '.repeat(pad) + line);
      pad += indent;
    }

    return result.join('\n');
  }

  private tokenizeXml(xmlStr: string): HighlightedLine[] {
    const rawLines = xmlStr.split(/\r?\n/);
    const result: HighlightedLine[] = [];

    const tagColor = rgb(0.1, 0.35, 0.75); // Blue
    const attrNameColor = rgb(0.0, 0.5, 0.5); // Teal
    const attrValColor = rgb(0.13, 0.55, 0.2); // Green
    const textColor = rgb(0.15, 0.15, 0.15); // Dark Gray
    const commentColor = rgb(0.5, 0.5, 0.5); // Gray

    for (const rawLine of rawLines) {
      const leadingSpaces = rawLine.match(/^\s*/)?.[0].length || 0;
      const indent = Math.floor(leadingSpaces / 2);
      const trimmed = rawLine.trim();

      const tokens: CodeToken[] = [];
      if (leadingSpaces > 0) {
        tokens.push({ text: ' '.repeat(leadingSpaces) });
      }

      if (trimmed.startsWith('<!--')) {
        tokens.push({ text: trimmed, color: commentColor });
      } else if (trimmed.startsWith('<')) {
        // Tokenize tags and attributes
        const parts = trimmed.split(/(=?"[^"]*")/g);
        for (const p of parts) {
          if (p.startsWith('="') && p.endsWith('"')) {
            tokens.push({ text: '="', color: tagColor });
            tokens.push({ text: p.slice(2, -1), color: attrValColor });
            tokens.push({ text: '"', color: tagColor });
          } else if (p.startsWith('<') || p.startsWith('</') || p.endsWith('>')) {
            tokens.push({ text: p, color: tagColor, isBold: true });
          } else {
            tokens.push({ text: p, color: attrNameColor });
          }
        }
      } else {
        tokens.push({ text: trimmed, color: textColor });
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
