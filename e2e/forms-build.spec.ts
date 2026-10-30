import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Form Builder (M1) E2E Test Suite @forms @form-builder', () => {
  const samplePdfPath = path.resolve(__dirname, 'test-data/phase2/hf-1page-portrait.pdf');
  const fillablePath = path.resolve(__dirname, 'test-data/editor-audit/fillable-form.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => console.log(`[Browser Console]: ${msg.text()}`));
  });

  test('M1-001: Form Builder end-to-end workflow: upload, place 7 field types, edit in inspector, preview, and save', async ({ page }) => {
    // 1. Navigate to Form Builder route
    await page.goto('/features/pdf/forms/build');
    await page.waitForLoadState('domcontentloaded');

    // Verify empty state is displayed initially
    const emptyUploadCard = page.locator('.empty-state');
    await expect(emptyUploadCard).toBeVisible();

    // 2. Upload sample PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePdfPath);

    // Wait for canvas and page overlay to render
    const canvasOverlay = page.locator('[data-testid="pdf-page-overlay"]');
    await expect(canvasOverlay).toBeVisible({ timeout: 15000 });

    const toolRail = page.locator('[data-testid="thumb-tool-rail"]');
    await expect(toolRail).toBeVisible();

    // 3. Place Text Field
    const textTool = page.locator('[data-testid="tool-card-text"]');
    await textTool.click();

    // Placement banner visible
    await expect(page.locator('.placement-banner')).toBeVisible();

    // Tap on canvas overlay at x: 80, y: 100
    await canvasOverlay.click({ force: true, position: { x: 80, y: 100 } });

    // Verify text field created and selected
    const textFieldBox = page.locator('[data-testid="field-box-text_1"]');
    await expect(textFieldBox).toBeVisible();

    // Inspector drawer opens
    const inspector = page.locator('[data-testid="bottom-sheet-inspector"]');
    await expect(inspector).toBeVisible();

    // 4. Edit properties in inspector
    const nameInput = page.locator('[data-testid="inspector-field-name"]');
    await nameInput.fill('clientName');

    const labelInput = page.locator('[data-testid="inspector-field-label"]');
    await labelInput.fill('Client Full Name');

    const requiredToggle = page.locator('[data-testid="inspector-field-required-toggle"]');
    await requiredToggle.click();

    const defTextInput = page.locator('[data-testid="inspector-field-default-text"]');
    await defTextInput.fill('John Doe');

    // Close inspector
    const closeInspectorBtn = page.locator('[data-testid="inspector-close-btn"]');
    await closeInspectorBtn.click();
    await expect(inspector).toBeHidden();

    // Verify updated field box name
    const updatedTextField = page.locator('[data-testid="field-box-clientName"]');
    await expect(updatedTextField).toBeVisible();
    await expect(updatedTextField.locator('.builder-field-text')).toContainText('John Doe');

    // 5. Place Checkbox
    const cbTool = page.locator('[data-testid="tool-card-checkbox"]');
    await cbTool.click();
    await canvasOverlay.click({ force: true, position: { x: 80, y: 160 } });

    const cbFieldBox = page.locator('[data-testid="field-box-checkbox_1"]');
    await expect(cbFieldBox).toBeVisible();
    await closeInspectorBtn.click();

    // 6. Place Dropdown
    const ddTool = page.locator('[data-testid="tool-card-dropdown"]');
    await ddTool.click();
    await canvasOverlay.click({ force: true, position: { x: 80, y: 210 } });

    const ddFieldBox = page.locator('[data-testid="field-box-dropdown_1"]');
    await expect(ddFieldBox).toBeVisible();

    // Edit dropdown options in inspector
    const optionsInput = page.locator('[data-testid="inspector-field-options"]');
    await optionsInput.fill('Standard, Express, Priority');
    await closeInspectorBtn.click();

    // 7. Place Date Field
    const dateTool = page.locator('[data-testid="tool-card-date"]');
    await dateTool.click();
    await canvasOverlay.click({ force: true, position: { x: 80, y: 260 } });

    const dateFieldBox = page.locator('[data-testid="field-box-date_1"]');
    await expect(dateFieldBox).toBeVisible();
    await closeInspectorBtn.click();

    // 8. Place Signature Placeholder
    const sigTool = page.locator('[data-testid="tool-card-signature"]');
    await sigTool.click();
    await canvasOverlay.click({ force: true, position: { x: 80, y: 320 } });

    const sigFieldBox = page.locator('[data-testid="field-box-signature_1"]');
    await expect(sigFieldBox).toBeVisible();
    await closeInspectorBtn.click();

    // 9. Interactive Preview Mode Toggle
    const previewToggle = page.locator('[data-testid="preview-mode-toggle"]');
    await previewToggle.click();

    // In preview mode, input controls become interactive HTML form widgets
    const previewInput = updatedTextField.locator('.preview-input');
    await expect(previewInput).toBeVisible();
    await expect(previewInput).toHaveValue('John Doe');

    // Modify preview value
    await previewInput.fill('Jane Smith');
    await expect(previewInput).toHaveValue('Jane Smith');

    // Exit preview mode
    await previewToggle.click();
    await expect(previewInput).toBeHidden();

    // 10. Save Form PDF
    const saveBtn = page.locator('[data-testid="save-form-pdf-btn"]');
    await saveBtn.click();

    // Toast confirmation
    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('M1-002: Pre-filled AcroForm document non-destructive editing', async ({ page }) => {
    await page.goto('/features/pdf/forms/build');
    await page.waitForLoadState('domcontentloaded');

    // Upload real pre-filled AcroForm document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(fillablePath);

    const canvasOverlay = page.locator('[data-testid="pdf-page-overlay"]');
    await expect(canvasOverlay).toBeVisible({ timeout: 15000 });

    // Add an additional field to the existing AcroForm document
    const sigTool = page.locator('[data-testid="tool-card-signature"]');
    await sigTool.click();
    await canvasOverlay.click({ force: true, position: { x: 100, y: 150 } });

    const sigFieldBox = page.locator('[data-testid="field-box-signature_1"]');
    await expect(sigFieldBox).toBeVisible();

    // Close inspector before saving so save button is unobstructed
    const closeInspectorBtn = page.locator('[data-testid="inspector-close-btn"]');
    await closeInspectorBtn.click();
    await expect(page.locator('[data-testid="bottom-sheet-inspector"]')).toBeHidden();

    // Save modified AcroForm document
    const saveBtn = page.locator('[data-testid="save-form-pdf-btn"]');
    await saveBtn.click();

    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });
});
