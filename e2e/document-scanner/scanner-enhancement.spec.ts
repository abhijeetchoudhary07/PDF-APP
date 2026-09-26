import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { importScannedPage, pageAction, pageCards } from './scanner-helpers';

/*
 * The enhancement editor is reached from the pages dashboard, not straight
 * after cropping. These tests used to try to load an image through an
 * `input[type="file"]` the scanner does not have, then look for `.preset-chip`
 * and a `Compare` button that do not exist either -- every assertion sat behind
 * an `if` that was never true. See `scanner-helpers.ts`.
 */
test.describe('Document Scanner — Auto Enhance Presets @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');

    await importScannedPage(page);
    await pageAction(page, 0, 'Enhance Filter').click();
    await expect(page.locator('.enhance-card')).toBeVisible({ timeout: 15000 });
  });

  test('SCN-025 to SCN-029: Switch between enhancement presets', async ({ page }) => {
    const presets = page.locator('.preset-btn');
    await expect(presets).toHaveCount(5);

    // Exactly one preset is selected at a time, and choosing another moves it.
    await expect(page.locator('.preset-btn.active')).toHaveCount(1);

    for (let i = 0; i < 5; i++) {
      await presets.nth(i).click();
      await expect(presets.nth(i)).toHaveClass(/active/);
      await expect(page.locator('.preset-btn.active')).toHaveCount(1);
    }
  });

  test('SCN-038: Before/After comparison toggle', async ({ page }) => {
    const preview = page.locator('.enhance-preview-img');
    const compare = page.locator('.compare-pill-btn');

    const processed = await preview.getAttribute('src');

    // The control is press-and-hold: it shows the original while held.
    await compare.dispatchEvent('mousedown');
    await expect(preview).not.toHaveAttribute('src', processed!);

    await compare.dispatchEvent('mouseup');
    await expect(preview).toHaveAttribute('src', processed!);
  });

  test('SCN-040: Apply enhancement and add to multi-page document', async ({ page }) => {
    await page.locator('.preset-btn').nth(2).click();
    await page.locator('app-button[data-testid="done-enhancing"] button').click();

    // Back on the dashboard with the page kept.
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });
    await expect(pageCards(page)).toHaveCount(1);
  });
});
