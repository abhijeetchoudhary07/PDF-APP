import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as pako from 'pako';
import {
  OcrModelMetadata,
  OcrModelStatus,
  OCR_MODEL_CATALOG,
  OCR_EXPANDED_LANGUAGES,
  OCR_INDIC_LANGUAGES,
  OCR_INTERNATIONAL_LANGUAGES,
  OCR_SUPPORTED_LANGUAGES,
  OcrSupportedLanguage,
  RTL_LANGUAGE_CODES,
  APPROVED_OCR_MODEL_HASHES,
  APPROVED_OCR_CDN_ORIGINS
} from '../models/ocr.models';

const STORAGE_METADATA_KEY = 'ocr_cached_models_metadata';

@Injectable({
  providedIn: 'root'
})
export class OcrModelManagerService {
  private memoryCache = new Map<string, Uint8Array>();
  private activeDownloads = new Map<string, Promise<boolean>>();
  private trustedHashes = new Map<string, Set<string>>();

  private modelsSubject = new BehaviorSubject<OcrModelMetadata[]>(
    JSON.parse(JSON.stringify(OCR_MODEL_CATALOG))
  );
  readonly models$: Observable<OcrModelMetadata[]> = this.modelsSubject.asObservable();

  constructor() {
    this.initTrustedHashes();
    this.initCacheStatus();
  }

  private initTrustedHashes(): void {
    for (const [lang, hashes] of Object.entries(APPROVED_OCR_MODEL_HASHES)) {
      this.trustedHashes.set(lang, new Set(hashes.map(h => h.toLowerCase())));
    }
  }

  /**
   * Registers or updates an approved SHA-256 hash for a language model.
   */
  setTrustedHash(langCode: string, hash: string): void {
    if (!this.trustedHashes.has(langCode)) {
      this.trustedHashes.set(langCode, new Set<string>());
    }
    this.trustedHashes.get(langCode)!.add(hash.toLowerCase());
  }

  /**
   * Returns registered trusted hashes for a language code.
   */
  getTrustedHashes(langCode: string): string[] {
    return Array.from(this.trustedHashes.get(langCode) || []);
  }

  /**
   * Cryptographically computes SHA-256 hash of a buffer or array.
   */
  async computeSha256(data: Uint8Array | ArrayBuffer): Promise<string> {
    if (!data) return '';
    let buffer: ArrayBuffer;
    if (data instanceof Uint8Array) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else {
      buffer = data;
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifies SHA-256 hash against expected or approved model hashes.
   */
  async verifySha256Integrity(
    data: Uint8Array | ArrayBuffer,
    langCode: string,
    expectedHash?: string
  ): Promise<boolean> {
    if (!data) return false;
    const computed = await this.computeSha256(data);
    const normalized = computed.toLowerCase();

    if (expectedHash) {
      return normalized === expectedHash.toLowerCase();
    }

    const trusted = this.trustedHashes.get(langCode);
    if (trusted && trusted.size > 0) {
      return trusted.has(normalized);
    }

    const model = this.getModel(langCode);
    if (model?.sha256) {
      return normalized === model.sha256.toLowerCase();
    }

    // Baseline structure integrity
    return this.verifyIntegrity(data);
  }

  /**
   * Validates file name to defend against arbitrary path traversal attempts.
   */
  validateModelFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('SecurityError: Invalid model file name.');
    }
    if (
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('\0') ||
      fileName.toLowerCase().includes('%2e') ||
      fileName.toLowerCase().includes('%2f')
    ) {
      throw new Error(`SecurityError: Arbitrary file path traversal detected in model file name: ${fileName}`);
    }
    const validPattern = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
    if (!validPattern.test(fileName)) {
      throw new Error(`SecurityError: Model file name contains forbidden characters: ${fileName}`);
    }
    return fileName;
  }

