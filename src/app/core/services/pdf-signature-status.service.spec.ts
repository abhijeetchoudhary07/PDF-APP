import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfSignatureStatusService } from './pdf-signature-status.service';

describe('PdfSignatureStatusService (G5: Signature Status Panel)', () => {
  let service: PdfSignatureStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfSignatureStatusService]
    });
    service = TestBed.inject(PdfSignatureStatusService);
  });

  it('reports document with no digital signatures accurately and neutrally', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const cleanBytes = await doc.save();

    const report = await service.analyzeSignatures(cleanBytes.buffer, 'unsigned.pdf');

    expect(report.fileName).toBe('unsigned.pdf');
    expect(report.hasSignatures).toBe(false);
    expect(report.signaturesFound).toBe(0);
    expect(report.signatures).toEqual([]);
    expect(report.hasAppendedRevisions).toBe(false);
    expect(report.overallCoverageSummary).toContain('No digital signature');
    expect(report.offlineNotice).toContain('offline');
  });

  it('detects signature dictionary, extracts metadata, and verifies whole-file range coverage', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const baseBytes = await doc.save();

    // Synthesize signature dictionary with ByteRange matching exact length
    const encoder = new TextEncoder();
    const sigPattern =
      '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ' +
      '/Name (Alex Auditor) /Reason (Document Review) /Location (Bengaluru) /M (D:20261019200000Z) ' +
      '/ByteRange [ 0 200 300 150 ] >>';
    const sigBytes = encoder.encode(sigPattern);

    // Build combined payload of exact length 450 (since 300 + 150 = 450)
    const totalLength = 450;
    const combined = new Uint8Array(totalLength);
    combined.set(baseBytes.slice(0, Math.min(baseBytes.length, totalLength)));
    // Place signature in the document stream
    combined.set(sigBytes.slice(0, totalLength - 50), 50);

    const report = await service.analyzeSignatures(combined.buffer, 'signed_mock.pdf');

    expect(report.hasSignatures).toBe(true);
    expect(report.signaturesFound).toBe(1);

    const sig = report.signatures[0];
    expect(sig.signerName).toBe('Alex Auditor');
    expect(sig.reason).toBe('Document Review');
    expect(sig.location).toBe('Bengaluru');
    expect(sig.filter).toBe('Adobe.PPKLite');
    expect(sig.subFilter).toBe('adbe.pkcs7.detached');
    expect(sig.isWholeFileCovered).toBe(true);
    expect(sig.hasAppendedBytes).toBe(false);
    expect(sig.appendedByteCount).toBe(0);
    expect(sig.signedByteCoverageRatio).toBeCloseTo((200 + 150) / 450, 2);
  });

  it('detects appended bytes beyond the signed byte range', async () => {
    const encoder = new TextEncoder();
    const sigPattern =
      '<< /Type /Sig /ByteRange [ 0 100 200 100 ] /Name (Pat Signer) >>';
    const sigBytes = encoder.encode(sigPattern);

    // ByteRange ends at 200 + 100 = 300.
    // Let's create a total length of 380 (so 80 appended bytes exist).
    const totalLength = 380;
    const combined = new Uint8Array(totalLength);
    combined.set(sigBytes, 10);
    // Append trailing comment at the end
    const appendText = encoder.encode('%% Appended incremental revision after signing');
    combined.set(appendText, 305);

    const report = await service.analyzeSignatures(combined.buffer, 'tampered_or_appended.pdf');

    expect(report.hasSignatures).toBe(true);
    const sig = report.signatures[0];
    expect(sig.isWholeFileCovered).toBe(false);
    expect(sig.hasAppendedBytes).toBe(true);
    expect(sig.appendedByteCount).toBe(80);
    expect(report.hasAppendedRevisions).toBe(true);
    expect(report.overallCoverageSummary).toContain('appended');
  });

  it('strictly adheres to Play Store and G5 constraint: zero forbidden marketing/legal claim words', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const bytes = await doc.save();

    const report = await service.analyzeSignatures(bytes.buffer, 'compliance_check.pdf');
    const jsonStr = JSON.stringify(report).toLowerCase();

    // Check forbidden words as per Part 0 and G5 requirements:
    // never emit "valid", "verified", "certified", "compliant", "unbreakable"
    expect(jsonStr).not.toContain('valid');
    expect(jsonStr).not.toContain('verified');
    expect(jsonStr).not.toContain('certified');
    expect(jsonStr).not.toContain('compliant');
    expect(jsonStr).not.toContain('unbreakable');
  });
});
