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
  private fileService = inject(FileService);

  private readonly quota = inject(UsageQuotaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * Pre-flight query for batch tools (e.g. mail-merge) to check remaining free quota.
   */
  async getQuotaStatus(): Promise<{ remaining: number | null; isUnlimited: boolean; limit: number; canStart: boolean }> {
    const remaining = await this.quota.remaining();
    const canStart = await this.quota.canStart();
    return {
      remaining,
      isUnlimited: this.quota.isUnlimited,
      limit: this.quota.limit,
      canStart
    };
  }

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
   *
   * `options.preserveName` keeps the name the caller gave the file instead of
   * the generated `prefix_sizekb_timestamp` one. Some outputs ARE their name —
   * a batch rename derives it from the document's own title, and renaming it
   * back on the way out makes the whole operation do nothing — and a batch of
   * similar files is otherwise distinguished only by a whole-second timestamp,
   * so two outputs of the same rounded size can land on the same path and one
   * silently replaces the other.
   */
  async saveFile(
    file: File,
    prefix: string = 'file',
    operationId?: string,
    options?: { preserveName?: boolean },
  ): Promise<string | undefined> {
    if (!(await this.quota.canStart())) {
      await this.reportQuotaExhausted();
      return undefined;
    }

    try {
      if (!file) throw new Error('File is missing');

      /*
       * `split('.').pop()` returns the whole name when there is no dot in it,
       * so a file called `scan` used to be written as `photo_50kb_1738.scan`
       * and the `|| 'jpg'` fallback only ever fired for a name ending in a dot.
       * Take the extension only when there really is one.
       */
      const dot = file.name.lastIndexOf('.');
      const ext = (dot > 0 ? file.name.slice(dot + 1) : '') || 'jpg';
      const sizeKB = Math.round(file.size / 1024);
      // Example: photo_50kb_1638210.jpg to prevent overwrites
      const generatedName = `${prefix}_${sizeKB}kb_${Math.floor(Date.now() / 1000)}.${ext}`;
      const safeName = options?.preserveName
        ? this.sanitizeOutputName(file.name, ext)
        : generatedName;

      let uri: string;
      if (Capacitor.isNativePlatform()) {
        const base64Data = await this.fileService.blobToBase64(file);
        const targetPath = options?.preserveName
          ? await this.findFreeName(safeName)
          : safeName;
        const result = await Filesystem.writeFile({
          path: targetPath,
          data: base64Data,
          directory: Directory.Documents,
          /*
           * Create Documents/ if this phone has never had one.
           *
           * The folder is not guaranteed to exist: a freshly set up device
           * that has never saved a document simply has no
           * /storage/emulated/0/Documents, and without `recursive` the plugin
           * refuses the write rather than creating it --
           * "Missing parent directory" (OS-PLUG-FILE-0011), which the person
           * sees as "Could not save the file" on the very first thing they
           * try to keep.
           */
          recursive: true
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
   * Writes a diagnostic log next to the person's documents, unmetered.
   *
   * The free-tier counter meters the files a tool produces. A batch's result
   * log is not one of those: it is the record of what the run did, and it is
   * needed most in the case where the quota has just run out, so charging for
   * it would withhold the explanation at exactly the wrong moment. Text only,
   * and not a path for tool output — that still goes through saveFile.
   */
  async saveReportFile(file: File): Promise<string | undefined> {
    try {
      if (!file) throw new Error('File is missing');
      if (!/^text\//.test(file.type) && !/\.(csv|txt|log|json)$/i.test(file.name)) {
        throw new Error('saveReportFile only writes text logs');
      }

      const dot = file.name.lastIndexOf('.');
      const ext = (dot > 0 ? file.name.slice(dot + 1) : '') || 'txt';
      const safeName = this.sanitizeOutputName(file.name, ext);

      if (Capacitor.isNativePlatform()) {
        const base64Data = await this.fileService.blobToBase64(file);
        const result = await Filesystem.writeFile({
          path: await this.findFreeName(safeName),
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        return result.uri;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.click();
      URL.revokeObjectURL(url);
      return 'web-download';
    } catch (e: any) {
      this.toast.error(
        e?.message ? `Could not save the log: ${e.message}` : 'Could not save the log.'
      );
      return undefined;
    }
  }

  /**
   * A caller-supplied name reduced to something a filesystem will take.
   *
   * Path separators and the characters Android's media store rejects are
   * removed rather than escaped, and the name is capped so a title lifted from
   * a document cannot produce a path the OS refuses.
   */
  private sanitizeOutputName(name: string, fallbackExt: string): string {
    const base = name.replace(/^.*[\\/]/, '');
    const dot = base.lastIndexOf('.');
    const stem = (dot > 0 ? base.slice(0, dot) : base)
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const ext = (dot > 0 ? base.slice(dot + 1) : '').replace(/[^A-Za-z0-9]/g, '') || fallbackExt;
    return `${stem || 'document'}.${ext}`;
  }

  /**
   * The first name in Documents that is not taken, as `name (2).pdf` and so on.
   *
   * Filesystem.writeFile overwrites without asking, so keeping a caller's name
   * without this check would let the second file of a batch destroy the first.
   */
  private async findFreeName(name: string): Promise<string> {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';

    for (let attempt = 1; attempt <= 50; attempt++) {
      const candidate = attempt === 1 ? name : `${stem} (${attempt})${ext}`;
      try {
        await Filesystem.stat({ path: candidate, directory: Directory.Documents });
        // It exists, so try the next one.
      } catch {
        // stat throws when there is nothing there, which is what we want.
        return candidate;
      }
    }

    // Fifty files of the same name is not a case worth failing over.
    return `${stem} (${Date.now()})${ext}`;
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
