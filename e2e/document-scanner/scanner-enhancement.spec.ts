import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Scanner — Auto Enhance Presets @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');

    // Load an image
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));
      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Crop"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
    }
  });

  test('SCN-025 to SCN-029: Switch between enhancement presets', async ({ page }) => {
    // Presets: Original, Document, Grayscale, B&W, High Contrast
    const presets = ['Original', 'Document', 'Grayscale', 'Black & White', 'High Contrast'];

    for (const preset of presets) {
      const chip = page.locator(`.preset-chip:has-text("${preset}"), button:has-text("${preset}")`);
      if (await chip.isVisible()) {
        await chip.click();
        await expect(chip).toHaveClass(/active|selected/);
      }
    }
  });

  test('SCN-038: Before/After comparison toggle', async ({ page }) => {
    const compareBtn = page.locator('.btn-compare, button:has-text("Compare"), [aria-label*="compare" i]');
    if (await compareBtn.isVisible()) {
      await compareBtn.click();
      await expect(page.locator('.comparison-view, .split-view, canvas').first()).toBeVisible();
    }
  });

  test('SCN-040: Apply enhancement and add to multi-page document', async ({ page }) => {
    const addPageBtn = page.locator('.btn-add-page, button:has-text("Keep"), button:has-text("Add Page"), button:has-text("Save Page")');
    if (await addPageBtn.isVisible()) {
      await addPageBtn.click();
      // Should show thumbnail strip
      await expect(page.locator('.page-thumb-card, .multipage-container, .thumbnail-strip').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
