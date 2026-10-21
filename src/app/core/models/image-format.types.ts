export type ImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/bmp'
  | 'image/svg+xml'
  | 'image/heic'
  | 'image/heif'
  | 'image/tiff';

export interface FormatProbeResult {
  mimeType: ImageMimeType | string;
  label: string;
  extension: string;
  canDecode: boolean;
  canEncode: boolean;
  requiresSpecialDecoder: boolean;
  notes?: string;
}

export interface FormatCapabilityMatrix {
  decodableFormats: FormatProbeResult[];
  encodableFormats: FormatProbeResult[];
  runtimeEnvironment: 'browser' | 'capacitor-android' | 'node-headless';
  timestamp: number;
}

export interface TiffFrame {
  width: number;
  height: number;
  data: ImageData;
  pageNumber: number;
}

export interface MultiPageTiffExportOptions {
  compression?: 'none' | 'deflate' | 'lzw' | 'g4';
  dpi?: number;
}
