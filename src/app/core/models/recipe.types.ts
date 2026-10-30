/**
 * Recipe & Pipeline Engine Types
 */

export const RECIPES_STORAGE_KEY = 'IFH_RECIPES_V1';

/** Maximum steps allowed in a single pipeline recipe to prevent resource exhaustion & infinite loops */
export const MAX_RECIPE_STEPS = 10;

/** Maximum allowable JSON payload bytes for imported recipes (100 KB) */
export const MAX_RECIPE_JSON_BYTES = 102400;

/** Maximum nesting depth for recipe JSON parsing */
export const MAX_RECIPE_DEPTH = 5;

/** Maximum files allowed in a single batch queue to prevent browser OOM and Denial of Service */
export const MAX_BATCH_FILES = 50;

export interface RecipeStep {
  stepId: string;
  toolId: string;
  label: string;
  parameters: Record<string, any>;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  steps: RecipeStep[];
  isCustom: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface RecipeParameterField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'boolean';
  required?: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
  options?: { label: string; value: any }[];
  helperText?: string;
}

export interface RecipeToolDefinition {
  toolId: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  defaultParameters: Record<string, any>;
  parameterSchema: RecipeParameterField[];
}

export interface StepValidationResult {
  stepId: string;
  toolId: string;
  valid: boolean;
  errors: string[];
}

export interface RecipeValidationResult {
  valid: boolean;
  errors: string[];
  stepResults: StepValidationResult[];
}

export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RecipeStepProgress {
  stepIndex: number; // 0-based
  totalSteps: number;
  stepId: string;
  toolId: string;
  label: string;
  stepProgress: number; // 0-100
  status: StepRunStatus;
  error?: string;
}

export interface PipelineCancelSignal {
  isCancelled: boolean;
}

export interface PipelineExecutionOptions {
  onProgress?: (progress: RecipeStepProgress) => void;
  cancelSignal?: PipelineCancelSignal;
  retainIntermediateFiles?: boolean;
}

export interface PipelineExecutionResult {
  success: boolean;
  cancelled?: boolean;
  totalSteps: number;
  completedSteps: number;
  failingStepId?: string;
  failingStepIndex?: number;
  error?: string;
  outputFile?: File;
  intermediateFiles?: File[];
  stepExecutionTimesMs?: number[];
}

export type BatchFileStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped_quota';

export interface BatchFileQueueItem {
  fileId: string;
  fileName: string;
  fileSize: number;
  status: BatchFileStatus;
  originalFile: File;
  outputFile?: File;
  currentStepIndex?: number;
  totalSteps?: number;
  currentStepLabel?: string;
  error?: string;
  executionTimeMs?: number;
}

export interface BatchPipelineProgress {
  totalFiles: number;
  currentFileIndex: number; // 0-based
  activeFileName: string;
  activeFileStepIndex: number; // 0-based
  activeFileTotalSteps: number;
  activeFileStepLabel: string;
  overallProgressPercent: number;
  fileProgressPercent: number;
  completedCount: number;
  failedCount: number;
  skippedQuotaCount: number;
  isCancelled?: boolean;
}

export interface BatchPipelineResult {
  success: boolean;
  cancelled?: boolean;
  totalFiles: number;
  completedCount: number;
  failedCount: number;
  skippedQuotaCount: number;
  items: BatchFileQueueItem[];
  executionLog: string[];
  totalExecutionTimeMs: number;
}

export interface StarterRecipe extends Recipe {
  starterId: string;
  badge: string;
  icon: string;
  summary: string;
}

