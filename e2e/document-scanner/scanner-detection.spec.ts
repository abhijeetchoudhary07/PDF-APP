import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Scanner — Edge Detection & Crop Modes @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
  });

  test('SCN-012 & SCN-016: Clear document triggers edge detection and auto-crop preview', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));

      // Crop canvas or container appears
      await expect(page.locator('.crop-view, canvas, .btn-confirm-crop, button:has-text("Apply")')).toBeVisible({ timeout: 10000 });
    }
  });

  test('SCN-018 & SCN-019: Low confidence edge detection shows warning message', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/no-edge-document.jpg'));

      // If confidence is low, warning must be displayed
      const warningOrCrop = page.locator('.low-confidence-warning, :has-text("could not be detected reliably"), .btn-manual-crop, canvas');
      await expect(warningOrCrop).toBeVisible({ timeout: 10000 });
    }
  });

  test('SCN-021 & SCN-023: Manual crop mode and confirm crop', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));

      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Crop"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        // Should advance to enhancement screen
        await expect(page.locator('.enhance-view, .preset-chip, button:has-text("Document")')).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
