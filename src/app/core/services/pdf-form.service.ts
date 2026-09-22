import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  StandardFonts,
  rgb
} from 'pdf-lib';
import {
  PdfFormField,
  PdfFormDocument,
  PdfFormFieldType,
  FormExportOptions
} from '../models/pdf-forms.types';

@Injectable({
  providedIn: 'root'
})
export class PdfFormService {
  constructor() {}

  /**
   * Inspects a PDF to detect whether it contains interactive AcroForm fields.
   */
  async inspectPdfForForms(source: File | ArrayBuffer, fileName = 'document.pdf'): Promise<PdfFormDocument> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
    const name = source instanceof File ? source.name : fileName;
    const sizeBytes = arrayBuffer.byteLength;

    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    let hasNativeForms = false;
    const fields: PdfFormField[] = [];

    try {
      const form = pdfDoc.getForm();
      const rawFields = form.getFields();

      if (rawFields && rawFields.length > 0) {
        hasNativeForms = true;

        for (const rawField of rawFields) {
          const fieldName = rawField.getName();
          let fieldType: PdfFormFieldType = 'text';
          let val: any = '';
          let options: string[] | undefined;
          let isMultiline = false;
          let isReadOnly = false;
          let isRequired = false;

          try {
            isReadOnly = rawField.isReadOnly();
          } catch {
            // ignore
          }

          try {
            isRequired = rawField.isRequired();
          } catch {
            // ignore
          }

          if (rawField instanceof PDFTextField) {
            fieldType = fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('dob')
              ? 'date'
              : 'text';
            val = rawField.getText() || '';
            try {
              isMultiline = rawField.isMultiline();
            } catch {
              // ignore
            }
          } else if (rawField instanceof PDFCheckBox) {
            fieldType = 'checkbox';
            val = rawField.isChecked();
          } else if (rawField instanceof PDFRadioGroup) {
            fieldType = 'radio';
            options = rawField.getOptions();
            val = rawField.getSelected() || '';
          } else if (rawField instanceof PDFDropdown) {
            fieldType = 'dropdown';
            options = rawField.getOptions();
            const selected = rawField.getSelected();
            val = selected && selected.length > 0 ? selected[0] : '';
          } else if (rawField instanceof PDFOptionList) {
            fieldType = 'dropdown';
            options = rawField.getOptions();
            const selected = rawField.getSelected();
            val = selected && selected.length > 0 ? selected[0] : '';
          } else if (rawField instanceof PDFSignature) {
            fieldType = 'signature';
            val = '';
          }

          fields.push({
            id: `field_${fields.length + 1}_${fieldName.replace(/[^a-zA-Z0-9]/g, '_')}`,
            name: fieldName,
            label: fieldName.replace(/([A-Z])/g, ' $1').replace(/[_\-\.]+/g, ' ').trim(),
            type: fieldType,
            value: val,
            options,
            isMultiline,
            isReadOnly,
            isRequired,
            isNative: true
          });
        }
      }
    } catch {
      // PDF has no AcroForm structure
      hasNativeForms = false;
    }

