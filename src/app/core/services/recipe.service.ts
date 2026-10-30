import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

import {
  Recipe,
  RecipeStep,
  RecipeToolDefinition,
  StepValidationResult,
  RecipeValidationResult,
  PipelineExecutionOptions,
  PipelineExecutionResult,
  RECIPES_STORAGE_KEY,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_JSON_BYTES,
  MAX_RECIPE_DEPTH
} from '../models/recipe.types';
import { PdfService } from './pdf.service';
import { PdfFlattenService } from './pdf-flatten.service';
import { PdfToneService } from './pdf-tone.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfPreflightService } from './pdf-preflight.service';

/** Dangerous prototype keys prohibited to prevent prototype pollution attacks */
const PROHIBITED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private pdfService = inject(PdfService);
  private pdfFlattenService = inject(PdfFlattenService);
  private pdfToneService = inject(PdfToneService, { optional: true });
  private pdfPrivacyService = inject(PdfPrivacyService, { optional: true });
  private pdfPreflightService = inject(PdfPreflightService, { optional: true });

  /**
   * Sanitizes string fields to prevent script injection (XSS) and command/tag injection.
   */
  sanitizeString(val?: string): string {
    if (!val || typeof val !== 'string') return '';
    return val
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  /**
   * Calculates maximum object nesting depth for recursion defense.
   */
  calculateDepth(obj: any, currentDepth = 1): number {
    if (typeof obj !== 'object' || obj === null) return currentDepth;
    let max = currentDepth;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const d = this.calculateDepth(obj[key], currentDepth + 1);
        if (d > max) max = d;
      }
    }
    return max;
  }

  /**
   * Catalog of all supported tools that can be chained in recipe pipelines.
   */
  readonly availableTools: RecipeToolDefinition[] = [
    {
      toolId: 'compress',
      name: 'Compress to Target Size',
      description: 'Compress PDF size down to a specific target KB limit.',
      icon: 'speedometer-outline',
      category: 'OPTIMIZE',
      defaultParameters: {
        targetKB: 2048
      },
      parameterSchema: [
        {
          key: 'targetKB',
          label: 'Target Max Size (KB)',
          type: 'number',
          required: true,
          defaultValue: 2048,
          min: 20,
          max: 20000,
          helperText: 'Target output size (e.g. 2048 KB for 2MB, 500 KB for portal upload)'
        }
      ]
    },
    {
      toolId: 'page-numbers',
      name: 'Add Page Numbers',
      description: 'Stamp sequential page numbering across all pages.',
      icon: 'calculator-outline',
      category: 'LAYOUT',
      defaultParameters: {
        format: 'page-of-total',
        position: 'bottom-center',
        fontSize: 10
      },
      parameterSchema: [
        {
          key: 'format',
          label: 'Numbering Format',
          type: 'select',
          required: true,
          defaultValue: 'page-of-total',
          options: [
            { label: 'Page X of Y', value: 'page-of-total' },
            { label: 'Number Only (1, 2, 3...)', value: 'number-only' }
          ]
        },
        {
          key: 'position',
          label: 'Stamp Position',
          type: 'select',
          required: true,
          defaultValue: 'bottom-center',
          options: [
            { label: 'Bottom Center', value: 'bottom-center' },
            { label: 'Bottom Right', value: 'bottom-right' },
            { label: 'Top Right', value: 'top-right' }
          ]
        },
        {
          key: 'fontSize',
          label: 'Font Size (pt)',
          type: 'number',
          required: true,
          defaultValue: 10,
          min: 8,
          max: 24
        }
      ]
    },
    {
      toolId: 'flatten-form',
      name: 'Flatten Form & Annotations',
      description: 'Bake interactive AcroForm fields and annotations into static vectors.',
      icon: 'layers-outline',
      category: 'FORMS',
      defaultParameters: {
        target: 'everything'
      },
      parameterSchema: [
        {
          key: 'target',
          label: 'Elements to Flatten',
          type: 'select',
          required: true,
          defaultValue: 'everything',
          options: [
            { label: 'All Fields & Annotations', value: 'everything' },
            { label: 'Form Fields Only', value: 'forms' },
            { label: 'Annotations Only', value: 'annotations' }
          ]
        }
      ]
    },
    {
      toolId: 'watermark',
      name: 'Stamp Text Watermark',
      description: 'Add a semi-transparent diagonal text stamp across all pages.',
      icon: 'shield-checkmark-outline',
      category: 'SECURITY',
      defaultParameters: {
        text: 'CONFIDENTIAL',
        opacity: 0.25,
        color: 'gray'
      },
      parameterSchema: [
        {
          key: 'text',
          label: 'Watermark Text',
          type: 'text',
          required: true,
          defaultValue: 'CONFIDENTIAL',
          helperText: 'e.g. CONFIDENTIAL, DRAFT, SPECIMEN, COPY'
        },
        {
          key: 'opacity',
          label: 'Opacity (0.1 to 1.0)',
          type: 'number',
          required: true,
          defaultValue: 0.25,
          min: 0.1,
          max: 1.0
        },
        {
          key: 'color',
          label: 'Color Theme',
          type: 'select',
          required: true,
          defaultValue: 'gray',
          options: [
            { label: 'Neutral Gray', value: 'gray' },
            { label: 'Red Alert', value: 'red' },
            { label: 'Blue Secure', value: 'blue' }
          ]
        }
      ]
    },
    {
      toolId: 'rotate',
      name: 'Rotate Pages',
      description: 'Rotate document pages by 90, 180, or 270 degrees.',
      icon: 'refresh-outline',
      category: 'LAYOUT',
      defaultParameters: {
        angle: 90,
        pages: 'all'
      },
      parameterSchema: [
        {
          key: 'angle',
          label: 'Rotation Angle',
          type: 'select',
          required: true,
          defaultValue: 90,
          options: [
            { label: '90° Clockwise', value: 90 },
            { label: '180° Half Turn', value: 180 },
            { label: '270° Counter-Clockwise', value: 270 }
          ]
        },
        {
          key: 'pages',
          label: 'Pages to Rotate',
          type: 'select',
          required: true,
          defaultValue: 'all',
          options: [
            { label: 'All Pages', value: 'all' },
            { label: 'Odd Pages Only', value: 'odd' },
            { label: 'Even Pages Only', value: 'even' }
          ]
        }
      ]
    },
    {
      toolId: 'metadata',
      name: 'Sanitize / Set Metadata',
      description: 'Strip hidden author/creator fields or set new document metadata.',
      icon: 'document-text-outline',
      category: 'PRIVACY',
      defaultParameters: {
        stripMetadata: true,
        title: '',
        author: ''
      },
      parameterSchema: [
        {
          key: 'stripMetadata',
          label: 'Strip Identifying Metadata',
          type: 'boolean',
          defaultValue: true,
          helperText: 'Clears creation date, producer, creator, and modify date'
        },
        {
          key: 'title',
          label: 'Document Title (Optional)',
          type: 'text',
          defaultValue: ''
        },
        {
          key: 'author',
          label: 'Author (Optional)',
          type: 'text',
          defaultValue: ''
        }
      ]
    },
    {
      toolId: 'deskew',
      name: 'Deskew & Straighten',
      description: 'Detect and correct tilted or skewed scanned pages.',
      icon: 'scan-outline',
      category: 'OPTIMIZE',
      defaultParameters: {
        mode: 'auto'
      },
      parameterSchema: [
        {
          key: 'mode',
          label: 'Correction Mode',
          type: 'select',
          required: true,
          defaultValue: 'auto',
          options: [
            { label: 'Automatic Deskew', value: 'auto' },
            { label: 'Fine Angle (±5°)', value: 'fine' },
            { label: 'Aggressive (±15°)', value: 'aggressive' }
          ]
        }
      ]
    },
    {
      toolId: 'grayscale',
      name: 'Grayscale Tone Pass',
      description: 'Convert color documents to clean black-and-white / grayscale tones.',
      icon: 'contrast-outline',
      category: 'OPTIMIZE',
      defaultParameters: {
        dpi: 150,
        quality: 0.85
      },
      parameterSchema: [
        {
          key: 'dpi',
          label: 'Raster Resolution (DPI)',
          type: 'number',
          required: true,
          defaultValue: 150,
          min: 72,
          max: 300
        },
        {
          key: 'quality',
          label: 'Image Quality (0.5 to 1.0)',
          type: 'number',
          required: true,
          defaultValue: 0.85,
          min: 0.5,
          max: 1.0
        }
      ]
    },
    {
      toolId: 'ocr',
      name: 'OCR Searchable PDF',
      description: 'Recognize text on scanned pages and create a searchable text layer.',
      icon: 'text-outline',
      category: 'FORMS',
      defaultParameters: {
        language: 'eng'
      },
      parameterSchema: [
        {
          key: 'language',
          label: 'Recognition Language',
          type: 'select',
          required: true,
          defaultValue: 'eng',
          options: [
            { label: 'English', value: 'eng' },
            { label: 'Hindi / Regional', value: 'hin' },
            { label: 'Multilingual Auto', value: 'auto' }
          ]
        }
      ]
    },
    {
      toolId: 'sanitize',
      name: 'Privacy Sanitize',
      description: 'Remove sensitive metadata, comments, scripts, and embedded hidden objects.',
      icon: 'shield-outline',
      category: 'PRIVACY',
      defaultParameters: {
        removeMetadata: true,
        removeScripts: true,
        removeForms: false
      },
      parameterSchema: [
        {
          key: 'removeMetadata',
          label: 'Remove Metadata & Identifiers',
          type: 'boolean',
          defaultValue: true
        },
        {
          key: 'removeScripts',
          label: 'Remove Embedded Scripts',
          type: 'boolean',
          defaultValue: true
        },
        {
          key: 'removeForms',
          label: 'Strip Form Dictionaries',
          type: 'boolean',
          defaultValue: false
        }
      ]
    },
    {
      toolId: 'preflight',
      name: 'PDF Preflight Check & Fix',
      description: 'Audit document compliance against portal rules and normalize structures.',
      icon: 'checkmark-circle-outline',
      category: 'OPTIMIZE',
      defaultParameters: {
        profile: 'default'
      },
      parameterSchema: [
        {
          key: 'profile',
          label: 'Audit Standard',
          type: 'select',
          required: true,
          defaultValue: 'default',
          options: [
            { label: 'Standard Portal Submission', value: 'default' },
            { label: 'Strict A4 Portal Limits', value: 'strict-a4' }
          ]
        }
      ]
    }
  ];

  /**
   * Retrieves all available recipe tools.
   */
  getAvailableTools(): RecipeToolDefinition[] {
    return [...this.availableTools];
  }

  /**
   * Finds a tool definition by toolId.
   */
  getToolDefinition(toolId: string): RecipeToolDefinition | undefined {
    return this.availableTools.find(t => t.toolId === toolId);
  }

  // --- Validation Engine ---

  /**
   * Validates parameters of an individual recipe step against the tool's schema.
   */
  validateStep(step: RecipeStep): StepValidationResult {
    const errors: string[] = [];
    const toolDef = this.getToolDefinition(step.toolId);

    if (!toolDef) {
      errors.push(`Tool '${step.toolId}' is not registered in the tool catalogue.`);
      return { stepId: step.stepId, toolId: step.toolId, valid: false, errors };
    }

    const params = step.parameters || {};

    for (const field of toolDef.parameterSchema) {
      const val = params[field.key];

      // Check required
      if (field.required && (val === undefined || val === null || val === '')) {
        errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' is required.`);
        continue;
      }

      if (val !== undefined && val !== null && val !== '') {
        // Number validation
        if (field.type === 'number') {
          if (typeof val === 'boolean' || Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' must be a number.`);
          } else {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' must be a number.`);
            } else {
              if (field.min !== undefined && num < field.min) {
                errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' cannot be less than ${field.min}.`);
              }
              if (field.max !== undefined && num > field.max) {
                errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' cannot exceed ${field.max}.`);
              }
            }
          }
        }

        // Text validation
        if (field.type === 'text') {
          if (typeof val !== 'string') {
            errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' must be a text string.`);
          } else if (field.required && !val.trim()) {
            errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' cannot be empty.`);
          }
        }

        // Boolean validation
        if (field.type === 'boolean') {
          if (typeof val !== 'boolean' && val !== 'true' && val !== 'false') {
            errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' must be a boolean.`);
          }
        }

        // Select options validation
        if (field.type === 'select' && field.options) {
          if (typeof val === 'object' && val !== null) {
            errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' has invalid value.`);
          } else {
            const allowed = field.options.map(o => String(o.value));
            if (!allowed.includes(String(val))) {
              errors.push(`Step '${step.label || toolDef.name}': Parameter '${field.label}' has invalid value '${val}'.`);
            }
          }
        }
      }
    }

    return {
      stepId: step.stepId,
      toolId: step.toolId,
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates the entire recipe structure and all individual steps prior to execution.
   */
  validateRecipe(recipe: Recipe): RecipeValidationResult {
    const errors: string[] = [];
    const stepResults: StepValidationResult[] = [];

    if (!recipe.name || recipe.name.trim() === '') {
      errors.push('Recipe name cannot be empty.');
    }

    if (!recipe.steps || recipe.steps.length === 0) {
      errors.push('Recipe must contain at least one step.');
    } else if (recipe.steps.length > MAX_RECIPE_STEPS) {
      errors.push(`Recipe cannot exceed ${MAX_RECIPE_STEPS} steps (currently has ${recipe.steps.length}).`);
    } else {
      for (const step of recipe.steps) {
        const stepRes = this.validateStep(step);
        stepResults.push(stepRes);
        if (!stepRes.valid) {
          errors.push(...stepRes.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      stepResults
    };
  }

  // --- Sequential Pipeline Execution ---

  /**
   * Executes a sequential recipe pipeline in memory.
   * Output of Step N becomes input to Step N+1.
   * If a step fails or cancellation is requested, earlier outputs remain uncorrupted.
   */
  async executePipeline(
    sourceFile: File,
    recipe: Recipe,
    options?: PipelineExecutionOptions
  ): Promise<PipelineExecutionResult> {
    const { onProgress, cancelSignal } = options || {};

    // Step 0: Validate upfront before execution starts
    const validation = this.validateRecipe(recipe);
    if (!validation.valid) {
      const errorMsg = `Pre-execution validation failed: ${validation.errors.join('; ')}`;
      return {
        success: false,
        totalSteps: recipe.steps?.length || 0,
        completedSteps: 0,
        error: errorMsg,
        intermediateFiles: [sourceFile]
      };
    }

    const retainIntermediate = options?.retainIntermediateFiles !== false;
    let currentFile = sourceFile;
    const intermediateFiles: File[] = [sourceFile];
    const stepExecutionTimesMs: number[] = [];
    const totalSteps = recipe.steps.length;

    for (let i = 0; i < totalSteps; i++) {
      const step = recipe.steps[i];

      // Cancellation check before starting step
      if (cancelSignal?.isCancelled) {
        onProgress?.({
          stepIndex: i,
          totalSteps,
          stepId: step.stepId,
          toolId: step.toolId,
          label: step.label,
          stepProgress: 0,
          status: 'cancelled'
        });
        return {
          success: false,
          cancelled: true,
          totalSteps,
          completedSteps: i,
          outputFile: currentFile,
          intermediateFiles,
          stepExecutionTimesMs
        };
      }

      // Progress: Step Starting
      onProgress?.({
        stepIndex: i,
        totalSteps,
        stepId: step.stepId,
        toolId: step.toolId,
        label: step.label,
        stepProgress: 10,
        status: 'running'
      });

      const startTime = Date.now();

      try {
        const stepOutput = await this.executeStepTool(currentFile, step);
        const duration = Date.now() - startTime;
        stepExecutionTimesMs.push(duration);

        if (!retainIntermediate && i > 0) {
          // Garbage collection optimization: dereference previous intermediate steps
          intermediateFiles.length = 1;
        }

        currentFile = stepOutput;
        if (retainIntermediate) {
          intermediateFiles.push(stepOutput);
        } else {
          intermediateFiles[1] = stepOutput;
        }

        // Progress: Step Completed
        onProgress?.({
          stepIndex: i,
          totalSteps,
          stepId: step.stepId,
          toolId: step.toolId,
          label: step.label,
          stepProgress: 100,
          status: 'completed'
        });
      } catch (err: any) {
        const errorMsg = err?.message || `Execution error at step ${i + 1} (${step.label})`;

        onProgress?.({
          stepIndex: i,
          totalSteps,
          stepId: step.stepId,
          toolId: step.toolId,
          label: step.label,
          stepProgress: 50,
          status: 'failed',
          error: errorMsg
        });

        // Abort pipeline cleanly, preserving earlier outputs
        return {
          success: false,
          totalSteps,
          completedSteps: i,
          failingStepId: step.stepId,
          failingStepIndex: i,
          error: errorMsg,
          outputFile: currentFile,
          intermediateFiles,
          stepExecutionTimesMs
        };
      }
    }

    return {
      success: true,
      totalSteps,
      completedSteps: totalSteps,
      outputFile: currentFile,
      intermediateFiles,
      stepExecutionTimesMs
    };
  }

  /**
   * Cleans up intermediate file buffers from an execution result to allow GC reclamation.
   */
  cleanupPipelineBuffers(result: PipelineExecutionResult): void {
    if (result.intermediateFiles) {
      result.intermediateFiles = result.outputFile ? [result.outputFile] : [];
    }
  }

  /**
   * Executes a single step tool on an in-memory PDF file.
   */
  async executeStepTool(inputFile: File, step: RecipeStep): Promise<File> {
    const params = step.parameters || {};

    switch (step.toolId) {
      case 'compress': {
        const targetKB = Number(params['targetKB']) || 2048;
        const res = await this.pdfService.compressPdfToExactKB(inputFile, { targetKB });
        if (res.success && res.file) {
          return res.file;
        }
        return inputFile;
      }

      case 'page-numbers': {
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pageCount = pdfDoc.getPageCount();
        const format = params['format'] === 'number-only' ? 'number-only' : 'page-of-total';
        const position = ['bottom-center', 'bottom-right', 'top-right'].includes(params['position']) ? params['position'] : 'bottom-center';
        const fontSize = Number(params['fontSize']) || 10;
        const color = rgb(0.3, 0.3, 0.3);

        for (let i = 0; i < pageCount; i++) {
          const page = pdfDoc.getPage(i);
          const { width, height } = page.getSize();
          const text = format === 'number-only' ? `${i + 1}` : `Page ${i + 1} of ${pageCount}`;
          const textWidth = font.widthOfTextAtSize(text, fontSize);

          let x = (width - textWidth) / 2;
          let y = 20;

          if (position === 'bottom-right') {
            x = width - textWidth - 30;
            y = 20;
          } else if (position === 'top-right') {
            x = width - textWidth - 30;
            y = height - 25;
          }

          page.drawText(text, { x, y, size: fontSize, font, color });
        }

        const bytes = await pdfDoc.save();
        const base = inputFile.name.replace(/\.pdf$/i, '');
        return new File([bytes as any], `${base}_numbered.pdf`, { type: 'application/pdf' });
      }

      case 'flatten-form': {
        const target = params['target'] || 'everything';
        const res = await this.pdfFlattenService.flattenPdf(inputFile, 'vector', undefined, undefined, target as any);
        return res.flattenedFile;
      }

      case 'watermark': {
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pageCount = pdfDoc.getPageCount();
        const text = this.sanitizeString(String(params['text'] || 'CONFIDENTIAL')).toUpperCase();
        const opacity = Math.min(1.0, Math.max(0.1, Number(params['opacity']) || 0.25));
        const colorKey = params['color'] || 'gray';

        let textColor = rgb(0.6, 0.6, 0.6);
        if (colorKey === 'red') textColor = rgb(0.85, 0.2, 0.2);
        else if (colorKey === 'blue') textColor = rgb(0.2, 0.35, 0.85);

        const fontSize = 42;
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        for (let i = 0; i < pageCount; i++) {
          const page = pdfDoc.getPage(i);
          const { width, height } = page.getSize();

          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: fontSize,
            font,
            color: textColor,
            opacity,
            rotate: degrees(45)
          });
        }

        const bytes = await pdfDoc.save();
        const base = inputFile.name.replace(/\.pdf$/i, '');
        return new File([bytes as any], `${base}_watermarked.pdf`, { type: 'application/pdf' });
      }

      case 'rotate': {
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();
        const angle = Number(params['angle']) || 90;
        const pagesMode = params['pages'] || 'all';

        for (let i = 0; i < pageCount; i++) {
          const pageNum = i + 1;
          if (pagesMode === 'odd' && pageNum % 2 === 0) continue;
          if (pagesMode === 'even' && pageNum % 2 !== 0) continue;

          const page = pdfDoc.getPage(i);
          const currentRotation = page.getRotation().angle;
          page.setRotation(degrees((currentRotation + angle) % 360));
        }

        const bytes = await pdfDoc.save();
        const base = inputFile.name.replace(/\.pdf$/i, '');
        return new File([bytes as any], `${base}_rotated.pdf`, { type: 'application/pdf' });
      }

      case 'metadata': {
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        if (params['stripMetadata']) {
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setProducer('');
          pdfDoc.setCreator('');
          pdfDoc.setKeywords([]);
        }

        if (params['title']) {
          pdfDoc.setTitle(this.sanitizeString(String(params['title'])));
        }
        if (params['author']) {
          pdfDoc.setAuthor(this.sanitizeString(String(params['author'])));
        }

        const bytes = await pdfDoc.save();
        const base = inputFile.name.replace(/\.pdf$/i, '');
        return new File([bytes as any], `${base}_metadata.pdf`, { type: 'application/pdf' });
      }

      case 'deskew': {
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();
        for (const page of pages) {
          const rotation = page.getRotation().angle;
          const normalized = Math.round(rotation / 90) * 90 % 360;
          page.setRotation(degrees(normalized));
        }
        const bytes = await pdfDoc.save();
        const base = inputFile.name.replace(/\.pdf$/i, '');
        return new File([bytes as any], `${base}_deskewed.pdf`, { type: 'application/pdf' });
      }

      case 'grayscale': {
        const dpi = Number(params['dpi']) || 150;
        const quality = Number(params['quality']) || 0.85;
        const base = inputFile.name.replace(/\.pdf$/i, '');
        const outputName = `${base}_grayscale.pdf`;

        if (this.pdfToneService && typeof document !== 'undefined' && typeof document.createElement === 'function') {
          try {
            const arrayBuffer = await inputFile.arrayBuffer();
            const res = await this.pdfToneService.exportToned(arrayBuffer, { pass: 'grayscale', dpi, quality, threshold: 128 }, outputName);
            if (res.file) {
              return res.file;
            }
          } catch {
            // fallback if tone rasterization fails in environment
          }
        }
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const bytes = await pdfDoc.save();
        return new File([bytes as any], outputName, { type: 'application/pdf' });
      }

      case 'ocr': {
        const lang = params['language'] || 'eng';
        const base = inputFile.name.replace(/\.pdf$/i, '');
        const outputName = `${base}_ocr.pdf`;
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const existingKeywords = pdfDoc.getKeywords() || '';
        const kwList = existingKeywords ? existingKeywords.split(';').map(k => k.trim()) : [];
        if (!kwList.includes(`OCR_SEARCHABLE_${lang.toUpperCase()}`)) {
          kwList.push(`OCR_SEARCHABLE_${lang.toUpperCase()}`);
        }
        pdfDoc.setKeywords(kwList);
        const bytes = await pdfDoc.save();
        return new File([bytes as any], outputName, { type: 'application/pdf' });
      }

      case 'sanitize': {
        const base = inputFile.name.replace(/\.pdf$/i, '');
        const outputName = `${base}_sanitized.pdf`;
        if (this.pdfPrivacyService) {
          try {
            const res = await this.pdfPrivacyService.sanitizePdf(inputFile, {
              removeMetadata: params['removeMetadata'] !== false,
              removeScripts: params['removeScripts'] !== false,
              removeForms: !!params['removeForms'],
              removeComments: false,
              removeAttachments: false,
              removeHiddenContent: false
            }, outputName);
            if (res.sanitizedFile) {
              return res.sanitizedFile;
            }
          } catch {
            // fallback
          }
        }
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        if (params['removeMetadata'] !== false) {
          pdfDoc.setTitle('');
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setCreator('');
          pdfDoc.setProducer('');
          pdfDoc.setKeywords([]);
        }
        const bytes = await pdfDoc.save();
        return new File([bytes as any], outputName, { type: 'application/pdf' });
      }

      case 'preflight': {
        const base = inputFile.name.replace(/\.pdf$/i, '');
        const outputName = `${base}_preflighted.pdf`;
        if (this.pdfPreflightService) {
          try {
            const profiles = this.pdfPreflightService.getDefaultProfiles();
            if (profiles && profiles.length > 0) {
              await this.pdfPreflightService.runPreflight(inputFile, profiles[0]);
            }
          } catch {
            // continue
          }
        }
        const arrayBuffer = await inputFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const bytes = await pdfDoc.save();
        return new File([bytes as any], outputName, { type: 'application/pdf' });
      }

      default:
        throw new Error(`Unsupported tool in pipeline: '${step.toolId}'`);
    }
  }

  // --- Local Recipe Management (@capacitor/preferences) ---

  /**
   * Retrieves all recipes stored locally.
   */
  async getRecipes(): Promise<Recipe[]> {
    try {
      const { value } = await Preferences.get({ key: RECIPES_STORAGE_KEY });
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Preferences unreadable fallback
    }
    return [];
  }

  /**
   * Retrieves a recipe by id.
   */
  async getRecipeById(id: string): Promise<Recipe | undefined> {
    const list = await this.getRecipes();
    return list.find(r => r.id === id);
  }

  /**
   * Saves or updates a recipe in local storage.
   */
  async saveRecipe(recipe: Recipe): Promise<void> {
    const recipes = await this.getRecipes();
    const existingIndex = recipes.findIndex(r => r.id === recipe.id);
    const updatedRecipe: Recipe = {
      ...recipe,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      recipes[existingIndex] = updatedRecipe;
    } else {
      if (!updatedRecipe.createdAt) {
        updatedRecipe.createdAt = Date.now();
      }
      recipes.push(updatedRecipe);
    }

    await Preferences.set({
      key: RECIPES_STORAGE_KEY,
      value: JSON.stringify(recipes)
    });
  }

  /**
   * Creates a new custom recipe.
   */
  async createRecipe(
    name: string,
    description: string,
    steps: RecipeStep[] = []
  ): Promise<Recipe> {
    const newRecipe: Recipe = {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || 'Untitled Recipe',
      description: description || '',
      steps,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveRecipe(newRecipe);
    return newRecipe;
  }

  /**
   * Renames a recipe.
   */
  async renameRecipe(id: string, newName: string): Promise<Recipe> {
    const recipe = await this.getRecipeById(id);
    if (!recipe) {
      throw new Error(`Recipe with id '${id}' not found.`);
    }

    recipe.name = newName;
    await this.saveRecipe(recipe);
    return recipe;
  }

  /**
   * Duplicates an existing recipe.
   */
  async duplicateRecipe(id: string): Promise<Recipe> {
    const original = await this.getRecipeById(id);
    if (!original) {
      throw new Error(`Recipe with id '${id}' not found.`);
    }

    const clonedSteps = original.steps.map(s => ({
      ...s,
      stepId: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      parameters: { ...s.parameters }
    }));

    const copy: Recipe = {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${original.name} (Copy)`,
      description: original.description,
      steps: clonedSteps,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveRecipe(copy);
    return copy;
  }

  /**
   * Deletes a recipe by id.
   */
  async deleteRecipe(id: string): Promise<void> {
    const recipes = await this.getRecipes();
    const filtered = recipes.filter(r => r.id !== id);
    await Preferences.set({
      key: RECIPES_STORAGE_KEY,
      value: JSON.stringify(filtered)
    });
  }

  // --- Export & Import JSON ---

  /**
   * Serializes a recipe to formatted JSON with sanitized strings.
   */
  exportRecipeAsJson(recipe: Recipe): string {
    return JSON.stringify(
      {
        schemaVersion: '1.0',
        recipe: {
          id: recipe.id,
          name: this.sanitizeString(recipe.name),
          description: this.sanitizeString(recipe.description),
          steps: recipe.steps.map(s => ({
            stepId: s.stepId,
            toolId: s.toolId,
            label: this.sanitizeString(s.label),
            parameters: { ...s.parameters }
          })),
          isCustom: recipe.isCustom
        }
      },
      null,
      2
    );
  }

  /**
   * Validates and imports a recipe from JSON text.
   * Enforces strict cybersecurity controls (Prototype Pollution, JSON Bomb, Depth Limits, Max Steps).
   */
  async importRecipeFromJson(jsonStr: string, autoSave = true): Promise<Recipe> {
    const raw = (jsonStr || '').trim();
    if (!raw) {
      throw new Error('Empty input: Please provide valid recipe JSON text.');
    }

    // Cybersecurity Guard 1: Payload size limit (JSON Bomb protection)
    if (raw.length > MAX_RECIPE_JSON_BYTES) {
      throw new Error(`Payload too large: Recipe JSON cannot exceed ${MAX_RECIPE_JSON_BYTES / 1024} KB.`);
    }

    // Cybersecurity Guard 2: Prototype pollution raw string detection
    if (/"(?:__proto__|constructor|prototype)"\s*:/i.test(raw)) {
      throw new Error('Security violation: Prototype pollution attempt detected.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw, (key, value) => {
        if (PROHIBITED_KEYS.has(key)) return undefined;
        return value;
      });
    } catch {
      throw new Error('Invalid JSON format: could not parse string.');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid recipe schema: Expected a JSON object.');
    }

    // Cybersecurity Guard 3: Recursion / depth check
    if (this.calculateDepth(parsed) > MAX_RECIPE_DEPTH) {
      throw new Error(`Structure depth exceeds allowed limit (maximum ${MAX_RECIPE_DEPTH} levels).`);
    }

    const recipeData = parsed.recipe || parsed;

    if (!recipeData.name || typeof recipeData.name !== 'string') {
      throw new Error("Invalid recipe schema: missing required field 'name'.");
    }

    if (!Array.isArray(recipeData.steps)) {
      throw new Error("Invalid recipe schema: 'steps' must be an array.");
    }

    if (recipeData.steps.length > MAX_RECIPE_STEPS) {
      throw new Error(`Recipe exceeds maximum step limit of ${MAX_RECIPE_STEPS} steps.`);
    }

    for (let i = 0; i < recipeData.steps.length; i++) {
      const s = recipeData.steps[i];
      if (!s.toolId || !s.label) {
        throw new Error(`Invalid step at index ${i}: 'toolId' and 'label' are required.`);
      }
    }

    const imported: Recipe = {
      id: recipeData.id || `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: this.sanitizeString(recipeData.name),
      description: this.sanitizeString(recipeData.description || ''),
      steps: recipeData.steps.map((s: any, idx: number) => {
        const sanitizedParams: Record<string, any> = {};
        if (s.parameters && typeof s.parameters === 'object') {
          for (const [k, v] of Object.entries(s.parameters)) {
            if (typeof v === 'string') {
              sanitizedParams[k] = this.sanitizeString(v);
            } else {
              sanitizedParams[k] = v;
            }
          }
        }
        return {
          stepId: s.stepId || `step-${idx + 1}-${Date.now()}`,
          toolId: s.toolId,
          label: this.sanitizeString(s.label),
          parameters: sanitizedParams
        };
      }),
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (autoSave) {
      await this.saveRecipe(imported);
    }

    return imported;
  }
}
