import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Share } from '@capacitor/share';

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ value: true })
  }
}));

import { RecipeEditorPage } from './recipe-editor.page';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Recipe,
  RecipeStep,
  RecipeToolDefinition,
  PipelineExecutionResult
} from '../../core/models/recipe.types';

describe('RecipeEditorPage — Visual Mobile Pipeline Builder UI', () => {
  let component: RecipeEditorPage;
  let mockRecipeService: any;
  let mockStorageService: any;
  let mockToastService: any;
  let mockActivatedRoute: any;
  let mockCdr: any;

  const sampleTool: RecipeToolDefinition = {
    toolId: 'compress',
    name: 'Compress to Target Size',
    description: 'Compress PDF size down to a specific target KB limit.',
    icon: 'speedometer-outline',
    category: 'OPTIMIZE',
    defaultParameters: { targetKB: 2048 },
    parameterSchema: [
      {
        key: 'targetKB',
        label: 'Target Max Size (KB)',
        type: 'number',
        required: true,
        defaultValue: 2048,
        min: 20,
        max: 20000
      }
    ]
  };

  const sampleRecipe: Recipe = {
    id: 'test-recipe-1',
    name: 'Portal Upload Prep',
    description: 'Compress and number pages',
    isCustom: true,
    steps: [
      {
        stepId: 'step-1',
        toolId: 'compress',
        label: 'Compress to Target Size',
        parameters: { targetKB: 2048 }
      }
    ]
  };

  beforeEach(() => {
    mockRecipeService = {
      getAvailableTools: vi.fn().mockReturnValue([sampleTool]),
      getToolDefinition: vi.fn().mockReturnValue(sampleTool),
      getRecipes: vi.fn().mockResolvedValue([sampleRecipe]),
      saveRecipe: vi.fn().mockResolvedValue(undefined),
      deleteRecipe: vi.fn().mockResolvedValue(undefined),
      duplicateRecipe: vi.fn().mockResolvedValue({
        ...sampleRecipe,
        id: 'test-recipe-1-copy',
        name: 'Portal Upload Prep (Copy)'
      }),
      validateRecipe: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      exportRecipeAsJson: vi.fn().mockReturnValue('{"recipe":{"name":"Portal Upload Prep"}}'),
      importRecipeFromJson: vi.fn().mockResolvedValue({
        id: 'imported-1',
        name: 'Imported Recipe',
        description: '',
        steps: [],
        isCustom: true
      }),
      executePipeline: vi.fn().mockResolvedValue({
        success: true,
        totalSteps: 1,
        completedSteps: 1,
        outputFile: new File([new Uint8Array(100)], 'output.pdf', { type: 'application/pdf' })
      })
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file://saved-output')
    };

    mockToastService = {
      show: vi.fn()
    };

    mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: vi.fn().mockReturnValue(null)
        }
      }
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    component = TestBed.runInInjectionContext(() => new RecipeEditorPage());
  });

  it('initializes available tools and loads saved recipes', async () => {
    await component.ngOnInit();

    expect(mockRecipeService.getAvailableTools).toHaveBeenCalled();
    expect(mockRecipeService.getRecipes).toHaveBeenCalled();
    expect(component.availableTools.length).toBe(1);
    expect(component.savedRecipes.length).toBe(1);
    expect(component.isLoading).toBe(false);
  });

  it('selects recipe from route query parameter if matching recipe exists', async () => {
    mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('test-recipe-1');

    await component.ngOnInit();

    expect(component.recipe.id).toBe('test-recipe-1');
    expect(component.recipe.name).toBe('Portal Upload Prep');
  });

  it('adds a step from tool catalog and opens config modal', async () => {
    component.recipe = {
      id: 'r-1',
      name: 'Workflow',
      description: '',
      steps: [],
      isCustom: true
    };

    await component.addStepFromTool(sampleTool);

    expect(component.recipe.steps.length).toBe(1);
    expect(component.recipe.steps[0].toolId).toBe('compress');
    expect(component.recipe.steps[0].parameters['targetKB']).toBe(2048);
    expect(component.showConfigModal).toBe(true);
    expect(component.activeEditingStep).toBe(component.recipe.steps[0]);
  });

  it('reorders pipeline steps with moveStepUp and moveStepDown', async () => {
    const s1: RecipeStep = { stepId: '1', toolId: 'compress', label: 'Step 1', parameters: {} };
    const s2: RecipeStep = { stepId: '2', toolId: 'page-numbers', label: 'Step 2', parameters: {} };
    component.recipe.steps = [s1, s2];

    // Move step 2 up
    await component.moveStepUp(1);
    expect(component.recipe.steps[0].stepId).toBe('2');
    expect(component.recipe.steps[1].stepId).toBe('1');

    // Move step 2 down
    await component.moveStepDown(0);
    expect(component.recipe.steps[0].stepId).toBe('1');
    expect(component.recipe.steps[1].stepId).toBe('2');
  });

  it('removes a step from the pipeline', async () => {
    component.recipe.steps = [
      { stepId: '1', toolId: 'compress', label: 'Step 1', parameters: {} }
    ];

    await component.removeStep(0);
    expect(component.recipe.steps.length).toBe(0);
  });

  it('saves recipe after validating against schema', async () => {
    component.recipe = sampleRecipe;

    await component.saveRecipe();

    expect(mockRecipeService.validateRecipe).toHaveBeenCalledWith(sampleRecipe);
    expect(mockRecipeService.saveRecipe).toHaveBeenCalledWith(sampleRecipe);
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Recipe saved successfully!'),
      'success'
    );
  });

  it('prevents saving recipe if validation fails and shows warning', async () => {
    mockRecipeService.validateRecipe.mockReturnValue({
      valid: false,
      errors: ['Recipe must contain at least one step.']
    });

    await component.saveRecipe();

    expect(mockToastService.show).toHaveBeenCalledWith(
      'Recipe must contain at least one step.',
      'warning'
    );
    expect(mockRecipeService.saveRecipe).not.toHaveBeenCalled();
  });

  it('duplicates and deletes current recipe', async () => {
    component.recipe = sampleRecipe;

    await component.duplicateCurrentRecipe();
    expect(mockRecipeService.duplicateRecipe).toHaveBeenCalledWith(sampleRecipe.id);
    expect(component.recipe.name).toBe('Portal Upload Prep (Copy)');

    await component.deleteCurrentRecipe();
    expect(mockRecipeService.deleteRecipe).toHaveBeenCalledWith('test-recipe-1-copy');
  });

  it('exports recipe as JSON and invokes native share', async () => {
    component.recipe = sampleRecipe;

    await component.exportJson();

    expect(mockRecipeService.exportRecipeAsJson).toHaveBeenCalledWith(sampleRecipe);
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '{"recipe":{"name":"Portal Upload Prep"}}'
      })
    );
  });

  it('imports recipe JSON and updates editor state', async () => {
    const testJson = '{"schemaVersion": "1.0", "recipe": { "name": "Imported Recipe", "steps": [] }}';
    component.jsonImportText = testJson;

    await component.confirmImport();

    expect(mockRecipeService.importRecipeFromJson).toHaveBeenCalledWith(
      testJson,
      true
    );
    expect(component.recipe.name).toBe('Imported Recipe');
    expect(component.showImportModal).toBe(false);
  });

  it('executes test run on uploaded sample PDF and reports success', async () => {
    component.recipe = sampleRecipe;
    const testFile = new File([new Uint8Array(200)], 'sample.pdf', { type: 'application/pdf' });

    component.openTestRunModal();
    expect(component.showTestRunModal).toBe(true);

    component.onTestFileSelected(testFile);
    expect(component.testPdfFile).toBe(testFile);

    await component.runTestPipeline();

    expect(mockRecipeService.executePipeline).toHaveBeenCalledWith(
      testFile,
      sampleRecipe,
      expect.any(Object)
    );
    expect(component.testRunResult?.success).toBe(true);
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Test run completed successfully!'),
      'success'
    );
  });

  it('downloads test output file after successful test run', async () => {
    const outputFile = new File([new Uint8Array(100)], 'test_out.pdf', { type: 'application/pdf' });
    component.testRunResult = {
      success: true,
      totalSteps: 1,
      completedSteps: 1,
      outputFile
    };

    await component.downloadTestOutput();

    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      outputFile,
      'recipe_output',
      undefined,
      { preserveName: true }
    );
  });

  it('reorders steps using drag-and-drop (onDragStart, onDragOver, onDrop)', async () => {
    component.recipe = {
      ...sampleRecipe,
      steps: [
        { stepId: 'step-A', toolId: 'compress', label: 'Step A', parameters: {} },
        { stepId: 'step-B', toolId: 'page-numbers', label: 'Step B', parameters: {} },
        { stepId: 'step-C', toolId: 'flatten-form', label: 'Step C', parameters: {} }
      ]
    };

    const mockDataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('0'),
      effectAllowed: '',
      dropEffect: ''
    };

    const mockDragStartEvent = {
      dataTransfer: mockDataTransfer
    } as unknown as DragEvent;

    // Start dragging Step 0 (Step A)
    component.onDragStart(mockDragStartEvent, 0);
    expect(component.draggedStepIndex).toBe(0);
    expect(mockDataTransfer.setData).toHaveBeenCalledWith('text/plain', '0');

    // Drag over Step 2
    const mockDragOverEvent = {
      preventDefault: vi.fn(),
      dataTransfer: mockDataTransfer
    } as unknown as DragEvent;

    component.onDragOver(mockDragOverEvent, 2);
    expect(mockDragOverEvent.preventDefault).toHaveBeenCalled();
    expect(component.dragOverIndex).toBe(2);

    // Drop onto Step 2 (move Step A to the end)
    const mockDropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: mockDataTransfer
    } as unknown as DragEvent;

    await component.onDrop(mockDropEvent, 2);

    expect(component.recipe.steps.map(s => s.stepId)).toEqual(['step-B', 'step-C', 'step-A']);
    expect(component.draggedStepIndex).toBeNull();
    expect(component.dragOverIndex).toBeNull();
  });

  it('enforces maximum 10 steps limit when adding new steps', async () => {
    component.recipe = {
      ...sampleRecipe,
      steps: Array.from({ length: 10 }, (_, i) => ({
        stepId: `step-${i}`,
        toolId: 'compress',
        label: `Step ${i + 1}`,
        parameters: {}
      }))
    };

    await component.addStepFromTool(sampleTool);

    expect(component.recipe.steps.length).toBe(10);
    expect(mockToastService.show).toHaveBeenCalledWith(
      expect.stringContaining('Maximum 10 steps allowed'),
      'warning'
    );
  });
});
