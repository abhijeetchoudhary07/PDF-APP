import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Recipe,
  RecipeStep,
  RecipeToolDefinition,
  RecipeStepProgress,
  PipelineExecutionResult
} from '../../core/models/recipe.types';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppModalComponent,
  AppProgressComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-recipe-editor',
  templateUrl: './recipe-editor.page.html',
  styleUrls: ['./recipe-editor.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    AppModalComponent,
    AppProgressComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class RecipeEditorPage implements OnInit {
  private recipeService = inject(RecipeService);
  private storageService = inject(StorageService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // Available Tools Catalogue
  availableTools: RecipeToolDefinition[] = [];

  // Active Recipe State
  recipe: Recipe = this.getEmptyRecipe();
  savedRecipes: Recipe[] = [];
  isLoading = true;

  // Add Tool Modal / Bottom Sheet
  showAddToolModal = false;

  // Configure Step Parameter Modal
  showConfigModal = false;
  activeEditingStep: RecipeStep | null = null;
  activeEditingToolDef: RecipeToolDefinition | null = null;

  // Drag and Drop State
  draggedStepIndex: number | null = null;
  dragOverIndex: number | null = null;

  // Test Run Modal & Execution State
  showTestRunModal = false;
  testPdfFile: File | null = null;
  isTestRunning = false;
  testRunProgress: RecipeStepProgress | null = null;
  testRunResult: PipelineExecutionResult | null = null;

  // Import JSON Modal
  showImportModal = false;
  jsonImportText = '';

  async ngOnInit(): Promise<void> {
    this.availableTools = this.recipeService.getAvailableTools();
    await this.loadSavedRecipes();

    // Check if route has recipeId
    const recipeId = this.route.snapshot.queryParamMap.get('recipeId');
    if (recipeId) {
      const match = this.savedRecipes.find(r => r.id === recipeId);
      if (match) {
        this.recipe = JSON.parse(JSON.stringify(match));
        this.cdr.markForCheck();
      }
    }
  }

  getEmptyRecipe(): Recipe {
    return {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Untitled Recipe',
      description: '',
      steps: [],
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async loadSavedRecipes(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      this.savedRecipes = await this.recipeService.getRecipes();
    } catch {
      this.toastService.show('Failed to load saved recipes', 'error');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onSelectRecipe(recipeId: string): void {
    const selected = this.savedRecipes.find(r => r.id === recipeId);
    if (selected) {
      this.recipe = JSON.parse(JSON.stringify(selected));
      this.toastService.show(`Loaded '${this.recipe.name}'`, 'info');
      this.cdr.markForCheck();
    }
  }

  newRecipe(): void {
    this.recipe = this.getEmptyRecipe();
    this.cdr.markForCheck();
  }

  // --- Step Pipeline Management ---

  openAddToolModal(): void {
    this.showAddToolModal = true;
    this.cdr.markForCheck();
  }

  closeAddToolModal(): void {
    this.showAddToolModal = false;
    this.cdr.markForCheck();
  }

  async addStepFromTool(tool: RecipeToolDefinition): Promise<void> {
    if (this.recipe.steps.length >= 10) {
      this.toastService.show('Maximum 10 steps allowed per recipe.', 'warning');
      this.closeAddToolModal();
      return;
    }

    const newStep: RecipeStep = {
      stepId: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolId: tool.toolId,
      label: tool.name,
      parameters: { ...tool.defaultParameters }
    };

    this.recipe.steps.push(newStep);
    this.closeAddToolModal();
    this.openStepConfig(newStep);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  // --- HTML5 Drag & Drop Pipeline Reordering ---

  onDragStart(event: DragEvent, index: number): void {
    this.draggedStepIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
    }
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  onDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.dragOverIndex !== index) {
      this.dragOverIndex = index;
      this.cdr.markForCheck();
    }
  }

  onDragLeave(event: DragEvent, index: number): void {
    if (this.dragOverIndex === index) {
      this.dragOverIndex = null;
      this.cdr.markForCheck();
    }
  }

  async onDrop(event: DragEvent, targetIndex: number): Promise<void> {
    event.preventDefault();
    const sourceIndex = this.draggedStepIndex !== null
      ? this.draggedStepIndex
      : Number(event.dataTransfer?.getData('text/plain'));

    this.draggedStepIndex = null;
    this.dragOverIndex = null;

    if (
      !isNaN(sourceIndex) &&
      sourceIndex >= 0 &&
      sourceIndex < this.recipe.steps.length &&
      targetIndex >= 0 &&
      targetIndex < this.recipe.steps.length &&
      sourceIndex !== targetIndex
    ) {
      const [movedStep] = this.recipe.steps.splice(sourceIndex, 1);
      this.recipe.steps.splice(targetIndex, 0, movedStep);
      await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      this.toastService.show(`Moved "${movedStep.label}" to Step ${targetIndex + 1}`, 'info');
      this.cdr.markForCheck();
    }
  }

  onDragEnd(): void {
    this.draggedStepIndex = null;
    this.dragOverIndex = null;
    this.cdr.markForCheck();
  }

  openStepConfig(step: RecipeStep): void {
    this.activeEditingStep = step;
    this.activeEditingToolDef = this.recipeService.getToolDefinition(step.toolId) || null;
    this.showConfigModal = true;
    this.cdr.markForCheck();
  }

  closeStepConfig(): void {
    this.showConfigModal = false;
    this.activeEditingStep = null;
    this.activeEditingToolDef = null;
    this.cdr.markForCheck();
  }

  async moveStepUp(index: number): Promise<void> {
    if (index > 0) {
      const temp = this.recipe.steps[index];
      this.recipe.steps[index] = this.recipe.steps[index - 1];
      this.recipe.steps[index - 1] = temp;
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      this.cdr.markForCheck();
    }
  }

  async moveStepDown(index: number): Promise<void> {
    if (index < this.recipe.steps.length - 1) {
      const temp = this.recipe.steps[index];
      this.recipe.steps[index] = this.recipe.steps[index + 1];
      this.recipe.steps[index + 1] = temp;
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      this.cdr.markForCheck();
    }
  }

  async removeStep(index: number): Promise<void> {
    this.recipe.steps.splice(index, 1);
    await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    this.cdr.markForCheck();
  }

  getToolIcon(toolId: string): string {
    const tool = this.recipeService.getToolDefinition(toolId);
    return tool ? tool.icon : 'construct-outline';
  }

  getToolCategory(toolId: string): string {
    const tool = this.recipeService.getToolDefinition(toolId);
    return tool ? tool.category : 'PROCESS';
  }

  getParamKeys(step: RecipeStep): string[] {
    return Object.keys(step.parameters || {});
  }

  // --- Recipe Actions ---

  async saveRecipe(): Promise<void> {
    const validation = this.recipeService.validateRecipe(this.recipe);
    if (!validation.valid) {
      this.toastService.show(validation.errors[0], 'warning');
      return;
    }

    try {
      await this.recipeService.saveRecipe(this.recipe);
      await this.loadSavedRecipes();
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.toastService.show('Recipe saved successfully!', 'success');
    } catch {
      this.toastService.show('Failed to save recipe.', 'error');
    }
  }

  async duplicateCurrentRecipe(): Promise<void> {
    try {
      const copy = await this.recipeService.duplicateRecipe(this.recipe.id);
      await this.loadSavedRecipes();
      this.recipe = JSON.parse(JSON.stringify(copy));
      this.toastService.show(`Created duplicate: ${copy.name}`, 'success');
      this.cdr.markForCheck();
    } catch {
      this.toastService.show('Could not duplicate recipe.', 'error');
    }
  }

  async deleteCurrentRecipe(): Promise<void> {
    try {
      await this.recipeService.deleteRecipe(this.recipe.id);
      await this.loadSavedRecipes();
      this.recipe = this.getEmptyRecipe();
      this.toastService.show('Recipe deleted', 'info');
      this.cdr.markForCheck();
    } catch {
      this.toastService.show('Failed to delete recipe.', 'error');
    }
  }

  async exportJson(): Promise<void> {
    const jsonStr = this.recipeService.exportRecipeAsJson(this.recipe);
    try {
      await Share.share({
        title: `${this.recipe.name}.recipe.json`,
        text: jsonStr,
        dialogTitle: 'Share Recipe JSON'
      });
    } catch {
      // Fallback: clipboard
      await navigator.clipboard.writeText(jsonStr);
      this.toastService.show('Copied recipe JSON to clipboard', 'info');
    }
  }

  openImportModal(): void {
    this.jsonImportText = '';
    this.showImportModal = true;
    this.cdr.markForCheck();
  }

  closeImportModal(): void {
    this.showImportModal = false;
    this.jsonImportText = '';
    this.cdr.markForCheck();
  }

  async confirmImport(): Promise<void> {
    if (!this.jsonImportText.trim()) return;

    try {
      const imported = await this.recipeService.importRecipeFromJson(this.jsonImportText, true);
      await this.loadSavedRecipes();
      this.recipe = JSON.parse(JSON.stringify(imported));
      this.closeImportModal();
      this.toastService.show(`Imported recipe '${imported.name}' successfully!`, 'success');
    } catch (err: any) {
      this.toastService.show(err?.message || 'Invalid recipe JSON.', 'error');
    }
  }

  // --- Test Run Pipeline ---

  openTestRunModal(): void {
    const validation = this.recipeService.validateRecipe(this.recipe);
    if (!validation.valid) {
      this.toastService.show(validation.errors[0], 'warning');
      return;
    }

    this.testPdfFile = null;
    this.testRunResult = null;
    this.testRunProgress = null;
    this.showTestRunModal = true;
    this.cdr.markForCheck();
  }

  closeTestRunModal(): void {
    if (this.isTestRunning) return;
    if (this.testRunResult) {
      this.recipeService.cleanupPipelineBuffers(this.testRunResult);
    }
    this.showTestRunModal = false;
    this.testPdfFile = null;
    this.testRunResult = null;
    this.testRunProgress = null;
    this.cdr.markForCheck();
  }

  onTestFileSelected(file: File): void {
    this.testPdfFile = file;
    this.testRunResult = null;
    this.testRunProgress = null;
    this.cdr.markForCheck();
  }

  async runTestPipeline(): Promise<void> {
    if (!this.testPdfFile || this.isTestRunning) return;

    this.isTestRunning = true;
    this.testRunResult = null;
    this.testRunProgress = null;
    this.cdr.markForCheck();

    try {
      const result = await this.recipeService.executePipeline(
        this.testPdfFile,
        this.recipe,
        {
          onProgress: (p) => {
            this.testRunProgress = p;
            this.cdr.markForCheck();
          }
        }
      );

      this.testRunResult = result;

      if (result.success) {
        await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        this.toastService.show('Test run completed successfully!', 'success');
      } else {
        await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
        this.toastService.show(result.error || 'Test run failed.', 'error');
      }
    } catch (err: any) {
      this.toastService.show(err?.message || 'Test run encountered an error.', 'error');
    } finally {
      this.isTestRunning = false;
      this.cdr.markForCheck();
    }
  }

  async downloadTestOutput(): Promise<void> {
    if (!this.testRunResult?.outputFile) return;

    try {
      await this.storageService.saveFile(
        this.testRunResult.outputFile,
        'recipe_output',
        undefined,
        { preserveName: true }
      );
      this.toastService.show('Saved output file successfully', 'success');
    } catch {
      this.toastService.show('Failed to save output file', 'error');
    }
  }
}
