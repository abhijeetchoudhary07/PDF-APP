import { FileMetadata } from './file-metadata.model';
import { ImageDimensions } from './image-dimensions.model';

export interface ProcessingResult {
  success: boolean;
  file?: File;
  metadata?: FileMetadata;
  dimensions?: ImageDimensions;
  error?: string;
  iterations?: number;
}
