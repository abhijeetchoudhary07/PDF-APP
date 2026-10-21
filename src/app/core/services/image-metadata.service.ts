import { Injectable } from '@angular/core';
import exifr from 'exifr';
import {
  DateShiftOffset,
  ExifMetadata,
  ImageCameraDetails,
  ImageCaptureDates,
  ImageGpsCoordinates,
  MetadataDateRepairResult
} from '../models/image-metadata.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class ImageMetadataService {

  /**
   * Extract comprehensive EXIF, GPS, camera, and date metadata from an image file.
   */
  async extractMetadata(file: File | Blob, customFileName?: string): Promise<ExifMetadata> {
    const fileName = customFileName || (file instanceof File ? file.name : 'image.jpg');
    const fileSizeBytes = file.size;
    const mimeType = file.type || 'image/jpeg';

    let rawTags: Record<string, any> = {};
    let hasExif = false;

    try {
      // exifr extracts TIFF, EXIF, GPS, and XMP segments
      const parsed = await exifr.parse(file, {
        tiff: true,
        xmp: true,
        icc: true,
        gps: true
      });
      if (parsed && typeof parsed === 'object') {
        rawTags = parsed;
        hasExif = Object.keys(parsed).length > 0;
      }
    } catch {
      // Graceful fallback for non-EXIF or corrupt headers
      rawTags = {};
      hasExif = false;
    }

    // Camera details
    const camera: ImageCameraDetails = {
      make: rawTags['Make'],
      model: rawTags['Model'],
      lensModel: rawTags['LensModel'] || rawTags['LensInfo'],
      focalLengthMm: rawTags['FocalLength'] ? Number(rawTags['FocalLength']) : undefined,
      fNumber: rawTags['FNumber'] ? Number(rawTags['FNumber']) : undefined,
      iso: rawTags['ISO'] || rawTags['ISOSpeedRatings'] ? Number(rawTags['ISO'] || rawTags['ISOSpeedRatings']) : undefined,
      exposureTimeSec: rawTags['ExposureTime'] ? String(rawTags['ExposureTime']) : undefined,
      flash: rawTags['Flash'] ? String(rawTags['Flash']) : undefined,
      orientation: rawTags['Orientation'] ? Number(rawTags['Orientation']) : 1
    };

    // GPS coordinates
    let gps: ImageGpsCoordinates | undefined;
    if (rawTags['latitude'] !== undefined && rawTags['longitude'] !== undefined) {
      const lat = Number(rawTags['latitude']);
      const lon = Number(rawTags['longitude']);
      const alt = rawTags['altitude'] !== undefined ? Number(rawTags['altitude']) : undefined;
      gps = {
        latitude: lat,
        longitude: lon,
        altitude: alt,
        mapsUrl: `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`
      };
    }

    // Dates
    const dates: ImageCaptureDates = {};
    const parseDateTag = (val: any): Date | undefined => {
      if (!val) return undefined;
      if (val instanceof Date && !isNaN(val.getTime())) return val;
      if (typeof val === 'string') {
        // Handle EXIF format "YYYY:MM:DD HH:MM:SS"
        const exifFormat = val.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
        if (exifFormat) {
          return new Date(
            Number(exifFormat[1]),
            Number(exifFormat[2]) - 1,
            Number(exifFormat[3]),
            Number(exifFormat[4]),
            Number(exifFormat[5]),
            Number(exifFormat[6])
          );
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
      }
      return undefined;
    };

    dates.dateTimeOriginal = parseDateTag(rawTags['DateTimeOriginal']);
    dates.createDate = parseDateTag(rawTags['CreateDate']);
    dates.modifyDate = parseDateTag(rawTags['ModifyDate']);
    dates.rawString = rawTags['DateTimeOriginal'] ? String(rawTags['DateTimeOriginal']) : undefined;

    return {
      fileName,
      fileSizeBytes,
      mimeType,
      width: rawTags['ImageWidth'] || rawTags['ExifImageWidth'],
      height: rawTags['ImageHeight'] || rawTags['ExifImageHeight'],
      colorSpace: rawTags['ColorSpace'] ? String(rawTags['ColorSpace']) : undefined,
      hasExif,
      camera,
      gps,
      dates,
      rawTags
    };
  }

  /**
   * Shift a date by days, hours, minutes, and seconds, or override explicitly.
   */
  applyDateShift(originalDate: Date, offset: DateShiftOffset): Date {
    if (offset.explicitDate) {
      return new Date(offset.explicitDate.getTime());
    }

    const totalSeconds =
      offset.days * 86400 +
      offset.hours * 3600 +
      offset.minutes * 60 +
      offset.seconds;

    return new Date(originalDate.getTime() + totalSeconds * 1000);
  }

  /**
   * Batch shift capture dates across multiple files.
   */
  async batchShiftDates(
    files: File[],
    offset: DateShiftOffset
  ): Promise<MetadataDateRepairResult[]> {
    const results: MetadataDateRepairResult[] = [];

    for (const file of files) {
      try {
        const meta = await this.extractMetadata(file);
        const originalDate = meta.dates.dateTimeOriginal || meta.dates.createDate || new Date(file.lastModified);
        const repairedDate = this.applyDateShift(originalDate, offset);

        results.push({
          fileName: file.name,
          originalDate,
          repairedDate,
          success: true
        });
      } catch (err: any) {
        results.push({
          fileName: file.name,
          success: false,
          error: err?.message || 'Date shift failed'
        });
      }
    }

    return results;
  }

  /**
   * Strip all EXIF, XMP, and metadata from an image, producing a privacy-clean Blob.
   * Stripping is 100% on-device and leaves image pixel dimensions intact.
   */
  async stripMetadata(file: File | Blob, outputFormat: string = 'image/jpeg', quality = 0.92): Promise<Blob> {
    const isBrowser = typeof window !== 'undefined' && typeof Image !== 'undefined';
    const isJsdom = typeof window !== 'undefined' && (window.navigator?.userAgent?.includes('jsdom') || !(window as any).chrome);

    if (!isBrowser || isJsdom) {
      // Pure binary JPEG stripper: strips APP1 (0xFFE1) and APP2 (0xFFE2) markers
      const buffer = await file.arrayBuffer();
      const strippedBuffer = this.stripJpegExifBuffer(buffer);
      return new Blob([strippedBuffer], { type: outputFormat });
    }

    // Canvas redrawing automatically strips all EXIF/GPS segments
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = createSafeCanvas(img.width, img.height);
        const ctx = getSafeContext(canvas);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create stripped image blob'));
          }
        }, outputFormat, quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback to binary strip
        file.arrayBuffer().then(buf => {
          const stripped = this.stripJpegExifBuffer(buf);
          resolve(new Blob([stripped], { type: outputFormat }));
        }).catch(reject);
      };

      img.src = url;
    });
  }

  /**
   * Binary JPEG EXIF / XMP / IPTC stripper. Removes APP1-APP15 segments.
   */
  stripJpegExifBuffer(buffer: ArrayBuffer): ArrayBuffer {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      // Not a JPEG or too short, return unchanged
      return buffer;
    }

    const output: number[] = [0xFF, 0xD8]; // SOI
    let offset = 2;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xFF) {
        // Append remaining
        for (let i = offset; i < bytes.length; i++) output.push(bytes[i]);
        break;
      }

      const marker = bytes[offset + 1];

      // SOS (Start of Scan) or EOI (End of Image)
      if (marker === 0xDA || marker === 0xD9) {
        for (let i = offset; i < bytes.length; i++) output.push(bytes[i]);
        break;
      }

      // Marker length
      if (offset + 3 >= bytes.length) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

      // APP1..APP15 (0xE1..0xEF) or COM (0xFE) contain EXIF, XMP, ICC, Comments
      const isMetadataSegment = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;

      if (!isMetadataSegment) {
        // Keep JFIF (APP0 / 0xE0), DQT, SOF, DHT, etc.
        for (let i = 0; i < length + 2; i++) {
          output.push(bytes[offset + i]);
        }
      }

      offset += length + 2;
    }

    return new Uint8Array(output).buffer;
  }
}
