import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FileService } from './file.service';

/*
 * File pickers and object-URL bookkeeping.
 *
 * The picker methods are thin wrappers around a hidden <input type="file">;
 * what is worth pinning down there is the cancel path, because a picker that
 * resolves nothing on cancel leaves a tool page waiting forever on an await.
 *
 * The object-URL tracking matters for a different reason: this app holds whole
 * PDFs and full-resolution photos in blobs, and a URL that is created and never
 * revoked pins that blob in memory for the life of the tab. On a low-end phone
 * a few of those is the difference between working and being killed.
 */
describe('FileService', () => {
  let files: FileService;
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    let n = 0;
    (URL as any).createObjectURL = vi.fn(() => {
      const url = `blob:mock/${n++}`;
      created.push(url);
      return url;
    });
    (URL as any).revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    files = TestBed.inject(FileService);
  });

  describe('object URLs', () => {
    it('hands back a URL and remembers it', () => {
      const url = files.createObjectUrl(new Blob(['x']));

      expect(url).toBe('blob:mock/0');
      files.revokeObjectUrl(url);
      expect(revoked).toEqual([url]);
    });

    it('ignores a URL it did not create', () => {
      files.revokeObjectUrl('blob:somewhere-else');

      expect(revoked).toEqual([]);
    });

    it('ignores undefined', () => {
      expect(() => files.revokeObjectUrl(undefined)).not.toThrow();
      expect(revoked).toEqual([]);
    });

    it('revokes a URL only once, however many times it is asked', () => {
      const url = files.createObjectUrl(new Blob(['x']));

      files.revokeObjectUrl(url);
      files.revokeObjectUrl(url);

      expect(revoked).toEqual([url]);
    });

    it('releases everything still outstanding when a page is torn down', () => {
      const a = files.createObjectUrl(new Blob(['a']));
      const b = files.createObjectUrl(new Blob(['b']));
      const c = files.createObjectUrl(new Blob(['c']));
      files.revokeObjectUrl(b);

      files.clearTrackedUrls();

      expect(new Set(revoked)).toEqual(new Set([a, b, c]));
      // And nothing is left to double-revoke afterwards.
      revoked.length = 0;
      files.clearTrackedUrls();
      expect(revoked).toEqual([]);
    });

    it('keeps going if one revoke throws', () => {
      files.createObjectUrl(new Blob(['a']));
      const good = files.createObjectUrl(new Blob(['b']));
      (URL as any).revokeObjectURL = vi.fn((url: string) => {
        if (url === 'blob:mock/0') throw new Error('already gone');
        revoked.push(url);
      });

      expect(() => files.clearTrackedUrls()).not.toThrow();
      expect(revoked).toContain(good);
    });
  });

  describe('blobToBase64', () => {
    it('strips the data: prefix so the value can go straight to Filesystem.writeFile', async () => {
      const base64 = await files.blobToBase64(new Blob(['ABC'], { type: 'text/plain' }));

      expect(base64).not.toContain(',');
      expect(base64).not.toMatch(/^data:/);
      expect(atob(base64)).toBe('ABC');
    });

    it('round-trips binary content', async () => {
      const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
      const base64 = await files.blobToBase64(new Blob([bytes]));

      const decoded = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    });
  });

  describe('downloads', () => {
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => clickSpy.mockRestore());

    it('names the download and cleans up after itself', () => {
      files.downloadBlob(new Blob(['x']), 'result.pdf');

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revoked).toEqual(created);
      // The anchor is a temporary; leaving it behind would litter every page
      // that saves something.
      expect(document.querySelectorAll('a[download]').length).toBe(0);
    });

    it('takes the name from the file when given one', () => {
      const anchors: HTMLAnchorElement[] = [];
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'a') anchors.push(el as HTMLAnchorElement);
        return el;
      }) as typeof document.createElement);

      files.downloadFile(new File(['x'], 'passport_photo.jpg', { type: 'image/jpeg' }));

      expect(anchors[0].download).toBe('passport_photo.jpg');
      vi.mocked(document.createElement).mockRestore();
    });
  });

  describe('pickers', () => {
    /*
     * Each picker builds its own <input>, so the only way to drive it is to
     * intercept the element on the way out of createElement.
     */
    function captureInput(): { input: () => HTMLInputElement } {
      let captured: HTMLInputElement | undefined;
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'input') {
          captured = el as HTMLInputElement;
          (el as HTMLInputElement).click = () => undefined;
        }
        return el;
      }) as typeof document.createElement);
      return { input: () => captured! };
    }

    afterEach(() => {
      vi.mocked(document.createElement).mockRestore?.();
    });

    it('resolves undefined when a single-file picker is cancelled', async () => {
      const { input } = captureInput();
      const pending = files.pickPdfFile();

      input().oncancel!(new Event('cancel'));

      await expect(pending).resolves.toBeUndefined();
    });

    it('resolves an empty array when a multi-file picker is cancelled', async () => {
      const { input } = captureInput();
      const pending = files.pickMultiplePdfs();

      input().oncancel!(new Event('cancel'));

      await expect(pending).resolves.toEqual([]);
    });

    it('resolves the chosen file', async () => {
      const { input } = captureInput();
      const pending = files.pickPdfFile();
      const chosen = new File(['x'], 'form.pdf', { type: 'application/pdf' });

      input().onchange!({ target: { files: [chosen] } } as unknown as Event);

      await expect(pending).resolves.toBe(chosen);
    });

    it('resolves undefined when the change fires with nothing selected', async () => {
      const { input } = captureInput();
      const pending = files.pickPdfFile();

      input().onchange!({ target: { files: [] } } as unknown as Event);

      await expect(pending).resolves.toBeUndefined();
    });

    it('asks for the formats the app can actually process', async () => {
      const { input } = captureInput();

      const pdfPending = files.pickPdfFile();
      expect(input().accept).toBe('application/pdf');
      expect(input().multiple).toBe(false);
      input().oncancel!(new Event('cancel'));
      await pdfPending;

      const imagePending = files.pickMultipleImages();
      expect(input().accept).toBe('image/jpeg, image/png, image/webp');
      expect(input().multiple).toBe(true);
      input().oncancel!(new Event('cancel'));
      await imagePending;
    });
  });
});
