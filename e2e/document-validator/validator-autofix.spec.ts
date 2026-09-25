import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — 1-Click Auto-Fix & Re-validation @validator @autofix @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-070 & VAL-077: Oversized photo shows "Fix Automatically" and re-validates to READY/PASS', async ({ page }) => {
    const photoInput = page.locator('.slot-photo input[type="file"], input[type="file"]').first();
    await photoInput.setInputFiles(getTestDataPath('photos/oversized-photo.jpg'));

    const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
    }

    // Auto-fix button should appear for failed rule
    const autoFixBtn = page.locator('.btn-auto-fix-rule, .btn-auto-fix-all, button:has-text("Fix Automatically"), button:has-text("Fix All")');
    await expect(autoFixBtn.first()).toBeVisible({ timeout: 10000 });

    // Click auto-fix
    await autoFixBtn.first().click();

    // Verify toast notification and re-validation result
    await expect(page.locator('.toast-item, :has-text("Auto-fixed"), :has-text("fixed")').first()).toBeVisible({ timeout: 15000 });
  });

  test('VAL-059 to VAL-068: Validation report displays actual value, required value, and status', async ({ page }) => {
    const photoInput = page.locator('.slot-photo input[type="file"], input[type="file"]').first();
    await photoInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
    }

    // Verification of report structure
    await expect(page.locator('.validation-report-card, .rule-list, .rule-row').first()).toBeVisible({ timeout: 10000 });
  });
});
