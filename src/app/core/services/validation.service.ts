import { Injectable, inject } from '@angular/core';
import { TranslationService } from './translation.service';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SUPPORTED_OUTPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  // Non-optional, so the `|| new TranslationService()` fallback this used to
  // carry could never run.
  private translationService = inject(TranslationService);

  validateImage(file: File): { valid: boolean; error?: string } {
    if (!file || file.size === 0) {
      return {
        valid: false,
        error: this.translationService.translate('validation.emptyFile')
      };
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type) && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      return {
        valid: false,
        error: this.translationService.translate('validation.unsupportedImage')
      };
    }

    // Check reasonable file size limits (50MB)
    if (file.size > 50 * 1024 * 1024) {
      return {
        valid: false,
        error: this.translationService.translate('validation.imageTooLarge')
      };
    }

    return { valid: true };
  }

  validatePdf(file: File): { valid: boolean; error?: string } {
    if (!file || file.size === 0) {
      return {
        valid: false,
        error: this.translationService.translate('validation.emptyPdf')
      };
    }

    const isPdfType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType) {
      return {
        valid: false,
        error: this.translationService.translate('validation.invalidPdf')
      };
    }

    // Check size limit (100MB for client-side processing)
    if (file.size > 100 * 1024 * 1024) {
      return {
        valid: false,
        error: this.translationService.translate('validation.pdfTooLarge')
      };
    }

    return { valid: true };
  }
}
