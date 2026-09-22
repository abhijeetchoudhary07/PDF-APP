export type PdfFormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'date'
  | 'signature';

export interface PdfFieldCoordinates {
  pageNumber: number; // 1-indexed
  x: number; // PDF points
  y: number; // PDF points
  width: number;
  height: number;
}

export interface PdfFormField {
  id: string;
  name: string;
  label?: string;
  type: PdfFormFieldType;
  value: any; // string for text/dropdown/date, boolean for checkbox, string for radio, dataUrl for signature
  options?: string[]; // for radio/dropdown
  isReadOnly?: boolean;
  isRequired?: boolean;
  isMultiline?: boolean;
  isNative: boolean; // true = native AcroForm field, false = manual placed overlay field
  coordinates?: PdfFieldCoordinates;
}

export interface PdfFormDocument {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  file?: File;
  arrayBuffer: ArrayBuffer;
  hasNativeForms: boolean;
  fields: PdfFormField[];
}

export interface FormExportOptions {
  flatten: boolean;
  outputFileName?: string;
}
