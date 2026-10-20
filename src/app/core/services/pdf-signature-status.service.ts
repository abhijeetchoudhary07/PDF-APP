import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';
import {
  DocumentSignatureReport,
  SignatureFieldReport
} from '../models/pdf-signature-status.types';

@Injectable({
  providedIn: 'root'
})
export class PdfSignatureStatusService {
  /**
   * Evaluates signatures present in a document, reporting structure,
   * claimed metadata, and byte-range coverage.
   *
   * STRICT CONSTRAINT (G5): Report-only. Certificate chain trust cannot be
   * evaluated offline. Never emits 'valid', 'verified', or 'trusted'.
   */
  async analyzeSignatures(
    source: File | ArrayBuffer | Uint8Array,
    fileNameOverride?: string
  ): Promise<DocumentSignatureReport> {
    const arrayBuffer: ArrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source instanceof Uint8Array
        ? (source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
        : (source as ArrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const totalFileLength = bytes.length;
    const fileName = fileNameOverride || (source instanceof File ? source.name : 'document.pdf');

    const signatures: SignatureFieldReport[] = [];
    const textDecoder = new TextDecoder('latin1');
    const rawContent = textDecoder.decode(bytes);

    let pdfDoc: PDFDocument | null = null;
    try {
      pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), {
        ignoreEncryption: true,
        updateMetadata: false
      });
    } catch {
      // Malformed or raw document
    }

    // 1. Scan via ByteRange regex pattern in document body
    const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    let match: RegExpExecArray | null;
    let sigIndex = 1;

    while ((match = byteRangeRegex.exec(rawContent)) !== null) {
      const offset1 = parseInt(match[1], 10);
      const length1 = parseInt(match[2], 10);
      const offset2 = parseInt(match[3], 10);
      const length2 = parseInt(match[4], 10);

      const byteRange = [offset1, length1, offset2, length2];
      const rangeEnd = offset2 + length2;
      const isWholeFileCovered = rangeEnd === totalFileLength;
      const hasAppendedBytes = totalFileLength > rangeEnd;
      const appendedByteCount = Math.max(0, totalFileLength - rangeEnd);
      const signedBytesTotal = length1 + length2;
      const signedByteCoverageRatio =
        totalFileLength > 0 ? Number((signedBytesTotal / totalFileLength).toFixed(4)) : 0;

      // Scope metadata extraction to the enclosing dictionary << ... >>
      let contextSlice = '';
      const lastDictOpen = rawContent.lastIndexOf('<<', match.index);
      const nextDictClose = rawContent.indexOf('>>', match.index);
      if (lastDictOpen !== -1 && nextDictClose !== -1 && nextDictClose > match.index && (match.index - lastDictOpen) < 2000) {
        contextSlice = rawContent.slice(lastDictOpen, nextDictClose + 2);
      } else {
        const contextStart = Math.max(0, match.index - 500);
        const contextEnd = Math.min(rawContent.length, match.index + 500);
        contextSlice = rawContent.slice(contextStart, contextEnd);
      }

      const signerName = this.extractFieldString(contextSlice, /\/Name\s*(?:\(([^)]*)\)|<([^>]*)>)/) ||
        `Signature Field ${sigIndex}`;
      const claimedSigningTime = this.extractFieldString(contextSlice, /\/M\s*(?:\(([^)]*)\)|<([^>]*)>)/);
      const reason = this.extractFieldString(contextSlice, /\/Reason\s*(?:\(([^)]*)\)|<([^>]*)>)/);
      const location = this.extractFieldString(contextSlice, /\/Location\s*(?:\(([^)]*)\)|<([^>]*)>)/);
      const contactInfo = this.extractFieldString(contextSlice, /\/ContactInfo\s*(?:\(([^)]*)\)|<([^>]*)>)/);
      const filter = this.extractName(contextSlice, /\/Filter\s*\/([a-zA-Z0-9._]+)/);
      const subFilter = this.extractName(contextSlice, /\/SubFilter\s*\/([a-zA-Z0-9._]+)/);

      signatures.push({
        fieldName: `Sig_${sigIndex++}`,
        signerName,
        claimedSigningTime,
        reason,
        location,
        contactInfo,
        filter,
        subFilter,
        byteRange,
        isWholeFileCovered,
        hasAppendedBytes,
        appendedByteCount,
        totalFileLength,
        signedByteCoverageRatio
      });
    }

    // 2. Also cross-reference with AcroForm signature fields in PDFDocument if available
    if (pdfDoc && signatures.length === 0) {
      this.scanAcroFormSignatures(pdfDoc, totalFileLength, signatures);
    }

    const hasSignatures = signatures.length > 0;
    const hasAppendedRevisions = signatures.some(s => s.hasAppendedBytes);

    let overallCoverageSummary = 'No digital signature structures found in document.';
    if (hasSignatures) {
      if (hasAppendedRevisions) {
        overallCoverageSummary = 'Signature byte range covers part of document; subsequent appended bytes detected.';
      } else {
        overallCoverageSummary = 'Signature byte range encompasses whole document end-to-end.';
      }
    }

    const offlineNotice =
      'Notice: Certificate chain trust cannot be checked offline. This panel displays cryptographic structure and byte-range coverage only.';

    return {
      fileName,
      fileSizeBytes: totalFileLength,
      signaturesFound: signatures.length,
      hasSignatures,
      signatures,
      overallCoverageSummary,
      hasAppendedRevisions,
      offlineNotice
    };
  }

  private scanAcroFormSignatures(doc: PDFDocument, totalLength: number, out: SignatureFieldReport[]): void {
    try {
      const acroFormRef = doc.catalog.get(PDFName.of('AcroForm'));
      if (!acroFormRef) return;
      const acroForm = doc.context.lookup(acroFormRef);
      if (!(acroForm instanceof PDFDict)) return;

      const fieldsRef = acroForm.get(PDFName.of('Fields'));
      if (!fieldsRef) return;
      const fields = doc.context.lookup(fieldsRef);
      if (!(fields instanceof PDFArray)) return;

      for (let i = 0; i < fields.size(); i++) {
        const field = doc.context.lookup(fields.get(i));
        if (field instanceof PDFDict) {
          const ft = field.get(PDFName.of('FT'))?.toString();
          if (ft === '/Sig') {
            const fieldName = (field.get(PDFName.of('T')) as any)?.decodeText?.() || `Sig_${i + 1}`;
            const vRef = field.get(PDFName.of('V'));
            if (vRef) {
              const sigDict = doc.context.lookup(vRef);
              if (sigDict instanceof PDFDict) {
                const name = this.decodeString(sigDict.get(PDFName.of('Name'))) || fieldName;
                const reason = this.decodeString(sigDict.get(PDFName.of('Reason')));
                const location = this.decodeString(sigDict.get(PDFName.of('Location')));
                const m = this.decodeString(sigDict.get(PDFName.of('M')));
                const filter = sigDict.get(PDFName.of('Filter'))?.toString().replace(/^\//, '');
                const subFilter = sigDict.get(PDFName.of('SubFilter'))?.toString().replace(/^\//, '');

                let byteRange = [0, 0, 0, 0];
                const brRef = sigDict.get(PDFName.of('ByteRange'));
                if (brRef) {
                  const br = doc.context.lookup(brRef);
                  if (br instanceof PDFArray) {
                    byteRange = [
                      (br.get(0) as any)?.numberValue || 0,
                      (br.get(1) as any)?.numberValue || 0,
                      (br.get(2) as any)?.numberValue || 0,
                      (br.get(3) as any)?.numberValue || 0
                    ];
                  }
                }

                const rangeEnd = byteRange[2] + byteRange[3];
                const isWholeFileCovered = rangeEnd === totalLength && rangeEnd > 0;
                const hasAppendedBytes = totalLength > rangeEnd && rangeEnd > 0;
                const appendedByteCount = Math.max(0, totalLength - rangeEnd);
                const signedBytesTotal = byteRange[1] + byteRange[3];

                out.push({
                  fieldName,
                  signerName: name,
                  claimedSigningTime: m,
                  reason,
                  location,
                  filter,
                  subFilter,
                  byteRange,
                  isWholeFileCovered,
                  hasAppendedBytes,
                  appendedByteCount,
                  totalFileLength: totalLength,
                  signedByteCoverageRatio: totalLength > 0 ? Number((signedBytesTotal / totalLength).toFixed(4)) : 0
                });
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  private extractFieldString(context: string, regex: RegExp): string | undefined {
    const match = regex.exec(context);
    if (!match) return undefined;
    return match[1] || match[2];
  }

  private extractName(context: string, regex: RegExp): string | undefined {
    const match = regex.exec(context);
    if (!match) return undefined;
    return match[1];
  }

  private decodeString(obj: any): string | undefined {
    if (!obj) return undefined;
    if (obj instanceof PDFString || obj instanceof PDFHexString) {
      return obj.decodeText();
    }
    return obj.toString();
  }
}
