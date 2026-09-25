import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Common — Error Handling & Recovery @error', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('COM-007 & COM-014: Navigate to non-existent route or feature error recovery', async ({ page }) => {
    await page.goto('/features/pdf-ocr');
    await expect(page).toHaveURL(/.*features\/pdf-ocr/);

    // Reopen another feature and verify clean state
    await page.goto('/features/document-scanner');
    await expect(page).toHaveURL(/.*features\/document-scanner/);
    await expect(page.locator('.btn-camera, .btn-gallery, button:has-text("Camera")').first()).toBeVisible();
  });
});
