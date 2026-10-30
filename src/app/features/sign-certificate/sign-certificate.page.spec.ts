import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ChangeDetectorRef } from '@angular/core';

import { SignCertificatePage } from './sign-certificate.page';
import { PdfCryptoSignService } from '../../core/services/pdf-crypto-sign.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import {
  UnlockedP12Data,
  CryptoSignResult,
  CryptoSignVerificationReport
} from '../../core/models/crypto-sign.types';

describe('SignCertificatePage', () => {
  let page: SignCertificatePage;
  let mockCryptoSignService: any;
  let mockDocumentBridge: any;
  let mockShareService: any;
  let mockToastCtrl: any;
  let mockRouter: any;

  const sampleUnlockedData: UnlockedP12Data = {
    certInfo: {
      commonName: 'Alice Smith',
      organization: 'Digital Solutions Ltd',
      issuer: 'Test Root CA',
      validityNotBefore: '2026-01-01T00:00:00.000Z',
      validityNotAfter: '2028-01-01T00:00:00.000Z',
      serialNumber: '123456',
      isValid: true,
      isExpired: false,
      fingerprintSha256: 'a1b2c3d4e5f6'
    },
    certificate: {},
    privateKey: {},
    certChain: []
  };

  const sampleSignResult: CryptoSignResult = {
    signedPdfBytes: new Uint8Array([10, 20, 30, 40]),
    byteRange: [0, 100, 200, 300],
    documentDigestSha256: 'abcdef123456',
    signatureHexLength: 16384,
    signerCommonName: 'Alice Smith',
    signedAt: '2026-10-28T12:00:00.000Z',
    verificationPassed: true
  };

  const sampleVerificationReport: CryptoSignVerificationReport = {
    isValid: true,
    hasSignature: true,
    byteRange: [0, 100, 200, 300],
    expectedDigest: 'abcdef123456',
    actualDigest: 'abcdef123456',
    signerInfo: {
      commonName: 'Alice Smith',
      organization: 'Digital Solutions Ltd'
    }
  };

  beforeEach(() => {
    mockCryptoSignService = {
      unlockP12: vi.fn().mockReturnValue(sampleUnlockedData),
      createSelfSignedP12: vi.fn().mockResolvedValue({
        p12Bytes: new Uint8Array([1, 2, 3, 4]),
        certInfo: sampleUnlockedData.certInfo
      }),
      signPdf: vi.fn().mockResolvedValue(sampleSignResult),
      verifyPdfSignature: vi.fn().mockResolvedValue(sampleVerificationReport)
    };

    mockDocumentBridge = {
      consumeDocument: vi.fn().mockReturnValue(null)
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined)
      })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfCryptoSignService, useValue: mockCryptoSignService },
        { provide: DocumentBridgeService, useValue: mockDocumentBridge },
        { provide: ShareService, useValue: mockShareService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SignCertificatePage());
  });

  it('initializes with sample document when no bridged doc provided', async () => {
    await page.ngOnInit();

    expect(page.pdfBytes).toBeDefined();
    expect(page.fileName).toBe('Sample_Document.pdf');
    expect(page.pageCount).toBe(1);
    expect(page.unlockedData).toBeNull();
  });

  describe('Certificate Management', () => {
    beforeEach(async () => {
      await page.ngOnInit();
    });

    it('generates a test certificate and unlocks it', async () => {
      await page.generateTestCertificate();

      expect(mockCryptoSignService.createSelfSignedP12).toHaveBeenCalled();
      expect(mockCryptoSignService.unlockP12).toHaveBeenCalled();
      expect(page.unlockedData?.certInfo.commonName).toBe('Alice Smith');
      expect(page.certError).toBeNull();
    });

    it('unlocks certificate with password when bytes are loaded', () => {
      page.p12Bytes = new Uint8Array([5, 6, 7, 8]);
      page.p12Password = 'Secret123!';

      page.unlockCertificate();

      expect(mockCryptoSignService.unlockP12).toHaveBeenCalledWith(
        page.p12Bytes,
        'Secret123!'
      );
      expect(page.unlockedData).toEqual(sampleUnlockedData);
    });

    it('handles incorrect password error gracefully', () => {
      mockCryptoSignService.unlockP12.mockImplementationOnce(() => {
        throw new Error('Incorrect password');
      });

      page.p12Bytes = new Uint8Array([5, 6, 7, 8]);
      page.p12Password = 'Wrong!';
      page.unlockCertificate();

      expect(page.unlockedData).toBeNull();
      expect(page.certError).toContain('Incorrect password');
    });

    it('toggles password visibility', () => {
      expect(page.showPassword).toBe(false);
      page.togglePasswordVisibility();
      expect(page.showPassword).toBe(true);
      page.togglePasswordVisibility();
      expect(page.showPassword).toBe(false);
    });

    it('clears certificate state', () => {
      page.p12Bytes = new Uint8Array([1, 2]);
      page.unlockedData = sampleUnlockedData;
      page.clearCertificate();

      expect(page.p12Bytes).toBeNull();
      expect(page.unlockedData).toBeNull();
    });
  });

  describe('Signing Execution', () => {
    beforeEach(async () => {
      await page.ngOnInit();
      page.unlockedData = sampleUnlockedData;
      page.reason = 'Approved for clearance';
      page.location = 'New Delhi, India';
      page.includeVisualStamp = true;
    });

    it('signs PDF with digital certificate and verifies report', async () => {
      const initialBytes = page.pdfBytes;
      await page.executeCertificateSign();

      expect(mockCryptoSignService.signPdf).toHaveBeenCalledWith(
        initialBytes,
        sampleUnlockedData,
        expect.objectContaining({
          reason: 'Approved for clearance',
          location: 'New Delhi, India',
          includeVisualStamp: true,
          stampPage: 1
        })
      );

      expect(mockCryptoSignService.verifyPdfSignature).toHaveBeenCalled();
      expect(page.signResult).toEqual(sampleSignResult);
      expect(page.verificationReport?.isValid).toBe(true);
      expect(page.pdfBytes).toEqual(sampleSignResult.signedPdfBytes);
    });

    it('handles signing failure gracefully', async () => {
      mockCryptoSignService.signPdf.mockRejectedValueOnce(
        new Error('Signing verification failed')
      );

      await page.executeCertificateSign();

      expect(page.isSigning).toBe(false);
      expect(mockToastCtrl.create).toHaveBeenCalled();
    });
  });

  describe('Distribution', () => {
    beforeEach(async () => {
      await page.ngOnInit();
      page.pdfBytes = new Uint8Array([1, 2, 3]);
    });

    it('shares signed document via ShareService', async () => {
      await page.shareSignedDocument();
      expect(mockShareService.shareFile).toHaveBeenCalled();
    });
  });
});
