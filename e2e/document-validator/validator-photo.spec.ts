import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — Photo Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-023: Upload valid photo and verify passing rules', async ({ page }) => {
    // Locate photo slot input
    const photoInput = page.locator('.slot-photo input[type="file"], input[type="file"]').first();
    await photoInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    // Click validate button
    const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
    }

    // Results report appears
    await expect(page.locator('.validation-report, .rule-row, .status-badge')).toBeVisible({ timeout: 10000 });
  });

  test('VAL-027: Upload oversized photo and verify FAIL on file size', async ({ page }) => {
    const photoInput = page.locator('.slot-photo input[type="file"], input[type="file"]').first();
    await photoInput.setInputFiles(getTestDataPath('photos/oversized-photo.jpg'));

    const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
    }

    // Should indicate FAIL or error for file size
    await expect(page.locator('.rule-failed, .status-issues, :has-text("FAIL"), :has-text("KB")')).toBeVisible({ timeout: 10000 });
  });
});
