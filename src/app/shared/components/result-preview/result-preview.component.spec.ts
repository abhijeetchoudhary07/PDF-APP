import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResultPreviewComponent } from './result-preview.component';
import { ShareService } from '../../../core/services/share.service';
import { TestBed } from '@angular/core/testing';

describe('ResultPreviewComponent', () => {
  let component: ResultPreviewComponent;
  let mockShareService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockShareService = {
      canShareFiles: vi.fn().mockReturnValue(true),
      shareFile: vi.fn().mockResolvedValue(true),
      triggerBrowserDownload: vi.fn(),
      getSocialShareUrls: vi.fn().mockReturnValue({
        whatsapp: 'https://api.whatsapp.com/send?text=test',
        telegram: 'https://t.me/share/url?url=test',
        twitter: 'https://twitter.com/intent/tweet?text=test',
        facebook: 'https://www.facebook.com/sharer/sharer.php?u=test',
        linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=test',
        email: 'mailto:?subject=test'
      })
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ShareService, useValue: mockShareService }
      ]
    });

    component = TestBed.runInInjectionContext(() => new ResultPreviewComponent());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handleShare shares file directly and emits shared event when canShareFiles is true', async () => {
    const testFile = new File(['image-bytes'], '92389283.jpg', { type: 'image/jpeg' });
    component.file = testFile;
    component.outputFilename = '92389283.jpg';

    const sharedSpy = vi.fn();
    component.shared.subscribe(sharedSpy);

    await component.handleShare();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(testFile, '92389283.jpg');
    expect(sharedSpy).toHaveBeenCalled();
    expect(component.isShareModalOpen).toBe(false);
  });

  it('handleShare falls back to openShareModal when canShareFiles is false', async () => {
    mockShareService.canShareFiles.mockReturnValue(false);
    const testFile = new File(['image-bytes'], '92389283.jpg', { type: 'image/jpeg' });
    component.file = testFile;

    await component.handleShare();

    expect(component.isShareModalOpen).toBe(true);
  });

  it('handleShare falls back to openShareModal safely if resolveFile returns undefined', async () => {
    component.file = undefined;
    component.afterUrl = undefined;

    await component.handleShare();

    expect(component.isShareModalOpen).toBe(true);
  });

  it('shareViaWhatsApp shares file directly when canShareFiles is true', async () => {
    const testFile = new File(['image-bytes'], '92389283.jpg', { type: 'image/jpeg' });
    component.file = testFile;
    component.isShareModalOpen = true;

    await component.shareViaWhatsApp();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(testFile, '92389283.jpg');
    expect(component.isShareModalOpen).toBe(false);
  });

  it('shareViaWhatsApp downloads file and opens WhatsApp web on unsupported desktop browser', async () => {
    mockShareService.canShareFiles.mockReturnValue(false);
    const testFile = new File(['image-bytes'], '92389283.jpg', { type: 'image/jpeg' });
    component.file = testFile;
    component.isShareModalOpen = true;

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await component.shareViaWhatsApp();

    expect(mockShareService.triggerBrowserDownload).toHaveBeenCalledWith(testFile, '92389283.jpg');
    expect(windowOpenSpy).toHaveBeenCalledWith('https://web.whatsapp.com', '_blank');
    expect(component.isShareModalOpen).toBe(false);

    windowOpenSpy.mockRestore();
  });

  it('shareViaTelegram shares file directly when canShareFiles is true', async () => {
    const testFile = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });
    component.file = testFile;
    component.isShareModalOpen = true;

    await component.shareViaTelegram();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(testFile, 'doc.pdf');
    expect(component.isShareModalOpen).toBe(false);
  });

  it('shareViaTelegram downloads file and opens Telegram web on fallback', async () => {
    mockShareService.canShareFiles.mockReturnValue(false);
    const testFile = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });
    component.file = testFile;
    component.isShareModalOpen = true;

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await component.shareViaTelegram();

    expect(mockShareService.triggerBrowserDownload).toHaveBeenCalledWith(testFile, 'doc.pdf');
    expect(windowOpenSpy).toHaveBeenCalledWith('https://web.telegram.org', '_blank');
    expect(component.isShareModalOpen).toBe(false);

    windowOpenSpy.mockRestore();
  });

  it('shareViaEmail shares file directly when canShareFiles is true', async () => {
    const testFile = new File(['data'], 'test.png', { type: 'image/png' });
    component.file = testFile;
    component.isShareModalOpen = true;

    await component.shareViaEmail();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(testFile, 'test.png');
    expect(component.isShareModalOpen).toBe(false);
  });

  it('shareNative calls shareService.shareFile without passing localhost URL', async () => {
    const testFile = new File(['pdf-bytes'], 'document.pdf', { type: 'application/pdf' });
    component.file = testFile;

    await component.shareNative();

    expect(mockShareService.shareFile).toHaveBeenCalledWith(testFile, 'document.pdf');
  });

  it('copyShareLink does not contain localhost or 127.0.0.1', async () => {
    component.outputFilename = '92389283.jpg';
    let copiedText = '';
    const origNav = (globalThis as any).navigator;
    (globalThis as any).navigator = {
      clipboard: {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        })
      }
    };

    await component.copyShareLink();

    expect(copiedText).not.toContain('localhost');
    expect(copiedText).toContain('https://indianformhelper.com');

    (globalThis as any).navigator = origNav;
  });

  it('resolveFile retrieves file from afterUrl if file property is missing', async () => {
    const mockBlob = new Blob(['sample-content'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(mockBlob)
    } as any);

    component.file = undefined;
    component.afterUrl = 'blob:http://localhost/mock-blob-id';
    component.outputFilename = 'signature.png';

    const resolved = await component.resolveFile();

    expect(resolved).toBeDefined();
    expect(resolved?.name).toBe('signature.png');
    expect(resolved?.type).toBe('image/png');
  });

  it('resolveFile handles fetch failure gracefully without throwing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    component.file = undefined;
    component.afterUrl = 'blob:invalid';

    const resolved = await component.resolveFile();
    expect(resolved).toBeUndefined();
  });
});
