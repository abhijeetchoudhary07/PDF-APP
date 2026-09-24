import { Injectable, inject } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';
import { FileService } from './file.service';
import { ToastService } from './toast.service';
import { UsageQuotaService } from './usage-quota.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly quota = inject(UsageQuotaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  constructor(private fileService: FileService) {}

  /**
   * Writes a finished file to the device, and meters it.
   *
   * This is the one place every tool's output passes through, which makes it
   * the only gate that cannot be walked around by using a different screen.
   * Metering here also gives the free tier the semantics we promise: a run that
   * fails never reaches this method, so it never costs an operation.
   *
   * `operationId` groups the writes belonging to one run. A split that produces
   * ten files, or a batch that produces fifty, is a single operation to the
   * person who started it — pass the same id for every file in the group and it
   * is counted once. Left out, it is derived from the file, so saving a result
   * and then sharing that same result also counts once rather than twice.
   */
  async saveFile(
    file: File,
    prefix: string = 'file',
    operationId?: string,
  ): Promise<string | undefined> {
    if (!(await this.quota.canStart())) {
      await this.reportQuotaExhausted();
      return undefined;
    }

    try {
      if (!file) throw new Error('File is missing');

      const ext = file.name.split('.').pop() || 'jpg';
      const sizeKB = Math.round(file.size / 1024);
      // Example: photo_50kb_1638210.jpg to prevent overwrites
      const safeName = `${prefix}_${sizeKB}kb_${Math.floor(Date.now() / 1000)}.${ext}`;

      let uri: string;
      if (Capacitor.isNativePlatform()) {
        const base64Data = await this.fileService.blobToBase64(file);
        const result = await Filesystem.writeFile({
          path: safeName,
          data: base64Data,
          directory: Directory.Documents
        });
        uri = result.uri;
      } else {
        // Web fallback
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        a.click();
        URL.revokeObjectURL(url);
        uri = 'web-download';
      }

      // Only a file that actually landed is counted.
      await this.quota.consume(
        operationId ?? `${file.name}|${file.size}|${file.lastModified}`,
      );
      return uri;
    } catch (e: any) {
      /*
       * A toast rather than alert(): a modal dialog blocks the whole webview,
       * and on Android it is the wrong shape for a recoverable write failure.
       */
      this.toast.error(e?.message ? `Could not save the file: ${e.message}` : 'Could not save the file.');
      console.error('Error saving file', e);
      return undefined;
    }
  }

  /**
   * Tells the person why nothing was saved and where to go next.
   *
   * Sent once with the paywall in the same gesture: a bare "limit reached"
   * message with no route forward reads as a bug rather than a tier.
   */
  private async reportQuotaExhausted(): Promise<void> {
    this.toast.warning(
      `You have used all ${this.quota.limit} free operations for today. ` +
        'They reset tomorrow, or go Premium for unlimited use.',
      'Daily limit reached',
    );
    await this.router.navigate(['/features/premium']);
  }
}
