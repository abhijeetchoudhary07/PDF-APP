import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/** Maximum file size in bytes to safely buffer and share in memory (100 MB). */
const MAX_SHARE_FILE_SIZE = 100 * 1024 * 1024;

@Injectable({
  providedIn: 'root'
})
export class ShareService {
  private isSharing = false;

  constructor() {}

  /**
   * Checks whether the current platform supports native file sharing.
   * Returns true on native mobile (Capacitor) or on browsers where the Web Share API supports file sharing.
   */
  canShareFiles(file?: File | string): boolean {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    if (typeof navigator !== 'undefined' && (navigator as any).canShare) {
      if (!file) {
        try {
          const dummy = new File([new Blob([''])], 'test.png', { type: 'image/png' });
          return (navigator as any).canShare({ files: [dummy] });
        } catch {
          return true;
        }
      }
      if (file instanceof File) {
        try {
          return (navigator as any).canShare({ files: [file] });
        } catch {
          return false;
        }
      }
      return true;
    }
    return false;
  }

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
          dialogTitle: options.title || 'Share via...'
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
      if (this.isAbortError(e)) {
        return false;
      }
      console.warn('Share error', e);
      return false;
    }
  }

  /**
   * Shares an actual file (image, PDF, signature, etc.) via native device share
   * (Capacitor Share on mobile, Web Share API on modern browsers).
   * Note: On native Android/iOS and Web Share API, ONLY the file is passed
   * without local/host URLs so apps like WhatsApp, Telegram, and Gmail receive
   * the actual image or PDF instead of plain text links.
   *
   * Falls back to direct browser download if file sharing is not supported.
   */
  async shareFile(uriOrFile: string | File, title: string = 'Share File'): Promise<boolean> {
    if (!uriOrFile || uriOrFile === 'web-download') {
      return false;
    }

    if (this.isSharing) {
      return false;
    }
    this.isSharing = true;

    try {
      // 1. Check size bounds to prevent OOM denial of service
      if (uriOrFile instanceof File && uriOrFile.size > MAX_SHARE_FILE_SIZE) {
        console.warn(`File exceeds max share limit of ${MAX_SHARE_FILE_SIZE / (1024 * 1024)}MB. Triggering download instead.`);
        this.triggerBrowserDownload(uriOrFile, title);
        return false;
      }

      // 2. Mobile Native Platform (Capacitor Android & iOS)
      if (Capacitor.isNativePlatform()) {
        let fileUri: string;
        if (typeof uriOrFile === 'string') {
          if (uriOrFile.startsWith('file://') || uriOrFile.startsWith('content://')) {
            fileUri = uriOrFile;
          } else if (uriOrFile.startsWith('data:') || uriOrFile.startsWith('blob:') || uriOrFile.startsWith('http')) {
            fileUri = await this.urlToCacheFileUri(uriOrFile, title);
          } else {
            fileUri = uriOrFile;
          }
        } else {
          fileUri = await this.fileToCacheFileUri(uriOrFile);
        }

        // Clean up older cached files in the background
        this.cleanupOldCache().catch(() => {});

        // On Android / iOS, passing the fileUri in `files` array opens the system share sheet
        // with the file attached so apps like WhatsApp, Telegram, Gmail, etc. receive the real file.
        // DO NOT set `url` or `text` here as it overrides the Android intent to text/plain.
        await Share.share({
          title,
          files: [fileUri],
          dialogTitle: title || 'Share via...'
        });
        return true;
      }

      // 3. Web Platform (Browser)
      if (typeof navigator !== 'undefined' && (navigator as any).canShare) {
        let fileToShare: File | undefined;
        if (uriOrFile instanceof File) {
          fileToShare = uriOrFile;
        } else if (typeof uriOrFile === 'string') {
          fileToShare = await this.uriToFile(uriOrFile, title);
        }

        if (fileToShare) {
          const shareData: { files: File[]; title?: string } = {
            files: [fileToShare],
            title: title || fileToShare.name
          };
          if ((navigator as any).canShare(shareData)) {
            // Note: pass ONLY files (and title), never pass page URL (like localhost)
            await navigator.share(shareData);
            return true;
          }
        }
      }

      // 4. Fallback: Browser download when native file sharing is not supported
      this.triggerBrowserDownload(uriOrFile, title);
      return false;
    } catch (e: any) {
      if (this.isAbortError(e)) {
        return false;
      }
      console.warn('Share file error, falling back to download:', e);
      this.triggerBrowserDownload(uriOrFile, title);
      return false;
    } finally {
      this.isSharing = false;
    }
  }

  /**
   * Generates URLs for sharing across major social platforms.
   * Always sanitizes URLs to avoid leaking localhost / 127.0.0.1 to external apps.
   */
  getSocialShareUrls(params: { title?: string; text?: string; url?: string }): {
    whatsapp: string;
    telegram: string;
    twitter: string;
    facebook: string;
    linkedin: string;
    email: string;
  } {
    let currentUrl = params.url || (typeof window !== 'undefined' ? window.location.href : 'https://indianformhelper.com');
    if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      currentUrl = 'https://indianformhelper.com';
    }
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

  /**
   * Triggers a browser download of a file or URI.
   */
  triggerBrowserDownload(uriOrFile: string | File, defaultName: string): void {
    if (typeof document === 'undefined') {
      return;
    }

    let url: string;
    let fileName: string;

    if (typeof uriOrFile === 'string') {
      url = uriOrFile;
      const dot = defaultName.lastIndexOf('.');
      fileName = dot > 0 ? this.sanitizeFileName(defaultName) : `${this.sanitizeFileName(defaultName)}.pdf`;
    } else {
      url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(uriOrFile) : 'mock-url';
      fileName = this.sanitizeFileName(uriOrFile.name || defaultName);
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

  private async fileToCacheFileUri(file: File): Promise<string> {
    const base64Data = await this.blobToBase64(file);
    const safeName = this.sanitizeFileName(file.name || 'file.jpg');
    const path = `share_cache/${Date.now()}_${safeName}`;
    const result = await Filesystem.writeFile({
      path,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true
    });
    return result.uri;
  }

  private async urlToCacheFileUri(url: string, defaultName: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    const base64Data = await this.blobToBase64(blob);
    const ext = this.getExtensionFromMime(blob.type) || 'bin';
    const safeName = this.sanitizeFileName(defaultName.includes('.') ? defaultName : `${defaultName}.${ext}`);
    const path = `share_cache/${Date.now()}_${safeName}`;
    const result = await Filesystem.writeFile({
      path,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true
    });
    return result.uri;
  }

  private async uriToFile(uri: string, filename: string): Promise<File | undefined> {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const dot = filename.lastIndexOf('.');
      let name = filename;
      if (dot <= 0) {
        const ext = this.getExtensionFromMime(blob.type);
        name = `${filename}.${ext}`;
      }
      return new File([blob], this.sanitizeFileName(name), { type: blob.type || 'application/octet-stream' });
    } catch {
      return undefined;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Sanitizes filenames to prevent path traversal, hidden files, or illegal filesystem characters.
   */
  sanitizeFileName(name: string): string {
    if (!name) return 'shared_file';
    // Extract base name to block path traversal (e.g. ../../)
    const base = name.split(/[/\\]/).pop() || 'shared_file';
    // Strip leading dots to prevent hidden files on Unix/Android
    const noHidden = base.replace(/^\.+/, '');
    // Replace non-whitelisted characters with underscore
    const cleaned = noHidden.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Bound length to 120 chars to avoid OS ENAMETOOLONG errors
    const safe = cleaned.slice(0, 120);
    return safe.length > 0 ? safe : 'shared_file';
  }

  /**
   * Maps MIME types to standard file extensions.
   */
  getExtensionFromMime(mime: string): string {
    if (!mime) return 'bin';
    const lower = mime.toLowerCase();
    if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
    if (lower.includes('png')) return 'png';
    if (lower.includes('webp')) return 'webp';
    if (lower.includes('gif')) return 'gif';
    if (lower.includes('svg')) return 'svg';
    if (lower.includes('tiff')) return 'tiff';
    if (lower.includes('pdf')) return 'pdf';
    if (lower.includes('zip')) return 'zip';
    if (lower.includes('csv')) return 'csv';
    if (lower.includes('json')) return 'json';
    if (lower.includes('wordprocessingml') || lower.includes('docx')) return 'docx';
    if (lower.includes('text/plain')) return 'txt';
    return 'bin';
  }

  private isAbortError(e: any): boolean {
    if (!e) return false;
    if (e.name === 'AbortError') return true;
    const msg = (e.message || String(e)).toLowerCase();
    return msg.includes('cancel') || msg.includes('abort') || msg.includes('dismiss');
  }

  private async cleanupOldCache(): Promise<void> {
    try {
      const entries = await Filesystem.readdir({
        path: 'share_cache',
        directory: Directory.Cache
      });
      if (entries.files && entries.files.length > 10) {
        for (let i = 0; i < entries.files.length - 5; i++) {
          const fileEntry = entries.files[i];
          const fileName = typeof fileEntry === 'string' ? fileEntry : fileEntry.name;
          await Filesystem.deleteFile({
            path: `share_cache/${fileName}`,
            directory: Directory.Cache
          }).catch(() => {});
        }
      }
    } catch {
      // Safe to ignore if cache dir doesn't exist
    }
  }
}
