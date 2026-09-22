import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfHealthReport,
  PdfDiagnosticIssue,
  PdfRecoveryResult,
  PageRecoveryDetail
} from '../models/pdf-analysis.types';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

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

    // Test individual pages
    if (pdfJsDoc && pageCount > 0) {
      for (let p = 1; p <= pageCount; p++) {
        try {
          const page = await pdfJsDoc.getPage(p);
          // Test text/content stream parsing
          await page.getTextContent();
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
      fontsValid
    };
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
