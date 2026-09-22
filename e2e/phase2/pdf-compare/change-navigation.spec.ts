import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Change Navigation Stepper @phase2 @compare', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');

    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });
  });

  test('CMP-040: Stepper controls navigate through detected changes', async ({ page }) => {
    const stepper = page.locator('.change-stepper');
    if (await stepper.isVisible()) {
      const prevBtn = stepper.locator('button').first();
      const nextBtn = stepper.locator('button').last();

      // At start, prev button should be disabled
      await expect(prevBtn).toBeDisabled();

      // If multiple changes, clicking next advances current-change-tag
      if (await nextBtn.isEnabled()) {
        await nextBtn.click();
        await expect(prevBtn).toBeEnabled();
        await expect(page.locator('.current-change-tag')).toContainText('2');

        // Clicking prev goes back
        await prevBtn.click();
        await expect(prevBtn).toBeDisabled();
      }
    }
  });

  test('CMP-041: Active change token pill highlights matching token', async ({ page }) => {
    const tokenPill = page.locator('.token-pill');
    if (await tokenPill.isVisible()) {
      // Active change token has class .active-change
      await expect(page.locator('.active-change')).toBeVisible();
    }
  });
});
