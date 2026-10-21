import { describe, it, expect, beforeEach } from 'vitest';
import { ImageMetadataService } from './image-metadata.service';
import { DateShiftOffset } from '../models/image-metadata.types';

describe('ImageMetadataService (I7 Metadata Viewer & Date Repair)', () => {
  let service: ImageMetadataService;

  beforeEach(() => {
    service = new ImageMetadataService();
  });

  it('correctly shifts date by days, hours, minutes, and seconds', () => {
    const baseDate = new Date('2024-03-15T10:00:00.000Z');
    const offset: DateShiftOffset = {
      days: 2,
      hours: 3,
      minutes: 15,
      seconds: 30
    };

    const shifted = service.applyDateShift(baseDate, offset);
    // +2 days = March 17
    // +3 hours = 13:00
    // +15 minutes = 13:15
    // +30 seconds = 13:15:30
    expect(shifted.toISOString()).toBe('2024-03-17T13:15:30.000Z');

    // Negative shift (compensating for clock drift fast by 1 hour)
    const reverseOffset: DateShiftOffset = {
      days: 0,
      hours: -1,
      minutes: -15,
      seconds: 0
    };
    const reverseShifted = service.applyDateShift(shifted, reverseOffset);
    expect(reverseShifted.toISOString()).toBe('2024-03-17T12:00:30.000Z');
  });

  it('handles explicit date override in DateShiftOffset', () => {
    const baseDate = new Date('2023-01-01T00:00:00.000Z');
    const explicit = new Date('2024-05-20T18:45:00.000Z');
    const shifted = service.applyDateShift(baseDate, {
      days: 10,
      hours: 0,
      minutes: 0,
      seconds: 0,
      explicitDate: explicit
    });
    expect(shifted.toISOString()).toBe(explicit.toISOString());
  });

  it('performs batch date shift across multiple files', async () => {
    const file1 = new File(['mock_data_1'], 'photo1.jpg', { type: 'image/jpeg', lastModified: new Date('2024-01-01T10:00:00Z').getTime() });
    const file2 = new File(['mock_data_2'], 'photo2.jpg', { type: 'image/jpeg', lastModified: new Date('2024-01-01T11:00:00Z').getTime() });

    const offset: DateShiftOffset = {
      days: 0,
      hours: 2,
      minutes: 0,
      seconds: 0
    };

    const results = await service.batchShiftDates([file1, file2], offset);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[0].fileName).toBe('photo1.jpg');
    expect(results[0].repairedDate?.toISOString()).toBe('2024-01-01T12:00:00.000Z');

    expect(results[1].success).toBe(true);
    expect(results[1].fileName).toBe('photo2.jpg');
    expect(results[1].repairedDate?.toISOString()).toBe('2024-01-01T13:00:00.000Z');
  });

  it('strips JPEG EXIF (APP1) markers in stripJpegExifBuffer', () => {
    // Construct a synthetic JPEG with SOI, APP0 (JFIF), APP1 (EXIF), and SOS
    // 0xFF 0xD8 (SOI)
    // 0xFF 0xE0, length 0x00 0x04, data 0x11, 0x22 (APP0)
    // 0xFF 0xE1, length 0x00 0x06, data 0x45, 0x78, 0x69, 0x66 (APP1 EXIF)
    // 0xFF 0xDA, length 0x00 0x02 (SOS)
    // 0xFF 0xD9 (EOI)
    const rawJpeg = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE0, 0x00, 0x04, 0x11, 0x22,
      0xFF, 0xE1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
      0xFF, 0xDA, 0x00, 0x02,
      0xFF, 0xD9
    ]);

    const stripped = service.stripJpegExifBuffer(rawJpeg.buffer);
    const strippedBytes = new Uint8Array(stripped);

    // Assert APP1 marker (0xFF 0xE1) is removed
    let foundApp1 = false;
    for (let i = 0; i < strippedBytes.length - 1; i++) {
      if (strippedBytes[i] === 0xFF && strippedBytes[i + 1] === 0xE1) {
        foundApp1 = true;
      }
    }
    expect(foundApp1).toBe(false);

    // Assert APP0 marker (0xFF 0xE0) is preserved
    let foundApp0 = false;
    for (let i = 0; i < strippedBytes.length - 1; i++) {
      if (strippedBytes[i] === 0xFF && strippedBytes[i + 1] === 0xE0) {
        foundApp0 = true;
      }
    }
    expect(foundApp0).toBe(true);
  });

  it('extracts metadata structure gracefully for empty or standard files', async () => {
    const file = new File(['synthetic_bytes'], 'test.jpg', { type: 'image/jpeg' });
    const meta = await service.extractMetadata(file);

    expect(meta).toBeDefined();
    expect(meta.fileName).toBe('test.jpg');
    expect(meta.fileSizeBytes).toBe(15);
    expect(meta.mimeType).toBe('image/jpeg');
    expect(meta.camera).toBeDefined();
    expect(meta.dates).toBeDefined();
  });
});
