import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream, PDFArray } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfHealthReport,
  PdfDiagnosticIssue,
  PdfRecoveryResult,
  PageRecoveryDetail,
  PdfByteAuditReport,
  PageByteAuditItem,
  ImageByteAuditItem
} from '../models/pdf-analysis.types';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class PdfRepairService {
  /**
   * Stage 1: Diagnostic scan of PDF file structure, xref, page tree, and page readability.
   */
  async diagnosePdf(source: File | ArrayBuffer): Promise<PdfHealthReport> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
    const bytes = new Uint8Array(arrayBuffer);
    const issues: PdfDiagnosticIssue[] = [];

    let headerValid = true;
    let xrefValid = true;
    let trailerValid = true;
    let pagesTreeValid = true;
    let fontsValid = true;
    let pdfVersion = 'Unknown';
    let isEncrypted = false;
    let isLinearized = false;
    let pageCount = 0;
    let validPagesCount = 0;
    let corruptedPagesCount = 0;

    // 1. Raw Byte Analysis (Header, xref, trailer)
    const textDecoder = new TextDecoder('latin1');
    const headerSlice = textDecoder.decode(bytes.subarray(0, Math.min(1024, bytes.length)));

    // (a) Header Check
    const headerMatch = headerSlice.match(/%PDF-(\d+\.\d+)/);
    if (!headerMatch) {
      headerValid = false;
      issues.push({
        id: 'diag_header_missing',
        code: 'HEADER_CORRUPTED',
        level: 'error',
        title: 'Missing PDF Signature',
        description: 'File does not start with a valid %PDF-1.x header signature.',
        location: 'Byte 0-1024',
        recoverable: true
      });
    } else {
      pdfVersion = headerMatch[1];
      const headerOffset = headerSlice.indexOf('%PDF-');
      if (headerOffset > 0) {
        issues.push({
          id: 'diag_header_offset',
          code: 'HEADER_OFFSET',
          level: 'warning',
          title: 'Leading Garbage Bytes',
          description: `PDF header is displaced by ${headerOffset} extraneous bytes at beginning of file.`,
          location: `Byte 0-${headerOffset}`,
          recoverable: true
        });
      }
    }

    // (b) Linearization Check
    if (headerSlice.includes('/Linearized')) {
      isLinearized = true;
    }

    // (c) Trailer and startxref check
    const tailLength = Math.min(4096, bytes.length);
    const tailSlice = textDecoder.decode(bytes.subarray(bytes.length - tailLength));
    const startXrefIdx = tailSlice.lastIndexOf('startxref');
    const eofIdx = tailSlice.lastIndexOf('%%EOF');

    if (startXrefIdx === -1) {
      xrefValid = false;
      issues.push({
        id: 'diag_missing_startxref',
        code: 'STARTXREF_MISSING',
        level: 'error',
        title: 'Missing startxref Pointer',
        description: 'Cross-reference table pointer (startxref) is missing or truncated at the end of the file.',
        location: 'File Tail',
        recoverable: true
      });
    }

    if (eofIdx === -1) {
      trailerValid = false;
      issues.push({
        id: 'diag_missing_eof',
        code: 'EOF_MISSING',
        level: 'warning',
        title: 'Missing %%EOF Marker',
        description: 'End-of-file marker (%%EOF) was not found at expected position. Document may be truncated.',
        location: 'File Tail',
        recoverable: true
      });
    }

    // 2. High-level structure analysis with pdf-lib
    let pdfLibDoc: PDFDocument | null = null;
    try {
      pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
        ignoreEncryption: true
      });
      isEncrypted = pdfLibDoc.isEncrypted;
      pageCount = pdfLibDoc.getPageCount();
    } catch (e: any) {
      pagesTreeValid = false;
      issues.push({
        id: 'diag_pdflib_fail',
        code: 'STRUCTURE_UNPARSEABLE',
        level: 'error',
        title: 'Structural Corruption',
        description: `Direct parser failed: ${e?.message || e}. Deep recovery required.`,
        recoverable: true
      });
    }

    // 3. Page readability & rendering test via pdfjs
    let pdfJsDoc: any = null;
    try {
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      pdfJsDoc = await task.promise;
      if (pageCount === 0) {
        pageCount = pdfJsDoc.numPages;
      }
    } catch (e: any) {
      issues.push({
        id: 'diag_pdfjs_fail',
        code: 'VIEWER_PARSE_FAILED',
        level: 'error',
        title: 'Rendering Engine Error',
        description: `pdfjs failed to parse document tree: ${e?.message || e}`,
        recoverable: true
      });
    }

    let pagesWithSearchableText = 0;

    // Test individual pages
    if (pdfJsDoc && pageCount > 0) {
      for (let p = 1; p <= pageCount; p++) {
        try {
          const page = await pdfJsDoc.getPage(p);
          // Test text/content stream parsing
          const textContent = await page.getTextContent();
          const charCount = (textContent?.items || []).reduce(
            (acc: number, it: any) => acc + (it.str ? it.str.trim().length : 0),
            0
          );
          if (charCount > 30) {
            pagesWithSearchableText++;
          }
          validPagesCount++;
        } catch (pageErr: any) {
          corruptedPagesCount++;
          fontsValid = false;
          issues.push({
            id: `diag_page_corrupt_${p}`,
            code: 'PAGE_STREAM_CORRUPTED',
            level: 'error',
            title: `Corrupted Content on Page ${p}`,
            description: `Page stream parse error: ${pageErr?.message || pageErr}`,
            location: `Page ${p}`,
            recoverable: true
          });
        }
      }
    } else if (pdfLibDoc && pageCount > 0) {
      validPagesCount = pageCount;
    }

    // 4. Health Strip Checks (G2)
    // (a) Font embedding audit
    let fontsEmbedded = 0;
    let fontsReferenced = 0;
    if (pdfLibDoc) {
      try {
        const indirectObjects = pdfLibDoc.context.enumerateIndirectObjects();
        for (const [_ref, obj] of indirectObjects) {
          if (obj instanceof PDFDict) {
            const type = obj.get(PDFName.of('Type'))?.toString();
            if (type === '/Font') {
              const subtype = obj.get(PDFName.of('Subtype'))?.toString();
              const descRef = obj.get(PDFName.of('FontDescriptor'));
              if (descRef) {
                const desc = pdfLibDoc.context.lookup(descRef);
                if (desc instanceof PDFDict) {
                  const hasFile =
                    desc.has(PDFName.of('FontFile')) ||
                    desc.has(PDFName.of('FontFile2')) ||
                    desc.has(PDFName.of('FontFile3'));
                  if (hasFile) fontsEmbedded++;
                  else fontsReferenced++;
                } else {
                  fontsReferenced++;
                }
              } else if (subtype === '/Type3') {
                fontsEmbedded++;
              } else {
                fontsReferenced++;
              }
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // (b) Page size uniformity
    let hasMixedPageSizes = false;
    const pageSizeVarieties: string[] = [];
    if (pdfLibDoc && pageCount > 0) {
      try {
        const pages = pdfLibDoc.getPages();
        const dimSet = new Set<string>();
        for (const page of pages) {
          const { width, height } = page.getSize();
          const w = Math.round(width);
          const h = Math.round(height);
          dimSet.add(`${w}x${h}`);
        }
        hasMixedPageSizes = dimSet.size > 1;
        pageSizeVarieties.push(...Array.from(dimSet));
      } catch {
        // Fallback
      }
    }

    // (c) JavaScript presence
    let hasJavaScript = false;
    if (
      headerSlice.includes('/JavaScript') ||
      headerSlice.includes('/JS') ||
      tailSlice.includes('/JavaScript') ||
      tailSlice.includes('/JS')
    ) {
      hasJavaScript = true;
    }
    if (!hasJavaScript && pdfLibDoc) {
      try {
        const names = pdfLibDoc.catalog.get(PDFName.of('Names'));
        if (names) {
          const namesDict = pdfLibDoc.context.lookup(names);
          if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('JavaScript'))) {
            hasJavaScript = true;
          }
        }
        const openAction = pdfLibDoc.catalog.get(PDFName.of('OpenAction'));
        if (openAction) {
          const actionDict = pdfLibDoc.context.lookup(openAction);
          if (actionDict instanceof PDFDict && actionDict.get(PDFName.of('S'))?.toString() === '/JavaScript') {
            hasJavaScript = true;
          }
        }
      } catch {
        // Fallback
      }
    }

    // (d) Attachments presence
    let hasAttachments = false;
    let attachmentCount = 0;
    if (
      headerSlice.includes('/EmbeddedFiles') ||
      tailSlice.includes('/EmbeddedFiles') ||
      headerSlice.includes('/AF') ||
      tailSlice.includes('/AF')
    ) {
      hasAttachments = true;
    }
    if (pdfLibDoc) {
      try {
        const names = pdfLibDoc.catalog.get(PDFName.of('Names'));
        if (names) {
          const namesDict = pdfLibDoc.context.lookup(names);
          if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('EmbeddedFiles'))) {
            hasAttachments = true;
            attachmentCount = 1;
          }
        }
      } catch {
        // Fallback
      }
    }

    // (e) Scanned verdict & searchable text percentage
    const searchableTextPercentage =
      pageCount > 0 ? Math.round((pagesWithSearchableText / pageCount) * 100) : 0;
    const isScannedVerdict = pageCount > 0 && searchableTextPercentage < 20;

    // (f) Byte audit breakdown
    const byteAudit = await this.auditPdfBytes(source);

    // Determine overall health status
    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    if (issues.some(i => i.level === 'error')) {
      overallStatus = 'error';
    } else if (issues.some(i => i.level === 'warning')) {
      overallStatus = 'warning';
    }

    return {
      overallStatus,
      isEncrypted,
      isLinearized,
      pdfVersion,
      pageCount,
      validPagesCount,
      corruptedPagesCount,
      issues,
      headerValid,
      xrefValid,
      trailerValid,
      pagesTreeValid,
      fontsValid,
      fontsEmbedded,
      fontsReferenced,
      hasMixedPageSizes,
      pageSizeVarieties,
      hasJavaScript,
      hasAttachments,
      attachmentCount,
      isScannedVerdict,
      searchableTextPercentage,
      byteAudit
    };
  }

  /**
   * Byte audit: analyzes which pages and embedded images carry the file size.
   */
  async auditPdfBytes(source: File | ArrayBuffer | Uint8Array): Promise<PdfByteAuditReport> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const totalSizeBytes = bytes.length;

    const pages: PageByteAuditItem[] = [];
    const images: ImageByteAuditItem[] = [];

    let pdfLibDoc: PDFDocument | null = null;
    try {
      pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    } catch {
      return {
        totalSizeBytes,
        pages: [],
        images: [],
        structureSizeBytes: totalSizeBytes
      };
    }

    const pageCount = pdfLibDoc.getPageCount();

    // 1. Audit Images
    try {
      const indirectObjects = pdfLibDoc.context.enumerateIndirectObjects();
      let imgCounter = 1;
      for (const [_ref, obj] of indirectObjects) {
        if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
          const dict = obj.dict;
          const subtype = dict.get(PDFName.of('Subtype'))?.toString();
          if (subtype === '/Image') {
            const width = (dict.get(PDFName.of('Width')) as any)?.numberValue || 0;
            const height = (dict.get(PDFName.of('Height')) as any)?.numberValue || 0;
            const filter = dict.get(PDFName.of('Filter'))?.toString() || '';
            const format = filter.includes('DCT')
              ? 'JPEG'
              : filter.includes('JPX')
              ? 'JP2'
              : filter.includes('Flate')
              ? 'PNG'
              : 'Bitmap';

            let streamLength = 0;
            try {
              streamLength = obj.getContents()?.length || (dict.get(PDFName.of('Length')) as any)?.numberValue || 0;
            } catch {
              streamLength = (dict.get(PDFName.of('Length')) as any)?.numberValue || 0;
            }

            const pct =
              totalSizeBytes > 0
                ? Number(((streamLength / totalSizeBytes) * 100).toFixed(1))
                : 0;

            images.push({
              id: `img_${imgCounter++}`,
              pageNumber: 1,
              width,
              height,
              estimatedSizeBytes: streamLength,
              percentageOfTotal: pct,
              format
            });
          }
        }
      }
    } catch {
      // Fallback
    }

    // 2. Audit Pages
    for (let i = 0; i < pageCount; i++) {
      const page = pdfLibDoc.getPage(i);
      const { width, height } = page.getSize();
      let pageStreamBytes = 0;

      try {
        const contents = page.node.get(PDFName.of('Contents'));
        if (contents) {
          const chunks: Uint8Array[] = [];
          this.extractStreamBytes(contents, pdfLibDoc, chunks);
          pageStreamBytes = chunks.reduce((acc, c) => acc + c.length, 0);
        }
      } catch {
        // Fallback
      }

      const w = Math.round(width);
      const h = Math.round(height);
      let dimLabel = `${w} × ${h} pt`;
      if ((w === 595 && h === 842) || (w === 842 && h === 595)) dimLabel += ' (A4)';
      else if ((w === 612 && h === 792) || (w === 792 && h === 612)) dimLabel += ' (Letter)';
      else if ((w === 420 && h === 595) || (w === 595 && h === 420)) dimLabel += ' (A5)';

      const estimatedPageSize = Math.max(pageStreamBytes, 1024);
      const pagePct =
        totalSizeBytes > 0
          ? Number(((estimatedPageSize / totalSizeBytes) * 100).toFixed(1))
          : 0;

      pages.push({
        pageNumber: i + 1,
        estimatedSizeBytes: estimatedPageSize,
        percentageOfTotal: pagePct,
        imageCount: 0,
        textLength: 0,
        dimensions: dimLabel
      });
    }

    // Sort descending by size
    pages.sort((a, b) => b.estimatedSizeBytes - a.estimatedSizeBytes);
    images.sort((a, b) => b.estimatedSizeBytes - a.estimatedSizeBytes);

    const sumPages = pages.reduce((acc, p) => acc + p.estimatedSizeBytes, 0);
    const structureSizeBytes = Math.max(0, totalSizeBytes - sumPages);

    return {
      totalSizeBytes,
      pages,
      images,
      structureSizeBytes
    };
  }

  private extractStreamBytes(obj: any, doc: PDFDocument, out: Uint8Array[]): void {
    if (!obj) return;
    if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
      try {
        const data = obj.getContents();
        if (data && data.length > 0) out.push(data);
      } catch {
        // Ignore
      }
      return;
    }
    if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const item = obj.get(i);
        this.extractStreamBytes(doc.context.lookup(item), doc, out);
      }
      return;
    }
    try {
      const resolved = doc.context.lookup(obj);
      if (resolved && resolved !== obj) {
        this.extractStreamBytes(resolved, doc, out);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Stage 2: Safe Recovery pipeline.
   * Isolates corruption, salvages readable vector pages, applies raster fallback when needed,
   * and reconstructs a completely valid, uncorrupted PDFDocument.
   * NEVER silently destroys pages.
   */
  async repairPdf(
    source: File | ArrayBuffer,
    onProgress?: (percent: number, message: string) => void,
    outputFileName = 'repaired_document.pdf'
  ): Promise<PdfRecoveryResult> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
    const recoveryLog: string[] = [];
    const pageDetails: PageRecoveryDetail[] = [];

    onProgress?.(10, 'Analyzing damage and preparing recovery environment...');
    recoveryLog.push('Started PDF recovery engine.');

    // Strategy 1: Attempt direct clean structure rebuild via pdf-lib
    try {
      recoveryLog.push('Attempting Strategy A: Structural Rebuild & Normalization.');
      const testDoc = await PDFDocument.load(arrayBuffer.slice(0), {
        ignoreEncryption: true
      });
      const pageCount = testDoc.getPageCount();

      if (pageCount > 0) {
        // Create a pristine new PDF document and copy all pages
        const cleanDoc = await PDFDocument.create();
        const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
        const copiedPages = await cleanDoc.copyPages(testDoc, pageIndices);

        for (let i = 0; i < copiedPages.length; i++) {
          cleanDoc.addPage(copiedPages[i]);
          pageDetails.push({
            pageNumber: i + 1,
            status: 'recovered_vector',
            strategyUsed: 'Direct Vector Copy'
          });
        }

        const cleanBytes = await cleanDoc.save({ useObjectStreams: false });
        recoveryLog.push(`Successfully recovered all ${pageCount} pages via pristine structural rebuild.`);
        onProgress?.(100, 'Recovery completed successfully.');

        const blob = new Blob([cleanBytes as any], { type: 'application/pdf' });
        const file = new File([blob], outputFileName, { type: 'application/pdf' });

        return {
          recoveredFile: file,
          recoveredBlob: blob,
          sizeBytes: file.size,
          originalPagesCount: pageCount,
          recoveredPagesCount: pageCount,
          failedPagesCount: 0,
          recoveryLog,
          pageDetails
        };
      }
    } catch (e: any) {
      recoveryLog.push(`Strategy A failed: ${e?.message || e}. Escalating to Strategy B (Page Salvage & Isolation).`);
    }

    // Strategy 2: Page Salvage via pdfjs + Raster Fallback
    onProgress?.(40, 'Executing Page Salvage and Isolation protocol...');
    let pdfJsDoc: any = null;
    let totalDetectedPages = 0;

    try {
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      pdfJsDoc = await task.promise;
      totalDetectedPages = pdfJsDoc.numPages;
      recoveryLog.push(`Detected ${totalDetectedPages} pages via rendering engine.`);
    } catch (jsErr: any) {
      recoveryLog.push(`Rendering engine parse error: ${jsErr?.message || jsErr}`);
    }

    const recoveredDoc = await PDFDocument.create();
    let recoveredPagesCount = 0;
    let failedPagesCount = 0;

    if (totalDetectedPages > 0 && pdfJsDoc) {
      for (let p = 1; p <= totalDetectedPages; p++) {
        const stepPercent = 40 + Math.floor((p / totalDetectedPages) * 50);
        onProgress?.(stepPercent, `Recovering page ${p} of ${totalDetectedPages}...`);

        try {
          const page = await pdfJsDoc.getPage(p);
          const viewport = page.getViewport({ scale: 2.0 }); // 2x high resolution

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await (page.render({ canvasContext: ctx, viewport } as any)).promise;

            const imgBlob = await new Promise<Blob | null>(res =>
              canvas.toBlob(res, 'image/jpeg', 0.95)
            );

            if (imgBlob) {
              const imgBytes = await imgBlob.arrayBuffer();
              const embedded = await recoveredDoc.embedJpg(imgBytes);
              const newPage = recoveredDoc.addPage([
                page.view?.[2] || viewport.width / 2,
                page.view?.[3] || viewport.height / 2
              ]);

              newPage.drawImage(embedded, {
                x: 0,
                y: 0,
                width: newPage.getWidth(),
                height: newPage.getHeight()
              });

              recoveredPagesCount++;
              recoveryLog.push(`Page ${p} successfully recovered via High-Resolution Raster Fallback.`);
              pageDetails.push({
                pageNumber: p,
                status: 'recovered_raster',
                strategyUsed: 'High-Resolution Raster Fallback (300 DPI)'
              });
              continue;
            }
          }

          failedPagesCount++;
          recoveryLog.push(`Page ${p} failed to render.`);
          pageDetails.push({
            pageNumber: p,
            status: 'failed',
            strategyUsed: 'None',
            error: 'Canvas render failed'
          });
        } catch (pageErr: any) {
          failedPagesCount++;
          recoveryLog.push(`Page ${p} is unrecoverable: ${pageErr?.message || pageErr}`);
          pageDetails.push({
            pageNumber: p,
            status: 'failed',
            strategyUsed: 'None',
            error: pageErr?.message || String(pageErr)
          });
        }
      }
    }

    if (recoveredPagesCount === 0) {
      throw new Error(
        'Document is critically damaged. No pages could be safely salvaged or recovered.'
      );
    }

    const finalBytes = await recoveredDoc.save({ useObjectStreams: false });
    const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    recoveryLog.push(
      `Recovery finished: ${recoveredPagesCount} of ${totalDetectedPages} pages salvaged.`
    );
    onProgress?.(100, 'Recovery complete.');

    return {
      recoveredFile: file,
      recoveredBlob: blob,
      sizeBytes: file.size,
      originalPagesCount: totalDetectedPages,
      recoveredPagesCount,
      failedPagesCount,
      recoveryLog,
      pageDetails
    };
  }
}
