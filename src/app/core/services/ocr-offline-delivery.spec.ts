import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pako from 'pako';
import { OcrModelManagerService } from './ocr-model-manager.service';
import { OcrService } from './ocr.service';
import { OcrProgressEvent } from '../models/ocr.models';

describe('O0 — OCR Model Delivery & Offline Guarantee Suite', () => {
  let modelManager: OcrModelManagerService;
  let ocrService: OcrService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    modelManager = new OcrModelManagerService();
    ocrService = new OcrService();
    ocrService.setModelManager(modelManager);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Primary Model Bundled (English Offline Guarantee)', () => {
    it('bundles eng.traineddata.gz in src/assets/tesseract/', () => {
      const assetPath = path.resolve(process.cwd(), 'src/assets/tesseract/eng.traineddata.gz');
      expect(fs.existsSync(assetPath)).toBe(true);

      const stats = fs.statSync(assetPath);
      // File should be non-empty gzip compressed data (~1.9MB compressed, ~4MB uncompressed)
      expect(stats.size).toBeGreaterThan(1_000_000);

      const fileBuffer = fs.readFileSync(assetPath);
      expect(fileBuffer[0]).toBe(0x1f);
      expect(fileBuffer[1]).toBe(0x8b);
    });

    it('reports English as always offline ready and cached without network access', async () => {
      // Mock network as down
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Device is offline: network is down'));

      const isCached = await modelManager.isModelCached('eng');
      const status = await modelManager.getModelStatus('eng');

      expect(isCached).toBe(true);
      expect(status).toBe('offline_ready');
    });

    it('executes English OCR successfully with device offline and network mocked as down', async () => {
      // Mock network as down
      globalThis.fetch = vi.fn().mockImplementation(() => {
        throw new Error('Device is offline: network request blocked');
      });

      // Simple 1x1 test png blob
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const testFile = new File([samplePng], 'test_doc.png', { type: 'image/png' });

      const progressMessages: string[] = [];
      const result = await ocrService.performOcr(testFile, 'eng', [1], (evt: OcrProgressEvent) => {
        if (evt.message) progressMessages.push(evt.message);
      });

      expect(result).toBeDefined();
      expect(result.languages).toContain('eng');
      expect(result.pages.length).toBe(1);

      // Verify that misleading CDN message is replaced
      expect(progressMessages.some(m => m.includes('cached locally for offline use'))).toBe(false);
      expect(progressMessages.some(m => m.includes('Loading offline OCR engine...'))).toBe(true);
    });

    it('executes recognizeRegionWords offline using bundled asset', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Device is offline'));

      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const blob = new Blob([samplePng], { type: 'image/png' });

      const res = await ocrService.recognizeRegionWords(blob, 'eng');
      expect(res).toBeDefined();
      expect(Array.isArray(res.words)).toBe(true);
    });
  });

  describe('Extended Languages On-Demand Manager', () => {
    it('verifies cached file integrity and rejects corrupted downloads', async () => {
      // 1. Corrupted zero-byte or tiny payload
      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);
      expect(modelManager.verifyIntegrity(corruptedData)).toBe(false);

      // 2. Valid gzip payload
      const validGzip = pako.gzip(new Uint8Array(1000).fill(65));
      expect(modelManager.verifyIntegrity(validGzip)).toBe(true);
    });

    it('downloads extended language model on first invocation and skips network on second invocation', async () => {
      const mockHinTrainedData = pako.gzip(new Uint8Array(60000).fill(72)); // valid gzip mock
      let fetchCallCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return new Response(mockHinTrainedData as any, {
          status: 200,
          headers: { 'content-length': String(mockHinTrainedData.byteLength) }
        });
      });

      // First invocation: downloads over network
      const progressUpdates: number[] = [];
      const downloaded = await modelManager.downloadModel('hin', pct => {
        progressUpdates.push(pct);
      });

      expect(downloaded).toBe(true);
      expect(fetchCallCount).toBeGreaterThan(0);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(await modelManager.isModelCached('hin')).toBe(true);
      expect(await modelManager.getModelStatus('hin')).toBe('downloaded');

      // Now mock network completely DOWN
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Device is offline: network is down'));

      // Second invocation: should verify cached file integrity and NOT touch network
      const cached = await modelManager.isModelCached('hin');
      expect(cached).toBe(true);
      expect(await modelManager.getModelStatus('hin')).toBe('downloaded');

      // downloadModel for already cached model skips network
      const secondCallResult = await modelManager.downloadModel('hin');
      expect(secondCallResult).toBe(true);
    });

    it('reclaims storage via freeUpSpace while preserving bundled English', async () => {
      // Mock Hindi as cached
      const mockData = pako.gzip(new Uint8Array(50000));
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(mockData as any, { status: 200 }));
      await modelManager.downloadModel('hin');

      const storageBefore = await modelManager.getStorageUsed();
      expect(storageBefore).toBeGreaterThan(0);

      // Free up space
      const freed = await modelManager.freeUpSpace();
      expect(freed.deletedCount).toBeGreaterThanOrEqual(1);
      expect(freed.freedBytes).toBeGreaterThan(0);

      // Storage reclaimed
      const storageAfter = await modelManager.getStorageUsed();
      expect(storageAfter).toBe(0);

      // Hindi is now available (not downloaded), English remains offline ready
      expect(await modelManager.getModelStatus('hin')).toBe('available');
      expect(await modelManager.getModelStatus('eng')).toBe('offline_ready');
    });
  });

  describe('Correct Misleading On-Screen Messaging', () => {
    it('produces "Loading offline OCR engine..." for bundled or cached models', () => {
      const msgEng = modelManager.getLoadingMessage(['eng']);
      expect(msgEng).toBe('Loading offline OCR engine...');
      expect(msgEng).not.toContain('cached locally for offline use');
    });

    it('produces precise contextual text with model name and file size for initial download', () => {
      const msgHin = modelManager.getLoadingMessage(['hin']);
      expect(msgHin).toContain('Downloading Hindi OCR model (11.8 MB) for permanent offline use...');
      expect(msgHin).not.toContain('Loading OCR language models (cached locally for offline use)');
    });
  });

  describe('Step 3: Worker Configuration, CORS & Storage Quota Resilience', () => {
    it('configures compliant worker options and sets local asset paths', async () => {
      const opts = await modelManager.getWorkerOptions('eng');
      expect(opts).toBeDefined();
      expect(opts.gzip).toBe(true);
      expect(opts.langPath).toBeDefined();
    });

    it('handles QuotaExceededError gracefully when storage is full', async () => {
      // Mock IndexedDB get to throw QuotaExceededError
      const quotaError = new Error('Quota exceeded');
      quotaError.name = 'QuotaExceededError';

      vi.spyOn(modelManager as any, 'getIdbKeyval').mockResolvedValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockRejectedValue(quotaError)
      });

      const validGzip = pako.gzip(new Uint8Array(2000));
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(validGzip as any, { status: 200 }));

      await expect(modelManager.downloadModel('hin')).rejects.toThrow(/quota exceeded/i);
      expect(await modelManager.getModelStatus('hin')).toBe('available');
    });
  });

  describe('Step 5: Cybersecurity Stress-Testing & Strict Offline Sandboxing', () => {
    it('computes exact SHA-256 hash and verifies integrity of bundled English model', async () => {
      const assetPath = path.resolve(process.cwd(), 'src/assets/tesseract/eng.traineddata.gz');
      const fileBuffer = fs.readFileSync(assetPath);

      const computedHash = await modelManager.computeSha256(fileBuffer);
      expect(computedHash).toBe('18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b');

      const isVerified = await modelManager.verifySha256Integrity(fileBuffer, 'eng');
      expect(isVerified).toBe(true);
    });

    it('detects MitM tampering and rejects modified .traineddata.gz files', async () => {
      const originalPayload = pako.gzip(new Uint8Array(5000).fill(88));
      const validHash = await modelManager.computeSha256(originalPayload);

      // Register approved hash for Hindi
      modelManager.setTrustedHash('hin', validHash);

      // Simulate MitM attacker tampering: alter a single byte in the payload
      const tamperedPayload = new Uint8Array(originalPayload);
      tamperedPayload[10] = tamperedPayload[10] ^ 0xff; // Invert bits in payload header/stream

      const isTamperedVerified = await modelManager.verifySha256Integrity(tamperedPayload, 'hin');
      expect(isTamperedVerified).toBe(false);

      // Now test that downloadModel rejects tampered data and leaves model un-cached
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(new Uint8Array(tamperedPayload), {
            status: 200,
            headers: { 'content-length': String(tamperedPayload.byteLength) }
          })
        )
      );

      await expect(modelManager.downloadModel('hin')).rejects.toThrow(/integrity verification failed/i);
      expect(await modelManager.isModelCached('hin')).toBe(false);
      expect(await modelManager.getModelStatus('hin')).toBe('available');
    });

    it('allows valid download matching trusted SHA-256 hash', async () => {
      const validPayload = pako.gzip(new Uint8Array(5000).fill(77));
      const validHash = await modelManager.computeSha256(validPayload);

      modelManager.setTrustedHash('hin', validHash);

      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(new Uint8Array(validPayload), {
            status: 200,
            headers: { 'content-length': String(validPayload.byteLength) }
          })
        )
      );

      const success = await modelManager.downloadModel('hin');
      expect(success).toBe(true);
      expect(await modelManager.isModelCached('hin')).toBe(true);
    });

    it('defends against arbitrary file path traversal when saving or managing models', () => {
      const traversalAttacks = [
        '../../etc/passwd',
        '../hin.traineddata.gz',
        '..\\windows\\system32\\calc.exe',
        '/root/payload.traineddata.gz',
        'hin/../../sensitive.dat',
        'model\0traversal.traineddata.gz',
        '%2e%2e%2fmalicious.gz',
        'bad;rm -rf /'
      ];

      for (const attack of traversalAttacks) {
        expect(() => modelManager.validateModelFileName(attack)).toThrow(/SecurityError/);
      }

      // Valid filenames pass
      expect(modelManager.validateModelFileName('hin.traineddata.gz')).toBe('hin.traineddata.gz');
      expect(modelManager.validateModelFileName('eng.traineddata.gz')).toBe('eng.traineddata.gz');
      expect(modelManager.validateModelFileName('chi_sim.traineddata.gz')).toBe('chi_sim.traineddata.gz');
    });

    it('enforces outbound CDN whitelist and rejects unauthorized external servers or insecure protocols', () => {
      // Insecure HTTP protocol blocked
      expect(() => modelManager.validateCdnUrl('http://cdn.jsdelivr.net/npm/hin.traineddata.gz')).toThrow(
        /SecurityError: Insecure protocol/
      );

      // Unapproved external malicious domains blocked
      expect(() => modelManager.validateCdnUrl('https://evil-hacker.com/tesseract/hin.traineddata.gz')).toThrow(
        /SecurityError: Unauthorized outbound network request/
      );
      expect(() => modelManager.validateCdnUrl('https://malicious-cdn.org/eng.traineddata.gz')).toThrow(
        /SecurityError: Unauthorized outbound network request/
      );

      // Approved CDNs pass
      expect(() =>
        modelManager.validateCdnUrl('https://cdn.jsdelivr.net/npm/@tesseract.js-data/hin/4.0.0/hin.traineddata.gz')
      ).not.toThrow();
      expect(() =>
        modelManager.validateCdnUrl('https://tessdata.projectnaptha.com/4.0.0/hin.traineddata.gz')
      ).not.toThrow();
      expect(() =>
        modelManager.validateCdnUrl('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/hin.traineddata')
      ).not.toThrow();
    });

    it('verifies 100% offline claim: English OCR triggers zero network requests', async () => {
      const fetchSpy = vi.fn().mockImplementation(() => {
        throw new Error('NETWORK_CALL_DETECTED: Offline guarantee violation');
      });
      globalThis.fetch = fetchSpy;

      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const testFile = new File([samplePng], 'offline_test.png', { type: 'image/png' });

      const result = await ocrService.performOcr(testFile, 'eng');
      expect(result).toBeDefined();
      expect(result.languages).toContain('eng');
      // Assert zero network calls were made
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
