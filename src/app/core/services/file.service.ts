import { Injectable, NgZone, inject } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private ngZone = inject(NgZone);

  private trackedObjectUrls = new Set<string>();

  async pickImageFile(): Promise<File | undefined> {
    // If native platform (iOS/Android Capacitor container), use Camera/Photo picker
    if (Capacitor.isNativePlatform()) {
      try {
        const image = await Camera.getPhoto({
          quality: 100,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos
        });
        if (image.webPath) {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          return this.ngZone.run(() =>
            new File([blob], `photo_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
          );
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    // On web / desktop browsers, use native file input for instant, reliable picker
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg, image/png, image/webp';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        this.ngZone.run(() => resolve(file || undefined));
      };
      input.oncancel = () => this.ngZone.run(() => resolve(undefined));
      input.click();
    });
  }

  async pickMultipleImages(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg, image/png, image/webp';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = Array.from(e.target?.files || []) as File[];
        this.ngZone.run(() => resolve(files));
      };
      input.oncancel = () => this.ngZone.run(() => resolve([]));
      input.click();
    });
  }

  async pickPdfFile(): Promise<File | undefined> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        this.ngZone.run(() => resolve(file || undefined));
      };
      input.oncancel = () => this.ngZone.run(() => resolve(undefined));
      input.click();
    });
  }

  async pickMultiplePdfs(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = Array.from(e.target?.files || []) as File[];
        this.ngZone.run(() => resolve(files));
      };
      input.oncancel = () => this.ngZone.run(() => resolve([]));
      input.click();
    });
  }

  createObjectUrl(blob: Blob | File): string {
    const url = URL.createObjectURL(blob);
    this.trackedObjectUrls.add(url);
    return url;
  }

  revokeObjectUrl(url?: string): void {
    if (url && this.trackedObjectUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.trackedObjectUrls.delete(url);
    }
  }

  clearTrackedUrls(): void {
    for (const url of this.trackedObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.trackedObjectUrls.clear();
  }

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject('Base64 generation failed');
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  downloadFile(file: File): void {
    this.downloadBlob(file, file.name);
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

