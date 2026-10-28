import { Injectable, inject } from '@angular/core';
import { ImageService } from './image.service';
import { CompressionConfig } from '../models/compression-config.model';
export { CompressionConfig };
import { ProcessingResult } from '../models/processing-result.model';

@Injectable({
  providedIn: 'root'
})
export class CompressionService {
  private imageService = inject(ImageService);

  async compressToExactKB(file: File, config: CompressionConfig): Promise<ProcessingResult> {
    const rawTargetKB = Number(config.targetKB);
    const targetKB = Math.max(5, Math.min(10000, Number.isFinite(rawTargetKB) && rawTargetKB > 0 ? rawTargetKB : 50));
    const targetBytes = targetKB * 1024;

    // Validate and sanitize output format
    let outputFormat = (config.outputFormat || 'image/jpeg').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(outputFormat)) {
      outputFormat = 'image/jpeg';
    }

    let ext = 'jpg';
    if (outputFormat === 'image/png') ext = 'png';
    else if (outputFormat === 'image/webp') ext = 'webp';

    // Decode source image once safely to prevent memory leaks and repeated DOM parsing
    let sourceImg: HTMLImageElement;
    try {
      sourceImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        img.src = url;
      });
    } catch {
      return {
        success: false,
        error: 'That image could not be opened. It may be damaged or in a format this device cannot read.'
      };
    }

    const naturalWidth = Math.max(1, sourceImg.naturalWidth || sourceImg.width || 1);
    const naturalHeight = Math.max(1, sourceImg.naturalHeight || sourceImg.height || 1);

    // Determine target dimensions
    let baseTargetWidth = naturalWidth;
    let baseTargetHeight = naturalHeight;

    if (config.exactDimensions && config.exactDimensions.width > 0 && config.exactDimensions.height > 0) {
      baseTargetWidth = Math.round(config.exactDimensions.width);
      baseTargetHeight = Math.round(config.exactDimensions.height);
    } else if (config.maxDimension && config.maxDimension > 0) {
      if (baseTargetWidth > config.maxDimension || baseTargetHeight > config.maxDimension) {
        const ratio = Math.min(config.maxDimension / baseTargetWidth, config.maxDimension / baseTargetHeight);
        baseTargetWidth = Math.max(1, Math.round(baseTargetWidth * ratio));
        baseTargetHeight = Math.max(1, Math.round(baseTargetHeight * ratio));
      }
    } else {
      // Memory safety cap for massive photos (e.g. 12MP - 48MP phone cameras)
      const maxSafetyDimension = 2400;
      if (baseTargetWidth > maxSafetyDimension || baseTargetHeight > maxSafetyDimension) {
        const ratio = Math.min(maxSafetyDimension / baseTargetWidth, maxSafetyDimension / baseTargetHeight);
        baseTargetWidth = Math.max(1, Math.round(baseTargetWidth * ratio));
        baseTargetHeight = Math.max(1, Math.round(baseTargetHeight * ratio));
      }
    }

    // Allocate a single reusable canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { success: false, error: 'Could not allocate canvas graphics context.' };
    }

    const renderBlobAt = async (w: number, h: number, q: number): Promise<Blob> => {
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));

      if (outputFormat === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create image blob from canvas'));
          },
          outputFormat,
          q
        );
      });
    };

    let totalIterations = 0;
    const maxTotalIterations = 20;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Compression timeout')), 25000)
    );

    const compressionPromise = (async (): Promise<Blob> => {
      // 1. Lossless PNG compression (binary search directly on dimensions since canvas ignores quality for PNG)
      if (outputFormat === 'image/png') {
        let minScale = 0.05;
        let maxScale = 1.0;
        let bestPngBlob: Blob | null = null;
        let currentScale = 1.0;

        while (totalIterations < maxTotalIterations) {
          totalIterations++;
          const w = Math.max(1, Math.round(baseTargetWidth * currentScale));
          const h = Math.max(1, Math.round(baseTargetHeight * currentScale));
          const blob = await renderBlobAt(w, h, 1.0);

          if (blob.size <= targetBytes) {
            bestPngBlob = blob;
            minScale = currentScale;
          } else {
            maxScale = currentScale;
          }

          const nextScale = (minScale + maxScale) / 2;
          if (Math.abs(currentScale - nextScale) < 0.03) {
            break;
          }
          currentScale = nextScale;
        }

        if (bestPngBlob) return bestPngBlob;
        const minW = Math.max(1, Math.round(baseTargetWidth * 0.1));
        const minH = Math.max(1, Math.round(baseTargetHeight * 0.1));
        return await renderBlobAt(minW, minH, 1.0);
      }

      // 2. Lossy JPEG / WebP compression with quality tuning
      let currentScale = 1.0;
      let absoluteBestBlob: Blob | null = null;
      let absoluteBestQuality = 0;
      const minScaleDownLimit = config.exactDimensions ? 1.0 : (config.maxScaleDown || 0.2);

      while (currentScale >= minScaleDownLimit && totalIterations < maxTotalIterations) {
        const w = Math.max(1, Math.round(baseTargetWidth * currentScale));
        const h = Math.max(1, Math.round(baseTargetHeight * currentScale));

        let minQ = 0.05;
        let maxQ = 0.96;
        let quality = 0.82;
        let bestBlobForScale: Blob | null = null;
        let bestQualityForScale = 0;

        let innerIterations = 0;
        while (innerIterations < 7 && totalIterations < maxTotalIterations) {
          innerIterations++;
          totalIterations++;

          const blob = await renderBlobAt(w, h, quality);

          if (blob.size <= targetBytes) {
            bestBlobForScale = blob;
            bestQualityForScale = quality;

            if (!absoluteBestBlob || quality > absoluteBestQuality) {
              absoluteBestBlob = blob;
              absoluteBestQuality = quality;
            }

            minQ = quality;
          } else {
            maxQ = quality;
          }

          const newQuality = (minQ + maxQ) / 2;
          if (Math.abs(quality - newQuality) < 0.02) break;
          quality = newQuality;
        }

        if (config.exactDimensions) {
          if (bestBlobForScale) return bestBlobForScale;
          break;
        }

        if (bestBlobForScale && bestQualityForScale >= (config.minQuality || 0.40)) {
          return bestBlobForScale;
        }

        currentScale -= 0.15;
      }

      if (absoluteBestBlob) {
        return absoluteBestBlob;
      }

      const minW = Math.max(1, Math.round(baseTargetWidth * minScaleDownLimit));
      const minH = Math.max(1, Math.round(baseTargetHeight * minScaleDownLimit));
      return await renderBlobAt(minW, minH, 0.2);
    })();

    try {
      const resultBlob = await Promise.race([compressionPromise, timeoutPromise]);
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const outputFileName = `${baseName}.${ext}`;
      const newFile = new File([resultBlob], outputFileName, { type: outputFormat });

      const finalDims = {
        width: canvas.width,
        height: canvas.height
      };

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
          extension: ext
        }
      };
    } catch (e: any) {
      return { success: false, error: e?.message || e?.toString() || 'Compression failed.' };
    }
  }
}
