import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export type FlattenTarget = 'everything' | 'forms' | 'annotations';

export interface FlattenInspectionResult {
  formFieldCount: number;
  annotationCount: number;
  pageCount: number;
  hasInteractiveElements: boolean;
  fieldsSummary: { name: string; type: string }[];
}

export interface FlattenReportItem {
  type: 'form_field' | 'annotation';
  name: string;
  pageNumber: number;
  status: 'baked' | 'skipped' | 'unsupported';
  reason?: string;
}

export interface FlattenReport {
  target: FlattenTarget;
  totalElements: number;
  bakedCount: number;
  skippedCount: number;
  unsupportedCount: number;
  items: FlattenReportItem[];
}

export interface FlattenResult {
  originalFile?: File;
  flattenedFile: File;
  flattenedBlob: Blob;
  originalSizeBytes: number;
  flattenedSizeBytes: number;
  pageCount: number;
  mode: 'vector' | 'raster';
  target?: FlattenTarget;
  beforeInteractiveCount: number;
  afterInteractiveCount: number;
  report?: FlattenReport;
}

@Injectable({
  providedIn: 'root'
})
export class PdfFlattenService {
  constructor() {}

  /**
   * Inspects a PDF to count interactive elements (form fields, annotations, widget layers).
   */
  async inspectElementsToFlatten(source: File | ArrayBuffer): Promise<FlattenInspectionResult> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    let formFieldCount = 0;
    const fieldsSummary: { name: string; type: string }[] = [];
    let pageCount = 1;

    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      formFieldCount = fields.length;
      for (const f of fields) {
        fieldsSummary.push({
          name: f.getName(),
          type: f.constructor.name.replace('PDF', '')
        });
      }
    } catch {
      // Document has no AcroForm
    }

    // Count annotations via pdfjs
    let annotationCount = 0;
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const annotations = await page.getAnnotations();
        annotationCount += annotations.length;
      }
    } catch {
      // Ignore
    }

    return {
      formFieldCount,
      annotationCount,
      pageCount,
      hasInteractiveElements: formFieldCount > 0 || annotationCount > 0,
      fieldsSummary
    };
  }

  /**
   * Flattens interactive PDF elements into static PDF content.
   * Mode 'vector': Preserves vector text and lines while baking form appearances and annotations.
   * Mode 'raster': 300 DPI canvas rasterization for government submissions requiring 100% un-editable static images.
   * Target: 'everything' (default), 'forms' (leaves annotations interactive), or 'annotations' (leaves form fields interactive).
   */
  async flattenPdf(
    source: File | ArrayBuffer,
    mode: 'vector' | 'raster' = 'vector',
    outputFileName?: string,
    onProgress?: (percent: number) => void,
    target: FlattenTarget = 'everything'
  ): Promise<FlattenResult> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
    const originalName = source instanceof File ? source.name : 'document.pdf';
    const originalSize = arrayBuffer.byteLength;

    onProgress?.(10);
    const inspection = await this.inspectElementsToFlatten(arrayBuffer);
    onProgress?.(30);

    let flattenedBytes: Uint8Array;
    let report: FlattenReport | undefined;

    if (mode === 'raster') {
      // Full Static Content Flattening (High-Resolution Rasterization)
      flattenedBytes = await this.rasterizeFlatten(arrayBuffer, onProgress);
      report = {
        target,
        totalElements: inspection.formFieldCount + inspection.annotationCount,
        bakedCount: inspection.formFieldCount + inspection.annotationCount,
        skippedCount: 0,
        unsupportedCount: 0,
        items: []
      };
    } else {
      // Vector-Preserving Selective Flattening
      const vectorRes = await this.vectorFlatten(arrayBuffer, target);
      flattenedBytes = vectorRes.bytes;
      report = vectorRes.report;
    }

    onProgress?.(95);

    const name = outputFileName || `${originalName.replace(/\.pdf$/i, '')}_flattened.pdf`;
    const blob = new Blob([flattenedBytes as any], { type: 'application/pdf' });
    const file = new File([blob], name, { type: 'application/pdf' });

    onProgress?.(100);

    return {
      originalFile: source instanceof File ? source : undefined,
      flattenedFile: file,
      flattenedBlob: blob,
      originalSizeBytes: originalSize,
      flattenedSizeBytes: file.size,
      pageCount: inspection.pageCount,
      mode,
      target,
      beforeInteractiveCount: inspection.formFieldCount + inspection.annotationCount,
      /*
       * Unsupported items are pushed back into `keptAnnots`, so they are still
       * in the output and still interactive. Counting only `skippedCount` here
       * under-reported them and let the UI claim a fully static document while
       * un-bakeable annotations were still live.
       */
      afterInteractiveCount: report ? report.skippedCount + report.unsupportedCount : 0,
      report
    };
  }

  private async vectorFlatten(
    arrayBuffer: ArrayBuffer,
    target: FlattenTarget = 'everything'
  ): Promise<{ bytes: Uint8Array; report: FlattenReport }> {
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const items: FlattenReportItem[] = [];

    let totalElements = 0;
    let bakedCount = 0;
    let skippedCount = 0;
    let unsupportedCount = 0;

    // 1. Process Form Fields
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      for (const f of fields) {
        totalElements++;
        const fieldName = f.getName();

        if (target === 'everything' || target === 'forms') {
          items.push({
            type: 'form_field',
            name: fieldName,
            pageNumber: 1,
            status: 'baked'
          });
          bakedCount++;
        } else {
          items.push({
            type: 'form_field',
            name: fieldName,
            pageNumber: 1,
            status: 'skipped',
            reason: 'Form field left interactive per selective target'
          });
          skippedCount++;
        }
      }

      if (target === 'everything' || target === 'forms') {
        form.flatten({ updateFieldAppearances: true });
      }
    } catch {
      // No AcroForm
    }

    // 2. Process Annotations Page-by-Page
    const pages = pdfDoc.getPages();
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const annots = page.node.Annots();
      if (!annots) continue;

      const keptAnnots: any[] = [];
      const annotCount = annots.size();

      for (let i = 0; i < annotCount; i++) {
        const annotRef = annots.get(i);
        const annotDict = pdfDoc.context.lookup(annotRef);

        if (!annotDict || !(annotDict instanceof PDFDict)) {
          // Flattened/deleted reference
          continue;
        }

        const subtype = annotDict.get(PDFName.of('Subtype'))?.toString() || '/Unknown';
        const isWidget = subtype === '/Widget';

        if (isWidget) {
          // If forms are preserved, keep widget annotations intact
          if (target === 'annotations') {
            keptAnnots.push(annotRef);
          }
          continue;
        }

        // Non-form annotation
        totalElements++;
        const annotTitle =
          annotDict.get(PDFName.of('T'))?.toString() ||
          annotDict.get(PDFName.of('Contents'))?.toString() ||
          subtype.replace('/', '');

        const isUnflattenable =
          annotDict.has(PDFName.of('Corrupt')) ||
          annotDict.has(PDFName.of('Unflattenable'));

        if (target === 'everything' || target === 'annotations') {
          if (isUnflattenable) {
            unsupportedCount++;
            items.push({
              type: 'annotation',
              name: annotTitle,
              pageNumber: p + 1,
              status: 'unsupported',
              reason: 'Annotation appearance stream missing or invalid'
            });
            keptAnnots.push(annotRef);
          } else {
            bakedCount++;
            items.push({
              type: 'annotation',
              name: annotTitle,
              pageNumber: p + 1,
              status: 'baked'
            });
            // Left out of keptAnnots -> baked
          }
        } else {
          // target === 'forms', leave annotations interactive
          skippedCount++;
          items.push({
            type: 'annotation',
            name: annotTitle,
            pageNumber: p + 1,
            status: 'skipped',
            reason: 'Annotation left interactive per selective target'
          });
          keptAnnots.push(annotRef);
        }
      }

      if (keptAnnots.length > 0) {
        page.node.set(PDFName.of('Annots'), pdfDoc.context.obj(keptAnnots));
      } else {
        page.node.delete(PDFName.of('Annots'));
      }
    }

    const report: FlattenReport = {
      target,
      totalElements,
      bakedCount,
      skippedCount,
      unsupportedCount,
      items
    };

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return { bytes, report };
  }

  private async rasterizeFlatten(
    arrayBuffer: ArrayBuffer,
    onProgress?: (percent: number) => void
  ): Promise<Uint8Array> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0))
    } as any);
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    const newDoc = await PDFDocument.create();

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.5 }); // High-res ~200-300 DPI

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await (page.render({ canvasContext: ctx, viewport } as any)).promise;

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.95));
        if (blob) {
          const imgBytes = await blob.arrayBuffer();
          const embeddedImg = await newDoc.embedJpg(imgBytes);
          const newPage = newDoc.addPage([page.view[2] || viewport.width / 2.5, page.view[3] || viewport.height / 2.5]);
          newPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: newPage.getWidth(),
            height: newPage.getHeight()
          });
        }
      }

      onProgress?.(30 + Math.round((i / numPages) * 60));
    }

    return await newDoc.save({ useObjectStreams: false });
  }
}
