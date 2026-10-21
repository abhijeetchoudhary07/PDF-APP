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

    /*
     * text-added, not text-changed. The pair below has to hold "several known
     * differences" for the stepper assertions to mean anything, and
     * text-changed holds exactly one: 1000 -> 5000. That read as two steps
     * only while the navigator counted the removed and added halves of a
     * single word edit separately -- the same double count that put "Total
     * Changes: 2" next to "+0 added, -0 removed, ~1 changed" on screen. With
     * the pair grouped into one 'changed' step the counts agree, and this
     * fixture supplies the eight genuine changes the test wants.
     */
    const origPath = getPhase2FixturePath('text-added-original.pdf');
    const modPath = getPhase2FixturePath('text-added-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });
  });

  /*
   * Both of these were wrapped in a one-shot visibility check -- of the stepper
   * in one, of the token pill in the other -- with every assertion inside it.
   * The `beforeEach` above runs a comparison and waits for `.result-section`,
   * so by the time these run the stepper is either there or the feature is
   * broken; skipping quietly was never the right answer to that question.
   *
   * The inner `if (await nextBtn.isEnabled())` was the same thing one level
   * down. The fixtures are a pair of PDFs with several known differences, so
   * "next" being disabled means the diff found one change or none, and that is
   * a failure rather than a reason to stop looking.
   */
  test('CMP-040: Stepper controls navigate through detected changes', async ({ page }) => {
    const stepper = page.locator('.change-stepper');
    await expect(stepper).toBeVisible();

    const prevBtn = stepper.locator('button').first();
    const nextBtn = stepper.locator('button').last();

    // The stepper opens on the first change, so there is nothing before it.
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    await nextBtn.click();
    await expect(prevBtn).toBeEnabled();
    await expect(page.locator('.current-change-tag')).toContainText('2');

    await prevBtn.click();
    await expect(prevBtn).toBeDisabled();
  });

  test('CMP-041: Active change token pill highlights matching token', async ({ page }) => {
    await expect(page.locator('.token-pill')).toBeVisible();
    await expect(page.locator('.active-change').first()).toBeVisible();
  });
});