    return {
      id: `form_doc_${Date.now()}`,
      name,
      sizeBytes,
      pageCount,
      file: source instanceof File ? source : undefined,
      arrayBuffer,
      hasNativeForms,
      fields
    };
  }

  /**
   * Fills native AcroForm fields and optionally flattens them into static PDF content.
   */
  async fillNativeForm(
    arrayBuffer: ArrayBuffer,
    fields: PdfFormField[],
    flatten = false
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    
    try {
      const form = pdfDoc.getForm();

      for (const field of fields) {
        if (!field.isNative) continue;

        try {
          switch (field.type) {
            case 'text':
            case 'date': {
              const tf = form.getTextField(field.name);
              if (tf) {
                tf.setText(field.value != null ? String(field.value) : '');
              }
              break;
            }
            case 'checkbox': {
              const cb = form.getCheckBox(field.name);
              if (cb) {
                if (Boolean(field.value)) {
                  cb.check();
                } else {
                  cb.uncheck();
                }
              }
              break;
            }
            case 'radio': {
              const rg = form.getRadioGroup(field.name);
              if (rg && field.value) {
                rg.select(String(field.value));
              }
              break;
            }
            case 'dropdown': {
              const dd = form.getDropdown(field.name);
              if (dd && field.value) {
                dd.select(String(field.value));
              }
              break;
            }
          }
        } catch {
          // If a specific field fails to update, continue processing others
        }
      }

      if (flatten) {
        try {
          form.flatten({ updateFieldAppearances: true });
        } catch {
          // Fallback simple flatten
          form.flatten();
        }
      }
    } catch {
      // No native form in document
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }

  /**
   * Overlays manual fields onto the PDF pages at precise coordinates.
   */
  async renderManualFields(
    arrayBuffer: ArrayBuffer,
    manualFields: PdfFormField[]
  ): Promise<Uint8Array> {
    if (!manualFields || manualFields.length === 0) {
      return new Uint8Array(arrayBuffer);
    }

    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const field of manualFields) {
      if (!field.coordinates) continue;

      const pageIdx = field.coordinates.pageNumber - 1;
      if (pageIdx < 0 || pageIdx >= pages.length) continue;

      const page = pages[pageIdx];
      const pageHeight = page.getHeight();
      // PDF coordinates have (0,0) at bottom-left
      const pdfY = pageHeight - field.coordinates.y - field.coordinates.height;

      switch (field.type) {
        case 'text':
        case 'date': {
          const text = field.value ? String(field.value) : '';
          if (text) {
            const fontSize = Math.max(10, Math.min(14, field.coordinates.height * 0.6));
            page.drawText(text, {
              x: field.coordinates.x + 4,
              y: pdfY + (field.coordinates.height - fontSize) / 2,
              size: fontSize,
              font,
              color: rgb(0, 0, 0)
            });
          }
          break;
        }

        case 'checkbox': {
          const isChecked = Boolean(field.value);
          // Draw checkmark box
          page.drawRectangle({
            x: field.coordinates.x,
            y: pdfY,
            width: field.coordinates.width,
            height: field.coordinates.height,
            borderColor: rgb(0.2, 0.2, 0.2),
            borderWidth: 1.5,
            color: rgb(1, 1, 1)
          });

          if (isChecked) {
            const x0 = field.coordinates.x + field.coordinates.width * 0.2;
            const y0 = pdfY + field.coordinates.height * 0.5;
            const x1 = field.coordinates.x + field.coordinates.width * 0.45;
            const y1 = pdfY + field.coordinates.height * 0.2;
            const x2 = field.coordinates.x + field.coordinates.width * 0.85;
            const y2 = pdfY + field.coordinates.height * 0.8;

            page.drawLine({
              start: { x: x0, y: y0 },
              end: { x: x1, y: y1 },
              thickness: 2,
              color: rgb(0, 0.4, 0.8)
            });
            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: 2,
              color: rgb(0, 0.4, 0.8)
            });
          }
          break;
        }

        case 'signature': {
          if (field.value && typeof field.value === 'string' && field.value.startsWith('data:image')) {
            try {
              const res = await fetch(field.value);
              const imgBytes = await res.arrayBuffer();
              const isPng = field.value.includes('image/png');
              const embeddedImg = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);

              page.drawImage(embeddedImg, {
                x: field.coordinates.x,
                y: pdfY,
                width: field.coordinates.width,
                height: field.coordinates.height
              });
            } catch {
              // Signature image embedding failed
            }
          }
          break;
        }
      }
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }

  /**
   * Combines native form population and manual field overlay into an exported PDF.
   */
  async exportCompletedForm(
    doc: PdfFormDocument,
    manualFields: PdfFormField[] = [],
    options: FormExportOptions = { flatten: true }
  ): Promise<{ file: File; blob: Blob; sizeBytes: number }> {
    // 1. Process native fields
    let currentBytes = await this.fillNativeForm(doc.arrayBuffer, doc.fields, options.flatten);

    // 2. Overlay manual fields if present
    if (manualFields.length > 0) {
      currentBytes = await this.renderManualFields(currentBytes.buffer as ArrayBuffer, manualFields);
    }

    const name = options.outputFileName || `${doc.name.replace(/\.pdf$/i, '')}_filled.pdf`;
    const blob = new Blob([currentBytes as any], { type: 'application/pdf' });
    const file = new File([blob], name, { type: 'application/pdf' });

    return {
      file,
      blob,
      sizeBytes: file.size
    };
  }
}
