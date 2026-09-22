import { Injectable } from '@angular/core';
import { ImageService } from './image.service';
import { CompressionConfig } from '../models/compression-config.model';
export { CompressionConfig };
import { ProcessingResult } from '../models/processing-result.model';

@Injectable({
  providedIn: 'root'
})
export class CompressionService {
  constructor(private imageService: ImageService) {}

  async compressToExactKB(file: File, config: CompressionConfig): Promise<ProcessingResult> {
    const targetBytes = (config.targetKB || 50) * 1024;
    const outputFormat = config.outputFormat || 'image/jpeg';
    const minQualityThreshold = config.minQuality || 0.4; // Internal quality threshold
    const maxScaleDownLimit = config.maxScaleDown || 0.5; // Max 50% dimension reduction
    
    const dims = await this.imageService.getImageDimensions(file);
    let baseTargetWidth = dims.width;
    let baseTargetHeight = dims.height;

    if (config.maxDimension) {
      if (baseTargetWidth > config.maxDimension || baseTargetHeight > config.maxDimension) {
        const ratio = Math.min(config.maxDimension / baseTargetWidth, config.maxDimension / baseTargetHeight);
        baseTargetWidth = Math.round(baseTargetWidth * ratio);
        baseTargetHeight = Math.round(baseTargetHeight * ratio);
      }
    }
    
    let totalIterations = 0;
    const maxTotalIterations = 25;
    
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('Compression timeout'), 30000));
    
    const compressionPromise = (async () => {
      let currentScale = 1.0;
      let absoluteBestBlob: Blob | null = null;
      let absoluteBestQuality = 0;
      let absoluteBestScale = 1.0;

      while (currentScale >= maxScaleDownLimit && totalIterations < maxTotalIterations) {
         let minQ = 0.0;
         let maxQ = 1.0;
         let quality = 0.8;
         let bestBlobForScale: Blob | null = null;
         let bestQualityForScale = 0;
         
         const w = Math.round(baseTargetWidth * currentScale);
         const h = Math.round(baseTargetHeight * currentScale);

         let innerIterations = 0;
         while (innerIterations < 8 && totalIterations < maxTotalIterations) {
            innerIterations++;
            totalIterations++;
            
            const blob = await this.imageService.resizeToCanvasBlob(file, w, h, outputFormat, quality);
            
            // If it's valid, we log it and push bounds higher to get better quality
            if (blob.size <= targetBytes) {
               bestBlobForScale = blob;
               bestQualityForScale = quality;
               
               // Keep track globally of the highest quality blob that met target
               if (!absoluteBestBlob || bestQualityForScale > absoluteBestQuality) {
                  absoluteBestBlob = blob;
                  absoluteBestQuality = bestQualityForScale;
                  absoluteBestScale = currentScale;
               }

               minQ = quality;
            } else {
               // Too big, lower quality bound
               maxQ = quality;
            }

            const newQuality = (minQ + maxQ) / 2;
            if (Math.abs(quality - newQuality) < 0.02) break;
            quality = newQuality;
         }

         // If we found a blob at this scale and the quality is acceptable, we are done
         if (bestBlobForScale && bestQualityForScale >= minQualityThreshold) {
            return bestBlobForScale;
         }

         // Quality dropped too low, or we couldn't meet the target at all. Reduce dimensions and try again.
         currentScale -= 0.1;
      }
      
      // Fallback: If strict thresholds failed, just return the absolute best we found.
      // If we never found any blob under target bytes, just force the smallest possible (lowest scale, 0 quality).
      if (absoluteBestBlob) {
         return absoluteBestBlob;
      }
      
      const minW = Math.round(baseTargetWidth * maxScaleDownLimit);
      const minH = Math.round(baseTargetHeight * maxScaleDownLimit);
      return await this.imageService.resizeToCanvasBlob(file, minW, minH, outputFormat, 0);
    })();

    try {
      const resultBlob = await Promise.race([compressionPromise, timeoutPromise]) as Blob;
      
      const newFile = new File([resultBlob], file.name, { type: outputFormat });
      const finalDims = await this.imageService.getImageDimensions(newFile);
      
      return {
        success: true,
        file: newFile,
        iterations: totalIterations,
        dimensions: finalDims,
        metadata: {
           name: newFile.name,
           type: newFile.type,
           sizeBytes: newFile.size,
           lastModified: newFile.lastModified,
           extension: outputFormat.split('/')[1] || 'jpeg'
        }
      };
    } catch (e: any) {
      return { success: false, error: e.toString() };
    }
  }
}
