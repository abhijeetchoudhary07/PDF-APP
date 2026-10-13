import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

/*
 * Every test in this folder used to wrap its work in
 *
 *     const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate"))');
 *     if (await validateBtn.isVisible()) { await validateBtn.click(); }
 *
 * There is no Validate button on this page and there never was: neither the
 * class nor the text exists in the template. `onSlotFileSelected` validates the
 * moment a file lands in a slot. So the condition was always false, the click
 * never happened, and the tests were passing for a reason unrelated to what
 * they claimed to be checking.
 *
 * The selectors were wishful in the same way -- `.slot-photo` and
 * `.slot-signature` were never in the markup, so the comma fallback quietly
 * took `input[type="file"]` at whatever index happened to be there. The slots
 * carry `data-testid` now, so a spec that aims at the signature slot gets the
 * signature slot or fails.
 */

test.describe('Document Validator — Photo Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-023: a valid photo is validated on selection', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-photo"]');
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    // No click in between: selecting the file is what runs the validation.
    await expect(slot.locator('.rule-row').first()).toBeVisible({ timeout: 10000 });
    await expect(slot.locator('.rule-row.passed').first()).toBeVisible();
    await expect(page.locator('.overall-status-banner')).toBeVisible();
  });

  test('VAL-027: an oversized photo fails its file-size rule', async ({ page }) => {
    const slot = page.locator('[data-testid="slot-photo"]');
    await slot.locator('input[type="file"]').setInputFiles(getTestDataPath('photos/oversized-photo.jpg'));

    const failed = slot.locator('.rule-row.failed');
    await expect(failed.first()).toBeVisible({ timeout: 10000 });
    await expect(failed.first().locator('.rule-values')).toContainText('KB');
  });
});
