import { ImageDimensions } from './image-dimensions.model';

export interface CompressionConfig {
  targetKB?: number;
  maxDimension?: number;
  exactDimensions?: ImageDimensions;
  maintainAspectRatio?: boolean;
  outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp' | string;
  minQuality?: number;
  maxScaleDown?: number;
}
