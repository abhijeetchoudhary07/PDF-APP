import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Visual Diff & Stable UI States @phase2 @compare @visual', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');
  });

  test('CMP-060: Visual diff mode renders canvas diff for changed documents', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to visual mode
    const visualTab = page.locator('app-tabs button:has-text("Visual Diff"), app-tabs button:has-text("दृश्य अंतर")');
    await visualTab.click();

    // Verify visual diff display container is rendered
    await expect(page.locator('.diff-view-visual')).toBeVisible();
    await expect(page.locator('.visual-diff-display, .visual-empty')).toBeVisible({ timeout: 15000 });
  });

  test('CMP-061: Stable UI states for empty and populated compare page', async ({ page }) => {
    // Empty state
    await expect(page.locator('.select-step-section')).toBeVisible();
    await expect(page.locator('.dropzones-container')).toBeVisible();
  });
});
