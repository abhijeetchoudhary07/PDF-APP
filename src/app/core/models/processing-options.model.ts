import { CompressionConfig } from './compression-config.model';

export interface ProcessingOptions {
  compression?: CompressionConfig;
  grayscale?: boolean;
  contrast?: number;
  threshold?: number;
}
