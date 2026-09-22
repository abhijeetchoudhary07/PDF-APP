import { Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';

export type AppErrorCode =
  | 'INVALID_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPTED_FILE'
  | 'PASSWORD_REQUIRED'
  | 'INCORRECT_PASSWORD'
  | 'CONVERSION_FAILED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'MOBILE_LIMITATION'
  | 'CANCELLED_OPERATION'
  | 'EXPORT_FAILED'
  | 'UNKNOWN_ERROR';

export interface UserFriendlyError {
  code: AppErrorCode;
  title: string;
  message: string;
  recoverySuggestion?: string;
  rawDetails?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppErrorService {
  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  /**
   * Translates any thrown exception or error into a user-friendly error object.
   */
  classifyError(error: any): UserFriendlyError {
    const errStr = String(error?.message || error || '').toLowerCase();

    if (errStr.includes('password') || error?.name === 'PasswordException') {
      if (errStr.includes('incorrect') || error?.code === 2) {
        return {
          code: 'INCORRECT_PASSWORD',
          title: 'Incorrect Password',
          message: 'The password entered does not match the document credentials.',
          recoverySuggestion: 'Please verify the password and try again.'
        };
      }
      return {
        code: 'PASSWORD_REQUIRED',
        title: 'Password Protected Document',
        message: 'This PDF document is encrypted and requires an authorized password to open.',
        recoverySuggestion: 'Enter the document open password to proceed.'
      };
    }

    if (errStr.includes('corrupt') || errStr.includes('invalid pdf') || errStr.includes('unexpected header')) {
      return {
        code: 'CORRUPTED_FILE',
        title: 'Damaged or Corrupted File',
        message: 'The selected file appears to be incomplete or damaged.',
        recoverySuggestion: 'Try downloading or obtaining a fresh copy of this file.'
      };
    }

    if (errStr.includes('format') || errStr.includes('unsupported') || errStr.includes('not supported')) {
      return {
        code: 'UNSUPPORTED_FORMAT',
        title: 'Unsupported File Format',
        message: 'This document format or encryption method cannot be processed by the offline engine.',
        recoverySuggestion: 'Please convert the file to a standard PDF, JPG, or PNG before processing.'
      };
    }

    if (errStr.includes('memory') || errStr.includes('out of memory') || errStr.includes('allocation failed')) {
      return {
        code: 'MEMORY_LIMIT_EXCEEDED',
        title: 'Document Too Large for Memory',
        message: 'Processing this large document exceeded available browser memory.',
        recoverySuggestion: 'Try processing fewer pages at a time or compressing the PDF first.'
      };
    }

    if (errStr.includes('cancel') || errStr.includes('abort')) {
      return {
        code: 'CANCELLED_OPERATION',
        title: 'Operation Cancelled',
        message: 'The operation was cancelled by the user.',
        recoverySuggestion: undefined
      };
    }

    if (errStr.includes('export') || errStr.includes('save')) {
      return {
        code: 'EXPORT_FAILED',
        title: 'Export Failed',
        message: 'Could not write or download the exported file.',
        recoverySuggestion: 'Check your device storage space and permissions.'
      };
    }

    // Default Fallback
    return {
      code: 'UNKNOWN_ERROR',
      title: 'Processing Error',
      message: 'An unexpected issue occurred while processing your document.',
      recoverySuggestion: 'Please verify the file format and try again.',
      rawDetails: error?.message || String(error)
    };
  }

  /**
   * Displays an alert modal with the user-friendly error and recovery recommendation.
   */
  async showErrorAlert(error: any): Promise<void> {
    const userError = this.classifyError(error);

    let fullMessage = userError.message;
    if (userError.recoverySuggestion) {
      fullMessage += `\n\nTip: ${userError.recoverySuggestion}`;
    }

    const alert = await this.alertCtrl.create({
      header: userError.title,
      message: fullMessage,
      buttons: ['OK']
    });

    await alert.present();
  }

  /**
   * Displays a lightweight toast for non-blocking notifications.
   */
  async showErrorToast(error: any): Promise<void> {
    const userError = this.classifyError(error);

    const toast = await this.toastCtrl.create({
      header: userError.title,
      message: userError.message,
      duration: 3500,
      color: 'danger',
      position: 'bottom'
    });

    await toast.present();
  }
}
