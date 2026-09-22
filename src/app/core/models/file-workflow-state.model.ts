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
  analyzing: 'Checking document...',
  processing: 'Processing pages and content...',
  optimizing: 'Optimizing output...',
  finalizing: 'Finishing up file...',
  complete: 'Processing complete!'
};

export function getProcessingStageLabel(stage: ProcessingStage, translator?: { translate: (k: string) => string }): string {
  if (translator) {
    const key = `stages.${stage}`;
    const translated = translator.translate(key);
    if (translated && translated !== key) return translated;
  }
  return PROCESSING_STAGE_LABELS[stage] ?? stage;
}

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
