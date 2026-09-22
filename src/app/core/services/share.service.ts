import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class ShareService {
  constructor() {}

  /**
   * Shares a file by URI or File object.
   * On mobile, delegates to Capacitor Share.
   * On web, uses Web Share API if available, or falls back to direct download.
   */
  async shareFile(uriOrFile: string | File, title: string = 'Share File'): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const url = typeof uriOrFile === 'string' ? uriOrFile : URL.createObjectURL(uriOrFile);
        await Share.share({
          title,
          url,
          dialogTitle: 'Share via...'
        });
        return true;
      }

      // Web Platform Handling:
      // Try Web Share API with files if File object provided
      if (typeof uriOrFile !== 'string' && typeof navigator !== 'undefined' && (navigator as any).canShare) {
        const shareData = {
          files: [uriOrFile],
          title,
          text: title
        };
        if ((navigator as any).canShare(shareData)) {
          await navigator.share(shareData);
          return true;
        }
      }

      // If navigator.share without files is available and we have a web URL:
      if (typeof uriOrFile === 'string' && typeof navigator !== 'undefined' && navigator.share && !uriOrFile.startsWith('file://')) {
        await navigator.share({
          title,
          url: uriOrFile
        });
        return true;
      }

      // Browser Fallback: Trigger download
      this.triggerBrowserDownload(uriOrFile, title);
      return true;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Share canceled') {
        return false;
      }
      console.warn('Share error fallback to download', e);
      this.triggerBrowserDownload(uriOrFile, title);
      return true;
    }
  }

  private triggerBrowserDownload(uriOrFile: string | File, defaultName: string) {
    if (typeof document === 'undefined') {
      return;
    }

    let url: string;
    let fileName: string;

    if (typeof uriOrFile === 'string') {
      url = uriOrFile;
      fileName = `${defaultName.replace(/\s+/g, '_')}.pdf`;
    } else {
      url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(uriOrFile) : 'mock-url';
      fileName = uriOrFile.name || `${defaultName.replace(/\s+/g, '_')}.pdf`;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (typeof uriOrFile !== 'string') {
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  }
}

