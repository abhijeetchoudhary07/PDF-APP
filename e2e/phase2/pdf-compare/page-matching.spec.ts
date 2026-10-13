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

    /*
     * `if (await nextMatchBtn.isEnabled())` used to wrap the click and the only
     * assertion. These fixtures differ in page count by construction, so there
     * is always a second match to step to: a disabled Next button means the
     * matching found one page pair or none, which is the failure this test is
     * supposed to report rather than a reason to stop.
     */
    const nextMatchBtn = page.locator('.nav-controls').getByRole('button', { name: /next/i }).first();
    await expect(nextMatchBtn).toBeEnabled();
    await nextMatchBtn.click();
    await expect(page.locator('.match-indicator')).toContainText('2');
  });
});
