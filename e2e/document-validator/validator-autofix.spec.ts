import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — 1-Click Auto-Fix & Re-validation @validator @autofix @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-070 & VAL-077: Oversized photo offers an auto-fix and re-validates', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-photo"]');
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('photos/oversized-photo.jpg'));

    /*
     * By id rather than by `button:has-text("Fix Automatically")`: that label
     * comes from `validator.fixAuto`, which is translated into five languages,
     * so a text selector here passes only in an English run.
     */
    const fix = page.locator('app-button[data-testid="fix-rule-photo"] button').first();
    await expect(fix).toBeVisible({ timeout: 10000 });
    await fix.click();

    await expect(page.locator('.toast-item').first()).toBeVisible({ timeout: 15000 });
    await expect(slot.locator('.rule-row').first()).toBeVisible();
  });

  test('VAL-059 to VAL-068: the report gives actual and required values per rule', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-photo"]');
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    const firstRule = slot.locator('.rule-row').first();
    await expect(firstRule).toBeVisible({ timeout: 10000 });
    await expect(firstRule.locator('.rule-name')).not.toBeEmpty();
    await expect(firstRule.locator('.rule-values .actual')).toBeVisible();
    await expect(firstRule.locator('.rule-values .expected')).toBeVisible();
  });
});
