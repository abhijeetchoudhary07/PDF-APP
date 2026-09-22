import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — Error Handling & Edge Cases @validator @error', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-017: Upload unsupported file type to slot', async ({ page }) => {
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(getTestDataPath('pdf/unsupported.txt'));

    await expect(page.locator('.toast-item, [role="alert"], .error-message')).toBeVisible({ timeout: 10000 });
  });

  test('VAL-021: Prompt for missing required files when validating empty package', async ({ page }) => {
    const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
    if (await validateBtn.isVisible() && await validateBtn.isEnabled()) {
      await validateBtn.click();
      // Should show prompt or error about missing files
      await expect(page.locator('.toast-item, [role="alert"], :has-text("upload"), :has-text("select")')).toBeVisible();
    }
  });
});
