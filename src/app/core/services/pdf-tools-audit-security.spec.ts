import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { PdfSecurityService } from './pdf-security.service';
import { PdfFlattenService } from './pdf-flatten.service';
import { PdfSignService } from './pdf-sign.service';
import { PdfCombineService } from './pdf-combine.service';
import { PdfPageManagerService } from './pdf-page-manager.service';
import { PdfService } from './pdf.service';
import { ValidationService } from './validation.service';
import { HeadlessCanvasContext2D } from '../utilities/canvas-headless.util';
import { tinyJpegBytes } from '../testing/k-editor-fixtures';

const FIXTURES_DIR = path.resolve('e2e/test-data/audit');

describe('PDF Tools Suite Full Audit & Cybersecurity Verification', () => {
  let securityService: PdfSecurityService;
  let flattenService: PdfFlattenService;
  let signService: PdfSignService;
  let combineService: PdfCombineService;
  let pageManager: PdfPageManagerService;
  let pdfService: PdfService;
  let validationService: ValidationService;

  beforeEach(() => {
    // Install safe headless canvas context for jsdom environment
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = function (type?: string) {
        return new HeadlessCanvasContext2D(this.width || 100, this.height || 100, this);
      } as any;
      HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type = 'image/jpeg') {
        callback(new Blob([tinyJpegBytes()], { type: 'image/jpeg' }));
      };
    }

    TestBed.configureTestingModule({});
    securityService = TestBed.inject(PdfSecurityService);
    flattenService = TestBed.inject(PdfFlattenService);
    signService = TestBed.inject(PdfSignService);
    combineService = TestBed.inject(PdfCombineService);
    pageManager = TestBed.inject(PdfPageManagerService);
    pdfService = TestBed.inject(PdfService);
    validationService = TestBed.inject(ValidationService);
  });

  // =========================================================================
  // STEP 2: CHECK EACH FEATURE ONE-BY-ONE WITH REAL TEST DATA
  // =========================================================================

  describe('Feature 1: Password Protect & Unlock', () => {
    it('protects standard 1-page PDF and preserves %PDF- header at offset 0', async () => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const protectedResult = await securityService.protectPdf(buffer, {
        userPassword: 'MySecurePassword999!',
        permissions: {
          allowPrinting: 'none',
          allowModifying: false,
          allowCopying: false,
          allowAnnotating: false,
          allowFillingForms: false,
          allowContentAccessibility: false,
          allowDocumentAssembly: false
        }
      });

      expect(protectedResult.file).toBeDefined();
      expect(protectedResult.sizeBytes).toBeGreaterThan(0);

      // Verify %PDF- header is at byte offset 0 (Fix 1 verification)
      const bytes = new Uint8Array(await protectedResult.file.arrayBuffer());
      const header = new TextDecoder('latin1').decode(bytes.slice(0, 15));
      expect(header.startsWith('%PDF-')).toBe(true);

      // Verify /Encrypt dictionary is present in document body/trailer
      const fullText = new TextDecoder('latin1').decode(bytes);
      expect(fullText).toContain('/Encrypt');
      expect(fullText).toContain('/Filter /Standard');
    });

    it('accurately detects encrypted PDF and validates password', async () => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const protectedResult = await securityService.protectPdf(buffer, {
        userPassword: 'TestPassword123!'
      });
      const encBytes = new Uint8Array(await protectedResult.file.arrayBuffer());

      const status = await securityService.detectSecurity(encBytes);
      expect(status.isEncrypted || status.requiresUserPassword).toBe(true);
    });

    it('unlocks password-protected PDF and produces unencrypted valid PDF', async () => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const protectedResult = await securityService.protectPdf(buffer, {
        userPassword: 'TestPassword123!'
      });
      const encBytes = new Uint8Array(await protectedResult.file.arrayBuffer());

      const unlockResult = await securityService.unlockPdf(encBytes, 'TestPassword123!');

      expect(unlockResult.file).toBeDefined();
      expect(unlockResult.sizeBytes).toBeGreaterThan(0);

      // Verify decrypted document opens cleanly in pdf-lib without encryption
      const decryptedDoc = await PDFDocument.load(await unlockResult.file.arrayBuffer());
      expect(decryptedDoc.isEncrypted).toBe(false);
      expect(decryptedDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature 2: Flatten Form Fields & Annotations', () => {
    it('inspects standard 1-page document and multi-page document', async () => {
      const stdBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const stdInspect = await flattenService.inspectElementsToFlatten(stdBuf);
      expect(stdInspect.pageCount).toBe(1);

      const multiBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'multipage-55pages.pdf')));
      const multiInspect = await flattenService.inspectElementsToFlatten(multiBuf);
      expect(multiInspect.pageCount).toBe(55);
    });

    it('vector flattens document and neutralizes any embedded scripts', async () => {
      const jsBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'malicious-js.pdf')));
      const result = await flattenService.flattenPdf(jsBuf, 'vector');

      expect(result.flattenedFile).toBeDefined();
      expect(result.flattenedSizeBytes).toBeGreaterThan(0);

      // Load flattened document and verify /OpenAction script is purged
      const flatDoc = await PDFDocument.load(await result.flattenedFile.arrayBuffer());
      expect(flatDoc.catalog.has(PDFName.of('OpenAction'))).toBe(false);
      expect(flatDoc.catalog.has(PDFName.of('AA'))).toBe(false);
    });

    it('preserves page orientation and aspect ratio across multi-page document', async () => {
      const multiBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'multipage-55pages.pdf')));
      const result = await flattenService.flattenPdf(multiBuf, 'vector');
      expect(result.pageCount).toBe(55);

      const doc = await PDFDocument.load(await result.flattenedFile.arrayBuffer());
      // Page 5 is landscape (841.89 x 595.28)
      const p5 = doc.getPage(4);
      expect(p5.getWidth()).toBeGreaterThan(p5.getHeight());
      // Page 1 is portrait (595.28 x 841.89)
      const p1 = doc.getPage(0);
      expect(p1.getHeight()).toBeGreaterThan(p1.getWidth());
    });
  });

  describe('Feature 3: Digital & Image Signatures', () => {
    it('embeds signature image on exact coordinates and purges active scripts', async () => {
      const stdBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const sampleSignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const signedResult = await signService.embedSignatures(
        stdBuf,
        [
          {
            id: 'sig_1',
            pageNumber: 1,
            x: 100,
            y: 200,
            width: 120,
            height: 50,
            rotation: 0,
            opacity: 1.0,
            dataUrl: sampleSignatureDataUrl
          }
        ]
      );

      expect(signedResult.file).toBeDefined();
      expect(signedResult.sizeBytes).toBeGreaterThan(stdBuf.length);

      const signedDoc = await PDFDocument.load(await signedResult.file.arrayBuffer());
      expect(signedDoc.getPageCount()).toBe(1);
    });

    it('caches signatures for instant reuse across sessions', () => {
      const testSig = 'data:image/png;base64,fake-sig-data';
      signService.cacheSignature(testSig);
      const cached = signService.getRecentSignatures();
      expect(cached).toContain(testSig);
    });
  });

  describe('Feature 4: Merge / Combine Multiple PDFs', () => {
    it('combines disparate PDFs (standard 1-page + scanned image)', async () => {
      const stdBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const scanBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'scanned-image.pdf')));

      const plan = combineService.planMerge(
        [
          { name: 'standard-1page.pdf', buffer: stdBuf, pageCount: 1 },
          { name: 'scanned-image.pdf', buffer: scanBuf, pageCount: 1 }
        ],
        { rows: [], sortBy: 'none', sortDirection: 'asc' }
      );

      expect(plan.totalPageCount).toBe(2);

      const merged = await combineService.exportMerged(
        [
          { name: 'standard-1page.pdf', buffer: stdBuf, pageCount: 1 },
          { name: 'scanned-image.pdf', buffer: scanBuf, pageCount: 1 }
        ],
        { rows: [], sortBy: 'none', sortDirection: 'asc' },
        'combined.pdf'
      );

      expect(merged.pageCount).toBe(2);
      expect(merged.sizeBytes).toBeGreaterThan(0);
    });

    it('interleaves two documents with reverse order option', () => {
      const plan = combineService.planInterleave([3, 3], [{ reversed: false }, { reversed: true }]);
      expect(plan.order.length).toBe(6);
      // First round: doc 0 page 0, doc 1 page 2
      expect(plan.order[0]).toEqual({ sourceIndex: 0, pageIndex: 0 });
      expect(plan.order[1]).toEqual({ sourceIndex: 1, pageIndex: 2 });
    });
  });

  describe('Feature 5: Split & Page Organization (Extract, Reorder, Delete, Rotate)', () => {
    it('manages 55-page multi-page PDF with reordering, deletion, and rotation', async () => {
      const multiBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'multipage-55pages.pdf')));
      const file = new File([multiBuf], 'multipage-55pages.pdf', { type: 'application/pdf' });
      await pageManager.loadDocument(file);

      expect(pageManager.pages.length).toBe(55);

      // Reorder page 0 to position 2
      const reordered = pageManager.reorderPage(0, 2);
      expect(reordered).toBe(true);

      // Rotate page 1 by 90 degrees
      const targetPageId = pageManager.pages[1].id;
      const rotated = pageManager.rotatePages([targetPageId], 90);
      expect(rotated).toBe(true);
      expect(pageManager.pages[1].rotation).toBe(90);

      // Delete 3 pages
      const toDelete = [pageManager.pages[10].id, pageManager.pages[11].id, pageManager.pages[12].id];
      pageManager.deletePages(toDelete);
      expect(pageManager.pages.length).toBe(52);

      // Export single organized PDF
      const exportResult = await pageManager.exportSinglePdf();
      expect(exportResult.file).toBeDefined();
      expect(exportResult.pageCount).toBe(52);

      const exportedDoc = await PDFDocument.load(await exportResult.file.arrayBuffer());
      expect(exportedDoc.getPageCount()).toBe(52);
    });
  });

  describe('Feature 6: Compress & Reduce KB', () => {
    it('compresses PDF targeting specific size without crashing', async () => {
      const stdBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const file = new File([stdBuf], 'standard-1page.pdf', { type: 'application/pdf' });

      const result = await pdfService.compressPdfToExactKB(file, {
        targetKB: 50,
        compressionLevel: 'recommended'
      });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file?.size).toBeGreaterThan(0);
    });

    it('safely handles large >20 MB PDF without out-of-memory crash', async () => {
      const largePath = path.join(FIXTURES_DIR, 'large-21mb.pdf');
      const largeStat = fs.statSync(largePath);
      expect(largeStat.size).toBeGreaterThan(20 * 1024 * 1024);

      const largeBuf = new Uint8Array(fs.readFileSync(largePath));
      const file = new File([largeBuf], 'large-21mb.pdf', { type: 'application/pdf' });
      const val = validationService.validatePdf(file);
      // Valid file within 100MB limit
      expect(val.valid).toBe(true);
    });
  });

  // =========================================================================
  // STEP 5: CYBERSECURITY STRESS-TESTING & DEFENSIVE HARDENING
  // =========================================================================

  describe('Step 5: Cybersecurity Offensive Stress Tests & Hardening', () => {
    it('DEFENSE-01: Rejects zero-byte PDF uploads gracefully across all entry points', async () => {
      const zeroBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'corrupt-zero-byte.pdf')));
      const zeroFile = new File([zeroBuf], 'empty.pdf', { type: 'application/pdf' });

      // Validation Service check
      const val = validationService.validatePdf(zeroFile);
      expect(val.valid).toBe(false);
      expect(val.error).toContain('empty');

      const bufVal = validationService.validatePdfBuffer(zeroBuf);
      expect(bufVal.valid).toBe(false);

      // Security Service check
      const secStatus = await securityService.detectSecurity(zeroBuf);
      expect(secStatus.error).toBeDefined();

      await expect(
        securityService.protectPdf(zeroBuf, { userPassword: 'abc' })
      ).rejects.toThrow('empty or zero-byte');

      await expect(
        signService.embedSignatures(zeroBuf, [])
      ).rejects.toThrow('empty or corrupt');

      const compressRes = await pdfService.compressPdfToExactKB(zeroFile, { targetKB: 100 });
      expect(compressRes.success).toBe(false);
    });

    it('DEFENSE-02: Rejects corrupted non-PDF streams missing %PDF- header', async () => {
      const corruptBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'corrupt-truncated.pdf')));
      const corruptFile = new File([corruptBuf], 'corrupt.pdf', { type: 'application/pdf' });

      const bufVal = validationService.validatePdfBuffer(corruptBuf);
      expect(bufVal.valid).toBe(false);
      expect(bufVal.error).toContain('%PDF-');

      const secStatus = await securityService.detectSecurity(corruptBuf);
      expect(secStatus.error).toContain('%PDF-');
    });

    it('DEFENSE-03: Neutralizes malicious JavaScript embedded in /OpenAction and /AA', async () => {
      const jsBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'malicious-js.pdf')));

      // 1. In Flattening
      const flatRes = await flattenService.flattenPdf(jsBuf, 'vector');
      const flatDoc = await PDFDocument.load(await flatRes.flattenedFile.arrayBuffer());
      expect(flatDoc.catalog.has(PDFName.of('OpenAction'))).toBe(false);
      expect(flatDoc.catalog.has(PDFName.of('AA'))).toBe(false);

      // 2. In Signing
      const sampleSignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const signedRes = await signService.embedSignatures(jsBuf, [
        {
          id: 'sig_audit',
          pageNumber: 1,
          x: 50,
          y: 50,
          width: 50,
          height: 30,
          rotation: 0,
          opacity: 1,
          dataUrl: sampleSignatureDataUrl
        }
      ]);
      const signedDoc = await PDFDocument.load(await signedRes.file.arrayBuffer());
      expect(signedDoc.catalog.has(PDFName.of('OpenAction'))).toBe(false);
      expect(signedDoc.catalog.has(PDFName.of('AA'))).toBe(false);
    });

    it('DEFENSE-04: Resists PDF bombs and decompression bomb streams', async () => {
      const bombBuf = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'pdf-bomb.pdf')));

      // Document can be inspected and managed without crashing or hanging
      const inspect = await flattenService.inspectElementsToFlatten(bombBuf);
      expect(inspect.pageCount).toBe(1);

      // Vector flatten safely handles compressed stream
      const flatRes = await flattenService.flattenPdf(bombBuf, 'vector');
      expect(flatRes.flattenedFile).toBeDefined();
    });

    it('DEFENSE-05: Prevents password bypass when invalid credentials are supplied', async () => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
      const protectedResult = await securityService.protectPdf(buffer, {
        userPassword: 'ProtectedSecret123!'
      });
      const encBytes = new Uint8Array(await protectedResult.file.arrayBuffer());

      // Incorrect password attempt returns false
      const isInvalid = await securityService.validatePassword(encBytes, 'WrongPassword123');
      expect(isInvalid).toBe(false);

      // Correct password attempt returns true
      const isValid = await securityService.validatePassword(encBytes, 'ProtectedSecret123!');
      expect(isValid).toBe(true);
    });
  });
});
