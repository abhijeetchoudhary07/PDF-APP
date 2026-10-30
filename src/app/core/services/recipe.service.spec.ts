import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';

import { RecipeService } from './recipe.service';
import { PdfService } from './pdf.service';
import { PdfFlattenService } from './pdf-flatten.service';
import { Recipe, RecipeStep, RECIPES_STORAGE_KEY } from '../models/recipe.types';

// In-memory store for Capacitor Preferences
const preferencesStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferencesStore.get(key) ?? null
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
    clear: vi.fn(async () => {
      preferencesStore.clear();
    })
  }
}));

describe('RecipeService — Pipeline Engine & Recipe Management', () => {
  let service: RecipeService;
  let mockPdfService: any;
  let mockPdfFlattenService: any;
  let samplePdfFile: File;

  beforeEach(async () => {
    // Generate real minimal valid PDF file for in-memory pipeline tests
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 600]);
    const pdfBytes = await pdfDoc.save();
    samplePdfFile = new File([pdfBytes as any], 'source.pdf', { type: 'application/pdf' });

    mockPdfService = {
      compressPdfToExactKB: vi.fn().mockImplementation((file: File, config: any) => {
        const compressed = new File([pdfBytes as any], 'compressed.pdf', {
          type: 'application/pdf'
        });
        return Promise.resolve({ success: true, file: compressed });
      })
    };

    mockPdfFlattenService = {
      flattenPdf: vi.fn().mockImplementation((file: File) => {
        const flattened = new File([pdfBytes as any], 'flattened.pdf', {
          type: 'application/pdf'
        });
        return Promise.resolve({ flattenedFile: flattened });
      })
    };

    // Reset Preferences mock storage
    preferencesStore.clear();

    TestBed.configureTestingModule({
      providers: [
        RecipeService,
        { provide: PdfService, useValue: mockPdfService },
        { provide: PdfFlattenService, useValue: mockPdfFlattenService }
      ]
    });

    service = TestBed.inject(RecipeService);
  });

  describe('Tool Definitions & Validation', () => {
    it('returns catalog of supported tools with schemas', () => {
      const tools = service.getAvailableTools();
      expect(tools.length).toBeGreaterThanOrEqual(5);

      const compressTool = service.getToolDefinition('compress');
      expect(compressTool).toBeDefined();
      expect(compressTool?.parameterSchema.some(p => p.key === 'targetKB')).toBe(true);
    });

    it('validates a step with valid parameters', () => {
      const step: RecipeStep = {
        stepId: 'step-1',
        toolId: 'compress',
        label: 'Compress to 2MB',
        parameters: { targetKB: 2048 }
      };

      const result = service.validateStep(step);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('rejects a step with unknown toolId', () => {
      const step: RecipeStep = {
        stepId: 'step-unknown',
        toolId: 'non-existent-tool',
        label: 'Unknown',
        parameters: {}
      };

      const result = service.validateStep(step);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not registered');
    });

    it('rejects a step with invalid parameter bounds (e.g. negative or exceeding max)', () => {
      const step: RecipeStep = {
        stepId: 'step-1',
        toolId: 'compress',
        label: 'Compress',
        parameters: { targetKB: 10 } // min is 20
      };

      const result = service.validateStep(step);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('cannot be less than 20');
    });

    it('validates entire recipe and flags missing name or empty steps before execution starts', () => {
      const emptyRecipe: Recipe = {
        id: 'r-empty',
        name: '',
        description: '',
        steps: [],
        isCustom: true
      };

      const result = service.validateRecipe(emptyRecipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Recipe name cannot be empty.');
      expect(result.errors).toContain('Recipe must contain at least one step.');
    });
  });

  describe('Sequential Pipeline Execution', () => {
    it('executes a 3-step recipe sequentially in order, piping data between steps', async () => {
      const recipe: Recipe = {
        id: 'recipe-test-3-step',
        name: 'Prep for Portal',
        description: 'Compress -> Page Numbers -> Flatten Form',
        isCustom: true,
        steps: [
          {
            stepId: 's1',
            toolId: 'compress',
            label: 'Compress to 1MB',
            parameters: { targetKB: 1024 }
          },
          {
            stepId: 's2',
            toolId: 'page-numbers',
            label: 'Add Page Numbers',
            parameters: { format: 'page-of-total', position: 'bottom-center', fontSize: 10 }
          },
          {
            stepId: 's3',
            toolId: 'flatten-form',
            label: 'Flatten Form',
            parameters: { target: 'everything' }
          }
        ]
      };

      const progressSteps: any[] = [];
      const result = await service.executePipeline(samplePdfFile, recipe, {
        onProgress: (p) => progressSteps.push({ ...p })
      });

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(3);
      expect(result.outputFile).toBeDefined();
      expect(result.intermediateFiles?.length).toBe(4); // original + 3 steps

      // Verify sequence calls
      expect(mockPdfService.compressPdfToExactKB).toHaveBeenCalledTimes(1);
      expect(mockPdfFlattenService.flattenPdf).toHaveBeenCalledTimes(1);

      // Verify progress reporting
      expect(progressSteps.some(p => p.stepId === 's1' && p.status === 'completed')).toBe(true);
      expect(progressSteps.some(p => p.stepId === 's2' && p.status === 'completed')).toBe(true);
      expect(progressSteps.some(p => p.stepId === 's3' && p.status === 'completed')).toBe(true);
    });

    it('catches invalid parameters before execution and aborts without running any steps', async () => {
      const invalidRecipe: Recipe = {
        id: 'r-invalid',
        name: 'Invalid Recipe',
        description: '',
        isCustom: true,
        steps: [
          {
            stepId: 's1',
            toolId: 'compress',
            label: 'Compress',
            parameters: { targetKB: 5 } // below 20 KB limit
          }
        ]
      };

      const result = await service.executePipeline(samplePdfFile, invalidRecipe);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(0);
      expect(result.error).toContain('Pre-execution validation failed');
      expect(mockPdfService.compressPdfToExactKB).not.toHaveBeenCalled();
    });

    it('aborts cleanly on step error and preserves earlier outputs in intermediateFiles', async () => {
      mockPdfFlattenService.flattenPdf.mockRejectedValue(new Error('Flatten engine crashed'));

      const recipe: Recipe = {
        id: 'r-fail',
        name: 'Fail at Step 2',
        description: '',
        isCustom: true,
        steps: [
          {
            stepId: 's1',
            toolId: 'compress',
            label: 'Compress to 1MB',
            parameters: { targetKB: 1024 }
          },
          {
            stepId: 's2',
            toolId: 'flatten-form',
            label: 'Flatten Form',
            parameters: { target: 'everything' }
          }
        ]
      };

      const result = await service.executePipeline(samplePdfFile, recipe);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(1);
      expect(result.failingStepId).toBe('s2');
      expect(result.failingStepIndex).toBe(1);
      expect(result.error).toContain('Flatten engine crashed');
      // Earlier step 1 output preserved:
      expect(result.intermediateFiles?.length).toBe(2); // source + step 1
    });

    it('supports pipeline cancellation cleanly after step completion', async () => {
      const cancelSignal = { isCancelled: false };

      const recipe: Recipe = {
        id: 'r-cancel',
        name: 'Cancel after Step 1',
        description: '',
        isCustom: true,
        steps: [
          {
            stepId: 's1',
            toolId: 'compress',
            label: 'Compress',
            parameters: { targetKB: 1024 }
          },
          {
            stepId: 's2',
            toolId: 'flatten-form',
            label: 'Flatten',
            parameters: { target: 'everything' }
          }
        ]
      };

      const result = await service.executePipeline(samplePdfFile, recipe, {
        cancelSignal,
        onProgress: (p) => {
          if (p.stepId === 's1' && p.status === 'completed') {
            cancelSignal.isCancelled = true;
          }
        }
      });

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.completedSteps).toBe(1);
      expect(mockPdfFlattenService.flattenPdf).not.toHaveBeenCalled();
    });
  });

  describe('Local Recipe Management & JSON Transfer', () => {
    it('creates, saves, and retrieves recipes from Preferences', async () => {
      const created = await service.createRecipe('My Custom Workflow', 'Description', [
        {
          stepId: 's1',
          toolId: 'compress',
          label: 'Compress',
          parameters: { targetKB: 500 }
        }
      ]);

      expect(created.id).toBeDefined();
      expect(created.name).toBe('My Custom Workflow');

      const retrieved = await service.getRecipeById(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.steps.length).toBe(1);
    });

    it('renames and duplicates a recipe', async () => {
      const original = await service.createRecipe('Original Name', '', []);

      // Rename
      const renamed = await service.renameRecipe(original.id, 'Updated Name');
      expect(renamed.name).toBe('Updated Name');

      // Duplicate
      const duplicated = await service.duplicateRecipe(original.id);
      expect(duplicated.name).toBe('Updated Name (Copy)');
      expect(duplicated.id).not.toBe(original.id);

      const all = await service.getRecipes();
      expect(all.length).toBe(2);
    });

    it('deletes a recipe by id', async () => {
      const r1 = await service.createRecipe('R1', '', []);
      const r2 = await service.createRecipe('R2', '', []);

      let all = await service.getRecipes();
      expect(all.length).toBe(2);

      await service.deleteRecipe(r1.id);
      all = await service.getRecipes();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(r2.id);
    });

    it('exports and imports a recipe as JSON with byte-exact structure preservation', async () => {
      const originalRecipe: Recipe = {
        id: 'recipe-export-1',
        name: 'Stamp & Compress',
        description: 'Watermark and then compress',
        isCustom: true,
        steps: [
          {
            stepId: 'step-10',
            toolId: 'watermark',
            label: 'Watermark CONFIDENTIAL',
            parameters: { text: 'CONFIDENTIAL', opacity: 0.3, color: 'red' }
          },
          {
            stepId: 'step-20',
            toolId: 'compress',
            label: 'Compress to 1MB',
            parameters: { targetKB: 1024 }
          }
        ]
      };

      const jsonStr = service.exportRecipeAsJson(originalRecipe);
      expect(jsonStr).toContain('"schemaVersion": "1.0"');
      expect(jsonStr).toContain('Stamp & Compress');

      const imported = await service.importRecipeFromJson(jsonStr, false);
      expect(imported.name).toBe(originalRecipe.name);
      expect(imported.description).toBe(originalRecipe.description);
      expect(imported.steps.length).toBe(2);
      expect(imported.steps[0].toolId).toBe('watermark');
      expect(imported.steps[0].parameters).toEqual(originalRecipe.steps[0].parameters);
      expect(imported.steps[1].toolId).toBe('compress');
      expect(imported.steps[1].parameters).toEqual(originalRecipe.steps[1].parameters);
    });

    it('rejects malformed or incomplete recipe JSON with clear error messages', async () => {
      await expect(service.importRecipeFromJson('not valid json')).rejects.toThrow(
        /Invalid JSON format/
      );

      await expect(service.importRecipeFromJson(JSON.stringify({ steps: [] }))).rejects.toThrow(
        /missing required field 'name'/
      );

      await expect(
        service.importRecipeFromJson(JSON.stringify({ name: 'Invalid', steps: [{ missing: true }] }))
      ).rejects.toThrow(/'toolId' and 'label' are required/);
    });
  });

  describe('Cybersecurity Stress-Testing & Resource Exhaustion Defenses', () => {
    it('enforces maximum 10-step pipeline limit and rejects recipes exceeding it', () => {
      const elevenSteps: RecipeStep[] = Array.from({ length: 11 }, (_, i) => ({
        stepId: `step-${i}`,
        toolId: 'compress',
        label: `Step ${i + 1}`,
        parameters: { targetKB: 1024 }
      }));

      const longRecipe: Recipe = {
        id: 'r-long',
        name: 'Overly Long Recipe',
        description: '',
        steps: elevenSteps,
        isCustom: true
      };

      const result = service.validateRecipe(longRecipe);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 10 steps'))).toBe(true);
    });

    it('rejects imported JSON recipes exceeding maximum step limit', async () => {
      const elevenSteps = Array.from({ length: 11 }, (_, i) => ({
        stepId: `step-${i}`,
        toolId: 'compress',
        label: `Step ${i + 1}`,
        parameters: { targetKB: 1024 }
      }));

      const payload = JSON.stringify({
        schemaVersion: '1.0',
        recipe: {
          name: 'Eleven Steps Recipe',
          steps: elevenSteps
        }
      });

      await expect(service.importRecipeFromJson(payload)).rejects.toThrow(
        /exceeds maximum step limit of 10 steps/
      );
    });

    it('flags parameter type mismatches (boolean/object passed to number, non-string to text)', () => {
      // 1. Boolean passed to number field
      const boolStep: RecipeStep = {
        stepId: 's-bad-num',
        toolId: 'compress',
        label: 'Compress',
        parameters: { targetKB: false as any }
      };
      const boolRes = service.validateStep(boolStep);
      expect(boolRes.valid).toBe(false);
      expect(boolRes.errors[0]).toContain('must be a number');

      // 2. Number passed to text field
      const numStep: RecipeStep = {
        stepId: 's-bad-text',
        toolId: 'watermark',
        label: 'Watermark',
        parameters: { text: 12345 as any }
      };
      const numRes = service.validateStep(numStep);
      expect(numRes.valid).toBe(false);
      expect(numRes.errors[0]).toContain('must be a text string');

      // 3. String passed to boolean field
      const strStep: RecipeStep = {
        stepId: 's-bad-bool',
        toolId: 'metadata',
        label: 'Metadata',
        parameters: { stripMetadata: 'invalid-boolean' as any }
      };
      const strRes = service.validateStep(strStep);
      expect(strRes.valid).toBe(false);
      expect(strRes.errors[0]).toContain('must be a boolean');
    });

    it('blocks prototype pollution attempts in recipe JSON without polluting Object.prototype', async () => {
      const maliciousJson = '{"name": "Evil", "steps": [], "__proto__": {"polluted": true}}';

      await expect(service.importRecipeFromJson(maliciousJson)).rejects.toThrow(
        /Prototype pollution attempt detected/
      );

      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('rejects JSON bomb payloads exceeding 100 KB limit', async () => {
      const largeFiller = 'A'.repeat(120 * 1024);
      const bombJson = JSON.stringify({
        name: 'Bomb',
        description: largeFiller,
        steps: []
      });

      await expect(service.importRecipeFromJson(bombJson)).rejects.toThrow(
        /Payload too large/
      );
    });

    it('rejects deeply nested recursion attacks exceeding maximum depth', async () => {
      const deepNested = {
        name: 'Deep',
        steps: [],
        nested1: {
          nested2: {
            nested3: {
              nested4: {
                nested5: {
                  overflow: true
                }
              }
            }
          }
        }
      };

      await expect(service.importRecipeFromJson(JSON.stringify(deepNested))).rejects.toThrow(
        /Structure depth exceeds allowed limit/
      );
    });

    it('sanitizes script injection in recipe name, description, step labels, and parameters', async () => {
      const xssJson = JSON.stringify({
        schemaVersion: '1.0',
        recipe: {
          name: 'Clean Recipe <script>alert("name")</script>',
          description: 'Clean Desc <img src=x onerror=evil()>',
          steps: [
            {
              stepId: 's1',
              toolId: 'watermark',
              label: 'Watermark <script>alert("label")</script>',
              parameters: {
                text: 'SECRET <script>alert("param")</script>'
              }
            }
          ]
        }
      });

      const imported = await service.importRecipeFromJson(xssJson, false);
      expect(imported.name).toBe('Clean Recipe');
      expect(imported.description).toBe('Clean Desc');
      expect(imported.steps[0].label).toBe('Watermark');
      expect(imported.steps[0].parameters['text']).toBe('SECRET');
    });

    it('manages intermediate memory buffers: supports retainIntermediateFiles=false and cleanupPipelineBuffers', async () => {
      const recipe: Recipe = {
        id: 'r-memory',
        name: 'Memory Test',
        description: '',
        isCustom: true,
        steps: [
          {
            stepId: 's1',
            toolId: 'compress',
            label: 'Compress',
            parameters: { targetKB: 1024 }
          },
          {
            stepId: 's2',
            toolId: 'compress',
            label: 'Compress 2',
            parameters: { targetKB: 1024 }
          }
        ]
      };

      // 1. With retainIntermediateFiles: false
      const result = await service.executePipeline(samplePdfFile, recipe, {
        retainIntermediateFiles: false
      });
      expect(result.success).toBe(true);
      // Pruned intermediate buffer retains only source + final output
      expect(result.intermediateFiles?.length).toBe(2);

      // 2. cleanupPipelineBuffers frees intermediate files
      service.cleanupPipelineBuffers(result);
      expect(result.intermediateFiles?.length).toBe(1);
    });
  });
});
