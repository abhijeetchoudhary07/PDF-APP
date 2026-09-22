import { Injectable } from '@angular/core';
import { ImageDimensions } from '../models/image-dimensions.model';

@Injectable({
  providedIn: 'root'
})
export class ImageService {
  constructor() {}

  async getImageDimensions(file: File): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Draw image to a specific size onto a Canvas and return the blob
  async resizeToCanvasBlob(file: File, targetWidth: number, targetHeight: number, outputFormat: string, quality: number = 0.9): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');

        // Fill white background for JPEGs to prevent transparency issues
        if (outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject('Failed to convert canvas to blob');
          }
        }, outputFormat, quality);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async autoCropSignature(file: File, padding: number = 10, threshold: number = 240): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        let hasContent = false;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];

            // Treat transparent as background. Calculate brightness for rgb
            const brightness = 0.299*r + 0.587*g + 0.114*b;
            
            if (a > 50 && brightness < threshold) {
               hasContent = true;
               if (x < minX) minX = x;
               if (x > maxX) maxX = x;
               if (y < minY) minY = y;
               if (y > maxY) maxY = y;
            }
          }
        }

        if (!hasContent) {
           resolve(file); // No signature found, return original to avoid error
           return;
        }

        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width, maxX + padding);
        maxY = Math.min(canvas.height, maxY + padding);

        const cropWidth = maxX - minX;
        const cropHeight = maxY - minY;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d');
        if (!cropCtx) return reject('No canvas context');
        
        cropCtx.drawImage(
           canvas,
           minX, minY, cropWidth, cropHeight,
           0, 0, cropWidth, cropHeight
        );

        cropCanvas.toBlob((blob) => {
           if (blob) {
              resolve(new File([blob], file.name, { type: file.type || 'image/jpeg' }));
           } else {
              reject('Failed to blob crop');
           }
        }, file.type || 'image/jpeg', 1.0);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}
