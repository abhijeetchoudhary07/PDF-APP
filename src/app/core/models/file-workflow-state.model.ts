export type SingleFileWorkflowState =
  | 'EMPTY'
  | 'FILE_SELECTED'
  | 'CONFIGURING'
  | 'PREVIEWING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'ERROR';

export type MultiFileWorkflowState =
  | 'EMPTY'
  | 'FILES_SELECTED'
  | 'CONFIGURING'
  | 'PROCESSING'
  | 'PARTIAL_SUCCESS'
  | 'SUCCESS'
  | 'ERROR';

export type ProcessingStage =
  | 'idle'
  | 'preparing'
  | 'analyzing'
  | 'processing'
  | 'optimizing'
  | 'finalizing'
  | 'complete';

export interface StageInfo {
  stage: ProcessingStage;
  label: string;
  progress?: number; // 0-100 or undefined if indeterminate
}

export const PROCESSING_STAGE_LABELS: Record<ProcessingStage, string> = {
  idle: 'Ready',
  preparing: 'Preparing file...',
  analyzing: 'Analyzing document...',
  processing: 'Processing pages & elements...',
  optimizing: 'Optimizing output...',
  finalizing: 'Finalizing file...',
  complete: 'Processing complete!'
};

export interface FileItemMeta {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  type: string;
  thumbnailUrl?: string;
  dimensions?: { width: number; height: number };
  pageCount?: number;
  isValid?: boolean;
  validationError?: string;
}

export interface ProcessingCancellationToken {
  isCancelled: boolean;
  cancel: () => void;
}

export function createCancellationToken(): ProcessingCancellationToken {
  const token: ProcessingCancellationToken = {
    isCancelled: false,
    cancel() {
      token.isCancelled = true;
    }
  };
  return token;
}
