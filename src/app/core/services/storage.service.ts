import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FileService } from './file.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(private fileService: FileService) {}

  async saveFile(file: File, prefix: string = 'file'): Promise<string | undefined> {
    try {
      if (!file) throw new Error('File is missing');

      const ext = file.name.split('.').pop() || 'jpg';
      const sizeKB = Math.round(file.size / 1024);
      // Example: photo_50kb_1638210.jpg to prevent overwrites
      const safeName = `${prefix}_${sizeKB}kb_${Math.floor(Date.now() / 1000)}.${ext}`;

      if (Capacitor.isNativePlatform()) {
        const base64Data = await this.fileService.blobToBase64(file);
        const result = await Filesystem.writeFile({
          path: safeName,
          data: base64Data,
          directory: Directory.Documents
        });
        return result.uri;
      } else {
        // Web fallback
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        a.click();
        URL.revokeObjectURL(url);
        return 'web-download';
      }
    } catch (e: any) {
      alert(`Storage Error: ${e.message}`);
      console.error('Error saving file', e);
      return undefined;
    }
  }
}
