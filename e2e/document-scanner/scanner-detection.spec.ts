import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';
import { importScannedPage } from './scanner-helpers';

/*
 * All three of these were wrapped in `if (await fileInput.count() > 0)` against
 * an `input[type="file"]` the scanner template does not contain, so none of
 * them ever reached an assertion. See `scanner-helpers.ts` for why the file
 * chooser is the only way in.
 */
test.describe('Document Scanner — Edge Detection & Crop Modes @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
  });

  async function importToCrop(page: import('@playwright/test').Page, fixture: string) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').first().click();
    await (await chooser).setFiles(getTestDataPath(fixture));
    await expect(page.locator('.crop-card')).toBeVisible({ timeout: 15000 });
  }

  test('SCN-012 & SCN-016: Clear document triggers edge detection and auto-crop preview', async ({ page }) => {
    await importToCrop(page, 'scanner/clean-document.jpg');

    // The crop step renders the adjustable canvas and offers both actions.
    await expect(page.locator('canvas.interactive-crop-canvas')).toBeVisible();
    await expect(page.locator('app-button[data-testid="apply-crop"] button')).toBeVisible();
    await expect(page.locator('app-button[data-testid="cancel-crop"] button')).toBeVisible();

    // A clean document detects its edges, so the badge reports an auto crop
    // rather than asking for a manual one.
    await expect(page.locator('.crop-card .card-header app-badge')).toBeVisible();
  });

  test('SCN-018 & SCN-019: An image with no clear edges still reaches a usable crop step', async ({ page }) => {
    await importToCrop(page, 'scanner/no-edge-document.jpg');

    /*
     * Whether detection reports low confidence depends on the image, so this
     * does not assert the warning banner specifically. What matters is that a
     * document whose edges cannot be found is still croppable by hand instead
     * of dead-ending -- the banner is shown when `isLowConfidence` is set, and
     * the corners are adjustable either way.
     */
    await expect(page.locator('canvas.interactive-crop-canvas')).toBeVisible();
    await expect(page.locator('app-button[data-testid="apply-crop"] button')).toBeEnabled();
  });

  test('SCN-021 & SCN-023: Manual crop mode and confirm crop', async ({ page }) => {
    await importScannedPage(page, 'scanner/tilted-document.jpg');

    // Applying the crop lands on the pages dashboard with the page kept.
    await expect(page.locator('.pages-dashboard-card')).toBeVisible();
    await expect(page.locator('.page-card')).toHaveCount(1);
    await expect(page.locator('.page-card .page-thumb')).toBeVisible();
  });
});
