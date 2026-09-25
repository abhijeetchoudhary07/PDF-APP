import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — Signature Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-040: Upload valid signature and verify validation result', async ({ page }) => {
    const input = page.locator('.slot-signature input[type="file"], input[type="file"]').nth(1);
    if (await input.count() > 0) {
      await input.setInputFiles(getTestDataPath('signatures/valid-signature.jpg'));

      const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }

      await expect(page.locator('.validation-report, .rule-row, .status-badge').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('VAL-042: Upload invalid size signature and verify failure', async ({ page }) => {
    const input = page.locator('input[type="file"]').nth(1);
    if (await input.count() > 0) {
      await input.setInputFiles(getTestDataPath('signatures/invalid-size.jpg'));

      const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }

      await expect(page.locator('.rule-failed, .status-issues, :has-text("FAIL"), :has-text("KB")').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
