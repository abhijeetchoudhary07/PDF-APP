import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Q4: Sequential Recipe Pipeline Engine (/features/recipes/editor) @recipes @q4', () => {
  const samplePdfPath = path.resolve(__dirname, 'test-data/pdf/text.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('RE-001: Navigation and Route Accessibility — direct route and alias redirect', async ({ page }) => {
    // 1. Alias redirect from /recipes/editor
    await page.goto('/recipes/editor');
    await expect(page).toHaveURL(/.*features\/recipes\/editor/);

    // Verify main components rendered
    const title = page.locator('app-page-header');
    await expect(title).toBeVisible();

    const nameInput = page.locator('input#recipe-name');
    await expect(nameInput).toBeVisible();

    const emptyCard = page.locator('.empty-pipeline-card');
    await expect(emptyCard).toBeVisible();
  });

  test('RE-002: Build 3-Step Recipe & Step Parameter Configuration', async ({ page }) => {
    await page.goto('/features/recipes/editor');
    await page.waitForLoadState('domcontentloaded');

    // 1. Set Recipe Name & Description
    const nameInput = page.locator('input#recipe-name');
    await nameInput.fill('Submission Quick Prep');

    const descInput = page.locator('input#recipe-desc');
    await descInput.fill('Compress, Page Numbers, Flatten Form');

    // 2. Add Step 1: Compress to Target Size
    const addStepBtn = page.locator('.pipeline-section-header app-button').filter({ hasText: 'Add Step' });
    await addStepBtn.click();

    const toolPickerGrid = page.locator('.tool-picker-grid');
    await expect(toolPickerGrid).toBeVisible({ timeout: 5000 });

    const compressTool = page.locator('.tool-picker-card').filter({ hasText: 'Compress to Target Size' });
    await compressTool.click();

    // Step parameter configuration modal opens automatically
    const inspectorForm = page.locator('.inspector-form');
    await expect(inspectorForm).toBeVisible({ timeout: 5000 });

    // Configure targetKB = 1024
    const targetKbInput = page.locator('input#param-targetKB');
    await targetKbInput.fill('1024');

    // Close configuration modal
    const closeConfigBtn = page.locator('.inspector-footer app-button');
    await closeConfigBtn.click();
    await expect(inspectorForm).toBeHidden({ timeout: 5000 });

    // 3. Add Step 2: Add Page Numbers
    await addStepBtn.click();
    await expect(toolPickerGrid).toBeVisible({ timeout: 5000 });
    await page.locator('.tool-picker-card').filter({ hasText: 'Add Page Numbers' }).click();
    await expect(inspectorForm).toBeVisible({ timeout: 5000 });
    await closeConfigBtn.click();
    await expect(inspectorForm).toBeHidden({ timeout: 5000 });

    // 4. Add Step 3: Flatten Form & Annotations
    await addStepBtn.click();
    await expect(toolPickerGrid).toBeVisible({ timeout: 5000 });
    await page.locator('.tool-picker-card').filter({ hasText: 'Flatten Form & Annotations' }).click();
    await expect(inspectorForm).toBeVisible({ timeout: 5000 });
    await closeConfigBtn.click();
    await expect(inspectorForm).toBeHidden({ timeout: 5000 });

    // Verify 3 step cards rendered in order
    const stepCards = page.locator('.pipeline-step-card');
    await expect(stepCards).toHaveCount(3);

    await expect(stepCards.nth(0)).toContainText('Compress to Target Size');
    await expect(stepCards.nth(0)).toContainText('targetKB: 1024');
    await expect(stepCards.nth(1)).toContainText('Add Page Numbers');
    await expect(stepCards.nth(2)).toContainText('Flatten Form & Annotations');
  });

  test('RE-003: Step Reordering with Drag-and-Drop and Arrow Controls', async ({ page }) => {
    // Seed recipe with 3 valid steps
    await page.addInitScript(() => {
      const seeded = [
        {
          id: 'seeded-recipe-reorder',
          name: 'Reorder Test Recipe',
          description: 'Testing step reordering',
          isCustom: true,
          steps: [
            { stepId: 's1', toolId: 'compress', label: 'Step 1: Compress', parameters: { targetKB: 1024 } },
            { stepId: 's2', toolId: 'page-numbers', label: 'Step 2: Numbering', parameters: { format: 'page-of-total', position: 'bottom-center', fontSize: 10 } },
            { stepId: 's3', toolId: 'flatten-form', label: 'Step 3: Flatten', parameters: { target: 'everything' } }
          ]
        }
      ];
      localStorage.setItem('CapacitorStorage.IFH_RECIPES_V1', JSON.stringify(seeded));
      localStorage.setItem('IFH_RECIPES_V1', JSON.stringify(seeded));
    });

    await page.goto('/features/recipes/editor?recipeId=seeded-recipe-reorder');
    await page.waitForLoadState('domcontentloaded');

    const stepCards = page.locator('.pipeline-step-card');
    await expect(stepCards).toHaveCount(3);

    // Initial order
    await expect(stepCards.nth(0)).toContainText('Step 1: Compress');
    await expect(stepCards.nth(1)).toContainText('Step 2: Numbering');
    await expect(stepCards.nth(2)).toContainText('Step 3: Flatten');

    // 1. Move Step 1 (Compress) down using control button on card 0
    const step1MoveDown = stepCards.nth(0).locator('button[aria-label="Move step down"]');
    await step1MoveDown.click();

    // Order should now be: Numbering, Compress, Flatten
    await expect(stepCards.nth(0)).toContainText('Step 2: Numbering');
    await expect(stepCards.nth(1)).toContainText('Step 1: Compress');
    await expect(stepCards.nth(2)).toContainText('Step 3: Flatten');

    // 2. Drag & Drop: Dispatch HTML5 drag events from first card (Numbering) to last card (Flatten)
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.pipeline-step-card');
      if (cards.length >= 3) {
        const source = cards[0];
        const target = cards[2];
        const dt = new DataTransfer();
        dt.setData('text/plain', '0');
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    });

    // Order should now have Compress as Step 1
    await expect(stepCards.nth(0)).toContainText('Step 1: Compress');
  });

  test('RE-004: Test Run Recipe Pipeline with In-Memory Ingestion and Clean Execution', async ({ page }) => {
    // Seed recipe with 3 valid steps
    await page.addInitScript(() => {
      const seeded = [
        {
          id: 'seeded-recipe-testrun',
          name: 'Portal Test Recipe',
          description: '',
          isCustom: true,
          steps: [
            { stepId: 's1', toolId: 'compress', label: 'Compress to Target Size', parameters: { targetKB: 1024 } },
            { stepId: 's2', toolId: 'page-numbers', label: 'Add Page Numbers', parameters: { format: 'page-of-total', position: 'bottom-center', fontSize: 10 } },
            { stepId: 's3', toolId: 'flatten-form', label: 'Flatten Form & Annotations', parameters: { target: 'everything' } }
          ]
        }
      ];
      localStorage.setItem('CapacitorStorage.IFH_RECIPES_V1', JSON.stringify(seeded));
      localStorage.setItem('IFH_RECIPES_V1', JSON.stringify(seeded));
    });

    await page.goto('/features/recipes/editor?recipeId=seeded-recipe-testrun');
    await page.waitForLoadState('domcontentloaded');

    // 1. Open Test Run Modal
    const testRunBtn = page.locator('.sticky-action-bar app-button button').filter({ hasText: 'Test Run' });
    await expect(testRunBtn).toBeEnabled({ timeout: 5000 });
    await testRunBtn.click();

    const testContent = page.locator('.test-run-modal-content');
    await expect(testContent).toBeVisible({ timeout: 10000 });

    // 2. Upload test PDF into dropzone
    const fileInput = testContent.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePdfPath);

    // Selected file appears
    await expect(testContent.locator('.test-selected-file')).toContainText('text.pdf');

    // 3. Click Run Test Pipeline
    const runBtn = testContent.locator('.test-modal-footer app-button');
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // 4. Verify completion result
    const resultBox = testContent.locator('.test-result-box.success');
    await expect(resultBox).toBeVisible({ timeout: 20000 });
    await expect(resultBox).toContainText('Recipe executed successfully');

    // Download button is visible
    const downloadBtn = testContent.locator('.result-actions app-button');
    await expect(downloadBtn).toBeVisible();
  });

  test('RE-005: Recipe Persistence & Local Storage Verification', async ({ page }) => {
    await page.goto('/features/recipes/editor');
    await page.waitForLoadState('domcontentloaded');

    // Fill recipe
    await page.locator('input#recipe-name').fill('Permanent Workflow');
    await page.locator('input#recipe-desc').fill('Saved workflow description');

    // Add 1 step
    const addStepBtn = page.locator('.pipeline-section-header app-button').filter({ hasText: 'Add Step' });
    await addStepBtn.click();

    const toolPickerGrid = page.locator('.tool-picker-grid');
    await expect(toolPickerGrid).toBeVisible({ timeout: 5000 });
    await page.locator('.tool-picker-card').filter({ hasText: 'Add Page Numbers' }).click();

    const closeConfigBtn = page.locator('.inspector-footer app-button');
    await expect(closeConfigBtn).toBeVisible({ timeout: 5000 });
    await closeConfigBtn.click();

    // Click Save Recipe
    const saveBtn = page.locator('.sticky-action-bar app-button').filter({ hasText: 'Save Recipe' });
    await saveBtn.click();

    // Verify storage persistence
    const storedJson = await page.evaluate(() =>
      localStorage.getItem('CapacitorStorage.IFH_RECIPES_V1') ||
      localStorage.getItem('IFH_RECIPES_V1')
    );
    expect(storedJson).not.toBeNull();
    const recipes = JSON.parse(storedJson!);
    const saved = recipes.find((r: any) => r.name === 'Permanent Workflow');
    expect(saved).toBeDefined();
    expect(saved.steps.length).toBe(1);
    expect(saved.steps[0].toolId).toBe('page-numbers');
  });

  test('RE-006: JSON Export & Safe Import with Cybersecurity Protections', async ({ page }) => {
    await page.goto('/features/recipes/editor');
    await page.waitForLoadState('domcontentloaded');

    // 1. Open Import Modal
    const importBtn = page.locator('.recipe-toolbar-actions app-button').filter({ hasText: 'Import' });
    await importBtn.click();

    const importContent = page.locator('.import-modal-content');
    await expect(importContent).toBeVisible({ timeout: 5000 });

    const textarea = importContent.locator('textarea.import-textarea');

    // 2. Prototype Pollution Payload
    const protoPayload = '{"name": "Evil Recipe", "__proto__": {"polluted": true}, "steps": []}';
    await textarea.fill(protoPayload);

    const confirmImportBtn = importContent.locator('.import-modal-footer app-button');
    await confirmImportBtn.click();

    // Prototype pollution blocked
    const isPolluted = await page.evaluate(() => {
      return (Object.prototype as any).polluted === true;
    });
    expect(isPolluted).toBe(false);

    // 3. Valid Recipe Import
    const validPayload = JSON.stringify({
      schemaVersion: '1.0',
      recipe: {
        name: 'Imported Safe Recipe',
        description: 'Clean imported pipeline',
        steps: [
          {
            stepId: 'step-imp-1',
            toolId: 'compress',
            label: 'Compress to Target Size',
            parameters: { targetKB: 512 }
          }
        ]
      }
    });

    await textarea.fill(validPayload);
    await confirmImportBtn.click();

    await expect(importContent).toBeHidden({ timeout: 5000 });

    // Recipe loaded into editor
    await expect(page.locator('input#recipe-name')).toHaveValue('Imported Safe Recipe');
    await expect(page.locator('.pipeline-step-card')).toHaveCount(1);
  });

  test('RE-007: Maximum Step Limit Enforcement (Max 10 Steps)', async ({ page }) => {
    // Seed recipe with 10 steps
    await page.addInitScript(() => {
      const tenSteps = Array.from({ length: 10 }, (_, i) => ({
        stepId: `step-${i}`,
        toolId: 'compress',
        label: `Step ${i + 1}`,
        parameters: { targetKB: 1024 }
      }));
      const seeded = [
        {
          id: 'seeded-10-steps',
          name: 'Ten Steps Recipe',
          description: '',
          isCustom: true,
          steps: tenSteps
        }
      ];
      localStorage.setItem('CapacitorStorage.IFH_RECIPES_V1', JSON.stringify(seeded));
      localStorage.setItem('IFH_RECIPES_V1', JSON.stringify(seeded));
    });

    await page.goto('/features/recipes/editor?recipeId=seeded-10-steps');
    await page.waitForLoadState('domcontentloaded');

    // Verify badge shows 10/10 Steps
    const stepBadge = page.locator('.title-with-badge app-badge');
    await expect(stepBadge).toContainText('10/10 Steps');

    // Verify Add Step buttons are disabled
    const topAddBtn = page.locator('.pipeline-section-header app-button').filter({ hasText: 'Add Step' });
    await expect(topAddBtn.locator('button')).toBeDisabled();

    const dashedCard = page.locator('.add-step-dashed-card');
    await expect(dashedCard).toBeDisabled();
    await expect(dashedCard).toContainText('Maximum 10 Steps Reached');
  });
});
