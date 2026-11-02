import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShareService } from './share.service';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false)
  }
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ activityType: 'com.whatsapp' })
  }
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///data/user/0/cache/share_cache/test.jpg' }),
    readdir: vi.fn().mockResolvedValue({ files: [] }),
    deleteFile: vi.fn().mockResolvedValue(undefined)
  },
  Directory: {
    Cache: 'CACHE',
    Documents: 'DOCUMENTS'
  }
}));

describe('ShareService', () => {
  let service: ShareService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ShareService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('canShareFiles', () => {
    it('returns true on native mobile platform (Capacitor)', () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      expect(service.canShareFiles()).toBe(true);
    });

    it('returns true on web when navigator.canShare returns true', () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const testFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const origNav = (globalThis as any).navigator;
      (globalThis as any).navigator = {
        canShare: vi.fn().mockReturnValue(true),
        share: vi.fn()
      };

      expect(service.canShareFiles(testFile)).toBe(true);
      (globalThis as any).navigator = origNav;
    });

    it('returns false on web when navigator.canShare is undefined', () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const testFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const origNav = (globalThis as any).navigator;
      (globalThis as any).navigator = {};

      expect(service.canShareFiles(testFile)).toBe(false);
      (globalThis as any).navigator = origNav;
    });
  });

  describe('share (text/url)', () => {
    it('delegates to Share.share on Capacitor native platform', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const result = await service.share({ title: 'My Title', text: 'Hello', url: 'https://example.com' });

      expect(result).toBe(true);
      expect(Share.share).toHaveBeenCalledWith({
        title: 'My Title',
        text: 'Hello',
        url: 'https://example.com',
        dialogTitle: 'My Title'
      });
    });

    it('delegates to navigator.share on web platform', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const origNav = (globalThis as any).navigator;
      const mockShare = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).navigator = {
        share: mockShare
      };

      const result = await service.share({ title: 'Web Share', text: 'Text', url: 'https://example.com' });
      expect(result).toBe(true);
      expect(mockShare).toHaveBeenCalledWith({ title: 'Web Share', text: 'Text', url: 'https://example.com' });

      (globalThis as any).navigator = origNav;
    });
  });

  describe('shareFile', () => {
    it('returns false immediately if uriOrFile is web-download or missing', async () => {
      expect(await service.shareFile('web-download')).toBe(false);
      expect(await service.shareFile('')).toBe(false);
    });

    it('on Capacitor native platform: writes File to Cache and shares file:// URI without localhost URL', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const imageFile = new File(['mock-image-bytes'], 'photo_92389283.jpg', { type: 'image/jpeg' });

      const success = await service.shareFile(imageFile, 'Passport Photo');

      expect(success).toBe(true);
      expect(Filesystem.writeFile).toHaveBeenCalled();
      expect(Share.share).toHaveBeenCalledWith({
        title: 'Passport Photo',
        files: ['file:///data/user/0/cache/share_cache/test.jpg'],
        dialogTitle: 'Passport Photo'
      });
    });

    it('on Capacitor native platform: cleans up old cache files when cache has > 10 files', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const files = Array.from({ length: 12 }, (_, i) => ({ name: `old_file_${i}.jpg` }));
      vi.mocked(Filesystem.readdir).mockResolvedValue({ files } as any);

      const imageFile = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
      await service.shareFile(imageFile, 'Photo');

      expect(Filesystem.deleteFile).toHaveBeenCalled();
    });

    it('on Capacitor native platform: shares existing file:// URI directly', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const existingUri = 'file:///storage/emulated/0/Documents/doc.pdf';

      const success = await service.shareFile(existingUri, 'PDF Document');

      expect(success).toBe(true);
      expect(Filesystem.writeFile).not.toHaveBeenCalled();
      expect(Share.share).toHaveBeenCalledWith({
        title: 'PDF Document',
        files: [existingUri],
        dialogTitle: 'PDF Document'
      });
    });

    it('on Web platform: shares File via navigator.share without injecting page URL or text', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const imageFile = new File(['mock-image-bytes'], '92389283.jpg', { type: 'image/jpeg' });
      const origNav = (globalThis as any).navigator;
      const mockShare = vi.fn().mockResolvedValue(undefined);
      const mockCanShare = vi.fn().mockReturnValue(true);
      (globalThis as any).navigator = {
        canShare: mockCanShare,
        share: mockShare
      };

      const success = await service.shareFile(imageFile, 'Shared Image');

      expect(success).toBe(true);
      expect(mockCanShare).toHaveBeenCalledWith({
        files: [imageFile],
        title: 'Shared Image'
      });
      expect(mockShare).toHaveBeenCalledWith({
        files: [imageFile],
        title: 'Shared Image'
      });

      (globalThis as any).navigator = origNav;
    });

    it('on Web platform: triggers browser download fallback if navigator.canShare returns false', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const imageFile = new File(['bytes'], '92389283.jpg', { type: 'image/jpeg' });
      const downloadSpy = vi.spyOn(service, 'triggerBrowserDownload').mockImplementation(() => {});

      const origNav = (globalThis as any).navigator;
      (globalThis as any).navigator = {
        canShare: vi.fn().mockReturnValue(false),
        share: vi.fn()
      };

      const success = await service.shareFile(imageFile, 'Passport Photo');

      expect(success).toBe(false);
      expect(downloadSpy).toHaveBeenCalledWith(imageFile, 'Passport Photo');

      (globalThis as any).navigator = origNav;
    });

    it('gracefully handles user cancellation without downloading', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const imageFile = new File(['bytes'], '92389283.jpg', { type: 'image/jpeg' });
      const downloadSpy = vi.spyOn(service, 'triggerBrowserDownload').mockImplementation(() => {});

      const abortError = new Error('Share canceled');
      abortError.name = 'AbortError';

      const origNav = (globalThis as any).navigator;
      (globalThis as any).navigator = {
        canShare: vi.fn().mockReturnValue(true),
        share: vi.fn().mockRejectedValue(abortError)
      };

      const result = await service.shareFile(imageFile, 'Passport Photo');

      expect(result).toBe(false);
      expect(downloadSpy).not.toHaveBeenCalled();

      (globalThis as any).navigator = origNav;
    });

    it('protects against OOM when file exceeds 100MB by falling back to download', async () => {
      const hugeFile = new File(['data'], 'huge.pdf', { type: 'application/pdf' });
      Object.defineProperty(hugeFile, 'size', { value: 105 * 1024 * 1024 }); // 105MB

      const downloadSpy = vi.spyOn(service, 'triggerBrowserDownload').mockImplementation(() => {});
      const result = await service.shareFile(hugeFile, 'Huge PDF');

      expect(result).toBe(false);
      expect(downloadSpy).toHaveBeenCalledWith(hugeFile, 'Huge PDF');
    });
  });

  describe('Security & Sanitization', () => {
    it('sanitizes path traversal attempts in filename', () => {
      const sanitized = service.sanitizeFileName('../../../../etc/passwd.jpg');
      expect(sanitized).toBe('passwd.jpg');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('..');
    });

    it('strips leading dots to prevent hidden files', () => {
      const sanitized = service.sanitizeFileName('...secret.png');
      expect(sanitized).toBe('secret.png');
    });

    it('sanitizes script tags and illegal characters', () => {
      const sanitized = service.sanitizeFileName('<script>alert(1)</script>.pdf');
      expect(sanitized).toBe('script_.pdf');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('/');
    });

    it('truncates excessively long filenames', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      const sanitized = service.sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(120);
    });

    it('maps various MIME types to proper file extensions', () => {
      expect(service.getExtensionFromMime('image/jpeg')).toBe('jpg');
      expect(service.getExtensionFromMime('image/png')).toBe('png');
      expect(service.getExtensionFromMime('image/webp')).toBe('webp');
      expect(service.getExtensionFromMime('image/svg+xml')).toBe('svg');
      expect(service.getExtensionFromMime('application/pdf')).toBe('pdf');
      expect(service.getExtensionFromMime('application/zip')).toBe('zip');
      expect(service.getExtensionFromMime('text/csv')).toBe('csv');
      expect(service.getExtensionFromMime('application/json')).toBe('json');
      expect(service.getExtensionFromMime('text/plain')).toBe('txt');
      expect(service.getExtensionFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    });
  });

  describe('getSocialShareUrls', () => {
    it('never leaks localhost or 127.0.0.1 in share URLs', () => {
      const urls = service.getSocialShareUrls({
        title: 'Share 92389283.jpg',
        text: 'Document prepared with Indian Form Helper: 92389283.jpg',
        url: 'http://localhost/features/photo'
      });

      expect(urls.whatsapp).not.toContain('localhost');
      expect(urls.whatsapp).toContain('https%3A%2F%2Findianformhelper.com');
      expect(urls.telegram).not.toContain('localhost');
      expect(urls.telegram).toContain('https%3A%2F%2Findianformhelper.com');
      expect(urls.twitter).not.toContain('localhost');
    });

    it('preserves valid production URLs', () => {
      const urls = service.getSocialShareUrls({
        title: 'Share Doc',
        text: 'Check this out',
        url: 'https://indianformhelper.com/features/photo'
      });

      expect(urls.whatsapp).toContain(encodeURIComponent('https://indianformhelper.com/features/photo'));
    });
  });

  describe('triggerBrowserDownload', () => {
    it('handles image extensions correctly and clicks download anchor', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      service.triggerBrowserDownload('blob:http://localhost/1234', '92389283.jpg');

      expect(clickSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });
});
