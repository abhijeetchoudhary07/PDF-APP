import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { EmailParserHelper } from '../utils/email-parser.helper';
import { HtmlSanitizerHelper } from '../utils/html-sanitizer.helper';
import { PdfLayoutHelper } from '../utils/pdf-layout.helper';
import { EmailToPdfOptions } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class EmlToPdfConverter implements IConverter {
  readonly id = 'eml-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'eml-to-pdf',
    name: 'Email (.eml) to PDF Converter',
    shortTitle: 'EML to PDF',
    description: 'Convert .eml email messages into PDF documents with formatted headers, inline images, and merged attachments.',
    sourceFormats: ['.eml'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'mail',
    badge: 'Email',
    acceptMimeTypes: 'message/rfc822,text/plain,.eml',
    supportsTextInput: true,
    limitations: [
      'Renders email headers (From, To, Date, Subject) and HTML/plain-text bodies.',
      'Merges attached PDFs directly into the document and lists other file attachments.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.eml') && file.type !== 'message/rfc822' && file.type !== 'text/plain') {
      return { valid: false, error: 'Selected file is not an .eml email message.' };
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
        stage: 'Parsing email headers & MIME...',
        message: 'Extracting message body and attachments...'
      });

      const buffer = await file.arrayBuffer();
      const email = EmailParserHelper.parseEml(buffer);

      onProgress?.({
        percent: 50,
        stage: 'Formatting email document...',
        message: 'Laying out headers, body text, and attachments...'
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

      // 1. Draw Header Block at top of page 1
      const headerFields: Array<{ label: string; value: string }> = [];
      if (email.headers.from) headerFields.push({ label: 'From:', value: email.headers.from });
      if (email.headers.to) headerFields.push({ label: 'To:', value: email.headers.to });
      if (email.headers.cc) headerFields.push({ label: 'Cc:', value: email.headers.cc });
      if (email.headers.date) headerFields.push({ label: 'Date:', value: email.headers.date });
      if (email.headers.subject) headerFields.push({ label: 'Subject:', value: email.headers.subject });

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

      // 2. Draw Body
      let bodyText = '';
      if (email.htmlBody) {
        bodyText = HtmlSanitizerHelper.extractStructuredText(email.htmlBody);
      } else if (email.textBody) {
        bodyText = email.textBody;
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

      // 3. Render inline image attachments
      for (const att of email.attachments) {
        if (att.mimeType.startsWith('image/')) {
          try {
            let embeddedImg;
            if (att.mimeType === 'image/jpeg' || att.mimeType === 'image/jpg') {
              embeddedImg = await pdfDoc.embedJpg(att.content);
            } else {
              embeddedImg = await pdfDoc.embedPng(att.content);
            }

            if (embeddedImg) {
              const maxImgWidth = printableWidth;
              const maxImgHeight = 350;
              const scale = Math.min(1, maxImgWidth / embeddedImg.width, maxImgHeight / embeddedImg.height);
              const imgW = embeddedImg.width * scale;
              const imgH = embeddedImg.height * scale;

              checkNewPage(imgH + 20);
              currentPage.drawImage(embeddedImg, {
                x: margin,
                y: currentY - imgH,
                width: imgW,
                height: imgH
              });
              currentY -= imgH + 20;
            }
          } catch {
            // If image decoding fails, skip gracefully
          }
        }
      }

      // 4. Other Attachments summary block
      const nonPdfNonImgAtts = email.attachments.filter(
        a => !a.mimeType.startsWith('image/') && a.mimeType !== 'application/pdf' && !a.name.toLowerCase().endsWith('.pdf')
      );

      if (nonPdfNonImgAtts.length > 0) {
        checkNewPage(50);
        currentY -= 10;
        currentPage.drawText(`Attachments (${nonPdfNonImgAtts.length}):`, {
          x: margin,
          y: currentY,
          size: baseFontSize,
          font: boldFont,
          color: rgb(0.2, 0.25, 0.35)
        });
        currentY -= baseFontSize * 1.4;

        for (const att of nonPdfNonImgAtts) {
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

      // 5. Merge PDF Attachments directly into document
      const pdfAttachments = email.attachments.filter(
        a => a.mimeType === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf')
      );

      for (const pAtt of pdfAttachments) {
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
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'email';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        warnings: email.warnings.length > 0 ? email.warnings : undefined,
        previewData: {
          pageCount: pdfDoc.getPageCount(),
          subject: email.headers.subject,
          from: email.headers.from,
          attachmentCount: email.attachments.length
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
        error: `Failed to convert email to PDF: ${e?.message || e.toString()}`
      };
    }
  }
}
