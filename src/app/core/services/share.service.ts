import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class ShareService {
  constructor() {}

  /**
   * Shares text, URL, or general content via Capacitor Share or Web Share API.
   */
  async share(options: { title?: string; text?: string; url?: string }): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: options.title,
          text: options.text,
          url: options.url,
          dialogTitle: 'Share via...'
        });
        return true;
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(options);
        return true;
      }
      if (options.text || options.url) {
        await navigator.clipboard.writeText(options.url || options.text || '');
        return true;
      }
      return false;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Share canceled') {
        return false;
      }
      console.warn('Share error', e);
      return false;
    }
  }

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

  /**
   * Generates URLs for sharing across major social platforms.
   */
  getSocialShareUrls(params: { title?: string; text?: string; url?: string }): {
    whatsapp: string;
    telegram: string;
    twitter: string;
    facebook: string;
    linkedin: string;
    email: string;
  } {
    const currentUrl = params.url || (typeof window !== 'undefined' ? window.location.href : 'https://indianformhelper.com');
    const shareText = params.text ? `${params.text} - ${currentUrl}` : `Check out this document prepared with Indian Form Helper: ${currentUrl}`;
    const shareTitle = params.title || 'Document from Indian Form Helper';

    return {
      whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareTitle)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(currentUrl)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`,
      email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText)}`
    };
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

