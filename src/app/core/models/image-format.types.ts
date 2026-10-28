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
  /** Resolution from the file's XResolution tag, in DPI, when it declares one. */
  dpi?: number;
  /** TIFF Compression tag value the page was stored with. */
  compression?: number;
  /** True when the page's compression could not be decoded and is blank. */
  unsupported?: boolean;
}

export interface MultiPageTiffExportOptions {
  /**
   * Written as the Compression tag AND applied to the bytes. Deflate is
   * decodable but not offered for writing, since LZW and G4 are what the
   * portals asking for TIFF accept.
   */
  compression?: 'none' | 'lzw' | 'g4';
  dpi?: number;
}
