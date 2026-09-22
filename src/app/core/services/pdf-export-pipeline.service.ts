import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFPage,
  PDFFont
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfEditorDocument,
  PdfEditorPage,
  PdfElement,
  PdfTextElement,
  PdfImageElement,
  PdfShapeElement,
  PdfDrawingElement,
  PdfAnnotationElement,
  PdfWatermark,
  PdfPageNumberingConfig,
  PdfRedaction,
  FontStyleName
} from '../models/pdf-editor.types';

export interface ExportResult {
  file: File;
  blob: Blob;
  sizeBytes: number;
  pageCount: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255
  };
}

@Injectable({
  providedIn: 'root'
})
export class PdfExportPipelineService {
  constructor() {}

  async exportDocument(
    doc: PdfEditorDocument,
    outputFileName?: string,
    onProgress?: (progress: number) => void
  ): Promise<ExportResult> {
    if (!doc || doc.pages.length === 0) {
      throw new Error('No pages to export.');
    }

    onProgress?.(5);

    // 1. Load the original source PDF in pdf-lib
    const sourcePdf = await PDFDocument.load(doc.arrayBuffer.slice(0), {
      ignoreEncryption: true
    });

    // 2. Create the destination PDF
    const destPdf = await PDFDocument.create();

    // Standard fonts cache
    const fonts: Record<FontStyleName, PDFFont> = {
      Helvetica: await destPdf.embedFont(StandardFonts.Helvetica),
      TimesRoman: await destPdf.embedFont(StandardFonts.TimesRoman),
      Courier: await destPdf.embedFont(StandardFonts.Courier)
    };
    const boldFonts: Record<FontStyleName, PDFFont> = {
      Helvetica: await destPdf.embedFont(StandardFonts.HelveticaBold),
      TimesRoman: await destPdf.embedFont(StandardFonts.TimesRomanBold),
      Courier: await destPdf.embedFont(StandardFonts.CourierBold)
    };

    onProgress?.(15);

    // Check if any pages need True Redaction rasterization
    const hasRedactions = doc.pages.some(p => p.redactions.some(r => r.isApplied));
    let pdfjsDoc: any = null;
    if (hasRedactions) {
      pdfjsDoc = await pdfjsLib.getDocument({
        data: new Uint8Array(doc.arrayBuffer.slice(0))
      } as any).promise;
    }

    const totalPages = doc.pages.length;

    for (let i = 0; i < totalPages; i++) {
      const pageModel = doc.pages[i];
      const sourcePageIndex = pageModel.pageNumber - 1; // 0-indexed
      const appliedRedactions = pageModel.redactions.filter(r => r.isApplied);

      let destPage: PDFPage;

      if (appliedRedactions.length > 0) {
        // --- TRUE REDACTION PIPELINE ---
        // Rasterize the page at 300 DPI to completely destroy underlying vector text streams
        destPage = await this.renderSecureRedactedPage(
          pdfjsDoc,
          destPdf,
          pageModel,
          appliedRedactions
        );
      } else {
        // Standard vector copy
        const [copiedPage] = await destPdf.copyPages(sourcePdf, [sourcePageIndex]);
        destPage = destPdf.addPage(copiedPage);
      }

      // Apply User Rotation
      if (pageModel.rotation) {
        const currentRot = destPage.getRotation().angle || 0;
        destPage.setRotation(degrees((currentRot + pageModel.rotation) % 360));
      }

      // Apply Crop Box if specified
      if (pageModel.cropBox) {
        const { x, y, width, height } = pageModel.cropBox;
        // In PDF coordinates, y=0 is bottom-left
        const pageSize = destPage.getSize();
        const pdfY = pageSize.height - y - height;
        destPage.setCropBox(x, pdfY, width, height);
      }

      // Draw Overlay Elements (Text, Images, Shapes, Drawings, Annotations)
      await this.drawPageElements(destPdf, destPage, pageModel.elements, fonts, boldFonts);

      // Draw Global / Page Watermark if applicable
      if (doc.watermark) {
        const shouldWatermark =
          doc.watermark.targetPages === 'all' ||
          (doc.watermark.selectedPages &&
            doc.watermark.selectedPages.includes(pageModel.pageNumber));
        if (shouldWatermark) {
          await this.drawWatermark(destPdf, destPage, doc.watermark, fonts);
        }
      }

      // Draw Page Numbering if configured
      if (doc.pageNumbering) {
        const shouldNumber =
          doc.pageNumbering.targetPages === 'all' ||
          (doc.pageNumbering.selectedPages &&
            doc.pageNumbering.selectedPages.includes(pageModel.pageNumber));
        if (shouldNumber) {
          this.drawPageNumber(
            destPage,
            pageModel.pageNumber,
            totalPages,
            doc.pageNumbering,
            fonts
          );
        }
      }

      const progressPercent = Math.round(15 + ((i + 1) / totalPages) * 75);
      onProgress?.(progressPercent);
    }

    onProgress?.(95);

    // Save final PDF
    const finalBytes = await destPdf.save({ useObjectStreams: false });
    const name = outputFileName || `${doc.name.replace(/\.pdf$/i, '')}_edited_${Date.now()}.pdf`;
    const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
    const file = new File([blob], name, { type: 'application/pdf' });

    onProgress?.(100);

    return {
      file,
      blob,
      sizeBytes: file.size,
      pageCount: totalPages
    };
  }

