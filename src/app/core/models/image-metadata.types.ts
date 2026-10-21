export interface ImageGpsCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  mapsUrl?: string;
}

export interface ImageCameraDetails {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLengthMm?: number;
  fNumber?: number;
  iso?: number;
  exposureTimeSec?: string;
  flash?: string;
  orientation?: number;
}

export interface ImageCaptureDates {
  dateTimeOriginal?: Date;
  createDate?: Date;
  modifyDate?: Date;
  rawString?: string;
}

export interface ExifMetadata {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
  colorSpace?: string;
  hasExif: boolean;
  camera: ImageCameraDetails;
  gps?: ImageGpsCoordinates;
  dates: ImageCaptureDates;
  rawTags: Record<string, any>;
}

export interface DateShiftOffset {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  explicitDate?: Date;
}

export interface MetadataDateRepairResult {
  fileName: string;
  originalDate?: Date;
  repairedDate?: Date;
  success: boolean;
  error?: string;
}
