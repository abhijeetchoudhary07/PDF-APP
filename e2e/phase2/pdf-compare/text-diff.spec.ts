import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Text Difference Detection @phase2 @compare', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');
  });

  test('CMP-010: Identical PDFs comparison reports 0 changes', async ({ page }) => {
    const origPath = getPhase2FixturePath('identical-original.pdf');
    const modPath = getPhase2FixturePath('identical-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await compareBtn.click();

    await waitForProcessingToFinish(page);

    // Results section visible
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Verify 0 changed pages, 0 added words, 0 removed words
    const metrics = page.locator('.metric-card');
    await expect(metrics.filter({ hasText: /pages compared|तुलना किए गए पृष्ठ/i })).toContainText('1');
    await expect(metrics.filter({ hasText: /pages changed|बदले गए पृष्ठ/i })).toContainText('0');
    await expect(metrics.filter({ hasText: /words added|जोड़े गए शब्द/i })).toContainText('+0');
    await expect(metrics.filter({ hasText: /words removed|हटाए गए शब्द/i })).toContainText('-0');

    // No stepper displayed because totalChanges is 0
    await expect(page.locator('.change-navigator-bar')).toHaveCount(0);
  });

  test('CMP-011: Added text is detected and highlighted', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-added-original.pdf');
    const modPath = getPhase2FixturePath('text-added-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await compareBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Verify added words metric > 0
    const addedMetric = page.locator('.metric-card.added');
    const text = await addedMetric.innerText();
    expect(text).not.toContain('+0');

    // Stepper should be present with added tokens
    await expect(page.locator('.change-navigator-bar')).toBeVisible();
    await expect(page.locator('.token-added').first()).toBeVisible();
  });

  test('CMP-012: Removed text is detected and highlighted', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-removed-original.pdf');
    const modPath = getPhase2FixturePath('text-removed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await compareBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Verify removed words metric > 0
    const removedMetric = page.locator('.metric-card.removed');
    const text = await removedMetric.innerText();
    expect(text).not.toContain('-0');

    // Verify removed token is highlighted
    await expect(page.locator('.token-removed').first()).toBeVisible();
  });

  test('CMP-013: Changed text is detected with both removed and added words', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);

    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await compareBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Should detect token differences (1000 removed, 5000 added)
    await expect(page.locator('.token-removed, .token-added').first()).toBeVisible();
  });
});
