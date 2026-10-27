import { Injectable, inject } from '@angular/core';
import { Document, Paragraph, TextRun, Packer, ImageRun } from 'docx';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { OcrService } from '../../services/ocr.service';
import { ImagesToWordOptions, ConversionReport } from '../../models/conversion-features.types';

@Injectable({
  providedIn: 'root'
})
export class ImagesToWordConverter implements IConverter {
  readonly id = 'images-to-word';
  readonly metadata: ConverterMetadata = {
    id: 'images-to-word',
    name: 'Images to Word Converter',
    shortTitle: 'Images to Word',
    description: 'Extract text from photos and scans via OCR into an editable Microsoft Word (.docx) document.',
    sourceFormats: ['.jpg', '.jpeg', '.png', '.webp', '.bmp'],
    targetFormat: 'docx',
    category: 'format-to-pdf',
    icon: 'document-text',
    badge: 'OCR to DOCX',
    acceptMimeTypes: 'image/jpeg,image/png,image/webp,image/bmp',
    limitations: [
      'Extracts textual paragraphs and detected lines into a standard Word document, in any of the five OCR languages.',
      'Recognition accuracy depends on image lighting, resolution, and text orientation; low-confidence results are flagged.'
    ],
    disclaimer: '100% on-device OCR using client-side Tesseract intelligence. Your images are never uploaded to any external server.'
  };

  private ocrService = inject(OcrService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') ||
      ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].some(ext => name.endsWith(ext));
    if (!isImage) {
      return { valid: false, error: 'Selected file is not a supported image.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: ImagesToWordOptions = {},
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
    const warnings: string[] = [];

    try {
      onProgress?.({ percent: 15, stage: 'Initializing local OCR engine...' });

      const ocrDoc = await this.ocrService.performOcr(
        file,
        (options.ocrLanguage || 'eng'),
        undefined,
        (event: any) => {
          onProgress?.({
            percent: 20 + Math.floor(event.progress * 60),
            stage: event.message || 'Recognizing text from image...'
          });
        }
      );

      onProgress?.({ percent: 85, stage: 'Formatting Word document paragraphs...' });

      if (ocrDoc.averageConfidence > 0 && ocrDoc.averageConfidence < 70) {
        warnings.push(
          `OCR confidence was ${Math.round(ocrDoc.averageConfidence)}%. Proofread the text against the image.`
        );
        report.approximations.push(
          `Low OCR confidence (${Math.round(ocrDoc.averageConfidence)}%) on this image`
        );
      }
      if (options.ocrLanguage && options.ocrLanguage !== 'eng') {
        // The .docx carries the text as Unicode, so Indic scripts survive here
        // even though the built-in PDF fonts cannot draw them.
        report.approximations.push(`Recognized using the ${options.ocrLanguage} language model`);
      }

      const docChildren: Paragraph[] = [];

      // Optionally embed source image
      if (options.embedSourceImage) {
        try {
          const imgBuffer = await file.arrayBuffer();
          const imgBytes = new Uint8Array(imgBuffer);
          docChildren.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBytes,
                  transformation: { width: 450, height: 320 }
                } as any)
              ]
            })
          );
          docChildren.push(new Paragraph({ text: '' }));
        } catch (imgErr) {
          report.droppedElements.push('Could not embed original image preview');
        }
      }

      // Add recognized text paragraphs
      const recognizedText = ocrDoc.fullText || '';
      const rawLines = recognizedText.split('\n');

      let currentParagraph = '';
      for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentParagraph) {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: currentParagraph,
                    font: options.fontFamily || 'Calibri',
                    size: 24
                  })
                ]
              })
            );
            currentParagraph = '';
          }
        } else {
          currentParagraph = currentParagraph ? `${currentParagraph} ${trimmed}` : trimmed;
        }
      }

      if (currentParagraph) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: currentParagraph,
                font: options.fontFamily || 'Calibri',
                size: 24
              })
            ]
          })
        );
      }

      if (docChildren.length === 0) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: '(No text recognized in image)',
                italics: true,
                color: '888888'
              })
            ]
          })
        );
        report.approximations.push('No prominent text detected in source image');
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: docChildren
          }
        ]
      });

      onProgress?.({ percent: 95, stage: 'Packaging .docx file...' });
      const docxBlob = await Packer.toBlob(doc);
      const outName = file.name.replace(/\.[^/.]+$/, '') + '.docx';
      const outFile = new File([docxBlob], outName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      onProgress?.({ percent: 100, stage: 'Conversion completed successfully' });

      return {
        success: true,
        file: outFile,
        downloadName: outName,
        warnings: warnings.length ? warnings : undefined,
        report
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Image to Word conversion failed: ${err.message || err}`,
        report
      };
    }
  }
}
