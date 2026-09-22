import { ConverterMetadata, ConversionProgress, ConversionResult } from './conversion.types';

export interface IConverter {
  readonly id: string;
  readonly metadata: ConverterMetadata;

  /**
   * Validates the input file before conversion.
   * Checks MIME type, magic bytes, file size, or integrity.
   */
  validate(file: File): Promise<{ valid: boolean; error?: string }>;

  /**
   * Executes the client-side conversion.
   * @param file Input file (or dummy file if text input is used)
   * @param options Format-specific options (e.g. dpi, orientation, pageSize, margins)
   * @param onProgress Callback to report conversion progress
   */
  convert(
    file: File,
    options?: any,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult>;
}
