import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FileService } from './file.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';
import { UsageQuotaService } from './usage-quota.service';

/*
 * StorageService.saveFile is the only premium gate in the app.
 *
 * Every tool's output passes through it, which is what makes it a gate at all
 * — there is no second path to disk for a screen to use instead. These tests
 * are about the two ways that arrangement fails in opposite directions: the
 * gate letting a save through when the allowance is spent, and the gate
 * charging someone for a save that never landed.
 *
 * The free-tier E2E journey covers the same gate from the outside. This covers
 * the branches that are awkward to reach through a browser: a native write, a
 * filesystem error, and the de-duplication of one operation that writes many
 * files.
 */

const writeFile = vi.fn();
const stat = vi.fn();
let isNative = false;

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFile(...args),
    stat: (...args: unknown[]) => stat(...args),
  },
  Directory: { Documents: 'DOCUMENTS' },
}));

// Partial: the module graph reached from StorageService also pulls in
// RevenueCat, which needs the real `registerPlugin`.
vi.mock('@capacitor/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  Capacitor: {
    isNativePlatform: () => isNative,
  },
}));

function makeFile(name = 'result.pdf', bytes = 50 * 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

describe('StorageService', () => {
  let storage: StorageService;
  let quota: { canStart: ReturnType<typeof vi.fn>; consume: ReturnType<typeof vi.fn>; limit: number };
  let toast: { error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    isNative = false;
    writeFile.mockReset().mockResolvedValue({ uri: 'file:///Documents/result.pdf' });
    // stat() rejects for a path that does not exist, which is the usual case.
    stat.mockReset().mockRejectedValue(new Error('File does not exist'));

    quota = { canStart: vi.fn().mockResolvedValue(true), consume: vi.fn().mockResolvedValue(undefined), limit: 5 };
    toast = { error: vi.fn(), warning: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    // jsdom implements neither object URLs nor anchor-triggered downloads.
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        StorageService,
        { provide: UsageQuotaService, useValue: quota },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
        { provide: FileService, useValue: { blobToBase64: vi.fn().mockResolvedValue('QUJD') } },
      ],
    });
    storage = TestBed.inject(StorageService);
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  describe('the gate', () => {
    it('refuses the write once the daily allowance is spent', async () => {
      quota.canStart.mockResolvedValue(false);

      const uri = await storage.saveFile(makeFile(), 'pdf');

      expect(uri).toBeUndefined();
      expect(writeFile).not.toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('says why, and offers the way out, rather than failing silently', async () => {
      quota.canStart.mockResolvedValue(false);

      await storage.saveFile(makeFile(), 'pdf');

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(String(toast.warning.mock.calls[0][0])).toContain('5');
      expect(router.navigate).toHaveBeenCalledWith(['/features/premium']);
    });

    it('is checked before the file is touched, so a bad file cannot bypass it', async () => {
      quota.canStart.mockResolvedValue(false);

      const uri = await storage.saveFile(undefined as unknown as File, 'pdf');

      expect(uri).toBeUndefined();
      expect(toast.error).not.toHaveBeenCalled();
      expect(quota.consume).not.toHaveBeenCalled();
    });
  });

  describe('metering', () => {
    it('counts a save that landed', async () => {
      await storage.saveFile(makeFile(), 'pdf');

      expect(quota.consume).toHaveBeenCalledTimes(1);
    });

    it('does not count a save that failed', async () => {
      isNative = true;
      writeFile.mockRejectedValue(new Error('Missing parent directory'));

      const uri = await storage.saveFile(makeFile(), 'pdf');

      expect(uri).toBeUndefined();
      expect(quota.consume).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(String(toast.error.mock.calls[0][0])).toContain('Missing parent directory');
    });

    it('does not count a missing file as an operation', async () => {
      const uri = await storage.saveFile(undefined as unknown as File, 'pdf');

      expect(uri).toBeUndefined();
      expect(quota.consume).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('charges one operation for a run that writes many files', async () => {
      const runId = 'split-run-1';
      for (let page = 1; page <= 10; page++) {
        await storage.saveFile(makeFile(`page_${page}.pdf`), 'pdf', runId);
      }

      // Ten writes, ten identical ids — de-duplication itself lives in
      // UsageQuotaService, so what is asserted here is that the id survives.
      expect(quota.consume).toHaveBeenCalledTimes(10);
      expect(new Set(quota.consume.mock.calls.map((c: unknown[]) => c[0]))).toEqual(new Set([runId]));
    });

    it('derives an id from the file when none is given, so saving then sharing counts once', async () => {
      const file = makeFile('merged.pdf', 1234);

      await storage.saveFile(file, 'pdf');
      await storage.saveFile(file, 'pdf');

      const ids = quota.consume.mock.calls.map((c: unknown[]) => c[0]);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toContain('merged.pdf');
      expect(ids[0]).toContain('1234');
    });
  });

  describe('writing', () => {
    it('creates the Documents folder if this device has never had one', async () => {
      isNative = true;

      const uri = await storage.saveFile(makeFile(), 'pdf');

      expect(uri).toBe('file:///Documents/result.pdf');
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile.mock.calls[0][0]).toMatchObject({
        directory: 'DOCUMENTS',
        data: 'QUJD',
        recursive: true,
      });
    });

    it('falls back to a browser download off-device', async () => {
      const uri = await storage.saveFile(makeFile(), 'pdf');

      expect(uri).toBe('web-download');
      expect(writeFile).not.toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('names the file so two results of the same tool cannot overwrite each other', async () => {
      isNative = true;

      await storage.saveFile(makeFile('anything.pdf', 50 * 1024), 'compressed');

      const { path } = writeFile.mock.calls[0][0] as { path: string };
      expect(path).toMatch(/^compressed_50kb_\d{10}\.pdf$/);
    });

    it('keeps the original extension', async () => {
      isNative = true;

      await storage.saveFile(new File([new Uint8Array(1024)], 'photo.webp', { type: 'image/webp' }), 'photo');

      const { path } = writeFile.mock.calls[0][0] as { path: string };
      expect(path.endsWith('.webp')).toBe(true);
    });

    /*
     * The extension used to be `name.split('.').pop()`, which returns the whole
     * name when there is no dot in it -- so `scan` was written as
     * `photo_1kb_1234567890.scan` and the `|| 'jpg'` fallback only ever fired
     * for a name ending in a dot.
     */
    it.each(['noextension', 'trailing.', '.hidden'])('falls back to jpg for %p', async name => {
      isNative = true;

      await storage.saveFile(new File([new Uint8Array(1024)], name, { type: 'image/jpeg' }), 'photo');

      const { path } = writeFile.mock.calls[0][0] as { path: string };
      expect(path.endsWith('.jpg')).toBe(true);
    });

    it('still takes a real extension from a dotted name', async () => {
      isNative = true;

      await storage.saveFile(new File([new Uint8Array(1024)], 'my.scan.v2.png', { type: 'image/png' }), 'photo');

      const { path } = writeFile.mock.calls[0][0] as { path: string };
      expect(path.endsWith('.png')).toBe(true);
    });
  });

  describe('keeping the name the caller chose', () => {
    it('renames the output by default', async () => {
      isNative = true;

      await storage.saveFile(makeFile('Annual Report.pdf', 120 * 1024), 'batch_compress');

      expect(writeFile.mock.calls[0][0].path).toMatch(/^batch_compress_\d+kb_\d+\.pdf$/);
    });

    it('keeps it when asked, because for some operations the name is the output', async () => {
      // Renaming a file from its own content and then writing it under a
      // generated name is the whole operation undone.
      isNative = true;

      await storage.saveFile(
        makeFile('Income Tax Return 2024.pdf'),
        'batch_rename-from-content',
        'op-1',
        { preserveName: true }
      );

      expect(writeFile.mock.calls[0][0].path).toBe('Income Tax Return 2024.pdf');
    });

    it('does not overwrite a file that is already there', async () => {
      isNative = true;
      // The first two names are taken.
      stat
        .mockResolvedValueOnce({ type: 'file' })
        .mockResolvedValueOnce({ type: 'file' })
        .mockRejectedValue(new Error('File does not exist'));

      await storage.saveFile(makeFile('Statement.pdf'), 'batch', 'op-2', { preserveName: true });

      expect(writeFile.mock.calls[0][0].path).toBe('Statement (3).pdf');
    });

    it('strips path separators and control characters out of a name', async () => {
      isNative = true;

      await storage.saveFile(
        makeFile('../../etc/pass:wd?.pdf'),
        'batch',
        'op-3',
        { preserveName: true }
      );

      const path = writeFile.mock.calls[0][0].path;
      expect(path).not.toContain('/');
      expect(path).not.toContain(':');
      expect(path).toMatch(/\.pdf$/);
    });

    it('offers the chosen name to the browser too', async () => {
      await storage.saveFile(makeFile('Quarterly Filing.pdf'), 'batch', 'op-4', { preserveName: true });

      // jsdom cannot read the anchor after the click, so assert on the element
      // the service built.
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe('the result log', () => {
    it('writes through the filesystem rather than an anchor on a device', async () => {
      isNative = true;
      const csv = new File([new Blob(['a,b\n1,2'])], 'batch_results.csv', { type: 'text/csv' });

      const uri = await storage.saveReportFile(csv);

      expect(uri).toBe('file:///Documents/result.pdf');
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile.mock.calls[0][0].path).toBe('batch_results.csv');
    });

    it('does not spend an operation, because a log is not an output', async () => {
      const csv = new File([new Blob(['a,b'])], 'log.csv', { type: 'text/csv' });

      await storage.saveReportFile(csv);

      expect(quota.consume).not.toHaveBeenCalled();
      expect(quota.canStart).not.toHaveBeenCalled();
    });

    it('still writes the log when the daily allowance is spent', async () => {
      // This is when the log matters most: it is the record of what the run
      // did and did not get to.
      quota.canStart.mockResolvedValue(false);
      isNative = true;
      const csv = new File([new Blob(['a,b'])], 'log.csv', { type: 'text/csv' });

      const uri = await storage.saveReportFile(csv);

      expect(uri).toBeTruthy();
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it('refuses anything that is not a text log', async () => {
      const uri = await storage.saveReportFile(makeFile('sneaky.pdf'));

      expect(uri).toBeUndefined();
      expect(writeFile).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
