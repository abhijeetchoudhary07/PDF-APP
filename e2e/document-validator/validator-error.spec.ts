import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — Error Handling & Edge Cases @validator @error', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-017: Upload unsupported file type to slot', async ({ page }) => {
    const input = page.locator('[data-testid="slot-photo"] input[type="file"]');
    await input.setInputFiles(getTestDataPath('pdf/unsupported.txt'));

    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible({ timeout: 10000 });
  });

  /*
   * This was `if (await validateBtn.isVisible() && await validateBtn.isEnabled())`
   * wrapped around the whole body, its single assertion included. There is no
   * Validate button on this page, so the condition was never true and the test
   * asserted nothing whatsoever -- it could not have failed for any reason.
   *
   * It also asked for behaviour this page does not have: nothing prompts you
   * about missing files, because there is no moment at which you declare
   * yourself finished. What an empty package actually looks like is each
   * required slot offering a dropzone, no rules and no verdict, and that is
   * what is asserted now.
   */
  test('VAL-021: an empty package reports nothing and waits for files', async ({ page }) => {
    await expect(page.locator('[data-testid="slot-photo"] app-file-dropzone')).toBeVisible();
    await expect(page.locator('.rule-row')).toHaveCount(0);
    await expect(page.locator('.overall-status-banner')).toHaveCount(0);
  });
});
