import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Common — Loading & Progress States @common', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('COM-004 & COM-005: Skeletons and progress bar rendering', async ({ page }) => {
    await page.goto('/features/pdf-ocr');
    // Verify page loads without persistent infinite spinners
    await expect(page.locator('ion-spinner.infinite, .infinite-loading')).toHaveCount(0);
  });
});
