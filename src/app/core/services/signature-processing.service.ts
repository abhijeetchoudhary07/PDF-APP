import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SignatureProcessingService {
  constructor() {}
  
  // Applies grayscale, contrast, and threshold to a signature file
  async processSignature(file: File, options?: { grayscale?: boolean, contrast?: number, threshold?: number }): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');

        ctx.drawImage(img, 0, 0);
        
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        const doGrayscale = options?.grayscale ?? true;
        const contrast = options?.contrast ?? 0;
        const threshold = options?.threshold ?? 0;

        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          if (doGrayscale) {
            const gray = 0.3 * r + 0.59 * g + 0.11 * b;
            r = g = b = gray;
          }

          if (contrast !== 0) {
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
          }

          if (threshold > 0) {
            const v = (0.2126*r + 0.7152*g + 0.0722*b >= threshold) ? 255 : 0;
            r = g = b = v;
          }

          data[i] = Math.min(255, Math.max(0, r));
          data[i+1] = Math.min(255, Math.max(0, g));
          data[i+2] = Math.min(255, Math.max(0, b));
        }

        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type }));
          } else {
            reject('Canvas to blob failed');
          }
        }, file.type);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Basic auto crop by finding bounding box of non-white pixels
  async autoCrop(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            // if pixel is not fully white/transparent
            if (data[i+3] > 0 && (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250)) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Add padding
        const padding = 10;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width, maxX + padding);
        maxY = Math.min(canvas.height, maxY + padding);

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const cropCtx = cropCanvas.getContext('2d');
        if (!cropCtx) return reject('No crop context');
        
        cropCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

        cropCanvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type }));
          } else {
            reject('Crop blob failed');
          }
        }, file.type);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}
