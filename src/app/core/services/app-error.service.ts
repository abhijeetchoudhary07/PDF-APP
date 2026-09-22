import { Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';
import { TranslationService } from './translation.service';

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
  private translationService: TranslationService;

  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    translationService?: TranslationService
  ) {
    this.translationService = translationService || new TranslationService();
  }

  /**
   * Translates any thrown exception or error into a user-friendly, localized error object.
   */
  classifyError(error: any): UserFriendlyError {
    const errStr = String(error?.message || error || '').toLowerCase();

    if (errStr.includes('password') || error?.name === 'PasswordException') {
      if (errStr.includes('incorrect') || error?.code === 2) {
        return {
          code: 'INCORRECT_PASSWORD',
          title: this.translationService.translate('errors.incorrectPasswordTitle'),
          message: this.translationService.translate('errors.incorrectPasswordMessage'),
          recoverySuggestion: this.translationService.translate('errors.incorrectPasswordTip')
        };
      }
      return {
        code: 'PASSWORD_REQUIRED',
        title: this.translationService.translate('errors.passwordRequiredTitle'),
        message: this.translationService.translate('errors.passwordRequiredMessage'),
        recoverySuggestion: this.translationService.translate('errors.passwordRequiredTip')
      };
    }

    if (errStr.includes('corrupt') || errStr.includes('invalid pdf') || errStr.includes('unexpected header')) {
      return {
        code: 'CORRUPTED_FILE',
        title: this.translationService.translate('errors.corruptedFileTitle'),
        message: this.translationService.translate('errors.corruptedFileMessage'),
        recoverySuggestion: this.translationService.translate('errors.corruptedFileTip')
      };
    }

    if (errStr.includes('format') || errStr.includes('unsupported') || errStr.includes('not supported')) {
      return {
        code: 'UNSUPPORTED_FORMAT',
        title: this.translationService.translate('errors.unsupportedFormatTitle'),
        message: this.translationService.translate('errors.unsupportedFormatMessage'),
        recoverySuggestion: this.translationService.translate('errors.unsupportedFormatTip')
      };
    }

    if (errStr.includes('memory') || errStr.includes('out of memory') || errStr.includes('allocation failed')) {
      return {
        code: 'MEMORY_LIMIT_EXCEEDED',
        title: this.translationService.translate('errors.memoryLimitTitle'),
        message: this.translationService.translate('errors.memoryLimitMessage'),
        recoverySuggestion: this.translationService.translate('errors.memoryLimitTip')
      };
    }

    if (errStr.includes('cancel') || errStr.includes('abort')) {
      return {
        code: 'CANCELLED_OPERATION',
        title: this.translationService.translate('errors.cancelledTitle'),
        message: this.translationService.translate('errors.cancelledMessage'),
        recoverySuggestion: undefined
      };
    }

    if (errStr.includes('export') || errStr.includes('save')) {
      return {
        code: 'EXPORT_FAILED',
        title: this.translationService.translate('errors.exportFailedTitle'),
        message: this.translationService.translate('errors.exportFailedMessage'),
        recoverySuggestion: this.translationService.translate('errors.exportFailedTip')
      };
    }

    // Default Fallback
    return {
      code: 'UNKNOWN_ERROR',
      title: this.translationService.translate('errors.unknownTitle'),
      message: this.translationService.translate('errors.unknownMessage'),
      recoverySuggestion: this.translationService.translate('errors.unknownTip'),
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
      buttons: [this.translationService.translate('common.close')]
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
