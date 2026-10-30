import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

import { PdfBatchSecurityService } from './pdf-batch-security.service';
import { PdfSecurityService } from './pdf-security.service';
import { StorageService } from './storage.service';
import { HeadlessCanvasContext2D } from '../utilities/canvas-headless.util';
import {
  BatchSecurityQueueItem,
  BatchProtectOptions,
  BatchUnlockOptions
} from '../models/pdf-security.types';

const FIXTURES_DIR = path.resolve('e2e/test-data/audit');

describe('PdfBatchSecurityService — Batch Protect & Unlock Engine', () => {
  let batchService: PdfBatchSecurityService;
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
      providers: [PdfBatchSecurityService, PdfSecurityService, StorageService]
    });

    batchService = TestBed.inject(PdfBatchSecurityService);
    securityService = TestBed.inject(PdfSecurityService);
    storageService = TestBed.inject(StorageService);

    vi.spyOn(storageService, 'getQuotaStatus').mockResolvedValue({
      remaining: 100,
      isUnlimited: true,
      limit: 100,
      canStart: true
    });

    samplePdfBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, 'standard-1page.pdf')));
  });

  // Helper to create a dummy File
  function createPdfFile(name: string, bytes: Uint8Array): File {
    return new File([bytes], name, { type: 'application/pdf' });
  }

  // =========================================================================
  // 1. FILE INSPECTION
  // =========================================================================
  describe('inspectBatchFiles', () => {
    it('accurately parses multiple PDF files and extracts metadata without blocking', async () => {
      const file1 = createPdfFile('doc1.pdf', samplePdfBytes);
      const file2 = createPdfFile('doc2.pdf', samplePdfBytes);

      const items = await batchService.inspectBatchFiles([file1, file2]);

      expect(items.length).toBe(2);
      expect(items[0].name).toBe('doc1.pdf');
      expect(items[0].pageCount).toBe(1);
      expect(items[0].status).toBe('ready');
      expect(items[0].sizeBytes).toBe(samplePdfBytes.byteLength);

      expect(items[1].name).toBe('doc2.pdf');
      expect(items[1].pageCount).toBe(1);
      expect(items[1].status).toBe('ready');
    });
  });

  // =========================================================================
  // 2. BATCH PROTECT
  // =========================================================================
  describe('processBatchProtect', () => {
    it('encrypts multiple PDFs with AES-256 and shared credentials', async () => {
      const file1 = createPdfFile('fileA.pdf', samplePdfBytes);
      const file2 = createPdfFile('fileB.pdf', samplePdfBytes);
      const items = await batchService.inspectBatchFiles([file1, file2]);

      const options: BatchProtectOptions = {
        standard: 'aes-256',
        userPassword: 'SharedUserPassword123!',
        ownerPassword: 'SharedOwnerPassword456!'
      };

      const progressSteps: number[] = [];
      const summary = await batchService.processBatchProtect(items, options, p => {
        progressSteps.push(p.completed);
      });

      expect(summary.total).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(0);
      expect(progressSteps.length).toBeGreaterThanOrEqual(2);

      // Verify each result file is encrypted and can be decrypted with the user password
      for (const item of items) {
        expect(item.status).toBe('success');
        expect(item.resultFile).toBeDefined();

        const encryptedBytes = new Uint8Array(await item.resultFile!.arrayBuffer());
        const doc = await pdfjsLib.getDocument({
          data: encryptedBytes,
          password: 'SharedUserPassword123!'
        }).promise;

        expect(doc.numPages).toBe(1);
      }
    });

    it('encrypts multiple PDFs with AES-128 standard', async () => {
      const file1 = createPdfFile('file128_1.pdf', samplePdfBytes);
      const file2 = createPdfFile('file128_2.pdf', samplePdfBytes);
      const items = await batchService.inspectBatchFiles([file1, file2]);

      const options: BatchProtectOptions = {
        standard: 'aes-128',
        userPassword: 'Aes128Password999!'
      };

      const summary = await batchService.processBatchProtect(items, options);

      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(0);
    });

    it('batch protects 5 unencrypted PDFs with shared credentials (Step 2 Verification)', async () => {
      const files = [
        createPdfFile('batch_p1.pdf', samplePdfBytes),
        createPdfFile('batch_p2.pdf', samplePdfBytes),
        createPdfFile('batch_p3.pdf', samplePdfBytes),
        createPdfFile('batch_p4.pdf', samplePdfBytes),
        createPdfFile('batch_p5.pdf', samplePdfBytes)
      ];

      const items = await batchService.inspectBatchFiles(files);
      expect(items.length).toBe(5);

      const options: BatchProtectOptions = {
        standard: 'aes-256',
        userPassword: 'Batch5UserSecret2026!',
        ownerPassword: 'Batch5OwnerMaster2026!'
      };

      const summary = await batchService.processBatchProtect(items, options);

      expect(summary.total).toBe(5);
      expect(summary.successCount).toBe(5);
      expect(summary.failureCount).toBe(0);

      // Verify each of the 5 files opens cleanly in pdfjs-dist with the user password
      for (const item of items) {
        expect(item.status).toBe('success');
        expect(item.resultFile).toBeDefined();

        const encBuf = new Uint8Array(await item.resultFile!.arrayBuffer());
        const doc = await pdfjsLib.getDocument({
          data: encBuf,
          password: 'Batch5UserSecret2026!'
        }).promise;
        expect(doc.numPages).toBe(1);
      }
    }, 45000);
  });

  // =========================================================================
  // 3. BATCH UNLOCK & RESILIENT ERROR HANDLING (N3 CORE ACCEPTANCE)
  // =========================================================================
  describe('processBatchUnlock — Resilient Handling & Decryption', () => {
    it('completes the other 3 files successfully when 1 file in a 4-file batch has an invalid password', async () => {
      const correctPassword = 'MasterPassword2026!';
      const differentPassword = 'SecretOtherPassword999!';

      // Create 3 files encrypted with correctPassword and 1 with differentPassword
      const prot1 = await securityService.protectPdf(samplePdfBytes, {
        userPassword: correctPassword,
        encryptionLevel: 'aes-256'
      });
      const prot2 = await securityService.protectPdf(samplePdfBytes, {
        userPassword: differentPassword,
        encryptionLevel: 'aes-256'
      });
      const prot3 = await securityService.protectPdf(samplePdfBytes, {
        userPassword: correctPassword,
        encryptionLevel: 'aes-256'
      });
      const prot4 = await securityService.protectPdf(samplePdfBytes, {
        userPassword: correctPassword,
        encryptionLevel: 'aes-256'
      });

      const file1 = createPdfFile('doc1_correct.pdf', new Uint8Array(await prot1.file.arrayBuffer()));
      const file2 = createPdfFile('doc2_wrong_pwd.pdf', new Uint8Array(await prot2.file.arrayBuffer()));
      const file3 = createPdfFile('doc3_correct.pdf', new Uint8Array(await prot3.file.arrayBuffer()));
      const file4 = createPdfFile('doc4_correct.pdf', new Uint8Array(await prot4.file.arrayBuffer()));

      const items = await batchService.inspectBatchFiles([file1, file2, file3, file4]);

      expect(items.length).toBe(4);

      // Attempt to batch unlock with correctPassword as master password
      const unlockOptions: BatchUnlockOptions = {
        masterPassword: correctPassword
      };

      const summary = await batchService.processBatchUnlock(items, unlockOptions);

      // Core Acceptance Assertions:
      // 1. Total is 4
      expect(summary.total).toBe(4);
      // 2. Exactly 3 files succeeded
      expect(summary.successCount).toBe(3);
      // 3. Exactly 1 file failed
      expect(summary.failureCount).toBe(1);

      // 4. Results log accurately identifies the failed file
      const failedItem = items.find(i => i.name === 'doc2_wrong_pwd.pdf');
      expect(failedItem).toBeDefined();
      expect(failedItem!.status).toBe('failed');
      expect(failedItem!.error).toBeDefined();

      // 5. The other 3 files succeeded
      const successItems = items.filter(i => i.name !== 'doc2_wrong_pwd.pdf');
      expect(successItems.length).toBe(3);
      for (const item of successItems) {
        expect(item.status).toBe('success');
        expect(item.resultFile).toBeDefined();

        // 6. Unprotecting an encrypted file produces an unencrypted readable PDF
        const unencryptedBytes = new Uint8Array(await item.resultFile!.arrayBuffer());
        // Should open in pdfjs-dist WITHOUT a password
        const doc = await pdfjsLib.getDocument({ data: unencryptedBytes.slice(0) }).promise;
        expect(doc.numPages).toBe(1);

        // Should also open in pdf-lib directly without throwing password errors
        const pdfLibDoc = await PDFDocument.load(unencryptedBytes.slice(0));
        expect(pdfLibDoc.getPageCount()).toBe(1);
      }
    }, 30000);

    it('supports per-file password overrides in batch unlock', async () => {
      const pwdA = 'PasswordAlpha!';
      const pwdB = 'PasswordBeta!';

      const protA = await securityService.protectPdf(samplePdfBytes, {
        userPassword: pwdA,
        encryptionLevel: 'aes-256'
      });
      const protB = await securityService.protectPdf(samplePdfBytes, {
        userPassword: pwdB,
        encryptionLevel: 'aes-256'
      });

      const fileA = createPdfFile('docA.pdf', new Uint8Array(await protA.file.arrayBuffer()));
      const fileB = createPdfFile('docB.pdf', new Uint8Array(await protB.file.arrayBuffer()));

      const items = await batchService.inspectBatchFiles([fileA, fileB]);
      items[0].password = pwdA;
      items[1].password = pwdB;

      const summary = await batchService.processBatchUnlock(items, {});

      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(0);
    }, 30000);

    it('batch unlocks 5 encrypted PDFs where 1 file has an incorrect password (4 succeed, 1 cleanly flagged)', async () => {
      const correctPassword = 'MasterUnlock2026!';
      const incorrectPassword = 'WrongDifferentPassword999!';

      // Create 4 files with correctPassword and 1 with incorrectPassword
      const prot1 = await securityService.protectPdf(samplePdfBytes, { userPassword: correctPassword, encryptionLevel: 'aes-256' });
      const prot2 = await securityService.protectPdf(samplePdfBytes, { userPassword: correctPassword, encryptionLevel: 'aes-256' });
      const prot3 = await securityService.protectPdf(samplePdfBytes, { userPassword: incorrectPassword, encryptionLevel: 'aes-256' });
      const prot4 = await securityService.protectPdf(samplePdfBytes, { userPassword: correctPassword, encryptionLevel: 'aes-256' });
      const prot5 = await securityService.protectPdf(samplePdfBytes, { userPassword: correctPassword, encryptionLevel: 'aes-256' });

      const file1 = createPdfFile('doc1.pdf', new Uint8Array(await prot1.file.arrayBuffer()));
      const file2 = createPdfFile('doc2.pdf', new Uint8Array(await prot2.file.arrayBuffer()));
      const file3 = createPdfFile('doc3_wrong.pdf', new Uint8Array(await prot3.file.arrayBuffer()));
      const file4 = createPdfFile('doc4.pdf', new Uint8Array(await prot4.file.arrayBuffer()));
      const file5 = createPdfFile('doc5.pdf', new Uint8Array(await prot5.file.arrayBuffer()));

      const items = await batchService.inspectBatchFiles([file1, file2, file3, file4, file5]);
      expect(items.length).toBe(5);

      const summary = await batchService.processBatchUnlock(items, {
        masterPassword: correctPassword
      });

      // Strict Step 2 requirements:
      // 1. Total is 5
      expect(summary.total).toBe(5);
      // 2. Exactly 4 files succeeded
      expect(summary.successCount).toBe(4);
      // 3. Exactly 1 file failed
      expect(summary.failureCount).toBe(1);

      // 4. Failed file is cleanly flagged
      const failed = items.find(i => i.name === 'doc3_wrong.pdf');
      expect(failed).toBeDefined();
      expect(failed!.status).toBe('failed');
      expect(failed!.statusMessage).toBe('Incorrect password');

      // 5. Four successful files are decrypted into valid unencrypted PDFs
      const succeeded = items.filter(i => i.name !== 'doc3_wrong.pdf');
      expect(succeeded.length).toBe(4);
      for (const item of succeeded) {
        expect(item.status).toBe('success');
        expect(item.resultFile).toBeDefined();

        const decBuf = new Uint8Array(await item.resultFile!.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data: decBuf.slice(0) }).promise;
        expect(doc.numPages).toBe(1);
      }
    }, 45000);
  });

  // =========================================================================
  // 4. PACKAGING & EXPORT (ZIP & INDIVIDUAL SAVE)
  // =========================================================================
  describe('createZipPackage', () => {
    it('packages all successfully processed files into a compressed ZIP', async () => {
      const file1 = createPdfFile('export1.pdf', samplePdfBytes);
      const file2 = createPdfFile('export2.pdf', samplePdfBytes);

      const items = await batchService.inspectBatchFiles([file1, file2]);
      await batchService.processBatchProtect(items, {
        standard: 'aes-256',
        userPassword: 'ZipTestPassword123!'
      });

      const zipPkg = await batchService.createZipPackage(items, 'test_export.zip');

      expect(zipPkg.fileName).toBe('test_export.zip');
      expect(zipPkg.fileCount).toBe(2);
      expect(zipPkg.blob.size).toBeGreaterThan(0);

      // Verify ZIP contents using JSZip
      const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
      const filenames = Object.keys(zip.files);
      expect(filenames.length).toBe(2);
      expect(filenames.some(f => f.includes('export1'))).toBe(true);
      expect(filenames.some(f => f.includes('export2'))).toBe(true);
    });

    it('throws error when no successfully processed items exist to zip', async () => {
      const failedItem: BatchSecurityQueueItem = {
        id: '1',
        name: 'fail.pdf',
        file: createPdfFile('fail.pdf', new Uint8Array([1, 2, 3])),
        sizeBytes: 3,
        pageCount: 1,
        status: 'failed',
        error: 'Invalid password'
      };

      await expect(batchService.createZipPackage([failedItem])).rejects.toThrow(
        'No successfully processed files to package into ZIP.'
      );
    });
  });

  // =========================================================================
  // 5. CANCELLATION & ABORT CONTROLLER
  // =========================================================================
  describe('AbortController cancellation', () => {
    it('stops processing remaining items when aborted', async () => {
      const file1 = createPdfFile('abort1.pdf', samplePdfBytes);
      const file2 = createPdfFile('abort2.pdf', samplePdfBytes);
      const file3 = createPdfFile('abort3.pdf', samplePdfBytes);

      const items = await batchService.inspectBatchFiles([file1, file2, file3]);

      const controller = new AbortController();
      // Abort immediately before or at step 1
      controller.abort();

      const summary = await batchService.processBatchProtect(
        items,
        { standard: 'aes-256', userPassword: 'Test' },
        undefined,
        controller.signal
      );

      expect(summary.successCount).toBe(0);
      expect(items.every(i => i.status === 'skipped')).toBe(true);
    });
  });

  // =========================================================================
  // 6. QUOTA LIMIT INTEGRATION
  // =========================================================================
  describe('Quota Integration', () => {
    it('pauses cleanly when daily quota limit is reached', async () => {
      // Simulate quota limit of only 1 remaining operation
      vi.spyOn(storageService, 'getQuotaStatus').mockResolvedValue({
        remaining: 1,
        isUnlimited: false,
        limit: 10,
        canStart: true
      });

      const file1 = createPdfFile('quota1.pdf', samplePdfBytes);
      const file2 = createPdfFile('quota2.pdf', samplePdfBytes);
      const file3 = createPdfFile('quota3.pdf', samplePdfBytes);

      const items = await batchService.inspectBatchFiles([file1, file2, file3]);

      const summary = await batchService.processBatchProtect(items, {
        standard: 'aes-256',
        userPassword: 'Password123!'
      });

      // Item 1 succeeds, items 2 and 3 are cleanly paused/skipped due to quota limit
      expect(summary.successCount).toBe(1);
      expect(items[0].status).toBe('success');
      expect(items[1].status).toBe('skipped');
      expect(items[2].status).toBe('skipped');
      expect(items[1].statusMessage).toContain('quota');
    });
  });

  // =========================================================================
  // 7. CYBERSECURITY STRESS-TESTING (STEP 5 HARDENING)
  // =========================================================================
  describe('Cybersecurity Stress-Testing', () => {
    it('defends against Zip Slip and path traversal in archive entries', async () => {
      // Create items with malicious path traversal names
      const maliciousNames = [
        '../../../../etc/passwd.pdf',
        '..\\..\\Windows\\System32\\calc.exe.pdf',
        '/var/root/confidential.pdf',
        'sub/dir/nested.pdf'
      ];

      for (const name of maliciousNames) {
        const sanitized = batchService.sanitizeZipEntryName(name);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
        expect(sanitized.endsWith('.pdf')).toBe(true);
      }

      // Verify createZipPackage safely packages items without directory escape
      const item: BatchSecurityQueueItem = {
        id: 'slip1',
        name: '../../../../etc/shadow.pdf',
        file: createPdfFile('dummy.pdf', samplePdfBytes),
        sizeBytes: samplePdfBytes.byteLength,
        status: 'success',
        resultFile: createPdfFile('../../../../etc/shadow.pdf', samplePdfBytes)
      };

      const zipPkg = await batchService.createZipPackage([item], '../../escape.zip');
      expect(zipPkg.fileName).not.toContain('..');

      const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
      const entries = Object.keys(zip.files);
      expect(entries.length).toBe(1);
      expect(entries[0]).not.toContain('..');
      expect(entries[0]).not.toContain('/');
      expect(entries[0]).toContain('etc_shadow.pdf');
    });

    it('enforces memory safeguards and rejects files exceeding 50MB single-file limit', async () => {
      // Mock a file object with 55MB size without creating a giant buffer
      const giantFile = {
        name: 'giant-55mb.pdf',
        size: 55 * 1024 * 1024,
        type: 'application/pdf',
        arrayBuffer: async () => new ArrayBuffer(10)
      } as unknown as File;

      const items = await batchService.inspectBatchFiles([giantFile]);
      expect(items.length).toBe(1);
      expect(items[0].status).toBe('failed');
      expect(items[0].error).toContain('50MB');
      expect(items[0].statusMessage).toContain('50MB');
    });

    it('enforces memory safeguards and bounds batch queue length (max 50 files)', async () => {
      const files: File[] = [];
      for (let i = 0; i < 55; i++) {
        files.push(createPdfFile(`doc_${i}.pdf', samplePdfBytes`));
      }

      const items = await batchService.inspectBatchFiles(files);
      expect(items.length).toBe(55);

      // First 50 are ready
      for (let i = 0; i < 50; i++) {
        expect(items[i].status).toBe('ready');
      }

      // Excess files (51-55) are cleanly rejected
      for (let i = 50; i < 55; i++) {
        expect(items[i].status).toBe('failed');
        expect(items[i].error).toContain('limit exceeded');
      }
    });

    it('sanitizes error messages to prevent credential leakage in audit logs', async () => {
      const secretPassword = 'UltraTopSecretPassword2026!';
      // Force an error with simulated error message containing the password
      const item: BatchSecurityQueueItem = {
        id: 'leak-test',
        name: 'leak_test.pdf',
        file: createPdfFile('leak_test.pdf', samplePdfBytes),
        sizeBytes: samplePdfBytes.byteLength,
        status: 'ready'
      };

      vi.spyOn(securityService, 'unlockPdf').mockRejectedValueOnce(
        new Error(`Decryption failed with password: '${secretPassword}'`)
      );

      const summary = await batchService.processBatchUnlock([item], {
        masterPassword: secretPassword
      });

      expect(summary.failureCount).toBe(1);
      expect(item.error).toBeDefined();
      // Strictly assert the secret password is NOT leaked in plaintext
      expect(item.error).not.toContain(secretPassword);
      expect(item.error).toContain('***');
    });
  });
});
