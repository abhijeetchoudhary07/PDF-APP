import { Injectable } from '@angular/core';
import { ConversionRegistryService } from './conversion-registry.service';
import { StorageService } from '../services/storage.service';
import { ShareService } from '../services/share.service';
import { HistoryService } from '../services/history.service';
import { MonetizationService } from '../services/monetization.service';
import { ConversionProgress, ConversionResult, ConversionJob, ConversionStatus } from './conversion.types';
import { IConverter } from './converter.interface';

const uuidv4 = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class ConversionService {
  private activeJobs = new Map<string, ConversionJob>();
  private activeUrls = new Set<string>();

  constructor(
    private registry: ConversionRegistryService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private monetizationService: MonetizationService
  ) {}

  getConverter(id: string): IConverter | undefined {
    return this.registry.getConverter(id);
  }

  getAllConverters() {
    return this.registry.getAllConverters();
  }

  getConvertersByCategory(category: 'pdf-to-format' | 'format-to-pdf') {
    return this.registry.getConvertersByCategory(category);
  }

  async runConversion(
    converterId: string,
    file: File,
    options: Record<string, any> = {},
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const converter = this.registry.getConverter(converterId);
    if (!converter) {
      return { success: false, error: `Converter '${converterId}' not found.` };
    }

    // Step 1: Validate file
    const validation = await converter.validate(file);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid file for this converter.' };
    }

    const jobId = uuidv4();
    const job: ConversionJob = {
      id: jobId,
      converterId,
      inputFile: file,
      options,
      status: 'processing',
      progress: { percent: 0, stage: 'Starting conversion...' },
      createdAt: Date.now()
    };
    this.activeJobs.set(jobId, job);

    try {
      const result = await converter.convert(file, options, (p) => {
        job.progress = p;
        onProgress?.(p);
      });

      job.status = result.success ? 'done' : 'error';
      job.result = result;

      if (result.previewUrl) {
        this.activeUrls.add(result.previewUrl);
      }

      // Automatically log to History on success
      if (result.success && result.file) {
        await this.logToHistory(converterId, file, result.file);
      }

      return result;
    } catch (e: any) {
      job.status = 'error';
      job.error = e?.message || e.toString();
      return { success: false, error: job.error };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Saves the generated conversion result file to user storage.
   */
  async saveResult(file: File, prefix: string = 'converted'): Promise<string | undefined> {
    return await this.storageService.saveFile(file, prefix);
  }

  /**
   * Shares the generated conversion result file via native device share dialog.
   */
  async shareResult(file: File, title: string = 'Converted Document'): Promise<void> {
    const uri = await this.storageService.saveFile(file, 'share_temp');
    if (uri && uri !== 'web-download') {
      await this.shareService.shareFile(uri, title);
    }
  }

  /**
   * Releases allocated blob object URLs to prevent browser memory leaks.
   */
  cleanupUrls(): void {
    for (const url of this.activeUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
    this.activeUrls.clear();
  }

  private async logToHistory(converterId: string, originalFile: File, outputFile: File): Promise<void> {
    try {
      await this.historyService.addHistoryItem({
        operation: `conversion_${converterId}`,
        originalFileName: originalFile.name,
        outputFileName: outputFile.name,
        originalSizeBytes: originalFile.size,
        outputSizeBytes: outputFile.size
      });
    } catch (e) {
      console.warn('Could not record history item:', e);
    }
  }
}
