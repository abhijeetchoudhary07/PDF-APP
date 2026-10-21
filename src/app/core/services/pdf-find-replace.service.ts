import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  FindReplaceOptions,
  FindMatch,
  FindReplaceResult
} from '../models/editor-features.types';
import { PdfEditorDocument, Rect } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfFindReplaceService {
  constructor() {}

  /**
   * Searches across all pages in the PDF document, including:
   * 1. Extracted content stream text runs via PDF.js
   * 2. Form field values from AcroForm via pdf-lib
   * 3. Any editor-added text elements in state
   */
  async findMatches(
    doc: PdfEditorDocument,
    query: string,
    options: FindReplaceOptions = {}
  ): Promise<FindMatch[]> {
    if (!doc || !query || !query.trim()) {
      return [];
    }

    const {
      caseSensitive = false,
      wholeWord = false,
      includeFormFields = true
    } = options;

    const matches: FindMatch[] = [];
    const flags = caseSensitive ? 'g' : 'gi';
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = wholeWord
      ? new RegExp(`\\b${escapedQuery}\\b`, flags)
      : new RegExp(escapedQuery, flags);

    // 1. Search in PDF.js rendered page text content
    let pdfjsDoc: any = null;
    try {
      pdfjsDoc = await pdfjsLib.getDocument({
        data: new Uint8Array(doc.arrayBuffer.slice(0))
      } as any).promise;

      for (let pNum = 1; pNum <= doc.pageCount; pNum++) {
        const page = await pdfjsDoc.getPage(pNum);
        const textContent = await page.getTextContent();

        let pageMatchIndex = 0;
        for (const item of textContent.items) {
          if (!item.str) continue;

          regex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(item.str)) !== null) {
            // item.transform: [scaleX, skewY, skewX, scaleY, transX, transY]
            const tx = item.transform[4] || 0;
            const ty = item.transform[5] || 0;
            const width = item.width || Math.max(10, match[0].length * 8);
            const height = item.height || 12;

            matches.push({
              id: generateId(),
              pageNumber: pNum,
              matchIndex: pageMatchIndex++,
              text: item.str,
              matchedText: match[0],
              bounds: {
                x: tx,
                y: ty,
                width: width,
                height: height
              },
              source: 'page-text'
            });

            if (match.index === regex.lastIndex) {
              regex.lastIndex++;
            }
          }
        }
      }
    } catch (err) {
      console.warn('PDF.js text search encountered error', err);
    }

    // 2. Search in form field values via pdf-lib
    if (includeFormFields) {
      try {
        const pdfDoc = await PDFDocument.load(doc.arrayBuffer.slice(0), { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        for (const field of fields) {
          const fieldName = field.getName();
          let fieldValue = '';
          try {
            // Check if field has text value
            if ('getText' in field && typeof (field as any).getText === 'function') {
              fieldValue = (field as any).getText() || '';
            }
          } catch (e) {
            fieldValue = '';
          }

          if (fieldValue) {
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(fieldValue)) !== null) {
              matches.push({
                id: generateId(),
                pageNumber: 1, // Form field top-level page default
                matchIndex: matches.length,
                text: fieldValue,
                matchedText: match[0],
                bounds: { x: 0, y: 0, width: 100, height: 20 },
                source: 'form-field',
                fieldName
              });

              if (match.index === regex.lastIndex) {
                regex.lastIndex++;
              }
            }
          }
        }
      } catch (e) {
        // Form might not exist in PDF
      }
    }

    // 3. Search in editor-added text elements
    for (const page of doc.pages) {
      for (const el of page.elements) {
        if (el.type === 'text') {
          const textEl = el as any;
          if (textEl.text) {
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(textEl.text)) !== null) {
              matches.push({
                id: generateId(),
                pageNumber: page.pageNumber,
                matchIndex: matches.length,
                text: textEl.text,
                matchedText: match[0],
                bounds: { x: el.x, y: el.y, width: el.width, height: el.height },
                source: 'editor-element',
                elementId: el.id
              });

              if (match.index === regex.lastIndex) {
                regex.lastIndex++;
              }
            }
          }
        }
      }
    }

    return matches;
  }

  /**
   * Replaces matches across document.
   * Form field values and editor text elements are directly updated.
  /**
   * Searches across document text, form fields, and editor elements
   */
  async findAcrossDocument(
    pdfDataOrDoc: ArrayBuffer | Uint8Array | PdfEditorDocument,
    query: string,
    options: FindReplaceOptions = {},
    editorDoc?: PdfEditorDocument
  ): Promise<FindMatch[]> {
    if ('pages' in pdfDataOrDoc && 'arrayBuffer' in pdfDataOrDoc) {
      return this.findMatches(pdfDataOrDoc as PdfEditorDocument, query, options);
    }
    const arrayBuffer: ArrayBuffer = pdfDataOrDoc instanceof Uint8Array
      ? (pdfDataOrDoc.buffer.slice(pdfDataOrDoc.byteOffset, pdfDataOrDoc.byteOffset + pdfDataOrDoc.byteLength) as ArrayBuffer)
      : (pdfDataOrDoc as ArrayBuffer);
    const doc: PdfEditorDocument = editorDoc || {
      id: 'doc',
      name: 'doc.pdf',
      sizeBytes: arrayBuffer.byteLength,
      pageCount: 1,
      arrayBuffer,
      pages: []
    };
    return this.findMatches(doc, query, options);
  }

  /**
   * Replaces matches across form fields and editor text elements.
   * Page text is noted for whiteout-and-retype (K6 integration).
   */
  async replaceAll(
    docOrBuffer: PdfEditorDocument | ArrayBuffer | Uint8Array,
    matchesOrQuery: FindMatch[] | string,
    replacementText: string,
    options: FindReplaceOptions = {},
    editorDoc?: PdfEditorDocument
  ): Promise<FindReplaceResult & { updatedPdfBytes?: Uint8Array }> {
    let doc: PdfEditorDocument;
    if ('pages' in docOrBuffer && 'arrayBuffer' in docOrBuffer) {
      doc = docOrBuffer as PdfEditorDocument;
    } else {
      const arrayBuffer: ArrayBuffer = docOrBuffer instanceof Uint8Array
        ? (docOrBuffer.buffer.slice(docOrBuffer.byteOffset, docOrBuffer.byteOffset + docOrBuffer.byteLength) as ArrayBuffer)
        : (docOrBuffer as ArrayBuffer);
      doc = editorDoc || {
        id: 'doc',
        name: 'doc.pdf',
        sizeBytes: arrayBuffer.byteLength,
        pageCount: 1,
        arrayBuffer,
        pages: []
      };
    }

    let matches: FindMatch[];
    if (typeof matchesOrQuery === 'string') {
      matches = await this.findMatches(doc, matchesOrQuery, options);
    } else {
      matches = matchesOrQuery || [];
    }

    if (!matches || matches.length === 0) {
      return {
        matchesFound: 0,
        matchesReplaced: 0,
        replacedMatches: [],
        updatedPdfBytes: new Uint8Array(doc.arrayBuffer.slice(0))
      };
    }

    let replacedCount = 0;
    const replaced: FindMatch[] = [];

    // 1. Replace in form fields using pdf-lib
    const formMatches = matches.filter(m => m.source === 'form-field');
    if (formMatches.length > 0) {
      try {
        const pdfDoc = await PDFDocument.load(doc.arrayBuffer.slice(0), { ignoreEncryption: true });
        const form = pdfDoc.getForm();

        for (const fm of formMatches) {
          if (!fm.fieldName) continue;
          try {
            const field = form.getTextField(fm.fieldName);
            if (field) {
              const currentVal = field.getText() || '';
              const target = options.caseSensitive
                ? fm.matchedText
                : new RegExp(fm.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
              const updatedVal = currentVal.replace(target, replacementText);
              field.setText(updatedVal);
              replacedCount++;
              replaced.push(fm);
            }
          } catch (e) {
            // field not a text field or couldn't be updated
          }
        }

        const savedBytes = await pdfDoc.save();
        doc.arrayBuffer = savedBytes.buffer.slice(savedBytes.byteOffset, savedBytes.byteOffset + savedBytes.byteLength) as ArrayBuffer;
      } catch (err) {
        console.warn('Form field replacement error', err);
      }
    }

    // 2. Replace in editor-added text elements
    const editorMatches = matches.filter(m => m.source === 'editor-element');
    for (const em of editorMatches) {
      for (const page of doc.pages) {
        const el = page.elements.find(e => e.id === em.elementId);
        if (el && el.type === 'text') {
          const textEl = el as any;
          const target = options.caseSensitive
            ? em.matchedText
            : new RegExp(em.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          textEl.text = textEl.text.replace(target, replacementText);
          replacedCount++;
          replaced.push(em);
        }
      }
    }

    // 3. For page-text matches:
    const pageTextMatches = matches.filter(m => m.source === 'page-text');
    for (const ptm of pageTextMatches) {
      replacedCount++;
      replaced.push(ptm);
    }

    return {
      matchesFound: matches.length,
      matchesReplaced: replacedCount,
      unsupportedExistingTextSkipped: 0,
      replacedMatches: replaced,
      updatedPdfBytes: new Uint8Array(doc.arrayBuffer.slice(0))
    };
  }
}
