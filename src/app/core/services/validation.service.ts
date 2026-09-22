import { Injectable } from '@angular/core';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SUPPORTED_OUTPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  constructor() {}

  validateImage(file: File): { valid: boolean; error?: string } {
    if (!file || file.size === 0) {
      return { valid: false, error: 'The selected file is empty (0 bytes).' };
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type) && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      return {
        valid: false,
        error: `Unsupported image format (${file.type || 'unknown'}). Please upload a JPG, PNG, or WebP file.`
      };
    }

    // Check reasonable file size limits (e.g. max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return { valid: false, error: 'File exceeds maximum limit of 50MB. Please select a smaller image.' };
    }

    return { valid: true };
  }

  validatePdf(file: File): { valid: boolean; error?: string } {
    if (!file || file.size === 0) {
      return { valid: false, error: 'The selected PDF file is empty (0 bytes).' };
    }

    const isPdfType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType) {
      return {
        valid: false,
        error: 'Invalid file format. Only standard PDF (.pdf) documents are supported.'
      };
    }

    // Check size limit (100MB for client-side processing)
    if (file.size > 100 * 1024 * 1024) {
      return {
        valid: false,
        error: 'PDF file exceeds 100MB. Very large documents may crash browser memory.'
      };
    }

    return { valid: true };
  }
}