  /**
   * TRUE REDACTION ENGINE:
   * Renders the page + blackouts onto a high-res canvas (300 DPI), then replaces the page
   * with this rasterized image in the destination PDF document.
   * This guarantees that no vector text, glyphs, or metadata remain in the PDF binary for extraction.
   */
  private async renderSecureRedactedPage(
    pdfjsDoc: any,
    destPdf: PDFDocument,
    pageModel: PdfEditorPage,
    redactions: PdfRedaction[]
  ): Promise<PDFPage> {
    const pageNum = pageModel.pageNumber;
    const pdfPage = await pdfjsDoc.getPage(pageNum);
    
    // Scale 3.0 gives ~216 to 300 DPI for high print clarity
    const renderScale = 2.5;
    const viewport = pdfPage.getViewport({ scale: renderScale });

    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const ctx = canvas ? canvas.getContext('2d') : null;

    if (!ctx) {
      // In headless/Node environments where HTMLCanvasElement 2D context is not available:
      // Create a fresh clean page without copying any underlying vector text streams,
      // and draw permanent solid black redaction rectangles.
      const newPage = destPdf.addPage([pageModel.originalWidth, pageModel.originalHeight]);
      for (const redaction of redactions) {
        const pdfY = pageModel.originalHeight - redaction.y - redaction.height;
        newPage.drawRectangle({
          x: redaction.x,
          y: pdfY,
          width: redaction.width,
          height: redaction.height,
          color: rgb(0, 0, 0)
        });
      }
      return newPage;
    }

    canvas!.width = Math.floor(viewport.width);
    canvas!.height = Math.floor(viewport.height);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas!.width, canvas!.height);

    // Render underlying vector content to canvas
    await (pdfPage.render({
      canvasContext: ctx,
      viewport
    } as any)).promise;

    // Burn permanent solid black boxes into the pixel data
    for (const redaction of redactions) {
      const rx = redaction.x * renderScale;
      const ry = redaction.y * renderScale;
      const rw = redaction.width * renderScale;
      const rh = redaction.height * renderScale;

      ctx.fillStyle = redaction.overlayColor || '#000000';
      ctx.fillRect(rx, ry, rw, rh);

      if (redaction.label) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(12, 10 * renderScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(redaction.label, rx + rw / 2, ry + rh / 2);
      }
    }

    // Convert rasterized canvas to JPEG
    const imgDataUrl = canvas!.toDataURL('image/jpeg', 0.92);
    const imgBytes = await (await fetch(imgDataUrl)).arrayBuffer();
    const embeddedImg = await destPdf.embedJpg(imgBytes);

