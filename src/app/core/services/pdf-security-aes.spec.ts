import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { PdfSecurityService, isoAlgorithm2B, saslPrep, normalizePasswordToBytes } from './pdf-security.service';
import { StorageService } from './storage.service';
import { HeadlessCanvasContext2D } from '../utilities/canvas-headless.util';

const FIXTURES_DIR = path.resolve('e2e/test-data/audit');

describe('PdfSecurityService — AES-256 (R6) & AES-128 (R4) Engine Verification', () => {
  let securityService: PdfSecurityService;
  let storageService: StorageService;
  let samplePdfBytes: Uint8Array;

  beforeEach(() => {
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        return new HeadlessCanvasContext2D(this.width || 100, this.height || 100, this as any);
      } as any;
    }

    TestBed.configureTestingModule({
      providers: [PdfSecurityService, StorageService]
    });

    securityService = TestBed.inject(PdfSecurityService);
    storageService = TestBed.inject(StorageService);
    samplePdfBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
  });

  // =========================================================================
  // 1. ISO 32000-2 ALGORITHM 2.B TEST VECTORS & DETERMINISM
  // =========================================================================

  describe('ISO 32000-2 Algorithm 2.B (PDF 2.0 Hardened Key Derivation)', () => {
    it('produces exactly 32-byte deterministic hash for given password and salt', async () => {
      const password = new TextEncoder().encode('TestUserPassword2026!');
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const input = new Uint8Array(password.length + salt.length);
      input.set(password, 0);
      input.set(salt, password.length);

      const hash1 = await isoAlgorithm2B(password, input, new Uint8Array(0));
      const hash2 = await isoAlgorithm2B(password, input, new Uint8Array(0));

      expect(hash1.length).toBe(32);
      expect(hash2.length).toBe(32);
      expect(Array.from(hash1)).toEqual(Array.from(hash2));
    });

    it('exhibits cryptographic diffusion (avalanche effect) when 1 bit changes', async () => {
      const passwordA = new TextEncoder().encode('PasswordAlpha');
      const passwordB = new TextEncoder().encode('PasswordAlphb'); // 1 character difference
      const salt = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

      const inputA = new Uint8Array(passwordA.length + salt.length);
      inputA.set(passwordA, 0);
      inputA.set(salt, passwordA.length);

      const inputB = new Uint8Array(passwordB.length + salt.length);
      inputB.set(passwordB, 0);
      inputB.set(salt, passwordB.length);

      const hashA = await isoAlgorithm2B(passwordA, inputA, new Uint8Array(0));
      const hashB = await isoAlgorithm2B(passwordB, inputB, new Uint8Array(0));

      let differingBytes = 0;
      for (let i = 0; i < 32; i++) {
        if (hashA[i] !== hashB[i]) differingBytes++;
      }

      // Cryptographic hashes differ across almost all bytes (>25 out of 32 bytes)
      expect(differingBytes).toBeGreaterThanOrEqual(25);
    });

    it('computes valid AES-256 R6 key structures with U, O, UE, OE, Perms matching specifications', async () => {
      const userPass = 'UserSecret2026';
      const ownerPass = 'OwnerMaster2026';
      const permissions = -4; // Default full permissions

      const keys = await securityService.computeAES256R6Keys(userPass, ownerPass, permissions);

      expect(keys.uHex.length).toBe(96); // 48 bytes = 96 hex chars (32 validation + 8 valSalt + 8 keySalt)
      expect(keys.oHex.length).toBe(96); // 48 bytes = 96 hex chars
      expect(keys.ueHex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(keys.oeHex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(keys.permsHex.length).toBe(32); // 16 bytes = 32 hex chars
      expect(keys.fileKey.length).toBe(32); // 256 bits = 32 bytes
      expect(keys.docId.length).toBe(16);
    });
  });

  // =========================================================================
  // 2. AES-256 (V=5, R=6) ENCRYPTION & PDFJS-DIST DECRYPTION
  // =========================================================================

  describe('AES-256 (V=5, R=6) Protection & pdfjs-dist Decryption', () => {
    it('encrypts document with AES-256 and successfully decrypts with User password in pdfjs-dist', async () => {
      const userPassword = 'CorrectUserPass123!';
      const ownerPassword = 'CorrectOwnerPass456!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        ownerPassword,
        encryptionLevel: 'aes-256'
      });

      expect(result.file).toBeDefined();
      const encBuffer = await result.file.arrayBuffer();
      const encBytes = new Uint8Array(encBuffer);

      // Verify header and dictionary markings
      const fullText = new TextDecoder('latin1').decode(encBytes);
      expect(fullText.startsWith('%PDF-')).toBe(true);
      expect(fullText).toContain('/V 5');
      expect(fullText).toContain('/R 6');
      expect(fullText).toContain('/CFM /AESV3');
      expect(fullText).toContain('/Length 256');

      // Open with pdfjs-dist using User Password
      const pdfDoc = await pdfjsLib.getDocument({
        data: encBytes,
        password: userPassword
      }).promise;

      expect(pdfDoc.numPages).toBe(1);
      const page = await pdfDoc.getPage(1);
      const textContent = await page.getTextContent();
      expect(textContent.items.length).toBeGreaterThan(0);
    });

    it('successfully decrypts document with Owner password in pdfjs-dist', async () => {
      const userPassword = 'MyUserPassword!';
      const ownerPassword = 'MyOwnerPassword!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        ownerPassword,
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      // Open with pdfjs-dist using Owner Password
      const pdfDocOwner = await pdfjsLib.getDocument({
        data: encBytes,
        password: ownerPassword
      }).promise;

      expect(pdfDocOwner.numPages).toBe(1);
      const page = await pdfDocOwner.getPage(1);
      expect(page.pageNumber).toBe(1);
    });

    it('strictly rejects incorrect passwords and throws PasswordException in pdfjs-dist', async () => {
      const userPassword = 'ValidPassword999';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      await expect(
        pdfjsLib.getDocument({
          data: encBytes,
          password: 'CompletelyWrongPassword'
        }).promise
      ).rejects.toThrow();
    });

    it('correctly detects AES-256 encryption via detectSecurity()', async () => {
      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'SecurePassword123',
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const status = await securityService.detectSecurity(encBytes);

      expect(status.isEncrypted).toBe(true);
      expect(status.requiresUserPassword).toBe(true);
      expect(status.encryptionStandard).toBe('aes-256');
    });
  });

  // =========================================================================
  // 3. AES-128 (V=4, R=4) ENCRYPTION & PDFJS-DIST DECRYPTION
  // =========================================================================

  describe('AES-128 (V=4, R=4) Protection & pdfjs-dist Decryption', () => {
    it('encrypts document with AES-128 and successfully decrypts with User password in pdfjs-dist', async () => {
      const userPassword = 'Aes128UserPass!';
      const ownerPassword = 'Aes128OwnerPass!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        ownerPassword,
        encryptionLevel: 'aes-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const fullText = new TextDecoder('latin1').decode(encBytes);

      expect(fullText.startsWith('%PDF-')).toBe(true);
      expect(fullText).toContain('/V 4');
      expect(fullText).toContain('/R 4');
      expect(fullText).toContain('/CFM /AESV2');
      expect(fullText).toContain('/Length 128');

      // Open with pdfjs-dist using User Password
      const pdfDoc = await pdfjsLib.getDocument({
        data: encBytes,
        password: userPassword
      }).promise;

      expect(pdfDoc.numPages).toBe(1);
    });

    it('successfully decrypts AES-128 document with Owner password in pdfjs-dist', async () => {
      const userPassword = 'Aes128UserPass!';
      const ownerPassword = 'Aes128OwnerPass!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        ownerPassword,
        encryptionLevel: 'aes-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      const pdfDoc = await pdfjsLib.getDocument({
        data: encBytes,
        password: ownerPassword
      }).promise;

      expect(pdfDoc.numPages).toBe(1);
    });

    it('correctly detects AES-128 encryption via detectSecurity()', async () => {
      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'Aes128TestPass',
        encryptionLevel: 'aes-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const status = await securityService.detectSecurity(encBytes);

      expect(status.isEncrypted).toBe(true);
      expect(status.encryptionStandard).toBe('aes-128');
    });
  });

  // =========================================================================
  // 4. LEGACY RC4 (V=2, R=3) PRESERVATION
  // =========================================================================

  describe('Legacy RC4 Standard-128 (V=2, R=3) Preservation', () => {
    it('encrypts document with legacy RC4 and opens in pdfjs-dist', async () => {
      const userPassword = 'Rc4UserPass99!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword,
        encryptionLevel: 'rc4-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const fullText = new TextDecoder('latin1').decode(encBytes);

      expect(fullText).toContain('/V 2');
      expect(fullText).toContain('/R 3');
      expect(fullText).not.toContain('/AESV3');
      expect(fullText).not.toContain('/AESV2');

      const pdfDoc = await pdfjsLib.getDocument({
        data: encBytes,
        password: userPassword
      }).promise;

      expect(pdfDoc.numPages).toBe(1);
    });

    it('correctly detects rc4-128 standard via detectSecurity()', async () => {
      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'LegacyTestPass',
        encryptionLevel: 'rc4-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const status = await securityService.detectSecurity(encBytes);

      expect(status.isEncrypted).toBe(true);
      expect(status.encryptionStandard).toBe('rc4-128');
    });

    it('preserves byte-identical output across runs when deterministic inputs are used', async () => {
      const fixedDocId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const keysA = securityService.computeStandard128Keys('userPass', 'ownerPass', -4, fixedDocId);
      const keysB = securityService.computeStandard128Keys('userPass', 'ownerPass', -4, fixedDocId);

      expect(keysA.oHex).toBe(keysB.oHex);
      expect(keysA.uHex).toBe(keysB.uHex);
      expect(keysA.idHex).toBe(keysB.idHex);

      const runA = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'LegacyPassword123',
        ownerPassword: 'LegacyOwner456',
        encryptionLevel: 'rc4-128',
        docId: fixedDocId
      });

      const runB = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'LegacyPassword123',
        ownerPassword: 'LegacyOwner456',
        encryptionLevel: 'rc4-128',
        docId: fixedDocId
      });

      const bytesA = new Uint8Array(await runA.file.arrayBuffer());
      const bytesB = new Uint8Array(await runB.file.arrayBuffer());

      expect(bytesA.length).toBe(bytesB.length);
      expect(Array.from(bytesA)).toEqual(Array.from(bytesB));
    });
  });

  // =========================================================================
  // 5. GRANULAR PERMISSIONS BITMASK
  // =========================================================================

  describe('Granular Permissions Bitmask', () => {
    it('correctly calculates 32-bit permission flags according to ISO 32000 specification', async () => {
      // Test full restrictions
      const fullRestrictedResult = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'UserPass1',
        ownerPassword: 'OwnerPass1',
        encryptionLevel: 'aes-256',
        permissions: {
          allowPrinting: 'none',
          allowCopying: false,
          allowModifying: false,
          allowFillingForms: false,
          allowAnnotating: false,
          allowContentAccessibility: false,
          allowDocumentAssembly: false
        }
      });

      const encBytes = new Uint8Array(await fullRestrictedResult.file.arrayBuffer());
      const text = new TextDecoder('latin1').decode(encBytes);

      // Extract /P integer from trailer/dictionary
      const pMatch = text.match(/\/P\s+(-?\d+)/);
      expect(pMatch).not.toBeNull();
      const pVal = parseInt(pMatch![1], 10);

      // Verify bit flags:
      // Bit 3 (4): Print -> must be 0
      // Bit 4 (8): Modify -> must be 0
      // Bit 5 (16): Copy -> must be 0
      // Bit 6 (32): Annotate -> must be 0
      // Bit 9 (256): Forms -> must be 0
      // Bit 11 (1024): Assemble -> must be 0
      // Bit 12 (2048): High-res Print -> must be 0
      expect((pVal & 4)).toBe(0);
      expect((pVal & 8)).toBe(0);
      expect((pVal & 16)).toBe(0);
      expect((pVal & 32)).toBe(0);
      expect((pVal & 256)).toBe(0);
      expect((pVal & 1024)).toBe(0);
      expect((pVal & 2048)).toBe(0);
    });

    it('enforces print permissions when low-resolution or high-resolution is allowed', async () => {
      // Low resolution printing
      const lowResResult = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'Pass',
        encryptionLevel: 'aes-256',
        permissions: {
          allowPrinting: 'low-resolution',
          allowCopying: true,
          allowModifying: false,
          allowFillingForms: true,
          allowAnnotating: true,
          allowContentAccessibility: true,
          allowDocumentAssembly: false
        }
      });

      const encBytes = new Uint8Array(await lowResResult.file.arrayBuffer());
      const text = new TextDecoder('latin1').decode(encBytes);
      const pMatch = text.match(/\/P\s+(-?\d+)/);
      const pVal = parseInt(pMatch![1], 10);

      // Low resolution print: Bit 3 is set (4), Bit 12 is NOT set (2048)
      expect((pVal & 4)).toBe(4);
      expect((pVal & 2048)).toBe(0);
      // Copying: Bit 5 is set (16)
      expect((pVal & 16)).toBe(16);
      // Forms: Bit 9 is set (256)
      expect((pVal & 256)).toBe(256);
    });
  });

  // =========================================================================
  // 6. QUOTA & STORAGE SERVICE INTEGRATION
  // =========================================================================

  describe('StorageService Daily Quota Tracking', () => {
    it('saves protected output file through StorageService.saveFile()', async () => {
      const saveSpy = vi.spyOn(storageService, 'saveFile');

      await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'TestStoragePass',
        encryptionLevel: 'aes-256'
      });

      expect(saveSpy).toHaveBeenCalledWith(
        expect.any(File),
        'protected_pdf'
      );
    });
  });

  // =========================================================================
  // 7. REAL TEST DATA: 1-PAGE, 50-PAGE COMPLEX, AND PRE-ENCRYPTED PDFS
  // =========================================================================

  describe('Step 2: Real Test Data Comprehensive Verification', () => {
    const complexPdfBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'multipage-55pages.pdf')));
    const preEncryptedBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'password-protected.pdf')));

    it('encrypts 55-page complex PDF with AES-256 (User only) and verifies all 55 pages open cleanly', async () => {
      const userPass = 'Complex55UserPass!';
      const result = await securityService.protectPdf(complexPdfBytes, {
        userPassword: userPass,
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const pdfDoc = await pdfjsLib.getDocument({ data: encBytes, password: userPass }).promise;

      expect(pdfDoc.numPages).toBe(55);
      const page1 = await pdfDoc.getPage(1);
      expect(page1.pageNumber).toBe(1);
      const page25 = await pdfDoc.getPage(25);
      expect(page25.pageNumber).toBe(25);
      const page55 = await pdfDoc.getPage(55);
      expect(page55.pageNumber).toBe(55);
    });

    it('encrypts 55-page complex PDF with AES-128 (User + Owner) and opens cleanly', async () => {
      const userPass = 'ComplexUserAes128!';
      const ownerPass = 'ComplexOwnerAes128!';
      const result = await securityService.protectPdf(complexPdfBytes, {
        userPassword: userPass,
        ownerPassword: ownerPass,
        encryptionLevel: 'aes-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const userDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: userPass }).promise;
      expect(userDoc.numPages).toBe(55);

      const ownerDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: ownerPass }).promise;
      expect(ownerDoc.numPages).toBe(55);
    });

    it('encrypts 55-page complex PDF with Legacy RC4 (User + Owner) and preserves structure', async () => {
      const userPass = 'ComplexRc4User!';
      const ownerPass = 'ComplexRc4Owner!';
      const result = await securityService.protectPdf(complexPdfBytes, {
        userPassword: userPass,
        ownerPassword: ownerPass,
        encryptionLevel: 'rc4-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const pdfDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: userPass }).promise;
      expect(pdfDoc.numPages).toBe(55);
    });

    it('detects pre-encrypted PDF status and rejects re-protect without source password', async () => {
      // Create real pre-encrypted PDF test vector
      const encryptedVector = await securityService.protectPdf(samplePdfBytes, {
        userPassword: 'OriginalUserPass!',
        ownerPassword: 'OriginalOwnerPass!',
        encryptionLevel: 'aes-256'
      });
      const preEncryptedBytes = new Uint8Array(await encryptedVector.file.arrayBuffer());

      const status = await securityService.detectSecurity(preEncryptedBytes);
      expect(status.isEncrypted).toBe(true);
      expect(status.requiresUserPassword).toBe(true);
      expect(status.encryptionStandard).toBe('aes-256');

      // Attempting to protect without existing password throws clear error
      await expect(
        securityService.protectPdf(preEncryptedBytes, {
          userPassword: 'NewPassword123!',
          encryptionLevel: 'aes-128'
        })
      ).rejects.toThrow(/Document is already password-protected/);
    });

    it('successfully re-encrypts pre-encrypted PDF when sourcePassword is provided', async () => {
      const originalPass = 'OriginalSecretPass!';
      const newPass = 'ReEncryptedPass2026!';

      const initialEnc = await securityService.protectPdf(samplePdfBytes, {
        userPassword: originalPass,
        encryptionLevel: 'aes-256'
      });
      const preEncryptedBytes = new Uint8Array(await initialEnc.file.arrayBuffer());

      const result = await securityService.protectPdf(preEncryptedBytes, {
        sourcePassword: originalPass,
        userPassword: newPass,
        encryptionLevel: 'aes-128'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      // Re-encrypted document opens with new password
      const newDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: newPass }).promise;
      expect(newDoc.numPages).toBe(1);

      // Old password no longer works
      await expect(
        pdfjsLib.getDocument({ data: encBytes.slice(), password: originalPass }).promise
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 8. CYBERSECURITY STRESS-TESTING SUITE
  // =========================================================================

  describe('Step 5: Cybersecurity Stress-Testing & Hardening', () => {
    it('Owner Password Bypass: User Password strictly enforces restricted permissions while Owner password grants full access', async () => {
      const userPass = 'RestrictedUser2026!';
      const ownerPass = 'UnrestrictedMaster2026!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: userPass,
        ownerPassword: ownerPass,
        encryptionLevel: 'aes-256',
        permissions: {
          allowPrinting: 'none',
          allowCopying: false,
          allowModifying: false,
          allowFillingForms: false,
          allowAnnotating: false,
          allowContentAccessibility: false,
          allowDocumentAssembly: false
        }
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      // Open with User password
      const userDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: userPass }).promise;
      const userPerms = await (userDoc as any).getPermissions?.();
      expect(userPerms).toBeDefined();
      // Print (4) and Copy (16) must NOT be permitted
      expect(userPerms).not.toContain(4);
      expect(userPerms).not.toContain(16);

      // Open with Owner password
      const ownerDoc = await pdfjsLib.getDocument({ data: encBytes.slice(), password: ownerPass }).promise;
      expect(ownerDoc.numPages).toBe(1);
    });

    it('Weak IV Generation: Cryptographically random IVs are unique with zero reuse across all document streams', async () => {
      const complexPdfBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'multipage-55pages.pdf')));

      const result = await securityService.protectPdf(complexPdfBytes, {
        userPassword: 'StrongRandomIvTest2026!',
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(encBytes, { ignoreEncryption: true });

      const streamIVs = new Set<string>();
      let totalStreams = 0;

      const indirectObjs = pdfDoc.context.enumerateIndirectObjects();
      for (const [, obj] of indirectObjs) {
        if ((obj as any).contents && (obj as any).contents instanceof Uint8Array) {
          const contents = (obj as any).contents as Uint8Array;
          if (contents.length >= 16) {
            const iv = contents.subarray(0, 16);
            const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');

            // Verify IV is not trivial (not all 0s)
            expect(iv.some(b => b !== 0)).toBe(true);

            // Verify no IV reuse
            expect(streamIVs.has(ivHex)).toBe(false);
            streamIVs.add(ivHex);
            totalStreams++;
          }
        }
      }

      expect(totalStreams).toBeGreaterThan(0);
      expect(streamIVs.size).toBe(totalStreams);
    });

    it('Empty password edge case: Permissions-only protection (empty User password, non-empty Owner password)', async () => {
      const ownerPass = 'AdministratorKey2026!';

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: '',
        ownerPassword: ownerPass,
        encryptionLevel: 'aes-256',
        permissions: {
          allowPrinting: 'none',
          allowCopying: false,
          allowModifying: false,
          allowFillingForms: true,
          allowAnnotating: false,
          allowContentAccessibility: true,
          allowDocumentAssembly: false
        }
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      // Should open cleanly without password prompt (empty string password)
      const openDoc = await pdfjsLib.getDocument({ data: encBytes, password: '' }).promise;
      expect(openDoc.numPages).toBe(1);

      // Permissions should be restricted
      const perms = await (openDoc as any).getPermissions?.();
      expect(perms).toBeDefined();
      expect(perms).not.toContain(4); // No printing
      expect(perms).not.toContain(16); // No copying
      expect(perms).toContain(256); // Forms allowed
      expect(perms).toContain(512); // Accessibility allowed
    });

    it('Unicode password normalization: Handles SASLprep, emojis, accented characters, and non-breaking spaces', async () => {
      // Password with non-breaking space, accented characters, and emoji
      const unicodePass = 'P@ssw\u00A0órd2026🔒';
      const prepped = saslPrep(unicodePass);
      expect(prepped).toContain(' '); // Non-breaking space mapped to standard space

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: unicodePass,
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());

      // Successfully authenticates and opens in pdfjs-dist with the Unicode password
      const pdfDoc = await pdfjsLib.getDocument({ data: encBytes, password: unicodePass }).promise;
      expect(pdfDoc.numPages).toBe(1);
    });

    it('Passwords exceeding 127 UTF-8 bytes are safely truncated per ISO 32000-2 Section 7.6.4.3.4', async () => {
      // 200 character password
      const longPass = 'A'.repeat(200);
      const normalizedBytes = normalizePasswordToBytes(longPass);
      expect(normalizedBytes.length).toBe(127);

      const result = await securityService.protectPdf(samplePdfBytes, {
        userPassword: longPass,
        encryptionLevel: 'aes-256'
      });

      const encBytes = new Uint8Array(await result.file.arrayBuffer());
      const pdfDoc = await pdfjsLib.getDocument({ data: encBytes, password: longPass }).promise;
      expect(pdfDoc.numPages).toBe(1);
    });
  });
});
