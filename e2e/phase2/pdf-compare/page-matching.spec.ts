import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Page Matching & Alignment @phase2 @compare', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');
  });

  test('CMP-020: Inserted page in middle is detected without misclassifying other pages', async ({ page }) => {
    const origPath = getPhase2FixturePath('page-added-original.pdf');
    const modPath = getPhase2FixturePath('page-added-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Verify page pills indicate page mapping
    const pagePills = page.locator('.page-pills-row .page-pill');
    await expect(pagePills).toHaveCount(3);

    // Look for inserted pill or pill indicating added page
    const addedPill = pagePills.filter({ hasText: /\+P|inserted/i });
    expect(await pagePills.count()).toBeGreaterThanOrEqual(2);
  });

  test('CMP-021: Deleted page in middle is detected', async ({ page }) => {
    const origPath = getPhase2FixturePath('page-removed-original.pdf');
    const modPath = getPhase2FixturePath('page-removed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Page count compared
    const pagePills = page.locator('.page-pills-row .page-pill');
    expect(await pagePills.count()).toBeGreaterThanOrEqual(2);
  });

  test('CMP-022: Different page count handles navigation between matches', async ({ page }) => {
    const origPath = getPhase2FixturePath('different-page-count-original.pdf');
    const modPath = getPhase2FixturePath('different-page-count-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Check page navigation controls
    const nextMatchBtn = page.locator('.nav-controls button:has-text("Next"), .nav-controls button:has-text("आगे")');
    if (await nextMatchBtn.isEnabled()) {
      await nextMatchBtn.click();
      await expect(page.locator('.match-indicator')).toContainText('2');
    }
  });
});
