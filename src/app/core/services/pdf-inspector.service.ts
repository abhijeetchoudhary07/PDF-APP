import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFRawStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream
} from 'pdf-lib';
import {
  EmbeddedAttachment,
  EmbeddedJavaScriptAction,
  EmbeddedLinkAction,
  PdfInspectionReport
} from '../models/pdf-inspector.types';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class PdfInspectorService {
  private readonly storage = inject(StorageService);

  /**
   * Inspects the internal objects, attachments, JavaScript actions,
   * and link targets in a PDF document.
   */
  async inspectDocument(
    source: File | ArrayBuffer | Uint8Array,
    fileNameOverride?: string
  ): Promise<PdfInspectionReport> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const fileName = fileNameOverride || (source instanceof File ? source.name : 'inspected.pdf');

    const attachments: EmbeddedAttachment[] = [];
    const javaScriptActions: EmbeddedJavaScriptAction[] = [];
    const linkActions: EmbeddedLinkAction[] = [];

    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pageCount = pdfDoc.getPageCount();
    const catalog = pdfDoc.catalog;

    // 1. Inspect Embedded Attachments
    this.extractAttachmentsFromCatalog(catalog, pdfDoc, attachments);

    // 2. Inspect Catalog JavaScript (/OpenAction & /Names/JavaScript)
    this.extractCatalogJavaScript(catalog, pdfDoc, javaScriptActions);

    // 3. Inspect Page Annotations for Links, Launch actions & Scripts
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      this.extractPageActions(page, i + 1, pdfDoc, javaScriptActions, linkActions);
    }

    const hasSuspiciousActions =
      javaScriptActions.length > 0 ||
      linkActions.some(l => l.type === 'Launch');

    return {
      fileName,
      fileSizeBytes: bytes.length,
      pageCount,
      pdfVersion: '1.7',
      attachments,
      javaScriptActions,
      linkActions,
      hasSuspiciousActions
    };
  }

  // --- Attachments Inspection Helpers ---

  private extractAttachmentsFromCatalog(catalog: PDFDict, doc: PDFDocument, out: EmbeddedAttachment[]): void {
    try {
      const namesRef = catalog.get(PDFName.of('Names'));
      if (namesRef) {
        const namesDict = doc.context.lookup(namesRef);
        if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('EmbeddedFiles'))) {
          const efRef = namesDict.get(PDFName.of('EmbeddedFiles'));
          const efTree = doc.context.lookup(efRef);
          if (efTree instanceof PDFDict) {
            this.traverseNameTree(efTree, doc, out);
          }
        }
      }

      // Also check /AF (Associated Files)
      if (catalog.has(PDFName.of('AF'))) {
        const afRef = catalog.get(PDFName.of('AF'));
        const afArray = doc.context.lookup(afRef);
        if (afArray instanceof PDFArray) {
          for (let i = 0; i < afArray.size(); i++) {
            const fsDict = doc.context.lookup(afArray.get(i));
            if (fsDict instanceof PDFDict) {
              this.parseFileSpec(fsDict, doc, out);
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  private traverseNameTree(treeDict: PDFDict, doc: PDFDocument, out: EmbeddedAttachment[]): void {
    if (treeDict.has(PDFName.of('Names'))) {
      const namesArray = doc.context.lookup(treeDict.get(PDFName.of('Names')));
      if (namesArray instanceof PDFArray) {
        // Names array is: [key1, value1, key2, value2, ...]
        for (let i = 0; i < namesArray.size(); i += 2) {
          const valRef = namesArray.get(i + 1);
          const valDict = doc.context.lookup(valRef);
          if (valDict instanceof PDFDict) {
            this.parseFileSpec(valDict, doc, out);
          }
        }
      }
    }

    if (treeDict.has(PDFName.of('Kids'))) {
      const kids = doc.context.lookup(treeDict.get(PDFName.of('Kids')));
      if (kids instanceof PDFArray) {
        for (let i = 0; i < kids.size(); i++) {
          const kid = doc.context.lookup(kids.get(i));
          if (kid instanceof PDFDict) {
            this.traverseNameTree(kid, doc, out);
          }
        }
      }
    }
  }

  private parseFileSpec(fsDict: PDFDict, doc: PDFDocument, out: EmbeddedAttachment[]): void {
    const fObj = fsDict.get(PDFName.of('UF')) || fsDict.get(PDFName.of('F'));
    const name = this.decodeString(fObj) || `attachment_${out.length + 1}`;
    const desc = this.decodeString(fsDict.get(PDFName.of('Desc')));

    let data = new Uint8Array(0);
    let mimeType = 'application/octet-stream';

    const ef = fsDict.get(PDFName.of('EF'));
    if (ef) {
      const efDict = doc.context.lookup(ef);
      if (efDict instanceof PDFDict) {
        const streamRef = efDict.get(PDFName.of('F')) || efDict.get(PDFName.of('UF'));
        if (streamRef) {
          const stream = doc.context.lookup(streamRef);
          if (stream instanceof PDFStream || stream instanceof PDFRawStream) {
            try {
              const filter = stream.dict.get(PDFName.of('Filter'))?.toString();
              if (filter === '/FlateDecode') {
                const decoded = decodePDFRawStream(stream as any);
                data = new Uint8Array((decoded as any).getBytes());
              } else {
                data = new Uint8Array(stream.getContents());
              }
              const sub = stream.dict.get(PDFName.of('Subtype'))?.toString();
              if (sub) mimeType = sub.replace(/^\//, '');
            } catch {
              data = new Uint8Array(stream.getContents());
            }
          }
        }
      }
    }

    // Prevent duplicate entries
    if (!out.some(a => a.name === name && a.sizeBytes === data.length)) {
      out.push({
        id: `att_${out.length + 1}_${name}`,
        name,
        sizeBytes: data.length,
        mimeType,
        description: desc,
        data
      });
    }
  }

  // --- JavaScript Inspection Helpers ---

  private extractCatalogJavaScript(catalog: PDFDict, doc: PDFDocument, out: EmbeddedJavaScriptAction[]): void {
    try {
      // 1. /OpenAction
      if (catalog.has(PDFName.of('OpenAction'))) {
        const actionRef = catalog.get(PDFName.of('OpenAction'));
        const actionDict = doc.context.lookup(actionRef);
        if (actionDict instanceof PDFDict) {
          const s = actionDict.get(PDFName.of('S'))?.toString();
          if (s === '/JavaScript') {
            const jsStr = this.decodeJsCode(actionDict.get(PDFName.of('JS')), doc);
            if (jsStr) {
              out.push({
                id: 'js_openaction',
                source: '/OpenAction',
                name: 'Document Open Trigger',
                code: jsStr
              });
            }
          }
        }
      }

      // 2. /Names -> /JavaScript
      if (catalog.has(PDFName.of('Names'))) {
        const namesDict = doc.context.lookup(catalog.get(PDFName.of('Names')));
        if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('JavaScript'))) {
          const jsTree = doc.context.lookup(namesDict.get(PDFName.of('JavaScript')));
          if (jsTree instanceof PDFDict) {
            const namesArray = doc.context.lookup(jsTree.get(PDFName.of('Names')));
            if (namesArray instanceof PDFArray) {
              for (let i = 0; i < namesArray.size(); i += 2) {
                const scriptName = this.decodeString(namesArray.get(i)) || `Script_${i / 2 + 1}`;
                const scriptAction = doc.context.lookup(namesArray.get(i + 1));
                if (scriptAction instanceof PDFDict) {
                  const code = this.decodeJsCode(scriptAction.get(PDFName.of('JS')), doc);
                  if (code) {
                    out.push({
                      id: `js_named_${i / 2 + 1}`,
                      source: '/Names/JavaScript',
                      name: scriptName,
                      code
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  private extractPageActions(
    page: any,
    pageNumber: number,
    doc: PDFDocument,
    outJs: EmbeddedJavaScriptAction[],
    outLinks: EmbeddedLinkAction[]
  ): void {
    try {
      const annotsRef = page.node.get(PDFName.of('Annots'));
      if (!annotsRef) return;
      const annots = doc.context.lookup(annotsRef);
      if (!(annots instanceof PDFArray)) return;

      for (let i = 0; i < annots.size(); i++) {
        const annot = doc.context.lookup(annots.get(i));
        if (!(annot instanceof PDFDict)) continue;

        const actionRef = annot.get(PDFName.of('A'));
        if (!actionRef) continue;
        const action = doc.context.lookup(actionRef);
        if (!(action instanceof PDFDict)) continue;

        const s = action.get(PDFName.of('S'))?.toString();

        if (s === '/JavaScript') {
          const code = this.decodeJsCode(action.get(PDFName.of('JS')), doc);
          if (code) {
            outJs.push({
              id: `js_p${pageNumber}_${i}`,
              source: 'Annotation',
              name: `Page ${pageNumber} Action`,
              code,
              pageNumber
            });
          }
        } else if (s === '/URI') {
          const uri = this.decodeString(action.get(PDFName.of('URI'))) || '';
          if (uri) {
            outLinks.push({
              id: `link_p${pageNumber}_${i}`,
              type: 'URI',
              target: uri,
              pageNumber
            });
          }
        } else if (s === '/Launch') {
          const file = action.get(PDFName.of('F'))?.toString() || 'External Program';
          outLinks.push({
            id: `launch_p${pageNumber}_${i}`,
            type: 'Launch',
            target: file,
            pageNumber
          });
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  private decodeJsCode(obj: any, doc: PDFDocument): string {
    if (!obj) return '';
    const resolved = doc.context.lookup(obj);
    if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
      return resolved.decodeText();
    }
    if (resolved instanceof PDFStream || resolved instanceof PDFRawStream) {
      try {
        return new TextDecoder().decode(resolved.getContents());
      } catch {
        return '';
      }
    }
    return resolved?.toString() || '';
  }

  private decodeString(obj: any): string {
    if (!obj) return '';
    if (obj instanceof PDFString || obj instanceof PDFHexString) {
      return obj.decodeText();
    }
    return obj.toString().replace(/^[/()]/, '').replace(/[)]$/, '');
  }

  // --- Deletion Actions ---

  /**
   * Deletes an embedded attachment by name and regenerates document bytes.
   */
  async deleteAttachment(source: File | ArrayBuffer | Uint8Array, attachmentId: string): Promise<Uint8Array> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const doc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });

    // Look for matching attachment in EmbeddedFiles name tree or AF
    const namesRef = doc.catalog.get(PDFName.of('Names'));
    if (namesRef) {
      const namesDict = doc.context.lookup(namesRef);
      if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('EmbeddedFiles'))) {
        namesDict.delete(PDFName.of('EmbeddedFiles'));
      }
    }
    if (doc.catalog.has(PDFName.of('AF'))) {
      doc.catalog.delete(PDFName.of('AF'));
    }

    return await doc.save();
  }

  /**
   * Deletes JavaScript actions (/OpenAction, /Names/JavaScript, /AA) and regenerates document bytes.
   */
  async deleteJavaScriptAction(source: File | ArrayBuffer | Uint8Array, _actionId: string): Promise<Uint8Array> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const doc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });

    if (doc.catalog.has(PDFName.of('OpenAction'))) {
      doc.catalog.delete(PDFName.of('OpenAction'));
    }
    if (doc.catalog.has(PDFName.of('AA'))) {
      doc.catalog.delete(PDFName.of('AA'));
    }
    if (doc.catalog.has(PDFName.of('Names'))) {
      const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')));
      if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
        names.delete(PDFName.of('JavaScript'));
      }
    }

    return await doc.save();
  }

  async saveInspectedPdf(bytes: Uint8Array, fileName: string): Promise<string | undefined> {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const file = new File([blob], fileName, { type: 'application/pdf' });
    return await this.storage.saveFile(file, 'inspected_clean');
  }
}
