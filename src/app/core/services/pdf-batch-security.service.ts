import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { PdfSecurityService } from './pdf-security.service';
import { StorageService } from './storage.service';
import {
  BatchSecurityMode,
  BatchSecurityQueueItem,
  BatchProtectOptions,
  BatchUnlockOptions,
  BatchSecurityProgress,
  BatchSecuritySummary,
  DEFAULT_PERMISSIONS
} from '../models/pdf-security.types';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfBatchSecurityService {
  public static readonly MAX_BATCH_ITEMS = 50;
  public static readonly MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50MB
  public static readonly MAX_CUMULATIVE_BATCH_BYTES = 200 * 1024 * 1024; // 200MB

  private pdfSecurity = inject(PdfSecurityService);
  private storageService = inject(StorageService, { optional: true });

  constructor() {}

  /**
   * Pre-inspects an array of uploaded files, checking for valid PDF signatures,
   * detecting existing encryption status, and enforcing memory bounds without blocking the UI.
   */
  async inspectBatchFiles(files: File[]): Promise<BatchSecurityQueueItem[]> {
    const queueItems: BatchSecurityQueueItem[] = [];
    let cumulativeBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const item: BatchSecurityQueueItem = {
        id: generateId(),
        file,
        name: file.name,
        sizeBytes: file.size,
        status: 'ready',
        pageCount: 1
      };

      // Memory bomb & queue exhaustion defense
      if (i >= PdfBatchSecurityService.MAX_BATCH_ITEMS) {
        item.status = 'failed';
        item.error = `Batch limit exceeded (maximum ${PdfBatchSecurityService.MAX_BATCH_ITEMS} files per batch)`;
        item.statusMessage = 'Batch limit exceeded';
        queueItems.push(item);
        continue;
      }

      if (file.size > PdfBatchSecurityService.MAX_SINGLE_FILE_BYTES) {
        item.status = 'failed';
        item.error = 'File exceeds maximum 50MB single-file limit';
        item.statusMessage = 'File exceeds 50MB limit';
        queueItems.push(item);
        continue;
      }

      cumulativeBytes += file.size;
      if (cumulativeBytes > PdfBatchSecurityService.MAX_CUMULATIVE_BATCH_BYTES) {
        item.status = 'failed';
        item.error = 'Cumulative batch size exceeds 200MB memory safeguard limit';
        item.statusMessage = 'Batch size limit exceeded';
        queueItems.push(item);
        continue;
      }

      try {
        const buf = await file.arrayBuffer();
        try {
          const doc = await PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
          item.pageCount = doc.getPageCount();
        } catch {
          item.pageCount = 1;
        }

        const securityStatus = await this.pdfSecurity.detectSecurity(buf.slice(0));
        item.isEncrypted = securityStatus.isEncrypted || securityStatus.requiresUserPassword;
        if (item.isEncrypted) {
          item.statusMessage = 'Protected Document';
        }
      } catch {
        item.pageCount = 1;
        item.isEncrypted = false;
      }

      queueItems.push(item);
      // Yield to main thread every 2 items during inspection
      if (i % 2 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    return queueItems;
  }

  /**
   * Batch protects multiple PDFs with shared passwords, permissions, and chosen encryption standard.
   * Processes files in chunks to keep the mobile UI responsive. Resilient against corrupted or single-file errors.
   */
  async processBatchProtect(
    items: BatchSecurityQueueItem[],
    options: BatchProtectOptions,
    onProgress?: (progress: BatchSecurityProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<BatchSecuritySummary> {
    const total = items.length;
    let successCount = 0;
    let failureCount = 0;

    // Quota pre-flight check
    let remainingQuota = Infinity;
    if (this.storageService) {
      try {
        const quotaStatus = await this.storageService.getQuotaStatus();
        if (quotaStatus.isUnlimited) {
          remainingQuota = Infinity;
        } else if (!quotaStatus.canStart || (quotaStatus.remaining !== null && quotaStatus.remaining <= 0)) {
          remainingQuota = 0;
        } else if (quotaStatus.remaining !== null) {
          remainingQuota = quotaStatus.remaining;
        }
      } catch {
        remainingQuota = Infinity;
      }
    }

    const permissions = options.permissions || DEFAULT_PERMISSIONS;

    for (let i = 0; i < total; i++) {
      if (abortSignal?.aborted) {
        for (let j = i; j < total; j++) {
          if (items[j].status === 'ready' || items[j].status === 'processing') {
            items[j].status = 'skipped';
            items[j].statusMessage = 'Cancelled by user';
          }
        }
        break;
      }

      const item = items[i];

      if (remainingQuota <= 0) {
        item.status = 'skipped';
        item.statusMessage = 'Daily free quota limit reached';
        continue;
      }

      item.status = 'processing';
      onProgress?.({
        total,
        completed: i,
        currentIndex: i + 1,
        currentFileName: item.name,
        successCount,
        failureCount
      });

      // Yield event loop to update progress bar and UI
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      try {
        const outFileName = this.buildOutputFileName(item.name, 'protected');
        const protectResult = await this.pdfSecurity.protectPdf(
          item.file,
          {
            userPassword: options.userPassword,
            ownerPassword: options.ownerPassword || options.userPassword,
            encryptionLevel: options.standard,
            permissions
          },
          outFileName
        );

        item.status = 'success';
        item.resultFile = protectResult.file;
        item.resultSizeBytes = protectResult.sizeBytes;
        item.statusMessage = 'Encrypted successfully';
        successCount++;
        if (remainingQuota !== Infinity) {
          remainingQuota--;
        }
      } catch (err: any) {
        item.status = 'failed';
        item.error = this.sanitizeErrorMessage(err, [options.userPassword, options.ownerPassword]);
        item.statusMessage = 'Encryption failed';
        failureCount++;
      }
    }

    onProgress?.({
      total,
      completed: total,
      currentIndex: total,
      currentFileName: 'Complete',
      successCount,
      failureCount
    });

    return {
      mode: 'protect',
      total,
      successCount,
      failureCount,
      items
    };
  }

  /**
   * Batch decrypts multiple locked PDFs using a master password or per-file credentials.
   * Produces unencrypted readable PDFs while gracefully skipping wrong password failures.
   */
  async processBatchUnlock(
    items: BatchSecurityQueueItem[],
    options: BatchUnlockOptions,
    onProgress?: (progress: BatchSecurityProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<BatchSecuritySummary> {
    const total = items.length;
    let successCount = 0;
    let failureCount = 0;

    // Quota pre-flight check
    let remainingQuota = Infinity;
    if (this.storageService) {
      try {
        const quotaStatus = await this.storageService.getQuotaStatus();
        if (quotaStatus.isUnlimited) {
          remainingQuota = Infinity;
        } else if (!quotaStatus.canStart || (quotaStatus.remaining !== null && quotaStatus.remaining <= 0)) {
          remainingQuota = 0;
        } else if (quotaStatus.remaining !== null) {
          remainingQuota = quotaStatus.remaining;
        }
      } catch {
        remainingQuota = Infinity;
      }
    }

    for (let i = 0; i < total; i++) {
      if (abortSignal?.aborted) {
        for (let j = i; j < total; j++) {
          if (items[j].status === 'ready' || items[j].status === 'processing') {
            items[j].status = 'skipped';
            items[j].statusMessage = 'Cancelled by user';
          }
        }
        break;
      }

      const item = items[i];

      if (remainingQuota <= 0) {
        item.status = 'skipped';
        item.statusMessage = 'Daily free quota limit reached';
        continue;
      }

      item.status = 'processing';
      onProgress?.({
        total,
        completed: i,
        currentIndex: i + 1,
        currentFileName: item.name,
        successCount,
        failureCount
      });

      // Yield event loop
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      const passwordToUse = (
        item.password ||
        options.perFilePasswords?.[item.id] ||
        options.masterPassword ||
        ''
      ).trim();

      if (!passwordToUse) {
        item.status = 'failed';
        item.error = 'No password provided';
        item.statusMessage = 'No password provided';
        failureCount++;
        continue;
      }

      try {
        const outFileName = this.buildOutputFileName(item.name, 'unlocked');
        const unlockResult = await this.pdfSecurity.unlockPdf(
          item.file,
          passwordToUse,
          outFileName
        );

        item.status = 'success';
        item.resultFile = unlockResult.file;
        item.resultSizeBytes = unlockResult.sizeBytes;
        item.statusMessage = 'Unlocked successfully';
        // Memory security: clear sensitive password once unlocked
        item.password = undefined;
        successCount++;
        if (remainingQuota !== Infinity) {
          remainingQuota--;
        }
      } catch (err: any) {
        item.status = 'failed';
        item.error = this.sanitizeErrorMessage(err, [passwordToUse, options.masterPassword]);
        item.statusMessage = 'Incorrect password';
        failureCount++;
      }
    }

    onProgress?.({
      total,
      completed: total,
      currentIndex: total,
      currentFileName: 'Complete',
      successCount,
      failureCount
    });

    return {
      mode: 'unlock',
      total,
      successCount,
      failureCount,
      items
    };
  }

  /**
   * Packages all successfully processed files into a single ZIP archive.
   * Sanitizes entry names to prevent Zip Slip / path traversal vulnerabilities,
   * handles duplicate file names, and bounds heap memory usage.
   */
  async createZipPackage(
    items: BatchSecurityQueueItem[],
    zipName = 'batch_security_files.zip'
  ): Promise<{ blob: Blob; fileName: string; fileCount: number }> {
    const zip = new JSZip();
    let fileCount = 0;
    let totalUncompressedBytes = 0;
    const MAX_UNCOMPRESSED_ZIP_BYTES = 300 * 1024 * 1024; // 300MB heap safeguard

    // Sanitize zip archive container name
    const safeZipName = this.sanitizeZipEntryName(zipName).replace(/\.pdf$/i, '.zip');

    const usedNames = new Set<string>();

    for (const item of items) {
      if (item.status === 'success' && item.resultFile) {
        let entryName = this.sanitizeZipEntryName(item.resultFile.name);

        // Deduplicate file names inside the archive
        let counter = 1;
        const base = entryName.replace(/\.pdf$/i, '');
        while (usedNames.has(entryName.toLowerCase())) {
          entryName = `${base}_(${counter}).pdf`;
          counter++;
        }
        usedNames.add(entryName.toLowerCase());

        const buffer = await item.resultFile.arrayBuffer();
        totalUncompressedBytes += buffer.byteLength;
        if (totalUncompressedBytes > MAX_UNCOMPRESSED_ZIP_BYTES) {
          throw new Error('Total uncompressed file size exceeds 300MB heap limit for ZIP export.');
        }

        zip.file(entryName, buffer);
        fileCount++;
      }
    }

    if (fileCount === 0) {
      throw new Error('No successfully processed files to package into ZIP.');
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return {
      blob,
      fileName: safeZipName,
      fileCount
    };
  }

  /**
   * Sanitizes a file name for ZIP entry inclusion to prevent Zip Slip / path traversal attacks.
   */
  sanitizeZipEntryName(fileName: string): string {
    if (!fileName) return `document_${Date.now()}.pdf`;

    // 1. Strip path components (both / and \), null bytes, and directory traversals
    let clean = fileName
      .replace(/[\/\\]+/g, '_')
      .replace(/\0/g, '')
      .replace(/\.\.+/g, '')
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
      .trim();

    // 2. Remove leading/trailing dots or underscores
    clean = clean.replace(/^[\._]+|[\._]+$/g, '');

    if (!clean) {
      clean = `document_${Date.now()}`;
    }

    if (!clean.toLowerCase().endsWith('.pdf') && !clean.toLowerCase().endsWith('.zip')) {
      clean += '.pdf';
    }

    return clean;
  }

  /**
   * Scrubs sensitive credentials (passwords, tokens) from error messages
   * to prevent credential leakage in audit logs and UI cards.
   */
  private sanitizeErrorMessage(err: any, passwordsToMask?: (string | undefined)[]): string {
    let msg = err?.message || String(err || 'Operation failed');
    if (passwordsToMask) {
      for (const pwd of passwordsToMask) {
        if (pwd && pwd.trim().length > 0) {
          msg = msg.split(pwd).join('***');
        }
      }
    }
    // Scrub key-value credential expressions (e.g. password="...", password: ...)
    return msg.replace(/(password\s*[:=]\s*)['"]?[^'"\s,;]+['"]?/gi, '$1***');
  }

  /**
   * Saves all successfully processed files individually to device storage.
   */
  async saveAllIndividually(
    items: BatchSecurityQueueItem[],
    prefix = 'batch_security'
  ): Promise<{ savedCount: number; errors: string[] }> {
    if (!this.storageService) {
      throw new Error('Storage service is not available');
    }

    const batchOpId = `batch_${Date.now()}`;
    let savedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (item.status === 'success' && item.resultFile) {
        try {
          const uri = await this.storageService.saveFile(
            item.resultFile,
            prefix,
            batchOpId,
            { preserveName: true }
          );
          if (uri) {
            savedCount++;
          }
        } catch (err: any) {
          errors.push(`Failed to save ${item.name}: ${err?.message}`);
        }
      }
    }

    return { savedCount, errors };
  }

  private buildOutputFileName(originalName: string, suffix: 'protected' | 'unlocked'): string {
    const dot = originalName.lastIndexOf('.');
    const base = dot > 0 ? originalName.substring(0, dot) : originalName;
    return `${base}_${suffix}.pdf`;
  }
}