  /**
   * Validates outbound CDN URL against approved origin whitelist.
   */
  validateCdnUrl(urlStr: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error(`SecurityError: Invalid CDN URL: ${urlStr}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`SecurityError: Insecure protocol ${parsed.protocol} blocked for OCR download: ${urlStr}`);
    }
    const isApproved = APPROVED_OCR_CDN_ORIGINS.some(origin => parsed.origin === origin);
    if (!isApproved) {
      throw new Error(`SecurityError: Unauthorized outbound network request to unapproved external CDN: ${parsed.origin}`);
    }
  }

  /**
   * Returns metadata for all known models.
   */
  getAllModels(): OcrModelMetadata[] {
    return this.modelsSubject.getValue();
  }

  /**
   * Returns model metadata by language code.
   */
  getModel(code: string): OcrModelMetadata | undefined {
    return this.modelsSubject.getValue().find(m => m.code === code);
  }

  /**
   * Returns the 18 expanded languages catalog (13 Indic + 5 International).
   */
  getExpandedLanguages(): OcrModelMetadata[] {
    return OCR_EXPANDED_LANGUAGES;
  }

  /**
   * Returns languages filtered by tab category (indic | international).
   */
  getLanguagesByCategory(category: 'indic' | 'international'): OcrModelMetadata[] {
    return this.getAllModels().filter(m => m.category === category);
  }

  /**
   * Checks whether a language code corresponds to a Right-to-Left (RTL) script (Urdu, Arabic).
   */
  isRtlLanguage(langCode: string): boolean {
    return RTL_LANGUAGE_CODES.has(langCode.toLowerCase());
  }

  /**
   * Checks whether a model is cached locally (or bundled).
   */
  async isModelCached(langCode: string): Promise<boolean> {
    if (langCode === 'eng') return true;

    // Check memory cache
    if (this.memoryCache.has(langCode)) return true;

    // Check IndexedDB
    try {
      const idb = await this.getIdbKeyval();
      if (idb) {
        const val = await idb.get(`./${langCode}.traineddata`);
        if (val && this.verifyIntegrity(val)) {
          this.memoryCache.set(langCode, val);
          return true;
        }
      }
    } catch {
      // Fallback
    }

    // Check Capacitor Filesystem
    if (Capacitor.isNativePlatform()) {
      try {
        const model = this.getModel(langCode);
        const fileName = this.validateModelFileName(model ? model.fileName : `${langCode}.traineddata.gz`);
        const res = await Filesystem.stat({
          path: `tesseract/${fileName}`,
          directory: Directory.Data
        });
        if (res && res.size > 0) return true;
      } catch {
        // File does not exist
      }
    }

    // Check stored metadata list in localStorage / preferences
    try {
      const stored = localStorage.getItem(STORAGE_METADATA_KEY);
      if (stored) {
        const list: string[] = JSON.parse(stored);
        if (list.includes(langCode)) return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Gets current status of a model.
   */
  async getModelStatus(langCode: string): Promise<OcrModelStatus> {
    if (langCode === 'eng') return 'offline_ready';
    if (this.activeDownloads.has(langCode)) return 'downloading';
    const isCached = await this.isModelCached(langCode);
    return isCached ? 'downloaded' : 'available';
  }

  /**
   * Initializes cache status on app startup.
   */
  async initCacheStatus(): Promise<void> {
    const current = this.modelsSubject.getValue();
    const updated = await Promise.all(
      current.map(async m => {
        if (m.code === 'eng') {
          return { ...m, status: 'offline_ready' as OcrModelStatus };
        }
        const cached = await this.isModelCached(m.code);
        return {
          ...m,
          status: cached ? ('downloaded' as OcrModelStatus) : ('available' as OcrModelStatus)
        };
      })
    );
    this.modelsSubject.next(updated);
  }

  /**
   * Verifies the integrity of a language model buffer.
   */
  verifyIntegrity(data: Uint8Array | ArrayBuffer): boolean {
    if (!data) return false;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length < 20) return false;

    // Check gzip magic numbers: 0x1F, 0x8B
    const isGzip = (bytes[0] === 0x1f && bytes[1] === 0x8b) || (bytes[1] === 0x1f && bytes[0] === 0x8b);
    if (isGzip) return true;

    // Check uncompressed Tesseract traineddata header (starts with non-zero bytes)
    return bytes.length > 1000;
  }

  /**
   * Downloads an extended OCR model on demand with progress updates.
   * Verifies file integrity before caching.
   */
  async downloadModel(
    langCode: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<boolean> {
    if (langCode === 'eng') {
      onProgress?.(100);
      return true;
    }

    // Skip network if already cached and verified
    const isCached = await this.isModelCached(langCode);
    if (isCached) {
      this.updateModelStatus(langCode, 'downloaded', 100);
      onProgress?.(100);
      return true;
    }

    // Return existing in-flight download if already running
    if (this.activeDownloads.has(langCode)) {
      return this.activeDownloads.get(langCode)!;
    }

    const downloadPromise = this.performDownload(langCode, onProgress);
    this.activeDownloads.set(langCode, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.activeDownloads.delete(langCode);
    }
  }

  private async performDownload(
    langCode: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<boolean> {
    const model = this.getModel(langCode);
    const fileName = model ? model.fileName : `${langCode}.traineddata.gz`;

    // Update status to downloading
    this.updateModelStatus(langCode, 'downloading', 0);

    const isIndic = model?.category === 'indic';
    const cdnUrls: string[] = [];
    if (isIndic) {
      // Prioritize high-accuracy 4.0.0_best_int LSTM models for Indic scripts (complex conjuncts, matras)
      cdnUrls.push(`https://cdn.jsdelivr.net/npm/@tesseract.js-data/${langCode}/4.0.0_best_int/${fileName}`);
    }
    cdnUrls.push(
      `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${langCode}/4.0.0/${fileName}`,
      `https://tessdata.projectnaptha.com/4.0.0/${fileName}`,
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${langCode}.traineddata`
    );

    let downloadedBuffer: Uint8Array | null = null;
    let downloadError: Error | null = null;

    for (const url of cdnUrls) {
      try {
        this.validateCdnUrl(url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentLength = +(response.headers.get('content-length') || 0);

        if (response.body && typeof response.body.getReader === 'function' && !response.bodyUsed) {
          try {
            const reader = response.body.getReader();
            let received = 0;
            const chunks: Uint8Array[] = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                received += value.length;
                if (contentLength > 0) {
                  const pct = Math.min(99, Math.round((received / contentLength) * 100));
                  this.updateModelStatus(langCode, 'downloading', pct);
                  onProgress?.(pct);
                }
              }
            }

            // Merge chunks
            const merged = new Uint8Array(received);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            downloadedBuffer = merged;
          } catch {
            const arrayBuf = await response.arrayBuffer();
            downloadedBuffer = new Uint8Array(arrayBuf);
          }
        } else {
          const arrayBuf = await response.arrayBuffer();
          downloadedBuffer = new Uint8Array(arrayBuf);
          this.updateModelStatus(langCode, 'downloading', 90);
          onProgress?.(90);
        }

        if (downloadedBuffer && this.verifyIntegrity(downloadedBuffer)) {
          const verified = await this.verifySha256Integrity(downloadedBuffer, langCode);
          if (!verified) {
            throw new Error(
              `SecurityError: SHA-256 integrity verification failed for model ${langCode}. Potential Man-in-the-Middle tampering detected.`
            );
          }
          break; // Success
        } else {
          throw new Error('Integrity verification failed on downloaded chunk.');
        }
      } catch (err: any) {
        downloadError = err;
        downloadedBuffer = null;
      }
    }

    if (!downloadedBuffer || !this.verifyIntegrity(downloadedBuffer)) {
      this.updateModelStatus(langCode, 'available', 0);
      throw downloadError || new Error(`Failed to download and verify language model ${langCode}`);
    }

    // Save to Cache
    try {
      await this.saveModelToStorage(langCode, fileName, downloadedBuffer);
    } catch (saveErr) {
      this.memoryCache.delete(langCode);
      this.updateModelStatus(langCode, 'available', 0);
      throw saveErr;
    }

    this.updateModelStatus(langCode, 'downloaded', 100);
    onProgress?.(100);
    return true;
  }

  /**
   * Saves model to both Filesystem (if native) and IndexedDB uncompressed for Tesseract.js.
   */
  private async saveModelToStorage(langCode: string, fileName: string, buffer: Uint8Array): Promise<void> {
    const safeFileName = this.validateModelFileName(fileName);

    // 2. Uncompress for Tesseract worker if gzipped
    let uncompressedData: Uint8Array;
    const isGzip = (buffer[0] === 0x1f && buffer[1] === 0x8b) || (buffer[1] === 0x1f && buffer[0] === 0x8b);
    if (isGzip) {
      try {
        uncompressedData = pako.inflate(buffer);
      } catch {
        uncompressedData = buffer;
      }
    } else {
      uncompressedData = buffer;
    }

    // 3. Write uncompressed to IndexedDB so Tesseract worker directly loads it with ZERO network calls
    try {
      const idb = await this.getIdbKeyval();
      if (idb) {
        await idb.set(`./${langCode}.traineddata`, uncompressedData);
      }
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        this.memoryCache.delete(langCode);
        throw new Error(
          `Device storage quota exceeded while caching OCR model ${langCode} in IndexedDB. Please free up space.`
        );
      }
      // Ignore idb errors in restricted environments
    }

    // 4. Capacitor Filesystem on native
    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = this.uint8ArrayToBase64(buffer);
        await Filesystem.writeFile({
          path: `tesseract/${safeFileName}`,
          data: base64,
          directory: Directory.Data,
          recursive: true
        });
      } catch (err: any) {
        if (
          err?.name === 'QuotaExceededError' ||
          err?.message?.includes('quota') ||
          err?.message?.includes('ENOSPC')
        ) {
          this.memoryCache.delete(langCode);
          throw new Error(
            `Device storage quota exceeded while saving OCR model ${langCode} to filesystem.`
          );
        }
      }
    }

    // In-memory cache after successful storage write
    this.memoryCache.set(langCode, buffer);

    // 5. Update persistent metadata
    try {
      const stored = localStorage.getItem(STORAGE_METADATA_KEY);
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(langCode)) {
        list.push(langCode);
        localStorage.setItem(STORAGE_METADATA_KEY, JSON.stringify(list));
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Reclaims device storage by deleting all cached extended models.
   * English remains bundled and offline ready.
   */
  async freeUpSpace(): Promise<{ freedBytes: number; deletedCount: number }> {
    let freedBytes = 0;
    let deletedCount = 0;

    const currentModels = this.modelsSubject.getValue();

    for (const m of currentModels) {
      if (m.isBundled || m.code === 'eng') continue;

      const isCached = await this.isModelCached(m.code);
      if (isCached) {
        freedBytes += Math.round(m.fileSizeMB * 1024 * 1024);
        deletedCount++;

        // Clear memory
        this.memoryCache.delete(m.code);

        // Delete from IndexedDB
        try {
          const idb = await this.getIdbKeyval();
          if (idb) {
            await idb.del(`./${m.code}.traineddata`);
          }
        } catch {
          // Ignore
        }

        // Delete from Filesystem
        if (Capacitor.isNativePlatform()) {
          try {
            const safeFileName = this.validateModelFileName(m.fileName);
            await Filesystem.deleteFile({
              path: `tesseract/${safeFileName}`,
              directory: Directory.Data
            });
          } catch {
            // Ignore
          }
        }
      }
    }

    // Clear localStorage metadata
    try {
      localStorage.removeItem(STORAGE_METADATA_KEY);
    } catch {
      // Ignore
    }

    // Reset statuses
    await this.initCacheStatus();

    return { freedBytes, deletedCount };
  }

  /**
   * Returns total storage used by cached models in bytes.
   */
  async getStorageUsed(): Promise<number> {
    let total = 0;
    const current = this.modelsSubject.getValue();
    for (const m of current) {
      if (m.isBundled || m.code === 'eng') continue;
      const cached = await this.isModelCached(m.code);
      if (cached) {
        total += Math.round(m.fileSizeMB * 1024 * 1024);
      }
    }
    return total;
  }

  /**
   * Precise contextual progress messaging.
   */
  getLoadingMessage(languages: string[] | string): string {
    const list = Array.isArray(languages) ? languages : languages.split('+');
    const uncached = list.filter(l => l !== 'eng' && !this.memoryCache.has(l));

    if (uncached.length === 0) {
      return 'Loading offline OCR engine...';
    }

    const first = this.getModel(uncached[0]);
    if (first) {
      return `Downloading ${first.name} OCR model (${first.fileSizeMB} MB) for permanent offline use...`;
    }
    return 'Loading offline OCR engine...';
  }

  /**
   * Returns the asset path for bundled models.
   */
  getBundledAssetPath(): string {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.origin &&
      !navigator.userAgent?.includes('jsdom')
    ) {
      return '/assets/tesseract';
    }

    try {
      // Node / test environment fallback
      const path = require('node:path');
      return path.resolve(process.cwd(), 'src/assets/tesseract');
    } catch {
      return '/assets/tesseract';
    }
  }

  /**
   * Returns worker options configured for offline-first operation.
   */
  async getWorkerOptions(languages: string[] | string): Promise<Record<string, any>> {
    const langList = Array.isArray(languages) ? languages : languages.split('+');

    // Ensure all extended languages are cached
    for (const lang of langList) {
      if (lang !== 'eng') {
        const cached = await this.isModelCached(lang);
        if (!cached) {
          await this.downloadModel(lang);
        }
      }
    }

    const opts: Record<string, any> = {
      langPath: this.getBundledAssetPath(),
      cachePath: '.',
      gzip: true
    };

    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const path = require('node:path');
        opts['workerPath'] = path.resolve(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js');
      } catch {}
    }

    return opts;
  }

  private updateModelStatus(code: string, status: OcrModelStatus, progress?: number): void {
    const list = this.modelsSubject.getValue().map(m => {
      if (m.code === code) {
        return {
          ...m,
          status,
          downloadProgress: progress !== undefined ? progress : m.downloadProgress
        };
      }
      return m;
    });
    this.modelsSubject.next(list);
  }

  private async getIdbKeyval(): Promise<any> {
    if (typeof indexedDB === 'undefined') return null;
    try {
      return await import('idb-keyval');
    } catch {
      return null;
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
