import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfCryptoSignService } from './pdf-crypto-sign.service';
import { UnlockedP12Data } from '../models/crypto-sign.types';

describe('PdfCryptoSignService', () => {
  let service: PdfCryptoSignService;
  let sampleP12Bytes: Uint8Array;
  let sampleP12Data: UnlockedP12Data;
  const samplePassword = 'TestPassword123!';

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.runInInjectionContext(() => new PdfCryptoSignService());

    // Generate test self-signed cert on the fly
    const generated = await service.createSelfSignedP12(
      'Dr. Jane Doe',
      samplePassword,
      'Antigravity Health Services'
    );
    sampleP12Bytes = generated.p12Bytes;
    sampleP12Data = service.unlockP12(sampleP12Bytes, samplePassword);
  });

  async function createSampleDoc(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText('Medical Clearance Certificate', { x: 50, y: 750, size: 16 });
    page.drawText('This document certifies health clearance.', { x: 50, y: 700, size: 11 });
    return await doc.save();
  }

  describe('PKCS#12 Parsing & Decryption', () => {
    it('successfully unlocks .p12 file with correct password and extracts X.509 info', () => {
      expect(sampleP12Data.certInfo.commonName).toBe('Dr. Jane Doe');
      expect(sampleP12Data.certInfo.organization).toBe('Antigravity Health Services');
      expect(sampleP12Data.certInfo.isValid).toBe(true);
      expect(sampleP12Data.certInfo.isExpired).toBe(false);
      expect(sampleP12Data.certInfo.fingerprintSha256).toBeTruthy();
      expect(sampleP12Data.certificate).toBeDefined();
      expect(sampleP12Data.privateKey).toBeDefined();
    });

    it('gracefully throws on incorrect password without crashing', () => {
      expect(() => {
        service.unlockP12(sampleP12Bytes, 'WrongPassword!');
      }).toThrow(/Incorrect password/);
    });

    it('gracefully throws on invalid or non-DER certificate bytes', () => {
      const junkBytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
      expect(() => {
        service.unlockP12(junkBytes, samplePassword);
      }).toThrow(/Failed to parse certificate/);
    });

    it('mitigates brute-force attacks by locking out after 5 consecutive failed attempts', () => {
      service.resetBruteForceProtection();

      // Attempt 5 incorrect passwords
      for (let i = 0; i < 5; i++) {
        expect(() => service.unlockP12(sampleP12Bytes, `WrongAttempt_${i}`)).toThrow(/Incorrect password/);
      }

      // 6th attempt must trigger brute-force lockout
      expect(() => service.unlockP12(sampleP12Bytes, 'AnotherWrongPassword')).toThrow(
        /Too many failed unlock attempts\. Decryption locked for \d+ seconds/
      );

      // Resetting allows successful unlocking again
      service.resetBruteForceProtection();
      const unlocked = service.unlockP12(sampleP12Bytes, samplePassword);
      expect(unlocked.certInfo.commonName).toBe('Dr. Jane Doe');
    });
  });

  describe('Key Sizes, CA Certificates & Multi-Page Contracts', () => {
    it('signs and verifies with RSA-4096 certificate on multi-page contract', async () => {
      // Generate 4096-bit certificate
      const rsa4096Cert = await service.createSelfSignedP12(
        'Chief Justice John Marshall',
        'Strong4096Pass!',
        'Supreme Court Administration',
        { keySize: 4096 }
      );

      expect(rsa4096Cert.certInfo.keySize).toBe(4096);
      const unlocked4096 = service.unlockP12(rsa4096Cert.p12Bytes, 'Strong4096Pass!');

      // Create a 3-page contract document
      const doc = await PDFDocument.create();
      for (let i = 1; i <= 3; i++) {
        const page = doc.addPage([595, 842]);
        page.drawText(`Multi-Party Commercial Contract - Page ${i} of 3`, { x: 50, y: 780, size: 14 });
      }
      const multiPagePdfBytes = await doc.save();

      // Sign targeting Page 2
      const signResult = await service.signPdf(multiPagePdfBytes, unlocked4096, {
        reason: 'Judicial confirmation of contractual terms',
        location: 'New Delhi, India',
        includeVisualStamp: true,
        stampPage: 2
      });

      expect(signResult.verificationPassed).toBe(true);
      expect(signResult.signerCommonName).toBe('Chief Justice John Marshall');

      const verification = await service.verifyPdfSignature(signResult.signedPdfBytes);
      expect(verification.isValid).toBe(true);
      expect(verification.signerInfo?.commonName).toBe('Chief Justice John Marshall');
      expect(verification.signerInfo?.organization).toBe('Supreme Court Administration');
    });

    it('signs and verifies with simulated CA-issued certificate (Subject CN != Issuer CN)', async () => {
      const caCert = await service.createSelfSignedP12(
        'Officer Vikram Rathore',
        'CaCertPass!',
        'Ministry of Defense',
        { issuerCommonName: 'National Root Certification Authority' }
      );

      expect(caCert.certInfo.issuer).toBe('National Root Certification Authority');
      const unlockedCa = service.unlockP12(caCert.p12Bytes, 'CaCertPass!');

      const docBytes = await createSampleDoc();
      const signResult = await service.signPdf(docBytes, unlockedCa, {
        reason: 'Authorized government clearance'
      });

      expect(signResult.verificationPassed).toBe(true);
      const verification = await service.verifyPdfSignature(signResult.signedPdfBytes);
      expect(verification.isValid).toBe(true);
      expect(verification.signerInfo?.commonName).toBe('Officer Vikram Rathore');
      expect(verification.signerInfo?.issuer).toBe('National Root Certification Authority');
    });
  });

  describe('Cryptographic Honesty Gate & Expiration Checks', () => {
    it('honesty gate blocks export when certificate is expired', async () => {
      const expiredGen = await service.createSelfSignedP12(
        'Expired Signer',
        'ExpiredPass123!',
        'Legacy Archive',
        { isExpired: true }
      );

      expect(expiredGen.certInfo.isExpired).toBe(true);
      expect(expiredGen.certInfo.isValid).toBe(false);

      const unlockedExpired = service.unlockP12(expiredGen.p12Bytes, 'ExpiredPass123!');
      const basePdfBytes = await createSampleDoc();

      await expect(
        service.signPdf(basePdfBytes, unlockedExpired, { reason: 'Attempting expired sign' })
      ).rejects.toThrow(/Cryptographic Honesty Gate Failed: Certificate "Expired Signer" is expired/);
    });

    it('verification report surfaces expiration warnings when expired cert is verified', async () => {
      const expiredGen = await service.createSelfSignedP12(
        'Archived Entity',
        'ArchivedPass123!',
        'Historical Dept',
        { isExpired: true }
      );
      const unlockedExpired = service.unlockP12(expiredGen.p12Bytes, 'ArchivedPass123!');
      const basePdfBytes = await createSampleDoc();

      // Sign with explicit allowExpiredCert override for verification testing
      const signResult = await service.signPdf(basePdfBytes, unlockedExpired, {
        allowExpiredCert: true,
        reason: 'Audited historical re-sign'
      });

      const verification = await service.verifyPdfSignature(signResult.signedPdfBytes);
      expect(verification.isValid).toBe(true); // Content hash still matches
      expect(verification.signerInfo?.isExpired).toBe(true);
      expect(verification.warnings).toBeDefined();
      expect(verification.warnings?.[0]).toContain('Signer certificate expired on');
    });
  });

  describe('Cybersecurity Stress-Testing (Shadow Attacks & Malformed DER)', () => {
    it('detects PDF Shadow Attacks when trailing incremental updates are injected after signed ByteRange', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'Anti-Shadow Attack Test'
      });

      // Inject trailing malicious incremental update (Hide-and-Replace Shadow Attack)
      const shadowPayload = new TextEncoder().encode('\n%%EOF\n% MALICIOUS_SHADOW_UPDATE_OVERLAY\n');
      const injectedBytes = new Uint8Array(result.signedPdfBytes.length + shadowPayload.length);
      injectedBytes.set(result.signedPdfBytes, 0);
      injectedBytes.set(shadowPayload, result.signedPdfBytes.length);

      const report = await service.verifyPdfSignature(injectedBytes);
      expect(report.isValid).toBe(false);
      expect(report.error).toContain('PDF Shadow Attack detected');
      expect(report.error).toContain('unhashed trailing bytes');
    });

    it('rejects ByteRange when boundary brackets do not strictly enclose /Contents <...>', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'Boundary check'
      });

      const tamperedBytes = new Uint8Array(result.signedPdfBytes);
      const [br0, br1] = result.byteRange;
      // Overwrite the opening bracket '<' at br1
      tamperedBytes[br1] = 32 /* space */;

      const report = await service.verifyPdfSignature(tamperedBytes);
      expect(report.isValid).toBe(false);
      expect(report.error).toContain('ByteRange does not strictly align with /Contents hex container');
    });

    it('safely rejects corrupted non-hex or odd-length /Contents without crashing ASN.1 parser', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data);

      const tamperedBytes = new Uint8Array(result.signedPdfBytes);
      const [, br1] = result.byteRange;

      // Inject non-hex garbage characters inside /Contents
      tamperedBytes[br1 + 1] = 'Z'.charCodeAt(0);
      tamperedBytes[br1 + 2] = '!'.charCodeAt(0);

      const report = await service.verifyPdfSignature(tamperedBytes);
      expect(report.isValid).toBe(false);
      expect(report.error).toContain('invalid non-hex characters');
    });
  });

  describe('Digital Signature Engine', () => {
    it('signs PDF with standard /ByteRange and CMS SignedData', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'I approve this document',
        location: 'Mumbai, India',
        includeVisualStamp: true,
        stampPage: 1
      });

      expect(result.signedPdfBytes).toBeDefined();
      expect(result.verificationPassed).toBe(true);
      expect(result.signerCommonName).toBe('Dr. Jane Doe');
      expect(result.byteRange[0]).toBe(0);

      // Verify /ByteRange brackets file boundaries with zero byte overlaps
      const [br0, br1, br2, br3] = result.byteRange;
      expect(br0).toBe(0);
      expect(br1).toBeGreaterThan(0);
      expect(br2).toBeGreaterThan(br1);
      expect(br2 + br3).toBe(result.signedPdfBytes.length);

      // Verify sum of chunk lengths equals total length minus /Contents string
      const excludedLength = br2 - br1;
      expect(br1 + br3).toBe(result.signedPdfBytes.length - excludedLength);
    });

    it('signs PDF without visual stamp (invisible cryptographic signature)', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'Invisible signature audit check',
        includeVisualStamp: false
      });

      expect(result.signedPdfBytes).toBeDefined();
      expect(result.verificationPassed).toBe(true);

      const verification = await service.verifyPdfSignature(result.signedPdfBytes);
      expect(verification.isValid).toBe(true);
      expect(verification.signerInfo?.commonName).toBe('Dr. Jane Doe');
    });

    it('cryptographically verifies signed PDF and validates SHA-256 hash match', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'Verification test'
      });

      const report = await service.verifyPdfSignature(result.signedPdfBytes);

      expect(report.hasSignature).toBe(true);
      expect(report.isValid).toBe(true);
      expect(report.expectedDigest).toBeTruthy();
      expect(report.actualDigest).toBe(report.expectedDigest);
      expect(report.signerInfo?.commonName).toBe('Dr. Jane Doe');
      expect(report.signerInfo?.organization).toBe('Antigravity Health Services');
    });

    it('detects tampering and flags invalid if document bytes outside /Contents are altered', async () => {
      const basePdfBytes = await createSampleDoc();
      const result = await service.signPdf(basePdfBytes, sampleP12Data, {
        reason: 'Tamper test'
      });

      // Maliciously tamper with a byte in Chunk 1 (e.g. index 10)
      const tamperedBytes = new Uint8Array(result.signedPdfBytes);
      tamperedBytes[10] = tamperedBytes[10] ^ 0xff;

      const report = await service.verifyPdfSignature(tamperedBytes);
      expect(report.isValid).toBe(false);
      expect(report.error).toContain('Document content has been modified or corrupted');
      expect(report.actualDigest).not.toBe(report.expectedDigest);
    });

    it('reports no signature when verifying unsigned normal PDF', async () => {
      const basePdfBytes = await createSampleDoc();
      const report = await service.verifyPdfSignature(basePdfBytes);

      expect(report.hasSignature).toBe(false);
      expect(report.isValid).toBe(false);
      expect(report.error).toContain('No valid /ByteRange array found');
    });
  });
});
