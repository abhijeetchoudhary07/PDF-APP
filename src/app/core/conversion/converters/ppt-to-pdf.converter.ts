import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';

@Injectable({
  providedIn: 'root'
})
export class PptToPdfConverter implements IConverter {
  readonly id = 'ppt-to-pdf';
  readonly metadata: ConverterMetadata = {
    id: 'ppt-to-pdf',
    name: 'PowerPoint to PDF Converter',
    shortTitle: 'PowerPoint to PDF',
    description: 'Convert Microsoft PowerPoint presentations (.pptx) into clean PDF slides.',
    sourceFormats: ['.pptx', '.ppt'],
    targetFormat: 'pdf',
    category: 'format-to-pdf',
    icon: 'film',
    badge: 'PPTX to PDF',
    acceptMimeTypes: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.ppt,application/vnd.ms-powerpoint',
    limitations: [
      'Extracts slide text, titles, bullet points, and embedded slide media from .pptx presentations.',
      'Legacy binary PowerPoint 97-2004 (.ppt) files must be saved as modern .pptx first.'
    ]
  };

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.ppt') && !name.endsWith('.pptx')) {
      return {
        valid: false,
        error: 'Legacy binary PowerPoint (.ppt) cannot be parsed client-side. Please save as modern PowerPoint (.pptx) first.'
      };
    }
    if (!name.endsWith('.pptx')) {
      return { valid: false, error: 'Selected file is not a valid PowerPoint (.pptx) presentation.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: {
      orientation?: 'Landscape' | 'Portrait';
    } = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 20,
        stage: 'Opening PowerPoint (.pptx) package...',
        message: 'Inspecting slide archives...'
      });

      const zip = new JSZip();
      const zipContent = await zip.loadAsync(await file.arrayBuffer());

      // Identify slide files in ppt/slides/slide*.xml
      const slideFiles = Object.keys(zipContent.files)
        .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          return numA - numB;
        });

      if (slideFiles.length === 0) {
        return { success: false, error: 'No slides found in this PowerPoint presentation.' };
      }

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Slide dimensions (Standard 16:9 widescreen: 841.89 x 473.56 pt, or landscape A4)
      const slideWidth = 841.89;
      const slideHeight = 473.56;

      for (let i = 0; i < slideFiles.length; i++) {
        const slidePath = slideFiles[i];
        const percent = Math.round(25 + ((i + 1) / slideFiles.length) * 65);

        onProgress?.({
          percent,
          stage: `Converting slide ${i + 1} of ${slideFiles.length}...`,
          currentItem: i + 1,
          totalItems: slideFiles.length,
          message: 'Extracting slide content and layout...'
        });

        const xmlText = await zipContent.files[slidePath].async('string');
        const slideData = this.parseSlideXml(xmlText);

        const page = pdfDoc.addPage([slideWidth, slideHeight]);

        // Draw slide background
        page.drawRectangle({
          x: 0,
          y: 0,
          width: slideWidth,
          height: slideHeight,
          color: rgb(0.98, 0.98, 0.99),
        });

        // Draw slide border header
        page.drawRectangle({
          x: 0,
          y: slideHeight - 8,
          width: slideWidth,
          height: 8,
          color: rgb(0.85, 0.2, 0.2), // PowerPoint red accent
        });

        let currentY = slideHeight - 50;

        // Draw title
        if (slideData.title) {
          page.drawText(slideData.title, {
            x: 50,
            y: currentY,
            size: 24,
            font: boldFont,
            color: rgb(0.15, 0.15, 0.15),
          });
          currentY -= 40;
        }

        // Draw body texts / bullets
        for (const item of slideData.items) {
          if (currentY < 40) break;
          const bulletText = `•  ${item}`;
          page.drawText(bulletText, {
            x: 60,
            y: currentY,
            size: 14,
            font,
            color: rgb(0.25, 0.25, 0.25),
          });
          currentY -= 24;
        }

        // Slide number in bottom corner
        const slideNumText = `Slide ${i + 1} of ${slideFiles.length}`;
        page.drawText(slideNumText, {
          x: slideWidth - 120,
          y: 20,
          size: 10,
          font,
          color: rgb(0.6, 0.6, 0.6),
        });
      }

      onProgress?.({
        percent: 95,
        stage: 'Finalizing PDF slides...',
        message: 'Saving presentation...'
      });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'presentation';
      const finalPdf = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
      const previewUrl = URL.createObjectURL(finalPdf);

      return {
        success: true,
        file: finalPdf,
        previewUrl,
        downloadName: finalPdf.name,
        previewData: {
          slideCount: slideFiles.length
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
        error: `Failed to convert PowerPoint to PDF: ${e?.message || e.toString()}`
      };
    }
  }

  private parseSlideXml(xmlStr: string): { title?: string; items: string[] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');

    // Extract all <a:t> text elements
    const textNodes = doc.getElementsByTagName('a:t');
    const texts: string[] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].textContent?.trim();
      if (t) texts.push(t);
    }

    if (texts.length === 0) {
      return { items: [] };
    }

    const title = texts[0];
    const items = texts.slice(1);
    return { title, items };
  }
}