    // Create new destination page with original dimensions
    const newPage = destPdf.addPage([pageModel.originalWidth, pageModel.originalHeight]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: pageModel.originalWidth,
      height: pageModel.originalHeight
    });

    return newPage;
  }

  /**
   * Draws overlay elements onto the PDF page.
   */
  private async drawPageElements(
    destPdf: PDFDocument,
    destPage: PDFPage,
    elements: PdfElement[],
    fonts: Record<FontStyleName, PDFFont>,
    boldFonts: Record<FontStyleName, PDFFont>
  ) {
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    const pageHeight = destPage.getSize().height;

    for (const el of sortedElements) {
      // In PDF coordinates, (0, 0) is bottom-left, whereas canvas is top-left
      const pdfY = pageHeight - el.y - el.height;

      switch (el.type) {
        case 'text': {
          const textEl = el as PdfTextElement;
          const font = textEl.bold
            ? boldFonts[textEl.fontFamily] || boldFonts.Helvetica
            : fonts[textEl.fontFamily] || fonts.Helvetica;
          const { r, g, b } = hexToRgb(textEl.color || '#000000');

          if (textEl.backgroundColor) {
            const bgRgb = hexToRgb(textEl.backgroundColor);
            destPage.drawRectangle({
              x: textEl.x,
              y: pdfY,
              width: textEl.width,
              height: textEl.height,
              color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
              opacity: textEl.opacity || 1.0
            });
          }

          destPage.drawText(textEl.text, {
            x: textEl.x + 4,
            y: pdfY + textEl.height - (textEl.fontSize * 1.05),
            size: textEl.fontSize,
            font,
            color: rgb(r, g, b),
            opacity: textEl.opacity || 1.0,
            rotate: degrees(textEl.rotation || 0)
          });
          break;
        }

        case 'image': {
          const imgEl = el as PdfImageElement;
          try {
            let embeddedImage;
            const res = await fetch(imgEl.imageUrl);
            const bytes = await res.arrayBuffer();
            if (imgEl.imageUrl.includes('png') || imgEl.imageUrl.startsWith('data:image/png')) {
              embeddedImage = await destPdf.embedPng(bytes);
            } else {
              embeddedImage = await destPdf.embedJpg(bytes);
            }

            destPage.drawImage(embeddedImage, {
              x: imgEl.x,
              y: pdfY,
              width: imgEl.width,
              height: imgEl.height,
              opacity: imgEl.opacity || 1.0,
              rotate: degrees(imgEl.rotation || 0)
            });
          } catch (err) {
            console.error('Failed to embed overlay image', err);
          }
          break;
        }

        case 'shape': {
          const shapeEl = el as PdfShapeElement;
          const strokeRgb = hexToRgb(shapeEl.strokeColor || '#000000');
          const fillRgb = shapeEl.fillColor ? hexToRgb(shapeEl.fillColor) : undefined;

          if (shapeEl.shapeType === 'rectangle') {
            destPage.drawRectangle({
              x: shapeEl.x,
              y: pdfY,
              width: shapeEl.width,
              height: shapeEl.height,
              borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              borderWidth: shapeEl.strokeWidth || 2,
              color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
              opacity: shapeEl.opacity || 1.0,
              rotate: degrees(shapeEl.rotation || 0)
            });
          } else if (shapeEl.shapeType === 'circle') {
            const centerX = shapeEl.x + shapeEl.width / 2;
            const centerY = pdfY + shapeEl.height / 2;
            destPage.drawEllipse({
              x: centerX,
              y: centerY,
              xScale: shapeEl.width / 2,
              yScale: shapeEl.height / 2,
              borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              borderWidth: shapeEl.strokeWidth || 2,
              color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
              opacity: shapeEl.opacity || 1.0
            });
          } else if (shapeEl.shapeType === 'line' || shapeEl.shapeType === 'arrow') {
            const startX = shapeEl.x;
            const startY = pageHeight - shapeEl.y;
            const endX = shapeEl.endPoint ? shapeEl.endPoint.x : shapeEl.x + shapeEl.width;
            const endY = shapeEl.endPoint
              ? pageHeight - shapeEl.endPoint.y
              : pageHeight - (shapeEl.y + shapeEl.height);

            destPage.drawLine({
              start: { x: startX, y: startY },
              end: { x: endX, y: endY },
              thickness: shapeEl.strokeWidth || 2,
              color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              opacity: shapeEl.opacity || 1.0
            });

            if (shapeEl.shapeType === 'arrow') {
              // Draw arrowhead
              const angle = Math.atan2(endY - startY, endX - startX);
              const headLen = 10;
              destPage.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - headLen * Math.cos(angle - Math.PI / 6),
                  y: endY - headLen * Math.sin(angle - Math.PI / 6)
                },
                thickness: shapeEl.strokeWidth || 2,
                color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b)
              });
              destPage.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - headLen * Math.cos(angle + Math.PI / 6),
                  y: endY - headLen * Math.sin(angle + Math.PI / 6)
                },
                thickness: shapeEl.strokeWidth || 2,
                color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b)
              });
            }
          }
          break;
        }

        case 'drawing': {
          const drawEl = el as PdfDrawingElement;
          if (drawEl.points.length >= 2) {
            const { r, g, b } = hexToRgb(drawEl.strokeColor || '#000000');
            for (let p = 0; p < drawEl.points.length - 1; p++) {
              const p1 = drawEl.points[p];
              const p2 = drawEl.points[p + 1];
              destPage.drawLine({
                start: { x: p1.x, y: pageHeight - p1.y },
                end: { x: p2.x, y: pageHeight - p2.y },
                thickness: drawEl.strokeWidth || 2,
                color: rgb(r, g, b),
                opacity: drawEl.opacity || 1.0
              });
            }
          }
          break;
        }

        case 'annotation': {
          const annotEl = el as PdfAnnotationElement;
          const { r, g, b } = hexToRgb(annotEl.color || '#FFFF00');

          if (annotEl.annotationType === 'highlight') {
            destPage.drawRectangle({
              x: annotEl.x,
              y: pdfY,
              width: annotEl.width,
              height: annotEl.height,
              color: rgb(r, g, b),
              opacity: annotEl.opacity || 0.35
            });
          } else if (annotEl.annotationType === 'underline') {
            destPage.drawLine({
              start: { x: annotEl.x, y: pdfY },
              end: { x: annotEl.x + annotEl.width, y: pdfY },
              thickness: annotEl.strokeWidth || 2,
              color: rgb(r, g, b),
              opacity: annotEl.opacity || 1.0
            });
          } else if (annotEl.annotationType === 'strikethrough') {
            const midY = pdfY + annotEl.height / 2;
            destPage.drawLine({
              start: { x: annotEl.x, y: midY },
              end: { x: annotEl.x + annotEl.width, y: midY },
              thickness: annotEl.strokeWidth || 2,
              color: rgb(r, g, b),
              opacity: annotEl.opacity || 1.0
            });
          } else if (annotEl.annotationType === 'note') {
            // Note icon / sticky note
            destPage.drawRectangle({
              x: annotEl.x,
              y: pdfY,
              width: 24,
              height: 24,
              color: rgb(r, g, b),
              borderColor: rgb(0.2, 0.2, 0.2),
              borderWidth: 1,
              opacity: 0.9
            });
          }
          break;
        }
      }
    }
  }

  /**
   * Draws a text or image watermark.
   */
  private async drawWatermark(
    destPdf: PDFDocument,
    destPage: PDFPage,
    watermark: PdfWatermark,
    fonts: Record<FontStyleName, PDFFont>
  ) {
    const { width, height } = destPage.getSize();

    if (watermark.type === 'text' && watermark.text) {
      const font = fonts[watermark.fontFamily || 'Helvetica'] || fonts.Helvetica;
      const { r, g, b } = hexToRgb(watermark.color || '#888888');
      const fontSize = watermark.fontSize || 48;
      const textWidth = font.widthOfTextAtSize(watermark.text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      let x = (width - textWidth) / 2;
      let y = (height - textHeight) / 2;
      let rot = watermark.rotation || 45;

      if (watermark.position === 'top') {
        y = height - 100;
        rot = 0;
      } else if (watermark.position === 'bottom') {
        y = 50;
        rot = 0;
      } else if (watermark.position === 'custom' && watermark.customX && watermark.customY) {
        x = watermark.customX;
        y = height - watermark.customY;
      }

      destPage.drawText(watermark.text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(r, g, b),
        opacity: watermark.opacity || 0.2,
        rotate: degrees(rot)
      });
    } else if (watermark.type === 'image' && watermark.imageUrl) {
      try {
        const res = await fetch(watermark.imageUrl);
        const bytes = await res.arrayBuffer();
        let img;
        if (watermark.imageUrl.includes('png') || watermark.imageUrl.startsWith('data:image/png')) {
          img = await destPdf.embedPng(bytes);
        } else {
          img = await destPdf.embedJpg(bytes);
        }

        const scale = watermark.scale || 0.5;
        const imgW = img.width * scale;
        const imgH = img.height * scale;
        const x = (width - imgW) / 2;
        const y = (height - imgH) / 2;

        destPage.drawImage(img, {
          x,
          y,
          width: imgW,
          height: imgH,
          opacity: watermark.opacity || 0.2,
          rotate: degrees(watermark.rotation || 0)
        });
      } catch (e) {
        console.error('Failed to embed watermark image', e);
      }
    }
  }

  /**
   * Draws formatted page numbers at the selected position.
   */
  private drawPageNumber(
    destPage: PDFPage,
    pageNumber: number,
    totalPages: number,
    config: PdfPageNumberingConfig,
    fonts: Record<FontStyleName, PDFFont>
  ) {
    const { width, height } = destPage.getSize();
    const font = fonts[config.fontFamily || 'Helvetica'] || fonts.Helvetica;
    const { r, g, b } = hexToRgb(config.color || '#333333');
    const fontSize = config.fontSize || 10;

    const actualNumber = config.startingNumber + (pageNumber - 1);
    const text = `${config.prefix || ''}${actualNumber}${config.suffix || ''}`.replace(
      '{total}',
      `${totalPages}`
    );

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const margin = 24;

    let x = margin;
    let y = margin;

    // Horizontal alignment
    if (config.position.includes('center')) {
      x = (width - textWidth) / 2;
    } else if (config.position.includes('right')) {
      x = width - textWidth - margin;
    }

    // Vertical alignment
    if (config.position.startsWith('top')) {
      y = height - margin - fontSize;
    }

    destPage.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(r, g, b)
    });
  }
}
