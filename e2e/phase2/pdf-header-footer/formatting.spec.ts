import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Typography, Colors & Margins @phase2 @header-footer', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-header-footer');
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    // Switch to settings/typography tab
    const settingsTab = page.locator('.controls-panel app-tabs button').filter({ hasText: /settings|typography|टाइपोग्राफी/i });
    await settingsTab.click();
  });

  test('HF-020: Change font family, font size, and color swatches', async ({ page }) => {
    // Select font family
    const fontSelect = page.locator('select.form-select').first();
    await fontSelect.selectOption('Times-Roman');
    await expect(fontSelect).toHaveValue('Times-Roman');

    // Change font size
    const sizeRange = page.locator('input.form-range');
    await sizeRange.fill('16');

    // Click color swatch
    const swatches = page.locator('.color-swatches .swatch');
    if (await swatches.count() > 1) {
      await swatches.nth(1).click();
      await expect(swatches.nth(1)).toHaveClass(/active/);
    }
  });

  test('HF-021: Adjust top, bottom, left, and right margins', async ({ page }) => {
    const marginInputs = page.locator('.margins-grid input.form-input');
    await expect(marginInputs).toHaveCount(4);

    // Set top margin
    await marginInputs.nth(0).fill('45');
    await expect(marginInputs.nth(0)).toHaveValue('45');

    // Set bottom margin
    await marginInputs.nth(1).fill('45');
    await expect(marginInputs.nth(1)).toHaveValue('45');
  });
});
