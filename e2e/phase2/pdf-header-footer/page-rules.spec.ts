import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Page Rules & Targeting @phase2 @header-footer', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-header-footer');
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    // Switch to rules tab
    const rulesTab = page.locator('.controls-panel app-tabs button').filter({ hasText: /rules|targeting|नियम/i });
    await rulesTab.click();
  });

  test('HF-030: First page skip and different first page options', async ({ page }) => {
    const radioSkip = page.locator('input[type="radio"][value="skip"]');
    await radioSkip.check();
    await expect(radioSkip).toBeChecked();

    const radioDiff = page.locator('input[type="radio"][value="different"]');
    await radioDiff.check();
    await expect(radioDiff).toBeChecked();

    // Custom first page inputs appear
    await expect(page.locator('.different-first-page-box')).toBeVisible();
  });

  test('HF-031: Custom page targeting mode reveals custom range input', async ({ page }) => {
    const targetSelect = page.locator('select.form-select').filter({ hasText: /all|odd|even|सभी/i });
    await targetSelect.selectOption('custom');

    // Custom range input appears
    const rangeInput = page.locator('input[placeholder*="2-5"], input[placeholder*="8"]');
    await expect(rangeInput).toBeVisible();
    await rangeInput.fill('1-3, 5');
    await expect(rangeInput).toHaveValue('1-3, 5');
  });
});
