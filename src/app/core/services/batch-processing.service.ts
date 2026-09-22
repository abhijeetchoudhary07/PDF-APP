import { Injectable } from '@angular/core';
import { MonetizationService } from './monetization.service';

export interface BatchResult {
  fileName: string;
  success: boolean;
  file?: File;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BatchProcessingService {
  constructor(private monetization: MonetizationService) {}

  async processBatch(files: File[], processingFn: (file: File) => Promise<File>): Promise<BatchResult[]> {
    if (!this.monetization.isUserPremium) {
      throw new Error('Batch Processing is a Premium feature.');
    }

    const results: BatchResult[] = [];
    
    // Using for...of for sequential processing to avoid heavy memory spikes (e.g. OOM on mobile)
    for (const file of files) {
      try {
        const resultFile = await processingFn(file);
        results.push({ fileName: file.name, success: true, file: resultFile });
      } catch (error: any) {
        results.push({ fileName: file.name, success: false, error: error.message || 'Unknown error' });
      }
    }
    
    return results;
  }
}
