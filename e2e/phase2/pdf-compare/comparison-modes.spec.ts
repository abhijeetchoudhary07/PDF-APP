import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Comparison Modes @phase2 @compare', () => {
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

  test('CMP-030: Side-by-side mode displays two synchronized columns', async ({ page }) => {
    await expect(page.locator('.diff-view-side-by-side')).toBeVisible();
    await expect(page.locator('.diff-column.left-col')).toBeVisible();
    await expect(page.locator('.diff-column.right-col')).toBeVisible();
  });

  test('CMP-031: Page-by-page mode displays unified diff box', async ({ page }) => {
    // Switch to page-by-page tab
    const pbpTab = page.locator('app-tabs button:has-text("Page-by-Page"), app-tabs button:has-text("पृष्ठ-दर-पृष्ठ")');
    await pbpTab.click();

    await expect(page.locator('.diff-view-page-by-page')).toBeVisible();
    await expect(page.locator('.unified-diff-box')).toBeVisible();
  });

  test('CMP-032: Text-only mode displays legend and diff flow', async ({ page }) => {
    // Switch to text diff tab
    const textTab = page.locator('app-tabs button:has-text("Text Diff"), app-tabs button:has-text("पाठ अंतर")');
    await textTab.click();

    await expect(page.locator('.diff-view-text-only')).toBeVisible();
    await expect(page.locator('.text-diff-legend')).toBeVisible();
    await expect(page.locator('.text-only-flow')).toBeVisible();
  });

  test('CMP-033: Visual diff mode triggers canvas diff rendering', async ({ page }) => {
    // Switch to visual diff tab
    const visualTab = page.locator('app-tabs button:has-text("Visual Diff"), app-tabs button:has-text("दृश्य अंतर")');
    await visualTab.click();

    await expect(page.locator('.diff-view-visual')).toBeVisible();
    // Either visual loading or visual-diff-img / hint is visible
    await expect(page.locator('.visual-diff-display, .visual-empty, .visual-loading')).toBeVisible();
  });

  test('CMP-034: Switching between modes preserves comparison results', async ({ page }) => {
    // Check initial summary metric
    const pagesComparedBefore = await page.locator('.metric-card').first().innerText();

    // Switch through all tabs
    const tabs = page.locator('app-tabs button');
    const tabCount = await tabs.count();
    for (let i = 0; i < tabCount; i++) {
      await tabs.nth(i).click();
      await expect(page.locator('.result-section')).toBeVisible();
    }

    // Verify summary metrics didn't reset
    const pagesComparedAfter = await page.locator('.metric-card').first().innerText();
    expect(pagesComparedAfter).toBe(pagesComparedBefore);
  });
});
