import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

/*
 * Both of these opened with `if (await input.count() > 0)` around the entire
 * body -- including the assertion -- where `input` was
 * `page.locator('input[type="file"]').nth(1)`, an index into whichever file
 * inputs the preset happened to render. When that index was empty the test
 * passed having done nothing. It now addresses the signature slot by id, so
 * there is no index to be wrong about and nothing to skip.
 */

test.describe('Document Validator — Signature Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-040: a valid signature is validated on selection', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-signature"]');
    await expect(slot).toBeVisible();
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('signatures/valid-signature.jpg'));

    await expect(slot.locator('.rule-row').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.overall-status-banner')).toBeVisible();
  });

  test('VAL-042: a wrongly sized signature fails a rule', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-signature"]');
    await expect(slot).toBeVisible();
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('signatures/invalid-size.jpg'));

    await expect(slot.locator('.rule-row.failed').first()).toBeVisible({ timeout: 10000 });
  });
});
