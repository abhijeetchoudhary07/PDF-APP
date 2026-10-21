import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as CFB from 'cfb';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { EmailParserHelper } from '../utils/email-parser.helper';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';
import { PdfLayoutHelper } from '../utils/pdf-layout.helper';
import { EmailToPdfOptions, EmailHeaderData, EmailAttachmentItem } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class MsgToPdfConverter implements IConverter {
  readonly id = 'msg-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'msg-to-pdf',
    name: 'Outlook (.msg) to PDF Converter',
    shortTitle: 'MSG to PDF',
    description: 'Convert Microsoft Outlook .msg email messages into PDF documents with headers, message body, and attachments.',
    sourceFormats: ['.msg'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'mail',
    badge: 'Outlook',
    acceptMimeTypes: 'application/vnd.ms-outlook,application/octet-stream,.msg',
    supportsTextInput: true,
    limitations: [
      'Extracts Outlook message headers (From, To, Date, Subject) and message content.',
      'Merges attached PDFs and lists file attachments.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.msg') && file.type !== 'application/vnd.ms-outlook') {
      return { valid: false, error: 'Selected file is not an Outlook .msg email message.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: EmailToPdfOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Inspecting Outlook message...',
        message: 'Reading message streams and attachments...'
      });

      const buffer = await file.arrayBuffer();
      const parsedData = this.parseMsgOrEml(buffer);

      onProgress?.({
        percent: 50,
        stage: 'Formatting document...',
        message: 'Laying out headers and message body...'
      });

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const { width, height } = PdfLayoutHelper.getPageDimensions(options.format, options.orientation);
      const margin = options.margin ?? 40;
      const baseFontSize = options.fontSize ?? 11;
      const printableWidth = width - margin * 2;

      let currentPage = pdfDoc.addPage([width, height]);
      let currentY = height - margin;

      const checkNewPage = (neededHeight: number) => {
        if (currentY - neededHeight < margin) {
          currentPage = pdfDoc.addPage([width, height]);
          currentY = height - margin;
        }
      };

      // Header block
      const headerFields: Array<{ label: string; value: string }> = [];
      if (parsedData.headers.from) headerFields.push({ label: 'From:', value: parsedData.headers.from });
      if (parsedData.headers.to) headerFields.push({ label: 'To:', value: parsedData.headers.to });
      if (parsedData.headers.cc) headerFields.push({ label: 'Cc:', value: parsedData.headers.cc });
      if (parsedData.headers.date) headerFields.push({ label: 'Date:', value: parsedData.headers.date });
      if (parsedData.headers.subject) headerFields.push({ label: 'Subject:', value: parsedData.headers.subject });

      const headerHeight = Math.max(70, headerFields.length * (baseFontSize * 1.5) + 20);

      currentPage.drawRectangle({
        x: margin,
        y: currentY - headerHeight + 10,
        width: printableWidth,
        height: headerHeight,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1
      });

      let hY = currentY - 5;
      for (const f of headerFields) {
        currentPage.drawText(f.label, {
          x: margin + 12,
          y: hY,
          size: baseFontSize,
          font: boldFont,
          color: rgb(0.2, 0.25, 0.35)
        });

        const labelWidth = boldFont.widthOfTextAtSize(f.label, baseFontSize);
        const maxValWidth = printableWidth - labelWidth - 30;
        const wrappedVal = PdfLayoutHelper.wrapText(f.value, font, baseFontSize, maxValWidth);

        currentPage.drawText(wrappedVal[0] || '', {
          x: margin + 18 + labelWidth,
          y: hY,
          size: baseFontSize,
          font,
          color: rgb(0.15, 0.15, 0.15)
        });

        hY -= baseFontSize * 1.5;
      }

      currentY -= headerHeight + 15;

      // Body
      let bodyText = '';
      if (parsedData.htmlBody) {
        bodyText = HtmlSanitizerHelper.extractStructuredText(parsedData.htmlBody);
      } else if (parsedData.textBody) {
        bodyText = parsedData.textBody;
      }

      if (bodyText) {
        const bodyLines = PdfLayoutHelper.wrapText(bodyText, font, baseFontSize, printableWidth);
        const pLineHeight = baseFontSize * 1.45;

        for (const line of bodyLines) {
          checkNewPage(pLineHeight);
          currentPage.drawText(line, {
            x: margin,
            y: currentY,
            size: baseFontSize,
            font,
            color: rgb(0.12, 0.12, 0.12)
          });
          currentY -= pLineHeight;
        }
      }

      // Attachments summary
      const nonPdfAtts = parsedData.attachments.filter(
        a => !a.name.toLowerCase().endsWith('.pdf') && a.mimeType !== 'application/pdf'
      );

      if (nonPdfAtts.length > 0) {
        checkNewPage(50);
        currentY -= 10;
        currentPage.drawText(`Attachments (${nonPdfAtts.length}):`, {
          x: margin,
          y: currentY,
          size: baseFontSize,
          font: boldFont,
          color: rgb(0.2, 0.25, 0.35)
        });
        currentY -= baseFontSize * 1.4;

        for (const att of nonPdfAtts) {
          const sizeKb = (att.sizeBytes / 1024).toFixed(1);
          currentPage.drawText(`• ${att.name} (${sizeKb} KB)`, {
            x: margin + 10,
            y: currentY,
            size: baseFontSize - 1,
            font,
            color: rgb(0.3, 0.3, 0.3)
          });
          currentY -= baseFontSize * 1.3;
        }
      }

      // Merge PDF attachments
      const pdfAtts = parsedData.attachments.filter(
        a => a.name.toLowerCase().endsWith('.pdf') || a.mimeType === 'application/pdf'
      );

      for (const pAtt of pdfAtts) {
        try {
          const attachedDoc = await PDFDocument.load(pAtt.content, { ignoreEncryption: true });
          const pages = await pdfDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
          for (const page of pages) {
            pdfDoc.addPage(page);
          }
        } catch (attErr) {
          console.warn(`Could not merge attached PDF ${pAtt.name}:`, attErr);
        }
      }

      onProgress?.({
        percent: 92,
        stage: 'Saving PDF document...',
        message: 'Writing PDF output...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'outlook_email';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        warnings: parsedData.warnings.length > 0 ? parsedData.warnings : undefined,
        previewData: {
          pageCount: pdfDoc.getPageCount(),
          subject: parsedData.headers.subject,
          from: parsedData.headers.from,
          attachmentCount: parsedData.attachments.length
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
        error: `Failed to convert MSG to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private parseMsgOrEml(buffer: ArrayBuffer): {
    headers: EmailHeaderData;
    textBody?: string;
    htmlBody?: string;
    attachments: EmailAttachmentItem[];
    warnings: string[];
  } {
    // Check if buffer is OLE CFB compound document (starts with magic bytes D0 CF 11 E0 A1 B1 1A E1)
    const u8 = new Uint8Array(buffer);
    const isCfb =
      u8.length >= 8 &&
      u8[0] === 0xd0 &&
      u8[1] === 0xcf &&
      u8[2] === 0x11 &&
      u8[3] === 0xe0 &&
      u8[4] === 0xa1 &&
      u8[5] === 0xb1 &&
      u8[6] === 0x1a &&
      u8[7] === 0xe1;

    if (isCfb) {
      try {
        const cfb = CFB.read(u8, { type: 'array' });
        const headers: EmailHeaderData = {};
        let textBody: string | undefined;
        let htmlBody: string | undefined;
        const attachments: EmailAttachmentItem[] = [];

        for (const entry of cfb.FileIndex) {
          const name = entry.name;
          const content = entry.content;
          if (!content) continue;

          // Subject stream (__substg1.0_0037001F or 0037001E)
          if (name.includes('0037001F') || name.includes('0037001E')) {
            headers.subject = this.decodeUtf16(content);
          }
          // Sender Name (__substg1.0_0C1A001F or 0C1F001F)
          if (name.includes('0C1A001F') || name.includes('0C1F001F')) {
            headers.from = this.decodeUtf16(content);
          }
          // Display To (__substg1.0_0E04001F)
          if (name.includes('0E04001F')) {
            headers.to = this.decodeUtf16(content);
          }
          // Body (__substg1.0_1000001F)
          if (name.includes('1000001F') || name.includes('1000001E')) {
            textBody = this.decodeUtf16(content);
          }
          // HTML Body (__substg1.0_1013001F or 10130102)
          if (name.includes('1013001F') || name.includes('10130102')) {
            htmlBody = this.decodeUtf16(content);
          }
        }

        return {
          headers,
          textBody,
          htmlBody,
          attachments,
          warnings: []
        };
      } catch (cfbErr) {
        console.warn('CFB parse failed, falling back to MIME:', cfbErr);
      }
    }

    // Fallback: parse as EML / MIME text
    return EmailParserHelper.parseEml(buffer);
  }

  private decodeUtf16(buf: Uint8Array | number[]): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try {
      return new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '');
    } catch {
      return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '');
    }
  }
}
